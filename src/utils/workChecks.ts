// Contrôles du travail saisi (module 26, M26.8) : boîtes déclarées contre entrées en Stock, boîtes par heure, régularité. Règles pures, sans écran, sans serveur.
// Utilisé par : health/rules/stock.ts (alerte), performance.ts (colonnes). Contrôlé par `npm run check:work-checks`.
import type { PostSession, Product, StockMove } from '../types';

export const WC_WINDOW_DAYS = 30; // fenêtre de comparaison
export const WC_MIN_DECLARED = 10; // sous ce total déclaré, on ne dit rien (trop peu pour comparer)
export const WC_TOLERANCE_PCT = 10; // écart toléré : un comptage n'est jamais parfait
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string): number => Date.parse(iso + 'T00:00:00Z');
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

/** Une ligne de la Feuille du jour (identifiant « we-… »), validée, avec une date réelle. */
export const isWorkLine = (p: any): boolean => !!p && typeof p.id === 'string' && p.id.startsWith('we-') && DATE.test(String(p.date || '')) && p.status === 'completed';
/** Produit compté en boîtes : unité « boîte », « carton » ou « box ». */
export const isBoxProduct = (p: Pick<Product, 'unit'>): boolean => /^\s*(bo[iî]tes?|cartons?|box(es)?)\s*$/i.test(String(p?.unit ?? ''));

const inWindow = (date: string, today: string, days: number): boolean => DATE.test(date) && date <= today && (day(today) - day(date)) / 86400000 < days;

export interface StockGap { declared: number; received: number; missing: number; pct: number; products: number }
/** Boîtes déclarées (quantité acceptée des lignes validées) contre entrées en Stock des produits « boîte », sur 30 jours.
 *  `null` = rien à dire : pas de produit en boîtes, trop peu déclaré, ou écart dans la tolérance (déclaré ≤ reçu + 10 %). */
export function workStockGap(posts: PostSession[], products: Product[], moves: StockMove[], today: string, days = WC_WINDOW_DAYS): StockGap | null {
  if (!DATE.test(today)) return null;
  const box = products.filter(isBoxProduct);
  if (!box.length) return null;
  const ids = new Set(box.map(p => p.id));
  let declared = 0;
  for (const p of posts as any[]) if (isWorkLine(p) && inWindow(p.date, today, days)) declared += Math.max(0, n(p.quantity) - Math.min(n(p.rejected), n(p.quantity)));
  if (declared < WC_MIN_DECLARED) return null;
  let received = 0;
  for (const m of moves) if (m.type === 'in' && ids.has(m.product_id) && inWindow(m.date, today, days)) received += n(m.qty);
  if (declared <= received * (1 + WC_TOLERANCE_PCT / 100)) return null;
  const missing = Math.round((declared - received) * 100) / 100;
  return { declared: Math.round(declared * 100) / 100, received: Math.round(received * 100) / 100, missing, pct: Math.round((missing / declared) * 100), products: box.length };
}

export interface WorkRate { days: number; hours: number; quantity: number; perHour: number | null; regularity: number | null }
/** Boîtes par heure et régularité d'un employé sur `days` jours. Régularité = 100 − (écart-type ÷ moyenne des quantités par jour, en %), de 0 à 100 ; `null` sous 3 jours travaillés. */
export function workRate(posts: PostSession[], userId: string, today: string, days = WC_WINDOW_DAYS): WorkRate {
  const perDay = new Map<string, number>();
  let hours = 0, quantity = 0;
  for (const p of posts as any[]) {
    if (!isWorkLine(p) || p.employee_id !== userId || !inWindow(p.date, today, days)) continue;
    const q = Math.max(0, n(p.quantity) - Math.min(n(p.rejected), n(p.quantity)));
    if (p.quantity === undefined || p.quantity === null) continue; // une ligne sans quantité ne compte pas ici
    quantity += q; hours += n(p.hours);
    perDay.set(p.date, (perDay.get(p.date) || 0) + q);
  }
  const vals = [...perDay.values()];
  let regularity: number | null = null;
  if (vals.length >= 3) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean > 0) { const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length); regularity = Math.max(0, Math.min(100, Math.round(100 - (sd / mean) * 100))); }
  }
  return { days: vals.length, hours: Math.round(hours * 100) / 100, quantity: Math.round(quantity * 100) / 100, perHour: hours > 0 ? Math.round((quantity / hours) * 10) / 10 : null, regularity };
}
