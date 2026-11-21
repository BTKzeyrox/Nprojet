// Photos gardées pour le hors ligne (cache « df-images » du service worker, voir public/sw.js). Elles ne sont PAS chiffrées comme les données :
// on les efface à la déconnexion. Appelé par App.tsx (handleLogout). Sans danger si le navigateur n'a pas de cache.
export const PHOTO_CACHE = 'df-images';
export async function clearImageCache(): Promise<void> {
  try { if (typeof caches !== 'undefined') await caches.delete(PHOTO_CACHE); } catch { /* ignore */ }
}
