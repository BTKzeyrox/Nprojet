// Retour tactile (très courte vibration) aux gestes clés : tirer pour actualiser, envoyer, voter, appui long, valider (BTK, 2026-11-12). Touche le téléphone, pas le serveur.
// Utilisé par : notifSound.ts (envoi, « J'adore », publication), PullToRefresh.tsx, PollBlock.tsx, ChatView.tsx (appui long), TeamValidations.tsx, ThemeLangControls.tsx (interrupteur).
// Android : navigator.vibrate. iPhone (iOS 17.4 et plus) : Safari n'a pas cette fonction ; l'astuce est un interrupteur HTML caché (`<input type=checkbox switch>`) que l'on « touche » : non officiel, peut cesser de marcher, et sans effet sur un iPhone plus ancien.
// Réglage de la personne : cet appareil, clé df_haptic ('off' = coupé, par défaut allumé) ; respecte aussi « réduire les animations » du téléphone. Ne lève jamais d'erreur.
export type Tap = 'light' | 'success' | 'warn' | 'select';
export const HAPTIC_KEY = 'df_haptic';
export const PATTERNS: Record<Tap, number[]> = { light: [10], success: [12, 45, 12], warn: [30], select: [28] };

export function hapticOn(): boolean {
  try { if (localStorage.getItem(HAPTIC_KEY) === 'off') return false; } catch { /* stockage bloqué : allumé */ }
  try { if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch { /* ignore */ }
  return true;
}
export function setHaptic(on: boolean): void { try { if (on) localStorage.removeItem(HAPTIC_KEY); else localStorage.setItem(HAPTIC_KEY, 'off'); } catch { /* ignore */ } }

let iosLabel: HTMLLabelElement | null = null;
function iosTick(): void {
  if (typeof document === 'undefined') return;
  if (!iosLabel) {
    const l = document.createElement('label'), i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', ''); l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    l.appendChild(i); document.body.appendChild(l); iosLabel = l;
  }
  iosLabel.click();
}

/** Une vibration courte. À appeler dans un geste de la personne (clic, toucher). */
export function tap(kind: Tap = 'light'): void {
  try {
    if (!hapticOn() || typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(PATTERNS[kind]); return; }
    const n = kind === 'success' ? 2 : 1;
    iosTick(); if (n === 2) setTimeout(iosTick, 70);
  } catch { /* jamais d'erreur à l'écran */ }
}
