// Notifications push côté téléphone/navigateur (M6.4). Aucune dépendance : service worker + API Push du navigateur.
import { db } from '../db/store';

export type PushState = 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on';

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

/** Ce navigateur sait-il recevoir des notifications ? Sur iPhone : seulement si le site est ajouté à l'écran d'accueil. */
export function pushSupport(): 'ok' | 'unsupported' | 'ios_install' {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios_install';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported';
}

const toBytes = (b64u: string): Uint8Array => {
  const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** État actuel sur cet appareil. */
export async function pushState(): Promise<PushState> {
  const sup = pushSupport();
  if (sup !== 'ok') return sup;
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

/** Active les notifications sur cet appareil. Rend un message d'erreur, ou '' si c'est bon. */
export async function enablePush(): Promise<string> {
  try {
    if (pushSupport() !== 'ok') return 'unsupported';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const key = await db.pushKey();
    if (!key.ok) return key.error || 'server';
    const reg = await registration();
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe().catch(() => undefined); // clé différente possible : on repart propre
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key.key) as BufferSource });
    const r = await db.pushSubscribe(sub.toJSON());
    if (!r.ok) { await sub.unsubscribe().catch(() => undefined); return r.error || 'server'; }
    return '';
  } catch (e) { return String((e as Error)?.message || 'error').slice(0, 120); }
}

/** L'adresse d'abonnement de cet appareil (pour ses interrupteurs), ou '' s'il n'est pas abonné. */
export async function pushEndpoint(): Promise<string> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    return (await reg?.pushManager.getSubscription())?.endpoint || '';
  } catch { return ''; }
}

/** Désactive les notifications sur cet appareil. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await db.pushUnsubscribe(sub.endpoint); await sub.unsubscribe(); }
  } catch { /* ignore */ }
}

/** À la déconnexion : cet appareil n'appartient plus à la personne (sinon ses notifications arrivent sur le téléphone d'un autre compte). L'abonnement du navigateur est gardé : le prochain compte qui s'ouvre le reprend. */
export async function unbindPushDevice(): Promise<void> {
  try {
    if (pushSupport() !== 'ok') return;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await db.pushUnsubscribe(sub.endpoint);
  } catch { /* ignore */ }
}

/** À l'ouverture d'un compte : si cet appareil est déjà autorisé, il est rattaché à CE compte (et plus à l'ancien). */
export async function bindPushDevice(): Promise<void> {
  try {
    if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    let sub = await reg?.pushManager.getSubscription();
    // Autorisé mais abonnement perdu (le téléphone l'a retiré) : on le refait sans rien demander, puis on le rattache au compte
    if (!sub && reg) {
      const key = await db.pushKey();
      if (key.ok) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key.key) as BufferSource });
    }
    if (sub) await db.pushSubscribe(sub.toJSON());
  } catch { /* ignore */ }
}
