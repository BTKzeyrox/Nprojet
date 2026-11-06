// Contrôle du menu simplifié à l'écran (M22.6) : branchements (lecture du code) + comportements purs. Lancer : npm run check:menu-screen
import { readFileSync } from 'node:fs';
import { mergedFor, getMenuMode } from '../src/utils/menuMode';
import { bottomEntriesOf, BOTTOM_ENTRIES } from '../src/utils/menuNav';
import { menuFor } from '../src/utils/menuGroups';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const r = (p: string) => readFileSync(p, 'utf8');
const app = r('src/App.tsx'), sb = r('src/components/Sidebar.tsx'), bn = r('src/components/BottomNav.tsx'), mt = r('src/components/MenuTabs.tsx'), cc = r('src/components/CompanyConditions.tsx');

ok(mergedFor('admin', 'merged') && mergedFor('accountant', 'merged') && mergedFor('team_lead', 'merged'), 'menu simplifié : responsable, Comptable, Chef d\'équipe');
ok(!mergedFor('employee', 'merged') && !mergedFor(undefined, 'merged') && !mergedFor('inconnu', 'merged'), 'opérateur et rôle inconnu : vue simple inchangée');
ok(!mergedFor('admin', 'classic'), 'ancien menu : le réglage le rend');
ok(getMenuMode() === 'merged', 'par défaut (sans stockage) : menu simplifié, sans planter');
// la barre du bas ne montre que des entrées qui existent pour ce rôle (jamais un bouton vers une page interdite)
for (const role of Object.keys(BOTTOM_ENTRIES)) { const ids = menuFor(role).map(g => g.id); ok(bottomEntriesOf(role).every(e => ids.includes(e)), `barre du bas ${role} : entrées permises seulement`); ok(bottomEntriesOf(role).length <= 5, `barre du bas ${role} : 5 entrées au plus (+ Menu)`); }
ok(bottomEntriesOf('employee').length === 0 && bottomEntriesOf(undefined).length === 0, 'barre du bas : rien de nouveau pour l\'opérateur');
ok(!bottomEntriesOf('admin').includes('home'), 'barre du bas : plus de « Tableau de bord » (il est dans le menu latéral, première ligne)');
ok(menuFor('admin')[0].id === 'home' && !bottomEntriesOf('admin').includes('home'), 'menu latéral : « Tableau de bord » en premier, visible aussi sur téléphone');
// branchements
ok(/menuFor\(currentUser\.role, hiddenCsv\)/.test(sb) && /locate\(currentUser\.role, activeView, hiddenCsv, getStatsTab\(\)\)/.test(sb) && /goToEntry\(g, getLastTabs\(\)\[g\.id\], onNavigate\)/.test(sb), 'menu latéral : entrées, entrée active et clic viennent des règles');
ok(/const listItems = mergedItems \|\| navItems/.test(sb), 'menu latéral : l\'ancien menu reste intact (navItems)');
ok(!/inBottomBar/.test(sb) && /MOVED_TO_HEADER\.includes\(item\.id\) \? '!hidden'/.test(sb), 'menu latéral : plus de barre du bas ; seules Actualités et Messages (dans l\'en-tête) en sont absentes, sur tous les écrans');
ok(!/<BottomNav/.test(app), 'App : la barre du bas n\'est plus affichée');
ok(/menuFor\(currentUser\.role, hiddenPages\)/.test(bn) && /const barItems = merged \? mergedShown : shownItems/.test(bn), 'barre du bas : entrées du menu simplifié, ancienne barre intacte');
ok(/showTabs && activeView !== 'chat' && tabsRow/.test(app) && /showTabs && activeView === 'chat' && tabsRow/.test(app), 'appli : rangée d\'onglets sur chaque page (messagerie : fixe, sous la barre du haut)');
ok(/MENU_TABS_H : 0/.test(app), 'messagerie : la zone de discussion est décalée de la hauteur des onglets');
ok(/!merged && <OperatorsTabs active="operators"/.test(app) && /!merged && \(activeView === 'active-post'/.test(app), 'les anciens onglets Opérateurs / Sessions ne font pas doublon');
ok(/key=\{activeView \+ \(activeView === 'stats' \? getStatsTab\(\) : ''\)\}/.test(app), 'Statistiques / Finances : la page se recharge quand on change d\'onglet');
ok(/df-stats-tab/.test(app) && /df-stats-tab/.test(r('src/utils/statsNav.ts')), 'l\'onglet de Statistiques mis à jour = la rangée suit');
ok(/rememberTab\(loc\.group, loc\.tab\)/.test(app), 'dernier onglet retenu par entrée');
ok(/data-menu-tab=/.test(mt) && /role="tablist"/.test(mt) && /aria-selected/.test(mt) && /min-h-\[44px\]/.test(mt) && /overflow-x-auto/.test(mt), 'onglets : accessibles, 44 px, défilent de côté');
const mp = readFileSync(new URL('../src/components/MenuPagesCard.tsx', import.meta.url), 'utf8');
ok(/data-menu-mode-btn/.test(mp) && /setMenuMode\(m\)/.test(mp) && /Ancien menu/.test(mp), 'Réglages : bouton « Ancien menu » pour revenir en arrière');
// aucune page n'est retirée du rendu : les anciennes vues sont toujours rendues
for (const v of ['dashboard', 'validations', 'history', 'clients', 'invoices', 'treasury', 'purchasing', 'storage', 'performance', 'stats', 'employees', 'hr', 'advances', 'chat', 'calendar', 'health', 'errors', 'charts', 'direction', 'accounting', 'sheets']) ok(new RegExp(`activeView === '${v}'`).test(app) || ['dashboard', 'validations'].includes(v), `page « ${v} » toujours rendue`);
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
