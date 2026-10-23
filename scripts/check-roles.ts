// Contrôle des rôles (M7.1) : règles du site, copie serveur identique, protections du serveur. Lancer : npm run check:roles
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as R from '../src/utils/roles';

let fails = 0;
const eq = (got: unknown, want: unknown, name: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN ROLES[^\n]*\n([\s\S]*?)\/\/ ===== END ROLES =====/);
if (!m) throw new Error('bloc ROLES introuvable');
new Function(transformSync(m[1] + '\n;globalThis.__r = { ROLES, CREATABLE_ROLES, MONEY_COLS, READ_ADMIN_COLS, isRole, isCreatableRole, roleOf, isMoneyRole, isOperator, canReadCol, canWriteMoneyCol, seesClientPrice, MONEY_ROUTES, canRoute };', { loader: 'ts' }).code)();
const S = (globalThis as any).__r;

// ---- Même réponse sur le site et sur le serveur, pour tous les rôles et toutes les collections ----
const roles = [...R.ROLES, 'inconnu', '', undefined, null, 42];
const cols = ['users', 'posts', 'contracts', 'settings', 'news', 'messages', 'groups', 'advances', 'payroll', 'securityLogs', ...R.MONEY_COLS, 'autre'];
eq(S.ROLES, [...R.ROLES], 'liste des rôles identique');
eq(S.CREATABLE_ROLES, [...R.CREATABLE_ROLES], 'rôles créables identiques');
eq(S.MONEY_COLS, R.MONEY_COLS, 'collections d\'argent identiques');
eq(S.READ_ADMIN_COLS, R.READ_ADMIN_COLS, 'collections réservées identiques');
eq(S.MONEY_ROUTES, R.MONEY_ROUTES, 'routes d\'argent identiques');
for (const r of roles) {
  const k = JSON.stringify(r);
  eq([S.roleOf(r), S.isMoneyRole(r), S.isOperator(r), S.seesClientPrice(r), S.isRole(r), S.isCreatableRole(r)], [R.roleOf(r), R.isMoneyRole(r), R.isOperator(r), R.seesClientPrice(r), R.isRole(r), R.isCreatableRole(r)], `rôle ${k} : même réponse`);
  eq(cols.map(c => [S.canReadCol(r, c), S.canWriteMoneyCol(r, c)]), cols.map(c => [R.canReadCol(r, c), R.canWriteMoneyCol(r, c)]), `rôle ${k} : mêmes droits sur les collections`);
  eq(['invoice-pay', 'sync', 'backup-now'].map(a => S.canRoute(r, a)), ['invoice-pay', 'sync', 'backup-now'].map(a => R.canRoute(r, a)), `rôle ${k} : mêmes routes`);
}

// ---- Ce que chaque rôle peut faire ----
const read = (role: string) => cols.filter(c => R.canReadCol(role, c));
eq(cols.every(c => R.canReadCol('admin', c)), true, 'admin lit tout');
eq(R.READ_ADMIN_COLS.every(c => !R.canReadCol('employee', c)), true, 'opérateur : ni argent ni journal de sécurité');
eq(R.READ_ADMIN_COLS.every(c => !R.canReadCol('team_lead', c)), true, 'Chef d\'équipe : ni argent ni journal de sécurité');
eq(R.READ_ADMIN_COLS.every(c => !R.canReadCol('inconnu', c)), true, 'rôle inconnu : ni argent ni journal de sécurité');
eq(R.MONEY_COLS.every(c => R.canReadCol('accountant', c)), true, 'Comptable : lit tout l\'argent');
eq(R.canReadCol('accountant', 'securityLogs'), false, 'Comptable : jamais le journal de sécurité');
eq(read('accountant').includes('payroll'), true, 'Comptable : reçoit les collections ordinaires (comme un opérateur)');
eq(R.MONEY_COLS.every(c => R.canWriteMoneyCol('accountant', c)), true, 'Comptable : écrit l\'argent');
eq(R.MONEY_COLS.some(c => R.canWriteMoneyCol('team_lead', c) || R.canWriteMoneyCol('employee', c)), false, 'Chef d\'équipe et opérateur : n\'écrivent jamais l\'argent');
eq(R.canRoute('accountant', 'invoice-issue') && R.canRoute('admin', 'invoice-pay'), true, 'factures : admin et Comptable');
eq(R.canRoute('team_lead', 'invoice-issue') || R.canRoute('employee', 'invoice-cancel'), false, 'factures : pas pour les autres');
eq(['admin', 'accountant'].map(r => R.seesClientPrice(r)), [true, true], 'prix client vu par admin et Comptable');
eq(['team_lead', 'employee'].map(r => R.seesClientPrice(r)), [false, false], 'prix client caché au Chef d\'équipe et à l\'opérateur');
eq(['admin', 'accountant', 'team_lead'].map(r => R.isOperator(r)), [false, false, false], 'seul l\'opérateur est soumis aux vacations');
eq(R.isCreatableRole('admin'), false, 'on ne crée jamais un second admin');
eq(R.roleOf('n\'importe quoi'), 'employee', 'rôle inconnu = opérateur');

// ---- Protections du serveur ----
const fn = (name: string) => { const x = src.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n}\\n`)); if (!x) throw new Error(`fonction ${name} introuvable`); return x[0]; };
for (const f of ['invoiceIssue', 'invoiceCancel', 'invoicePay']) eq(/moneyOnly\(res, me\)/.test(fn(f)) && !/adminOnly/.test(fn(f)), true, `${f} : admin et Comptable`);
eq(/const moneyOnly = [^\n]*isMoneyRole\(me\.role\)/.test(src), true, 'moneyOnly se fonde sur isMoneyRole');
const stateSrc = fn('state');
eq(stateSrc.includes('!canReadCol(me.role, col)'), true, 'state : lecture filtrée par rôle');
eq(stateSrc.includes('isOperator(me.role)) await touchPresence'), true, 'state : seuls les opérateurs sont « en ligne »');
const syncSrc = fn('sync');
eq(syncSrc.includes('!canWriteMoneyCol(me.role, col)'), true, 'sync : écriture d\'argent filtrée par rôle');
eq((syncSrc.match(/isMoneyRole\(me\.role\) && MONEY_COLS\.includes\(col\)/g) || []).length, 2, 'sync : le Comptable passe seulement sur les collections d\'argent (écriture et suppression)');
eq(/user\.role !== 'employee'\) return \{ ok: true \}/.test(src), true, 'vacations : seulement les opérateurs');
eq(/!isOperator\(user\.role\)\) return null/.test(src), true, 'maintenance : seulement les opérateurs');
const cu = fn('createUser');
eq(cu.includes("me.role !== 'admin'"), true, 'création de compte : admin seulement');
eq(cu.includes('isCreatableRole(user.role)') && cu.includes('role: newRole'), true, 'création de compte : rôle contrôlé, jamais admin');
for (const f of ['payrollClose', 'payrollReopen', 'payrollPay', 'auditList', 'backupNow']) eq(/adminOnly\(res, me\)|me\.role !== 'admin'/.test(fn(f)), true, `${f} : reste réservé à l'admin`);
const priv = /BEGIN PRIVACY[\s\S]*?END PRIVACY/.exec(src)![0];
eq(/stripSettings = [^\n]*\n  if \(!rec \|\| \(me\.role === "admin" \|\| me\.role === "accountant"\)\)/.test(priv), true, 'réglages : prix client pour admin et Comptable');
eq(/withoutClientPrice = [^\n]*\n  if \(!rec \|\| \(me\.role === "admin" \|\| me\.role === "accountant"\)/.test(priv), true, 'missions : prix client pour admin et Comptable');

// ---- M7.1 c : écran du Comptable (règles de pages + câblage) ----
eq(R.viewAllowedFor('accountant', 'invoices'), true, 'Comptable : Facturation permise');
for (const v of ['feed', 'clients', 'purchasing', 'chat', 'settings']) eq(R.viewAllowedFor('accountant', v), true, `Comptable : page permise « ${v} »`);
for (const v of ['advances', 'employees', 'stats', 'health', 'errors', 'validations', 'dashboard', 'history', 'performance', 'calendar', 'active-post', 'grid', 'security']) eq(R.viewAllowedFor('accountant', v), false, `Comptable : page refusée « ${v} »`);
for (const r of ['admin', 'employee', undefined, null, 'zzz']) eq(R.viewAllowedFor(r, 'advances'), true, `autres rôles non limités ici (${String(r)})`);
eq(R.viewAllowedFor('team_lead', 'advances'), false, 'Chef d\'équipe : limité à ses pages (voir check:team-lead)');
eq([...R.ACCOUNTANT_VIEWS].some(v => ['advances', 'employees', 'stats', 'health', 'errors'].includes(v)), false, 'liste du Comptable : jamais paie, comptes, statistiques, santé, erreurs');
const rd = (f: string) => readFileSync(f, 'utf8');
const app = rd('src/App.tsx'), side = rd('src/components/Sidebar.tsx'), bottom = rd('src/components/BottomNav.tsx'), emp = rd('src/views/admin/EmployeesManagement.tsx'), store = rd('src/db/store.ts'), types = rd('src/types/index.ts');
eq(/viewUser\.role === 'accountant' \?[\s\S]{0,900}<InvoicesView \/>/.test(app), true, 'App : écran du Comptable branché (toute autre page mène à Facturation)');
eq(/viewUser\.role === 'accountant' \?[\s\S]{0,900}<InvoicesView \/>\s*\) : viewUser\.role === 'admin'/.test(app) || /<InvoicesView \/>\s*\n?\s*\) : viewUser\.role === 'admin'/.test(app), true, 'App : le Comptable passe avant l\'écran admin');
eq(/viewAllowedFor\(currentUser\.role, it\.id\)/.test(side), true, 'Menu : filtré par rôle');
eq(/currentUser\?\.role === 'accountant' \? accountantItems/.test(bottom), true, 'Barre du bas : jeu du Comptable');
eq(/CREATABLE_ROLES\.map/.test(emp) && /role: newRole/.test(emp), true, 'Création de compte : rôle choisi parmi CREATABLE_ROLES');
eq(/\{newRole === 'employee' && \(/.test(emp), true, 'Création : vacation demandée aux opérateurs seulement');
eq(/const staff = users\.filter\(u => u\.role !== 'employee' && u\.role !== 'admin'\)/.test(emp), true, 'Liste des Comptables et chefs d\'équipe (bloquer, supprimer)');
eq(/export type UserRole = 'admin' \| 'employee' \| 'accountant' \| 'team_lead'/.test(types), true, 'Type UserRole : 4 rôles');
// côté site : l'argent est ouvert au Comptable, tout le reste reste réservé au responsable
const money = ['addCash', 'updateCash', 'deleteCash', 'saveInvoiceDraft', 'deleteInvoiceDraft', 'addClient', 'updateClient', 'setClientActive', 'deleteClient', 'addSupplier', 'updateSupplier', 'setSupplierActive', 'deleteSupplier', 'addProduct', 'updateProduct', 'deleteProduct', 'addStockMove', 'deleteStockMove'];
for (const f of money) { const mm = new RegExp(`public ${f}\\([\\s\\S]{0,260}?\\n    if \\(([^\\n]*)\\) return`).exec(store); eq(!!mm && mm[1].includes('isMoneyRole'), true, `store.${f} : admin ou Comptable`); }
for (const f of ['publishNews', 'deleteNews', 'togglePinNews']) { const mm = new RegExp(`public ${f}\\([\\s\\S]{0,260}?role !== 'admin'`).exec(store); eq(!!mm, true, `store.${f} : reste réservé au responsable`); }

console.log(fails ? `\n${fails} contrôle(s) en échec` : '\nRôles : tout est bon.');
process.exit(fails ? 1 : 0);
