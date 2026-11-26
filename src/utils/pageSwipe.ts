// Glissement « Retour » sur téléphone (comme le retour d'iOS) : règles pures, sans écran. Utilisé par App.tsx.
// Glisser vers la DROITE = retour direct à l'étape d'avant, dans l'ordre d'entrée (pages, onglets, discussion ouverte du chat) ;
// sinon rien (la page bouge un peu puis revient). Glisser vers la gauche ne fait rien. Contrôlé par scripts/check-page-swipe.ts.
export const SWIPE_LOCK_PX = 10; // en dessous : on ne sait pas encore si c'est un défilement ou un glissement
export const SWIPE_MIN_PX = 90; // glissement accepté à partir de cette distance (vers la droite)
export const SWIPE_AXIS_RATIO = 1.5; // il faut que le mouvement soit nettement plus horizontal que vertical
export const SWIPE_MS = 220; // durée de l'animation
export const SWIPE_SETTLE_MS = 60; // la page d'arrivée a ce court instant pour se dessiner, invisible, avant d'entrer
export const SWIPE_PREPARE_MAX_MS = 1500; // attente maximale de la préparation de la page d'arrivée

export type SwipeBack = { kind: 'chat' } | { kind: 'page'; view: string; statsTab?: 'finance' } | { kind: 'none' };

/** Une étape de l'historique : une page, ou « stats:finance » (la page Statistiques sur son onglet Finances). */
export const stepOf = (view: string, statsTab?: string): string => (view === 'stats' && statsTab === 'finance' ? 'stats:finance' : view);
export const parseStep = (step: string): { view: string; statsTab?: 'finance' } => (step === 'stats:finance' ? { view: 'stats', statsTab: 'finance' } : { view: step });

/** Où mène le « Retour » : dans l'ordre d'entrée, directement à l'étape juste avant. Une discussion ouverte (chat, téléphone) se referme d'abord vers la liste ; sans étape avant : nulle part. */
export function backTarget(history: string[], chatOpen = false): SwipeBack {
  if (chatOpen) return { kind: 'chat' };
  const last = history[history.length - 1];
  return last ? { kind: 'page', ...parseStep(last) } : { kind: 'none' };
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
export const SWIPE_BLOCK_SELECTOR = 'input,textarea,select,[contenteditable="true"],[data-lightbox],[data-no-page-swipe],[data-composer-bar],.fixed.inset-0'; // .fixed.inset-0 = fenêtres et menus ouverts par-dessus la page
export function swipeBlocked(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest(SWIPE_BLOCK_SELECTOR)) return true;
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}
