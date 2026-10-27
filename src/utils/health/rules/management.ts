// Contrôles du module 15 (management), M15.8. Règles pures : elles lisent, ne changent rien.
// (1) Conflits du planning des 14 prochains jours (mêmes règles que l'onglet Planning : `planConflicts`, rien n'est refusé).
// (2) Paie ou dépenses du MOIS EN COURS au-dessus du prévu (mêmes chiffres que la carte « Prévu contre réel » : `budgetVsActual`).
// Les dépassements de budget PAR CATÉGORIE restent à la règle `suppliers.budget-over` ; ici c'est le total des dépenses et la paie.
import { alertId, type HealthContext, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { planConflicts, CONFLICT_LABEL } from '../../planning';
import { budgetVsActual, cleanMonthlyPlan } from '../../budgetPlan';
import { dayDiff, plural, userName } from './common';

const WINDOW_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fr = (d: string): string => d.split('-').reverse().join('/');
const ar = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;
const arEn = (n: number): string => `${Math.round(n).toLocaleString('en-US')} Ar`;

export const planningConflicts: HealthRule = {
  id: 'hr.planning-conflicts', page: 'hr',
  run: (ctx: HealthContext) => {
    const shifts = Array.isArray(ctx.shifts) ? ctx.shifts.filter(s => s && DATE_RE.test(s.date || '') && typeof s.employee_id === 'string') : [];
    if (!shifts.length) return [];
    const leaves = (ctx.leaves || []).filter(l => l && typeof l.employee_id === 'string');
    const list = planConflicts(shifts, leaves, { maxPerWeek: Number(ctx.planningMax) || 0 })
      .filter(c => { const d = dayDiff(ctx.today, c.date); return d >= 0 && d < WINDOW_DAYS; });
    if (!list.length) return [];
    const first = list[0], n = list.length, who = userName(ctx, first.employee_id);
    return [{
      id: alertId('hr', 'planning-conflicts'), page: 'hr', rule: 'planning-conflicts', severity: 'watch',
      title_fr: `${n} ${plural(n, 'conflit de planning', 'conflits de planning')} dans les ${WINDOW_DAYS} prochains jours`, title_en: `${n} planning ${plural(n, 'conflict', 'conflicts')} in the next ${WINDOW_DAYS} days`,
      why_fr: `Le plus proche : ${CONFLICT_LABEL[first.kind].fr.toLowerCase()}, ${who}, le ${fr(first.date)}. Rien n'est refusé : c'est au responsable de décider.`,
      why_en: `Nearest: ${CONFLICT_LABEL[first.kind].en.toLowerCase()}, ${who}, on ${first.date}. Nothing is refused: the manager decides.`,
      todo_fr: 'Ouvrir Ressources humaines, onglet Planning, et changer la vacation concernée.', todo_en: 'Open Human resources, Planning tab, and change the shift concerned.',
      since: first.date, value: n, go: { view: 'hr' },
    } as HealthAlert];
  },
};

export const planOver: HealthRule = {
  id: 'finance.plan-over', page: 'finance',
  run: (ctx: HealthContext) => {
    const s = ctx.settings as { monthly_plan?: unknown; budgets?: Record<string, number>; price_per_mission?: number };
    const plan = cleanMonthlyPlan(s.monthly_plan);
    const cur = budgetVsActual({ cash: ctx.cash, posts: ctx.posts, contracts: ctx.contracts, prices: ctx.settings, pricePerMission: s.price_per_mission || 0, clients: ctx.clients }, plan, s.budgets, ctx.today, 1)[0];
    if (!cur) return [];
    const out: HealthAlert[] = [];
    const mk = (kind: 'payroll' | 'expenses', line: { planned: number; actual: number; gap: number; status: string }, fr_: string, en_: string): void => {
      if (line.status !== 'bad') return;
      out.push({
        id: alertId('finance', 'plan-over', kind), page: 'finance', rule: 'plan-over', severity: 'watch',
        title_fr: `${fr_} au-dessus du prévu ce mois-ci`, title_en: `${en_} above plan this month`,
        why_fr: `Réel ${ar(line.actual)} contre ${ar(line.planned)} prévus : ${ar(-line.gap)} de trop.`, why_en: `Actual ${arEn(line.actual)} against ${arEn(line.planned)} planned: ${arEn(-line.gap)} over.`,
        todo_fr: 'Ouvrir Statistiques, onglet Finances, carte « Prévu contre réel » ; garder le prévu ou le corriger s\'il est trop bas.', todo_en: 'Open Statistics, Finance tab, "Planned vs actual" card; keep the plan or fix it if it is too low.',
        since: ctx.today.slice(0, 7) + '-01', value: Math.round(-line.gap), go: { view: 'stats' },
      } as HealthAlert);
    };
    mk('payroll', cur.payroll, 'Paie', 'Payroll');
    mk('expenses', cur.expenses, 'Dépenses', 'Expenses');
    return out;
  },
};

export const MANAGEMENT_RULES: HealthRule[] = [planningConflicts, planOver];
