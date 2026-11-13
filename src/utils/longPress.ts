// Appui long (messages et discussions du chat) — règles pures (2026-11-13). Utilisé par ChatView.tsx.
// Bugs corrigés : (1) un doigt qui bouge d'un rien annulait l'appui long (le téléphone envoie des « touchmove » même sans bouger) ; (2) en relevant le doigt, le menu qui venait de s'ouvrir sous le doigt recevait un clic et se refermait aussitôt.
export const LONG_PRESS_MS = 450;
export const MOVE_LIMIT_PX = 10; // au-delà : c'est un défilement, pas un appui long
export const GHOST_CLICK_MS = 400; // clics ignorés juste après l'ouverture du menu

/** Le doigt a-t-il assez bougé pour annuler l'appui long ? (distance à vol d'oiseau) */
export function movedTooFar(x0: number, y0: number, x1: number, y1: number, limit: number = MOVE_LIMIT_PX): boolean {
  if (![x0, y0, x1, y1].every(Number.isFinite)) return true; // coordonnées illisibles : on annule, par prudence
  return Math.hypot(x1 - x0, y1 - y0) > limit;
}
/** Un clic arrivé juste après l'ouverture du menu (relâchement du doigt) doit être ignoré. */
export function isGhostClick(openedAt: number, now: number, ms: number = GHOST_CLICK_MS): boolean {
  return Number.isFinite(openedAt) && Number.isFinite(now) && now >= openedAt && now - openedAt < ms;
}
/** Copie du message pour le menu : sans identifiants (la copie ne doit jamais être trouvée à la place du vrai message). */
export function stripIds(html: string): string {
  return String(html || '').replace(/\sdata-msg-id="[^"]*"/g, '').replace(/\sid="[^"]*"/g, '');
}
