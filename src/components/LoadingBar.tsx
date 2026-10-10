import React, { useEffect, useState } from 'react';
import { db } from '../db/store';

// Fine barre sous l'en-tête : visible dès qu'une action envoyée au serveur est en cours
export const LoadingBar: React.FC = () => {
  const [busy, setBusy] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => db.onNetwork(setBusy), []);
  useEffect(() => {
    if (busy > 0) { setShow(true); return; }
    const t = setTimeout(() => setShow(false), 250); // reste un instant pour qu'on la voie, même si c'était très rapide
    return () => clearTimeout(t);
  }, [busy]);
  if (!show) return null;
  return (
    <div role="progressbar" aria-label="Chargement" style={{ left: 'var(--sbw, 0px)' }} className="df-loadbar pointer-events-none fixed top-[56px] left-0 right-0 z-[25] h-[3px] overflow-hidden">
      <div className="df-loadbar-run h-full w-1/3 bg-emerald-400" />
    </div>
  );
};
