// Objectif de missions par jour (2 à 5 par défaut, réglable) : règle pure, affichage seulement. Le site n'empêche jamais une mission : il montre si le jour est dans la cible.
export const DEFAULT_MISSIONS_MIN = 2;
export const DEFAULT_MISSIONS_MAX = 5;
export type QuotaState = 'none' | 'under' | 'ok' | 'over';

const int = (v: unknown, d: number) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 50 ? n : d; };
/** Min et max réglés (Réglages). Valeurs fausses = 2 et 5 ; un max plus petit que le min ramène aux défauts. */
export const cleanQuota = (cfg: { missions_per_day_min?: unknown; missions_per_day_max?: unknown } | null | undefined): { min: number; max: number } => {
  const min = int(cfg?.missions_per_day_min, DEFAULT_MISSIONS_MIN), max = int(cfg?.missions_per_day_max, DEFAULT_MISSIONS_MAX);
  return max >= min && max >= 1 ? { min, max } : { min: DEFAULT_MISSIONS_MIN, max: DEFAULT_MISSIONS_MAX };
};
/** `count` = missions comptées (validées, en cours, en attente : pas les refusées ni libérées). */
export const quotaState = (count: number, q: { min: number; max: number }): QuotaState => (count <= 0 ? 'none' : count < q.min ? 'under' : count > q.max ? 'over' : 'ok');
/** Phrase pour la fenêtre de détail du jour. `isToday` : le jour n'est pas fini, donc « pas encore » plutôt que « sous le minimum ». */
export const quotaText = (count: number, q: { min: number; max: number }, isToday: boolean): string => {
  const s = quotaState(count, q), goal = `objectif ${q.min} à ${q.max} par jour`;
  if (s === 'ok') return `${count} mission${count > 1 ? 's' : ''} : dans l'objectif (${goal})`;
  if (s === 'over') return `${count} missions : au-dessus du maximum (${goal})`;
  if (s === 'under') return isToday ? `${count} mission${count > 1 ? 's' : ''} pour l'instant (${goal})` : `${count} mission${count > 1 ? 's' : ''} : sous le minimum (${goal})`;
  return `Aucune mission (${goal})`;
};
