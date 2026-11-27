// Formulaires en fenêtre : sur grand écran, sections / colonnes (pas une longue colonne étroite comme sur mobile). Lancer : npm run check:form-wide
import { readFileSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const emp = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8');
const add = emp.slice(emp.indexOf('{showAddModal && ('), emp.indexOf('{/* REVIEW ADVANCE MODAL'));
ok(/lg:max-w-none/.test(add) && /data-form-section="compte"/.test(add) && /data-form-section="profil"/.test(add) && /lg:grid-cols-2/.test(add), 'ajout d\'un opérateur : fenêtre large + sections Compte / Profil sur grand écran');
ok(/grid-cols-1 lg:grid-cols-2/.test(add) && /grid-cols-1/.test(add), 'ajout d\'un opérateur : une seule colonne sur téléphone');
const edit = emp.slice(emp.indexOf('{/* EDIT USER MODAL */}'), emp.indexOf('{/* ADD USER MODAL */}'));
ok(/lg:max-w-none/.test(edit) && /data-form-wide/.test(edit) && /lg:grid-cols-2/.test(edit), 'modification d\'un opérateur : fenêtre large + deux colonnes');
const ed = readFileSync('src/views/employee/EmployeeDashboard.tsx', 'utf8');
ok((ed.match(/df-form-cols/g) || []).length >= 2, 'début et fin de session : deux colonnes');
const pg = readFileSync('src/components/PostsGrid20.tsx', 'utf8');
ok(/df-form-cols/.test(pg) && /df-page-form/.test(pg) && /data-form-open/.test(pg), 'nouvelle mission : sur grand écran, page à la place de la liste, en deux colonnes');
ok((ed.match(/df-page-form/g) || []).length === 2 && /data-form-open/.test(ed), 'début et fin de session : sur grand écran, ils remplacent la page (plus de fenêtre)');
const css = readFileSync('src/index.css', 'utf8');
ok(/@media \(min-width: 1024px\)\s*\{\s*\.df-form-cols \{ display: grid/.test(css) && /:last-child, \.df-form-cols > \[data-span-all\]/.test(css), 'style : deux colonnes dès 1024 px, boutons sur toute la largeur');
ok((emp.match(/df-page-form/g) || []).length === 2 && /formOpen \? 'lg:hidden'/.test(emp) && /data-page-back/.test(emp), 'opérateur : sur grand écran le formulaire remplace la liste (page, pas fenêtre) avec « Retour à la liste »');
ok(/\.df-page-form \{ position: static !important/.test(css), 'style : le formulaire n\'est plus une fenêtre dès 1024 px');
{ const pages = ['src/views/admin/PerformancePage.tsx', 'src/views/hr/HrPage.tsx', 'src/views/admin/DirectionPage.tsx', 'src/views/admin/HistoryPage.tsx', 'src/views/admin/TreasuryPage.tsx', 'src/views/admin/AccountingPage.tsx', 'src/views/admin/ClientsPage.tsx', 'src/views/admin/SettingsView.tsx', 'src/views/NotificationsPage.tsx', 'src/views/TeamValidations.tsx'];
  ok(pages.every(f => !/max-w-(2xl|3xl|4xl|5xl|6xl|7xl) mx-auto/.test(readFileSync(f, 'utf8'))), 'onglets et pages : plus de marges vides sur les côtés en grand écran (largeur pleine dès 1024 px)'); }
ok(/\[data-form-open\] > :not\(\.df-page-form\):not\(\.fixed\)/.test(css), 'style : la page derrière est cachée, pas les messages flottants');
ok(/xl:grid-cols-2/.test(readFileSync('src/views/hr/LeavesSection.tsx', 'utf8')) && /xl:grid-cols-2/.test(readFileSync('src/views/hr/DossiersSection.tsx', 'utf8')), 'RH : congés et dossiers en deux colonnes sur très grand écran');
ok(/df-cards-2/.test(readFileSync('src/views/admin/PerformanceScores.tsx', 'utf8')) && /xl:grid-cols-2/.test(readFileSync('src/views/hr/ReviewsSection.tsx', 'utf8')) && /\.df-cards-2 \{ display: grid/.test(css), 'performance (scores) et évaluations : cartes côte à côte sur très grand écran');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.'); process.exit(fails ? 1 : 0);
