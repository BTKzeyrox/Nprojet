// Contrôle de la détection statistique (module 11, M11.6) : médiane, minimum de périodes, seuils pile, proportion du mois, semaines. Pur. Lancer : npm run check:health-stats
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { STATS_RULES } from '../src/utils/health/rules/stats';
import { median, compareToMedian, monthProgress, previousMonths } from '../src/utils/health/stats';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Briques ----------
ok(median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5 && Number.isNaN(median([])) && median([5, NaN as any, 1, 3]) === 3, 'médiane : impair, pair, vide, valeurs illisibles ignorées');
ok(median([1, 1, 1, 1000]) === 1, 'médiane : une valeur extrême ne la déplace pas');
const c1 = compareToMedian(20, [10, 10, 10], { minPeriods: 3, upRatio: 2 });
ok(c1.direction === 'up' && c1.ratio === 2 && c1.baseline === 10 && c1.periods === 3, 'comparaison : 2 × la médiane pile = hausse');
ok(compareToMedian(19.9, [10, 10, 10], { minPeriods: 3, upRatio: 2 }).direction === 'none', 'comparaison : juste en dessous du seuil = rien');
ok(compareToMedian(5, [10, 10, 10], { minPeriods: 3, downRatio: 0.5 }).direction === 'down', 'comparaison : moitié pile = baisse');
ok(compareToMedian(20, [10, 10], { minPeriods: 3, upRatio: 2 }).direction === 'none', 'comparaison : 2 périodes seulement = pas assez de données');
ok(compareToMedian(20, [0, 0, 0], { minPeriods: 3, upRatio: 2 }).direction === 'none', 'comparaison : médiane à 0 = on ne juge pas (pas de division par zéro)');
ok(compareToMedian(NaN, [10, 10, 10], { minPeriods: 3, upRatio: 2 }).direction === 'none', 'comparaison : valeur NaN = rien');
ok(compareToMedian(20, [10, 10, 10], { minPeriods: 3, upRatio: 2, minDiff: 50 }).direction === 'none', 'comparaison : écart trop petit en valeur absolue = rien');
ok(eq(monthProgress('2026-02-14'), { day: 14, days: 28, fraction: 0.5 }), 'mois : 14 février = moitié (28 jours)');
ok(monthProgress('2024-02-29').days === 29, 'mois : février d\'une année bissextile');
ok(eq(previousMonths('2026-01-15', 3), ['2025-10', '2025-11', '2025-12']), 'mois précédents : passage d\'année');

// ---------- Règles ----------
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00'); // jour 21 sur 31
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over } as HealthContext);
const run = (c: HealthContext) => runHealth(c, STATS_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const L = (id: string, kind: 'in' | 'out', category: string, amount: number, date: string) => ({ id, kind, category, amount_ar: amount, date, note: '' });
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
// 6 mois de base : 100 000 reçus, 30 000 d'Internet, 20 000 d'Achats chaque mois
const base = (skip: string[] = []) => MONTHS.filter(m => !skip.includes(m)).flatMap(m => [L(`i${m}`, 'in', 'Paiement client', 100000, `${m}-10`), L(`n${m}`, 'out', 'Internet', 30000, `${m}-05`), L(`a${m}`, 'out', 'Achats', 20000, `${m}-12`)]);

ok(!run(ctx()).alerts.length && !run(ctx()).errors.length, 'aucune donnée : aucune alerte');
// Dépense en hausse : prorata 21/31 = 0,677 → normal ≈ 20 323 ; on met 60 000 d'Internet ce mois (≈ 2,95 ×)
let r = run(ctx({ cash: [...base(), L('now1', 'out', 'Internet', 60000, '2026-10-08'), L('now2', 'in', 'Paiement client', 70000, '2026-10-09')] as any }));
let a = find(r, 'finance:expense-spike:internet');
ok(!!a && a.severity === 'watch' && /60 000 Ar/.test(a.why_fr) && /20 323 Ar/.test(a.why_fr) && /6 mois/.test(a.why_fr), 'dépense en hausse : 60 000 contre 20 323 au prorata, médiane de 6 mois, phrase avec les deux chiffres');
ok(a!.title_en === '"Internet" expenses well above normal' && /usually/.test(a!.why_en) && !/médiane|contre/.test(a!.why_en), 'dépense en hausse : anglais propre');
r = run(ctx({ cash: [...base(), L('now1', 'out', 'Internet', 100000, '2026-10-08')] as any }));
ok(find(r, 'finance:expense-spike:internet')?.severity === 'urgent', 'dépense en hausse : plus de 4 × = urgent');
r = run(ctx({ cash: [...base(), L('now1', 'out', 'Internet', 35000, '2026-10-08')] as any }));
ok(!find(r, 'finance:expense-spike:internet'), 'dépense : 35 000 (1,7 × le prorata) = normal');
r = run(ctx({ cash: [...base(['2026-04', '2026-05', '2026-06', '2026-07']), L('now1', 'out', 'Internet', 90000, '2026-10-08')] as any }));
ok(!find(r, 'finance:expense-spike:internet'), 'dépense : seulement 2 mois d\'historique = pas assez de données');
r = run(ctx({ today: '2026-10-05', now: Date.parse('2026-10-05T11:00:00+03:00'), cash: [...base(), L('now1', 'out', 'Internet', 90000, '2026-10-03')] as any }));
ok(!find(r, 'finance:expense-spike:internet'), 'dépense : avant le 7 du mois = trop tôt pour comparer');
r = run(ctx({ cash: [...base(), L('now1', 'out', 'Internet', 9000000, '2026-10-30')] as any }));
ok(!find(r, 'finance:expense-spike:internet'), 'dépense : ligne future ignorée');
r = run(ctx({ cash: [...base(), L('x', 'out', 'Nouveauté', 90000, '2026-10-08')] as any }));
ok(!find(r, 'finance:expense-spike:nouveaute'), 'dépense : catégorie sans historique (médiane 0) = on ne juge pas');
// Mois sans aucune ligne = pas une période
r = run(ctx({ cash: [...base(['2026-05', '2026-06']), L('now1', 'out', 'Internet', 60000, '2026-10-08')] as any }));
ok(!!find(r, 'finance:expense-spike:internet'), 'dépense : 4 mois avec données (2 mois vides ignorés) = on juge, médiane de 4 mois');

// Argent reçu en baisse : prorata 0,677 → normal 67 742 ; ce mois 20 000
r = run(ctx({ cash: [...base(), L('now', 'in', 'Paiement client', 20000, '2026-10-05')] as any }));
a = find(r, 'finance:income-drop');
ok(!!a && a.severity === 'watch' && /20 000 Ar/.test(a.why_fr) && /67 742 Ar/.test(a.why_fr), 'argent reçu : 20 000 contre 67 742 = en baisse');
r = run(ctx({ cash: [...base(), L('now', 'out', 'Achats', 1000, '2026-10-05')] as any }));
ok(find(r, 'finance:income-drop')?.severity === 'urgent', 'argent reçu : rien du tout ce mois-ci = urgent');
r = run(ctx({ cash: [...base(), L('now', 'in', 'Paiement client', 40000, '2026-10-05')] as any }));
ok(!find(r, 'finance:income-drop'), 'argent reçu : 40 000 (59 % du prorata) = normal');
r = run(ctx({ today: '2026-10-09', now: Date.parse('2026-10-09T11:00:00+03:00'), cash: base() as any }));
ok(!find(r, 'finance:income-drop'), 'argent reçu : avant le 10 du mois = trop tôt');

// Marge : base = (100 000 − 50 000)/100 000 = 50 % ; septembre à 20 % (reçu 100 000, dépensé 80 000)
const dropMargin = (spent: number) => [...base(['2026-09']), L('i9', 'in', 'Paiement client', 100000, '2026-09-10'), L('o9', 'out', 'Achats', spent, '2026-09-12')];
r = run(ctx({ cash: dropMargin(80000) as any }));
a = find(r, 'finance:margin-drop');
ok(!!a && a.severity === 'watch' && /20 %/.test(a.why_fr) && /50 %/.test(a.why_fr), 'marge : 20 % contre 50 % = en baisse');
ok(find(run(ctx({ cash: dropMargin(120000) as any })), 'finance:margin-drop')?.severity === 'urgent', 'marge : négative = urgent');
ok(!find(run(ctx({ cash: dropMargin(40000) as any })), 'finance:margin-drop'), 'marge : 60 % (en hausse) = rien');
ok(!!find(run(ctx({ cash: dropMargin(66000) as any })), 'finance:margin-drop'), 'marge : 16 points d\'écart = alerte');
ok(!!find(run(ctx({ cash: dropMargin(65000) as any })), 'finance:margin-drop'), 'marge : 15 points pile = alerte');
ok(!find(run(ctx({ cash: dropMargin(64000) as any })), 'finance:margin-drop'), 'marge : 14 points = rien');
ok(!find(run(ctx({ cash: [L('i', 'in', 'x', 100, '2026-09-10'), L('o', 'out', 'x', 99, '2026-09-10')] as any })), 'finance:margin-drop'), 'marge : un seul mois = pas assez de données');

// Valeur du stock
const prod = [{ id: 'p', name: 'Papier', buy_price_ar: 1000, sell_price_ar: 1500, alert_threshold: 0, category: '', unit: 'u' }] as any;
const mv = (id: string, type: string, qty: number, date: string) => ({ id, product_id: 'p', type, qty, date, note: '' });
const stockHist = [mv('a', 'in', 100, '2026-03-05')];
r = run(ctx({ products: prod, moves: [...stockHist, mv('b', 'out', 80, '2026-10-02')] as any }));
a = find(r, 'stock:value-drop');
ok(!!a && /20 000 Ar/.test(a.why_fr) && /100 000 Ar/.test(a.why_fr), 'stock : 20 000 contre 100 000 = chute');
ok(!find(run(ctx({ products: prod, moves: [...stockHist, mv('b', 'out', 30, '2026-10-02')] as any })), 'stock:value-drop'), 'stock : -30 % = rien (seuil 50 %)');
ok(!find(run(ctx({ products: prod, moves: [mv('a', 'in', 100, '2026-09-05'), mv('b', 'out', 90, '2026-10-02')] as any })), 'stock:value-drop'), 'stock : produit récent (peu de mois) = pas assez de données');
ok(!find(run(ctx({ products: [], moves: [] })), 'stock:value-drop'), 'stock : aucun produit = rien');

// Volume d'un salarié par semaine
const U = [{ id: 'u1', name: 'Camille', role: 'employee', status: 'active' }] as any;
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
let pid = 0;
const week = (k: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: `w${pid++}`, employee_id: 'u1', employee_name: 'Camille', client_name: 'x', status: 'completed', date: day(1 + k * 7 + (i % 7)), start_time: '08:05:00' }));
const weeks = (cur: number, past = 10) => [...week(0, cur), ...[1, 2, 3, 4, 5, 6].flatMap(k => week(k, past))];
r = run(ctx({ users: U, posts: weeks(2) as any }));
a = find(r, 'team:volume-drop:u1');
ok(!!a && a.severity === 'watch' && /2 missions/.test(a.why_fr) && /10 en général/.test(a.why_fr), 'volume : 2 missions contre 10 par semaine = chute');
r = run(ctx({ users: U, posts: weeks(25) as any }));
ok(find(r, 'team:volume-jump:u1')?.severity === 'info', 'volume : 25 contre 10 = bond (information)');
ok(!find(run(ctx({ users: U, posts: weeks(7) as any })), 'team:volume-drop:u1'), 'volume : 7 contre 10 = normal');
ok(!!find(run(ctx({ users: U, posts: weeks(5) as any })), 'team:volume-drop:u1'), 'volume : 5 contre 10 (moitié pile) = chute');
ok(!find(run(ctx({ users: U, posts: [...week(0, 1), ...[1, 2].flatMap(k => week(k, 3))] as any })), 'team:volume-drop:u1'), 'volume : 2 semaines d\'historique seulement = pas assez de données');
ok(!find(run(ctx({ users: U, posts: [...week(0, 20), ...week(1, 1)] as any })), 'team:volume-jump:u1'), 'volume : nouveau salarié (semaines d\'avant sans lui) = on ne juge pas');
ok(!find(run(ctx({ users: [{ ...U[0], status: 'inactive' }] as any, posts: weeks(0) as any })), 'team:volume-drop:u1'), 'volume : compte désactivé = rien');
ok(!find(run(ctx({ users: U, posts: weeks(0, 2) as any })), 'team:volume-drop:u1'), 'volume : médiane trop petite (2 / semaine) = écart minimum de 3 non atteint');

// Ensemble
const big = ctx({ users: U, posts: weeks(2) as any, cash: [...base(), L('now1', 'out', 'Internet', 60000, '2026-10-08'), L('now', 'in', 'Paiement client', 20000, '2026-10-05')] as any, products: prod, moves: [...stockHist, mv('b', 'out', 80, '2026-10-02')] as any });
const b1 = run(big), b2 = run({ ...big, cash: [...(big.cash as any)].reverse(), posts: [...(big.posts as any)].reverse() });
ok(!b1.errors.length && b1.alerts.length >= 4 && b1.alerts.every(x => alertProblem(x) === null), `ensemble : ${b1.alerts.length} alertes valides, aucune erreur`);
ok(eq(b1.alerts.map(x => x.id), b2.alerts.map(x => x.id)), 'ensemble : ordre des données sans effet');
b1.alerts.filter(x => /[À-ÖØ-ÿ]/.test(x.title_en + x.why_en + (x.todo_en || ''))).forEach(x => console.log('  FR dans EN :', x.title_en, '|', x.why_en));
ok(b1.alerts.every(x => !/[À-ÖØ-ÿ]/.test(x.title_en + x.why_en + (x.todo_en || '')) || /Camille|Internet|Papier/.test(x.title_en + x.why_en)), 'ensemble : anglais propre');
const frozen = JSON.stringify(big); run(big); ok(JSON.stringify(big) === frozen, 'ensemble : aucune donnée modifiée');

// Démo
const demo = buildDemoData(), t0 = Date.now(), realToday = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const d = runHealth(ctx({ today: realToday, now: Date.now(), users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock, advances: demo.advances } as any), STATS_RULES);
ok(!d.errors.length && d.alerts.every(x => alertProblem(x) === null), `démo : ${d.alerts.length} alertes valides, aucune erreur`);
ok(Date.now() - t0 < 800, 'démo : calcul rapide');
console.log('   alertes de la démo :', d.alerts.map(x => `${x.severity}:${x.id}`).join(' | ') || '(aucune)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
