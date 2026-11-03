// Barre de filtres commune (module 22, M22.7) : règles pures. Même texte partout : « Nom (3) » ; un filtre à 0 reste visible mais grisé.
export interface FilterDef<T extends string = string> { id: T; label: string; count: number }
/** Nombre sûr : entier ≥ 0 (tout le reste = 0). */
export const safeCount = (n: unknown): number => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v > 0 ? v : 0; };
/** Texte d'un bouton de filtre : « En retard (3) ». Le chiffre est toujours montré, même à 0. */
export const filterText = (label: string, count: unknown): string => `${label} (${safeCount(count)})`;
/** Le filtre choisi existe-t-il encore ? Sinon on revient au premier (« Tout »). */
export const activeOrFirst = <T extends string>(filters: FilterDef<T>[], active: T): T => (filters.some(f => f.id === active) ? active : (filters[0]?.id ?? active));
/** Compte les lignes par filtre : `kinds[i]` est le filtre de chaque ligne ; « all » = toutes. */
export function countBy<T extends string>(kinds: T[], ids: T[], all: T): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const id of ids) out[id] = id === all ? kinds.length : 0;
  for (const k of kinds) if (k !== all && k in out) out[k]++;
  return out;
}
