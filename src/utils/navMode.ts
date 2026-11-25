// Réglage « Menu du téléphone » : barre du bas (défaut) ou seulement le haut, comme avant. Utilisé par : App.tsx, TopBar.tsx, BottomNav.tsx, ThemeLangControls.tsx.
// Contrôlé par : npm run check:nav-mode. Pour modifier : la valeur est dans localStorage (clé df_nav_mode) ; elle est synchronisée par compte (réglage « nav_mode » de prefsRules.ts).
import { useEffect, useState } from 'react';

export type NavMode = 'bottom' | 'top';
export const NAV_MODE_KEY = 'df_nav_mode';
export const NAV_MODE_EVENT = 'df-nav-mode';

/** Seule la valeur « top » change quelque chose ; tout le reste = barre du bas. */
export const parseNavMode = (v: unknown): NavMode => (v === 'top' ? 'top' : 'bottom');

export function readNavMode(): NavMode {
  try { return parseNavMode(localStorage.getItem(NAV_MODE_KEY)); } catch { return 'bottom'; }
}
export function writeNavMode(m: NavMode): void {
  try { localStorage.setItem(NAV_MODE_KEY, m); } catch { /* stockage refusé */ }
  try { window.dispatchEvent(new Event(NAV_MODE_EVENT)); } catch { /* ignore */ }
}
export function useNavMode(): NavMode {
  const [m, setM] = useState<NavMode>(readNavMode);
  useEffect(() => {
    const on = () => setM(readNavMode());
    window.addEventListener(NAV_MODE_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(NAV_MODE_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return m;
}
