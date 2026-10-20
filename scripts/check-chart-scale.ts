// Contrôle des calculs des graphiques (sans écran). Lancer : npm run check:chart-scale
import { labelStep, monotonePath, nearestIndex, niceScale, seriesStats, variationPct } from '../src/utils/chartScale';
import { compactNumber } from '../src/components/charts/chartCommon';
import { actualUntil, forecastLine, monthTitle, pacePerBar } from '../src/utils/chartData';
import { buckets, computeStats } from '../src/utils/stats';

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


// --- parties réelles et prévision ---
ok(actualUntil([1, 2, 3, 4], 1).join() === '1,2,,' && actualUntil([1, 2], 5).join() === '1,2' && actualUntil([], 0).length === 0, 'réel : valeurs jusqu\'à aujourd\'hui, vide après');
const fl = forecastLine([10, 20, 30, 30, 30], 2, 60);
ok(fl.join() === ',,30,45,60' && fl[0] === null && fl[2] === 30 && fl[4] === 60, 'prévision : part de la dernière valeur réelle et arrive à la valeur de fin de mois');
ok(forecastLine([5, 5, 5], 2, 99).join() === ',,5' && forecastLine([1, 2], -1, 5).every(v => v === null) && forecastLine([1, 2], 9, 5).every(v => v === null) && forecastLine([1, 2], 0, NaN).every(v => v === null) && forecastLine([], 0, 1).length === 0, 'prévision : dernier jour, jour hors série, valeur invalide, série vide : sans erreur');
ok(forecastLine([0, 100, 100], 1, 40).join() === ',100,40' || forecastLine([0, 100, 100], 1, 40)[2] === 40, 'prévision : peut descendre (bénéfice qui baisse)');
ok(pacePerBar(100, 30) === 3.3 && pacePerBar(0, 30) === 0 && pacePerBar(10, 0) === 0 && pacePerBar(-5, 30) === 0, 'rythme d\'un objectif : 100 sur 30 jours = 3,3 par jour ; 0 sans objectif');
ok(monthTitle('2026-10', 'fr') === 'octobre 2026' && monthTitle('2026-10', 'en') === 'October 2026' && monthTitle('abc') === 'abc' && monthTitle('2026-13') === '2026-13', 'titre de mois : FR, EN, valeur invalide gardée telle quelle');

// --- titres complets des barres ---
const wk = buckets('week', { start: '2026-10-12', end: '2026-10-18', days: 7 }, 'fr');
ok(wk.fullLabels.length === 7 && wk.fullLabels[0].startsWith('lun') && wk.fullLabels[0].includes('12') && wk.fullLabels[0].includes('oct') && !wk.fullLabels[0].includes('.'), 'titres complets (semaine, FR) : « lun 12 oct »');
const wkEn = buckets('week', { start: '2026-10-12', end: '2026-10-18', days: 7 }, 'en');
ok(wkEn.fullLabels[0].startsWith('Mon') && wkEn.fullLabels[6].includes('18'), 'titres complets (semaine, EN) : « Mon 12 Oct »');
const dy = buckets('day', { start: '2026-10-12', end: '2026-10-12', days: 1 }, 'fr');
ok(dy.fullLabels.length === 24 && dy.fullLabels[9] === '09:00 – 10:00' && dy.fullLabels[23] === '23:00 – 00:00', 'titres complets (jour) : « 09:00 – 10:00 », minuit bouclé');
const yr = buckets('year', { start: '2026-01-01', end: '2026-12-31', days: 365 }, 'fr');
ok(yr.fullLabels.length === 12 && yr.fullLabels[9] === 'octobre 2026', 'titres complets (année) : « octobre 2026 »');
const mo = buckets('month', { start: '2026-10-01', end: '2026-10-31', days: 31 }, 'fr');
ok(mo.fullLabels.length === 31 && mo.labels.length === 31, 'titres complets (mois) : un par jour');

// --- missions par type et par barre ---
const post = (id: number, date: string, post_number: number, client: string) => ({ id: `p${id}`, status: 'completed', date, start_time: '10:00', end_time: '11:00', post_number, client_name: client, employee_id: 'e1', session_id: 's' + id } as any);
const contracts = [{ post_number: 1, client_name: 'A', post_type: 'Alpha' }, { post_number: 2, client_name: 'B', post_type: 'Beta' }] as any;
const input = { posts: [post(1, '2026-10-12', 1, 'A'), post(2, '2026-10-12', 1, 'A'), post(3, '2026-10-13', 2, 'B'), post(4, '2026-10-30', 1, 'A')], users: [], contracts, advances: [], pricePerMission: 0 } as any;
const st2 = computeStats(input, 'week', '2026-10-14', '2026-10-14', 'fr');
const tsr = st2.byTypeSeries;
ok(tsr.length === 2 && tsr[0].label === 'Alpha' && tsr[0].values.join() === '2,0,0,0,0,0,0' && tsr[1].values.join() === '0,1,0,0,0,0,0', 'par type : 2 « Alpha » le lundi, 1 « Beta » le mardi');
ok(tsr.every(r => r.values.length === st2.labels.length) && tsr.reduce((t, r) => t + r.values.reduce((a, b) => a + b, 0), 0) === st2.byType.reduce((t, r) => t + r.count, 0), 'par type : même nombre de barres, total identique à l\'anneau');
ok(st2.fullLabels.length === st2.labels.length, 'résultat des statistiques : titres complets fournis');
const many = { ...input, posts: Array.from({ length: 8 }, (_, i) => post(i + 10, '2026-10-12', 100 + i, 'T' + i)), contracts: Array.from({ length: 8 }, (_, i) => ({ post_number: 100 + i, client_name: 'T' + i, post_type: 'Type' + i })) } as any;
const tm = computeStats(many, 'week', '2026-10-14', '2026-10-14', 'en').byTypeSeries;
ok(tm.length === 6 && tm[5].label === 'Others' && tm[5].values[0] === 3, 'par type : plus de 6 types, regroupés en « Others » (3 ici)');
ok(computeStats(input, 'week', '2026-10-19', '2026-10-14', 'fr').byTypeSeries.length === 0, 'par type : période à venir = aucune série');

// --- nombres courts ---
ok(compactNumber(950) === '950' && compactNumber(1500) === '1,5 k' && compactNumber(2_500_000) === '2,5 M' && compactNumber(3_200_000_000) === '3,2 Md' && compactNumber(-1500) === '-1,5 k', 'nombres courts : 950 / 1,5 k / 2,5 M / 3,2 Md / -1,5 k');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
