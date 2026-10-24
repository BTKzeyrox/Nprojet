// Contrôles de la page Performance (module 11, M11.12). Règle pure : elle réutilise le calcul de performance (module 3), ne change rien.
// Limites écrites : on ne signale ici que la BAISSE DE VOLUME ; les retards, refus, missions trop rapides et l'inactivité ont déjà leurs règles (Équipe) : pas de doublon.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { computePerformance } from '../../performanceScore';
import { readCompany } from '../../companyRules';
import { list, plural } from './common';

export const volumeDrop: HealthRule = {
  id: 'performance.volume-drop', page: 'performance',
  run: (ctx) => {
    let leave: ReturnType<typeof readCompany>['leave'] | undefined;
    try { leave = readCompany((ctx.settings as any)?.company).leave; } catch { leave = undefined; }
    const res = computePerformance({ users: ctx.users, posts: ctx.posts, contracts: ctx.contracts, today: ctx.today, cfg: (ctx.settings as { performance?: unknown } | undefined)?.performance, lateLimitTime: leave?.late_limit_time, workDaysPerWeek: leave?.work_days_per_week });
    const drops = [...res.employees.values()].filter(e => e.attention.some(a => a.code === 'volume_drop'));
    if (!drops.length) return [];
    const n = drops.length, names = list(drops.map(e => e.name));
    return [{
      id: alertId('performance', 'volume-drop'), page: 'performance', rule: 'volume-drop', severity: 'watch',
      title_fr: `${n} ${plural(n, 'employé a', 'employés ont')} nettement moins de missions validées`, title_en: `${n} ${plural(n, 'employee has', 'employees have')} clearly fewer approved missions`,
      why_fr: `Baisse d'au moins 30 % par rapport à la période d'avant : ${names}.`, why_en: `Down at least 30% compared with the previous period: ${names}.`,
      todo_fr: 'En parler avec la personne : il peut y avoir une bonne raison (congé, moins de travail).', todo_en: 'Talk to the person: there may be a good reason (leave, less work).',
      since: null, value: n, go: { view: 'performance' },
    } as HealthAlert];
  },
};

export const PERFORMANCE_RULES: HealthRule[] = [volumeDrop];
