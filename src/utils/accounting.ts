// Comptabilité (module 14, M14.1) : règles pures, sans écran, sans serveur, sans table. Contrôlé par `npm run check:accounting`.
// Principe : écriture à PARTIE DOUBLE (total des débits = total des crédits, toujours). Une écriture validée ne se modifie jamais : on la CONTRE-PASSE.
// Tous les montants sont des Ariary ENTIERS (pas de centimes). Dates = textes « AAAA-MM-JJ » (jour de Madagascar).
// ATTENTION : le plan comptable ci-dessous est un plan MINIMAL de départ, numéroté comme le plan comptable général (classes 1 à 7).
// Il doit être VALIDÉ par un expert-comptable malgache avant tout usage officiel (voir TODO_MODULES.md, M14.0 et M14.10).
// Le bloc « BEGIN ACCOUNTINGCORE … END ACCOUNTINGCORE » a une copie exacte dans le bloc ACCOUNTING de `supabase/functions/df-api/index.ts` (au mot `export` près) : `npm run check:accounting-server` compare les deux.
// Il ne doit utiliser ni import ni constante extérieure.

// BEGIN ACCOUNTINGCORE
export type Journal = 'VT' | 'AC' | 'BQ' | 'CA' | 'MM' | 'PA' | 'OD';
export interface Account { code: string; fr: string; en: string; kind: 'asset' | 'liability' | 'equity' | 'expense' | 'income' }
export interface EntryLine { account: string; debit: number; credit: number; label?: string }
export interface EntrySource { type: string; id: string } // d'où vient l'écriture : facture, avoir, paiement, dépense, paie…
export interface Entry {
  id: string; // déterministe pour une écriture automatique : `je-<type>-<id>` (jamais de doublon)
  number?: string; // numéro d'écriture attribué par le serveur (jamais par le navigateur)
  date: string;
  journal: Journal;
  ref?: string; // numéro de la pièce (facture, reçu…)
  label: string;
  lines: EntryLine[];
  source?: EntrySource;
  reversal_of?: string; // contre-passation : identifiant de l'écriture annulée
  reversed_by?: string;
  created_by?: string; created_at?: string; updated_at?: string;
}

export const JOURNALS: Record<Journal, [string, string]> = {
  VT: ['Ventes', 'Sales'], AC: ['Achats', 'Purchases'], BQ: ['Banque', 'Bank'], CA: ['Caisse', 'Cash'], MM: ['Mobile Money', 'Mobile Money'], PA: ['Paie', 'Payroll'], OD: ['Opérations diverses', 'Miscellaneous'],
};

/** Plan minimal de départ (à valider par un expert-comptable). Les comptes de classe 4 et 5 sont les seuls qui peuvent changer de côté (solde débiteur ou créditeur). */
export const PLAN: Account[] = [
  { code: '101', fr: 'Capital', en: 'Capital', kind: 'equity' },
  { code: '110', fr: 'Report à nouveau', en: 'Retained earnings', kind: 'equity' },
  { code: '401', fr: 'Fournisseurs', en: 'Suppliers', kind: 'liability' },
  { code: '411', fr: 'Clients', en: 'Customers', kind: 'asset' },
  { code: '421', fr: 'Personnel : rémunérations dues', en: 'Staff: pay due', kind: 'liability' },
  { code: '425', fr: 'Personnel : avances et acomptes', en: 'Staff: advances', kind: 'asset' },
  { code: '4456', fr: 'TVA déductible', en: 'Deductible VAT', kind: 'asset' },
  { code: '4457', fr: 'TVA collectée', en: 'Collected VAT', kind: 'liability' },
  { code: '512', fr: 'Banque', en: 'Bank', kind: 'asset' },
  { code: '514', fr: 'Mobile Money', en: 'Mobile Money', kind: 'asset' },
  { code: '531', fr: 'Caisse', en: 'Cash on hand', kind: 'asset' },
  { code: '601', fr: 'Achats', en: 'Purchases', kind: 'expense' },
  { code: '606', fr: 'Fournitures et petit matériel', en: 'Supplies and small equipment', kind: 'expense' },
  { code: '613', fr: 'Loyers', en: 'Rent', kind: 'expense' },
  { code: '624', fr: 'Transports', en: 'Transport', kind: 'expense' },
  { code: '626', fr: 'Internet et télécommunications', en: 'Internet and telecoms', kind: 'expense' },
  { code: '641', fr: 'Rémunérations du personnel', en: 'Staff pay', kind: 'expense' },
  { code: '658', fr: 'Charges diverses', en: 'Other expenses', kind: 'expense' },
  { code: '706', fr: 'Prestations de services', en: 'Services revenue', kind: 'income' },
  { code: '758', fr: 'Produits divers', en: 'Other income', kind: 'income' },
];
const PLAN_BY_CODE = new Map(PLAN.map(a => [a.code, a]));
export const accountOf = (code: string): Account | undefined => PLAN_BY_CODE.get(code);
export const classOf = (code: string): number => Number(String(code)[0]);

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_LINES = 40;
export const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
};
const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

export const totals = (lines: EntryLine[]) => ({ debit: lines.reduce((t, l) => t + (l.debit || 0), 0), credit: lines.reduce((t, l) => t + (l.credit || 0), 0) });

/**
 * Vérifie une écriture. `closedThrough` = dernier jour d'une période CLOSE (« » = aucune) : on n'écrit plus à cette date ni avant.
 * Refus : id/date/journal/libellé faux, moins de 2 lignes ou plus de 40, compte hors plan, montant non entier ou négatif ou énorme, ligne qui est à la fois débit et crédit,
 * ligne à zéro, écriture déséquilibrée, période close. Renvoie l'écriture NETTOYÉE (texte sans chevrons, lignes sans champ inconnu).
 */
export function cleanEntry(raw: any, closedThrough = ''): { ok: true; entry: Entry } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'entry' };
  const id = clean(raw.id, 120);
  if (!id) return { ok: false, reason: 'id' };
  if (!isDate(raw.date)) return { ok: false, reason: 'date' };
  if (closedThrough && raw.date <= closedThrough) return { ok: false, reason: 'closed' };
  if (typeof raw.journal !== 'string' || !(raw.journal in JOURNALS)) return { ok: false, reason: 'journal' };
  const label = clean(raw.label, 200);
  if (!label) return { ok: false, reason: 'label' };
  if (!Array.isArray(raw.lines) || raw.lines.length < 2 || raw.lines.length > MAX_LINES) return { ok: false, reason: 'lines' };
  const lines: EntryLine[] = [];
  for (const l of raw.lines) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return { ok: false, reason: 'lines' };
    const account = typeof l.account === 'string' ? l.account : '';
    if (!PLAN_BY_CODE.has(account)) return { ok: false, reason: 'account' };
    const debit = l.debit === undefined || l.debit === null ? 0 : l.debit, credit = l.credit === undefined || l.credit === null ? 0 : l.credit;
    if (!isAmount(debit) || !isAmount(credit)) return { ok: false, reason: 'amount' };
    if ((debit > 0) === (credit > 0)) return { ok: false, reason: 'line' }; // ni les deux, ni aucun
    const line: EntryLine = { account, debit, credit };
    const ll = clean(l.label, 120);
    if (ll) line.label = ll;
    lines.push(line);
  }
  const t = totals(lines);
  if (t.debit !== t.credit) return { ok: false, reason: 'unbalanced' };
  if (t.debit > MAX_AMOUNT) return { ok: false, reason: 'amount' };
  const entry: Entry = { id, date: raw.date, journal: raw.journal as Journal, label, lines };
  const ref = clean(raw.ref, 80);
  if (ref) entry.ref = ref;
  if (raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)) {
    const st = clean(raw.source.type, 40), si = clean(raw.source.id, 120);
    if (st && si) entry.source = { type: st, id: si };
  }
  if (typeof raw.reversal_of === 'string' && raw.reversal_of) entry.reversal_of = clean(raw.reversal_of, 120);
  return { ok: true, entry };
}

/** Identifiant d'une écriture automatique : toujours le même pour la même pièce, donc jamais de doublon si on la génère deux fois. */
export const entryIdFor = (source: EntrySource): string => `je-${source.type}-${source.id}`;

/** Contre-passation : même écriture, débit et crédit échangés, à la date donnée. L'originale n'est jamais modifiée (le serveur ajoute `reversed_by`). */
export function reverseEntry(e: Entry, date: string, id: string): Entry {
  return {
    id, date, journal: e.journal, ref: e.ref, label: `Annulation : ${e.label}`.slice(0, 200),
    lines: e.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit, ...(l.label ? { label: l.label } : {}) })),
    ...(e.source ? { source: e.source } : {}), reversal_of: e.id,
  };
}
// END ACCOUNTINGCORE

// ---------- Lectures : grand livre, balance, résultat, bilan, TVA ----------
const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);
const byDate = (a: Entry, b: Entry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface LedgerRow { entry_id: string; date: string; journal: Journal; ref?: string; label: string; debit: number; credit: number; balance: number }
/** Grand livre d'un compte : toutes ses lignes, dans l'ordre des dates, avec le solde cumulé (débit − crédit). `from` : le solde de départ tient compte de ce qui précède. */
export function ledger(entries: Entry[], account: string, from?: string, to?: string): { rows: LedgerRow[]; opening: number; closing: number } {
  let opening = 0;
  const rows: LedgerRow[] = [];
  for (const e of [...entries].sort(byDate)) {
    for (const l of e.lines) {
      if (l.account !== account) continue;
      if (from && e.date < from) { opening += l.debit - l.credit; continue; }
      if (to && e.date > to) continue;
      rows.push({ entry_id: e.id, date: e.date, journal: e.journal, ref: e.ref, label: l.label || e.label, debit: l.debit, credit: l.credit, balance: 0 });
    }
  }
  let run = opening;
  for (const r of rows) { run += r.debit - r.credit; r.balance = run; }
  return { rows, opening, closing: run };
}

export interface TrialRow { account: string; debit: number; credit: number; balance_debit: number; balance_credit: number }
/** Balance : par compte, total débit, total crédit, solde. La somme des débits égale celle des crédits (sinon une écriture est fausse). */
export function trialBalance(entries: Entry[], from?: string, to?: string): { rows: TrialRow[]; debit: number; credit: number; balanced: boolean } {
  const m = new Map<string, { d: number; c: number }>();
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue;
    for (const l of e.lines) { const x = m.get(l.account) || { d: 0, c: 0 }; x.d += l.debit; x.c += l.credit; m.set(l.account, x); }
  }
  const rows = [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([account, x]) => ({ account, debit: x.d, credit: x.c, balance_debit: Math.max(0, x.d - x.c), balance_credit: Math.max(0, x.c - x.d) }));
  const debit = rows.reduce((t, r) => t + r.debit, 0), credit = rows.reduce((t, r) => t + r.credit, 0);
  return { rows, debit, credit, balanced: debit === credit };
}

/** Compte de résultat : produits (classe 7) moins charges (classe 6) sur la période. */
export function incomeStatement(entries: Entry[], from?: string, to?: string) {
  const tb = trialBalance(entries, from, to).rows;
  const income = tb.filter(r => classOf(r.account) === 7).map(r => ({ account: r.account, amount: r.credit - r.debit }));
  const expense = tb.filter(r => classOf(r.account) === 6).map(r => ({ account: r.account, amount: r.debit - r.credit }));
  const totalIncome = income.reduce((t, r) => t + r.amount, 0), totalExpense = expense.reduce((t, r) => t + r.amount, 0);
  return { income, expense, totalIncome, totalExpense, result: totalIncome - totalExpense };
}

/**
 * Bilan à une date : actif (soldes débiteurs des classes 2 à 5), passif (soldes créditeurs des classes 1 à 5), plus le RÉSULTAT CUMULÉ (classes 6 et 7 jusqu'à cette date).
 * Un compte de tiers ou de trésorerie dont le solde change de sens (client créditeur, banque à découvert) passe de l'autre côté.
 * Tant qu'il n'y a pas de clôture d'exercice (M14.6), le résultat est cumulé depuis le début.
 */
export function balanceSheet(entries: Entry[], asOf: string) {
  const tb = trialBalance(entries, undefined, asOf).rows;
  const assets: { account: string; amount: number }[] = [], liabilities: { account: string; amount: number }[] = [];
  for (const r of tb) {
    const c = classOf(r.account);
    if (c === 6 || c === 7) continue;
    if (r.balance_debit > 0) assets.push({ account: r.account, amount: r.balance_debit });
    if (r.balance_credit > 0) liabilities.push({ account: r.account, amount: r.balance_credit });
  }
  const result = incomeStatement(entries, undefined, asOf).result;
  const totalAssets = assets.reduce((t, r) => t + r.amount, 0);
  const totalLiabilities = liabilities.reduce((t, r) => t + r.amount, 0) + result;
  return { assets, liabilities, result, totalAssets, totalLiabilities, balanced: totalAssets === totalLiabilities };
}

/** TVA d'une période : collectée (crédit du 4457) moins déductible (débit du 4456) = à payer (négatif = crédit de TVA). */
export function vatSummary(entries: Entry[], from?: string, to?: string) {
  const tb = trialBalance(entries, from, to).rows;
  const get = (code: string) => tb.find(r => r.account === code);
  const collected = (get('4457')?.credit || 0) - (get('4457')?.debit || 0);
  const deductible = (get('4456')?.debit || 0) - (get('4456')?.credit || 0);
  return { collected, deductible, due: collected - deductible };
}

/** Exercice (année civile par défaut) qui contient une date : { start, end }. `startMonth` 1 à 12 (1 = janvier). */
export function fiscalYearOf(date: string, startMonth = 1): { start: string; end: string } | null {
  if (!isDate(date) || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) return null;
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const startYear = m >= startMonth ? y : y - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${startYear}-${pad(startMonth)}-01`;
  const endD = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  return { start, end: endD.toISOString().slice(0, 10) };
}

export const ENTRY_REASON: Record<string, [string, string]> = {
  entry: ['Écriture illisible.', 'Unreadable entry.'], id: ['Identifiant manquant.', 'Missing identifier.'], date: ['Date incorrecte.', 'Wrong date.'],
  closed: ['Cette période est close : on ne peut plus y écrire.', 'This period is closed: you can no longer write in it.'], journal: ['Journal inconnu.', 'Unknown journal.'],
  label: ['Libellé manquant.', 'Missing label.'], lines: ['Il faut de 2 à 40 lignes.', 'Between 2 and 40 lines are required.'], account: ['Compte inconnu dans le plan comptable.', 'Account not in the chart of accounts.'],
  amount: ['Montant incorrect (entier, positif, pas énorme).', 'Wrong amount (whole, positive, not huge).'], line: ['Une ligne est soit au débit, soit au crédit, jamais les deux ni aucun.', 'A line is either debit or credit, never both nor none.'],
  unbalanced: ['Écriture déséquilibrée : débits et crédits doivent être égaux.', 'Unbalanced entry: debits and credits must be equal.'],
};
export const entryReasonText = (reason: string, lang: 'fr' | 'en' = 'fr'): string => (ENTRY_REASON[reason] || ['Écriture refusée.', 'Entry refused.'])[lang === 'en' ? 1 : 0];
