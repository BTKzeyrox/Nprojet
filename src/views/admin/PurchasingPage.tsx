import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { SuppliersSection } from './SuppliersSection';
import { PurchaseOrdersSection } from './PurchaseOrdersSection';

// Page « Achats » (responsable seulement) : fournisseurs, bons de commande, inventaire.
// Les sections s'ajoutent étape par étape (M4.1 fournisseurs, M4.2 bons, M4.3 inventaire).

export type Tab = 'orders' | 'suppliers';

export const PurchasingPage: React.FC<{ initialTab?: Tab }> = ({ initialTab }) => { // `initialTab` : seulement pour le contrôle automatique
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [ver, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'orders');
  const tabBtn = (id: Tab, fr: string, en: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border px-3 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}>{t(fr, en)}</button>
  );
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4">
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Achats', 'Purchasing')}</h1>
        <p className="text-[11px] text-slate-400">{t('Fournisseurs, bons de commande et inventaire du stock.', 'Suppliers, purchase orders and stock inventory.')}</p>
      </div>
      <div className="flex gap-1.5" role="tablist">
        {tabBtn('orders', 'Bons de commande', 'Purchase orders')}
        {tabBtn('suppliers', 'Fournisseurs', 'Suppliers')}
      </div>
      {tab === 'orders' && <PurchaseOrdersSection ver={ver} />}
      {tab === 'suppliers' && <SuppliersSection ver={ver} />}
    </div>
  );
};
