import { useSyncExternalStore } from 'react';

// Bouton « Vue opérateur / Retour responsable » du menu : visible ou masqué (réglé sur cet appareil).
const KEY = 'df_mode_switch_hidden';
const EVENT = 'df:modeswitch';

export const isModeSwitchHidden = (): boolean => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
export const setModeSwitchHidden = (hidden: boolean) => {
  try { if (hidden) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
};
/** true si le bouton est masqué ; la page se redessine quand ça change. */
export const useModeSwitchHidden = (): boolean => useSyncExternalStore(subscribe, isModeSwitchHidden, () => false);
