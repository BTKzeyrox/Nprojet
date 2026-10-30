// Jours de travail réglables (Réglages) : 0 = dimanche … 6 = samedi. Par défaut lundi à samedi (le dimanche est un jour de repos). Pur : sans écran ni serveur.
// Le serveur (df-api, bloc d'accès) a la même règle ; `npm run check:work-days` compare les deux.
export const DEFAULT_WORK_DAYS: number[] = [1, 2, 3, 4, 5, 6];
export const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // affichage : Lun … Dim

/** Liste nettoyée : entiers 0 à 6 sans doublon, triée. Absent ou invalide = lundi à samedi. Une liste vide est refusée (il faut au moins un jour). */
export function cleanWorkDays(v: unknown): number[] {
  if (!Array.isArray(v)) return [...DEFAULT_WORK_DAYS];
  const out = [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return out.length ? out : [...DEFAULT_WORK_DAYS];
}
/** Jour de la semaine (0 = dimanche) d'une date AAAA-MM-JJ, sans décalage de fuseau. */
export const weekdayOf = (dateStr: string): number => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
export const isWorkDay = (dateStr: string, workDays?: unknown): boolean => cleanWorkDays(workDays).includes(weekdayOf(dateStr));
