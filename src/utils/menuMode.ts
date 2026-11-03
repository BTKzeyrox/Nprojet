// Menu fusionné (module 22, M22.6) : réglage de CET appareil (« Menu simplifié » ou « Ancien menu ») + dernier onglet retenu par entrée.
// Par défaut : menu simplifié. L'ancien menu reste disponible (Réglages > Pages du menu) jusqu'à l'essai de BTK.
import { useEffect, useState } from 'react';

export type MenuMode = 'merged' | 'classic';
const MODE_KEY = 'df_menu_mode', LAST_KEY = 'df_menu_last', EVT = 'df-menu-mode';

export const getMenuMode = (): MenuMode => { try { return localStorage.getItem(MODE_KEY) === 'classic' ? 'classic' : 'merged'; } catch { return 'merged'; } };
export const setMenuMode = (m: MenuMode): void => { try { localStorage.setItem(MODE_KEY, m); } catch { /* stockage indisponible */ } try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ } };
export const useMenuMode = (): MenuMode => {
  const [m, setM] = useState<MenuMode>(getMenuMode);
  useEffect(() => { const on = () => setM(getMenuMode()); window.addEventListener(EVT, on); return () => window.removeEventListener(EVT, on); }, []);
  return m;
};
/** Le menu simplifié ne concerne que le responsable, le Comptable et le Chef d'équipe (l'opérateur garde sa vue simple). */
export const mergedFor = (role: unknown, mode: MenuMode): boolean => mode === 'merged' && (role === 'admin' || role === 'accountant' || role === 'team_lead');

export const getLastTabs = (): Record<string, string> => { try { const o = JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
export const rememberTab = (group: string, tab: string): void => {
  if (!/^[a-z-]{1,30}$/.test(group) || !/^[a-z-]{1,30}$/.test(tab)) return;
  try { const o = getLastTabs(); if (o[group] === tab) return; o[group] = tab; localStorage.setItem(LAST_KEY, JSON.stringify(o)); } catch { /* ignore */ }
};
