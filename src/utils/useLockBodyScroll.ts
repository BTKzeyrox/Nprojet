import { useEffect } from 'react';

let activeLocksCount = 0;
let savedScrollY = 0;
let saved = { position: '', top: '', left: '', right: '', width: '', overflow: '', overscroll: '' };

/**
 * Bloque la page derrière une fenêtre (méthode compatible iPhone) :
 * la page est figée en position fixe, puis on remet la position au déblocage.
 * Compteur de références : une fenêtre dans une autre ne débloque pas trop tôt.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    const b = document.body;

    if (activeLocksCount === 0) {
      savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      saved = {
        position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right,
        width: b.style.width, overflow: b.style.overflow, overscroll: b.style.overscrollBehavior,
      };
      b.style.position = 'fixed';
      b.style.top = `-${savedScrollY}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
      b.style.overflow = 'hidden';
      b.style.overscrollBehavior = 'contain';
    }
    activeLocksCount++;

    return () => {
      activeLocksCount = Math.max(0, activeLocksCount - 1);
      if (activeLocksCount === 0) {
        b.style.position = saved.position;
        b.style.top = saved.top;
        b.style.left = saved.left;
        b.style.right = saved.right;
        b.style.width = saved.width;
        b.style.overflow = saved.overflow;
        b.style.overscrollBehavior = saved.overscroll;
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isLocked]);
}
