// Petits « crochets » React pour le mode hors ligne (module 13, M13.6) : savoir si on est hors ligne, et suivre ce qui n'est pas encore envoyé
// sans que chaque petite marque ne refasse le calcul : UN seul minuteur partagé, et un rafraîchissement seulement quand la liste change.
import { useEffect, useState } from 'react';
import { db } from '../db/store';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let sig = '';
const check = () => {
  const s = db.getUnsent().items.map(i => i.key).join(',') + '|' + (db.isDemoCut() ? 1 : 0);
  if (s !== sig) { sig = s; listeners.forEach(f => f()); }
};

/** Se met à jour quand la liste des éléments non envoyés change (et au plus une vérification par seconde). */
export function useUnsentTick(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    const off = db.subscribe(check);
    if (!timer) timer = setInterval(check, 1000);
    check();
    return () => { off(); listeners.delete(l); if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; } };
  }, []);
}

/** Vrai quand il n'y a pas de réseau (ou en démo pendant une coupure simulée). */
export function useIsOffline(): boolean {
  const [down, setDown] = useState(false);
  const [, force] = useState(0);
  useEffect(() => db.onConnection(setDown), []);
  useEffect(() => {
    const f = () => force(n => n + 1);
    window.addEventListener('offline', f); window.addEventListener('online', f);
    const off = db.subscribe(f);
    return () => { window.removeEventListener('offline', f); window.removeEventListener('online', f); off(); };
  }, []);
  return down || db.isDemoCut() || (typeof navigator !== 'undefined' && navigator.onLine === false);
}
