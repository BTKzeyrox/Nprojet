// « Mes tableaux » : ancien rangement sur l'appareil (avant le serveur). Sert seulement à REPRENDRE une fois les tableaux déjà saisis, puis la copie est retirée. Jamais d'accès sans try/catch.
import { cleanSheet, purgeSheets, type Sheet } from './sheets';

const KEY = (uid: string) => `df_sheets_${uid}`;
export function loadSheets(uid: string, now = new Date().toISOString()): Sheet[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(uid)) || '[]');
    return purgeSheets((Array.isArray(v) ? v : []).map(x => cleanSheet(x, now)).filter((x): x is Sheet => !!x), now);
  } catch { return []; }
}

export const hasLocal = (uid: string): boolean => { try { return localStorage.getItem(KEY(uid)) !== null; } catch { return false; } };
/** Après reprise par le serveur : on retire la copie de l'appareil. */
export const clearLocal = (uid: string): void => { try { localStorage.removeItem(KEY(uid)); } catch { /* ignore */ } };
