// Données des graphiques : parties réelles, prévision en pointillé, rythme d'un objectif (purs, sans écran).
// Contrôlé par `npm run check:chart-scale`.

/** Valeurs réelles jusqu'à `lastIdx` (compris) ; `null` après (le jour n'est pas encore arrivé : rien à tracer). */
export const actualUntil = (values: number[], lastIdx: number): (number | null)[] => values.map((v, i) => (i <= lastIdx ? v : null));

/**
 * Prévision en ligne droite : part de la dernière valeur réelle (`fromIdx`) et arrive à `endValue` sur la dernière barre.
 * `null` avant `fromIdx`. Sans prévision possible (aucune valeur, ou `fromIdx` hors de la série), tout est `null`.
 */
export function forecastLine(values: number[], fromIdx: number, endValue: number): (number | null)[] {
  const n = values.length;
  if (n === 0 || fromIdx < 0 || fromIdx >= n || !Number.isFinite(endValue)) return values.map(() => null);
  const start = values[fromIdx];
  const last = n - 1;
  return values.map((_, i) => {
    if (i < fromIdx) return null;
    if (i === fromIdx) return start;
    return Math.round(start + ((endValue - start) * (i - fromIdx)) / (last - fromIdx));
  });
}

/** Rythme par barre d'un objectif du mois (ex. 100 missions sur 30 jours = 3,3 par jour). 0 si pas d'objectif. */
export const pacePerBar = (goal: number, bars: number): number => (goal > 0 && bars > 0 ? Math.round((goal / bars) * 10) / 10 : 0);

/** « 2026-10 » → « octobre 2026 » / « October 2026 ». */
export const monthTitle = (key: string, lang: 'fr' | 'en' = 'fr'): string => {
  const [y, m] = key.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return key;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
};
