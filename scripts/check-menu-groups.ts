// Contrôle du menu fusionné (M22.5) : toutes les anciennes pages ont une place, aucun rôle ne gagne ni ne perd de page. Lancer : npm run check:menu-groups
import { menuFor, locate, reachableViews, openView, ADMIN_GROUPS, EMPLOYEE_VIEWS, OLD_ADMIN_VIEWS, MAX_TABS, VIEW_ALIASES, NON_MENU_VIEWS } from '../src/utils/menuGroups';
import { ACCOUNTANT_VIEWS, TEAM_LEAD_VIEWS, ROLES } from '../src/utils/roles';
import { HIDEABLE_MODULES } from '../src/utils/moduleSwitch';
let f = 0, t = 0;
const eq = (g: unknown, w: unknown, n: string) => { t++; if (JSON.stringify(g) !== JSON.stringify(w)) { f++; console.log(`ECHEC ${n}\n  obtenu ${JSON.stringify(g)}\n  attendu ${JSON.stringify(w)}`); } };
const ok = (c: boolean, n: string) => eq(!!c, true, n);
const sorted = (a: string[]) => [...a].sort();

// ---- Responsable : 10 entrées, ≤ 5 onglets, rien ne se perd ----
const admin = menuFor('admin');
eq(admin.length, 10, 'responsable : 10 entrées');
eq(admin.map(g => g.id), ['home', 'feed', 'missions', 'team', 'clients', 'money', 'stock', 'charts', 'messages', 'control'], 'responsable : ordre des entrées');
ok(admin.every(g => g.tabs.length >= 1 && g.tabs.length <= MAX_TABS), 'responsable : 1 à 5 onglets par entrée (la rangée tient sur téléphone)');
ok(admin.find(g => g.id === 'feed')!.tabs.length === 1, 'Actualités reste une entrée à part, seule');
ok(admin.find(g => g.id === 'charts')!.tabs.length === 1, 'Graphiques est une entrée à part');
const allTabIds = admin.flatMap(g => g.tabs.map(x => x.id));
eq(new Set(allTabIds).size, allTabIds.length, 'identifiants d\'onglets uniques');
for (const v of OLD_ADMIN_VIEWS) ok(locate('admin', v) !== null, `ancienne vue « ${v} » a une place pour le responsable`);
eq(sorted(OLD_ADMIN_VIEWS.filter(v => !VIEW_ALIASES[v])).filter(v => !reachableViews('admin').includes(v)), [], 'responsable : aucune ancienne page perdue');
// chaque onglet ouvre une vue qui existe vraiment
const known = new Set<string>([...OLD_ADMIN_VIEWS, 'feed']);
ok(admin.flatMap(g => g.tabs).every(x => known.has(x.view)), 'aucun onglet ne mène à une page qui n\'existe pas');
// Statistiques / Finances : une même vue, deux onglets
eq(locate('admin', 'stats'), { group: 'missions', tab: 'stats' }, 'Statistiques (chiffres) → Missions');
eq(locate('admin', 'stats', '', 'finance'), { group: 'money', tab: 'finance' }, 'Statistiques > Finances → Argent');
eq(locate('admin', 'stats', '', 'inconnu'), { group: 'missions', tab: 'stats' }, 'onglet de statistiques inconnu → Statistiques');
eq(locate('admin', 'sessions'), { group: 'team', tab: 'active-post' }, 'sessions → Équipe');
eq(locate('admin', 'operator'), { group: 'team', tab: 'employees' }, 'fiche d\'un opérateur → Équipe');
eq(locate('admin', 'security'), { group: 'control', tab: 'security' }, 'alertes de sécurité → Contrôle');
eq(locate('admin', 'treasury'), { group: 'money', tab: 'treasury' }, 'Trésorerie → Argent');
eq(locate('admin', 'charts'), { group: 'charts', tab: 'charts' }, 'Graphiques');
eq(locate('admin', 'nimporte-quoi'), null, 'vue inconnue → null');
eq(locate('admin', ''), null, 'vue vide → null');
eq(locate('admin', 'profile'), null, 'le profil est une fenêtre, pas une entrée');
ok(NON_MENU_VIEWS.every(v => locate('admin', v) === null), 'pages hors menu : aucune place inventée');
eq(locate('admin', '__proto__'), null, '__proto__ → null');
eq(locate('admin', 'constructor'), null, 'constructor → null');

// ---- Comptable : exactement ses pages d'avant ----
eq(sorted(reachableViews('accountant')), sorted([...ACCOUNTANT_VIEWS]), 'Comptable : mêmes pages qu\'avant (ni plus, ni moins)');
eq(menuFor('accountant').map(g => g.id), ['feed', 'clients', 'money', 'stock', 'messages', 'control'], 'Comptable : Actualités, Clients, Argent, Stock, Messages, Réglages');
eq(menuFor('accountant').find(g => g.id === 'money')!.tabs.map(x => x.id), ['treasury', 'accounting'], 'Comptable : pas « Finances » (elles montrent la paie)');
eq(menuFor('accountant').find(g => g.id === 'control')!.tabs.map(x => x.id), ['settings'], 'Comptable : seulement ses réglages');
eq(menuFor('accountant').find(g => g.id === 'control')!.fr, 'Réglages', 'Comptable : l\'entrée s\'appelle Réglages');
for (const v of ['dashboard', 'stats', 'advances', 'storage', 'employees', 'charts', 'health', 'errors', 'calendar', 'hr', 'direction', 'security']) eq(locate('accountant', v), null, `Comptable : « ${v} » refusé`);
// ---- Chef d'équipe ----
eq(sorted(reachableViews('team_lead')), sorted([...TEAM_LEAD_VIEWS]), 'Chef d\'équipe : mêmes pages qu\'avant');
eq(menuFor('team_lead').map(g => g.id), ['feed', 'missions', 'messages', 'control'], 'Chef d\'équipe : Actualités, Missions, Messages, Réglages');
eq(menuFor('team_lead').find(g => g.id === 'missions')!.tabs.map(x => x.id), ['validations'], 'Chef d\'équipe : seulement À valider');
for (const v of ['clients', 'invoices', 'treasury', 'advances', 'employees', 'history', 'grid', 'charts']) eq(locate('team_lead', v), null, `Chef d'équipe : « ${v} » refusé`);
// ---- Opérateur : vue simple inchangée ----
eq(sorted(reachableViews('employee')), sorted([...EMPLOYEE_VIEWS]), 'Opérateur : mêmes pages qu\'avant');
eq(menuFor('employee').length, EMPLOYEE_VIEWS.length, 'Opérateur : une entrée par page, pas de fusion');
for (const v of ['clients', 'invoices', 'treasury', 'health', 'employees', 'stats', 'charts', 'validations']) eq(locate('employee', v), null, `Opérateur : « ${v} » refusé`);
// rôles inconnus = opérateur (le moins de droits)
for (const r of ['inconnu', '', undefined, null, 42]) eq(sorted(reachableViews(r)), sorted([...EMPLOYEE_VIEWS]), `rôle ${JSON.stringify(r)} = opérateur`);
// aucun rôle ne peut atteindre plus de pages que le responsable
for (const r of ROLES) { const a = new Set(reachableViews('admin').concat([...EMPLOYEE_VIEWS])); ok(reachableViews(r).every(v => a.has(v)), `${r} : rien en dehors du site connu`); }

// ---- Pages cachées par « Pages du menu » ----
eq(locate('admin', 'clients', 'clients'), null, 'cachée : Clients disparaît');
ok(menuFor('admin', 'clients').find(g => g.id === 'clients')!.tabs.map(x => x.id).join() === 'invoices', 'cachée : Facturation reste dans l\'entrée Clients');
eq(menuFor('admin', 'clients,invoices').some(g => g.id === 'clients'), false, 'toutes les pages d\'une entrée cachées : l\'entrée disparaît (pas d\'entrée vide)');
eq(menuFor('admin', 'stats').find(g => g.id === 'money')!.tabs.map(x => x.id), ['treasury', 'accounting'], 'Statistiques cachées : Finances (qui en fait partie) aussi');
eq(locate('admin', 'feed', 'feed'), { group: 'feed', tab: 'feed' }, 'Actualités : jamais cachable');
eq(locate('admin', 'settings', 'settings,health'), { group: 'control', tab: 'settings' }, 'Réglages : jamais cachables');
eq(locate('admin', 'health', 'health'), { group: 'control', tab: 'health' }, 'Santé du site : jamais cachable');
eq(menuFor('admin', 'nimporte,,quoi').length, 10, 'liste cachée invalide : rien n\'est caché');
eq(menuFor('admin', undefined).length, 10, 'liste cachée absente');
eq(menuFor('admin', 42).length, 10, 'liste cachée non texte');
// tout cacher : il reste au moins Actualités + Contrôle
const allHidden = HIDEABLE_MODULES.map(m => m.id).join(',');
ok(menuFor('admin', allHidden).length >= 2 && menuFor('admin', allHidden).some(g => g.id === 'control') && menuFor('admin', allHidden).some(g => g.id === 'feed'), 'tout caché : Actualités et Contrôle restent (jamais de menu vide)');
ok(menuFor('employee', allHidden).some(g => g.id === 'feed'), 'opérateur, tout caché : Actualités reste');
// comme aujourd'hui : cachée pour tous les rôles
eq(locate('accountant', 'purchasing', 'purchasing'), null, 'Comptable : Achats caché par le responsable → absent');

// ---- Ouverture d'une entrée ----
const money = menuFor('admin').find(g => g.id === 'money')!;
eq(openView(money), { view: 'stats', statsTab: 'finance' }, 'entrée Argent : ouvre Finances (stats + onglet finances)');
eq(openView(money, 'treasury'), { view: 'treasury', statsTab: undefined }, 'dernier onglet retenu');
eq(openView(money, 'disparu'), { view: 'stats', statsTab: 'finance' }, 'dernier onglet disparu : on ouvre le premier');
eq(openView(menuFor('admin').find(g => g.id === 'home')!).view, 'dashboard', 'Accueil ouvre le tableau de bord');
// textes
ok(ADMIN_GROUPS.every(g => g.fr && g.en && g.tabs.every(x => x.fr && x.en)), 'tous les textes en français et en anglais');
ok(JSON.stringify(menuFor('admin')) === JSON.stringify(menuFor('admin')), 'résultat stable');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
