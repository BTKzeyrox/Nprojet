// Contrôle du serveur de comptabilité (module 14, M14.3) : copie exacte des règles du site, mêmes résultats, protections, anonymat de la paie, migration.
// Lancer : npm run check:accounting-server
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import * as acc from '../src/utils/accounting';
import * as ent from '../src/utils/accountingEntries';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(p, 'utf8');
const server = read('supabase/functions/df-api/index.ts');
const noExport = (t: string) => t.replace(/^export /gm, '');
const region = (t: string, name: string) => (new RegExp(`// BEGIN ${name}\\n([\\s\\S]*?)// END ${name}\\n`).exec(t) || [])[1] || '';

// ---- copie exacte (au mot « export » près)
ok(region(read('src/utils/accounting.ts'), 'ACCOUNTINGCORE').length > 3000 && noExport(region(read('src/utils/accounting.ts'), 'ACCOUNTINGCORE')) === region(server, 'ACCOUNTINGCORE'), 'règles de base : la copie du serveur est identique à celle du site');
ok(region(read('src/utils/accountingEntries.ts'), 'ACCOUNTINGBUILD').length > 3000 && noExport(region(read('src/utils/accountingEntries.ts'), 'ACCOUNTINGBUILD')) === region(server, 'ACCOUNTINGBUILD'), 'écritures automatiques : la copie du serveur est identique à celle du site');
ok(!/^\s*import\s/m.test(region(read('src/utils/accounting.ts'), 'ACCOUNTINGCORE')) && !/^\s*import\s/m.test(region(read('src/utils/accountingEntries.ts'), 'ACCOUNTINGBUILD')), 'aucune importation dans les blocs copiés');

// ---- exécution du bloc du serveur
const m = /const ACCT = \(\(\) => \{[\s\S]*?\n\}\)\(\);/.exec(server);
ok(!!m, 'bloc ACCT trouvé dans le serveur');
const S: any = new Function(transformSync(m![0] + '\nreturn ACCT;', { loader: 'ts' }).code)();
const inv = (p: any = {}) => ({ id: 'i1', type: 'invoice', number: 'FA-1', status: 'issued', client: { name: 'Acme' }, issue_date: '2026-10-05', subtotal_ar: 1000, tax_ar: 200, total_ar: 1200, ...p });
const src: any = {
  invoices: [inv(), inv({ id: 'i2', status: 'cancelled', issue_date: '2026-10-06' }), inv({ id: 'cn', type: 'credit_note', number: 'AV-1', issue_date: '2026-10-07' }), inv({ id: 'd', status: 'draft' }), inv({ id: 'bad', total_ar: 5 })],
  cash: [{ id: 'k1', kind: 'in', category: 'Paiement client', amount_ar: 700, date: '2026-10-10', invoice_id: 'i1', payment_method: 'MVola' }, { id: 'k2', kind: 'out', category: 'Loyer', amount_ar: 300, date: '2026-10-11', payment_method: 'virement' }, { id: 'k3', kind: 'out', category: 'Loyer', amount_ar: 0, date: '2026-10-11' }],
  slips: [{ id: 'slip-2026-10-user-marie', period_end: '2026-10-31', net: 900000, advance_deducted: 100000, paid: { at: '2026-11-03', method: 'espèces' } }],
  advances: [{ id: 'adv-marie-1', status: 'approved', amount_ar: 100000, request_date: '2026-10-12' }, { id: 'adv-2', status: 'pending', amount_ar: 5, request_date: '2026-10-12' }],
};
const key = (id: string) => 'k_' + id.length;
ok(JSON.stringify(S.buildEntries(src)) === JSON.stringify(ent.buildEntries(src)), 'le serveur et le site construisent exactement les mêmes écritures');
ok(JSON.stringify(S.buildEntries(src, key)) === JSON.stringify(ent.buildEntries(src, key)), 'idem avec des clés opaques pour la paie et les avances');
const probes = [{ id: 'a', date: '2026-10-05', journal: 'VT', label: 'x', lines: [{ account: '411', debit: 5, credit: 0 }, { account: '706', debit: 0, credit: 5 }] }, { id: 'b', date: '2026-10-05', journal: 'VT', label: 'x', lines: [{ account: '411', debit: 5, credit: 0 }, { account: '706', debit: 0, credit: 4 }] }, { id: 'c', date: 'x', journal: 'ZZ', label: '', lines: [] }, null, [], { id: 'd', date: '2026-10-05', journal: 'VT', label: 'x', lines: [{ account: '999', debit: 5, credit: 0 }, { account: '706', debit: 0, credit: 5 }] }];
ok(probes.every(p => JSON.stringify(S.cleanEntry(p)) === JSON.stringify(acc.cleanEntry(p))) && probes.every(p => JSON.stringify(S.cleanEntry(p, '2026-10-05')) === JSON.stringify(acc.cleanEntry(p, '2026-10-05'))), `la vérification d'une écriture donne le même résultat sur ${probes.length} cas (avec et sans période close)`);
const first = S.buildEntries(src).entries[0];
ok(JSON.stringify(S.reverseEntry(first, '2026-12-01', 'x-rev')) === JSON.stringify(acc.reverseEntry(first, '2026-12-01', 'x-rev')) && S.cleanEntry(S.reverseEntry(first, '2026-12-01', 'x-rev')).ok, 'la contre-passation est la même et reste valide');

// ---- la paie reste anonyme
const built = ent.buildEntries(src, key);
const payroll = built.entries.filter(e => /^(slip|advance)/.test(e.source?.type || ''));
ok(payroll.length === 3 && payroll.every(e => !/marie/i.test(JSON.stringify(e))), 'écritures de paie et d\'avance : aucun nom ni identifiant de salarié (clé opaque seulement)');
ok(payroll.every(e => /^Paie |^Paiement de la paie |^Avance au personnel$/.test(e.label)), 'libellés de paie : période seulement, jamais un nom');
ok(/acctKey\(String\(r\.data\?\.id \?\? r\.id\)\)/.test(server) && /\(id: string\) => keys\.get\(id\) \|\| id/.test(server), 'le serveur remplace les identifiants de paie et d\'avance par des clés opaques');
ok(/id: \/\^\(slip\|advance\)\/\.test\(x\.type\) \? \(keys\.get\(x\.id\) \|\| 'x'\) : x\.id/.test(server), 'les pièces refusées de paie sont citées par clé opaque, pas par salarié');

// ---- protections
ok(/entries: "df_entries"/.test(server), 'collection entries dans le serveur');
const guard = server.indexOf("if (col === 'entries') {"), adminGuard = server.indexOf('if (!admin && ADMIN_ONLY_WRITE.includes(col)');
ok(guard > 0 && guard < adminGuard && /for \(const r of upserts\) rejected\.push\(\{ col, id: String\(\(r && r\.id\) \|\| ''\), reason: 'forbidden' \}\);\s*for \(const id of deletes\) rejected\.push\(\{ col, id: String\(id\), reason: 'forbidden' \}\);\s*continue;/.test(server.slice(guard, guard + 700)), 'la synchro refuse d\'écrire OU de supprimer une écriture, pour TOUS les rôles (avant le contrôle des droits d\'argent)');
const rolesBlock = /\/\/ ===== BEGIN ROLES[\s\S]*?\/\/ ===== END ROLES =====/.exec(server)![0];
const R: any = new Function(transformSync(rolesBlock + '\nreturn { canReadCol, MONEY_ROUTES, isMoneyRole };', { loader: 'ts' }).code)();
ok(R.canReadCol('admin', 'entries') && R.canReadCol('accountant', 'entries') && !R.canReadCol('team_lead', 'entries') && !R.canReadCol('employee', 'entries'), 'lecture des écritures : responsable et Comptable seulement');
ok(R.MONEY_ROUTES.includes('accounting-sync') && R.MONEY_ROUTES.includes('accounting-post') && !R.MONEY_ROUTES.includes('accounting-reverse'), 'génération et saisie : rôles d\'argent ; l\'annulation a son propre contrôle (responsable seul)');
ok(/ADMIN_ONLY_READ: string\[\] = \[[^\]]*"entries"/.test(server) && /ADMIN_ONLY_WRITE: string\[\] = \[[^\]]*"entries"/.test(server), 'les écritures sont dans les listes « jamais pour un employé » (lecture et écriture)');
ok(/async function accountingReverse\(req: any, res: any, me: any\) \{\s*const no = adminOnly\(res, me\); if \(no\) return no;/.test(server), 'annuler une écriture : responsable seulement');
ok(/if \(reason\.length < 3\)/.test(server) && /date < orig\.date/.test(server), 'annulation : motif de 3 caractères, jamais avant l\'écriture');
ok(/ACCT\.cleanEntry\(\{ id, date: b\.date, journal: b\.journal, ref: b\.ref, label: b\.label, lines: b\.lines, source: \{ type: 'manual', id \} \}\)/.test(server), 'saisie manuelle : l\'identifiant vient du serveur, tout passe par cleanEntry');
for (const a of ['accounting-sync', 'accounting-post', 'accounting-reverse']) ok(new RegExp(`action === "${a}" && req\\.method === "POST"`).test(server), `route ${a} branchée (POST seulement)`);
ok(/AUDIT_ACTIONS = \[[^\]]*"accounting_sync", "accounting_post", "accounting_reverse"\]/.test(server) && (server.match(/auditLog\(me, 'accounting_/g) || []).length === 3, 'les 3 opérations sont notées dans le journal d\'audit');
ok(/rpc\('df_post_entries'/.test(server) && /rpc\('df_reverse_entry'/.test(server) && !/\.from\(T\.entries\)\.(insert|upsert|update|delete)/.test(server), 'le serveur n\'écrit dans les écritures que par les fonctions SQL (jamais d\'insertion directe)');
ok(!/if \(col === 'entries'\)[^\n]*ok = true/.test(server), 'aucune ouverture de l\'écriture des écritures pour un employé');

// ---- migration
const mig = read('supabase/migrations/20261025_create_df_entries.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_entries from anon, authenticated/.test(mig) && /drop table public\.df_entries/.test(mig), 'migration : protection activée, aucun accès public, retour en arrière écrit');
ok(/if exists \(select 1 from public\.df_entries where id = e->>'id'\) then existing := existing \+ 1; continue; end if;/.test(mig), 'migration : une écriture qui existe est ignorée (jamais de doublon, jamais de modification)');
ok(/order by value->>'date', value->>'id'/.test(mig) && /df_next_counter\('entry:' \|\| yr::text\)/.test(mig) && /df_format_number\('EC-'/.test(mig), 'migration : numéros EC-AAAA-0001 attribués par le serveur dans l\'ordre des dates');
ok(/for update/.test(mig) && /raise exception 'already_reversed'/.test(mig) && /raise exception 'is_reversal'/.test(mig) && /raise exception 'not_found'/.test(mig), 'migration : contre-passation verrouillée, refus d\'une double annulation ou d\'annuler une annulation');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
