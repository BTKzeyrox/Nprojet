// Performance des salariés (module 3, partie A) : score 0-100, badges à niveaux, tendance, points d'attention, employé du mois.
// Règles pures : aucun écran, aucun serveur, aucune table. Tout est CALCULÉ (rien n'est donné à la main) et toujours EXPLIQUÉ (« pourquoi »).
// Décisions : voir TODO_MODULES.md, étape M3.1. Dates = textes « AAAA-MM-JJ » (jour de Madagascar), calculs en UTC.
import type { ClientContract, PostSession, User } from '../types';
import { workingDays } from './leaves';
import { addDays, daysBetween } from './stats';

export interface Bilingual { fr: string; en: string }

/** Seuils et poids (réglables à l'étape M3.4 ; ces valeurs sont celles de départ). */
export interface PerformanceConfig {
  window_days: number; // fenêtre du score
  score_min_missions: number; // missions jugées (validées + refusées) minimum pour afficher un score
  quality_min_missions: number; // idem pour le badge Qualité, le rendement et l'employé du mois
  weights: { quality: number; volume: number; punctuality: number; regularity: number };
  quality_levels: [number, number, number]; // % de missions validées : Bronze, Argent, Or
  punctuality_levels: [number, number, number]; // % de jours sans retard
  streak_levels: [number, number, number]; // jours de travail d'affilée
  rendement_levels: [number, number, number]; // % de missions par heure au-dessus de l'équipe
  versatility_levels: [number, number, number]; // types de mission différents
  rookie_missions: number; // « Recrue prometteuse » : nombre de premières missions
  rookie_days: number; // …et première mission il y a moins de N jours
  month_min_team: number; // « Employé du mois » : salariés actifs minimum
  min_duration_min: number; // durée plus courte = absurde, ignorée
  max_duration_min: number; // durée plus longue = absurde, ignorée
  default_work_days: number; // jours travaillés par semaine si les Conditions ne le disent pas
}

export const PERFORMANCE_DEFAULTS: PerformanceConfig = {
  window_days: 30, score_min_missions: 10, quality_min_missions: 20,
  weights: { quality: 40, volume: 25, punctuality: 20, regularity: 15 },
  quality_levels: [90, 95, 98], punctuality_levels: [90, 95, 100], streak_levels: [5, 10, 20],
  rendement_levels: [10, 25, 40], versatility_levels: [2, 3, 5],
  rookie_missions: 10, rookie_days: 90, month_min_team: 5,
  min_duration_min: 2, max_duration_min: 960, default_work_days: 6,
};

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const intIn = (v: unknown, lo: number, hi: number, d: number) => (isNum(v) && v >= lo && v <= hi ? Math.round(v) : d);
function levelsIn(v: unknown, lo: number, hi: number, d: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(x => isNum(x) && x >= lo && x <= hi)) return d;
  const a = v.map(x => Math.round((x as number) * 10) / 10) as [number, number, number];
  return a[0] < a[1] && a[1] < a[2] ? a : d; // les niveaux doivent monter : sinon on garde ceux de départ
}

/** Réglages reçus (du serveur ou du navigateur) → réglages sûrs : toute valeur invalide retombe sur celle de départ. */
export function cleanPerformanceConfig(raw: unknown): PerformanceConfig {
  const d = PERFORMANCE_DEFAULTS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const w = (r.weights && typeof r.weights === 'object' ? r.weights : {}) as Record<string, unknown>;
  const weights = {
    quality: intIn(w.quality, 0, 100, d.weights.quality), volume: intIn(w.volume, 0, 100, d.weights.volume),
    punctuality: intIn(w.punctuality, 0, 100, d.weights.punctuality), regularity: intIn(w.regularity, 0, 100, d.weights.regularity),
  };
  const sum = weights.quality + weights.volume + weights.punctuality + weights.regularity;
  return {
    window_days: intIn(r.window_days, 7, 90, d.window_days),
    score_min_missions: intIn(r.score_min_missions, 1, 200, d.score_min_missions),
    quality_min_missions: intIn(r.quality_min_missions, 1, 500, d.quality_min_missions),
    weights: sum > 0 ? weights : d.weights, // des poids tous à zéro n'ont aucun sens
    quality_levels: levelsIn(r.quality_levels, 1, 100, d.quality_levels),
    punctuality_levels: levelsIn(r.punctuality_levels, 1, 100, d.punctuality_levels),
    streak_levels: levelsIn(r.streak_levels, 1, 365, d.streak_levels),
    rendement_levels: levelsIn(r.rendement_levels, 1, 500, d.rendement_levels),
    versatility_levels: levelsIn(r.versatility_levels, 1, 50, d.versatility_levels),
    rookie_missions: intIn(r.rookie_missions, 3, 100, d.rookie_missions),
    rookie_days: intIn(r.rookie_days, 7, 365, d.rookie_days),
    month_min_team: intIn(r.month_min_team, 2, 100, d.month_min_team),
    min_duration_min: intIn(r.min_duration_min, 0, 60, d.min_duration_min),
    max_duration_min: intIn(r.max_duration_min, 60, 1440, d.max_duration_min),
    default_work_days: intIn(r.default_work_days, 1, 7, d.default_work_days),
  };
}

export type BadgeId = 'quality' | 'punctuality' | 'regularity' | 'rendement' | 'versatility' | 'rookie';
export type BadgeLevel = 1 | 2 | 3; // Bronze, Argent, Or
export const LEVEL_NAMES: Record<BadgeLevel, Bilingual> = { 1: { fr: 'Bronze', en: 'Bronze' }, 2: { fr: 'Argent', en: 'Silver' }, 3: { fr: 'Or', en: 'Gold' } };

export interface Badge { id: BadgeId; level: BadgeLevel; why: Bilingual; value: number; next?: Bilingual }
export interface Attention { code: string; fr: string; en: string }

export interface WindowStats {
  start: string; end: string;
  done: number; rejected: number; decided: number;
  rate: number | null; // % validées (null si aucune mission jugée)
  activeDays: number; workedDays: number; lateDays: number;
  hours: number; perHour: number | null;
  types: string[]; suspectFast: number; bestStreak: number;
}

export interface Components { quality: number | null; volume: number | null; punctuality: number | null; regularity: number | null }

export interface EmployeePerformance {
  id: string; name: string;
  window: WindowStats;
  enough: boolean; // assez de missions jugées pour un score
  score: number | null; // 0 à 100, null = « pas assez de données »
  components: Components;
  badges: Badge[];
  trend: { scores: (number | null)[]; delta: number | null }; // du plus récent au plus ancien (3 fenêtres)
  attention: Attention[]; // POUR L'ADMIN SEULEMENT (jamais envoyé au salarié)
}

export interface PerformanceInput {
  users: User[];
  posts: PostSession[];
  contracts: ClientContract[];
  today: string;
  cfg?: unknown; // réglages (nettoyés par cleanPerformanceConfig)
  lateLimitTime?: string; // « HH:MM » : heure limite de retard des Conditions ; vide = ponctualité non calculée
  workDaysPerWeek?: number; // jours travaillés par semaine des Conditions ; 0 ou vide = valeur de départ
  leaves?: { id?: string; employee_id: string; start_date: string; end_date: string; status: string }[]; // congés (M5.2) : les jours de congé ACCEPTÉ sortent des jours attendus (régularité)
}

export interface PerformanceResult {
  today: string;
  cfg: PerformanceConfig;
  team: { size: number; workers: number; avgDone: number | null; perHour: number | null };
  employees: Map<string, EmployeePerformance>;
}

// ---------- Préparation des missions ----------

interface Row { id: string; emp: string; date: string; status: string; start: string; dur: number | null; type: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayOfWeek = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = dimanche

function durationMin(p: PostSession): number | null {
  if (!p.end_time) return null;
  const s = new Date(`${p.date}T${p.start_time || '00:00:00'}Z`).getTime();
  let e = new Date(`${p.date}T${p.end_time}Z`).getTime();
  if (isNaN(s) || isNaN(e)) return null;
  if (e < s) e += 86400000; // passage de minuit
  return Math.round((e - s) / 60000);
}

function prepare(posts: PostSession[], contracts: ClientContract[]): Row[] {
  const seen = new Set<string>(); // une mission rouverte ou envoyée deux fois ne compte qu'une fois
  const rows: Row[] = [];
  const typeOf = (p: PostSession) => {
    const c = contracts.find(x => (p.post_number !== undefined && x.post_number === p.post_number) || x.client_name === p.client_name);
    return (c?.post_type || '').trim();
  };
  for (const p of posts) {
    if (!p || !p.employee_id || !DATE_RE.test(String(p.date)) || seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push({ id: p.id, emp: p.employee_id, date: p.date, status: p.status, start: String(p.start_time || '').slice(0, 5), dur: durationMin(p), type: typeOf(p) });
  }
  return rows;
}

interface Range { start: string; end: string; days: number }
const rangeOf = (end: string, days: number): Range => ({ start: addDays(end, -(days - 1)), end, days });

// ---------- Mesures d'un salarié sur une période ----------

interface Metrics extends WindowStats { timedDone: number; activeSet: Set<string> }

function metricsFor(rows: Row[], user: User, range: Range, cfg: PerformanceConfig, lateLimit: string, sundayFree: boolean): Metrics {
  const inR = rows.filter(r => r.date >= range.start && r.date <= range.end);
  const done = inR.filter(r => r.status === 'completed');
  const rejected = inR.filter(r => r.status === 'rejected').length;
  const valid = (r: Row) => r.dur !== null && r.dur >= cfg.min_duration_min && r.dur <= cfg.max_duration_min;
  const timed = done.filter(valid);
  const hours = timed.reduce((t, r) => t + (r.dur as number), 0) / 60;
  const activeSet = new Set(done.map(r => r.date));

  // Ponctualité : la première mission de la journée commence-t-elle avant l'heure limite ? (salariés de jour, réglage rempli)
  let workedDays = 0, lateDays = 0;
  if (lateLimit && user.shift === 'day') {
    const first = new Map<string, string>();
    for (const r of inR) if (r.start) { const cur = first.get(r.date); if (!cur || r.start < cur) first.set(r.date, r.start); }
    workedDays = first.size;
    for (const s of first.values()) if (s > lateLimit) lateDays++;
  }

  // Série de jours d'affilée (le dimanche sans mission ne casse pas la série, sauf si on travaille 7 jours sur 7)
  let run = 0, best = 0;
  for (let i = 0; i < range.days; i++) {
    const d = addDays(range.start, i);
    if (activeSet.has(d)) { run++; if (run > best) best = run; }
    else if (!(sundayFree && dayOfWeek(d) === 0)) run = 0;
  }

  return {
    start: range.start, end: range.end,
    done: done.length, rejected, decided: done.length + rejected,
    rate: done.length + rejected > 0 ? (done.length / (done.length + rejected)) * 100 : null,
    activeDays: activeSet.size, workedDays, lateDays,
    hours, perHour: hours > 0 ? timed.length / hours : null,
    types: [...new Set(done.map(r => r.type).filter(Boolean))].sort(),
    suspectFast: done.filter(r => r.dur !== null && r.dur < cfg.min_duration_min).length,
    bestStreak: best, timedDone: timed.length, activeSet,
  };
}

interface Evaluated { user: User; m: Metrics; components: Components; score: number | null; enough: boolean }

function evaluate(rowsByEmp: Map<string, Row[]>, employees: User[], range: Range, cfg: PerformanceConfig, lateLimit: string, workDays: number, leaves: PerformanceInput['leaves'] = []): { list: Evaluated[]; team: PerformanceResult['team']; teamPerHour: number | null } {
  const sundayFree = workDays !== 7;
  const metrics = employees.map(u => ({ user: u, m: metricsFor(rowsByEmp.get(u.id) || [], u, range, cfg, lateLimit, sundayFree) }));
  const workers = metrics.filter(x => x.m.done > 0);
  const avgDone = workers.length ? workers.reduce((t, x) => t + x.m.done, 0) / workers.length : null;
  const teamHours = workers.reduce((t, x) => t + x.m.hours, 0);
  const teamPerHour = teamHours > 0 ? workers.reduce((t, x) => t + x.m.timedDone, 0) / teamHours : null;
  const expected = Math.max(1, Math.round((range.days * workDays) / 7));
  const w = cfg.weights;
  // Jours de congé accepté dans la fenêtre : ils ne sont pas des jours « attendus » pour CE salarié (jamais plus que tous les jours attendus moins un)
  const leaveDaysOf = (id: string): number => {
    let n = 0;
    for (const l of leaves || []) {
      if (l.employee_id !== id || l.status !== 'approved' || !DATE_RE.test(String(l.start_date)) || !DATE_RE.test(String(l.end_date))) continue;
      const s = l.start_date > range.start ? l.start_date : range.start, e = l.end_date < range.end ? l.end_date : range.end;
      if (s <= e) n += workingDays(s, e, workDays);
    }
    return Math.min(n, expected - 1);
  };

  const list: Evaluated[] = metrics.map(({ user, m }) => {
    const enough = m.decided >= cfg.score_min_missions;
    const components: Components = {
      quality: m.rate,
      volume: workers.length >= 2 && avgDone && avgDone > 0 ? Math.max(0, Math.min(100, (100 * m.done) / (1.2 * avgDone))) : null,
      punctuality: m.workedDays >= 5 ? (100 * (m.workedDays - m.lateDays)) / m.workedDays : null,
      regularity: Math.max(0, Math.min(100, (100 * m.activeDays) / Math.max(1, expected - leaveDaysOf(user.id)))),
    };
    let score: number | null = null;
    if (enough) {
      let num = 0, den = 0;
      (Object.keys(components) as (keyof Components)[]).forEach(k => { const v = components[k]; if (v !== null && w[k] > 0) { num += w[k] * v; den += w[k]; } });
      score = den > 0 ? Math.round(num / den) : null; // composantes absentes : les autres poids sont recalculés à 100 %
    }
    return { user, m, components, score, enough };
  });
  return { list, team: { size: employees.length, workers: workers.length, avgDone: avgDone === null ? null : Math.round(avgDone * 10) / 10, perHour: teamPerHour === null ? null : Math.round(teamPerHour * 100) / 100 }, teamPerHour };
}

const levelOf = (value: number, lv: [number, number, number]): 0 | BadgeLevel => (value >= lv[2] - 1e-9 ? 3 : value >= lv[1] - 1e-9 ? 2 : value >= lv[0] - 1e-9 ? 1 : 0);
const nextHint = (value: number, lv: [number, number, number], fr: (t: number) => string, en: (t: number) => string): Bilingual | undefined => {
  const t = lv.find(x => value < x - 1e-9);
  return t === undefined ? undefined : { fr: fr(t), en: en(t) };
};
const r1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const r1en = (n: number) => String(Math.round(n * 10) / 10);

function badgesOf(e: Evaluated, all: Row[], team: { workers: number }, teamPerHour: number | null, cfg: PerformanceConfig, today: string): Badge[] {
  const out: Badge[] = [];
  const { m, components } = e;
  // Qualité
  if (m.decided >= cfg.quality_min_missions && m.rate !== null) {
    const lv = levelOf(m.rate, cfg.quality_levels);
    if (lv) out.push({ id: 'quality', level: lv, value: m.rate, why: { fr: `${r1(m.rate)} % de missions validées sur ${m.decided} missions`, en: `${r1en(m.rate)}% of missions approved out of ${m.decided}` }, next: nextHint(m.rate, cfg.quality_levels, t => `Encore ${r1(t - m.rate!)} point(s) pour le niveau suivant (${t} %)`, t => `${r1en(t - m.rate!)} more point(s) for the next level (${t}%)`) });
  }
  // Ponctualité
  if (components.punctuality !== null) {
    const lv = levelOf(components.punctuality, cfg.punctuality_levels);
    if (lv) out.push({ id: 'punctuality', level: lv, value: components.punctuality, why: { fr: `${m.lateDays} retard${m.lateDays > 1 ? 's' : ''} sur ${m.workedDays} jours de travail`, en: `${m.lateDays} late day${m.lateDays === 1 ? '' : 's'} out of ${m.workedDays} working days` }, next: nextHint(components.punctuality, cfg.punctuality_levels, t => `Niveau suivant à ${t} % de jours sans retard`, t => `Next level at ${t}% of days without delay`) });
  }
  // Régularité : jours de travail d'affilée
  {
    const lv = levelOf(m.bestStreak, cfg.streak_levels);
    if (lv) out.push({ id: 'regularity', level: lv, value: m.bestStreak, why: { fr: `${m.bestStreak} jours de travail d'affilée`, en: `${m.bestStreak} working days in a row` }, next: nextHint(m.bestStreak, cfg.streak_levels, t => `Niveau suivant à ${t} jours d'affilée`, t => `Next level at ${t} days in a row`) });
  }
  // Rendement : missions par heure au-dessus de la moyenne de l'équipe
  if (m.done >= cfg.quality_min_missions && m.perHour !== null && teamPerHour !== null && teamPerHour > 0 && team.workers >= 2) {
    const pct = (m.perHour / teamPerHour - 1) * 100;
    const lv = levelOf(pct, cfg.rendement_levels);
    if (lv) out.push({ id: 'rendement', level: lv, value: pct, why: { fr: `${r1(pct)} % de missions par heure de plus que la moyenne de l'équipe`, en: `${r1en(pct)}% more missions per hour than the team average` } });
  }
  // Polyvalence
  {
    const n = m.types.length;
    const lv = levelOf(n, cfg.versatility_levels);
    if (lv) out.push({ id: 'versatility', level: lv, value: n, why: { fr: `${n} types de mission validés (${m.types.join(', ')})`, en: `${n} mission types approved (${m.types.join(', ')})` } });
  }
  // Recrue prometteuse : les premières missions toutes validées, première mission récente
  {
    const mine = all.filter(r => r.emp === e.user.id && (r.status === 'completed' || r.status === 'rejected')).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    const firstN = mine.slice(0, cfg.rookie_missions);
    if (firstN.length === cfg.rookie_missions && firstN.every(r => r.status === 'completed') && daysBetween(firstN[0].date, today) < cfg.rookie_days) {
      out.push({ id: 'rookie', level: 1, value: cfg.rookie_missions, why: { fr: `Ses ${cfg.rookie_missions} premières missions sont toutes validées`, en: `Their first ${cfg.rookie_missions} missions were all approved` } });
    }
  }
  return out;
}

function attentionOf(e: Evaluated, prev: Evaluated | undefined, doneLast7: number, cfg: PerformanceConfig): Attention[] {
  const out: Attention[] = [];
  const { m, components } = e;
  if (m.decided >= cfg.quality_min_missions && m.rate !== null && m.rate < 85) out.push({ code: 'low_quality', fr: `Taux de validation bas : ${r1(m.rate)} % sur ${m.decided} missions`, en: `Low approval rate: ${r1en(m.rate)}% out of ${m.decided} missions` });
  if (m.suspectFast >= 3) out.push({ code: 'too_fast', fr: `${m.suspectFast} missions validées en moins de ${cfg.min_duration_min} minutes (durées ignorées dans le calcul)`, en: `${m.suspectFast} missions approved in under ${cfg.min_duration_min} minutes (durations ignored in the calculation)` });
  if (components.punctuality !== null && components.punctuality < 80) out.push({ code: 'often_late', fr: `En retard ${m.lateDays} jour(s) sur ${m.workedDays}`, en: `Late ${m.lateDays} day(s) out of ${m.workedDays}` });
  if (prev && prev.m.done >= 10 && m.done <= prev.m.done * 0.7) out.push({ code: 'volume_drop', fr: `Volume en baisse de ${Math.round((1 - m.done / prev.m.done) * 100)} % par rapport à la période d'avant (${m.done} contre ${prev.m.done})`, en: `Volume down ${Math.round((1 - m.done / prev.m.done) * 100)}% compared to the previous period (${m.done} vs ${prev.m.done})` });
  if (doneLast7 === 0 && prev && (m.done > 0 || prev.m.done > 0)) out.push({ code: 'inactive_7d', fr: 'Aucune mission validée depuis 7 jours', en: 'No approved mission for 7 days' });
  return out;
}

const isActiveEmployee = (u: User) => u.role === 'employee' && u.status === 'active';

/** Score, badges, tendance et points d'attention de chaque salarié actif. */
export function computePerformance(input: PerformanceInput): PerformanceResult {
  const cfg = cleanPerformanceConfig(input.cfg);
  const today = input.today;
  const lateLimit = /^\d{2}:\d{2}$/.test(String(input.lateLimitTime || '')) ? String(input.lateLimitTime) : '';
  const workDays = isNum(input.workDaysPerWeek) && input.workDaysPerWeek >= 1 && input.workDaysPerWeek <= 7 ? Math.round(input.workDaysPerWeek) : cfg.default_work_days;
  const employees = input.users.filter(isActiveEmployee);
  const rows = prepare(input.posts, input.contracts);
  const rowsByEmp = new Map<string, Row[]>();
  for (const r of rows) { const l = rowsByEmp.get(r.emp); if (l) l.push(r); else rowsByEmp.set(r.emp, [r]); }

  // 3 fenêtres : la plus récente d'abord (score), puis les deux d'avant (tendance sur 90 jours)
  const ev = [0, 1, 2].map(k => evaluate(rowsByEmp, employees, rangeOf(addDays(today, -k * cfg.window_days), cfg.window_days), cfg, lateLimit, workDays, input.leaves));
  const prevById = new Map(ev[1].list.map(x => [x.user.id, x]));
  const out = new Map<string, EmployeePerformance>();
  const last7 = (id: string) => (rowsByEmp.get(id) || []).filter(r => r.status === 'completed' && r.date >= addDays(today, -6) && r.date <= today).length;

  ev[0].list.forEach((e, i) => {
    const scores = [e.score, ev[1].list[i].score, ev[2].list[i].score];
    out.set(e.user.id, {
      id: e.user.id, name: e.user.name, window: stripMetrics(e.m), enough: e.enough, score: e.score, components: e.components,
      badges: badgesOf(e, rows, ev[0].team, ev[0].teamPerHour, cfg, today),
      trend: { scores, delta: scores[0] !== null && scores[1] !== null ? scores[0] - scores[1] : null },
      attention: attentionOf(e, prevById.get(e.user.id), last7(e.user.id), cfg),
    });
  });
  return { today, cfg, team: ev[0].team, employees: out };
}

function stripMetrics(m: Metrics): WindowStats {
  const { timedDone: _t, activeSet: _a, ...rest } = m;
  return rest;
}

/** Ce que le salarié a le droit de voir sur lui-même (D8, D9) : son score et ses réussites, jamais ses points d'attention, jamais les autres. */
export function forEmployee(p: EmployeePerformance): Omit<EmployeePerformance, 'attention'> {
  const { attention: _hidden, ...mine } = p;
  return mine;
}

/** Classement par score (admin). Les ex æquo ont le même rang ; sans score = en fin de liste (rang null). */
export function rankByScore(res: PerformanceResult): { id: string; name: string; score: number | null; rank: number | null }[] {
  const list = [...res.employees.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  let rank = 0, shown = 0, lastScore: number | null | undefined;
  return list.map(p => {
    shown++;
    if (p.score === null) return { id: p.id, name: p.name, score: null, rank: null };
    if (p.score !== lastScore) { rank = shown; lastScore = p.score; }
    return { id: p.id, name: p.name, score: p.score, rank };
  });
}

export interface MonthWinner { id: string; name: string; score: number }
export interface EmployeeOfMonth { month: string; winners: MonthWinner[]; eligible: number; reason?: 'team_too_small' | 'nobody_eligible' }

/** Employé du mois : meilleur score du mois civil `AAAA-MM`. Au moins N salariés actifs ; il faut assez de missions jugées ; ex æquo = tous cités. L'admin confirme (M3.7). */
export function employeeOfMonth(input: PerformanceInput, month: string): EmployeeOfMonth {
  const cfg = cleanPerformanceConfig(input.cfg);
  const employees = input.users.filter(isActiveEmployee);
  if (!/^\d{4}-\d{2}$/.test(month)) return { month, winners: [], eligible: 0, reason: 'nobody_eligible' };
  if (employees.length < cfg.month_min_team) return { month, winners: [], eligible: 0, reason: 'team_too_small' };
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(); // le jour 0 du mois suivant
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  const lateLimit = /^\d{2}:\d{2}$/.test(String(input.lateLimitTime || '')) ? String(input.lateLimitTime) : '';
  const workDays = isNum(input.workDaysPerWeek) && input.workDaysPerWeek >= 1 && input.workDaysPerWeek <= 7 ? Math.round(input.workDaysPerWeek) : cfg.default_work_days;
  const rowsByEmp = new Map<string, Row[]>();
  for (const r of prepare(input.posts, input.contracts)) { const l = rowsByEmp.get(r.emp); if (l) l.push(r); else rowsByEmp.set(r.emp, [r]); }
  const range: Range = { start, end, days: daysBetween(start, end) + 1 };
  const { list } = evaluate(rowsByEmp, employees, range, cfg, lateLimit, workDays);
  const eligible = list.filter(x => x.score !== null && x.m.decided >= cfg.quality_min_missions);
  if (!eligible.length) return { month, winners: [], eligible: 0, reason: 'nobody_eligible' };
  const best = Math.max(...eligible.map(x => x.score as number));
  return { month, eligible: eligible.length, winners: eligible.filter(x => x.score === best).map(x => ({ id: x.user.id, name: x.user.name, score: best })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}
