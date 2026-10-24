// Badges et score de relation des CLIENTS (module 3, M3.5) : règles pures, sans écran ni serveur. Contrôlé par `npm run check:client-badges`.
// Visible par l'admin seulement (jamais par un salarié). Les statuts Nouveau / Régulier / Stratégique / Inactif sont déjà calculés
// par le module 1 (`summarizeClients`) et repris tels quels ; ici on ajoute « comment ça se passe » : paiement, retard, volume.
//
// Règles (valeurs de départ = tableau de TODO_MODULES.md, partie 3.B) :
//  • Délai de paiement d'une facture = date où le cumul des paiements (lignes « entrée » des Finances qui la citent) atteint le total,
//    comparée à l'ÉCHÉANCE de cette facture (due_date). Écart > 0 = payée en retard. Avoirs, brouillons, annulées : ignorés.
//  • « Bon payeur »  : au moins 3 factures soldées sur 12 mois, écart moyen ≤ 0 jour, et aucune facture en retard aujourd'hui.
//  • « Payeur lent » : au moins 3 factures soldées sur 12 mois, écart moyen > 15 jours (point d'attention).
//  • « À surveiller » : une facture non soldée dont le retard dépasse 60 jours (point d'attention).
//  • « Gros volume »  : plus de 10 missions validées sur les 30 derniers jours.
//  • Score de relation 0-100 = régularité des commandes 35 % + ponctualité de paiement 35 % + volume 30 %.
//      – régularité : mois (sur les 6 derniers, ou depuis la 1re mission si plus récente) avec au moins une mission ÷ nombre de ces mois ;
//      – ponctualité : factures payées à temps ÷ (factures soldées sur 12 mois + factures en retard non soldées), en % ;
//      – volume : rang du chiffre d'affaires sur 12 mois parmi les clients qui en ont (100 = le plus haut, 0 = le plus bas).
//    Une composante sans assez de données est retirée et les poids sont recalculés à 100 % ; moins de 2 composantes = pas de score.
//  • Un client sans facture n'est jamais « bon » ni « lent » : on n'invente rien (« pas assez de données »).
import type { CashEntry, Invoice } from '../types';
import { addMonths, type ClientMission, type ClientRecord, type ClientStatus, type ClientSummary } from './clients';
import { invoiceInfo } from './invoices';
import { addDays, daysBetween } from './stats';

export interface Bilingual { fr: string; en: string }

export interface ClientBadgeConfig {
  payment_min_invoices: number; // factures soldées minimum pour « Bon payeur » / « Payeur lent » et la ponctualité
  payment_months: number; // période des factures soldées prises en compte
  slow_extra_days: number; // « Payeur lent » : écart moyen supérieur à N jours
  watch_days: number; // « À surveiller » : retard d'une facture supérieur à N jours
  big_volume_missions: number; // « Gros volume » : plus de N missions…
  big_volume_days: number; // …sur les N derniers jours
  regular_months: number; // fenêtre de la régularité des commandes
  volume_min_clients: number; // clients avec du chiffre d'affaires minimum pour comparer le volume
  weights: { regularity: number; payment: number; volume: number };
}
export const CLIENT_BADGE_DEFAULTS: ClientBadgeConfig = {
  payment_min_invoices: 3, payment_months: 12, slow_extra_days: 15, watch_days: 60,
  big_volume_missions: 10, big_volume_days: 30, regular_months: 6, volume_min_clients: 3,
  weights: { regularity: 35, payment: 35, volume: 30 },
};

export type ClientBadgeId = 'good_payer' | 'slow_payer' | 'watch' | 'big_volume';
export interface ClientBadge { id: ClientBadgeId; attention: boolean; why: Bilingual }
export interface ClientAttention { code: ClientBadgeId; fr: string; en: string }

export interface ClientComponents { regularity: number | null; payment: number | null; volume: number | null }
export interface ClientPaymentStats {
  paid: number; // factures soldées dans la période
  avg_days_over: number | null; // écart moyen à l'échéance (négatif = en avance)
  on_time: number; // dont payées à temps
  overdue_open: number; // factures non soldées en retard aujourd'hui
  max_days_late: number; // plus gros retard parmi elles
  overdue_balance: number; // reste à payer sur ces factures
}
export interface ClientPerformance {
  id: string; name: string; archived: boolean;
  statuses: ClientStatus[]; // statuts du module 1, repris tels quels
  score: number | null;
  components: ClientComponents;
  badges: ClientBadge[];
  attention: ClientAttention[];
  payment: ClientPaymentStats;
  missions_recent: number; // missions des `big_volume_days` derniers jours
  active_months: number; // mois avec au moins une mission, dans la fenêtre de régularité
  window_months: number; // nombre de mois de cette fenêtre
}
export interface ClientBadgeInput {
  clients: ClientRecord[];
  summaries: Map<string, ClientSummary>;
  missions: ClientMission[];
  invoices: Invoice[];
  cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id' | 'date'>[];
  today: string;
  cfg?: unknown;
}
export interface ClientBadgeResult { today: string; cfg: ClientBadgeConfig; clients: Map<string, ClientPerformance> }

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const intIn = (v: unknown, lo: number, hi: number, d: number) => (isNum(v) && v >= lo && v <= hi ? Math.round(v) : d);

/** Réglages reçus → réglages sûrs : toute valeur invalide retombe sur la valeur de départ. */
export function cleanClientBadgeConfig(raw: unknown): ClientBadgeConfig {
  const d = CLIENT_BADGE_DEFAULTS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const w = (r.weights && typeof r.weights === 'object' ? r.weights : {}) as Record<string, unknown>;
  const weights = { regularity: intIn(w.regularity, 0, 100, d.weights.regularity), payment: intIn(w.payment, 0, 100, d.weights.payment), volume: intIn(w.volume, 0, 100, d.weights.volume) };
  return {
    payment_min_invoices: intIn(r.payment_min_invoices, 1, 50, d.payment_min_invoices),
    payment_months: intIn(r.payment_months, 1, 36, d.payment_months),
    slow_extra_days: intIn(r.slow_extra_days, 1, 365, d.slow_extra_days),
    watch_days: intIn(r.watch_days, 1, 730, d.watch_days),
    big_volume_missions: intIn(r.big_volume_missions, 1, 1000, d.big_volume_missions),
    big_volume_days: intIn(r.big_volume_days, 7, 90, d.big_volume_days),
    regular_months: intIn(r.regular_months, 1, 24, d.regular_months),
    volume_min_clients: intIn(r.volume_min_clients, 2, 100, d.volume_min_clients),
    weights: weights.regularity + weights.payment + weights.volume > 0 ? weights : d.weights,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;
const moneyEn = (n: number) => `${Math.round(n).toLocaleString('en-GB')} Ar`;
const plural = (n: number, one: string, many: string) => (Math.abs(n) > 1 ? many : one);

/** Date où une facture est soldée (le cumul des paiements atteint le total), ou null si elle ne l'est pas. */
export function paidOffDate(inv: Pick<Invoice, 'id' | 'total_ar'>, cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id' | 'date'>[]): string | null {
  if (!(inv.total_ar > 0)) return null;
  const pays = cash.filter(e => e.kind === 'in' && e.invoice_id === inv.id && isNum(e.amount_ar) && e.amount_ar > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date))).sort((a, b) => a.date.localeCompare(b.date));
  let sum = 0;
  for (const p of pays) { sum += Math.round(p.amount_ar); if (sum >= inv.total_ar) return p.date; }
  return null;
}

/** Rang (0 à 100) de `v` parmi `all` : 100 = le plus haut, 0 = le plus bas ; ex æquo = rang moyen. Null s'il y a moins de 2 valeurs. */
export function percentRank(v: number, all: number[]): number | null {
  if (all.length < 2) return null;
  const below = all.filter(x => x < v).length;
  const equal = all.filter(x => x === v).length;
  return Math.round(((below + (equal - 1) / 2) / (all.length - 1)) * 1000) / 10;
}

export function computeClientBadges(input: ClientBadgeInput): ClientBadgeResult {
  const cfg = cleanClientBadgeConfig(input.cfg);
  const today = input.today;
  const clients = new Map<string, ClientPerformance>();
  const payStart = addMonths(today, -cfg.payment_months);
  const volStart = addDays(today, -(cfg.big_volume_days - 1));
  const regStart = addMonths(today, -cfg.regular_months);

  // factures par client (jamais de brouillon, d'annulée ni d'avoir ; les avoirs sont des « type: credit_note »)
  const invByClient = new Map<string, Invoice[]>();
  for (const inv of input.invoices) {
    if (!inv || inv.type === 'credit_note' || inv.status !== 'issued' || !inv.client_id || !(inv.total_ar > 0)) continue;
    (invByClient.get(inv.client_id) || invByClient.set(inv.client_id, []).get(inv.client_id)!).push(inv);
  }
  const missionsBy = new Map<string, ClientMission[]>();
  for (const m of input.missions) {
    if (!m || !m.client_id || !m.date || m.date > today) continue;
    (missionsBy.get(m.client_id) || missionsBy.set(m.client_id, []).get(m.client_id)!).push(m);
  }

  const revenues: number[] = [];
  for (const c of input.clients) { const s = input.summaries.get(c.id); if (s && s.revenue_12m > 0) revenues.push(s.revenue_12m); }

  for (const c of input.clients) {
    const sum = input.summaries.get(c.id);
    const invs = invByClient.get(c.id) || [];
    const ms = missionsBy.get(c.id) || [];

    // ----- paiements -----
    let paid = 0, onTime = 0, overSum = 0, overdueOpen = 0, maxLate = 0, overdueBalance = 0;
    let worst: { number: string; days: number; balance: number } | null = null;
    for (const inv of invs) {
      const info = invoiceInfo(inv as Invoice, input.cash, today);
      if (info.state === 'paid') {
        const at = paidOffDate(inv, input.cash);
        if (at && at >= payStart && at <= today) { const over = daysBetween(inv.due_date, at); paid++; overSum += over; if (over <= 0) onTime++; }
      } else if (info.overdue && info.balance > 0) {
        overdueOpen++; overdueBalance += info.balance; maxLate = Math.max(maxLate, info.days_late);
        if (!worst || info.days_late > worst.days) worst = { number: inv.number || '—', days: info.days_late, balance: info.balance };
      }
    }
    const avgOver = paid > 0 ? round1(overSum / paid) : null;
    const payment: ClientPaymentStats = { paid, avg_days_over: avgOver, on_time: onTime, overdue_open: overdueOpen, max_days_late: maxLate, overdue_balance: overdueBalance };

    // ----- volume récent -----
    const recent = ms.filter(m => m.date >= volStart).length;

    // ----- badges -----
    const badges: ClientBadge[] = [];
    if (paid >= cfg.payment_min_invoices && avgOver !== null && avgOver <= 0 && overdueOpen === 0) {
      badges.push({ id: 'good_payer', attention: false, why: {
        fr: avgOver < 0 ? `Paie en moyenne ${Math.abs(avgOver)} jour${plural(avgOver, '', 's')} avant l'échéance (${paid} factures soldées sur ${cfg.payment_months} mois)` : `Paie à l'échéance en moyenne (${paid} factures soldées sur ${cfg.payment_months} mois)`,
        en: avgOver < 0 ? `Pays on average ${Math.abs(avgOver)} day${plural(avgOver, '', 's')} before the due date (${paid} invoices settled in ${cfg.payment_months} months)` : `Pays on the due date on average (${paid} invoices settled in ${cfg.payment_months} months)` } });
    }
    if (paid >= cfg.payment_min_invoices && avgOver !== null && avgOver > cfg.slow_extra_days) {
      badges.push({ id: 'slow_payer', attention: true, why: {
        fr: `Paie en moyenne ${avgOver} jours après l'échéance (${paid} factures soldées sur ${cfg.payment_months} mois ; seuil ${cfg.slow_extra_days} jours)`,
        en: `Pays on average ${avgOver} days after the due date (${paid} invoices settled in ${cfg.payment_months} months; threshold ${cfg.slow_extra_days} days)` } });
    }
    if (worst && worst.days > cfg.watch_days) {
      badges.push({ id: 'watch', attention: true, why: {
        fr: `Facture ${worst.number} en retard de ${worst.days} jours, reste ${money(worst.balance)}${overdueOpen > 1 ? ` (${overdueOpen} factures en retard)` : ''}`,
        en: `Invoice ${worst.number} is ${worst.days} days late, ${moneyEn(worst.balance)} left${overdueOpen > 1 ? ` (${overdueOpen} invoices late)` : ''}` } });
    }
    if (recent > cfg.big_volume_missions) {
      badges.push({ id: 'big_volume', attention: false, why: { fr: `${recent} missions sur les ${cfg.big_volume_days} derniers jours (seuil : plus de ${cfg.big_volume_missions})`, en: `${recent} missions in the last ${cfg.big_volume_days} days (threshold: more than ${cfg.big_volume_missions})` } });
    }
    const attention: ClientAttention[] = badges.filter(b => b.attention).map(b => ({ code: b.id, fr: b.why.fr, en: b.why.en }));

    // ----- score de relation -----
    const first = ms.length ? ms.reduce((a, m) => (m.date < a ? m.date : a), ms[0].date) : null;
    let regularity: number | null = null, activeMonths = 0, windowMonths = 0;
    if (first) {
      const from = first > regStart ? first : regStart; // un client récent n'est pas pénalisé pour les mois d'avant son arrivée
      let cursor = from.slice(0, 7), end = today.slice(0, 7);
      const set = new Set(ms.filter(m => m.date >= from).map(m => m.date.slice(0, 7)));
      while (cursor <= end && windowMonths < 60) {
        windowMonths++; if (set.has(cursor)) activeMonths++;
        const y = Number(cursor.slice(0, 4)), mo = Number(cursor.slice(5, 7));
        cursor = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      }
      regularity = windowMonths > 0 ? Math.round((activeMonths / windowMonths) * 1000) / 10 : null;
    }
    const items = paid + overdueOpen;
    const paymentScore = items >= cfg.payment_min_invoices ? Math.round((onTime / items) * 1000) / 10 : null;
    const vol = sum && sum.revenue_12m > 0 && revenues.length >= cfg.volume_min_clients ? percentRank(sum.revenue_12m, revenues) : null;
    const components: ClientComponents = { regularity, payment: paymentScore, volume: vol };
    const parts: [number, number][] = [];
    if (regularity !== null) parts.push([regularity, cfg.weights.regularity]);
    if (paymentScore !== null) parts.push([paymentScore, cfg.weights.payment]);
    if (vol !== null) parts.push([vol, cfg.weights.volume]);
    const wsum = parts.reduce((t, p) => t + p[1], 0);
    const score = parts.length >= 2 && wsum > 0 ? Math.round(parts.reduce((t, p) => t + p[0] * p[1], 0) / wsum) : null;

    clients.set(c.id, {
      id: c.id, name: c.name, archived: c.active === false, statuses: sum ? [...sum.statuses] : [],
      score, components, badges, attention, payment, missions_recent: recent, active_months: activeMonths, window_months: windowMonths,
    });
  }
  return { today, cfg, clients };
}

/** Clients à suivre de près : « À surveiller » d'abord, puis « Payeur lent » ; les archivés sont laissés de côté. */
export function clientsToWatch(res: ClientBadgeResult): ClientPerformance[] {
  const rank = (p: ClientPerformance) => (p.attention.some(a => a.code === 'watch') ? 0 : 1);
  return [...res.clients.values()].filter(p => !p.archived && p.attention.length > 0)
    .sort((a, b) => rank(a) - rank(b) || b.payment.max_days_late - a.payment.max_days_late || a.name.localeCompare(b.name));
}

/** Alerte de l'accueil : combien de clients « À surveiller » et « Payeurs lents » (rien s'il n'y en a pas). */
export function clientBadgeAlert(res: ClientBadgeResult): { level: 'danger' | 'warn'; fr: string; en: string } | null {
  const list = clientsToWatch(res);
  const watch = list.filter(p => p.attention.some(a => a.code === 'watch')).length;
  const slow = list.filter(p => !p.attention.some(a => a.code === 'watch') && p.attention.some(a => a.code === 'slow_payer')).length;
  if (!watch && !slow) return null;
  const fr = [watch ? `${watch} client${watch > 1 ? 's' : ''} à surveiller (facture en retard de plus de ${res.cfg.watch_days} jours)` : '', slow ? `${slow} payeur${slow > 1 ? 's' : ''} lent${slow > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  const en = [watch ? `${watch} client${watch > 1 ? 's' : ''} to watch (invoice more than ${res.cfg.watch_days} days late)` : '', slow ? `${slow} slow payer${slow > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return { level: watch ? 'danger' : 'warn', fr, en };
}
