// Objectifs du mois et prévision simple (sans écran, sans serveur). Contrôlé par `npm run check:phase4`.
// Les objectifs d'argent ne sont jamais envoyés aux employés (le serveur les retire) : seul l'admin les calcule et les voit.
import { computeFinance, type FinanceInput } from './financeStats';
import { periodRange, daysBetween } from './stats';

export interface GoalSettings { goal_missions?: number; goal_profit_ar?: number; goal_max_expenses_ar?: number }

/** Chiffres du mois en cours (du 1er au dernier jour du mois de `today`). */
export interface MonthFigures { missions: number; profit: number; expenses: number; received: number; start: string; end: string; day: number; daysInMonth: number }

export function monthFigures(input: FinanceInput, today: string): MonthFigures {
  const r = periodRange('month', today);
  const f = computeFinance(input, 'month', r);
  return { missions: f.done, profit: f.profit, expenses: f.totalOut, received: f.received, start: r.start, end: r.end, day: daysBetween(r.start, today) + 1, daysInMonth: r.days };
}

export type GoalKey = 'missions' | 'profit' | 'expenses';
export type GoalState = 'good' | 'ok' | 'warn' | 'over';
export interface GoalRow {
  key: GoalKey; goal: number; value: number;
  pct: number; // avancement en % (pas plafonné : 130 = objectif dépassé de 30 %) ; jamais négatif
  kind: 'reach' | 'limit'; // reach = à atteindre (missions, bénéfice) ; limit = à ne pas dépasser (dépenses)
  state: GoalState;
}

const pos = (n: unknown): number => { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : 0; };

/** Une ligne par objectif réglé (0 ou vide = pas d'objectif). « warn » = en retard sur le rythme du mois, ou à 90 % du plafond. */
export function goalRows(s: GoalSettings, m: MonthFigures): GoalRow[] {
  const rows: GoalRow[] = [];
  const timePct = (m.day / m.daysInMonth) * 100; // où on en est dans le mois
  const reach = (key: GoalKey, goal: number, value: number) => {
    const pct = Math.max(0, Math.round((value / goal) * 100));
    rows.push({ key, goal, value, pct, kind: 'reach', state: pct >= 100 ? 'good' : pct >= timePct * 0.9 ? 'ok' : 'warn' });
  };
  const g1 = pos(s.goal_missions), g2 = pos(s.goal_profit_ar), g3 = pos(s.goal_max_expenses_ar);
  if (g1) reach('missions', g1, m.missions);
  if (g2) reach('profit', g2, m.profit);
  if (g3) { const pct = Math.max(0, Math.round((m.expenses / g3) * 100)); rows.push({ key: 'expenses', goal: g3, value: m.expenses, pct, kind: 'limit', state: m.expenses > g3 ? 'over' : pct >= 90 ? 'warn' : 'ok' }); }
  return rows;
}

export interface Forecast { missions: number; profit: number; expenses: number; received: number; day: number; daysInMonth: number }

/** Prévision linéaire : ce qu'on a fait depuis le 1er, au même rythme jusqu'à la fin du mois. Trop tôt (moins de 3 jours) = pas de prévision. */
export function forecastMonth(m: MonthFigures): Forecast | null {
  if (m.day < 3) return null;
  const k = m.daysInMonth / m.day;
  const r = (v: number) => Math.round(v * k);
  return { missions: r(m.missions), profit: r(m.profit), expenses: r(m.expenses), received: r(m.received), day: m.day, daysInMonth: m.daysInMonth };
}
