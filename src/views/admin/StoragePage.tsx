import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { StockTab, type StockFilter } from './StockTab';
import { StockDashboard } from './StockDashboard';
import { StockMovements } from './StockMovements';
import { StockAnalytics } from './StockAnalytics';

// Page « Stockage » (responsable seulement) : sa propre page, hors de Statistiques.
// Produits (liste, photos, entrées/sorties), Tableau de bord, Mouvements (historique), Analyses (graphiques avec leur propre période).
type Tab = 'dashboard' | 'products' | 'movements' | 'analytics';

export const StoragePage: React.FC = () => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [openKey, setOpenKey] = useState(0); // change à chaque ouverture de « Produits » pour repartir avec le bon filtre
  const open = (next: Tab, f: StockFilter = 'all') => { setFilter(f); setOpenKey(k => k + 1); setTab(next); };
  const tabBtn = (id: Tab, fr: string, en: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => open(id)} className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border px-3 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`}>{t(fr, en)}</button>
  );
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(l === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4">
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Stockage', 'Storage')}</h1>
        <p className="text-[11px] text-slate-400">{t('Produits, quantités, photos, épuisés et alertes.', 'Products, quantities, photos, out of stock and alerts.')}</p>
      </div>
      <div className="flex gap-1.5" role="tablist">
        {tabBtn('dashboard', 'Tableau de bord', 'Dashboard')}
        {tabBtn('products', 'Produits', 'Products')}
        {tabBtn('movements', 'Mouvements', 'Movements')}
        {tabBtn('analytics', 'Analyses', 'Analytics')}
      </div>
      {tab === 'dashboard'
        ? <StockDashboard lang={l} onOpenProducts={f => open('products', f)} />
        : tab === 'movements'
          ? <StockMovements lang={l} />
          : tab === 'analytics'
            ? <StockAnalytics lang={l} />
            : <StockTab key={openKey} lang={l} initialFilter={filter} />}
    </div>
  );
};
