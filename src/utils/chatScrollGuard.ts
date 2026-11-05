// Messagerie : un glissement du doigt au bout d'une liste (tout en haut ou tout en bas) ne doit JAMAIS faire bouger la page,
// sinon les barres du haut et du bas se décalent, se cachent ou réapparaissent (rebond de l'iPhone, barre d'adresse d'Android).
// Règle pure testée par `npm run check:chat-scroll` ; le branchement tactile est dans `guardScroller`.
// Utilisé par : ChatView.tsx (liste des messages et liste des discussions).
// Pour modifier : garder `dy` = ancienne position du doigt moins nouvelle (doigt vers le haut = positif = la liste descend).

export interface ScrollBox { scrollTop: number; scrollHeight: number; clientHeight: number }

/** Vrai si le geste doit être bloqué : rien à faire défiler, ou on pousse au-delà du haut / du bas de la liste. */
export function shouldBlockTouchMove(b: ScrollBox, dy: number): boolean {
  if (dy === 0) return false;
  const max = b.scrollHeight - b.clientHeight;
  if (max <= 1) return true; // liste plus courte que l'écran : rien à défiler, le geste ne doit pas atteindre la page
  if (dy > 0 && b.scrollTop >= max - 1) return true; // doigt vers le haut alors qu'on est déjà tout en bas
  if (dy < 0 && b.scrollTop <= 0) return true; // doigt vers le bas alors qu'on est déjà tout en haut
  return false;
}

/** Branche le garde-fou sur une liste défilante ; renvoie la fonction qui le retire. Gestes de côté laissés libres. */
export function guardScroller(el: HTMLElement): () => void {
  let lastX = 0, lastY = 0, on = false;
  const start = (e: TouchEvent) => { on = e.touches.length === 1; if (on) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; } };
  const move = (e: TouchEvent) => {
    if (!on || e.touches.length !== 1) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    const dx = lastX - x, dy = lastY - y;
    lastX = x; lastY = y;
    if (Math.abs(dx) > Math.abs(dy)) return; // geste horizontal (album, glisser pour répondre) : on ne touche à rien
    if (e.cancelable && shouldBlockTouchMove(el, dy)) e.preventDefault();
  };
  const end = () => { on = false; };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
  return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
}
