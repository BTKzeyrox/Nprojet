import { useEffect } from 'react';

let activeLocksCount = 0;
let savedScrollY = 0;
let mode: 'fixed' | 'none' | null = null;
let saved = { position: '', top: '', left: '', right: '', width: '', overflow: '', overscroll: '', htmlOverflow: '' };

const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

function lock() {
  const b = document.body;
  const h = document.documentElement;
  savedScrollY = window.scrollY || h.scrollTop || 0;
  saved = {
    // Une valeur « fixed » déjà là serait un blocage resté par erreur : on ne la remet jamais
    position: b.style.position === 'fixed' ? '' : b.style.position,
    top: b.style.position === 'fixed' ? '' : b.style.top,
    left: b.style.left, right: b.style.right, width: b.style.width,
    // Le site ne règle jamais l'overflow de la page ailleurs : un « hidden » déjà là est un blocage resté par erreur
    overflow: '', overscroll: '', htmlOverflow: '',
  };
  if (isWide()) {
    // Ordinateur et tablette large : on ne touche à RIEN sur la page. Les fenêtres couvrent l'écran et gardent leur
    // propre défilement ; ainsi un verrou resté par erreur ne peut jamais figer la page (souris, pavé tactile, clavier, doigt).
    mode = 'none';
    releaseOrphanInline();
  } else {
    // Téléphone : méthode compatible iPhone (page figée en position fixe)
    mode = 'fixed';
    b.style.position = 'fixed';
    b.style.top = `-${savedScrollY}px`;
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    b.style.overflow = 'hidden';
    b.style.overscrollBehavior = 'contain';
  }
}

function unlock() {
  const b = document.body;
  const h = document.documentElement;
  b.style.position = saved.position;
  b.style.top = saved.top;
  b.style.left = saved.left;
  b.style.right = saved.right;
  b.style.width = saved.width;
  b.style.overflow = saved.overflow;
  b.style.overscrollBehavior = saved.overscroll;
  h.style.overflow = saved.htmlOverflow;
  const wasFixed = mode === 'fixed';
  mode = null;
  if (wasFixed) window.scrollTo(0, savedScrollY);
}

function releaseOrphanInline() {
  const b = document.body;
  const h = document.documentElement;
  if (b.style.position === 'fixed') window.scrollTo(0, -(parseInt(b.style.top || '0', 10) || 0));
  b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
  b.style.overflow = ''; b.style.overscrollBehavior = ''; h.style.overflow = '';
}

/** Sécurité : aucune fenêtre ouverte mais la page est restée bloquée → on la débloque. */
export function releaseOrphanBodyLock(): void {
  if (typeof document === 'undefined' || activeLocksCount > 0) return;
  const b = document.body;
  const h = document.documentElement;
  if (b.style.position === 'fixed' || h.style.overflow === 'hidden' || b.style.overflow === 'hidden') {
    const y = b.style.position === 'fixed' ? -(parseInt(b.style.top || '0', 10) || 0) : window.scrollY;
    b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
    b.style.overflow = ''; b.style.overscrollBehavior = ''; h.style.overflow = '';
    mode = null;
    window.scrollTo(0, y);
  }
}

if (typeof window !== 'undefined') {
  // L'écran change de taille (tablette tournée…) : on refait le blocage dans le bon mode, ou on le retire s'il est orphelin
  window.addEventListener('resize', () => {
    if (activeLocksCount === 0) { releaseOrphanBodyLock(); return; }
    const want = isWide() ? 'none' : 'fixed';
    if (mode && mode !== want) { unlock(); lock(); }
  });
}

/**
 * Bloque la page derrière une fenêtre.
 * Compteur de références : une fenêtre dans une autre ne débloque pas trop tôt.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    if (activeLocksCount === 0) lock();
    activeLocksCount++;

    return () => {
      activeLocksCount = Math.max(0, activeLocksCount - 1);
      if (activeLocksCount === 0) unlock();
    };
  }, [isLocked]);
}
