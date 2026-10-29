// Contrôle de « remettre mon fichier Excel » dans le tableau d'une mission (module 19, M19.5). Lancer : npm run check:sheet-merge
// Dont l'aller-retour COMPLET : tableau → fichier Excel (vrais types) → relu comme le fait le site → remis dans un tableau vide = mêmes données.
import * as S from '../src/utils/sheets';
import * as M from '../src/utils/sheetMerge';
import * as X from '../src/utils/sheetXlsx';
import { workbookBuffer } from '../src/utils/xlsxA4';
import { matrixFromWorkbookData } from '../src/utils/importFile';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const good = JSON.stringify(got) === JSON.stringify(want); if (!good) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);
const NOW = '2026-10-28T09:00:00.000Z', TODAY = '2026-10-28';

const mkSheet = (): S.Sheet => {
  let sh = S.emptySheet('Suivi', NOW);
  for (const [name, type, opts] of [['Réf', 'code'], ['Date', 'date'], ['Client', 'text'], ['Montant', 'money'], ['Téléphone', 'phone'], ['Heure', 'time'], ['État', 'list', ['À faire', 'Fait']], ['Urgent', 'check']] as any[]) sh = S.addColumn(sh, name, type, NOW, opts)!;
  return sh;
};
const base = mkSheet();
const ids = base.columns.map(c => c.id);
const [cRef, cDate, cCli, cMon, cTel, cHeu, cEtat, cUrg] = ids;

// ---- conversion d'une valeur
const cv = (type: S.ColType, v: string, options?: string[]) => M.convertCell({ type, options }, v, 'fr');
eq(cv('date', '28/10/2026'), { value: '2026-10-28' }, 'valeur : date jj/mm/aaaa');
eq(cv('date', '2026-10-28'), { value: '2026-10-28' }, 'valeur : date ISO');
eq(cv('date', '28102026'), { value: '2026-10-28' }, 'valeur : date en chiffres');
eq(cv('date', 'demain'), { value: 'demain', bad: 'date' }, 'valeur : date non reconnue = gardée + signalée');
eq(cv('date', '30/02/2026').bad, 'date', 'valeur : date impossible signalée');
eq(cv('money', '1 500 000'), { value: '1500000' }, 'valeur : montant avec espaces');
eq(cv('number', '12,5'), { value: '12.5' }, 'valeur : nombre à virgule');
eq(cv('money', 'beaucoup'), { value: 'beaucoup', bad: 'number' }, 'valeur : montant non reconnu');
eq(cv('time', '9h30'), { value: '09:30' }, 'valeur : 9h30');
eq(cv('time', '09:30'), { value: '09:30' }, 'valeur : 09:30');
eq(cv('time', '25:00').bad, 'time', 'valeur : 25h signalée');
eq(cv('phone', '0341234567'), { value: '034 12 345 67' }, 'valeur : téléphone');
eq(cv('phone', '341234567'), { value: '034 12 345 67' }, 'valeur : téléphone dont Excel a mangé le 0 du début');
eq(cv('phone', '+261 34 12 345 67'), { value: '+261 34 12 345 67' }, 'valeur : téléphone international');
eq(cv('phone', '12').bad, 'phone', 'valeur : téléphone trop court signalé');
eq(cv('list', 'fait', ['À faire', 'Fait']), { value: 'Fait' }, 'valeur : liste (casse libre, valeur du site rendue)');
eq(cv('list', 'a faire', ['À faire', 'Fait']), { value: 'À faire' }, 'valeur : liste sans accent');
eq(cv('list', 'peut-être', ['À faire', 'Fait']).bad, 'list', 'valeur : pas dans la liste = gardée + signalée');
eq([cv('check', 'oui').value, cv('check', 'Yes').value, cv('check', 'x').value, cv('check', '1').value, cv('check', 'non').value, cv('check', '').value, cv('check', '0').value], ['1', '1', '1', '1', '', '', ''], 'valeur : cases à cocher oui/non');
eq(cv('text', '  Rakoto  Jean '), { value: 'Rakoto  Jean' }, 'valeur : texte (espaces autour retirés seulement)');
eq(cv('date', ''), { value: '' }, 'valeur : vide');

// ---- ajout de lignes
const head = ['réf', 'DATE', 'Client', 'montant', 'Téléphone', 'heure', 'etat', 'URGENT'];
let tg = S.addRow(base, NOW, { [cRef]: 'REF001', [cCli]: 'Déjà là' })!;
const m1 = [head, ['REF002', '21/10/2026', 'Rasoa', '250 000', '0341234567', '9h30', 'fait', 'oui'], ['', '22/10/2026', 'Rakoto', '1500,5', '034 99 888 77', '', 'À faire', '']];
const r1 = M.mergeMatrixIntoSheet(tg, m1, NOW, 'fr');
ok(!r1.fail && r1.added === 2 && r1.sheet!.rows.length === 3, 'ajout : 2 lignes ajoutées après la ligne existante (rien n\'est effacé)');
eq(r1.sheet!.rows[0].cells[cCli], 'Déjà là', 'ajout : la ligne existante est intacte');
eq(S.activeRows(r1.sheet!)[1].cells, { [cRef]: 'REF002', [cDate]: '2026-10-21', [cCli]: 'Rasoa', [cMon]: '250000', [cTel]: '034 12 345 67', [cHeu]: '09:30', [cEtat]: 'Fait', [cUrg]: '1' }, 'ajout : toutes les valeurs remises dans la forme du site');
eq(r1.matched.length, 8, 'ajout : 8 colonnes reconnues (noms sans accents ni majuscules)');
eq([r1.ignored, r1.missing, r1.problems, r1.duplicates], [[], [], [], 0], 'ajout : rien d\'ignoré, rien à corriger');
ok(S.activeRows(r1.sheet!)[2].cells[cRef] === 'REF003' || S.activeRows(r1.sheet!)[2].cells[cRef] === '', 'ajout : (code vide dans le fichier)');
eq(tg.rows.length, 1, 'ajout : le tableau d\'origine n\'est pas modifié');
ok(new Set(r1.sheet!.rows.map(r => r.id)).size === 3, 'ajout : identifiants uniques');

// colonne « code » absente du fichier : la suite est donnée
const noRef = [['Client', 'Date'], ['A', '01/10/2026'], ['B', '02/10/2026']];
const r2 = M.mergeMatrixIntoSheet(tg, noRef, NOW, 'fr');
eq(S.activeRows(r2.sheet!).map(r => r.cells[cRef]), ['REF001', 'REF002', 'REF003'], 'colonne code absente du fichier : REF002, REF003 donnés aux nouvelles lignes');
eq(r2.missing.sort(), ['Réf', 'Montant', 'Téléphone', 'Heure', 'État', 'Urgent'].sort(), 'colonnes du tableau absentes du fichier : listées');

// colonnes en trop, problèmes
const messy = [['Client', 'Commentaire inutile', 'Montant', 'Date', 'État'], ['Zo', 'x', 'abc', '99/99/2026', 'peut-être'], ['Ny', 'y', '10', '01/10/2026', 'Fait']];
const r3 = M.mergeMatrixIntoSheet(base, messy, NOW, 'fr');
eq(r3.ignored, ['Commentaire inutile'], 'problèmes : colonne inconnue ignorée et dite');
eq(r3.problems.map(p => `${p.row}:${p.column}:${p.reason}`).sort(), ['1:Date:date', '1:Montant:number', '1:État:list'], 'problèmes : numéro de ligne, colonne et raison');
eq(S.activeRows(r3.sheet!)[0].cells[cMon], 'abc', 'problèmes : la valeur d\'origine est GARDÉE (rien n\'est perdu)');
eq(r3.added, 2, 'problèmes : la ligne avec problèmes est quand même ajoutée (à corriger dans le tableau)');
ok(S.checkCell(r3.sheet!, S.activeRows(r3.sheet!)[0].id, cMon, 'abc') === 'number', 'problèmes : le tableau les souligne ensuite en rouge');

// obligatoire et unique
let ru = S.updateColumn(base, cCli, { required: true, unique: true }, NOW)!;
ru = S.addRow(ru, NOW, { [cCli]: 'Rakoto' })!;
const dup = [['Client', 'Montant'], ['rakoto', '1'], ['Rasoa', '2'], ['RASOA', '3'], ['', '4']];
const r4 = M.mergeMatrixIntoSheet(ru, dup, NOW, 'fr');
eq(r4.duplicates, 2, 'unique : 2 doublons laissés de côté (un du tableau, un du fichier lui-même)');
eq(r4.added, 2, 'unique : 2 lignes ajoutées (Rasoa et la ligne sans client)');
eq(r4.problems.map(p => `${p.row}:${p.reason}`), ['4:required'], 'obligatoire : client manquant signalé');

// limites
eq(M.mergeMatrixIntoSheet(base, [], NOW).fail, 'empty', 'limite : fichier vide');
eq(M.mergeMatrixIntoSheet(base, [['Client']], NOW).fail, 'no_rows', 'limite : en-tête seul');
eq(M.mergeMatrixIntoSheet(base, [['Truc'], ['x']], NOW).fail, 'no_match', 'limite : aucune colonne reconnue');
eq(M.mergeMatrixIntoSheet(base, [['Client'], [''], ['']], NOW).fail, 'no_rows', 'limite : lignes vides ignorées');
const full: S.Sheet = { ...base, rows: Array.from({ length: S.LIMITS.rows - 1 }, (_, i) => ({ id: 'r' + i, cells: {} })) };
const rl = M.mergeMatrixIntoSheet(full, [['Client'], ['a'], ['b'], ['c']], NOW, 'fr');
eq([rl.added, rl.truncated], [1, 2], 'limite : 5 000 lignes au plus, les lignes en trop sont comptées');
const rs = M.mergeMatrixIntoSheet(base, [['Client'], ['x'.repeat(700)]], NOW, 'fr');
eq([rs.shortened, S.activeRows(rs.sheet!)[0].cells[cCli].length], [1, 500], 'limite : texte coupé à 500 signes et dit');
const dupHead = M.mergeMatrixIntoSheet(base, [['Client', 'client'], ['a', 'b']], NOW, 'fr');
eq(S.activeRows(dupHead.sheet!)[0].cells[cCli], 'a', 'deux colonnes de même nom : la première gagne');
eq(M.mergeMatrixIntoSheet(base, [['Client'], ['a']], NOW, 'en').sheet!.rows.length, 1, 'anglais : fonctionne pareil');
ok(Object.values(M.MERGE_FAIL_TEXT).every(v => v.fr.length > 10 && v.en.length > 10) && Object.values(M.MERGE_REASON_TEXT).every(v => v.fr && v.en), 'textes des erreurs en 2 langues');

// ---- aller-retour complet par un VRAI fichier Excel
let src = base;
for (const r of [
  { [cRef]: 'REF001', [cDate]: '2026-10-20', [cCli]: 'Société Rakoto', [cMon]: '1500000', [cTel]: '034 12 345 67', [cHeu]: '09:30', [cEtat]: 'Fait', [cUrg]: '1' },
  { [cRef]: '007', [cDate]: '2026-10-21', [cCli]: 'Rasoa, "Ny"', [cMon]: '250000.5', [cTel]: '+261 34 12 345 67', [cHeu]: '23:59', [cEtat]: 'À faire' },
  { [cRef]: 'REF003', [cDate]: '2026-12-31', [cCli]: 'Été ‒ éè', [cMon]: '-12', [cHeu]: '00:00' },
]) src = S.addRow(src, NOW, r)!;
src = { ...src, id: 'dest-src' };
const buf = await workbookBuffer([X.toXSheet(src, TODAY, 'fr')]);
const matrix = await matrixFromWorkbookData(new Uint8Array(buf));
eq(matrix[0], ['Réf', 'Date', 'Client', 'Montant', 'Téléphone', 'Heure', 'État', 'Urgent'], 'aller-retour : l\'en-tête du fichier relu');
eq(matrix[1][1], '2026-10-20', 'aller-retour : la date Excel est relue en AAAA-MM-JJ');
eq([matrix[1][5], matrix[2][5], matrix[3][5]], ['09:30', '23:59', '00:00'], 'aller-retour : les heures Excel sont relues en HH:MM (et pas 30/12/1899)');
eq(matrix[2][0], '007', 'aller-retour : le code 007 garde ses zéros');
const empty = mkSheet();
// mêmes ids de colonnes que src : on remet dans un tableau vide de même forme
const back = M.mergeMatrixIntoSheet({ ...empty, columns: src.columns }, matrix, NOW, 'fr');
const strip = (s: S.Sheet) => S.activeRows(s).map(r => Object.fromEntries(Object.entries(r.cells).filter(([, v]) => v !== '')));
eq(back.problems, [], 'aller-retour : aucun problème');
eq(strip(back.sheet!), strip(src), 'aller-retour : MÊMES données qu\'au départ (dates, heures, montants, codes, téléphones, accents, guillemets)');
// le modèle (en-tête seul) : reconnu, rien à ajouter
const modelBuf = await workbookBuffer([X.toXSheet(src, TODAY, 'fr', { model: true })]);
const modelMatrix = await matrixFromWorkbookData(new Uint8Array(modelBuf));
eq(M.mergeMatrixIntoSheet(src, modelMatrix, NOW, 'fr').fail, 'no_rows', 'modèle vide remis tel quel : « aucune ligne à ajouter »');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
