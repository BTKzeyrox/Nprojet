// Contrôle de la sécurité des finances dans le serveur df-api (sans réseau).
// Lancer : npm run check:cash
// 1) teste la vraie fonction cleanCash (extraite du fichier du serveur) ; 2) vérifie par lecture du code que la lecture ET l'écriture
// de la collection « cash » sont refusées aux employés. Si quelqu'un retire une protection, ce contrôle échoue.
import fs from 'node:fs';
import { transformSync } from 'esbuild';

const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

// --- extraire et exécuter le bloc cash du serveur ---
const m = /\/\/ ===== BEGIN CASH[^\n]*\n([\s\S]*?)\/\/ ===== END CASH =====/.exec(src);
ok(!!m, 'bloc « CASH » trouvé dans le serveur');
const js = transformSync(m![1], { loader: 'ts' }).code;
const mod = new Function(`${js}\nreturn { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE, cleanCash };`)() as { ADMIN_ONLY_READ: string[]; ADMIN_ONLY_WRITE: string[]; cleanCash: (r: any, e: any, me: string, now: string) => any };
const { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE, cleanCash } = mod;
const NOW = '2026-10-19T08:00:00.000Z';
const good = { id: 'cash-1', kind: 'in', category: 'Paiement client', amount_ar: 150000, date: '2026-10-18', note: 'Client A', client_name: 'Client A' };

// --- listes de protection ---
ok(ADMIN_ONLY_READ.includes('cash') && ADMIN_ONLY_READ.includes('securityLogs'), 'lecture réservée à l\'admin : cash et journal de sécurité');
ok(ADMIN_ONLY_WRITE.includes('cash') && !ADMIN_ONLY_WRITE.includes('securityLogs'), 'écriture réservée à l\'admin : cash (le journal de sécurité reste écrivable par un employé pour ses lignes)');

// --- cleanCash : lignes valides ---
const v = cleanCash(good, undefined, 'admin-1', NOW);
ok(v.ok && v.save.created_by === 'admin-1' && v.save.created_at === NOW && v.save.amount_ar === 150000, 'ligne valide acceptée, créateur et date de création posés par le serveur');
const up = cleanCash({ ...good, amount_ar: 200000.4, note: 'modifiée' }, { created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' }, 'admin-1', NOW);
ok(up.ok && up.save.created_by === 'admin-0' && up.save.created_at === '2026-10-01T00:00:00.000Z' && up.save.amount_ar === 200000, 'modification : créateur et date de création conservés, montant arrondi');
ok(cleanCash({ ...good, kind: 'out', category: 'Salaires', mission_id: 'm1' }, undefined, 'a', NOW).save.mission_id === 'm1', 'lien avec une mission gardé');
ok(cleanCash({ ...good, date: '2024-02-29' }, undefined, 'a', NOW).ok, 'date du 29 février 2024 (année bissextile) acceptée');

// --- cleanCash : lignes refusées ---
const bad = (patch: any, reason: string, name: string) => { const r = cleanCash({ ...good, ...patch }, undefined, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
bad({ kind: 'transfer' }, 'kind', 'type inconnu refusé');
bad({ kind: undefined }, 'kind', 'type absent refusé');
bad({ amount_ar: 0 }, 'amount', 'montant 0 refusé');
bad({ amount_ar: -500 }, 'amount', 'montant négatif refusé');
bad({ amount_ar: 'abc' }, 'amount', 'montant texte refusé');
bad({ amount_ar: NaN }, 'amount', 'montant NaN refusé');
bad({ amount_ar: 1e13 }, 'amount', 'montant démesuré refusé');
bad({ date: '2026-02-31' }, 'date', 'date inexistante (31 février) refusée');
bad({ date: '2026-13-01' }, 'date', 'mois 13 refusé');
bad({ date: '20261019' }, 'date', 'date sans tirets refusée');
bad({ date: '2023-02-29' }, 'date', '29 février 2023 (année normale) refusé');
bad({ category: '   ' }, 'category', 'catégorie vide refusée');
ok(!cleanCash(null, undefined, 'a', NOW).ok, 'ligne vide (null) refusée sans erreur');
const long = cleanCash({ ...good, note: 'x'.repeat(900), client_name: 'y'.repeat(300), category: 'z'.repeat(90) }, undefined, 'a', NOW).save;
ok(long.note.length === 300 && long.client_name.length === 80 && long.category.length === 40, 'textes trop longs coupés (note 300, client 80, catégorie 40)');
ok(!('password_hash' in cleanCash({ ...good, password_hash: 'x', role: 'admin' }, undefined, 'a', NOW).save), 'champs inconnus non copiés');

// --- lecture du code : les protections sont bien branchées ---
const stateFn = /async function state\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
const syncFn = /async function sync\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(stateFn.includes('!canReadCol(me.role, col)'), 'state : cash et journal ne sont jamais envoyés à un employé (M7.1 : ni au Chef d\'équipe ; le Comptable reçoit l\'argent, pas le journal de sécurité)');
const gate = syncFn.indexOf('!admin && ADMIN_ONLY_WRITE.includes(col)');
ok(gate > 0 && gate < syncFn.indexOf('for (const rec of upserts)'), 'sync : refus des écritures d\'un employé AVANT toute autre règle');
ok(/ADMIN_ONLY_WRITE\.includes\(col\) && !canWriteMoneyCol\(me\.role, col\)\)\s*\{[\s\S]*?for \(const id of deletes\) rejected\.push[\s\S]*?continue;/.test(syncFn), 'sync : suppressions d\'un employé refusées aussi');
ok(syncFn.includes("col === 'cash'") && syncFn.includes('cleanCash('), 'sync : chaque ligne de l\'admin passe par cleanCash');
ok((src.match(/df_cash/g) || []).length === 1, 'aucune autre route du serveur ne lit la table df_cash (une seule mention : la liste des collections)');
// Seule exception : la garde « fournisseur utilisé » (module 4), dans la suppression admin d'un fournisseur ; elle lit seulement l'existence d'une ligne.
const guardLine = "for (const t of [T.purchases, T.stock, T.cash]) {";
ok(src.split(guardLine).length - 1 === 1, 'garde « fournisseur utilisé » : la seule lecture de T.cash hors state et sync');
// Seconde exception (module 14, M14.3) : la génération des écritures comptables lit la caisse EN LECTURE SEULE, dans la route accounting-sync (admin et Comptable seulement, jamais d'écriture).
const acctLine = "fetchAll((a, b) => sb.from(T.cash).select('id, data').order('id', { ascending: true }).range(a, b)),";
ok(src.split(acctLine).length - 1 === 1 && /async function accountingSync\([\s\S]*?acctLine/.test(src.replace(acctLine, 'acctLine')), 'écritures comptables : la seule autre lecture de T.cash, en lecture seule, dans accountingSync');
ok((src.split(guardLine).join('').split(acctLine).join('').match(/T\.cash/g) || []).length === 0, 'aucun autre accès direct T.cash en dehors de state, sync, la garde fournisseur et la comptabilité');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
