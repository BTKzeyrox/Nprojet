// Contrôle des ÉCRANS du mode hors ligne (module 13, M13.6), sans réseau réel ni vrai navigateur :
//  1. règles d'affichage (quel bandeau, quel texte) ; 2. code de verrouillage et « non envoyé » sur le VRAI magasin (faux serveur, stockage en mémoire) ;
//  3. écrans rendus en français et en anglais ; 4. mode démo : coupure simulée.
// Lancer : npm run check:offline-ui
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage;
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });

const { AppStore, db } = await import('../src/db/store');
const { memoryKV } = await import('../src/utils/offlineVault');
const T = await import('../src/utils/offlineText');
const { AppProvider } = await import('../src/context/AppContext');
const { OfflineCard } = await import('../src/components/OfflineCard');
const { OfflineCenterView } = await import('../src/components/OfflineCenter');
const { OfflineUnlockView } = await import('../src/components/OfflineUnlockView');
const { PendingMark, OnlineOnlyNote } = await import('../src/components/PendingMark');
const { PinForm } = await import('../src/components/OfflinePin');

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const bad = (html: string) => /NaN|Infinity|undefined|\[object/.test(html);

// ====================== 1. règles d'affichage ======================
const base: import('../src/utils/offlineText').BannerInput = { down: false, unsent: 0, review: 0, kept: false, needsCode: false, locked: false, canOffline: true, pendingSecs: 0, justDone: false };
for (const lang of ['fr', 'en'] as const) {
  const m = (o: Partial<typeof base>) => T.bannerModel({ ...base, ...o }, lang);
  ok(m({}).kind === null, `${lang} : tout va bien, aucun bandeau`);
  ok(m({ down: true }).kind === 'offline' && !/\d/.test(m({ down: true }).text), `${lang} : hors ligne sans rien en attente : pas de nombre`);
  ok(m({ down: true, unsent: 3, kept: true }).text.includes('3') && m({ down: true, unsent: 1, kept: true }).text.includes('1'), `${lang} : hors ligne, le nombre d'actions est écrit`);
  ok(T.pendingWord(1, lang) !== T.pendingWord(2, lang) && !/actions waiting|actions en attente/.test(T.pendingWord(1, lang)), `${lang} : singulier et pluriel`);
  const keptHint = m({ down: true, unsent: 2, kept: true }).hint!, noCode = m({ down: true, unsent: 2, needsCode: true }).hint!, locked = m({ down: true, unsent: 2, locked: true }).hint!, mem2 = m({ down: true, unsent: 2 }).hint!;
  ok(new Set([keptHint, noCode, locked, mem2]).size === 4, `${lang} : 4 messages différents (gardé / pas de code / verrouillé / seulement en mémoire)`);
  ok(/Réglages|Settings/.test(noCode), `${lang} : admin sans code : on lui dit où créer son code`);
  ok(m({ down: true, canOffline: false }).hint!.length > 10 && m({ down: true, canOffline: false, unsent: 0 }).hint !== m({ down: true, unsent: 0 }).hint, `${lang} : un rôle qui ne travaille pas hors ligne le lit clairement`);
  ok(m({ justDone: true }).kind === 'done', `${lang} : « Tout est envoyé »`);
  ok(m({ unsent: 2, pendingSecs: 1 }).kind === null, `${lang} : un envoi rapide ne fait pas clignoter un bandeau`);
  ok(m({ unsent: 2, pendingSecs: 5 }).kind === 'sending', `${lang} : un envoi qui dure est montré`);
  ok(m({ review: 2 }).kind === 'review' && /2/.test(m({ review: 2 }).text), `${lang} : éléments à revoir`);
  ok(m({ locked: true }).kind === 'locked', `${lang} : copie verrouillée`);
  ok(m({ down: true, review: 3, locked: true, justDone: true }).kind === 'offline', `${lang} : hors ligne passe avant tout`);
  ok(m({ justDone: true, review: 3 }).kind === 'done' && m({ unsent: 4, pendingSecs: 9, review: 3 }).kind === 'sending', `${lang} : ordre : tout est envoyé, envoi, à revoir`);
}
ok(T.bannerModel({ ...base, down: true, unsent: 2, kept: true }, 'fr').text !== T.bannerModel({ ...base, down: true, unsent: 2, kept: true }, 'en').text, 'le français et l\'anglais sont différents');
ok(['posts', 'messages', 'stock', 'clients', 'news', 'products', 'sheets', 'contracts', 'groups'].every(c => T.collectionLabel(c, 'fr') !== c && T.collectionLabel(c, 'en') !== c), 'noms lisibles pour chaque collection gardée hors ligne');
ok(T.collectionLabel('inconnue', 'fr') === 'inconnue', 'collection inconnue : le nom brut (jamais « undefined »)');
ok(T.actionLabel('upsert', true, 'fr') === 'Créé' && T.actionLabel('upsert', false, 'en') === 'Changed' && T.actionLabel('delete', false, 'fr') === 'Supprimé', 'créé / modifié / supprimé');
ok(Object.entries(T.ONLINE_ONLY_WHY).every(([, v]) => v.fr.length > 30 && v.en.length > 30), 'chaque action « en ligne seulement » a une raison écrite en 2 langues');
const lines = (o: any) => T.copyLine({ enabled: false, locked: false, needs_code: false, can_offline: true, problem: null, encrypted: false, ...o }, 'fr');
ok(new Set([lines({}), lines({ enabled: true }), lines({ enabled: true, encrypted: true }), lines({ locked: true }), lines({ needs_code: true }), lines({ can_offline: false }), lines({ problem: 'storage' }), lines({ problem: 'other_tab' }), lines({ problem: 'corrupt' }), lines({ problem: 'newer_version' }), lines({ problem: 'wrong_user' })]).size === 11, 'la ligne d\'état de la copie dit 11 choses différentes');

// ====================== 2. le VRAI magasin : code de verrouillage et « pas encore envoyé » ======================
type Rec = { id: string; [k: string]: any };
const server = {
  online: true, token: 'TOK-1',
  users: [{ id: 'u1', name: 'Rina', username: 'rina', role: 'employee', status: 'active', shift: 'day' }, { id: 'ad', name: 'Chef', username: 'chef', role: 'admin', status: 'active' }] as Rec[],
  cols: { posts: new Map<string, Rec>(), messages: new Map<string, Rec>(), contracts: new Map<string, Rec>() } as Record<string, Map<string, Rec>>,
  reset() { this.online = true; for (const m of Object.values(this.cols)) m.clear(); this.cols.contracts.set('c1', { id: 'c1', client_name: 'Client test' }); // une mission existe déjà : l'admin n'en remplit pas 20 au premier démarrage
    this.cols.messages.set('m0', { id: 'm0', sender_id: 'u1', recipient_id: 'ad', message: 'ancien', timestamp: '2026-10-01 08:00', read_by: [] }); },
};
let me = 'u1';
g.fetch = async (url: string, init?: any) => {
  if (!server.online) throw new TypeError('network down');
  const path = String(url).split('/df-api/')[1] || '', route = path.split('?')[0];
  const body = init?.body ? JSON.parse(init.body) : {};
  const json = (status: number, data: any) => ({ ok: status < 400, status, json: async () => data });
  if (route === 'login') { me = body.username === 'chef' ? 'ad' : 'u1'; return json(200, { token: server.token, user: server.users.find(u => u.id === me) }); }
  if (route === 'logout') return json(200, { ok: true });
  if (route === 'state') {
    const collections: any = { users: { ids: server.users.map(u => u.id), changed: server.users } };
    for (const [c, m] of Object.entries(server.cols)) collections[c] = { ids: [...m.keys()], changed: [...m.values()] };
    return json(200, { collections, serverTime: new Date().toISOString(), me: server.users.find(u => u.id === me) });
  }
  if (route === 'sync') { for (const [c, ch] of Object.entries<any>(body.changes)) { const m = (server.cols[c] ||= new Map()); for (const r of ch.upserts) m.set(r.id, r); for (const id of ch.deletes) m.delete(id); } return json(200, { ok: true, rejected: [] }); }
  return json(404, { error: 'inconnu' });
};
const KV = memoryKV();
const owner = { cur: null as string | null };
let seq = 0;
const mkLock = () => { const id = 'o' + ++seq; return { acquire: async () => { if (owner.cur && owner.cur !== id) return false; owner.cur = id; return true; }, release: () => { if (owner.cur === id) owner.cur = null; } }; };
const live: InstanceType<typeof AppStore>[] = [];
const killAll = () => { for (const x of live.splice(0)) x.__dispose(); owner.cur = null; };
const open = async () => { const s = new AppStore({ offlineKV: KV, offlineDelayMs: 0, offlineLock: mkLock() }); live.push(s); await s.whenReady(); return s; };
const login = async (s: InstanceType<typeof AppStore>, who: string) => { await s.login(who, 'x'); await tick(80); return s; };
const say = (s: InstanceType<typeof AppStore>, id: string, who: string, text: string) => s.sendMessage({ senderId: who, message: text });
const PIN = '482915', PIN2 = '739104';

// --- admin : pas de code au départ ---
server.reset(); KV.raw.clear(); for (const k of Object.keys(mem)) delete mem[k];
let ad = await login(await open(), 'chef');
{
  const st = ad.getOfflineStatus();
  ok(st.role === 'admin' && st.can_offline && st.needs_code && !st.enabled && !st.locked && !st.has_vault, 'admin sans code : « à activer » (rien n\'est gardé)');
  ok(ad.getUnsent().count === 0 && !ad.isUnsent('messages', 'x'), 'rien de modifié : rien en attente');
  server.online = false;
  say(ad, 'x', 'ad', 'Note admin sans réseau');
  await tick(900);
  const un = ad.getUnsent(true);
  ok(un.count === 1 && un.items[0].col === 'messages' && un.items[0].created && un.items[0].text === 'Note admin sans réseau', 'admin hors ligne : 1 action en attente, avec son texte');
  ok(un.items[0].kept === false, 'sans code : elle est seulement en mémoire (dit « pas gardée sur l\'appareil »)');
  ok(ad.isUnsent('messages', un.items[0].id) && !ad.isUnsent('messages', 'm0'), 'la marque « en attente » ne touche que l\'élément concerné');
  ok(KV.raw.size === 0, 'toujours rien d\'écrit sur l\'appareil');

  const weak = await ad.offlineSetPin('1111');
  ok(!weak.ok && weak.code === 'weak_pin' && KV.raw.size === 0, 'code trop simple (1111) refusé, rien n\'est créé');
  const short = await ad.offlineSetPin('12');
  ok(!short.ok && short.code === 'weak_pin', 'code trop court refusé');
  const good = await ad.offlineSetPin(PIN);
  ok(good.ok, 'le code est accepté');
  const st2 = ad.getOfflineStatus();
  ok(st2.enabled && st2.encrypted && !st2.needs_code && !st2.locked && st2.has_vault, 'admin avec code : copie ouverte et chiffrée');
  await tick(100);
  const q: any = KV.raw.get('queue:ad'), c: any = KV.raw.get('copy:ad');
  ok(!!q && !q.plain && !!q.ct && !!c && !c.plain, 'ce qui est écrit sur le disque est chiffré (rien de lisible)');
  ok(!JSON.stringify([...KV.raw.values()]).includes('Note admin sans réseau'), 'le texte de la note n\'apparaît nulle part en clair sur l\'appareil');
  ok(ad.getUnsent(true).items[0].kept === true, 'après le code : l\'action est gardée sur l\'appareil');
}

// --- redémarrage sans réseau : écran de code ---
killAll();
ad = await open();
{
  const st = ad.getOfflineStatus();
  ok(ad.getCurrentUser() === null, 'redémarrage sans réseau : pas ouvert tant que le code n\'est pas entré');
  ok(st.locked && st.has_vault && st.can_offline !== undefined, 'l\'écran de code est demandé (copie verrouillée)');
  const w1 = await ad.offlineUnlock('000000');
  ok(!w1.ok && w1.code === 'wrong_pin', 'mauvais code refusé');
  ok(ad.getCurrentUser() === null, 'mauvais code : toujours fermé');
  await ad.offlineUnlock('111222'); const w3 = await ad.offlineUnlock('222333');
  ok(!w3.ok && (w3.wait_seconds ?? 0) > 0 && ad.getOfflineStatus().wait_seconds > 0, '3 erreurs : une attente est imposée');
  const during = await ad.offlineUnlock(PIN);
  ok(!during.ok && during.code === 'wait', 'pendant l\'attente, même le bon code est refusé');
  ok(KV.raw.has('queue:ad') && KV.raw.has('copy:ad') && KV.raw.has('meta:ad'), 'des erreurs de code n\'effacent JAMAIS rien');
}
// --- un autre redémarrage (l'attente est gardée sur l'appareil) : « code oublié » efface la copie ---
killAll();
ad = await open();
{
  ok(ad.getOfflineStatus().locked, 'l\'attente survit à un redémarrage (on ne peut pas la contourner en rechargeant)');
  const again = await ad.offlineUnlock(PIN);
  ok(!again.ok && again.code === 'wait', 'rechargé : toujours en attente');
  await ad.offlineEraseLocal();
  ok(!KV.raw.has('queue:ad') && !KV.raw.has('copy:ad') && !KV.raw.has('meta:ad') && KV.raw.size === 0, '« code oublié » : tout ce qui concerne cet appareil est effacé');
  ok(!ad.getOfflineStatus().locked && ad.getCurrentUser() === null && !mem['df_token'] , 'retour à l\'écran de connexion');
  ok(!mem['df_offline_who'], 'l\'appareil ne se souvient plus de la personne');
}

// --- le bon code du premier coup : tout revient ---
server.reset(); KV.raw.clear(); killAll();
ad = await login(await open(), 'chef');
server.online = false; say(ad, 'x', 'ad', 'Note à garder'); await tick(300);
ok((await ad.offlineSetPin(PIN)).ok, 'code créé (2e essai)');
await tick(100); killAll();
ad = await open();
{
  ok(ad.getOfflineStatus().locked && ad.getCurrentUser() === null, 'redémarrage : verrouillé');
  const r = await ad.offlineUnlock(PIN);
  ok(r.ok, 'le bon code ouvre');
  const u = ad.getCurrentUser();
  ok(!!u && u.id === 'ad' && u.role === 'admin', 'l\'admin est de retour (sans réseau)');
  ok(JSON.stringify((ad as any).messages).includes('Note à garder') && JSON.stringify((ad as any).messages).includes('ancien'), 'ses données ET son action en attente sont là');
  ok(ad.getUnsent(true).count === 1, 'l\'action reste en attente');
  ok(!ad.getOfflineStatus().locked, 'plus verrouillé');
}
// --- changer le code sans rien perdre ---
{
  const bad1 = await ad.offlineSetPin('abc');
  ok(!bad1.ok, 'changer pour un code invalide : refusé');
  const ch = await ad.offlineSetPin(PIN2);
  ok(ch.ok, 'changer le code');
  await tick(100);
  killAll(); ad = await open();
  const old = await ad.offlineUnlock(PIN);
  ok(!old.ok && old.code === 'wrong_pin', 'l\'ancien code ne marche plus');
  killAll(); KV.raw.delete('fail:ad'); ad = await open(); // l'attente après erreur est effacée à la main pour la suite de l'essai
  const nw = await ad.offlineUnlock(PIN2);
  ok(nw.ok && JSON.stringify((ad as any).messages).includes('Note à garder'), 'le nouveau code ouvre, et l\'action en attente n\'a pas été perdue');
}
// --- admin ne peut pas retirer son code ---
{
  const r = await ad.offlineRemovePin();
  ok(!r.ok && r.code === 'no_pin' && ad.getOfflineStatus().encrypted, 'admin : le code ne peut pas être retiré');
}
// --- retour du réseau : « Tout est envoyé » ---
server.online = true; ad.retryNow(); await tick(900);
ok(server.cols.messages.size === 2 && ad.getUnsent(true).count === 0, 'réseau revenu : l\'action part, plus rien en attente');

// --- opérateur : copie automatique, code facultatif ---
killAll(); server.reset(); KV.raw.clear();
let op = await login(await open(), 'rina');
{
  const st = op.getOfflineStatus();
  ok(st.role === 'employee' && st.enabled && !st.encrypted && !st.needs_code && st.can_offline, 'opérateur : activé tout seul, sans code');
  ok((await op.offlineSetPin('abc')).ok === false, 'opérateur : code invalide refusé');
  ok((await op.offlineSetPin(PIN)).ok && op.getOfflineStatus().encrypted, 'opérateur : peut ajouter un code');
  await tick(60);
  ok(!!(KV.raw.get('copy:u1') as any).ct, 'sa copie est alors chiffrée');
  ok((await op.offlineRemovePin()).ok && !op.getOfflineStatus().encrypted, 'opérateur : peut retirer son code');
  await tick(60);
  ok(!!(KV.raw.get('copy:u1') as any).plain, 'sa copie n\'est plus chiffrée');
}
// --- annuler une modification pas encore envoyée ---
{
  server.online = false;
  say(op, 'x', 'u1', 'À annuler'); await tick(300);
  const un = op.getUnsent(true);
  ok(un.count === 1, 'une action en attente');
  const id = un.items[0].id;
  ok(op.offlineCancelUnsent('messages', id) && op.getUnsent(true).count === 0 && !JSON.stringify((op as any).messages).includes('À annuler'), 'annuler un élément créé hors ligne : il disparaît');
  (op as any).messages[0].message = 'modifié ici'; (op as any).notify(); await tick(100);
  ok(op.getUnsent(true).count === 1 && !op.getUnsent().items[0].created, 'modifier un élément du serveur : « modifié »');
  ok(op.offlineCancelUnsent('messages', 'm0') && (op as any).messages.find((m: any) => m.id === 'm0').message === 'ancien' && op.getUnsent(true).count === 0, 'annuler : l\'élément revient à la version du serveur');
  ok(!op.offlineCancelUnsent('inconnue', 'x') && !op.offlineCancelUnsent('messages', 'absent'), 'annuler quelque chose d\'inconnu : refusé sans erreur');
}
killAll();

// ====================== 3. écrans rendus (français et anglais) ======================
const real = { st: db.getOfflineStatus.bind(db), un: db.getUnsent.bind(db) };
const stBase = { enabled: false, locked: false, problem: null, pending: 0, photos: 0, review: [], skipped: [], copy_saved_at: null, oldest_pending: null, role: 'admin', can_offline: true, has_vault: false, encrypted: false, needs_code: false, wait_seconds: 0 };
const setStatus = (o: any, items: any[] = []) => { (db as any).getOfflineStatus = () => ({ ...stBase, ...o }); (db as any).getUnsent = () => ({ count: items.length, items }); };
const reviewOp = { id: 'messages|m9|refused|0', kind: 'record', collection: 'messages', record_id: 'm9', action: 'upsert', payload: {}, created_at: '2026-10-26T09:00:00.000Z', tries: 0, state: 'review', review_code: 'conflict', bytes: 10, text: 'Mon message important' };
const item = { key: 'messages|m1', col: 'messages', id: 'm1', action: 'upsert', created: true, text: 'Bonjour équipe', kept: true };
const render = (lang: string, el: React.ReactElement) => { mem['delta_lang'] = lang; return renderToString(<AppProvider>{el}</AppProvider>); };
for (const lang of ['fr', 'en']) {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr);
  setStatus({ needs_code: true });
  let h = render(lang, <OfflineCard />);
  ok(!bad(h) && h.includes(L('Travail hors ligne', 'Offline work')) && h.includes('pin-form') && h.includes(L('Activer avec ce code', 'Turn on with this code')), `${lang} : carte admin sans code : formulaire pour créer le code`);
  ok(h.includes(L('Jamais gardés', 'Never kept')) && h.includes(L('oublies', 'forget it')), `${lang} : la carte dit ce qui n'est jamais gardé et ce qui arrive si le code est oublié`);
  setStatus({ enabled: true, has_vault: true, encrypted: true, copy_saved_at: '2026-10-26T09:00:00.000Z' }, [item]);
  h = render(lang, <OfflineCard />);
  ok(!bad(h) && h.includes(L('Changer le code', 'Change the code')) && h.includes('(1)') && h.includes('offline-erase') && !h.includes(L('Retirer le code', 'Remove the code')), `${lang} : carte admin avec code : changer, actions en attente, effacer ; pas de « retirer » pour l'admin`);
  setStatus({ enabled: true, has_vault: true, encrypted: true, role: 'employee' });
  h = render(lang, <OfflineCard />);
  ok(h.includes(L('Retirer le code', 'Remove the code')) && h.includes(L('Jamais l', 'Never money')), `${lang} : carte opérateur avec code : « retirer le code » possible`);
  setStatus({ enabled: true, has_vault: true, role: 'employee' });
  h = render(lang, <OfflineCard />);
  ok(h.includes(L('Ajouter un code', 'Add a code')), `${lang} : carte opérateur sans code : « ajouter un code »`);
  setStatus({ locked: true, has_vault: true, encrypted: true });
  h = render(lang, <OfflineCard />);
  ok(h.includes('pin-form') && h.includes(L('Code oublié', 'Forgot the code')), `${lang} : carte verrouillée : saisie du code et « code oublié »`);
  setStatus({ role: 'accountant', can_offline: false });
  h = render(lang, <OfflineCard />);
  ok(h.includes(L('en ligne seulement', 'online only')) && !h.includes('pin-form'), `${lang} : un rôle sans mode hors ligne le lit, sans formulaire`);
  setStatus({ problem: 'storage_error', enabled: false, has_vault: false });
  h = render(lang, <OfflineCard />);
  ok(h.includes(L('plein', 'full')), `${lang} : appareil plein : message clair`);
  setStatus({ problem: 'corrupt', has_vault: true });
  h = render(lang, <OfflineCard />);
  ok(h.includes('offline-erase'), `${lang} : copie abîmée : on peut l'effacer`);

  setStatus({ enabled: true, review: [reviewOp] }, [item, { ...item, key: 'posts|p1', col: 'posts', id: 'p1', created: false, kept: false, text: undefined }]);
  const view = (tab: 'pending' | 'review', down: boolean) => render(lang, <OfflineCenterView tab={tab} onTab={() => {}} onClose={() => {}} down={down} refresh={() => {}} />);
  h = view('pending', true);
  ok(!bad(h) && (h.match(/unsent-item/g) || []).length === 2 && h.includes('Bonjour équipe') && h.includes(L('Mission', 'Mission')) && h.includes(L('Annuler la modification', 'Cancel the change')), `${lang} : liste « En attente » : 2 éléments, texte, annuler`);
  ok(h.includes(L('Seulement en mémoire', 'In memory only')), `${lang} : ce qui n'est pas sur le disque est signalé`);
  ok(h.includes(L('Pas de réseau', 'No network')), `${lang} : la fenêtre dit qu'il n'y a pas de réseau`);
  h = view('review', false);
  ok(!bad(h) && h.includes('review-item') && h.includes('Mon message important') && h.includes(L('modifié cet élément', 'Someone changed')) && h.includes(L('Copier', 'Copy')) && h.includes(L('Renvoyer', 'Send again')) && h.includes(L('Supprimer', 'Delete')), `${lang} : « À revoir » : raison, texte, copier, renvoyer, supprimer`);
  setStatus({ enabled: true, locked: true, has_vault: true, encrypted: true });
  h = view('pending', true);
  ok(h.includes('pin-form') && h.includes(L('Copie verrouillée', 'Copy locked')) && h.includes(L('Rien n', 'Nothing is waiting')), `${lang} : copie verrouillée : saisie du code dans la fenêtre ; rien en attente`);

  setStatus({ locked: true, has_vault: true, encrypted: true });
  h = render(lang, <OfflineUnlockView />);
  ok(!bad(h) && h.includes('offline-unlock') && h.includes('pin-form') && h.includes(L('Code oublié', 'Forgot the code')) && h.includes(L('Réessayer la connexion', 'Try the connection again')), `${lang} : écran de code : saisie, réessayer la connexion, code oublié`);
  ok(h.includes('inputMode="numeric"') || h.includes('inputmode="numeric"'), `${lang} : clavier numérique sur téléphone`);
  ok(h.includes('type="password"'), `${lang} : le code ne s'affiche pas à l'écran`);
  h = render(lang, <PinForm mode="create" />);
  ok(h.split('type="password"').length - 1 === 2, `${lang} : créer un code : deux champs (code et confirmation)`);
  h = render(lang, <PinForm mode="unlock" />);
  ok(h.split('type="password"').length - 1 === 1, `${lang} : ouvrir : un seul champ`);
  setStatus({ locked: true, has_vault: true, wait_seconds: 30 });
  h = render(lang, <PinForm mode="unlock" />);
  ok(h.includes('30') && h.includes('disabled'), `${lang} : pendant l'attente, le champ est bloqué et le temps restant est écrit`);

  setStatus({ enabled: true }, [item]);
  h = render(lang, <PendingMark col="messages" id="m1" />);
  ok(h.includes('pending-mark') && h.includes(L('En attente', 'Waiting')), `${lang} : la marque « en attente » s'affiche sur l'élément concerné`);
  h = render(lang, <PendingMark col="messages" id="autre" />);
  ok(h === '', `${lang} : et pas sur les autres`);
  h = render(lang, <OnlineOnlyNote kind="payment" />);
  ok(h === '', `${lang} : en ligne : aucune note « en ligne seulement »`);
}
(db as any).getOfflineStatus = real.st; (db as any).getUnsent = real.un;

// ====================== 4. mode démo : coupure simulée ======================
delete mem['df_token']; for (const k of Object.keys(mem)) if (/token/i.test(k)) delete mem[k];
let fetches = 0; const f0 = g.fetch; g.fetch = async (...a: any[]) => { fetches++; return f0(...a); };
const demo = new AppStore({ offlineKV: memoryKV(), offlineLock: mkLock() }); live.push(demo);
const dUser = demo.enterDemo('admin');
{
  ok(!demo.isDemoCut() && demo.getUnsent().count === 0, 'démo : au départ, pas de coupure, rien en attente');
  demo.setDemoCut(true);
  ok(demo.isDemoCut(), 'démo : coupure simulée');
  let down: boolean = false; demo.onConnection(d => { down = d; });
  ok((down as boolean) === true, 'démo : le bandeau « hors ligne » s\'allume');
  demo.sendMessage({ senderId: dUser.id, message: 'Essai pendant la coupure' });
  await tick(50);
  const un = demo.getUnsent(true);
  ok(un.count >= 1 && un.items.some(i => i.col === 'messages' && i.text === 'Essai pendant la coupure'), 'démo : la modification faite pendant la coupure est comptée');
  const mid = un.items.find(i => i.text === 'Essai pendant la coupure')!;
  ok(demo.isUnsent('messages', mid.id), 'démo : la marque « en attente » apparaît');
  const r = await (demo as any).api('upload', { method: 'POST', body: '{}' });
  ok(!r.ok && r.status === 0, 'démo : un appel direct échoue comme sans réseau');
  ok(fetches === 0, 'démo : aucun vrai appel réseau pendant tout l\'essai');
  demo.setDemoCut(false);
  ok(!demo.isDemoCut() && (down as boolean) === false && demo.getUnsent().count === 0, 'démo : réseau rétabli, rien n\'est resté en attente');
  demo.setDemoCut(true); demo.setDemoCut(true); demo.setDemoCut(false);
  ok(!demo.isDemoCut(), 'démo : couper deux fois de suite ne casse rien');
  const real2 = new AppStore({ offlineKV: memoryKV(), offlineLock: mkLock() }); live.push(real2);
  real2.setDemoCut(true);
  ok(!real2.isDemoCut(), 'hors démo : la coupure simulée ne peut pas être activée');
}
killAll();
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
