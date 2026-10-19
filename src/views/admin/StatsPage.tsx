import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { computeStats, comparableRanges, periodLabel, shiftAnchor, todayMada, type StatsGranularity } from '../../utils/stats';

const GRANS: [StatsGranularity, string][] = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];

// On garde le choix quand la personne change de page puis revient (et le type de période d'une visite à l'autre)
let savedAnchor: string | null = null;
const loadGran = (): StatsGranularity => {
  try { const g = localStorage.getItem('stats_gran'); if (g === 'day' || g === 'week' || g === 'month' || g === 'year') return g; } catch { /* stockage refusé */ }
  return 'month';
};

export const StatsPage: React.FC = () => {
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

      {/* Les cartes, les graphiques et les sections arrivent aux étapes suivantes (S1.3 à S1.7) */}
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-4 text-sm text-slate-300">
        <b className="text-white">{stats.cur.done}</b> missions faites sur cette période.
      </div>
    </div>
  );
};
