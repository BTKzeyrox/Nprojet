// Contrôle des graphiques : aucun ne doit casser (ni « NaN ») avec 0, 1 ou 365 données.
// Lancer : npx --yes tsx scripts/check-charts.tsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BarChart, DonutChart, LineChart, Sparkline, XYChart, compactNumber } from '../src/components/charts/Charts';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const clean = (html: string) => !/NaN|Infinity|undefined/.test(html);
const labels = (k: number) => Array.from({ length: k }, (_, i) => String(i + 1));

for (const k of [0, 1, 7, 24, 31, 365]) {
  const zero = renderToString(<BarChart values={new Array(k).fill(0)} labels={labels(k)} ariaLabel="Test" />);
  ok(clean(zero), `barres : ${k} données à zéro, sans erreur`);
  const vals = Array.from({ length: k }, (_, i) => (i * 37) % 11);
  const full = renderToString(<BarChart values={vals} labels={labels(k)} compare={vals.map(v => v + 1)} ariaLabel="Test" />);
  ok(clean(full), `barres : ${k} données variées, sans erreur`);
}
ok(clean(renderToString(<BarChart values={[5]} labels={['a']} ariaLabel="Test" />)) && renderToString(<BarChart values={[5]} labels={['a']} ariaLabel="Test" />).includes('<rect'), 'barres : une seule donnée = une barre');
ok(clean(renderToString(<BarChart values={[NaN, 3, Infinity]} labels={['a', 'b', 'c']} ariaLabel="Test" />)), 'barres : valeurs NaN ou infinies ignorées');
ok(clean(renderToString(<DonutChart items={[]} ariaLabel="Test" />)), 'anneau : vide');
ok(renderToString(<BarChart values={[1, 2]} labels={['a', 'b']} ariaLabel="Test" lang="en" />).includes('Tap the chart') && renderToString(<BarChart values={[1, 2]} labels={['a', 'b']} ariaLabel="Test" lang="fr" />).includes('Touchez le graphique'), 'barres : textes en français et en anglais');
ok(renderToString(<BarChart values={[1]} labels={['a']} ariaLabel="Test" />).includes('data-notranslate'), 'barres : exclues de la traduction automatique');
ok(clean(renderToString(<DonutChart items={[{ label: 'A', value: 0 }]} ariaLabel="Test" />)), 'anneau : une part à zéro');
ok(clean(renderToString(<DonutChart items={[{ label: 'A', value: 5 }]} ariaLabel="Test" />)), 'anneau : une seule part');
ok(renderToString(<DonutChart items={Array.from({ length: 12 }, (_, i) => ({ label: 'T' + i, value: i + 1 }))} ariaLabel="Test" />).includes('Autres'), 'anneau : plus de 6 parts regroupées en « Autres »');
ok(clean(renderToString(<Sparkline values={[]} />)) && clean(renderToString(<Sparkline values={[3]} />)) && clean(renderToString(<Sparkline values={[1, 5, 2, 8]} />)), 'mini-courbe : 0, 1 ou plusieurs valeurs');
ok(compactNumber(950) === '950' && compactNumber(1500) === '1,5 k' && compactNumber(2_500_000) === '2,5 M', 'nombres courts : 950 / 1,5 k / 2,5 M');


// ---------- Moteur XYChart : axes, grille, repères, légende, couleurs ----------
const L3 = ['Lun', 'Mar', 'Mer'];
const xy = renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'Reçu', values: [0, 40, 100], kind: 'bar' }]} ariaLabel="Test" />);
ok(clean(xy) && xy.includes('>0<') && xy.includes('>100<') && xy.includes('>40<'), 'axe vertical : graduations rondes 0, 40 et 100 affichées');
ok((xy.match(/stroke-dasharray="2 4"/g) || []).length >= 3, 'grille horizontale tracée');
ok(xy.includes('width="340"') && xy.includes('height="260"'), 'taille par défaut : 340 × 260 (téléphone)');
ok(!xy.includes('aria-live'), 'pas d\'infobulle tant qu\'on ne touche rien');
ok(xy.includes('Touchez le graphique'), 'consigne de lecture affichée');
const ref = renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'Reçu', values: [10, 40, 80], kind: 'bar' }]} refLines={[{ value: 120, label: 'Objectif' }]} ariaLabel="Test" />);
ok(clean(ref) && ref.includes('Objectif') && ref.includes('>120<'), 'ligne de repère « Objectif » tracée et incluse dans l\'échelle (120 > 80)');
const two = renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'Reçu', values: [1, 2, 3] }, { key: 'b', label: 'Dépenses', values: [3, 2, 1], kind: 'line', dashed: true }]} ariaLabel="Test" />);
ok(clean(two) && (two.match(/aria-pressed="true"/g) || []).length === 2 && two.includes('Dépenses'), 'légende : un bouton par série, tous actifs au départ');
const one = renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'Reçu', values: [1, 2, 3] }]} ariaLabel="Test" />);
ok(!one.includes('aria-pressed'), 'légende : absente avec une seule série');
const neg = renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'Solde', values: [-50, 20, 60] }]} signColors ariaLabel="Test" />);
ok(clean(neg) && neg.includes('>-50<') && (neg.match(/fill="#fb7185"/g) || []).length === 1 && (neg.match(/fill="#10b981"/g) || []).length === 2, 'barres : vert au-dessus de zéro, rouge en dessous, axe jusqu\'à -50');
const stk = renderToString(<XYChart labels={L3} stacked series={[{ key: 'a', label: 'A', values: [10, 20, 30] }, { key: 'b', label: 'B', values: [5, 5, 5] }]} ariaLabel="Test" />);
ok(clean(stk) && stk.includes('>40<') && !stk.includes('>50<'), 'barres empilées : l\'échelle couvre le total (35 → graduation 40, pas plus)');
const crossing = renderToString(<LineChart values={[-20, 10, 40, -5]} labels={['a', 'b', 'c', 'd']} ariaLabel="Test" />);
const positive = renderToString(<LineChart values={[5, 10, 40]} labels={['a', 'b', 'c']} ariaLabel="Test" />);
ok(clean(crossing) && (crossing.match(/chart-line/g) || []).length === 2 && (positive.match(/chart-line/g) || []).length === 1, 'courbe : deux couleurs seulement quand elle passe sous zéro');
ok(crossing.includes('Dernier') && crossing.includes('Min') && crossing.includes('Max'), 'courbe : résumé « Dernier / Min / Max »');
const bc = renderToString(<BarChart values={[2, 8, 5]} labels={L3} fullLabels={['Lundi', 'Mardi', 'Mercredi']} ariaLabel="Test" unit="missions" />);
ok(bc.includes('Total') && bc.includes('Moyenne') && bc.includes('Meilleur') && bc.includes('Mardi'), 'barres : résumé total, moyenne et meilleur (avec le titre complet du jour)');
const bcEn = renderToString(<BarChart values={[2, 8, 5]} labels={L3} ariaLabel="Test" lang="en" />);
ok(bcEn.includes('Average') && bcEn.includes('Best') && !bcEn.includes('Moyenne'), 'barres : résumé en anglais');
const cmp = renderToString(<BarChart values={[2, 8, 5]} compare={[1, 9, 5]} compareLabel="Dépenses" labels={L3} ariaLabel="Test" />);
ok(clean(cmp) && cmp.includes('Dépenses') && cmp.includes('aria-pressed'), 'barres + comparaison : légende avec le nom de la comparaison');
ok(clean(renderToString(<BarChart values={[1e12, 5e11, 0]} labels={L3} ariaLabel="Test" />)) && renderToString(<BarChart values={[1e12, 5e11, 0]} labels={L3} ariaLabel="Test" />).includes('Md'), 'très grands nombres : « Md », sans erreur');
const big = renderToString(<XYChart labels={labels(365)} series={[{ key: 'a', label: 'A', values: Array.from({ length: 365 }, (_, i) => (i * 37) % 11), kind: 'bar' }, { key: 'b', label: 'B', values: Array.from({ length: 365 }, (_, i) => (i * 13) % 9), kind: 'area' }]} ariaLabel="Test" />);
ok(clean(big) && (big.match(/<text/g) || []).length < 30, `365 points : pas de chiffre qui déborde (${(big.match(/<text/g) || []).length} textes)`);
ok(clean(renderToString(<XYChart labels={['a']} series={[{ key: 'a', label: 'A', values: [5], kind: 'area' }]} ariaLabel="Test" />)) && clean(renderToString(<XYChart labels={['a']} series={[{ key: 'a', label: 'A', values: [0], kind: 'bar' }]} refLines={[{ value: 10, label: 'Objectif' }]} ariaLabel="Test" />)), 'une seule donnée, ou repère seul : sans erreur');
ok(clean(renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'A', values: [NaN, Infinity, 3], kind: 'line' }]} ariaLabel="Test" />)), 'courbe : NaN et infini ignorés');
ok(renderToString(<XYChart labels={L3} series={[{ key: 'a', label: 'A', values: [1, 2, 3] }]} ariaLabel="Test" />).includes('data-notranslate'), 'XYChart : exclu de la traduction automatique');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
