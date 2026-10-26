// Contrôle du mode hors ligne branché sur le VRAI magasin de données (module 13, M13.5), sans réseau réel.
// Un faux serveur (que l'on coupe), un stockage en mémoire, et des « redémarrages » (nouvelle instance du magasin, même stockage).
// Lancer : npm run check:offline-store
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };

const { AppStore } = await import('../src/db/store');
const { memoryKV } = await import('../src/utils/offlineVault');

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

// ---------- faux serveur ----------
type Rec = { id: string; [k: string]: any };
const server = {
  online: true, token: 'TOK-1', fetches: 0, syncs: [] as any[], rejectIds: new Set<string>(), status: 200, logoutCalls: 0,
  users: [{ id: 'u1', name: 'Rina', username: 'rina', role: 'employee', status: 'active', shift: 'day' }, { id: 'u2', name: 'Tojo', username: 'tojo', role: 'employee', status: 'active', shift: 'day' }, { id: 'ad', name: 'Chef', username: 'chef', role: 'admin', status: 'active' }] as Rec[],
  cols: { posts: new Map<string, Rec>(), messages: new Map<string, Rec>(), cash: new Map<string, Rec>(), news: new Map<string, Rec>() } as Record<string, Map<string, Rec>>,
  reset() { this.online = true; this.status = 200; this.syncs = []; this.rejectIds.clear(); this.fetches = 0; this.logoutCalls = 0; for (const m of Object.values(this.cols)) m.clear(); this.cols.posts.set('p1', { id: 'p1', status: 'completed', note: 'v1', employee_id: 'u1' }); this.cols.messages.set('m0', { id: 'm0', message: 'ancien', sender_id: 'u2' }); },
};
let me = 'u1';
g.fetch = async (url: string, init?: any) => {
  server.fetches++;
  if (!server.online) throw new TypeError('network down');
  const path = String(url).split('/df-api/')[1] || '';
  const route = path.split('?')[0];
  const body = init?.body ? JSON.parse(init.body) : {};
  const json = (status: number, data: any) => ({ ok: status < 400, status, json: async () => data });
  if (server.status >= 500 && route === 'state') return json(server.status, { error: 'boom' });
  if (route === 'login') { me = body.username === 'chef' ? 'ad' : 'u1'; return json(200, { token: server.token, user: server.users.find(u => u.id === me) }); }
  if (route === 'logout') { server.logoutCalls++; return json(200, { ok: true }); }
  if (route === 'state') {
    if (init?.headers?.Authorization !== `Bearer ${server.token}`) return json(401, { error: 'expired' });
    const collections: any = { users: { ids: server.users.map(u => u.id), changed: server.users } };
    for (const [c, m] of Object.entries(server.cols)) collections[c] = { ids: [...m.keys()], changed: [...m.values()] };
    return json(200, { collections, serverTime: new Date().toISOString(), me: server.users.find(u => u.id === me) });
  }
  if (route === 'sync') {
    server.syncs.push(body.changes);
    const rejected: any[] = [];
    for (const [c, ch] of Object.entries<any>(body.changes)) {
      const m = (server.cols[c] ||= new Map());
      for (const r of ch.upserts) { if (server.rejectIds.has(r.id)) rejected.push({ col: c, id: r.id, reason: 'Mission déjà validée par le responsable' }); else m.set(r.id, r); }
      for (const id of ch.deletes) m.delete(id);
    }
    return json(200, { ok: true, rejected });
  }
  return json(404, { error: 'inconnu' });
};

const KV = memoryKV();
// Chaque magasin = un « onglet ». Un faux verrou imite « un seul onglet écrit la copie locale ». `killAll` imite la fermeture brutale des onglets (rien n'est écrit).
const owner = { cur: null as string | null };
let lockSeq = 0;
const mkLock = () => { const me = 'onglet' + ++lockSeq; return { acquire: async () => { if (owner.cur && owner.cur !== me) return false; owner.cur = me; return true; }, release: () => { if (owner.cur === me) owner.cur = null; } }; };
const live: InstanceType<typeof AppStore>[] = [];
const killAll = () => { for (const x of live.splice(0)) x.__dispose(); owner.cur = null; };
const open = async (offlineDelayMs = 0) => { const s = new AppStore({ offlineKV: KV, offlineDelayMs, offlineLock: mkLock() }); live.push(s); await s.whenReady(); return s; };
const login = async (s: InstanceType<typeof AppStore>, who = 'rina') => { await s.login(who, 'x'); await tick(); return s; };
const msgs = (s: any) => s.getMessages ? s.getMessages() : (s as any).messages;
const send = (s: InstanceType<typeof AppStore>, text: string) => s.sendMessage({ senderId: 'u1', message: text });
const kvKeys = () => [...KV.raw.keys()].sort();

// ---------- 1. connexion d'un opérateur : la copie locale se crée toute seule ----------
server.reset();
let a = await login(await open());
{
  const st = a.getOfflineStatus();
  ok(st.enabled && !st.locked && st.pending === 0 && !st.problem, 'opérateur : la copie locale est créée sans rien demander');
  await tick(80);
  ok(kvKeys().join() === 'copy:u1,meta:u1,queue:u1', 'sur l\'appareil : copie, fiche et file de cet opérateur');
  const copy: any = KV.raw.get('copy:u1');
  ok(copy.plain && copy.plain.posts.length === 1 && copy.plain.users.length === 3 && !('cash' in copy.plain), 'la copie contient les missions et les comptes, jamais l\'argent');
  ok(mem['df_offline_who'] === JSON.stringify({ id: 'u1', role: 'employee' }), 'l\'appareil se souvient de qui était connecté (pour rouvrir sans réseau)');
}
// ---------- 2. coupure : une action est faite, elle est gardée ----------
server.online = false;
send(a, 'Message écrit sans réseau');
await tick(80);
{
  const st = a.getOfflineStatus();
  ok(st.pending >= 1, 'hors ligne : l\'action est en attente');
  const q: any = KV.raw.get('queue:u1');
  ok(JSON.stringify(q.plain).includes('Message écrit sans réseau'), 'l\'action est écrite sur l\'appareil (elle survivra à un rechargement)');
}
// ---------- 3. REDÉMARRAGE sans réseau : l'appli s'ouvre avec la copie ----------
killAll();
a = await open();
{
  const u = a.getCurrentUser();
  ok(!!u && u.id === 'u1' && u.name === 'Rina', 'redémarrage SANS réseau : l\'opérateur est toujours connecté (pas d\'écran de connexion)');
  ok(a.getOfflineStatus().pending >= 1 && JSON.stringify(msgs(a)).includes('Message écrit sans réseau'), 'le message écrit hors ligne est de nouveau là, remis sur les données');
  ok(JSON.stringify(msgs(a)).includes('ancien'), 'les données de la dernière synchro sont là aussi');
}
// ---------- 4. retour du réseau : tout part, une seule fois ----------
server.online = true;
server.syncs = [];
a.retryNow();
await tick(900);
{
  ok(server.cols.messages.size === 2 && [...server.cols.messages.values()].some(m => m.message === 'Message écrit sans réseau'), 'réseau revenu : le message est arrivé sur le serveur');
  const sentTimes = server.syncs.filter(s => s.messages?.upserts?.some((r: any) => r.message === 'Message écrit sans réseau')).length;
  ok(sentTimes === 1, `le message n'est envoyé qu'une seule fois (${sentTimes})`);
  await tick(80);
  ok(a.getOfflineStatus().pending === 0, 'plus rien en attente');
  const q: any = KV.raw.get('queue:u1');
  ok(Array.isArray(q.plain) && q.plain.length === 0, 'la file écrite sur l\'appareil est vide');
}
// ---------- 5. conflit : le serveur change l'élément pendant la coupure ----------
killAll(); server.reset();
a = await login(await open());
await tick(80);
{
  server.online = false;
  const posts: any = (a as any).posts;
  posts[0].note = 'ma version hors ligne';
  (a as any).notify();
  await tick(80);
  ok(a.getOfflineStatus().pending === 1, 'modification de la mission hors ligne : 1 action en attente');
  server.cols.posts.set('p1', { id: 'p1', status: 'completed', note: 'version du responsable', employee_id: 'u1' }); // le responsable change la mission pendant ce temps
  server.online = true;
  await a.logout(); // fige et garde l'action
  await tick(80);
  ok(kvKeys().includes('queue:u1') && !kvKeys().includes('copy:u1') && mem['df_offline_who'] === undefined, 'déconnexion avec une action en attente : la copie des données est effacée, l\'action est GARDÉE');
  killAll();
  a = await login(await open());
  await tick(80);
  const st = a.getOfflineStatus();
  ok(st.pending === 0 && st.review.length === 1 && st.review[0].review_code === 'conflict', 'reconnexion : le serveur a changé la mission, l\'action passe dans « À revoir » (conflit)');
  ok((a as any).posts[0].note === 'version du responsable' && !server.syncs.some(s => s.posts), 'le serveur gagne : sa version est affichée, rien n\'a été écrasé');
  ok(JSON.stringify(st.review[0].payload).includes('ma version hors ligne') && a.offlineCopyText(st.review[0].id, 'fr')!.includes('Quelqu\'un a modifié'), 'le travail de l\'opérateur est gardé et copiable, avec la raison');
  const id = st.review[0].id;
  ok(a.offlineRequeue(id) === true, 'l\'opérateur décide de renvoyer SA version');
  await tick(900);
  ok(server.cols.posts.get('p1')!.note === 'ma version hors ligne' && a.getOfflineStatus().review.length === 0, 'sa version remplace celle du serveur, « À revoir » est vide');
}
// ---------- 6. le serveur refuse : rien n'est perdu en silence ----------
killAll(); server.reset();
a = await login(await open());
await tick(80);
{
  server.rejectIds.add('mrej');
  (a as any).messages.push({ id: 'mrej', message: 'Texte que le serveur refuse', sender_id: 'u1', created_at: new Date().toISOString() });
  (a as any).notify();
  await tick(1000);
  const st = a.getOfflineStatus();
  ok(st.review.length === 1 && st.review[0].review_code === 'refused' && st.review[0].review_note === 'Mission déjà validée par le responsable' && st.review[0].text === 'Texte que le serveur refuse', 'le serveur refuse : le texte est gardé dans « À revoir » avec la raison du serveur (avant : perdu en silence)');
  ok(!JSON.stringify(msgs(a)).includes('mrej') && st.pending === 0, 'les données sont rechargées (l\'élément refusé n\'est plus affiché) et rien n\'est renvoyé en boucle');
  const before = server.syncs.length;
  await tick(1300);
  ok(server.syncs.length === before, 'aucun nouvel envoi du message refusé');
  ok(a.offlineDiscard(st.review[0].id) === true && a.getOfflineStatus().review.length === 0, 'supprimer de « À revoir » : seulement sur demande');
}
// ---------- 7. argent : jamais gardé sur l'appareil ----------
killAll(); server.reset();
a = await login(await open());
await tick(80);
{
  server.online = false;
  (a as any).cash.push({ id: 'cash1', kind: 'in', amount_ar: 5000000, date: '2026-10-24' });
  (a as any).notify();
  await tick(80);
  const q: any = KV.raw.get('queue:u1');
  ok(!JSON.stringify(q).includes('5000000') && a.getOfflineStatus().pending === 0 && a.getOfflineStatus().skipped.some(x => x.col === 'cash' && x.why.fr.length > 10), 'ligne d\'argent hors ligne : PAS écrite sur l\'appareil, et l\'écran peut dire pourquoi');
}
// ---------- 8. expiration de session : rien n'est perdu ----------
killAll(); server.reset();
a = await login(await open());
await tick(80);
{
  server.online = false;
  send(a, 'Écrit juste avant l\'expiration');
  server.online = true; server.token = 'AUTRE-JETON'; // le serveur n'accepte plus le jeton (401)
  await a.refreshNow();
  await tick(100);
  ok(a.getCurrentUser() === null, 'jeton expiré : retour à la connexion');
  const q: any = KV.raw.get('queue:u1');
  ok(JSON.stringify(q.plain).includes('Écrit juste avant l\'expiration'), 'jeton expiré : l\'action en attente est GARDÉE sur l\'appareil');
  const copy: any = KV.raw.get('copy:u1');
  ok(copy && copy.plain && copy.plain.posts && copy.plain.posts.length === 1, 'la bonne copie n\'est pas écrasée par une copie vide');
  server.token = 'TOK-1';
  killAll();
  a = await login(await open());
  await tick(900);
  ok([...server.cols.messages.values()].some(m => m.message === 'Écrit juste avant l\'expiration'), 'nouvelle connexion : l\'action gardée est envoyée');
}
// ---------- 9. serveur en panne au démarrage (5xx) ----------
killAll(); server.reset();
a = await login(await open());
await tick(80);
{
  server.status = 503;
  killAll();
  const b = await open();
  ok(!!b.getCurrentUser() && b.getCurrentUser()!.id === 'u1', 'serveur en panne (503) au démarrage : l\'appli s\'ouvre avec la copie');
  server.status = 200;
}
// ---------- 10. jamais sans copie : retour à la connexion ----------
killAll(); server.reset(); server.online = false;
for (const k of Object.keys(mem)) if (k.startsWith('df_offline')) delete mem[k];
KV.raw.clear();
{
  const b = await open();
  ok(b.getCurrentUser() === null, 'rien gardé sur l\'appareil + pas de réseau : retour à la connexion (pas d\'ouverture inventée)');
}
// ---------- 11. démo : rien n'est jamais écrit ----------
killAll(); server.reset();
KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
{
  const d = await open();
  d.enterDemo('employee');
  send(d, 'message de démo');
  await tick(100);
  ok(KV.raw.size === 0 && !mem['df_offline_who'], 'mode démo : RIEN n\'est écrit sur l\'appareil');
}
// ---------- 12. admin : rien tant qu'il n'y a pas de code ----------
killAll(); server.reset();
KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
{
  const adm = await login(await open(), 'chef');
  await tick(100);
  ok(adm.getCurrentUser()?.role === 'admin' && !adm.getOfflineStatus().enabled && KV.raw.size === 0, 'admin sans code de verrouillage : rien n\'est gardé sur l\'appareil');
  server.online = false;
  (adm as any).cash.push({ id: 'cash9', kind: 'in', amount_ar: 1, date: '2026-10-24' });
  (adm as any).notify();
  await tick(100);
  ok(KV.raw.size === 0, 'admin : même une modification hors ligne n\'écrit rien (copie chiffrée = M13.6)');
}
// ---------- 13. déconnexion sans rien en attente : tout est effacé ----------
killAll(); server.reset();
KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
{
  const o = await login(await open());
  await tick(100);
  ok(kvKeys().length === 3, 'avant : copie, fiche, file');
  o.logout();
  await tick(100);
  ok(KV.raw.size === 0 && !mem['df_offline_who'] && server.logoutCalls === 1, 'déconnexion sans rien en attente : TOUT est effacé de l\'appareil');
}
// ---------- 14. deux onglets ouverts : un seul écrit, personne n'efface l'autre ----------
killAll(); server.reset();
KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
{
  const A = await login(await open());
  await tick(80);
  server.online = false;
  send(A, 'Message de l\'onglet A');
  await tick(80);
  const queueA = JSON.stringify(KV.raw.get('queue:u1'));
  ok(queueA.includes('Message de l\'onglet A'), 'onglet A : son action est gardée sur l\'appareil');
  // l'onglet A reste ouvert (il tient le verrou) mais ne peut plus rien envoyer : il est « figé » (téléphone en veille, par exemple)
  (A as any).flush = async () => {}; (A as any).pull = async () => true;
  if ((A as any).syncTimer) { clearTimeout((A as any).syncTimer); (A as any).syncTimer = null; }
  server.online = true;
  const B = await open(); // deuxième onglet, même personne, même jeton
  await tick(120);
  ok(B.getCurrentUser()?.id === 'u1' && !B.getOfflineStatus().enabled && B.getOfflineStatus().problem === 'other_tab', 'onglet B : il travaille, mais la copie locale reste à l\'onglet A (il le signale)');
  (B as any).notify();
  await tick(120);
  ok(JSON.stringify(KV.raw.get('queue:u1')) === queueA, 'onglet B n\'efface ni ne réécrit la file de l\'onglet A');
  A.__dispose(); // l'onglet A est fermé (avant d'avoir pu envoyer)
  await B.refreshNow();
  await tick(1200);
  ok(B.getOfflineStatus().enabled && B.getOfflineStatus().problem === null, 'onglet A fermé : l\'onglet B prend la copie locale');
  ok([...server.cols.messages.values()].some(m => m.message === 'Message de l\'onglet A'), 'l\'action de l\'onglet A fermé est reprise par l\'onglet B et envoyée au serveur');
}
// ---------- 15. rechargement forcé pendant qu'un message n'est pas encore parti ----------
killAll(); server.reset();
KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
{
  const C = await login(await open());
  await tick(80);
  server.online = false;
  send(C, 'Message garde-fou');
  await tick(60);
  const realFlush = (C as any).flush.bind(C);
  (C as any).flush = async () => {}; // l'envoi n'a pas encore eu lieu quand le rechargement arrive
  if ((C as any).syncTimer) { clearTimeout((C as any).syncTimer); (C as any).syncTimer = null; }
  server.online = true;
  await C.refreshNow();
  ok(JSON.stringify(msgs(C)).includes('Message garde-fou'), 'rechargement forcé : le message pas encore envoyé N\'est PAS retiré de l\'écran');
  (C as any).flush = realFlush;
  await realFlush();
  await tick(150);
  ok([...server.cols.messages.values()].filter(m => m.message === 'Message garde-fou').length === 1 && !server.syncs.some(sy => sy.messages?.deletes?.length), 'il part ensuite, une seule fois, et n\'est jamais envoyé comme une suppression');
}
killAll();
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
