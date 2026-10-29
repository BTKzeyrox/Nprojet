// Contrôles de la page Paie et avances (module 11, lot 1). Règles pures.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { dayDiff, duration, list, plural, shiftDay } from './common';

/** Demandes d'avance en attente depuis plus de N jours. */
export const advancePendingOld: HealthRule = {
  id: 'payroll.advance-pending-old', page: 'payroll',
  run: (ctx) => {
    const T = ctx.thresholds.advance_pending_days;
    const old = ctx.advances.filter(a => a.status === 'pending' && /^\d{4}-\d{2}-\d{2}/.test(a.request_date || ''))
      .map(a => ({ a, d: dayDiff(a.request_date.slice(0, 10), ctx.today) })).filter(x => x.d >= T).sort((x, y) => y.d - x.d);
    if (!old.length) return [];
    const n = old.length, top = old[0];
    return [{
      id: alertId('payroll', 'advance-pending-old'), page: 'payroll', rule: 'advance-pending-old', severity: top.d >= 3 * T ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'demande d\'avance attend', 'demandes d\'avance attendent')} une réponse`, title_en: `${n} advance ${plural(n, 'request is', 'requests are')} waiting for an answer`,
      why_fr: `La plus ancienne date d'il y a ${duration(top.d * 24, 'fr')} (${top.a.employee_name}). Concerne : ${list([...new Set(old.map(x => x.a.employee_name))])}.`,
      why_en: `The oldest is ${duration(top.d * 24, 'en')} old (${top.a.employee_name}). Concerns: ${list([...new Set(old.map(x => x.a.employee_name))])}.`,
      todo_fr: 'Accepter ou refuser pour que le salarié sache à quoi s\'en tenir.', todo_en: 'Approve or decline so the employee knows where they stand.',
      since: top.a.request_date.slice(0, 10), value: n, go: { view: 'advances', nav: `adv-${top.a.id}` },
    } as HealthAlert];
  },
};

/** Un salarié a demandé 2 avances ou plus (acceptées ou en attente) en 30 jours. */
export const advanceTwice: HealthRule = {
  id: 'payroll.advance-twice', page: 'payroll',
  run: (ctx) => {
    const from = shiftDay(ctx.today, -29);
    const by = new Map<string, typeof ctx.advances>();
    for (const a of ctx.advances) {
      if (a.status === 'rejected' || !/^\d{4}-\d{2}-\d{2}/.test(a.request_date || '')) continue;
      const day = a.request_date.slice(0, 10);
      if (day < from || day > ctx.today) continue;
      const l = by.get(a.employee_id) || []; l.push(a); by.set(a.employee_id, l);
    }
    const out: HealthAlert[] = [];
    for (const [id, l] of by) {
      if (l.length < 2) continue;
      const total = l.reduce((s, a) => s + (Number.isFinite(a.amount_ar) ? a.amount_ar : 0), 0);
      const ar = `${Math.round(total).toLocaleString('fr-FR')} Ar`, arEn = `${Math.round(total).toLocaleString('en-US')} Ar`;
      out.push({
        id: alertId('payroll', 'advance-twice', id), page: 'payroll', rule: 'advance-twice', severity: 'watch',
        title_fr: `${l[0].employee_name} a demandé ${l.length} avances en 30 jours`, title_en: `${l[0].employee_name} requested ${l.length} advances in 30 days`,
        why_fr: `Total demandé : ${ar}. À comparer avec ce que le salarié a gagné ce mois-ci.`, why_en: `Total requested: ${arEn}. Compare with what the employee earned this month.`,
        todo_fr: 'Regarder la fiche de paie avant d\'accepter une nouvelle avance.', todo_en: 'Check the payroll sheet before approving another advance.',
        since: l.map(a => a.request_date.slice(0, 10)).sort()[0], value: l.length, go: { view: 'advances', nav: `adv-${l[l.length - 1].id}` },
      });
    }
    return out;
  },
};

export const PAYROLL_RULES: HealthRule[] = [advancePendingOld, advanceTwice];
