// Réglages synchronisés par compte : branchement navigateur (règles pures dans prefsRules.ts).
import { db } from '../db/store';
import { PREF_NAMES, cleanPrefs, localKeyOf, nameOfLocalKey, planPrefsSync } from './prefsRules';

// ---------- Branchement (navigateur) ----------
let applying = false;
let installed = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const queue: Record<string, string | null> = {};
const uidNow = (): string => db.getCurrentUser()?.id || '';

function flush() {
  timer = null;
  const changes = cleanPrefs({ ...queue });
  for (const k of Object.keys(queue)) delete queue[k];
  if (Object.keys(changes).length) void db.prefsSet(changes);
}
/** Surveille les réglages : chaque changement sur cet appareil part vers le compte (après 0,8 s de calme). */
export function installPrefsSync(): void {
  if (installed || typeof Storage === 'undefined') return;
  installed = true;
  const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, k, v);
    try { if (!applying && this === window.localStorage) { const n = nameOfLocalKey(String(k), uidNow()); if (n && uidNow()) { queue[n] = String(v); if (timer) clearTimeout(timer); timer = setTimeout(flush, 800); } } } catch { /* ignore */ }
  };
  Storage.prototype.removeItem = function (this: Storage, k: string) {
    rem.call(this, k);
    try { if (!applying && this === window.localStorage) { const n = nameOfLocalKey(String(k), uidNow()); if (n && uidNow()) { queue[n] = null; if (timer) clearTimeout(timer); timer = setTimeout(flush, 800); } } } catch { /* ignore */ }
  };
}

/** À l'ouverture d'un compte : reprend les réglages du compte sur cet appareil, et envoie ceux qui n'existent que sur l'appareil. Rend vrai si quelque chose a changé sur l'appareil. */
export async function syncPrefsFromAccount(): Promise<boolean> {
  const uid = uidNow();
  if (!uid) return false;
  const server = await db.prefsGet();
  if (!server) return false; // serveur indisponible : on garde l'appareil tel quel
  const local: Record<string, string | null> = {};
  for (const n of PREF_NAMES) { try { const k = localKeyOf(n, uid); local[n] = k ? localStorage.getItem(k) : null; } catch { local[n] = null; } }
  const plan = planPrefsSync(server, local);
  let changed = false;
  applying = true;
  try { for (const [n, v] of Object.entries(plan.toLocal)) { const k = localKeyOf(n, uid); if (k) { localStorage.setItem(k, v); changed = true; } } } catch { /* stockage refusé */ } finally { applying = false; }
  if (Object.keys(plan.toServer).length) await db.prefsSet(plan.toServer);
  return changed;
}
