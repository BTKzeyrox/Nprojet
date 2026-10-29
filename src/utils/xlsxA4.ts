// Excel au format A4 (règle de BTK) : Times New Roman 12, page A4 prête à imprimer, texte jamais rétréci.
// Si c'est long ou s'il y a beaucoup de lignes, le site fait un autre fichier (nom-partie-1.xlsx, nom-partie-2.xlsx, …) au lieu de tout faire entrer dans un seul.
// La partie qui découpe et calcule est pure (testée par `npm run check:xlsx-a4`) ; la bibliothèque `exceljs` n'est chargée qu'au clic.
// Elle remplace `xlsx` pour ÉCRIRE (xlsx gratuit ne sait écrire ni police ni mise en page) ; `xlsx` reste utilisé pour LIRE (importFile.ts).

export type XCell = string | number | boolean | Date | null | undefined;
/** Format d'une colonne (M19) : de VRAIS types Excel (date, heure, nombre avec milliers, texte pour garder les zéros) et, si besoin, une liste déroulante. Facultatif : sans lui, rien ne change. */
export interface XCol { numFmt?: string; list?: string[]; align?: 'left' | 'right' | 'center' }
export interface XSheet {
  name: string; rows: XCell[][];
  /** Nombre de lignes d'en-tête, répétées en haut de chaque page imprimée et de chaque partie (1 par défaut). */
  headerRows?: number;
  /** Un format par colonne (même ordre que les cases). */ cols?: (XCol | undefined)[];
  /** Filtres automatiques sur la ligne d'en-tête (tableaux Excel « vivants »). */ filter?: boolean;
  /** Les listes déroulantes couvrent aussi ce nombre de lignes vides en plus (modèle à remplir). */ spareRows?: number;
}

export const EXCEL_FONT = 'Times New Roman';
export const EXCEL_PT = 12;
/** Au-delà de ce nombre de lignes dans un fichier (≈ 11 pages A4), on fait un autre fichier. Un seul endroit à changer. */
export const EXCEL_MAX_ROWS = 500;
/** Largeur (en unités de colonne Excel) qui tient sur une page A4 portrait à taille normale ; au-delà, page A4 paysage. */
export const EXCEL_PORTRAIT_UNITS = 90;
const MAX_COL = 60;
const MIN_COL = 8;
const LINE_PT = 15.75; // hauteur d'une ligne de 12 pt

const empty = (v: XCell): boolean => v === '' || v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || (v instanceof Date && Number.isNaN(v.getTime()));
const filled = (r: XCell[]): number => r.filter(v => !empty(v)).length;
const textOf = (v: XCell): string => (empty(v) ? '' : v instanceof Date ? '00/00/0000' : String(v));

/** Nom de feuille accepté par Excel (31 caractères, sans \ / ? * [ ] :). */
export const sheetName = (name: string): string => (name || '').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Feuille';
const suffixName = (name: string, k: number): string => { const s = ` (${k})`; return sheetName(name).slice(0, 31 - s.length).trim() + s; };

/** Coupe une feuille trop longue en morceaux d'au plus `max` lignes ; l'en-tête est répété en haut de chaque morceau. */
export function splitSheet(sh: XSheet, max = EXCEL_MAX_ROWS): XSheet[] {
  const limit = Math.max(2, Math.floor(max));
  const rows = sh.rows.length ? sh.rows : [['']];
  const name = sheetName(sh.name);
  if (rows.length <= limit) return [{ ...sh, name, rows }];
  const h = Math.min(Math.max(0, sh.headerRows ?? 1), limit - 1);
  const head = rows.slice(0, h), body = rows.slice(h), size = limit - h;
  const out: XSheet[] = [];
  for (let i = 0, k = 1; i < body.length; i += size, k++) out.push({ ...sh, name: k === 1 ? name : suffixName(sh.name, k), rows: [...head, ...body.slice(i, i + size)] });
  return out;
}

/** Répartit les feuilles dans des fichiers de `max` lignes au plus : une feuille n'est coupée que si elle est trop longue à elle seule. */
export function planFiles(sheets: XSheet[], max = EXCEL_MAX_ROWS): XSheet[][] {
  const files: XSheet[][] = [];
  let cur: XSheet[] = [], used = 0;
  for (const chunk of sheets.flatMap(s => splitSheet(s, max))) {
    if (cur.length && used + chunk.rows.length > Math.max(2, Math.floor(max))) { files.push(cur); cur = []; used = 0; }
    cur.push(chunk); used += chunk.rows.length;
  }
  if (cur.length) files.push(cur);
  return files.length ? files : [[{ name: 'Feuille', rows: [['']] }]];
}

/** Nom du fichier : « rapport-2026-10.xlsx » s'il n'y en a qu'un, sinon « rapport-2026-10-partie-2.xlsx ». */
export function partFileName(base: string, i: number, n: number): string {
  const clean = (base || 'fichier').replace(/\.xlsx$/i, '');
  return n <= 1 ? `${clean}.xlsx` : `${clean}-partie-${i}.xlsx`;
}

/** Feuille « en tableau » : au moins une ligne a deux cases remplies. Sinon (une seule colonne de texte), toutes les lignes comptent comme tableau. */
const isTabular = (rows: XCell[][]): boolean => rows.some(r => filled(r) >= 2);
const lineLen = (v: XCell): number => Math.max(0, ...textOf(v).split('\n').map(l => l.length));

/** Largeur de chaque colonne (unités Excel) d'après le contenu, entre 8 et 60. Les titres seuls sur une ligne ne comptent pas. */
export function colUnits(rows: XCell[][]): number[] {
  const n = Math.max(1, ...rows.map(r => r.length));
  const w: number[] = Array(n).fill(0);
  const tab = isTabular(rows);
  for (const r of rows) {
    if (tab && filled(r) < 2) continue;
    r.forEach((v, i) => { const l = lineLen(v); if (l > w[i]) w[i] = l; });
  }
  return w.map(l => Math.min(MAX_COL, Math.max(MIN_COL, l + 2)));
}

export const orientationFor = (units: number[]): 'portrait' | 'landscape' => (units.reduce((a, b) => a + b, 0) > EXCEL_PORTRAIT_UNITS ? 'landscape' : 'portrait');

/** Hauteur (en points) d'une ligne de texte long fusionnée sur toute la largeur du tableau. */
export const wrappedHeight = (text: string, totalUnits: number): number => Math.max(1, Math.ceil(text.length / Math.max(1, totalUnits))) * LINE_PT;

/** Classeur Excel prêt : Times New Roman 12 partout, A4, marges normales, taille 100 % (jamais « ajuster à une page »), en-tête répété à chaque page, numéro de page. */
export async function buildWorkbook(sheets: XSheet[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestion Pro';
  wb.created = new Date();
  const taken = new Set<string>();
  for (const sh of sheets) {
    let name = sheetName(sh.name), k = 1;
    while (taken.has(name.toLowerCase())) name = suffixName(sh.name, ++k);
    taken.add(name.toLowerCase());
    const rows = sh.rows.length ? sh.rows : [['']];
    const headerRows = Math.min(Math.max(0, sh.headerRows ?? 1), rows.length);
    const units = colUnits(rows), n = units.length, total = units.reduce((a, b) => a + b, 0);
    const tab = isTabular(rows);
    const ws = wb.addWorksheet(name);
    ws.columns = units.map(width => ({ width }));
    const thin = { style: 'thin' as const, color: { argb: 'FF999999' } };
    rows.forEach((r, ri) => {
      const row = ws.getRow(ri + 1);
      const isHead = ri < headerRows;
      const tableRow = tab ? filled(r) >= 2 : filled(r) >= 1;
      for (let ci = 0; ci < n; ci++) {
        const v = r[ci];
        if (!tableRow && ci > 0) continue;
        const c = row.getCell(ci + 1);
        c.value = empty(v) ? null : (v as string | number | boolean | Date);
        c.font = { name: EXCEL_FONT, size: EXCEL_PT, bold: isHead };
        const fmt = !isHead ? sh.cols?.[ci] : undefined;
        c.alignment = { vertical: 'top', wrapText: true, horizontal: fmt?.align ?? (typeof v === 'number' || v instanceof Date ? 'right' : 'left') };
        if (fmt?.numFmt) c.numFmt = fmt.numFmt;
        if (tableRow) c.border = { top: thin, left: thin, bottom: thin, right: thin };
        if (tableRow && isHead) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      }
      // Titre ou phrase seule sur une ligne, plus longue que sa colonne : fusionnée sur la largeur du tableau, à la ligne, jamais coupée.
      if (!tableRow && n >= 2 && filled(r) === 1 && !empty(r[0]) && textOf(r[0]).length > units[0]) {
        ws.mergeCells(ri + 1, 1, ri + 1, n);
        row.height = wrappedHeight(textOf(r[0]), total);
      }
    });
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: orientationFor(units),
      fitToPage: false,
      scale: 100,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      ...(headerRows > 0 && rows.length > headerRows ? { printTitlesRow: `1:${headerRows}` } : {}),
    };
    ws.headerFooter.oddFooter = `&C&"${EXCEL_FONT},Regular"&${EXCEL_PT}Page &P / &N`;
    if (tab && headerRows > 0 && filled(rows[0]) >= 2) ws.views = [{ state: 'frozen', ySplit: headerRows }];
    // M19 : listes déroulantes (colonnes « liste »), formats de colonne vides jusqu'au bout du modèle, filtres automatiques
    if (sh.cols && headerRows > 0) {
      const last = rows.length + Math.max(0, sh.spareRows ?? 0);
      sh.cols.forEach((fmt, ci) => {
        if (!fmt || ci >= n) return;
        if (fmt.numFmt || fmt.align) for (let r = rows.length + 1; r <= last; r++) { const c = ws.getRow(r).getCell(ci + 1); if (fmt.numFmt) c.numFmt = fmt.numFmt; c.font = { name: EXCEL_FONT, size: EXCEL_PT }; }
        if (fmt.list && fmt.list.length) {
          const formula = `"${fmt.list.map(o => o.replace(/"/g, '""').replace(/,/g, ' ')).join(',')}"`;
          if (formula.length <= 255) for (let r = headerRows + 1; r <= last; r++) ws.getRow(r).getCell(ci + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Valeur', error: 'Choisis une valeur de la liste.' };
        }
      });
    }
    if (sh.filter && tab && headerRows > 0 && n >= 1) ws.autoFilter = { from: { row: headerRows, column: 1 }, to: { row: headerRows, column: n } };
  }
  return wb;
}

export async function workbookBuffer(sheets: XSheet[]): Promise<ArrayBuffer> {
  const wb = await buildWorkbook(sheets);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const saveBlob = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
};

/** Télécharge le classeur : un fichier, ou plusieurs (-partie-1, -partie-2, …) si c'est long. Renvoie le nombre de fichiers. */
export async function downloadWorkbook(sheets: XSheet[], baseName: string): Promise<number> {
  const files = planFiles(sheets);
  for (let i = 0; i < files.length; i++) {
    const buf = await workbookBuffer(files[i]);
    saveBlob(new Blob([buf], { type: XLSX_MIME }), partFileName(baseName, i + 1, files.length));
    if (i < files.length - 1) await new Promise<void>(r => { setTimeout(r, 700); }); // laisse le navigateur accepter chaque téléchargement
  }
  return files.length;
}

/** Liste d'objets → lignes (première ligne = noms des colonnes, dans l'ordre d'apparition). Les objets imbriqués deviennent du texte. */
export function fromObjects(list: Record<string, unknown>[]): XCell[][] {
  const keys: string[] = [];
  for (const o of list) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  const cell = (v: unknown): XCell => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as XCell));
  return [keys, ...list.map(o => keys.map(k => cell(o[k])))];
}
