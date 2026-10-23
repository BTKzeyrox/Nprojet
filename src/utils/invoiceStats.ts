// Chiffres de facturation pour Finances, Statistiques et le rapport du mois (module 2, M2.8). Pur : sans écran, sans serveur. Contrôlé par `npm run check:invoice-stats`.
// Les chiffres « facturé » et « à encaisser » historiques (missions validées × prix client − argent reçu) NE CHANGENT PAS : ils servent aux marges et au rapport.
// Ici on ajoute à côté ce que disent les FACTURES : émises sur la période, ce qui reste à payer dessus, ce qui est en retard, et les missions validées pas encore facturées.
import type { CashEntry, ClientContract, Invoice, PostSession } from '../types';
import type { ClientRecord } from './clients';
import { agedBalance, billableMissions, invoiceInfo, type AgedRow } from './invoices';

type Prices = Parameters<typeof billableMissions>[3];

export interface InvoiceFigures {
  issued_count: number; issued_total: number; // factures émises (non annulées, hors avoirs) dont la date d'émission est dans la période
  cancelled_total: number; // factures de la période annulées par un avoir
  to_collect: number; overdue: number; open_count: number; // reste à payer sur TOUTES les factures émises, dont en retard (à la date d'aujourd'hui)
  unbilled_count: number; unbilled_total: number; // missions validées d'un client sans facture non annulée (toutes périodes)
  collected: number; // argent reçu sur des factures, sur la période (date du paiement)
}

export interface InvoiceFigureInput {
  invoices: Invoice[]; cash: CashEntry[]; posts: PostSession[]; contracts: ClientContract[]; clients: ClientRecord[]; prices: Prices;
  today: string; range: { start: string; end: string };
}

export function invoiceFigures(i: InvoiceFigureInput): InvoiceFigures {
  const inR = (d: string) => d >= i.range.start && d <= i.range.end;
  let issued_count = 0, issued_total = 0, cancelled_total = 0, to_collect = 0, overdue = 0, open_count = 0;
  for (const inv of i.invoices) {
    if (inv.type === 'credit_note' || inv.status === 'draft') continue;
    if (inR(inv.issue_date)) {
      if (inv.status === 'cancelled') cancelled_total += inv.total_ar;
      else { issued_count++; issued_total += inv.total_ar; }
    }
    if (inv.status !== 'issued') continue;
    const info = invoiceInfo(inv, i.cash, i.today);
    if (info.balance > 0) { to_collect += info.balance; open_count++; if (info.overdue) overdue += info.balance; }
  }
  const invoiceIds = new Set(i.invoices.map(v => v.id));
  const collected = i.cash.reduce((t, e) => (e.kind === 'in' && e.invoice_id && invoiceIds.has(e.invoice_id) && inR(e.date) ? t + Math.round(e.amount_ar) : t), 0);
  let unbilled_count = 0, unbilled_total = 0;
  for (const c of i.clients) {
    for (const m of billableMissions(i.posts, i.contracts, c, i.prices, i.invoices)) { unbilled_count++; unbilled_total += m.price_ar; }
  }
  return { issued_count, issued_total, cancelled_total, to_collect, overdue, open_count, unbilled_count, unbilled_total, collected };
}

/** Lignes de l'onglet Excel « Factures » : factures et avoirs émis sur la période (les brouillons n'en font pas partie), du plus ancien au plus récent. */
export function invoiceSheetRows(invoices: Invoice[], cash: CashEntry[], today: string, range: { start: string; end: string }, clientName: (id: string) => string, label: (state: string) => string): (string | number)[][] {
  return invoices
    .filter(v => v.status !== 'draft' && v.issue_date >= range.start && v.issue_date <= range.end)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || String(a.number).localeCompare(String(b.number)))
    .map(v => { const info = invoiceInfo(v, cash, today); return [v.number || '', clientName(v.client_id), v.issue_date, v.due_date, v.type === 'credit_note' ? -v.total_ar : v.total_ar, info.paid, info.balance, label(info.state), info.days_late]; });
}

/** Lignes de l'onglet Excel « Créances » : balance âgée par client. */
export function agedSheetRows(invoices: Invoice[], cash: CashEntry[], today: string, clientName: (id: string) => string): (string | number)[][] {
  return agedBalance(invoices, cash, today).map((r: AgedRow) => [clientName(r.client_id), r.current, r.d30, r.d60, r.d90, r.d90p, r.total, r.invoices, r.oldest_days]);
}
