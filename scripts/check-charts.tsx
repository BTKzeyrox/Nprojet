// Contrôle des graphiques : aucun ne doit casser (ni « NaN ») avec 0, 1 ou 365 données.
// Lancer : npx --yes tsx scripts/check-charts.tsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BarChart, DonutChart, Gauge, LineChart, RankBars, Sparkline, XYChart, compactNumber } from '../src/components/charts/Charts';
import { StatCard } from '../src/components/StatCard';
import { centerFontSize, clip, donutParts, gaugeShape, rankBars, sparkShape, toggleSelection, validSelection } from '../src/utils/chartParts';

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


// ---------- Trous (prévision, jours à venir) ----------
const gapA = renderToString(<XYChart labels={['a', 'b', 'c', 'd']} series={[{ key: 'r', label: 'Réel', values: [10, 20, null, null], kind: 'area' }, { key: 'f', label: 'Prévision', values: [null, 20, 30, 40], kind: 'line', dashed: true, color: '#a78bfa' }]} ariaLabel="Test" summary="last" />);
ok(clean(gapA) && (gapA.match(/chart-line/g) || []).length === 1 && gapA.includes('stroke-dasharray="5 4"') && gapA.includes('#a78bfa'), 'trous : réel en trait plein, prévision en pointillé violet');
ok(gapA.includes('Dernier') && gapA.includes('>20</b>') && !gapA.includes('>40</b>'), 'trous : « Dernier » = dernière valeur réelle (20), pas la prévision (40)');
const gapMid = renderToString(<XYChart labels={['a', 'b', 'c']} series={[{ key: 'r', label: 'R', values: [5, null, 9], kind: 'line' }]} ariaLabel="Test" />);
ok(clean(gapMid) && (gapMid.match(/chart-line/g) || []).length === 2, 'trous : un trou au milieu coupe la courbe en deux morceaux');
ok(clean(renderToString(<XYChart labels={['a', 'b']} series={[{ key: 'r', label: 'R', values: [null, null], kind: 'line' }]} ariaLabel="Test" />)), 'trous : série entièrement vide sans erreur');
ok(clean(renderToString(<XYChart labels={['a', 'b', 'c']} series={[{ key: 'r', label: 'R', values: [1, null, 3], kind: 'bar' }, { key: 'q', label: 'Q', values: [null, 2, null], kind: 'bar' }]} ariaLabel="Test" />)), 'trous : barres avec cases vides sans erreur');

// ================= C3 : anneau interactif, classement, jauge, mini-courbes =================
const count = (html: string, re: RegExp) => (html.match(re) || []).length;

// ---------- Règles pures : parts de l'anneau ----------
ok(donutParts([], 'Autres').total === 0 && donutParts([{ label: 'A', value: 0 }, { label: 'B', value: -4 }, { label: 'C', value: NaN }], 'Autres').parts.length === 0, 'parts : vide, zéro, négatif et NaN ignorés');
const dp = donutParts([{ label: 'A', value: 50 }, { label: 'B', value: 30 }, { label: 'C', value: 20 }, { label: 'Z', value: -9 }], 'Autres');
ok(dp.total === 100 && dp.parts.length === 3 && dp.parts[0].pct === 50 && dp.parts[1].start === 0.5 && Math.abs(dp.parts[2].start + dp.parts[2].len - 1) < 1e-9, 'parts : pourcentages et départ de chaque part (le tour fait 1)');
const dp12 = donutParts(Array.from({ length: 12 }, (_, i) => ({ label: 'T' + i, value: i + 1 })), 'Autres');
ok(dp12.parts.length === 6 && dp12.parts[5].label === 'Autres' && dp12.parts[5].value === 6 + 7 + 8 + 9 + 10 + 11 + 12 && dp12.parts.reduce((t, x) => t + x.value, 0) === dp12.total, 'parts : au-delà de 6, les 5 premières restent et le reste (6 à 12 = 63) va dans « Autres »');
ok(toggleSelection(null, 2) === 2 && toggleSelection(2, 2) === null && toggleSelection(2, 3) === 3, 'sélection : toucher = choisir, retoucher = enlever, autre part = changer');
ok(validSelection(1, 3) === 1 && validSelection(3, 3) === null && validSelection(-1, 3) === null && validSelection(1.5, 3) === null && validSelection(null, 3) === null && validSelection(undefined, 3) === null && validSelection(NaN, 3) === null, 'sélection : une part qui n\'existe plus est ignorée');
ok(centerFontSize('123') === 18 && centerFontSize('1 234 567') === 12 && centerFontSize('12 345 678 901') === 10, 'centre de l\'anneau : le texte rétrécit quand il est long');
ok(clip('Court', 14) === 'Court' && clip('Un nom vraiment très long', 14).length === 14 && clip('Un nom vraiment très long', 14).endsWith('…'), 'centre de l\'anneau : nom trop long coupé avec « … »');

// ---------- Règles pures : barres de classement ----------
const rb = rankBars([10, 5, 0, -20]);
ok(rb.map(x => x.width).join() === '50,25,0,100' && rb[3].negative && !rb[0].negative && rb[0].share === 67 && rb[1].share === 33 && rb[2].share === null && rb[3].share === null, 'classement : largeurs en % du plus grand (valeur absolue), négatif repéré, parts du total');
ok(rankBars([]).length === 0 && rankBars([0, 0]).every(x => x.width === 0) && rankBars([NaN, Infinity]).every(x => x.width === 0 && x.share === null), 'classement : vide, zéros et valeurs fausses sans erreur');
ok(rankBars([1000, 0.01])[1].width === 3, 'classement : une petite valeur garde une barre visible (3 %)');

// ---------- Règles pures : jauge ----------
const gs = gaugeShape(130, 50);
ok(gs.fill === 100 && gs.over && gs.shownPct === 130, 'jauge : 130 % = arc plein, dépassement signalé, chiffre réel affiché');
ok(!!gs.mark && Math.abs(gs.mark.x1 - 60) < 0.2 && Math.abs(gs.mark.x2 - 60) < 0.2 && gs.mark.y1 === 23 && gs.mark.y2 === 5, 'jauge : le repère du rythme à 50 % est tout en haut, en travers de l\'arc');
ok(gaugeShape(100).dash === 150.8 && gaugeShape(50).dash === 75.4 && gaugeShape(130).dash === 150.8 && gaugeShape(0).dash === 0 && gaugeShape(34).dash === 51.3, 'jauge : longueur de l\'arc rempli calculée (100 % = 150,8 ; 50 % = 75,4 ; 130 % plafonné à 150,8)');
ok(gaugeShape(NaN).fill === 0 && gaugeShape(-20).fill === 0 && gaugeShape(-20).shownPct === 0 && !gaugeShape(40).over, 'jauge : NaN et négatif = 0 %');
ok([0, 100, 150, -5, NaN, undefined].every(m => gaugeShape(40, m as any).mark === null), 'jauge : pas de repère si le rythme est 0, 100 ou plus, négatif ou inconnu');

// ---------- Règles pures : mini-courbe ----------
ok(sparkShape([], 96, 34).empty && sparkShape([5], 96, 34).flat && sparkShape([2, 2, 2], 96, 34).flat && !sparkShape([1, 5, 2, 8], 96, 34).flat, 'mini-courbe : vide, 1 valeur et valeurs égales = trait plat ; sinon une vraie courbe');
const sp = sparkShape([1, 5, 2, 8], 96, 34);
ok(sp.last!.x === 93 && sp.last!.y === 3 && sp.min === 1 && sp.max === 8 && sp.area.startsWith('M3,34') && sp.area.endsWith('Z'), 'mini-courbe : dernier point en haut à droite (8 = le maximum), zone fermée sur la base');
ok(!/NaN|Infinity/.test(sparkShape([NaN, 3, Infinity], 96, 34).line + sparkShape([NaN], 96, 34).line), 'mini-courbe : NaN et infini sans erreur');

// ---------- Anneau : rendu ----------
const D3 = [{ label: 'Saisie', value: 50 }, { label: 'Web', value: 30 }, { label: 'Contrôle', value: 20 }];
const d0 = renderToString(<DonutChart items={D3} ariaLabel="Test" />);
ok(clean(d0) && count(d0, /aria-pressed="false"/g) === 3 && count(d0, /aria-pressed="true"/g) === 0, 'anneau : 3 lignes de légende cliquables, aucune choisie au départ');
ok(d0.includes('Touchez une part pour la détailler') && renderToString(<DonutChart items={D3} ariaLabel="Test" lang="en" />).includes('Tap a slice to see its details'), 'anneau : consigne en français et en anglais');
ok(!renderToString(<DonutChart items={[{ label: 'A', value: 5 }]} ariaLabel="Test" />).includes('Touchez une part'), 'anneau : une seule part, pas de consigne');
const d1 = renderToString(<DonutChart items={D3} ariaLabel="Test" defaultSelected={1} />);
ok(clean(d1) && count(d1, /aria-pressed="true"/g) === 1 && count(d1, /opacity="0\.3"/g) === 2, 'anneau : une part choisie = les 2 autres s\'estompent');
ok(d1.includes('>Web<') && d1.includes('>30<') && d1.includes('>30 %<') && d1.includes('Web : 30 · 30 % du total'), 'anneau : le centre montre le nom, la valeur et le % de la part choisie');
ok(renderToString(<DonutChart items={D3} ariaLabel="Test" defaultSelected={1} lang="en" />).includes('Web : 30 · 30 % of total'), 'anneau : phrase de la part choisie en anglais');
ok(count(renderToString(<DonutChart items={D3} ariaLabel="Test" defaultSelected={9} />), /aria-pressed="true"/g) === 0, 'anneau : une sélection hors limites est ignorée');
ok(renderToString(<DonutChart items={[{ label: 'Un nom vraiment très long pour le centre', value: 1234567 }]} ariaLabel="Test" defaultSelected={0} format={v => compactNumber(v)} />).includes('…'), 'anneau : un nom trop long est coupé au centre');
ok(d0.includes('data-notranslate') && count(d0, /<circle/g) >= 7, 'anneau : exclu de la traduction automatique, une zone de toucher par part');

// ---------- Classement : rendu ----------
const RI = [{ key: 'a', label: 'Alice', value: 40 }, { key: 'b', label: 'Bob', value: 20 }, { key: 'c', label: 'Chloé', value: 10 }, { key: 'd', label: 'Dan', value: -5 }, { key: 'e', label: 'Eve', value: 0 }];
const r0 = renderToString(<RankBars items={RI} ariaLabel="Classement" />);
ok(clean(r0) && count(r0, /<li/g) === 5 && r0.includes('aria-label="Classement"') && r0.includes('width:100%') && r0.includes('width:50%'), 'classement : 5 lignes, la plus grande à 100 %, la moitié à 50 %');
ok(r0.includes('bg-rose-500') && r0.includes('−5') && r0.includes('text-rose-400'), 'classement : la valeur négative est en rouge avec son signe');
const r1 = renderToString(<RankBars items={RI} ariaLabel="Classement" limit={2} />);
ok(count(r1, /<li/g) === 2 && r1.includes('Tout voir (5)') && renderToString(<RankBars items={RI} ariaLabel="C" limit={2} lang="en" />).includes('Show all (5)'), 'classement : limite de 2 lignes + bouton « Tout voir (5) » (FR et EN)');
ok(renderToString(<RankBars items={[{ key: 'a', label: 'Alice', value: 4, onClick: () => {} }]} ariaLabel="C" />).includes('<button'), 'classement : un nom devient un bouton quand on peut l\'ouvrir');
ok(renderToString(<RankBars items={[]} ariaLabel="C" emptyText="Rien" />).includes('Rien') && clean(renderToString(<RankBars items={[{ key: 'x', label: 'X', value: NaN }]} ariaLabel="C" />)), 'classement : vide avec message, valeur NaN sans erreur');
ok(renderToString(<RankBars items={RI} ariaLabel="C" showShare />).includes('>57 %<') && renderToString(<RankBars items={RI} ariaLabel="C" barClass="bg-sky-500" />).includes('bg-sky-500'), 'classement : part du total (40 sur 70 = 57 %) et couleur au choix');
ok(renderToString(<RankBars items={[{ key: 'a', label: 'Alice', value: 4, sub: <i>détail</i> }]} ariaLabel="C" />).includes('<i>détail</i>'), 'classement : ligne de détail sous la barre');

// ---------- Jauge : rendu ----------
const g130 = renderToString(<Gauge pct={130} state="good" label="Missions" detail="130 / 100" stateText="Objectif atteint" markPct={50} markText="Rythme : 50 %" />);
ok(clean(g130) && g130.includes('role="progressbar"') && g130.includes('aria-valuenow="100"') && g130.includes('>130 %<') && g130.includes('#10b981') && g130.includes('<line') && g130.includes('stroke-dasharray="150.8 150.8"') && !g130.includes('pathLength'), 'jauge : 130 % = barre pleine, chiffre 130 %, vert, repère du rythme');
ok(!renderToString(<Gauge pct={40} state="ok" label="L" detail="d" stateText="s" />).includes('<line') && renderToString(<Gauge pct={95} state="over" label="L" detail="d" stateText="Plafond dépassé" />).includes('#fb7185'), 'jauge : sans rythme pas de repère ; plafond dépassé = rouge');
ok(clean(renderToString(<Gauge pct={NaN} state="warn" label="L" detail="d" stateText="s" />)) && renderToString(<Gauge pct={0} state="warn" label="L" detail="d" stateText="s" />).includes('>0 %<'), 'jauge : NaN et 0 % sans erreur');
ok(g130.includes('aria-label="Missions : 130 %. 130 / 100. Objectif atteint. Rythme : 50 %"'), 'jauge : phrase lue par les lecteurs d\'écran');

// ---------- Mini-courbes : rendu ----------
const sk = renderToString(<Sparkline values={[1, 5, 2, 8]} color="#f59e0b" />);
ok(clean(sk) && sk.includes('<circle') && sk.includes('linearGradient') && sk.includes('url(#spark') && sk.includes('#f59e0b'), 'mini-courbe : zone en dégradé, point final, couleur donnée');
const twoSparks = renderToString(<div><Sparkline values={[1, 2, 3]} /><Sparkline values={[3, 2, 1]} /></div>);
const ids = [...twoSparks.matchAll(/linearGradient id="([^"]+)"/g)].map(x => x[1]);
ok(ids.length === 2 && ids[0] !== ids[1] && !ids.some(i => i.includes(':')), 'mini-courbes : chaque courbe a son propre dégradé (pas de collision, pas de « : » dans l\'identifiant)');
ok(!renderToString(<Sparkline values={[4, 4, 4]} />).includes('linearGradient id') || !renderToString(<Sparkline values={[4, 4, 4]} />).includes('<path'), 'mini-courbe : série plate = trait, sans zone');
ok(clean(renderToString(<Sparkline values={[]} />)) && renderToString(<Sparkline values={[]} />).includes('aria-hidden="true"'), 'mini-courbe : vide sans erreur');
const sc = (dir: 'up' | 'down', tone: 'good' | 'cost' | 'neutral') => renderToString(<StatCard label="X" value="5" deltaText="+1" deltaDir={dir} tone={tone} spark={[1, 3, 2, 5]} />);
ok(sc('up', 'good').includes('stroke="#10b981"') && sc('up', 'cost').includes('stroke="#f59e0b"') && sc('up', 'neutral').includes('stroke="#38bdf8"') && sc('down', 'good').includes('stroke="#f59e0b"'), 'cartes : mini-courbe verte si c\'est bien, orange si c\'est mauvais, bleue si neutre');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
