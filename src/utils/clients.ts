// Clients (module 1) : statut calculé, chiffres et prix. Règles pures : pas d'écran, pas de serveur, pas de table.
// Le statut n'est JAMAIS stocké : il se calcule à partir des missions validées (voir TODO_MODULES.md, module 1).
// Dates = textes « AAAA-MM-JJ » (jour de Madagascar), calculs en UTC pour éviter les décalages d'heure.
import { addDays, daysBetween } from './stats';

/** Fiche client (sera stockée dans la table df_clients à l'étape M1.3). */
export interface ClientRecord {
  id: string;
  name: string; // raison sociale
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  payment_terms_days?: number; // échéance de ce client (sinon celle de la page Conditions)
  price_default_ar?: number; // tarif propre à ce client
  price_by_type?: Record<string, number>; // exceptions par type de mission
  active?: boolean; // false = archivé (jamais supprimé s'il a des missions)
  created_at?: string;
}

/** Une mission validée rattachée à un client (le prix est celui figé à la validation). */
export interface ClientMission { client_id: string; date: string; price_ar: number }

/** `active` = statut neutre : le client a des missions mais n'est ni nouveau, ni régulier, ni stratégique, ni inactif. */
export type ClientStatus = 'prospect' | 'new' | 'regular' | 'strategic' | 'inactive' | 'active';

/** Seuils réglables (valeurs de départ = celles de TODO_MODULES.md ; ils iront dans la page Conditions). */
export interface ClientThresholds {
  new_days: number; // « Nouveau » : première mission il y a moins de N jours
  regular_missions: number; // « Régulier » : au moins N missions validées…
  regular_months: number; // …sur les M derniers mois
  strategic_top_pct: number; // « Stratégique » : dans les P % premiers du chiffre d'affaires…
  strategic_months: number; // …sur les M derniers mois…
  strategic_min_missions: number; // …avec au moins N missions sur cette période
  inactive_days: number; // « Inactif » : aucune mission depuis N jours (ou plus)
}

export const CLIENT_THRESHOLDS_DEFAULT: ClientThresholds = {
  new_days: 60, regular_missions: 3, regular_months: 6,
  strategic_top_pct: 20, strategic_months: 12, strategic_min_missions: 5,
  inactive_days: 90,
};

/** Seuils tirés de la page Conditions (section « clients »). Une valeur absente ou fausse prend la valeur de départ. */
export function clientThresholds(company: { clients?: Partial<ClientThresholds> } | undefined | null): ClientThresholds {
  const src: any = (company && company.clients) || {};
  const out: any = { ...CLIENT_THRESHOLDS_DEFAULT };
  for (const k of Object.keys(CLIENT_THRESHOLDS_DEFAULT)) { const v = src[k]; if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[k] = Math.round(v); }
  return out as ClientThresholds;
}

/** Statut le plus important à montrer : un client inactif est signalé d'abord, ensuite stratégique > régulier > nouveau > actif > prospect. */
export const STATUS_PRIORITY: ClientStatus[] = ['inactive', 'strategic', 'regular', 'new', 'active', 'prospect'];

export interface ClientSummary {
  id: string;
  statuses: ClientStatus[]; // tous les statuts qui s'appliquent (un client peut cumuler)
  main: ClientStatus; // celui à afficher en premier
  archived: boolean;
  missions_total: number;
  missions_window: number; // missions des `regular_months` derniers mois
  missions_12m: number; // missions de la période « stratégique »
  revenue_total: number;
  revenue_12m: number;
  first_date: string | null;
  last_date: string | null;
  days_since_last: number | null;
}

/** Date il y a N mois (même jour du mois, ou le dernier jour du mois si le jour n'existe pas : 31 août − 6 mois = 28 ou 29 février). */
export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1, d = Number(date.slice(8, 10));
  const total = y * 12 + m + months;
  const ny = Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const dd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const validNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Nom comparable : sans accents, sans majuscules, sans ponctuation, espaces simplifiés (pour rattacher les anciennes missions). */
export const normalizeName = (s: string): string =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Calcule le résumé (statuts, chiffres) de chaque client.
 * `missions` = seulement les missions VALIDÉES. Les statuts « Stratégique » comparent les clients entre eux (top P % du chiffre d'affaires).
 */
export function summarizeClients(clients: ClientRecord[], missions: ClientMission[], today: string, thr: ClientThresholds = CLIENT_THRESHOLDS_DEFAULT): Map<string, ClientSummary> {
  const regularStart = addMonths(today, -thr.regular_months);
  const stratStart = addMonths(today, -thr.strategic_months);
  const by = new Map<string, ClientMission[]>();
  for (const m of missions) {
    if (!m || !m.client_id || !m.date || m.date > today) continue; // une mission « future » n'existe pas encore
    const list = by.get(m.client_id);
    if (list) list.push(m); else by.set(m.client_id, [m]);
  }

  const out = new Map<string, ClientSummary>();
  for (const c of clients) {
    const list = by.get(c.id) || [];
    let first: string | null = null, last: string | null = null, revenue = 0, rev12 = 0, win = 0, m12 = 0;
    for (const m of list) {
      const price = validNum(m.price_ar) ? Math.round(m.price_ar) : 0;
      revenue += price;
      if (first === null || m.date < first) first = m.date;
      if (last === null || m.date > last) last = m.date;
      if (m.date >= regularStart) win++;
      if (m.date >= stratStart) { m12++; rev12 += price; }
    }
    out.set(c.id, {
      id: c.id, statuses: [], main: 'prospect', archived: c.active === false,
      missions_total: list.length, missions_window: win, missions_12m: m12,
      revenue_total: revenue, revenue_12m: rev12,
      first_date: first, last_date: last, days_since_last: last ? daysBetween(last, today) : null,
    });
  }

  // « Stratégique » : parmi les clients qui ont du chiffre d'affaires sur la période, les P % premiers (ex æquo à la limite : tous inclus)
  const pool = [...out.values()].filter(s => s.revenue_12m > 0).sort((a, b) => b.revenue_12m - a.revenue_12m);
  const top = pool.length ? Math.max(1, Math.ceil((pool.length * thr.strategic_top_pct) / 100)) : 0;
  const cutoff = top > 0 ? pool[Math.min(top, pool.length) - 1].revenue_12m : Infinity;
  const strategic = new Set(pool.filter(s => s.revenue_12m >= cutoff && s.missions_12m >= thr.strategic_min_missions).map(s => s.id));

  for (const s of out.values()) {
    const st: ClientStatus[] = [];
    if (s.missions_total === 0) st.push('prospect');
    else {
      if (s.days_since_last !== null && s.days_since_last >= thr.inactive_days) st.push('inactive');
      if (s.first_date && daysBetween(s.first_date, today) < thr.new_days) st.push('new');
      if (s.missions_window >= thr.regular_missions) st.push('regular');
      if (strategic.has(s.id)) st.push('strategic');
      if (st.length === 0) st.push('active'); // des missions, mais aucun des 4 cas ci-dessus : statut neutre
    }
    s.statuses = st.sort((a, b) => STATUS_PRIORITY.indexOf(a) - STATUS_PRIORITY.indexOf(b));
    s.main = s.statuses[0] || 'prospect';
  }
  return out;
}

/** Échéance de paiement d'un client : la sienne si elle est réglée, sinon celle de la page Conditions. */
export const paymentTermsDays = (c: Pick<ClientRecord, 'payment_terms_days'> | undefined, companyDefault: number): number =>
  c && validNum(c.payment_terms_days) ? Math.round(c.payment_terms_days) : validNum(companyDefault) ? Math.round(companyDefault) : 0;

/** Anciennes missions (texte libre) : propose un client par nom identique (comparé sans accents ni majuscules). L'admin confirme une par une. */
export function suggestClientMatches(freeTexts: string[], clients: ClientRecord[]): { text: string; client_id: string | null; ambiguous: boolean }[] {
  const idx = new Map<string, string[]>();
  for (const c of clients) { const k = normalizeName(c.name); if (!k) continue; const l = idx.get(k); if (l) l.push(c.id); else idx.set(k, [c.id]); }
  return [...new Set(freeTexts.map(t => String(t || '').trim()).filter(Boolean))].map(text => {
    const ids = idx.get(normalizeName(text)) || [];
    return { text, client_id: ids.length === 1 ? ids[0] : null, ambiguous: ids.length > 1 };
  });
}

/** Les clients d'après leur statut, du plus à surveiller au plus calme, puis par chiffre d'affaires, puis par nom (ordre stable). */
export function rankClients(clients: ClientRecord[], summaries: Map<string, ClientSummary>): ClientRecord[] {
  const rank = (c: ClientRecord) => STATUS_PRIORITY.indexOf(summaries.get(c.id)?.main || 'prospect');
  return [...clients].sort((a, b) => rank(a) - rank(b) || (summaries.get(b.id)?.revenue_12m || 0) - (summaries.get(a.id)?.revenue_12m || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export { addDays };
