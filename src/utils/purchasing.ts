// Fournisseurs, bons de commande, inventaire et budgets (module 4) : règles pures, sans écran ni serveur.
// Utilisées par les écrans et par `npm run check:purchasing`. Le serveur (df-api, blocs SUPPLIERS et PURCHASES) revérifie TOUT :
// `npm run check:purchasing-server` compare ses résultats à ceux d'ici sur les mêmes cas.
import type { CashEntry, Product, PurchaseLine, PurchaseOrder, PurchaseStatus, StockMove, Supplier } from '../types';
import { MAX_AMOUNT, parseAmount } from './finance';
import { MAX_QTY, quantities, round2 } from './stock';

export const MAX_LEAD_DAYS = 365;
export const MAX_PO_LINES = 50;
export const MAX_BUDGETS = 30;
export const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

const isRealDate = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const p = new Date(`${d}T00:00:00Z`);
  return !isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d;
};
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
/** Un nombre ou un texte non vide : jamais un tableau, un booléen ou un objet. */
const numIn = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '');

// ---------- Fournisseurs (M4.1) ----------
export interface SupplierDraft { name: string; contact?: string; lead_days?: string | number; note?: string }
export type SupplierError = 'name' | 'lead';
export type SupplierResult =
  | { ok: true; clean: { name: string; contact: string; lead_days?: number; note: string } }
  | { ok: false; error: SupplierError };

export function checkSupplierDraft(d: SupplierDraft): SupplierResult {
  const name = String(d.name ?? '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'name' };
  let lead: number | undefined;
  if (!blank(d.lead_days)) {
    if (!numIn(d.lead_days)) return { ok: false, error: 'lead' };
    const n = parseAmount(d.lead_days as string | number);
    if (!Number.isFinite(n) || n < 0 || n > MAX_LEAD_DAYS) return { ok: false, error: 'lead' };
    lead = Math.round(n);
  }
  return { ok: true, clean: { name, contact: String(d.contact ?? '').trim().slice(0, 120), ...(lead !== undefined ? { lead_days: lead } : {}), note: String(d.note ?? '').trim().slice(0, 500) } };
}

// ---------- Bons de commande (M4.2) ----------
export interface PurchaseLineDraft { product_id: string; qty: string | number; unit_cost: string | number }
export interface PurchaseDraft { supplier_id: string; date: string; expected_date?: string; note?: string; lines: PurchaseLineDraft[] }
export type PurchaseError = 'supplier' | 'date' | 'expected' | 'lines' | 'product' | 'qty' | 'cost' | 'duplicate';
export type PurchaseResult =
  | { ok: true; clean: { supplier_id: string; date: string; expected_date?: string; note: string; lines: PurchaseLine[] } }
  | { ok: false; error: PurchaseError; index?: number };

export function checkPurchaseDraft(d: PurchaseDraft): PurchaseResult {
  const supplier = String(d.supplier_id ?? '');
  if (!supplier || supplier.length > 80) return { ok: false, error: 'supplier' };
  if (!isRealDate(String(d.date ?? ''))) return { ok: false, error: 'date' };
  let expected: string | undefined;
  if (!blank(d.expected_date)) {
    if (!isRealDate(String(d.expected_date))) return { ok: false, error: 'expected' };
    if (String(d.expected_date) < d.date) return { ok: false, error: 'expected' }; // livraison avant la commande
    expected = String(d.expected_date);
  }
  if (!Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > MAX_PO_LINES) return { ok: false, error: 'lines' };
  const seen = new Set<string>();
  const lines: PurchaseLine[] = [];
  for (let i = 0; i < d.lines.length; i++) {
    const l = d.lines[i];
    const pid = String(l?.product_id ?? '');
    if (!pid || pid.length > 80) return { ok: false, error: 'product', index: i };
    if (seen.has(pid)) return { ok: false, error: 'duplicate', index: i };
    seen.add(pid);
    if (!numIn(l.qty)) return { ok: false, error: 'qty', index: i };
    const qty = round2(parseAmount(l.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { ok: false, error: 'qty', index: i };
    // Le prix peut rester vide (0) : il sera complété à la réception ; 0 = « pas de dépense calculée pour cette ligne ».
    const cost = blank(l.unit_cost) ? 0 : numIn(l.unit_cost) ? parseAmount(l.unit_cost) : NaN;
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_AMOUNT) return { ok: false, error: 'cost', index: i };
    lines.push({ product_id: pid, qty, unit_cost_ar: Math.round(cost), received_qty: 0 });
  }
  return { ok: true, clean: { supplier_id: supplier, date: d.date, ...(expected ? { expected_date: expected } : {}), note: String(d.note ?? '').slice(0, 300), lines } };
}

export const lineTotal = (l: PurchaseLine): number => Math.round(l.qty * l.unit_cost_ar);
export const poTotal = (po: Pick<PurchaseOrder, 'lines'>): number => po.lines.reduce((t, l) => t + lineTotal(l), 0);
/** Valeur de ce qui est déjà reçu (quantité reçue × prix convenu). */
export const poReceivedValue = (po: Pick<PurchaseOrder, 'lines'>): number => po.lines.reduce((t, l) => t + Math.round(l.received_qty * l.unit_cost_ar), 0);
export const remainingQty = (l: PurchaseLine): number => round2(Math.max(0, l.qty - l.received_qty));
export const poIsFullyReceived = (po: Pick<PurchaseOrder, 'lines'>): boolean => po.lines.length > 0 && po.lines.every(l => remainingQty(l) === 0);
export const poHasReceipt = (po: Pick<PurchaseOrder, 'lines'>): boolean => po.lines.some(l => l.received_qty > 0);

/** Prochain numéro « BC-0001 » : le plus grand numéro existant + 1. */
export function nextPurchaseRef(existing: Pick<PurchaseOrder, 'ref'>[]): string {
  let max = 0;
  for (const p of existing) { const m = /^BC-(\d{1,9})$/.exec(String(p.ref || '')); if (m) max = Math.max(max, Number(m[1])); }
  return `BC-${String(max + 1).padStart(4, '0')}`;
}

/** Changements d'état permis : Brouillon → Commandé ou Annulé ; Commandé → Annulé seulement si rien n'est reçu ; « Reçu » se obtient par réception. */
export function canTransition(po: Pick<PurchaseOrder, 'status' | 'lines'>, to: PurchaseStatus): boolean {
  if (po.status === 'draft') return (to === 'ordered' && po.lines.length > 0) || to === 'cancelled';
  if (po.status === 'ordered') return to === 'cancelled' && !poHasReceipt(po);
  return false; // Reçu et Annulé sont définitifs
}

export interface ReceiptPlan {
  moves: { product_id: string; qty: number; unit_cost_ar: number }[]; // entrées de stock à créer (une par ligne reçue)
  amount: number; // une seule dépense « Achats » pour toute la réception (somme des lignes)
  lines: PurchaseLine[]; // lignes du bon avec la nouvelle quantité reçue
  status: PurchaseStatus; // « received » si tout est reçu, sinon « ordered » (réception partielle)
}
export type ReceiptError = 'status' | 'none' | 'qty' | 'product';
/** Réception (totale ou partielle) : `received` = quantité reçue maintenant, par produit. Jamais plus que le reste à recevoir. */
export function planReceipt(po: Pick<PurchaseOrder, 'status' | 'lines'>, received: Record<string, string | number>): { ok: true; plan: ReceiptPlan } | { ok: false; error: ReceiptError } {
  if (po.status !== 'ordered') return { ok: false, error: 'status' };
  const known = new Set(po.lines.map(l => l.product_id));
  for (const k of Object.keys(received)) if (!known.has(k)) return { ok: false, error: 'product' };
  const moves: ReceiptPlan['moves'] = [];
  const lines: PurchaseLine[] = [];
  let amount = 0;
  for (const l of po.lines) {
    const raw = received[l.product_id];
    if (blank(raw)) { lines.push({ ...l }); continue; }
    if (!numIn(raw)) return { ok: false, error: 'qty' };
    const q = round2(parseAmount(raw));
    if (!Number.isFinite(q) || q < 0 || q > remainingQty(l)) return { ok: false, error: 'qty' };
    if (q === 0) { lines.push({ ...l }); continue; }
    moves.push({ product_id: l.product_id, qty: q, unit_cost_ar: l.unit_cost_ar });
    amount += Math.round(q * l.unit_cost_ar);
    lines.push({ ...l, received_qty: round2(l.received_qty + q) });
  }
  if (!moves.length) return { ok: false, error: 'none' };
  return { ok: true, plan: { moves, amount, lines, status: lines.every(l => remainingQty(l) === 0) ? 'received' : 'ordered' } };
}

/** Un bon en retard : commandé, livraison prévue dépassée et pas tout reçu. */
export const isLate = (po: Pick<PurchaseOrder, 'status' | 'expected_date'>, today: string): boolean => po.status === 'ordered' && !!po.expected_date && po.expected_date < today;

// ---------- Inventaire (M4.3) ----------
export interface InventoryRow { product: Product; expected: number; counted: number | null; diff: number | null; bad: boolean }
/** `counts` : quantité comptée par produit (texte tel que saisi). Vide = pas compté. Une valeur négative ou illisible = `bad`. */
export function inventoryRows(products: Product[], moves: StockMove[], counts: Record<string, string | number>): InventoryRow[] {
  const q = quantities(products, moves);
  return products.map(p => {
    const expected = q.get(p.id) || 0;
    const raw = counts[p.id];
    if (blank(raw)) return { product: p, expected, counted: null, diff: null, bad: false };
    const c = numIn(raw) ? round2(parseAmount(raw)) : NaN;
    if (!Number.isFinite(c) || c < 0 || c > MAX_QTY) return { product: p, expected, counted: null, diff: null, bad: true };
    return { product: p, expected, counted: c, diff: round2(c - expected), bad: false };
  }).sort((a, b) => a.product.name.localeCompare(b.product.name));
}
/** Ajustements à créer : un par produit compté dont l'écart n'est pas nul. */
export const inventoryAdjustments = (rows: InventoryRow[]): { product_id: string; qty: number; expected: number; counted: number }[] =>
  rows.filter(r => !r.bad && r.counted !== null && r.diff !== null && r.diff !== 0).map(r => ({ product_id: r.product.id, qty: r.diff as number, expected: r.expected, counted: r.counted as number }));

// ---------- Budgets par catégorie (M4.4) ----------
export type BudgetResult = { ok: true; clean: Record<string, number> } | { ok: false; error: 'budget'; category?: string };
/** Plafond mensuel par catégorie, en Ar. Une valeur vide ou 0 retire le plafond de cette catégorie. */
export function checkBudgets(input: Record<string, string | number>): BudgetResult {
  const clean: Record<string, number> = {};
  const entries = Object.entries(input ?? {});
  if (entries.length > MAX_BUDGETS) return { ok: false, error: 'budget' };
  for (const [k, v] of entries) {
    const cat = String(k).trim().slice(0, 40);
    if (!cat || BAD_KEYS.includes(cat)) return { ok: false, error: 'budget', category: k };
    if (blank(v)) continue;
    if (!numIn(v)) return { ok: false, error: 'budget', category: cat };
    const n = parseAmount(v);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { ok: false, error: 'budget', category: cat };
    if (Math.round(n) > 0) clean[cat] = Math.round(n);
  }
  return { ok: true, clean };
}
export type BudgetStatus = 'ok' | 'warn' | 'over';
export interface BudgetRow { category: string; budget: number; spent: number; left: number; pct: number; status: BudgetStatus }
/** Dépenses du mois (AAAA-MM) comparées au plafond. 80 % et plus = attention, plus de 100 % = dépassé. */
export function budgetRows(budgets: Record<string, number> | undefined, cash: CashEntry[], month: string): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const c of cash) if (c.kind === 'out' && c.date.slice(0, 7) === month) spent.set(c.category, (spent.get(c.category) || 0) + c.amount_ar);
  return Object.entries(budgets || {}).filter(([, b]) => b > 0).map(([category, budget]) => {
    const s = spent.get(category) || 0;
    const pct = Math.round((s / budget) * 100);
    return { category, budget, spent: s, left: budget - s, pct, status: (s > budget ? 'over' : pct >= 80 ? 'warn' : 'ok') as BudgetStatus };
  }).sort((a, b) => b.pct - a.pct || a.category.localeCompare(b.category));
}

// ---------- Statistiques d'achat (M4.5) ----------
export interface SupplierStat { supplier: Supplier; orders: number; received: number; spentAr: number; avgLeadDays: number | null; late: number }
/** Classement des fournisseurs sur la période : dépense = valeur reçue des bons (par date de commande), délai réel = 1re réception − commande. */
export function supplierRanking(suppliers: Supplier[], orders: PurchaseOrder[], moves: StockMove[], start: string, end: string, today: string): SupplierStat[] {
  const firstReceipt = new Map<string, string>();
  for (const m of moves) if (m.po_id && m.type === 'in') { const cur = firstReceipt.get(m.po_id); if (!cur || m.date < cur) firstReceipt.set(m.po_id, m.date); }
  return suppliers.map(s => {
    const mine = orders.filter(o => o.supplier_id === s.id && o.status !== 'draft' && o.status !== 'cancelled' && o.date >= start && o.date <= end);
    const leads: number[] = [];
    for (const o of mine) { const f = firstReceipt.get(o.id); if (f) leads.push(Math.round((new Date(`${f}T00:00:00Z`).getTime() - new Date(`${o.date}T00:00:00Z`).getTime()) / 86400000)); }
    return {
      supplier: s, orders: mine.length, received: mine.filter(o => o.status === 'received').length,
      spentAr: mine.reduce((t, o) => t + poReceivedValue(o), 0),
      avgLeadDays: leads.length ? Math.round((leads.reduce((a, b) => a + b, 0) / leads.length) * 10) / 10 : null,
      late: mine.filter(o => isLate(o, today)).length,
    };
  }).filter(x => x.orders > 0).sort((a, b) => b.spentAr - a.spentAr || a.supplier.name.localeCompare(b.supplier.name));
}

export interface PurchasedProduct { product: Product; qty: number; spentAr: number; avgUnitCost: number; lastUnitCost: number }
/** Produits achetés sur la période (entrées de stock avec un prix payé) : dépense totale, prix moyen et dernier prix payé. Du plus cher au moins cher par dépense. */
export function topPurchased(products: Product[], moves: StockMove[], start: string, end: string, n = 5): PurchasedProduct[] {
  const byId = new Map(products.map(p => [p.id, p]));
  const agg = new Map<string, { qty: number; spent: number; last: number; lastDate: string }>();
  for (const m of moves) {
    if (m.type !== 'in' || !m.unit_cost_ar || m.date < start || m.date > end || !byId.has(m.product_id)) continue;
    const a = agg.get(m.product_id) || { qty: 0, spent: 0, last: 0, lastDate: '' };
    a.qty = round2(a.qty + m.qty); a.spent += Math.round(m.qty * m.unit_cost_ar);
    if (m.date >= a.lastDate) { a.last = m.unit_cost_ar; a.lastDate = m.date; }
    agg.set(m.product_id, a);
  }
  return [...agg.entries()].map(([id, a]) => ({ product: byId.get(id) as Product, qty: a.qty, spentAr: a.spent, avgUnitCost: Math.round(a.spent / a.qty), lastUnitCost: a.last }))
    .sort((x, y) => y.spentAr - x.spentAr || x.product.name.localeCompare(y.product.name)).slice(0, n);
}
