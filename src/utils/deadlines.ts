// Date limite et priorité d'une mission (module 6, M6.1). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:deadlines`.
// Les mêmes règles de forme sont revérifiées par le serveur (bloc MISSIONS de df-api) ; `check:deadlines` compare les deux.
import { daysBetween } from './stats';

export type MissionPriority = 'Normale' | 'Haute' | 'Urgente';
export const PRIORITIES: MissionPriority[] = ['Normale', 'Haute', 'Urgente'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Vraie date du calendrier (le 31 février n'existe pas). */
export function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const isRealTime = (s: unknown): s is string => typeof s === 'string' && TIME_RE.test(s);

export type DeadlineError = 'date' | 'time' | 'time_without_date' | 'priority';
export interface DeadlineDraft { due_date?: unknown; due_time?: unknown; priority?: unknown }

/** Vérifie une saisie. Vide = pas de date limite (permis). Une heure sans date est refusée. */
export function checkDeadline(d: DeadlineDraft): { ok: true; due_date?: string; due_time?: string; priority: MissionPriority } | { ok: false; error: DeadlineError } {
  const date = d.due_date === undefined || d.due_date === null ? '' : d.due_date;
  const time = d.due_time === undefined || d.due_time === null ? '' : d.due_time;
  let priority: MissionPriority = 'Normale';
  if (d.priority !== undefined && d.priority !== null && d.priority !== '') {
    if (!PRIORITIES.includes(d.priority as MissionPriority)) return { ok: false, error: 'priority' };
    priority = d.priority as MissionPriority;
  }
  if (date !== '' && !isRealDate(date)) return { ok: false, error: 'date' };
  if (time !== '' && !isRealTime(time)) return { ok: false, error: 'time' };
  if (date === '' && time !== '') return { ok: false, error: 'time_without_date' };
  return { ok: true, ...(date !== '' ? { due_date: date as string } : {}), ...(time !== '' ? { due_time: time as string } : {}), priority };
}

export type DueKind = 'none' | 'late' | 'today' | 'soon' | 'later' | 'done';
export interface DueState { kind: DueKind; days: number | null } // days : jours restants (négatif = jours de retard)

/**
 * État de l'échéance. `done` = la mission est terminée : plus jamais « en retard ».
 * « En retard » : la date est passée, ou c'est aujourd'hui et l'heure (si elle existe) est passée.
 * « Bientôt » : dans les `soonDays` jours (2 par défaut).
 */
export function dueState(c: { due_date?: string; due_time?: string }, today: string, nowHHMM = '00:00', done = false, soonDays = 2): DueState {
  if (!isRealDate(c.due_date) || !isRealDate(today)) return { kind: 'none', days: null };
  if (done) return { kind: 'done', days: null };
  const days = daysBetween(today, c.due_date);
  if (days < 0) return { kind: 'late', days };
  if (days === 0) return { kind: isRealTime(c.due_time) && isRealTime(nowHHMM) && c.due_time < nowHHMM ? 'late' : 'today', days };
  return { kind: days <= Math.max(1, soonDays) ? 'soon' : 'later', days };
}

/** Clé de tri par échéance : les missions sans date vont en dernier ; à date égale, l'heure puis le numéro. */
export function dueSortKey(c: { due_date?: string; due_time?: string }): string {
  return isRealDate(c.due_date) ? `${c.due_date}T${isRealTime(c.due_time) ? c.due_time : '23:59'}` : '9999-99-99T99:99';
}

/** Libellé court de la pastille (FR/EN). Rend null s'il n'y a rien à montrer. */
export function dueLabel(s: DueState, lang: 'fr' | 'en'): string | null {
  const en = lang === 'en';
  if (s.kind === 'none' || s.kind === 'done' || s.days === null) return null;
  if (s.kind === 'late') { const n = Math.abs(s.days); return n === 0 ? (en ? 'Late (today)' : 'En retard (aujourd\'hui)') : en ? `Late by ${n} d` : `En retard de ${n} j`; }
  if (s.kind === 'today') return en ? 'Due today' : 'Échéance aujourd\'hui';
  return en ? `Due in ${s.days} d` : `Échéance dans ${s.days} j`;
}
