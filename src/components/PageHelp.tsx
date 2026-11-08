// Bouton « ? » : l'aide de la page ouverte en 3 lignes (celles de la carte du site : siteKnowledge.ts), sans visite ni surbrillance. Guide G2 (2026-11-08).
// Utilisé par : TopBar.tsx (ordinateur) et Sidebar.tsx (téléphone). Pour modifier : prop `pageId` = identifiant du menu ; textes dans utils/siteKnowledge.ts. Aucun appel au serveur.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { findPage } from '../utils/siteKnowledge';
import { taskGuides } from '../utils/taskGuides';

export const TOUR_OPEN_EVENT = 'gp-tour-open'; // même événement que TourGuide.tsx

export const PageHelp: React.FC<{ pageId: string; role?: string; variant?: 'icon' | 'row'; onOpened?: () => void }> = ({ pageId, role, variant = 'icon', onOpened }) => {
  const { lang, theme } = useApp();
  const en = lang === 'en', L = theme === 'light';
  const t = (fr: string, e: string) => (en ? e : fr);
  const [open, setOpen] = useState(false);
  const page = findPage(pageId);
  const tasks = taskGuides(role);
  useEffect(() => { setOpen(false); }, [pageId]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!page) return null; // page sans fiche : pas de bouton plutôt qu'une aide vide
  const pick = (b: { fr: string; en: string }) => (en ? b.en : b.fr);
  const btn = variant === 'row'
    ? <button type="button" data-page-help-open onClick={() => { setOpen(true); onOpened?.(); }} className={`w-full min-h-[44px] flex items-center gap-2 px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}><HelpCircle className="w-4 h-4 text-emerald-500" />{t('Aide de cette page', 'Help for this page')}</button>
    : <button type="button" data-page-help-open onClick={() => setOpen(true)} title={t('Aide de cette page', 'Help for this page')} aria-label={t('Aide de cette page', 'Help for this page')} className={`relative shrink-0 w-10 h-10 flex items-center justify-center rounded-full border cursor-pointer ${L ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><HelpCircle className="w-5 h-5" /></button>;
  return (
    <>
      {btn}
      {open && typeof document !== 'undefined' && createPortal(
        <div data-guide-ui data-page-help className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-3 bg-black/50" onClick={() => setOpen(false)} {...(en ? { 'data-notranslate': '' } : {})}>
          <div role="dialog" aria-label={pick(page.title)} onClick={e => e.stopPropagation()} className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-[#f8fafc] text-[#0f172a] border-2 border-[#10b981] shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold text-base">{pick(page.title)}</h2>
              <button type="button" data-page-help-close onClick={() => setOpen(false)} aria-label={t('Fermer', 'Close')} className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[#334155]">{pick(page.purpose)}</p>
            <ol className="space-y-2 text-sm list-decimal pl-5" data-page-help-steps>
              {page.howto.map((h, i) => <li key={i}>{pick(h)}</li>)}
            </ol>
            {tasks.length > 0 && (
              <div data-page-help-tasks className="space-y-2 pt-1">
                <div className="text-xs font-bold text-[#334155]">{t('Que veux-tu faire ?', 'What do you want to do?')}</div>
                {tasks.map(tk => (
                  <button key={tk.id} type="button" data-task={tk.id} onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('gp-task-open', { detail: { steps: tk.steps } })); }} className="min-h-[44px] w-full text-left px-3 rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold cursor-pointer">{pick(tk.title)}</button>
                ))}
              </div>
            )}
            <button type="button" data-page-help-tour onClick={() => { setOpen(false); window.dispatchEvent(new Event(TOUR_OPEN_EVENT)); }} className="min-h-[44px] w-full rounded-lg border border-[#cbd5e1] bg-white text-sm font-semibold cursor-pointer">{t('Voir le guide animé', 'See the animated guide')}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
