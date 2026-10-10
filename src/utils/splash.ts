// Écran de démarrage « BTK » (défini dans index.html) : retrait en fondu quand le site est prêt.
// Il reste au moins SPLASH_MIN_MS pour que l'animation soit vue, même si le site charge très vite.
export const SPLASH_MIN_MS = 1200;

export function hideSplash(immediate = false) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('df-splash');
  if (!el || el.dataset.leaving) return;
  const start = (window as unknown as { __dfSplashStart?: number }).__dfSplashStart || 0;
  const wait = immediate ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - start));
  el.dataset.leaving = '1';
  setTimeout(() => {
    el.classList.add('dfs-out');
    setTimeout(() => el.remove(), 520);
  }, wait);
}
