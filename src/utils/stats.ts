import type { ClientContract, PostSession, SalaryAdvanceRequest, User } from '../types';

// Calcul des périodes (jour, semaine, mois, année) et des chiffres de la page Statistiques.
// Fonctions pures : aucune lecture du store, aucun appel serveur, faciles à contrôler (voir scripts/check-stats.ts).
// Les dates sont des textes « AAAA-MM-JJ » (jour de Madagascar, comme dans les missions) ; les calculs se font en UTC pour éviter les décalages d'heure.

export type StatsGranularity = 'day' | 'week' | 'month' | 'year';

/** Période du premier au dernier jour, bornes comprises. */
export interface StatsRange { start: string; end: string; days: number }

const DAY_MS = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const toMs = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toStr = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (s: string, n: number) => toStr(toMs(s) + n * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** Le jour d'aujourd'hui à Madagascar (UTC+3), quel que soit le fuseau de l'appareil. */
export const todayMada = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' });

export function periodRange(g: StatsGranularity, anchor: string): StatsRange {
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
  let start: string, end: string;
  if (g === 'day') { start = end = anchor; }
  else if (g === 'week') {
    const dow = new Date(toMs(anchor)).getUTCDay(); // 0 = dimanche
    start = addDays(anchor, -((dow + 6) % 7)); // la semaine commence le lundi
    end = addDays(start, 6);
  } else if (g === 'month') {
    start = `${y}-${pad(m)}-01`;
    end = toStr(Date.UTC(y, m, 0)); // le jour 0 du mois suivant = dernier jour de ce mois
  } else { start = `${y}-01-01`; end = `${y}-12-31`; }
  return { start, end, days: daysBetween(start, end) + 1 };
}

/** Recule (delta < 0) ou avance (delta > 0) d'une période. Mois et année : on retombe sur le 1er. */
export function shiftAnchor(g: StatsGranularity, anchor: string, delta: number): string {
  if (g === 'day') return addDays(anchor, delta);
  if (g === 'week') return addDays(anchor, 7 * delta);
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
  if (g === 'month') { const t = new Date(Date.UTC(y, m - 1 + delta, 1)); return toStr(t.getTime()); }
  return `${y + delta}-01-01`;
}

export interface ComparableRanges {
  cur: StatsRange; // période choisie
  curEff: StatsRange; // période choisie, coupée à aujourd'hui si elle n'est pas finie
  prev: StatsRange; // période d'avant, coupée au même nombre de jours que curEff (comparaison juste)
  prevFull: StatsRange; // période d'avant, entière
  isFuture: boolean; // la période commence après aujourd'hui
  inProgress: boolean; // la période a commencé et n'est pas finie
}

export function comparableRanges(g: StatsGranularity, anchor: string, today: string): ComparableRanges {
  const cur = periodRange(g, anchor);
  const prevFull = periodRange(g, shiftAnchor(g, anchor, -1));
  const isFuture = today < cur.start;
  const inProgress = today >= cur.start && today < cur.end;
  const curEff: StatsRange = inProgress ? { start: cur.start, end: today, days: daysBetween(cur.start, today) + 1 } : cur;
  let prev = prevFull;
  if (inProgress) {
    const end = addDays(prevFull.start, curEff.days - 1);
    prev = { start: prevFull.start, end: end > prevFull.end ? prevFull.end : end, days: 0 };
    prev.days = daysBetween(prev.start, prev.end) + 1;
  }
  return { cur, curEff, prev, prevFull, isFuture, inProgress };
}

const inRange = (date: string | undefined, r: StatsRange) => !!date && date.slice(0, 10) >= r.start && date.slice(0, 10) <= r.end;

/** Titre de la période : « 18 oct. 2026 », « Semaine du 12 au 18 oct. 2026 », « Octobre 2026 », « 2026 ». */
export function periodLabel(g: StatsGranularity, anchor: string, lang: 'fr' | 'en' = 'fr'): string {
  const r = periodRange(g, anchor);
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const f = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o }).format(new Date(toMs(s)));
  if (g === 'day') return f(r.start, { day: 'numeric', month: 'short', year: 'numeric' });
  if (g === 'week') {
    const a = f(r.start, { day: 'numeric', ...(r.start.slice(0, 7) === r.end.slice(0, 7) ? {} : { month: 'short' }) });
    const b = f(r.end, { day: 'numeric', month: 'short', year: 'numeric' });
    return lang === 'en' ? `Week of ${a} – ${b}` : `Semaine du ${a} au ${b}`;
  }
  if (g === 'month') { const t = f(r.start, { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  return f(r.start, { year: 'numeric' });
}

// ---------- Barres des graphiques ----------

export interface Buckets { labels: string[]; count: number; index: (date: string, time?: string) => number }

/** Jour : 24 heures · Semaine / Mois : un par jour · Année : un par mois. */
export function buckets(g: StatsGranularity, range: StatsRange, lang: 'fr' | 'en' = 'fr'): Buckets {
  if (g === 'day') {
    return { labels: Array.from({ length: 24 }, (_, h) => String(h)), count: 24, index: (_d, t) => { const h = Number((t || '00:00').slice(0, 2)); return Number.isFinite(h) && h >= 0 && h < 24 ? h : 0; } };
  }
  if (g === 'year') {
    const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
    const labels = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'short' }).format(new Date(Date.UTC(2000, i, 1))).replace('.', ''));
    return { labels, count: 12, index: d => Number(d.slice(5, 7)) - 1 };
  }
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const labels = Array.from({ length: range.days }, (_, i) => {
    const s = addDays(range.start, i);
    return g === 'week' ? new Intl.DateTimeFormat(loc, { timeZone: 'UTC', weekday: 'short' }).format(new Date(toMs(s))).replace('.', '') : String(Number(s.slice(8, 10)));
  });
  return { labels, count: range.days, index: d => daysBetween(range.start, d.slice(0, 10)) };
}

// ---------- Variation ----------

export interface Variation { pct: number | null; dir: 'up' | 'down' | 'flat' }

/** Variation en % entre la période choisie et celle d'avant. pct = null quand l'avant vaut 0 (pas de pourcentage possible). */
export function variation(cur: number, prev: number): Variation {
  if (cur === prev) return { pct: prev === 0 ? null : 0, dir: 'flat' };
  if (prev === 0) return { pct: null, dir: cur > 0 ? 'up' : 'down' };
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

// ---------- Chiffres ----------

export interface StatsInput {
  posts: PostSession[];
  contracts: ClientContract[];
  users: User[];
  advances: SalaryAdvanceRequest[];
  pricePerMission: number; // repli si une mission validée n'a pas de montant calculé
}

const minutesOf = (p: PostSession): number | null => {
  if (!p.end_time) return null;
  const s = new Date(`${p.date}T${p.start_time || '00:00:00'}Z`).getTime();
  let e = new Date(`${p.date}T${p.end_time}Z`).getTime();
  if (isNaN(s) || isNaN(e)) return null;
  if (e < s) e += DAY_MS; // passage de minuit
  const m = Math.round((e - s) / 60000);
  return m >= 0 && m <= 24 * 60 ? m : null;
};

/** Montant gagné pour une mission validée : le montant calculé à la validation (même règle que la paie), sinon le tarif fixe. */
export const missionAmount = (p: PostSession, fallback: number): number => Math.max(0, Math.round(typeof p.calculated_ar === 'number' ? p.calculated_ar : fallback));

interface Totals { done: number; rejected: number; rate: number | null; earned: number; advances: number; avgMin: number | null; workers: number }

function totalsFor(input: StatsInput, r: StatsRange): Totals {
  const posts = input.posts.filter(p => inRange(p.date, r));
  const done = posts.filter(p => p.status === 'completed');
  const rejected = posts.filter(p => p.status === 'rejected').length;
  const mins = done.map(minutesOf).filter((m): m is number => m !== null);
  return {
    done: done.length,
    rejected,
    rate: done.length + rejected > 0 ? Math.round((done.length / (done.length + rejected)) * 100) : null,
    earned: done.reduce((t, p) => t + missionAmount(p, input.pricePerMission), 0),
    advances: input.advances.filter(a => a.status === 'approved' && inRange(a.request_date, r)).reduce((t, a) => t + (a.amount_ar || 0), 0),
    avgMin: mins.length ? Math.round(mins.reduce((t, m) => t + m, 0) / mins.length) : null,
    workers: new Set(done.map(p => p.employee_id)).size,
  };
}

export interface RankRow { id: string; name: string; done: number; earned: number; workMin: number }

export interface StatsResult {
  ranges: ComparableRanges;
  cur: Totals;
  prev: Totals;
  labels: string[];
  series: { done: number[]; earned: number[]; prevDone: number[] };
  byType: { label: string; count: number }[];
  upcoming: { todo: number; active: number; toValidate: number; urgent: number; total: number };
  team: { active: number; day: number; night: number; ranking: RankRow[]; idle: string[]; perHead: number | null };
  salary: { pendingAdvanceCount: number; pendingAdvanceAr: number; perHead: number | null };
}

const typeOf = (p: PostSession, contracts: ClientContract[]): string => {
  const c = contracts.find(x => (p.post_number !== undefined && x.post_number === p.post_number) || x.client_name === p.client_name);
  return (c?.post_type || '').trim() || 'Autre';
};

export function computeStats(input: StatsInput, g: StatsGranularity, anchor: string, today: string, lang: 'fr' | 'en' = 'fr'): StatsResult {
  const ranges = comparableRanges(g, anchor, today);
  const cur = ranges.isFuture ? { done: 0, rejected: 0, rate: null, earned: 0, advances: 0, avgMin: null, workers: 0 } as Totals : totalsFor(input, ranges.curEff);
  const prev = totalsFor(input, ranges.prev);

  // Barres : la période choisie, et la période d'avant (même nombre de barres)
  const b = buckets(g, ranges.cur, lang);
  const bp = buckets(g, ranges.prevFull, lang);
  const done = new Array(b.count).fill(0), earned = new Array(b.count).fill(0), prevDone = new Array(bp.count).fill(0);
  for (const p of input.posts) {
    if (p.status !== 'completed') continue;
    if (!ranges.isFuture && inRange(p.date, ranges.curEff)) { const i = b.index(p.date, p.start_time); if (i >= 0 && i < b.count) { done[i]++; earned[i] += missionAmount(p, input.pricePerMission); } }
    if (inRange(p.date, ranges.prevFull)) { const i = bp.index(p.date, p.start_time); if (i >= 0 && i < bp.count) prevDone[i]++; }
  }

  // Par type de mission
  const types = new Map<string, number>();
  if (!ranges.isFuture) for (const p of input.posts) if (p.status === 'completed' && inRange(p.date, ranges.curEff)) { const t = typeOf(p, input.contracts); types.set(t, (types.get(t) || 0) + 1); }
  const byType = [...types.entries()].map(([label, count]) => ({ label, count })).sort((a, c) => c.count - a.count);

  // Missions à venir (état actuel du tableau, pas lié à la période)
  const board = input.contracts.filter(c => !c.no_account);
  const sessionStatus = (c: ClientContract) => input.posts.find(p => p.post_number === c.post_number && ['active', 'pending_start', 'pending_end'].includes(p.status))?.status;
  let todo = 0, active = 0, toValidate = 0, urgent = 0;
  for (const c of board) {
    const s = sessionStatus(c);
    if (s === 'active') active++;
    else if (s === 'pending_start' || s === 'pending_end') toValidate++;
    else { todo++; if (c.priority === 'Urgente') urgent++; }
  }

  // Équipe
  const employees = input.users.filter(u => u.role === 'employee' && u.status === 'active');
  const ranking: RankRow[] = employees.map(u => {
    const mine = ranges.isFuture ? [] : input.posts.filter(p => p.employee_id === u.id && p.status === 'completed' && inRange(p.date, ranges.curEff));
    return { id: u.id, name: u.name, done: mine.length, earned: mine.reduce((t, p) => t + missionAmount(p, input.pricePerMission), 0), workMin: mine.reduce((t, p) => t + (minutesOf(p) || 0), 0) };
  }).sort((a, c) => c.done - a.done || c.earned - a.earned || a.name.localeCompare(c.name));
  const pendingAdv = input.advances.filter(a => a.status === 'pending');

  return {
    ranges, cur, prev,
    labels: b.labels,
    series: { done, earned, prevDone },
    byType,
    upcoming: { todo, active, toValidate, urgent, total: board.length },
    team: {
      active: employees.length,
      day: employees.filter(u => u.shift === 'day').length,
      night: employees.filter(u => u.shift === 'night').length,
      ranking,
      idle: ranking.filter(r => r.done === 0).map(r => r.name),
      perHead: cur.workers > 0 ? Math.round((cur.done / cur.workers) * 10) / 10 : null,
    },
    salary: {
      pendingAdvanceCount: pendingAdv.length,
      pendingAdvanceAr: pendingAdv.reduce((t, a) => t + (a.amount_ar || 0), 0),
      perHead: cur.workers > 0 ? Math.round(cur.earned / cur.workers) : null,
    },
  };
}
