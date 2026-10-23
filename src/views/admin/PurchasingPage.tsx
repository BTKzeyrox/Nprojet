import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { SuppliersSection } from './SuppliersSection';

// Page « Achats » (responsable seulement) : fournisseurs, bons de commande, inventaire.
// Les sections s'ajoutent étape par étape (M4.1 fournisseurs, M4.2 bons, M4.3 inventaire).

type Tab = 'suppliers';

export const PurchasingPage: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [ver, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [tab] = useState<Tab>('suppliers');
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4">
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Achats', 'Purchasing')}</h1>
        <p className="text-[11px] text-slate-400">{t('Fournisseurs, bons de commande et inventaire du stock.', 'Suppliers, purchase orders and stock inventory.')}</p>
      </div>
      {tab === 'suppliers' && <SuppliersSection ver={ver} />}
    </div>
  );
};
