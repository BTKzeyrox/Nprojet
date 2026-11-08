// Feuille papier imprimable et saisie groupée (module 26, M26.9). Règles pures, sans écran, sans serveur.
// Utilisé par : views/WorksheetView.tsx. Contrôlé par `npm run check:paper-sheet`.
import { PRINT_FONT, PRINT_PT } from './printFormat';

const esc = (x: unknown): string => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number): string => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const DOW_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PAPER_MAX_DAYS = 7;
export const PAPER_MAX_NAMES = 200;

export interface PaperType { name: string; measure: string; unit?: string }
/** Page HTML autonome (sans script) : une ligne par opérateur, une colonne par jour (date en tête), des cases vides à remplir au stylo.
 *  Quantité : « Qté » + « Refus » par jour ; présence : « P » (présent, en retard, demi, absent à cocher à la main) ; heures : « H ». */
export function paperSheetHtml(names: string[], type: PaperType, start: string, days: number, lang: 'fr' | 'en', company = ''): string {
  const fr = lang !== 'en';
  const nd = Math.max(1, Math.min(PAPER_MAX_DAYS, Math.floor(Number.isFinite(days) ? days : 1)));
  const s = DATE.test(start) && !isNaN(Date.parse(start + 'T00:00:00Z')) ? start : '';
  const list = names.map(n => String(n ?? '').trim()).filter(Boolean).slice(0, PAPER_MAX_NAMES);
  const dates = s ? Array.from({ length: nd }, (_, i) => addDays(s, i)) : Array.from({ length: nd }, () => '');
  const dayHead = (d: string) => d ? `${(fr ? DOW_FR : DOW_EN)[new Date(d + 'T00:00:00Z').getUTCDay()]} ${fr ? d.split('-').reverse().slice(0, 2).join('/') : d.slice(5)}` : '';
  const qty = type.measure === 'quantity', pres = type.measure === 'presence';
  const sub = qty ? [fr ? 'Qté' : 'Qty', fr ? 'Refus' : 'Rej.'] : pres ? [fr ? 'Prés.' : 'Pres.', fr ? 'Heures' : 'Hours'] : [''];
  const head1 = `<tr><th rowspan="2" class="nm">${fr ? 'Nom' : 'Name'}</th>${dates.map(d => `<th colspan="${sub.length}">${esc(dayHead(d))}</th>`).join('')}</tr>`;
  const head2 = `<tr>${dates.map(() => sub.map(x => `<th class="sub">${esc(x)}</th>`).join('')).join('')}</tr>`;
  const cells = dates.map(() => sub.map(() => '<td></td>').join('')).join('');
  const body = list.map(n => `<tr><td class="nm">${esc(n)}</td>${cells}</tr>`).join('');
  const blank = list.length === 0 ? `<tr><td class="nm">&nbsp;</td>${cells}</tr>`.repeat(10) : '';
  const title = `${fr ? 'Feuille de travail' : 'Work sheet'} : ${type.name}${type.unit && qty ? ` (${type.unit})` : ''}`;
  return `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:${PRINT_FONT};font-size:${PRINT_PT}pt;margin:0;color:#111}h1{font-size:16pt;margin:0 0 2mm}p{margin:0 0 3mm;font-size:10pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:0 2mm;height:9mm}th{background:#eee;font-size:10pt}th.sub{font-weight:normal;font-size:9pt}td.nm,th.nm{text-align:left;width:42mm}tr{page-break-inside:avoid}</style></head><body><h1>${esc(title)}</h1><p>${esc(company)}${company ? ' · ' : ''}${fr ? 'Rempli à la main, puis saisi dans « Feuille du jour ».' : 'Filled in by hand, then entered in “Daily sheet”.'}</p><table><thead>${head1}${head2}</thead><tbody>${body}${blank}</tbody></table></body></html>`;
}
export function printPaperSheet(html: string): boolean {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch { /* l'utilisateur imprimera lui-même */ } }, 300); return true;
}

// ---- Saisie groupée : appliquer une même valeur à toute la liste d'un coup ----
export type GRow = { presence?: string; hours?: string; quantity?: string; rejected?: string };
export type GroupPatch = { presence?: string; hours?: string; quantity?: string; rejected?: string };
/** Applique `patch` à chaque personne de `ids`. `onlyEmpty` (par défaut) : ne touche jamais à une case déjà remplie à la main. Renvoie une COPIE ; valeur vide ou fausse = ignorée. */
export function applyGroup(rows: Record<string, GRow>, ids: string[], patch: GroupPatch, onlyEmpty = true): Record<string, GRow> {
  const out: Record<string, GRow> = { ...rows };
  const keys = (['presence', 'hours', 'quantity', 'rejected'] as const).filter(k => typeof patch[k] === 'string' && patch[k]!.trim() !== '');
  if (!keys.length) return out;
  for (const id of ids) {
    const cur: GRow = { ...(out[id] || {}) };
    for (const k of keys) if (!onlyEmpty || !String(cur[k] ?? '').trim()) cur[k] = patch[k]!.trim();
    out[id] = cur;
  }
  return out;
}
