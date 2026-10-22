// Détection statistique SIMPLE (module 11, M11.6) : on compare à la médiane des périodes d'avant. Jamais de boîte noire :
// chaque alerte dit les deux chiffres comparés. Pur, sans écran, sans serveur.

/** Médiane (NaN si vide). Les valeurs illisibles sont ignorées. */
export function median(xs: number[]): number {
  const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Quel jour du mois est-on, sur combien : sert à comparer un mois en cours à des mois complets. */
export function monthProgress(today: string): { day: number; days: number; fraction: number } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), day = Number(today.slice(8, 10));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { day, days, fraction: day / days };
}

/** Mois (AAAA-MM) précédents, du plus ancien au plus récent : les `n` mois avant celui de `today`. */
export function previousMonths(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1, out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7));
  return out;
}

export type Deviation = 'up' | 'down' | 'none';
export interface Compare { baseline: number; current: number; ratio: number; direction: Deviation; periods: number }

/**
 * Compare `current` à la médiane de `history`. Il faut au moins `minPeriods` périodes, sinon on ne juge pas (direction « none »).
 * « up » si current ≥ baseline × upRatio ET l'écart ≥ minDiff ; « down » si current ≤ baseline × downRatio ET l'écart ≥ minDiff.
 */
export function compareToMedian(current: number, history: number[], opts: { minPeriods: number; upRatio?: number; downRatio?: number; minDiff?: number }): Compare {
  const h = history.filter(x => typeof x === 'number' && Number.isFinite(x));
  const base = median(h);
  const none: Compare = { baseline: Number.isFinite(base) ? base : 0, current, ratio: 0, direction: 'none', periods: h.length };
  if (!Number.isFinite(current) || h.length < opts.minPeriods || !Number.isFinite(base) || base <= 0) return none;
  const ratio = current / base, diff = Math.abs(current - base), minDiff = opts.minDiff ?? 0;
  if (opts.upRatio !== undefined && ratio >= opts.upRatio && diff >= minDiff) return { ...none, ratio, direction: 'up' };
  if (opts.downRatio !== undefined && ratio <= opts.downRatio && diff >= minDiff) return { ...none, ratio, direction: 'down' };
  return { ...none, ratio };
}
