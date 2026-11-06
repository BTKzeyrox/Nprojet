// Paie selon le mode (module 26, M26.4) : le serveur (bloc DECIDE de df-api) et le site (postPay.ts / postDecision.ts) donnent EXACTEMENT les mêmes montants sur des milliers de cas,
// une mission normale est payée comme avant dans TOUS les cas, et aucune valeur absurde ne donne un montant négatif, infini ou décimal. Lancer : npm run check:payroll-modes
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;
g.fetch = async () => { throw new Error('RESEAU'); };

const { planPostDecision, decisionClientPrice } = await import('../src/utils/postDecision');
const { postPayAr, payModeFor, isWorkLine, workLineClientPrice } = await import('../src/utils/postPay');
const { db } = await import('../src/db/store');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };

// ---------- Le bloc DECIDE du serveur, tel quel ----------
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('ROLES') + '\n' + grab('DECIDE') + '\n;globalThis.__t = { planPostDecision, decisionClientPrice, decPostPay };', { loader: 'ts' }).code)();
const S = (globalThis as any).__t;
const NOW = '2026-11-05T10:00:00.000Z';

// ---------- Les cas ----------
const W = (mode: unknown, extra: any = {}) => ({ price_per_mission: 5000, company: { work: { pay_default: mode, rate_day_ar: 12000, rate_hour_ar: 2000, rate_piece_ar: 150, rate_fixed_ar: 400000, ...extra } } });
const settingsList: any[] = [
  { price_per_mission: 5000 }, { price_per_mission: 0 }, { price_per_mission: -5 }, { price_per_mission: 'abc' }, { price_per_mission: NaN }, {}, undefined, null,
  W('mission'), W('day'), W('hour'), W('piece'), W('fixed'), W('weekly'), W(undefined), W(null), W(5),
  W('piece', { rate_piece_ar: 0 }), W('piece', { rate_piece_ar: -5 }), W('piece', { rate_piece_ar: NaN }), W('piece', { rate_piece_ar: Infinity }), W('piece', { rate_piece_ar: '150' }), W('piece', { rate_piece_ar: 1e9 }), W('piece', { rate_piece_ar: 1e8 }),
  W('day', { rate_day_ar: 0 }), W('hour', { rate_hour_ar: 0.5 }),
  { price_per_mission: 5000, company: null }, { price_per_mission: 5000, company: { work: null } }, { price_per_mission: 5000, company: 'x' }, { price_per_mission: 5000, company: { work: { pay_default: 'piece' } } },
  { price_per_mission: 123.6, company: { work: { pay_default: 'mission' } } },
];
const employees: any[] = [null, undefined, {}, { pay_mode: 'piece' }, { pay_mode: 'day' }, { pay_mode: 'hour' }, { pay_mode: 'fixed' }, { pay_mode: 'mission' }, { pay_mode: 'x' }, { pay_mode: 5 },
  { pay_rate_ar: 200 }, { pay_mode: 'piece', pay_rate_ar: 200 }, { pay_mode: 'day', pay_rate_ar: 15000 }, { pay_rate_ar: -5 }, { pay_rate_ar: 0 }, { pay_rate_ar: 1e9 }, { pay_rate_ar: '200' }, { pay_rate_ar: NaN }, { pay_rate_ar: 1e8 }];
const base = { id: 'p1', employee_id: 'e1', status: 'pending_end', client_name: 'Acme', post_number: 'P1', initial_score: 10, current_score: 40, final_score: 40 };
const normal: any[] = [{ ...base }, { ...base, work_type: undefined }, { ...base, work_type: '' }, { ...base, work_type: null }, { ...base, work_type: 5 }, { ...base, work_type: {} }, { ...base, work_type: 0 },
  { ...base, quantity: 100, presence: 'present', hours: 8 }]; // des champs de production sur une mission normale (sans work_type) sont IGNORÉS
const work = (x: any) => ({ ...base, work_type: 'prod-piece', ...x });
const lines: any[] = [];
for (const quantity of [undefined, 0, 1, 100, 200, 100000, 100001, -5, NaN, Infinity, '100', null, 12.5])
  for (const rejected of [undefined, 0, 10, 500, -1, NaN, '5']) lines.push(work({ quantity, rejected }));
for (const presence of [undefined, 'present', 'late', 'half', 'absent', 'PRESENT', 1, null, '']) lines.push(work({ presence }));
for (const hours of [undefined, 0, 1, 8.5, 24, 24.01, 25, -1, NaN, Infinity, '8', null]) lines.push(work({ hours }));
lines.push(work({ work_type: ' ' }), work({ work_type: 'x', quantity: 50, rejected: 5, hours: 6, presence: 'half' }), work({ work_type: 'x', quantity: 1e5, rejected: 0, hours: 24, presence: 'present' }));
const contract = { client_price_ar: 9000, current_score: 10 };

// ---------- 1) Serveur = site, sur tout ----------
let compared = 0, diff = '';
for (const s of settingsList) for (const e of employees) for (const p of [...normal, ...lines]) {
  const a = S.planPostDecision(p, contract, s, e, true, '', NOW), b = planPostDecision(p, contract, s, e, true, '', NOW);
  compared++;
  if (JSON.stringify(a) !== JSON.stringify(b) && !diff) diff = JSON.stringify({ s, e, p, serveur: a.payAr, site: b.payAr });
}
ok(diff === '' && compared > 15000, `serveur = site : ${compared} cas comparés (réglages × employés × sessions, valeurs normales et absurdes), aucune différence${diff ? ' — ' + diff : ''}`);
let pdiff = '';
for (const s of settingsList) for (const e of employees) for (const p of [...normal, ...lines]) { if (S.decPostPay(p, e, s) !== postPayAr(p, e, s) && !pdiff) pdiff = JSON.stringify({ s, e, p }); }
ok(pdiff === '', `serveur = site : le calcul du montant seul est identique${pdiff ? ' — ' + pdiff : ''}`);

// ---------- 2) Une mission normale est payée comme AVANT, quoi qu'on règle ----------
const oldPay = (s: any) => { const n = Number(s && s.price_per_mission); return Math.max(0, Math.round(Number.isFinite(n) ? n : 0)); };
let normalOk = true, normalBad = '';
for (const s of settingsList) for (const e of employees) for (const p of normal) {
  const r = planPostDecision(p, contract, s, e, true, '', NOW), want = oldPay(s);
  if (r.payAr !== want || r.post.calculated_ar !== want || r.post.client_price_ar !== 9000 || r.employee !== undefined && false) { normalOk = false; normalBad = JSON.stringify({ s, e, p, got: r.payAr, want }); }
}
ok(normalOk, `mission normale : payée exactement comme avant (prix fixe × 1), prix client inchangé, QUEL QUE SOIT le mode, les tarifs ou l'employé${normalBad ? ' — ' + normalBad : ''}`);
ok(isWorkLine({ work_type: 'x' }) && !isWorkLine({}) && !isWorkLine({ work_type: '' }) && !isWorkLine(null) && !isWorkLine(undefined) && !isWorkLine('x') && !isWorkLine({ work_type: 5 }) && isWorkLine({ work_type: ' ' }), 'ligne de travail : un `work_type` texte non vide ; tout le reste = mission normale');

// ---------- 3) Jamais d'absurdité ----------
let bad = '';
for (const s of settingsList) for (const e of employees) for (const p of [...normal, ...lines]) {
  const a = postPayAr(p, e, s);
  if (!(Number.isInteger(a) && a >= 0 && Number.isFinite(a)) || Object.is(a, -0)) bad = JSON.stringify({ s, e, p, a });
}
ok(bad === '', `tous les montants sont des entiers ≥ 0 (jamais NaN, infini, négatif, décimal ni -0)${bad ? ' — ' + bad : ''}`);
ok(Math.max(...settingsList.flatMap(s => employees.flatMap(e => lines.map(p => postPayAr(p, e, s))))) <= 1e8 * 1e5, 'le plus gros montant possible reste raisonnable (≤ 10 000 milliards d\'Ar, jamais d\'infini)');

// ---------- 4) Les montants attendus, un par un ----------
const pay = (p: any, e: any, s: any) => planPostDecision(p, contract, s, e, true, '', NOW);
ok(pay(work({ quantity: 200, rejected: 10 }), {}, W('piece')).payAr === 28500, 'à la boîte : 200 faites − 10 refusées = 190 × 150 = 28 500 Ar');
ok(pay(work({ quantity: 200, rejected: 10 }), { pay_rate_ar: 200 }, W('piece')).payAr === 38000, 'à la boîte, tarif propre de l\'employé 200 Ar : 190 × 200 = 38 000');
ok(pay(work({ quantity: 200, rejected: 999 }), {}, W('piece')).payAr === 0, 'à la boîte : on ne peut pas refuser plus que fait → 0 payé (jamais négatif)');
ok(pay(work({ quantity: 100001 }), {}, W('piece')).payAr === 0 && pay(work({ quantity: -5 }), {}, W('piece')).payAr === 0 && pay(work({ quantity: '100' }), {}, W('piece')).payAr === 0, 'à la boîte : quantité absurde (trop grande, négative, texte) → 0, jamais devinée');
ok(pay(work({ presence: 'present' }), {}, W('day')).payAr === 12000 && pay(work({ presence: 'late' }), {}, W('day')).payAr === 12000 && pay(work({ presence: 'half' }), {}, W('day')).payAr === 6000 && pay(work({ presence: 'absent' }), {}, W('day')).payAr === 0 && pay(work({ presence: 'inconnu' }), {}, W('day')).payAr === 0, 'à la journée : présent 12 000, en retard 12 000, demi-journée 6 000, absent 0, inconnu 0');
ok(pay(work({ hours: 8.5 }), {}, W('hour')).payAr === 17000 && pay(work({ hours: 25 }), {}, W('hour')).payAr === 0 && pay(work({ hours: 0 }), {}, W('hour')).payAr === 0, 'à l\'heure : 8,5 h × 2 000 = 17 000 ; plus de 24 h ou 0 h → 0');
ok(pay(work({ quantity: 5, presence: 'present' }), {}, W('fixed')).payAr === 0, 'salaire fixe : 0 par ligne (il se paie par période, pas par ligne : voir le plan)');
ok(pay(work({ quantity: 5 }), {}, W('mission')).payAr === 5000 && pay(work({ quantity: 5 }), {}, { price_per_mission: 5000 }).payAr === 5000 && pay(work({ quantity: 5 }), {}, W('weekly')).payAr === 5000, 'ligne de travail payée « par mission » (ou mode inconnu) : le prix fixe d\'une mission');
ok(pay(work({ quantity: 200, presence: 'present' }), { pay_mode: 'day' }, W('piece')).payAr === 12000 && pay(work({ quantity: 200, presence: 'present' }), { pay_mode: 'day', pay_rate_ar: 15000 }, W('piece')).payAr === 15000, 'le mode de l\'employé remplace celui de l\'entreprise (et son tarif remplace celui de l\'entreprise)');
ok(pay(work({ quantity: 200 }), { pay_mode: 'bidon' }, W('piece')).payAr === 30000 && pay(work({ quantity: 200 }), { pay_rate_ar: -5 }, W('piece')).payAr === 30000 && pay(work({ quantity: 200 }), { pay_rate_ar: 0 }, W('piece')).payAr === 30000 && pay(work({ quantity: 200 }), { pay_rate_ar: 1e9 }, W('piece')).payAr === 30000 && pay(work({ quantity: 200 }), { pay_rate_ar: '200' }, W('piece')).payAr === 30000, 'mode ou tarif d\'employé faux (inconnu, négatif, 0, énorme, texte) : ignoré, on retombe sur celui de l\'entreprise');
ok(pay(work({ quantity: 200 }), {}, W('piece', { rate_piece_ar: 0 })).payAr === 0 && pay(work({ quantity: 200 }), {}, W('piece', { rate_piece_ar: 1e9 })).payAr === 0 && pay(work({ quantity: 200 }), {}, { price_per_mission: 5000, company: { work: { pay_default: 'piece' } } }).payAr === 0, 'tarif de l\'entreprise à 0, absurde ou absent : 0 (jamais inventé)');
ok(pay(work({ quantity: 3 }), {}, W('piece', { rate_piece_ar: 33.33 })).payAr === 100 && pay(work({ quantity: 3 }), {}, W('piece', { rate_piece_ar: 0.5 })).payAr === 2, 'arrondi à l\'Ar');

// ---------- 5) Ce qui se passe autour du montant ----------
const wl = pay(work({ quantity: 200, rejected: 10 }), { total_earnings_ar: 1000, total_score_boosted: 5 }, W('piece'));
ok(wl.ok && wl.kind === 'end_ok' && wl.post.status === 'completed' && wl.post.calculated_ar === 28500 && wl.payAr === 28500 && wl.employee.total_earnings_ar === 29500, 'validation d\'une ligne de travail : terminée, montant figé dans calculated_ar, gains de l\'employé augmentés du bon montant');
ok(wl.post.client_price_ar === 0 && workLineClientPrice === 0, 'ligne de travail : prix client 0 (elle n\'est facturée à aucun client)');
ok(pay(base, { total_earnings_ar: 1000 }, W('piece')).post.client_price_ar === 9000 && pay(base, {}, W('piece')).employee === undefined === false, 'mission normale : prix client de son contrat, comme avant');
ok(planPostDecision(work({ quantity: 5 }), contract, W('piece'), {}, false, 'Photo floue', NOW).post.status === 'rejected' && planPostDecision(work({ quantity: 5 }), contract, W('piece'), {}, false, 'Photo floue', NOW).post.calculated_ar === undefined, 'refuser une ligne de travail : refusée, aucun montant');
ok(planPostDecision({ ...work({ quantity: 5 }), status: 'pending_start' }, contract, W('piece'), {}, true, '', NOW).kind === 'start_ok' && planPostDecision({ ...work({ quantity: 5 }), status: 'completed' }, contract, W('piece'), {}, true, '', NOW).error === 'not_pending', 'étape de début et session déjà terminée : comme avant');
const frozen = JSON.parse(JSON.stringify({ p: work({ quantity: 200 }), s: W('piece'), e: { pay_mode: 'piece', total_earnings_ar: 5 } }));
const before = JSON.stringify(frozen); planPostDecision(frozen.p, contract, frozen.s, frozen.e, true, '', NOW); S.planPostDecision(frozen.p, contract, frozen.s, frozen.e, true, '', NOW);
ok(JSON.stringify(frozen) === before, 'la décision ne modifie jamais ce qu\'on lui donne (site et serveur)');
ok(payModeFor({ pay_mode: 'day' }, W('piece')) === 'day' && payModeFor({}, W('piece')) === 'piece' && payModeFor(null, null) === 'mission' && payModeFor({ pay_mode: 'x' }, W('weekly')) === 'mission', 'payModeFor : employé, sinon entreprise, sinon « par mission »');

// ---------- 6) Le mode démo suit la même règle ----------
db.enterDemo('admin');
const anyDb = db as any;
const emp = anyDb.users.find((u: any) => u.role === 'employee');
const setCompany = (mode: string) => { anyDb.settings[0] = { ...(anyDb.settings[0] || {}), id: 'general', price_per_mission: 5000, company: { ...(anyDb.settings[0]?.company || {}), work: { business_model: 'workshop', pay_default: mode, rate_day_ar: 12000, rate_hour_ar: 2000, rate_piece_ar: 150, rate_fixed_ar: 400000, stock_gap_pct: 10 } } }; };
const mk = (id: string, extra: any) => { anyDb.posts.push({ id, employee_id: emp.id, client_name: 'Chocolats', account_tag: 'T', post_number: 'ZZ' + id, status: 'pending_end', target_score: 0, initial_score: 0, current_score: 0, final_score: 0, date: '2026-11-05', ...extra }); return id; };
setCompany('piece');
const idA = mk('wl-a', { work_type: 'prod-piece', quantity: 200, rejected: 10 });
const rA = db.validatePost(idA); const pA = anyDb.posts.find((p: any) => p.id === idA);
ok(rA.success && pA.status === 'completed' && pA.calculated_ar === 28500 && pA.client_price_ar === 0, 'démo : une ligne de production (200 − 10 à 150) est payée 28 500 Ar, prix client 0');
setCompany('piece');
const idB = mk('norm-b', {}); db.validatePost(idB); const pB = anyDb.posts.find((p: any) => p.id === idB);
ok(pB.status === 'completed' && pB.calculated_ar === 5000, 'démo : une mission normale reste payée 5 000 Ar (prix fixe), même en mode « à la boîte »');
setCompany('day');
const idC = mk('wl-c', { work_type: 'site-day', presence: 'half' }); db.validatePost(idC); ok(anyDb.posts.find((p: any) => p.id === idC).calculated_ar === 6000, 'démo : une demi-journée est payée 6 000 Ar (mode « à la journée », 12 000)');
const scenarios: [string, any][] = [['piece', { work_type: 'w', quantity: 77, rejected: 7 }], ['hour', { work_type: 'w', hours: 7.25 }], ['day', { work_type: 'w', presence: 'late' }], ['fixed', { work_type: 'w', quantity: 9 }], ['mission', { work_type: 'w' }], ['weekly', { work_type: 'w', quantity: 9 }]];
let demoSame = true, demoMsg = '';
for (const [i, [mode, extra]] of scenarios.entries()) { setCompany(mode); const id = mk('sc' + i, extra); db.validatePost(id); const demo = anyDb.posts.find((p: any) => p.id === id).calculated_ar, srv = S.decPostPay({ ...extra }, emp, anyDb.settings[0]); if (demo !== srv) { demoSame = false; demoMsg = `${mode}: démo ${demo} ≠ serveur ${srv}`; } }
ok(demoSame, `démo = serveur sur 6 modes (à la boîte, à l'heure, à la journée, fixe, par mission, mode inconnu)${demoMsg ? ' — ' + demoMsg : ''}`);

// ---------- 7) Pureté et lien avec le plan ----------
const pp = readFileSync('src/utils/postPay.ts', 'utf8');
ok(!/fetch\(|XMLHttpRequest|import .*db\/store|localStorage|Date\.now\(\)|new Date\(\)|setTimeout|Math\.random/.test(pp), 'postPay.ts : règles pures (aucun réseau, aucune donnée, aucune horloge, aucun hasard)');
ok(/BEGIN DECIDE/.test(src) && /function decPostPay/.test(grab('DECIDE')) && /decPostPay\(post, employee, settings\)/.test(grab('DECIDE')) && !/price_per_mission\)\)\);\n  return \{\n    ok: true, kind: "end_ok"/.test(grab('DECIDE')), 'serveur : la décision appelle decPostPay (l\'ancien calcul direct a disparu du bloc)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
