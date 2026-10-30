// Contrôle des trois graphiques lisibles et du bouton thème / langue (2026-10-29). Sans réseau. Lancer : npm run check:styled-charts
import fs from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: { classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} };

const { MoneyFlowChart, BilledReceivedBars, ActivityGrid } = await import('../src/components/charts/StyledCharts');
const { ThemeLangControls } = await import('../src/components/ThemeLangControls');
const { AppProvider } = await import('../src/context/AppContext');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|null%/.test(h);
const ar = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} Ar`;
const days = (k: number) => Array.from({ length: k }, (_, i) => String(i + 1));
const full = (k: number) => Array.from({ length: k }, (_, i) => `jour ${i + 1}`);
const R = (el: React.ReactElement) => renderToString(el);

// ---- 1. Argent reçu et dépenses
const inflow = [0, 50000, 0, 120000, 30000, 0, 80000], outflow = [10000, 0, 20000, 0, 45000, 5000, 0];
const m1 = R(<MoneyFlowChart labels={days(7)} fullLabels={full(7)} inflow={inflow} outflow={outflow} format={ar} inLabel="Argent reçu" outLabel="Dépenses" balanceLabel="Solde" ariaLabel="Argent" />);
ok(!bad(m1) && m1.includes('<svg') && m1.includes('<path'), 'courbes : se dessinent sans valeur fausse');
ok(m1.includes(ar(280000)) && m1.includes(ar(80000)) && m1.includes(ar(200000)), 'courbes : les 3 gros chiffres (reçu 280 000, dépenses 80 000, solde 200 000)');
ok(m1.includes('Argent reçu') && m1.includes('Dépenses') && m1.includes('Solde'), 'courbes : les 3 titres des chiffres');
ok(m1.includes('Touchez le graphique'), 'courbes : consigne « Touchez le graphique »');
ok((m1.match(/class="chart-line"/g) || []).length === 2 && (m1.match(/class="chart-area"/g) || []).length === 2, 'courbes : 2 courbes et 2 zones colorées');
const mNeg = R(<MoneyFlowChart labels={days(3)} inflow={[0, 1000, 0]} outflow={[5000, 2000, 1000]} format={ar} inLabel="Reçu" outLabel="Dép." balanceLabel="Solde" ariaLabel="x" />);
ok(!bad(mNeg) && mNeg.includes(ar(-7000)) && mNeg.includes('#fb7185'), 'courbes : solde négatif affiché en rouge, sans erreur');
ok(!bad(R(<MoneyFlowChart labels={days(1)} inflow={[5000]} outflow={[0]} format={ar} inLabel="a" outLabel="b" balanceLabel="c" ariaLabel="x" />)), 'courbes : un seul jour');
const withNull = R(<MoneyFlowChart labels={days(5)} inflow={[1000, 2000, null, null, null]} outflow={[500, null, null, null, null]} format={ar} inLabel="a" outLabel="b" balanceLabel="c" ariaLabel="x" />);
ok(!bad(withNull), 'courbes : jours à venir (valeurs manquantes) sans erreur');
const mEmpty = R(<MoneyFlowChart labels={days(4)} inflow={[0, 0, 0, 0]} outflow={[0, 0, 0, 0]} format={ar} inLabel="a" outLabel="b" balanceLabel="c" ariaLabel="x" />);
ok(mEmpty.includes('Aucune donnée') && !mEmpty.includes('<path'), 'courbes : tout à zéro → message « Aucune donnée », pas de courbe');
ok(R(<MoneyFlowChart labels={[]} inflow={[]} outflow={[]} format={ar} inLabel="a" outLabel="b" balanceLabel="c" ariaLabel="x" />).includes('Aucune donnée'), 'courbes : aucune période → message');
const big = Array.from({ length: 31 }, (_, i) => (i % 5) * 10000);
const m31 = R(<MoneyFlowChart labels={days(31)} inflow={big} outflow={big.map(v => v / 2)} format={ar} inLabel="a" outLabel="b" balanceLabel="c" ariaLabel="x" />);
ok(!bad(m31) && (m31.match(/<text/g) || []).length < 20, `courbes : 31 jours → peu d'étiquettes (${(m31.match(/<text/g) || []).length}), jamais serrées`);
const mEn = R(<MoneyFlowChart lang="en" labels={days(3)} inflow={[1, 2, 3]} outflow={[1, 1, 1]} format={v => `${v} Ar`} inLabel="Money received" outLabel="Expenses" balanceLabel="Balance" ariaLabel="x" />);
ok(mEn.includes('Tap the chart') && !mEn.includes('Touchez'), 'courbes : anglais');

// ---- 2. Facturé et reçu
const billed = [100000, 0, 250000, 0, 80000], recv = [40000, 60000, 0, 120000, 80000];
const b1 = R(<BilledReceivedBars labels={days(5)} fullLabels={full(5)} billed={billed} received={recv} format={ar} billedLabel="Facturé" receivedLabel="Reçu" leftLabel="Reste à encaisser" ariaLabel="Facturé et reçu" />);
ok(!bad(b1) && b1.includes('<rect'), 'barres : se dessinent sans valeur fausse');
ok(b1.includes(ar(430000)) && b1.includes(ar(300000)) && b1.includes(ar(130000)), 'barres : facturé 430 000, reçu 300 000, reste à encaisser 130 000');
ok(b1.includes('role="tablist"') && (b1.match(/role="tab"/g) || []).length === 3 && b1.includes('Les deux') && b1.includes('>Facturé<') && b1.includes('>Reçu<'), 'barres : 3 onglets (Les deux, Facturé, Reçu)');
ok(b1.includes('aria-selected="true"') && (b1.match(/aria-selected="true"/g) || []).length === 1, 'barres : un seul onglet actif');
ok((b1.match(/class="chart-bar"/g) || []).length === 9, 'barres : « Les deux » = une barre facturée par jour (5) + une barre reçue par jour où il y a du reçu (4) ; une valeur à zéro ne dessine rien');
const over = R(<BilledReceivedBars labels={days(2)} billed={[1000, 0]} received={[5000, 2000]} format={ar} billedLabel="F" receivedLabel="R" leftLabel="Reste" ariaLabel="x" />);
ok(!bad(over) && over.includes(`>${ar(0)}<`), 'barres : plus reçu que facturé → reste à encaisser = 0 (jamais négatif)');
ok(R(<BilledReceivedBars labels={days(4)} billed={[0, 0, 0, 0]} received={[0, 0, 0, 0]} format={ar} billedLabel="F" receivedLabel="R" leftLabel="Reste" ariaLabel="x" />).includes('Aucune donnée'), 'barres : tout à zéro → message');
const b31 = R(<BilledReceivedBars labels={days(31)} billed={big} received={big.map(v => v / 2)} format={ar} billedLabel="F" receivedLabel="R" leftLabel="Reste" ariaLabel="x" />);
ok(!bad(b31) && b31.includes('overflow-x-auto'), 'barres : 31 jours → défilement horizontal (les barres restent larges)');
const wm = /<svg role="img"[^>]*width="(\d+)"/.exec(b31);
ok(!!wm && Number(wm[1]) >= 31 * 30, `barres : zone de dessin assez large (${wm && wm[1]} px pour 31 jours, au moins 30 px par jour)`);
ok(R(<BilledReceivedBars lang="en" labels={days(2)} billed={[1, 2]} received={[1, 1]} format={v => `${v}`} billedLabel="Billed" receivedLabel="Received" leftLabel="Left" ariaLabel="x" />).includes('>Both<'), 'barres : anglais (« Both »)');

// ---- 3. Missions faites : calendrier de carrés
const done = [0, 2, 3, 0, 5, 1, 4, 2, 0, 6, 1, 0, 3, 2];
const a1 = R(<ActivityGrid labels={days(14)} fullLabels={full(14)} values={done} ariaLabel="Missions faites" />);
ok(!bad(a1), 'calendrier : sans valeur fausse');
ok((a1.match(/<button/g) || []).length === 14, 'calendrier : un carré par jour (14)');
ok(a1.includes('grid-template-columns:repeat(7, minmax(0, 1fr))') || a1.includes('grid-template-columns:repeat(7,minmax(0,1fr))'), 'calendrier : 7 colonnes (une semaine par ligne)');
ok(a1.includes('>29<') && a1.includes('>2,1<') && a1.includes('>6<'), 'calendrier : total 29, moyenne 2,1 par jour, meilleur 6');
ok(a1.includes('Moins') && a1.includes('Plus') && a1.includes('Touchez le graphique'), 'calendrier : légende « Moins / Plus » et consigne');
const withFuture = R(<ActivityGrid labels={days(10)} values={[2, 3, 1, null, null, null, null, null, null, null]} ariaLabel="x" />);
ok(!bad(withFuture) && (withFuture.match(/border-dashed/g) || []).length === 7 && withFuture.includes('>6<'), 'calendrier : jours à venir en pointillé, comptés à part (total 6)');
ok(R(<ActivityGrid labels={days(3)} values={[1, 0, 2]} ariaLabel="x" />).includes('repeat(3,') || R(<ActivityGrid labels={days(3)} values={[1, 0, 2]} ariaLabel="x" />).includes('repeat(3, '), 'calendrier : 3 périodes → 3 colonnes (pas 7 vides)');
ok(R(<ActivityGrid labels={days(12)} values={Array(12).fill(0)} ariaLabel="x" />).includes('>—<'), 'calendrier : aucune mission → « meilleur » = tiret');
ok(R(<ActivityGrid labels={[]} values={[]} ariaLabel="x" />).includes('Aucune donnée'), 'calendrier : aucune période → message');
const a31 = R(<ActivityGrid labels={days(31)} values={Array.from({ length: 31 }, (_, i) => i % 6)} ariaLabel="x" />);
ok(!bad(a31) && (a31.match(/<button/g) || []).length === 31, 'calendrier : 31 jours = 31 carrés');
ok(R(<ActivityGrid lang="en" labels={days(7)} values={[1, 2, 3, 4, 5, 6, 7]} ariaLabel="x" />).includes('Less') && R(<ActivityGrid lang="en" labels={days(7)} values={[1.5, 2, 3, 4, 5, 6, 7]} ariaLabel="x" />).includes('Best'), 'calendrier : anglais');
ok(a1.includes('aria-label="jour 5 : 5 missions"') && a1.includes('aria-label="jour 6 : 1 mission"'), 'calendrier : chaque carré est lisible à voix haute (« jour 5 : 5 missions », « 1 mission » au singulier)');

// ---- 4. Bouton thème et liste de langue
const tl = R(<AppProvider><ThemeLangControls /></AppProvider>);
ok(!bad(tl) && tl.includes('role="switch"') && tl.includes('aria-checked'), 'thème : interrupteur (role switch)');
ok(tl.includes('lucide-sun') && tl.includes('lucide-moon'), 'thème : icônes soleil et lune');
ok(tl.includes('<select') && tl.includes('value="fr"') && tl.includes('value="en"') && tl.includes('Français') && tl.includes('English'), 'langue : petite liste Français / English');
ok(!/>Thème (clair|sombre)</.test(tl), 'plus de gros boutons « Thème clair / sombre »');
const sv = fs.readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok((sv.match(/<ThemeLangControls \/>/g) || []).length === 2 && !/Thème clair|Thème sombre/.test(sv) && !/setLang\('fr'\)/.test(sv), 'Réglages : le contrôle remplace les gros boutons aux 2 endroits');

// ---- 5. Les pages utilisent les nouveaux graphiques
const fi = fs.readFileSync('src/views/admin/FinanceInsights.tsx', 'utf8');
ok(/<MoneyFlowChart/.test(fi) && /<BilledReceivedBars/.test(fi), 'Finances : « Argent reçu et dépenses » et « Facturé et reçu » utilisent les nouveaux graphiques');
ok(/summary="last" signColors/.test(fi), 'Finances : « Bénéfice cumulé » garde son graphique');
const sp = fs.readFileSync('src/views/admin/StatsPage.tsx', 'utf8');
ok(/<ActivityGrid/.test(sp) && !/series=\{\[\n\s+\{ key: 'done', label: l === 'en' \? 'Missions done'/.test(sp), 'Statistiques : « Missions faites » utilise le calendrier');
ok(/Missions par type/.test(sp) && /stacked legend/.test(sp), 'Statistiques : « Missions par type » garde son graphique');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
