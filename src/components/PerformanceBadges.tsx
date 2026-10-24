import React from 'react';
import { Clock, Flame, Layers, Minus, ShieldCheck, Sprout, TrendingDown, TrendingUp, Zap, TriangleAlert } from 'lucide-react';
import { BADGE_NAMES } from '../utils/recognition';
import {
  LEVEL_NAMES, type Attention, type Badge, type BadgeId, type BadgeLevel, type Bilingual, type EmployeePerformance, type PerformanceConfig,
} from '../utils/performanceScore';

// Affichage des scores et des badges de performance (module 3, M3.3). Rien n'est saisi : tout vient de performanceScore.ts.
// Chaque badge et chaque score montre POURQUOI (le texte « why » des règles pures).

const pick = (b: Bilingual, lang: string) => (lang === 'en' ? b.en : b.fr);

export { BADGE_NAMES };
const BADGE_ICONS: Record<BadgeId, React.ElementType> = { quality: ShieldCheck, punctuality: Clock, regularity: Flame, rendement: Zap, versatility: Layers, rookie: Sprout };
const LEVEL_TONE: Record<BadgeLevel, string> = {
  1: 'bg-orange-900/50 text-orange-100 border-orange-600/60',
  2: 'bg-slate-600/50 text-slate-50 border-slate-300/50',
  3: 'bg-amber-600/50 text-amber-50 border-amber-300/70',
};

/** « Qualité · Or » (la recrue n'a pas de niveau). */
export const badgeTitle = (b: Badge, lang: string): string => (b.id === 'rookie' ? pick(BADGE_NAMES.rookie, lang) : `${pick(BADGE_NAMES[b.id], lang)} · ${pick(LEVEL_NAMES[b.level], lang)}`);

/** Petite pastille d'un badge (listes). Le « pourquoi » est dans l'info-bulle et pour les lecteurs d'écran. */
export const BadgeChip: React.FC<{ badge: Badge; lang: string }> = ({ badge, lang }) => {
  const Icon = BADGE_ICONS[badge.id];
  const why = pick(badge.why, lang);
  return (
    <span title={why} aria-label={`${badgeTitle(badge, lang)} : ${why}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${LEVEL_TONE[badge.level]}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />{badgeTitle(badge, lang)}
    </span>
  );
};

/** Rangée de pastilles (jusqu'à `max`, puis « +N »). Rien si aucun badge. */
export const BadgeChips: React.FC<{ badges: Badge[]; lang: string; max?: number }> = ({ badges, lang, max = 4 }) => {
  if (!badges.length) return null;
  const shown = badges.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map(b => <BadgeChip key={b.id} badge={b} lang={lang} />)}
      {badges.length > shown.length && <span className="text-[11px] font-mono text-slate-400">+{badges.length - shown.length}</span>}
    </span>
  );
};

/** Les badges en détail : nom, niveau, pourquoi, ce qui manque pour le niveau suivant. */
export const BadgeDetails: React.FC<{ badges: Badge[]; lang: string }> = ({ badges, lang }) => (
  <ul className="space-y-2">
    {badges.map(b => {
      const Icon = BADGE_ICONS[b.id];
      return (
        <li key={b.id} className={`rounded-xl border p-2.5 flex gap-2.5 ${LEVEL_TONE[b.level]}`}>
          <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 text-xs">
            <div className="font-bold text-sm">{badgeTitle(b, lang)}</div>
            <div className="opacity-90 break-words">{pick(b.why, lang)}</div>
            {b.next && <div className="opacity-70 mt-0.5 break-words">{pick(b.next, lang)}</div>}
          </div>
        </li>
      );
    })}
  </ul>
);

/** Anneau du score (0 à 100). Sans score : « — ». */
export const ScoreRing: React.FC<{ score: number | null; size?: number; tone?: 'color' | 'neutral' }> = ({ score, size = 64, tone = 'color' }) => {
  const r = 26, c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const stroke = score === null ? '#475569' : tone === 'neutral' ? '#38bdf8' : pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#fb7185';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={score === null ? '—' : `${score} / 100`} className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#334155" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">{score === null ? '—' : score}</text>
    </svg>
  );
};

/** Évolution par rapport à la période d'avant (flèche et nombre de points). */
export const TrendDelta: React.FC<{ delta: number | null; lang: string }> = ({ delta, lang }) => {
  if (delta === null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400';
  const word = lang === 'en' ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable') : delta > 0 ? 'en hausse' : delta < 0 ? 'en baisse' : 'stable';
  return <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${tone}`} title={word}><Icon className="w-3.5 h-3.5" aria-hidden="true" />{delta > 0 ? '+' : ''}{delta}</span>;
};

const COMPONENT_LABELS: Record<'quality' | 'volume' | 'punctuality' | 'regularity', { name: Bilingual; help: Bilingual }> = {
  quality: { name: { fr: 'Qualité', en: 'Quality' }, help: { fr: 'missions validées sur missions jugées', en: 'approved missions out of judged missions' } },
  volume: { name: { fr: 'Volume', en: 'Volume' }, help: { fr: 'missions faites, comparées à la moyenne de l\'équipe', en: 'missions done, compared with the team average' } },
  punctuality: { name: { fr: 'Ponctualité', en: 'Punctuality' }, help: { fr: 'jours où la première mission commence à l\'heure', en: 'days where the first mission starts on time' } },
  regularity: { name: { fr: 'Régularité', en: 'Consistency' }, help: { fr: 'jours avec une mission validée sur les jours attendus', en: 'days with an approved mission out of the expected days' } },
};

/** Les 4 parties du score, chacune avec son poids et son explication. Une partie non calculable est dite « non calculée ». */
export const ComponentBars: React.FC<{ components: EmployeePerformance['components']; weights: PerformanceConfig['weights']; lang: string }> = ({ components, weights, lang }) => (
  <ul className="space-y-2">
    {(Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[]).map(k => {
      const v = components[k];
      const lab = COMPONENT_LABELS[k];
      return (
        <li key={k} className="text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold text-slate-100">{pick(lab.name, lang)} <span className="font-normal text-slate-400">({weights[k]} %)</span></span>
            <span className="font-mono text-slate-200">{v === null ? (lang === 'en' ? 'not calculated' : 'non calculée') : `${Math.round(v)} / 100`}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden mt-1" aria-hidden="true"><div className="h-full bg-sky-400" style={{ width: `${v === null ? 0 : Math.max(0, Math.min(100, v))}%` }} /></div>
          <div className="text-[11px] text-slate-400 mt-0.5">{pick(lab.help, lang)}</div>
        </li>
      );
    })}
  </ul>
);

export type PerformanceView = Omit<EmployeePerformance, 'attention'> & { attention?: Attention[] };

/** Les trois périodes de la tendance, de la plus ancienne à la plus récente. */
const TrendBoxes: React.FC<{ scores: (number | null)[]; windowDays: number; lang: string }> = ({ scores, windowDays, lang }) => {
  const labels = [2, 1, 0].map(k => (k === 0 ? (lang === 'en' ? 'Now' : 'Maintenant') : lang === 'en' ? `${k * windowDays} d ago` : `Il y a ${k * windowDays} j`));
  const ordered = [scores[2], scores[1], scores[0]];
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {ordered.map((s, i) => (
        <div key={i} className="rounded-lg bg-slate-900/60 border border-slate-700 py-1.5">
          <div className="text-base font-black text-white">{s === null ? '—' : s}</div>
          <div className="text-[10px] font-mono text-slate-400">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
};

/**
 * La fiche performance d'un salarié.
 * `attention` n'est présent que pour le responsable : un salarié reçoit `forEmployee(p)`, sans « points d'attention » (D9).
 */
export const PerformanceCard: React.FC<{ p: PerformanceView; cfg: PerformanceConfig; lang: string; tone?: 'color' | 'neutral'; self?: boolean; showBreakdown?: boolean }> = ({ p, cfg, lang, tone = 'color', self = false, showBreakdown = true }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const w = p.window;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-white"><ScoreRing score={p.score} size={72} tone={tone} /></div>
        <div className="min-w-0 text-xs space-y-0.5">
          {p.score === null ? (
            <div className="text-slate-300">{t(`Pas assez de données : ${w.decided} mission${w.decided > 1 ? 's' : ''} jugée${w.decided > 1 ? 's' : ''} sur ${cfg.window_days} jours, il en faut au moins ${cfg.score_min_missions}.`, `Not enough data: ${w.decided} judged mission${w.decided === 1 ? '' : 's'} in ${cfg.window_days} days, at least ${cfg.score_min_missions} are needed.`)}</div>
          ) : (
            <div className="text-slate-300">{t(`Score sur ${cfg.window_days} jours (du ${w.start.split('-').reverse().join('/')} au ${w.end.split('-').reverse().join('/')})`, `Score over ${cfg.window_days} days (${w.start} to ${w.end})`)} <TrendDelta delta={p.trend.delta} lang={lang} /></div>
          )}
          <div className="font-mono text-slate-400">{t(`${w.done} validée${w.done > 1 ? 's' : ''} · ${w.rejected} refusée${w.rejected > 1 ? 's' : ''} · ${w.activeDays} jour${w.activeDays > 1 ? 's' : ''} actif${w.activeDays > 1 ? 's' : ''}`, `${w.done} approved · ${w.rejected} refused · ${w.activeDays} active day${w.activeDays === 1 ? '' : 's'}`)}</div>
        </div>
      </div>

      {p.score !== null && !showBreakdown && (
        <p className="text-xs text-slate-400">{t('Ton score réunit la qualité, le volume, la ponctualité et la régularité de tes missions.', 'Your score combines the quality, volume, punctuality and consistency of your missions.')}</p>
      )}
      {p.score !== null && showBreakdown && (
        <section aria-label={t('Détail du score', 'Score breakdown')} className="space-y-1.5">
          <h4 className="text-[11px] font-mono uppercase text-slate-400">{t('Comment le score est calculé', 'How the score is calculated')}</h4>
          <ComponentBars components={p.components} weights={cfg.weights} lang={lang} />
        </section>
      )}

      <section aria-label={t('Badges', 'Badges')} className="space-y-1.5">
        <h4 className="text-[11px] font-mono uppercase text-slate-400">{t('Badges', 'Badges')}</h4>
        {p.badges.length ? <BadgeDetails badges={p.badges} lang={lang} /> : <p className="text-xs text-slate-400">{t('Aucun badge pour l\'instant. Ils se gagnent avec un travail régulier et de qualité.', 'No badge yet. They are earned with steady, quality work.')}</p>}
      </section>

      <section aria-label={t('Tendance', 'Trend')} className="space-y-1.5">
        <h4 className="text-[11px] font-mono uppercase text-slate-400">{t('Tendance sur 3 périodes', 'Trend over 3 periods')}</h4>
        <TrendBoxes scores={p.trend.scores} windowDays={cfg.window_days} lang={lang} />
      </section>

      {p.attention && p.attention.length > 0 && (
        <section aria-label={t('Points d\'attention', 'Points of attention')} className="rounded-xl border border-amber-600/50 bg-amber-950/40 p-2.5 space-y-1">
          <h4 className="text-[11px] font-mono uppercase text-amber-300 inline-flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />{self ? t('Points d\'attention', 'Points of attention') : t('Points d\'attention (visibles par le responsable seulement)', 'Points of attention (visible to the manager only)')}</h4>
          <ul className="list-disc pl-4 text-xs text-amber-100 space-y-0.5">{p.attention.map(a => <li key={a.code} className="break-words">{lang === 'en' ? a.en : a.fr}</li>)}</ul>
          <p className="text-[11px] text-amber-200/70">{self ? t('Ce sont des repères pour progresser, pas des sanctions.', 'These are pointers to improve, not penalties.') : t('Ce sont des indicateurs, pas des sanctions : le contexte reste au responsable.', 'These are indicators, not penalties: context stays with the manager.')}</p>
        </section>
      )}
    </div>
  );
};

