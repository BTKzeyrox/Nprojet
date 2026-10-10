import { APP_VERSION } from './errorReport';
import { db } from '../db/store';

// Rechargement automatique après une mise à jour du site.
// Le fichier /version.json est publié à chaque construction avec le numéro de version.
// Si le site ouvert a un autre numéro, on recharge — mais seulement quand la personne n'est pas en train d'écrire.

const CHECK_EVERY_MS = 2 * 60 * 1000; // relecture toutes les 2 minutes
const RETRY_BUSY_MS = 4000; // si la personne est occupée, on réessaie toutes les 4 secondes
const GUARD_KEY = 'df_update_reload_for';

let netBusy = 0;
let pending: string | null = null;
let banner: HTMLDivElement | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

// La personne est-elle occupée ? (champ actif, texte pas encore envoyé, fenêtre ouverte, envoi en cours)
function isBusy(): boolean {
  if (netBusy > 0) return true;
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return true;
  if (document.querySelector('.fixed.inset-0')) return true; // fenêtre, menu ou animation ouverte
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=button]):not([type=submit]), textarea'
  );
  for (const f of fields) if (f.value && f.value.trim() !== '') return true; // texte écrit mais pas encore envoyé
  return false;
}

function showBanner(text: string) {
  if (!banner) {
    banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:10000;' +
      'max-width:calc(100% - 24px);padding:10px 14px;background:#0f1722;color:#e2e8f0;border:1px solid #10b981;' +
      'font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);text-align:center;';
    document.body.appendChild(banner);
  }
  banner.textContent = text;
}
function hideBanner() {
  banner?.remove();
  banner = null;
}

function tryReload() {
  if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
  if (!pending) return;
  // Une seule tentative par version : si le numéro reste différent après le rechargement, on n'insiste pas (pas de boucle)
  try {
    if (sessionStorage.getItem(GUARD_KEY) === pending) { hideBanner(); return; }
  } catch { /* stockage bloqué : on continue */ }

  if (document.visibilityState !== 'visible' || isBusy()) {
    if (document.visibilityState === 'visible') showBanner('Mise à jour disponible : elle sera appliquée dès que tu as fini.');
    reloadTimer = setTimeout(tryReload, RETRY_BUSY_MS);
    return;
  }
  showBanner('Mise à jour du site… rechargement.');
  const target = pending;
  setTimeout(() => {
    if (isBusy()) { tryReload(); return; } // la personne s'est remise à écrire entre-temps
    try { sessionStorage.setItem(GUARD_KEY, target); } catch { /* ignore */ }
    window.location.reload();
  }, 1200);
}

async function check() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j && typeof j.v === 'string' && j.v && j.v !== APP_VERSION && j.v !== pending) {
      pending = j.v;
      tryReload();
    }
  } catch {
    /* hors ligne ou fichier absent : on réessaiera */
  }
}

export function startUpdateWatcher(): void {
  // En développement ou en test local, il n'y a pas de numéro de version stable
  if (APP_VERSION === 'dev' || APP_VERSION.startsWith('local-')) return;
  db.onNetwork(n => { netBusy = n; });
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('online', () => { void check(); });
  setTimeout(check, 15000); // première vérification peu après l'ouverture
}
