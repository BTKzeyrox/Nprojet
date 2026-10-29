// Un tableau → un fichier Excel « comme Excel » (module 19, M19.5) : de VRAIS types de cellules (dates, heures, nombres avec milliers, codes et téléphones en texte
// pour ne pas perdre les zéros), en-tête en gras et figé, filtres automatiques, liste déroulante pour les colonnes « liste ». La mise en page A4 / Times New Roman 12 reste celle de xlsxA4.ts.
// Partie pure (testée par `npm run check:sheet-xlsx`) : l'écriture du fichier est dans xlsxA4.ts.
import { computeSheet, isNumType, type Column, type Sheet } from './sheets';
import { isErr } from './sheetFormula';
import type { XCell, XCol, XSheet } from './xlsxA4';

export const MODEL_SPARE_ROWS = 300; // le modèle à remplir garde ses formats et ses listes sur 300 lignes vides
export const EXCEL_DATE_FMT = 'dd/mm/yyyy';
export const EXCEL_TIME_FMT = 'hh:mm';

/** Format Excel d'une colonne du site. */
export function xlsxFormatFor(col: Column): XCol | undefined {
  switch (col.type) {
    case 'date': return { numFmt: EXCEL_DATE_FMT, align: 'right' };
    case 'time': return { numFmt: EXCEL_TIME_FMT, align: 'right' };
    case 'money': return { numFmt: '#,##0.##', align: 'right' };
    case 'number': return { numFmt: '#,##0.######', align: 'right' };
    case 'code': case 'phone': case 'text': return { numFmt: '@', align: 'left' };
    case 'list': return { list: col.options || [], numFmt: '@', align: 'left' };
    case 'check': return { align: 'center' };
    default: return undefined;
  }
}
/** « 2026-10-28 » → date Excel (minuit UTC : Excel affiche le bon jour quel que soit le fuseau). Sinon null. */
export function isoToExcelDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}
/** « 09:30 » → fraction de jour (0.395833…), comme Excel range les heures. Sinon null. */
export function timeToExcel(t: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) / 1440 : null;
}

/** La feuille Excel d'un tableau : valeurs typées (formules → leur résultat), formats, filtres. `model` : seulement l'en-tête, pour remplir dans Excel puis remettre au site. */
export function toXSheet(s: Sheet, today: string, lang: 'fr' | 'en', opts: { model?: boolean } = {}): XSheet {
  const comp = computeSheet(s, today);
  const cols = comp.cols;
  const yes = lang === 'en' ? 'Yes' : 'Oui', no = lang === 'en' ? 'No' : 'Non';
  const header: XCell[] = cols.map(c => c.name);
  const body: XCell[][] = opts.model ? [] : comp.grid.map(line => line.map((v, ci): XCell => {
    const col = cols[ci];
    if (v === null) return '';
    if (isErr(v)) return v.err;
    if (col.type === 'check') return typeof v === 'boolean' ? (v ? yes : no) : String(v);
    if (col.type === 'date' && typeof v === 'string') return isoToExcelDate(v) ?? v;
    if (col.type === 'time' && typeof v === 'string') return timeToExcel(v) ?? v;
    if (isNumType(col.type) && typeof v === 'number') return v;
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
  }));
  return {
    name: s.title || 'Tableau', rows: [header, ...body], headerRows: 1, filter: true,
    cols: cols.map(xlsxFormatFor), spareRows: opts.model ? MODEL_SPARE_ROWS : 0,
  };
}
