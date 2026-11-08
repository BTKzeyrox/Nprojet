// Raccourci « Saisir la feuille du jour » (module 26) : visible sur le Tableau de bord du responsable et sur la page du chef d'équipe, seulement quand le module est ouvert.
// Utilisé par : AdminDashboard.tsx, TeamValidations.tsx. Ouvre la page par l'événement 'gp-open-view' (écouté dans App.tsx). Aucun appel au serveur.
import React from 'react';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WORK_SETTINGS_LIVE } from '../utils/workTypes';

export const OPEN_VIEW_EVENT = 'gp-open-view';
export const openView = (view: string) => window.dispatchEvent(new CustomEvent(OPEN_VIEW_EVENT, { detail: view }));

export const WorksheetShortcut: React.FC = () => {
  const { lang, theme } = useApp();
  const en = lang === 'en', L = theme === 'light';
  if (!WORK_SETTINGS_LIVE) return null;
  return (
    <button type="button" data-worksheet-shortcut onClick={() => openView('worksheet')} className={`w-full min-h-[56px] flex items-center gap-3 px-4 py-3 rounded-2xl border text-left cursor-pointer ${L ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-emerald-950/40 border-emerald-700 text-emerald-100'}`}>
      <ClipboardList className="w-6 h-6 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm">{en ? 'Fill in the daily sheet' : 'Saisir la feuille du jour'}</span>
        <span className={`block text-xs ${L ? 'text-emerald-800' : 'text-emerald-200/80'}`}>{en ? 'Presence, hours or quantity of your operators' : 'Présence, heures ou quantité de tes opérateurs'}</span>
      </span>
      <ChevronRight className="w-5 h-5 shrink-0" />
    </button>
  );
};
