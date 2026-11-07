// Actualités : la position du fil est gardée quand on change de page et rétablie au retour (pas de retour tout en haut).
import { readFileSync } from 'node:fs';
import { saveFeedScroll, feedScrollFor, resetFeedScroll, requestFeedTop, FEED_TOP_EVENT } from '../src/utils/feedScroll';

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

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
