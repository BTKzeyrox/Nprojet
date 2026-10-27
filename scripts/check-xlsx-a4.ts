// Contrôle des fichiers Excel A4 (Times New Roman 12, un autre fichier si c'est long), sans écran ni réseau. Lancer : npm run check:xlsx-a4
import ExcelJS from 'exceljs';
import { EXCEL_FONT, EXCEL_MAX_ROWS, EXCEL_PORTRAIT_UNITS, EXCEL_PT, colUnits, buildWorkbook, fromObjects, orientationFor, partFileName, planFiles, sheetName, splitSheet, workbookBuffer, wrappedHeight, type XCell, type XSheet } from '../src/utils/xlsxA4';
import { invoiceRows, slipRows, vatRows } from '../src/utils/exportDoc';
import type { Slip } from '../src/utils/payslip';

let fails = 0;
const ok = (c: boolean, name: string) => { if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const load = async (sheets: XSheet[]) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await workbookBuffer(sheets)); return wb; };
const table = (n: number, name = 'Sessions'): XSheet => ({ name, rows: [['Date', 'Mission', 'Quantité'], ...Array.from({ length: n }, (_, i): XCell[] => [`2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, `M${i}`, i])] });
const bodyRows = (f: XSheet[][]) => f.flat().reduce((a, s) => a + s.rows.length - 1, 0);

// ---------- règles ----------
ok(EXCEL_FONT === 'Times New Roman' && EXCEL_PT === 12 && EXCEL_MAX_ROWS === 500, 'Times New Roman, 12 pt, 500 lignes au plus par fichier');
ok(sheetName('Ventes/2026: [test]?*') === 'Ventes 2026 test' && sheetName('') === 'Feuille' && sheetName('x'.repeat(50)).length === 31, 'nom de feuille accepté par Excel (caractères interdits, vide, 31 caractères)');
ok(partFileName('rapport-2026-10', 1, 1) === 'rapport-2026-10.xlsx' && partFileName('rapport-2026-10.xlsx', 2, 3) === 'rapport-2026-10-partie-2.xlsx' && partFileName('', 1, 1) === 'fichier.xlsx', 'noms de fichier : seul, ou -partie-N');
ok(orientationFor([30, 30]) === 'portrait' && orientationFor([EXCEL_PORTRAIT_UNITS, 1]) === 'landscape' && orientationFor([20, 20, 20, 20, 20]) === 'landscape', 'A4 portrait, ou paysage quand le tableau est trop large (jamais rétréci)');
{
  const u = colUnits([['Titre très long seul sur sa ligne qui ne doit pas élargir la colonne A du tout, vraiment pas'], ['Date', 'Client', 'Montant'], ['2026-10-03', 'Atelier Rivage', 5000]]);
  ok(u.length === 3 && u[0] < 20 && u[1] === 16 && u[2] === 9, 'largeurs : le titre seul ne compte pas (A < 20, Client = 16, Montant = 9)');
  ok(colUnits([['a', 'b']]).join() === '8,8', 'largeur : minimum 8');
  ok(colUnits([['a'.repeat(300), 'b']]).every(w => w <= 60), 'largeur : 60 au plus (le texte passe à la ligne)');
  ok(colUnits([['Alerte'], ['Une alerte assez longue pour la colonne unique du tableau']])[0] > 40, 'une seule colonne de texte : largeur d\'après le texte');
}
ok(wrappedHeight('x'.repeat(10), 50) === 15.75 && wrappedHeight('x'.repeat(120), 50) === 3 * 15.75, 'hauteur d\'un texte long fusionné');
{
  const f = fromObjects([{ a: 1, b: 'x' }, { b: 'y', c: { d: 1 } }, { a: null }]);
  ok(f[0].join() === 'a,b,c' && f[1].join() === '1,x,' && f[2].join() === ',y,{"d":1}' && f[3].join() === ',,', 'objets → lignes : colonnes en union, vides, objets en texte');
}

// ---------- couper quand c'est long ----------
{
  const short = splitSheet(table(10));
  ok(short.length === 1 && short[0].rows.length === 11, 'feuille courte : un seul morceau');
  const parts = splitSheet(table(1199, 'Messages'));
  ok(parts.length === 3 && parts.every(p => p.rows.length <= EXCEL_MAX_ROWS), '1 200 lignes : 3 morceaux de 500 au plus');
  ok(parts.every(p => p.rows[0].join() === 'Date,Mission,Quantité'), 'l\'en-tête est répété en haut de chaque morceau');
  ok(parts.reduce((a, p) => a + p.rows.length - 1, 0) === 1199 && parts[1].rows[1][1] === 'M499' && parts[2].rows[parts[2].rows.length - 1][1] === 'M1198', 'aucune ligne perdue, ni doublon, ordre gardé');
  ok(parts[0].name === 'Messages' && parts[1].name === 'Messages (2)' && parts[2].name === 'Messages (3)', 'noms des morceaux');
  ok(splitSheet(table(900, 'N'.repeat(40))).every(p => p.name.length <= 31), 'nom long : 31 caractères au plus même avec « (2) »');
  ok(splitSheet({ name: 'x', rows: [] }).length === 1, 'feuille vide : un morceau');
  ok(splitSheet({ name: 'x', rows: table(30).rows, headerRows: 4 }, 10).every(p => p.rows.slice(0, 4).join() === table(30).rows.slice(0, 4).join()), 'plusieurs lignes d\'en-tête répétées');
  ok(splitSheet(table(50), 1).every(p => p.rows.length <= 2), 'limite absurde (1) relevée à 2 : pas de boucle sans fin');
}
{
  const many = Array.from({ length: 10 }, (_, i) => table(79, `Feuille ${i + 1}`)); // 10 × 80 lignes = 800
  const files = planFiles(many);
  ok(files.length === 2 && files.every(f => f.reduce((a, s) => a + s.rows.length, 0) <= EXCEL_MAX_ROWS), 'beaucoup de feuilles : 2 fichiers, chacun 500 lignes au plus');
  ok(files.flat().map(s => s.name).join() === many.map(s => s.name).join() && bodyRows(files) === 790, 'toutes les feuilles, dans l\'ordre, sans perte');
  ok(planFiles([table(10)]).length === 1 && planFiles([]).length === 1, 'petit contenu ou rien : un seul fichier');
  const mix = planFiles([table(20, 'Petite'), table(1199, 'Grosse'), table(5, 'Fin')]);
  ok(mix.length >= 3 && bodyRows(mix) === 20 + 1199 + 5 && mix.every(f => f.reduce((a, s) => a + s.rows.length, 0) <= EXCEL_MAX_ROWS), 'mélange : une grosse feuille est coupée, les petites restent entières');
}

// ---------- le vrai fichier Excel, relu ----------
const slip: Slip = {
  id: 's1', pid: '2026-10', period_start: '2026-10-01', period_end: '2026-10-31', user_id: 'u1', name: 'Rakoto Jean', username: 'rakoto', phone: '',
  lines: [{ post_id: 'p1', date: '2026-10-03', client: 'Atelier Rivage', post_number: 4, score: 2500, rate: 2, amount: 5000 }], gross: 5000, bonuses: [{ id: 'b', amount: 1000, reason: 'Mission urgente', at: '' }], penalties: [], penalty_applied: 0,
  advance_due_before: 0, advance_deducted: 0, advance_carry: 0, net: 6000, paid: null, closed_at: '2026-11-01T00:00:00Z',
};
(async () => {
  const wb = await load([{ name: 'Bulletin', rows: slipRows(slip, 'fr'), headerRows: 4 }]);
  const ws = wb.getWorksheet('Bulletin')!;
  ok(!!ws && wb.worksheets.length === 1, 'fichier relu : une feuille « Bulletin »');
  ok(ws.pageSetup.paperSize === 9, 'papier A4 (code 9)');
  ok(ws.pageSetup.orientation === 'portrait' || ws.pageSetup.orientation === 'landscape', `orientation écrite : ${ws.pageSetup.orientation}`);
  ok(!ws.pageSetup.fitToPage && (ws.pageSetup.scale ?? 100) === 100, 'taille 100 % : jamais « ajuster à une page »');
  ok(ws.pageSetup.margins?.left === 0.7 && ws.pageSetup.margins?.top === 0.75, 'marges normales (0,7 po et 0,75 po)');
  ok(String(ws.headerFooter.oddFooter || '').includes('Page &P / &N') && String(ws.headerFooter.oddFooter).includes(EXCEL_FONT), 'pied de page : numéro de page en Times New Roman');
  let cells = 0, badFont = 0, numbers = 0, texts: string[] = [];
  ws.eachRow(row => row.eachCell(c => { if (c.value === null || c.value === undefined || c.value === '') return; cells++; if (c.font?.name !== EXCEL_FONT || c.font?.size !== EXCEL_PT) badFont++; if (c.type === ExcelJS.ValueType.Number) numbers++; if (typeof c.value === 'string') texts.push(c.value); }));
  ok(cells > 15 && badFont === 0, `les ${cells} cases pleines sont en Times New Roman 12`);
  ok(numbers >= 6, `les montants restent des nombres (${numbers})`);
  ok(texts.includes('Bulletin de paie') && texts.some(t => t.includes('Mission urgente')) && texts.includes('Période'), 'accents et textes gardés');
  ok(ws.getCell('A1').font?.bold === true && ws.getCell('A4').font?.bold === true, `en-têtes en gras (lignes 1 à 4) : A1=${ws.getCell('A1').font?.bold}, A4=${ws.getCell('A4').font?.bold}`);
  ok(!ws.getCell('A5').font?.bold && !ws.getCell('B5').font?.bold, `corps du tableau en police normale : A5=${ws.getCell('A5').value} gras=${ws.getCell('A5').font?.bold}`);
  ok(ws.getCell('F5').alignment?.horizontal === 'right' && ws.getCell('A5').alignment?.horizontal === 'left', 'nombres à droite, texte à gauche');
  ok(ws.getCell('A5').border?.top?.style === 'thin', 'cases du tableau encadrées');
  ok(String((ws.pageSetup as any).printTitlesRow || '') === '1:4', `en-têtes répétés à chaque page imprimée (${(ws.pageSetup as any).printTitlesRow})`);

  const inv = await load([{ name: 'Facture', rows: invoiceRows({ type: 'invoice', number: 'F-2026-001', client: { name: 'Société Aina' }, issue_date: '2026-10-01', due_date: '2026-10-31', lines: [{ description: 'Saisie de fiches', qty: 100, unit_price_ar: 500, total_ar: 50000 }], subtotal_ar: 50000, tax_rate: 20, tax_ar: 10000, total_ar: 60000 } as any, 'fr'), headerRows: 6 }]);
  ok(inv.getWorksheet('Facture')!.getCell('A1').value === 'Facture' && inv.getWorksheet('Facture')!.getCell('A7').font?.name === EXCEL_FONT, 'facture : relue en Times New Roman');
  const vat = await load([{ name: 'TVA', rows: vatRows({ months: [{ month: '2026-10', collected: 100, deductible: 40, due: 60 }], total: { collected: 100, deductible: 40, due: 60 } }, 'Oct 2026', 'fr'), headerRows: 4 }]);
  const vws = vat.getWorksheet('TVA')!;
  ok(vws.getRow(2).getCell(1).isMerged && vws.getRow(2).height! >= 15.75, 'TVA : la longue phrase d\'avertissement est fusionnée sur la largeur et passe à la ligne (jamais coupée)');

  // paysage : 10 colonnes de 20 caractères = 220 unités
  const wide = await load([{ name: 'Large', rows: [Array.from({ length: 10 }, (_, i) => `Colonne ${i}`), Array.from({ length: 10 }, () => 'x'.repeat(18))] }]);
  ok(wide.getWorksheet('Large')!.pageSetup.orientation === 'landscape', 'tableau large : A4 paysage');
  ok(wide.getWorksheet('Large')!.views?.[0]?.state === 'frozen', 'en-tête figé en haut du tableau');

  // deux feuilles de même nom, feuille vide
  const dup = await buildWorkbook([{ name: 'Stock', rows: [['a', 'b']] }, { name: 'stock', rows: [['c', 'd']] }, { name: 'Vide', rows: [] }]);
  ok(dup.worksheets.length === 3 && new Set(dup.worksheets.map(w => w.name.toLowerCase())).size === 3, 'noms en double rendus uniques, feuille vide acceptée');

  // gros tableau : fichiers relus
  const big = planFiles([table(1199, 'Messages')]);
  let rowsBack = 0, headOk = true, fontOk = true, sizeMax = 0;
  for (const f of big) {
    const b = await load(f);
    const w = b.worksheets[0];
    rowsBack += w.actualRowCount - 1;
    if (w.getCell('A1').value !== 'Date' || w.getCell('A1').font?.bold !== true) headOk = false;
    if (w.getCell('B2').font?.name !== EXCEL_FONT) fontOk = false;
    sizeMax = Math.max(sizeMax, w.actualRowCount);
  }
  ok(big.length === 3 && rowsBack === 1199 && sizeMax <= EXCEL_MAX_ROWS, `1 200 lignes : ${big.length} fichiers relus, ${rowsBack} lignes retrouvées, 500 au plus par fichier`);
  ok(headOk && fontOk, 'chaque fichier : en-tête en gras en première ligne, Times New Roman');

  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERREUR', e); process.exit(1); });
