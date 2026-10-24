// « Mes tableaux » : rangement PROVISOIRE sur l'appareil (avant le serveur, M12.4). Une clé par personne. Jamais d'accès sans try/catch.
import { cleanSheet, purgeSheets, type Sheet } from './sheets';

const KEY = (uid: string) => `df_sheets_${uid}`;
export function loadSheets(uid: string, now = new Date().toISOString()): Sheet[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(uid)) || '[]');
    return purgeSheets((Array.isArray(v) ? v : []).map(x => cleanSheet(x, now)).filter((x): x is Sheet => !!x), now);
  } catch { return []; }
}
/** false si l'appareil refuse (plein, navigation privée) : l'écran le dit. */
export function saveSheets(uid: string, list: Sheet[]): boolean {
  try { localStorage.setItem(KEY(uid), JSON.stringify(list)); return true; } catch { return false; }
}

/** Démo : seulement au tout premier passage (clé absente), pour ne pas rendre un tableau supprimé. */
export const neverSaved = (uid: string): boolean => { try { return localStorage.getItem(KEY(uid)) === null; } catch { return false; } };
