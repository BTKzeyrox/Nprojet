import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { db } from '../db/store';

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
      try { await Promise.all([db.refreshNow(), new Promise(r => setTimeout(r, 700))]); } catch { /* ignore */ }
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

  if (disabled || (pull === 0 && !loading)) return null;
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
