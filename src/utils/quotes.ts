// Règles des DEVIS (module 2, M2.9). Fonctions pures, sans écran ni serveur. Copiées dans le bloc QUOTES de supabase/functions/df-api/index.ts
// et comparées par `npm run check:quotes`. Un devis réutilise les mêmes lignes et les mêmes calculs qu'une facture (checkInvoiceDraft).
import type { Quote, QuoteStatus } from '../types';
import { addDays, checkInvoiceDraft, type InvoiceDraft, type LineDraft } from './invoices';

export const QUOTE_REF_RE = /^DV-\d{1,9}$/;
export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'refused'];
export const QUOTE_NAMES: Record<QuoteStatus | 'expired' | 'invoiced', { fr: string; en: string }> = {
  draft: { fr: 'Brouillon', en: 'Draft' }, sent: { fr: 'Envoyé', en: 'Sent' }, accepted: { fr: 'Accepté', en: 'Accepted' }, refused: { fr: 'Refusé', en: 'Refused' },
  expired: { fr: 'Expiré', en: 'Expired' }, invoiced: { fr: 'Facturé', en: 'Invoiced' },
};

export interface QuoteDraft { client_id: string; date: string; valid_until?: string; lines: LineDraft[]; note?: string; vat_enabled?: boolean; vat_rate?: number }
export type QuoteError = 'client' | 'date' | 'valid_until' | 'valid_before' | 'lines' | 'too_many_lines' | 'description' | 'qty' | 'price' | 'total';
export type QuoteResult =
  | { ok: true; clean: Pick<Quote, 'client_id' | 'date' | 'lines' | 'subtotal_ar' | 'tax_rate' | 'tax_ar' | 'total_ar' | 'note'> & { valid_until?: string } }
  | { ok: false; error: QuoteError; line?: number };

/** Vérifie un devis comme une facture : une fin de validité vide veut dire « sans limite » (elle disparaît du devis). */
export function checkQuoteDraft(d: QuoteDraft): QuoteResult {
  const until = String(d.valid_until || '').trim();
  const inv: InvoiceDraft = { client_id: d.client_id, issue_date: d.date, due_date: until || d.date, lines: d.lines, note: d.note, vat_enabled: d.vat_enabled, vat_rate: d.vat_rate };
  const v = checkInvoiceDraft(inv);
  if (!v.ok) {
    const map: Record<string, QuoteError> = { client: 'client', issue_date: 'date', due_date: 'valid_until', due_before: 'valid_before', lines: 'lines', too_many_lines: 'too_many_lines', description: 'description', qty: 'qty', price: 'price', total: 'total', note: 'total' };
    return { ok: false, error: map[v.error] || 'total', line: v.line };
  }
  const { issue_date, due_date: _due, ...rest } = v.clean;
  return { ok: true, clean: { ...rest, date: issue_date, ...(until ? { valid_until: until } : {}) } };
}

/** Numéro suivant : DV-0001, DV-0002… (le plus grand existant + 1 ; jamais deux fois le même). */
export function nextQuoteRef(quotes: Pick<Quote, 'ref'>[]): string {
  let max = 0;
  for (const q of quotes) { const m = /^DV-(\d{1,9})$/.exec(String(q.ref || '')); if (m) max = Math.max(max, Number(m[1])); }
  return `DV-${String(max + 1).padStart(4, '0')}`;
}

/** Changements d'état permis : Brouillon → Envoyé ; Envoyé → Accepté ou Refusé. Accepté et Refusé sont définitifs (un devis accepté se transforme en facture). */
export const canQuoteTransition = (q: Pick<Quote, 'status'>, to: QuoteStatus): boolean =>
  (q.status === 'draft' && to === 'sent') || (q.status === 'sent' && (to === 'accepted' || to === 'refused'));
/** Seul un brouillon ou un devis refusé se supprime ; un devis envoyé, accepté ou déjà facturé reste (il fait partie de l'histoire du client). */
export const canDeleteQuote = (q: Pick<Quote, 'status' | 'invoice_id'>): boolean => !q.invoice_id && (q.status === 'draft' || q.status === 'refused');
/** « Transformer en facture » : seulement un devis accepté qui n'a pas déjà donné une facture. */
export const canInvoiceQuote = (q: Pick<Quote, 'status' | 'invoice_id'>): boolean => q.status === 'accepted' && !q.invoice_id;
/** Expiré = envoyé, avec une fin de validité passée (le devis peut encore être accepté : c'est une simple alerte). */
export const isExpired = (q: Pick<Quote, 'status' | 'valid_until'>, today: string): boolean => q.status === 'sent' && !!q.valid_until && q.valid_until < today;
export const quoteLabel = (q: Pick<Quote, 'status' | 'invoice_id' | 'valid_until'>, today: string): keyof typeof QUOTE_NAMES => (q.invoice_id ? 'invoiced' : isExpired(q, today) ? 'expired' : q.status);

/** Lignes et dates du brouillon de facture créé à partir d'un devis accepté (même lignes, émission aujourd'hui, échéance selon les conditions de paiement). */
export function quoteToInvoiceDraft(q: Pick<Quote, 'client_id' | 'lines' | 'note' | 'ref'>, today: string, paymentDays: number): InvoiceDraft {
  return {
    client_id: q.client_id, issue_date: today, due_date: addDays(today, Math.max(0, Math.round(paymentDays || 0))),
    lines: q.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.unit_price_ar })),
    note: [`Devis ${q.ref}`, q.note].filter(Boolean).join(' — ').slice(0, 500),
  };
}
