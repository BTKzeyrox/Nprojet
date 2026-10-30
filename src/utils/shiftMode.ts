// Mode des horaires (Réglages) : « normal » = un seul horaire pour tous, « day » / « night » = une seule vacation, « both » = jour et nuit.
// Le serveur (df-api) a la même copie du bloc ci-dessous ; `npm run check:shift-mode` compare les deux.
export type ShiftMode = 'both' | 'normal' | 'day' | 'night';
export const SHIFT_MODES: ShiftMode[] = ['normal', 'day', 'night', 'both'];

// ===== BEGIN SHIFTMODE (copie serveur : mêmes lignes) =====
export const cleanShiftMode = (v: unknown): 'both' | 'normal' | 'day' | 'night' => (v === 'normal' || v === 'day' || v === 'night' ? v : 'both');
/** La vacation qui compte vraiment pour une personne : en mode normal ou « jour seulement » c'est le jour, en « nuit seulement » la nuit, sinon celle de la personne. */
export const effShift = (shift: unknown, mode: unknown): 'day' | 'night' => {
  const m = cleanShiftMode(mode);
  return m === 'night' ? 'night' : m === 'day' || m === 'normal' ? 'day' : shift === 'night' ? 'night' : 'day';
};
// ===== END SHIFTMODE =====

/** Faux = on cache les mots « jour / nuit / vacation » : une seule plage d'horaires pour tout le monde. */
export const showShift = (cfg: { shift_mode?: unknown } | null | undefined): boolean => cleanShiftMode(cfg?.shift_mode) === 'both';
export const MODE_LABELS: Record<ShiftMode, string> = { normal: 'Travail normal (un seul horaire)', day: 'Jour seulement', night: 'Nuit seulement', both: 'Jour et nuit' };
