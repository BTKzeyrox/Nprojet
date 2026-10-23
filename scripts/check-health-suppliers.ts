// Contrôle des règles Achats / Fournisseurs du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-suppliers
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { SUPPLIER_RULES } from '../src/utils/health/rules/suppliers';
import { ADVICE } from '../src/utils/advice';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over } as HealthContext);
const run = (c: HealthContext) => runHealth(c, SUPPLIER_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const PO = (ref: string, status: string, expected?: string) => ({ id: ref, ref, supplier_id: 's1', date: day(30), expected_date: expected, status, lines: [{ product_id: 'p', qty: 1, unit_cost_ar: 100, received_qty: 0 }], note: '' });
const OUT = (id: string, cat: string, amount: number, date: string) => ({ id, kind: 'out', category: cat, amount_ar: amount, date, note: '' });

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
ok(run(ctx({ purchases: null })).alerts.length === 0, 'bons non chargés : les règles se taisent');

let r = run(ctx({ purchases: [PO('BC-1', 'ordered', day(3)), PO('BC-2', 'ordered', day(1))] as any }));
let a = find(r, 'suppliers:po-late');
ok(!!a && a.severity === 'watch' && a.value === 2 && /BC-1/.test(a.why_fr) && a.since === day(3) && a.go.view === 'purchasing', 'bons en retard : 2 bons, à voir, depuis la plus vieille date');
ok(find(run(ctx({ purchases: [PO('BC-1', 'ordered', day(8))] as any })), 'suppliers:po-late')?.severity === 'urgent', 'bon en retard de plus de 7 jours : urgent');
ok(!find(run(ctx({ purchases: [PO('A', 'ordered', day(0)), PO('B', 'ordered', day(-2)), PO('C', 'ordered'), PO('D', 'draft', day(5)), PO('E', 'received', day(5)), PO('F', 'cancelled', day(5))] as any })), 'suppliers:po-late'), 'pas en retard : prévu aujourd\'hui ou plus tard, sans date, brouillon, reçu ou annulé');
ok(a!.title_en === '2 purchase orders late' && !/jour|Appeler/.test(a!.why_en + a!.todo_en), 'bons en retard : anglais propre');
ok(find(run(ctx({ purchases: [PO('BC-9', 'ordered', day(2))] as any })), 'suppliers:po-late')!.title_fr === '1 bon de commande en retard', 'bons en retard : singulier correct');

const month = TODAY.slice(0, 7);
r = run(ctx({ settings: { budgets: { Loyer: 1000, Internet: 5000 } } as any, cash: [OUT('a', 'Loyer', 1500, `${month}-05`), OUT('b', 'Internet', 4500, `${month}-06`)] as any }));
a = find(r, 'suppliers:budget-over');
ok(!!a && a.severity === 'watch' && a.value === 150 && /Loyer \(150 %\)/.test(a.why_fr) && !/Internet/.test(a.why_fr) && a.go.view === 'stats', 'budget dépassé : seule la catégorie au-dessus du plafond est citée');
ok(!find(run(ctx({ settings: { budgets: { Loyer: 1000 } } as any, cash: [OUT('a', 'Loyer', 1000, `${month}-05`)] as any })), 'suppliers:budget-over'), 'budget : exactement au plafond = pas dépassé');
ok(!find(run(ctx({ settings: { budgets: { Loyer: 1000 } } as any, cash: [OUT('a', 'Loyer', 9000, '2026-09-05')] as any })), 'suppliers:budget-over'), 'budget : dépense du mois dernier ignorée');
ok(!find(run(ctx({ settings: {} as any, cash: [OUT('a', 'Loyer', 9000, `${month}-05`)] as any })), 'suppliers:budget-over'), 'budget : sans plafond défini, aucune alerte');

const all = run(ctx({ purchases: [PO('BC-1', 'ordered', day(8))] as any, settings: { budgets: { Loyer: 1 } } as any, cash: [OUT('a', 'Loyer', 5, `${month}-05`)] as any }));
ok(all.alerts.length === 2 && all.alerts.every(x => alertProblem(x) === null), 'format commun respecté par toutes les alertes');
ok(!!ADVICE['po-late'] && !!ADVICE['budget-over'], 'chaque règle a sa solution dans l\'assistant');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
