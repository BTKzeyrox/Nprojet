// Actualités : la position du fil est gardée quand on change de page et rétablie au retour (pas de retour tout en haut).
import { readFileSync } from 'node:fs';
import { saveFeedScroll, feedScrollFor, resetFeedScroll, requestFeedTop, pinFeedScroll, unpinFeedScroll, pinnedFeedScroll, FEED_TOP_EVENT } from '../src/utils/feedScroll';

let n = 0, fails = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ÉCHEC : ' + m); } else console.log('ok : ' + m); };

ok(feedScrollFor('u1') === 0, 'aucune position gardée au départ');
saveFeedScroll('u1', 468.4);
ok(feedScrollFor('u1') === 468, 'la position est gardée (arrondie)');
ok(feedScrollFor('u2') === 0, 'une autre personne ne reprend pas la position');
saveFeedScroll('u1', -5);
ok(feedScrollFor('u1') === 0, 'une position négative devient 0');
saveFeedScroll('u1', 300);
let heard = 0;
const g = globalThis as any;
g.window = { dispatchEvent: (e: any) => { if (e.type === FEED_TOP_EVENT) heard++; return true; } };
requestFeedTop();
ok(feedScrollFor('u1') === 0 && heard === 1, 'toucher « Actualités » déjà ouvert : position remise à zéro + demande de remontée');
saveFeedScroll('u1', 90); resetFeedScroll();
ok(feedScrollFor('u1') === 0, 'remise à zéro');

const feed = readFileSync('src/views/FeedView.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const top = readFileSync('src/components/TopBar.tsx', 'utf8');
ok(/useLayoutEffect\(\(\) => \{[\s\S]{0,500}return \(\) => saveFeedScroll\(currentUser\.id/.test(feed), 'fil : position mémorisée au moment de quitter la page (avant que le navigateur remonte la page raccourcie)');
ok(/feedScrollFor\(currentUser\.id\)/.test(feed) && /setPos\(want\)/.test(feed), 'fil : position rétablie au retour (avec quelques essais si le contenu arrive après)');
ok(/activeView !== 'feed' && !peekNavTarget\(\)\) window\.scrollTo\(0, 0\)/.test(app), 'application : les autres pages s\'ouvrent en haut, pas Actualités');
ok(/view === 'feed' && activeView === 'feed'\) requestFeedTop\(\)/.test(top), 'en-tête : « Actualités » touché sur Actualités = retour en haut');


// Recherche du téléphone : le fil ne bouge pas quand on ouvre / ferme la recherche
pinFeedScroll('u1', 500.2);
ok(pinnedFeedScroll('u1') === 500 && pinnedFeedScroll('u2') === null, 'position gardée à l\'ouverture de la recherche (pour la bonne personne)');
unpinFeedScroll();
ok(pinnedFeedScroll('u1') === null, 'position libérée après la recherche');
const bar = readFileSync('src/components/TopBar.tsx', 'utf8');
ok(/if \(viewRef\.current === 'feed'\) \{ searchY\.current = readFeedPos\(\); pinFeedScroll\(currentUser\.id, searchY\.current\)/.test(bar), 'recherche : position du fil gardée à l\'ouverture (sur Actualités seulement)');
ok(/writeFeedPos\(y\)/.test(bar) && /setTimeout\(\(\) => \{ writeFeedPos\(y\); unpinFeedScroll\(\)/.test(bar), 'recherche : position rétablie à la fermeture, encore après le clavier');
ok(/focus\(\{ preventScroll: true \}\)/.test(bar) && !/autoFocus/.test(bar.slice(bar.indexOf('mSearch &&'))), 'recherche : le champ prend le focus sans décaler la page');
ok(/pinnedFeedScroll\(currentUser\.id\) \?\?/.test(feed) && /data-feed-root/.test(feed), 'fil : mémorise la position gardée si un résultat ouvre une autre page');
ok(/setTimeout\(\(\) => \{ if \(!touched/.test(feed), 'fil : position réappliquée si un autre écran (Messages) remet la page en haut juste après');

ok(/ae\.blur\(\);\s*closeLater\.current = setTimeout\(\(\) => \{ closeLater\.current = null; setOpen\(false\); setMSearch\(false\); \}, 220\)/.test(bar), 'recherche : toucher à l\'extérieur = le clavier se ferme d\'abord, la recherche se ferme 0,2 s après (comme la croix)');
ok(/if \(closeLater\.current\) \{/.test(bar), 'recherche : les 3 événements du même toucher ne court-circuitent pas le délai');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
