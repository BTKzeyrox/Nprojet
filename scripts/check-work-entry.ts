// Feuille du jour (module 26, M26.5a) : le site (workEntry.ts) et le serveur (bloc WORKENTRY de df-api) donnent EXACTEMENT les mêmes résultats sur des milliers de feuilles ;
// droits, dates, nombres, doublons et « personne ne valide sa propre saisie » vérifiés. Lancer : npm run check:work-entry
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;
g.fetch = async () => { throw new Error('RESEAU'); };

const site = await import('../src/utils/workEntry');
const { db } = await import('../src/db/store');
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };

const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('ROLES') + '\n' + grab('DECIDE') + '\n' + grab('WORKENTRY') + '\n;globalThis.__w = { planWorkEntries, weSelfEntered, weDateOk, weCanEnterFor };', { loader: 'ts' }).code)();
const S = (globalThis as any).__w;

// Les deux copies du code sont les mêmes lignes (hors la tête de chaque fichier)
const body = (t: string) => t.replace(/export /g, '').replace(/\s+/g, ' ').trim();
const siteSrc = readFileSync('src/utils/workEntry.ts', 'utf8').match(/\/\/ ===== BEGIN WORKENTRY =====\n([\s\S]*?)\/\/ ===== END WORKENTRY =====/)![1];
const srvSrc = grab('WORKENTRY').replace('const wePay = decPostPay;\n', '');
ok(body(siteSrc) === body(srvSrc), 'le bloc du serveur est la copie exacte du code du site');

const NOW = '2026-11-05T10:00:00.000Z', TODAY = '2026-11-05';
const admin = { id: 'a1', role: 'admin', name: 'Resp' };
const lead = { id: 'l1', role: 'team_lead', name: 'Chef', team: 'Atelier' };
const lead2 = { id: 'l2', role: 'team_lead', name: 'Chef2', team: 'Atelier' };
const acc = { id: 'c1', role: 'accountant', name: 'Compta' };
const emp = { id: 'e1', role: 'employee', name: 'Rina', team: 'Atelier', total_earnings_ar: 1000 };
const emp2 = { id: 'e2', role: 'employee', name: 'Soa', team: 'Cuisine', total_earnings_ar: 0 };
const users = [admin, lead, lead2, acc, emp, emp2];
const settings = { price_per_mission: 5000, company: { work: { pay_default: 'piece', rate_piece_ar: 150, rate_day_ar: 12000, rate_hour_ar: 2000 } } };
const run = (f: any, me: any, sheet: any, ex: any[] = [], us: any[] = users, today = TODAY) => f(me, JSON.parse(JSON.stringify(us)), ex, sheet, settings, NOW, today);
const L = (o: any = {}) => ({ employee_id: 'e1', work_type: 'prod-piece', quantity: 200, rejected: 10, ...o });
const sheet = (lines: any[], date = TODAY) => ({ date, lines });

// Droits
ok(run(site.planWorkEntries, admin, sheet([L()])).ok === true, 'le responsable saisit pour un opérateur');
ok(run(site.planWorkEntries, lead, sheet([L()])).saved?.length === 1, 'le Chef d\'équipe saisit pour un opérateur de SON équipe');
ok(run(site.planWorkEntries, lead, sheet([L({ employee_id: 'e2' })])).failed[0]?.error === 'employee', 'le Chef d\'équipe ne saisit pas pour une autre équipe');
ok(run(site.planWorkEntries, lead, sheet([L({ employee_id: 'l1' })])).failed[0]?.error === 'employee', 'le Chef d\'équipe ne saisit pas pour lui-même');
ok(run(site.planWorkEntries, lead, sheet([L({ employee_id: 'l2' })])).failed[0]?.error === 'employee', 'le Chef d\'équipe ne saisit pas pour un autre Chef d\'équipe');
ok(run(site.planWorkEntries, lead, sheet([L({ employee_id: 'a1' })])).failed[0]?.error === 'employee', 'le Chef d\'équipe ne saisit pas pour le responsable');
ok(run(site.planWorkEntries, admin, sheet([L({ employee_id: 'l1' })])).failed[0]?.error === 'employee', 'le responsable ne saisit que pour un opérateur');
ok(run(site.planWorkEntries, acc, sheet([L()])).error === 'role', 'le Comptable est refusé');
ok(run(site.planWorkEntries, emp, sheet([L()])).error === 'role', 'l\'opérateur est refusé');
ok(run(site.planWorkEntries, null, sheet([L()])).error === 'role', 'personne n\'est refusé');

// Validation
const a = run(site.planWorkEntries, admin, sheet([L()]));
ok(a.saved[0].status === 'completed' && a.saved[0].calculated_ar === 28500 && a.validated === true, 'saisie du responsable : validée tout de suite, 190 pièces × 150 = 28 500 Ar');
ok(a.users[0].total_earnings_ar === 29500, 'les gains de l\'employé augmentent');
const a2 = run(site.planWorkEntries, admin, sheet([L(), L({ work_type: 'prod-day', quantity: undefined, rejected: undefined, presence: 'present' })]));
ok(a2.users.length === 1 && a2.users[0].total_earnings_ar === 1000 + a2.saved[0].calculated_ar + a2.saved[1].calculated_ar, 'deux lignes du même employé s\'additionnent');
const l = run(site.planWorkEntries, lead, sheet([L()]));
ok(l.saved[0].status === 'pending_end' && l.saved[0].calculated_ar === 0 && l.users.length === 0 && l.validated === false, 'saisie du Chef d\'équipe : en attente du responsable, rien payé');
ok(l.saved[0].entered_by === 'l1' && l.saved[0].entered_by_name === 'Chef' && l.saved[0].client_price_ar === 0, 'la ligne porte « saisi par » et un prix client de 0');
ok(S.weSelfEntered(lead, l.saved[0]) && !S.weSelfEntered(admin, l.saved[0]) && !S.weSelfEntered(lead2, l.saved[0]), 'personne ne valide sa propre saisie (le responsable et un AUTRE Chef d\'équipe le peuvent)');
ok(!(site.weSelfEntered(null, l.saved[0])), 'sans personne : pas de validation');

// Dates
const d = (date: any, today = TODAY) => run(site.planWorkEntries, admin, sheet([L()], date), [], users, today).error;
ok(d(TODAY) === undefined && d('2026-10-06') === undefined, 'aujourd\'hui et il y a 30 jours : acceptés');
ok(d('2026-10-05') === undefined, 'il y a 31 jours : accepté');
ok(d('2026-10-04') === 'date' && d('2026-11-06') === 'date' && d('2026-02-30') === 'date' && d('hier') === 'date' && d(null) === 'date' && d('2026-13-01') === 'date', 'trop ancien, futur, 30 février, texte, vide : refusés');

// Lignes et nombres
const one = (x: any) => run(site.planWorkEntries, admin, sheet([L(x)]));
ok(one({ quantity: '12 500', rejected: '0' }).saved?.[0]?.quantity === 12500, '« 12 500 » est lu 12500');
ok(one({ quantity: '12,5', rejected: 0 }).saved?.[0]?.quantity === 12.5, '« 12,5 » est lu 12,5');
for (const bad of [-1, 'abc', '1e3', NaN, Infinity, 100001, {}, [], true]) ok(one({ quantity: bad, rejected: undefined }).failed?.[0]?.error === 'quantity', `quantité absurde refusée : ${String(JSON.stringify(bad))}`);
ok(one({ hours: 25, quantity: undefined, rejected: undefined }).failed?.[0]?.error === 'hours' && one({ hours: -1, quantity: undefined, rejected: undefined }).failed?.[0]?.error === 'hours', 'heures hors 0 à 24 : refusées');
ok(one({ rejected: 300 }).failed?.[0]?.error === 'rejected', 'plus de refusées que de faites : refusé');
ok(one({ presence: 'tard', quantity: undefined, rejected: undefined }).failed?.[0]?.error === 'presence', 'présence inconnue : refusée');
ok(one({ presence: undefined, quantity: undefined, rejected: undefined, hours: undefined }).failed?.[0]?.error === 'empty' && one({ presence: undefined, quantity: 0, rejected: 0, hours: 0 }).failed?.[0]?.error === 'empty', 'une ligne sans rien à mesurer n\'est pas enregistrée');
ok(one({ presence: 'absent', quantity: undefined, rejected: undefined }).saved?.length === 1, 'une absence est enregistrée');
ok(one({ work_type: 'Prod Piece!' }).failed?.[0]?.error === 'type' && one({ work_type: 5 }).failed?.[0]?.error === 'type', 'type de travail mal écrit : refusé');
ok(one({ employee_id: 'inconnu' }).failed?.[0]?.error === 'employee', 'employé inconnu : refusé');
ok(run(site.planWorkEntries, admin, sheet([])).error === 'empty' && run(site.planWorkEntries, admin, { date: TODAY }).error === 'empty' && run(site.planWorkEntries, admin, sheet(new Array(101).fill(L()))).error === 'too_many' && run(site.planWorkEntries, admin, null).error === 'bad', 'feuille vide, trop longue, illisible : refusée');
ok(run(site.planWorkEntries, admin, sheet(new Array(100).fill(0).map(() => L()))).saved.length === 1, '100 lignes : acceptées (les doublons sont refusés)');

// Doublons
const dup = run(site.planWorkEntries, admin, sheet([L(), L()]));
ok(dup.saved.length === 1 && dup.failed[0].line === 2 && dup.failed[0].error === 'duplicate', 'le même employé, jour et type dans la feuille : un seul, le 2e refusé (ligne 2)');
const again = run(site.planWorkEntries, admin, sheet([L()]), dup.saved);
ok(again.saved.length === 0 && again.failed[0].error === 'duplicate', 'déjà enregistré avant : refusé');
const rej = run(site.planWorkEntries, admin, sheet([L()]), [{ ...dup.saved[0], status: 'rejected' }]);
ok(rej.saved.length === 1, 'une ligne refusée avant peut être ressaisie');
const mixed = run(site.planWorkEntries, admin, sheet([L(), L({ employee_id: 'zz' }), L({ work_type: 'prod-day', presence: 'present', quantity: undefined, rejected: undefined })]));
ok(mixed.saved.length === 2 && mixed.failed.length === 1 && mixed.failed[0].line === 2, 'résultat ligne par ligne : 2 enregistrées, la ligne 2 refusée');

// Le site et le serveur donnent les mêmes résultats sur des milliers de feuilles
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const mes = [admin, lead, lead2, acc, emp, null, { id: 'x', role: 'weird' }];
const dates = [TODAY, '2026-10-20', '2026-10-05', '2026-10-04', '2026-11-06', '2026-02-30', 'x', undefined, 5];
const types = ['prod-piece', 'prod-day', 'x y', '', undefined, 5, 'a'.repeat(41), 'a'.repeat(30)];
const nums = [undefined, null, '', 0, 1, 12.5, 200, '200', '12 500', '12,5', '1e3', -3, NaN, Infinity, 100000, 100001, 'abc', {}, 25, 8];
const pres = [undefined, '', 'present', 'late', 'half', 'absent', 'x', 5];
const emps = ['e1', 'e2', 'l1', 'l2', 'a1', 'c1', 'nope', undefined, 5];
let same = 0, total = 0;
for (let i = 0; i < 6000; i++) {
  const lines = Array.from({ length: Math.floor(rnd() * 5) }, () => rnd() < 0.05 ? pick([null, 5, 'x']) : ({ employee_id: pick(emps), work_type: pick(types), presence: pick(pres), hours: pick(nums), quantity: pick(nums), rejected: pick(nums) }));
  const sh = rnd() < 0.03 ? pick([null, 5, 'x', {}]) : { date: pick(dates), type_label: pick(['', 'Prod', undefined, ' a  b ', 'x'.repeat(100)]), lines };
  const me = pick(mes);
  const ex = rnd() < 0.3 ? [{ id: `we-${TODAY}-e1-prod-piece`, status: pick(['completed', 'rejected', 'pending_end']) }] : [];
  const r1 = JSON.stringify(run(site.planWorkEntries, me, sh, ex)), r2 = JSON.stringify(run(S.planWorkEntries, me, sh, ex));
  total++; if (r1 === r2) same++;
}
ok(same === total, `site = serveur sur ${total} feuilles (${same} identiques)`);
// Jamais de nombre absurde dans un résultat
let clean = true;
for (let i = 0; i < 3000; i++) {
  const r = run(site.planWorkEntries, admin, sheet([L({ quantity: pick(nums), rejected: pick(nums), hours: pick(nums), presence: pick(pres) })]));
  if (r.ok) for (const p of r.saved) if (![p.calculated_ar, p.quantity ?? 0, p.rejected ?? 0, p.hours ?? 0].every(n => Number.isFinite(n) && n >= 0) || !Number.isInteger(p.calculated_ar)) clean = false;
}
ok(clean, 'jamais de montant négatif, infini ou décimal');

// Magasin (démo)
const guard = readFileSync('src/db/store.ts', 'utf8');
ok(/weSelfEntered\(this\.currentUser, post\)/.test(guard) && /async addWorkEntries/.test(guard) && /'work-entry'/.test(guard), 'le magasin a la saisie, la route serveur et le refus de se valider soi-même');
ok(/weSelfEntered\(me, post\)\) return res\.status\(403\)/.test(src), 'le serveur refuse qu\'on valide sa propre saisie');
ok(/action === "work-entry" && req\.method === "POST"/.test(src), 'la route work-entry est branchée aux deux endroits du serveur');

// M26.5c : affichage dans les listes
const txt = await import('../src/utils/workLineText');
const tl = await import('../src/utils/teamLead');
ok(txt.workLineDetail({ quantity: 200, rejected: 10 }) === '200 faites · 10 refusées (5 %)', 'texte : « 200 faites · 10 refusées (5 %) »');
ok(txt.workLineDetail({ presence: 'present', hours: 8 }) === 'Présent · 8 h' && txt.workLineDetail({ presence: 'absent' }).length > 0, 'texte : présence et heures');
ok(txt.workLineDetail({ quantity: 1, rejected: 0 }) === '1 faite' && txt.workLineDetail(null) === '' && txt.workLineDetail({ quantity: 'x' }) !== undefined, 'texte : 1 faite, rien, valeur absurde sans erreur');
ok(txt.workLineBy({ entered_by_name: 'Chef' }) === 'Saisi par Chef' && txt.workLineBy({}) === '', 'texte : « Saisi par … »');
ok(tl.teamPendingPosts(lead as any, users as any, l.saved).length === 0, 'le Chef d\'équipe ne voit pas sa propre saisie à valider');
ok(tl.teamPendingPosts(lead2 as any, users as any, l.saved).length === 1, 'un AUTRE Chef d\'équipe de la même équipe la voit');
const ds = readFileSync('src/db/store.ts', 'utf8');
ok(/weSelfEntered\(me, this\.posts\.find\(p => p\.id === id\)\)/.test(ds), 'décider sur sa propre saisie est refusé avant tout envoi');
void db;
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
