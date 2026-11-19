// Magasin de données : Mode hors ligne (code PIN, actions non envoyées).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import type { OfflineStatus, PinResult, Unsent } from '../offlineController';
import { TOKEN_KEY, COLS, Col } from '../storeShared';

export const offlineMethods = defineMethods({

  /** État du mode hors ligne pour l'écran (module 13) : actions en attente, éléments « À revoir », copie locale. */
  getOfflineStatus(): OfflineStatus { return this.offline.status(); },
  /** Ce qui est modifié sur cet appareil et pas encore reçu par le serveur (compté au plus toutes les 0,75 s). En démo : seulement pendant une coupure simulée. */
  getUnsent(force = false): Unsent {
    if (this.demo && !this.demoBase) return { count: 0, items: [] };
    return this.offline.unsent(force);
  },
  isUnsent(col: string, id: string): boolean { return this.getUnsent().items.some(i => i.col === col && i.id === id); },
  /** Annuler une modification pas encore envoyée : l'élément revient à la dernière version connue du serveur (créé hors ligne : il disparaît). */
  offlineCancelUnsent(col: string, id: string): boolean {
    if (!(COLS as readonly string[]).includes(col)) return false;
    const c = col as Col;
    const base = this.syncedForDiff()[c].get(id);
    const list = [...this.arr(c)];
    const at = list.findIndex(x => x && x.id === id);
    if (base === undefined) { if (at < 0) return false; list.splice(at, 1); }
    else { let rec: any; try { rec = JSON.parse(base); } catch { return false; } if (at >= 0) list[at] = rec; else list.push(rec); }
    this.setArr(c, list);
    this.notify();
    return true;
  },
  offlineUnlock(pin: string): Promise<PinResult> { return this.offline.unlockWithPin(pin).then(r => { if (r.ok && this.token && !this.pollTimer) this.startPolling(); return r; }); },
  offlineSetPin(pin: string): Promise<PinResult> { return this.offline.setPin(pin); },
  offlineRemovePin(): Promise<PinResult> { return this.offline.removePin(); },
  /** « Code oublié » : efface la copie de cet appareil (les données du serveur ne sont pas touchées). À n'appeler qu'après confirmation. */
  async offlineEraseLocal(): Promise<void> {
    await this.offline.eraseLocal();
    if (!this.currentUser) { this.token = null; try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } this.emit(); } // appli restée fermée sur le code : retour à la connexion
  },
  /** Écran de code (appli ouverte sans réseau) : essaie de joindre le serveur ; si la connexion est revenue, la personne est reconnectée avec son jeton. */
  async retryOnline(): Promise<boolean> {
    if (!this.token) return false;
    const ok = await this.pull(true);
    if (ok) { this.startPolling(); this.emit(); }
    return ok;
  },
  offlineRequeue(id: string): boolean { return this.offline.requeue(id); },
  offlineDiscard(id: string): boolean { return this.offline.discard(id); },
  offlineCopyText(id: string, lang: string): string | null { return this.offline.copyText(id, lang); },
});

export type OfflineMethods = typeof offlineMethods;
