import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { todayMada } from '../../utils/stats';
import { StockTab } from './StockTab';

// Page « Stockage » (responsable seulement) : sa propre page, hors de Statistiques.
// Étape 1 : la liste des produits (photos, recherche, filtres, entrées/sorties) et ses graphiques, déplacés tels quels.
// Étapes suivantes : Tableau de bord, Mouvements, Analyses (avec leur propre période).
export const StoragePage: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const today = todayMada();
  const range = { start: `${today.slice(0, 8)}01`, end: today }; // le mois en cours
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4">
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Stockage', 'Storage')}</h1>
        <p className="text-[11px] text-slate-400">{t('Produits, quantités, photos, épuisés et alertes.', 'Products, quantities, photos, out of stock and alerts.')}</p>
      </div>
      <StockTab range={range} lang={lang === 'en' ? 'en' : 'fr'} />
    </div>
  );
};
