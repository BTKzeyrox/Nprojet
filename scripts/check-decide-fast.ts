// Contrôle : valider ou refuser une mission s'affiche TOUT DE SUITE, le serveur décide en arrière-plan, et tout revient comme avant s'il refuse ou si le réseau tombe.
// Vrai magasin de données + faux serveur (que l'on ralentit ou coupe), sans réseau réel. Lancer : npm run check:decide-fast
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };

const { AppStore } = await import('../src/db/store');
const { memoryKV } = await import('../src/utils/offlineVault');

let fails = 0;
const ok = (c: boolean, name: string) => { if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

type Rec = { id: string; [k: string]: any };
const users = [{ id: 'ad', name: 'Chef', username: 'chef', role: 'admin', status: 'active', shift: 'day' }, { id: 'u1', name: 'Rina', username: 'rina', role: 'employee', status: 'active', shift: 'day' }];
const post = (id: string, status: string): Rec => ({ id, employee_id: 'u1', employee_name: 'Rina', client_name: 'Mission ' + id, status, date: '2026-10-27', start_time: '08:00', initial_score: 0, current_score: 10, target_score: 10, shift_type: 'day', updated_at: '2026-10-27T08:00:00Z' });
const server = {
  online: true, token: 'TOK', decideDelay: 120, stateDelay: 0, decideStatus: 200, decideError: '', decides: [] as any[], syncs: [] as any[], posts: new Map<string, Rec>(),
  reset() { this.online = true; this.decideDelay = 120; this.stateDelay = 0; this.decideStatus = 200; this.decideError = ''; this.decides = []; this.syncs = []; this.posts = new Map([['p1', post('p1', 'pending_end')], ['p2', post('p2', 'pending_start')], ['p3', post('p3', 'pending_end')], ['p4', post('p4', 'completed')]]); },
};
g.fetch = async (url: string, init?: any) => {
  if (!server.online) throw new TypeError('network down');
  const path = String(url).split('/df-api/')[1] || '';
  const route = path.split('?')[0];
  const body = init?.body ? JSON.parse(init.body) : {};
  const json = (status: number, data: any) => ({ ok: status < 400, status, json: async () => data });
  if (route === 'login') return json(200, { token: server.token, user: users[0] });
  if (route === 'state') {
    if (server.stateDelay) await tick(server.stateDelay);
    return json(200, { collections: { users: { ids: users.map(u => u.id), changed: users }, posts: { ids: [...server.posts.keys()], changed: [...server.posts.values()] } }, serverTime: new Date().toISOString(), me: users[0] });
  }
  if (route === 'post-decide') {
    server.decides.push(body);
    await tick(server.decideDelay);
    if (server.decideStatus >= 400) return json(server.decideStatus, { error: server.decideError || 'refusé' });
    const p = server.posts.get(body.id)!;
    p.status = body.approve ? (p.status === 'pending_start' ? 'active' : 'completed') : 'rejected';
    if (body.approve) p.calculated_ar = 5000; else p.rejection_reason = body.reason;
    return json(200, { ok: true });
  }
  if (route === 'sync') { server.syncs.push(body.changes); return json(200, { ok: true, rejected: [] }); }
  return json(200, {});
};

const open = async () => { const s = new AppStore({ offlineKV: memoryKV(), offlineDelayMs: 0 }); await s.whenReady(); await s.login('chef', 'x'); await tick(); return s; };
const st = (s: any, id: string) => s.getPosts().find((p: any) => p.id === id)?.status;
const real = (s: any, id: string) => s.posts.find((p: any) => p.id === id)?.status;

// ---------- 1. valider : affichage immédiat, vraie liste intacte, résultat du serveur ensuite ----------
server.reset();
const s = await open();
ok(st(s, 'p1') === 'pending_end' && st(s, 'p2') === 'pending_start', 'départ : deux missions à valider');
{
  const t0 = Date.now();
  const r = s.decidePostNow('p1', true, undefined, 'Bravo');
  const instant = Date.now() - t0;
  let settledDone = false; r.settled.then(() => { settledDone = true; });
  ok(r.ok === true, 'valider : réponse immédiate « ok »');
  ok(st(s, 'p1') === 'completed', 'valider : la mission est déjà « validée » à l\'écran, sans attendre le serveur');
  ok(real(s, 'p1') === 'pending_end', 'la vraie liste du magasin n\'est PAS modifiée (le serveur reste le seul à décider)');
  ok(instant < 40 && !settledDone, `l'écran n'attend pas le serveur (${instant} ms, serveur pas encore répondu)`);
  const res = await r.settled;
  ok(res.ok === true, 'le serveur confirme');
  ok(server.decides.length === 1 && server.decides[0].id === 'p1' && server.decides[0].approve === true && server.decides[0].note === 'Bravo', 'le serveur a reçu la décision et le mot facultatif');
  await tick(150);
  ok(st(s, 'p1') === 'completed' && real(s, 'p1') === 'completed', 'après le rechargement : l\'état officiel du serveur est là');
  ok((s as any).pendingDecisions.size === 0, 'l\'affichage immédiat est parti tout seul');
  ok(s.getPosts().find((p: any) => p.id === 'p1')?.calculated_ar === 5000, 'la paie vient du serveur (5 000), pas de l\'écran');
  ok(!server.syncs.some(ch => JSON.stringify(ch).includes('"p1"')), 'la décision n\'a JAMAIS été renvoyée comme une modification locale');
}

// ---------- 2. refuser avec un motif ----------
{
  const r = s.decidePostNow('p2', false, '  Photo floue  ');
  ok(r.ok && st(s, 'p2') === 'rejected' && s.getPosts().find((p: any) => p.id === 'p2')?.rejection_reason === 'Photo floue', 'refuser : « refusée » tout de suite, motif nettoyé');
  const res = await r.settled; await tick(150);
  ok(res.ok && real(s, 'p2') === 'rejected' && server.decides.at(-1).reason.trim() === 'Photo floue', 'refus confirmé par le serveur');
}

// ---------- 3. le serveur refuse : retour à l'état d'avant, avec le message ----------
{
  server.decideStatus = 409; server.decideError = 'Mission déjà décidée par un autre responsable';
  const r = s.decidePostNow('p3', true);
  ok(r.ok && st(s, 'p3') === 'completed', 'serveur qui va refuser : l\'écran montre d\'abord « validée »');
  const res = await r.settled;
  ok(res.ok === false && res.error === 'Mission déjà décidée par un autre responsable', 'le message du serveur est rendu tel quel');
  ok(st(s, 'p3') === 'pending_end' && (s as any).pendingDecisions.size === 0, 'retour en arrière : la mission est de nouveau « à valider »');
  server.decideStatus = 200; server.decideError = '';
}

// ---------- 4. le réseau tombe ----------
{
  server.online = false;
  const r = s.decidePostNow('p3', true);
  ok(r.ok && st(s, 'p3') === 'completed', 'réseau coupé : « validée » à l\'écran d\'abord');
  const res = await r.settled;
  ok(res.ok === false && /réseau/i.test(res.error || ''), `message « réseau » : ${res.error}`);
  ok(st(s, 'p3') === 'pending_end' && (s as any).pendingDecisions.size === 0, 'réseau coupé : la mission revient « à valider »');
  server.online = true;
}

// ---------- 5. double clic, motif vide, mission déjà décidée ----------
{
  const n0 = server.decides.length;
  const a = s.decidePostNow('p3', true), b = s.decidePostNow('p3', true);
  ok(a.ok && !b.ok && /déjà en cours/.test(b.error || ''), 'double clic : le deuxième est refusé tout de suite');
  await a.settled; await tick(150);
  ok(server.decides.length === n0 + 1, 'le serveur n\'a reçu qu\'UNE décision');
  const e = s.decidePostNow('p4', false, '   ');
  ok(!e.ok && /motif/i.test(e.error || '') && server.decides.length === n0 + 1, 'refus sans motif : refusé tout de suite, rien envoyé');
  const d = s.decidePostNow('p4', true);
  ok(d.ok && st(s, 'p4') === 'completed' && (s as any).pendingDecisions.size === 0, 'mission déjà validée : aucun affichage inventé (le serveur répondra)');
  await d.settled;
}

// ---------- 6. un rechargement lent ne bloque pas l'écran ----------
{
  server.reset(); const s2 = await open();
  server.decideDelay = 100; server.stateDelay = 700;
  const t0 = Date.now();
  const r = s2.decidePostNow('p1', true);
  const shown = Date.now() - t0;
  const res = await r.settled;
  const total = Date.now() - t0;
  ok(res.ok && shown < 40, `affichage immédiat (${shown} ms)`);
  ok(total < 500, `réponse finale sans attendre le rechargement lent (${total} ms au lieu d'environ ${100 + 700} ms avant)`);
  ok(st(s2, 'p1') === 'completed', 'pendant le rechargement lent, la mission reste « validée » (elle ne revient pas à tort)');
  await tick(900);
  ok((s2 as any).pendingDecisions.size === 0 && real(s2, 'p1') === 'completed', 'rechargement fini : état officiel, affichage immédiat parti');
  s2.__dispose();
}

// ---------- 7. l'ancien appel (decidePost) marche toujours ----------
{
  server.reset(); const s3 = await open();
  const r = await s3.decidePost('p2', true);
  ok(r.ok === true && st(s3, 'p2') === 'active', 'decidePost (ancien appel) : même résultat, début de session validé = « active »');
  const bad = await s3.decidePost('p1', false, '');
  ok(bad.ok === false, 'decidePost : refus sans motif refusé');
  s3.__dispose();
}

// ---------- 8. déconnexion : plus rien d'affiché ----------
{
  server.reset(); server.decideDelay = 300; const s4 = await open();
  s4.decidePostNow('p1', true);
  (s4 as any).resetLocal();
  ok((s4 as any).pendingDecisions.size === 0, 'déconnexion : l\'affichage immédiat est vidé');
  s4.__dispose();
}

s.__dispose();
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
