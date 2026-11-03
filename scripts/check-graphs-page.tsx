// Essai de la page « Graphiques » dessinée pour de vrai (sans écran réel, sans réseau) : démo admin, 16 cartes, filtres, FR et EN, opérateur sans accès.
// Lancer : npm run check:graphs-page. Complète check:graphs (qui lit le code) : ici la page est rendue avec les données de la démo.
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { GraphsPage } = await import('../src/views/admin/GraphsPage');
const { GRAPH_CARDS } = await import('../src/utils/graphsPage');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const page = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><GraphsPage /></AppProvider>).replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' ').replace(/&#x27;/g, "'"); };
const cardIds = (html: string) => [...html.matchAll(/data-graph="([a-z]+)"/g)].map(m => m[1]);

// ---------- Démo admin : tout s'affiche ----------
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  delete mem.graphs_filter; delete mem.graphs_gran;
  const html = page(lang);
  ok(!bad(html), `${lang} : aucun NaN, « undefined » ni « null » affiché`);
  ok(cardIds(html).join() === GRAPH_CARDS.map(c => c.id).join(), `${lang} : les 16 cartes sont là, dans l'ordre`);
  ok(GRAPH_CARDS.every(c => html.includes(lang === 'en' ? c.title.en : c.title.fr) || html.includes((lang === 'en' ? c.title.en : c.title.fr).split(',')[0])), `${lang} : chaque carte a son titre dans la bonne langue`);
  ok(html.includes(lang === 'en' ? 'All' : 'Tout') && html.includes('(16)') && html.includes('(3)') && html.includes('(8)') && html.includes('(5)'), `${lang} : filtres avec leurs chiffres : 16, 3, 8, 5`);
  ok(html.includes(lang === 'en' ? 'Week' : 'Semaine') && html.includes(lang === 'en' ? 'Month' : 'Mois') && html.includes(lang === 'en' ? 'Year' : 'Année'), `${lang} : Semaine, Mois, Année`);
  ok(html.includes('lg:grid-cols-2') && html.includes('grid-cols-1'), `${lang} : 1 colonne sur téléphone, 2 colonnes (4 carrés) sur grand écran`);
  ok(html.includes(lang === 'en' ? 'With salaries' : 'Avec salaires') && html.includes(lang === 'en' ? 'Cash (no salaries)' : 'Caisse (sans salaires)'), `${lang} : bouton Avec salaires / Caisse (sans salaires)`);
  ok(html.includes('<svg'), `${lang} : de vrais graphiques sont dessinés`);
  if (lang === 'fr') ok(!/Daily summary|Money received|Cumulative profit/.test(html), 'fr : pas de texte anglais dans les cartes');
  else ok(!/Argent reçu|Bénéfice cumulé|Valeur du stock dans le temps/.test(html), 'en : pas de texte français dans les cartes');
}
// ---------- Filtres : chaque groupe ne montre que ses cartes ----------
for (const [f, count] of [['missions', 3], ['money', 8], ['stock', 5]] as const) {
  mem.graphs_filter = f; const ids = cardIds(page('fr'));
  ok(ids.length === count && ids.every(id => GRAPH_CARDS.find(c => c.id === id)!.group === f), `filtre « ${f} » : ${count} cartes, toutes de ce groupe`);
}
mem.graphs_filter = 'nimporte-quoi'; ok(cardIds(page('fr')).length === 16, 'filtre mémorisé inconnu : on retombe sur Tout (16)');
// ---------- Périodes ----------
for (const gran of ['week', 'month', 'year'] as const) { mem.graphs_filter = 'all'; mem.graphs_gran = gran; const h = page('fr'); ok(!bad(h) && cardIds(h).length === 16, `période « ${gran} » : 16 cartes, sans erreur`); }
mem.graphs_gran = 'jour'; ok(cardIds(page('fr')).length === 16 && !bad(page('fr')), 'période mémorisée inconnue : on retombe sur Mois');
mem.graphs_gran = 'year'; mem.graphs_filter = 'money';
ok(page('fr').includes('Affiche le mois'), 'année : les cartes de la caisse disent qu\'elles montrent un mois');
// ---------- Plusieurs stockages : le choix apparaît ----------
delete mem.graphs_gran; mem.graphs_filter = 'stock';
ok(!page('fr').includes('<select') || db.getStockSpaces().length > 1, 'un seul stockage : pas de choix de stockage');
db.addStockSpace('Boutique 2');
if (db.getStockSpaces().length > 1) { const h = page('fr'); ok(h.includes('<select') && h.includes('Boutique 2') && cardIds(h).length === 5, 'deux stockages : le choix apparaît, 5 cartes du stock'); }
// ---------- Sans donnée : aucune erreur ----------
for (const x of db.getCash()) db.deleteCash(x.id);
mem.graphs_filter = 'all'; mem.graphs_gran = 'month';
const emptyCash = page('fr'); ok(!bad(emptyCash) && cardIds(emptyCash).length === 16, 'caisse vide : 16 cartes, aucune erreur');
// ---------- Opérateur : rien ----------
db.enterDemo('employee');
ok(page('fr').replace(/<[^>]+>/g, '').trim() === '' && !page('fr').includes('data-graph'), 'opérateur : la page ne montre rien');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
