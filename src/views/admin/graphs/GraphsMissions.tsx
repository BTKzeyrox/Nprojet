// Cartes « Missions » de la page Graphiques : missions faites par type (barres + anneau), classement de l'équipe, salaires.
// Mêmes calculs et mêmes graphiques que Statistiques (computeStats) : seuls les écrans sont regroupés. Responsable seulement.
import React, { useMemo, useState } from 'react';
import { db } from '../../../db/store';
import { computeStats, type StatsGranularity } from '../../../utils/stats';
import { DonutChart, RankBars, XYChart, compactNumber } from '../../../components/charts/Charts';
import { variationPct } from '../../../utils/chartScale';
import { fmtDuration } from '../../../utils/performance';
import { formatCurrencyAr } from '../../../utils/formatUtils';
import { GraphCard } from './GraphCard';
import type { User } from '../../../types';

const BY: Record<StatsGranularity, { fr: string; en: string }> = {
  day: { fr: 'par heure', en: 'by hour' }, week: { fr: 'par jour', en: 'by day' }, month: { fr: 'par jour', en: 'by day' }, year: { fr: 'par mois', en: 'by month' },
};
interface Props { g: StatsGranularity; anchor: string; today: string; lang: 'fr' | 'en'; show: (id: string) => boolean; onOpenEmployee?: (u: User) => void }
const stat = 'rounded-lg bg-slate-900/60 border border-slate-800 py-2 px-1';

export const GraphsMissions: React.FC<Props> = ({ g, anchor, today, lang: l, show, onOpenEmployee }) => {
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [showAll, setShowAll] = useState(false);
  const posts = db.getPosts();
  const sig = posts.map(p => `${p.id}${p.status}${p.date}${p.calculated_ar ?? ''}`).join() + db.getUsers().length + db.getAdvanceRequests().length + db.getContracts().length;
  const stats = useMemo(() => computeStats({ posts, contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(), pricePerMission: db.getSettings().price_per_mission || 0, workLines: db.getSettings().company?.work?.stats_lines }, g, anchor, today, l),
    [g, anchor, today, l, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = (n: number) => formatCurrencyAr(n);
  const prevTotal = stats.series.prevDone.reduce((x: number, v) => x + (Number(v) || 0), 0), delta = variationPct(stats.cur.done, prevTotal);
  const tm = stats.team, users = db.getUsers(), shown = showAll ? tm.ranking : tm.ranking.slice(0, 8);
  return (
    <>
      {show('missions') && (
        <GraphCard id="missions" title={t(`Missions faites, par type ${BY[g].fr}`, `Missions done, by type ${BY[g].en}`)}
          note={prevTotal > 0 ? t(`Période d'avant : ${prevTotal}${delta === null ? '' : ` (${delta > 0 ? '+' : ''}${delta} %)`}`, `Previous period: ${prevTotal}${delta === null ? '' : ` (${delta > 0 ? '+' : ''}${delta} %)`}`) : undefined}>
          {stats.byTypeSeries.length > 0
            ? <XYChart stacked legend labels={stats.labels} fullLabels={stats.fullLabels} lang={l} unit={l === 'en' ? undefined : 'missions'} ariaLabel={t(`Missions par type ${BY[g].fr}`, `Missions by type ${BY[g].en}`)}
                series={stats.byTypeSeries.map(x => ({ key: x.label, label: x.label, values: x.values, kind: 'bar' as const }))} />
            : <div className="text-sm text-slate-400">{t('Aucune mission faite sur cette période.', 'No mission done in this period.')}</div>}
          <DonutChart items={stats.byType.map(x => ({ label: x.label, value: x.count }))} ariaLabel={t('Missions par type', 'Missions by type')} centerLabel={l === 'en' ? 'done' : 'missions'} lang={l} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={stat}><div className="font-mono text-lg font-bold text-white">{stats.cur.done}</div><div className="text-[11px] text-slate-400">{t('Validées', 'Validated')}</div></div>
            <div className={stat}><div className="font-mono text-lg font-bold text-white">{stats.cur.rejected}</div><div className="text-[11px] text-slate-400">{t('Refusées', 'Rejected')}</div></div>
            <div className={stat}><div className="font-mono text-base sm:text-lg font-bold text-white break-words">{fmtDuration(stats.cur.avgMin)}</div><div className="text-[11px] text-slate-400">{t('Durée moyenne', 'Average time')}</div></div>
          </div>
        </GraphCard>
      )}
      {show('team') && (
        <GraphCard id="team" title={t('Équipe : missions faites', 'Team: missions done')} right={<span className="text-[11px] text-slate-400">{t(`${tm.active} actifs`, `${tm.active} active`)}</span>}
          note={tm.idle.length > 0 && stats.cur.workers > 0 ? `${t('Sans mission sur cette période : ', 'Idle on this period: ')}${tm.idle.slice(0, 8).join(', ')}${tm.idle.length > 8 ? ` +${tm.idle.length - 8}` : ''}` : undefined}>
          <div className="text-xs text-slate-300">{stats.cur.workers > 0
            ? t(`${stats.cur.workers} ont travaillé sur cette période · ${tm.perHead} missions par personne en moyenne`, `${stats.cur.workers} worked on this period · ${tm.perHead} per person on average`)
            : t('Personne n\'a terminé de mission sur cette période.', 'Nobody finished anything on this period.')}</div>
          <RankBars lang={l} ariaLabel={t('Classement par missions faites', 'Ranking by missions done')} emptyText={t('Aucun employé actif.', 'No active employee.')}
            items={shown.map(r => {
              const hours = r.workMin / 60, perHour = hours > 0 && r.done > 0 ? Math.round((r.done / hours) * 10) / 10 : null;
              const u = users.find(x => x.id === r.id); // un clic ouvre la fiche de l'employé (comme dans Statistiques avant)
              return { key: r.id, label: r.name, value: r.done, valueText: String(r.done), onClick: onOpenEmployee && u ? () => onOpenEmployee(u) : undefined, sub: (
                <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-400"><span>{money(r.earned)}</span><span>{fmtDuration(r.workMin || null)}</span><span>{perHour === null ? '–' : t(`${perHour} par heure`, `${perHour} per hour`)}</span></div>) };
            })} />
          {tm.ranking.length > 8 && <button type="button" onClick={() => setShowAll(v => !v)} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm">{showAll ? t('Voir moins', 'Show less') : t(`Voir les ${tm.ranking.length} employés`, `Show all ${tm.ranking.length} employees`)}</button>}
        </GraphCard>
      )}
      {show('salaries') && (
        <GraphCard id="salaries" title={t(`Salaires ${BY[g].fr}`, `Salaries ${BY[g].en}`)} note={t('Les avances sont déjà dans les salaires. La paie du mois (payé, reste à payer) est dans la page Paie.', 'Advances are already in salaries. The month payroll (paid, left to pay) is in the Payroll page.')}>
          <XYChart labels={stats.labels} fullLabels={stats.fullLabels} lang={l} format={v => formatCurrencyAr(v)} axisFormat={compactNumber} summary="sum" showAverage ariaLabel={t('Salaires gagnés', 'Salaries earned')}
            series={[{ key: 'earned', label: t('Salaires gagnés', 'Salaries earned'), values: stats.series.earned, kind: 'bar' }]} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={stat}><div className="font-mono text-sm sm:text-base font-bold text-white break-words">{money(stats.cur.earned)}</div><div className="text-[11px] text-slate-400">{t('Gagné', 'Earned')}</div></div>
            <div className={stat}><div className="font-mono text-sm sm:text-base font-bold text-white break-words">{money(stats.cur.advances)}</div><div className="text-[11px] text-slate-400">{t('Avances accordées', 'Advances granted')}</div></div>
            <div className={stat}><div className="font-mono text-sm sm:text-base font-bold text-amber-300 break-words">{money(stats.salary.pendingAdvanceAr)}</div><div className="text-[11px] text-slate-400">{t(`Avances en attente (${stats.salary.pendingAdvanceCount})`, `Pending advances (${stats.salary.pendingAdvanceCount})`)}</div></div>
          </div>
        </GraphCard>
      )}
    </>
  );
};
