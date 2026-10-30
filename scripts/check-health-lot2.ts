// Contrôle des règles du lot 2 du module 11 (Finances, Clients, Stock). Pur, sans réseau. Lancer : npm run check:health-lot2
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, healthThresholds, type HealthAlert } from '../src/utils/health/types';
import { LOT2_RULES } from '../src/utils/health/rules/lot2';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({
  today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over,
} as HealthContext);
const run = (c: HealthContext) => runHealth(c, LOT2_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const L = (id: string, kind: 'in' | 'out', category: string, amount: number, date: string, extra: any = {}) => ({ id, kind, category, amount_ar: amount, date, note: '', ...extra });

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
ok(healthThresholds({ watch: { dormant_days: 5000, others_pct: 0, strategic_silent_days: 10 } } as any).dormant_days === 90 && healthThresholds({ watch: { strategic_silent_days: 10 } } as any).strategic_silent_days === 10, 'seuils : valeur absurde ignorée, valeur correcte prise');

// ---------- Finances ----------
let r = run(ctx({ cash: [L('a', 'in', 'Paiement client', 1000, day(5), { client_name: 'X' }), L('b', 'out', 'Loyer', 5000, day(4)), L('c', 'out', 'Internet', 500, day(3))] as any }));
let a = find(r, 'finance:cash-negative');
ok(!!a && a.severity === 'urgent' && a.value === 4500 && /-4 500 Ar/.test(a.why_fr), 'caisse négative : -4 500 Ar, urgent');
ok(a!.title_en === 'The cash balance is negative' && !/Entrées|moins/.test(a!.why_en), 'caisse négative : anglais propre');
ok(!find(run(ctx({ cash: [L('a', 'in', 'Paiement client', 9000, day(5), { client_name: 'X' }), L('b', 'out', 'Loyer', 5000, day(4)), L('c', 'out', 'Internet', 500, day(3))] as any })), 'finance:cash-negative'), 'caisse positive : rien');
ok(!find(run(ctx({ cash: [L('b', 'out', 'Loyer', 5000, day(4)), L('c', 'out', 'Internet', 500, day(3))] as any })), 'finance:cash-negative'), 'caisse : moins de 3 lignes = pas assez de données');
ok(!find(run(ctx({ cash: [L('a', 'in', 'Autre entrée', 1000, day(5)), L('b', 'out', 'Loyer', 5000, day(4)), L('c', 'out', 'Internet', 500, day(-9))] as any })), 'finance:cash-negative'), 'caisse : une ligne future n\'entre pas dans le solde (2 lignes valides = trop peu)');
r = run(ctx({ cash: [L('a', 'out', 'Loyer', 100, day(-3)), L('b', 'out', 'Loyer', 100, day(-9)), L('c', 'out', 'Loyer', 100, day(1))] as any }));
a = find(r, 'finance:future-lines');
ok(!!a && a.value === 2 && a.since === day(-9 + 6) || !!a && a.value === 2, 'dates futures : 2 lignes comptées');
ok(!find(run(ctx({ cash: [L('a', 'out', 'Loyer', 100, TODAY)] as any })), 'finance:future-lines'), 'dates futures : aujourd\'hui n\'est pas le futur');
ok(!find(run(ctx({ cash: [L('a', 'out', 'Loyer', 100, 'bientôt'), L('b', 'out', 'Loyer', NaN, day(1))] as any })), 'finance:future-lines'), 'dates futures : date illisible = ignorée, pas de plantage');
r = run(ctx({ cash: [L('a', 'in', 'Paiement client', 5000, day(3)), L('b', 'in', 'Paiement client', 2000, day(4), { client_name: '  ' }), L('c', 'in', 'Paiement client', 1000, day(5), { client_name: 'X' }), L('d', 'in', 'Autre entrée', 700, day(5)), L('e', 'in', 'Paiement client', 900, day(200))] as any }));
a = find(r, 'finance:payment-no-client');
ok(!!a && a.value === 2 && a.severity === 'info' && /7 000 Ar/.test(a.why_fr), 'paiement sans client : 2 lignes (nom vide ou espaces), 7 000 Ar ; autre entrée et vieille ligne ignorées');
r = run(ctx({ cash: [L('a', 'out', 'Achats', 4000, day(3), { note: 'x' }), L('b', 'out', 'Achats', 4000, day(3))] as any }));
ok(find(r, 'finance:duplicates')?.value === 1, 'doublon : même montant, date, catégorie = 1 doublon probable');
ok(!find(run(ctx({ cash: [L('a', 'out', 'Achats', 4000, day(3)), L('b', 'out', 'Achats', 4000, day(4))] as any })), 'finance:duplicates'), 'doublon : dates différentes = non');
ok(!find(run(ctx({ cash: [L('a', 'out', 'Achats', 4000, day(3)), L('b', 'in', 'Achats', 4000, day(3))] as any })), 'finance:duplicates'), 'doublon : entrée et sortie = non');
ok(!find(run(ctx({ cash: [L('a', 'out', 'Achats', 4000, day(120)), L('b', 'out', 'Achats', 4000, day(120))] as any })), 'finance:duplicates'), 'doublon : plus de 90 jours = oublié');
ok(find(run(ctx({ cash: [L('a', 'in', 'Paiement client', 4000, day(3), { client_name: 'Rivage' }), L('b', 'in', 'Paiement client', 4000, day(3), { client_name: ' rivage ' })] as any })), 'finance:duplicates')?.value === 1, 'doublon : nom de client comparé sans casse ni espaces');
const oth = (o: number, t: number, lines = 6) => [L('o', 'out', 'Autres', o, day(2)), ...Array.from({ length: lines - 1 }, (_, i) => L(`k${i}`, 'out', 'Loyer', t / (lines - 1), day(3 + i)))];
r = run(ctx({ cash: oth(4000, 6000) as any }));
a = find(r, 'finance:others-big');
ok(!!a && a.value === 40 && a.severity === 'info', '« Autres » : 40 % pile = info');
ok(!find(run(ctx({ cash: oth(3900, 6100) as any })), 'finance:others-big'), '« Autres » : 39 % = rien');
ok(!find(run(ctx({ cash: oth(4000, 6000, 4) as any })), 'finance:others-big'), '« Autres » : moins de 5 lignes = pas assez de données');

// ---------- Clients ----------
const cl = (id: string, name: string, extra: any = {}) => ({ id, name, ...extra });
const mission = (i: string, cid: string, back: number, price = 10000) => ({ id: i, employee_id: 'u', status: 'completed', date: day(back), client_id: cid, client_price_ar: price, post_number: 1, client_name: 'x' });
// 6 missions chez A (gros), aucune récente → stratégique et silencieux
const aPosts = [35, 50, 70, 90, 110, 130].map((b, i) => mission(`a${i}`, 'ka', b));
const clients = [cl('ka', 'Atelier Rivage', { price_default_ar: 10000 }), cl('kb', 'Petit Client', { price_default_ar: 100 })];
r = run(ctx({ clients: clients as any, posts: [...aPosts, mission('b1', 'kb', 3, 100)] as any }));
a = find(r, 'clients:strategic-silent:ka');
ok(!!a && a.severity === 'watch' && a.value === 35 && /35 jours/.test(a.why_fr), 'stratégique silencieux : 35 jours = à voir');
ok(a!.title_en === 'Silent strategic client: Atelier Rivage', 'stratégique silencieux : anglais');
r = run(ctx({ clients: clients as any, posts: [...[75, 90, 100, 110, 120, 130].map((b, i) => mission(`a${i}`, 'ka', b)), mission('b1', 'kb', 3, 100)] as any }));
ok(find(r, 'clients:strategic-silent:ka')?.severity === 'urgent', 'stratégique silencieux : 75 jours (2 × seuil) = urgent');
r = run(ctx({ clients: clients as any, posts: [...[10, 50, 70, 90, 110, 130].map((b, i) => mission(`a${i}`, 'ka', b)), mission('b1', 'kb', 3, 100)] as any }));
ok(!find(r, 'clients:strategic-silent:ka'), 'stratégique silencieux : mission il y a 10 jours = rien');
r = run(ctx({ clients: [{ ...clients[0], active: false }, clients[1]] as any, posts: [...aPosts, mission('b1', 'kb', 3, 100)] as any }));
ok(!find(r, 'clients:strategic-silent:ka'), 'stratégique silencieux : client archivé = rien');
ok(!find(run(ctx({ clients: [], posts: aPosts as any })), 'clients:strategic-silent:ka'), 'stratégique silencieux : aucune fiche = rien');
r = run(ctx({ clients: [cl('k1', 'Sans Prix'), cl('k2', 'Avec Prix', { price_default_ar: 5 }), cl('k3', 'Sans Mission')] as any, posts: [mission('m1', 'k1', 3), mission('m2', 'k2', 3)] as any }));
a = find(r, 'clients:no-price');
ok(!!a && a.value === 1 && /Sans Prix/.test(a.why_fr) && !/Sans Mission|Avec Prix/.test(a.why_fr), 'sans prix : seulement le client qui travaille sans tarif propre');
r = run(ctx({ clients: [cl('k1', 'Atelier Rivage'), cl('k2', 'Atelier Rivages'), cl('k3', 'Atelier Delta'), cl('k4', 'Sol'), cl('k5', 'Sols')] as any }));
a = find(r, 'clients:similar-names');
ok(!!a && a.value === 1, 'noms proches : « Rivage / Rivages » oui, « Delta » non, noms trop courts (< 5 lettres) non');
ok(find(run(ctx({ clients: [cl('k1', 'Café Léa'), cl('k2', 'CAFE LEA')] as any })), 'clients:similar-names')?.value === 1, 'noms proches : accents et majuscules ignorés');
ok(!find(run(ctx({ clients: [cl('k1', 'Atelier Rivage'), cl('k2', 'Atelier Delta')] as any })), 'clients:similar-names'), 'noms proches : deux noms différents = rien');

// ---------- Stock ----------
const prod = (id: string, name: string, extra: any = {}) => ({ id, name, category: '', unit: 'unité', buy_price_ar: 100, sell_price_ar: 150, alert_threshold: 0, created_at: `${day(200)}T00:00:00Z`, ...extra });
const mv = (id: string, pid: string, type: string, qty: number, back: number, extra: any = {}) => ({ id, product_id: pid, type, qty, date: day(back), note: '', ...extra });
r = run(ctx({ products: [prod('p1', 'Papier')] as any, moves: [mv('m1', 'p1', 'in', 5, 3), mv('m2', 'p1', 'out', 8, 2)] as any }));
a = find(r, 'stock:negative');
ok(!!a && a.severity === 'urgent' && /Papier \(-3\)/.test(a.why_fr), 'quantité négative : -3, urgent');
r = run(ctx({ products: [prod('p1', 'Encre'), prod('p2', 'Jamais reçu')] as any, moves: [mv('m1', 'p1', 'in', 5, 3), mv('m2', 'p1', 'out', 5, 2)] as any }));
a = find(r, 'stock:empty');
ok(!!a && a.value === 1 && /Encre/.test(a.why_fr) && !/Jamais/.test(a.why_fr), 'rupture : produit passé à 0 oui, produit jamais approvisionné sans seuil non');
ok(find(run(ctx({ products: [prod('p2', 'Seuil', { alert_threshold: 2 })] as any })), 'stock:empty')?.value === 1, 'rupture : produit à 0 avec seuil d\'alerte = rupture');
r = run(ctx({ products: [prod('p1', 'Cartouche', { alert_threshold: 5 }), prod('p2', 'Stylo', { alert_threshold: 5 })] as any, moves: [mv('m1', 'p1', 'in', 5, 3), mv('m2', 'p2', 'in', 6, 3)] as any }));
a = find(r, 'stock:low');
ok(!!a && a.value === 1 && a.severity === 'watch' && /Cartouche \(5 unité, seuil 5\)/.test(a.why_fr), 'sous le seuil : 5 pour seuil 5 = bas ; 6 = non');
ok(!find(r, 'stock:empty') && !find(r, 'stock:negative'), 'sous le seuil : pas de fausse rupture');
r = run(ctx({ products: [prod('p1', 'Dormeur'), prod('p2', 'Vif'), prod('p3', 'Vide')] as any, moves: [mv('m1', 'p1', 'in', 10, 90), mv('m2', 'p2', 'in', 10, 89), mv('m3', 'p3', 'in', 1, 120), mv('m4', 'p3', 'out', 1, 100)] as any }));
a = find(r, 'stock:dormant');
ok(!!a && a.value === 1 && /Dormeur/.test(a.why_fr) && /1 000 Ar/.test(a.why_fr), 'dormant : 90 jours pile = dormant (1 000 Ar immobilisés), 89 non, produit vide non');
ok(!find(run(ctx({ products: [prod('p1', 'Neuf', { created_at: `${day(10)}T00:00:00Z` })] as any, moves: [] })), 'stock:dormant'), 'dormant : produit sans mouvement mais récent = non');
r = run(ctx({ products: [prod('p1', 'Papier')] as any, cash: [L('c1', 'out', 'Achats', 3000, day(5)), L('c2', 'out', 'Achats', 2000, day(6)), L('c3', 'out', 'Loyer', 2000, day(6)), L('c4', 'out', 'Achats', 1000, day(60))] as any, moves: [mv('m1', 'p1', 'in', 5, 5, { cash_id: 'c2' })] as any }));
a = find(r, 'stock:purchase-no-move');
ok(!!a && a.value === 1, 'achat sans entrée : 1 seul (lié, loyer et vieux achat exclus)');
ok(!find(run(ctx({ cash: [L('c1', 'out', 'Achats', 3000, day(5))] as any })), 'stock:purchase-no-move'), 'achat sans entrée : aucun produit suivi = on ne dit rien');

// ---------- Ensemble ----------
const big = ctx({ clients: clients as any, posts: [...aPosts, mission('b1', 'kb', 3, 100)] as any, products: [prod('p1', 'Papier', { alert_threshold: 3 })] as any, moves: [mv('m1', 'p1', 'in', 5, 3), mv('m2', 'p1', 'out', 8, 2)] as any,
  cash: [L('a', 'in', 'Paiement client', 1000, day(5)), L('b', 'out', 'Loyer', 5000, day(4)), L('c', 'out', 'Autres', 500, day(3)), L('d', 'out', 'Autres', 500, day(3)), L('e', 'out', 'Achats', 100, day(-2))] as any });
const b1 = run(big), b2 = run({ ...big, cash: [...(big.cash as any)].reverse(), moves: [...(big.moves as any)].reverse() });
ok(b1.errors.length === 0 && b1.alerts.length >= 5, `ensemble : ${b1.alerts.length} alertes, aucune erreur`);
ok(b1.alerts.every(x => alertProblem(x) === null), 'ensemble : format commun respecté');
ok(JSON.stringify(b1.alerts.map(x => x.id)) === JSON.stringify(b2.alerts.map(x => x.id)), 'ensemble : même résultat quel que soit l\'ordre des données');
ok(b1.alerts.every(x => !/[À-ÿ]/.test(x.title_en + x.why_en + (x.todo_en || '')) || /Rivage|Papier/.test(x.title_en + x.why_en)), 'ensemble : pas d\'accent français dans l\'anglais (hors noms)');
const frozen = JSON.stringify(big); run(big); ok(JSON.stringify(big) === frozen, 'ensemble : aucune donnée modifiée');
ok(b1.alerts.every(x => x.go.view === 'clients' || x.go.view === 'storage' || (x.go.view === 'stats' && x.go.tab === 'finance')), 'ensemble : chaque alerte mène à une vraie page');

// ---------- Démo ----------
const demo = buildDemoData();
const t0 = Date.now();
const realToday = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const d = runHealth(ctx({ today: realToday, now: Date.now(), users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock } as any), LOT2_RULES);
const ms = Date.now() - t0;
ok(d.errors.length === 0 && d.alerts.every(x => alertProblem(x) === null), `démo : ${d.alerts.length} alertes valides, aucune erreur`);
ok(ms < 800, `démo : calculé en ${ms} ms`);
console.log('   alertes de la démo :', d.alerts.map(x => `${x.severity}:${x.id}`).join(' | ') || '(aucune)');
ok(d.alerts.every(x => !/demo_|undefined|NaN/.test(x.title_fr + x.why_fr)), 'démo : textes lisibles');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
