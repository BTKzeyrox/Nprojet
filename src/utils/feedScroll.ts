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

// --- Recherche du téléphone : le fil ne doit pas bouger quand on ouvre / ferme la recherche (le clavier peut décaler la page) ---
let pinned: { uid: string; top: number } | null = null;

/** À l'ouverture de la recherche : position à garder, même si le clavier décale la page avant qu'on quitte Actualités. */
export function pinFeedScroll(uid: string, top: number): void { pinned = { uid, top: Math.max(0, Math.round(top)) }; }
export function unpinFeedScroll(): void { pinned = null; }
export function pinnedFeedScroll(uid: string): number | null { return pinned && pinned.uid === uid ? pinned.top : null; }

/** Le conteneur qui défile autour du fil (null = la page entière / la fenêtre). */
function feedScroller(): HTMLElement | null {
  let e = (document.querySelector('[data-feed-root]') as HTMLElement | null)?.parentElement || null;
  while (e) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e !== document.documentElement && e !== document.body) return e; e = e.parentElement; }
  return null;
}
export function readFeedPos(): number { const sc = feedScroller(); return sc ? sc.scrollTop : window.scrollY; }
export function writeFeedPos(y: number): void { const sc = feedScroller(); if (sc) sc.scrollTop = y; else window.scrollTo(0, y); }
