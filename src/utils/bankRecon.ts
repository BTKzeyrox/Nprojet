// Rapprochement bancaire et Mobile Money (module 14, M14.7) : règles pures, sans écran, sans serveur, sans table. Contrôlé par `npm run check:bank-recon`.
// Idée : on lit le relevé (CSV ou Excel), on le compare aux écritures du compte (512 Banque, 514 Mobile Money ou 531 Caisse) et on montre
// ce qui correspond, ce qui est sur le relevé seulement (à saisir) et ce qui est dans les livres seulement (à vérifier). RIEN n'est écrit ici.
// Montants : Ariary entiers, positif = entrée d'argent, négatif = sortie. Dates : « AAAA-MM-JJ » (jour de Madagascar).
import { isDate, addDays, type Entry } from './accounting';
import type { Matrix } from './importRules';

export const RECON_ACCOUNTS = ['512', '514', '531'] as const;
export const RECON_LIMITS = { rows: 2000, daysTolerance: 3, maxAmount: 1_000_000_000_000 };

export interface StatementRow { line: number; date: string; label: string; amount: number; balance?: number }
export type StatementErrorCode = 'date' | 'amount' | 'cents' | 'both' | 'empty_amount';
export interface StatementError { line: number; code: StatementErrorCode }
export type StatementProblem = 'empty' | 'no_header' | 'missing_columns' | 'no_rows' | 'too_many_rows';
export interface StatementParse { problem?: StatementProblem; rows: StatementRow[]; errors: StatementError[] }

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const DATE_H = ['date', 'date operation', 'date op', 'date valeur', 'date de l operation', 'transaction date', 'booking date'];
const LABEL_H = ['libelle', 'description', 'motif', 'details', 'detail', 'operation', 'reference', 'label', 'narration', 'nature'];
const AMOUNT_H = ['montant', 'amount', 'montant ar', 'montant mga', 'valeur'];
const DEBIT_H = ['debit', 'retrait', 'sortie', 'sorties', 'withdrawal', 'debits'];
const CREDIT_H = ['credit', 'depot', 'entree', 'entrees', 'deposit', 'credits'];
const BAL_H = ['solde', 'balance', 'solde apres', 'solde ar'];

/** « 1 234 », « -1.234 », « 1234,00 », « (500) », « 500- » → nombre entier, ou une erreur. Un centime non nul est refusé (Ariary entiers). */
export function parseAmount(raw: string): { ok: true; n: number } | { ok: false; code: 'amount' | 'cents' | 'empty_amount' } {
  let s = String(raw ?? '').replace(/[  \s]/g, '').replace(/(ar|mga|ariary)$/i, '');
  if (s === '') return { ok: false, code: 'empty_amount' };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[0-9][0-9.,]*$/.test(s)) return { ok: false, code: 'amount' };
  // dernier séparateur suivi de 1 ou 2 chiffres = décimales ; sinon c'est un séparateur de milliers
  const m = /^(.*)[.,](\d{1,2})$/.exec(s);
  let intPart = s, frac = '';
  if (m) { intPart = m[1]; frac = m[2]; }
  intPart = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(intPart)) return { ok: false, code: 'amount' };
  if (frac && /[1-9]/.test(frac)) return { ok: false, code: 'cents' };
  const n = Number(intPart);
  if (!Number.isSafeInteger(n) || n > RECON_LIMITS.maxAmount) return { ok: false, code: 'amount' };
  return { ok: true, n: neg ? -n : n };
}

/** « 2026-10-05 », « 05/10/2026 », « 05-10-2026 », « 05/10/26 » → « 2026-10-05 », ou null. */
export function parseStatementDate(raw: string): string | null {
  const s = String(raw ?? '').trim().replace(/\s.*$/, ''); // l'heure éventuelle est ignorée
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y = '', mo = '', d = '';
  if (m) { y = m[1]; mo = m[2]; d = m[3]; } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (!m) return null;
    d = m[1]; mo = m[2]; y = m[3].length === 2 ? `20${m[3]}` : m[3];
  }
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isDate(iso) ? iso : null;
}

/** Lit un relevé (matrice déjà lue depuis un CSV ou un Excel). Colonnes reconnues par leur titre : date, libellé, montant (ou débit + crédit), solde (facultatif). */
export function parseStatement(m: Matrix): StatementParse {
  if (!m.length) return { problem: 'empty', rows: [], errors: [] };
  const find = (h: string[], list: string[]) => h.findIndex(x => list.includes(norm(x)));
  let hi = -1;
  for (let i = 0; i < Math.min(m.length, 15); i++) { const h = m[i]; if (find(h, DATE_H) >= 0 && (find(h, AMOUNT_H) >= 0 || (find(h, DEBIT_H) >= 0 && find(h, CREDIT_H) >= 0))) { hi = i; break; } }
  if (hi < 0) {
    const anyDate = m.slice(0, 15).some(r => find(r, DATE_H) >= 0);
    return { problem: anyDate ? 'missing_columns' : 'no_header', rows: [], errors: [] };
  }
  const h = m[hi];
  const cDate = find(h, DATE_H), cLabel = find(h, LABEL_H), cAmt = find(h, AMOUNT_H), cDeb = find(h, DEBIT_H), cCre = find(h, CREDIT_H), cBal = find(h, BAL_H);
  const body = m.slice(hi + 1);
  if (!body.length) return { problem: 'no_rows', rows: [], errors: [] };
  if (body.length > RECON_LIMITS.rows) return { problem: 'too_many_rows', rows: [], errors: [] };
  const rows: StatementRow[] = [], errors: StatementError[] = [];
  body.forEach((r, k) => {
    const line = hi + k + 2; // numéro de ligne du fichier (1 = première)
    const date = parseStatementDate(r[cDate] ?? '');
    if (!date) { errors.push({ line, code: 'date' }); return; }
    let amount = 0;
    if (cAmt >= 0 && (r[cAmt] ?? '').trim() !== '') {
      const a = parseAmount(r[cAmt]);
      if (!a.ok) { errors.push({ line, code: a.code }); return; }
      amount = a.n;
    } else if (cDeb >= 0 && cCre >= 0) {
      const dv = (r[cDeb] ?? '').trim(), cv = (r[cCre] ?? '').trim();
      if (dv && cv) { errors.push({ line, code: 'both' }); return; }
      if (!dv && !cv) { errors.push({ line, code: 'empty_amount' }); return; }
      const a = parseAmount(dv || cv);
      if (!a.ok) { errors.push({ line, code: a.code }); return; }
      amount = dv ? -Math.abs(a.n) : Math.abs(a.n); // retrait = sortie, dépôt = entrée
    } else { errors.push({ line, code: 'empty_amount' }); return; }
    if (amount === 0) { errors.push({ line, code: 'empty_amount' }); return; }
    const row: StatementRow = { line, date, label: String(cLabel >= 0 ? r[cLabel] ?? '' : '').replace(/[<>]/g, '').trim().slice(0, 200), amount };
    if (cBal >= 0 && (r[cBal] ?? '').trim() !== '') { const b = parseAmount(r[cBal]); if (b.ok) row.balance = b.n; }
    rows.push(row);
  });
  return { rows, errors };
}

export interface BookLine { entry_id: string; date: string; label: string; amount: number; number?: string }
/** Lignes des livres sur un compte : entrée d'argent = débit (+), sortie = crédit (−). Une écriture annulée et son annulation sont ignorées toutes les deux. */
export function bookLines(entries: Entry[], account: string, from?: string, to?: string): BookLine[] {
  const out: BookLine[] = [];
  for (const e of entries) {
    if (e.reversed_by || e.reversal_of) continue;
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    for (const l of e.lines) if (l.account === account) { const amount = l.debit - l.credit; if (amount !== 0) out.push({ entry_id: e.id, date: e.date, label: l.label || e.label, amount, number: e.number }); }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.entry_id < b.entry_id ? -1 : 1));
}

export interface Match { statement: StatementRow; book: BookLine; days: number }
export interface Recon {
  matched: Match[]; statementOnly: StatementRow[]; bookOnly: BookLine[];
  statementTotal: number; bookTotal: number; gap: number; // gap = relevé − livres, sur la période du relevé
  statementOnlyTotal: number; bookOnlyTotal: number;
  duplicates: number[]; // lignes du relevé qui ressemblent à une autre (même date, même montant, même libellé)
  from: string; to: string;
}
const dayDiff = (a: string, b: string) => Math.abs(Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000));

/**
 * Rapproche le relevé et les livres : même montant, dates à `tolerance` jours près (3 par défaut), la date la plus proche d'abord. Une ligne n'est utilisée qu'une seule fois.
 * Les lignes des livres hors de la période du relevé ne sont pas comptées comme « livres seulement ».
 * Toujours vrai : gap = total des lignes « relevé seulement » − total des lignes « livres seulement ».
 */
export function reconcile(statement: StatementRow[], book: BookLine[], tolerance = RECON_LIMITS.daysTolerance): Recon {
  const from = statement.reduce((m, r) => (r.date < m ? r.date : m), statement[0]?.date ?? ''), to = statement.reduce((m, r) => (r.date > m ? r.date : m), statement[0]?.date ?? '');
  const inPeriod = book.filter(b => !statement.length ? false : b.date >= from && b.date <= to);
  const near = book.filter(b => statement.length > 0 && b.date >= addDays(from, -tolerance) && b.date <= addDays(to, tolerance));
  const used = new Set<number>();
  const matched: Match[] = [], statementOnly: StatementRow[] = [];
  const order = [...statement].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));
  for (const s of order) {
    let best = -1, bd = Infinity;
    near.forEach((b, i) => { if (used.has(i) || b.amount !== s.amount) return; const d = dayDiff(b.date, s.date); if (d <= tolerance && d < bd) { best = i; bd = d; } });
    if (best >= 0) { used.add(best); matched.push({ statement: s, book: near[best], days: bd }); } else statementOnly.push(s);
  }
  // « livres seulement » : lignes de la période du relevé qui n'ont pas trouvé leur ligne de relevé
  const bookOnly = inPeriod.filter(b => !matched.some(x => x.book === b));
  const sum = (a: { amount: number }[]) => a.reduce((t, x) => t + x.amount, 0);
  const seen = new Map<string, number[]>();
  for (const s of statement) { const k = `${s.date}|${s.amount}|${s.label.toLowerCase()}`; seen.set(k, [...(seen.get(k) || []), s.line]); }
  const duplicates = [...seen.values()].filter(v => v.length > 1).flat().sort((a, b) => a - b);
  const sOnly = sum(statementOnly), bOnly = sum(bookOnly);
  return {
    matched: matched.sort((a, b) => (a.statement.date < b.statement.date ? -1 : a.statement.date > b.statement.date ? 1 : a.statement.line - b.statement.line)),
    statementOnly: statementOnly.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line)),
    bookOnly,
    statementTotal: sum(statement), bookTotal: sum(inPeriod), gap: sum(statement) - sum(inPeriod),
    statementOnlyTotal: sOnly, bookOnlyTotal: bOnly, duplicates, from, to,
  };
}

export const STATEMENT_ERROR: Record<StatementErrorCode, [string, string]> = {
  date: ['Date illisible (exemple : 05/10/2026).', 'Unreadable date (example: 05/10/2026).'],
  amount: ['Montant illisible.', 'Unreadable amount.'],
  cents: ['Montant avec centimes : les Ariary sont entiers.', 'Amount with cents: Ariary are whole numbers.'],
  both: ['Débit et crédit remplis tous les deux.', 'Both debit and credit are filled in.'],
  empty_amount: ['Montant vide ou nul.', 'Empty or zero amount.'],
};
export const STATEMENT_PROBLEM: Record<StatementProblem, [string, string]> = {
  empty: ['Le fichier est vide.', 'The file is empty.'],
  no_header: ['Je ne trouve pas la ligne de titres (il faut au moins « Date » et « Montant », ou « Débit » et « Crédit »).', 'I cannot find the header row (at least “Date” and “Amount”, or “Debit” and “Credit”, are needed).'],
  missing_columns: ['Il manque la colonne Montant (ou Débit + Crédit).', 'The Amount column (or Debit + Credit) is missing.'],
  no_rows: ['Aucune ligne sous les titres.', 'No row under the headers.'],
  too_many_rows: [`Trop de lignes (${RECON_LIMITS.rows} au maximum).`, `Too many rows (${RECON_LIMITS.rows} at most).`],
};
/** Modèle de relevé à télécharger. */
export const STATEMENT_TEMPLATE: Matrix = [['Date', 'Libellé', 'Montant', 'Solde'], ['05/10/2026', 'Virement client Acme', '1200000', '1700000'], ['07/10/2026', 'Loyer octobre', '-300000', '1400000']];
