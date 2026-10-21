// Filet de sécurité du défilement (grand écran, tablette).
// Symptôme observé chez BTK : le défilement fait par un bouton marche, mais celui de la molette, du pavé tactile, du clavier ou du doigt non.
// Cause exacte encore inconnue (non reproduite hors de chez lui). Ce module ne cherche pas la cause : il surveille, et seulement si la page
// n'a PAS bougé après un geste de l'utilisateur alors qu'elle pouvait défiler, il fait lui-même le défilement (celui qui marche).
// Il ne fait rien quand le défilement normal marche (compteur à 0), ni sous une fenêtre ouverte, ni dans une liste qui défile seule.
//
// Fluidité : une fois le blocage constaté, les gestes suivants sont suivis tout de suite (plus d'attente), la molette et le clavier glissent
// en douceur (une image après l'autre, comme le défilement normal), le doigt suit 1 pour 1.
import { getLockInfo } from './useLockBodyScroll';

const WAIT_MS = 160; // 1er geste seulement : le défilement normal commence bien avant ; au-delà, il est considéré comme absent
const QUIET_MS = 300; // silence qui termine un geste
const RECHECK_MS = 120; // les vérifications « fenêtre, liste, menu fixe » sont refaites au plus toutes les 120 ms (coût réduit)
const BROKEN_TTL_MS = 120000; // après une preuve de blocage, on agit tout de suite pendant 2 minutes (ou jusqu'à preuve du contraire)
const EASE = 0.2; // part de la distance restante parcourue à chaque image (glissement)
const MIN_STEP = 1.5; // pixels minimum par image, pour toujours arriver

const info = { count: 0, last: '' };
export const getRescueInfo = (): { count: number; last: string } => ({ ...info });

const root = (): HTMLElement => (document.scrollingElement as HTMLElement) || document.documentElement;
const pageMax = () => Math.max(0, root().scrollHeight - root().clientHeight);

/** Vrai si le geste doit être laissé au navigateur : menu fixe, fenêtre, liste qui défile seule (ou qui a demandé de ne pas passer au parent). */
function belongsToSomethingElse(target: EventTarget | null, dy: number): boolean {
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

// ---------- défilement fait par le filet ----------
let rescued = 0; // distance totale que CE module a fait défiler (pour ne pas la confondre avec le défilement normal)
let brokenAt = 0; // instant de la dernière preuve que le défilement normal est absent (0 = aucune)
let lastNativeScroll = -1e9; // dernier événement « scroll » de la page qui ne vient PAS de nous : preuve que le défilement normal marche
let ownUntil = 0; // jusqu'à cet instant, les événements « scroll » sont les nôtres (on les ignore)
const anim = { raf: 0, pos: 0, target: 0 };

/** Déplace la page. On ne relit PAS la position après coup (chaque lecture force un calcul de page, cher sur une machine lente) :
 *  `rescued` compte la distance demandée ; l'écart avec la position réellement arrondie par le navigateur reste sous 1 pixel (positions absolues). */
function moveTo(y: number, from: number) {
  ownUntil = performance.now() + 250; // l'événement « scroll » qui va suivre est le nôtre (marge large : machine lente)
  window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });
  rescued += y - from;
}

function tick() {
  anim.raf = 0;
  const cur = root().scrollTop; // seule lecture de la position à chaque image
  if (Math.abs(cur - anim.pos) > 2) { anim.pos = anim.target = cur; return; } // autre chose a déplacé la page (barre de défilement, défilement normal) : on s'arrête
  const diff = anim.target - anim.pos;
  if (Math.abs(diff) < 0.5) { // arrivé : dernier pas pour se poser exactement sur la cible (pas d'écart d'arrondi)
    const end = Math.round(anim.target);
    if (end !== Math.round(cur)) { moveTo(end, anim.pos); }
    anim.pos = anim.target = end;
    return;
  }
  let step = diff * EASE;
  if (Math.abs(step) < MIN_STEP) step = Math.sign(diff) * Math.min(MIN_STEP, Math.abs(diff));
  const from = anim.pos;
  anim.pos += step;
  moveTo(anim.pos, from);
  anim.raf = window.requestAnimationFrame(tick);
}

/** Molette et clavier : glissement doux vers une cible qui avance à chaque geste. Doigt : suivi immédiat 1 pour 1. */
function applyScroll(kind: Kind, dy: number) {
  info.count++; info.last = `${kind} ${Math.round(dy)}`;
  const s = root();
  if (kind === 'doigt') { const cur = s.scrollTop; moveTo(Math.min(pageMax(), Math.max(0, cur + dy)), cur); return; }
  if (!anim.raf) { anim.pos = s.scrollTop; anim.target = s.scrollTop; }
  anim.target = Math.min(pageMax(), Math.max(0, anim.target + dy));
  if (!anim.raf) anim.raf = window.requestAnimationFrame(tick);
}

function stopAnim() { if (anim.raf) { window.cancelAnimationFrame(anim.raf); anim.raf = 0; } anim.target = anim.pos = root().scrollTop; }

// ---------- gestes ----------
type Kind = 'molette' | 'clavier' | 'doigt';
interface Gesture { active: boolean; t0: number; y0: number; r0: number; pending: number; rescuing: boolean; native: boolean; end: number; check: number; chkAt: number; skip: boolean; max: number }
const newGesture = (): Gesture => ({ active: false, t0: 0, y0: 0, r0: 0, pending: 0, rescuing: false, native: false, end: 0, check: 0, chkAt: -1e9, skip: false, max: 0 });
const gestures: Record<Kind, Gesture> = { molette: newGesture(), clavier: newGesture(), doigt: newGesture() };

/** Le défilement normal a-t-il bougé la page, en plus de ce que nous avons fait nous-mêmes ? */
const nativeMoved = (g: Gesture) =>
  Math.abs((root().scrollTop - g.y0) - (rescued - g.r0)) >= 2 // la page a bougé en plus de ce que nous avons fait (2 px : absorbe l'arrondi)
  || lastNativeScroll >= g.t0 - 150; // ou le navigateur a envoyé un événement « scroll » (le défilement normal peut avoir déjà bougé la page AVANT que nous lisions sa position)

/**
 * Un « geste » = une série d'événements rapprochés (tour de molette, doigt posé, touche maintenue).
 * Au début du geste on note la position de la page. Si, après WAIT_MS, la page n'a PAS bougé toute seule, le défilement normal est absent :
 * on fait défiler ce qui s'est accumulé, puis chaque événement suivant tout de suite. Si la page a bougé, on ne fait rien du tout.
 * Après une première preuve, les gestes suivants sont suivis sans attendre (BROKEN_TTL_MS).
 */
function feed(kind: Kind, dy: number, target: EventTarget | null) {
  if (dy === 0 || getLockInfo().count > 0) return; // une fenêtre est ouverte : la page derrière doit rester figée
  const g = gestures[kind];
  const now = performance.now();
  const s = root();
  if (now - g.chkAt > RECHECK_MS) { g.max = pageMax(); g.skip = g.max <= 2 || belongsToSomethingElse(target, dy); g.chkAt = now; }
  if (g.skip) return;
  if (dy > 0 ? s.scrollTop >= g.max - 1 : s.scrollTop <= 1) return; // déjà en haut ou en bas
  window.clearTimeout(g.end);
  g.end = window.setTimeout(() => { g.active = false; }, QUIET_MS); // geste fini après un court silence

  if (!g.active) {
    const nativeJustMoved = now - lastNativeScroll < 150; // le défilement normal vient de bouger la page : il marche
    if (nativeJustMoved) brokenAt = 0;
    Object.assign(g, { active: true, t0: now, y0: s.scrollTop, r0: rescued, pending: 0, native: nativeJustMoved, rescuing: !nativeJustMoved && brokenAt > 0 && now - brokenAt < BROKEN_TTL_MS });
    window.clearTimeout(g.check);
    if (g.native) return;
    if (g.rescuing) { applyScroll(kind, dy); return; } // blocage déjà constaté : on suit tout de suite, sans attendre
    g.pending = dy;
    g.check = window.setTimeout(() => {
      if (g.native || g.rescuing) return;
      if (nativeMoved(g)) { g.native = true; brokenAt = 0; return; } // le défilement normal marche : on ne touche à rien
      if (getLockInfo().count > 0) { g.pending = 0; return; }
      g.rescuing = true; brokenAt = performance.now(); // preuve : le défilement normal est absent
      applyScroll(kind, g.pending);
      g.pending = 0;
    }, WAIT_MS);
    return;
  }
  if (g.native) return;
  if (g.rescuing) {
    // Tout déplacement en plus de ce que nous avons fait nous-mêmes est le défilement normal, arrivé en retard : on s'arrête (pas de double vitesse)
    if (nativeMoved(g)) { g.native = true; g.rescuing = false; brokenAt = 0; stopAnim(); return; }
    applyScroll(kind, dy);
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

  // Défilement normal de la page : tout événement « scroll » hors de notre fenêtre « ownUntil » vient du navigateur (ou de l'application elle-même)
  document.addEventListener('scroll', () => { const t = performance.now(); if (t > ownUntil) lastNativeScroll = t; }, { passive: true });

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
