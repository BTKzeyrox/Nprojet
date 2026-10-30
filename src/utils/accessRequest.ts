// Demande de connexion hors horaires : règles pures (heure de fin d'une autorisation). Le serveur (df-api) a la même copie ; `npm run check:access-request` compare les deux.
import { effShift } from './shiftMode';
export const ACCESS_HOURS = [1, 2, 4, 8, 12] as const;
export type AccessMode = 'shift_end' | 'hours' | 'until';

const MADA_MS = 3 * 3600 * 1000;
const DAY_MS = 86400000;

// ===== BEGIN ACCESSUNTIL (copie serveur : mêmes lignes) =====
const hhmm = (s: unknown, dflt: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : dflt;
};
/** Prochaine fin de vacation (heure de Madagascar), strictement après `nowMs`. */
export const shiftEndMs = (shift: 'day' | 'night', st: any, nowMs: number): number => {
  const endMin = shift === 'night' ? hhmm(st?.night_shift_end, 6 * 60) : hhmm(st?.day_shift_end, 18 * 60);
  const local = nowMs + 3 * 3600 * 1000;
  let end = Math.floor(local / 86400000) * 86400000 + endMin * 60000;
  if (end <= local) end += 86400000;
  return end - 3 * 3600 * 1000;
};
/** Fin d'une autorisation : fin de vacation (si elle est à plus de 14 h, 4 h à la place), 1/2/4/8/12 h, ou une heure précise (dans les 48 h). null = demande invalide. */
export const resolveAccessUntil = (shift: 'day' | 'night', st: any, nowMs: number, mode: unknown, value: unknown): number | null => {
  if (mode === 'hours') { const h = Number(value); return [1, 2, 4, 8, 12].includes(h) ? nowMs + h * 3600000 : null; }
  if (mode === 'until') { const t = typeof value === 'number' ? value : Date.parse(String(value || '')); return Number.isFinite(t) && t > nowMs && t <= nowMs + 48 * 3600000 ? t : null; }
  const e = shiftEndMs(shift, st, nowMs);
  return e - nowMs > 14 * 3600000 ? nowMs + 4 * 3600000 : e;
};
// ===== END ACCESSUNTIL =====


/** Heure de Madagascar « HH:MM » d'un instant. */
export const madaClock = (ms: number): string => new Date(ms + MADA_MS).toISOString().slice(11, 16);
/** Prochaine occurrence de « HH:MM » (heure de Madagascar) après `nowMs` ; null si le format est faux. */
export const untilFromClock = (clock: string, nowMs: number): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const local = nowMs + MADA_MS;
  let t = Math.floor(local / DAY_MS) * DAY_MS + (Number(m[1]) * 60 + Number(m[2])) * 60000;
  if (t <= local) t += DAY_MS;
  return t - MADA_MS;
};

/** Fin d'accès prévue pour cette personne (heure de fin + marge après), ou null si rien n'est prévu (accès « toute heure », pas concerné). */
export const accessEndMs = (u: { role: string; shift?: string; access_mode?: string; access_until?: string }, cfg: any, nowMs: number): number | null => {
  if (!['employee', 'accountant', 'team_lead'].includes(u.role) || u.access_mode === 'allow' || u.access_mode === 'block') return null;
  if (u.access_until && Date.parse(u.access_until) > nowMs) return Date.parse(u.access_until);
  const after = Number.isFinite(Number(cfg.access_after_min)) ? Math.max(0, Number(cfg.access_after_min)) : 60;
  return shiftEndMs(effShift(u.shift, cfg.shift_mode), cfg, nowMs - after * 60000) + after * 60000;
};

