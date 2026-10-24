// Import Excel et CSV (module 16, M16.1) : lire un fichier choisi par le responsable et le rendre en tableau de textes.
// Aucun envoi sur internet : tout se passe dans le navigateur. Les règles (aperçu, erreurs, doublons) sont dans `importRules.ts`.
import { IMPORT_LIMITS, parseCsv, type Matrix } from './importRules';

export type FileProblem = 'size' | 'type' | 'read';

/** Un nombre, une date Excel ou un texte → le texte que verrait la personne (date en AAAA-MM-JJ, nombre sans mise en forme). */
export function cellToText(cell: { t?: string; v?: unknown; w?: string; z?: unknown } | undefined, XLSX: any): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'n' && typeof cell.v === 'number') {
    try { if (cell.z && XLSX.SSF.is_date(String(cell.z))) return XLSX.SSF.format('yyyy-mm-dd', cell.v); } catch { /* on garde le nombre */ }
    return Number.isFinite(cell.v) ? String(cell.v) : '';
  }
  if (cell.t === 'd' && cell.v instanceof Date && !isNaN(cell.v.getTime())) return cell.v.toISOString().slice(0, 10);
  if (cell.t === 'b') return cell.v ? 'oui' : 'non';
  if (cell.t === 'e') return ''; // une erreur Excel (#REF!, #DIV/0!) n'est pas une donnée
  return String(cell.v);
}

/** Lit le PREMIER onglet d'un classeur Excel (.xlsx, .xls). On ne lit jamais plus que la limite + 1 (pour savoir que c'est trop gros). */
export async function matrixFromWorkbookData(data: ArrayBuffer | Uint8Array): Promise<Matrix> {
  const mod: any = await import('xlsx');
  const XLSX = mod.default ?? mod; // `SSF` (formats de date) n'est que dans l'export par défaut
  const wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, cellNF: true });
  const name = wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxRow = Math.min(range.e.r, range.s.r + IMPORT_LIMITS.rows.sheet + 1);
  const maxCol = Math.min(range.e.c, range.s.c + IMPORT_LIMITS.columns); // une colonne de trop suffit pour être refusé
  const out: Matrix = [];
  for (let r = range.s.r; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= maxCol; c++) row.push(cellToText(ws[XLSX.utils.encode_cell({ r, c })], XLSX).trim());
    if (row.some(x => x !== '')) out.push(row);
  }
  return out;
}

/** Fichier choisi → tableau de textes. `.csv` et `.txt` en UTF-8 ; `.xlsx` et `.xls` : premier onglet. */
export async function matrixFromFile(file: File): Promise<{ matrix: Matrix; problem?: undefined } | { matrix?: undefined; problem: FileProblem }> {
  if (file.size > IMPORT_LIMITS.fileBytes) return { problem: 'size' };
  const name = file.name.toLowerCase();
  try {
    if (/\.(csv|txt|tsv)$/.test(name)) return { matrix: parseCsv(await file.text()) };
    if (/\.(xlsx|xls)$/.test(name)) return { matrix: await matrixFromWorkbookData(new Uint8Array(await file.arrayBuffer())) };
  } catch { return { problem: 'read' }; }
  return { problem: 'type' };
}

/** Télécharge un CSV (ex. modèle de fichier, liste des mots de passe provisoires). */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const FILE_PROBLEM_TEXT: Record<FileProblem, { fr: string; en: string }> = {
  size: { fr: 'Fichier trop gros (5 Mo au plus).', en: 'File too big (5 MB at most).' },
  type: { fr: 'Type de fichier non pris en charge : choisissez un .xlsx, .xls ou .csv.', en: 'Unsupported file type: choose an .xlsx, .xls or .csv file.' },
  read: { fr: 'Impossible de lire ce fichier. Est-il abîmé ou protégé par un mot de passe ?', en: 'Cannot read this file. Is it damaged or password-protected?' },
};
