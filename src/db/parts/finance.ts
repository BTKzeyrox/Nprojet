// Magasin de données : Finances, factures, devis et comptabilité (admin).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { checkDraft, type CashDraft } from '../../utils/finance';
import { canDeleteQuote, canQuoteTransition, checkQuoteDraft, nextQuoteRef, type QuoteDraft } from '../../utils/quotes';
import { cashEffective } from '../../utils/cashVoid';
import { checkInvoiceDraft, type InvoiceDraft } from '../../utils/invoices';
import { readCompany } from '../../utils/companyRules';
import { isMoneyRole } from '../../utils/roles';
import type { Entry, CloseState } from '../../utils/accounting';
import { CashEntry, Quote, QuoteStatus, Invoice } from '../../types';

export const financeMethods = defineMethods({
  /** Lignes d'argent (entrées et sorties). Toujours vide pour un employé : le serveur ne lui envoie rien. */
  /** Toutes les lignes de caisse, y compris les paiements annulés et leurs corrections : listes, comptabilité, sauvegardes. */
  getCash(): CashEntry[] { return [...this.cash]; },
  /** La caisse qui compte : sans les paires « paiement + correction » (M23.3a). Pour tous les chiffres, graphiques, budgets et rapports. */
  getCashNet(): CashEntry[] { return cashEffective(this.cash); },

  // Finances (responsable seulement ; le serveur revérifie chaque ligne). Les lignes partent avec la synchro habituelle.
  // En cas de refus, `error` est un code : 'admin' | 'kind' | 'amount' | 'date' | 'category' | 'missing'.
  addCash(d: CashDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const now = new Date().toISOString();
    const id = `cash-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.cash = [{ id, ...v.clean, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.cash];
    this.notify();
    return { success: true, id };
  },

  updateCash(id: string, d: CashDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const old = this.cash.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const { supplier_id: _sid, ...oldCash } = old; // un fournisseur vidé par l'admin disparaît vraiment
    this.cash = this.cash.map(x => x.id === id ? { ...oldCash, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },

  deleteCash(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.cash.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.cash = this.cash.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  },
  // Émission, paiement et avoir passent par des routes dédiées : le numéro et le reçu sont attribués par le serveur, jamais ici.
  // Codes d'erreur d'un brouillon : 'admin' | 'client' | 'issue_date' | 'due_date' | 'due_before' | 'lines' | 'too_many_lines' | 'description' | 'qty' | 'price' | 'total' | 'note' | 'missing' | 'not_draft' | 'no_client' | 'ref_used'.
  getInvoices(): Invoice[] { return [...this.invoices]; },

  saveInvoiceDraft(d: InvoiceDraft & { id?: string }): { success: boolean; error?: string; line?: number; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const company = readCompany(this.getSettings().company);
    const v = checkInvoiceDraft({ ...d, vat_enabled: company.tax.vat_enabled, vat_rate: company.tax.vat_rate });
    if (!v.ok) return { success: false, error: v.error, line: v.line };
    const client = this.clients.find(c => c.id === v.clean.client_id);
    if (!client) return { success: false, error: 'no_client' };
    const used = new Set<string>();
    for (const i of this.invoices) if (i.id !== d.id && i.type !== 'credit_note' && i.status !== 'cancelled') for (const l of i.lines) for (const r of l.refs || []) used.add(r);
    if (v.clean.lines.some(l => (l.refs || []).some(r => used.has(r)))) return { success: false, error: 'ref_used' }; // une mission ne va que dans une facture
    const now = new Date().toISOString();
    if (d.id) {
      const old = this.invoices.find(x => x.id === d.id);
      if (!old) return { success: false, error: 'missing' };
      if (old.status !== 'draft' || old.type === 'credit_note') return { success: false, error: 'not_draft' };
      this.invoices = this.invoices.map(x => x.id === d.id ? { ...x, ...v.clean, client: { name: client.name }, updated_at: now } : x);
      this.notify();
      return { success: true, id: d.id };
    }
    const id = `inv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.invoices = [{ id, type: 'invoice', status: 'draft', ...v.clean, client: { name: client.name }, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.invoices];
    this.notify();
    return { success: true, id };
  },

  deleteInvoiceDraft(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const inv = this.invoices.find(x => x.id === id);
    if (!inv) return { success: false, error: 'missing' };
    if (inv.status !== 'draft' || inv.type === 'credit_note') return { success: false, error: 'not_draft' }; // une facture émise ne se supprime jamais : on l'annule par un avoir
    this.invoices = this.invoices.filter(x => x.id !== id);
    // un devis accepté qui avait donné ce brouillon peut être transformé de nouveau
    this.quotes = this.quotes.map(q => { if (q.invoice_id !== id) return q; const { invoice_id: _i, ...rest } = q; return { ...rest, updated_at: new Date().toISOString() }; });
    this.notify();
    return { success: true };
  },

  /** Envoie d'abord les changements en attente (le serveur lit le brouillon enregistré), puis appelle la route. */
  async invoiceCall(route: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (!isMoneyRole(this.currentUser?.role)) return { ok: false, error: 'Réservé au responsable et au comptable.' };
    if (!this.demo) {
      for (let i = 0; i < 50 && this.syncing; i++) await new Promise(r => setTimeout(r, 100));
      await this.flush();
    }
    const r = await this.api(route, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.' };
    if (!this.demo) { this.since = ''; await this.pull(true); }
    return { ok: true, data: r.data };
  },
  issueInvoice(id: string) { return this.invoiceCall('invoice-issue', { id }); },
  cancelInvoice(id: string) { return this.invoiceCall('invoice-cancel', { id }); },
  // Comptabilité (M14) : le site LIT les écritures ; elles ne s'écrivent que par ces trois routes (le serveur revérifie, attribue le numéro et note tout dans le journal d'audit).
  getEntries(): Entry[] { return [...this.entries]; },
  accountingSync() { return this.invoiceCall('accounting-sync', {}); },
  postEntry(d: { date: string; journal: string; label: string; ref?: string; lines: { account: string; debit: number; credit: number }[] }) { return this.invoiceCall('accounting-post', d); },
  reverseEntryById(id: string, date: string, reason: string) { return this.invoiceCall('accounting-reverse', { id, date, reason }); },
  /** Clôture de la comptabilité : jusqu'à quel jour on ne peut plus écrire, et l'historique (clôtures et réouvertures). */
  getAcctClose(): CloseState { const c = (this.settings[0] as any)?.acct_close; return { through: typeof c?.through === 'string' ? c.through : '', log: Array.isArray(c?.log) ? c.log : [] }; },
  closeAccounting(through: string) { return this.invoiceCall('accounting-close', { action: 'close', through }); },
  reopenAccounting(through: string, reason: string) { return this.invoiceCall('accounting-close', { action: 'reopen', through, reason }); },
  payInvoice(id: string, p: { amount: number; date: string; method?: string; note?: string }) { return this.invoiceCall('invoice-pay', { id, ...p }); },
  /** Annule un paiement saisi par erreur (ligne de correction, jamais de suppression). Motif de 10 caractères au moins. Pas de bouton à l'écran avant M23.3c. */
  voidInvoicePayment(id: string, paymentId: string, reason: string) { return this.invoiceCall('invoice-void-payment', { id, payment_id: paymentId, reason }); },

  // Devis (module 2, M2.9 ; admin et Comptable, comme les factures ; le serveur revérifie chaque devis). Codes d'erreur : 'admin' | 'no_client' | 'missing' | 'status' | 'invoiced' | + ceux de checkQuoteDraft.
  // Brouillon (modifiable) → Envoyé (figé) → Accepté ou Refusé. Un devis accepté se transforme en UNE facture brouillon (mêmes lignes) ; aucun total n'est saisi.
  getQuotes(): Quote[] { return [...this.quotes]; },
  saveQuote(d: QuoteDraft & { id?: string }): { success: boolean; error?: string; line?: number; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const company = readCompany(this.getSettings().company);
    const v = checkQuoteDraft({ ...d, vat_enabled: company.tax.vat_enabled, vat_rate: company.tax.vat_rate });
    if (!v.ok) return { success: false, error: v.error, line: v.line };
    const client = this.clients.find(c => c.id === v.clean.client_id);
    if (!client) return { success: false, error: 'no_client' };
    const now = new Date().toISOString();
    if (d.id) {
      const old = this.quotes.find(x => x.id === d.id);
      if (!old) return { success: false, error: 'missing' };
      if (old.status !== 'draft') return { success: false, error: 'status' };
      const { valid_until: _v, ...base } = old; // une fin de validité vidée disparaît vraiment
      this.quotes = this.quotes.map(x => x.id === d.id ? { ...base, ...v.clean, client: { name: client.name }, updated_at: now } : x);
      this.notify();
      return { success: true, id: d.id };
    }
    const id = `qt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.quotes = [{ id, ref: nextQuoteRef(this.quotes), status: 'draft', ...v.clean, client: { name: client.name }, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.quotes];
    this.notify();
    return { success: true, id };
  },
  /** Brouillon → Envoyé ; Envoyé → Accepté ou Refusé. */
  setQuoteStatus(id: string, to: QuoteStatus): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const q = this.quotes.find(x => x.id === id);
    if (!q) return { success: false, error: 'missing' };
    if (!canQuoteTransition(q, to)) return { success: false, error: 'status' };
    this.quotes = this.quotes.map(x => x.id === id ? { ...x, status: to, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /** Supprime un brouillon ou un devis refusé (jamais facturé). */
  deleteQuote(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const q = this.quotes.find(x => x.id === id);
    if (!q) return { success: false, error: 'missing' };
    if (!canDeleteQuote(q)) return { success: false, error: 'status' };
    this.quotes = this.quotes.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  },
});

export type FinanceMethods = typeof financeMethods;
