// Position de défilement du fil Actualités : gardée quand on va sur une autre page (recherche, menu…) et rétablie au retour,
// au lieu de revenir tout en haut. Remise à zéro quand une autre personne se connecte ou quand on touche « Actualités » déjà ouvert.
// Utilisé par : views/FeedView.tsx (mémorise / rétablit), components/TopBar.tsx (retour en haut).
let saved: { uid: string; top: number } | null = null;

export const FEED_TOP_EVENT = 'df-feed-top';

export function saveFeedScroll(uid: string, top: number): void {
  saved = { uid, top: Math.max(0, Math.round(top)) };
}

/** Position à rétablir pour cette personne (0 si aucune ou si ce n'est pas la même personne). */
export function feedScrollFor(uid: string): number {
  return saved && saved.uid === uid ? saved.top : 0;
}

export function resetFeedScroll(): void {
  saved = null;
}

/** Touche « Actualités » alors qu'on y est déjà : remonter tout en haut. */
export function requestFeedTop(): void {
  resetFeedScroll();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FEED_TOP_EVENT));
}
