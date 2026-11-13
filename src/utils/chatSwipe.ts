// Balayage de la barre de saisie du chat (M28.4) : un geste horizontal qui ouvre le réglage « Messages éphémères ». Règles pures.
// Jamais depuis le bord de l'écran (geste « retour » de l'iPhone) ; jamais quand le geste est surtout vertical (défilement) ; assez long pour ne pas partir d'un simple appui.
export const SWIPE_MIN_PX = 60;
export const SWIPE_EDGE_PX = 24;

export function isComposerSwipe(start: { x: number; y: number }, end: { x: number; y: number }, screenW: number, editing = false): boolean {
  if (editing) return false; // en train d'écrire : le doigt sert à placer le curseur, pas à balayer
  if (![start?.x, start?.y, end?.x, end?.y, screenW].every(n => typeof n === 'number' && Number.isFinite(n)) || screenW <= 0) return false;
  if (start.x < SWIPE_EDGE_PX || start.x > screenW - SWIPE_EDGE_PX) return false;
  const dx = Math.abs(end.x - start.x), dy = Math.abs(end.y - start.y);
  return dx >= SWIPE_MIN_PX && dx > dy * 2;
}
