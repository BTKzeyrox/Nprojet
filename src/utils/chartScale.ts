// Calculs des graphiques (purs, sans écran) : graduations rondes, courbe douce, point le plus proche, statistiques.
// Testés par `npm run check:chart-scale`.

export interface NiceScale { min: number; max: number; step: number; ticks: number[] }

const niceNum = (range: number, round: boolean): number => {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * 10 ** exp;
};
const clean = (v: number) => Number(v.toPrecision(12));

/** Graduations « rondes » (1, 2, 5, 10…) qui contiennent [min, max]. `integer` : jamais de pas décimal (comptes de missions). */
export function niceScale(min: number, max: number, target = 5, integer = false): NiceScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min > max) [min, max] = [max, min];
  if (min === max) { if (min === 0) max = integer ? 4 : 1; else { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; } }
  const n = Math.max(2, Math.round(target));
  let step = niceNum(niceNum(max - min, false) / (n - 1), true);
  if (integer && step % 1 !== 0) {
    const mag = 10 ** Math.floor(Math.log10(Math.max(1, step)));
    step = [1, 2, 5, 10].map(c => c * mag).find(c => c >= step) ?? mag * 10;
  }
  if (integer && step < 1) step = 1;
  const first = Math.floor(min / step + 1e-9) * step;
  let last = Math.ceil(max / step - 1e-9) * step;
  if (last <= first) last = first + step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(clean(v));
  return { min: clean(first), max: clean(last), step: clean(step), ticks };
}

/** Une étiquette sur combien, pour que l'axe du bas ne déborde jamais (`minGap` px entre deux étiquettes). */
export const labelStep = (n: number, innerW: number, minGap = 46): number => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / minGap))));

/** Colonne la plus proche d'une position horizontale (px). */
export const nearestIndex = (x: number, padL: number, innerW: number, n: number): number => {
  if (n <= 1) return 0;
  const i = Math.floor((x - padL) / (innerW / n));
  return Math.min(n - 1, Math.max(0, i));
};

/** Courbe douce qui ne dépasse jamais les points (pas de bosse sous zéro) : méthode de Fritsch–Carlson. */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  if (n === 2) return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const d = pts.slice(1).map((p, i) => (dx[i] === 0 ? 0 : (p[1] - pts[i][1]) / dx[i]));
  const m = new Array<number>(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let out = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    out += `C${f(pts[i][0] + h)},${f(pts[i][1] + m[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - m[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return out;
}

/** Variation en % entre deux valeurs (null si la valeur d'avant est 0 : pas de pourcentage honnête). */
export const variationPct = (cur: number, prev: number): number | null => (prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100));

export interface SeriesStats { total: number; avg: number; last: number; min: number; max: number; bestIndex: number; worstIndex: number }
export function seriesStats(values: number[]): SeriesStats {
  const v = values.map(x => (Number.isFinite(x) ? x : 0));
  if (v.length === 0) return { total: 0, avg: 0, last: 0, min: 0, max: 0, bestIndex: -1, worstIndex: -1 };
  let bi = 0, wi = 0;
  v.forEach((x, i) => { if (x > v[bi]) bi = i; if (x < v[wi]) wi = i; });
  const total = v.reduce((a, b) => a + b, 0);
  return { total, avg: total / v.length, last: v[v.length - 1], min: v[wi], max: v[bi], bestIndex: bi, worstIndex: wi };
}
