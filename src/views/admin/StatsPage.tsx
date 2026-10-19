import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { computeStats, comparableRanges, periodLabel, shiftAnchor, todayMada, variation, type StatsGranularity } from '../../utils/stats';
import { StatCard } from '../../components/StatCard';
import { BarChart, DonutChart } from '../../components/charts/Charts';
import { fmtDuration } from '../../utils/performance';
import { formatCurrencyAr } from '../../utils/formatUtils';

const GRANS: [StatsGranularity, string][] = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];
const VS: Record<StatsGranularity, string> = { day: 'par rapport à hier', week: 'par rapport à la semaine dernière', month: 'par rapport au mois dernier', year: 'par rapport à l\'année dernière' };

// On garde le choix quand la personne change de page puis revient (et le type de période d'une visite à l'autre)
let savedAnchor: string | null = null;
const loadGran = (): StatsGranularity => {
  try { const g = localStorage.getItem('stats_gran'); if (g === 'day' || g === 'week' || g === 'month' || g === 'year') return g; } catch { /* stockage refusé */ }
  return 'month';
};

const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>{right}</div>
    {children}
  </section>
);

const BY: Record<StatsGranularity, { fr: string; en: string }> = {
  day: { fr: 'par heure', en: 'by hour' }, week: { fr: 'par jour', en: 'by day' }, month: { fr: 'par jour', en: 'by day' }, year: { fr: 'par mois', en: 'by month' },
};

export const StatsPage: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const today = todayMada();
  const [g, setG] = useState<StatsGranularity>(loadGran);
  const [anchor, setAnchor] = useState<string>(() => savedAnchor || today);
  useEffect(() => { savedAnchor = anchor; }, [anchor]);
  const pickGran = (next: StatsGranularity) => { setG(next); try { localStorage.setItem('stats_gran', next); } catch { /* stockage refusé */ } };

  const ranges = comparableRanges(g, anchor, today);
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
            <div className="text-base sm:text-lg font-bold text-white truncate">{periodLabel(g, anchor, l)}</div>
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
      <Section title={l === 'en' ? `Missions done ${BY[g].en}` : `Missions faites ${BY[g].fr}`}>
        <BarChart values={stats.series.done} labels={stats.labels} compare={ranges.isFuture ? undefined : stats.series.prevDone} unit={l === 'en' ? 'missions' : 'missions'} ariaLabel={l === 'en' ? 'Missions done' : 'Missions faites'} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.cur.done}</div><div className="text-[11px] text-slate-400">Validées</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.cur.rejected}</div><div className="text-[11px] text-slate-400">Refusées</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{fmtDuration(stats.cur.avgMin)}</div><div className="text-[11px] text-slate-400">Durée moyenne</div></div>
        </div>
      </Section>

      <Section title="Missions par type">
        <DonutChart items={stats.byType.map(t => ({ label: t.label, value: t.count }))} ariaLabel="Missions par type" centerLabel={l === 'en' ? 'missions' : 'missions'} />
      </Section>

      <Section title="Missions à venir" right={<span className="text-[11px] text-slate-400">{l === 'en' ? `${stats.upcoming.total} on the board` : `${stats.upcoming.total} sur le tableau`}</span>}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-white">{stats.upcoming.todo}</div><div className="text-[11px] text-slate-400">À faire</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-sky-300">{stats.upcoming.active}</div><div className="text-[11px] text-slate-400">En cours</div></div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 py-2"><div className="font-mono text-lg font-bold text-amber-300">{stats.upcoming.toValidate}</div><div className="text-[11px] text-slate-400">À valider</div></div>
        </div>
        {stats.upcoming.urgent > 0 && <div className="text-xs text-amber-300">{l === 'en' ? `${stats.upcoming.urgent} urgent mission${stats.upcoming.urgent > 1 ? 's' : ''} to do` : `${stats.upcoming.urgent} mission${stats.upcoming.urgent > 1 ? 's' : ''} urgente${stats.upcoming.urgent > 1 ? 's' : ''} à faire`}</div>}
        {onNavigate && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onNavigate('dashboard')} className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-100 text-sm font-semibold">Voir le tableau</button>
            <button type="button" onClick={() => onNavigate('validations')} className="min-h-[44px] rounded-lg border border-amber-600/60 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200 text-sm font-semibold">Valider</button>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Les missions n'ont pas encore de date limite : les retards ne peuvent pas être affichés pour l'instant.</p>
      </Section>
    </div>
  );
};
