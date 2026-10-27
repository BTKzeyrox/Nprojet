import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, Send, AlertTriangle, Lock } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { bannerModel } from '../utils/offlineText';
import { openOfflineCenter } from './OfflineCenter';

// Bandeau du bas : « Hors ligne : N actions en attente » (avec nouvelle tentative automatique toutes les X secondes, réglable),
// « Envoi en cours », « À revoir », « Copie verrouillée », puis « Tout est envoyé ». Un seul bandeau à la fois, choisi par `bannerModel` (offlineText.ts).
export const ConnectionBanner: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [down, setDown] = useState(false);
  const [left, setLeft] = useState(0);
  const [, force] = useState(0);
  const [done, setDone] = useState(false);
  const [dismissedLock, setDismissedLock] = useState(false);
  const retry = Math.max(5, Math.round(db.getSettings().retry_seconds || 15));
  const hadWork = useRef(false); // il y a eu du travail en attente ou une coupure : on dira « Tout est envoyé » une fois
  const sinceMs = useRef<number | null>(null); // depuis quand des éléments restent non envoyés alors que le réseau est là

  useEffect(() => db.onConnection(setDown), []);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => {
    const off = () => setDown(true);
    const on = () => db.retryNow();
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);
  // Le compteur se rafraîchit chaque seconde (la comparaison des données est limitée à une fois par 0,75 s dans le magasin)
  useEffect(() => { const id = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!down) return;
    setLeft(retry);
    const timer = setInterval(() => {
      setLeft(l => {
        if (l <= 1) {
          if (!db.isDemoCut()) db.retryNow(); // coupure simulée en démo : pas de vraie tentative
          return retry;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [down, retry]);

  const st = db.getOfflineStatus();
  const un = db.getUnsent();
  const isDown = down || db.isDemoCut();
  if (un.count > 0 || isDown) hadWork.current = true;
  if (!isDown && un.count > 0) { if (sinceMs.current === null) sinceMs.current = Date.now(); } else sinceMs.current = null;
  const pendingSecs = sinceMs.current === null ? 0 : (Date.now() - sinceMs.current) / 1000;
  const allSent = !isDown && un.count === 0 && st.review.length === 0 && hadWork.current;
  // « Tout est envoyé » : montré 4 secondes, une seule fois
  useEffect(() => {
    if (!allSent) return;
    hadWork.current = false;
    setDone(true);
    const id = setTimeout(() => setDone(false), 4000);
    return () => clearTimeout(id);
  }, [allSent]);

  const m = bannerModel({
    down: isDown, unsent: un.count, review: st.review.length, kept: st.enabled && !st.problem, needsCode: st.needs_code, locked: st.locked && !dismissedLock, canOffline: st.can_offline,
    pendingSecs, justDone: done,
  }, lang);
  if (!m.kind) return null;

  const box = 'fixed left-1/2 -translate-x-1/2 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-[90] max-w-[92vw] rounded-2xl border px-3 py-2 flex items-center gap-2.5 shadow-2xl text-xs sm:text-sm';
  const small = 'rounded-xl px-2 py-1 font-bold flex items-center gap-1 cursor-pointer shrink-0 text-white';
  if (m.kind === 'offline') {
    return (
      <div role="status" aria-live="polite" className={`${box} bg-amber-950 border-amber-500/70 text-amber-100`} data-testid="banner-offline">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
        <div className="min-w-0">
          <div className="font-semibold">{m.text}</div>
          {m.hint && <div className="text-[11px] text-amber-200/90 leading-snug">{m.hint}</div>}
          {!db.isDemoCut() && <div className="text-[11px] text-amber-200/70">{t(`Nouvelle tentative dans ${left} s`, `Next try in ${left} s`)}</div>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {(un.count > 0 || st.review.length > 0 || st.locked) && <button type="button" onClick={() => openOfflineCenter(un.count > 0 || st.locked ? 'pending' : 'review')} className={`${small} bg-slate-700 hover:bg-slate-600`}>{t('Voir', 'View')}</button>}
          {!db.isDemoCut() && <button type="button" onClick={() => { db.retryNow(); setLeft(retry); }} className={`${small} bg-amber-600 hover:bg-amber-500`}><RefreshCw className="w-3.5 h-3.5" />{t('Réessayer', 'Retry')}</button>}
        </div>
      </div>
    );
  }
  if (m.kind === 'done') return <div role="status" aria-live="polite" className={`${box} bg-emerald-950 border-emerald-500/70 text-emerald-100`} data-testid="banner-done"><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /><span className="font-semibold">{m.text}</span></div>;
  if (m.kind === 'sending') return <button type="button" onClick={() => openOfflineCenter('pending')} className={`${box} bg-blue-950 border-blue-500/70 text-blue-100 cursor-pointer`} data-testid="banner-sending"><Send className="w-4 h-4 shrink-0 text-blue-400" /><span className="font-semibold">{m.text}</span></button>;
  if (m.kind === 'review') return <button type="button" onClick={() => openOfflineCenter('review')} className={`${box} bg-amber-950 border-amber-500/70 text-amber-100 cursor-pointer`} data-testid="banner-review"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" /><span className="font-semibold">{m.text}</span><span className="text-[11px] text-amber-200/80">{t('Voir', 'View')}</span></button>;
  return (
    <div role="status" className={`${box} bg-slate-900 border-slate-500/70 text-slate-100`} data-testid="banner-locked">
      <Lock className="w-4 h-4 shrink-0 text-slate-300" />
      <div className="min-w-0"><div className="font-semibold">{m.text}</div>{m.hint && <div className="text-[11px] text-slate-300 leading-snug">{m.hint}</div>}</div>
      <button type="button" onClick={() => openOfflineCenter('pending')} className={`${small} bg-emerald-600 hover:bg-emerald-500`}>{t('Ouvrir', 'Open')}</button>
      <button type="button" onClick={() => setDismissedLock(true)} className={`${small} bg-slate-700 hover:bg-slate-600`}>{t('Plus tard', 'Later')}</button>
    </div>
  );
};
