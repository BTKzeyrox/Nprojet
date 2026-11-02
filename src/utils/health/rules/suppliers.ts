// Contrôles de la page Achats / Fournisseurs (module 11, M11.12). Règles pures : elles lisent, ne changent rien.
// Limites écrites : « en retard » = bon commandé dont la livraison prévue est passée (comme la page Achats) ; sans date prévue, aucun retard n'est déclaré.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { budgetRows, isLate } from '../../purchasing';
import { dayDiff, list, plural } from './common';

const GO = { view: 'purchasing' };
const URGENT_DAYS = 7;

export const poLate: HealthRule = {
  id: 'suppliers.po-late', page: 'suppliers',
  run: (ctx) => {
    if (!ctx.purchases) return [];
    const late = ctx.purchases.filter(o => isLate(o, ctx.today));
    if (!late.length) return [];
    const n = late.length, oldest = Math.max(...late.map(o => dayDiff(o.expected_date as string, ctx.today)));
    const refs = list(late.map(o => o.ref));
    return [{
      id: alertId('suppliers', 'po-late'), page: 'suppliers', rule: 'po-late', severity: oldest > URGENT_DAYS ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'bon de commande en retard', 'bons de commande en retard')}`, title_en: `${n} purchase ${plural(n, 'order', 'orders')} late`,
      why_fr: `Livraison prévue dépassée (jusqu'à ${oldest} jour(s)) : ${refs}.`, why_en: `Expected delivery date passed (up to ${oldest} day(s)): ${refs}.`,
      todo_fr: 'Appeler le fournisseur, puis noter la réception ou une nouvelle date.', todo_en: 'Call the supplier, then record the receipt or a new date.',
      since: late.map(o => o.expected_date as string).sort()[0], value: n, go: GO,
    } as HealthAlert];
  },
};

export const budgetOver: HealthRule = {
  id: 'suppliers.budget-over', page: 'suppliers',
  run: (ctx) => {
    const budgets = ctx.settings?.budgets;
    if (!budgets || !Object.keys(budgets).length) return [];
    const over = budgetRows(budgets, ctx.cash, ctx.today.slice(0, 7)).filter(r => r.status === 'over');
    if (!over.length) return [];
    const n = over.length, top = over[0];
    return [{
      id: alertId('suppliers', 'budget-over'), page: 'suppliers', rule: 'budget-over', severity: 'watch',
      title_fr: `${n} ${plural(n, 'budget dépassé', 'budgets dépassés')} ce mois-ci`, title_en: `${n} ${plural(n, 'budget', 'budgets')} over this month`,
      why_fr: `Plafond mensuel dépassé : ${list(over.map(r => `${r.category} (${r.pct} %)`))}.`, why_en: `Monthly cap exceeded: ${list(over.map(r => `${r.category} (${r.pct}%)`))}.`,
      todo_fr: 'Regarder les dépenses de la catégorie, puis relever le plafond ou freiner les achats.', todo_en: 'Look at the category spending, then raise the cap or slow down purchases.',
      since: null, value: top.pct, go: { view: 'stats', tab: 'finance' },
    } as HealthAlert];
  },
};


/**
 * Achat dont la dépense « Achats » ne correspond plus à ce qui a été reçu.
 * Attendu = somme (quantité reçue × prix commandé) des lignes du bon ; réel = somme des dépenses de la caisse qui citent ce bon (`po_id`).
 * Limites : on tolère 1 Ar d'arrondi par ligne et par réception ; un bon sans aucune réception est ignoré ; le site ne corrige rien.
 */
export const poCashMismatch: HealthRule = {
  id: 'suppliers.po-cash-mismatch', page: 'suppliers',
  run: (ctx) => {
    if (!Array.isArray(ctx.purchases) || !Array.isArray(ctx.cash)) return [];
    const spent = new Map<string, { sum: number; n: number }>();
    for (const c of ctx.cash) {
      if (!c || c.kind !== 'out' || typeof (c as any).po_id !== 'string' || !(c as any).po_id || !Number.isFinite(c.amount_ar)) continue;
      const k = (c as any).po_id as string, x = spent.get(k) || { sum: 0, n: 0 };
      x.sum += c.amount_ar; x.n++; spent.set(k, x);
    }
    const bad: { ref: string; since: string }[] = [];
    for (const o of ctx.purchases) {
      if (!o || (o.status !== 'ordered' && o.status !== 'received') || !Array.isArray(o.lines)) continue;
      let expected = 0, any = false;
      for (const l of o.lines) { const q = Number(l?.received_qty), u = Number(l?.unit_cost_ar); if (Number.isFinite(q) && Number.isFinite(u) && q > 0) { any = true; expected += Math.round(q * u); } }
      if (!any) continue;
      const got = spent.get(o.id) || { sum: 0, n: 0 };
      const tolerance = o.lines.length + got.n;
      if (Math.abs(expected - got.sum) > tolerance) bad.push({ ref: o.ref, since: String(o.date || ctx.today) });
    }
    if (!bad.length) return [];
    const n = bad.length, refs = list(bad.map(b => b.ref));
    return [{
      id: alertId('suppliers', 'po-cash-mismatch'), page: 'suppliers', rule: 'po-cash-mismatch', severity: 'watch',
      title_fr: `${n} ${plural(n, 'achat dont la dépense ne correspond plus à la réception', 'achats dont la dépense ne correspond plus à la réception')}`, title_en: `${n} ${plural(n, 'purchase whose expense no longer matches the receipt', 'purchases whose expense no longer matches the receipt')}`,
      why_fr: `La dépense « Achats » a été modifiée ou supprimée après la réception (${refs}) : le stock et la caisse ne disent plus la même chose.`, why_en: `The “Purchases” expense was changed or deleted after the receipt (${refs}): stock and cash no longer agree.`,
      todo_fr: 'Ouvrir Achats, regarder le bon, puis remettre la dépense dans Finances au montant reçu (quantité reçue × prix du bon).', todo_en: 'Open Purchases, look at the order, then put the expense back in Finances at the received amount (received quantity × order price).',
      since: bad.map(b => b.since).sort()[0], value: n, go: GO,
    } as HealthAlert];
  },
};

export const SUPPLIER_RULES: HealthRule[] = [poLate, budgetOver, poCashMismatch];
