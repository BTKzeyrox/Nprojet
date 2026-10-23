// Instantané du site et « Pourquoi ce chiffre ? » (module 11, M11.9). Pur : pas d'écran, pas de serveur. ADMIN SEULEMENT (chiffres d'argent).
//  - buildSnapshot : un résumé CALCULÉ de tous les modules (chiffres clés, comptages), sans noms de personnes ni lignes brutes.
//    C'est la seule chose qui pourra être donnée à une IA externe (niveau B, facultatif, désactivé par défaut) : jamais les données brutes.
//  - explainFigure : pour un chiffre, sa formule (carte du site), sa période, ses composantes, les lignes qui le forment, et ses sources.
import type { CashEntry, Client, ClientContract, PostSession, Product, SalaryAdvanceRequest, StockMove, User } from '../types';
import { computeFinance, type FinanceInput } from './financeStats';
import { periodRange } from './stats';
import { clientMissionsFromPosts, clientThresholds, summarizeClients, type ClientStatus } from './clients';
import { stockRows, stockValue } from './stock';
import { clientPriceForPost } from './clientPrice';
import { findPage } from './siteKnowledge';
import type { HealthAlert } from './health/types';

export interface SnapshotInput {
  today: string; settings: any;
  users: User[]; posts: PostSession[]; contracts: ClientContract[]; clients: Client[];
  cash: CashEntry[]; products: Product[]; moves: StockMove[]; advances: SalaryAdvanceRequest[];
  alerts?: HealthAlert[]; // alertes visibles de la Santé du site
}
export interface Snapshot {
  as_of: string; period: { start: string; end: string; label: string };
  missions: { validated: number; rejected: number; waiting: number; running: number };
  finance: { received: number; expenses: number; salaries: number; total_out: number; profit: number; margin_pct: number | null; billed: number; to_collect: number; treasury: number };
  clients: { total: number; archived: number; by_status: Partial<Record<ClientStatus, number>> };
  stock: { products: number; value: number; low: number; empty: number; negative: number };
  team: { employees: number; with_missions_in_period: number };
  payroll: { advances_pending: number; advances_pending_ar: number };
  health: { urgent: number; watch: number; info: number; by_page: Record<string, number>; by_rule: Record<string, number> };
}

const priceSettings = (s: any) => ({ client_price_default_ar: s?.client_price_default_ar, client_prices_by_type: s?.client_prices_by_type });
const finInput = (i: SnapshotInput): FinanceInput => ({ cash: i.cash, posts: i.posts, contracts: i.contracts, prices: priceSettings(i.settings), pricePerMission: Number(i.settings?.price_per_mission) || 0, clients: i.clients });
const range = (i: SnapshotInput, r?: { start: string; end: string }) => { const p = periodRange('month', i.today); return r ? { start: r.start, end: r.end, days: p.days } : p; };

export function buildSnapshot(i: SnapshotInput): Snapshot {
  const r = range(i), f = computeFinance(finInput(i), 'month', r);
  const inR = (d: string) => d >= r.start && d <= r.end;
  const month = i.posts.filter(p => inR(p.date));
  const missions = clientMissionsFromPosts(i.posts, i.contracts, i.clients as any, priceSettings(i.settings));
  const sums = summarizeClients(i.clients as any, missions, i.today, clientThresholds(i.settings?.company));
  const by: Partial<Record<ClientStatus, number>> = {};
  for (const s of sums.values()) by[s.main] = (by[s.main] || 0) + 1;
  const rows = stockRows(i.products, i.moves), alerts = i.alerts || [];
  const byPage: Record<string, number> = {}, byRuleAll: Record<string, number> = {};
  for (const a of alerts) { byPage[a.page] = (byPage[a.page] || 0) + 1; const k = String(a.rule).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40); byRuleAll[k] = (byRuleAll[k] || 0) + 1; }
  const byRule = Object.fromEntries(Object.entries(byRuleAll).sort((x, y) => y[1] - x[1]).slice(0, 15)); // règles qui sonnent (jamais de noms) : l'IA propose des solutions avec ça
  const pend = i.advances.filter(a => a.status === 'pending');
  return {
    as_of: i.today, period: { start: r.start, end: r.end, label: 'month' },
    missions: { validated: month.filter(p => p.status === 'completed').length, rejected: month.filter(p => p.status === 'rejected').length, waiting: i.posts.filter(p => p.status === 'pending_start' || p.status === 'pending_end').length, running: i.posts.filter(p => p.status === 'active').length },
    finance: { received: f.received, expenses: f.spent, salaries: f.salaries, total_out: f.totalOut, profit: f.profit, margin_pct: f.marginPct, billed: f.billed, to_collect: f.toCollect, treasury: f.treasury },
    clients: { total: i.clients.length, archived: i.clients.filter(c => c.active === false).length, by_status: by },
    stock: { products: i.products.length, value: stockValue(rows), low: rows.filter(x => x.low && !x.empty).length, empty: rows.filter(x => x.empty && !x.negative).length, negative: rows.filter(x => x.negative).length },
    team: { employees: i.users.filter(u => u.role === 'employee' && (u.status === undefined || u.status === 'active')).length, with_missions_in_period: new Set(month.filter(p => p.status === 'completed').map(p => p.employee_id)).size },
    payroll: { advances_pending: pend.length, advances_pending_ar: pend.reduce((t, a) => t + (Number.isFinite(a.amount_ar) ? a.amount_ar : 0), 0) },
    health: { urgent: alerts.filter(a => a.severity === 'urgent').length, watch: alerts.filter(a => a.severity === 'watch').length, info: alerts.filter(a => a.severity === 'info').length, by_page: byPage, by_rule: byRule },
  };
}

// ---------- « Pourquoi ce chiffre ? » ----------
export type FigureId = 'received' | 'expenses' | 'salaries' | 'profit' | 'margin' | 'billed' | 'toCollect' | 'treasury' | 'costPerMission' | 'gainPerMission' | 'stockValue' | 'missionsDone';
export const FIGURE_IDS: FigureId[] = ['received', 'expenses', 'salaries', 'profit', 'margin', 'billed', 'toCollect', 'treasury', 'costPerMission', 'gainPerMission', 'stockValue', 'missionsDone'];
export interface Bi { fr: string; en: string }
export interface ExplainPart { label: Bi; value: number | null; sign: '+' | '−' | '=' | '÷' | '×' }
export interface ExplainLine { label: string; value: number; date?: string }
export interface Explanation {
  id: FigureId; name: Bi; formula: Bi; unit: 'Ar' | '%' | 'count';
  period: { start: string; end: string } | null; // null = « depuis le début » ou « aujourd'hui »
  value: number | null; parts: ExplainPart[]; lines: ExplainLine[]; total_lines: number; sources: Bi; missing?: Bi;
}
const dmy = (d: string) => d.split('-').reverse().join('/');
const TOP = 10;
/** Carte du site : nom et formule d'un chiffre (page « stats » ou « advances »). */
const card = (name: string): { name: Bi; formula: Bi } => { const f = findPage('stats')?.figures.find(x => x.name.fr === name); return f ? { name: f.name, formula: f.formula } : { name: { fr: name, en: name }, formula: { fr: '', en: '' } }; };
const top = (xs: ExplainLine[]): ExplainLine[] => [...xs].sort((a, b) => b.value - a.value || (a.date || '').localeCompare(b.date || '') || a.label.localeCompare(b.label)).slice(0, TOP);

export function explainFigure(id: FigureId, i: SnapshotInput, r?: { start: string; end: string }): Explanation {
  const rg = range(i, r), fi = finInput(i), f = computeFinance(fi, 'month', rg);
  const inR = (d: string) => d >= rg.start && d <= rg.end;
  const cashIn = i.cash.filter(c => inR(c.date) && c.kind === 'in'), cashOut = i.cash.filter(c => inR(c.date) && c.kind === 'out');
  const done = i.posts.filter(p => p.status === 'completed' && inR(p.date));
  const period = { start: rg.start, end: rg.end };
  const salaryOf = (p: PostSession) => Math.max(0, Math.round(typeof p.calculated_ar === 'number' ? p.calculated_ar : fi.pricePerMission));
  const cashLines = (l: CashEntry[]): ExplainLine[] => l.map(c => ({ label: `${c.category}${c.client_name ? ` · ${c.client_name}` : ''}`, value: c.amount_ar, date: c.date }));
  const missionLines = (get: (p: PostSession) => number): ExplainLine[] => done.map(p => ({ label: `${p.client_name || '—'}${p.post_number !== undefined ? ` #${p.post_number}` : ''}`, value: get(p), date: p.date }));
  const src = (n: number, fr: string, en: string): Bi => ({ fr: `d'après ${n} ${fr} du ${dmy(rg.start)} au ${dmy(rg.end)}`, en: `based on ${n} ${en} from ${rg.start} to ${rg.end}` });
  const base = { period, lines: [] as ExplainLine[], total_lines: 0, parts: [] as ExplainPart[] };
  const P = (fr: string, en: string, value: number | null, sign: ExplainPart['sign']): ExplainPart => ({ label: { fr, en }, value, sign });

  switch (id) {
    case 'received': return { id, ...card('Encaissé'), unit: 'Ar', value: f.received, ...base, lines: top(cashLines(cashIn)), total_lines: cashIn.length, sources: src(cashIn.length, 'lignes d\'argent reçu', 'money-in lines') };
    case 'expenses': return { id, name: { fr: 'Dépenses', en: 'Expenses' }, formula: card('Dépenses').formula, unit: 'Ar', value: f.totalOut, ...base, parts: [P('Dépenses saisies', 'Recorded expenses', f.spent, '+'), P('Salaires (missions validées)', 'Salaries (validated missions)', f.salaries, '+'), P('Total', 'Total', f.totalOut, '=')], lines: top(cashLines(cashOut)), total_lines: cashOut.length, sources: src(cashOut.length, 'dépenses saisies', 'recorded expenses') };
    case 'salaries': return { id, name: { fr: 'Salaires', en: 'Salaries' }, formula: { fr: 'Somme des salaires des missions validées de la période (montant figé à la validation, sinon le prix par mission des Réglages). Les avances sont déjà dedans.', en: 'Sum of the salaries of the period\'s validated missions (amount frozen at validation, otherwise the price per mission from Settings). Advances are already inside.' }, unit: 'Ar', value: f.salaries, ...base, lines: top(missionLines(salaryOf)), total_lines: done.length, sources: src(done.length, 'missions validées', 'validated missions') };
    case 'billed': return { id, ...card('Facturé'), unit: 'Ar', value: f.billed, ...base, lines: top(missionLines(p => clientPriceForPost(p, i.contracts, fi.prices))), total_lines: done.length, sources: src(done.length, 'missions validées', 'validated missions'), ...(f.billed === 0 && done.length > 0 ? { missing: { fr: 'Le prix client vaut 0 : à régler (Réglages > Missions ou fiche client).', en: 'The client price is 0: to be set (Settings > Missions or client record).' } } : {}) };
    case 'toCollect': return { id, ...card('À encaisser'), unit: 'Ar', value: f.toCollect, ...base, parts: [P('Facturé', 'Billed', f.billed, '+'), P('Encaissé', 'Collected', f.received, '−'), P('À encaisser (jamais négatif)', 'To collect (never negative)', f.toCollect, '=')], sources: src(done.length + cashIn.length, 'missions validées et paiements', 'validated missions and payments') };
    case 'profit': return { id, ...card('Bénéfice'), unit: 'Ar', value: f.profit, ...base, parts: [P('Encaissé', 'Collected', f.received, '+'), P('Dépenses saisies', 'Recorded expenses', f.spent, '−'), P('Salaires', 'Salaries', f.salaries, '−'), P('Bénéfice', 'Profit', f.profit, '=')], sources: src(cashIn.length + cashOut.length + done.length, 'lignes d\'argent et missions validées', 'money lines and validated missions') };
    case 'margin': return { id, ...card('Marge'), unit: '%', value: f.marginPct, ...base, parts: [P('Bénéfice', 'Profit', f.profit, '+'), P('Encaissé', 'Collected', f.received, '÷'), P('Marge (%)', 'Margin (%)', f.marginPct, '=')], sources: src(cashIn.length + cashOut.length + done.length, 'lignes d\'argent et missions validées', 'money lines and validated missions'), ...(f.marginPct === null ? { missing: { fr: 'Aucun paiement reçu sur la période : la marge ne peut pas se calculer.', en: 'No payment received in the period: the margin cannot be computed.' } } : {}) };
    case 'treasury': return { id, name: { fr: 'Trésorerie', en: 'Cash on hand' }, formula: { fr: 'Tout l\'argent reçu − toutes les dépenses saisies − tous les salaires des missions validées, depuis le début.', en: 'All money received − all recorded expenses − all salaries of validated missions, since the start.' }, unit: 'Ar', value: f.treasury, period: null, lines: [], total_lines: 0,
      parts: [P('Argent reçu (total)', 'Money received (total)', i.cash.filter(c => c.kind === 'in').reduce((t, c) => t + c.amount_ar, 0), '+'), P('Dépenses saisies (total)', 'Recorded expenses (total)', i.cash.filter(c => c.kind === 'out').reduce((t, c) => t + c.amount_ar, 0), '−'), P('Salaires (total)', 'Salaries (total)', i.posts.filter(p => p.status === 'completed').reduce((t, p) => t + salaryOf(p), 0), '−'), P('Trésorerie', 'Cash on hand', f.treasury, '=')],
      sources: { fr: `d'après ${i.cash.length} lignes d'argent et ${i.posts.filter(p => p.status === 'completed').length} missions validées, depuis le début`, en: `based on ${i.cash.length} money lines and ${i.posts.filter(p => p.status === 'completed').length} validated missions, since the start` } };
    case 'costPerMission': return { id, name: { fr: 'Coût par mission', en: 'Cost per mission' }, formula: { fr: 'Dépenses de la période (saisies + salaires) ÷ missions validées de la période.', en: 'Period expenses (recorded + salaries) ÷ validated missions of the period.' }, unit: 'Ar', value: f.costPerMission, ...base, parts: [P('Dépenses', 'Expenses', f.totalOut, '+'), P('Missions validées', 'Validated missions', done.length, '÷'), P('Coût par mission', 'Cost per mission', f.costPerMission, '=')], sources: src(done.length, 'missions validées', 'validated missions'), ...(done.length === 0 ? { missing: { fr: 'Aucune mission validée sur la période.', en: 'No validated mission in the period.' } } : {}) };
    case 'gainPerMission': return { id, name: { fr: 'Gain par mission', en: 'Gain per mission' }, formula: { fr: 'Bénéfice de la période ÷ missions validées de la période.', en: 'Period profit ÷ validated missions of the period.' }, unit: 'Ar', value: f.gainPerMission, ...base, parts: [P('Bénéfice', 'Profit', f.profit, '+'), P('Missions validées', 'Validated missions', done.length, '÷'), P('Gain par mission', 'Gain per mission', f.gainPerMission, '=')], sources: src(done.length, 'missions validées', 'validated missions'), ...(done.length === 0 ? { missing: { fr: 'Aucune mission validée sur la période.', en: 'No validated mission in the period.' } } : {}) };
    case 'missionsDone': return { id, name: { fr: 'Missions validées', en: 'Validated missions' }, formula: { fr: 'Nombre de missions au statut « validée » dont la date est dans la période.', en: 'Number of missions with the "validated" status dated within the period.' }, unit: 'count', value: done.length, ...base, lines: top(missionLines(() => 1)), total_lines: done.length, sources: src(done.length, 'missions validées', 'validated missions') };
    case 'stockValue': {
      const rows = stockRows(i.products, i.moves);
      return { id, ...card('Valeur du stock'), unit: 'Ar', value: stockValue(rows), period: null, parts: [], lines: top(rows.map(x => ({ label: `${x.product.name} (${x.qty} × ${x.product.buy_price_ar} Ar)`, value: x.value }))), total_lines: rows.length, sources: { fr: `d'après ${rows.length} produits et ${i.moves.length} mouvements, aujourd'hui`, en: `based on ${rows.length} products and ${i.moves.length} movements, today` } };
    }
  }
}
