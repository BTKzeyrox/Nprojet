// Contrôle du journal d'audit (M7.2) : règles du site, copie serveur identique, protections du serveur, migration. Lancer : npm run check:audit
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { AUDIT_ACTIONS, AUDIT_TARIFF_KEYS, auditChanges, auditCutoffMs, auditLabel, auditLabelOf, auditSettingsKeys, buildAuditEntry, cleanAuditRows, filterAudit, groupAuditByDay } from '../src/utils/auditRules';

let fails = 0;
const eq = (got: unknown, want: unknown, name: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

// ---- Bloc serveur ----
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
const js = transformSync(grab('AUDIT') + '\n;globalThis.__s = { AUDIT_ACTIONS, AUDIT_TARIFF_KEYS, buildAuditEntry, auditLabelOf, auditChanges, auditSettingsKeys, auditCutoffMs };', { loader: 'ts' }).code;
new Function(js)();
const S = (globalThis as any).__s;

// ---- Ligne du journal ----
const me = { id: 'user-admin-1', name: 'Responsable', username: 'admin' };
const AT = '2026-10-23T08:15:30.123Z';
const e = buildAuditEntry(me, 'invoice_issue', { type: 'invoices', id: 'inv1', label: 'F-2026-0001' }, 'Client : Alice', AT, 'abc123')!;
eq(e, { id: '20261023081530123-abc123', at: AT, by: 'user-admin-1', by_name: 'Responsable', action: 'invoice_issue', target_type: 'invoices', target_id: 'inv1', target_label: 'F-2026-0001', detail: 'Client : Alice' }, 'ligne complète');
eq(buildAuditEntry(me, 'hack', {}, '', AT, 'x'), null, 'action inconnue : refusée');
eq(buildAuditEntry(me, '__proto__', {}, '', AT, 'x'), null, 'action __proto__ : refusée');
eq(buildAuditEntry({ username: 'bob' }, 'backup_now', undefined, undefined, AT, 'x')!.by_name, 'bob', 'sans nom : pseudo');
eq(buildAuditEntry(me, 'delete', { label: 'a'.repeat(500) }, 'b'.repeat(900), AT, 'x')!.target_label.length, 80, 'cible coupée à 80');
eq(buildAuditEntry(me, 'delete', {}, 'b'.repeat(900), AT, 'x')!.detail.length, 300, 'détail coupé à 300');
eq(buildAuditEntry(me, 'delete', { label: 'a\nb\u0000c' }, 'x\ty', AT, 'x')!.target_label, 'a b c', 'caractères de contrôle remplacés');
eq(buildAuditEntry(null as any, 'delete', null as any, null, AT, 'x')!.by, '', 'sans auteur : vide, pas de plantage');
eq(buildAuditEntry(me, 'delete', {}, '', AT, 'a'.repeat(30))!.id.endsWith('-' + 'a'.repeat(8)), true, 'hasard coupé à 8');
eq(new Set(AUDIT_ACTIONS).size, AUDIT_ACTIONS.length, 'pas d\'action en double');
for (const a of AUDIT_ACTIONS) eq(auditLabel(a, 'fr') !== 'Action inconnue' && auditLabel(a, 'en') !== 'Unknown action', true, `libellé FR et EN : ${a}`);
eq(auditLabel('zzz', 'fr'), 'Action inconnue', 'libellé inconnu');

// ---- Étiquette, changements, réglages ----
eq(auditLabelOf({ number: 'F-1', name: 'x' }), 'F-1', 'étiquette : numéro d\'abord');
eq(auditLabelOf({ client_name: 'Titre' }), 'Titre', 'étiquette : titre de mission');
eq(auditLabelOf(null), '', 'étiquette : null');
eq(auditLabelOf('x'), '', 'étiquette : texte');
eq(auditChanges({ a: 1, b: 2 }, { a: 1, b: 3 }, ['a', 'b']), ['b : 2 → 3'], 'tarif : seul ce qui change');
eq(auditChanges({}, { a: 5 }, ['a']), ['a : — → 5'], 'tarif : ajout');
eq(auditChanges({ a: { x: 1 } }, { a: { x: 2 } }, ['a']), ['a : {"x":1} → {"x":2}'], 'tarif : objet');
eq(auditChanges(undefined, undefined, ['a']), [], 'tarif : rien');
eq(auditSettingsKeys({ a: 1, b: 2, company: { x: 1 }, company_log: [1], price_per_million: 1 }, { a: 1, b: 3, company: { x: 2 }, company_log: [1, 2], price_per_million: 2, c: 1 }), ['b', 'c'], 'réglages : ni Conditions ni tarifs');
eq(auditSettingsKeys(undefined, undefined), [], 'réglages : vide');
eq(auditSettingsKeys({}, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i]))).length, 12, 'réglages : 12 au plus');
eq(S.auditCutoffMs(1_000_000_000_000), auditCutoffMs(1_000_000_000_000), 'conservation : serveur = site');
eq(Date.parse('2026-10-23T00:00:00Z') - auditCutoffMs(Date.parse('2026-10-23T00:00:00Z')), 365 * 86400_000, 'conservation : 365 jours');

// ---- Serveur = site ----
eq(S.AUDIT_ACTIONS, [...AUDIT_ACTIONS], 'serveur = site (actions)');
eq(S.AUDIT_TARIFF_KEYS, AUDIT_TARIFF_KEYS, 'serveur = site (clés de tarif)');
const meCases: any[] = [me, { username: 'bob' }, null];
for (const a of [...AUDIT_ACTIONS, 'zzz', '__proto__']) for (const m of meCases) eq(S.buildAuditEntry(m, a, { type: 'x', id: 'y', label: 'z\n' }, 'd'.repeat(400), AT, 'r1'), buildAuditEntry(m, a, { type: 'x', id: 'y', label: 'z\n' }, 'd'.repeat(400), AT, 'r1'), `serveur = site (ligne ${a} / ${m && (m.id || m.username) || 'aucun'})`);
const pairs: [any, any][] = [[{ a: 1, price_per_million: 1000 }, { a: 2, price_per_million: 1200, client_prices_by_type: { x: 1 } }], [undefined, { z: 1 }], [{ k: [1, 2] }, { k: [1, 3] }]];
for (const [i, [b, a]] of pairs.entries()) {
  eq(S.auditChanges(b, a, AUDIT_TARIFF_KEYS), auditChanges(b, a, AUDIT_TARIFF_KEYS), `serveur = site (changements ${i})`);
  eq(S.auditSettingsKeys(b, a), auditSettingsKeys(b, a), `serveur = site (réglages ${i})`);
}
for (const d of [{ number: 'F1' }, { name: 'N' }, { client_name: 'C' }, { title: 'T' }, { username: 'u' }, { id: 'i' }, null, 3, {}]) eq(S.auditLabelOf(d), auditLabelOf(d), `serveur = site (étiquette ${JSON.stringify(d)})`);

// ---- Lignes du serveur : nettoyage, filtre, regroupement (site) ----
const row = (id: string, at: string, o: object = {}) => ({ id, at, by: 'u', by_name: 'Resp', action: 'delete', target_type: 'clients', target_id: 'c', target_label: 'Alice', detail: 'ok', ...o });
eq(cleanAuditRows('x'), [], 'lignes : pas un tableau');
eq(cleanAuditRows([null, 3, 'x', { id: 1 }, { id: 'a', at: 'pas une date' }, row('a', AT)]).length, 1, 'lignes abîmées ignorées');
const sorted = cleanAuditRows([row('a', '2026-10-21T10:00:00Z'), row('b', '2026-10-23T10:00:00Z'), row('c', '2026-10-22T10:00:00Z')]);
eq(sorted.map(r => r.id), ['b', 'c', 'a'], 'plus récentes d\'abord');
eq(cleanAuditRows([row('a', AT, { detail: 'x'.repeat(999) })])[0].detail.length, 300, 'ligne reçue : détail coupé');
const all = cleanAuditRows([row('a', '2026-10-21T10:00:00Z', { action: 'delete' }), row('b', '2026-10-23T10:00:00Z', { action: 'invoice_issue', target_label: 'F-1', detail: 'Client : Bob' }), row('c', '2026-10-23T22:30:00Z', { action: 'delete', by_name: 'Zoé' })]);
eq(filterAudit(all, { action: 'delete' }).map(r => r.id), ['c', 'a'], 'filtre : action');
eq(filterAudit(all, { q: 'BOB' }).map(r => r.id), ['b'], 'filtre : texte sans casse');
eq(filterAudit(all, { q: 'zoé' }).map(r => r.id), ['c'], 'filtre : nom');
eq(filterAudit(all, { from: '2026-10-22' }).map(r => r.id), ['c', 'b'], 'filtre : du');
eq(filterAudit(all, { to: '2026-10-21' }).map(r => r.id), ['a'], 'filtre : au');
eq(filterAudit(all, { from: '2026-10-25' }).map(r => r.id), [], 'filtre : rien');
eq(filterAudit(all, { from: '2026-10-24' }).map(r => r.id), ['c'], 'filtre : 22:30 UTC compte pour le lendemain (Madagascar)');
eq(filterAudit(all, {}).length, 3, 'filtre : vide = tout');
eq(groupAuditByDay(all).map(g => `${g.day}:${g.rows.length}`), ['2026-10-24:1', '2026-10-23:1', '2026-10-21:1'], 'jours à l\'heure de Madagascar (22:30 UTC = lendemain)');
eq(groupAuditByDay([]), [], 'regroupement vide');

// ---- Protections du serveur (le test échoue si on retire une protection) ----
const fn = (name: string) => { const m = src.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n}\\n`)); if (!m) throw new Error(`fonction ${name} introuvable`); return m[0]; };
eq(/adminOnly\(res, me\)/.test(fn('auditList')), true, 'audit-list : admin seulement');
eq(/action === "audit-list" && req\.method === "GET"/.test(src), true, 'route audit-list branchée (après la connexion)');
eq(/const T = \{[\s\S]*?\n\};/.exec(src)![0].includes('df_audit'), false, 'df_audit absente de T : jamais envoyée par la synchro ni par state');
eq(/const ADMIN_ONLY_READ[^\n]*df_audit/.test(src), false, 'df_audit hors des collections synchronisées');
eq(fn('auditLog').includes('catch (err)'), true, 'auditLog attrape ses erreurs (jamais bloquant)');
eq(/AUDIT\)\.delete\(\)\.lt\('updated_at'[^\n]*auditCutoffMs/.test(src), true, 'purge de 12 mois');
for (const [fnName, action] of [['invoiceIssue', 'invoice_issue'], ['invoiceCancel', 'invoice_cancel'], ['invoicePay', 'invoice_pay'], ['createUser', 'user_create'], ['setPassword', 'user_password'], ['profileDecision', 'profile_decision'], ['resetDecision', 'reset_decision'], ['signupDecision', 'signup_decision'], ['payrollClose', 'payroll_close'], ['payrollReopen', 'payroll_reopen'], ['payrollPay', 'payroll_pay'], ['backupNow', 'backup_now']] as const)
  eq(fn(fnName).includes(`auditLog(me, '${action}'`), true, `${fnName} écrit dans le journal`);
const syncSrc = fn('sync');
for (const a of ['delete', 'tariff_change', 'settings_change', 'company_change']) eq(syncSrc.includes(`auditLog(me, '${a}'`), true, `sync écrit « ${a} »`);
eq(/auditDel = \(admin \|\| isMoneyRole\(me\.role\)\) && col !== 'messages'/.test(syncSrc), true, 'suppression : étiquette lue avant, messages exclus');
eq(/password/i.test(/auditLog\(me, 'user_password'[^\n]*\n/.exec(fn('setPassword'))![0].replace("'user_password'", '')), false, 'mot de passe jamais écrit dans le journal');
const companyLine = /auditLog\(me, 'company_change'[^\n]*\n/.exec(syncSrc)![0];
eq(companyLine.includes('cp.join') && !/before|after|\.value/.test(companyLine), true, 'Conditions : noms de champs seulement, pas de valeurs');

// ---- Migration ----
const mig = readFileSync('supabase/migrations/20261023_create_df_audit.sql', 'utf8');
eq(/create table if not exists public\.df_audit/.test(mig), true, 'migration : table créée sans écraser');
eq(/enable row level security/.test(mig), true, 'migration : RLS activée');
eq(/revoke all on public\.df_audit from anon, authenticated/.test(mig), true, 'migration : aucun droit pour anon ni authenticated');
eq(/drop table public\.df_audit/.test(mig), true, 'migration : retour en arrière écrit');
const restore = readFileSync('supabase/functions/df-restore/index.ts', 'utf8');
eq(restore.includes('df_audit'), false, 'remise à zéro : ne touche pas au journal');

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
