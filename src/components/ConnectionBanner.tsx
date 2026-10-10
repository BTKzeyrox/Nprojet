import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { db } from '../db/store';

// Bandeau « Connexion perdue » : nouvelle tentative automatique toutes les X secondes (réglable)
export const ConnectionBanner: React.FC = () => {
  const [down, setDown] = useState(false);
  const [left, setLeft] = useState(0);
  const retry = Math.max(5, Math.round(db.getSettings().retry_seconds || 15));

  useEffect(() => db.onConnection(setDown), []);
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
  useEffect(() => {
    if (!down) return;
    setLeft(retry);
    const t = setInterval(() => {
      setLeft(l => {
        if (l <= 1) {
          db.retryNow();
          return retry;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [down, retry]);

  if (!down) return null;
  return (
    <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-[90] max-w-[92vw] bg-amber-950 border border-amber-500/70 text-amber-100 px-3 py-2 flex items-center gap-2.5 shadow-2xl text-xs sm:text-sm">
      <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
      <span>Connexion perdue. Nouvelle tentative dans {left} s</span>
      <button
        type="button"
        onClick={() => { db.retryNow(); setLeft(retry); }}
        className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1 cursor-pointer shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Réessayer
      </button>
    </div>
  );
};
