import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { computeStats, comparableRanges, periodLabel, shiftAnchor, todayMada, variation, type StatsGranularity } from '../../utils/stats';
import { StatCard } from '../../components/StatCard';
import { FinanceTab } from './FinanceTab';
import { ReportTab } from './ReportTab';
import { AutoReportCard } from './AutoReportCard';
import { GoalsBars, ForecastCard, AlertsList } from '../../components/GoalsPanel';
import { getStatsTab, setStatsTab, type StatsTab } from '../../utils/statsNav';
import { setStorageIntent } from '../../utils/storageNav';
import { DonutChart, RankBars, XYChart, compactNumber } from '../../components/charts/Charts';
import { ActivityGrid } from '../../components/charts/StyledCharts';
import { variationPct } from '../../utils/chartScale';
import { pacePerBar } from '../../utils/chartData';
import { fmtDuration } from '../../utils/performance';
import type { User } from '../../types';
import type { Slip } from '../../utils/payslip';
import { formatCurrencyAr } from '../../utils/formatUtils';

const GRANS: [StatsGranularity, string][] = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];
const VS: Record<StatsGranularity, string> = { day: 'par rapport à hier', week: 'par rapport à la semaine dernière', month: 'par rapport au mois dernier', year: 'par rapport à l\'année dernière' };

// Fiches de paie déjà lues (2 minutes) : évite de relancer le serveur quand on va et vient entre deux mois
const payCache = new Map<string, { at: number; slips: Slip[]; status: string }>();
type PayState = { state: 'idle' | 'loading' | 'ready' | 'na'; slips?: Slip[]; status?: string };

// On garde le choix quand la personne change de page puis revient (et le type de période d'une visite à l'autre)
let savedAnchor: string | null = null;
const loadGran = (): StatsGranularity => {
  try { const g = localStorage.getItem('stats_gran'); if (g === 'day' || g === 'week' || g === 'month' || g === 'year') return g; } catch { /* stockage refusé */ }
  return 'month';
};

// raw : le titre est déjà dans la bonne langue (exclu de la traduction automatique)
const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode; raw?: boolean }> = ({ title, children, right, raw }) => (
  <section className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 {...(raw ? { 'data-notranslate': '' } : {})} className="text-sm sm:text-base font-bold text-white">{title}</h2>{right}</div>
    {children}
  </section>
);

const BY: Record<StatsGranularity, { fr: string; en: string }> = {
  day: { fr: 'par heure', en: 'by hour' }, week: { fr: 'par jour', en: 'by day' }, month: { fr: 'par jour', en: 'by day' }, year: { fr: 'par mois', en: 'by month' },
};

export const StatsPage: React.FC<{ onNavigate?: (view: string) => void; onOpenEmployee?: (u: User) => void }> = ({ onNavigate, onOpenEmployee }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const today = todayMada();
  const [showAll, setShowAll] = useState(false);
  const [g, setG] = useState<StatsGranularity>(loadGran);
  const [anchor, setAnchor] = useState<string>(() => savedAnchor || today);
  useEffect(() => { savedAnchor = anchor; }, [anchor]);
  const [tab, setTabState] = useState<StatsTab>(getStatsTab);
  const setTab = (next: StatsTab) => { setStatsTab(next); setTabState(next); };
  const pickGran = (next: StatsGranularity) => { setG(next); try { localStorage.setItem('stats_gran', next); } catch { /* stockage refusé */ } };

  const ranges = comparableRanges(g, anchor, today);
  // Objectif de missions du mois : trait de rythme par jour, seulement sur le mois en cours
  const goalMissions = Number(db.getSettings().goal_missions) || 0;
  const onThisMonth = g === 'month' && !ranges.isFuture && ranges.cur.start <= today && today <= ranges.cur.end;
  const paceLine = onThisMonth && goalMissions > 0 ? [{ value: pacePerBar(goalMissions, ranges.cur.days), label: l === 'en' ? 'Goal pace / day' : 'Rythme de l\'objectif / jour', color: '#a78bfa' }] : [];

  // Paie du mois (payé / reste à payer) : lecture seule, une seule demande au serveur par mois affiché
  const payHalf = db.getSettings().pay_period === 'half';
  const pid = g === 'month' && !ranges.isFuture && !payHalf ? anchor.slice(0, 7) : null;
  const [pay, setPay] = useState<PayState>({ state: 'idle' });
  useEffect(() => {
    if (!pid) { setPay({ state: 'idle' }); return; }
    const hit = payCache.get(pid);
    if (hit && Date.now() - hit.at < 120000) { setPay({ state: 'ready', slips: hit.slips, status: hit.status }); return; }
    let off = false;
    setPay({ state: 'loading' });
    void db.payrollCall('payroll-period', { pid }).then(r => {
      if (off) return;
      if (r.success && Array.isArray(r.data?.slips)) { payCache.set(pid, { at: Date.now(), slips: r.data.slips, status: String(r.data.status || 'open') }); setPay({ state: 'ready', slips: r.data.slips, status: String(r.data.status || 'open') }); }
      else setPay({ state: 'na' });
    });
    return () => { off = true; };
  }, [pid]);
  const atPresent = today >= ranges.cur.start && today <= ranges.cur.end || ranges.isFuture;

  const posts = db.getPosts();
  const sig = posts.map(p => `${p.id}${p.status}${p.date}${p.calculated_ar ?? ''}`).join() + db.getUsers().length + db.getAdvanceRequests().length + db.getContracts().length;
  const stats = useMemo(() => computeStats({
    posts, contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(), pricePerMission: db.getSettings().price_per_mission || 0,
  }, g, anchor, today, l), [g, anchor, today, l, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (db.getCurrentUser()?.role !== 'admin') return null; // page réservée à l'admin

  return (
    <div className="max-w-4xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      {/* Filtre : jour / semaine / mois / année, avec flèches */}
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Période">
          {GRANS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={g === id} onClick={() => pickGran(id)}
              className={`min-h-[44px] rounded-lg text-sm font-semibold border transition-colors ${g === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Période précédente" onClick={() => setAnchor(shiftAnchor(g, anchor, -1))} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-white flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-0">
            <div data-notranslate="" className="text-base sm:text-lg font-bold text-white truncate">{periodLabel(g, anchor, l)}</div>
            {ranges.inProgress && <div className="text-[11px] text-slate-400">En cours</div>}
            {ranges.isFuture && <div className="text-[11px] text-slate-400">Période à venir</div>}
          </div>
          <button type="button" aria-label="Période suivante" disabled={atPresent} onClick={() => setAnchor(shiftAnchor(g, anchor, 1))} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button type="button" onClick={() => setAnchor(today)} disabled={ranges.cur.start <= today && today <= ranges.cur.end} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm flex items-center justify-center gap-2 disabled:opacity-40">
          <CalendarDays className="w-4 h-4" /> Aujourd'hui
        </button>
      </div>

      {/* Quatre onglets : les chiffres de l'activité, l'argent (paiements reçus, dépenses), le stock et le rapport du mois */}
      <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label={l === 'en' ? 'Section' : 'Rubrique'} {...(l === 'en' ? { 'data-notranslate': '' } : {})}>
        {([['stats', l === 'en' ? 'Statistics' : 'Statistiques'], ['finance', 'Finances'], ['report', l === 'en' ? 'Report' : 'Rapport']] as [StatsTab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold border transition-colors px-0.5 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'report' ? (
        <>
          <ReportTab anchor={anchor} lang={l} />
          <AutoReportCard lang={l} />
        </>
      ) : tab === 'finance' ? (
        <FinanceTab range={{ start: ranges.cur.start, end: ranges.cur.end }} lang={l} salariesAr={ranges.isFuture ? 0 : stats.cur.earned} advancesAr={ranges.isFuture ? 0 : stats.cur.advances} />
      ) : (<>
      {/* Alertes, objectifs du mois et prévision (admin seulement) */}
      <AlertsList lang={l} hideWhenEmpty onGo={a => { if (a.go === 'stats' && a.tab) setTab(a.tab); else if (a.go !== 'stats') { if (a.storage) setStorageIntent(a.storage); onNavigate?.(a.go); } }} />
      <GoalsBars lang={l} hideWhenEmpty />
      <ForecastCard lang={l} />

      {/* Chiffres du haut : chacun est comparé à la période d'avant (même nombre de jours si la période n'est pas finie) */}
      {(() => {
        const { cur, prev, upcoming, team, series } = stats;
        const vs = ranges.isFuture ? undefined : VS[g];
        const rateDelta = cur.rate !== null && prev.rate !== null ? cur.rate - prev.rate : null;
        const money = (n: number) => formatCurrencyAr(n).replace(/\s*Ar\s*$/i, '');
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard label="Missions faites" value={String(cur.done)} variation={ranges.isFuture ? undefined : variation(cur.done, prev.done)} vsText={vs} spark={series.done} />
            <StatCard label="Taux de validation" value={cur.rate === null ? '–' : `${cur.rate} %`} hint={cur.rejected > 0 ? (l === 'en' ? `${cur.rejected} rejected` : `${cur.rejected} refusée${cur.rejected > 1 ? 's' : ''}`) : undefined}
              deltaText={rateDelta === null || ranges.isFuture ? undefined : `${rateDelta > 0 ? '+' : ''}${rateDelta} pts`} deltaDir={rateDelta === null ? undefined : rateDelta > 0 ? 'up' : rateDelta < 0 ? 'down' : 'flat'} vsText={vs} />
            <StatCard label="Salaires gagnés" value={money(cur.earned)} unit="Ar" variation={ranges.isFuture ? undefined : variation(cur.earned, prev.earned)} vsText={vs} tone="neutral" spark={series.earned} />
            <StatCard label="Avances accordées" value={money(cur.advances)} unit="Ar" variation={ranges.isFuture ? undefined : variation(cur.advances, prev.advances)} vsText={vs} tone="cost" />
            <StatCard label="Employés actifs" value={String(team.active)} hint={l === 'en' ? `${team.day} day · ${team.night} night` : `${team.day} jour · ${team.night} nuit`} />
            <StatCard label="À valider" value={String(upcoming.toValidate)} hint={l === 'en' ? `${upcoming.todo} to do · ${upcoming.active} in progress` : `${upcoming.todo} à faire · ${upcoming.active} en cours`} />
          </div>
        );
      })()}

      {/* Missions : faites sur la période, par type, et ce qui reste à faire */}
      <Section title={l === 'en' ? `Missions done ${BY[g].en}` : `Missions faites ${BY[g].fr}`} raw={l === 'en'}>
        <ActivityGrid labels={stats.labels} fullLabels={stats.fullLabels} values={stats.series.done} lang={l} ariaLabel={l === 'en' ? 'Missions done' : 'Missions faites'} />
        {(() => {
          // Ce que l'ancien graphique montrait en plus : la période d'avant et le rythme de l'objectif
          const prevTotal = stats.series.prevDone.reduce((x: number, v) => x + (Number(v) || 0), 0);
          const delta = variationPct(stats.cur.done, prevTotal);
          const pace = paceLine.length ? Math.round(paceLine[0].value * 10) / 10 : 0;
          if (ranges.isFuture || (prevTotal === 0 && pace === 0)) return null;
          return (
            <p {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-xs text-slate-400">
              {prevTotal > 0 && (l === 'en' ? `Previous period: ${prevTotal}${delta === null ? '' : ` (${delta > 0 ? '+' : ''}${delta} %)`}` : `Période d'avant : ${prevTotal}${delta === null ? '' : ` (${delta > 0 ? '+' : ''}${delta} %)`}`)}
              {prevTotal > 0 && pace > 0 ? ' · ' : ''}
              {pace > 0 && (l === 'en' ? `Goal pace: ${String(pace)} / day` : `Rythme de l'objectif : ${String(pace).replace('.', ',')} / jour`)}
            </p>
          );
        })()}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.cur.done}</div><div className="text-[11px] text-slate-400">Validées</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.cur.rejected}</div><div className="text-[11px] text-slate-400">Refusées</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-base sm:text-lg font-bold text-white break-words px-1">{fmtDuration(stats.cur.avgMin)}</div><div className="text-[11px] text-slate-400">Durée moyenne</div></div>
        </div>
      </Section>

      <Section title="Missions par type">
        {stats.byTypeSeries.length > 0 && (
          <XYChart stacked legend labels={stats.labels} fullLabels={stats.fullLabels} lang={l} unit={l === 'en' ? undefined : 'missions'} ariaLabel={l === 'en' ? `Missions by type ${BY[g].en}` : `Missions par type ${BY[g].fr}`}
            series={stats.byTypeSeries.map(t => ({ key: t.label, label: t.label, values: t.values, kind: 'bar' as const }))} />
        )}
        <DonutChart items={stats.byType.map(t => ({ label: t.label, value: t.count }))} ariaLabel={l === 'en' ? 'Missions by type' : 'Missions par type'} centerLabel={l === 'en' ? 'done' : 'missions'} lang={l} />
      </Section>

      <Section title="Missions à venir" right={<span {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-[11px] text-slate-400">{l === 'en' ? `${stats.upcoming.total} on the board` : `${stats.upcoming.total} sur le tableau`}</span>}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.upcoming.todo}</div><div className="text-[11px] text-slate-400">À faire</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-sky-300">{stats.upcoming.active}</div><div className="text-[11px] text-slate-400">En cours</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-amber-300">{stats.upcoming.toValidate}</div><div className="text-[11px] text-slate-400">À valider</div></div>
        </div>
        {stats.upcoming.urgent > 0 && <div {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-xs text-amber-300">{l === 'en' ? `Urgent to do: ${stats.upcoming.urgent}` : `${stats.upcoming.urgent} mission${stats.upcoming.urgent > 1 ? 's' : ''} urgente${stats.upcoming.urgent > 1 ? 's' : ''} à faire`}</div>}
        {onNavigate && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onNavigate('dashboard')} className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-100 text-sm font-semibold">Voir le tableau</button>
            <button type="button" onClick={() => onNavigate('validations')} className="min-h-[44px] rounded-lg border border-amber-600/60 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200 text-sm font-semibold">Valider</button>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Les missions n'ont pas encore de date limite : les retards ne peuvent pas être affichés pour l'instant.</p>
      </Section>

      {/* Équipe : classement, missions par heure, personnes sans mission */}
      {(() => {
        const t = stats.team;
        const shown = showAll ? t.ranking : t.ranking.slice(0, 8);
        const users = db.getUsers();
        const money = (n: number) => formatCurrencyAr(n);
        return (
          <Section title="Équipe" right={<span {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-[11px] text-slate-400">{l === 'en' ? `${t.active} active` : `${t.active} actifs`}</span>}>
            <div {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-xs text-slate-300">
              {stats.cur.workers > 0
                ? (l === 'en' ? `${stats.cur.workers} worked on this period · ${t.perHead} per person on average` : `${stats.cur.workers} ont travaillé sur cette période · ${t.perHead} missions par personne en moyenne`)
                : (l === 'en' ? 'Nobody finished anything on this period.' : 'Personne n\'a terminé de mission sur cette période.')}
            </div>
            {t.ranking.length === 0 && <div className="text-sm text-slate-400">Aucun employé actif.</div>}
            <RankBars lang={l} ariaLabel={l === 'en' ? 'Ranking by missions done' : 'Classement par missions faites'}
              items={shown.map(r => {
                const hours = r.workMin / 60;
                const perHour = hours > 0 && r.done > 0 ? Math.round((r.done / hours) * 10) / 10 : null;
                const u = users.find(x => x.id === r.id);
                return {
                  key: r.id, label: r.name, value: r.done, valueText: String(r.done),
                  onClick: onOpenEmployee && u ? () => onOpenEmployee(u) : undefined,
                  sub: (
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                      <span>{money(r.earned)}</span>
                      <span>{fmtDuration(r.workMin || null)}</span>
                      <span {...(l === 'en' ? { 'data-notranslate': '' } : {})}>{perHour === null ? '–' : (l === 'en' ? `${perHour} per hour` : `${perHour} par heure`)}</span>
                    </div>
                  ),
                };
              })} />
            {t.ranking.length > 8 && <button type="button" onClick={() => setShowAll(v => !v)} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm"><span {...(l === 'en' ? { 'data-notranslate': '' } : {})}>{showAll ? (l === 'en' ? 'Show less' : 'Voir moins') : (l === 'en' ? `Show all (${t.ranking.length})` : `Voir tout (${t.ranking.length})`)}</span></button>}
            {t.idle.length > 0 && stats.cur.workers > 0 && (
              <div {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-xs text-amber-300">{l === 'en' ? 'Idle on this period: ' : 'Sans mission sur cette période : '}{t.idle.slice(0, 8).join(', ')}{t.idle.length > 8 ? ` +${t.idle.length - 8}` : ''}</div>
            )}
          </Section>
        );
      })()}

      {/* Salaires : gagné, avances, et (pour un mois) ce qui est payé ou reste à payer */}
      {(() => {
        const money = (n: number) => formatCurrencyAr(n);
        const slips = pay.slips || [];
        const net = slips.reduce((t, x) => t + (x.net || 0), 0);
        const paid = slips.reduce((t, x) => t + (x.paid ? x.net || 0 : 0), 0);
        const closed = pay.status === 'closed' || pay.status === 'paid';
        return (
          <Section title="Salaires">
            <XYChart labels={stats.labels} fullLabels={stats.fullLabels} lang={l} format={v => formatCurrencyAr(v)} axisFormat={compactNumber} summary="sum" showAverage ariaLabel={l === 'en' ? 'Salaries earned' : 'Salaires gagnés'}
              series={[{ key: 'earned', label: l === 'en' ? 'Salaries earned' : 'Salaires gagnés', values: stats.series.earned, kind: 'bar' }]} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2 px-1"><div className="font-mono text-sm sm:text-base font-bold text-white break-words">{money(stats.cur.earned)}</div><div className="text-[11px] text-slate-400">Gagné</div></div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2 px-1"><div className="font-mono text-sm sm:text-base font-bold text-white break-words">{money(stats.cur.advances)}</div><div className="text-[11px] text-slate-400">Avances accordées</div></div>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2 px-1"><div className="font-mono text-sm sm:text-base font-bold text-amber-300 break-words">{money(stats.salary.pendingAdvanceAr)}</div><div {...(l === 'en' ? { 'data-notranslate': '' } : {})} className="text-[11px] text-slate-400">{l === 'en' ? `Pending advances (${stats.salary.pendingAdvanceCount})` : `Avances en attente (${stats.salary.pendingAdvanceCount})`}</div></div>
            </div>
            {pay.state === 'loading' && <div className="text-xs text-slate-400">Lecture de la paie…</div>}
            {pay.state === 'ready' && (
              <div className="rounded-lg border border-slate-700 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-white">Paie du mois</span><span className={closed ? 'text-emerald-300' : 'text-amber-300'}>{closed ? 'Clôturée' : 'Chiffres provisoires'}</span></div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="font-mono text-sm font-bold text-white break-words">{money(net)}</div><div className="text-[11px] text-slate-400">Net à payer</div></div>
                  <div><div className="font-mono text-sm font-bold text-emerald-300 break-words">{money(paid)}</div><div className="text-[11px] text-slate-400">Déjà payé</div></div>
                  <div><div className="font-mono text-sm font-bold text-amber-300 break-words">{money(Math.max(0, net - paid))}</div><div className="text-[11px] text-slate-400">Reste à payer</div></div>
                </div>
                {onNavigate && <button type="button" onClick={() => onNavigate('advances')} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-100 text-sm">Ouvrir la page Paie</button>}
              </div>
            )}
            {pay.state === 'na' && <div className="text-[11px] text-slate-500">La paie du mois n'est pas disponible pour le moment.</div>}
            {g === 'month' && payHalf && <div className="text-[11px] text-slate-500">La paie se fait par quinzaine : « payé » et « reste à payer » sont dans la page Paie.</div>}
          </Section>
        );
      })()}
      </>)}
    </div>
  );
};
