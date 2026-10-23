// Contrôle M7.3 : restauration d'une sauvegarde (fonction SQL, route df-restore, écran). Lancer : npm run check:backup-restore
import { readFileSync } from 'node:fs';
let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { bad++; console.error('✗', m); } else console.log('✓', m); };
const rd = (p: string) => readFileSync(p, 'utf8');
const sql = rd('supabase/migrations/20261023_df_restore_backup.sql');
const fn = rd('supabase/functions/df-restore/index.ts');
const ui = rd('src/components/BackupsSection.tsx');
const store = rd('src/db/store.ts');
const rules = rd('src/utils/auditRules.ts');
const api = rd('supabase/functions/df-api/index.ts');

ok(/df_take_backup\(\)/.test(sql) && sql.indexOf('df_take_backup()') < sql.indexOf('delete from'), 'SQL : sauvegarde de sécurité AVANT toute suppression');
ok(/security definer/.test(sql) && /revoke all on function public\.df_restore_backup\(bigint, text, text\) from public, anon, authenticated/.test(sql), 'SQL : fonction réservée au serveur');
for (const t of ['df_audit', 'df_push_subs', 'df_push_log', 'df_backups', 'df_errors']) ok(new RegExp(`'${t}'`).test(sql.split('skip text[]')[1] || ''), `SQL : ${t} jamais restaurée`);
ok(/t !~ '\^df_\[a-z_\]\+\$'/.test(sql), 'SQL : nom de table contrôlé');
ok(/backup_missing/.test(sql) && /backup_invalid/.test(sql), 'SQL : sauvegarde absente ou abîmée refusée');
ok(/'backup_restore'/.test(sql), 'SQL : note l\'action dans le journal');

const route = fn.split('action === "restore-backup-execute"')[1]?.split('// Remise à zéro')[0] || '';
ok(route.includes('"RESTAURER"') && route.indexOf('"RESTAURER"') < route.indexOf('checkCode'), 'route : mot RESTAURER exigé');
ok(route.includes('adm.verified') && route.includes('checkCode("backup"'), 'route : Gmail vérifié + code par mail');
ok(route.indexOf('checkCode("backup"') < route.indexOf('df_restore_backup'), 'route : code vérifié avant la restauration');
ok(/Number\.isInteger\(bid\)/.test(route), 'route : numéro de sauvegarde contrôlé');
ok(/me\.role !== "admin"/.test(fn.split('Deno.serve')[1]), 'df-restore : admin seulement');
ok(!/df_audit|df_cash|df_invoices|df_counters|df_invoice_/.test(fn), 'df-restore : ne cite aucune table financière ni le journal (contrôles existants)');
ok(fn.includes('restore-backup-code') && fn.includes('"backup"'), 'route : code d\'envoi dédié');

ok(/restoreBackupCode/.test(store) && /restore-backup-execute/.test(store) && /confirm: 'RESTAURER'/.test(store), 'store : appels de restauration');
ok(/RESTAURER/.test(ui) && /askConfirm/.test(ui) && /restoreBackupExecute/.test(ui) && /disabled=\{!verified/.test(ui), 'écran : mot RESTAURER + 2e confirmation + Gmail vérifié + code');
ok(/location\.reload/.test(ui), 'écran : rechargement après la restauration');
ok(rules.includes("'backup_restore'") && api.includes('"backup_restore"'), 'journal : action backup_restore connue (site et serveur)');
if (bad) { console.error(`${bad} contrôle(s) en échec`); process.exit(1); }
console.log('Restauration de sauvegarde : tout est bon.');
