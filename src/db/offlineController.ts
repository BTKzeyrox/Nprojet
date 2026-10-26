// Contrôleur du mode hors ligne (module 13, M13.5) : branche la copie locale (offlineVault.ts) et la file d'actions (offlineSync.ts) sur le magasin de données.
// Le magasin reste le SEUL à envoyer au serveur. Ce contrôleur : (1) garde sur l'appareil une copie des données et le miroir des changements en attente ;
// (2) au démarrage, remet ces changements sur les données ; (3) permet d'ouvrir l'appli sans réseau avec la dernière copie ; (4) garde dans « À revoir »
// ce que le serveur refuse ou ce qui est en conflit. Il ne parle jamais au réseau. Jamais actif en mode démo.
// Opérateur : copie automatique, sans code. Admin : seulement avec un code de verrouillage (écran du M13.6) ; tant qu'il n'y en a pas, rien n'est gardé.
import type { User } from '../types';
import { OFFLINE_DEFAULTS, type Bilingual, type OfflineLimits, type OfflineOp, type Queue, type Role, copyText, discard, requeue as requeueOp, reviewList, summary } from '../utils/offline';
import { applyQueue, buildOps, reapply, rejectedToReview, type Arrays, type Changes, type RejectedItem, type Skipped, type SyncedJson } from '../utils/offlineSync';
import { createVault, getCopy, getQueue, idbKV, putCopy, putQueue, unlockVault, wipeCopyOnly, wipeVault, type KV, type Vault } from '../utils/offlineVault';

const WHO_KEY = 'df_offline_who';

/**
 * UN SEUL onglet écrit la copie locale (sinon deux onglets se réécrivent la file, et celui qui n'a rien à envoyer EFFACE les actions de l'autre).
 * L'autre onglet travaille comme avant (sans copie durable) et reprend la main dès que le premier est fermé.
 */
export interface WriterLock { acquire(): Promise<boolean>; release(): void }
export function webWriterLock(): WriterLock {
  let release: (() => void) | null = null;
  return {
    async acquire() {
      if (release) return true;
      const L = (globalThis as { navigator?: { locks?: { request: (n: string, o: unknown, cb: (l: unknown) => unknown) => Promise<unknown> } } }).navigator?.locks;
      if (!L || typeof L.request !== 'function') return true; // navigateur sans verrou : on suppose un seul onglet
      return new Promise<boolean>(resolve => {
        void L.request('df-offline-writer', { ifAvailable: true }, (lock: unknown) => {
          if (!lock) { resolve(false); return undefined; }
          resolve(true);
          return new Promise<void>(res => { release = () => res(); }); // le verrou est gardé tant que l'onglet vit
        });
      });
    },
    release() { if (release) release(); release = null; },
  };
}

export interface OfflineHost {
  isDemo(): boolean;
  getArrays(): Arrays;
  setArrays(a: Arrays): void;
  getSynced(): SyncedJson;
  setSynced(s: SyncedJson): void;
  setCurrentUser(u: User): void;
  diff(): Changes;
  flushSoon(): void; // des changements viennent d'être remis : les envoyer dès que possible
  emit(): void;
}
export interface OfflineOptions { lock?: WriterLock; kv?: KV; queueDelayMs?: number; copyEveryMs?: number; limits?: OfflineLimits; now?: () => string; ioTimeoutMs?: number; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null }
export interface OfflineStatus { enabled: boolean; locked: boolean; problem: string | null; pending: number; photos: number; review: OfflineOp[]; skipped: Skipped[]; copy_saved_at: string | null; oldest_pending: string | null }

export class OfflineController {
  private kv: KV | null;
  private vault: Vault | null = null;
  private queue: Queue = [];
  private skipped: Skipped[] = [];
  private attachedFor: string | null = null;
  private user: { id: string; role: Role } | null = null;
  private locked = false;
  private problem: string | null = null;
  private copySavedAt: string | null = null;
  private lastCopyAt = 0;
  private frozen = false; // miroir figé avant un vidage des données (déconnexion, session expirée) : on ne le recalcule plus
  private chain: Promise<unknown> = Promise.resolve();
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  private cTimer: ReturnType<typeof setTimeout> | null = null;
  private lock: WriterLock;
  private lastUser: User | null = null;
  private opt: Required<Omit<OfflineOptions, 'kv' | 'storage' | 'lock'>> & { storage: OfflineOptions['storage'] };

  constructor(private host: OfflineHost, opts: OfflineOptions = {}) {
    this.kv = opts.kv ?? null;
    this.lock = opts.lock ?? webWriterLock();
    this.opt = { queueDelayMs: opts.queueDelayMs ?? 400, copyEveryMs: opts.copyEveryMs ?? 60_000, limits: opts.limits ?? OFFLINE_DEFAULTS, now: opts.now ?? (() => new Date().toISOString()), ioTimeoutMs: opts.ioTimeoutMs ?? 3000, storage: opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage };
    try {
      // Application mise en arrière-plan ou fermée : on écrit tout de suite (au mieux, l'écriture peut ne pas finir si le téléphone tue l'appli)
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => { if (document.hidden) void this.persistNow(); });
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('pagehide', () => { void this.persistNow(); });
    } catch { /* environnement sans événements : sans effet */ }
  }

  private store(): KV { return (this.kv ||= idbKV()); }
  /** Une écriture lente ou bloquée ne doit jamais figer l'appli : au bout de quelques secondes on continue sans la copie locale. */
  private io<T>(p: Promise<T>, fallback: T): Promise<T> {
    return new Promise<T>(resolve => { const t = setTimeout(() => resolve(fallback), this.opt.ioTimeoutMs); p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); }); });
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const next = this.chain.then(fn, fn); this.chain = next.catch(() => undefined); return next; }
  private writeWho(u: { id: string; role: Role } | null) { try { if (!this.opt.storage) return; if (u) this.opt.storage.setItem(WHO_KEY, JSON.stringify(u)); else this.opt.storage.removeItem(WHO_KEY); } catch { /* sans effet */ } }
  private readWho(): { id: string; role: Role } | null { try { const r = this.opt.storage?.getItem(WHO_KEY); const o = r ? JSON.parse(r) : null; return o && typeof o.id === 'string' && (o.role === 'employee' || o.role === 'admin') ? o : null; } catch { return null; } }

  // ---------- après une connexion ou un démarrage réussi ----------
  /** Ouvre (ou crée) la chambre forte de cette personne et remet ses actions en attente sur les données du serveur. Une fois par personne et par session. */
  async attach(user: User | null): Promise<void> {
    if (this.host.isDemo() || !user || (user.role !== 'employee' && user.role !== 'admin')) return;
    if (this.attachedFor === user.id) return;
    this.lastUser = user;
    if (!(await this.lock.acquire())) { this.problem = 'other_tab'; return; } // un autre onglet tient la copie locale : celui-ci travaille comme avant
    if (this.problem === 'other_tab') this.problem = null;
    this.attachedFor = user.id;
    this.user = { id: user.id, role: user.role as Role };
    await this.serial(async () => {
      const kv = this.store(), now = this.opt.now();
      let u = await this.io(unlockVault(kv, user.id, user.role as Role, undefined, now, this.opt.limits), { status: 'corrupt' } as Awaited<ReturnType<typeof unlockVault>>);
      if (u.status === 'none' && user.role === 'employee') {
        const c = await this.io(createVault(kv, user.id, 'employee', undefined), { status: 'storage_error' } as Awaited<ReturnType<typeof createVault>>);
        if (c.status === 'ok') u = { status: 'ok', vault: c.vault }; else { this.problem = c.status; return; }
      }
      if (u.status === 'none') return; // admin sans code : rien n'est gardé
      if (u.status === 'locked') { this.locked = true; return; }
      if (u.status !== 'ok') { this.problem = u.status; return; }
      this.vault = u.vault; this.problem = null; this.locked = false;
      this.writeWho(this.user);
      const q = await this.io(getQueue(this.vault), { status: 'corrupt' } as Awaited<ReturnType<typeof getQueue>>);
      if (q.status === 'corrupt') this.problem = 'queue_corrupt';
      this.queue = q.status === 'ok' ? q.queue : [];
      this.restoreOnData();
    });
    this.schedulePersist();
  }

  /** Remet les actions en attente sur les données déjà chargées. Les conflits passent dans « À revoir » (le serveur gagne). */
  private restoreOnData() {
    if (!this.user || !this.queue.some(o => o.state === 'pending')) return;
    const res = applyQueue(this.host.getArrays(), this.host.getSynced(), this.queue, this.user.role);
    if (res.conflicts.length) {
      const gone = new Set(res.conflicts.map(o => o.id));
      this.queue = [...this.queue.filter(o => !(o.state === 'pending' && gone.has(o.id))), ...res.conflicts.map(o => ({ ...o, id: `${o.id}|${o.review_code}|${o.created_at}` }))];
    }
    if (res.applied.length) { this.host.setArrays(res.arrays); this.host.flushSoon(); }
    this.host.emit();
  }

  // ---------- démarrage SANS réseau ----------
  /** Ouvre l'appli avec la dernière copie gardée. Faux si rien n'a été gardé, si la copie est trop vieille, ou si elle est verrouillée par un code. */
  async openOffline(): Promise<boolean> {
    if (this.host.isDemo()) return false;
    const who = this.readWho();
    if (!who) return false;
    if (!(await this.lock.acquire())) { this.problem = 'other_tab'; return false; }
    return this.serial(async () => {
      const kv = this.store();
      const u = await this.io(unlockVault(kv, who.id, who.role, undefined, this.opt.now(), this.opt.limits), { status: 'corrupt' } as Awaited<ReturnType<typeof unlockVault>>);
      if (u.status === 'locked') { this.locked = true; this.user = who; return false; }
      if (u.status !== 'ok') return false;
      const c = await this.io(getCopy(u.vault), { status: 'corrupt' } as Awaited<ReturnType<typeof getCopy>>);
      if (c.status !== 'ok') return false;
      const q = await this.io(getQueue(u.vault), { status: 'none' } as Awaited<ReturnType<typeof getQueue>>);
      const arrays: Arrays = {}; const synced: SyncedJson = {};
      for (const [col, list] of Object.entries(c.state)) if (Array.isArray(list)) { arrays[col] = list.filter(r => r && typeof r.id === 'string'); synced[col] = new Map(arrays[col].map(r => [r.id, JSON.stringify(r)])); }
      const me = (arrays.users || []).find(x => x.id === who.id);
      if (!me) return false;
      this.vault = u.vault; this.user = who; this.attachedFor = who.id; this.copySavedAt = c.saved_at;
      this.queue = q.status === 'ok' ? q.queue : [];
      this.host.setSynced(synced); this.host.setArrays(arrays); this.host.setCurrentUser(me as User);
      this.restoreOnData();
      this.host.emit();
      return true;
    });
  }

  // ---------- pendant le travail ----------
  /** Une modification locale vient d'avoir lieu : on garde le miroir des changements (après un court délai, plusieurs modifications d'un coup = une écriture). */
  onLocalChange(): void { this.schedulePersist(); }
  /** Le serveur vient de répondre : on renouvelle la copie des données (au plus une fois par minute, tout de suite la première fois). */
  onServerState(): void {
    if (!this.vault) { if (this.problem === 'other_tab' && this.lastUser) void this.attach(this.lastUser); return; } // l'autre onglet a peut-être été fermé : on réessaie

    const wait = this.lastCopyAt === 0 ? 0 : Math.max(0, this.opt.copyEveryMs - (Date.now() - this.lastCopyAt));
    if (this.cTimer) return;
    this.cTimer = setTimeout(() => { this.cTimer = null; void this.serial(() => this.writeCopy()); }, wait);
  }
  private schedulePersist() { if (!this.vault) return; if (this.qTimer) clearTimeout(this.qTimer); this.qTimer = setTimeout(() => { this.qTimer = null; void this.serial(() => this.writeQueue()); }, this.opt.queueDelayMs); }
  /** Écrit tout de suite (fermeture de l'onglet, déconnexion, essais). */
  async persistNow(): Promise<void> {
    if (!this.vault) return;
    if (this.qTimer) { clearTimeout(this.qTimer); this.qTimer = null; }
    await this.serial(async () => { await this.writeQueue(); if (this.lastCopyAt === 0 && !this.frozen) await this.writeCopy(); });
  }
  /**
   * Fige le miroir des changements en attente, TOUT DE SUITE (synchrone). À appeler AVANT de vider les données (déconnexion, session expirée) :
   * une fois les données vidées, la comparaison serait vide et les actions en attente disparaîtraient.
   */
  snapshot(): void {
    if (!this.vault || !this.user || this.frozen) return;
    if (this.qTimer) { clearTimeout(this.qTimer); this.qTimer = null; }
    const r = buildOps(this.queue, this.host.diff(), this.host.getSynced(), this.user.role, this.opt.now(), this.opt.limits);
    this.queue = r.queue; this.skipped = r.skipped; this.frozen = true;
  }
  private async writeQueue() {
    if (!this.vault || !this.user) return;
    if (!this.frozen) { const r = buildOps(this.queue, this.host.diff(), this.host.getSynced(), this.user.role, this.opt.now(), this.opt.limits); this.queue = r.queue; this.skipped = r.skipped; }
    const w = await this.io(putQueue(this.vault, this.queue), { ok: false } as Awaited<ReturnType<typeof putQueue>>);
    this.problem = w.ok ? (this.problem === 'storage' ? null : this.problem) : 'storage';
  }
  private async writeCopy() {
    if (!this.vault || this.frozen) return; // figé : les données viennent d'être vidées, on n'écrase JAMAIS la bonne copie par une copie vide
    const state: Record<string, unknown[]> = {};
    for (const [col, m] of Object.entries(this.host.getSynced())) { const list: unknown[] = []; for (const json of m.values()) { try { list.push(JSON.parse(json)); } catch { /* ligne illisible : ignorée */ } } state[col] = list; }
    const now = this.opt.now();
    const w = await this.io(putCopy(this.vault, state, now), { ok: false } as Awaited<ReturnType<typeof putCopy>>);
    this.lastCopyAt = Date.now();
    if (w.ok) { this.copySavedAt = now; if (this.problem === 'storage') this.problem = null; } else this.problem = 'storage';
  }

  // ---------- le serveur refuse ----------
  /** Garde dans « À revoir » ce que le serveur vient de refuser (au lieu de tout recharger en silence). Doit être appelé AVANT le rechargement des données. */
  onRejected(items: RejectedItem[], lookup: (col: string, id: string) => unknown): void {
    if (!this.vault || !this.user || !items?.length) return;
    this.queue = rejectedToReview(this.queue, items, lookup, this.user.role, this.opt.now());
    this.schedulePersist();
  }

  // ---------- « À revoir » ----------
  status(): OfflineStatus {
    const s = summary(this.queue);
    return { enabled: !!this.vault, locked: this.locked, problem: this.problem, pending: s.pending, photos: s.photos, review: reviewList(this.queue), skipped: this.skipped, copy_saved_at: this.copySavedAt, oldest_pending: s.oldest };
  }
  /** « Renvoyer » : la version de la personne remplace celle du serveur. */
  requeue(id: string): boolean {
    const op = this.queue.find(o => o.id === id && o.state === 'review');
    if (!op || op.kind !== 'record') return false;
    this.host.setArrays(reapply(this.host.getArrays(), op));
    this.queue = discard(this.queue, id);
    this.host.flushSoon(); this.host.emit(); this.schedulePersist();
    return true;
  }
  /** Supprimer un élément de « À revoir » : seulement sur demande de la personne. */
  discard(id: string): boolean { if (!this.queue.some(o => o.id === id && o.state === 'review')) return false; this.queue = discard(this.queue, id); this.host.emit(); this.schedulePersist(); return true; }
  copyText(id: string, lang: string): string | null { const op = this.queue.find(o => o.id === id); return op ? copyText(op, lang) : null; }
  /** Pour l'écran : une explication de chaque raison (voir REVIEW_TEXT dans offline.ts). */
  reasonOf(op: OfflineOp): Bilingual | null { return op.review_code ? ({ fr: op.review_note || '', en: op.review_note || '' } as Bilingual) : null; }

  // ---------- déconnexion ----------
  /**
   * Détache IMMÉDIATEMENT (synchrone) : fige le miroir des actions en attente, met de côté ce qu'il faut écrire, et vide l'état du contrôleur.
   * L'écriture se fait ensuite avec les valeurs mises de côté : une reconnexion qui suit tout de suite ne peut pas être écrasée par cette fin de travail.
   */
  private detach(): { user: { id: string; role: Role } | null; vault: Vault | null; queue: Queue } {
    this.snapshot();
    if (this.qTimer) { clearTimeout(this.qTimer); this.qTimer = null; }
    if (this.cTimer) { clearTimeout(this.cTimer); this.cTimer = null; }
    const out = { user: this.user, vault: this.vault, queue: this.queue };
    this.vault = null; this.user = null; this.attachedFor = null; this.queue = []; this.skipped = []; this.locked = false; this.problem = null; this.copySavedAt = null; this.lastCopyAt = 0; this.frozen = false; this.lastUser = null;
    return out;
  }
  /**
   * La copie des DONNÉES est toujours effacée. S'il reste des actions en attente ou à revoir, on les GARDE (rien n'est perdu en silence) ; sinon tout est effacé.
   * Retourne le nombre d'éléments gardés (l'écran de déconnexion devra prévenir la personne).
   */
  async beforeLogout(): Promise<number> {
    const d = this.detach(); // synchrone : avant que l'appelant ne vide les données
    this.writeWho(null);
    if (!d.user || !d.vault) { this.lock.release(); return 0; }
    const { user, vault, queue } = d;
    const kept = await this.serial(async () => {
      const kv = this.store();
      if (queue.length > 0) { await this.io(putQueue(vault, queue), undefined); await this.io(wipeCopyOnly(kv, user.id), undefined); } else await this.io(wipeVault(kv, user.id), undefined);
      return queue.length;
    });
    if (!this.vault) this.lock.release(); // rendu seulement si personne ne s'est rattaché entre-temps
    return kept;
  }
  /** Session finie sans déconnexion volontaire (jeton expiré, autre personne qui se connecte) : on garde tout ce qui est en attente. */
  async onSessionExpired(): Promise<void> {
    const d = this.detach(); // synchrone
    if (!d.user || !d.vault) return;
    const { vault, queue } = d;
    await this.serial(async () => { await this.io(putQueue(vault, queue), undefined); });
  }
  /** Arrêt brutal (onglet fermé, essais) : rien n'est écrit, le verrou est rendu. */
  dispose(): void { if (this.qTimer) clearTimeout(this.qTimer); if (this.cTimer) clearTimeout(this.cTimer); this.qTimer = this.cTimer = null; this.vault = null; this.lock.release(); }
}
