// Magasin de données : Fournisseurs et bons de commande (admin).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { checkDraft } from '../../utils/finance';
import { normalizeName } from '../../utils/clients';
import { applyReceiptPrices, canCloseShort, canTransition, checkSupplierDraft, nextPurchaseRef, planReceipt, type PurchaseDraft, type SupplierDraft } from '../../utils/purchasing';
import { isMoneyRole } from '../../utils/roles';
import { StockMove, Supplier, PurchaseOrder } from '../../types';

export const purchasingMethods = defineMethods({

  // Fournisseurs (responsable seulement ; le serveur revérifie chaque fiche). Codes d'erreur : 'admin' | 'name' | 'lead' | 'duplicate' | 'missing' | 'in_use'.
  getSuppliers(): Supplier[] { return [...this.suppliers]; },
  addSupplier(d: SupplierDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkSupplierDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.suppliers.some(x => normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const now = new Date().toISOString();
    const id = `sup-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.suppliers = [{ id, ...v.clean, active: true, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.suppliers];
    this.notify();
    return { success: true, id };
  },
  updateSupplier(id: string, d: SupplierDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const old = this.suppliers.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkSupplierDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.suppliers.some(x => x.id !== id && normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const { lead_days: _l, ...base } = old; // un délai vidé disparaît vraiment
    this.suppliers = this.suppliers.map(x => x.id === id ? { ...base, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /** Archive ou réactive. Un fournisseur archivé reste là avec ses bons et n'apparaît plus dans les listes de choix. */
  setSupplierActive(id: string, active: boolean): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.suppliers.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.suppliers = this.suppliers.map(x => x.id === id ? { ...x, active, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /** Supprime seulement un fournisseur qui n'a servi à rien (le serveur refuse aussi) : sinon, on l'archive. */
  deleteSupplier(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.suppliers.some(x => x.id === id)) return { success: false, error: 'missing' };
    if (this.supplierUsed(id)) return { success: false, error: 'in_use' };
    this.suppliers = this.suppliers.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  },
  addPurchase(d: PurchaseDraft, order = false): { success: boolean; error?: string; id?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const v = this.purchaseChecks(d);
    if (!v.ok) return { success: false, error: v.error };
    const now = new Date().toISOString();
    const id = `po-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.purchases = [{ id, ref: nextPurchaseRef(this.purchases), ...v.clean, status: order ? 'ordered' : 'draft', created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.purchases];
    this.notify();
    return { success: true, id };
  },
  /** Modifie un BROUILLON seulement (un bon commandé est figé). */
  updatePurchase(id: string, d: PurchaseDraft): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const old = this.purchases.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    if (old.status !== 'draft') return { success: false, error: 'status' };
    const v = this.purchaseChecks(d);
    if (!v.ok) return { success: false, error: v.error };
    const { expected_date: _e, ...base } = old; // une livraison prévue vidée disparaît vraiment
    this.purchases = this.purchases.map(x => x.id === id ? { ...base, ...v.clean, status: 'draft' as const, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /** Brouillon → Commandé, ou Brouillon / Commandé sans réception → Annulé. */
  setPurchaseStatus(id: string, to: 'ordered' | 'cancelled'): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const old = this.purchases.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    if (!canTransition(old, to)) return { success: false, error: 'status' };
    this.purchases = this.purchases.map(x => x.id === id ? { ...x, status: to, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /** Supprime un brouillon ou un bon annulé (le serveur refuse les autres : l'historique des achats reste). */
  deletePurchase(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const old = this.purchases.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    if (old.status !== 'draft' && old.status !== 'cancelled') return { success: false, error: 'status' };
    this.purchases = this.purchases.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  },
  /** Solde le reste d'un bon commandé reçu en partie : il devient « Reçu » (définitif). Aucune dépense ni aucun mouvement de stock n'est créé. */
  closePurchaseShort(id: string, date: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const old = this.purchases.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    if (!canCloseShort(old)) return { success: false, error: 'status' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || String(date) < old.date) return { success: false, error: 'date' };
    this.purchases = this.purchases.map(x => x.id === id ? { ...x, status: 'received' as const, short_closed: String(date), updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },
  /**
   * Réception (totale ou partielle) d'un bon COMMANDÉ : `received` = quantité reçue maintenant, par produit.
   * Crée une entrée de stock par ligne reçue (avec le bon et le fournisseur) et, si `withExpense`, UNE dépense « Achats » pour toute la réception.
   * Le serveur doit déjà connaître le bon « commandé » : sinon 'unsynced' (réessayer dans quelques secondes).
   */
  receivePurchase(id: string, received: Record<string, string | number>, opts: { date: string; withExpense?: boolean; prices?: Record<string, string | number> }): { success: boolean; error?: string; cashId?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const po = this.purchases.find(x => x.id === id);
    if (!po) return { success: false, error: 'missing' };
    // Prix réel de la livraison (première réception d'une ligne seulement) : la ligne du bon prend ce prix avant le calcul
    const pr = opts.prices ? applyReceiptPrices(po, received, opts.prices) : null;
    if (pr && !pr.ok) return { success: false, error: pr.error };
    const priced = pr && pr.ok ? { ...po, lines: pr.lines } : po;
    const changes = pr && pr.ok ? pr.changes : [];
    const r = planReceipt(priced, received);
    if (!r.ok) return { success: false, error: r.error };
    if (!this.demo) {
      let seen: string | undefined;
      try { seen = JSON.parse(this.synced.purchases.get(id) || '{}').status; } catch { seen = undefined; }
      if (seen !== 'ordered') return { success: false, error: 'unsynced' };
    }
    const date = String(opts.date || '');
    const dv = checkDraft({ kind: 'out', category: 'Achats', amount: Math.max(1, r.plan.amount), date, note: `Bon ${po.ref}`, supplier_id: po.supplier_id });
    if (!dv.ok || date < po.date) return { success: false, error: 'date' };
    const now = new Date().toISOString();
    const rnd = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const wantCash = !!opts.withExpense && r.plan.amount >= 1;
    const cashId = wantCash ? `cash-${rnd()}` : undefined;
    if (cashId) this.cash = [{ id: cashId, ...dv.clean, amount_ar: r.plan.amount, note: `Bon ${po.ref} reçu`, po_id: po.id, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.cash];
    const newMoves: StockMove[] = r.plan.moves.map((m, i) => ({
      id: `mv-${rnd()}${i}`, product_id: m.product_id, type: 'in' as const, qty: m.qty, date, note: `Bon ${po.ref}${changes.find(c => c.product_id === m.product_id) ? ` · prix ${changes.find(c => c.product_id === m.product_id)!.from} → ${changes.find(c => c.product_id === m.product_id)!.to} Ar` : ''}`,
      ...(m.unit_cost_ar > 0 ? { unit_cost_ar: m.unit_cost_ar } : {}), ...(cashId ? { cash_id: cashId } : {}), supplier_id: po.supplier_id, po_id: po.id,
      created_by: this.currentUser!.id, created_at: now, updated_at: now,
    }));
    this.stockMoves = [...newMoves, ...this.stockMoves];
    this.purchases = this.purchases.map(x => x.id === id ? { ...x, lines: r.plan.lines, status: r.plan.status, updated_at: now } : x);
    this.notify();
    return { success: true, cashId };
  },

  getPurchases(): PurchaseOrder[] { return [...this.purchases]; },
});

export type PurchasingMethods = typeof purchasingMethods;
