// Comptabilité : règles de base et écritures automatiques (écritures à partie double). Bloc PUR : sans base de données ni réseau.
// Extrait de index.ts le 2026-11-20 (découpage de df-api, tranche 2). Le texte entre BEGIN ACCOUNTINGCORE / END ACCOUNTINGCORE et
// BEGIN ACCOUNTINGBUILD / END ACCOUNTINGBUILD est INCHANGÉ : copie mot pour mot de src/utils/accounting.ts et accountingEntries.ts,
// contrôlée par scripts/check-accounting-server.ts. Import dans index.ts : import { ACCT } from './accounting.ts'.

export const ACCT = (() => {
// BEGIN ACCOUNTINGCORE
type Journal = 'VT' | 'AC' | 'BQ' | 'CA' | 'MM' | 'PA' | 'OD';
interface Account { code: string; fr: string; en: string; kind: 'asset' | 'liability' | 'equity' | 'expense' | 'income' }
interface EntryLine { account: string; debit: number; credit: number; label?: string }
interface EntrySource { type: string; id: string } // d'où vient l'écriture : facture, avoir, paiement, dépense, paie…
interface Entry {
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

const JOURNALS: Record<Journal, [string, string]> = {
  VT: ['Ventes', 'Sales'], AC: ['Achats', 'Purchases'], BQ: ['Banque', 'Bank'], CA: ['Caisse', 'Cash'], MM: ['Mobile Money', 'Mobile Money'], PA: ['Paie', 'Payroll'], OD: ['Opérations diverses', 'Miscellaneous'],
};

/** Plan minimal de départ (à valider par un expert-comptable). Les comptes de classe 4 et 5 sont les seuls qui peuvent changer de côté (solde débiteur ou créditeur). */
const PLAN: Account[] = [
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
const accountOf = (code: string): Account | undefined => PLAN_BY_CODE.get(code);
const classOf = (code: string): number => Number(String(code)[0]);

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_LINES = 40;
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
};
const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

const totals = (lines: EntryLine[]) => ({ debit: lines.reduce((t, l) => t + (l.debit || 0), 0), credit: lines.reduce((t, l) => t + (l.credit || 0), 0) });

/**
 * Vérifie une écriture. `closedThrough` = dernier jour d'une période CLOSE (« » = aucune) : on n'écrit plus à cette date ni avant.
 * Refus : id/date/journal/libellé faux, moins de 2 lignes ou plus de 40, compte hors plan, montant non entier ou négatif ou énorme, ligne qui est à la fois débit et crédit,
 * ligne à zéro, écriture déséquilibrée, période close. Renvoie l'écriture NETTOYÉE (texte sans chevrons, lignes sans champ inconnu).
 */
function cleanEntry(raw: any, closedThrough = ''): { ok: true; entry: Entry } | { ok: false; reason: string } {
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
const entryIdFor = (source: EntrySource): string => `je-${source.type}-${source.id}`;

/** Contre-passation : même écriture, débit et crédit échangés, à la date donnée. L'originale n'est jamais modifiée (le serveur ajoute `reversed_by`). */
function reverseEntry(e: Entry, date: string, id: string): Entry {
  return {
    id, date, journal: e.journal, ref: e.ref, label: `Annulation : ${e.label}`.slice(0, 200),
    lines: e.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit, ...(l.label ? { label: l.label } : {}) })),
    ...(e.source ? { source: e.source } : {}), reversal_of: e.id,
  };
}

// ---------- Clôture d'une période (M14.6) ----------
interface CloseLogEntry { at: string; by: string; by_name: string; action: 'close' | 'reopen'; through: string; reason?: string }
/** `through` = dernier jour de la période close (« » = rien de clos). Écrit par le SERVEUR seulement (jamais par la synchro). */
interface CloseState { through: string; log: CloseLogEntry[] }
const addDays = (d: string, n: number): string => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const isMonthEnd = (d: unknown): d is string => isDate(d) && addDays(d, 1).slice(8) === '01';
/** Clôturer : jusqu'à une fin de mois, pas dans le futur, toujours plus loin que la clôture actuelle. `yearEnd` = le 31 décembre (exercice civil) : on y passe l'écriture de report à nouveau. */
function planClose(current: string, through: unknown, today: string): { ok: true; yearEnd: boolean } | { ok: false; reason: 'date' | 'future' | 'already' } {
  if (!isMonthEnd(through)) return { ok: false, reason: 'date' };
  if (through > today) return { ok: false, reason: 'future' };
  if (current && through <= current) return { ok: false, reason: 'already' };
  return { ok: true, yearEnd: through.slice(5) === '12-31' };
}
/** Rouvrir : motif de 3 caractères au moins ; `through` = nouvelle fin de clôture, plus tôt que l'actuelle (« » = tout rouvrir). */
function planReopen(current: string, through: unknown, reason: unknown): { ok: true } | { ok: false; reason: 'nothing' | 'reason' | 'date' | 'later' } {
  if (!current) return { ok: false, reason: 'nothing' };
  if (typeof reason !== 'string' || reason.replace(/[<>]/g, '').trim().length < 3) return { ok: false, reason: 'reason' };
  if (through !== '' && !isMonthEnd(through)) return { ok: false, reason: 'date' };
  if (through !== '' && (through as string) >= current) return { ok: false, reason: 'later' };
  return { ok: true };
}
/**
 * Report à nouveau : à la clôture du 31 décembre, les comptes de charges (6) et de produits (7) de l'exercice sont soldés et le résultat passe au compte 110.
 * Daté du dernier jour de l'exercice. Renvoie null s'il n'y a rien à solder (déjà fait, ou exercice vide). Le calcul tient compte des écritures de clôture déjà passées (et de leurs annulations).
 */
function closingEntry(entries: Entry[], yearStart: string, end: string, id: string): Entry | null {
  if (!isDate(yearStart) || !isDate(end)) return null;
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.date < yearStart || e.date > end) continue;
    for (const l of e.lines) { const c = classOf(l.account); if (c === 6 || c === 7) net.set(l.account, (net.get(l.account) || 0) + l.debit - l.credit); }
  }
  const lines: EntryLine[] = [];
  let result = 0;
  for (const [account, n] of [...net.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (n === 0) continue;
    lines.push(n > 0 ? { account, debit: 0, credit: n } : { account, debit: -n, credit: 0 });
    result += n;
  }
  if (lines.length === 0) return null;
  if (result > 0) lines.push({ account: '110', debit: result, credit: 0 });
  else if (result < 0) lines.push({ account: '110', debit: 0, credit: -result });
  return { id, date: end, journal: 'OD', label: `Report à nouveau : résultat de l'exercice clos le ${end}`, lines, source: { type: 'closing', id: end } };
}
// END ACCOUNTINGCORE
// BEGIN ACCOUNTINGBUILD
/** Ce dont on a besoin d'une facture, d'une ligne d'argent, d'une avance : les vrais types du site les contiennent (typage structurel). */
interface InvoiceLike { id: string; type?: string; number?: string; status: string; client?: { name?: string } | null; issue_date: string; subtotal_ar: number; tax_ar: number; total_ar: number }
interface CashLike { id: string; kind: string; category?: string; amount_ar: number; date: string; note?: string; invoice_id?: string; payment_method?: string; receipt_no?: string; client_name?: string; void_of?: string }
interface AdvanceLike { id: string; status: string; amount_ar: number; request_date: string }

/** Fiche de paie telle que le serveur la garde (table de paie) : seuls les champs utiles ici. Le NOM du salarié n'est jamais utilisé : le Comptable ne doit pas voir la paie de chacun. */
interface SlipLike {
  id: string; period_end: string;
  net: number; advance_deducted?: number;
  paid?: { at: string; method?: string } | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Compte et journal de trésorerie selon le mode de paiement écrit à la main (« espèces », « virement », « MVola »…). Vide ou inconnu = caisse (valeur par défaut, à valider). */
function cashAccountFor(method: unknown): { account: string; journal: Journal } {
  const m = norm(method);
  if (/mobile|mvola|orange|airtel|money|momo/.test(m)) return { account: '514', journal: 'MM' };
  if (/virement|banque|bank|cheque|carte|transfer|rib|swift/.test(m)) return { account: '512', journal: 'BQ' };
  return { account: '531', journal: 'CA' };
}

/** Compte de charge selon la catégorie de dépense des Finances. Catégorie inconnue = charges diverses. */
const EXPENSE_ACCOUNT: Record<string, string> = { Achats: '601', Loyer: '613', Internet: '626', Matériel: '606', Transport: '624', Autres: '658' };
const expenseAccountFor = (category: unknown): string => EXPENSE_ACCOUNT[String(category ?? '')] || '658';

type BuildResult = { ok: true; entry: Entry } | { ok: false; reason: string };
const isAmt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
const L = (account: string, debit: number, credit: number): EntryLine => ({ account, debit, credit });
const finish = (raw: Entry): BuildResult => { const r = cleanEntry(raw); return r.ok ? { ok: true, entry: r.entry } : { ok: false, reason: r.reason }; };
const SKIP = (reason: string): BuildResult => ({ ok: false, reason });

/** Facture émise : le client nous doit le total (411), on constate la vente (706) et la TVA collectée (4457). Brouillon : rien. Facture ensuite annulée : garde son écriture, l'avoir la contre-passe. */
function entryForInvoice(inv: InvoiceLike): BuildResult {
  if (inv.type === 'credit_note') return SKIP('credit_note');
  if (inv.status !== 'issued' && inv.status !== 'cancelled') return SKIP('draft');
  const { subtotal_ar: sub, tax_ar: tax, total_ar: total } = inv;
  if (!Number.isInteger(total) || total < 0) return SKIP('totals');
  if (total === 0) return SKIP('zero');
  if (!Number.isInteger(sub) || !Number.isInteger(tax) || sub < 0 || tax < 0 || sub + tax !== total) return SKIP('totals');
  const lines = [L('411', total, 0)];
  if (sub > 0) lines.push(L('706', 0, sub));
  if (tax > 0) lines.push(L('4457', 0, tax));
  return finish({ id: entryIdFor({ type: 'invoice', id: inv.id }), date: inv.issue_date, journal: 'VT', ref: inv.number, label: `Facture ${inv.number || ''} ${inv.client?.name || ''}`.trim(), lines, source: { type: 'invoice', id: inv.id } });
}

/** Avoir : exactement l'inverse de la facture qu'il annule (mêmes montants, débit et crédit échangés). */
function entryForCreditNote(inv: InvoiceLike): BuildResult {
  if (inv.type !== 'credit_note') return SKIP('not_credit_note');
  if (inv.status !== 'issued') return SKIP('draft');
  const { subtotal_ar: sub, tax_ar: tax, total_ar: total } = inv;
  if (!Number.isInteger(total) || total < 0) return SKIP('totals');
  if (total === 0) return SKIP('zero');
  if (!Number.isInteger(sub) || !Number.isInteger(tax) || sub < 0 || tax < 0 || sub + tax !== total) return SKIP('totals');
  const lines: EntryLine[] = [];
  if (sub > 0) lines.push(L('706', sub, 0));
  if (tax > 0) lines.push(L('4457', tax, 0));
  lines.push(L('411', 0, total));
  return finish({ id: entryIdFor({ type: 'credit_note', id: inv.id }), date: inv.issue_date, journal: 'VT', ref: inv.number, label: `Avoir ${inv.number || ''} ${inv.client?.name || ''}`.trim(), lines, source: { type: 'credit_note', id: inv.id } });
}

/** Ligne d'argent des Finances : entrée (paiement d'une facture → solde du client ; paiement client sans facture → client ; autre entrée → produits divers) ou dépense (charge selon la catégorie). */
function entryForCash(c: CashLike): BuildResult {
  if (!isAmt(c.amount_ar)) return SKIP('amount');
  if (c.void_of) { // ligne de correction d'un paiement annulé (M23.3c) : écriture INVERSE du reçu (411 au débit, trésorerie au crédit), jamais une charge
    if (c.kind !== 'out') return SKIP('kind');
    const vc = cashAccountFor(c.payment_method);
    return finish({ id: entryIdFor({ type: 'receipt_void', id: c.id }), date: c.date, journal: vc.journal, label: `Annulation de paiement${c.client_name ? ` ${c.client_name}` : ''}`.trim(), lines: [L('411', c.amount_ar, 0), L(vc.account, 0, c.amount_ar)], source: { type: 'receipt_void', id: c.id } });
  }
  const cash = cashAccountFor(c.payment_method);
  if (c.kind === 'in') {
    const credit = c.invoice_id || c.category === 'Paiement client' ? '411' : '758';
    return finish({ id: entryIdFor({ type: 'receipt', id: c.id }), date: c.date, journal: cash.journal, ref: c.receipt_no, label: `${c.invoice_id ? 'Paiement de facture' : c.category || 'Entrée'}${c.client_name ? ` ${c.client_name}` : ''}`.trim(), lines: [L(cash.account, c.amount_ar, 0), L(credit, 0, c.amount_ar)], source: { type: 'receipt', id: c.id } });
  }
  if (c.kind === 'out') {
    return finish({ id: entryIdFor({ type: 'expense', id: c.id }), date: c.date, journal: cash.journal, label: `${c.category || 'Dépense'}${c.note ? ` : ${c.note}` : ''}`, lines: [L(expenseAccountFor(c.category), c.amount_ar, 0), L(cash.account, 0, c.amount_ar)], source: { type: 'expense', id: c.id } });
  }
  return SKIP('kind');
}

/** Clôture d'une fiche de paie : charge de personnel (641) = net dû (421) + avances reprises (425). Daté du dernier jour de la période. Net et avances à zéro : rien. */
function entryForSlipClose(s: SlipLike, key: (id: string) => string = x => x): BuildResult {
  const net = Number.isInteger(s.net) && s.net > 0 ? s.net : 0, adv = Number.isInteger(s.advance_deducted) && (s.advance_deducted as number) > 0 ? (s.advance_deducted as number) : 0;
  if (net + adv === 0) return SKIP('zero');
  const lines = [L('641', net + adv, 0)];
  if (net > 0) lines.push(L('421', 0, net));
  if (adv > 0) lines.push(L('425', 0, adv));
  return finish({ id: entryIdFor({ type: 'slip_close', id: key(s.id) }), date: s.period_end, journal: 'PA', label: `Paie ${String(s.period_end).slice(0, 7)}`, lines, source: { type: 'slip_close', id: key(s.id) } });
}

/** Paiement d'une fiche de paie : on solde la dette envers le salarié (421) par la trésorerie du mode de paiement. Pas payée ou net à zéro : rien. */
function entryForSlipPaid(s: SlipLike, key: (id: string) => string = x => x): BuildResult {
  if (!s.paid || !s.paid.at) return SKIP('not_paid');
  if (!isAmt(s.net)) return SKIP('zero');
  const cash = cashAccountFor(s.paid.method);
  return finish({ id: entryIdFor({ type: 'slip_paid', id: key(s.id) }), date: s.paid.at, journal: cash.journal, label: `Paiement de la paie ${String(s.period_end).slice(0, 7)}`, lines: [L('421', s.net, 0), L(cash.account, 0, s.net)], source: { type: 'slip_paid', id: key(s.id) } });
}

/** Avance accordée (statut « approuvée ») : le salarié nous doit ce montant (425), sorti de la caisse (valeur par défaut). Elle est reprise ensuite sur la paie. En attente ou refusée : rien. */
function entryForAdvance(a: AdvanceLike, key: (id: string) => string = x => x): BuildResult {
  if (a.status !== 'approved') return SKIP('not_approved');
  if (!isAmt(a.amount_ar)) return SKIP('amount');
  return finish({ id: entryIdFor({ type: 'advance', id: key(a.id) }), date: a.request_date, journal: 'CA', label: 'Avance au personnel', lines: [L('425', a.amount_ar, 0), L('531', 0, a.amount_ar)], source: { type: 'advance', id: key(a.id) } });
}

interface Sources { invoices: InvoiceLike[]; cash: CashLike[]; slips: SlipLike[]; advances: AdvanceLike[] }
interface Built { entries: Entry[]; skipped: { type: string; id: string; reason: string }[] }
/** Les « rien à écrire » normaux (brouillon, avance en attente…) ne comptent pas comme des problèmes : ils ne sont pas dans `skipped`. */
const NORMAL_SKIPS = new Set(['draft', 'not_paid', 'not_approved', 'credit_note', 'not_credit_note']);

/** Toutes les écritures automatiques, triées par date puis identifiant (même résultat quel que soit l'ordre des pièces). `skipped` = pièces refusées (totaux incohérents, montant faux, date fausse…) à corriger. */
function buildEntries(src: Sources, key: (id: string) => string = x => x): Built {
  const out: Entry[] = [], skipped: Built['skipped'] = [];
  const add = (type: string, id: string, r: BuildResult) => { if (r.ok) out.push(r.entry); else if (!NORMAL_SKIPS.has(r.reason)) skipped.push({ type, id, reason: r.reason }); };
  for (const i of src.invoices || []) add(i.type === 'credit_note' ? 'credit_note' : 'invoice', i.id, i.type === 'credit_note' ? entryForCreditNote(i) : entryForInvoice(i));
  for (const c of src.cash || []) add('cash', c.id, entryForCash(c));
  for (const s of src.slips || []) { add('slip_close', s.id, entryForSlipClose(s, key)); add('slip_paid', s.id, entryForSlipPaid(s, key)); }
  for (const a of src.advances || []) add('advance', a.id, entryForAdvance(a, key));
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries: out, skipped };
}
// END ACCOUNTINGBUILD
return { cleanEntry, reverseEntry, buildEntries, planClose, planReopen, closingEntry, isMonthEnd, addDays };
})();
