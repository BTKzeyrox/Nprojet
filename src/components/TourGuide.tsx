import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Compass, X, HelpCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { markTourSeen, shouldShowTour, tourSteps } from '../utils/tour';

// Visite guidée (module 16, M16.2) : s'ouvre toute seule à la première connexion sur cet appareil, par rôle ; se revoit depuis Réglages.
// Les textes viennent de la carte du site (src/utils/tour.ts → siteKnowledge.ts). Aucun appel au serveur.

const OPEN_EVENT = 'gp-tour-open';
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const btn = 'min-h-[44px] px-4 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center justify-center gap-1.5';
const btnMain = 'min-h-[44px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5';

export const TourGuide: React.FC<{ userId: string; role: string; onNavigate: (page: string) => void }> = ({ userId, role, onNavigate }) => {
  const { lang } = useApp();
  const en = lang === 'en';
  const t = (fr: string, e: string) => (en ? e : fr);
  const [open, setOpen] = useState(() => shouldShowTour(store(), userId));
  const [i, setI] = useState(0);
  useLockBodyScroll(open);

  useEffect(() => {
    const again = () => { setI(0); setOpen(true); };
    window.addEventListener(OPEN_EVENT, again);
    return () => window.removeEventListener(OPEN_EVENT, again);
  }, []);

  const steps = tourSteps(role);
  const close = () => { markTourSeen(store(), userId); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!open || typeof document === 'undefined') return null;

  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const L = (b: { fr: string; en: string }) => (en ? b.en : b.fr);
  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={t('Visite guidée', 'Guided tour')} {...(en ? { 'data-notranslate': '' } : {})}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold"><Compass className="w-4 h-4" />{t('Visite guidée', 'Guided tour')} · {Math.min(i + 1, steps.length)}/{steps.length}</div>
          <button type="button" aria-label={t('Passer la visite', 'Skip the tour')} onClick={close} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <h2 className="text-lg font-bold text-white">{L(step.title)}</h2>
        <p className="text-sm text-slate-200">{L(step.text)}</p>
        {step.tips.length > 0 && (
          <div className="text-sm text-slate-300 rounded-lg bg-slate-900/60 p-3 space-y-1.5" data-tour-tips>
            <div className="font-semibold text-emerald-300">{t('Astuces', 'Tips')}</div>
            <ul className="list-disc pl-5 space-y-1">{step.tips.map((x, k) => <li key={k}>{L(x)}</li>)}</ul>
          </div>
        )}
        {step.tip && <p className="text-sm text-slate-300 rounded-lg bg-slate-900/60 p-3"><span className="font-semibold text-slate-100">{t('Pour commencer : ', 'To start: ')}</span>{L(step.tip)}</p>}
        <div className="flex gap-1.5 justify-center" aria-hidden="true">{steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full ${k === i ? 'w-5 bg-emerald-400' : 'w-1.5 bg-slate-700'}`} />)}</div>
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="button" className={btn} onClick={close}>{t('Passer', 'Skip')}</button>
          <div className="flex flex-wrap gap-2 justify-end">
            {i > 0 && <button type="button" className={btn} onClick={() => setI(i - 1)}>{t('Précédent', 'Back')}</button>}
            {step.page && <button type="button" className={btn} onClick={() => { const p = step.page as string; close(); onNavigate(p); }}>{t('Ouvrir cette page', 'Open this page')}</button>}
            {last
              ? <button type="button" className={btnMain} onClick={close}>{t('Terminer', 'Done')}</button>
              : <button type="button" className={btnMain} onClick={() => setI(i + 1)}>{t('Suivant', 'Next')}<ArrowRight className="w-4 h-4" /></button>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Carte « Aide » des Réglages : revoir la visite guidée quand on veut. */
export const TourReplayCard: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><HelpCircle className="w-4 h-4 text-emerald-400" />{t('Aide', 'Help')}</h3>
      <p className="text-[11px] text-slate-400">{t("La visite guidée montre où se trouve chaque chose, selon ton rôle.", 'The guided tour shows where everything is, for your role.')}</p>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className="px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-600 text-sm font-semibold cursor-pointer text-slate-100 flex items-center gap-1.5"><Compass className="w-4 h-4" />{t('Revoir la visite guidée', 'Replay the guided tour')}</button>
    </section>
  );
};
