import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Landmark } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { periodRange, shiftAnchor, todayMada } from '../../utils/stats';
import { FinanceTab } from './FinanceTab';
import { TreasuryCharts } from './TreasuryCharts';

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Trésorerie (Comptable) : paiements reçus et dépenses du mois. Jamais de salaires ni de paie : ces chiffres restent au responsable.
export const TreasuryPage: React.FC = () => {
  const l = useApp().lang === 'en' ? 'en' : 'fr';
  const today = todayMada();
  const [anchor, setAnchor] = useState(today);
  const range = periodRange('month', anchor);
  const atPresent = anchor.slice(0, 7) >= today.slice(0, 7);
  const m = Number(anchor.slice(5, 7)) - 1;
  const label = `${(l === 'en' ? MONTHS_EN : MONTHS_FR)[m]} ${anchor.slice(0, 4)}`;
  const nav = 'min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 bg-slate-900/60 text-slate-200 flex items-center justify-center disabled:opacity-40 cursor-pointer';
  return (
    <div className="max-w-3xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <div className="flex items-center gap-2.5">
        <Landmark className="w-6 h-6 text-emerald-500 shrink-0" />
        <h2 className="font-tactical font-black text-lg text-white">{l === 'en' ? 'Treasury' : 'Trésorerie'}</h2>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label={l === 'en' ? 'Previous month' : 'Mois précédent'} onClick={() => setAnchor(shiftAnchor('month', anchor, -1))} className={nav}><ChevronLeft className="w-5 h-5" /></button>
        <div data-notranslate="" className="text-base sm:text-lg font-bold text-white capitalize truncate">{label}</div>
        <button type="button" aria-label={l === 'en' ? 'Next month' : 'Mois suivant'} disabled={atPresent} onClick={() => setAnchor(shiftAnchor('month', anchor, 1))} className={nav}><ChevronRight className="w-5 h-5" /></button>
      </div>
      <TreasuryCharts range={{ start: range.start, end: range.end }} lang={l} />
      <FinanceTab range={{ start: range.start, end: range.end }} lang={l} salariesAr={0} advancesAr={0} moneyOnly />
    </div>
  );
};
