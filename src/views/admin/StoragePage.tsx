import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { inSpace } from '../../utils/stock';
import { productNavId, STORAGE_INTENT_EVENT, takeStorageIntent } from '../../utils/storageNav';
import { setNavTarget } from '../../utils/navTarget';
import { StockTab, type StockFilter } from './StockTab';
import { StockDashboard } from './StockDashboard';
import { StockMovements } from './StockMovements';
import { StockAnalytics } from './StockAnalytics';
import { StockSpacesDialog } from './StockSpacesDialog';

// Page « Stockage » (responsable seulement) : sa propre page, hors de Statistiques.
// Plusieurs stockages (Stockage 1, 2…) : on en voit UN à la fois, ils ne se mélangent jamais.
// Onglets : Tableau de bord, Produits (liste, photos, entrées/sorties), Mouvements (historique), Analyses (graphiques avec leur période).
type Tab = 'dashboard' | 'products' | 'movements' | 'analytics';
const SPACE_KEY = 'df_stock_space'; // le dernier stockage ouvert, gardé sur l'appareil

export const StoragePage: React.FC = () => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [openKey, setOpenKey] = useState(0); // change à chaque ouverture de « Produits » ou de stockage pour repartir avec le bon filtre
  const [spaceId, setSpaceId] = useState(() => { try { return localStorage.getItem(SPACE_KEY) || ''; } catch { return ''; } });
  const [manage, setManage] = useState(false);
  const spaces = db.getStockSpaces();
  const current = spaces.find(s => s.id === spaceId) ?? spaces[0]; // un stockage supprimé ou inconnu = le premier
  const pickSpace = (id: string) => { setSpaceId(id); try { localStorage.setItem(SPACE_KEY, id); } catch { /* stockage indisponible */ } setFilter('all'); setOpenKey(k => k + 1); };
  const open = (next: Tab, f: StockFilter = 'all') => { setFilter(f); setOpenKey(k => k + 1); setTab(next); };
  // Une alerte ou une notification demande un endroit précis : le bon stockage, l'onglet Produits, le bon filtre, puis le produit clignote (1,5 s)
  useEffect(() => {
    const apply = () => {
      const i = takeStorageIntent();
      if (!i) return;
      const list = db.getStockSpaces();
      if (i.space && list.some(s => s.id === i.space)) { setSpaceId(i.space); try { localStorage.setItem(SPACE_KEY, i.space); } catch { /* stockage indisponible */ } }
      setTab('products'); setFilter(i.filter ?? 'all'); setOpenKey(k => k + 1);
      if (i.product) setNavTarget(productNavId(i.product)); // la ligne est cherchée pendant 4 secondes : elle peut arriver après l'ouverture de la page
    };
    apply(); // demande faite avant l'ouverture de la page
    window.addEventListener(STORAGE_INTENT_EVENT, apply); // demande faite page déjà ouverte
    return () => window.removeEventListener(STORAGE_INTENT_EVENT, apply);
  }, []);
  const allProducts = db.getProducts();
  const tabBtn = (id: Tab, fr: string, en: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => open(id)} className={`flex-1 min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold border px-1.5 sm:px-3 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`}>{t(fr, en)}</button>
  );
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(l === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-white">{t('Stockage', 'Storage')} · {current.name}</h1>
          <p className="text-[11px] text-slate-400">{t('Produits, quantités, photos, épuisés et alertes de ce stockage seulement.', 'Products, quantities, photos, out of stock and alerts of this storage only.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Choisir le stockage', 'Choose the storage')}>
          {spaces.map(s => {
            const n = inSpace(allProducts, [], s.id).products.length;
            return <button key={s.id} type="button" aria-pressed={current.id === s.id} onClick={() => pickSpace(s.id)} className={`min-h-[44px] px-3 rounded-lg text-sm font-semibold border ${current.id === s.id ? 'bg-sky-700 border-sky-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`}>{s.name} <span className="text-[11px] opacity-80">({n})</span></button>;
          })}
          <button type="button" onClick={() => setManage(true)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center gap-1.5"><Settings2 className="w-4 h-4" />{t('Gérer', 'Manage')}</button>
        </div>
      </div>
      <div className="flex gap-1.5" role="tablist">
        {tabBtn('dashboard', 'Tableau de bord', 'Dashboard')}
        {tabBtn('products', 'Produits', 'Products')}
        {tabBtn('movements', 'Mouvements', 'Movements')}
        {tabBtn('analytics', 'Analyses', 'Analytics')}
      </div>
      {tab === 'dashboard'
        ? <StockDashboard key={current.id} lang={l} spaceId={current.id} onOpenProducts={f => open('products', f)} />
        : tab === 'movements'
          ? <StockMovements key={current.id} lang={l} spaceId={current.id} />
          : tab === 'analytics'
            ? <StockAnalytics key={current.id} lang={l} spaceId={current.id} />
            : <StockTab key={`${current.id}-${openKey}`} lang={l} spaceId={current.id} initialFilter={filter} />}
      {manage && <StockSpacesDialog lang={l} onClose={() => setManage(false)} onSelect={pickSpace} />}
    </div>
  );
};
