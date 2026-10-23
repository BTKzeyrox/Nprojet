// Stock : règles pures (sans écran, sans serveur). Utilisées par l'onglet « Stock » et par le contrôle `npm run check:stock`.
// Elles reprennent les mêmes règles que le serveur (`cleanProduct` et `cleanStockMove` dans df-api) : le serveur revérifie toujours.
import type { Product, StockMove, StockMoveType } from '../types';
import { parseAmount, MAX_AMOUNT } from './finance';

export const MAX_QTY = 1_000_000_000;
export const DEFAULT_UNIT = 'unité';
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ProductDraft { name: string; category?: string; unit?: string; buy_price?: string | number; sell_price?: string | number; alert_threshold?: string | number }
export type ProductError = 'name' | 'buy' | 'sell' | 'threshold';
export type ProductResult =
  | { ok: true; clean: { name: string; category: string; unit: string; buy_price_ar: number; sell_price_ar: number; alert_threshold: number } }
  | { ok: false; error: ProductError };

/** Vide = 0. Sinon un nombre ≥ 0. */
const money = (v: string | number | undefined): number => (v === undefined || String(v).trim() === '' ? 0 : parseAmount(v));

export function checkProductDraft(d: ProductDraft): ProductResult {
  const name = String(d.name || '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'name' };
  const buy = money(d.buy_price), sell = money(d.sell_price), thr = d.alert_threshold === undefined || String(d.alert_threshold).trim() === '' ? 0 : parseAmount(d.alert_threshold);
  if (!Number.isFinite(buy) || buy < 0 || buy > MAX_AMOUNT) return { ok: false, error: 'buy' };
  if (!Number.isFinite(sell) || sell < 0 || sell > MAX_AMOUNT) return { ok: false, error: 'sell' };
  if (!Number.isFinite(thr) || thr < 0 || thr > MAX_QTY) return { ok: false, error: 'threshold' };
  return { ok: true, clean: { name, category: String(d.category || '').trim().slice(0, 40), unit: String(d.unit || '').trim().slice(0, 16) || DEFAULT_UNIT, buy_price_ar: Math.round(buy), sell_price_ar: Math.round(sell), alert_threshold: round2(thr) } };
}

export interface MoveDraft { product_id: string; type: StockMoveType; qty: string | number; date: string; note?: string; unit_cost?: string | number; supplier_id?: string }
export type MoveError = 'type' | 'qty' | 'date' | 'cost' | 'product';
export type MoveResult =
  | { ok: true; clean: { product_id: string; type: StockMoveType; qty: number; date: string; note: string; unit_cost_ar?: number; supplier_id?: string } }
  | { ok: false; error: MoveError };

const isRealDate = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const p = new Date(`${d}T00:00:00Z`);
  return !isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d;
};

export function checkMoveDraft(d: MoveDraft): MoveResult {
  if (d.type !== 'in' && d.type !== 'out' && d.type !== 'adjust') return { ok: false, error: 'type' };
  if (!String(d.product_id || '')) return { ok: false, error: 'product' };
  const qty = round2(parseAmount(d.qty));
  if (!Number.isFinite(qty) || Math.abs(qty) > MAX_QTY || qty === 0 || (d.type !== 'adjust' && qty < 0)) return { ok: false, error: 'qty' };
  if (!isRealDate(String(d.date || ''))) return { ok: false, error: 'date' };
  const out: { product_id: string; type: StockMoveType; qty: number; date: string; note: string; unit_cost_ar?: number; supplier_id?: string } = { product_id: String(d.product_id), type: d.type, qty, date: d.date, note: String(d.note || '').slice(0, 300) };
  if (d.type === 'in' && d.unit_cost !== undefined && String(d.unit_cost).trim() !== '') {
    const c = parseAmount(d.unit_cost);
    if (!Number.isFinite(c) || c < 0 || c > MAX_AMOUNT) return { ok: false, error: 'cost' };
    out.unit_cost_ar = Math.round(c);
  }
  if (d.type === 'in' && typeof d.supplier_id === 'string' && d.supplier_id.trim()) out.supplier_id = d.supplier_id.trim().slice(0, 80); // seule une entrée a un fournisseur
  return { ok: true, clean: out };
}

/** Effet d'un mouvement sur la quantité : entrée +, sortie −, ajustement = sa valeur (+ ou −). */
export const moveDelta = (m: StockMove): number => (m.type === 'out' ? -Math.abs(m.qty) : m.type === 'in' ? Math.abs(m.qty) : m.qty);

/** Quantité de chaque produit, calculée avec les mouvements (jusqu'à `upTo` compris, si donné). */
export function quantities(products: Product[], moves: StockMove[], upTo?: string): Map<string, number> {
  const q = new Map<string, number>(products.map(p => [p.id, 0]));
  for (const m of moves) {
    if (upTo && m.date > upTo) continue;
    if (q.has(m.product_id)) q.set(m.product_id, round2((q.get(m.product_id) || 0) + moveDelta(m)));
  }
  return q;
}

export interface StockRow { product: Product; qty: number; value: number; low: boolean; empty: boolean; negative: boolean }

/** Une ligne par produit : quantité, valeur (quantité × prix d'achat, jamais négative), voyant rouge sous le seuil. */
export function stockRows(products: Product[], moves: StockMove[]): StockRow[] {
  const q = quantities(products, moves);
  return products.map(p => {
    const qty = q.get(p.id) || 0;
    return { product: p, qty, value: Math.round(Math.max(0, qty) * p.buy_price_ar), low: p.alert_threshold > 0 && qty <= p.alert_threshold, empty: qty <= 0, negative: qty < 0 };
  }).sort((a, b) => a.product.name.localeCompare(b.product.name));
}

export const stockValue = (rows: StockRow[]): number => rows.reduce((t, r) => t + r.value, 0);

/** Valeur du stock à la fin de chacun des `n` derniers mois (prix d'achat actuels appliqués aux quantités de l'époque). */
export function valueByMonth(products: Product[], moves: StockMove[], today: string, n = 12): { labels: string[]; keys: string[]; values: number[] } {
  const keys: string[] = [], labels: string[] = [], values: number[] = [];
  const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7)) - 1;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, m0 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const upTo = i === 0 ? today : last;
    const q = quantities(products, moves, upTo);
    keys.push(key); labels.push(key.slice(5) + '/' + key.slice(2, 4));
    values.push(Math.round(products.reduce((t, p) => t + Math.max(0, q.get(p.id) || 0) * p.buy_price_ar, 0)));
  }
  return { labels, keys, values };
}

/** Quantité sortie par produit sur la période (bornes comprises). */
export function usedInRange(moves: StockMove[], start: string, end: string): Map<string, number> {
  const u = new Map<string, number>();
  for (const m of moves) if (m.type === 'out' && m.date >= start && m.date <= end) u.set(m.product_id, round2((u.get(m.product_id) || 0) + Math.abs(m.qty)));
  return u;
}

export function topUsed(products: Product[], moves: StockMove[], start: string, end: string, n = 5): { product: Product; used: number }[] {
  const u = usedInRange(moves, start, end);
  return products.map(p => ({ product: p, used: u.get(p.id) || 0 })).filter(x => x.used > 0).sort((a, b) => b.used - a.used || a.product.name.localeCompare(b.product.name)).slice(0, n);
}

const shiftDay = (iso: string, days: number): string => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** Produits bientôt en rupture : jours restants = quantité ÷ sorties par jour des 30 derniers jours. Sans sortie récente : on ne devine pas (null). */
export function runOutSoon(rows: StockRow[], moves: StockMove[], today: string, windowDays = 30): { product: Product; qty: number; daysLeft: number | null }[] {
  const used = usedInRange(moves, shiftDay(today, -(windowDays - 1)), today);
  return rows
    .map(r => {
      const perDay = (used.get(r.product.id) || 0) / windowDays;
      return { product: r.product, qty: r.qty, daysLeft: r.qty <= 0 ? 0 : perDay > 0 ? Math.ceil(r.qty / perDay) : null };
    })
    .filter(x => x.daysLeft !== null && x.daysLeft <= 14)
    .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number) || a.product.name.localeCompare(b.product.name));
}

export interface StockPeriod { entries: number; exits: number; qtyIn: number; qtyOut: number; soldAr: number }
/** Résumé de la période : nombre de mouvements, quantités entrées et sorties, valeur des sorties au prix de vente. */
export function stockPeriod(products: Product[], moves: StockMove[], start: string, end: string): StockPeriod {
  const price = new Map(products.map(p => [p.id, p.sell_price_ar]));
  const r: StockPeriod = { entries: 0, exits: 0, qtyIn: 0, qtyOut: 0, soldAr: 0 };
  for (const m of moves) {
    if (m.date < start || m.date > end) continue;
    if (m.type === 'in') { r.entries++; r.qtyIn = round2(r.qtyIn + m.qty); }
    if (m.type === 'out') { r.exits++; r.qtyOut = round2(r.qtyOut + m.qty); r.soldAr += Math.round(m.qty * (price.get(m.product_id) || 0)); }
  }
  return r;
}

/** Montant d'un achat de stock (S3.3) : quantité × prix payé par unité, arrondi à l'Ar. 0 si le prix n'est pas connu. */
export const purchaseAmount = (qty: number, unitCost?: number): number => Math.round(Math.abs(qty) * (unitCost || 0));
