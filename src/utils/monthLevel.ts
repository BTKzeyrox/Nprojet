// Niveau de performance d'un opérateur = nombre de missions VALIDÉES dans le mois (du 1er au dernier jour, heure de Madagascar). Règle pure, calculée, jamais donnée à la main.
// Les 4 noms et les seuils se règlent dans Réglages (`perf_levels`). Rien ne bloque une mission : c'est un repère.
import type { PostSession, User } from '../types';

export interface LevelConfig { names: [string, string, string, string]; mins: [number, number, number]; very_low: number }
export const LEVEL_DEFAULTS: LevelConfig = { names: ['À suivre', 'Standard', 'Excellent', 'Top opérateur'], mins: [40, 60, 80], very_low: 20 };
/** Les anciens identifiants enregistrés sur les comptes, dans l'ordre des niveaux (filtres, exports). */
export const BADGE_BY_INDEX: User['performance_badge'][] = ['Under Watch', 'Standard', 'Elite', 'Top Booster'];

const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
/** Réglages reçus → réglages sûrs. Un nom vide ou trop long, des seuils qui ne montent pas, ou un « très faible » au-dessus du premier seuil : on garde ceux de départ. */
export function cleanLevels(raw: unknown): LevelConfig {
  const d = LEVEL_DEFAULTS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const names = Array.isArray(r.names) && r.names.length === 4 ? r.names.map((x, i) => { const t = typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim() : ''; return t.length >= 1 && t.length <= 24 ? t : d.names[i]; }) as LevelConfig['names'] : [...d.names] as LevelConfig['names'];
  const m = Array.isArray(r.mins) && r.mins.length === 3 && r.mins.every(x => isInt(x, 1, 999)) && (r.mins as number[])[0] < (r.mins as number[])[1] && (r.mins as number[])[1] < (r.mins as number[])[2] ? (r.mins as number[]).slice() as LevelConfig['mins'] : [...d.mins] as LevelConfig['mins'];
  const vl = isInt(r.very_low, 0, 999) && r.very_low <= m[0] ? r.very_low : Math.min(d.very_low, m[0]);
  return { names, mins: m, very_low: vl };
}

export const monthOf = (date: string): string => String(date || '').slice(0, 7);
/** Missions validées d'un opérateur dans un mois « AAAA-MM ». */
export const monthCount = (posts: Pick<PostSession, 'employee_id' | 'status' | 'date'>[], empId: string, month: string): number =>
  posts.filter(p => p.employee_id === empId && p.status === 'completed' && monthOf(p.date) === month).length;

export interface LevelInfo { count: number; index: 0 | 1 | 2 | 3; name: string; veryLow: boolean; next: { name: string; missing: number } | null }
export function levelInfo(count: number, cfg: LevelConfig): LevelInfo {
  const index = (count >= cfg.mins[2] ? 3 : count >= cfg.mins[1] ? 2 : count >= cfg.mins[0] ? 1 : 0) as 0 | 1 | 2 | 3;
  const next = index < 3 ? { name: cfg.names[index + 1], missing: cfg.mins[index as 0 | 1 | 2] - count } : null;
  return { count, index, name: cfg.names[index], veryLow: count < cfg.very_low, next };
}
/** « 27 missions ce mois · encore 13 pour Standard » (ou « niveau le plus haut »). */
export const levelLine = (i: LevelInfo): string => `${i.count} mission${i.count > 1 ? 's' : ''} ce mois${i.next ? ` · encore ${i.next.missing} pour ${i.next.name}` : ' · niveau le plus haut'}`;

/** Les `n` derniers mois (le mois en cours d'abord), « AAAA-MM ». */
export function lastMonths(currentMonth: string, n: number): string[] {
  const [y, m] = currentMonth.split('-').map(Number);
  return Array.from({ length: n }, (_, k) => { const t = new Date(Date.UTC(y, m - 1 - k, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; });
}
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const monthLabel = (ym: string): string => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_FR[(m || 1) - 1]} ${y}`; };

/** Niveau d'un opérateur ce mois-ci (`today` = « AAAA-MM-JJ » de Madagascar). */
export const levelNow = (posts: Pick<PostSession, 'employee_id' | 'status' | 'date'>[], empId: string, settings: { perf_levels?: unknown } | null | undefined, today: string): LevelInfo =>
  levelInfo(monthCount(posts, empId, monthOf(today)), cleanLevels(settings?.perf_levels));
