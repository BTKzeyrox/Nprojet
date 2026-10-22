// Contrôle des règles du lot 3 du module 11 (qualité des données, Conditions). Pur, sans réseau. Lancer : npm run check:health-lot3
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { LOT3_RULES } from '../src/utils/health/rules/lot3';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({
  today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over,
} as HealthContext);
const run = (c: HealthContext) => runHealth(c, LOT3_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const P = (id: string, extra: any = {}) => ({ id, employee_id: 'u1', employee_name: 'Camille', client_name: 'M', status: 'completed', date: day(3), start_time: '08:05:00', post_number: 1, calculated_ar: 5000, ...extra });

const empty = run(ctx());
ok(!empty.errors.length && !empty.alerts.some(a => a.page === 'data'), 'aucune donnée : aucune alerte « données », aucune erreur');

// Client disparu
const cl = [{ id: 'k1', name: 'Rivage' }] as any;
let r = run(ctx({ clients: cl, posts: [P('a', { client_id: 'k1' }), P('b', { client_id: 'zz', client_name: 'Fantôme' })] as any, contracts: [{ id: 'c', post_number: 2, client_name: 'Oublié', client_id: 'yy' }] as any }));
let a = find(r, 'data:client-gone');
ok(!!a && a.value === 2 && /Fantôme/.test(a.why_fr) && /Oublié/.test(a.why_fr) && a.go.view === 'clients', 'client disparu : 2 missions, noms cités, mène à Clients');
ok(!find(run(ctx({ clients: [], posts: [P('b', { client_id: 'zz' })] as any })), 'data:client-gone'), 'client disparu : aucune fiche du tout = on ne dit rien');
ok(!find(run(ctx({ clients: cl, posts: [P('a', { client_id: 'k1' }), P('b')] as any })), 'data:client-gone'), 'client disparu : lien valide ou absent = rien');

// Dates futures
r = run(ctx({ posts: [P('a', { date: day(-4) }), P('b', { date: TODAY }), P('c', { date: 'n\'importe quoi' })] as any, advances: [{ id: 'v', employee_id: 'u1', employee_name: 'C', amount_ar: 1, reason: '', request_date: `${day(-2)}T10:00:00Z`, status: 'pending' }] as any }));
a = find(r, 'data:future-dates');
ok(!!a && a.value === 2, 'dates futures : mission et avance futures = 2 (aujourd\'hui et date illisible ignorés)');
ok(a!.since === day(-2), 'dates futures : « depuis » = la plus proche');

// Montants
r = run(ctx({ posts: [P('a', { calculated_ar: -5 })] as any }));
ok(find(r, 'data:bad-amounts')?.severity === 'urgent' && find(r, 'data:bad-amounts')?.value === 1, 'montant négatif sur une mission = urgent');
ok(find(run(ctx({ cash: [{ id: 'c', kind: 'out', category: 'x', amount_ar: 0, date: day(1), note: '' }] as any })), 'data:bad-amounts')?.value === 1, 'montant d\'argent à 0 = signalé');
ok(find(run(ctx({ cash: [{ id: 'c', kind: 'out', category: 'x', amount_ar: NaN, date: day(1), note: '' }] as any })), 'data:bad-amounts')?.value === 1, 'montant NaN = signalé sans planter');
ok(!find(run(ctx({ posts: [P('a', { calculated_ar: 0 })] as any })), 'data:bad-amounts'), 'mission à 0 Ar (offerte) = normal');
ok(!find(run(ctx({ posts: [P('a', { calculated_ar: undefined })] as any })), 'data:bad-amounts'), 'montant absent = normal');

// Doublons
r = run(ctx({ posts: [P('a'), P('b'), P('c', { start_time: '09:00:00' }), P('d', { employee_id: 'u2' })] as any }));
ok(find(r, 'data:duplicate-sessions')?.value === 1, 'session en double : même salarié, jour, poste, heure = 1 ; autre heure ou autre salarié = non');
ok(!find(run(ctx({ posts: [P('a'), P('c', { start_time: '09:00:00' })] as any })), 'data:duplicate-sessions'), 'session en double : rien si tout diffère');

// Champs vides, mouvements orphelins
r = run(ctx({ products: [{ id: 'p', name: '  ' }] as any, clients: [{ id: 'k', name: '' }] as any, posts: [P('a', { employee_name: '' })] as any }));
ok(find(r, 'data:empty-fields')?.value === 3 && find(r, 'data:empty-fields')?.severity === 'info', 'noms vides : 3 fiches, information');
r = run(ctx({ products: [{ id: 'p1', name: 'A', buy_price_ar: 1, sell_price_ar: 1 }] as any, moves: [{ id: 'm', product_id: 'p1', type: 'in', qty: 1, date: day(1), note: '' }, { id: 'm2', product_id: 'gone', type: 'in', qty: 1, date: day(1), note: '' }] as any }));
ok(find(r, 'data:orphan-moves')?.value === 1, 'mouvement orphelin : 1');
ok(!find(run(ctx({ products: [], moves: [{ id: 'm2', product_id: 'gone', type: 'in', qty: 1, date: day(1), note: '' }] as any })), 'data:orphan-moves'), 'mouvement orphelin : aucun produit = stock pas utilisé, rien');

// Conditions
r = run(ctx({ settings: {} as any }));
a = find(r, 'conditions:missing');
ok(!!a && a.value === 4 && a.severity === 'info' && /nom de l'entreprise/.test(a.why_fr) && /company name/.test(a.why_en), 'réglages manquants : 4 listés, FR et EN');
r = run(ctx({ settings: { price_per_mission: 500, company: { identity: { name: 'BTK' }, payroll: { pay_day: 5 }, leave: { work_days_per_week: 5 } } } as any }));
ok(!find(r, 'conditions:missing'), 'réglages manquants : tout rempli = rien');
r = run(ctx({ settings: { price_per_mission: 500, day_shift_start: '25:00', day_shift_end: '18:00', late_tolerance_min: 200, advance_cap_pct: 150, company: { identity: { name: 'BTK' }, payroll: { pay_day: 5 }, leave: { work_days_per_week: 2 }, tax: { vat_enabled: true, vat_rate: 0 }, clients: { regular_missions: 6, strategic_min_missions: 3 } } } as any }));
a = find(r, 'conditions:incoherent');
ok(!!a && a.value === 6 && a.severity === 'watch', 'réglages incohérents : 6 contradictions repérées (heure 25:00, tolérance, avance, TVA, stratégique, jours)');
ok(!/[À-ÿ]/.test(a!.title_en + a!.why_en), 'réglages incohérents : anglais propre');
ok(!find(run(ctx({ settings: { day_shift_start: '08:00', day_shift_end: '18:00', night_shift_start: '20:00', night_shift_end: '06:00', late_tolerance_min: 15, advance_cap_pct: 50 } as any })), 'conditions:incoherent'), 'réglages normaux = aucune incohérence');
ok(!!find(run(ctx({ settings: { day_shift_start: '10:75', day_shift_end: '18:00' } as any })), 'conditions:incoherent'), 'heure « 10:75 » = illisible');

// Ensemble
const big = ctx({ clients: cl, posts: [P('a', { client_id: 'zz' }), P('b', { client_id: 'zz', date: day(-1) }), P('c', { calculated_ar: -1 })] as any, settings: {} as any });
const b1 = run(big), b2 = run({ ...big, posts: [...(big.posts as any)].reverse() });
ok(b1.errors.length === 0 && b1.alerts.length >= 4 && b1.alerts.every(x => alertProblem(x) === null), `ensemble : ${b1.alerts.length} alertes valides, aucune erreur`);
ok(JSON.stringify(b1.alerts.map(x => x.id)) === JSON.stringify(b2.alerts.map(x => x.id)), 'ensemble : ordre des données sans effet');
const frozen = JSON.stringify(big); run(big); ok(JSON.stringify(big) === frozen, 'ensemble : aucune donnée modifiée');

// Démo (aujourd'hui réel)
const demo = buildDemoData(), realToday = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10), t0 = Date.now();
const d = runHealth(ctx({ today: realToday, now: Date.now(), users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock, advances: demo.advances } as any), LOT3_RULES);
ok(d.errors.length === 0 && d.alerts.every(x => alertProblem(x) === null), `démo : ${d.alerts.length} alertes valides`);
ok(!d.alerts.some(x => x.page === 'data' && x.rule !== 'empty-fields' && x.severity !== 'info'), 'démo : données de démonstration propres (aucune alerte « données » grave)');
ok(Date.now() - t0 < 800, 'démo : calcul rapide');
console.log('   alertes de la démo :', d.alerts.map(x => `${x.severity}:${x.id}`).join(' | ') || '(aucune)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
