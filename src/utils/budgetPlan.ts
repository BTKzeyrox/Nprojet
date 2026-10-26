// Budget prévu contre réel (module 15, M15.4). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:budget-plan`.
// PRÉVU : dépenses = total des budgets par catégorie du module 4 (réglage `budgets`, réutilisé tel quel) ; revenus et paie = deux montants
// mensuels du réglage `monthly_plan` (réservé au responsable : jamais envoyé à un salarié). RÉEL : toujours CALCULÉ par `computeFinance`
// (argent reçu, dépenses payées, salaires des missions validées) : jamais saisi. Aucune nouvelle table.
// Le bloc « BEGIN BUDGETPLAN … END BUDGETPLAN » est copié mot pour mot dans df-api (bloc BUDGETPLAN) : `check:budget-plan` compare les deux textes.
// IMPORTANT : ce bloc ne doit utiliser ni import ni constante extérieure.
import { computeFinance, type FinanceInput } from './financeStats';
import { periodRange } from './stats';

export interface MonthlyPlan { revenue_ar: number; payroll_ar: number }

// BEGIN BUDGETPLAN
const BP_MAX_AR = 10000000000; // 10 milliards d'Ar par mois : au-delà, c'est une faute de frappe
const bpAmount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= BP_MAX_AR ? Math.round(v) : null);

type MonthlyPlanError = 'revenue' | 'payroll' | 'format';
/** Vérifie le plan saisi : deux montants entiers en Ar par mois, de 0 (pas de prévu) à 10 milliards. */
function checkMonthlyPlan(d: { [k: string]: unknown }): { ok: true; value: { revenue_ar: number; payroll_ar: number } } | { ok: false; error: MonthlyPlanError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  const revenue = d.revenue_ar === undefined || d.revenue_ar === null ? 0 : bpAmount(d.revenue_ar);
  if (revenue === null) return { ok: false, error: 'revenue' };
  const payroll = d.payroll_ar === undefined || d.payroll_ar === null ? 0 : bpAmount(d.payroll_ar);
  if (payroll === null) return { ok: false, error: 'payroll' };
  return { ok: true, value: { revenue_ar: revenue, payroll_ar: payroll } };
}

/** Nettoie le plan reçu (réglages) : un montant faux devient 0, jamais d'erreur. */
function cleanMonthlyPlan(raw: unknown): { revenue_ar: number; payroll_ar: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { revenue_ar: 0, payroll_ar: 0 };
  const r = raw as { [k: string]: unknown };
  return { revenue_ar: bpAmount(r.revenue_ar) ?? 0, payroll_ar: bpAmount(r.payroll_ar) ?? 0 };
}
// END BUDGETPLAN

export { checkMonthlyPlan, cleanMonthlyPlan };
export const MONTHLY_PLAN_ERROR_MESSAGE: Record<string, string> = {
  revenue: 'Revenus prévus : un montant en Ar, de 0 à 10 000 000 000.', payroll: 'Paie prévue : un montant en Ar, de 0 à 10 000 000 000.', format: 'Plan non valide.',
};

/** good = dans le prévu ; watch = 80 % du plafond atteint (dépenses, paie) ou revenus à 80 % ; bad = plafond dépassé ou revenus sous 80 % ; open = mois en cours, cible pas encore atteinte ; none = rien de prévu. */
export type PlanStatus = 'good' | 'watch' | 'bad' | 'open' | 'none';
export interface PlanLine { planned: number; actual: number; gap: number; status: PlanStatus }
export interface PlanMonth { month: string; partial: boolean; revenue: PlanLine; expenses: PlanLine; payroll: PlanLine; profit: PlanLine }
export const PLAN_STATUS_LABEL: Record<PlanStatus, { fr: string; en: string }> = {
  good: { fr: 'Dans le prévu', en: 'On plan' }, watch: { fr: 'Attention', en: 'Watch' }, bad: { fr: 'Hors prévu', en: 'Off plan' }, open: { fr: 'En cours', en: 'In progress' }, none: { fr: 'Rien de prévu', en: 'Nothing planned' },
};

/** Total des budgets mensuels par catégorie du module 4 (seuls les montants positifs comptent). */
export const plannedExpenses = (budgets: Record<string, number> | undefined): number => Object.values(budgets || {}).reduce((t, v) => t + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0), 0);

/** Revenus : l'écart = réel − prévu (positif = mieux que prévu). */
const revenueLine = (planned: number, actual: number, partial: boolean): PlanLine => {
  const gap = actual - planned;
  if (planned <= 0) return { planned, actual, gap, status: 'none' };
  if (actual >= planned) return { planned, actual, gap, status: 'good' };
  if (partial) return { planned, actual, gap, status: 'open' };
  return { planned, actual, gap, status: actual >= planned * 0.8 ? 'watch' : 'bad' };
};
/** Dépenses et paie : l'écart = prévu − réel (positif = il reste de la marge, négatif = dépassé). */
const costLine = (planned: number, actual: number): PlanLine => {
  const gap = planned - actual;
  if (planned <= 0) return { planned, actual, gap, status: 'none' };
  return { planned, actual, gap, status: actual > planned ? 'bad' : actual >= planned * 0.8 ? 'watch' : 'good' };
};
/** Bénéfice : prévu = revenus − dépenses − paie prévus ; l'écart = réel − prévu. Pas de prévu du tout = aucune comparaison. */
const profitLine = (planned: number, actual: number, partial: boolean, anyPlan: boolean): PlanLine => {
  const gap = actual - planned;
  if (!anyPlan) return { planned, actual, gap, status: 'none' };
  if (actual >= planned) return { planned, actual, gap, status: 'good' };
  return { planned, actual, gap, status: partial ? 'open' : 'bad' };
};

/**
 * Prévu contre réel pour les `count` derniers mois, jusqu'au mois de `today` (le mois en cours est marqué `partial`). Du plus ancien au plus récent.
 * Réel : `computeFinance` sur chaque mois (reçu, dépenses payées, salaires des missions validées).
 */
export function budgetVsActual(input: FinanceInput, plan: MonthlyPlan, budgets: Record<string, number> | undefined, today: string, count = 6): PlanMonth[] {
  const cur = today.slice(0, 7);
  const months: string[] = [];
  let [y, m] = [Number(cur.slice(0, 4)), Number(cur.slice(5, 7))];
  for (let i = 0; i < Math.max(1, Math.min(24, count)); i++) { months.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (m < 1) { m = 12; y--; } }
  const exp = plannedExpenses(budgets), rev = Math.max(0, Math.round(plan.revenue_ar) || 0), pay = Math.max(0, Math.round(plan.payroll_ar) || 0);
  const anyPlan = exp > 0 || rev > 0 || pay > 0;
  return months.map((month) => {
    const f = computeFinance(input, 'month', periodRange('month', `${month}-15`));
    const partial = month === cur;
    return {
      month, partial,
      revenue: revenueLine(rev, f.received, partial), expenses: costLine(exp, f.spent), payroll: costLine(pay, f.salaries),
      profit: profitLine(rev - exp - pay, f.profit, partial, anyPlan),
    };
  });
}
