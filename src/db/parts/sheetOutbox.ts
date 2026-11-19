// Magasin de données : Feuille du jour sans réseau (boîte d'envoi).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import type { Role as OfflineRole } from '../../utils/offline';
import { SHEET_ROUTE, applyAnswer, nextSheet, expireSheets, parseStored, sheetLabel, sheetReviewReason, sheetCounts, requeueSheet, discardSheet, type WorkSheet } from '../../utils/sheetOutbox';
import { planWorkEntries } from '../../utils/workEntry';

export const sheetOutboxMethods = defineMethods({
  sheetLoad(): boolean {
    const uid = this.currentUser?.id || '';
    if (!uid) return false;
    if (this.sheetQFor !== uid) { let raw: string | null = null; try { raw = localStorage.getItem(this.sheetKey(uid)); } catch { /* sans stockage : file vide */ } this.sheetQ = parseStored(raw); this.sheetQFor = uid; }
    return true;
  },
  sheetSave(): boolean {
    const uid = this.sheetQFor;
    if (!uid) return false;
    try { if (this.sheetQ.length) localStorage.setItem(this.sheetKey(uid), JSON.stringify(this.sheetQ)); else localStorage.removeItem(this.sheetKey(uid)); return true; } catch { return false; }
  },
  /** Ce qui attend sur cet appareil : feuilles en attente d'envoi et feuilles refusées à revoir (avec la raison écrite). */
  getSheetOutbox(lang = 'fr'): { pending: number; review: number; lines: number; items: { id: string; state: 'pending' | 'review'; date: string; type: string; lines: number; reason: string; created_at: string }[] } {
    if (!this.sheetLoad()) return { pending: 0, review: 0, lines: 0, items: [] };
    const c = sheetCounts(this.sheetQ);
    return { ...c, items: this.sheetQ.map(o => { const l = sheetLabel(o); return { id: o.id, state: o.state, date: l.date, type: l.type, lines: l.lines, reason: o.state === 'review' ? sheetReviewReason(o, lang) : '', created_at: o.created_at }; }) };
  },
  /** Feuilles gardées sur l'appareil (pas encore parties) : pour montrer leurs lignes « pas encore envoyées » dans le calendrier. */
  getQueuedSheets(): { id: string; state: string; payload?: any }[] { return this.sheetLoad() ? this.sheetQ.map(o => ({ id: o.id, state: o.state, payload: o.payload })) : []; },
  /** Un seul appel : vrai serveur (avec le numéro d'action, pour que le serveur ne fasse jamais deux fois la même feuille) ou faux serveur de la démo. */
  async sheetCall(sheet: WorkSheet, id: string, nowIso: string): Promise<{ status: number; data: any }> {
    const me = this.currentUser;
    if (this.demo) {
      if (!me || this.demoCut) return { status: 0, data: { error: 'Réseau indisponible.' } };
      const now = new Date();
      const today = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
      const plan = planWorkEntries(me, this.users, this.posts, sheet, this.getSettings(), now.toISOString(), today);
      if (!plan.ok) return { status: 400, data: { error: ({ role: 'Réservé au responsable et au chef d\'équipe.', bad: 'Feuille illisible.', date: 'Date impossible : aujourd\'hui ou les 31 derniers jours.', empty: 'La feuille est vide.', too_many: 'Trop de lignes (100 au plus).' } as Record<string, string>)[plan.error] || 'Feuille refusée.' } };
      for (const post of plan.saved) {
        const i = this.posts.findIndex(p => p.id === post.id);
        if (i >= 0) this.posts[i] = post; else this.posts.push(post);
      }
      for (const u of plan.users) { const t = this.users.find(x => x.id === u.id); if (t) t.total_earnings_ar = u.total_earnings_ar; }
      this.notify();
      return { status: 200, data: { saved: plan.saved.length, failed: plan.failed, validated: plan.validated } };
    }
    const r = await this.api(SHEET_ROUTE, { method: 'POST', body: JSON.stringify(sheet), headers: { 'x-df-action-id': id, 'x-df-device-time': nowIso } });
    return { status: r.status, data: r.data };
  },
  /** Envoie les feuilles gardées, une à la fois, la plus ancienne d'abord. S'arrête à la première panne (elle reste en attente, nouvel essai plus tard). Sans danger si appelée plusieurs fois. */
  async sendSheets(force = false): Promise<void> {
    if (this.sheetSending || !this.sheetLoad() || (!this.token && !this.demo)) return;
    if (force) this.sheetQ = this.sheetQ.map(o => (o.state === 'pending' ? { ...o, next_try_at: undefined } : o)); // réseau de retour ou clic sur « Envoyer maintenant » : on n'attend pas le délai
    const role = (this.currentUser?.role || 'employee') as OfflineRole;
    this.sheetSending = true;
    try {
      this.sheetQ = expireSheets(this.sheetQ, new Date().toISOString(), role);
      for (let i = 0; i < 50; i++) {
        const nowIso = new Date().toISOString();
        const op = nextSheet(this.sheetQ, nowIso, true);
        if (!op) break;
        const r = await this.sheetCall(op.payload as WorkSheet, op.id, nowIso);
        const a = applyAnswer(this.sheetQ, op.id, { status: r.status, error: r.data?.error, code: r.data?.code }, new Date().toISOString());
        this.sheetQ = a.queue;
        this.sheetSave();
        if (a.outcome === 'sent') { this.since = ''; if (!this.demo) void this.pull(true); }
        if (a.outcome === 'waiting') { this.sheetSchedule(); break; }
      }
    } finally { this.sheetSending = false; this.sheetSave(); this.emit(); }
  },
  sheetSchedule() {
    if (this.sheetTimer) return;
    this.sheetTimer = setTimeout(() => { this.sheetTimer = null; void this.sendSheets(); }, 30000);
  },
  /** La personne décide d'une feuille refusée : la renvoyer telle quelle, ou la retirer de la liste (seulement sur sa demande). */
  sheetRequeue(id: string): void { if (!this.sheetLoad()) return; this.sheetQ = requeueSheet(this.sheetQ, id); this.sheetSave(); this.emit(); void this.sendSheets(true); },
  sheetDiscard(id: string): void { if (!this.sheetLoad()) return; this.sheetQ = discardSheet(this.sheetQ, id); this.sheetSave(); this.emit(); },
});

export type SheetOutboxMethods = typeof sheetOutboxMethods;
