// Glissement « Retour » sur téléphone (comme le retour d'iOS) : règles pures, sans écran. Utilisé par App.tsx.
// Glisser vers la DROITE = retour : d'abord l'onglet d'avant dans la page ; sur le premier onglet (ou une page sans onglets), la page d'avant ;
// sinon rien (la page bouge un peu puis revient). Glisser vers la gauche ne fait rien. Contrôlé par scripts/check-page-swipe.ts.
export const SWIPE_LOCK_PX = 10; // en dessous : on ne sait pas encore si c'est un défilement ou un glissement
export const SWIPE_MIN_PX = 90; // glissement accepté à partir de cette distance (vers la droite)
export const SWIPE_AXIS_RATIO = 1.5; // il faut que le mouvement soit nettement plus horizontal que vertical
export const SWIPE_MS = 220; // durée de l'animation

export type SwipeBack = { kind: 'tab'; tabId: string } | { kind: 'page'; view: string } | { kind: 'none' };

/** Où mène le « Retour » : l'onglet d'avant dans la même page, sinon la page d'avant, sinon nulle part. */
export function backTarget(tabIds: string[], activeTab: string | undefined, history: string[]): SwipeBack {
  const i = activeTab ? tabIds.indexOf(activeTab) : -1;
  if (i > 0) return { kind: 'tab', tabId: tabIds[i - 1] };
  const last = history[history.length - 1];
  return last ? { kind: 'page', view: last } : { kind: 'none' };
}

/** Le doigt va-t-il vers un défilement ('y'), un glissement ('x') ou on ne sait pas encore (null) ? */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (![dx, dy].every(Number.isFinite)) return 'y';
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO ? 'x' : 'y';
}

/** De combien la page suit le doigt : librement (jusqu'à 55 % de la largeur) s'il y a un retour, avec un effet élastique léger sinon. Jamais vers la gauche. */
export function dragOffset(dx: number, canGo: boolean, width: number): number {
  if (!Number.isFinite(dx) || dx <= 0) return 0;
  return canGo ? Math.min(dx, width * 0.55) : Math.min(dx * 0.35, 36);
}

/** Le glissement est-il accepté au relâchement ? */
export const isBackSwipe = (dx: number, canGo: boolean): boolean => canGo && Number.isFinite(dx) && dx >= SWIPE_MIN_PX;

/** Endroits où un glissement ne doit jamais partir : champs de texte, image ouverte, zone marquée, zone qui défile de côté. Les boutons et les cartes sont permis. */
export const SWIPE_BLOCK_SELECTOR = 'input,textarea,select,[contenteditable="true"],[data-lightbox],[data-no-page-swipe]';
export function swipeBlocked(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest(SWIPE_BLOCK_SELECTOR)) return true;
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}
