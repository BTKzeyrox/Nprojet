// Formulaires en fenêtre : sur grand écran, sections / colonnes (pas une longue colonne étroite comme sur mobile). Lancer : npm run check:form-wide
import { readFileSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const emp = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8');
const add = emp.slice(emp.indexOf('{showAddModal && ('), emp.indexOf('{/* REVIEW ADVANCE MODAL'));
ok(/lg:max-w-3xl/.test(add) && /data-form-section="compte"/.test(add) && /data-form-section="profil"/.test(add) && /lg:grid-cols-2/.test(add), 'ajout d\'un opérateur : fenêtre large + sections Compte / Profil sur grand écran');
ok(/grid-cols-1 lg:grid-cols-2/.test(add) && /grid-cols-1/.test(add), 'ajout d\'un opérateur : une seule colonne sur téléphone');
const edit = emp.slice(emp.indexOf('{/* EDIT USER MODAL */}'), emp.indexOf('{/* ADD USER MODAL */}'));
ok(/lg:max-w-3xl/.test(edit) && /data-form-wide/.test(edit) && /lg:grid-cols-2/.test(edit), 'modification d\'un opérateur : fenêtre large + deux colonnes');
const ed = readFileSync('src/views/employee/EmployeeDashboard.tsx', 'utf8');
ok((ed.match(/df-form-cols/g) || []).length >= 2 && (ed.match(/lg:max-w-4xl/g) || []).length >= 2, 'début et fin de session : fenêtre large + deux colonnes');
ok(/df-form-cols/.test(readFileSync('src/components/PostsGrid20.tsx', 'utf8')), 'nouvelle mission : deux colonnes sur grand écran');
const css = readFileSync('src/index.css', 'utf8');
ok(/@media \(min-width: 1024px\)\s*\{\s*\.df-form-cols \{ display: grid/.test(css) && /:last-child, \.df-form-cols > \[data-span-all\]/.test(css), 'style : deux colonnes dès 1024 px, boutons sur toute la largeur');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.'); process.exit(fails ? 1 : 0);
