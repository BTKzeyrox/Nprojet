// Bouton « Voir les graphiques » des anciennes pages : les graphiques sont maintenant tous dans la page Graphiques (responsable).
// Utilisé par : StatsPage, FinanceInsights, TreasuryPage, StockDashboard, StockAnalytics. Contrôlé par : npm run check:graphs.
import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { openGraphs } from '../utils/graphsNav';
import type { GraphFilter } from '../utils/graphsPage';

export const OpenGraphsButton: React.FC<{ filter: GraphFilter; lang: 'fr' | 'en'; hint?: string }> = ({ filter, lang, hint }) => (
  <div className="rounded-xl border border-slate-700 bg-[#0f1722] p-3 sm:p-4 space-y-2" data-open-graphs={filter}>
    {hint && <p className="text-xs text-slate-300">{hint}</p>}
    <button type="button" onClick={() => openGraphs(filter)} className="w-full min-h-[44px] rounded-lg border border-emerald-500 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
      <LayoutGrid className="w-4 h-4" /> {lang === 'en' ? 'See the charts' : 'Voir les graphiques'}
    </button>
  </div>
);
