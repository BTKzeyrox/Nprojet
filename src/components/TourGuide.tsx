import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, List, Pause, Play, Pointer, RotateCcw, SkipBack, SkipForward, X, HelpCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { markTourSeen, shouldShowTour } from '../utils/tour';
import { guideSteps } from '../utils/guideScripts';
import { bubbleDock, findTarget, holeBox, sceneDuration, sceneEvents, type Box } from '../utils/guideEngine';

// Guide « vidéo courte » (module 20, 2026-10-30) : s'ouvre tout seul à la première connexion de CHAQUE compte sur cet appareil (suivi par compte ; en « Voir comme », par rôle regardé), un guide DIFFÉRENT par rôle (src/utils/guideScripts.ts).
// Chaque scène ouvre la VRAIE page, fait clignoter un contour autour de l'élément réel, puis (s'il y a une action) un doigt glisse vers l'élément, touche, et la bulle montre le résultat : SIMULATION, rien n'est modifié.
// Lecture automatique (4 à 7 secondes par scène) avec pause, précédent, suivant et liste des scènes. Sans animation ni lecture automatique si l'appareil demande moins d'animations.
// Aucun appel au serveur, aucune donnée lue ou écrite.

const OPEN_EVENT = 'gp-tour-open';
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const prefersReduced = (): boolean => { try { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// Couleurs FIXES (pas de classes slate : le thème clair les changerait) : la bulle est claire et nette sur page sombre comme sur page claire.
const ctl = 'min-h-[44px] min-w-[44px] rounded-lg border border-[#cbd5e1] bg-white text-[#0f172a] hover:bg-[#f1f5f9] flex items-center justify-center gap-1.5 px-3 text-sm';
const ctlMain = 'min-h-[44px] min-w-[56px] rounded-lg border border-[#047857] bg-[#047857] text-white hover:bg-[#059669] flex items-center justify-center gap-1.5 px-4 text-sm font-semibold';

export const TourGuide: React.FC<{ userId: string; role: string; onNavigate: (page: string) => void }> = ({ userId, role, onNavigate }) => {
  const { lang } = useApp();
  const en = lang === 'en';
  const t = (fr: string, e: string) => (en ? e : fr);
  const [open, setOpen] = useState(() => shouldShowTour(store(), userId));
  const [i, setI] = useState(0);
  const [hole, setHole] = useState<Box | null>(null);   // le cadre qui clignote (null = élément pas trouvé ou scène sans élément)
  const [waiting, setWaiting] = useState(false);        // on cherche encore l'élément (la page vient de s'ouvrir)
  const [result, setResult] = useState(false);          // la simulation a été jouée
  const [finger, setFinger] = useState<'hidden' | 'start' | 'move' | 'tap'>('hidden');
  const [playing, setPlaying] = useState(() => !prefersReduced());
  const [ended, setEnded] = useState(false);
  const [showList, setShowList] = useState(false);
  const [epoch, setEpoch] = useState(0);                // relance l'animation de la barre quand on rejoue
  const lastPage = useRef<string | null>(null);
  const holeRef = useRef<Box | null>(null);
  const elapsed = useRef(0);                            // ms déjà jouées dans la scène (reprise après pause)
  const steps = guideSteps(role);
  const step = steps[Math.min(i, steps.length - 1)];
  const dur = sceneDuration(step, lang === 'en' ? 'en' : 'fr');
  const reduced = prefersReduced();
  holeRef.current = hole;

  // Un autre compte ou un autre rôle regardé (« Voir comme ») : on repart de zéro et on regarde si ce guide doit s'ouvrir.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setI(0); setEnded(false); setShowList(false); lastPage.current = null; setPlaying(!prefersReduced());
    setOpen(shouldShowTour(store(), userId));
  }, [userId, role]);

  useEffect(() => {
    const again = () => { setI(0); setEnded(false); setShowList(false); setPlaying(!prefersReduced()); lastPage.current = null; setEpoch(e => e + 1); setOpen(true); };
    window.addEventListener(OPEN_EVENT, again);
    return () => window.removeEventListener(OPEN_EVENT, again);
  }, []);

  const close = () => {
    markTourSeen(store(), userId);
    setOpen(false);
    if (lastPage.current && lastPage.current !== 'feed') onNavigate('feed'); // retour à l'accueil si on a ouvert d'autres pages
    lastPage.current = null;
  };

  // À chaque scène : ouvrir la page (si elle change), puis chercher l'élément et suivre sa position.
  useEffect(() => {
    if (!open) return;
    elapsed.current = 0;
    setResult(false); setFinger('hidden'); setHole(null); setWaiting(!!step.target);
    if (step.page && step.page !== lastPage.current) { onNavigate(step.page); }
    if (step.page) lastPage.current = step.page;
    let alive = true, tries = 0, scrolled = false;
    const tick = () => {
      if (!alive) return;
      const el = step.target ? findTarget(document, step.target, { width: window.innerWidth, height: window.innerHeight }) : null;
      if (el) {
        if (!scrolled) { scrolled = true; try { (el as unknown as Element).scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* sans défilement */ } }
        const r = el.getBoundingClientRect();
        const hb = holeBox({ left: r.left, top: r.top, width: r.width, height: r.height }, window.innerWidth, window.innerHeight);
        if (hb.width < 8 || hb.height < 8) { setHole(null); if (++tries > 6) setWaiting(false); return; } // cadre trop petit : jamais d'écran assombri sans trou visible
        setHole(hb);
        setWaiting(false);
      } else {
        setHole(null);
        if (++tries > 6) setWaiting(false); // 1,5 s : on affiche le texte « élément absent »
      }
    };
    const firstTick = setTimeout(tick, 120); // laisse le temps à la page de s'afficher
    const id = setInterval(tick, 250);
    const onMove = () => tick();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { alive = false; clearTimeout(firstTick); clearInterval(id); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, role, epoch]);

  // La lecture : le doigt part, touche, le résultat apparaît, puis la scène suivante. Pause = on garde le temps déjà joué.
  useEffect(() => {
    if (!open || !playing || showList) return;
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ev of sceneEvents(step, dur)) {
      if (ev.at < elapsed.current) continue; // déjà joué avant la pause
      timers.push(setTimeout(() => {
        if (ev.kind === 'finger') { if (holeRef.current && !prefersReduced()) { setFinger('start'); timers.push(setTimeout(() => setFinger('move'), 60)); } }
        else if (ev.kind === 'tap') { if (holeRef.current) setFinger(prefersReduced() ? 'hidden' : 'tap'); }
        else if (ev.kind === 'result') { if (holeRef.current) setResult(true); }
        else { if (i < steps.length - 1) setI(x => x + 1); else { setPlaying(false); setEnded(true); } }
      }, ev.at - elapsed.current));
    }
    return () => { elapsed.current += Date.now() - startedAt; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing, showList, i, role, epoch]);

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
  const dock = bubbleDock(hole, window.innerHeight, !step.page);
  const pos = dock === 'top' ? 'top-[calc(env(safe-area-inset-top)+8px)]' : dock === 'bottom' ? 'bottom-[calc(var(--bnh,0px)+env(safe-area-inset-bottom)+8px)]' : 'top-1/2 -translate-y-1/2';
  const tapRing = () => { setFinger('hidden'); if (step.action && !result) setResult(true); else if (!last) setI(x => x + 1); };
  const notFound = !!step.target && !hole && !waiting;
  const go = (k: number) => { setEnded(false); setI(Math.max(0, Math.min(steps.length - 1, k))); };
  const replay = () => { setEnded(false); setI(0); setEpoch(e => e + 1); setPlaying(true); };
  const cx = hole ? hole.left + hole.width / 2 : 0, cy = hole ? hole.top + hole.height / 2 : 0;
  const fx = finger === 'start' ? window.innerWidth * 0.55 : cx, fy = finger === 'start' ? window.innerHeight * 0.7 : cy;
  const dim = step.page ? '' : 'bg-black/35'; // l'écran de bienvenue assombrit un peu ; une scène sur une page ne cache jamais la page
  return createPortal(
    <div className="fixed inset-0 z-[110]" style={{ touchAction: 'none' }} role="dialog" aria-modal="true" aria-label={t('Guide interactif', 'Interactive guide')} data-notranslate="" data-guide-ui="">
      {hole
        ? <div className="gp-tour-ring" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} role="button" tabIndex={0}
            aria-label={step.action ? L(step.action.hint) : t('Élément montré par le guide', 'Item shown by the guide')}
            onClick={tapRing} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapRing(); } }} />
        : <div className={`absolute inset-0 ${dim}`} />}
      {hole && finger === 'tap' && <div key={`r${i}-${epoch}`} className="gp-ripple" style={{ left: cx, top: cy }} />}
      {hole && finger !== 'hidden' && <div className={`gp-finger${finger === 'tap' ? ' tap' : ''}`} style={{ left: fx, top: fy }} aria-hidden="true"><Pointer className="w-9 h-9 text-white" fill="#0f172a" strokeWidth={1.6} /></div>}
      <div className={`fixed left-2 right-2 mx-auto max-w-md max-h-[46vh] overflow-y-auto rounded-2xl bg-[#f8fafc] text-[#0f172a] border-2 border-[#10b981] shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-3 space-y-2 ${pos}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#047857] text-xs font-bold"><Compass className="w-4 h-4" />{t('Guide', 'Guide')} · {Math.min(i + 1, steps.length)}/{steps.length}</div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={t('Liste des scènes', 'Scene list')} aria-expanded={showList} onClick={() => { setShowList(v => !v); setPlaying(false); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#0f172a]"><List className="w-5 h-5" /></button>
            <button type="button" aria-label={t('Passer le guide', 'Skip the guide')} onClick={close} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#0f172a]"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {showList ? (
          <ol className="space-y-1" aria-label={t('Scènes du guide', 'Guide scenes')}>
            {steps.map((st, k) => (
              <li key={st.id}><button type="button" onClick={() => { go(k); setShowList(false); }} className={`w-full min-h-[44px] rounded-lg px-3 text-left text-sm border ${k === i ? 'border-[#047857] bg-[#d1fae5] text-[#064e3b] font-semibold' : 'border-[#e2e8f0] bg-white text-[#0f172a]'}`}>{k + 1}. {L(st.title)}</button></li>
            ))}
          </ol>
        ) : (
          <>
            <h2 className="text-base font-bold text-[#0f172a]">{L(step.title)}</h2>
            <p className="text-sm text-[#1e293b]" aria-live="polite">{L(step.text)}</p>
            {notFound && step.missing && <p className="text-xs text-[#92400e] rounded-lg bg-[#fef3c7] border border-[#f59e0b] p-2">{L(step.missing)}</p>}
            {hole && step.action && !result && <p className="text-sm text-[#064e3b] rounded-lg bg-[#d1fae5] border border-[#10b981] p-2 flex items-center gap-2"><Pointer className="w-4 h-4 shrink-0" />{L(step.action.hint)}</p>}
            {result && step.action && (
              <div className="text-sm rounded-lg bg-[#ecfdf5] border border-[#059669] p-2 space-y-1" role="status">
                <div className="text-[11px] font-bold text-[#047857]">{t('Simulation : rien n\'est modifié', 'Simulation: nothing is changed')}</div>
                <div className="text-[#064e3b]">{L(step.action.result)}</div>
              </div>
            )}
          </>
        )}
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((_, k) => (
            <span key={k} className="gp-seg">
              {k < i || (ended && k === i) ? <span style={{ width: '100%' }} /> : k === i ? <span key={`${i}-${epoch}`} className="gp-seg-fill" style={{ animationDuration: `${dur}ms`, animationPlayState: playing && !showList ? 'running' : 'paused' }} /> : null}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" className={ctl} onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('Scène précédente', 'Previous scene')}><SkipBack className="w-4 h-4" /></button>
            {ended
              ? <button type="button" className={ctlMain} onClick={replay}><RotateCcw className="w-4 h-4" />{t('Rejouer', 'Replay')}</button>
              : <button type="button" className={ctlMain} onClick={() => { setShowList(false); setPlaying(p => !p); }} aria-label={playing ? t('Pause', 'Pause') : t('Lecture', 'Play')}>{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>}
            <button type="button" className={ctl} onClick={() => go(i + 1)} disabled={last} aria-label={t('Scène suivante', 'Next scene')}><SkipForward className="w-4 h-4" /></button>
          </div>
          {(last || ended) && <button type="button" className={ctl} onClick={close}>{t('Terminer', 'Done')}</button>}
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
