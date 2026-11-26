// Glissement « Retour » (comme iOS) : droite = onglet d'avant, sinon page d'avant, sinon rien ; gauche ne fait rien. Lancer : npm run check:page-swipe
import { readFileSync } from 'node:fs';
import { loaderKey, LOADER_KEYS } from '../src/utils/pagePreload';
import { ADMIN_GROUPS } from '../src/utils/menuGroups';
import { BUBBLE_SIZE, bubbleGeometry } from '../src/utils/backBubble';
import { backTarget, stepOf, parseStep, swipeAxis, dragOffset, isBackSwipe, SWIPE_MIN_PX, SWIPE_LOCK_PX, SWIPE_BLOCK_SELECTOR } from '../src/utils/pageSwipe';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
// --- retour direct, dans l'ordre d'entrée (pages, onglets, discussion du chat) ---
const J = JSON.stringify;
ok(J(backTarget(['feed', 'chat'])) === '{"kind":"page","view":"chat"}', 'retour direct : l\'étape juste avant (la dernière de la liste)');
ok(J(backTarget([])) === '{"kind":"none"}', 'rien avant : nulle part');
// Accueil -> Messages -> discussion : 1er glissement = la liste, 2e = l'Accueil
{ const h: string[] = ['feed']; // on est dans « chat » ; l'historique garde l'Accueil
  const t1 = backTarget(h, true); const t2 = backTarget(h, false);
  ok(t1.kind === 'chat' && J(t2) === '{"kind":"page","view":"feed"}', 'Accueil -> Messages -> discussion : glissement 1 = liste, glissement 2 = Accueil'); }
// ordre d'entrée : Accueil -> Finances -> Missions -> Stock ; trois retours : Missions, Finances, Accueil (pas l'ordre des onglets)
{ const h = ['feed', 'stats:finance', 'missions']; const seen: string[] = []; while (h.length) { const t = backTarget(h); if (t.kind !== 'page') break; seen.push(stepOf(t.view, t.statsTab)); h.pop(); }
  ok(J(seen) === J(['missions', 'stats:finance', 'feed']), 'trois retours suivent exactement l\'ordre d\'entrée à l\'envers'); }
ok(stepOf('stats', 'finance') === 'stats:finance' && stepOf('stats', 'stats') === 'stats' && stepOf('chat', 'finance') === 'chat', 'la page Statistiques garde son onglet Finances dans l\'historique');
ok(J(parseStep('stats:finance')) === '{"view":"stats","statsTab":"finance"}' && J(parseStep('feed')) === '{"view":"feed"}', 'une étape se relit en page + onglet');
ok(J(backTarget(['stats:finance'])) === '{"kind":"page","view":"stats","statsTab":"finance"}', 'retour vers Statistiques > Finances rouvre l\'onglet Finances');
ok(backTarget(['x'], true).kind === 'chat' && backTarget([], true).kind === 'chat', 'discussion ouverte : le retour referme la discussion, même sans historique');
ok(swipeAxis(3, 4) === null && swipeAxis(SWIPE_LOCK_PX, 0) === 'x' && swipeAxis(40, 5) === 'x', 'petit mouvement : on attend ; net horizontal : glissement');
ok(swipeAxis(5, 40) === 'y' && swipeAxis(30, 30) === 'y' && swipeAxis(NaN, 3) === 'y', 'vertical, en diagonale ou illisible : défilement (jamais de glissement)');
ok(dragOffset(-80, true, 400) === 0 && dragOffset(0, true, 400) === 0 && dragOffset(NaN, true, 400) === 0, 'vers la gauche : la page ne bouge jamais');
ok(dragOffset(100, true, 400) === 100 && Math.abs(dragOffset(900, true, 400) - 220) < 1e-6, 'vers la droite : la page suit le doigt, jusqu\'à 55 % de la largeur');
ok(dragOffset(300, false, 400) <= 36 && dragOffset(300, false, 400) > 0, 'rien où revenir : léger effet élastique seulement');
ok(isBackSwipe(SWIPE_MIN_PX, true) && !isBackSwipe(SWIPE_MIN_PX - 1, true) && !isBackSwipe(500, false) && !isBackSwipe(-200, true), 'accepté à partir de 90 px vers la droite, et seulement s\'il y a un retour');
ok(/input/.test(SWIPE_BLOCK_SELECTOR) && /textarea/.test(SWIPE_BLOCK_SELECTOR) && /data-lightbox/.test(SWIPE_BLOCK_SELECTOR) && /data-no-page-swipe/.test(SWIPE_BLOCK_SELECTOR) && !/button|\ba\b/.test(SWIPE_BLOCK_SELECTOR), 'bloqué sur les champs, l\'image ouverte et les zones marquées ; PAS sur les boutons ni les cartes');
const app = readFileSync('src/App.tsx', 'utf8');
ok(/swipeBackFn\.current = \(\) => backTarget\(/.test(app) && /swipeDo\.current = t =>/.test(app), 'App.tsx : le retour calcule sa cible avec backTarget à chaque affichage');
ok(!/mobileSwipeX|swipeAnim|swipeOpacity|swipeSettling/.test(app), 'la page ne bouge plus du tout pendant le glissement (plus de décalage ni de transformation)');
ok(/bubbleMove\(dx, tg\.kind !== 'none', t\.clientY\)/.test(app) && /bubbleConfirm\(\)/.test(app) && /bubbleCancel\(\)/.test(app), 'la bulle suit le doigt, se referme à la validation, rentre à l\'annulation');
ok(/if \(t\.view !== previousView\.current\) skipViewHistory\.current = true; viewHistory\.current\.pop\(\)/.test(app), 'un retour n\'est jamais ajouté à la mémoire des pages (sinon le prochain retour reviendrait ici)');
ok(/window\.innerWidth >= 768/.test(app.slice(app.indexOf('const onStart'), app.indexOf('const onStart') + 300)) && !/activeView === 'chat'/.test(app.slice(app.indexOf('const onStart'), app.indexOf('const onStart') + 300)), 'le glissement est actif sur téléphone, y compris dans le chat ; jamais sur ordinateur');
const cv = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/registerChatBack\(\(\) => window\.innerWidth < 768 && !showList, \(\) => setShowList\(true\)\)/.test(cv) && /chatCanBack\(\)/.test(app) && /chatBack\(\)/.test(app), 'chat : une discussion ouverte se referme vers la liste');
ok(/\[data-composer-bar\]/.test(SWIPE_BLOCK_SELECTOR) && /\.fixed\.inset-0/.test(SWIPE_BLOCK_SELECTOR), 'jamais depuis la zone d\'écriture du chat ni depuis une fenêtre ou un menu ouvert');
ok(!/viewHistory\.current\[viewHistory\.current\.length - 1\];\s*\n\s*const accepted/.test(app), 'l\'ancien glissement (page d\'avant dans les deux sens) n\'existe plus');
// --- arrivée de la page sans saccade : préparée avant, entrée invisible puis en fondu ---
ok(loaderKey('feed', 'admin') === 'feed' && loaderKey('advances', 'admin') === 'employees' && loaderKey('sheets', 'employee') === 'mySheets' && loaderKey('xyz', 'admin') === 'adminDashboard' && loaderKey('grid', 'employee') === 'employeeDashboard' && loaderKey('grid', 'team_lead') === null && loaderKey('chat', 'team_lead') === 'chat' && loaderKey('', 'admin') === 'adminDashboard', 'préparation : la bonne page pour chaque rôle (fil, avances → équipe, mes tableaux, tableau de bord par défaut)');
const views = new Set(ADMIN_GROUPS.flatMap(g => g.tabs.map(t => t.view)));
ok([...views].every(v => { const k = loaderKey(v, 'admin'); return k !== null && LOADER_KEYS.includes(k); }), 'chaque page du menu du responsable a un fichier à préparer');
ok(['admin', 'employee', 'accountant', 'team_lead'].every(r => ['feed', 'chat', 'settings', 'calendar', 'stats', 'x'].every(v => { const k = loaderKey(v, r); return k === null || LOADER_KEYS.includes(k); })), 'jamais de clé inconnue, pour aucun rôle');
const appSrc = readFileSync('src/App.tsx', 'utf8');
ok(/if \(!s\.prepared\) \{[^}]*swipePrepared\.current = swipePreload\.current\(tg\)/.test(appSrc), 'la page d\'arrivée se prépare dès que le doigt commence à glisser');
ok(/Promise\.race\(\[swipePrepared\.current, new Promise<void>\(r => setTimeout\(r, SWIPE_PREPARE_MAX_MS\)\)\]\)\.then\(\(\) => \{\s*swipeDo\.current\(target\)/.test(appSrc), 'on change de page une fois la suivante prête (1,5 s au plus)');
{ const g0 = bubbleGeometry(0, true, 300, 800), g1 = bubbleGeometry(SWIPE_MIN_PX, true, 300, 800), gx = bubbleGeometry(500, true, 300, 800), gn = bubbleGeometry(SWIPE_MIN_PX, false, 300, 800), gy = bubbleGeometry(50, true, 5, 800);
  ok(g0.x === -BUBBLE_SIZE && !g0.armed, 'bulle : cachée à gauche au départ');
  ok(g1.armed && g1.x > g0.x && g1.scale > g0.scale, 'bulle : sortie, plus grosse et validée à la distance du retour');
  ok(gx.x <= 56 - BUBBLE_SIZE && gx.scale <= 1.001, 'bulle : ne sort pas plus que prévu, ne grossit pas sans fin');
  ok(!gn.armed && gn.x <= 18 - BUBBLE_SIZE + 0.001, 'bulle : sans page d\'avant, jamais validée et montre juste le bout');
  ok(gy.y >= 0 && bubbleGeometry(50, true, 9999, 800).y + BUBBLE_SIZE <= 800, 'bulle : reste dans l\'écran en haut et en bas'); }
const css = readFileSync('src/index.css', 'utf8');
ok(/\.df-back-bubble\s*\{[^}]*position:\s*fixed/.test(css) && /\.df-back-bubble\[data-armed\]/.test(css) && /prefers-reduced-motion[\s\S]*df-back-bubble/.test(css), 'bulle : style fixe, couleur validée, mouvement réduit respecté');
ok(/swipeBusy\.current = true;[\s\S]*?SWIPE_SETTLE_MS \+ SWIPE_MS/.test(appSrc) && /swipeBusy\.current \|\|/.test(appSrc), 'aucun nouveau glissement pendant le changement de page');
ok(/<LoadingBar pageKey=\{activeView\} \/>/.test(appSrc) && /setPageBusy\(true\)/.test(readFileSync('src/components/LoadingBar.tsx', 'utf8')) && /df-fade-a 0\.3s/.test(css), 'changement de page : fondu doux (0,3 s) + petite barre de chargement');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
