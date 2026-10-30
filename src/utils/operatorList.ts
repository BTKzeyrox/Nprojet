// Liste des opérateurs : recherche, filtres (vacation, compte, statut en direct, niveau de performance) et tri. Règles pures, sans écran ;
// contrôlées par `npm run check:operator-list`. « Compte actif » = le compte n'est pas bloqué : cela NE dit RIEN de la présence (voir le statut en direct).
import type { User } from '../types';
import type { LiveInfo, LiveStatus } from './presenceStatus';

export type OpShift = 'all' | 'day' | 'night';
export type OpAccount = 'all' | 'active' | 'blocked';
export type OpLevel = 'all' | User['performance_badge'];
export type OpSort = 'name' | 'level' | 'live' | 'score';
export interface OpFilters { search: string; shift: OpShift; account: OpAccount; live: 'all' | LiveStatus; level: OpLevel; sort: OpSort }
export const OP_FILTERS_DEFAULT: OpFilters = { search: '', shift: 'all', account: 'all', live: 'all', level: 'all', sort: 'name' };
export interface OpItem { user: User; live: LiveInfo }

/** Texte sans accents, en minuscules, sans espaces en trop : « Rakoto  Éric » → « rakoto eric ». */
export const normalize = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const digits = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

export const isBlocked = (u: Pick<User, 'status'>): boolean => u.status === 'blocked';
const LEVEL_ORDER: Record<string, number> = { 'Top Booster': 0, Elite: 1, Standard: 2, 'Under Watch': 3 };
const LIVE_ORDER: Record<LiveStatus, number> = { working: 0, pause: 1, online: 2, offline: 3 };

/** Vrai si la recherche correspond au nom, à l'identifiant, au téléphone (chiffres seulement) ou à la vacation écrite. Chaque mot tapé doit se retrouver quelque part. */
export function matchesSearch(u: Pick<User, 'name' | 'username' | 'phone' | 'shift'>, q: string): boolean {
  const words = normalize(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = normalize(`${u.name} ${u.username} ${u.shift === 'night' ? 'nuit' : 'jour'}`);
  const ph = digits(u.phone);
  return words.every(w => hay.includes(w) || (digits(w).length >= 2 && ph.includes(digits(w))));
}

export function filterOperators(items: OpItem[], f: OpFilters): OpItem[] {
  const out = items.filter(({ user: u, live }) =>
    matchesSearch(u, f.search)
    && (f.shift === 'all' || (u.shift === 'night' ? 'night' : 'day') === f.shift)
    && (f.account === 'all' || (f.account === 'blocked') === isBlocked(u))
    && (f.live === 'all' || live.status === f.live)
    && (f.level === 'all' || u.performance_badge === f.level));
  const byName = (a: OpItem, b: OpItem) => a.user.name.localeCompare(b.user.name, 'fr');
  const score = (x: OpItem) => Number(x.user.total_score_boosted) || 0;
  return out.sort((a, b) =>
    f.sort === 'level' ? (LEVEL_ORDER[a.user.performance_badge] ?? 9) - (LEVEL_ORDER[b.user.performance_badge] ?? 9) || byName(a, b)
    : f.sort === 'live' ? LIVE_ORDER[a.live.status] - LIVE_ORDER[b.live.status] || byName(a, b)
    : f.sort === 'score' ? score(b) - score(a) || byName(a, b)
    : byName(a, b));
}

/** Nombre d'opérateurs par statut en direct, sur la liste donnée (avant les filtres de statut). */
export function liveCounts(items: OpItem[]): Record<LiveStatus, number> {
  const c: Record<LiveStatus, number> = { working: 0, online: 0, pause: 0, offline: 0 };
  for (const i of items) c[i.live.status]++;
  return c;
}

export function activeFilterCount(f: OpFilters): number {
  return (f.search.trim() ? 1 : 0) + (f.shift !== 'all' ? 1 : 0) + (f.account !== 'all' ? 1 : 0) + (f.live !== 'all' ? 1 : 0) + (f.level !== 'all' ? 1 : 0);
}
