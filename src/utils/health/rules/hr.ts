// Contrôles de la page Ressources humaines (module 5 + module 11) : demandes de congé en attente, fin d'essai ou de contrat proche. Règles pures.
import { alertId, type HealthContext, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { endOfTermIn } from '../../hrFile';
import { dayDiff, isEmployee, madaDay, userName } from './common';

/** Une demande de congé qui attend une réponse depuis plus de 3 jours (la date de la demande compte). */
export const leavePending: HealthRule = {
  id: 'hr.leave-pending', page: 'hr',
  run: (ctx: HealthContext) => {
    const out: HealthAlert[] = [];
    for (const l of ctx.leaves || []) {
      if (l.status !== 'pending') continue;
      const asked = Date.parse(l.created_at);
      if (!Number.isFinite(asked)) continue;
      const day = madaDay(asked), waited = dayDiff(day, ctx.today);
      if (waited < 3) continue;
      if (l.end_date < ctx.today) continue; // le congé demandé est déjà passé : plus rien à décider
      const name = l.employee_name || userName(ctx, l.employee_id);
      out.push({
        id: alertId('hr', 'leave-pending', l.id), page: 'hr', rule: 'leave-pending', severity: l.start_date <= ctx.today ? 'urgent' : 'watch',
        title_fr: `Demande de congé de ${name} sans réponse depuis ${waited} jours`, title_en: `Leave request from ${name} unanswered for ${waited} days`,
        why_fr: `Congé du ${l.start_date.split('-').reverse().join('/')} au ${l.end_date.split('-').reverse().join('/')}, demandé le ${day.split('-').reverse().join('/')}.`,
        why_en: `Leave from ${l.start_date} to ${l.end_date}, requested on ${day}.`,
        todo_fr: 'Accepter ou refuser la demande (avec un motif).', todo_en: 'Approve or refuse the request (with a reason).',
        since: day, value: waited, go: { view: 'hr' },
      });
    }
    return out;
  },
};

/** Fin de la période d'essai ou du contrat à durée déterminée dans 14 jours ou moins (urgent à 3 jours ou moins). */
export const termEnding: HealthRule = {
  id: 'hr.term-ending', page: 'hr',
  run: (ctx: HealthContext) => {
    const out: HealthAlert[] = [];
    for (const u of ctx.users.filter(isEmployee)) {
      const e = endOfTermIn(u.hr, ctx.today);
      if (!e || e.days > 14) continue;
      const trial = e.kind === 'trial', when = e.days === 0;
      out.push({
        id: alertId('hr', trial ? 'trial-ending' : 'contract-ending', u.id), page: 'hr', rule: trial ? 'trial-ending' : 'contract-ending', severity: e.days <= 3 ? 'urgent' : 'watch',
        title_fr: `${trial ? "Fin de la période d'essai" : 'Fin du contrat'} de ${u.name} ${when ? "aujourd'hui" : `dans ${e.days} jours`}`,
        title_en: `${trial ? 'Trial period' : 'Contract'} of ${u.name} ends ${when ? 'today' : `in ${e.days} days`}`,
        why_fr: `Date prévue dans le dossier : ${e.date.split('-').reverse().join('/')}.`, why_en: `Date set in the file: ${e.date}.`,
        todo_fr: trial ? "Décider de confirmer ou non, et mettre à jour le dossier." : 'Décider de renouveler ou non, et mettre à jour le dossier.',
        todo_en: trial ? 'Decide whether to confirm, and update the file.' : 'Decide whether to renew, and update the file.',
        since: ctx.today, value: e.days, go: { view: 'hr' },
      });
    }
    return out;
  },
};

export const HR_RULES: HealthRule[] = [leavePending, termEnding];
