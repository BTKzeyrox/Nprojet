// Écritures AUTOMATIQUES (module 14, M14.2) : règles pures qui transforment chaque pièce du site en écriture comptable. Sans écran, sans serveur, sans table.
// Contrôlé par `npm run check:accounting-entries` (chaque total est comparé à celui des autres pages : créances, TVA, caisse).
// PRINCIPES : une pièce = UNE écriture, à identifiant fixe (`je-<type>-<id>`) : générer deux fois ne crée jamais de doublon. On ne modifie jamais une écriture : on la contre-passe.
// Ce qui n'est pas une pièce comptable ne donne rien : un brouillon de facture, un bon de commande (il crée déjà sa propre dépense : sinon double compte), une avance refusée ou en attente.
// Les choix ci-dessous sont les valeurs PAR DÉFAUT de M14.0 ; ils doivent être validés par BTK et un expert-comptable.
import type { CashEntry, Invoice, SalaryAdvanceRequest } from '../types';
import { cleanEntry, entryIdFor, type Entry, type EntryLine, type Journal } from './accounting';

/** Fiche de paie telle que le serveur la garde (table de paie) : seuls les champs utiles ici. */
export interface SlipLike {
  id: string; name: string; period_end: string;
  net: number; advance_deducted?: number;
  paid?: { at: string; method?: string } | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Compte et journal de trésorerie selon le mode de paiement écrit à la main (« espèces », « virement », « MVola »…). Vide ou inconnu = caisse (valeur par défaut, à valider). */
export function cashAccountFor(method: unknown): { account: string; journal: Journal } {
  const m = norm(method);
  if (/mobile|mvola|orange|airtel|money|momo/.test(m)) return { account: '514', journal: 'MM' };
  if (/virement|banque|bank|cheque|carte|transfer|rib|swift/.test(m)) return { account: '512', journal: 'BQ' };
  return { account: '531', journal: 'CA' };
}

/** Compte de charge selon la catégorie de dépense des Finances. Catégorie inconnue = charges diverses. */
export const EXPENSE_ACCOUNT: Record<string, string> = { Achats: '601', Loyer: '613', Internet: '626', Matériel: '606', Transport: '624', Autres: '658' };
export const expenseAccountFor = (category: unknown): string => EXPENSE_ACCOUNT[String(category ?? '')] || '658';

export type BuildResult = { ok: true; entry: Entry } | { ok: false; reason: string };
const isAmt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
const L = (account: string, debit: number, credit: number): EntryLine => ({ account, debit, credit });
const finish = (raw: Entry): BuildResult => { const r = cleanEntry(raw); return r.ok ? { ok: true, entry: r.entry } : { ok: false, reason: r.reason }; };
const SKIP = (reason: string): BuildResult => ({ ok: false, reason });

/** Facture émise : le client nous doit le total (411), on constate la vente (706) et la TVA collectée (4457). Brouillon : rien. Facture ensuite annulée : garde son écriture, l'avoir la contre-passe. */
export function entryForInvoice(inv: Invoice): BuildResult {
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
export function entryForCreditNote(inv: Invoice): BuildResult {
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
export function entryForCash(c: CashEntry): BuildResult {
  if (!isAmt(c.amount_ar)) return SKIP('amount');
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
export function entryForSlipClose(s: SlipLike): BuildResult {
  const net = Number.isInteger(s.net) && s.net > 0 ? s.net : 0, adv = Number.isInteger(s.advance_deducted) && (s.advance_deducted as number) > 0 ? (s.advance_deducted as number) : 0;
  if (net + adv === 0) return SKIP('zero');
  const lines = [L('641', net + adv, 0)];
  if (net > 0) lines.push(L('421', 0, net));
  if (adv > 0) lines.push(L('425', 0, adv));
  return finish({ id: entryIdFor({ type: 'slip_close', id: s.id }), date: s.period_end, journal: 'PA', label: `Paie ${s.name || ''}`.trim(), lines, source: { type: 'slip_close', id: s.id } });
}

/** Paiement d'une fiche de paie : on solde la dette envers le salarié (421) par la trésorerie du mode de paiement. Pas payée ou net à zéro : rien. */
export function entryForSlipPaid(s: SlipLike): BuildResult {
  if (!s.paid || !s.paid.at) return SKIP('not_paid');
  if (!isAmt(s.net)) return SKIP('zero');
  const cash = cashAccountFor(s.paid.method);
  return finish({ id: entryIdFor({ type: 'slip_paid', id: s.id }), date: s.paid.at, journal: cash.journal, label: `Paiement de la paie ${s.name || ''}`.trim(), lines: [L('421', s.net, 0), L(cash.account, 0, s.net)], source: { type: 'slip_paid', id: s.id } });
}

/** Avance accordée (statut « approuvée ») : le salarié nous doit ce montant (425), sorti de la caisse (valeur par défaut). Elle est reprise ensuite sur la paie. En attente ou refusée : rien. */
export function entryForAdvance(a: SalaryAdvanceRequest): BuildResult {
  if (a.status !== 'approved') return SKIP('not_approved');
  if (!isAmt(a.amount_ar)) return SKIP('amount');
  return finish({ id: entryIdFor({ type: 'advance', id: a.id }), date: a.request_date, journal: 'CA', label: `Avance ${a.employee_name || ''}`.trim(), lines: [L('425', a.amount_ar, 0), L('531', 0, a.amount_ar)], source: { type: 'advance', id: a.id } });
}

export interface Sources { invoices: Invoice[]; cash: CashEntry[]; slips: SlipLike[]; advances: SalaryAdvanceRequest[] }
export interface Built { entries: Entry[]; skipped: { type: string; id: string; reason: string }[] }
/** Les « rien à écrire » normaux (brouillon, avance en attente…) ne comptent pas comme des problèmes : ils ne sont pas dans `skipped`. */
const NORMAL_SKIPS = new Set(['draft', 'not_paid', 'not_approved', 'credit_note', 'not_credit_note']);

/** Toutes les écritures automatiques, triées par date puis identifiant (même résultat quel que soit l'ordre des pièces). `skipped` = pièces refusées (totaux incohérents, montant faux, date fausse…) à corriger. */
export function buildEntries(src: Sources): Built {
  const out: Entry[] = [], skipped: Built['skipped'] = [];
  const add = (type: string, id: string, r: BuildResult) => { if (r.ok) out.push(r.entry); else if (!NORMAL_SKIPS.has(r.reason)) skipped.push({ type, id, reason: r.reason }); };
  for (const i of src.invoices || []) add(i.type === 'credit_note' ? 'credit_note' : 'invoice', i.id, i.type === 'credit_note' ? entryForCreditNote(i) : entryForInvoice(i));
  for (const c of src.cash || []) add('cash', c.id, entryForCash(c));
  for (const s of src.slips || []) { add('slip_close', s.id, entryForSlipClose(s)); add('slip_paid', s.id, entryForSlipPaid(s)); }
  for (const a of src.advances || []) add('advance', a.id, entryForAdvance(a));
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries: out, skipped };
}
