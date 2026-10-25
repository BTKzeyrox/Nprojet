// Planning des équipes (module 15, M15.2). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:planning`.
// Une entrée = un salarié, un jour, une vacation : Jour, Nuit ou Repos. Elle vit dans la table `df_shifts` (collection `shifts`).
// L'identifiant est calculé (salarié + date) : deux entrées pour le même salarié et le même jour sont impossibles.
// Seul le responsable écrit ; un salarié ne reçoit que SON planning. Les congés ACCEPTÉS sont pris en compte (conflit signalé, rien n'est refusé).
// Le bloc « BEGIN SHIFTS … END SHIFTS » est copié mot pour mot dans df-api (bloc SHIFTS) : `check:planning` compare les deux textes.
// IMPORTANT : ce bloc ne doit utiliser ni import ni constante extérieure.

export type ShiftKind = 'day' | 'night' | 'off';
export interface Shift { id: string; employee_id: string; date: string; kind: ShiftKind; note?: string; created_at: string; updated_at: string; updated_by: string }

// BEGIN SHIFTS
const SH_KINDS = ['day', 'night', 'off'];
const SH_NOTE_MAX = 120;
const SH_WINDOW_DAYS = 400; // on ne planifie pas plus de 400 jours avant ou après aujourd'hui
const shClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const shIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const shAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Identifiant d'une entrée : toujours le même pour un salarié et un jour. */
const shiftId = (employeeId: string, ymd: string): string => `sh-${employeeId}-${ymd.replace(/-/g, '')}`;

type ShiftError = 'employee' | 'date' | 'kind' | 'note' | 'id' | 'format';
/** Vérifie une entrée saisie. */
function checkShift(d: { [k: string]: unknown }): { ok: true; value: { id: string; employee_id: string; date: string; kind: string; note?: string } } | { ok: false; error: ShiftError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  for (const k of ['id', 'employee_id', 'date', 'kind', 'note']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const emp = typeof d.employee_id === 'string' ? d.employee_id.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(emp)) return { ok: false, error: 'employee' };
  if (!shIsDate(d.date)) return { ok: false, error: 'date' };
  const date = d.date as string;
  if (typeof d.kind !== 'string' || !SH_KINDS.includes(d.kind)) return { ok: false, error: 'kind' };
  const id = shiftId(emp, date);
  if (d.id !== undefined && d.id !== null && d.id !== id) return { ok: false, error: 'id' };
  const note = shClean(d.note ?? '', SH_NOTE_MAX);
  const value: { id: string; employee_id: string; date: string; kind: string; note?: string } = { id, employee_id: emp, date, kind: d.kind };
  if (note) value.note = note;
  return { ok: true, value };
}

/** Revérification serveur d'une entrée reçue. `ctx.today` = date du jour à Madagascar. Garde la date de création de l'entrée existante. */
function cleanShift(rec: any, existing: any, actorId: string, now: string, ctx: { today: string }): { ok: true; save: any } | { ok: false; reason: string } {
  const v = checkShift(rec);
  if (!v.ok) return { ok: false, reason: v.error };
  if (!shIsDate(ctx && ctx.today)) return { ok: false, reason: 'format' };
  if (v.value.date < shAddDays(ctx.today, -SH_WINDOW_DAYS) || v.value.date > shAddDays(ctx.today, SH_WINDOW_DAYS)) return { ok: false, reason: 'window' };
  if (existing && (existing.employee_id !== v.value.employee_id || existing.date !== v.value.date)) return { ok: false, reason: 'id' };
  const save: any = { id: v.value.id, employee_id: v.value.employee_id, date: v.value.date, kind: v.value.kind, created_at: existing && typeof existing.created_at === 'string' ? existing.created_at : now, updated_at: now, updated_by: String(actorId).slice(0, 60) };
  if (v.value.note) save.note = v.value.note;
  return { ok: true, save };
}
// END SHIFTS

export const SHIFT_LIMITS = { note: SH_NOTE_MAX, windowDays: SH_WINDOW_DAYS };
export const SHIFT_KINDS: ShiftKind[] = ['day', 'night', 'off'];
export const SHIFT_LABEL: Record<ShiftKind, { fr: string; en: string; short: string }> = {
  day: { fr: 'Jour', en: 'Day', short: 'J' }, night: { fr: 'Nuit', en: 'Night', short: 'N' }, off: { fr: 'Repos', en: 'Off', short: 'R' },
};
export const SHIFT_ERROR_MESSAGE: Record<string, string> = {
  employee: 'Salarié non valide.', date: 'Date non valide.', kind: 'Choisis Jour, Nuit ou Repos.', note: 'Note non valide.', id: 'Entrée non valide.', format: 'Entrée non valide.',
  window: 'Date trop éloignée (400 jours au plus).',
};
export { checkShift, cleanShift, shiftId };

/** Lundi de la semaine qui contient cette date (AAAA-MM-JJ). */
export const mondayOf = (ymd: string): string => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return shAddDays(ymd, -((w + 6) % 7)); };
/** Les 7 dates d'une semaine, du lundi au dimanche. */
export const weekDates = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => shAddDays(monday, i));
export const planAddDays = shAddDays;

export interface LeaveLite { employee_id: string; start_date: string; end_date: string; status: string }
/** Vrai si le salarié a un congé ACCEPTÉ ce jour-là. */
export const isOnLeave = (leaves: LeaveLite[], employeeId: string, ymd: string): boolean => leaves.some((l) => l.status === 'approved' && l.employee_id === employeeId && l.start_date <= ymd && ymd <= l.end_date);

export type ConflictKind = 'on_leave' | 'rest' | 'too_many';
export interface PlanConflict { kind: ConflictKind; employee_id: string; date: string }
export const CONFLICT_LABEL: Record<ConflictKind, { fr: string; en: string }> = {
  on_leave: { fr: 'En congé accepté', en: 'On approved leave' },
  rest: { fr: 'Repos insuffisant (Nuit puis Jour)', en: 'Not enough rest (Night then Day)' },
  too_many: { fr: 'Trop de jours travaillés dans la semaine', en: 'Too many working days in the week' },
};

/**
 * Conflits du planning :
 * - `on_leave` : Jour ou Nuit un jour de congé accepté ;
 * - `rest` : Jour le lendemain d'une Nuit (signalé le jour de la vacation de Jour) ;
 * - `too_many` : plus de `maxPerWeek` jours travaillés dans la semaine lundi-dimanche (signalé au lundi ; 0 ou absent = pas de limite).
 * Rien n'est refusé : le responsable décide. Résultat trié par date, salarié, type.
 */
export function planConflicts(shifts: Array<{ employee_id: string; date: string; kind: string }>, leaves: LeaveLite[], opts: { maxPerWeek?: number } = {}): PlanConflict[] {
  const out: PlanConflict[] = [];
  const at = new Map<string, string>();
  for (const s of shifts) at.set(`${s.employee_id}|${s.date}`, s.kind);
  const weeks = new Map<string, number>();
  for (const s of shifts) {
    if (s.kind !== 'day' && s.kind !== 'night') continue;
    if (isOnLeave(leaves, s.employee_id, s.date)) out.push({ kind: 'on_leave', employee_id: s.employee_id, date: s.date });
    if (s.kind === 'day' && at.get(`${s.employee_id}|${shAddDays(s.date, -1)}`) === 'night') out.push({ kind: 'rest', employee_id: s.employee_id, date: s.date });
    const key = `${s.employee_id}|${mondayOf(s.date)}`;
    weeks.set(key, (weeks.get(key) || 0) + 1);
  }
  const max = Number(opts.maxPerWeek) || 0;
  if (max > 0) for (const [key, n] of weeks) if (n > max) { const [employee_id, date] = key.split('|'); out.push({ kind: 'too_many', employee_id, date }); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.employee_id.localeCompare(b.employee_id) || a.kind.localeCompare(b.kind));
}

/** Pour chaque date : combien de salariés en Jour et en Nuit. */
export function coverage(shifts: Array<{ date: string; kind: string }>, dates: string[]): Array<{ date: string; day: number; night: number }> {
  return dates.map((date) => ({ date, day: shifts.filter((s) => s.date === date && s.kind === 'day').length, night: shifts.filter((s) => s.date === date && s.kind === 'night').length }));
}
