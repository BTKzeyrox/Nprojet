import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Compass, Hand, X, HelpCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { markTourSeen, shouldShowTour } from '../utils/tour';
import { guideSteps } from '../utils/guideScripts';
import { bubbleDock, findTarget, holeBox, type Box } from '../utils/guideEngine';

// Guide interactif (module 16, revu le 2026-10-29) : s'ouvre tout seul à la première connexion sur cet appareil, un guide DIFFÉRENT par rôle (src/utils/guideScripts.ts) ; se revoit depuis Réglages.
// Chaque étape ouvre la VRAIE page, assombrit le reste et fait clignoter un contour autour de l'élément réel. Toucher l'élément lance une SIMULATION : rien n'est modifié.
// Aucun appel au serveur, aucune donnée écrite.

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
  const [hole, setHole] = useState<Box | null>(null);   // le cadre qui clignote (null = élément pas trouvé ou étape sans élément)
  const [waiting, setWaiting] = useState(false);        // on cherche encore l'élément (la page vient de s'ouvrir)
  const [result, setResult] = useState(false);          // la simulation a été lancée
  const lastPage = useRef<string | null>(null);
  const steps = guideSteps(role);
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => {
    const again = () => { setI(0); lastPage.current = null; setOpen(true); };
    window.addEventListener(OPEN_EVENT, again);
    return () => window.removeEventListener(OPEN_EVENT, again);
  }, []);

  const close = () => {
    markTourSeen(store(), userId);
    setOpen(false);
    if (lastPage.current && lastPage.current !== 'feed') onNavigate('feed'); // retour à l'accueil si on a ouvert d'autres pages
    lastPage.current = null;
  };

  // À chaque étape : ouvrir la page (si elle change), puis chercher l'élément et suivre sa position.
  useEffect(() => {
    if (!open) return;
    setResult(false); setHole(null); setWaiting(!!step.target);
    if (step.page && step.page !== lastPage.current) { onNavigate(step.page); }
    if (step.page) lastPage.current = step.page;
    let alive = true, tries = 0, scrolled = false;
    const tick = () => {
      if (!alive) return;
      const el = step.target ? findTarget(document, step.target) : null;
      if (el) {
        if (!scrolled) { scrolled = true; try { (el as unknown as Element).scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* sans défilement */ } }
        const r = el.getBoundingClientRect();
        setHole(holeBox({ left: r.left, top: r.top, width: r.width, height: r.height }, window.innerWidth, window.innerHeight));
        setWaiting(false);
      } else {
        setHole(null);
        if (++tries > 6) setWaiting(false); // 1,5 s : on affiche le texte « élément absent »
      }
    };
    const first = setTimeout(tick, 120); // laisse le temps à la page de s'afficher
    const id = setInterval(tick, 250);
    const onMove = () => tick();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { alive = false; clearTimeout(first); clearInterval(id); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, role]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && i < steps.length - 1) setI(x => x + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI(x => x - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (!open || typeof document === 'undefined') return null;

  const last = i >= steps.length - 1;
  const L = (b: { fr: string; en: string }) => (en ? b.en : b.fr);
  const dock = bubbleDock(hole, window.innerHeight);
  const pos = dock === 'top' ? 'top-[calc(env(safe-area-inset-top)+8px)]' : dock === 'bottom' ? 'bottom-[calc(var(--bnh,0px)+env(safe-area-inset-bottom)+8px)]' : 'top-1/2 -translate-y-1/2';
  const tap = () => { if (step.action && !result) setResult(true); else if (!last) setI(x => x + 1); };
  const notFound = !!step.target && !hole && !waiting;
  return createPortal(
    <div className="fixed inset-0 z-[110]" style={{ touchAction: 'none' }} role="dialog" aria-modal="true" aria-label={t('Guide interactif', 'Interactive guide')} data-notranslate="" data-guide-ui="">
      {hole
        ? <div className="gp-tour-ring" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} role="button" tabIndex={0}
            aria-label={step.action ? L(step.action.hint) : t('Élément montré par le guide', 'Item shown by the guide')}
            onClick={tap} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } }} />
        : <div className="absolute inset-0 bg-black/65" />}
      <div className={`fixed left-2 right-2 mx-auto max-w-md max-h-[46vh] overflow-y-auto rounded-2xl bg-[#0f1722] border border-slate-700 shadow-2xl p-3 space-y-2 ${pos}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold"><Compass className="w-4 h-4" />{t('Guide', 'Guide')} · {Math.min(i + 1, steps.length)}/{steps.length}</div>
          <button type="button" aria-label={t('Passer le guide', 'Skip the guide')} onClick={close} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <h2 className="text-base font-bold text-white">{L(step.title)}</h2>
        <p className="text-sm text-slate-200" aria-live="polite">{L(step.text)}</p>
        {notFound && step.missing && <p className="text-xs text-amber-200 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">{L(step.missing)}</p>}
        {hole && step.action && !result && <p className="text-sm text-emerald-200 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 flex items-center gap-2"><Hand className="w-4 h-4 shrink-0" />{L(step.action.hint)}</p>}
        {result && step.action && (
          <div className="text-sm rounded-lg bg-emerald-500/15 border border-emerald-500/40 p-2 space-y-1" role="status">
            <div className="text-[11px] font-semibold text-emerald-300">{t('Simulation : rien n\'est modifié', 'Simulation: nothing is changed')}</div>
            <div className="text-slate-100">{L(step.action.result)}</div>
          </div>
        )}
        <div className="flex gap-1.5 justify-center" aria-hidden="true">{steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full ${k === i ? 'w-5 bg-emerald-400' : 'w-1.5 bg-slate-700'}`} />)}</div>
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="button" className={btn} onClick={close}>{t('Passer', 'Skip')}</button>
          <div className="flex flex-wrap gap-2 justify-end">
            {i > 0 && <button type="button" className={btn} onClick={() => setI(i - 1)}>{t('Précédent', 'Back')}</button>}
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
