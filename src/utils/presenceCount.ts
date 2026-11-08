// « Opérateurs en ligne » de l'accueil : compte seulement les opérateurs ACTIFS (non bloqués) qui ont donné un signe de vie il y a moins de 120 s.
// Une mission ouverte sans signe de vie ne rend PAS l'opérateur « en ligne » (il est « en mission » mais hors ligne). Pur : pas de store, testé par check:presence-count.
import { serverNowMs } from './serverClock';
export const ONLINE_MS = 120_000;
export interface UserLike { id: string; role: string; status?: string; entry_only?: boolean }
export interface PresenceLike { user_id: string; last_seen: string }

/** Cet opérateur a-t-il donné un signe de vie récent ? Sans ligne de présence ou date illisible : non. */
export const isFresh = (row: PresenceLike | undefined, now = serverNowMs(), ms = ONLINE_MS): boolean => {
  if (!row) return false;
  const t = new Date(row.last_seen).getTime();
  return Number.isFinite(t) && now - t < ms && now - t > -ms; // une date du futur (horloge fausse) ne compte pas comme « maintenant »
};
/** `online` / `total` : opérateurs actifs en ligne sur opérateurs actifs (les comptes bloqués ne comptent pour rien). */
export function countOnline(users: UserLike[], presence: PresenceLike[], now = serverNowMs()): { online: number; total: number } {
  const active = users.filter(u => u.role === 'employee' && u.status !== 'blocked' && !u.entry_only); // un employé suivi par saisie n'a pas de téléphone : il n'est ni « en ligne » ni dans le total
  return { online: active.filter(u => isFresh(presence.find(r => r.user_id === u.id), now)).length, total: active.length };
}

/** Chefs d'équipe et comptables (comptes actifs) en ligne : suivis comme les opérateurs mais comptés à part. L'administrateur n'est pas suivi. */
export function countOnlineStaff(users: UserLike[], presence: PresenceLike[], now = serverNowMs()): { online: number; total: number } {
  const active = users.filter(u => (u.role === 'team_lead' || u.role === 'accountant') && u.status !== 'blocked');
  return { online: active.filter(u => isFresh(presence.find(r => r.user_id === u.id), now)).length, total: active.length };
}
