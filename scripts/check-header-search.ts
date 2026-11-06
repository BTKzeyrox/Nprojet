// En-tête sans bouclier, recherche « Rechercher… » avec loupe et croix ; « Signaler un problème » dans le Journal des erreurs.
import { readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const r = (f: string) => readFileSync(f, 'utf8');
const top = r('src/components/TopBar.tsx'), side = r('src/components/Sidebar.tsx'), log = r('src/views/admin/ErrorsLog.tsx');
ok(!/Shield/.test(top) && !/GESTION PRO/.test(top), 'en-tête : plus d\'icône bouclier ni de texte GESTION PRO');
ok(/placeholder="Rechercher…"/.test(top), 'recherche : texte « Rechercher… »');
ok(/<Search className/.test(top), 'recherche : icône loupe');
ok(/data-search-clear/.test(top) && /\{q && \(/.test(top) && /setQ\(''\)/.test(top), 'recherche : croix qui efface, seulement quand il y a du texte');
ok(/data-report-problem/.test(log) && /ReportProblemModal/.test(log), 'Journal des erreurs : bouton « Signaler un problème »');
ok(/onReportProblem && !isAdmin/.test(side), 'menu : le responsable n\'a plus le bouton (il est dans le Journal) ; l\'opérateur le garde');
// Fermeture au clic / toucher extérieur (2026-11-07) : la liste ET le champ plein écran du téléphone ; seul le champ affiché compte
const feed = r('src/views/FeedView.tsx');
ok(/addEventListener\('pointerdown', away\)/.test(top) && /addEventListener\('touchstart', away/.test(top) && /addEventListener\('mousedown', away\)/.test(top), 'recherche : fermée par un clic ou un toucher à l\'extérieur');
ok(/setOpen\(false\); setMSearch\(false\)/.test(top) && /getClientRects\(\)\.length > 0/.test(top), 'recherche : ferme aussi le champ du téléphone, ignore le champ caché');
ok(/removeEventListener\('pointerdown', away\)/.test(top) && /removeEventListener\('touchstart', away\)/.test(top), 'recherche : écouteurs retirés au démontage');
// Espaces des icônes de droite sur grand écran : un seul (12 px)
ok(/md:justify-start gap-1\.5 sm:gap-2\.5 md:gap-3"/.test(top) && /md:flex md:items-center md:gap-3 md:shrink-0" data-header-shortcuts/.test(top), 'en-tête grand écran : même espace (12 px) entre toutes les icônes');
// Actualités plus larges sur grand écran
ok(/max-w-2xl lg:max-w-4xl 2xl:max-w-5xl mx-auto w-full/.test(feed), 'Actualités : élargies sur grand écran (téléphone inchangé)');
// En-tête (2026-11-07) : logo de l'appli à gauche sur téléphone, ordre mobile, boutons de 40 px, page ouverte mise en valeur
const idx = (k: string) => top.indexOf(k);
ok(/data-app-logo/.test(top) && /src="\/icon-192\.png"/.test(top), 'en-tête téléphone : l\'icône de l\'appli');
ok(idx('data-app-logo') < idx('data-header-search') && idx('data-header-search') < idx('data-header-shortcuts') && idx('data-header-shortcuts') < idx('ref={bellBox}') && idx('ref={bellBox}') < idx('data-header-menu'), 'en-tête téléphone : logo, recherche, Actualités + Messages, cloche, menu');
ok(!/LayoutDashboard/.test(top), 'en-tête téléphone : plus de doublon « Tableau de bord »');
ok((top.match(/w-10 h-10 flex items-center justify-center/g) || []).length >= 4, 'en-tête : boutons de la même taille (40 px)');
ok(/aria-current=\{activeView === view \? 'page'/.test(top) && /activeView=\{activeView\}/.test(readFileSync('src/App.tsx', 'utf8')), 'en-tête : le raccourci de la page ouverte est mis en valeur');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
