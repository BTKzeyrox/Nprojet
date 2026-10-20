// Filet de sécurité du défilement (grand écran, tablette).
// Symptôme observé chez BTK : le défilement fait par un bouton marche, mais celui de la molette, du pavé tactile, du clavier ou du doigt non.
// Cause exacte encore inconnue (non reproduite dans la démo). Ce module ne cherche pas la cause : il surveille, et seulement si la page
// n'a PAS bougé après un geste de l'utilisateur alors qu'elle pouvait défiler, il fait lui-même le défilement (celui qui marche).
// Il ne fait rien quand le défilement normal marche (compteur à 0), ni sous une fenêtre ouverte, ni dans une liste qui défile seule.
import { getLockInfo } from './useLockBodyScroll';

const WAIT_MS = 160; // le défilement normal commence bien avant : au-delà, il est considéré comme absent (pas moins : une page chargée peut tarder)
const QUIET_MS = 300; // silence qui termine un geste
const info = { count: 0, last: '' };
export const getRescueInfo = (): { count: number; last: string } => ({ ...info });

const root = (): HTMLElement => (document.scrollingElement as HTMLElement) || document.documentElement;
const pageMax = () => Math.max(0, root().scrollHeight - root().clientHeight);
const canMovePage = (dy: number) => { const s = root(); return pageMax() > 2 && (dy > 0 ? s.scrollTop < pageMax() - 1 : s.scrollTop > 1); };

/** Vrai si le geste doit être laissé au navigateur : fenêtre ouverte, menu fixe, ou liste qui défile seule (ou qui a demandé de ne pas passer au parent). */
function belongsToSomethingElse(target: EventTarget | null, dy: number): boolean {
  if (getLockInfo().count > 0) return true; // une fenêtre est ouverte : la page derrière doit rester figée
  let n = target as HTMLElement | null;
  if (n && n.nodeType !== 1) n = (n as Node).parentElement;
  while (n && n !== document.body && n !== document.documentElement) {
    if (n.matches?.('dialog, [role="dialog"], [aria-modal="true"]')) return true;
    const c = getComputedStyle(n);
    if (c.position === 'fixed') return true; // fenêtres, menu de gauche, barre du haut : ils gèrent leur propre défilement
    const scrollable = (c.overflowY === 'auto' || c.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1;
    if (scrollable) {
      const canMove = dy > 0 ? n.scrollTop < n.scrollHeight - n.clientHeight - 1 : n.scrollTop > 0;
      if (canMove) return true; // la liste peut encore défiler : c'est à elle
      if (c.overscrollBehaviorY === 'contain' || c.overscrollBehaviorY === 'none') return true; // fin de liste : on respecte « ne pas passer au parent »
    }
    n = n.parentElement;
  }
  return false;
}

let rescued = 0; // distance totale que CE module a fait défiler (pour ne pas la confondre avec le défilement normal)

function rescue(kind: string, dy: number) {
  const s = root();
  const before = s.scrollTop;
  window.scrollBy({ top: dy, left: 0, behavior: 'auto' });
  const moved = s.scrollTop - before;
  if (moved !== 0) { rescued += moved; info.count++; info.last = `${kind} ${Math.round(dy)}`; }
}

/**
 * Un « geste » = une série d'événements rapprochés (tour de molette, doigt posé, touche maintenue).
 * Au début du geste on note la position de la page. Après WAIT_MS, si la page n'a PAS bougé toute seule, le défilement normal est absent :
 * on fait défiler ce qui s'est accumulé, puis chaque événement suivant du même geste tout de suite. Si la page a bougé, on ne fait rien du tout.
 */
interface Gesture { active: boolean; y0: number; r0: number; pending: number; rescuing: boolean; native: boolean; end: number; check: number }
const newGesture = (): Gesture => ({ active: false, y0: 0, r0: 0, pending: 0, rescuing: false, native: false, end: 0, check: 0 });
const gestures: Record<string, Gesture> = { molette: newGesture(), clavier: newGesture(), doigt: newGesture() };

function feed(kind: 'molette' | 'clavier' | 'doigt', dy: number, target: EventTarget | null) {
  const g = gestures[kind];
  if (dy === 0 || !canMovePage(dy) || belongsToSomethingElse(target, dy)) return;
  window.clearTimeout(g.end);
  g.end = window.setTimeout(() => { g.active = false; }, QUIET_MS); // geste fini après un court silence
  if (!g.active) {
    Object.assign(g, { active: true, y0: root().scrollTop, r0: rescued, pending: dy, rescuing: false, native: false });
    window.clearTimeout(g.check);
    g.check = window.setTimeout(() => {
      if (g.native) return; // (un geste très court peut être fini avant la vérification : on vérifie quand même)
      const nativeMove = (root().scrollTop - g.y0) - (rescued - g.r0);
      if (Math.abs(nativeMove) >= 1) { g.native = true; return; } // le défilement normal marche : on ne touche à rien
      if (getLockInfo().count > 0 || !canMovePage(g.pending)) { g.pending = 0; return; }
      g.rescuing = true;
      rescue(kind, g.pending);
      g.pending = 0;
    }, WAIT_MS);
    return;
  }
  if (g.native) return;
  if (g.rescuing) {
    // Tout déplacement en plus de ce que nous avons fait nous-mêmes est le défilement normal, arrivé en retard : on s'arrête (pas de double vitesse)
    if (Math.abs((root().scrollTop - g.y0) - (rescued - g.r0)) >= 1) { g.native = true; g.rescuing = false; return; }
    rescue(kind, dy); // le défilement normal est absent : on suit le geste tout de suite
  } else g.pending += dy;
}

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || el.nodeType !== 1) return false;
  return !!el.closest?.('input, textarea, select, button, a[href], summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="tab"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="slider"], [role="textbox"]');
};

let installed = false;
export function installScrollRescue(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('wheel', (e: WheelEvent) => {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom, geste déjà géré, défilement de côté
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    feed('molette', dy, e.target);
  }, { passive: true });

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || isTypingTarget(e.target)) return;
    const h = window.innerHeight;
    const dy = e.key === 'PageDown' ? h * 0.85 : e.key === 'PageUp' ? -h * 0.85 : e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40
      : e.key === ' ' ? (e.shiftKey ? -h * 0.85 : h * 0.85) : e.key === 'End' ? pageMax() : e.key === 'Home' ? -pageMax() : 0;
    feed('clavier', dy, e.target);
  });

  // Doigt (tablette) : même principe, avec un seul doigt
  let lastY: number | null = null;
  window.addEventListener('touchstart', (e: TouchEvent) => { lastY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (lastY === null || e.touches.length !== 1) { lastY = null; return; }
    const y = e.touches[0].clientY;
    const dy = lastY - y; // doigt vers le haut = la page descend
    lastY = y;
    feed('doigt', dy, e.target);
  }, { passive: true });
  window.addEventListener('touchend', () => { lastY = null; }, { passive: true });
}
