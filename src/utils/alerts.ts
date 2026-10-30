// Alertes de l'accueil admin (sans écran, sans serveur). Contrôlé par `npm run check:phase4`.
// Elles utilisent des chiffres d'argent : à n'appeler que pour l'admin (un employé n'a de toute façon ni finances ni stock).
import type { CashEntry, ClientContract, PostSession, Product, SalaryAdvanceRequest, StockMove } from '../types';
import { computeFinance } from './financeStats';
import { comparableRanges, daysBetween, periodRange } from './stats';
import { DEFAULT_STOCK_SPACES, inSpace, stockRows, type StockSpace } from './stock';
import type { StorageIntent } from './storageNav';
import type { ValFilter } from './navIntent';
import { goalRows, monthFigures, type GoalSettings } from './goals';
import { missionAmount } from './stats';
import type { StatsTab } from './statsNav';
import { receivablesAlert, toChase } from './receivables';
import { budgetRows } from './purchasing';
import type { Invoice } from '../types';
import { canonicalClientName, clientMissionsFromPosts, clientReceived, summarizeClients, type ClientRecord } from './clients';
import { clientBadgeAlert, clientsToWatch, computeClientBadges } from './clientBadges';

export type AlertLevel = 'danger' | 'warn';
export interface AlertItem {
  id: string; level: AlertLevel; fr: string; en: string;
  go: string; // page à ouvrir (ex. « stats », « advances »)
  tab?: StatsTab; // onglet de la page Statistiques à ouvrir
  nav?: string; // élément exact à atteindre (data-nav) : défilement + clignotement 1,5 s
  filter?: ValFilter; // filtre de la page Validations à activer d'abord
  storage?: StorageIntent; // lien exact dans le Stockage : le bon stockage, le bon filtre, le produit à faire clignoter
}

export interface AlertSettings extends GoalSettings {
  alert_unpaid_days?: number; alert_low_cash_ar?: number;
  client_price_default_ar?: number; client_prices_by_type?: Record<string, number>; price_per_mission?: number;
  budgets?: Record<string, number>; // plafond mensuel par catégorie de dépense (module 4)
}
export interface AlertInput {
  today: string; settings: AlertSettings;
  cash: CashEntry[]; posts: PostSession[]; contracts: ClientContract[]; advances: SalaryAdvanceRequest[];
  products: Product[]; moves: StockMove[];
  spaces?: StockSpace[]; // les stockages : le stock bas se compte stockage par stockage
  clients?: ClientRecord[]; // fiches clients (admin) : l'alerte « pas de paiement » suit chaque fiche
  invoices?: Invoice[]; // factures (module 2) : alerte « factures en retard »
}

const ar = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} Ar`;
const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '');
export const DEFAULT_UNPAID_DAYS = 30;

export function computeAlerts(i: AlertInput): AlertItem[] {
  const out: AlertItem[] = [];
  const s = i.settings;
  const fin = { cash: i.cash, posts: i.posts, contracts: i.contracts, prices: s, pricePerMission: s.price_per_mission || 0 };
  const month = monthFigures(fin, i.today);

  // 1. Budget : dépenses du mois contre le plafond
  const exp = goalRows(s, month).find(r => r.key === 'expenses');
  if (exp && (exp.state === 'over' || exp.state === 'warn')) {
    out.push(exp.state === 'over'
      ? { id: 'budget', level: 'danger', go: 'stats', tab: 'finance', fr: `Budget dépassé : ${ar(exp.value)} dépensés ce mois-ci sur ${ar(exp.goal)} prévus.`, en: `Budget exceeded: ${ar(exp.value)} spent this month out of ${ar(exp.goal)}.` }
      : { id: 'budget', level: 'warn', go: 'stats', tab: 'finance', fr: `Budget presque atteint : ${exp.pct} % du plafond de dépenses du mois.`, en: `Budget almost reached: ${exp.pct}% of this month's spending limit.` });
  }

  // 2. Bénéfice en baisse : le mois en cours contre le mois d'avant, sur le même nombre de jours
  const rg = comparableRanges('month', i.today, i.today);
  if (rg.inProgress && rg.curEff.days >= 5) {
    const cur = computeFinance(fin, 'month', rg.curEff), prev = computeFinance(fin, 'month', rg.prev);
    if (prev.profit > 0 && cur.profit < prev.profit) {
      const drop = Math.round(((prev.profit - cur.profit) / prev.profit) * 100);
      if (drop >= 20) out.push({ id: 'profit-drop', level: 'warn', go: 'stats', tab: 'finance', fr: `Bénéfice en baisse de ${drop} % par rapport au mois dernier (même nombre de jours).`, en: `Profit down ${drop}% compared with last month (same number of days).` });
    }
  }

  // 3. Trésorerie basse (négative, ou sous le seuil réglé)
  const all = computeFinance(fin, 'year', { start: '2000-01-01', end: i.today, days: daysBetween('2000-01-01', i.today) + 1 });
  const low = Math.max(0, Number(s.alert_low_cash_ar) || 0);
  if (all.treasury < low || all.treasury < 0) {
    const neg = all.treasury < 0;
    out.push({ id: 'cash-low', level: neg ? 'danger' : 'warn', go: 'stats', tab: 'finance',
      fr: neg ? `Trésorerie négative : ${ar(all.treasury)}.` : `Trésorerie basse : ${ar(all.treasury)} (seuil ${ar(low)}).`,
      en: neg ? `Negative cash: ${ar(all.treasury)}.` : `Low cash: ${ar(all.treasury)} (threshold ${ar(low)}).` });
  }

  // 4. Stock bas, stockage par stockage (même règle que le voyant rouge de l'onglet Produits) : jamais de mélange
  const spaces = i.spaces && i.spaces.length ? i.spaces : DEFAULT_STOCK_SPACES;
  for (const sp of spaces) {
    const mine = inSpace(i.products, i.moves, sp.id);
    const lowRows = stockRows(mine.products, mine.moves).filter(r => r.low);
    if (!lowRows.length) continue;
    const names = lowRows.map(r => r.product.name);
    const first = [...lowRows].sort((x, y) => Number(y.empty) - Number(x.empty) || x.qty - y.qty)[0]; // le plus urgent : un produit épuisé d'abord
    const multi = spaces.length > 1;
    out.push({ id: multi ? `stock-low-${sp.id}` : 'stock-low', level: lowRows.some(r => r.empty) ? 'danger' : 'warn', go: 'storage',
      storage: { space: sp.id, filter: first.empty ? 'empty' : 'low', product: first.product.id },
      fr: `${multi ? `${sp.name} : s` : 'S'}tock bas : ${lowRows.length} produit${lowRows.length > 1 ? 's' : ''} (${list(names)}).`, en: `${multi ? `${sp.name}: l` : 'L'}ow stock: ${lowRows.length} product${lowRows.length > 1 ? 's' : ''} (${list(names)}).` });
  }

  // 5. Avance trop grosse : une avance en attente plus grande que ce que la personne a gagné ce mois-ci
  const mr = periodRange('month', i.today);
  const earned = new Map<string, number>();
  for (const p of i.posts) if (p.status === 'completed' && p.date >= mr.start && p.date <= mr.end) earned.set(p.employee_id, (earned.get(p.employee_id) || 0) + missionAmount(p, s.price_per_mission || 0));
  const big = i.advances.filter(a => a.status === 'pending' && (a.amount_ar || 0) > (earned.get(a.employee_id) || 0));
  if (big.length) {
    const names = [...new Set(big.map(a => a.employee_name))];
    const biggest = [...big].sort((x, y) => (y.amount_ar || 0) - (x.amount_ar || 0))[0];
    out.push({ id: 'advance-big', level: 'warn', go: 'advances', nav: `adv-${biggest.id}`,
      fr: `Avance trop grosse : ${big.length} demande${big.length > 1 ? 's' : ''} au-dessus de ce qui est gagné ce mois-ci (${list(names)}).`,
      en: `Advance too large: ${big.length} request${big.length > 1 ? 's' : ''} above what was earned this month (${list(names)}).` });
  }

  // 6. Client qui n'a pas payé depuis X jours.
  //    Avec une fiche client : on compare ce que CE client doit (missions validées × son prix) à ce qu'il a payé ; l'attente se compte depuis son dernier paiement
  //    (ou, s'il n'a jamais payé, depuis sa première mission). Un nom de paiement sans fiche garde l'ancienne règle (il reste de l'argent à encaisser au total).
  const days = Math.max(1, Math.round(Number(s.alert_unpaid_days) || DEFAULT_UNPAID_DAYS));
  const records = i.clients || [];
  const late: { name: string; ago: number; due: number }[] = [];
  if (all.toCollect > 0) {
    const last = new Map<string, string>();
    for (const e of i.cash) {
      if (e.kind !== 'in' || !e.client_name?.trim() || e.date > i.today) continue;
      const c = records.length ? canonicalClientName(e.client_name, records) : { name: e.client_name.trim(), id: null };
      if (c.id) continue; // suivi par fiche juste en dessous
      if (!last.has(c.name) || e.date > last.get(c.name)!) last.set(c.name, e.date);
    }
    for (const [name, d] of last) { const ago = daysBetween(d, i.today); if (ago > days) late.push({ name, ago, due: 0 }); }
  }
  if (records.length) {
    const cashNow = i.cash.filter(e => e.date <= i.today);
    const money = clientReceived(cashNow, records);
    const billed = new Map<string, number>(), first = new Map<string, string>();
    for (const m of clientMissionsFromPosts(i.posts.filter(p => p.date <= i.today), i.contracts, records, s)) {
      billed.set(m.client_id, (billed.get(m.client_id) || 0) + m.price_ar);
      if (!first.has(m.client_id) || m.date < first.get(m.client_id)!) first.set(m.client_id, m.date);
    }
    for (const c of records) {
      if (c.active === false) continue;
      const due = (billed.get(c.id) || 0) - (money.get(c.id)?.received || 0);
      if (due <= 0) continue;
      const ref = money.get(c.id)?.last_date || first.get(c.id);
      if (!ref) continue;
      const ago = daysBetween(ref, i.today);
      if (ago > days) late.push({ name: c.name, ago, due });
    }
  }
  late.sort((a, b) => b.ago - a.ago || a.name.localeCompare(b.name));
  if (late.length) {
    const left = all.toCollect > 0 ? all.toCollect : late.reduce((t, x) => t + x.due, 0);
    out.push({ id: 'unpaid', level: 'warn', go: 'stats', tab: 'finance',
      fr: `Pas de paiement depuis plus de ${days} jours : ${late.slice(0, 3).map(x => `${x.name} (${x.ago} j)`).join(', ')}${late.length > 3 ? ` +${late.length - 3}` : ''}. Reste à encaisser : ${ar(left)}.`,
      en: `No payment for over ${days} days: ${late.slice(0, 3).map(x => `${x.name} (${x.ago} d)`).join(', ')}${late.length > 3 ? ` +${late.length - 3}` : ''}. Left to collect: ${ar(left)}.` });
  }

  // 6b. Budgets par catégorie (module 4) : 80 % et plus = attention, plus de 100 % = dépassé
  {
    const rows = budgetRows(s.budgets, i.cash, i.today.slice(0, 7)).filter(r => r.status !== 'ok');
    if (rows.length) {
      const over = rows.some(r => r.status === 'over');
      const txt = () => rows.slice(0, 3).map(r => `${r.category} (${r.pct} %)`).join(', ') + (rows.length > 3 ? ` +${rows.length - 3}` : '');
      out.push({ id: 'budget_cat', level: over ? 'danger' : 'warn', go: 'stats', tab: 'finance',
        fr: over ? `Budget de catégorie dépassé ce mois-ci : ${txt()}.` : `Budget de catégorie presque atteint : ${txt()}.`,
        en: over ? `Category budget exceeded this month: ${txt()}.` : `Category budget almost reached: ${txt()}.` });
    }
  }

  // 7. Factures en retard (module 2) : échéance dépassée et reste à payer
  if (i.invoices && i.invoices.length) {
    const names: Record<string, string> = {};
    for (const c of i.clients || []) names[c.id] = c.name;
    const chase = toChase(i.invoices, i.cash, i.today, names);
    const ra = receivablesAlert(chase);
    if (ra) out.push({ id: 'invoices_overdue', level: ra.level, go: 'invoices', ...(chase[0]?.invoices[0] ? { nav: `inv-${chase[0].invoices[0].id}` } : {}), fr: ra.fr, en: ra.en });
  }

  // 8. Clients à surveiller (module 3) : facture en retard de plus de 60 jours, ou payeur lent
  if (i.invoices && i.invoices.length && i.clients && i.clients.length) {
    const prices = { client_price_default_ar: s.client_price_default_ar, client_prices_by_type: s.client_prices_by_type };
    const missions = clientMissionsFromPosts(i.posts, i.contracts, i.clients, prices);
    const summaries = summarizeClients(i.clients, missions, i.today);
    const badges = computeClientBadges({ clients: i.clients, summaries, missions, invoices: i.invoices, cash: i.cash, today: i.today });
    const ca = clientBadgeAlert(badges);
    const worstClient = clientsToWatch(badges)[0];
    if (ca) out.push({ id: 'clients_watch', level: ca.level, go: 'clients', ...(worstClient ? { nav: `client-${worstClient.id}` } : {}), fr: `${ca.fr}.`, en: `${ca.en}.` });
  }

  const order = { danger: 0, warn: 1 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
