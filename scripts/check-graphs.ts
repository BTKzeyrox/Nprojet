// Page « Graphiques » (responsable) : tous les graphiques sur une seule page, 16 cartes, filtres clairs, une période pour toutes.
// Lecture seule : aucune saisie, aucun serveur, aucun minuteur. Les fusions gardent la vérité : avec ou sans salaires, un seul stockage à la fois.
import { readFileSync } from 'node:fs';
import { GRAPH_CARDS, GRAPH_GROUPS, GRAPH_GRANS, graphCount, graphNav, visibleCards, isGraphFilter, isGraphGran, cashRangeFor, cashRangeIsMonthOfYear } from '../src/utils/graphsPage';
import { isKnownView } from '../src/utils/health/menu';
import { HIDEABLE_MODULES } from '../src/utils/moduleSwitch';
import { findPage } from '../src/utils/siteKnowledge';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const r = (f: string) => readFileSync(f, 'utf8');

// ---------- Règles pures ----------
ok(GRAPH_CARDS.length === 16 && new Set(GRAPH_CARDS.map(c => c.id)).size === 16, '16 cartes, toutes avec un identifiant différent');
ok(graphCount('all') === 16 && graphCount('missions') === 3 && graphCount('money') === 8 && graphCount('stock') === 5, 'filtres : Tout 16, Missions 3, Argent 8, Stock 5 (ces chiffres sont affichés sur les boutons)');
ok(GRAPH_GROUPS.map(g => g.id).join() === 'all,missions,money,stock' && GRAPH_GROUPS.every(g => g.label.fr && g.label.en), 'filtres : Tout, Missions, Argent, Stock, en français et en anglais');
ok(GRAPH_CARDS.every(c => c.title.fr.trim() && c.title.en.trim() && !/[àâçéèêëîïôùûœ]/i.test(c.title.en.replace(/'/g, ''))), 'chaque carte a un titre FR et un titre EN (l\'anglais sans accent)');
ok(visibleCards('all').length === 16 && visibleCards('missions').every(c => c.group === 'missions') && visibleCards('money').every(c => c.group === 'money') && visibleCards('stock').every(c => c.group === 'stock') && visibleCards('money').length === 8, 'visibleCards : chaque filtre ne montre que son groupe');
ok(graphNav('flow') === 'gr-flow' && new Set(GRAPH_CARDS.map(c => graphNav(c.id))).size === 16, 'chaque carte a une adresse gr-<carte> différente (un lien pourra la faire clignoter)');
ok(isGraphFilter('all') && isGraphFilter('stock') && !isGraphFilter('x') && !isGraphFilter(null) && !isGraphFilter(undefined) && isGraphGran('week') && isGraphGran('year') && !isGraphGran('day') && !isGraphGran('') && GRAPH_GRANS.join() === 'week,month,year', 'filtres et périodes mémorisés : une valeur inconnue (ou « jour ») est refusée, on retombe sur la valeur par défaut');
// Caisse : jour par jour, donc un mois pour une année
ok(JSON.stringify(cashRangeFor('month', '2026-10-15', '2026-11-03')) === '{"start":"2026-10-01","end":"2026-10-31"}' && JSON.stringify(cashRangeFor('week', '2026-11-03', '2026-11-03')) === '{"start":"2026-11-02","end":"2026-11-08"}', 'caisse : un mois ou une semaine = la même période que la page');
ok(JSON.stringify(cashRangeFor('year', '2026-03-10', '2026-11-03')) === '{"start":"2026-11-01","end":"2026-11-30"}' && JSON.stringify(cashRangeFor('year', '2025-03-10', '2026-11-03')) === '{"start":"2025-12-01","end":"2025-12-31"}', 'caisse : pour l\'année en cours, le mois du jour ; pour une année passée, décembre');
ok(cashRangeIsMonthOfYear('year') && !cashRangeIsMonthOfYear('month') && !cashRangeIsMonthOfYear('week'), 'caisse : la note « affiche un mois » ne sort que pour une année');

// ---------- Les 16 cartes sont dans le code, chacune derrière son filtre ----------
const files: Record<string, string> = { missions: r('src/views/admin/graphs/GraphsMissions.tsx'), money: r('src/views/admin/graphs/GraphsMoney.tsx'), stock: r('src/views/admin/graphs/GraphsStock.tsx') };
for (const c of GRAPH_CARDS) ok(new RegExp(`show\\('${c.id}'\\) && \\(\\s*<GraphCard id="${c.id}"`).test(files[c.group]), `carte « ${c.id} » : dans le fichier ${c.group}, derrière son filtre`);
const page = r('src/views/admin/GraphsPage.tsx'), card = r('src/views/admin/graphs/GraphCard.tsx');
ok(/data-nav=\{graphNav\(id\)\}/.test(card) && /data-graph=\{id\}/.test(card) && /lg:min-h-\[340px\]/.test(card), 'carte commune : adresse, repère, hauteur minimale sur grand écran (un carré lisible)');
ok(/grid grid-cols-1 lg:grid-cols-2/.test(page), 'mise en page : une colonne sur téléphone, 2 colonnes (4 carrés par écran) sur grand écran');
ok(/role="tablist"/.test(page) && /GRAPH_GROUPS\.map/.test(page) && /graphCount\(x\.id\)/.test(page) && /GRAPH_GRANS\.map/.test(page), 'page : boutons Tout / Missions / Argent / Stock avec leur chiffre, et Semaine / Mois / Année');
ok(/shiftAnchor/.test(page) && /comparableRanges/.test(page) && /setAnchor\(today\)/.test(page) && /disabled=\{atPresent\}/.test(page), 'page : flèches de période, « Aujourd\'hui », pas de période suivante dans le futur');
ok(/role !== 'admin'\) return null/.test(page), 'page : réservée au responsable (rien ne s\'affiche pour un autre rôle)');
ok(/spaces\.length > 1 && \(filter === 'all' \|\| filter === 'stock'\)/.test(page) && /spaceId=\{spaceId\}/.test(page), 'stock : le choix du stockage n\'apparaît que s\'il y en a plusieurs ; un seul stockage à la fois');
ok(/inSpace\(db\.getProducts\(\), db\.getStockMoves\(\), spaceId\)/.test(files.stock), 'stock : les produits et mouvements viennent d\'un seul stockage (jamais mélangés)');
ok(/GraphsMissions g=\{g\} anchor=\{anchor\}/.test(page) && /GraphsMoney g=\{g\} range=\{range\}/.test(page) && /GraphsStock range=\{range\}/.test(page), 'une seule période : les 3 groupes de cartes reçoivent la même');
// ---------- Fusions honnêtes ----------
ok(/computeFinance\(/.test(files.money) && /treasuryCharts\(cash, cr, today\)/.test(files.money), 'argent : mêmes calculs que Finances (computeFinance) et que la Trésorerie (treasuryCharts)');
ok(/\[\['all', t\('Avec salaires'/.test(files.money) && /Caisse \(sans salaires\)/.test(files.money) && (files.money.match(/right=\{toggle\}/g) || []).length === 2, 'fusion « avec ou sans salaires » : un bouton dans les 2 cartes (Argent reçu et dépenses, Dépenses par catégorie) ; ce n\'est pas le même chiffre, c\'est dit');
ok(/mode === 'all'\s*\?\s*<MoneyFlowChart labels=\{f\.labels\}/.test(files.money) && /mode === 'all'\s*\?\s*<DonutChart items=\{f\.expensesByCategory\}/.test(files.money), 'avec salaires : exactement les données de Statistiques > Finances');
ok(/treasuryCharts\(cash/.test(files.money) && /outByCategory/.test(files.money) && /inByCategory/.test(files.money) && /balanceTotal/.test(files.money), 'sans salaires : exactement les données de la Trésorerie (solde, d\'où vient, où part)');
ok(/stacked legend/.test(files.missions) && /<DonutChart items=\{stats\.byType/.test(files.missions), 'missions : barres empilées par type + anneau dans la même carte (fusion de 3 graphiques)');
ok(/Les 12 derniers mois/.test(files.stock) && /valueByMonth\(products, moves, today, 12\)/.test(files.stock) && /topUsed\(products, moves, range\.start, end, 5\)/.test(files.stock), 'stock : valeur dans le temps (12 mois) et produits les plus sortis (sur la période de la page)');
ok(/const end = range\.end > today \? today : range\.end/.test(files.stock), 'stock : jamais de période dans le futur');
// ---------- Étape 2 : chaque carte = l'ancien graphique (mêmes données, mêmes réglages, mêmes couleurs) ----------
const S = 'src/views/admin/';
const old = { stats: r(S + 'StatsPage.tsx'), fin: r(S + 'FinanceInsights.tsx'), tre: r(S + 'TreasuryCharts.tsx'), trePage: r(S + 'TreasuryPage.tsx'), dash: r(S + 'StockDashboard.tsx'), ana: r(S + 'StockAnalytics.tsx') };
const nw = { missions: files.missions, money: files.money, stock: files.stock };
const same: [string, string, string, string][] = [
  // [explication, extrait, ancien fichier, nouveau fichier]
  ['missions par type : barres empilées avec légende', 'stacked legend labels={stats.labels} fullLabels={stats.fullLabels}', 'stats', 'missions'],
  ['missions par type : une série en barres par type', "values: x.values, kind: 'bar' as const", 'stats', 'missions'],
  ['missions par type : anneau (centre « missions »)', "centerLabel={l === 'en' ? 'done' : 'missions'}", 'stats', 'missions'],
  ['équipe : classement par missions faites', "'Classement par missions faites'", 'stats', 'missions'],
  ['salaires : barres, somme et moyenne', 'summary="sum" showAverage', 'stats', 'missions'],
  ['salaires : axe compact', 'axisFormat={compactNumber}', 'stats', 'missions'],
  ['argent reçu et dépenses (avec salaires) : mêmes séries', 'inflow={f.series.inflow} outflow={f.series.outflow}', 'fin', 'money'],
  ['argent reçu et dépenses (sans salaires) : mêmes séries', 'inflow={c.inflow} outflow={c.outflow}', 'tre', 'money'],
  ['argent reçu et dépenses : mêmes libellés', "inLabel={t('Argent reçu', 'Money received')} outLabel={t('Dépenses', 'Expenses')} balanceLabel={t('Solde', 'Balance')}", 'fin', 'money'],
  ['bénéfice cumulé : aire, lignes de signe, dernier point', 'summary="last" signColors', 'fin', 'money'],
  ['bénéfice cumulé : prévision en pointillé violet', "dashed: true, color: '#a78bfa'", 'fin', 'money'],
  ['bénéfice cumulé : objectif', "label: t('Objectif', 'Goal'), color: '#a78bfa'", 'fin', 'money'],
  ['solde de la caisse : aire depuis le solde de départ', "values: c.balanceTotal, kind: 'area' as const", 'tre', 'money'],
  ['facturé et reçu : mêmes séries', 'billed={f.series.billed} received={f.series.inflow}', 'fin', 'money'],
  ['facturé et reçu : « Reste à encaisser »', "leftLabel={t('Reste à encaisser', 'Left to collect')}", 'fin', 'money'],
  ['dépenses par catégorie (avec salaires) : anneau', 'DonutChart items={f.expensesByCategory} format={short} centerLabel="Ar"', 'fin', 'money'],
  ['dépenses par catégorie (sans salaires) : 6 lignes avec part', 'format={ar} limit={6} showShare', 'tre', 'money'],
  ['clients : 5 lignes avec part', 'format={ar} limit={5} showShare', 'fin', 'money'],
  ['clients : mêmes données', 'items={f.clients.map(', 'fin', 'money'],
  ['d\'où vient l\'argent : par catégorie', 'c.inByCategory', 'tre', 'money'],
  ['marge par type : même texte de valeur', "valueText: `${x.margin < 0 ? '−' : ''}", 'fin', 'money'],
  ['stock : valeur sur 12 mois', 'valueByMonth(products, moves, today, 12)', 'ana', 'stock'],
  ['stock : produits sortis, barres bleues', 'barClass="bg-sky-500"', 'ana', 'stock'],
  ['stock : valeur par catégorie, barres vertes', 'barClass="bg-emerald-500"', 'ana', 'stock'],
  ['stock : fournisseurs, barres ambre', 'barClass="bg-amber-500"', 'ana', 'stock'],
  ['stock : achats les plus chers, barres rouges', 'barClass="bg-rose-500"', 'ana', 'stock'],
  ['stock : valeur dans le temps aussi dans le tableau de bord', 'valueByMonth', 'dash', 'stock'],
];
// Étape 2 faite : chaque carte avait été comparée à l'ancien graphique (mêmes séries, libellés, réglages, couleurs). Les anciens écrans n'ont plus ces graphiques (étape 3) : on garde la vérification des réglages de la nouvelle carte.
for (const [what, snippet, , nn] of same) {
  const newTxt = (nw as any)[nn].replace(/\s+/g, ' ');
  ok(newTxt.includes(snippet) || newTxt.replace(/\b(?:t|x|r|u|c)\.(margin|marginPct|done|billed|salaries)\b/g, 'ROW.$1').includes(snippet.replace(/\b(?:t|x|r|u|c)\.(margin|marginPct|done|billed|salaries)\b/g, 'ROW.$1')), `nouvelle carte : ${what}`);
}
// Les couleurs et le style des cartes sont ceux des anciennes pages
ok(/bg-\[#0f1722\] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3/.test(card) && /bg-\[#0f1722\] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3/.test(old.fin), 'style : même fond, même bordure et mêmes marges que les cartes d\'origine');
ok(/text-sm sm:text-base font-bold text-white/.test(card) && /text-\[11px\] text-slate-500/.test(card), 'style : même titre et même note que les cartes d\'origine');
ok(/bg-emerald-700 border-emerald-500 text-white/.test(page) && /bg-emerald-700 border-emerald-500 text-white/.test(old.stats), 'style : boutons de filtre du même vert que Statistiques');
ok(/min-h-\[44px\]/.test(page) && /min-h-\[36px\]/.test(card), 'tactile : boutons de 44 px (filtres) et 36 px (choix dans une carte) au moins');

// ---------- Lecture seule, rien de caché ----------
const all = [page, card, ...Object.values(files)].join('\n');
ok(!/setInterval|setTimeout|Date\.now\(\)|fetch\(|XMLHttpRequest/.test(all) && (all.match(/addEventListener\(/g) || []).length === 1 && /addEventListener\(OPEN_GRAPHS_EVENT/.test(all) && /removeEventListener\(OPEN_GRAPHS_EVENT/.test(all), 'page et cartes : aucun minuteur, aucune horloge cachée, aucun appel réseau ; un seul écouteur (« Voir les graphiques »), bien retiré');
ok(!/db\.(add|update|delete|save|set|remove|create|insert|post|put|patch)[A-Z(]/.test(all) && !/payrollCall|\.rpc\(/.test(all), 'page et cartes : lecture seule, rien n\'est écrit ni demandé au serveur');
ok(/db\.subscribe/.test(page), 'page : se remet à jour quand les données changent');
ok(/try \{ return localStorage\.getItem/.test(page) && /catch \{ return null; \}/.test(page) && /catch \{ \/\* stockage refusé/.test(page), 'page : le choix gardé dans le navigateur ne plante jamais si le stockage est refusé');
// ---------- Branchement dans le site ----------
const app = r('src/App.tsx'), side = r('src/components/Sidebar.tsx');
ok(/lazy\(\(\) => import\('\.\/views\/admin\/GraphsPage'\)/.test(app) && /activeView === 'charts' \? \(\s*<GraphsPage onOpenEmployee=/.test(app), 'App : la page est chargée à la demande et affichée pour la vue « charts »');
ok(/isAdmin \? \[\{ id: 'charts'/.test(side) && /icon: LayoutGrid/.test(side), 'menu : « Graphiques » pour le responsable seulement');
ok(isKnownView('charts') && HIDEABLE_MODULES.some(m => m.id === 'charts') && !!findPage('charts') && findPage('charts')!.audience === 'admin', 'vue connue (alertes, assistant), cachable depuis Réglages, carte du site (audience : responsable)');
const card2 = findPage('charts')!;
ok(card2.howto.length === 3 && card2.howto.every(h => h.fr && h.en) && card2.rules.length >= 2, 'carte du site : mode d\'emploi en 3 lignes FR/EN et règles');
const roles = r('src/utils/roles.ts');
ok(!/ACCOUNTANT_VIEWS = \[[^\]]*'charts'/.test(roles) && !/TEAM_LEAD_VIEWS = \[[^\]]*'charts'/.test(roles), 'Comptable et Chef d\'équipe : pas de page Graphiques (le responsable seulement)');
ok(/charts: \[/.test(r('scripts/make-guide.ts')) && /'stats', 'charts'/.test(r('src/utils/guideScripts.ts')), 'guide : la page a ses fichiers listés et son clip');
// ---------- Étape 3 : les graphiques ont quitté les anciennes pages, un bouton « Voir les graphiques » les remplace ----------
const CHART_TAGS = /<(ActivityGrid|MoneyFlowChart|BilledReceivedBars|XYChart|DonutChart|LineChart|RankBars)\b/;
ok(!CHART_TAGS.test(old.stats) && !CHART_TAGS.test(old.fin) && !CHART_TAGS.test(old.dash) && !CHART_TAGS.test(old.ana), 'anciennes pages (Statistiques, Finances, Stockage tableau de bord et Analyses) : plus aucun graphique');
ok(/<OpenGraphsButton filter="missions"/.test(old.stats) && /<OpenGraphsButton filter="money"/.test(old.fin) && /<OpenGraphsButton filter="stock"/.test(old.dash) && /<OpenGraphsButton filter="stock"/.test(old.ana), 'anciennes pages : le bouton « Voir les graphiques » ouvre le bon groupe (Missions, Argent, Stock)');
ok(/role === 'admin'\s*\? <OpenGraphsButton filter="money"/.test(old.trePage) && /: <TreasuryCharts /.test(old.trePage), 'Trésorerie : le responsable a le bouton ; le Comptable (qui n\'a pas la page Graphiques, elle montre les salaires) garde ses graphiques');
ok(CHART_TAGS.test(old.tre) && /treasuryCharts\(cash/.test(old.tre), 'Trésorerie du Comptable : ses 4 graphiques sont intacts');
ok(!/ACCOUNTANT_VIEWS = \[[^\]]*'charts'/.test(roles), 'le Comptable n\'a pas la page Graphiques');
const btn = r('src/components/OpenGraphsButton.tsx'), gnav = r('src/utils/graphsNav.ts');
ok(/Voir les graphiques/.test(btn) && /See the charts/.test(btn) && /openGraphs\(filter\)/.test(btn) && /min-h-\[44px\]/.test(btn), 'bouton : « Voir les graphiques » / « See the charts », 44 px');
ok(/OPEN_GRAPHS_EVENT/.test(gnav) && /takeGraphsIntent/.test(gnav) && /addEventListener\(OPEN_GRAPHS_EVENT/.test(app) && /setActiveView\('charts'\)/.test(app) && /removeEventListener\(OPEN_GRAPHS_EVENT/.test(app), 'App : le bouton change de page et nettoie son écouteur');
ok(/takeGraphsIntent\(\)/.test(page) && /groupOfGraphNav\(peekNavTarget\(\)\)/.test(page), 'page : s\'ouvre sur le groupe demandé, ou sur le groupe de la carte visée par un lien');
ok(/onOpenEmployee=\{handleOpenEmployeeCV\}/.test(app) && /onClick: onOpenEmployee && u \? \(\) => onOpenEmployee\(u\) : undefined/.test(files.missions), 'équipe : un clic sur un employé ouvre sa fiche (comme avant dans Statistiques)');
// Liens : les graphiques sont visés dans la page Graphiques, les chiffres restent dans Finances
const { FIN_NAV, finGo, FIGURE_GO } = await import('../src/utils/financeNav');
const { groupOfGraphNav } = await import('../src/utils/graphsPage');
ok(finGo('flow').view === 'charts' && finGo('flow').nav === 'gr-flow' && finGo('cum').nav === 'gr-cum' && finGo('billed').nav === 'gr-billed' && finGo('expenses').nav === 'gr-categories' && !finGo('flow').tab, 'liens : argent reçu, bénéfice cumulé, facturé et dépenses visent la carte de la page Graphiques');
ok(finGo('profit').view === 'stats' && finGo('profit').tab === 'finance' && finGo('profit').nav === 'fin-profit' && finGo('budgets').nav === 'fin-budgets' && finGo('treasury').nav === 'fin-treasury', 'liens : bénéfice, budgets et trésorerie (des chiffres) restent dans Statistiques > Finances');
ok(Object.values(FIN_NAV).filter(v => v.startsWith('gr-')).every(v => GRAPH_CARDS.some(c => graphNav(c.id) === v)), 'chaque lien vers une carte de la page Graphiques vise une carte qui existe');
ok(FIGURE_GO.received.view === 'charts' && FIGURE_GO.expenses.nav === 'gr-categories' && FIGURE_GO.billed.nav === 'gr-billed' && FIGURE_GO.profit.view === 'stats', 'chiffres « Pourquoi ce chiffre ? » : reçu, dépenses, facturé → graphique ; bénéfice → tuile');
ok(groupOfGraphNav('gr-flow') === 'money' && groupOfGraphNav('gr-team') === 'missions' && groupOfGraphNav('gr-stockused') === 'stock' && groupOfGraphNav('gr-nope') === null && groupOfGraphNav('fin-profit') === null && groupOfGraphNav(null) === null && groupOfGraphNav(undefined) === null, 'lien vers une carte : le groupe est retrouvé ; une adresse inconnue ou d\'une autre page = rien');
ok(/finGo\('expenses'\)/.test(r('src/utils/health/rules/stats.ts')) && /finGo\('flow'\)/.test(r('src/utils/health/rules/stats.ts')) && /finGo\('expenses'\)/.test(r('src/utils/health/rules/finance.ts')), 'Santé du site : dépense en hausse, moins d\'argent reçu et « Autres » trop grosse visent la page Graphiques');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
