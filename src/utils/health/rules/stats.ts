// Contrôles statistiques (module 11, M11.6) : un chiffre s'écarte nettement de la médiane des périodes d'avant. Règles pures.
// Toujours deux chiffres dans la phrase. Minimum de périodes réglable (`min_periods`, 3 par défaut). Ce sont des SIGNAUX, jamais des accusations.
// Limites écrites : un mois exceptionnel (fête, saison) peut déclencher une alerte à tort : d'où « Ignorer ». Les mois sans aucune ligne ne comptent pas comme périodes.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { compareToMedian, median, monthProgress, previousMonths } from '../stats';
import { valueByMonth } from '../../stock';
import { shiftDay, userName, isEmployee, isWorked } from './common';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ar = (n: number, en = false): string => `${Math.round(n).toLocaleString(en ? 'en-US' : 'fr-FR').replace(/[  ]/g, ' ')} Ar`;
const GO = { view: 'stats', tab: 'finance' };
const good = (c: { amount_ar: number; date: string }): boolean => Number.isFinite(c.amount_ar) && c.amount_ar > 0 && DATE.test(c.date || '');

/** Totaux par mois (AAAA-MM) et par clé (catégorie, ou « * » pour tout). Jusqu'à aujourd'hui seulement. */
function monthly(ctx: Parameters<HealthRule['run']>[0], kind: 'in' | 'out'): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const c of ctx.cash) {
    if (c.kind !== kind || !good(c) || c.date > ctx.today) continue;
    const mo = c.date.slice(0, 7), m = out.get(mo) || new Map<string, number>();
    for (const k of ['*', c.category || 'Autres']) m.set(k, (m.get(k) || 0) + c.amount_ar);
    out.set(mo, m);
  }
  return out;
}
/** Mois précédents qui ont au moins une ligne d'argent (tous sens confondus) : ce sont les vraies périodes. */
function historyMonths(ctx: Parameters<HealthRule['run']>[0]): string[] {
  const has = new Set(ctx.cash.filter(c => good(c) && c.date <= ctx.today).map(c => c.date.slice(0, 7)));
  return previousMonths(ctx.today, 6).filter(m => has.has(m));
}

/** Une catégorie de dépenses du mois en cours est bien au-dessus de sa médiane (au prorata des jours écoulés). */
export const expenseSpike: HealthRule = {
  id: 'stats.expense-spike', page: 'finance',
  run: (ctx) => {
    const prog = monthProgress(ctx.today);
    if (prog.day < 7) return []; // trop tôt dans le mois pour comparer
    const hist = historyMonths(ctx), by = monthly(ctx, 'out'), now = by.get(ctx.today.slice(0, 7));
    if (!now || hist.length < ctx.thresholds.min_periods) return [];
    const out: HealthAlert[] = [];
    for (const [cat, cur] of now) {
      if (cat === '*') continue;
      const past = hist.map(m => by.get(m)?.get(cat) || 0);
      const cmp = compareToMedian(cur, past.map(x => x * prog.fraction), { minPeriods: ctx.thresholds.min_periods, upRatio: 2, minDiff: 10000 });
      if (cmp.direction !== 'up') continue;
      out.push({
        id: alertId('finance', 'expense-spike', cat), page: 'finance', rule: 'expense-spike', severity: cmp.ratio >= 4 ? 'urgent' : 'watch',
        title_fr: `Dépenses « ${cat} » bien au-dessus de la normale`, title_en: `"${cat}" expenses well above normal`,
        why_fr: `${ar(cur)} depuis le début du mois, contre ${ar(cmp.baseline)} en général sur la même durée (médiane de ${cmp.periods} mois).`,
        why_en: `${ar(cur, true)} since the start of the month, versus ${ar(cmp.baseline, true)} usually over the same time (median of ${cmp.periods} months).`,
        todo_fr: 'Regarder ces dépenses : achat exceptionnel ou erreur de saisie ?', todo_en: 'Look at these expenses: exceptional purchase or typing error?',
        since: ctx.today.slice(0, 7) + '-01', value: Math.round(cur), go: GO,
      } as HealthAlert);
    }
    return out;
  },
};

/** L'argent reçu ce mois-ci est bien en dessous de la médiane (au prorata), après le 10 du mois. */
export const incomeDrop: HealthRule = {
  id: 'stats.income-drop', page: 'finance',
  run: (ctx) => {
    const prog = monthProgress(ctx.today);
    if (prog.day < 10) return [];
    const hist = historyMonths(ctx), by = monthly(ctx, 'in');
    if (hist.length < ctx.thresholds.min_periods) return [];
    const cur = by.get(ctx.today.slice(0, 7))?.get('*') || 0, past = hist.map(m => (by.get(m)?.get('*') || 0) * prog.fraction);
    const cmp = compareToMedian(cur, past, { minPeriods: ctx.thresholds.min_periods, downRatio: 0.5, minDiff: 20000 });
    if (cmp.direction !== 'down') return [];
    return [{
      id: alertId('finance', 'income-drop'), page: 'finance', rule: 'income-drop', severity: cur === 0 ? 'urgent' : 'watch',
      title_fr: 'Moins d\'argent reçu que d\'habitude ce mois-ci', title_en: 'Less money received than usual this month',
      why_fr: `${ar(cur)} reçus depuis le début du mois, contre ${ar(cmp.baseline)} en général sur la même durée (médiane de ${cmp.periods} mois).`,
      why_en: `${ar(cur, true)} received since the start of the month, versus ${ar(cmp.baseline, true)} usually over the same time (median of ${cmp.periods} months).`,
      todo_fr: 'Vérifier les paiements clients en attente ou non saisis.', todo_en: 'Check pending or unrecorded client payments.',
      since: ctx.today.slice(0, 7) + '-01', value: Math.round(cmp.baseline - cur), go: GO,
    } as HealthAlert];
  },
};

/** La marge du dernier mois complet a chuté d'au moins 15 points par rapport à la médiane des mois d'avant. */
export const marginDrop: HealthRule = {
  id: 'stats.margin-drop', page: 'finance',
  run: (ctx) => {
    const months = previousMonths(ctx.today, 7), ins = monthly(ctx, 'in'), outs = monthly(ctx, 'out');
    const margin = (m: string): number | null => { const i = ins.get(m)?.get('*') || 0, o = outs.get(m)?.get('*') || 0; return i > 0 ? ((i - o) / i) * 100 : null; };
    const last = months[months.length - 1], cur = margin(last);
    const past = months.slice(0, -1).map(margin).filter((x): x is number => x !== null);
    if (cur === null || past.length < ctx.thresholds.min_periods) return [];
    const base = median(past);
    if (!(base - cur >= 15)) return [];
    return [{
      id: alertId('finance', 'margin-drop'), page: 'finance', rule: 'margin-drop', severity: cur < 0 ? 'urgent' : 'watch',
      title_fr: 'La marge a baissé', title_en: 'The margin has dropped',
      why_fr: `Marge de ${Math.round(cur)} % le mois dernier (${last.slice(5)}/${last.slice(0, 4)}), contre ${Math.round(base)} % en général (médiane de ${past.length} mois). Marge = (reçu − dépenses saisies) ÷ reçu.`,
      why_en: `Margin of ${Math.round(cur)}% last month (${last}), versus ${Math.round(base)}% usually (median of ${past.length} months). Margin = (received − recorded expenses) ÷ received.`,
      todo_fr: 'Comparer les dépenses et les entrées de ce mois avec les précédents.', todo_en: 'Compare this month\'s expenses and income with previous months.',
      since: last + '-01', value: Math.round(base - cur), go: GO,
    } as HealthAlert];
  },
};

/** La valeur du stock a chuté d'au moins 50 % par rapport à la médiane des mois d'avant. */
export const stockValueDrop: HealthRule = {
  id: 'stats.stock-value-drop', page: 'stock',
  run: (ctx) => {
    if (!ctx.products.length || !ctx.moves.length) return [];
    const v = valueByMonth(ctx.products, ctx.moves, ctx.today, 7), cur = v.values[v.values.length - 1], past = v.values.slice(0, -1).filter(x => x > 0);
    const cmp = compareToMedian(cur, past, { minPeriods: ctx.thresholds.min_periods, downRatio: 0.5, minDiff: 20000 });
    if (cmp.direction !== 'down') return [];
    return [{
      id: alertId('stock', 'value-drop'), page: 'stock', rule: 'value-drop', severity: 'watch',
      title_fr: 'La valeur du stock chute', title_en: 'The stock value is falling',
      why_fr: `${ar(cur)} aujourd'hui, contre ${ar(cmp.baseline)} en général (médiane de ${cmp.periods} mois). Valeur = quantité × prix d'achat.`,
      why_en: `${ar(cur, true)} today, versus ${ar(cmp.baseline, true)} usually (median of ${cmp.periods} months). Value = quantity × purchase price.`,
      todo_fr: 'Vérifier si c\'est voulu (ventes, usage) ou s\'il manque des entrées.', todo_en: 'Check whether it is intended (sales, usage) or whether entries are missing.',
      since: null, value: Math.round(cmp.baseline - cur), go: { view: 'stats', tab: 'stock' },
    } as HealthAlert];
  },
};

/** Volume de missions d'un salarié sur 7 jours : chute ou bond par rapport à la médiane des semaines d'avant. */
export const volumeChange: HealthRule = {
  id: 'stats.volume-change', page: 'team',
  run: (ctx) => {
    const out: HealthAlert[] = [], W = 7, weeks = 6;
    for (const u of ctx.users.filter(isEmployee)) {
      const mine = ctx.posts.filter(p => p.employee_id === u.id && isWorked(p) && DATE.test(p.date || '') && p.date < ctx.today);
      const bucket = (k: number) => { const to = shiftDay(ctx.today, -1 - k * W), from = shiftDay(to, -(W - 1)); return mine.filter(p => p.date >= from && p.date <= to).length; };
      const cur = bucket(0), past = Array.from({ length: weeks }, (_, i) => bucket(i + 1));
      const firstDay = mine.map(p => p.date).sort()[0];
      const usable = past.filter((_, i) => firstDay && firstDay <= shiftDay(ctx.today, -1 - (i + 1) * W)); // semaines où le salarié existait déjà
      const cmp = compareToMedian(cur, usable, { minPeriods: ctx.thresholds.min_periods, upRatio: 2, downRatio: 0.5, minDiff: 3 });
      if (cmp.direction === 'none') continue;
      const name = userName(ctx, u.id, u.name), down = cmp.direction === 'down';
      out.push({
        id: alertId('team', down ? 'volume-drop' : 'volume-jump', u.id), page: 'team', rule: down ? 'volume-drop' : 'volume-jump', severity: down ? 'watch' : 'info',
        title_fr: down ? `${name} fait beaucoup moins de missions` : `${name} fait beaucoup plus de missions`, title_en: down ? `${name} is doing far fewer missions` : `${name} is doing far more missions`,
        why_fr: `${cur} missions ces 7 derniers jours, contre ${Math.round(cmp.baseline * 10) / 10} en général par semaine (médiane de ${cmp.periods} semaines).`,
        why_en: `${cur} missions over the last 7 days, versus ${Math.round(cmp.baseline * 10) / 10} usually per week (median of ${cmp.periods} weeks).`,
        todo_fr: down ? 'En parler avec le salarié : congé, difficulté, manque de missions ?' : 'Vérifier que les missions sont réelles (preuves, temps passé) ; sinon, le féliciter.',
        todo_en: down ? 'Talk to the employee: leave, difficulty, lack of posts?' : 'Check the missions are genuine (proofs, time spent); otherwise, congratulate them.',
        since: shiftDay(ctx.today, -W), value: cur, go: { view: 'calendar' },
      } as HealthAlert);
    }
    return out;
  },
};

export const STATS_RULES: HealthRule[] = [expenseSpike, incomeDrop, marginDrop, stockValueDrop, volumeChange];
