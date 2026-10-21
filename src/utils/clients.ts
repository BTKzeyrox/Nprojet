// Clients (module 1) : statut calculé, chiffres et prix. Règles pures : pas d'écran, pas de serveur, pas de table.
// Le statut n'est JAMAIS stocké : il se calcule à partir des missions validées (voir TODO_MODULES.md, module 1).
// Dates = textes « AAAA-MM-JJ » (jour de Madagascar), calculs en UTC pour éviter les décalages d'heure.
import { addDays, daysBetween } from './stats';
import { clientPriceWithClient } from './clientPrice';
import type { CashEntry, ClientContract, PostSession } from '../types';

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

// ---------------------------------------------------------------------------------------------------------------------
// Étape M1.4 : écran Clients. Libellés, vérification d'une fiche avant l'envoi, lien missions/paiements, filtre et tri.
// ---------------------------------------------------------------------------------------------------------------------

/** Libellés des statuts [français, anglais] et ce qu'ils veulent dire (aide affichée à l'écran). */
export const CLIENT_STATUS_LABEL: Record<ClientStatus, { fr: string; en: string; help_fr: string; help_en: string }> = {
  prospect: { fr: 'Prospect', en: 'Prospect', help_fr: 'Fiche créée, aucune mission validée.', help_en: 'Record created, no validated mission yet.' },
  new: { fr: 'Nouveau', en: 'New', help_fr: 'Première mission récente.', help_en: 'First mission is recent.' },
  regular: { fr: 'Régulier', en: 'Regular', help_fr: 'Missions validées régulièrement ces derniers mois.', help_en: 'Missions validated regularly in recent months.' },
  strategic: { fr: 'Stratégique', en: 'Strategic', help_fr: 'Parmi les clients qui rapportent le plus.', help_en: 'Among the clients that bring in the most.' },
  inactive: { fr: 'Inactif', en: 'Inactive', help_fr: 'Aucune mission depuis longtemps.', help_en: 'No mission for a long time.' },
  active: { fr: 'Actif', en: 'Active', help_fr: 'A des missions, sans autre statut particulier.', help_en: 'Has missions, no other particular status.' },
};

// Mêmes limites que le serveur (df-api, bloc CLIENTS) : `npm run check:clients-server` compare les deux sur les mêmes cas.
export const CLIENT_LIMITS = { name: 80, contact: 80, phone: 40, email: 120, address: 200, note: 500, terms_max: 365, money_max: 1_000_000_000_000, types_max: 20, type_key: 40 } as const;
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

/** Ce que l'écran envoie : tout en texte (champs de saisie). */
export interface ClientDraft {
  name: string; contact_name?: string; phone?: string; email?: string; address?: string; note?: string;
  payment_terms_days?: string | number; price_default?: string | number;
  price_by_type?: { type: string; price: string | number }[]; // une ligne par exception ; une ligne vide est ignorée
}
export type ClientDraftError = 'name' | 'email' | 'terms' | 'price' | 'price_by_type';
export type ClientDraftResult =
  | { ok: true; clean: { name: string; contact_name: string; phone: string; email: string; address: string; note: string; payment_terms_days?: number; price_default_ar?: number; price_by_type?: Record<string, number> } }
  | { ok: false; error: ClientDraftError };

const toNum = (v: string | number | undefined): number | undefined | null => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN; // un tableau, un booléen ou un objet n'est pas un nombre
  const t = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return t === '' ? undefined : Number(t); // NaN si ce n'est pas un nombre
};

/** Vérifie une fiche avant l'envoi (mêmes règles que le serveur ; le serveur revérifie toujours). */
export function checkClientDraft(d: ClientDraft): ClientDraftResult {
  const L = CLIENT_LIMITS;
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const name = text(d?.name, L.name);
  if (!name) return { ok: false, error: 'name' };
  const email = text(d.email, L.email);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { ok: false, error: 'email' };
  let terms: number | undefined;
  const t = toNum(d.payment_terms_days);
  if (t !== undefined) { if (t === null || !Number.isFinite(t) || t < 0 || t > L.terms_max) return { ok: false, error: 'terms' }; terms = Math.round(t); }
  let price: number | undefined;
  const p = toNum(d.price_default);
  if (p !== undefined) { if (p === null || !Number.isFinite(p) || p < 0 || p > L.money_max) return { ok: false, error: 'price' }; price = Math.round(p); }
  let byType: Record<string, number> | undefined;
  const rows = (d.price_by_type || []).filter(r => r && (String(r.type ?? '').trim() !== '' || String(r.price ?? '').trim() !== ''));
  if (rows.length) {
    if (rows.length > L.types_max) return { ok: false, error: 'price_by_type' };
    byType = {};
    for (const r of rows) {
      const key = String(r.type ?? '').trim().slice(0, L.type_key);
      const v = toNum(r.price);
      if (!key || BAD_KEYS.includes(key) || v === undefined || v === null || !Number.isFinite(v) || v < 0 || v > L.money_max) return { ok: false, error: 'price_by_type' };
      byType[key] = Math.round(v);
    }
  }
  return { ok: true, clean: {
    name, contact_name: text(d.contact_name, L.contact), phone: text(d.phone, L.phone), email, address: text(d.address, L.address), note: text(d.note, L.note),
    ...(terms !== undefined ? { payment_terms_days: terms } : {}),
    ...(price !== undefined ? { price_default_ar: price } : {}),
    ...(byType && Object.keys(byType).length ? { price_by_type: byType } : {}),
  } };
}

/**
 * Missions validées rattachées à un client, avec leur prix. Le client d'une session = son `client_id`, sinon celui de sa mission (contrat).
 * Prix : celui figé sur la session, sinon celui de la mission, sinon la règle à 5 niveaux avec les tarifs du client.
 * Les missions sans client (anciennes, texte libre) ne comptent pour aucun client : elles restent visibles dans Finances comme avant.
 */
/**
 * La mission (contrat) d'une session : par numéro de poste quand la session en a un, sinon par titre identique. Premier trouvé.
 * Même règle pour les chiffres des clients et pour figer l'histoire quand une mission change de client (M1.5).
 */
export function matchContract<C extends Pick<ClientContract, 'post_number' | 'client_name'>>(p: Pick<PostSession, 'post_number' | 'client_name'>, contracts: C[]): C | undefined {
  return contracts.find(x => (p.post_number !== undefined && x.post_number === p.post_number) || (!!x.client_name && x.client_name === p.client_name));
}

export function clientMissionsFromPosts(
  posts: Pick<PostSession, 'status' | 'date' | 'post_number' | 'client_name' | 'client_id' | 'client_price_ar'>[],
  contracts: Pick<ClientContract, 'post_number' | 'client_name' | 'client_id' | 'client_price_ar' | 'post_type'>[],
  clients: ClientRecord[],
  prices: Parameters<typeof clientPriceWithClient>[2],
): ClientMission[] {
  const byId = new Map(clients.map(c => [c.id, c]));
  const out: ClientMission[] = [];
  for (const p of posts) {
    if (p.status !== 'completed') continue;
    const contract = matchContract(p, contracts);
    const id = p.client_id || contract?.client_id;
    const client = id ? byId.get(id) : undefined;
    if (!id || !client) continue; // pas de fiche (ou fiche supprimée) : la mission ne compte pour aucun client
    const own = typeof p.client_price_ar === 'number' && Number.isFinite(p.client_price_ar) && p.client_price_ar >= 0 ? p.client_price_ar : contract?.client_price_ar;
    out.push({ client_id: id, date: p.date, price_ar: clientPriceWithClient({ client_price_ar: own, post_type: contract?.post_type }, client, prices) });
  }
  return out;
}

export interface ClientMoney { received: number; payments: number; last_date: string | null }
/**
 * Argent reçu par client : les paiements (entrées « Finances ») dont le nom de client est le même que la fiche (comparé sans accents ni majuscules).
 * Les lignes d'argent n'ont pas de lien vers la fiche : si deux fiches ont le même nom, aucune ne reçoit ces paiements (on ne devine pas).
 */
export function clientReceived(cash: Pick<CashEntry, 'kind' | 'client_name' | 'amount_ar' | 'date'>[], clients: ClientRecord[]): Map<string, ClientMoney> {
  const idx = new Map<string, string[]>();
  for (const c of clients) { const k = normalizeName(c.name); if (!k) continue; const l = idx.get(k); if (l) l.push(c.id); else idx.set(k, [c.id]); }
  const out = new Map<string, ClientMoney>(clients.map(c => [c.id, { received: 0, payments: 0, last_date: null }]));
  for (const e of cash) {
    if (e.kind !== 'in' || !e.client_name || !validNum(e.amount_ar)) continue;
    const ids = idx.get(normalizeName(e.client_name));
    if (!ids || ids.length !== 1) continue;
    const m = out.get(ids[0])!;
    m.received += Math.round(e.amount_ar); m.payments++;
    if (!m.last_date || e.date > m.last_date) m.last_date = e.date;
  }
  return out;
}

/**
 * Nom officiel d'un nom saisi sur une ligne d'argent : si UNE seule fiche porte ce nom (sans accents ni majuscules), on rend le nom de la fiche
 * (« atelier  rivage » et « Atelier Rivage » comptent alors pour le même client). Sinon (aucune fiche, ou deux fiches de même nom) : le nom saisi, nettoyé.
 */
export function canonicalClientName(name: string, clients: ClientRecord[]): { name: string; id: string | null } {
  const raw = String(name || '').trim();
  const k = normalizeName(raw);
  if (!k) return { name: raw, id: null };
  const hits = clients.filter(c => normalizeName(c.name) === k);
  return hits.length === 1 ? { name: hits[0].name, id: hits[0].id } : { name: raw, id: null };
}

export type ClientSort = 'status' | 'revenue' | 'name' | 'recent';
export interface ClientFilter { q: string; status: ClientStatus | 'all' | 'archived'; sort: ClientSort }

/** Liste affichée : recherche (nom, contact, téléphone, e-mail), filtre de statut, tri. Les clients désactivés n'apparaissent que dans « Archivés ». */
export function filterClients(clients: ClientRecord[], summaries: Map<string, ClientSummary>, f: ClientFilter): ClientRecord[] {
  const q = normalizeName(f.q);
  const hit = (c: ClientRecord) => !q || [c.name, c.contact_name, c.phone, c.email].some(x => normalizeName(String(x || '')).includes(q));
  const list = clients.filter(c => {
    const archived = c.active === false;
    if (f.status === 'archived') { if (!archived) return false; }
    else if (archived) return false;
    else if (f.status !== 'all' && !(summaries.get(c.id)?.statuses || []).includes(f.status)) return false;
    return hit(c);
  });
  const rev = (c: ClientRecord) => summaries.get(c.id)?.revenue_12m || 0;
  const last = (c: ClientRecord) => summaries.get(c.id)?.last_date || '';
  const byName = (a: ClientRecord, b: ClientRecord) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (f.sort === 'name') return list.sort(byName);
  if (f.sort === 'revenue') return list.sort((a, b) => rev(b) - rev(a) || byName(a, b));
  if (f.sort === 'recent') return list.sort((a, b) => last(b).localeCompare(last(a)) || byName(a, b));
  return rankClients(list, summaries);
}

/** Nombre de clients par statut (pour les pastilles de filtre). Un client qui cumule compte dans chacun de ses statuts. Les archivés sont comptés à part. */
export function countByStatus(clients: ClientRecord[], summaries: Map<string, ClientSummary>): Record<ClientStatus | 'all' | 'archived', number> {
  const out: Record<string, number> = { all: 0, archived: 0, prospect: 0, new: 0, regular: 0, strategic: 0, inactive: 0, active: 0 };
  for (const c of clients) {
    if (c.active === false) { out.archived++; continue; }
    out.all++;
    for (const st of summaries.get(c.id)?.statuses || []) out[st]++;
  }
  return out as Record<ClientStatus | 'all' | 'archived', number>;
}

export { addDays };

// ---------- M1.5 : missions liées aux clients ----------

export interface MissionToLink {
  key: string; // nom normalisé : une ligne par nom (plusieurs missions peuvent porter le même texte)
  text: string; // le texte tel qu'écrit sur la première mission
  contract_ids: string[];
  count: number;
  suggestion: { client_id: string | null; ambiguous: boolean }; // client actif dont le nom est identique (sans accents ni majuscules)
}

/**
 * Anciennes missions sans client, regroupées par nom (le texte libre `client_name` de la mission). L'admin confirme UNE ligne à la fois.
 * Un poste « sans compte » (sans nom) n'est pas une mission à rattacher. Seuls les clients actifs sont proposés.
 */
export function missionsToLink(
  contracts: Pick<ClientContract, 'id' | 'client_name' | 'client_id' | 'no_account'>[],
  clients: ClientRecord[],
): MissionToLink[] {
  const groups = new Map<string, { text: string; ids: string[] }>();
  for (const c of contracts) {
    if (!c || c.client_id || c.no_account) continue;
    const text = String(c.client_name || '').trim();
    const key = normalizeName(text);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.ids.push(c.id); else groups.set(key, { text, ids: [c.id] });
  }
  const active = clients.filter(c => c.active !== false);
  const sug = new Map(suggestClientMatches([...groups.values()].map(g => g.text), active).map(s => [normalizeName(s.text), s]));
  return [...groups.entries()]
    .map(([key, g]) => ({ key, text: g.text, contract_ids: g.ids, count: g.ids.length, suggestion: { client_id: sug.get(key)?.client_id ?? null, ambiguous: sug.get(key)?.ambiguous ?? false } }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

export interface ClientChoice { id: string; name: string; archived: boolean }

/** Liste de choix pour une mission : clients actifs par ordre alphabétique (sans accents) ; le client déjà choisi reste dans la liste même s'il est archivé. */
export function clientChoices(clients: ClientRecord[], currentId?: string | null): ClientChoice[] {
  return clients
    .filter(c => c.active !== false || c.id === currentId)
    .map(c => ({ id: c.id, name: c.name, archived: c.active === false }))
    .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)) || a.id.localeCompare(b.id));
}

export type MissionClientError = 'required' | 'missing' | 'archived';
/**
 * Contrôle du client choisi pour une mission (mêmes règles pour la création et la modification).
 * `required` = réglage « Une mission a toujours un client » (page Conditions, Oui par défaut).
 * Un client archivé ne peut plus être choisi, sauf s'il l'est déjà sur cette mission (`current`).
 */
export function checkMissionClient(p: { required: boolean; clientId: string | null | undefined; clients: Pick<ClientRecord, 'id' | 'active'>[]; current?: string | null }): { ok: true; client_id: string | null } | { ok: false; error: MissionClientError } {
  const id = String(p.clientId || '');
  if (!id) return p.required ? { ok: false, error: 'required' } : { ok: true, client_id: null };
  const c = p.clients.find(x => x.id === id);
  if (!c) return { ok: false, error: 'missing' };
  if (c.active === false && id !== p.current) return { ok: false, error: 'archived' };
  return { ok: true, client_id: id };
}

/** Réglage « Une mission a toujours un client » (Oui par défaut quand rien n'est réglé). */
export const missionRequiresClient = (company: { options?: { mission_requires_client?: boolean } } | undefined | null): boolean =>
  company?.options?.mission_requires_client !== false;

export const MISSION_CLIENT_MESSAGE: Record<MissionClientError, { fr: string; en: string }> = {
  required: { fr: 'Choisis le client de cette mission (ou crée-le avec « Nouveau client »).', en: 'Choose this mission\'s client (or create it with “New client”).' },
  missing: { fr: 'Ce client n\'existe plus : choisis-en un autre.', en: 'This client no longer exists: choose another one.' },
  archived: { fr: 'Ce client est archivé : réactive-le dans la page Clients, ou choisis-en un autre.', en: 'This client is archived: reactivate it in the Clients page, or choose another one.' },
};
