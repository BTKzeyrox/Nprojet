// Contrôle de la page « Opérateurs et sessions » : liste compacte (recherche, filtres, tri), fiche opérateur avec les actions, fusion avec le suivi des sessions.
// Règles pures + rendu serveur de la fiche + lecture du code. Sans réseau. Lancer : npm run check:operator-list
import React from 'react';
import fs from 'node:fs';
import { renderToString } from 'react-dom/server';
import { filterOperators, liveCounts, matchesSearch, normalize, activeFilterCount, isBlocked, OP_FILTERS_DEFAULT, type OpItem } from '../src/utils/operatorList';
import { liveStatus } from '../src/utils/presenceStatus';
import { OperatorSheet } from '../src/components/OperatorSheet';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const NOW = Date.parse('2026-10-28T11:00:00+03:00');
const U = (id: string, name: string, username: string, shift: 'day' | 'night', badge: string, score: number, status = 'active', phone = '261 34 12 345 67') => ({ id, name, username, shift, performance_badge: badge, total_score_boosted: score, status, phone, role: 'employee', access_mode: 'allow' }) as any;
const users = [
  U('a', 'Hanitra Rasoamanana', 'operator1', 'day', 'Elite', 900), U('b', 'Mamy Randrianasolo', 'operator2', 'day', 'Standard', 400), U('c', 'Fidy Rakotoarisoa', 'operator3', 'night', 'Top Booster', 1500),
  U('d', 'Lalaina Ravelona', 'operator4', 'night', 'Under Watch', 100, 'blocked', '261 33 98 765 43'), U('e', 'Éric Radama', 'radama', 'day', 'Standard', 0),
];
const row = (id: string, ms: number) => ({ user_id: id, last_seen: new Date(NOW - ms).toISOString(), first_seen: new Date(NOW - ms).toISOString(), day: '2026-10-28', online_sec: 120 }) as any;
const presence = [row('a', 10_000), row('b', 300_000), row('d', 3 * 3600_000)]; // a en ligne/en cours, b silencieux 5 min, d hors ligne, c et e sans ligne
const posts = [{ id: 'p1', employee_id: 'a', status: 'active', client_name: 'Saisie des fiches', date: '2026-10-28', start_time: '08:00:00' }, { id: 'p2', employee_id: 'b', status: 'pending_end', client_name: 'Relecture', date: '2026-10-28', start_time: '07:50:00' }] as any;
const items: OpItem[] = users.map(u => ({ user: u, live: liveStatus(u, posts, presence, NOW) }));
const names = (f: Partial<typeof OP_FILTERS_DEFAULT>) => filterOperators(items, { ...OP_FILTERS_DEFAULT, ...f }).map(i => i.user.username).join();

// ----- statuts de départ -----
const st = Object.fromEntries(items.map(i => [i.user.id, i.live.status]));
ok(st.a === 'working' && st.b === 'pause' && st.c === 'offline' && st.d === 'offline' && st.e === 'offline', 'départ : a en cours, b en pause (silencieux 5 min), c, d et e hors ligne (aucune ligne de présence : jamais « en ligne » à tort)');
ok(JSON.stringify(liveCounts(items)) === JSON.stringify({ working: 1, online: 0, pause: 1, offline: 3 }), 'compteurs : 1 en cours, 0 en ligne, 1 en pause, 3 hors ligne');

// ----- « actif » = compte non bloqué (rien à voir avec la présence) -----
ok(users.filter(u => !isBlocked(u)).length === 4 && users.filter(u => isBlocked(u)).length === 1, '« compte actif » = non bloqué : 4 actifs, 1 bloqué, même si 3 sont hors ligne');
ok(names({ account: 'active' }) === 'radama,operator3,operator1,operator2' && names({ account: 'blocked' }) === 'operator4', 'filtre compte : actifs / bloqués');

// ----- recherche -----
ok(normalize('  Éric   RADAMA ') === 'eric radama' && normalize(null) === '' && normalize(undefined) === '', 'texte : sans accents, minuscules, espaces nettoyés');
ok(names({ search: 'hanitra' }) === 'operator1' && names({ search: 'HANITRA' }) === 'operator1' && names({ search: 'eric' }) === 'radama', 'recherche par nom : sans tenir compte des majuscules ni des accents (« eric » trouve « Éric »)');
ok(names({ search: 'operator3' }) === 'operator3' && names({ search: 'rada' }) === 'radama' && names({ search: 'rand' }) === 'operator2', 'recherche par identifiant et par morceau de nom (« rada » = Radama, « rand » = Randrianasolo)');
ok(names({ search: '98 765' }) === 'operator4' && names({ search: '2613398' }) === 'operator4' && names({ search: '34 12 345' }).split(',').length === 4, 'recherche par téléphone : chiffres seulement, avec ou sans espaces');
ok(names({ search: 'nuit' }) === names({ shift: 'night' }) && names({ search: 'jour' }) === names({ shift: 'day' }), 'recherche « jour » / « nuit » = filtre de vacation');
ok(names({ search: 'mamy randrianasolo' }) === 'operator2' && names({ search: 'mamy hanitra' }) === '' && names({ search: 'zzz' }) === '', 'plusieurs mots : tous doivent correspondre ; aucun résultat si rien ne correspond');
ok(names({ search: '   ' }).split(',').length === 5 && names({ search: '1' }).split(',').length >= 1, 'recherche vide ou espaces : tout est affiché ; un seul chiffre ne cherche pas dans le téléphone');
ok(matchesSearch({ name: undefined, username: undefined, phone: undefined, shift: 'day' } as any, 'x') === false, 'données incomplètes : aucun plantage');

// ----- filtres -----
ok(names({ shift: 'night' }).split(',').sort().join() === 'operator3,operator4' && names({ shift: 'day' }).split(',').length === 3, 'filtre vacation : nuit = 2, jour = 3');
ok(names({ live: 'working' }) === 'operator1' && names({ live: 'pause' }) === 'operator2' && names({ live: 'offline' }).split(',').length === 3 && names({ live: 'online' }) === '', 'filtre statut en direct : en cours, en pause, hors ligne, en ligne (aucun)');
ok(names({ level: 'Top Booster' }) === 'operator3' && names({ level: 'Under Watch' }) === 'operator4' && names({ level: 'Standard' }).split(',').length === 2, 'filtre performance (niveau) : Top opérateur, À suivre, Standard');
ok(names({ shift: 'night', account: 'active' }) === 'operator3' && names({ shift: 'day', live: 'offline', level: 'Standard' }) === 'radama' && names({ shift: 'night', level: 'Elite' }) === '', 'filtres combinés : tous doivent être vrais');
ok(activeFilterCount(OP_FILTERS_DEFAULT) === 0 && activeFilterCount({ ...OP_FILTERS_DEFAULT, search: ' ', shift: 'day' }) === 1 && activeFilterCount({ ...OP_FILTERS_DEFAULT, search: 'a', shift: 'day', account: 'blocked', live: 'offline', level: 'Elite' }) === 5, 'compte des filtres actifs (pour « Réinitialiser »)');

// ----- tri -----
ok(names({ sort: 'name' }) === 'radama,operator3,operator1,operator4,operator2', 'tri par nom (Éric, Fidy, Hanitra, Lalaina, Mamy : l\'accent ne change pas l\'ordre)');
ok(names({ sort: 'live' }).split(',').slice(0, 2).join() === 'operator1,operator2', 'tri par statut en direct : en cours, puis en pause, puis hors ligne');
ok(names({ sort: 'level' }).split(',')[0] === 'operator3' && names({ sort: 'level' }).split(',').pop() === 'operator4', 'tri par niveau : Top opérateur en tête, À suivre en dernier');
ok(names({ sort: 'score' }).split(',').slice(0, 3).join() === 'operator3,operator1,operator2', 'tri par unités : 1 500, 900, 400…');
ok(filterOperators([], OP_FILTERS_DEFAULT).length === 0 && JSON.stringify(liveCounts([])) === JSON.stringify({ working: 0, online: 0, pause: 0, offline: 0 }), 'liste vide : aucun plantage');
ok(users.length === 5 && items.length === 5 && filterOperators(items, OP_FILTERS_DEFAULT).length === 5, 'le tri et les filtres ne perdent ni ne doublent personne');

// ----- fiche opérateur (rendu) -----
const stripComments = (h: string): string => h.replace(/<!-- -->/g, ''); // le rendu serveur sépare les morceaux de texte par des commentaires vides
const cfg = { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15, show_activity_column: true } as any;
const sheet = (u: any, withOpen = true, chips?: React.ReactNode) => stripComments(renderToString(<OperatorSheet user={u} cfg={cfg} lang="fr" nowMs={NOW} live={liveStatus(u, posts, presence, NOW)} posts={posts} onlineSec={3700} chips={chips}
  onClose={() => {}} onProfile={() => {}} onEdit={() => {}} onToggleBlock={() => {}} onDelete={() => {}} onSetAccess={() => {}} onForceLogout={async () => ({ success: true })} onCancelForce={async () => ({ success: true })} onOpen={withOpen ? () => {} : undefined} />));
let h = sheet(users[0]);
ok(['act-profile', 'act-operator', 'act-calendar', 'act-chat', 'act-edit', 'act-block', 'act-access', 'act-delete'].every(k => h.includes(`data-testid="${k}"`)), 'fiche : toutes les actions (profil, page, calendrier, message, modifier, bloquer, accès, supprimer)');
ok(/role="dialog"/.test(h) && /aria-modal="true"/.test(h) && /data-testid="operator-sheet-close"/.test(h) && /aria-label="Fermer"/.test(h), 'fiche : fenêtre accessible avec un bouton Fermer nommé');
ok(/Hanitra Rasoamanana/.test(h) && /@operator1/.test(h) && /data-testid="live-line-working"/.test(h) && /data-testid="sheet-open-p1"/.test(h) && /Saisie des fiches/.test(h) && /depuis 3 h 00/.test(h), 'fiche : nom, identifiant, statut en direct, mission ouverte et sa durée (08:00 → 11:00 = 3 h 00)');
ok(/1 h 01/.test(h) && /Connecté aujourd/.test(h), 'fiche : temps connecté aujourd\'hui (3 700 s = 1 h 01)');
ok(/Bloquer le compte/.test(h) && !/sheet-blocked/.test(h), 'fiche d\'un compte actif : bouton « Bloquer le compte », pas de bandeau « bloqué »');
h = sheet(users[3]);
ok(/Débloquer le compte/.test(h) && /data-testid="sheet-blocked"/.test(h) && /Aucune mission ouverte/.test(h), 'fiche d\'un compte bloqué : « Débloquer le compte », bandeau « Compte bloqué », aucune mission');
h = sheet(users[1]);
ok(/Fin à valider/.test(h) && !/depuis \d/.test(h.split('sheet-open-p2')[1]?.split('</div>')[0] || ''), 'fiche : « Fin à valider » affichée sans durée (la durée ne concerne que « en cours »)');
h = sheet(users[0], false);
ok(!/act-operator|act-calendar|act-chat/.test(h) && /act-profile/.test(h) && /act-edit/.test(h), 'fiche sans navigation (comptable, chef d\'équipe) : seulement profil et gestion');
ok(/data-testid="sheet-chips"/.test(sheet(users[0], true, <span>À valider</span>)) && !/sheet-chips/.test(sheet(users[0])), 'fiche : pastilles « à valider » seulement s\'il y en a');
ok(!/sheet-open-/.test(sheet(U('z', 'Zoé', 'zoe', 'day', 'Standard', 0))), 'fiche d\'un opérateur sans mission : pas de mission fantôme');

// ----- branchements -----
const rd = (p: string) => fs.readFileSync(p, 'utf8');
const emp = rd('src/views/admin/EmployeesManagement.tsx'), app = rd('src/App.tsx'), side = rd('src/components/Sidebar.tsx'), i18n = rd('src/utils/i18n.ts'), tabs = rd('src/components/OperatorsTabs.tsx');
const region = emp.slice(emp.indexOf('data-testid="op-list"'), emp.indexOf('{sheetUser && ('));
ok(region.length > 2000 && !/handleDeleteUser|handleToggleBlock|handleOpenEdit|onOpenEmployeeCV|setAccessMode|<select/.test(region) && !/>\s*Supprimer\s*<|>\s*Modifier\s*<|>\s*Bloquer\s*<|Profil/.test(region), 'liste : plus AUCUN bouton de gestion sur les lignes (ni supprimer, bloquer, modifier, profil, accès)');
ok(/data-testid=\{`op-row-\$\{emp\.id\}`\}/.test(emp) && /onClick=\{\(\) => setSheetId\(emp\.id\)\}/.test(emp) && /onKeyDown=/.test(emp) && /role="button"/.test(emp) && /tabIndex=\{0\}/.test(emp), 'liste : toucher une ligne (ou Entrée / Espace) ouvre la fiche');
ok(/data-testid=\{`staff-row-\$\{u\.id\}`\}/.test(emp) && /onClick=\{\(\) => setSheetId\(u\.id\)\}/.test(emp), 'comptables et chefs d\'équipe : même fiche au toucher');
ok(/data-testid="op-search"/.test(emp) && /type="search"/.test(emp) && /placeholder=/.test(emp), 'barre de recherche visible en haut de la liste');
ok(/onEdit=\{\(\) => \{ const u = sheetUser; setSheetId\(null\); handleOpenEdit\(u\); \}\}/.test(emp) && /onDelete=\{\(\) => \{ const u = sheetUser; setSheetId\(null\); handleDeleteUser\(u\); \}\}/.test(emp) && /askConfirm\(\{ title: b \? `Débloquer/.test(emp), 'fiche : Modifier ouvre le formulaire existant, Supprimer et Bloquer gardent leur confirmation');
ok(/<OperatorsTabs active="operators"/.test(app) && /<OperatorsTabs active="sessions"/.test(app) && /activeView === 'active-post' \|\| activeView === 'sessions'/.test(app), 'fusion : les deux vues (opérateurs, suivi des sessions) partagent la barre à onglets');
ok(/\.\.\.\(isAdmin \? \[\] : \[\{ id: 'active-post'/.test(side) && /isAdmin && item\.id === 'employees' && \(activeView === 'active-post' \|\| activeView === 'sessions'\)/.test(side), 'menu : une seule entrée pour le responsable ; elle reste en surbrillance pendant le suivi des sessions ; les opérateurs gardent « Ma mission »');
ok(/nav_employees: 'Opérateurs et sessions'/.test(i18n) && /ops-tab-\$\{id\}/.test(tabs) && /tab\('operators'/.test(tabs) && /tab\('sessions'/.test(tabs) && /role="tab"/.test(tabs) && /aria-selected=\{active === id\}/.test(tabs), 'libellé du menu et onglets accessibles (role=tab, aria-selected)');
ok(!/rounded-full[^"`']*\b(?:min-h|px-)[^>]*>\s*[A-Za-zÀ-ÿ]/.test(tabs), 'onglets : pas de bouton en gélule avec du texte (règle « coins sobres »)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
