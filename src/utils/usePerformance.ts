// Performance des salariés (module 3, M3.3) : branche les règles pures (performanceScore.ts) sur les données du site.
// Tout est calculé dans le navigateur, avec les missions déjà reçues : aucun appel serveur, aucune table.
// Un opérateur reçoit les missions de l'équipe (sans les justificatifs des autres) : il peut donc calculer, mais l'ÉCRAN
// ne lui montre que SON score et SES badges (`forEmployee`), jamais ceux des autres ni le classement (décisions D8 et D9).
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/store';
import type { User } from '../types';
import { readCompany } from './companyRules';
import { todayMada } from './stats';
import { computePerformance, type PerformanceInput, type PerformanceResult } from './performanceScore';

/** Réglages de la performance enregistrés dans les Réglages du site (étape M3.4). Vide = valeurs de départ. */
export const performanceConfigOf = (settings: unknown): unknown => (settings && typeof settings === 'object' ? (settings as { performance?: unknown }).performance : undefined);

/** Tout ce que le calcul lit : les comptes, les missions, les modèles de missions, la date du jour (Madagascar) et deux réglages des Conditions. */
export function performanceInput(): PerformanceInput {
  const settings = db.getSettings();
  const leave = readCompany(settings.company).leave;
  return {
    users: db.getUsers(), posts: db.getPosts(), contracts: db.getContracts(), today: todayMada(),
    cfg: performanceConfigOf(settings), lateLimitTime: leave.late_limit_time, workDaysPerWeek: leave.work_days_per_week,
  };
}

/** Empreinte légère : le calcul n'est refait que si une mission, un compte, un réglage ou le jour change. */
function signature(input: PerformanceInput): string {
  let h = 0;
  const feed = (s: string) => { for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; };
  for (const p of input.posts) { feed(p.id); feed(p.status); feed(p.date); feed(p.start_time || ''); feed(p.end_time || ''); feed(p.employee_id); }
  for (const u of input.users) { feed(u.id); feed(u.role); feed(u.status); feed(u.shift || ''); }
  for (const c of input.contracts) { feed(String(c.post_number ?? '')); feed(c.client_name || ''); feed(c.post_type || ''); }
  return `${input.today}|${input.posts.length}|${input.users.length}|${input.lateLimitTime}|${input.workDaysPerWeek}|${JSON.stringify(input.cfg ?? null)}|${h}`;
}

/** Score, badges et tendance de chaque salarié actif, recalculés quand les données changent. */
export function usePerformance(): { input: PerformanceInput; res: PerformanceResult } {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const input = performanceInput();
  const sig = signature(input);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ input, res: computePerformance(input) }), [sig]);
}

/** Mois civil précédent d'une date « AAAA-MM-JJ » (« AAAA-MM »). */
export function previousMonth(today: string): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface BadgeAccess { enabled: boolean; seesBadges: boolean; seesAttention: boolean }

/**
 * Réglages « Badges » de la page Conditions. Le responsable lit la page complète.
 * Un salarié ne reçoit que ce que le serveur lui envoie : tant qu'un réglage n'est pas ARRIVÉ à `true`, il est considéré comme « non » (accès fermé par défaut).
 */
export function badgeAccess(): BadgeAccess {
  const me = db.getCurrentUser();
  const company = db.getSettings().company;
  if (me && me.role === 'admin') { const o = readCompany(company).options; return { enabled: o.badges_enabled, seesBadges: o.employee_sees_badges, seesAttention: o.employee_sees_attention }; }
  const raw = (company && typeof company === 'object' ? (company as { options?: Record<string, unknown> }).options : undefined) || {};
  return { enabled: raw.badges_enabled === true, seesBadges: raw.employee_sees_badges === true, seesAttention: raw.employee_sees_attention === true };
}

/** Qui voit le score et les badges d'un salarié sur sa fiche Profil : le responsable, et la personne elle-même. Jamais un collègue (D8). */
export const canSeeProfileBadges = (me: User | null, target: User): boolean =>
  !!me && target.role === 'employee' && (me.role === 'admin' || (me.id === target.id && me.role === 'employee'));
