import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trophy, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePerformance, previousMonth } from '../../utils/usePerformance';
import { employeeOfMonth, rankByScore, type EmployeeOfMonth } from '../../utils/performanceScore';
import { BadgeChips, PerformanceCard, ScoreRing, TrendDelta } from '../../components/PerformanceBadges';

// « Scores et badges » (responsable seulement) : classement des 30 derniers jours, employé du mois, fiche de chaque salarié.
// Tout est calculé (src/utils/performanceScore.ts) : rien n'est saisi à la main, chaque score et chaque badge dit pourquoi.
// Le responsable voit aussi les « points d'attention » ; un salarié ne les voit jamais (D9) et ne voit pas ce classement (D8).

const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const monthName = (ym: string, lang: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const PerformanceScores: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const { input, res } = usePerformance();
  const [openId, setOpenId] = useState<string | null>(null);

  const ranking = useMemo(() => rankByScore(res), [res]);
  const thisMonth = res.today.slice(0, 7);
  const lastMonth = previousMonth(res.today);
  const months = useMemo(() => [
    { ym: lastMonth, result: employeeOfMonth(input, lastMonth), running: false },
    { ym: thisMonth, result: employeeOfMonth(input, thisMonth), running: true },
  ], [input, thisMonth, lastMonth]);

  const reason = (r: EmployeeOfMonth) => (r.reason === 'team_too_small'
    ? t(`Il faut au moins ${res.cfg.month_min_team} salariés actifs (il y en a ${res.team.size}).`, `At least ${res.cfg.month_min_team} active employees are needed (there are ${res.team.size}).`)
    : t(`Personne n'a assez de missions jugées (au moins ${res.cfg.quality_min_missions}).`, `Nobody has enough judged missions (at least ${res.cfg.quality_min_missions}).`));

  if (!res.team.size) return <div className="text-sm text-slate-400 font-mono p-4">{t('Aucun salarié actif pour l\'instant.', 'No active employee yet.')}</div>;

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" aria-hidden="true" /><h3 className="font-tactical font-black text-white text-base">{t('Employé du mois', 'Employee of the month')}</h3></div>
        <ul className="space-y-1.5 text-xs">
          {months.map(m => (
            <li key={m.ym} className="rounded-lg bg-slate-900/60 border border-slate-700 p-2.5">
              <div className="font-mono text-slate-400">{monthName(m.ym, lang)}{m.running ? t(' (en cours)', ' (in progress)') : ''}</div>
              {m.result.winners.length ? (
                <div className="text-slate-100 mt-0.5">{m.result.winners.map(w => `${w.name} (${w.score}/100)`).join(', ')}{m.result.winners.length > 1 ? t(' — ex æquo', ' — tied') : ''}</div>
              ) : <div className="text-slate-400 mt-0.5">{reason(m.result)}</div>}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">{t('Calculé : le meilleur score du mois, avec assez de missions jugées. Personne n\'est choisi à la main.', 'Calculated: the best score of the month, with enough judged missions. Nobody is picked by hand.')}</p>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-tactical font-black text-white text-base">{t(`Classement des ${res.cfg.window_days} derniers jours`, `Ranking of the last ${res.cfg.window_days} days`)}</h3>
          <span className="text-[11px] font-mono text-slate-400">{res.team.workers}/{res.team.size} {t('ont travaillé', 'worked')}</span>
        </div>
        <ul className="divide-y divide-slate-800">
          {ranking.map(r => {
            const p = res.employees.get(r.id)!;
            const open = openId === r.id;
            return (
              <li key={r.id} className="py-1.5">
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)} className="w-full min-h-[44px] flex items-center gap-2.5 text-left cursor-pointer">
                  <span className="w-6 text-center font-mono text-sm font-bold text-slate-300 shrink-0">{r.rank ?? '–'}</span>
                  <span className="text-white shrink-0"><ScoreRing score={r.score} size={44} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-white break-words">{r.name}</span>
                      <TrendDelta delta={p.trend.delta} lang={lang} />
                      {p.attention.length > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-300" title={t('Points d\'attention', 'Points of attention')}><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />{p.attention.length}</span>}
                    </span>
                    {r.score === null
                      ? <span className="block text-[11px] text-slate-400">{t(`Pas assez de données (${p.window.decided}/${res.cfg.score_min_missions} missions jugées)`, `Not enough data (${p.window.decided}/${res.cfg.score_min_missions} judged missions)`)}</span>
                      : <span className="block mt-0.5"><BadgeChips badges={p.badges} lang={lang} max={3} /></span>}
                  </span>
                  {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />}
                </button>
                {open && <div className="pl-1 sm:pl-8 pt-2 pb-2"><PerformanceCard p={p} cfg={res.cfg} lang={lang} /></div>}
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-slate-500">{t('Les scores sont des indicateurs calculés sur les missions : ils ne remplacent pas le jugement du responsable. Sans assez de missions, aucun score n\'est affiché.', 'Scores are indicators calculated from missions: they do not replace the manager\'s judgement. Without enough missions, no score is shown.')}</p>
      </div>
    </div>
  );
};
