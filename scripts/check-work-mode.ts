// Contrôle de « Ma façon de travailler » : sur le site ou sur un Excel externe (module 19, M19.5). Lancer : npm run check:work-mode
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });
const W = await import('../src/utils/workMode');
const M = await import('../src/utils/missionSheet');
const { db } = await import('../src/db/store');

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const store = () => { const m: Record<string, string> = {}; return { m, st: { getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } } }; };

// ---- règle pure
{
  const { m, st } = store();
  ok(W.getWorkMode('u1', st) === 'site', 'par défaut : sur le site');
  W.setWorkMode('u1', 'excel', st);
  ok(W.getWorkMode('u1', st) === 'excel' && W.getWorkMode('u2', st) === 'site', 'le choix est personnel (u1 ≠ u2)');
  ok(W.getMissionMode('u1', 'p1', st) === 'excel', 'une mission suit le choix personnel');
  W.setMissionMode('u1', 'p1', 'site', st);
  ok(W.getMissionMode('u1', 'p1', st) === 'site' && W.getMissionMode('u1', 'p2', st) === 'excel', 'mais on peut choisir autrement pour UNE mission');
  W.setMissionMode('u1', 'p1', null, st);
  ok(W.getMissionMode('u1', 'p1', st) === 'excel', 'retirer le choix de la mission : retour au choix personnel');
  m['df_work_mode_u3'] = 'n\'importe quoi';
  ok(W.getWorkMode('u3', st) === 'site', 'une valeur abîmée : on revient à « sur le site »');
  ok(W.getWorkMode('', st) === 'site' && W.getMissionMode('', 'p', st) === 'site', 'sans personne : sur le site');
  W.setWorkMode('', 'excel', st); ok(Object.keys(m).length === 2, 'sans personne : rien n\'est écrit');
  const broken = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); }, removeItem() { throw new Error('refusé'); } };
  W.setWorkMode('u1', 'excel', broken); ok(W.getWorkMode('u1', broken) === 'site' && W.getWorkMode('u1', null) === 'site', 'stockage refusé : jamais d\'erreur, on reste « sur le site »');
}

// ---- le site : démarrer une session (démo des contrôles)
db.enterDemo('employee');
const emp = db.getCurrentUser()!;
const contract = db.getContracts().find(c => c.post_type)!;
const release = () => { const o = db.getPosts().find(p => p.employee_id === emp.id && ['pending_start', 'active', 'pending_end'].includes(p.status)); if (o) db.forceReleasePost(o.id, 'essai'); };
const start = () => db.startPost({ employeeId: emp.id, clientName: contract.client_name, accountTag: contract.account_tag, targetScore: contract.target_score, initialScore: 0, postNumber: contract.post_number, shiftType: 'day', status: 'pending_start' });
release();
const tick = () => new Promise(r => setTimeout(r, 5));

W.setWorkMode(emp.id, 'site');
let r = start(); await tick();
ok(r.success && db.getSheets().some(s => s.id === M.missionSheetId(r.post!.id)), 'sur le site (défaut) : le tableau de la mission est préparé tout seul, comme avant');
ok(db.getMissionsWithoutSheet().every(p => p.id !== r.post!.id), 'sur le site : la mission n\'est pas « sans tableau »');
release();

W.setWorkMode(emp.id, 'excel');
r = start(); await tick();
const post = r.post!;
ok(r.success && !db.getSheets().some(s => s.id === M.missionSheetId(post.id)), 'Excel externe : le site ne prépare PAS de tableau');
ok(db.getMissionsWithoutSheet().some(p => p.id === post.id), 'Excel externe : la mission est proposée avec « modèle Excel / remettre mon fichier »');
ok(db.getMissionsWithoutSheet().every(p => p.employee_id === emp.id), 'seulement mes sessions');
const made = db.prepareMissionSheetNow(post.id);
ok(!!made && made.id === M.missionSheetId(post.id) && made.post_id === post.id && made.owner_id === emp.id, 'remettre mon fichier / travailler sur le site : le tableau est préparé à la demande');
ok(db.getMissionsWithoutSheet().every(p => p.id !== post.id), '...et la mission n\'est plus « sans tableau »');
ok(db.prepareMissionSheetNow(post.id) === null, 'préparé deux fois : toujours UN seul tableau');
ok(db.getSheets().filter(s => s.post_id === post.id).length === 1, 'un seul tableau pour la session');
ok(db.prepareMissionSheetNow('inconnu') === null, 'session inconnue : rien');

// choix propre à une mission
release(); await tick();
W.setWorkMode(emp.id, 'excel');
const r3 = start(); await tick();
ok(r3.success && !db.getSheets().some(s => s.post_id === r3.post!.id), 'choix personnel Excel : pas de tableau');
release();
W.setWorkMode(emp.id, 'site');
// l'administrateur ne prépare rien
db.enterDemo('admin');
ok(db.getMissionsWithoutSheet().length === 0 && db.prepareMissionSheetNow(post.id) === null, 'le responsable : rien à préparer');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
