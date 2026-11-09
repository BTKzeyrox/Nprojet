// Raccourci « Saisir la feuille du jour » (module 26) : visible sur le Tableau de bord du responsable et sur la page du chef d'équipe, seulement quand le module est ouvert.
// Utilisé par : AdminDashboard.tsx, TeamValidations.tsx. Ouvre la page par l'événement 'gp-open-view' (écouté dans App.tsx). Aucun appel au serveur.
import React, { useEffect, useState } from 'react';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WORK_SETTINGS_LIVE } from '../utils/workTypes';
import { db } from '../db/store';
import { weCanEnterFor } from '../utils/workEntry';
import { dayProgress } from '../utils/sheetDay';
import { useNow } from '../utils/useNow';

const madaToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // jour de Madagascar (UTC+3)
export const OPEN_VIEW_EVENT = 'gp-open-view';
export const openView = (view: string) => window.dispatchEvent(new CustomEvent(OPEN_VIEW_EVENT, { detail: view }));

export const WorksheetShortcut: React.FC = () => {
  const { lang, theme } = useApp();
  const en = lang === 'en', L = theme === 'light';
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useNow(15000); // le jour de Madagascar change tout seul à minuit
  if (!WORK_SETTINGS_LIVE) return null;
  const me = db.getCurrentUser();
  const prog = dayProgress(db.getUsers().filter(u => weCanEnterFor(me, u)), db.getPosts(), madaToday());
  return (
    <button type="button" data-worksheet-shortcut onClick={() => openView('worksheet')} className={`w-full min-h-[56px] flex items-center gap-3 px-4 py-3 rounded-2xl border text-left cursor-pointer ${L ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-emerald-950/40 border-emerald-700 text-emerald-100'}`}>
      <ClipboardList className="w-6 h-6 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm">{en ? 'Fill in the daily sheet' : 'Saisir la feuille du jour'}</span>
        <span className={`block text-xs ${L ? 'text-emerald-800' : 'text-emerald-200/80'}`}>{en ? 'Presence, hours or quantity of your operators' : 'Présence, heures ou quantité de tes opérateurs'}</span>
        {prog.total > 0 && (
          <span data-worksheet-progress className="block mt-1.5">
            <span className={`block text-xs font-semibold ${prog.done === prog.total ? (L ? 'text-emerald-800' : 'text-emerald-300') : (L ? 'text-amber-800' : 'text-amber-300')}`}>{en ? `${prog.done} of ${prog.total} entered today` : `${prog.done} sur ${prog.total} saisis aujourd'hui`}</span>
            <span className={`block h-1.5 rounded-full mt-1 overflow-hidden ${L ? 'bg-emerald-100' : 'bg-emerald-950'}`}><span className={`block h-full ${prog.done === prog.total ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></span>
          </span>
        )}
      </span>
      <ChevronRight className="w-5 h-5 shrink-0" />
    </button>
  );
};
