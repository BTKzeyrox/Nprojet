// Règles pures des graphiques « C3 » : parts de l'anneau, barres de classement, jauge d'objectif, mini-courbe.
// Aucun écran ici : tout est testé par `npm run check:charts` (sans NaN, avec 0, 1 ou beaucoup de données).
const safe = (n: number) => (Number.isFinite(n) ? n : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- Anneau ----------
export interface DonutPart { label: string; value: number; pct: number; start: number; len: number }

/** Parts de l'anneau : valeurs négatives ou nulles ignorées ; au-delà de 6 parts, le reste est regroupé dans « Autres ». `start` et `len` sont des fractions du tour (0 à 1). */
export function donutParts(items: { label: string; value: number }[], othersLabel: string): { parts: DonutPart[]; total: number } {
  const clean = items.map(i => ({ label: i.label, value: Math.max(0, safe(i.value)) })).filter(i => i.value > 0);
  const total = clean.reduce((t, i) => t + i.value, 0);
  if (total === 0) return { parts: [], total: 0 };
  const shown = clean.length > 6 ? [...clean.slice(0, 5), { label: othersLabel, value: clean.slice(5).reduce((t, i) => t + i.value, 0) }] : clean;
  let acc = 0;
  return { total, parts: shown.map(s => { const len = s.value / total; const p = { label: s.label, value: s.value, pct: Math.round(len * 100), start: acc, len }; acc += len; return p; }) };
}

/** Toucher la part déjà choisie la désélectionne ; toucher une autre part la choisit. */
export const toggleSelection = (current: number | null, index: number): number | null => (current === index ? null : index);
/** Une sélection qui ne correspond plus à une part (les données ont changé) est ignorée. */
export const validSelection = (sel: number | null | undefined, count: number): number | null => (sel !== null && sel !== undefined && Number.isInteger(sel) && sel >= 0 && sel < count ? sel : null);
/** Taille du texte au centre de l'anneau selon sa longueur (pour que rien ne déborde). */
export const centerFontSize = (text: string): number => (text.length <= 5 ? 18 : text.length <= 7 ? 15 : text.length <= 9 ? 12 : 10);
/** Coupe un nom trop long au centre de l'anneau. */
export const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

// ---------- Classement en barres horizontales ----------
export interface RankBar { width: number; negative: boolean; share: number | null }

/** Largeur de chaque barre en % de la plus grande valeur (en valeur absolue). Une valeur non nulle garde au moins 3 % pour rester visible. `share` = part du total des valeurs positives (null si la valeur n'est pas positive). */
export function rankBars(values: number[]): RankBar[] {
  const v = values.map(safe);
  const maxAbs = Math.max(0, ...v.map(Math.abs));
  const totalPos = v.reduce((t, x) => t + (x > 0 ? x : 0), 0);
  return v.map(x => ({
    width: maxAbs === 0 || x === 0 ? 0 : Math.max(3, Math.round((Math.abs(x) / maxAbs) * 100)),
    negative: x < 0,
    share: x > 0 && totalPos > 0 ? Math.round((x / totalPos) * 100) : null,
  }));
}

// ---------- Jauge d'objectif (demi-cercle) ----------
export interface GaugeShape { fill: number; dash: number; over: boolean; shownPct: number; mark: { x1: number; y1: number; x2: number; y2: number } | null }
export const GAUGE = { cx: 60, cy: 62, r: 48, arcLength: Math.round(Math.PI * 48 * 10) / 10 }; // arcLength : longueur réelle du demi-cercle (on n'utilise pas `pathLength`, que certains moteurs ignorent)

/** Remplissage de 0 à 100 (plafonné) ; `over` quand l'objectif est dépassé ; repère du rythme attendu (où on devrait en être aujourd'hui) en petit trait en travers de l'arc. */
export function gaugeShape(pct: number, markPct?: number): GaugeShape {
  const p = Math.max(0, safe(pct));
  let mark: GaugeShape['mark'] = null;
  if (markPct !== undefined && Number.isFinite(markPct) && markPct > 0 && markPct < 100) {
    const a = Math.PI * (1 - markPct / 100); // 180° à gauche (0 %), 0° à droite (100 %)
    const c = Math.cos(a), s = Math.sin(a);
    mark = { x1: r1(GAUGE.cx + (GAUGE.r - 9) * c), y1: r1(GAUGE.cy - (GAUGE.r - 9) * s), x2: r1(GAUGE.cx + (GAUGE.r + 9) * c), y2: r1(GAUGE.cy - (GAUGE.r + 9) * s) };
  }
  const fill = Math.min(100, p);
  return { fill, dash: r1((fill / 100) * GAUGE.arcLength), over: p > 100, shownPct: Math.round(p), mark };
}

// ---------- Mini-courbe ----------
export interface SparkShape { empty: boolean; flat: boolean; line: string; area: string; last: { x: number; y: number } | null; min: number; max: number }

/** Points de la mini-courbe dans une boîte `w` × `h` (marge `pad`). Série vide : rien ; série plate ou à 1 valeur : trait au milieu. */
export function sparkShape(values: number[], w: number, h: number, pad = 3): SparkShape {
  const v = values.map(safe);
  if (v.length === 0) return { empty: true, flat: true, line: '', area: '', last: null, min: 0, max: 0 };
  const min = Math.min(...v), max = Math.max(...v);
  const flat = v.length < 2 || min === max;
  const span = max - min || 1;
  const xAt = (i: number) => (v.length === 1 ? w / 2 : pad + (i / (v.length - 1)) * (w - 2 * pad));
  const yAt = (x: number) => (flat ? h / 2 : h - pad - ((x - min) / span) * (h - 2 * pad));
  const pts = flat && v.length < 2 ? [[pad, h / 2], [w - pad, h / 2]] : v.map((x, i) => [xAt(i), yAt(x)]);
  const f = (n: number) => String(r1(n));
  const line = pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  const area = `M${f(pts[0][0])},${f(h)} ${pts.map(([x, y]) => `L${f(x)},${f(y)}`).join(' ')} L${f(pts[pts.length - 1][0])},${f(h)} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return { empty: false, flat, line, area, last: { x: r1(lx), y: r1(ly) }, min, max };
}
