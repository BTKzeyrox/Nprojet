// Petits outils communs aux règles d'alertes (dates de Madagascar, noms, pluriels, durées). Purs.
import type { PostSession, User } from '../../../types';
import type { HealthContext } from '../registry';

/** Date et heure d'une session (heure de Madagascar, UTC+3) en millisecondes ; NaN si illisible. */
export function sessionMs(date: string | undefined, time: string | undefined): number {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const [h = '0', m = '0', s = '0'] = String(time || '00:00:00').split(':');
  const pad = (x: string) => String(Math.max(0, Math.min(59, parseInt(x, 10) || 0))).padStart(2, '0');
  return Date.parse(`${date}T${pad(String(Math.min(23, parseInt(h, 10) || 0)))}:${pad(m)}:${pad(s)}+03:00`);
}
/** Jour (AAAA-MM-JJ) à Madagascar d'un instant en millisecondes. */
export const madaDay = (ms: number): string => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
export const isSunday = (day: string): boolean => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
export const shiftDay = (day: string, delta: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400_000).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const isEmployee = (u: User): boolean => u.role === 'employee' && (u.status === undefined || u.status === 'active');
export const userName = (ctx: HealthContext, id: string, fallback = ''): string => ctx.users.find(u => u.id === id)?.name || fallback || id;
/** Une session « travaillée » : ni refusée ni libérée de force. */
export const isWorked = (p: Pick<PostSession, 'status'>): boolean => p.status !== 'rejected' && p.status !== 'force_released';

export const list = (names: string[], max = 3): string => names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '');
export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Durée lisible : « 5 h », « 3 jours » (FR) / « 5 h », « 3 days » (EN). */
export function duration(hours: number, lang: 'fr' | 'en'): string {
  const h = Math.max(0, Math.round(hours));
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return lang === 'fr' ? `${d} jours` : `${d} days`;
}
