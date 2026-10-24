// Export des scores et des badges (module 3, M3.8) : tableau Excel/CSV de la page Performance et section du rapport mensuel.
// Règles pures (sans écran, sans serveur). Contrôlé par `npm run check:performance-export`.
// Réservé au responsable : le rapport contient déjà des chiffres d'argent et ne sort jamais vers un salarié.
import { LEVEL_NAMES, rankByScore, type Badge, type PerformanceResult } from './performanceScore';
import { BADGE_NAMES } from './recognition';
import { CLIENT_BADGE_NAMES, clientsToWatch, type ClientBadgeResult } from './clientBadges';

export type Cell = string | number;
const en = (lang: string) => lang === 'en';

/** « Qualité · Or », « Recrue prometteuse ». */
export const badgeLabel = (b: Badge, lang: string): string =>
  b.id === 'rookie' ? (en(lang) ? BADGE_NAMES.rookie.en : BADGE_NAMES.rookie.fr)
    : `${en(lang) ? BADGE_NAMES[b.id].en : BADGE_NAMES[b.id].fr} · ${en(lang) ? LEVEL_NAMES[b.level].en : LEVEL_NAMES[b.level].fr}`;

export interface ScoreCells { score: number | null; badges: string; trend: number | null; attention: number }

/** Score, badges et tendance de chaque salarié actif, en cellules de tableau. */
export function scoreCellsFor(res: PerformanceResult, lang: string): Map<string, ScoreCells> {
  const out = new Map<string, ScoreCells>();
  for (const p of res.employees.values()) out.set(p.id, { score: p.score, badges: p.badges.map(b => badgeLabel(b, lang)).join(' ; '), trend: p.trend.delta, attention: p.attention.length });
  return out;
}

export interface PerfRowLike { id: string; name: string; done: number; rejected: number; open: number; rate: number | null; avgMin: number | null }

/** En-têtes et lignes du tableau Performance. Sans `scores` : les 6 colonnes d'origine (rien ne change pour qui n'utilise pas les badges). */
export function performanceAoa(rows: PerfRowLike[], total: PerfRowLike, scores: Map<string, ScoreCells> | null, windowDays: number, lang: string): Cell[][] {
  const base = (r: PerfRowLike): Cell[] => [r.name, r.done, r.rejected, r.open, r.rate ?? '', r.avgMin ?? ''];
  const head: Cell[] = ['Opérateur', 'Terminées', 'Refusées', 'En cours', 'Taux d’acceptation (%)', 'Délai moyen (min)'];
  if (!scores) return [head, ...rows.map(base), base(total)];
  const t = (fr: string, e: string) => (en(lang) ? e : fr);
  const extra = (r: PerfRowLike): Cell[] => { const c = scores.get(r.id); return c ? [c.score ?? '', c.trend ?? '', c.badges, c.attention] : ['', '', '', '']; };
  const known = rows.map(r => scores.get(r.id)?.score).filter((x): x is number => typeof x === 'number');
  const avg = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : '';
  return [
    [...head, t(`Score (${windowDays} j)`, `Score (${windowDays} d)`), t('Tendance (points)', 'Trend (points)'), t('Badges', 'Badges'), t('Points d\'attention', 'Points of attention')],
    ...rows.map(r => [...base(r), ...extra(r)]),
    [...base(total), avg, '', '', ''],
  ];
}

export interface ReportPerformance {
  windowDays: number;
  employees: { name: string; score: number | null; trend: number | null; badges: string; attention: string }[];
  clients: { name: string; score: number | null; badges: string; attention: string }[]; // clients à surveiller
}

const clientBadgeLabel = (id: keyof typeof CLIENT_BADGE_NAMES, lang: string) => (en(lang) ? CLIENT_BADGE_NAMES[id].en : CLIENT_BADGE_NAMES[id].fr);

/** Section « Performance » du rapport mensuel : classement des salariés (avec badges) et clients à surveiller. Null si rien à montrer. */
export function reportPerformance(res: PerformanceResult | undefined, clientRes: ClientBadgeResult | undefined, lang: string): ReportPerformance | null {
  const employees = res ? rankByScore(res).map(r => { const p = res.employees.get(r.id)!; return { name: r.name, score: r.score, trend: p.trend.delta, badges: p.badges.map(b => badgeLabel(b, lang)).join(' ; '), attention: p.attention.map(a => (en(lang) ? a.en : a.fr)).join(' | ') }; }) : [];
  const clients = clientRes ? clientsToWatch(clientRes).map(p => ({ name: p.name, score: p.score, badges: p.badges.map(b => clientBadgeLabel(b.id, lang)).join(' ; '), attention: p.attention.map(a => (en(lang) ? a.en : a.fr)).join(' | ') })) : [];
  if (!employees.length && !clients.length) return null;
  return { windowDays: res ? res.cfg.window_days : 30, employees, clients };
}

/** Feuilles Excel de cette section (vide s'il n'y a rien). */
export function performanceSheets(p: ReportPerformance | null, lang: string): { name: string; rows: Cell[][] }[] {
  if (!p) return [];
  const t = (fr: string, e: string) => (en(lang) ? e : fr);
  const out: { name: string; rows: Cell[][] }[] = [];
  if (p.employees.length) out.push({ name: t('Performance équipe', 'Team performance'), rows: [[t('Salarié', 'Employee'), t(`Score (${p.windowDays} j)`, `Score (${p.windowDays} d)`), t('Tendance (points)', 'Trend (points)'), t('Badges', 'Badges'), t('Points d\'attention', 'Points of attention')], ...p.employees.map(e => [e.name, e.score ?? '', e.trend ?? '', e.badges, e.attention])] });
  if (p.clients.length) out.push({ name: t('Clients à surveiller', 'Clients to watch'), rows: [[t('Client', 'Client'), t('Score de relation', 'Relationship score'), t('Badges', 'Badges'), t('Pourquoi', 'Why')], ...p.clients.map(c => [c.name, c.score ?? '', c.badges, c.attention])] });
  return out;
}
