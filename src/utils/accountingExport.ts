// Export pour le comptable (module 14, M14.8) : règles pures, sans écran, sans serveur. Contrôlé par `npm run check:accounting-export`.
// Trois tableaux standard : Journal (une ligne par ligne d'écriture), Grand livre (par compte, avec solde cumulé), Balance (par compte).
// Montants : Ariary ENTIERS, jamais de texte ni de séparateur de milliers (un tableur doit pouvoir additionner). Dates : « AAAA-MM-JJ ».
import { PLAN, accountOf, ledger, trialBalance, type Entry } from './accounting';

type Cell = string | number;
export type Rows = Cell[][];
type Lang = 'fr' | 'en';
const L = (lang: Lang) => (fr: string, en: string) => (lang === 'en' ? en : fr);
const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);
const byDate = (a: Entry, b: Entry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.number || a.id) < (b.number || b.id) ? -1 : 1);
/** Début de cellule dangereux pour un tableur (= + - @ tabulation) : on le neutralise pour qu'un libellé ne devienne jamais une formule. */
export const safeCell = (v: unknown): Cell => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
const accName = (code: string, lang: Lang) => { const a = accountOf(code); return a ? (lang === 'en' ? a.en : a.fr) : ''; };
const status = (e: Entry, lang: Lang) => (e.reversal_of ? L(lang)('annulation', 'reversal') : e.reversed_by ? L(lang)('annulée', 'reversed') : '');

/** Journal : une ligne par ligne d'écriture, dans l'ordre des dates puis des numéros ; total débit et total crédit à la fin (toujours égaux). */
export function journalRows(entries: Entry[], from?: string, to?: string, lang: Lang = 'fr'): Rows {
  const t = L(lang);
  const rows: Rows = [[t('Date', 'Date'), t('Journal', 'Journal'), t('N° écriture', 'Entry no.'), t('Pièce', 'Document'), t('Libellé', 'Label'), t('Compte', 'Account'), t('Intitulé du compte', 'Account name'), t('Débit', 'Debit'), t('Crédit', 'Credit'), t('Statut', 'Status')]];
  let d = 0, c = 0;
  for (const e of [...entries].filter(x => inRange(x.date, from, to)).sort(byDate)) {
    for (const l of e.lines) {
      rows.push([e.date, e.journal, safeCell(e.number || ''), safeCell(e.ref || ''), safeCell(l.label || e.label), l.account, safeCell(accName(l.account, lang)), l.debit, l.credit, status(e, lang)]);
      d += l.debit; c += l.credit;
    }
  }
  rows.push(['', '', '', '', t('Total', 'Total'), '', '', d, c, '']);
  return rows;
}

/** Grand livre : tous les comptes utilisés, dans l'ordre des numéros ; « solde antérieur » si la période ne commence pas au début ; solde cumulé (débit − crédit). */
export function ledgerRows(entries: Entry[], from?: string, to?: string, lang: Lang = 'fr'): Rows {
  const t = L(lang);
  const rows: Rows = [[t('Compte', 'Account'), t('Intitulé du compte', 'Account name'), t('Date', 'Date'), t('Journal', 'Journal'), t('N° écriture', 'Entry no.'), t('Pièce', 'Document'), t('Libellé', 'Label'), t('Débit', 'Debit'), t('Crédit', 'Credit'), t('Solde', 'Balance')]];
  const used = [...new Set(entries.flatMap(e => e.lines.map(l => l.account)))].sort();
  const byId = new Map(entries.map(e => [e.id, e]));
  for (const code of used) {
    const lg = ledger(entries, code, from, to);
    if (lg.rows.length === 0 && lg.opening === 0) continue;
    if (from && lg.opening !== 0) rows.push([code, safeCell(accName(code, lang)), from, '', '', '', t('Solde antérieur', 'Opening balance'), lg.opening > 0 ? lg.opening : 0, lg.opening < 0 ? -lg.opening : 0, lg.opening]);
    for (const r of lg.rows) { const e = byId.get(r.entry_id); rows.push([code, safeCell(accName(code, lang)), r.date, r.journal, safeCell(e?.number || ''), safeCell(r.ref || ''), safeCell(r.label), r.debit, r.credit, r.balance]); }
  }
  return rows;
}

/** Balance : par compte, total débit, total crédit, solde débiteur ou créditeur ; ligne de total (débits = crédits). */
export function balanceRows(entries: Entry[], from?: string, to?: string, lang: Lang = 'fr'): Rows {
  const t = L(lang);
  const tb = trialBalance(entries, from, to);
  const rows: Rows = [[t('Compte', 'Account'), t('Intitulé du compte', 'Account name'), t('Total débit', 'Total debit'), t('Total crédit', 'Total credit'), t('Solde débiteur', 'Debit balance'), t('Solde créditeur', 'Credit balance')]];
  for (const r of tb.rows) rows.push([r.account, safeCell(accName(r.account, lang)), r.debit, r.credit, r.balance_debit, r.balance_credit]);
  rows.push(['', t('Total', 'Total'), tb.debit, tb.credit, tb.rows.reduce((s, r) => s + r.balance_debit, 0), tb.rows.reduce((s, r) => s + r.balance_credit, 0)]);
  return rows;
}

/** Page « Infos » du classeur : qui, quand, quelle période, et l'avertissement sur le plan comptable. */
export function infoRows(company: string, from: string | undefined, to: string | undefined, today: string, count: number, lang: Lang = 'fr'): Rows {
  const t = L(lang);
  return [
    [t('Export comptable', 'Accounting export'), safeCell(company)],
    [t('Période', 'Period'), `${from || t('début', 'start')} → ${to || t('fin', 'end')}`],
    [t('Exporté le', 'Exported on'), today],
    [t('Nombre d\'écritures', 'Number of entries'), count],
    [t('Monnaie', 'Currency'), 'Ariary (MGA), ' + t('montants entiers', 'whole amounts')],
    [],
    [t('Le plan comptable de Gestion Pro est un plan minimal de départ : à faire valider par un expert-comptable avant tout usage officiel.', 'The Gestion Pro chart of accounts is a minimal starting plan: have an accountant validate it before any official use.')],
  ];
}

/** Nom de fichier : « journal_2026-01-01_2026-12-31 » (sans espace ni accent). */
export const exportFileName = (kind: 'journal' | 'grand-livre' | 'balance' | 'comptabilite', from: string | undefined, to: string | undefined, today: string): string =>
  `${kind}_${from || 'debut'}_${to || today}`.replace(/[^A-Za-z0-9._-]+/g, '-');

/** Les comptes du plan, pour un contrôle : chaque compte d'une ligne exportée existe dans le plan. */
export const PLAN_CODES = new Set(PLAN.map(a => a.code));
