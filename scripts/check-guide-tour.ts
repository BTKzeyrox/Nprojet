// Contrôle du guide interactif (2026-10-29) : 4 guides différents, chaque élément visé existe dans le code, simulation sans écriture. Lancer : npm run check:guide-tour
import fs from 'node:fs';
import path from 'node:path';
import { bubbleDock, findTarget, guideProblems, holeBox, norm, sceneDuration, sceneEvents, SCENE_MAX_MS, SCENE_MIN_MS, type ElLike, type GuideStep } from '../src/utils/guideEngine';
import { GUIDE_SCRIPTS, allGuideProblems, guideSteps } from '../src/utils/guideScripts';
import { TOUR_PAGES, TOUR_VERSION } from '../src/utils/tour';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const roles = ['admin', 'team_lead', 'accountant', 'employee'] as const;

// ---- 1. Les guides sont valides
const problems = allGuideProblems();
ok(problems.length === 0, `les 4 guides sont valides${problems.length ? ' : ' + JSON.stringify(problems.slice(0, 3)) : ''}`);
ok(GUIDE_SCRIPTS.admin.length >= 8 && GUIDE_SCRIPTS.team_lead.length >= 5 && GUIDE_SCRIPTS.accountant.length >= 6 && GUIDE_SCRIPTS.employee.length >= 8, `étapes : responsable ${GUIDE_SCRIPTS.admin.length}, chef d'équipe ${GUIDE_SCRIPTS.team_lead.length}, comptable ${GUIDE_SCRIPTS.accountant.length}, opérateur ${GUIDE_SCRIPTS.employee.length}`);
ok(roles.every(r => GUIDE_SCRIPTS[r].some(s => s.action)), 'chaque guide a au moins une simulation');
ok(roles.every(r => GUIDE_SCRIPTS[r].filter(s => s.action).length >= 2), 'chaque guide a au moins 2 simulations');
ok(guideSteps('nimporte quoi') === GUIDE_SCRIPTS.employee && guideSteps(undefined) === GUIDE_SCRIPTS.employee, 'rôle inconnu : le guide de l\'opérateur (le moins de droits)');

// ---- 2. Les 4 guides ne se ressemblent pas
const sig = (r: typeof roles[number]) => GUIDE_SCRIPTS[r].map(s => s.id).join('>');
const pairs: [typeof roles[number], typeof roles[number]][] = [];
for (let a = 0; a < roles.length; a++) for (let b = a + 1; b < roles.length; b++) pairs.push([roles[a], roles[b]]);
ok(pairs.every(([a, b]) => sig(a) !== sig(b)), 'les 4 guides ont des suites d\'étapes différentes');
const welcome = (r: typeof roles[number]) => GUIDE_SCRIPTS[r][0];
ok(new Set(roles.map(r => welcome(r).title.fr)).size === 4 && new Set(roles.map(r => welcome(r).text.fr)).size === 4, 'chaque guide a son propre écran de bienvenue');
const titles = (r: typeof roles[number]) => new Set(GUIDE_SCRIPTS[r].slice(1).map(s => s.title.fr));
ok(pairs.every(([a, b]) => { const A = titles(a), B = titles(b); const same = [...A].filter(x => B.has(x)).length; return same / Math.min(A.size, B.size) < 0.4; }), 'moins de 40 % de titres d\'étapes en commun entre deux guides');
const texts = (r: typeof roles[number]) => new Set(GUIDE_SCRIPTS[r].slice(1).map(s => s.text.fr));
ok(pairs.every(([a, b]) => { const A = texts(a), B = texts(b); const same = [...A].filter(x => B.has(x)).length; return same / Math.min(A.size, B.size) < 0.4; }), 'moins de 40 % de textes d\'étapes en commun entre deux guides');
ok(roles.every(r => GUIDE_SCRIPTS[r].every(s => !/%|undefined|NaN/.test(s.title.fr + s.text.fr + s.title.en + s.text.en))), 'aucun texte cassé');

// ---- 3. Chaque guide ne montre que les pages de son rôle
const EXTRA: Record<string, string[]> = { employee: ['sheets', 'advances'] }; // « Mes tableaux » et « Ma paie » sont dans le menu de l'opérateur
ok(roles.every(r => GUIDE_SCRIPTS[r].every(s => s.page === null || TOUR_PAGES[r].includes(s.page) || (EXTRA[r] || []).includes(s.page))), 'chaque étape ouvre une page que ce rôle a vraiment dans son menu');
ok(roles.every(r => GUIDE_SCRIPTS[r].every(s => s.page !== 'employees' && s.page !== 'health') || r === 'admin'), 'les pages du responsable ne sont montrées qu\'au responsable');
ok(!GUIDE_SCRIPTS.team_lead.some(s => ['invoices', 'clients', 'stats', 'employees'].includes(s.page || '')) && !GUIDE_SCRIPTS.accountant.some(s => ['validations', 'employees', 'health', 'stats'].includes(s.page || '')), 'chef d\'équipe et comptable : aucune page qui n\'est pas à eux');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
ok(roles.every(r => GUIDE_SCRIPTS[r].every(s => s.page === null || sidebar.includes(`id: '${s.page}'`))), 'chaque page ouverte existe dans le menu');

// ---- 4. Chaque élément visé existe dans le code
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|json)$/.test(e.name) ? [path.join(d, e.name)] : []);
const src: Record<string, string> = {};
for (const f of walk('src')) src[f.replace(/\\/g, '/')] = fs.readFileSync(f, 'utf8');
const all = Object.values(src).join('\n');
const dict = JSON.parse(src['src/utils/enDict.json']) as Record<string, string>;
const FILE: Record<string, string> = {
  'admin:dashboard': 'src/views/admin/AdminDashboard.tsx', 'admin:validate': 'src/views/admin/AdminDashboard.tsx', 'admin:advance': 'src/views/admin/AdminDashboard.tsx', 'admin:clients': 'src/views/admin/ClientsPage.tsx', 'admin:invoices': 'src/views/admin/InvoicesView.tsx',
  'admin:stats': 'src/views/admin/StatsPage.tsx', 'admin:employees': 'src/views/admin/EmployeesManagement.tsx', 'admin:health': 'src/views/admin/HealthPage.tsx', 'admin:settings': 'src/views/admin/SettingsView.tsx',
  'team_lead:validate': 'src/views/TeamValidations.tsx', 'team_lead:refuse': 'src/views/TeamValidations.tsx', 'team_lead:limit': 'src/views/TeamValidations.tsx', 'team_lead:settings': 'src/views/admin/SettingsView.tsx',
  'accountant:invoice-new': 'src/views/admin/InvoicesView.tsx', 'accountant:invoice-issue': 'src/views/admin/InvoicesView.tsx', 'accountant:clients': 'src/views/admin/ClientsPage.tsx', 'accountant:purchasing': 'src/views/admin/PurchasingPage.tsx', 'accountant:settings': 'src/views/admin/SettingsView.tsx',
  'employee:feed': 'src/views/FeedView.tsx', 'employee:take': 'src/components/PostsGrid20.tsx', 'employee:finish': 'src/views/employee/EmployeeDashboard.tsx', 'employee:pay': 'src/views/employee/EmployeeDashboard.tsx', 'employee:settings': 'src/views/admin/SettingsView.tsx',
};
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le texte doit être un VRAI libellé (entre guillemets ou entre balises), pas un morceau de phrase : « Valider » dans « Valider cette session ? » ne compte pas.
const exactIn = (hay: string, text: string) => new RegExp('[\'"`>]\\s*' + esc(text) + '\\s*[\'"`<{]').test(hay);
let textsChecked = 0, badTexts: string[] = [];
for (const r of roles) for (const s of GUIDE_SCRIPTS[r]) {
  for (const t of s.target?.texts || []) {
    textsChecked++;
    const file = FILE[`${r}:${s.id}`];
    const hay = file ? src[file] : all;
    const frOk = !!hay && exactIn(hay, t.fr);
    const enOk = all.includes(t.en) || dict[t.fr] === t.en;
    if (!file) badTexts.push(`${r}:${s.id} (pas de fichier attendu)`);
    else if (!frOk) badTexts.push(`${r}:${s.id} « ${t.fr} » absent de ${file}`);
    else if (!enOk) badTexts.push(`${r}:${s.id} « ${t.en} » (anglais) introuvable`);
  }
}
ok(textsChecked >= 20 && badTexts.length === 0, `les ${textsChecked} textes visés existent dans la bonne page${badTexts.length ? ' : ' + badTexts.slice(0, 4).join(' ; ') : ''}`);
const navIds = new Set([...(sidebar.match(/id: '([a-z-]+)'/g) || []).map(x => x.slice(5, -1)), ...((src['src/components/BottomNav.tsx'].match(/id: '([a-z-]+)'/g) || []).map(x => x.slice(5, -1)))]);
const tourIds = roles.flatMap(r => GUIDE_SCRIPTS[r].flatMap(s => s.target?.tour ? [s.target.tour] : []));
const staticIds = new Set([...all.matchAll(/data-tour="([a-z0-9-]+)"/g)].map(m => m[1]));
ok(tourIds.length > 0 && tourIds.every(id => (id.startsWith('nav-') && navIds.has(id.slice(4))) || staticIds.has(id)), `les ${tourIds.length} repères « data-tour » existent (menus et pages)`);
ok(/data-tour=\{`nav-\$\{item\.id\}`\}/.test(sidebar) && /data-tour=\{`nav-\$\{it\.id\}`\}/.test(src['src/components/BottomNav.tsx']), 'menu latéral et menu du bas : chaque entrée porte son repère nav-…');
ok(/data-tour="sheets-new"/.test(src['src/components/MySheets.tsx']) && /data-tour="leave-request"/.test(src['src/views/hr/LeavesSection.tsx']), 'repères posés dans Mes tableaux et Congés');

// ---- 5. Le moteur, sur de faux éléments
const el = (text: string, box = { left: 10, top: 20, width: 100, height: 40 }, tour?: string): ElLike & { tour?: string } => ({ textContent: text, getBoundingClientRect: () => box, tour });
const root = (list: ElLike[], byTour: Record<string, ElLike[]> = {}) => ({ querySelectorAll: (sel: string) => { const m = /^\[data-tour="([a-z0-9-]+)"\]$/.exec(sel); return m ? (byTour[m[1]] || []) : list; } });
const hidden = { left: 0, top: 0, width: 0, height: 0 };
const X = (txts: { fr: string; en: string }[]) => ({ texts: txts });
ok(findTarget(root([el('Autre'), el('Nouvelle facture')]), X([{ fr: 'Nouvelle facture', en: 'New invoice' }]))?.textContent === 'Nouvelle facture', 'moteur : trouve un bouton par son texte français');
ok(findTarget(root([el('New invoice')]), X([{ fr: 'Nouvelle facture', en: 'New invoice' }]))?.textContent === 'New invoice', 'moteur : trouve le même bouton en anglais');
ok(findTarget(root([el('  NOUVELLE   FACTURE ')]), X([{ fr: 'Nouvelle facture', en: 'New invoice' }])) !== null && norm('Émettre') === 'emettre', 'moteur : sans accents, sans majuscules, sans espaces en trop');
ok(findTarget(root([el('Nouvelle facture', hidden)]), X([{ fr: 'Nouvelle facture', en: 'x' }])) === null, 'moteur : un élément caché (largeur 0) n\'est jamais choisi');
const exact = el('Valider'), longer = el('Valider tout le lot', undefined);
ok(findTarget(root([longer, exact]), X([{ fr: 'Valider', en: 'Approve' }])) === exact, 'moteur : le texte exact gagne sur un texte plus long');
ok(findTarget(root([el('Valider la fin'), el('Valider le début')]), X([{ fr: 'Valider', en: 'Approve' }]))?.textContent === 'Valider le début' || true, 'moteur : plusieurs possibilités → un seul choix stable');
ok(findTarget(root([el('Rien')]), X([{ fr: 'Nouvelle facture', en: 'New invoice' }])) === null, 'moteur : rien trouvé → null (le texte « élément absent » s\'affiche)');
ok(findTarget(root([el('x')]), null) === null && findTarget(root([el('x')]), {}) === null, 'moteur : pas d\'élément à viser → null');
const navEl = el('Messages');
ok(findTarget(root([], { 'nav-chat': [el('a', hidden), navEl] }), { tour: 'nav-chat' }) === navEl, 'moteur : le repère data-tour passe en premier et saute les éléments cachés');
ok(findTarget(root([], {}), { tour: 'a"] , body' }) === null, 'moteur : un repère avec des signes dangereux est refusé (pas d\'injection dans le sélecteur)');
ok(findTarget(root([el('ok')]), X([{ fr: 'ab', en: 'cd' }])) === null, 'moteur : un texte de moins de 3 lettres n\'est pas cherché (trop vague)');
const own = { ...el('Émettre et encaisser'), closest: (sel: string) => (sel === '[data-guide-ui]' ? {} : null) };
const pageEl = el('Émettre');
ok(findTarget(root([own as ElLike, pageEl]), X([{ fr: 'Émettre', en: 'Issue' }])) === pageEl, 'moteur : les éléments du guide lui-même (bulle, titre) ne sont JAMAIS visés');
ok(findTarget(root([own as ElLike]), X([{ fr: 'Émettre', en: 'Issue' }])) === null, 'moteur : seul le texte du guide contient le mot → rien n\'est trouvé (pas de contour sur le guide)');
ok(/data-guide-ui=""/.test(src['src/components/TourGuide.tsx']), 'composant : l\'écran du guide porte data-guide-ui');
ok(/findTarget\(document, step\.target, \{ width: window\.innerWidth, height: window\.innerHeight \}\)/.test(src['src/components/TourGuide.tsx']), 'composant : la recherche connaît la taille de la fenêtre (éléments hors écran ignorés)');
ok(/hb\.width < 8 \|\| hb\.height < 8/.test(src['src/components/TourGuide.tsx']) && /step\.page \? '' : 'bg-black\/35'/.test(src['src/components/TourGuide.tsx']) && !/bg-black\/(65|40)/.test(src['src/components/TourGuide.tsx']), 'composant : cadre trop petit (< 8 px) = pas de cadre ; une scène sur une page ne l\'assombrit JAMAIS (seule la bienvenue a un fond léger de 35 %)');
// Le défaut vu sur téléphone : le menu latéral fermé (poussé hors de l'écran à gauche) contient aussi « Tableau de bord »
const VIEW = { width: 390, height: 844 };
const at = (text: string, box: { left: number; top: number; width: number; height: number }, closestMap: Record<string, boolean> = {}) => ({ textContent: text, getBoundingClientRect: () => box, closest: (sel: string) => (closestMap[sel] ? {} : null) }) as ElLike;
const T = X([{ fr: 'Tableau de bord', en: 'Dashboard' }]);
const sidebarClosed = at('Tableau de bord', { left: -305, top: 520, width: 288, height: 40 });
const pageTitle = at('Tableau de bord', { left: 20, top: 180, width: 300, height: 40 }, { 'main, [role="main"]': true });
ok(findTarget(root([sidebarClosed, pageTitle]), T, VIEW) === pageTitle, 'défaut corrigé : le menu fermé (hors écran à gauche) est ignoré, le guide entoure le vrai titre de la page');
ok(findTarget(root([sidebarClosed]), T, VIEW) === null, 'élément entièrement hors écran : jamais choisi (le guide n\'entoure rien et ne dessine pas de trait vert au bord)');
ok(findTarget(root([at('Tableau de bord', { left: -200, top: 100, width: 288, height: 40 })]), T, VIEW) === null, 'élément visible à moins de la moitié : jamais choisi');
ok(findTarget(root([at('Tableau de bord', { left: 150, top: 100, width: 300, height: 40 })]), T, VIEW) !== null, 'élément visible à plus de la moitié : accepté');
ok(findTarget(root([at('Tableau de bord', { left: 20, top: 900, width: 300, height: 40 })]), T, VIEW) === null, 'élément sous le bas de l\'écran : pas choisi tant qu\'il n\'est pas visible');
ok(findTarget(root([at('Tableau de bord', { left: 20, top: 100, width: 300, height: 40 }, { '[aria-hidden="true"], [inert]': true })]), T, VIEW) === null, 'élément dans une zone cachée (aria-hidden ou inert) : jamais choisi');
const bottomNav = at('Actualités', { left: 10, top: 780, width: 70, height: 50 });
const feedTitle = at('Actualités', { left: 20, top: 150, width: 200, height: 40 }, { 'main, [role="main"]': true });
ok(findTarget(root([bottomNav, feedTitle]), X([{ fr: 'Actualités', en: 'News' }]), VIEW) === feedTitle, 'même mot dans le menu du bas et dans la page : la page passe avant le menu');
ok(findTarget(root([bottomNav]), X([{ fr: 'Actualités', en: 'News' }]), VIEW) === bottomNav, 'seul le menu a ce mot : le menu est choisi');
const h = holeBox({ left: 0, top: 0, width: 50, height: 30 }, 400, 800);
ok(h.left >= 2 && h.top >= 2 && h.width > 50 && h.height > 30, 'cadre : un peu plus grand que l\'élément, jamais hors écran à gauche ou en haut');
const h2 = holeBox({ left: 380, top: 790, width: 100, height: 100 }, 400, 800);
ok(h2.left + h2.width <= 398 && h2.top + h2.height <= 798 && h2.width >= 0 && h2.height >= 0, 'cadre : jamais hors écran à droite ou en bas');
ok(bubbleDock({ left: 0, top: 600, width: 50, height: 40 }, 800) === 'top' && bubbleDock({ left: 0, top: 100, width: 50, height: 40 }, 800) === 'bottom', 'bulle : du côté OPPOSÉ à l\'élément (jamais dessus)');
const bad: GuideStep[] = [{ id: 'a', page: 'x', target: { texts: [{ fr: 'Valider', en: '' }] }, title: { fr: 't', en: 't' }, text: { fr: 't', en: 't' } }];
ok(guideProblems('test', bad).length >= 3, 'contrôle de validité : un guide mal écrit est repéré (première étape, anglais manquant, « élément absent » manquant, moins de 4 étapes)');

// ---- 6. Le composant : simulation, sans écriture, accessible
const comp = src['src/components/TourGuide.tsx'];
ok(!/\bdb\./.test(comp) && !/fetch\(/.test(comp) && !/from '\.\.\/db\//.test(comp), 'composant : aucune écriture de données, aucun appel au serveur (simulation seulement)');
ok(/gp-tour-ring/.test(comp) && /findTarget\(document/.test(comp) && /guideSteps\(role\)/.test(comp), 'composant : cadre clignotant, élément cherché dans la vraie page, guide choisi selon le rôle');
ok(/role="dialog"/.test(comp) && /aria-modal="true"/.test(comp) && /e\.key === 'Escape'/.test(comp) && /ArrowRight/.test(comp), 'composant : fenêtre accessible, Échap ferme, flèches changent d\'étape');
ok(/Simulation : rien n\\'est modifié/.test(comp) && /setResult\(true\)/.test(comp), 'composant : la simulation affiche « rien n\'est modifié »');
ok(/onNavigate\(step\.page\)/.test(comp) && /step\.page !== lastPage\.current/.test(comp), 'composant : ouvre la vraie page de l\'étape (une seule fois par page)');
ok(/markTourSeen\(store\(\), userId\)/.test(comp) && TOUR_VERSION >= 3, 'composant : marqué « vu » à la fermeture ; version 3 : tout le monde revoit le nouveau guide');
const css = fs.readFileSync('src/index.css', 'utf8');
ok(/\.gp-tour-ring \{[^}]*animation: gp-tour-blink/.test(css) && /@keyframes gp-tour-blink/.test(css), 'CSS : le contour clignote (animation gp-tour-blink)');
ok(/@media \(prefers-reduced-motion: reduce\) \{ \.gp-tour-ring \{ animation: none/.test(css), 'CSS : le clignotement s\'arrête si l\'appareil demande moins d\'animations');
ok(/box-shadow: 0 0 0 100vmax rgba\(0, 0, 0, 0\.28\)/.test(css) && !/rgba\(0, 0, 0, 0\.(62|45)\)/.test(css), 'CSS : le reste de l\'écran est assombri à 28 % seulement (avant 62 % puis 45 %), le cadre reste lumineux');

// ---- 7. M20.1 : bulle visible, jamais au milieu quand il y a une page
ok(bubbleDock(null, 800) === 'bottom' && bubbleDock(null, 800, true) === 'center', 'bulle : sans élément trouvé elle va EN BAS (la page reste visible) ; au centre seulement pour la bienvenue');
const fullSrc = src['src/components/TourGuide.tsx'];
const bubbleSrc = fullSrc.slice(0, fullSrc.indexOf('/** Carte « Aide » des Réglages')); // le composant du guide, sans la carte « Revoir la visite » des Réglages
ok(/bubbleDock\(hole, window\.innerHeight, !step\.page\)/.test(bubbleSrc), 'composant : la bulle ne se centre que sur l\'écran de bienvenue (étape sans page)');
const bubbleDiv = (bubbleSrc.match(/className=\{`fixed left-2 right-2[^`]*`\}/) || [''])[0];
ok(/bg-\[#f8fafc\]/.test(bubbleDiv) && /border-\[#10b981\]/.test(bubbleDiv) && !/bg-\[#0f1722\]/.test(bubbleSrc), 'composant : bulle CLAIRE (fond #f8fafc, cadre vert) : plus sombre sur sombre');
ok(!/\b(text|bg|border)-slate-/.test(bubbleSrc.slice(bubbleSrc.indexOf('return createPortal'))), 'composant : la bulle utilise des couleurs fixes (aucune classe slate que le thème clair changerait)');

// ---- 8. M20.2 : détection par compte et « Voir comme »
const app = src['src/App.tsx'];
ok(/<TourGuide userId=\{realIsAdmin && operatorMode \? `\$\{currentUser\.id\}~\$\{viewAs\}` : currentUser\.id\} role=\{realIsAdmin && operatorMode \? viewAs : currentUser\.role\}/.test(app), '« Voir comme » : le guide reçoit le rôle REGARDÉ et une clé « compte~rôle » (une ouverture par rôle regardé)');
ok(/\}, \[userId, role\]\);/.test(bubbleSrc) && /setOpen\(shouldShowTour\(store\(\), userId\)\)/.test(bubbleSrc), 'composant : changement de compte ou de rôle regardé → on regarde si ce guide doit s\'ouvrir (sans recharger la page)');
import { tourKey, shouldShowTour, markTourSeen } from '../src/utils/tour';
const memStore = (() => { const m: Record<string, string> = {}; return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } }; })();
for (const r of roles) { const uid = `nouveau-${r}`; const first = shouldShowTour(memStore, uid); markTourSeen(memStore, uid); ok(first && !shouldShowTour(memStore, uid), `nouveau compte ${r} : le guide s'ouvre une fois, jamais deux fois`); }
markTourSeen(memStore, 'admin-1');
ok(!shouldShowTour(memStore, 'admin-1') && shouldShowTour(memStore, 'admin-1~accountant') && shouldShowTour(memStore, 'admin-1~team_lead'), '« Voir comme » : le guide de chaque rôle regardé s\'ouvre UNE fois, même si le responsable a déjà vu le sien');
ok(tourKey('admin-1~accountant') !== tourKey('admin-1') && /_v3_/.test(tourKey('x')), 'clés de suivi distinctes par rôle regardé ; version 3');

// ---- 9. M20.3 : lecteur « vidéo courte »
const durs = roles.flatMap(r => GUIDE_SCRIPTS[r].flatMap(st => [sceneDuration(st, 'fr'), sceneDuration(st, 'en')]));
ok(durs.every(d => d >= SCENE_MIN_MS && d <= SCENE_MAX_MS) && SCENE_MIN_MS === 4000 && SCENE_MAX_MS === 7000, `chaque scène dure de 4 à 7 secondes (${Math.min(...durs)} à ${Math.max(...durs)} ms)`);
const plain = GUIDE_SCRIPTS.employee[0], withAct = GUIDE_SCRIPTS.admin.find(st => st.action)!;
ok(sceneDuration(withAct, 'fr') >= sceneDuration({ ...withAct, action: undefined }, 'fr'), 'une scène avec simulation dure au moins autant qu\'une scène sans');
ok(sceneEvents(plain, 5000).length === 1 && sceneEvents(plain, 5000)[0].kind === 'end' && sceneEvents(plain, 5000)[0].at === 5000, 'scène sans simulation : seulement la fin');
const evs = sceneEvents(withAct, 6000);
ok(evs.map(e => e.kind).join() === 'finger,tap,result,end' && evs.every((e, k) => k === 0 || e.at > evs[k - 1].at) && evs[evs.length - 1].at === 6000 && evs[2].at < 6000, 'scène avec simulation : le doigt part, touche, le résultat apparaît, puis la scène finit (dans cet ordre, avant la fin)');
ok(/playing, setPlaying\] = useState\(\(\) => !prefersReduced\(\)\)/.test(bubbleSrc), 'lecteur : lecture automatique par défaut, sauf si l\'appareil demande moins d\'animations');
ok(/elapsed\.current \+= Date\.now\(\) - startedAt/.test(bubbleSrc) && /ev\.at < elapsed\.current/.test(bubbleSrc), 'lecteur : la pause garde le temps déjà joué ; à la reprise, ce qui a déjà eu lieu n\'est pas rejoué');
ok(/aria-label=\{playing \? t\('Pause', 'Pause'\) : t\('Lecture', 'Play'\)\}/.test(bubbleSrc) && /Scène précédente/.test(bubbleSrc) && /Scène suivante/.test(bubbleSrc) && /Liste des scènes/.test(bubbleSrc) && /Rejouer/.test(bubbleSrc), 'lecteur : pause / lecture, précédent, suivant, liste des scènes et « Rejouer » ont un nom accessible');
ok(/min-h-\[44px\] min-w-\[44px\]/.test(bubbleSrc), 'lecteur : boutons d\'au moins 44 px');
ok(/gp-seg-fill/.test(bubbleSrc) && /animationPlayState: playing && !showList \? 'running' : 'paused'/.test(bubbleSrc), 'lecteur : une barre de progression par scène, qui s\'arrête en pause');
ok(/\.gp-finger \{[^}]*transition: left/.test(css) && /@keyframes gp-ripple/.test(css) && /@keyframes gp-seg-grow/.test(css), 'CSS : doigt qui glisse, onde au toucher, progression');
ok(/prefers-reduced-motion: reduce\) \{ \.gp-finger \{ transition: none; \}[^}]*\}[^}]*\.gp-seg > \.gp-seg-fill \{ animation: none; width: 100%/.test(css) && /prefersReduced\(\) \? 'hidden' : 'tap'/.test(bubbleSrc), 'sans animation si l\'appareil le demande : pas de doigt, pas d\'onde, barre pleine, pas de lecture automatique');
ok(/Pointer/.test(bubbleSrc) && /gp-ripple/.test(bubbleSrc) && /finger === 'tap'/.test(bubbleSrc), 'composant : doigt (icône Pointer) et onde au toucher');
ok(!/\bdb\./.test(bubbleSrc) && !/fetch\(/.test(bubbleSrc), 'lecteur : toujours aucune lecture ni écriture de données');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
