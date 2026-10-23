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

export const SUPPLIER_RULES: HealthRule[] = [poLate, budgetOver];
