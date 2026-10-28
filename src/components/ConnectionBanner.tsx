import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, Send, AlertTriangle, Lock } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { bannerModel } from '../utils/offlineText';
import { openOfflineCenter } from './OfflineCenter';

// État de la connexion, partagé entre le bandeau du bas (hors ligne, avec ses explications et « Réessayer ») et la pastille du header (tous les états :
// « Hors ligne », « Envoi en cours », « À revoir », « Copie verrouillée », puis « Tout est envoyé »). Un seul modèle, choisi par `bannerModel` (offlineText.ts).
// `withCountdown` : seul le bandeau du bas fait le compte à rebours et relance l'envoi (sinon la pastille doublerait les tentatives).
export function useConnectionModel(withCountdown: boolean) {
  const { lang } = useApp();
  const [down, setDown] = useState(false);
  const [left, setLeft] = useState(0);
  const [, force] = useState(0);
  const [done, setDone] = useState(false);
  const retry = Math.max(5, Math.round(db.getSettings().retry_seconds || 15));
  const hadWork = useRef(false); // il y a eu du travail en attente ou une coupure : on dira « Tout est envoyé » une fois
  const sinceMs = useRef<number | null>(null); // depuis quand des éléments restent non envoyés alors que le réseau est là

  useEffect(() => db.onConnection(setDown), []);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => {
    const off = () => setDown(true);
    const on = () => { if (withCountdown) db.retryNow(); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, [withCountdown]);
  // Le compteur se rafraîchit chaque seconde (la comparaison des données est limitée à une fois par 0,75 s dans le magasin)
  useEffect(() => { const id = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!down || !withCountdown) return;
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
  }, [down, retry, withCountdown]);

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
    down: isDown, unsent: un.count, review: st.review.length, kept: st.enabled && !st.problem, needsCode: st.needs_code, locked: st.locked, canOffline: st.can_offline,
    pendingSecs, justDone: done,
  }, lang);
  return { m, un, st, isDown, left, setLeft, retry, lang };
}

/** Bandeau du bas : seulement « Hors ligne » (avec son explication, le compte à rebours et « Réessayer »). Les autres états sont dans la pastille du header. */
export const ConnectionBanner: React.FC = () => {
  const { m, un, st, left, setLeft, retry, lang } = useConnectionModel(true);
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (m.kind !== 'offline') return null;

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
};

/** Pastille du header : l'état de l'envoi en un coup d'œil, tous états confondus ; la toucher ouvre le centre « hors ligne ». */
export const ConnectionChip: React.FC = () => {
  const { m, un, st, lang } = useConnectionModel(false);
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (!m.kind) return null;
  const n = m.kind === 'review' ? st.review.length : m.kind === 'offline' || m.kind === 'sending' ? un.count : 0;
  const look = {
    offline: { cls: 'bg-amber-950 border-amber-500/70 text-amber-100', Icon: WifiOff, ic: 'text-amber-400', label: t('Hors ligne', 'Offline') },
    sending: { cls: 'bg-blue-950 border-blue-500/70 text-blue-100', Icon: Send, ic: 'text-blue-400', label: t('Envoi en cours', 'Sending') },
    review: { cls: 'bg-amber-950 border-amber-500/70 text-amber-100', Icon: AlertTriangle, ic: 'text-amber-400', label: t('À revoir', 'To review') },
    locked: { cls: 'bg-slate-800 border-slate-500/70 text-slate-100', Icon: Lock, ic: 'text-slate-300', label: t('Copie verrouillée', 'Copy locked') },
    done: { cls: 'bg-emerald-950 border-emerald-500/70 text-emerald-100', Icon: CheckCircle2, ic: 'text-emerald-400', label: t('Tout est envoyé', 'Everything is sent') },
  }[m.kind];
  const { Icon } = look;
  const openIt = () => openOfflineCenter(m.kind === 'review' ? 'review' : un.count > 0 || st.locked || st.review.length === 0 ? 'pending' : 'review');
  const body = (
    <>
      <Icon className={`w-4 h-4 shrink-0 ${look.ic} ${m.kind === 'sending' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      <span className="hidden min-[460px]:inline whitespace-nowrap">{look.label}</span>
      {n > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/15 text-[11px] leading-[18px] text-center font-bold">{n}</span>}
    </>
  );
  const box = `shrink-0 h-9 px-2.5 rounded-full border flex items-center gap-1.5 text-xs font-bold ${look.cls}`;
  const title = `${m.text}${m.hint ? ' : ' + m.hint : ''}`;
  if (m.kind === 'done') return <span role="status" aria-live="polite" title={title} className={box} data-testid="chip-done">{body}</span>;
  return <button type="button" onClick={openIt} title={title} aria-label={title} className={`${box} cursor-pointer`} data-testid={`chip-${m.kind}`}>{body}</button>;
};
