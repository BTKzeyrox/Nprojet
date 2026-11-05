// Notifications EXTERNES groupées (demande de BTK, 2026-11-01) : quand personne n'a l'appli ouverte, plusieurs notifications ne font PAS plusieurs sons ni plusieurs bandeaux :
// une seule notification « Vous avez N notifications » qui se met à jour. Depuis 2026-11-06 (notifications « parfois muettes ») chaque nouvelle notification SONNE et vibre : une mise à jour muette passait inaperçue (surtout iPhone).
// Si l'appli est ouverte : pas de notification externe, c'est la cloche de l'appli qui joue le son à CHAQUE nouvelle notification.
// Règles pures : `public/sw.js` en a une copie (entre les repères DIGEST) ; `npm run check:push-digest` compare les deux.
export const DIGEST_TAG = 'gp-digest';

export interface DigestPlan { title: string; body: string; silent: boolean; url: string; tag: string; count: number }

/** Texte de la notification externe quand c'est la `count`-ième depuis la dernière ouverture de l'appli. `m` = le message de cette notification (titre et texte courts, sans montant ni message privé). */
export function digestPlan(count: number, m: { title?: string; body?: string }, en: boolean, url: string): DigestPlan {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  const safeUrl = typeof url === 'string' && url.charAt(0) === '/' && url.charAt(1) !== '/' ? url : '/';
  if (n === 1) return { title: String(m.title || 'Gestion Pro'), body: String(m.body || ''), silent: false, url: safeUrl, tag: DIGEST_TAG, count: 1 };
  // Plusieurs : un résumé qui ouvre l'appli (la cloche montre le détail) ; il SONNE aussi (sinon la nouvelle notification passe inaperçue)
  return { title: 'Gestion Pro', body: en ? `You have ${n} notifications` : `Vous avez ${n} notifications`, silent: false, url: '/', tag: DIGEST_TAG, count: n };
}

/** Appli ouverte et visible : on retire les notifications externes en attente (la cloche les montre). Ne plante jamais. */
export function closeDigestNotifications(): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistration().then(reg => reg?.getNotifications({ tag: DIGEST_TAG }).then(list => list.forEach(n => n.close()))).catch(() => { /* pas de service worker : rien à fermer */ });
  } catch { /* ancien navigateur */ }
}
