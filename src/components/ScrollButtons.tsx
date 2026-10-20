import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { releaseOrphanBodyLock } from '../utils/useLockBodyScroll';

// Boutons « Haut » et « Bas » : toujours disponibles quand la page est plus longue que l'écran,
// même si le défilement au doigt ou à la molette est bloqué (zoom, tablette, verrou resté par erreur).
const MARGIN = 80;

const root = (): HTMLElement => (document.scrollingElement as HTMLElement) || document.documentElement;

export const ScrollButtons: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { theme } = useApp();
  const L = theme === 'light';
  const [pos, setPos] = useState({ canUp: false, canDown: false });

  useEffect(() => {
    if (hidden) return;
    const update = () => {
      const el = root();
      const max = el.scrollHeight - window.innerHeight;
      // Page figée (position fixe) : les mesures ne sont plus fiables, on garde les deux boutons pour pouvoir la libérer
      const frozen = document.body.style.position === 'fixed';
      setPos(p => {
        const next = frozen
          ? { canUp: true, canDown: true }
          : { canUp: max > MARGIN && el.scrollTop > MARGIN, canDown: max > MARGIN && el.scrollTop < max - MARGIN };
        return p.canUp === next.canUp && p.canDown === next.canDown ? p : next;
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Le contenu change de hauteur (listes, images) sans événement de défilement
    const timer = window.setInterval(update, 800);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.clearInterval(timer); };
  }, [hidden]);

  if (hidden || (!pos.canUp && !pos.canDown)) return null;

  const go = (toBottom: boolean) => {
    releaseOrphanBodyLock(); // si la page était restée bloquée par erreur, on la libère d'abord
    const el = root();
    const top = toBottom ? el.scrollHeight : 0;
    try { window.scrollTo({ top, behavior: 'smooth' }); } catch { window.scrollTo(0, top); }
  };

  const base = `w-11 h-11 rounded-full shadow-lg border flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${L ? 'bg-white text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-100 border-slate-600'}`;
  return (
    <div
      className="fixed right-3 z-30 flex flex-col gap-2"
      style={{ bottom: 'calc(var(--bnh, 0px) + env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
    >
      {pos.canUp && (
        <button type="button" onClick={() => go(false)} className={base} aria-label="Remonter en haut" title="Haut">
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
      {pos.canDown && (
        <button type="button" onClick={() => go(true)} className={base} aria-label="Descendre en bas" title="Bas">
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
