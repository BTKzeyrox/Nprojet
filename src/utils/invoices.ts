// Facturation : règles pures (sans écran, sans serveur). Utilisées par l'écran « Facturation » et par `npm run check:invoices`.
// Le serveur (df-api) revérifie TOUT avec les mêmes règles : il ne fait jamais confiance au navigateur, surtout pour les totaux et le numéro.
//
// Règles de calcul (écrites ici pour que BTK et un comptable puissent les relire) :
//  • total d'une ligne = quantité × prix unitaire, arrondi à l'Ar le plus proche ;
//  • sous-total = somme des totaux de lignes ; TVA = sous-total × taux ÷ 100, arrondie à l'Ar (une seule fois, sur le sous-total, pas ligne par ligne) ;
//  • total = sous-total + TVA ; sans TVA, la TVA vaut 0 ;
//  • un paiement ne peut jamais dépasser ce qui reste à payer ;
//  • « en retard » = échéance strictement dépassée ET reste à payer ; un avoir n'est jamais « en retard ».
import type { CashEntry, ClientContract, Invoice, InvoiceLine, PostSession } from '../types';
import { clientPriceWithClient } from './clientPrice';
import { matchContract, type ClientRecord } from './clients';
import { parseAmount } from './finance';
import { daysBetween } from './stats';

export const INVOICE_MAX = 100_000_000_000; // plafond d'une facture (100 milliards d'Ar) : au-delà, les calculs ne seraient plus exacts
export const MAX_LINES = 200;
export const MAX_QTY = 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Dates ----------
const isRealDate = (d: string): boolean => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const p = new Date(`${d}T00:00:00Z`);
  return !isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d;
};
/** Ajoute des jours à une date AAAA-MM-JJ (en UTC, donc sans décalage d'heure d'été). */
export const addDays = (iso: string, days: number): string => new Date(new Date(`${iso}T00:00:00Z`).getTime() + Math.round(days) * 86400000).toISOString().slice(0, 10);
/** Échéance : le délai du client s'il en a un, sinon celui de la page Conditions. Délai invalide = 0 jour. */
export function dueDate(issue: string, clientDays: number | undefined, companyDays: number | undefined): string {
  const pick = [clientDays, companyDays].find(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return addDays(issue, pick ?? 0);
}

// ---------- Numéros ----------
/** `FA-2026-0001` : préfixe, année, compteur sur 4 chiffres au moins. Le numéro est attribué par le serveur, jamais ici. */
export const formatNumber = (prefix: string, year: number, counter: number): string => `${prefix}${year}-${String(Math.max(0, Math.trunc(counter))).padStart(4, '0')}`;
export function parseNumber(num: string): { prefix: string; year: number; counter: number } | null {
  const m = /^(.*?)(\d{4})-(\d{4,})$/.exec(String(num || ''));
  return m ? { prefix: m[1], year: Number(m[2]), counter: Number(m[3]) } : null;
}

// ---------- Lignes et totaux ----------
export interface LineDraft { description: string; qty: string | number; unit_price: string | number; refs?: string[] }
export type InvoiceError = 'client' | 'issue_date' | 'due_date' | 'due_before' | 'lines' | 'too_many_lines' | 'description' | 'qty' | 'price' | 'total' | 'note';
export interface InvoiceDraft { client_id: string; issue_date: string; due_date: string; lines: LineDraft[]; note?: string; vat_enabled?: boolean; vat_rate?: number }
export type InvoiceResult =
  | { ok: true; clean: { client_id: string; issue_date: string; due_date: string; lines: InvoiceLine[]; subtotal_ar: number; tax_rate: number; tax_ar: number; total_ar: number; note: string } }
  | { ok: false; error: InvoiceError; line?: number };

export const lineTotal = (qty: number, unit: number): number => Math.round(qty * unit);

/** Sous-total, TVA et total à partir de lignes déjà vérifiées. Taux sur 2 décimales au plus ; calcul en nombres entiers (pas de dérive). */
export function invoiceTotals(lines: Pick<InvoiceLine, 'total_ar'>[], vatEnabled: boolean, vatRate: number): { subtotal_ar: number; tax_rate: number; tax_ar: number; total_ar: number } {
  const subtotal = lines.reduce((t, l) => t + l.total_ar, 0);
  const rate = vatEnabled && Number.isFinite(vatRate) ? Math.min(100, Math.max(0, round2(vatRate))) : 0;
  const tax = rate > 0 ? Math.round((subtotal * Math.round(rate * 100)) / 10000) : 0;
  return { subtotal_ar: subtotal, tax_rate: rate, tax_ar: tax, total_ar: subtotal + tax };
}

export function checkInvoiceDraft(d: InvoiceDraft): InvoiceResult {
  if (!String(d.client_id || '').trim()) return { ok: false, error: 'client' };
  if (!isRealDate(d.issue_date)) return { ok: false, error: 'issue_date' };
  if (!isRealDate(d.due_date)) return { ok: false, error: 'due_date' };
  if (d.due_date < d.issue_date) return { ok: false, error: 'due_before' };
  if (!Array.isArray(d.lines) || d.lines.length === 0) return { ok: false, error: 'lines' }; // 0 ligne : refusé
  if (d.lines.length > MAX_LINES) return { ok: false, error: 'too_many_lines' };
  const lines: InvoiceLine[] = [];
  for (let i = 0; i < d.lines.length; i++) {
    const l = d.lines[i];
    const description = String(l?.description ?? '').trim().slice(0, 200);
    if (!description) return { ok: false, error: 'description', line: i };
    const qty = round2(parseAmount(l.qty as string | number));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { ok: false, error: 'qty', line: i };
    const unitRaw = parseAmount(l.unit_price as string | number);
    if (!Number.isFinite(unitRaw) || unitRaw < 0 || unitRaw > INVOICE_MAX) return { ok: false, error: 'price', line: i };
    const unit = Math.round(unitRaw);
    const total = lineTotal(qty, unit);
    if (!Number.isFinite(total) || total > INVOICE_MAX) return { ok: false, error: 'total', line: i };
    const refs = Array.isArray(l.refs) ? [...new Set(l.refs.map(r => String(r).slice(0, 80)).filter(Boolean))].slice(0, 2000) : undefined;
    lines.push({ id: `l${i + 1}`, description, qty, unit_price_ar: unit, total_ar: total, ...(refs && refs.length ? { refs } : {}) });
  }
  const t = invoiceTotals(lines, !!d.vat_enabled, d.vat_rate ?? 0);
  if (t.total_ar <= 0 || t.total_ar > INVOICE_MAX) return { ok: false, error: 'total' }; // une facture à 0 Ar n'a pas de sens
  const note = String(d.note || '').slice(0, 500);
  return { ok: true, clean: { client_id: String(d.client_id).trim().slice(0, 80), issue_date: d.issue_date, due_date: d.due_date, lines, ...t, note } };
}

// ---------- États (calculés, jamais saisis) ----------
export type InvoiceState = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'credit_note';
export interface InvoiceInfo { state: InvoiceState; paid: number; balance: number; overdue: boolean; days_late: number }

/** Argent reçu pour une facture : les lignes « entrée » des Finances qui la citent. */
export const paidAmount = (invoiceId: string, cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id'>[]): number =>
  cash.reduce((t, e) => (e.kind === 'in' && e.invoice_id === invoiceId && Number.isFinite(e.amount_ar) && e.amount_ar > 0 ? t + Math.round(e.amount_ar) : t), 0);

export function invoiceInfo(inv: Pick<Invoice, 'id' | 'type' | 'status' | 'total_ar' | 'due_date'>, cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id'>[], today: string): InvoiceInfo {
  if (inv.type === 'credit_note') return { state: 'credit_note', paid: 0, balance: 0, overdue: false, days_late: 0 };
  if (inv.status === 'draft') return { state: 'draft', paid: 0, balance: inv.total_ar, overdue: false, days_late: 0 };
  const paid = paidAmount(inv.id, cash);
  if (inv.status === 'cancelled') return { state: 'cancelled', paid, balance: 0, overdue: false, days_late: 0 };
  const balance = Math.max(0, inv.total_ar - paid);
  if (balance === 0) return { state: 'paid', paid, balance: 0, overdue: false, days_late: 0 };
  const late = inv.due_date < today;
  const days = late ? daysBetween(inv.due_date, today) : 0;
  return { state: late ? 'overdue' : paid > 0 ? 'partial' : 'issued', paid, balance, overdue: late, days_late: days };
}

// ---------- Paiement ----------
export type PaymentError = 'not_issued' | 'amount' | 'too_much' | 'date';
export type PaymentResult = { ok: true; clean: { amount_ar: number; date: string } } | { ok: false; error: PaymentError; max?: number };

/** Un paiement n'est possible que sur une facture émise, pour un montant > 0 et jamais au-dessus de ce qui reste à payer. */
export function checkPayment(inv: Pick<Invoice, 'type' | 'status'>, info: Pick<InvoiceInfo, 'balance'>, d: { amount: string | number; date: string }): PaymentResult {
  if (inv.type === 'credit_note' || inv.status !== 'issued') return { ok: false, error: 'not_issued' };
  const amount = Math.round(parseAmount(d.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount' };
  if (amount > info.balance) return { ok: false, error: 'too_much', max: info.balance };
  if (!isRealDate(d.date)) return { ok: false, error: 'date' };
  return { ok: true, clean: { amount_ar: amount, date: d.date } };
}

// ---------- Balance âgée ----------
export type AgeBucket = 'current' | 'd30' | 'd60' | 'd90' | 'd90p';
/** Âge = jours de retard sur l'échéance : pas encore échue (current), 1 à 30, 31 à 60, 61 à 90, plus de 90. */
export const ageBucket = (daysLate: number): AgeBucket => (daysLate <= 0 ? 'current' : daysLate <= 30 ? 'd30' : daysLate <= 60 ? 'd60' : daysLate <= 90 ? 'd90' : 'd90p');
export interface AgedRow { client_id: string; current: number; d30: number; d60: number; d90: number; d90p: number; total: number; invoices: number; oldest_days: number }

/** Ce que chaque client doit encore, par âge. Seules les factures émises (ni brouillon, ni annulée, ni avoir) comptent. Triée : le plus gros retard d'abord. */
export function agedBalance(invoices: Invoice[], cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id'>[], today: string): AgedRow[] {
  const rows = new Map<string, AgedRow>();
  for (const inv of invoices) {
    if (inv.type === 'credit_note' || inv.status !== 'issued') continue;
    const info = invoiceInfo(inv, cash, today);
    if (info.balance <= 0) continue;
    const r = rows.get(inv.client_id) || { client_id: inv.client_id, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0, invoices: 0, oldest_days: 0 };
    r[ageBucket(info.days_late)] += info.balance;
    r.total += info.balance; r.invoices++; r.oldest_days = Math.max(r.oldest_days, info.days_late);
    rows.set(inv.client_id, r);
  }
  return [...rows.values()].sort((a, b) => b.oldest_days - a.oldest_days || b.total - a.total || a.client_id.localeCompare(b.client_id));
}

/** Totaux pour Finances et Statistiques : facturé = factures émises ; à encaisser = ce qui reste à payer dessus. */
export function invoiceTotalsAll(invoices: Invoice[], cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id'>[], today: string): { billed: number; to_collect: number; overdue: number; count: number } {
  let billed = 0, toCollect = 0, overdue = 0, count = 0;
  for (const inv of invoices) {
    if (inv.type === 'credit_note' || inv.status !== 'issued') continue;
    const i = invoiceInfo(inv, cash, today);
    billed += inv.total_ar; toCollect += i.balance; count++;
    if (i.overdue) overdue += i.balance;
  }
  return { billed, to_collect: toCollect, overdue, count };
}

/** Une facture émise sans aucun paiement peut être annulée par un avoir ; dès qu'elle a reçu de l'argent, non (il faut d'abord régler le paiement à la main). */
export const canCancel = (inv: Pick<Invoice, 'type' | 'status'>, info: Pick<InvoiceInfo, 'paid'>): boolean => inv.type !== 'credit_note' && inv.status === 'issued' && info.paid === 0;

// ---------- Missions à facturer ----------
export interface BillableMission { session_id: string; date: string; title: string; price_ar: number }

/** Sessions déjà citées par une facture NON annulée (brouillon compris : on ne peut pas les mettre dans deux factures). */
export function invoicedRefs(invoices: Pick<Invoice, 'status' | 'lines' | 'type'>[]): Set<string> {
  const s = new Set<string>();
  for (const inv of invoices) if (inv.type !== 'credit_note' && inv.status !== 'cancelled') for (const l of inv.lines || []) for (const r of l.refs || []) s.add(r);
  return s;
}

/** Missions validées d'un client qui ne sont dans aucune facture non annulée, au prix figé à la validation. `range` = période facultative (ex. un mois). */
export function billableMissions(
  posts: Pick<PostSession, 'id' | 'status' | 'date' | 'post_number' | 'client_name' | 'client_id' | 'client_price_ar'>[],
  contracts: Pick<ClientContract, 'post_number' | 'client_name' | 'client_id' | 'client_price_ar' | 'post_type'>[],
  client: ClientRecord,
  prices: Parameters<typeof clientPriceWithClient>[2],
  invoices: Pick<Invoice, 'status' | 'lines' | 'type'>[],
  range?: { start: string; end: string },
): BillableMission[] {
  const done = invoicedRefs(invoices);
  const out: BillableMission[] = [];
  for (const p of posts) {
    if (p.status !== 'completed' || done.has(p.id)) continue;
    if (range && (p.date < range.start || p.date > range.end)) continue;
    const contract = matchContract(p, contracts);
    if ((p.client_id || contract?.client_id) !== client.id) continue;
    const own = typeof p.client_price_ar === 'number' && Number.isFinite(p.client_price_ar) && p.client_price_ar >= 0 ? p.client_price_ar : contract?.client_price_ar;
    out.push({ session_id: p.id, date: p.date, title: (contract?.client_name || p.client_name || '').trim(), price_ar: clientPriceWithClient({ client_price_ar: own, post_type: contract?.post_type }, client, prices) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.session_id.localeCompare(b.session_id));
}

/** Propose des lignes de facture : une ligne par (titre de mission, prix) avec la quantité = nombre de sessions. Les sessions sont gardées dans `refs`. */
export function proposeLines(missions: BillableMission[]): LineDraft[] {
  const groups = new Map<string, { title: string; price: number; refs: string[] }>();
  for (const m of missions) {
    const key = `${m.title}\u0000${m.price_ar}`;
    const g = groups.get(key) || { title: m.title || '—', price: m.price_ar, refs: [] };
    g.refs.push(m.session_id);
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({ description: g.title, qty: g.refs.length, unit_price: g.price, refs: g.refs }));
}
