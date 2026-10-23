// Contrôle des règles Factures du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-invoices
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { INVOICE_RULES } from '../src/utils/health/rules/invoices';
import { ADVICE } from '../src/utils/advice';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over } as HealthContext);
const run = (c: HealthContext) => runHealth(c, INVOICE_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const INV = (id: string, status: string, due: string, total = 1000, extra: any = {}) => ({ id, status, client_id: 'c1', client: {}, issue_date: day(40), due_date: due, lines: [], subtotal_ar: total, tax_rate: 0, tax_ar: 0, total_ar: total, ...extra });
const PAY = (invoice_id: string, amount: number) => ({ id: 'p' + invoice_id, kind: 'in', category: 'Paiement client', amount_ar: amount, date: day(1), note: '', invoice_id });

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
ok(run(ctx({ invoices: null })).alerts.length === 0, 'factures non chargées : les règles se taisent');

let r = run(ctx({ invoices: [INV('a', 'issued', day(5), 1000), INV('b', 'issued', day(2), 3000)] as any, cash: [PAY('b', 1000)] as any }));
let a = find(r, 'invoices:overdue');
ok(!!a && a.severity === 'watch' && a.value === 3000 && /3 000 Ar/.test(a.why_fr) && /5 jour/.test(a.why_fr) && a.since === day(5) && a.go.view === 'invoices', 'en retard : reste à encaisser (paiement partiel déduit), à voir');
ok(find(run(ctx({ invoices: [INV('a', 'issued', day(31))] as any })), 'invoices:overdue')?.severity === 'urgent', 'plus de 30 jours de retard : urgent');
ok(!find(run(ctx({ invoices: [INV('a', 'issued', day(0)), INV('b', 'issued', day(-3)), INV('c', 'draft', day(9)), INV('d', 'cancelled', day(9)), INV('e', 'issued', day(9), 1000, { type: 'credit_note' }), INV('f', 'issued', day(9), 1000)] as any, cash: [PAY('f', 1000)] as any })), 'invoices:overdue'), 'pas en retard : échéance aujourd\'hui ou plus tard, brouillon, annulée, avoir, entièrement payée');
ok(find(run(ctx({ invoices: [INV('a', 'issued', day(3))] as any })), 'invoices:overdue')!.title_fr === '1 facture en retard de paiement', 'singulier correct');
ok(/Left to collect/.test(a!.why_en) && !/jour|Relancer/.test(a!.why_en + a!.todo_en), 'anglais propre');

a = find(run(ctx({ invoices: [INV('a', 'draft', day(5), 1000, { issue_date: day(20) }), INV('b', 'draft', day(5), 1000, { issue_date: day(14) }), INV('c', 'issued', day(5), 1000, { issue_date: day(40) })] as any })), 'invoices:draft-old');
ok(!!a && a.severity === 'info' && a.value === 1 && a.since === day(20), 'brouillon oublié : seulement au-delà de 14 jours, info');

const all = run(ctx({ invoices: [INV('a', 'issued', day(40)), INV('b', 'draft', day(5), 1000, { issue_date: day(30) })] as any }));
ok(all.alerts.length === 2 && all.alerts.every(x => alertProblem(x) === null), 'format commun respecté par toutes les alertes');
ok(!!ADVICE['overdue'] && !!ADVICE['draft-old'], 'chaque règle a sa solution dans l\'assistant');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
