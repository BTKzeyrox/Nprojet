// Contrôle des graphiques : aucun ne doit casser (ni « NaN ») avec 0, 1 ou 365 données.
// Lancer : npx --yes tsx scripts/check-charts.tsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BarChart, DonutChart, Sparkline, compactNumber } from '../src/components/charts/Charts';

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
ok(renderToString(<BarChart values={[1, 2]} labels={['a', 'b']} ariaLabel="Test" lang="en" />).includes('Tap a bar') && renderToString(<BarChart values={[1, 2]} labels={['a', 'b']} ariaLabel="Test" lang="fr" />).includes('Touchez une barre'), 'barres : textes en français et en anglais');
ok(renderToString(<BarChart values={[1]} labels={['a']} ariaLabel="Test" />).includes('data-notranslate'), 'barres : exclues de la traduction automatique');
ok(clean(renderToString(<DonutChart items={[{ label: 'A', value: 0 }]} ariaLabel="Test" />)), 'anneau : une part à zéro');
ok(clean(renderToString(<DonutChart items={[{ label: 'A', value: 5 }]} ariaLabel="Test" />)), 'anneau : une seule part');
ok(renderToString(<DonutChart items={Array.from({ length: 12 }, (_, i) => ({ label: 'T' + i, value: i + 1 }))} ariaLabel="Test" />).includes('Autres'), 'anneau : plus de 6 parts regroupées en « Autres »');
ok(clean(renderToString(<Sparkline values={[]} />)) && clean(renderToString(<Sparkline values={[3]} />)) && clean(renderToString(<Sparkline values={[1, 5, 2, 8]} />)), 'mini-courbe : 0, 1 ou plusieurs valeurs');
ok(compactNumber(950) === '950' && compactNumber(1500) === '1,5 k' && compactNumber(2_500_000) === '2,5 M', 'nombres courts : 950 / 1,5 k / 2,5 M');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
