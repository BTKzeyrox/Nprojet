import { useSyncExternalStore } from 'react';

// Statut de disponibilité : choisi par chaque personne, gardé sur CET appareil (pas partagé avec les autres).
export type Presence = 'available' | 'busy' | 'away';
export const PRESENCE_LIST: Presence[] = ['available', 'busy', 'away'];
export const PRESENCE_LABEL: Record<Presence, string> = { available: 'Disponible', busy: 'Occupé', away: 'Absent' };
export const PRESENCE_DOT: Record<Presence, string> = { available: 'bg-emerald-500', busy: 'bg-red-500', away: 'bg-amber-500' };

const EVENT = 'df:presence';
const key = (uid: string) => `df_presence_${uid}`;

export const getPresence = (uid: string): Presence => {
  try {
    const v = localStorage.getItem(key(uid));
    return v === 'busy' || v === 'away' ? v : 'available';
  } catch { return 'available'; }
};
export const setPresence = (uid: string, p: Presence) => {
  try { if (p === 'available') localStorage.removeItem(key(uid)); else localStorage.setItem(key(uid), p); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
};
export const usePresence = (uid: string): Presence => useSyncExternalStore(subscribe, () => getPresence(uid), () => 'available');
