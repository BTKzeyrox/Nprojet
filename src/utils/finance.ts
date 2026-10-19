// Finances : règles pures (sans écran, sans serveur). Utilisées par l'onglet « Finances » et par le contrôle `npm run check:finance`.
// Elles reprennent les mêmes règles que le serveur (`cleanCash` dans df-api) : le serveur revérifie toujours.
import type { CashEntry, CashKind } from '../types';

export const IN_CATEGORIES = ['Paiement client', 'Autre entrée'] as const;
export const OUT_CATEGORIES = ['Achats', 'Loyer', 'Internet', 'Matériel', 'Transport', 'Autres'] as const;
export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_CATEGORY = 40;

export interface CashDraft { kind: CashKind; category: string; amount: string | number; date: string; note?: string; client_name?: string }
export type DraftError = 'kind' | 'amount' | 'date' | 'category';
export type DraftResult =
  | { ok: true; clean: { kind: CashKind; category: string; amount_ar: number; date: string; note: string; client_name: string } }
  | { ok: false; error: DraftError };

/** « 1 500 », « 1500,5 » ou 1500 → nombre ; NaN si ce n'est pas un nombre. */
export function parseAmount(v: string | number): number {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}

const isRealDate = (d: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const p = new Date(`${d}T00:00:00Z`);
  return !isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d;
};

/** Vérifie une ligne avant l'envoi (mêmes règles que le serveur ; le montant est arrondi à l'Ar, au moins 1). */
export function checkDraft(d: CashDraft): DraftResult {
  if (d.kind !== 'in' && d.kind !== 'out') return { ok: false, error: 'kind' };
  const amount = parseAmount(d.amount);
  if (!Number.isFinite(amount) || Math.round(amount) < 1 || amount > MAX_AMOUNT) return { ok: false, error: 'amount' };
  if (!isRealDate(String(d.date || ''))) return { ok: false, error: 'date' };
  const category = String(d.category || '').trim().slice(0, MAX_CATEGORY);
  if (!category) return { ok: false, error: 'category' };
  return { ok: true, clean: { kind: d.kind, category, amount_ar: Math.round(amount), date: d.date, note: String(d.note || '').slice(0, 300), client_name: String(d.client_name || '').slice(0, 80) } };
}

export interface CashFilter { start: string; end: string; kind: 'all' | CashKind; category: string } // category '' = toutes

/** Lignes de la période (bornes comprises), filtrées, les plus récentes d'abord. */
export function filterCash(list: CashEntry[], f: CashFilter): CashEntry[] {
  return list
    .filter(e => e.date >= f.start && e.date <= f.end && (f.kind === 'all' || e.kind === f.kind) && (!f.category || e.category === f.category))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export function sumCash(list: CashEntry[]): { in: number; out: number; countIn: number; countOut: number } {
  const r = { in: 0, out: 0, countIn: 0, countOut: 0 };
  for (const e of list) { if (e.kind === 'in') { r.in += e.amount_ar; r.countIn++; } else { r.out += e.amount_ar; r.countOut++; } }
  return r;
}

/** Catégories proposées : celles de départ, puis celles déjà utilisées pour ce type (sans doublon). */
export function categoriesFor(kind: CashKind, all: CashEntry[]): string[] {
  const base: string[] = [...(kind === 'in' ? IN_CATEGORIES : OUT_CATEGORIES)];
  const used = [...new Set(all.filter(e => e.kind === kind).map(e => e.category))].filter(c => c && !base.includes(c)).sort((a, b) => a.localeCompare(b));
  return [...base, ...used];
}

export interface PeriodMoney { received: number; spent: number; salaries: number; totalOut: number; net: number }

/**
 * Argent de la période : reçu des clients, dépenses saisies, salaires (calculés par les missions validées), solde = reçu − dépenses − salaires.
 * Les avances sont des salaires versés d'avance : elles ne s'ajoutent pas aux salaires (sinon on les compterait deux fois).
 */
export function periodMoney(inRange: CashEntry[], salariesAr: number): PeriodMoney {
  const s = sumCash(inRange);
  const salaries = Math.max(0, Math.round(salariesAr || 0));
  return { received: s.in, spent: s.out, salaries, totalOut: s.out + salaries, net: s.in - s.out - salaries };
}
