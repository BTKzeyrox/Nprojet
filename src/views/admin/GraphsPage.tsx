// Page « Graphiques » du responsable : tous les graphiques du site sur une seule page (16 cartes), avec un filtre Tout / Missions / Argent / Stock et UNE période pour toutes les cartes.
// Utilisé par : App.tsx. Contrôlé par : npm run check:graphs.
// Pour modifier : responsable seulement (la page ne s'affiche pas sinon). Les règles (liste des cartes, filtres, période de la caisse) sont dans src/utils/graphsPage.ts ; les cartes dans src/views/admin/graphs/. Lecture seule, aucun appel serveur, aucun minuteur.
// Grand écran : 2 colonnes (4 carrés visibles) ; téléphone : une carte sous l'autre.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { comparableRanges, periodLabel, shiftAnchor, todayMada, type StatsGranularity } from '../../utils/stats';
import { DEFAULT_STORAGE_ID } from '../../utils/stock';
import { GRAPH_GRANS, GRAPH_GROUPS, graphCount, groupOfGraphNav, isGraphFilter, isGraphGran, visibleCards, type GraphFilter } from '../../utils/graphsPage';
import { OPEN_GRAPHS_EVENT, takeGraphsIntent } from '../../utils/graphsNav';
import { peekNavTarget } from '../../utils/navTarget';
import type { User } from '../../types';
import { GraphsMissions } from './graphs/GraphsMissions';
import { GraphsMoney } from './graphs/GraphsMoney';
import { GraphsStock } from './graphs/GraphsStock';

const GRAN_LABEL: Record<string, { fr: string; en: string }> = { week: { fr: 'Semaine', en: 'Week' }, month: { fr: 'Mois', en: 'Month' }, year: { fr: 'Année', en: 'Year' } };
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* stockage refusé : le choix n'est pas gardé */ } };
let savedAnchor: string | null = null; // on garde la période quand on change de page puis qu'on revient
const btn = (on: boolean) => `min-h-[44px] rounded-lg text-sm font-semibold border transition-colors ${on ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'}`;
const arrow = 'min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-white flex items-center justify-center disabled:opacity-40';

export const GraphsPage: React.FC<{ onOpenEmployee?: (u: User) => void }> = ({ onOpenEmployee }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const today = todayMada();
  // Le groupe vient d'un bouton « Voir les graphiques » ou d'un lien vers une carte (alerte, assistant) ; sinon le dernier choix
  const [filter, setFilter] = useState<GraphFilter>(() => { const asked = takeGraphsIntent(), card = groupOfGraphNav(peekNavTarget()); if (card) return card; if (asked) return asked; const v = read('graphs_filter'); return isGraphFilter(v) ? v : 'all'; });
  useEffect(() => { const again = () => { const asked = takeGraphsIntent(); if (asked) setFilter(asked); }; window.addEventListener(OPEN_GRAPHS_EVENT, again); return () => window.removeEventListener(OPEN_GRAPHS_EVENT, again); }, []);
  const [g, setG] = useState<StatsGranularity>(() => { const v = read('graphs_gran'); return isGraphGran(v) ? v : 'month'; });
  const [anchor, setAnchor] = useState<string>(() => savedAnchor || today);
  useEffect(() => { savedAnchor = anchor; }, [anchor]);
  const spaces = db.getStockSpaces();
  const [pickedSpace, setPickedSpace] = useState('');
  if (db.getCurrentUser()?.role !== 'admin') return null; // page réservée à l'admin
  const spaceId = spaces.some(s => s.id === pickedSpace) ? pickedSpace : spaces[0]?.id || DEFAULT_STORAGE_ID;
  const ranges = comparableRanges(g, anchor, today), range = ranges.cur;
  const atPresent = today >= range.start && today <= range.end || ranges.isFuture;
  const ids = new Set(visibleCards(filter).map(c => c.id)), show = (id: string) => ids.has(id);
  const pickFilter = (f: GraphFilter) => { setFilter(f); write('graphs_filter', f); };
  const pickGran = (next: StatsGranularity) => { setG(next); write('graphs_gran', next); };
  const showStockPick = spaces.length > 1 && (filter === 'all' || filter === 'stock');
  return (
    <div className="max-w-7xl mx-auto px-1.5 sm:px-3 py-3 space-y-3" data-graphs-page>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label={t('Groupe de graphiques', 'Chart group')}>
          {GRAPH_GROUPS.map(x => (
            <button key={x.id} type="button" role="tab" aria-selected={filter === x.id} onClick={() => pickFilter(x.id)} className={btn(filter === x.id)}>
              {l === 'en' ? x.label.en : x.label.fr} <span className="text-xs opacity-80">({graphCount(x.id)})</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label={t('Période', 'Period')}>
          {GRAPH_GRANS.map(id => <button key={id} type="button" role="tab" aria-selected={g === id} onClick={() => pickGran(id)} className={btn(g === id)}>{GRAN_LABEL[id][l]}</button>)}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label={t('Période précédente', 'Previous period')} onClick={() => setAnchor(shiftAnchor(g, anchor, -1))} className={arrow}><ChevronLeft className="w-5 h-5" /></button>
          <div className="text-center min-w-0">
            <div data-notranslate="" className="text-base sm:text-lg font-bold text-white truncate">{periodLabel(g, anchor, l)}</div>
            {ranges.inProgress && <div className="text-[11px] text-slate-400">{t('En cours', 'In progress')}</div>}
            {ranges.isFuture && <div className="text-[11px] text-slate-400">{t('Période à venir', 'Upcoming period')}</div>}
          </div>
          <button type="button" aria-label={t('Période suivante', 'Next period')} disabled={atPresent} onClick={() => setAnchor(shiftAnchor(g, anchor, 1))} className={arrow}><ChevronRight className="w-5 h-5" /></button>
        </div>
        <button type="button" onClick={() => setAnchor(today)} disabled={range.start <= today && today <= range.end} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm flex items-center justify-center gap-2 disabled:opacity-40">
          <CalendarDays className="w-4 h-4" /> {t('Aujourd\'hui', 'Today')}
        </button>
        {showStockPick && (
          <label className="flex items-center gap-2 text-sm text-slate-300">{t('Stockage', 'Storage')}
            <select value={spaceId} onChange={e => setPickedSpace(e.target.value)} className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-slate-900/60 text-white px-2">
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <GraphsMissions g={g} anchor={anchor} today={today} lang={l} show={show} onOpenEmployee={onOpenEmployee} />
        <GraphsMoney g={g} range={range} anchor={anchor} today={today} lang={l} show={show} />
        <GraphsStock range={range} today={today} lang={l} spaceId={spaceId} show={show} />
      </div>
    </div>
  );
};
