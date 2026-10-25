// Missions récurrentes (module 15, M15.1). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:recurring`.
// Une règle dit : « tous les jours / certains jours de la semaine / un jour du mois, à telle heure, créer cette mission ».
// Le serveur (tâche planifiée toutes les 15 min) crée la mission ; l'identifiant est calculé (règle + date), donc jamais de doublon.
// Les heures sont celles de Madagascar (UTC+3). Une occurrence manquée (serveur arrêté plus de 2 h) n'est PAS rattrapée.
// Le serveur utilise le même code, copié mot pour mot dans le bloc RECURRING de df-api ; `check:recurring` compare les deux textes.

type ProofMode = 'type' | 'none' | 'photo' | 'note' | 'both';
type Frequency = 'daily' | 'weekly' | 'monthly';
type Priority = 'Normale' | 'Haute' | 'Urgente';

export interface RecurringRule {
  id: string; name: string; title: string; post_type?: string; description?: string; proof_mode: ProofMode;
  objective: number; client_id?: string; priority: Priority; due_after_days?: number; due_time?: string;
  frequency: Frequency; weekdays: number[]; month_day: number; time: string; start_date: string; end_date?: string; active: boolean;
}

export const RECURRING_LIMITS = { max: 20, id: 40, name: 60, title: 80, type: 40, description: 500, objective: 1000000, dueAfter: 30 };
export const RECURRING_GRACE_MS = 2 * 60 * 60 * 1000; // une occurrence se crée dans les 2 h qui suivent l'heure prévue
export const MADAGASCAR_OFFSET_H = 3;

const RC_PROOFS = ['type', 'none', 'photo', 'note', 'both'];
const RC_PRIORITIES = ['Normale', 'Haute', 'Urgente'];
const RC_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const RC_BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const rcClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

export const rcIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export const rcIsTime = (s: unknown): boolean => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export type RecurringError = 'name' | 'title' | 'duplicate' | 'limit' | 'proof' | 'priority' | 'objective' | 'due' | 'frequency' | 'weekdays' | 'month_day' | 'time' | 'start' | 'end' | 'format';
export interface RecurringDraft { [k: string]: unknown }

/** Vérifie une règle saisie. `others` = les autres règles (deux noms identiques refusés, 20 au plus). */
export function checkRecurring(d: RecurringDraft, others: RecurringRule[]): { ok: true; value: RecurringRule } | { ok: false; error: RecurringError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => RC_BAD_KEYS.includes(k))) return { ok: false, error: 'format' };
  for (const k of ['id', 'name', 'title', 'post_type', 'description', 'client_id', 'due_time', 'time', 'start_date', 'end_date']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const name = rcClean(d.name ?? '', RECURRING_LIMITS.name);
  if (!name) return { ok: false, error: 'name' };
  const title = rcClean(d.title ?? '', RECURRING_LIMITS.title);
  if (!title) return { ok: false, error: 'title' };
  const id = rcClean(d.id ?? '', RECURRING_LIMITS.id);
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'format' };
  if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' };
  if (!id && others.length >= RECURRING_LIMITS.max) return { ok: false, error: 'limit' };
  const proof = d.proof_mode === undefined || d.proof_mode === null || d.proof_mode === '' ? 'type' : d.proof_mode;
  if (typeof proof !== 'string' || !RC_PROOFS.includes(proof)) return { ok: false, error: 'proof' };
  const prio = d.priority === undefined || d.priority === null || d.priority === '' ? 'Normale' : d.priority;
  if (typeof prio !== 'string' || !RC_PRIORITIES.includes(prio)) return { ok: false, error: 'priority' };
  const obj = d.objective === undefined || d.objective === null || d.objective === '' ? 0 : d.objective;
  if (typeof obj !== 'number' || !Number.isFinite(obj) || obj < 0 || obj > RECURRING_LIMITS.objective) return { ok: false, error: 'objective' };
  const hasDue = d.due_after_days !== undefined && d.due_after_days !== null && d.due_after_days !== '';
  const dueDays = d.due_after_days as unknown;
  if (hasDue && (typeof dueDays !== 'number' || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > RECURRING_LIMITS.dueAfter)) return { ok: false, error: 'due' };
  const dueTime = d.due_time === undefined || d.due_time === null ? '' : d.due_time;
  if (dueTime !== '' && (!rcIsTime(dueTime) || !hasDue)) return { ok: false, error: 'due' };
  const freq = d.frequency;
  if (typeof freq !== 'string' || !RC_FREQUENCIES.includes(freq)) return { ok: false, error: 'frequency' };
  let weekdays: number[] = [];
  if (freq === 'weekly') {
    const w = d.weekdays;
    if (!Array.isArray(w) || w.length < 1 || w.length > 7 || w.some((x) => typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > 7)) return { ok: false, error: 'weekdays' };
    weekdays = Array.from(new Set(w as number[])).sort((a, b) => a - b);
  }
  let monthDay = 1;
  if (freq === 'monthly') {
    const m = d.month_day;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 31) return { ok: false, error: 'month_day' };
    monthDay = m;
  }
  if (!rcIsTime(d.time)) return { ok: false, error: 'time' };
  if (!rcIsDate(d.start_date)) return { ok: false, error: 'start' };
  const end = d.end_date === undefined || d.end_date === null ? '' : d.end_date;
  if (end !== '' && (!rcIsDate(end) || (end as string) < (d.start_date as string))) return { ok: false, error: 'end' };
  if (d.active !== undefined && typeof d.active !== 'boolean') return { ok: false, error: 'format' };
  const value: RecurringRule = {
    id, name, title, proof_mode: proof as ProofMode, objective: Math.round(obj), priority: prio as Priority,
    frequency: freq as Frequency, weekdays, month_day: monthDay, time: d.time as string, start_date: d.start_date as string, active: d.active !== false,
  };
  const type = rcClean(d.post_type ?? '', RECURRING_LIMITS.type); if (type) value.post_type = type;
  const desc = rcClean(d.description ?? '', RECURRING_LIMITS.description); if (desc) value.description = desc;
  const cid = rcClean(d.client_id ?? '', RECURRING_LIMITS.id); if (cid) value.client_id = cid;
  if (hasDue) { value.due_after_days = dueDays as number; if (dueTime !== '') value.due_time = dueTime as string; }
  if (end !== '') value.end_date = end as string;
  return { ok: true, value };
}

/** Nettoie une liste reçue (réglages) : les règles fausses sont ignorées, jamais d'erreur. */
export function cleanRecurring(list: unknown): RecurringRule[] {
  if (!Array.isArray(list)) return [];
  const out: RecurringRule[] = [];
  for (const raw of list) {
    if (out.length >= RECURRING_LIMITS.max) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as RecurringDraft).id;
    if (typeof id !== 'string' || !id) continue;
    const v = checkRecurring(raw as RecurringDraft, out.filter((o) => o.id !== id));
    if (v.ok && !out.some((o) => o.id === v.value.id)) out.push(v.value);
  }
  return out;
}

const rcDaysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const rcWeekday = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };
export const rcAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Vrai si la règle tombe ce jour-là (date AAAA-MM-JJ) : dans ses dates et selon sa fréquence. L'état « actif » n'est pas regardé ici. */
export function runsOn(rule: RecurringRule, ymd: string): boolean {
  if (!rcIsDate(ymd) || ymd < rule.start_date || (rule.end_date && ymd > rule.end_date)) return false;
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekly') return rule.weekdays.includes(rcWeekday(ymd));
  const [y, m, d] = ymd.split('-').map(Number);
  return d === Math.min(rule.month_day, rcDaysIn(y, m)); // le 31 tombe le dernier jour des mois plus courts
}

/** Heure prévue (en millisecondes UTC) pour un jour et une heure de Madagascar. */
export const scheduledMs = (ymd: string, time: string): number => {
  const [y, m, d] = ymd.split('-').map(Number); const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh - MADAGASCAR_OFFSET_H, mm);
};
/** Date du jour à Madagascar. */
export const madagascarDate = (nowMs: number): string => new Date(nowMs + MADAGASCAR_OFFSET_H * 3600000).toISOString().slice(0, 10);

/** Identifiant de la mission créée : toujours le même pour une règle et un jour. C'est ce qui empêche les doublons. */
export const occurrenceId = (ruleId: string, ymd: string): string => `rec-${ruleId}-${ymd.replace(/-/g, '')}`;

export interface Occurrence { rule: RecurringRule; date: string; id: string; at: number }

/** Les missions à créer maintenant : règle active, jour concerné, heure prévue passée depuis moins de 2 h. */
export function dueOccurrences(rules: RecurringRule[], nowMs: number, graceMs: number = RECURRING_GRACE_MS): Occurrence[] {
  const today = madagascarDate(nowMs);
  const days = [rcAddDays(today, -1), today];
  const out: Occurrence[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of days) {
      if (!runsOn(rule, date)) continue;
      const at = scheduledMs(date, rule.time);
      if (nowMs >= at && nowMs < at + graceMs) out.push({ rule, date, id: occurrenceId(rule.id, date), at });
    }
  }
  return out;
}

/** La mission à enregistrer (même forme qu'une mission créée à la main). `postNumber` = numéro libre, `rewardAr` = prix par défaut des réglages. */
export function buildContract(rule: RecurringRule, ymd: string, postNumber: number, rewardAr: number): Record<string, unknown> {
  const c: Record<string, unknown> = {
    id: occurrenceId(rule.id, ymd), post_number: postNumber, client_name: rule.title, account_tag: `ACC-${postNumber}`, game_mode: '',
    description: rule.description || '', post_type: rule.post_type || '', proof_mode: rule.proof_mode,
    current_rank: '—', target_rank: '—', initial_score: 0, target_score: rule.objective, recommended_shift: 'any',
    estimated_reward_ar: Math.round(rewardAr || 0), priority: rule.priority, region_server: '—', no_account: false,
    recurring_rule_id: rule.id, recurring_date: ymd,
  };
  if (rule.client_id) c.client_id = rule.client_id;
  if (rule.due_after_days !== undefined) { c.due_date = rcAddDays(ymd, rule.due_after_days); if (rule.due_time) c.due_time = rule.due_time; }
  return c;
}

/** Prochaine exécution après `nowMs` (millisecondes UTC), ou null (règle arrêtée, finie ou sans jour). */
export function nextRun(rule: RecurringRule, nowMs: number): number | null {
  if (!rule.active) return null;
  let day = madagascarDate(nowMs);
  for (let i = 0; i < 400; i++, day = rcAddDays(day, 1)) {
    if (!runsOn(rule, day)) continue;
    const at = scheduledMs(day, rule.time);
    if (at > nowMs) return at;
  }
  return null;
}

const RC_DAYS_FR = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const RC_DAYS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Phrase courte : « Chaque jour à 08:00 », « Chaque lundi, jeudi à 08:00 », « Le 15 de chaque mois à 08:00 ». */
export function describeRule(rule: RecurringRule, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  if (rule.frequency === 'daily') return fr ? `Chaque jour à ${rule.time}` : `Every day at ${rule.time}`;
  if (rule.frequency === 'weekly') return fr ? `Chaque ${rule.weekdays.map((d) => RC_DAYS_FR[d]).join(', ')} à ${rule.time}` : `Every ${rule.weekdays.map((d) => RC_DAYS_EN[d]).join(', ')} at ${rule.time}`;
  return fr ? `Le ${rule.month_day}${rule.month_day === 1 ? 'er' : ''} de chaque mois à ${rule.time}` : `On day ${rule.month_day} of each month at ${rule.time}`;
}

export const RECURRING_MESSAGE: Record<RecurringError, string> = {
  name: 'Donne un nom à la règle.', title: 'Donne un titre à la mission.', duplicate: 'Une règle porte déjà ce nom.', limit: 'Maximum 20 règles.',
  proof: 'Justificatif non valide.', priority: 'Priorité non valide.', objective: 'Quantité à faire : un nombre de 0 à 1 000 000.',
  due: 'Date limite : 0 à 30 jours après la création ; l\'heure limite demande ce délai.', frequency: 'Choisis : chaque jour, chaque semaine ou chaque mois.',
  weekdays: 'Choisis au moins un jour de la semaine.', month_day: 'Jour du mois : de 1 à 31.', time: 'Heure non valide (HH:MM).',
  start: 'Date de début non valide.', end: 'La date de fin doit être égale ou après le début.', format: 'Règle non valide.',
};

/** Nouvel identifiant de règle (lettres, chiffres, tiret). */
export const newRecurringId = (existing: RecurringRule[]): string => { let id = `rr-${Date.now().toString(36)}`; for (let k = 2; existing.some((r) => r.id === id); k++) id = `rr-${Date.now().toString(36)}-${k}`; return id; };
