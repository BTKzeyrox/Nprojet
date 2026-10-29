// Contrôle du fichier Excel « comme Excel » (module 19, M19.5) : on fabrique le fichier, on le RELIT avec une vraie bibliothèque Excel et on vérifie les types. Lancer : npm run check:sheet-xlsx
import ExcelJS from 'exceljs';
import * as S from '../src/utils/sheets';
import * as X from '../src/utils/sheetXlsx';
import { workbookBuffer, type XSheet } from '../src/utils/xlsxA4';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const good = JSON.stringify(got) === JSON.stringify(want); if (!good) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);
const NOW = '2026-10-28T09:00:00.000Z', TODAY = '2026-10-28';

let sh = S.emptySheet('Suivi des dossiers', NOW);
for (const [name, type, opts] of [['Réf', 'code'], ['Date', 'date'], ['Client', 'text'], ['Montant', 'money'], ['Téléphone', 'phone'], ['Heure', 'time'], ['État', 'list', ['À faire', 'Fait']], ['Urgent', 'check'], ['Poids', 'number']] as any[]) sh = S.addColumn(sh, name, type, NOW, opts)!;
const [cRef, cDate, cCli, cMon, cTel, cHeu, cEtat, cUrg, cPoids] = sh.columns.map(c => c.id);
for (const r of [
  { [cRef]: 'REF001', [cDate]: '2026-10-20', [cCli]: 'Société Rakoto', [cMon]: '1500000', [cTel]: '034 12 345 67', [cHeu]: '09:30', [cEtat]: 'Fait', [cUrg]: '1', [cPoids]: '12.5' },
  { [cRef]: '007', [cDate]: '2026-10-21', [cCli]: 'Rasoa', [cMon]: '250000.5', [cTel]: '0341234567', [cEtat]: 'À faire' },
  { [cRef]: 'REF003', [cDate]: 'pas une date', [cCli]: '=A1', [cMon]: '=D1*2', [cPoids]: '=I1+1' },
]) sh = S.addRow(sh, NOW, r)!;

// ---- fonctions pures
eq(X.isoToExcelDate('2026-10-28')?.toISOString(), '2026-10-28T00:00:00.000Z', 'date Excel : minuit UTC');
eq(X.isoToExcelDate('2026-02-30'), null, 'date Excel : 30 février refusé');
eq(X.isoToExcelDate('28/10/2026'), null, 'date Excel : seulement AAAA-MM-JJ');
eq(Math.round((X.timeToExcel('09:30') as number) * 1440), 570, 'heure Excel : 09:30 = 570 minutes');
eq(X.timeToExcel('24:00'), null, 'heure Excel : 24:00 refusé');
eq(X.xlsxFormatFor({ id: 'a', name: 'A', type: 'date' })?.numFmt, 'dd/mm/yyyy', 'format : date jj/mm/aaaa');
eq(X.xlsxFormatFor({ id: 'a', name: 'A', type: 'code' })?.numFmt, '@', 'format : code en texte');
eq(X.xlsxFormatFor({ id: 'a', name: 'A', type: 'list', options: ['x', 'y'] })?.list, ['x', 'y'], 'format : liste');

const xs: XSheet = X.toXSheet(sh, TODAY, 'fr');
eq(xs.rows[0], ['Réf', 'Date', 'Client', 'Montant', 'Téléphone', 'Heure', 'État', 'Urgent', 'Poids'], 'en-tête = noms des colonnes');
ok(xs.rows[1][1] instanceof Date && typeof xs.rows[1][3] === 'number' && typeof xs.rows[1][5] === 'number' && xs.rows[1][0] === 'REF001' && xs.rows[1][7] === 'Oui', 'valeurs : date réelle, nombre, heure en fraction, code en texte, case → Oui');
eq(xs.rows[2][0], '007', 'valeurs : un code « 007 » reste du TEXTE (zéros gardés)');
eq(xs.rows[3][1], 'pas une date', 'valeurs : une date invalide reste du texte (rien n\'est perdu)');
eq(xs.rows[3][2], 'REF001', 'valeurs : une formule est exportée avec son résultat');
eq(xs.rows[3][3], 3000000, 'valeurs : formule de montant = nombre');
eq(X.toXSheet(sh, TODAY, 'en').rows[1][7], 'Yes', 'valeurs : Yes en anglais');
const model = X.toXSheet(sh, TODAY, 'fr', { model: true });
eq([model.rows.length, model.spareRows, model.filter], [1, 300, true], 'modèle : seulement l\'en-tête, 300 lignes de formats, filtres');

// ---- le fichier, relu avec une vraie bibliothèque Excel
for (const [label, sheet, rowsExpected] of [['fichier', xs, 4], ['modèle', model, 1]] as const) {
  const buf = await workbookBuffer([sheet]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  eq(ws.actualRowCount >= rowsExpected, true, `${label} : lignes écrites`);
  const head = ws.getRow(1);
  ok(head.getCell(1).font?.bold === true && head.getCell(1).font?.name === 'Times New Roman' && head.getCell(1).font?.size === 12, `${label} : en-tête en gras, Times New Roman 12 (règle A4 conservée)`);
  ok((ws.views[0] as any)?.state === 'frozen' && (ws.views[0] as any)?.ySplit === 1, `${label} : première ligne figée`);
  const af: any = ws.autoFilter;
  ok(!!af && JSON.stringify(af).includes('A1') || JSON.stringify(af).includes('"row":1'), `${label} : filtres automatiques sur l'en-tête`);
  const dv: any = ws.getCell('G2').dataValidation;
  ok(dv && dv.type === 'list' && String(dv.formulae[0]).includes('Fait'), `${label} : liste déroulante (colonne État) avec ses choix`);
  ok(ws.getCell('G300').dataValidation?.type === 'list' || label === 'fichier', `${label} : liste déroulante jusqu'au bout du modèle`);
  ok(ws.getCell('B2').numFmt === 'dd/mm/yyyy' && ws.getCell('F2').numFmt === 'hh:mm' && ws.getCell('D2').numFmt === '#,##0.##' && ws.getCell('A2').numFmt === '@', `${label} : formats de colonne (date, heure, montant, code)`);
  if (label === 'fichier') {
    const d = ws.getCell('B2').value as Date;
    ok(d instanceof Date && d.toISOString() === '2026-10-20T00:00:00.000Z', 'fichier : la date est une VRAIE date Excel (20/10/2026)');
    eq(ws.getCell('D2').value, 1500000, 'fichier : le montant est un nombre');
    eq(ws.getCell('A3').value, '007', 'fichier : le code 007 est du texte');
    eq(ws.getCell('E2').value, '034 12 345 67', 'fichier : le téléphone est du texte');
    const tv = ws.getCell('F2').value as unknown; // la bibliothèque relit une cellule au format hh:mm comme une date du 30/12/1899 : on regarde l'heure
    ok((tv instanceof Date && tv.getUTCHours() === 9 && tv.getUTCMinutes() === 30) || (typeof tv === 'number' && Math.abs(tv - 0.3958333) < 0.0001), 'fichier : l\'heure 09:30 est une vraie heure Excel');
    eq(ws.getCell('B4').value, 'pas une date', 'fichier : la date invalide est gardée en texte');
    ok(ws.pageSetup.paperSize === 9, 'fichier : toujours A4');
    eq(ws.getCell('D2').alignment?.horizontal, 'right', 'fichier : les montants sont alignés à droite');
  }
}
// ---- les autres exports de l'appli ne changent pas (pas de filtre, pas de format)
const plain = await workbookBuffer([{ name: 'Autre', rows: [['A', 'B'], [1, 'x'], [2, 'y']] }]);
const wp = new ExcelJS.Workbook(); await wp.xlsx.load(plain);
ok(!wp.worksheets[0].autoFilter && !wp.worksheets[0].getCell('A2').numFmt || wp.worksheets[0].getCell('A2').numFmt === 'General', 'les exports sans format ne changent pas (ni filtre ni format)');
// ---- une liste trop longue pour Excel : pas de liste déroulante cassée
const long = { name: 'L', rows: [['A', 'B'], ['x', 'y']], cols: [{ list: Array.from({ length: 60 }, (_, i) => `choix numéro ${i}`) }, undefined], headerRows: 1 } as XSheet;
const wl = new ExcelJS.Workbook(); await wl.xlsx.load(await workbookBuffer([long]));
ok(!wl.worksheets[0].getCell('A2').dataValidation, 'liste trop longue pour Excel (255 signes) : pas de liste déroulante cassée');
// ---- une virgule dans un choix ne casse pas la liste
const comma = { name: 'C', rows: [['A', 'B'], ['x', 'y']], cols: [{ list: ['Oui, bien', 'Non'] }, undefined], headerRows: 1 } as XSheet;
const wc = new ExcelJS.Workbook(); await wc.xlsx.load(await workbookBuffer([comma]));
ok(String((wc.worksheets[0].getCell('A2').dataValidation as any).formulae[0]).split(',').length === 2, 'virgule dans un choix : la liste garde 2 choix');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
