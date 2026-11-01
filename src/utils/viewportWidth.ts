// Largeur de l'écran en pixels du site, fiable APRÈS une rotation (téléphone ou tablette).
// Défaut vu sur iPhone / iPad (2026-11-01) : juste après le passage en paysage, `window.innerWidth` garde un instant l'ancienne largeur (portrait) ;
// le menu croyait être sur téléphone alors que l'écran était large : le menu se posait par-dessus la page et le contenu restait coincé à gauche.
// `documentElement.clientWidth` est mis à jour plus tôt ; on relit aussi après quelques instants, car iOS termine la rotation en deux temps.
import { useEffect, useState } from 'react';

export interface WidthSource {
  innerWidth: number;
  document?: { documentElement?: { clientWidth?: number } };
  visualViewport?: { width?: number; scale?: number } | null;
}

/** Largeur à utiliser : celle de la page (sans barre de défilement) si elle est connue, sinon `innerWidth`. Jamais 0, jamais NaN. */
export function readViewportWidth(w: WidthSource, fallback = 1280): number {
  const cw = Number(w.document?.documentElement?.clientWidth);
  const iw = Number(w.innerWidth);
  const vv = w.visualViewport;
  const vw = vv && Number(vv.scale) <= 1.01 ? Number(vv.width) : NaN; // en zoom, la vue visible est plus étroite que la page : on l'ignore
  const ok = (n: number) => Number.isFinite(n) && n > 0;
  if (ok(vw) && ok(cw)) return Math.round(Math.max(cw, vw)); // les deux sont à jour après une rotation ; au moindre doute on prend la plus large (jamais un menu « téléphone » sur un écran large)
  if (ok(cw)) return Math.round(cw);
  if (ok(iw)) return Math.round(iw);
  return fallback;
}

/** Suit la largeur : changement de taille, rotation, vue visible, et relectures différées (iOS met la rotation à jour en deux temps). */
export function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : readViewportWidth(window as unknown as WidthSource)));
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const read = () => setW(prev => { const n = readViewportWidth(window as unknown as WidthSource); return n === prev ? prev : n; });
    const later = () => { read(); for (const ms of [60, 200, 500, 1000]) timers.push(setTimeout(read, ms)); };
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', later);
    window.visualViewport?.addEventListener('resize', read);
    try { window.screen?.orientation?.addEventListener?.('change', later); } catch { /* ancien navigateur */ }
    read();
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', later);
      window.visualViewport?.removeEventListener('resize', read);
      try { window.screen?.orientation?.removeEventListener?.('change', later); } catch { /* ancien navigateur */ }
      timers.forEach(clearTimeout);
    };
  }, []);
  return w;
}
