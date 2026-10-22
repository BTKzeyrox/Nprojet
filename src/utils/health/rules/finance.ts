// Contrôles de la page Finances (module 11, lot 2). Règles pures : elles ne changent aucune donnée.
// Limites écrites : pas de comparaison à la moyenne (M11.6) ; le solde ne compte que la caisse saisie (pas les salaires calculés).
import { alertId, hasEnough, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { normalizeName } from '../../clients';
import { shiftDay, plural } from './common';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ar = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} Ar`;
const arEn = (n: number): string => `${Math.round(n).toLocaleString('en-US')} Ar`;
const GO = { view: 'stats', tab: 'finance' };
const valid = (c: { amount_ar: number; date: string }): boolean => Number.isFinite(c.amount_ar) && DATE.test(c.date || '');

/** Caisse (entrées − sorties saisies) négative. */
export const cashNegative: HealthRule = {
  id: 'finance.cash-negative', page: 'finance',
  run: (ctx) => {
    const lines = ctx.cash.filter(c => valid(c) && c.date <= ctx.today);
    if (!hasEnough(lines.length, 3)) return [];
    const bal = lines.reduce((t, c) => t + (c.kind === 'in' ? 1 : -1) * c.amount_ar, 0);
    if (bal >= 0) return [];
    return [{
      id: alertId('finance', 'cash-negative'), page: 'finance', rule: 'cash-negative', severity: 'urgent',
      title_fr: 'La caisse est négative', title_en: 'The cash balance is negative',
      why_fr: `Entrées moins sorties saisies : ${ar(bal)}. Les salaires calculés ne sont pas comptés ici.`, why_en: `Recorded income minus expenses: ${arEn(bal)}. Calculated salaries are not counted here.`,
      todo_fr: 'Vérifier les entrées oubliées (paiements clients) ou les dépenses mal saisies.', todo_en: 'Check for forgotten income (client payments) or wrongly entered expenses.',
      since: null, value: Math.round(-bal), go: GO,
    } as HealthAlert];
  },
};

/** Lignes datées dans le futur. */
export const futureLines: HealthRule = {
  id: 'finance.future-lines', page: 'finance',
  run: (ctx) => {
    const f = ctx.cash.filter(c => DATE.test(c.date || '') && c.date > ctx.today).sort((a, b) => a.date.localeCompare(b.date));
    if (!f.length) return [];
    const n = f.length;
    return [{
      id: alertId('finance', 'future-lines'), page: 'finance', rule: 'future-lines', severity: 'watch',
      title_fr: `${n} ${plural(n, 'ligne d\'argent est datée', 'lignes d\'argent sont datées')} dans le futur`, title_en: `${n} money ${plural(n, 'line is', 'lines are')} dated in the future`,
      why_fr: `La première : le ${f[0].date.split('-').reverse().join('/')}. Une date fausse fausse aussi les totaux du mois.`, why_en: `The first one: ${f[0].date}. A wrong date also skews monthly totals.`,
      todo_fr: 'Corriger la date.', todo_en: 'Fix the date.', since: f[0].date, value: n, go: GO,
    } as HealthAlert];
  },
};

/** Paiement client sans nom de client (90 derniers jours). */
export const paymentNoClient: HealthRule = {
  id: 'finance.payment-no-client', page: 'finance',
  run: (ctx) => {
    const from = shiftDay(ctx.today, -89);
    const f = ctx.cash.filter(c => valid(c) && c.kind === 'in' && c.category === 'Paiement client' && !String(c.client_name || '').trim() && c.date >= from && c.date <= ctx.today);
    if (!f.length) return [];
    const n = f.length, total = f.reduce((t, c) => t + c.amount_ar, 0);
    return [{
      id: alertId('finance', 'payment-no-client'), page: 'finance', rule: 'payment-no-client', severity: 'info',
      title_fr: `${n} ${plural(n, 'paiement client n\'a pas', 'paiements clients n\'ont pas')} de client`, title_en: `${n} client ${plural(n, 'payment has', 'payments have')} no client`,
      why_fr: `Total ${ar(total)} sur 90 jours : ils ne comptent pour aucun client (classement, « pas de paiement »).`, why_en: `${arEn(total)} in total over 90 days: they count for no client (ranking, "no payment" alert).`,
      todo_fr: 'Ajouter le nom du client sur ces lignes.', todo_en: 'Add the client name on these lines.',
      since: f.map(c => c.date).sort()[0], value: n, go: GO,
    } as HealthAlert];
  },
};

/** Doublon probable : même sens, montant, date, catégorie et client. */
export const duplicates: HealthRule = {
  id: 'finance.duplicates', page: 'finance',
  run: (ctx) => {
    const from = shiftDay(ctx.today, -89), g = new Map<string, number>();
    for (const c of ctx.cash) {
      if (!valid(c) || c.date < from || c.date > ctx.today || !(c.amount_ar > 0)) continue;
      const k = [c.kind, Math.round(c.amount_ar), c.date, normalizeName(c.category), normalizeName(c.client_name || '')].join('|');
      g.set(k, (g.get(k) || 0) + 1);
    }
    const dup = [...g.entries()].filter(([, n]) => n >= 2);
    if (!dup.length) return [];
    const n = dup.length, first = dup.map(([k]) => k.split('|')[2]).sort()[0];
    return [{
      id: alertId('finance', 'duplicates'), page: 'finance', rule: 'duplicates', severity: 'watch',
      title_fr: `${n} ${plural(n, 'doublon probable', 'doublons probables')} dans l'argent`, title_en: `${n} probable ${plural(n, 'duplicate', 'duplicates')} in the money lines`,
      why_fr: `Des lignes ont le même sens, montant, date, catégorie et client (90 derniers jours). C'est un signal : deux achats identiques le même jour restent possibles.`,
      why_en: `Some lines share direction, amount, date, category and client (last 90 days). This is a signal: two identical purchases on the same day are possible.`,
      todo_fr: 'Regarder ces lignes et supprimer celle qui est en trop.', todo_en: 'Look at these lines and delete the extra one.', since: first, value: n, go: GO,
    } as HealthAlert];
  },
};

/** La catégorie « Autres » pèse trop dans les dépenses (90 jours, au moins 5 lignes). */
export const othersBig: HealthRule = {
  id: 'finance.others-big', page: 'finance',
  run: (ctx) => {
    const from = shiftDay(ctx.today, -89);
    const out = ctx.cash.filter(c => valid(c) && c.kind === 'out' && c.date >= from && c.date <= ctx.today && c.amount_ar > 0);
    if (!hasEnough(out.length, 5)) return [];
    const total = out.reduce((t, c) => t + c.amount_ar, 0), oth = out.filter(c => c.category === 'Autres').reduce((t, c) => t + c.amount_ar, 0);
    const pct = total > 0 ? Math.round((oth / total) * 100) : 0;
    if (pct < ctxPct(ctx)) return [];
    return [{
      id: alertId('finance', 'others-big'), page: 'finance', rule: 'others-big', severity: 'info',
      title_fr: 'La catégorie « Autres » est trop grosse', title_en: 'The "Others" category is too big',
      why_fr: `« Autres » = ${pct} % des dépenses sur 90 jours (${ar(oth)} sur ${ar(total)}). On ne sait plus à quoi sert l'argent.`, why_en: `"Others" = ${pct}% of expenses over 90 days (${arEn(oth)} of ${arEn(total)}). It is no longer clear what the money is for.`,
      todo_fr: 'Ranger ces dépenses dans les bonnes catégories.', todo_en: 'Move these expenses to proper categories.', since: null, value: pct, go: GO,
    } as HealthAlert];
  },
};
const ctxPct = (ctx: { thresholds: { others_pct: number } }): number => ctx.thresholds.others_pct;

export const FINANCE_RULES: HealthRule[] = [cashNegative, futureLines, paymentNoClient, duplicates, othersBig];
