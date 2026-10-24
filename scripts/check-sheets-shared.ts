// Contrôle « Mes tableaux » : le bloc SHEETS du serveur donne EXACTEMENT les mêmes résultats que le site (src/utils/sheets.ts). Sans réseau. Lancer : npm run check:sheets-shared
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import * as S from '../src/utils/sheets';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN SHEETS[^\n]*\n([\s\S]*?)\/\/ ===== END SHEETS =====/.exec(src);
ok(!!m, 'bloc « SHEETS » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { cleanSheet, cleanSheetWrite, SHEET_MAX_CHARS, SHEETS_MAX_RECORDS, SHEET_LIMITS };`)() as any;
const NOW = '2026-10-24T10:00:00.000Z';

ok(srv.SHEET_MAX_CHARS === S.SHEET_MAX_CHARS && srv.SHEETS_MAX_RECORDS === S.SHEETS_MAX_RECORDS, 'mêmes limites de taille');
ok(['sheetsPerPerson', 'columns', 'rows', 'cellLen', 'title', 'colName', 'rules', 'options'].every(k => srv.SHEET_LIMITS[k] === (S.LIMITS as any)[k]), 'mêmes limites de contenu');

const good = S.demoSheets(NOW)[0];
const withOwner = { ...good, owner_id: 'u1', owner_name: 'Ana' };
const dirty = JSON.parse(J(good)); dirty.rows[0].cells[good.columns[0].id] = 5; dirty.rows[0].cells.zzz = 'x'; dirty.columns[0].type = 'hack';
const cases: [string, unknown][] = [
  ['tableau valide', good], ['avec propriétaire', withOwner], ['sale', dirty], ['rien', null], ['texte', 'x'], ['sans id', { ...good, id: '' }], ['id trop long', { ...good, id: 'a'.repeat(100) }],
  ['doublons de colonnes', { id: 's', columns: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], rows: [{ id: 'r', cells: {} }, { id: 'r', cells: {} }] }],
  ['règles piégées', { ...good, rules: [{ col: 'nope', op: '>', color: 'red' }, { id: 'r1', col: good.columns[0].id, op: '>', value: '1', color: 'pink' }, { col: good.columns[0].id, op: 'contains', value: 'x', color: 'blue' }] }],
  ['liste sans choix', { id: 's', columns: [{ id: 'a', name: 'L', type: 'list', options: ['A', '', 5, 'B'] }], rows: [] }],
  ['énorme', { id: 's', columns: Array.from({ length: 300 }, (_, i) => ({ id: 'c' + i, name: 'x'.repeat(100) })), rows: Array.from({ length: 6000 }, (_, i) => ({ id: 'r' + i, cells: { c0: 'y'.repeat(900) } })) }],
  ['corbeille', { ...good, deleted_at: NOW, rows: good.rows.map((r, i) => (i ? r : { ...r, deleted_at: NOW })) }],
  ['proto', JSON.parse('{"id":"s","__proto__":{"evil":1},"columns":[{"id":"a","__proto__":{"x":1}}]}')],
];
for (const [name, v] of cases) ok(J(S.cleanSheet(v, NOW)) === J(srv.cleanSheet(v, NOW)), `site = serveur : ${name}`);
const cleaned = S.cleanSheet(cases[10][1], NOW)!; ok(cleaned.rows.length === 5000 && cleaned.columns.length === 200, 'énorme : coupé à 5 000 lignes et 200 colonnes');

// règle d'écriture (serveur)
const me = { id: 'u1', name: 'Ana', role: 'employee' };
const W = (rec: any, ex: any, who: any, counts = { active: 0, total: 0 }) => srv.cleanSheetWrite(rec, ex, who, NOW, counts);
{
  const r = W(good, undefined, me); ok(r.ok && r.save.owner_id === 'u1' && r.save.owner_name === 'Ana', 'serveur : le propriétaire est celui qui écrit');
  const forged = W({ ...good, owner_id: 'u2', owner_name: 'Autre' }, undefined, me); ok(forged.ok && forged.save.owner_id === 'u1', 'serveur : un faux propriétaire envoyé est ignoré');
  ok(!W(good, { ...good, owner_id: 'u2' }, me).ok && W(good, { ...good, owner_id: 'u2' }, me).reason === 'forbidden', 'serveur : on ne modifie jamais le tableau d\'un autre');
  for (const role of ['admin', 'accountant', 'team_lead']) ok(W(good, undefined, { ...me, role }).reason === 'forbidden', `serveur : le rôle ${role} n'écrit pas de tableau`);
  ok(W(null, undefined, me).reason === 'format', 'serveur : tableau illisible refusé');
  const big = { ...good, rows: Array.from({ length: 5000 }, (_, i) => ({ id: 'r' + i, cells: Object.fromEntries(good.columns.map(c => [c.id, 'z'.repeat(400)])) })) };
  ok(W(big, undefined, me).reason === 'size', 'serveur : tableau trop gros (> 1 500 000 caractères) refusé');
  ok(W(good, undefined, me, { active: 20, total: 20 }).reason === 'limit', 'serveur : 21e tableau refusé');
  ok(W({ ...good, deleted_at: NOW }, undefined, me, { active: 20, total: 20 }).ok, 'serveur : un tableau déjà à la corbeille ne compte pas dans les 20');
  ok(W(good, undefined, me, { active: 3, total: 60 }).reason === 'limit', 'serveur : 61 enregistrements (corbeille comprise) refusés');
  ok(W(good, { ...good, owner_id: 'u1', created_at: '2020-01-01T00:00:00.000Z' }, me, { active: 20, total: 20 }).ok, 'serveur : modifier un tableau existant reste permis au plafond');
  ok(W(good, { ...good, owner_id: 'u1', created_at: '2020-01-01T00:00:00.000Z' }, me).save.created_at === '2020-01-01T00:00:00.000Z', 'serveur : la date de création ne change pas');
  ok(W({ ...good, deleted_at: undefined }, { ...good, owner_id: 'u1', deleted_at: NOW }, me, { active: 20, total: 21 }).reason === 'limit', 'serveur : restaurer un 21e tableau refusé');
}
// le serveur câble bien ce bloc
ok(/sheets: "df_sheets"/.test(src), 'serveur : collection df_sheets déclarée');
ok(/if \(col === 'sheets'\) return q\.eq\('data->>owner_id', me\.id\)/.test(src), 'serveur : lecture limitée à SES tableaux pour l\'opérateur');
ok(/col === 'sheets' && !admin && !isOperator\(me\.role\)/.test(src), 'serveur : Comptable et Chef d\'équipe ne reçoivent aucun tableau');
ok(/cleanSheetWrite\(rec, existing/.test(src), 'serveur : chaque écriture passe par cleanSheetWrite');
ok(/if \(col === 'sheets'\) \{\n        \/\/ Tableaux : seul le propriétaire/.test(src), 'serveur : suppression réservée au propriétaire');
ok(/step\('sheets'/.test(src), 'serveur : un compte supprimé emporte ses tableaux');
ok(fs.existsSync(new URL('../supabase/migrations/20261024_create_df_sheets.sql', import.meta.url)) && /revoke all on public\.df_sheets from anon, authenticated/.test(fs.readFileSync(new URL('../supabase/migrations/20261024_create_df_sheets.sql', import.meta.url), 'utf8')), 'migration : table sans aucun accès public');
const store = fs.readFileSync(new URL('../src/db/store.ts', import.meta.url), 'utf8');
ok(/'reviews', 'sheets'\] as const/.test(store), 'site : collection « sheets » synchronisée');
console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\n${n}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
