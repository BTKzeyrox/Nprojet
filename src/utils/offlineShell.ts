// Enregistre le service worker pour que l'appli s'ouvre sans réseau (module 13, M13.4). Seulement en production (jamais en développement :
// un cache ferait croire que les changements ne marchent pas). Le même fichier /sw.js sert déjà aux notifications (push.ts) : l'enregistrer deux fois est sans effet.
// Quand la connexion est bonne, on demande au service worker de garder AUSSI les pages chargées à la demande (exports, etc.).
export function installOfflineShell(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  const askPrecache = async () => {
    try {
      if (!navigator.onLine) return;
      // Économiseur de données activé : on ne télécharge pas les 2 Mo « en arrière-plan » (les pages visitées sont gardées au fur et à mesure)
      if ((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData) return;
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'PRECACHE' });
    } catch { /* sans effet : la page marche comme avant */ }
  };
  const start = async () => {
    try { await navigator.serviceWorker.register('/sw.js'); await askPrecache(); } catch { /* navigation privée, navigateur ancien : rien ne change */ }
  };
  if (document.readyState === 'complete') void start(); else window.addEventListener('load', () => void start(), { once: true });
  window.addEventListener('online', () => void askPrecache());
}
