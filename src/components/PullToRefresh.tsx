// Tirer la page vers le bas en haut de page : une roue tourne puis les données sont actualisées.
// Utilisé par : App.tsx.
// Pour modifier : prop disabled ; seuil de tirage THRESHOLD et limite MAX en tête de fichier ; l'actualisation appelle db.refreshNow(). Rien ne se déclenche si la page est défilée ou bloquée.
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { db } from '../db/store';
import { buildNotifications } from '../utils/notifications';
import { summarizeRefresh } from '../utils/refreshSummary';
import { checkUpdateNow } from '../utils/updateWatcher';
import { useApp } from '../context/AppContext';

// Tirer la page vers le bas (en haut de page) : roue qui tourne, puis actualisation, comme sur Facebook.
const THRESHOLD = 70;
const MAX = 110;

// Vrai si un parent défilable de l'élément n'est pas tout en haut (alors on laisse défiler normalement)
const scrolledInside = (el: EventTarget | null): boolean => {
  let n = el as HTMLElement | null;
  while (n && n !== document.body && n !== document.documentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
    n = n.parentElement;
  }
  return false;
};

export const PullToRefresh: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null); // résultat affiché quelques secondes après l'actualisation
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const app = useApp(); const en = app.lang === 'en';
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (disabled) return;
    const set = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      const blocked = busy.current || window.scrollY > 0 || document.body.style.position === 'fixed' || scrolledInside(e.target);
      startY.current = blocked ? null : e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { if (pullRef.current) set(0); return; }
      if (window.scrollY > 0) { startY.current = null; set(0); return; }
      set(Math.min(MAX, dy * 0.5));
    };
    const onEnd = async () => {
      const reached = pullRef.current >= THRESHOLD;
      startY.current = null;
      if (!reached) { set(0); return; }
      busy.current = true;
      setLoading(true);
      set(56);
      const ids = () => { const u = db.getCurrentUser(); try { return u ? buildNotifications(u).map(x => x.id) : []; } catch { return []; } };
      const before = ids();
      let ok = false, fresh = false;
      try { [ok, fresh] = (await Promise.all([db.refreshNow(), checkUpdateNow(), new Promise(r => setTimeout(r, 700))])).slice(0, 2) as [boolean, boolean]; } catch { ok = false; }
      const r = summarizeRefresh(before, ids(), ok, fresh, en);
      setNote({ text: r.text, bad: r.kind === 'offline' });
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => setNote(null), 3500);
      busy.current = false;
      setLoading(false);
      set(0);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled]);

  const noteEl = note ? (
    <div role="status" aria-live="polite" data-refresh-note className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none px-4" style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}>
      <div className={`max-w-full rounded-full px-4 py-2 text-sm font-semibold shadow-lg border ${note.bad ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-white text-slate-800 border-slate-200'}`}>{note.text}</div>
    </div>
  ) : null;
  if (disabled || (pull === 0 && !loading)) return noteEl;
  const ratio = Math.min(1, pull / THRESHOLD);
  return (
    <div
      className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
      style={{ top: 'calc(57px + env(safe-area-inset-top, 0px))', transform: `translateY(${pull - 36}px)`, transition: startY.current === null ? 'transform .2s ease' : 'none' }}
      aria-hidden="true"
    >
      <div className="w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center">
        <RefreshCw
          className={`w-5 h-5 text-blue-600 ${loading ? 'animate-spin' : ''}`}
          style={loading ? undefined : { transform: `rotate(${ratio * 270}deg)`, opacity: 0.3 + ratio * 0.7 }}
        />
      </div>
    </div>
  );
};
