// « Mes tableaux » : exports Excel (.xlsx), Word (.doc) et PDF (impression). Les formules sont exportées en VALEURS (ce que l'écran montre).
// La partie qui fabrique le texte est pure (testée) ; seuls `download*` et `printSheet` touchent le navigateur.
import { activeColumns, exportMatrix, type Sheet } from './sheets';
import { isoToDisplay, numberToDisplay } from './sheetAuto';
import { isErr, showVal, type Val } from './sheetFormula';
import { PRINT_FONT, PRINT_FONT_FACE, PRINT_MARGIN_MM, PRINT_PT } from './printFormat';
import { downloadWorkbook } from './xlsxA4';
import { toXSheet } from './sheetXlsx';

const esc = (x: string) => x.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const cellText = (v: Val, lang: 'fr' | 'en') => (typeof v === 'string' ? v : showVal(v, lang));
export const fileName = (title: string, ext: string, today: string): string => `${(title || 'tableau').replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().replace(/\s+/g, '_').slice(0, 50) || 'tableau'}_${today}.${ext}`;

/** Page HTML autonome (sans script) : sert au PDF (impression) et au fichier Word. */
export function sheetHtml(s: Sheet, today: string, lang: 'fr' | 'en', author: string, opts: { print?: boolean; word?: boolean } = {}): string {
  const fr = lang !== 'en', t = (a: string, b: string) => (fr ? a : b);
  const m = exportMatrix(s, today, lang);
  const date = fr ? today.split('-').reverse().join('/') : today;
  const head = `<tr>${m.header.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  // M19 : le Word et le PDF montrent les valeurs comme le tableau (date jj/mm/aaaa, montants avec milliers), pas leur forme technique
  const cols = activeColumns(s);
  const shown = (v: Parameters<typeof cellText>[0], ci: number): string => { const c = cols[ci]; if (typeof v === 'string' && c?.type === 'date') return isoToDisplay(v); if (typeof v === 'number' && c?.type === 'money') return numberToDisplay(String(v), lang); return cellText(v, lang); };
  const body = m.rows.map(r => `<tr>${r.map((v, ci) => `<td${typeof v === 'number' ? ' class="n"' : ''}>${esc(shown(v, ci))}</td>`).join('')}</tr>`).join('');
  const word = opts.word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '';
  return `<!doctype html><html lang="${fr ? 'fr' : 'en'}"${word}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title><style>${PRINT_FONT_FACE}body{font-family:${PRINT_FONT};font-size:${PRINT_PT}pt;margin:20px;color:#111}h1{font-size:20px;margin:0 0 4px}p.s{color:#555;margin:0 0 14px;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:5px 7px;font-size:${PRINT_PT}pt;text-align:left}tr{break-inside:avoid}thead{display:table-header-group}th{background:#e8edf3}td.n{text-align:right}button{margin-top:14px;padding:10px 16px;font-size:15px}@media print{button{display:none}body{margin:0}}@page{size:A4 ${m.header.length > 7 ? 'landscape' : 'portrait'};margin:${PRINT_MARGIN_MM}mm}</style></head><body><h1>${esc(s.title)}</h1><p class="s">${esc(author)} · ${esc(date)} · Gestion Pro · ${m.rows.length} ${esc(t('ligne(s)', 'row(s)'))}</p><table>${head}${body}</table>${opts.print ? `<button onclick="window.print()">${esc(t('Imprimer / enregistrer en PDF', 'Print / save as PDF'))}</button>` : ''}</body></html>`;
}

/** Lignes prêtes pour Excel : en-têtes puis valeurs (nombres restent des nombres, erreurs en texte). */
export function excelRows(s: Sheet, today: string, lang: 'fr' | 'en'): (string | number | boolean)[][] {
  const m = exportMatrix(s, today, lang);
  return [m.header, ...m.rows.map(r => r.map(v => (v === null ? '' : isErr(v) ? v.err : v)))];
}

const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
export async function downloadExcel(s: Sheet, today: string, lang: 'fr' | 'en'): Promise<void> {
  // A4, Times New Roman 12 ; un tableau de plus de 500 lignes donne plusieurs fichiers (-partie-2, …) avec les en-têtes répétés (xlsxA4.ts).
  // M19 : fichier « comme Excel » : vraies dates, nombres avec milliers, en-tête figé, filtres, listes déroulantes (sheetXlsx.ts)
  await downloadWorkbook([toXSheet(s, today, lang)], fileName(s.title, 'xlsx', today).replace(/\.xlsx$/, ''));
}
/** Modèle Excel à remplir hors du site (mêmes colonnes, mêmes listes) : on le remplit dans Excel puis on le remet au site (import). */
export async function downloadExcelModel(s: Sheet, today: string, lang: 'fr' | 'en'): Promise<void> {
  await downloadWorkbook([toXSheet(s, today, lang, { model: true })], fileName(`${s.title || 'Tableau'}-modele`, 'xlsx', today).replace(/\.xlsx$/, ''));
}
export function downloadWord(s: Sheet, today: string, lang: 'fr' | 'en', author: string): void {
  save(new Blob(['﻿', sheetHtml(s, today, lang, author, { word: true })], { type: 'application/msword' }), fileName(s.title, 'doc', today));
}
export function printSheet(s: Sheet, today: string, lang: 'fr' | 'en', author: string): boolean {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.open(); w.document.write(sheetHtml(s, today, lang, author, { print: true })); w.document.close(); return true;
}
