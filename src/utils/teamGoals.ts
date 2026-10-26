// Objectifs par salarié et par équipe (module 15, M15.3). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:team-goals`.
// À ne pas confondre avec `goals.ts` (module 4) : lui gère les objectifs d'argent de toute l'entreprise (missions, bénéfice, dépenses).
// Un objectif = un nom, une cible (« valeur prévue »), une mesure et un mois. La VALEUR RÉELLE est toujours CALCULÉE à partir des missions
// (jamais saisie) : missions validées, ou taux de validation (validées / jugées). Les objectifs vivent dans les réglages (clé `team_goals`,
// réservée au responsable) : aucune nouvelle table. Le serveur revérifie la liste à chaque enregistrement des réglages.
// Le bloc « BEGIN TEAMGOALS … END TEAMGOALS » est copié mot pour mot dans df-api (bloc TEAMGOALS) : `check:team-goals` compare les deux textes.
// IMPORTANT : ce bloc ne doit utiliser ni import ni constante extérieure.

export type TeamGoalScope = 'team' | 'employee';
export type TeamGoalMetric = 'done' | 'rate';
export interface TeamGoal { id: string; name: string; scope: TeamGoalScope; employee_id?: string; metric: TeamGoalMetric; target: number; month: string }

// BEGIN TEAMGOALS
const TG_MAX = 40;
const TG_NAME_MAX = 60;
const TG_METRICS = ['done', 'rate'];
const TG_SCOPES = ['team', 'employee'];
const tgClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

type TeamGoalError = 'name' | 'duplicate' | 'limit' | 'scope' | 'employee' | 'metric' | 'target' | 'month' | 'format';
type TeamGoalValue = { id: string; name: string; scope: string; employee_id?: string; metric: string; target: number; month: string };
/** Vérifie un objectif saisi. `others` = les autres objectifs (deux noms identiques refusés, 40 au plus). `month` vide = chaque mois. */
function checkTeamGoal(d: { [k: string]: unknown }, others: Array<{ id: string; name: string }>): { ok: true; value: TeamGoalValue } | { ok: false; error: TeamGoalError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  for (const k of ['id', 'name', 'scope', 'employee_id', 'metric', 'month']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const id = tgClean(d.id ?? '', 40);
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'format' };
  const name = tgClean(d.name ?? '', TG_NAME_MAX);
  if (!name) return { ok: false, error: 'name' };
  if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' };
  if (!id && others.length >= TG_MAX) return { ok: false, error: 'limit' };
  const scope = d.scope;
  if (typeof scope !== 'string' || !TG_SCOPES.includes(scope)) return { ok: false, error: 'scope' };
  let employee = '';
  if (scope === 'employee') {
    employee = typeof d.employee_id === 'string' ? d.employee_id.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(employee)) return { ok: false, error: 'employee' };
  }
  const metric = d.metric;
  if (typeof metric !== 'string' || !TG_METRICS.includes(metric)) return { ok: false, error: 'metric' };
  const target = d.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > (metric === 'rate' ? 100 : 100000)) return { ok: false, error: 'target' };
  const month = d.month === undefined || d.month === null ? '' : d.month;
  if (month !== '') {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month as string);
    if (!m || Number(m[1]) < 2000 || Number(m[1]) > 2100) return { ok: false, error: 'month' };
  }
  const value: TeamGoalValue = { id, name, scope, metric, target, month: month as string };
  if (scope === 'employee') value.employee_id = employee;
  return { ok: true, value };
}

/** Nettoie une liste reçue (réglages) : les objectifs faux sont ignorés, jamais d'erreur. */
function cleanTeamGoals(list: unknown): TeamGoalValue[] {
  if (!Array.isArray(list)) return [];
  const out: TeamGoalValue[] = [];
  for (const raw of list) {
    if (out.length >= TG_MAX) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as { [k: string]: unknown }).id;
    if (typeof id !== 'string' || !id) continue;
    const v = checkTeamGoal(raw as { [k: string]: unknown }, out);
    if (v.ok && !out.some((o) => o.id === v.value.id)) out.push(v.value);
  }
  return out;
}
// END TEAMGOALS

export const TEAM_GOAL_LIMITS = { max: TG_MAX, name: TG_NAME_MAX };
export { checkTeamGoal, cleanTeamGoals };
export const TEAM_GOAL_METRIC_LABEL: Record<TeamGoalMetric, { fr: string; en: string; unit: string }> = {
  done: { fr: 'Missions validées', en: 'Validated missions', unit: '' },
  rate: { fr: 'Taux de validation', en: 'Validation rate', unit: ' %' },
};
export const TEAM_GOAL_ERROR_MESSAGE: Record<string, string> = {
  name: 'Donne un nom à l\'objectif.', duplicate: 'Un objectif porte déjà ce nom.', limit: 'Maximum 40 objectifs.', scope: 'Choisis : toute l\'équipe ou un salarié.',
  employee: 'Choisis un salarié.', metric: 'Choisis la mesure.', target: 'Cible : un nombre entier (de 1 à 100 000 missions, ou de 1 à 100 %).',
  month: 'Mois non valide (AAAA-MM).', format: 'Objectif non valide.',
};
export const newTeamGoalId = (existing: Array<{ id: string }>): string => { let id = `tg-${Date.now().toString(36)}`; for (let k = 2; existing.some((g) => g.id === id); k++) id = `tg-${Date.now().toString(36)}-${k}`; return id; };

/** Un objectif sans mois vaut pour tous les mois ; avec un mois, seulement pour celui-là. */
export const teamGoalAppliesTo = (g: { month: string }, month: string): boolean => g.month === '' || g.month === month;

export interface TeamGoalActual { actual: number | null; done: number; rejected: number; decided: number }
/**
 * Valeur RÉELLE d'un objectif pour un mois (AAAA-MM), calculée à partir des missions : jamais saisie.
 * `done` = missions validées du mois ; `rate` = validées / (validées + refusées), arrondi, ou null si aucune mission n'est jugée.
 * Équipe = tous les salariés ; salarié = ses missions seulement. Le mois d'une mission est celui de sa date.
 */
export function teamGoalActual(goal: { scope: string; employee_id?: string; metric: string }, posts: Array<{ employee_id: string; status: string; date: string }>, month: string): TeamGoalActual {
  let done = 0, rejected = 0;
  for (const p of posts) {
    if (typeof p.date !== 'string' || p.date.slice(0, 7) !== month) continue;
    if (goal.scope === 'employee' && p.employee_id !== goal.employee_id) continue;
    if (p.status === 'completed') done++; else if (p.status === 'rejected') rejected++;
  }
  const decided = done + rejected;
  const actual = goal.metric === 'rate' ? (decided > 0 ? Math.round((done / decided) * 100) : null) : done;
  return { actual, done, rejected, decided };
}

export type TeamGoalStatus = 'reached' | 'open' | 'missed' | 'upcoming' | 'no_data';
export const TEAM_GOAL_STATUS_LABEL: Record<TeamGoalStatus, { fr: string; en: string }> = {
  reached: { fr: 'Atteint', en: 'Reached' }, open: { fr: 'En cours', en: 'In progress' }, missed: { fr: 'Non atteint', en: 'Missed' },
  upcoming: { fr: 'À venir', en: 'Upcoming' }, no_data: { fr: 'Aucune mission jugée', en: 'No judged mission' },
};
/** Situation d'un objectif : atteint, en cours (mois pas fini), non atteint (mois fini), à venir (mois futur), ou sans donnée (taux sans mission jugée). `today` = AAAA-MM-JJ. */
export function teamGoalStatus(goal: { target: number }, actual: number | null, month: string, today: string): TeamGoalStatus {
  const cur = today.slice(0, 7);
  if (month > cur) return 'upcoming';
  if (actual === null) return 'no_data';
  if (actual >= goal.target) return 'reached';
  return month < cur ? 'missed' : 'open';
}
/** Avancement en % (0 à 100, plafonné) et écart restant (0 si atteint). */
export const teamGoalProgress = (target: number, actual: number | null): { pct: number; gap: number } => {
  const a = actual === null ? 0 : actual;
  return { pct: target > 0 ? Math.max(0, Math.min(100, Math.round((a / target) * 100))) : 0, gap: Math.max(0, target - a) };
};

export interface ReviewGoalLine { month: string; goal: TeamGoal; actual: number | null; status: TeamGoalStatus }
/**
 * Lien avec les évaluations (M5.4) : les objectifs qui concernent ce salarié (équipe, ou le sien) pour chaque mois de la période de la fiche,
 * avec leur valeur réelle CALCULÉE. Sert d'aide à la rédaction du responsable ; rien n'est enregistré dans la fiche ni envoyé au salarié.
 * Au plus les 6 derniers mois de la période. Du plus ancien au plus récent.
 */
export function reviewGoalLines(goals: TeamGoal[], posts: Array<{ employee_id: string; status: string; date: string }>, employeeId: string, from: string, to: string, today: string): ReviewGoalLine[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return [];
  const months: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const last = to.slice(0, 7);
  for (let i = 0; i < 600; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    months.push(key);
    m++; if (m > 12) { m = 1; y++; }
  }
  const out: ReviewGoalLine[] = [];
  for (const month of months.slice(-6)) {
    for (const goal of goals) {
      if (!teamGoalAppliesTo(goal, month)) continue;
      if (goal.scope === 'employee' && goal.employee_id !== employeeId) continue;
      const { actual } = teamGoalActual(goal, posts, month);
      out.push({ month, goal, actual, status: teamGoalStatus(goal, actual, month, today) });
    }
  }
  return out;
}
