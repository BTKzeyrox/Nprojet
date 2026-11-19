// Magasin de données : Stock : produits, mouvements, stockages, catégories (admin).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { categoryKey, categoryOptions, checkMoveDraft, checkProductDraft, cleanCategoryList, cleanCategoryName, cleanSpaceList, DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_SPACES, newSpaceId, productStorage, purchaseAmount, quantities, STOCK_SPACE_MAX, type MoveDraft, type ProductDraft, type StockSpace } from '../../utils/stock';
import { isMoneyRole } from '../../utils/roles';
import { Product, StockMove } from '../../types';

export const stockMethods = defineMethods({
  getProducts(): Product[] { return [...this.products]; },
  getStockSpaces(): StockSpace[] { return cleanSpaceList(this.getSettings().stock_spaces) ?? DEFAULT_STOCK_SPACES.map(s => ({ ...s })); },
  addStockSpace(name: string): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const list = this.getStockSpaces();
    const clean = cleanCategoryName(name);
    if (!clean) return { success: false, error: 'space_name' };
    if (list.some(s => categoryKey(s.name) === categoryKey(clean))) return { success: false, error: 'space_exists' };
    if (list.length >= STOCK_SPACE_MAX) return { success: false, error: 'space_max' };
    const id = newSpaceId(list);
    this.updateSettings({ stock_spaces: [...list, { id, name: clean }] });
    return { success: true, id };
  },
  renameStockSpace(id: string, name: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const list = this.getStockSpaces();
    if (!list.some(s => s.id === id)) return { success: false, error: 'missing' };
    const clean = cleanCategoryName(name);
    if (!clean) return { success: false, error: 'space_name' };
    if (list.some(s => s.id !== id && categoryKey(s.name) === categoryKey(clean))) return { success: false, error: 'space_exists' };
    this.updateSettings({ stock_spaces: list.map(s => (s.id === id ? { ...s, name: clean } : s)) });
    return { success: true };
  },
  /** Supprime un stockage VIDE seulement (il en reste toujours au moins un) : jamais de produit perdu ni déplacé en cachette. */
  deleteStockSpace(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const list = this.getStockSpaces();
    if (!list.some(s => s.id === id)) return { success: false, error: 'missing' };
    if (list.length <= 1) return { success: false, error: 'space_last' };
    if (this.products.some(p => productStorage(p) === id)) return { success: false, error: 'space_not_empty' };
    this.updateSettings({ stock_spaces: list.filter(s => s.id !== id) });
    return { success: true };
  },
  getStockCategories(): string[] { return cleanCategoryList(this.getSettings().stock_categories) ?? [...DEFAULT_STOCK_CATEGORIES]; },
  setStockCategories(list: string[]): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const c = cleanCategoryList(list);
    if (!c) return { success: false, error: 'category' };
    this.updateSettings({ stock_categories: c });
    return { success: true };
  },
  /** Renomme une catégorie : la liste ET tous les produits qui la portent. Refuse un nom déjà pris. */
  renameStockCategory(from: string, to: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const name = cleanCategoryName(to);
    if (!name) return { success: false, error: 'category' };
    const options = categoryOptions(this.getStockCategories(), this.products);
    if (categoryKey(name) !== categoryKey(from) && options.some(c => categoryKey(c) === categoryKey(name))) return { success: false, error: 'category_exists' };
    const list = this.getStockCategories();
    const next = list.some(c => categoryKey(c) === categoryKey(from)) ? list.map(c => (categoryKey(c) === categoryKey(from) ? name : c)) : [...list, name];
    const now = new Date().toISOString();
    this.products = this.products.map(p => (categoryKey(p.category) === categoryKey(from) ? { ...p, category: name, updated_at: now } : p));
    this.updateSettings({ stock_categories: cleanCategoryList(next) ?? [] });
    return { success: true };
  },
  /** Supprime une catégorie de la liste ; les produits qui la portaient restent, sans catégorie. */
  deleteStockCategory(name: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const now = new Date().toISOString();
    this.products = this.products.map(p => (categoryKey(p.category) === categoryKey(name) ? { ...p, category: '', updated_at: now } : p));
    this.updateSettings({ stock_categories: this.getStockCategories().filter(c => categoryKey(c) !== categoryKey(name)) });
    return { success: true };
  },
  getStockMoves(): StockMove[] { return [...this.stockMoves]; },

  addProduct(d: ProductDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkProductDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    const now = new Date().toISOString();
    const id = `prod-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const spaces = this.getStockSpaces();
    const storage_id = spaces.some(s => s.id === d.storage_id) ? (d.storage_id as string) : spaces[0].id; // un stockage inconnu = le premier
    this.products = [{ id, ...v.clean, storage_id, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.products];
    this.notify();
    return { success: true, id };
  },

  updateProduct(id: string, d: ProductDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.products.some(x => x.id === id)) return { success: false, error: 'missing' };
    const v = checkProductDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    this.products = this.products.map(x => x.id === id ? { ...x, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },

  /** Supprime le produit ET tous ses mouvements (le serveur fait pareil). */
  deleteProduct(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.products.some(x => x.id === id)) return { success: false, error: 'missing' };
    if (this.purchases.some(o => (o.status === 'draft' || o.status === 'ordered') && o.lines.some(l => l.product_id === id))) return { success: false, error: 'in_use' };
    this.products = this.products.filter(x => x.id !== id);
    this.stockMoves = this.stockMoves.filter(m => m.product_id !== id);
    this.notify();
    return { success: true };
  },

  /**
   * Entrée, sortie ou ajustement. Une sortie qui dépasse le stock est refusée ('stock') ; un ajustement ne peut pas rendre le stock négatif.
   * `withExpense` (entrée avec un prix payé) : crée aussi une dépense « Achats » du même montant, liée à l'entrée (S3.3).
   */
  addStockMove(d: MoveDraft, opts: { withExpense?: boolean } = {}): { success: boolean; error?: string; id?: string; cashId?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkMoveDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    const p = this.products.find(x => x.id === v.clean.product_id);
    if (!p) return { success: false, error: 'product' };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const have = quantities([p], this.stockMoves).get(p.id) || 0;
    if (v.clean.type !== 'in' && have + (v.clean.type === 'out' ? -v.clean.qty : v.clean.qty) < 0) return { success: false, error: 'stock' };
    const now = new Date().toISOString();
    const id = `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    let cashId: string | undefined;
    if (opts.withExpense && v.clean.type === 'in') {
      const amount = purchaseAmount(v.clean.qty, v.clean.unit_cost_ar);
      if (amount < 1) return { success: false, error: 'cost' }; // pas de prix : pas de dépense à créer
      const c = this.addCash({ kind: 'out', category: 'Achats', amount, date: v.clean.date, note: `Stock : ${p.name} (${v.clean.qty} ${p.unit})`, ...(v.clean.supplier_id ? { supplier_id: v.clean.supplier_id } : {}) });
      if (!c.success) return { success: false, error: c.error };
      cashId = c.id;
    }
    this.stockMoves = [{ id, ...v.clean, ...(cashId ? { cash_id: cashId } : {}), created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.stockMoves];
    this.notify();
    return { success: true, id, cashId };
  },

  /** Supprime un mouvement (la quantité se recalcule). Refusé si cela rendrait le stock négatif. La dépense liée, s'il y en a une, reste : elle se supprime dans Finances. */
  deleteStockMove(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const m = this.stockMoves.find(x => x.id === id);
    if (!m) return { success: false, error: 'missing' };
    const rest = this.stockMoves.filter(x => x.id !== id);
    const p = this.products.find(x => x.id === m.product_id);
    if (p && (quantities([p], rest).get(p.id) || 0) < 0 && (quantities([p], this.stockMoves).get(p.id) || 0) >= 0) return { success: false, error: 'stock' };
    this.stockMoves = rest;
    this.notify();
    return { success: true };
  },
});

export type StockMethods = typeof stockMethods;
