// Contrôle des calculs des graphiques (sans écran). Lancer : npm run check:chart-scale
import { labelStep, monotonePath, nearestIndex, niceScale, seriesStats, variationPct } from '../src/utils/chartScale';
import { compactNumber } from '../src/components/charts/chartCommon';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

// --- graduations rondes ---
const s7 = niceScale(0, 7);
ok(s7.ticks[0] === 0 && s7.max >= 7 && s7.ticks.every((t, i) => i === 0 || t > s7.ticks[i - 1]), 'échelle 0 à 7 : démarre à 0, couvre 7, croissante');
ok(niceScale(0, 0).ticks.length >= 2 && niceScale(0, 0).max > 0, 'échelle 0 à 0 : jamais plate');
ok(niceScale(0, 150000).ticks.join() === '0,50000,100000,150000' || niceScale(0, 150000).ticks.every(t => t % 25000 === 0), 'échelle 0 à 150 000 : pas rond (25 000 ou 50 000)');
ok(niceScale(-30, 100).ticks.includes(0), 'échelle -30 à 100 : le zéro est une graduation');
ok(niceScale(0, 3, 5, true).ticks.every(Number.isInteger) && niceScale(0, 1, 5, true).ticks.every(Number.isInteger), 'échelle entière : aucune graduation décimale (0 à 3, 0 à 1)');
ok(niceScale(NaN, 5).ticks.length >= 2 && niceScale(Infinity, -Infinity).ticks.every(Number.isFinite), 'échelle : NaN et infini ramenés à 0-1');
ok(niceScale(5, 2).min <= 2 && niceScale(5, 2).max >= 5, 'échelle : bornes inversées remises dans l\'ordre');
let allGood = true, seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 300; i++) {
  const a = (rnd() - 0.4) * 10 ** Math.floor(rnd() * 9), b = a + rnd() * 10 ** Math.floor(rnd() * 9);
  const sc = niceScale(a, b, 3 + Math.floor(rnd() * 4));
  const t = sc.ticks;
  if (!(sc.min <= a + 1e-9 && sc.max >= b - 1e-9 && t.length >= 2 && t.length <= 12 && t.every((v, k) => k === 0 || v > t[k - 1]) && Number.isFinite(sc.step) && sc.step > 0)) { allGood = false; console.log('  cas', a, b, JSON.stringify(sc)); break; }
}
ok(allGood, 'échelle : 300 plages au hasard, bornes couvertes, 2 à 12 graduations, ordre croissant');

// --- étiquettes et position ---
ok(labelStep(7, 300, 30) === 1 && labelStep(31, 300, 30) > 1 && Math.ceil(365 / labelStep(365, 300)) <= 7 && labelStep(0, 300) === 1 && labelStep(24, 300, 46) > 1, 'étiquettes : 7 courtes toutes affichées, 31 et 24 espacées, 365 en 7 au plus');
ok(nearestIndex(0, 40, 300, 10) === 0 && nearestIndex(999, 40, 300, 10) === 9 && nearestIndex(40 + 31, 40, 300, 10) === 1 && nearestIndex(5, 40, 300, 1) === 0, 'point le plus proche : bords, milieu, une seule donnée');

// --- courbe douce ---
ok(monotonePath([]) === '' && monotonePath([[1, 2]]) === 'M1,2' && monotonePath([[0, 0], [10, 5]]) === 'M0,0L10,5', 'courbe : 0, 1 et 2 points');
const pts: [number, number][] = [[0, 100], [10, 100], [20, 20], [30, 20], [40, 90], [50, 10], [60, 10]];
const path = monotonePath(pts);
ok(!/NaN|Infinity/.test(path) && path.startsWith('M0,100') && path.includes('C'), 'courbe : chemin valide sans NaN');
// pas de dépassement : chaque point calculé de la courbe reste entre les deux points voisins
const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
let overshoot = false;
for (let seg = 0; seg < pts.length - 1; seg++) {
  const b = 2 + seg * 6; // M x y puis 6 nombres par segment
  const [y0, y1, y2, y3] = [pts[seg][1], nums[b + 1], nums[b + 3], pts[seg + 1][1]];
  const lo = Math.min(pts[seg][1], pts[seg + 1][1]) - 0.51, hi = Math.max(pts[seg][1], pts[seg + 1][1]) + 0.51;
  for (let k = 0; k <= 20; k++) { const t = k / 20, u = 1 - t, y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3; if (y < lo || y > hi) overshoot = true; }
}
ok(!overshoot, 'courbe : ne dépasse jamais les points (pas de fausse bosse sous zéro)');

// --- variation et résumé ---
ok(variationPct(110, 100) === 10 && variationPct(50, 100) === -50 && variationPct(5, 0) === null && variationPct(-50, -100) === 50, 'variation en % : hausse, baisse, avant = 0 (aucun %), avant négatif');
const st = seriesStats([3, 9, 0, 6]);
ok(st.total === 18 && st.avg === 4.5 && st.bestIndex === 1 && st.worstIndex === 2 && st.last === 6 && st.max === 9 && st.min === 0, 'résumé : total, moyenne, meilleur, pire, dernier');
ok(seriesStats([]).bestIndex === -1 && seriesStats([NaN, 2]).total === 2, 'résumé : vide et NaN sans erreur');

// --- nombres courts ---
ok(compactNumber(950) === '950' && compactNumber(1500) === '1,5 k' && compactNumber(2_500_000) === '2,5 M' && compactNumber(3_200_000_000) === '3,2 Md' && compactNumber(-1500) === '-1,5 k', 'nombres courts : 950 / 1,5 k / 2,5 M / 3,2 Md / -1,5 k');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
