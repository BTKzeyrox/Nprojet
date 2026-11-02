import type { CashEntry } from '../types';
import { addDays, daysBetween } from './stats';

// Données des graphiques de la Trésorerie : argent reçu et dépenses SEULEMENT (jamais de salaires). Pur : sans écran ni serveur.
export interface TreasuryCharts {
  labels: string[];
  fullLabels: string[];
  inflow: (number | null)[];
  outflow: (number | null)[];
  /** Solde cumulé du mois (reçu − dépenses) jour après jour. */
  balance: (number | null)[];
  inByCategory: { label: string; value: number }[];
  outByCategory: { label: string; value: number }[];
  received: number;
  spent: number;
}

const byCat = (list: CashEntry[]) => {
  const m = new Map<string, number>();
  for (const e of list) m.set(e.category, (m.get(e.category) || 0) + e.amount_ar);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

/** Un point par jour de la période. Les jours après `today` n'ont pas de point (null) : le jour n'est pas encore arrivé. */
export function treasuryCharts(cash: CashEntry[], range: { start: string; end: string }, today: string): TreasuryCharts {
  const days = daysBetween(range.start, range.end) + 1;
  const inRange = cash.filter(e => e.date >= range.start && e.date <= range.end);
  const labels: string[] = [], fullLabels: string[] = [];
  const inflow: (number | null)[] = [], outflow: (number | null)[] = [], balance: (number | null)[] = [];
  let run = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(range.start, i);
    labels.push(String(Number(d.slice(8, 10))));
    fullLabels.push(d.split('-').reverse().join('/'));
    if (d > today) { inflow.push(null); outflow.push(null); balance.push(null); continue; }
    let a = 0, b = 0;
    for (const e of inRange) if (e.date === d) { if (e.kind === 'in') a += e.amount_ar; else b += e.amount_ar; }
    run += a - b;
    inflow.push(a); outflow.push(b); balance.push(run);
  }
  const ins = inRange.filter(e => e.kind === 'in'), outs = inRange.filter(e => e.kind === 'out');
  return {
    labels, fullLabels, inflow, outflow, balance,
    inByCategory: byCat(ins), outByCategory: byCat(outs),
    received: ins.reduce((s, e) => s + e.amount_ar, 0), spent: outs.reduce((s, e) => s + e.amount_ar, 0),
  };
}

/** Argent en caisse depuis le début : tout ce qui est reçu moins toutes les dépenses, jusqu'à `today` compris (les lignes datées plus tard ne comptent pas encore). Jamais de salaires. */
export function cashSinceStart(cash: CashEntry[], today: string): { received: number; spent: number; balance: number } {
  let received = 0, spent = 0;
  for (const e of cash) {
    if (!e || e.date > today || !Number.isFinite(e.amount_ar)) continue;
    if (e.kind === 'in') received += e.amount_ar; else if (e.kind === 'out') spent += e.amount_ar;
  }
  return { received, spent, balance: received - spent };
}
