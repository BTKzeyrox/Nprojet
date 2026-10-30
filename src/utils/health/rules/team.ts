// Contrôles de la page Équipe (module 11, lot 1) : absences, retards, refus, inactivité. Règles pures.
// Dimanche = repos. Un jour de congé ACCEPTÉ (module 5) ne compte pas comme absence ; une demande en attente ou refusée ne change rien.
import { alertId, hasEnough, type HealthContext, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { isLate } from '../../attendance';
import { leaveOn } from '../../leaves';
import { dayDiff, isEmployee, isSunday, isWorked, shiftDay } from './common';

const settingsOf = (ctx: HealthContext) => ({
  day_shift_start: ctx.settings.day_shift_start || '08:00', night_shift_start: ctx.settings.night_shift_start || '20:00',
  late_tolerance_min: typeof ctx.settings.late_tolerance_min === 'number' ? ctx.settings.late_tolerance_min : 15, shift_mode: ctx.settings.shift_mode,
});

/** Jours travaillés (au moins une session ni refusée ni libérée de force) d'un salarié. */
function workedDays(ctx: HealthContext, id: string): Set<string> {
  const s = new Set<string>();
  for (const p of ctx.posts) if (p.employee_id === id && p.date && isWorked(p)) s.add(p.date);
  return s;
}

/** Absent N jours de suite (jusqu'à hier ; aujourd'hui n'est pas fini). Il faut au moins 5 jours travaillés avant, pour connaître son rythme. */
export const absentStreak: HealthRule = {
  id: 'team.absent-streak', page: 'team',
  run: (ctx) => {
    const N = ctx.thresholds.absent_streak_days;
    const out: HealthAlert[] = [];
    for (const u of ctx.users.filter(isEmployee)) {
      const worked = workedDays(ctx, u.id);
      if (!hasEnough(worked.size, 5)) continue;
      const first = [...worked].sort()[0];
      let streak = 0, day = shiftDay(ctx.today, -1), start = '';
      for (let i = 0; i < 60 && day >= first; i++, day = shiftDay(day, -1)) {
        if (isSunday(day)) continue; // dimanche = repos : ne casse pas la série et ne compte pas
        if (leaveOn(ctx.leaves, u.id, day)) continue; // congé accepté : idem
        if (worked.has(day)) break;
        streak++; start = day;
      }
      if (streak < N) continue;
      if (dayDiff(start, ctx.today) > ctx.thresholds.inactive_days) continue; // trop ancien : c'est le cas « inactif »
      out.push({
        id: alertId('team', 'absent-streak', u.id), page: 'team', rule: 'absent-streak', severity: streak >= 5 ? 'urgent' : 'watch',
        title_fr: `${u.name} est absent depuis ${streak} jours`, title_en: `${u.name} has been absent for ${streak} days`,
        why_fr: `Aucune mission depuis le ${start.split('-').reverse().join('/')} (${streak} jours ouvrables, dimanches exclus). Les jours de congé accepté sont exclus.`,
        why_en: `No mission since ${start} (${streak} working days, Sundays excluded). Approved leave days are excluded.`,
        todo_fr: 'Prendre des nouvelles du salarié.', todo_en: 'Check in with the employee.',
        since: start, value: streak, go: { view: 'calendar' },
      });
    }
    return out;
  },
};

/** En retard N fois (jours différents) sur les derniers jours. */
export const lateOften: HealthRule = {
  id: 'team.late-often', page: 'team',
  run: (ctx) => {
    const { late_count: N, late_window_days: W } = ctx.thresholds, from = shiftDay(ctx.today, -(W - 1)), cfg = settingsOf(ctx);
    const out: HealthAlert[] = [];
    for (const u of ctx.users.filter(isEmployee)) {
      const mine = ctx.posts.filter(p => p.employee_id === u.id && p.date >= from && p.date <= ctx.today && isWorked(p));
      if (!hasEnough(new Set(mine.map(p => p.date)).size, N)) continue; // pas assez de jours travaillés pour juger
      const lateDays = [...new Set(mine.filter(p => isLate(p, cfg)).map(p => p.date))].sort();
      if (lateDays.length < N) continue;
      out.push({
        id: alertId('team', 'late-often', u.id), page: 'team', rule: 'late-often', severity: lateDays.length >= N + 2 ? 'urgent' : 'watch',
        title_fr: `${u.name} est souvent en retard`, title_en: `${u.name} is often late`,
        why_fr: `${lateDays.length} retards en ${W} jours (tolérance : ${cfg.late_tolerance_min} min).`, why_en: `${lateDays.length} late arrivals in ${W} days (tolerance: ${cfg.late_tolerance_min} min).`,
        todo_fr: 'En parler avec le salarié (horaires, transport…).', todo_en: 'Talk to the employee (schedule, transport…).',
        since: lateDays[0], value: lateDays.length, go: { view: 'calendar' },
      });
    }
    return out;
  },
};

/** Taux de refus élevé sur les 30 derniers jours (avec un minimum de missions pour que ce soit juste). */
export const refusalRate: HealthRule = {
  id: 'team.refusal-rate', page: 'team',
  run: (ctx) => {
    const { refusal_rate_pct: R, refusal_min_missions: M } = ctx.thresholds, from = shiftDay(ctx.today, -29);
    const out: HealthAlert[] = [];
    for (const u of ctx.users.filter(isEmployee)) {
      const mine = ctx.posts.filter(p => p.employee_id === u.id && p.date >= from && p.date <= ctx.today && (p.status === 'completed' || p.status === 'rejected'));
      if (!hasEnough(mine.length, M)) continue;
      const rej = mine.filter(p => p.status === 'rejected');
      const rate = (rej.length / mine.length) * 100;
      if (rate < R) continue;
      out.push({
        id: alertId('team', 'refusal-rate', u.id), page: 'team', rule: 'refusal-rate', severity: rate >= 50 ? 'urgent' : 'watch',
        title_fr: `${u.name} : beaucoup de missions refusées`, title_en: `${u.name}: many refused missions`,
        why_fr: `${rej.length} refusées sur ${mine.length} en 30 jours (${Math.round(rate)} %, seuil ${R} %).`, why_en: `${rej.length} refused out of ${mine.length} in 30 days (${Math.round(rate)}%, threshold ${R}%).`,
        todo_fr: 'Regarder les motifs de refus : consigne mal comprise ou travail à reprendre ?', todo_en: 'Check the refusal reasons: instruction misunderstood, or work to redo?',
        since: rej.map(p => p.date).sort()[0], value: Math.round(rate), go: { view: 'history' },
      });
    }
    return out;
  },
};

/** Salarié qui travaillait mais n'a plus de mission depuis longtemps (information, pas une alerte grave). */
export const inactiveWorker: HealthRule = {
  id: 'team.inactive', page: 'team',
  run: (ctx) => {
    const N = ctx.thresholds.inactive_days;
    const out: HealthAlert[] = [];
    for (const u of ctx.users.filter(isEmployee)) {
      const worked = workedDays(ctx, u.id);
      if (!hasEnough(worked.size, 5)) continue;
      const last = [...worked].sort().pop() as string, gap = dayDiff(last, ctx.today);
      if (gap < N) continue;
      if (leaveOn(ctx.leaves, u.id, ctx.today)) continue; // en congé accepté aujourd'hui : pas inactif
      out.push({
        id: alertId('team', 'inactive', u.id), page: 'team', rule: 'inactive', severity: 'info',
        title_fr: `${u.name} n'a plus de mission depuis ${gap} jours`, title_en: `${u.name} has had no missions for ${gap} days`,
        why_fr: `Dernière mission le ${last.split('-').reverse().join('/')}.`, why_en: `Last mission on ${last}.`,
        todo_fr: 'Vérifier si le compte est encore utile.', todo_en: 'Check whether the account is still needed.',
        since: last, value: gap, go: { view: 'employees', nav: `emp-${u.id}` },
      });
    }
    return out;
  },
};

export const TEAM_RULES: HealthRule[] = [absentStreak, lateOften, refusalRate, inactiveWorker];
