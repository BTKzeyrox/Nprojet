// Retard d'une session (utilisé par le calendrier et par les alertes). Pur, sans écran.
import type { AppSettings, PostSession } from '../types';

export const toMin = (hhmm: string): number => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export type ShiftSettings = Pick<AppSettings, 'day_shift_start' | 'night_shift_start' | 'late_tolerance_min'>;

/** Une session est en retard si elle démarre plus tard que l'heure du shift + la tolérance (Réglages). */
export function isLate(s: Pick<PostSession, 'shift_type' | 'start_time'>, cfg: ShiftSettings): boolean {
  const base = s.shift_type === 'night' ? cfg.night_shift_start : cfg.day_shift_start;
  const diff = toMin(s.start_time) - toMin(base);
  return diff > cfg.late_tolerance_min && diff < 12 * 60;
}
