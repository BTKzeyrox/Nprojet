// Page « Direction » (module 8, M8.1) : UNE page de synthèse pour le responsable. Règle pure, sans écran ni serveur.
// AUCUN nouveau calcul : chaque chiffre vient d'une règle qui existe déjà (finances, factures, relances, stock, performance, Santé du site).
// Cette fonction ne fait que les rassembler, les limiter (top 3, top 5) et choisir quoi afficher quand une donnée manque.
// Contrôlé par `npm run check:direction` (chaque chiffre est comparé à celui de sa règle d'origine).
import type { CashEntry, ClientContract, Invoice, PostSession, Product, StockMove } from '../types';
import type { ClientRecord } from './clients';
import { computeFinance, type FinanceInput } from './financeStats';
import { invoiceFigures } from './invoiceStats';
import { toChase, type ChaseRow } from './receivables';
import { stockRows, type StockRow } from './stock';
import { periodRange, type StatsRange } from './stats';
import { incomeStatement, vatByMonth, type Entry } from './accounting';
import { budgetVsActual, cleanMonthlyPlan, type PlanMonth } from './budgetPlan';
import type { HealthAlert } from './health/types';

export interface DirectionInput {
  today: string; // AAAA-MM-JJ (Madagascar)
  cash: CashEntry[]; posts: PostSession[]; contracts: ClientContract[]; clients: ClientRecord[]; invoices: Invoice[];
  products: Product[]; moves: StockMove[];
  prices: FinanceInput['prices']; pricePerMission: number;
  ranking: { id: string; name: string; score: number | null; rank: number | null }[]; // sortie de `rankByScore` (module 3)
  alerts: HealthAlert[]; // alertes VISIBLES de la Santé du site, déjà triées (module 11)
  /** M8 (mise à jour) : écritures comptables (module 14), plan mensuel et budgets (module 15). Facultatifs : sans eux, les cartes correspondantes sont absentes. */
  entries?: Entry[]; monthlyPlan?: unknown; budgets?: Record<string, number>;
}

export interface DirectionSummary {
  month: StatsRange;
  /** « Chiffre d'affaires du mois » : factures émises ce mois ; s'il n'y en a aucune, valeur des missions validées (`estimated` = true). */
  revenue: { amount: number; estimated: boolean; invoices: number };
  money: { received: number; out: number; profit: number; marginPct: number | null; treasury: number };
  receivables: { total: number; clients: number; oldestDays: number; top: ChaseRow[]; unbilledTotal: number };
  topClients: { name: string; amount: number; id?: string }[];
  topEmployees: { id: string; name: string; score: number }[];
  stock: { count: number; empty: number; negative: number; low: number; rows: StockRow[] };
  alerts: { urgent: number; watch: number; info: number; top: HealthAlert[] };
  /** Résultat comptable et TVA à payer du mois (règles de la Comptabilité) ; `null` s'il n'y a aucune écriture. */
  accounting: { result: number; income: number; expense: number; vatDue: number; entries: number } | null;
  /** « Prévu contre réel » du mois en cours (règle du module 15) ; `null` si rien n'est prévu (ni plan mensuel, ni budget). */
  plan: PlanMonth | null;
}

export const DIRECTION_LIMITS = { clients: 5, employees: 3, stock: 5, alerts: 5, chase: 3 } as const;

/** Ordre « le plus grave d'abord » pour le stock : négatif, puis épuisé, puis sous le seuil (le moins de stock avant, nom pour un ordre stable). */
const stockOrder = (a: StockRow, b: StockRow): number =>
  Number(b.negative) - Number(a.negative) || Number(b.empty) - Number(a.empty) || a.qty - b.qty || a.product.name.localeCompare(b.product.name);

const cleanEntries = (list: unknown): Entry[] => (Array.isArray(list) ? list.filter((e): e is Entry => !!e && typeof (e as Entry).date === 'string' && Array.isArray((e as Entry).lines)) : []);

function accountingOf(entries: unknown, month: StatsRange): DirectionSummary['accounting'] {
  const list = cleanEntries(entries);
  if (!list.length) return null;
  const st = incomeStatement(list, month.start, month.end);
  return { result: st.result, income: st.totalIncome, expense: st.totalExpense, vatDue: vatByMonth(list, month.start, month.end).total.due, entries: list.length };
}

function planOf(i: DirectionInput, _month: StatsRange): DirectionSummary['plan'] {
  const cur = budgetVsActual({ cash: i.cash, posts: i.posts, contracts: i.contracts, prices: i.prices, pricePerMission: i.pricePerMission, clients: i.clients }, cleanMonthlyPlan(i.monthlyPlan), i.budgets, i.today, 1)[0];
  if (!cur || (cur.revenue.status === 'none' && cur.expenses.status === 'none' && cur.payroll.status === 'none')) return null;
  return cur;
}

export function directionSummary(i: DirectionInput): DirectionSummary {
  const month = periodRange('month', i.today);
  const fin = computeFinance({ cash: i.cash, posts: i.posts, contracts: i.contracts, prices: i.prices, pricePerMission: i.pricePerMission, clients: i.clients }, 'month', month);
  const inv = invoiceFigures({ invoices: i.invoices, cash: i.cash, posts: i.posts, contracts: i.contracts, clients: i.clients, prices: i.prices, today: i.today, range: { start: month.start, end: month.end } });
  const names: Record<string, string> = {};
  for (const c of i.clients) names[c.id] = c.name;
  const chase = toChase(i.invoices, i.cash, i.today, names);

  const critical = stockRows(i.products, i.moves).filter(r => r.low || r.negative).sort(stockOrder) // « critique » = voyant rouge du Stock (sous le seuil d'alerte) ou quantité négative ; un produit à 0 SANS seuil n'est pas suivi;
  const sev = (s: HealthAlert['severity']) => i.alerts.filter(a => a.severity === s).length;

  return {
    month,
    revenue: inv.issued_count > 0 ? { amount: inv.issued_total, estimated: false, invoices: inv.issued_count } : { amount: fin.billed, estimated: true, invoices: 0 },
    money: { received: fin.received, out: fin.totalOut, profit: fin.profit, marginPct: fin.marginPct, treasury: fin.treasury },
    receivables: { total: chase.reduce((t, r) => t + r.total, 0), clients: chase.length, oldestDays: chase.reduce((m, r) => Math.max(m, r.max_days), 0), top: chase.slice(0, DIRECTION_LIMITS.chase), unbilledTotal: inv.unbilled_total },
    topClients: fin.clients.slice(0, DIRECTION_LIMITS.clients),
    topEmployees: i.ranking.filter((r): r is { id: string; name: string; score: number; rank: number } => r.score !== null && r.rank !== null).slice(0, DIRECTION_LIMITS.employees).map(r => ({ id: r.id, name: r.name, score: r.score })),
    stock: { count: critical.length, empty: critical.filter(r => r.empty).length, negative: critical.filter(r => r.negative).length, low: critical.filter(r => r.low).length, rows: critical.slice(0, DIRECTION_LIMITS.stock) },
    alerts: { urgent: sev('urgent'), watch: sev('watch'), info: sev('info'), top: i.alerts.filter(a => a.severity !== 'info').slice(0, DIRECTION_LIMITS.alerts) },
    accounting: accountingOf(i.entries, month),
    plan: planOf(i, month),
  };
}
