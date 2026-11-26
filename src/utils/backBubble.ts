// Bulle de « Retour » (comme le geste des Redmi / d'Android) : la page ne bouge pas ; une bulle à flèche sort du bord gauche, suit le doigt de haut en bas,
// grossit quand on tire et change de couleur quand on a assez tiré. Aucun état React (on ne redessine pas l'application à chaque mouvement du doigt).
// Utilisé par : App.tsx. Styles : index.css (.df-back-bubble). Contrôlé par : npm run check:page-swipe.
import { SWIPE_MIN_PX } from './pageSwipe';

export const BUBBLE_SIZE = 44;
const OUT_MAX = 56; // la bulle sort au plus de 56 px
const OUT_PEEK = 18; // sans retour possible : elle montre juste le bout

export interface BubbleGeometry { x: number; y: number; scale: number; armed: boolean; progress: number }
/** Où se place la bulle : sortie du bord (x, négatif = cachée à gauche), hauteur (y, gardée dans l'écran), taille, validée ou non. Fonction pure. */
export function bubbleGeometry(dx: number, canGo: boolean, touchY: number, viewportH: number): BubbleGeometry {
  const d = Number.isFinite(dx) && dx > 0 ? dx : 0;
  const progress = Math.min(1, d / SWIPE_MIN_PX);
  const out = canGo ? Math.min(d * 0.6, OUT_MAX) : Math.min(d * 0.25, OUT_PEEK);
  const margin = BUBBLE_SIZE / 2 + 56;
  const y = Math.max(margin, Math.min(Number.isFinite(touchY) ? touchY : margin, Math.max(margin, viewportH - margin)));
  return { x: out - BUBBLE_SIZE, y: y - BUBBLE_SIZE / 2, scale: (canGo ? 0.6 : 0.5) + (canGo ? 0.4 : 0.15) * progress, armed: canGo && d >= SWIPE_MIN_PX, progress };
}

let el: HTMLElement | null = null;
let wasArmed = false;
let hideTimer: number | undefined;
function ensure(): HTMLElement {
  if (el && el.isConnected) return el;
  el = document.createElement('div');
  el.className = 'df-back-bubble';
  el.setAttribute('data-back-bubble', '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  document.body.appendChild(el);
  return el;
}
const place = (b: HTMLElement, g: BubbleGeometry) => { b.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) scale(${g.scale})`; };

/** Pendant le glissement : la bulle suit le doigt. */
export function bubbleMove(dx: number, canGo: boolean, touchY: number): void {
  if (typeof document === 'undefined') return;
  if (!(dx > 0)) { bubbleHide(); return; }
  window.clearTimeout(hideTimer);
  const b = ensure(); const g = bubbleGeometry(dx, canGo, touchY, window.innerHeight);
  b.removeAttribute('data-anim'); b.setAttribute('data-shown', ''); place(b, g);
  if (g.armed) b.setAttribute('data-armed', ''); else b.removeAttribute('data-armed');
  if (g.armed && !wasArmed) { try { navigator.vibrate?.(8); } catch { /* pas de vibration */ } } // un tout petit tic quand c'est validé
  wasArmed = g.armed;
}
/** Relâché assez loin : la bulle se contracte et disparaît. */
export function bubbleConfirm(): void {
  if (!el) return; const b = el; wasArmed = false;
  b.setAttribute('data-anim', ''); b.style.opacity = '0'; b.style.transform = b.style.transform.replace(/scale\([^)]*\)/, 'scale(0.2)');
  hideTimer = window.setTimeout(() => bubbleHide(), 200);
}
/** Relâché trop tôt, ou rien avant : la bulle rentre dans le bord. */
export function bubbleCancel(): void {
  if (!el) return; const b = el; wasArmed = false;
  b.setAttribute('data-anim', ''); b.style.opacity = '0'; b.style.transform = `translate3d(${-BUBBLE_SIZE}px, ${b.style.transform.match(/,\s*([-\d.]+)px,/)?.[1] ?? 0}px, 0) scale(0.5)`;
  hideTimer = window.setTimeout(() => bubbleHide(), 200);
}
export function bubbleHide(): void {
  wasArmed = false; window.clearTimeout(hideTimer);
  if (!el) return; el.removeAttribute('data-anim'); el.removeAttribute('data-shown'); el.removeAttribute('data-armed'); el.style.opacity = ''; el.style.transform = '';
}
