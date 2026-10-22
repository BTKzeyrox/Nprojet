// Registre et moteur d'alertes (module 11) : exécute les règles de chaque page, ne garde que des alertes valides,
// sans doublon, triées, et applique « Ignorer / Vérifié ». Aucune règle ne peut faire tomber les autres.
import type { AppSettings, CashEntry, Client, ClientContract, PostSession, Product, SalaryAdvanceRequest, StockMove, User } from '../../types';
import { HEALTH_PAGES, severityRank, type HealthAck, type HealthAlert, type HealthPage, type HealthSeverity, type HealthThresholds } from './types';

/** Tout ce qu'une règle a le droit de lire. Les règles ne changent jamais ces données. */
export interface HealthContext {
  today: string; // AAAA-MM-JJ (Madagascar)
  now: number; // millisecondes (pour les « depuis N heures »)
  users: User[]; posts: PostSession[]; contracts: ClientContract[]; clients: Client[];
  cash: CashEntry[]; products: Product[]; moves: StockMove[]; advances: SalaryAdvanceRequest[];
  settings: Partial<AppSettings>;
  thresholds: HealthThresholds;
  /** Lectures serveur faites par l'admin (listes qui existent déjà). `undefined` ou `null` = pas chargé : les règles « système » se taisent. */
  backups?: { taken_at: string }[] | null;
  errors?: { id?: string; kind?: string; message?: string; count?: number; last_seen?: string; status?: string }[] | null;
}

export interface HealthRule { id: string; page: HealthPage; run: (ctx: HealthContext) => HealthAlert[] }
export interface HealthRun { alerts: HealthAlert[]; errors: { rule: string; message: string }[] }

const ID_RE = /^[a-z]+:[a-z0-9_-]+(:[a-z0-9_-]+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEVERITIES = ['info', 'watch', 'urgent'];
const BAD_TEXT = /NaN|Infinity|undefined|\[object|\bnull\b/;
const LIMITS = { title: 120, why: 400, todo: 300, reason: 200 };

/** « Un minimum de données avant d'alerter » : vrai si on a au moins `min` éléments. */
export const hasEnough = (count: number, min: number): boolean => Number.isFinite(count) && count >= min;

const slug = (s: string): string => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Identifiant stable : page + règle (+ sujet, ex. l'identifiant d'un salarié). Le même problème donne toujours le même identifiant. */
export function alertId(page: HealthPage, rule: string, subject?: string | number): string {
  const r = slug(rule);
  if (!HEALTH_PAGES.includes(page) || !r) throw new Error(`alertId : page ou règle invalide (${page}, ${rule})`);
  const s = subject === undefined || subject === null ? '' : slug(String(subject));
  return s ? `${page}:${r}:${s}` : `${page}:${r}`;
}

/** Vrai si l'alerte respecte le format commun (champs, gravité, date, texte propre). `why` dit ce qui ne va pas, sinon null. */
export function alertProblem(a: unknown): string | null {
  const x = a as Partial<HealthAlert> | null;
  if (!x || typeof x !== 'object') return 'pas un objet';
  if (typeof x.id !== 'string' || !ID_RE.test(x.id)) return 'identifiant';
  if (!HEALTH_PAGES.includes(x.page as HealthPage)) return 'page';
  if (!x.id.startsWith(`${x.page}:`)) return 'identifiant d\'une autre page';
  if (typeof x.rule !== 'string' || !x.rule) return 'règle';
  if (!SEVERITIES.includes(x.severity as string)) return 'gravité';
  for (const k of ['title_fr', 'title_en', 'why_fr', 'why_en'] as const) if (typeof x[k] !== 'string' || !x[k]!.trim()) return k;
  for (const k of ['todo_fr', 'todo_en'] as const) if (x[k] !== undefined && (typeof x[k] !== 'string' || !x[k]!.trim())) return k;
  if (x.title_fr!.length > LIMITS.title || x.title_en!.length > LIMITS.title) return 'titre trop long';
  if (x.why_fr!.length > LIMITS.why || x.why_en!.length > LIMITS.why) return 'explication trop longue';
  if ((x.todo_fr || '').length > LIMITS.todo || (x.todo_en || '').length > LIMITS.todo) return 'conseil trop long';
  for (const k of ['title_fr', 'title_en', 'why_fr', 'why_en', 'todo_fr', 'todo_en'] as const) if (x[k] && BAD_TEXT.test(x[k]!)) return `texte sale (${k})`;
  if (x.since !== null && !(typeof x.since === 'string' && DATE_RE.test(x.since))) return 'date « depuis »';
  if (x.value !== undefined && !(typeof x.value === 'number' && Number.isFinite(x.value))) return 'valeur';
  if (!x.go || typeof x.go.view !== 'string' || !x.go.view) return 'destination';
  return null;
}

/** Exécute les règles. Une règle qui plante, ou qui rend une alerte fausse, est notée dans `errors` et n'empêche rien d'autre. */
export function runHealth(ctx: HealthContext, rules: HealthRule[]): HealthRun {
  const errors: HealthRun['errors'] = [];
  const best = new Map<string, HealthAlert>();
  for (const rule of rules) {
    let list: HealthAlert[];
    try { list = rule.run(ctx) || []; } catch (e: any) { errors.push({ rule: rule.id, message: String(e?.message || e).slice(0, 200) }); continue; }
    for (const a of list) {
      const p = alertProblem(a);
      if (p) { errors.push({ rule: rule.id, message: `alerte refusée : ${p}` }); continue; }
      if (a.page !== rule.page) { errors.push({ rule: rule.id, message: 'alerte refusée : page différente de celle de la règle' }); continue; }
      const old = best.get(a.id);
      if (!old || severityRank(a.severity) < severityRank(old.severity)) best.set(a.id, a); // pas de doublon : la plus grave gagne
    }
  }
  return { alerts: sortAlerts([...best.values()]), errors };
}

/** Du plus grave au moins grave ; à gravité égale, le plus ancien d'abord (inconnu à la fin) ; puis par identifiant (ordre stable). */
export function sortAlerts(list: HealthAlert[]): HealthAlert[] {
  return [...list].sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || (a.since === b.since ? 0 : a.since === null ? 1 : b.since === null ? -1 : a.since < b.since ? -1 : 1)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type PageState = 'ok' | 'watch' | 'urgent';
/** Un état par page (pas de « note globale ») : Urgent si une alerte urgente, À voir si une alerte à voir, sinon OK (les infos ne changent pas l'état). */
export function pageStates(alerts: HealthAlert[], pages: readonly HealthPage[] = HEALTH_PAGES): Record<HealthPage, PageState> {
  const out = {} as Record<HealthPage, PageState>;
  for (const p of pages) out[p] = 'ok';
  for (const a of alerts) {
    if (!(a.page in out)) continue;
    if (a.severity === 'urgent') out[a.page] = 'urgent';
    else if (a.severity === 'watch' && out[a.page] === 'ok') out[a.page] = 'watch';
  }
  return out;
}
export function countsByPage(alerts: HealthAlert[]): Partial<Record<HealthPage, { urgent: number; watch: number; info: number }>> {
  const out: Partial<Record<HealthPage, { urgent: number; watch: number; info: number }>> = {};
  for (const a of alerts) { const c = out[a.page] || (out[a.page] = { urgent: 0, watch: 0, info: 0 }); c[a.severity as HealthSeverity]++; }
  return out;
}

/** Nettoie une marque « Ignorer / Vérifié » (raison coupée à 200 caractères). Null si elle est inutilisable. */
export function cleanAck(a: Partial<HealthAck> | null | undefined): HealthAck | null {
  if (!a || typeof a.id !== 'string' || !ID_RE.test(a.id)) return null;
  if (a.status !== 'ignored' && a.status !== 'checked') return null;
  if (!SEVERITIES.includes(a.severity_at as string)) return null;
  if (typeof a.at !== 'string' || Number.isNaN(Date.parse(a.at))) return null;
  if (a.until !== undefined && a.until !== null && !(typeof a.until === 'string' && DATE_RE.test(a.until))) return null;
  if (a.value_at !== undefined && !(typeof a.value_at === 'number' && Number.isFinite(a.value_at))) return null;
  return {
    id: a.id, status: a.status, reason: String(a.reason || '').trim().slice(0, LIMITS.reason), at: a.at,
    ...(a.until ? { until: a.until } : {}), severity_at: a.severity_at as HealthSeverity, ...(a.value_at !== undefined ? { value_at: a.value_at } : {}),
  };
}

/**
 * Cache les alertes déjà vues. Une alerte REVIENT si : (1) elle est plus grave qu'à la marque, (2) sa mesure a augmenté,
 * (3) la date « jusqu'au » est atteinte, (4) « Ignorer » sans date : `ignoreDays` jours se sont passés.
 */
export function applyAcks(alerts: HealthAlert[], acks: HealthAck[], today: string, ignoreDays: number): { visible: HealthAlert[]; hidden: HealthAlert[] } {
  const byId = new Map<string, HealthAck>();
  for (const raw of acks) { const a = cleanAck(raw); if (a) byId.set(a.id, a); }
  const visible: HealthAlert[] = [], hidden: HealthAlert[] = [];
  for (const al of alerts) {
    const ack = byId.get(al.id);
    if (!ack) { visible.push(al); continue; }
    const worse = severityRank(al.severity) < severityRank(ack.severity_at);
    const grew = typeof al.value === 'number' && typeof ack.value_at === 'number' && al.value > ack.value_at;
    const day = ack.at.slice(0, 10);
    const expired = ack.until ? today >= ack.until : ack.status === 'ignored' && daysBetweenIso(day, today) >= ignoreDays;
    (worse || grew || expired ? visible : hidden).push(al);
  }
  return { visible, hidden };
}

function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
