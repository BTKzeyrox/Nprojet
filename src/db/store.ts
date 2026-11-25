// Magasin de données central (db) : garde les données en mémoire, les synchronise avec le serveur, gère la démo, le hors ligne et toutes les actions.
// Les méthodes sont rangées par sujet dans db/parts/*.ts (stock, factures, messagerie…) et ajoutées à AppStore plus bas.
// Utilisé par : App.tsx, AccessBanner.tsx, AccessRequestsCard.tsx, AiSettingsSection.tsx, AuditSection.tsx, BackupsSection.tsx, BadgeCongrats.tsx, 102 autres. Contrôlé par : npm run check:page et 40 autres commandes check.
// Pour modifier : les collections synchronisées sont listées dans COLS (haut du fichier) ; une nouvelle collection s'ajoute là, puis dans la classe AppStore (champ, emptySynced, arr et setArr). Écrans : db.subscribe() pour se rafraîchir.
import { OfflineController, type OfflineHost, type WriterLock } from './offlineController';
import type { Role as OfflineRole, Queue as OfflineQueue } from '../utils/offline';
import type { KV } from '../utils/offlineVault';
import type { Arrays, Changes, SyncedJson } from '../utils/offlineSync';
import { findInlineFiles, replaceInlineFile } from '../utils/dataUrls';
import type { ReportRecord } from '../utils/autoReport';
import { todayMada } from '../utils/stats';
import { canInvoiceQuote, quoteToInvoiceDraft } from '../utils/quotes';
import { checkBudgets, checkPurchaseDraft, inventoryAdjustments, inventoryRows, type PurchaseDraft } from '../utils/purchasing';
import { readCompany } from '../utils/companyRules';
import { isMoneyRole } from '../utils/roles';
import type { Leave } from '../utils/leaves';
import type { Shift } from '../utils/planning';
import type { Sheet } from '../utils/sheets';
import type { Review } from '../utils/reviews';
import type { Entry } from '../utils/accounting';
import { todayMada as madaToday } from '../utils/stats';
import { User, PostSession, SecurityViolation, SalaryAdvanceRequest, ChatMessage, ClientContract, PasswordResetRequest, AccessRequest, AccessRequestState, SignupRequest, AppSettings, ProfileChangeRequest, PresenceRow, QueueInfo, ChatGroup, ChatRead, NewsPost, CashEntry, Product, StockMove, Quote, Supplier, PurchaseOrder, Client, Invoice } from '../types';
import { setServerClock } from '../utils/serverClock';
import { TOKEN_KEY, API_BASE, COLS, Col, SORTERS } from './storeShared';
import { accountsMethods, type AccountsMethods } from './parts/accounts';
import { adminToolsMethods, type AdminToolsMethods } from './parts/adminTools';
import { chatMethods, type ChatMethods } from './parts/chat';
import { clientsMethods, type ClientsMethods } from './parts/clients';
import { demoMethods, type DemoMethods } from './parts/demo';
import { financeMethods, type FinanceMethods } from './parts/finance';
import { hrMethods, type HrMethods } from './parts/hr';
import { newsMethods, type NewsMethods } from './parts/news';
import { offlineMethods, type OfflineMethods } from './parts/offline';
import { postsMethods, type PostsMethods } from './parts/posts';
import { purchasingMethods, type PurchasingMethods } from './parts/purchasing';
import { settingsMethods, type SettingsMethods } from './parts/settings';
import { sheetOutboxMethods, type SheetOutboxMethods } from './parts/sheetOutbox';
import { sheetsMethods, type SheetsMethods } from './parts/sheets';
import { stockMethods, type StockMethods } from './parts/stock';

export { DEFAULT_SETTINGS } from './storeShared';

export class AppStore {
  users: User[] = [];
  posts: PostSession[] = [];
  contracts: ClientContract[] = [];
  securityLogs: SecurityViolation[] = [];
  advanceRequests: SalaryAdvanceRequest[] = [];
  messages: ChatMessage[] = [];
  groups: ChatGroup[] = [];
  reads: ChatRead[] = [];
  settings: AppSettings[] = [];
  news: NewsPost[] = [];
  cash: CashEntry[] = []; // finances (admin seulement : le serveur n'envoie rien aux employés)
  products: Product[] = []; // stock (admin seulement, comme les finances)
  stockMoves: StockMove[] = [];
  invoices: Invoice[] = []; // factures et avoirs (admin seulement)
  quotes: Quote[] = []; // devis (admin et Comptable)
  suppliers: Supplier[] = []; // fournisseurs (admin seulement)
  purchases: PurchaseOrder[] = []; // bons de commande (admin seulement)
  sheets: Sheet[] = []; // « Mes tableaux » (module 12) : un opérateur ne reçoit que les siens ; l'admin lit tous (lecture seule)
  entries: Entry[] = []; // écritures comptables (M14) : responsable et Comptable seulement ; JAMAIS écrites par la synchro (routes accounting-*)
  reviews: Review[] = []; // fiches d'évaluation (M5.4) : le responsable voit tout ; un salarié ne voit que ses fiches partagées, sans les points à améliorer
  leaves: Leave[] = []; // demandes de congé (M5.2) : l'admin voit tout, un salarié ne voit que les siennes
  shifts: Shift[] = []; // planning des équipes (M15.2) : le responsable voit et écrit tout, un salarié ne reçoit que SON planning
  clients: Client[] = []; // fiches clients (admin seulement : le serveur n'envoie rien aux employés)
  resets: PasswordResetRequest[] = [];
  accessRequests: AccessRequest[] = [];
  signups: SignupRequest[] = [];
  profileRequests: ProfileChangeRequest[] = [];
  presence: PresenceRow[] = []; // admin : tous les opérateurs
  myQueue: QueueInfo | null = null; // opérateur : sa place dans la file « sans mission »
  currentUser: User | null = null;
  demo = false; // mode démo : données inventées, aucun appel au serveur
  demoErrors: any[] = []; // mode démo : journal d'erreurs inventé
  demoBackups: { id: number; taken_at: string; tables: number; bytes: number }[] = []; // mode démo : sauvegardes inventées
  demoReports: ReportRecord[] = []; // mode démo : rapports automatiques inventés (M15.5), jamais envoyés au serveur
  listeners: Set<() => void> = new Set();
  token: string | null = null;
  since = '';
  synced: Record<Col, Map<string, string>> = this.emptySynced();
  dirty = false;
  syncing = false;
  mutationSeq = 0; // +1 à chaque modification locale : sert à ignorer une réponse serveur devenue périmée
  // Décisions (valider / refuser) envoyées au serveur mais pas encore confirmées par un rechargement : affichage immédiat SEULEMENT (jamais écrit dans `posts`, jamais renvoyé au serveur).
  pendingDecisions = new Map<string, { status: PostSession['status']; reason?: string; settled: boolean }>();
  onVisible: (() => void) | null = null;
  syncTimer: ReturnType<typeof setTimeout> | null = null;
  pollTimer: ReturnType<typeof setTimeout> | null = null;
  lastActivity = Date.now(); // dernière action de la personne (clic, touche, toucher) : sert à ralentir la synchro
  onActivity: (() => void) | null = null;
  readyPromise: Promise<void>;

  // Mode hors ligne (module 13, M13.5) : copie locale et file d'actions durables. Le magasin reste le seul à envoyer au serveur.
  offline: OfflineController;
  lastPullStatus = 200;
  demoCut = false; // mode démo : coupure SIMULÉE (aucun vrai réseau n'est touché)
  demoBase: Record<Col, Map<string, string>> | null = null; // état des données au moment de la coupure simulée

  constructor(opts: { offlineKV?: KV; offlineDelayMs?: number; offlineLock?: WriterLock } = {}) {
    const host: OfflineHost = {
      isDemo: () => this.demo,
      getArrays: () => { const o: Arrays = {}; for (const c of COLS) o[c] = this.arr(c); return o; },
      setArrays: a => { for (const c of COLS) if (a[c]) this.setArr(c, a[c]); },
      getSynced: () => this.syncedForDiff() as unknown as SyncedJson,
      setSynced: sj => { for (const c of COLS) this.synced[c] = sj[c] ? new Map(sj[c]) : new Map(); },
      setCurrentUser: u => { this.currentUser = u; },
      diff: () => this.diff().changes as Changes,
      currentRole: () => (this.currentUser?.role as OfflineRole | undefined) ?? null,
      flushSoon: () => { this.dirty = true; if (this.token) { if (this.syncTimer) clearTimeout(this.syncTimer); this.syncTimer = setTimeout(() => void this.flush(), 300); } },
      emit: () => this.emit(),
    };
    this.offline = new OfflineController(host, { kv: opts.offlineKV, queueDelayMs: opts.offlineDelayMs, lock: opts.offlineLock });
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
    this.readyPromise = this.token ? this.restore() : Promise.resolve();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  emptySynced(): Record<Col, Map<string, string>> {
    return {
      users: new Map(), posts: new Map(), contracts: new Map(),
      securityLogs: new Map(), advances: new Map(), messages: new Map(), groups: new Map(), settings: new Map(), news: new Map(), cash: new Map(), products: new Map(), stock: new Map(), clients: new Map(), invoices: new Map(), suppliers: new Map(), purchases: new Map(), quotes: new Map(), leaves: new Map(), reviews: new Map(), sheets: new Map(), shifts: new Map(), entries: new Map(),
    };
  }

  arr(col: Col): any[] {
    switch (col) {
      case 'users': return this.users;
      case 'posts': return this.posts;
      case 'contracts': return this.contracts;
      case 'securityLogs': return this.securityLogs;
      case 'advances': return this.advanceRequests;
      case 'messages': return this.messages;
      case 'groups': return this.groups;
      case 'settings': return this.settings;
      case 'news': return this.news;
      case 'cash': return this.cash;
      case 'products': return this.products;
      case 'stock': return this.stockMoves;
      case 'clients': return this.clients;
      case 'invoices': return this.invoices;
      case 'quotes': return this.quotes;
      case 'suppliers': return this.suppliers;
      case 'purchases': return this.purchases;
      case 'leaves': return this.leaves;
      case 'shifts': return this.shifts;
      case 'reviews': return this.reviews;
      case 'entries': return this.entries;
      case 'sheets': return this.sheets;
    }
  }

  setArr(col: Col, value: any[]) {
    switch (col) {
      case 'users': this.users = value; break;
      case 'posts': this.posts = value; break;
      case 'contracts': this.contracts = value; break;
      case 'securityLogs': this.securityLogs = value; break;
      case 'advances': this.advanceRequests = value; break;
      case 'messages': this.messages = value; break;
      case 'groups': this.groups = value; break;
      case 'settings': this.settings = value; break;
      case 'news': this.news = value; break;
      case 'cash': this.cash = value; break;
      case 'products': this.products = value; break;
      case 'stock': this.stockMoves = value; break;
      case 'clients': this.clients = value; break;
      case 'invoices': this.invoices = value; break;
      case 'quotes': this.quotes = value; break;
      case 'suppliers': this.suppliers = value; break;
      case 'purchases': this.purchases = value; break;
      case 'leaves': this.leaves = value; break;
      case 'shifts': this.shifts = Array.isArray(value) ? value : []; break; // un serveur plus ancien n'envoie pas encore le planning
      case 'reviews': this.reviews = value; break;
      case 'entries': this.entries = value; break;
      case 'sheets': this.sheets = value; break;
    }
  }

  resetLocal() {
    COLS.forEach(c => this.setArr(c, []));
    this.synced = this.emptySynced();
    this.pendingDecisions.clear(); // déconnexion : plus aucun affichage immédiat d'une décision
    this.since = '';
    this.dirty = false;
    this.resets = [];
    this.accessRequests = [];
    this.signups = [];
    this.profileRequests = [];
    this.presence = [];
    this.reads = [];
    this.myQueue = null;
    this.currentUser = null;
  }

  // Activité réseau visible (barre de chargement) : les actions de l'utilisateur, pas la synchro automatique
  netBusy = 0;
  netListeners = new Set<(busy: number) => void>();
  onNetwork(fn: (busy: number) => void) {
    this.netListeners.add(fn);
    return () => { this.netListeners.delete(fn); };
  }
  netTick(delta: number) {
    this.netBusy = Math.max(0, this.netBusy + delta);
    this.netListeners.forEach(fn => fn(this.netBusy));
  }

  apiWrites = 0; // +1 à chaque envoi d'une action au serveur (hors synchro automatique) : preuve qu'un bouton a bien agi (actionFeedback.ts)
  async api(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    { const m = (init?.method || 'GET').toUpperCase(); const base = path.split('?')[0]; if (m !== 'GET' && base !== 'sync' && base !== 'state') this.apiWrites++; }
    const visible = path.split('?')[0] !== 'state'; // la synchro automatique (state?since=…) ne montre pas de barre
    if (visible) this.netTick(1);
    try {
      return await this.apiRaw(path, init);
    } finally {
      if (visible) this.netTick(-1);
    }
  }
  connDown = false;
  connListeners = new Set<(down: boolean) => void>();
  serverErrorHook: ((path: string, status: number) => void) | null = null;
  onConnection(fn: (down: boolean) => void): () => void {
    this.connListeners.add(fn);
    fn(this.connDown);
    return () => { this.connListeners.delete(fn); };
  }
  setConn(down: boolean) {
    if (down === this.connDown) return;
    this.connDown = down;
    this.connListeners.forEach(f => f(down));
  }
  retryNow() {
    // D'ABORD envoyer, ENSUITE recharger : les deux en même temps pouvaient retirer du téléphone un élément pas encore envoyé, puis l'envoyer comme une suppression.
    void this.flush().finally(() => { void this.pull(true); });
    void this.sendSheets(true); // feuilles du jour gardées sans réseau (M27.9)
  }

  async apiRaw(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    if (this.demo) {
      if (this.demoCut) return { ok: false, status: 0, data: { error: 'Réseau indisponible.' } }; // coupure simulée : tout appel direct échoue, comme sans réseau
      return this.demoApi(path, init); // mode démo : un « faux serveur » local, rien ne part sur internet
    }
    try {
      const res = await fetch(`${API_BASE}/${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...((init?.headers as Record<string, string> | undefined) || {}), // numéro d'action et heure du téléphone (feuille envoyée après une coupure, M27.9)
        },
      });
      const data = await res.json().catch(() => ({}));
      const maintenance = res.status === 503 && data?.code === 'maintenance';
      this.setConn(res.status >= 500 && !maintenance);
      if (res.status >= 500 && !maintenance && this.serverErrorHook) this.serverErrorHook(path.split('?')[0], res.status);
      if (maintenance && this.token && path !== 'login') {
        // Maintenance décidée par l'admin : on déconnecte et on garde son message pour la page de connexion
        try { sessionStorage.setItem('df_login_notice', `Maintenance : ${String(data.error || '')}`); } catch { /* ignore */ }
        this.expireSession();
      }
      if (res.status === 401 && this.token && path !== 'login') {
        // Déconnecté parce que le shift est fini (ou accès bloqué) : on garde le message pour la page de connexion
        if ((data?.code === 'shift' || data?.code === 'forced') && data.error) { try { sessionStorage.setItem('df_login_notice', String(data.error)); } catch { /* ignore */ } }
        this.expireSession();
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      this.setConn(true);
      return { ok: false, status: 0, data: { error: 'Réseau indisponible.' } };
    }
  }

  expireSession() {
    void this.offline.onSessionExpired(); // fige les actions en attente AVANT de vider les données : elles sont gardées pour la prochaine connexion
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    this.stopPolling();
    this.resetLocal();
    this.emit();
  }

  async restore() {
    const ok = await this.pull(true);
    if (ok) { this.startPolling(); return; }
    // Pas de réseau (ou serveur en panne) : on ouvre l'appli avec la dernière copie gardée sur l'appareil, au lieu de renvoyer à la connexion.
    // La synchro reprend toute seule dès que la connexion revient.
    if (this.token && (this.lastPullStatus === 0 || this.lastPullStatus >= 500)) {
      if (await this.offline.openOffline()) this.startPolling();
    }
  }

  // Délai entre deux rechargements : 20 s normalement, plus court seulement quand la messagerie est ouverte
  pollMs = 20000;
  // Plusieurs écrans peuvent demander le mode rapide (messagerie, actualités) : on compte, 8 s tant qu'un écran l'utilise
  fastCount = 0;
  setFastPoll(on: boolean) {
    this.fastCount = Math.max(0, this.fastCount + (on ? 1 : -1));
    const ms = this.fastCount > 0 ? 8000 : 20000;
    if (ms === this.pollMs) return;
    this.pollMs = ms;
    if (this.token && this.pollTimer) this.startPolling();
    if (on && this.token) void this.pull();
  }

  // Économie de quota : sans action depuis 2 min le délai double. JAMAIS plus que ×2 (40 s) : l'appli ouverte doit rester « en ligne » (90 s de marge côté responsable,
  // dont 40 s de retard du téléphone + 40 s de retard de l'ordinateur ; avant, le ×3 à 60 s faisait passer un opérateur présent en « Hors ligne »).
  // Une seule action (clic, touche, toucher) remet la vitesse normale et recharge tout de suite.
  // Temps écoulé depuis la dernière action de la personne (pour ralentir aussi les autres rechargements)
  idleMs(): number { return Date.now() - this.lastActivity; }

  idleFactor(): number {
    const idle = Date.now() - this.lastActivity;
    if (idle > 2 * 60 * 1000) return 2;
    return 1;
  }

  scheduleNextPull() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      if (!this.token) return;
      // Onglet caché : on ne recharge pas, mais on garde le minuteur (le retour sur l'onglet recharge déjà)
      if (!(typeof document !== 'undefined' && document.hidden)) void this.pull();
      this.scheduleNextPull();
    }, this.pollMs * this.idleFactor());
  }

  startPolling() {
    this.stopPolling();
    this.lastActivity = Date.now();
    this.scheduleNextPull();
    if (typeof document !== 'undefined') {
      // Retour sur l'onglet (ou l'appli) : on recharge tout de suite, sans attendre
      this.onVisible = () => { if (!document.hidden) { this.lastActivity = Date.now(); void this.pull(); } };
      document.addEventListener('visibilitychange', this.onVisible);
      // Toute action de la personne remet la vitesse normale (si on était au ralenti, on recharge tout de suite)
      this.onActivity = () => {
        const wasIdle = this.idleFactor() > 1;
        this.lastActivity = Date.now();
        if (wasIdle && this.token) { void this.pull(); this.scheduleNextPull(); }
      };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, this.onActivity, { passive: true });
    }
  }

  stopPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (typeof document !== 'undefined') {
      if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
      if (this.onActivity) for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(ev, this.onActivity);
    }
    this.onVisible = null;
    this.onActivity = null;
  }

  // Récupère les changements du serveur. Retourne true si la session est valide.
  pulling = false;
  // Actualisation demandée à la main (tirer la page vers le bas)
  async refreshNow(): Promise<boolean> {
    if (this.demo) return true; // démo : rien à aller chercher, « À jour »
    return this.pull(true);
  }

  async pull(force = false): Promise<boolean> {
    if (!this.token) return false;
    // Un seul rechargement à la fois (évite les requêtes qui s'empilent sur réseau lent)
    if (this.pulling && !force) return true;
    if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    this.pulling = true;
    try {
      return await this.pullInner(force);
    } finally {
      this.pulling = false;
    }
  }

  async pullInner(force = false): Promise<boolean> {
    if (!this.token) return false;
    const tokenAtStart = this.token;
    const seqAtStart = this.mutationSeq;
    const r = await this.api(`state?since=${encodeURIComponent(this.since)}`);
    this.lastPullStatus = r.status;
    if (!r.ok) return false;
    if (this.sheetLoad() && this.sheetQ.some(o => o.state === 'pending')) void this.sendSheets(); // le réseau répond : les feuilles gardées partent (M27.9)
    // Déconnecté (ou reconnecté autrement) pendant la requête : on ignore la réponse
    if (this.token !== tokenAtStart) return false;
    if (!force && (this.dirty || this.syncing)) return true; // changements locaux en attente : on ignore ce tour
    // Une modification locale (ex. avance envoyée) a eu lieu pendant la requête : la réponse est périmée,
    // elle ne contient pas encore la nouvelle ligne et la ferait disparaître. On attend le prochain tour.
    if (!force && this.mutationSeq !== seqAtStart) return true;

    const cols = r.data.collections || {};
    let changedAny = false;
    for (const col of COLS) {
      const c = cols[col];
      if (!c) continue;
      const idSet = new Set<string>(c.ids || []);
      let list = this.arr(col);
      const before = list.length;
      // Un élément que le serveur n'a JAMAIS reçu (créé sur l'appareil, pas encore envoyé) reste, même si la liste du serveur ne le contient pas : il part au prochain envoi.
      list = list.filter(x => idSet.has(x.id) || !this.synced[col].has(x.id));
      let changed = list.length !== before;
      for (const rec of c.changed || []) {
        const json = JSON.stringify(rec);
        if (this.synced[col].get(rec.id) === json && list.some(x => x.id === rec.id)) continue;
        const idx = list.findIndex(x => x.id === rec.id);
        if (idx >= 0) list[idx] = rec; else list.push(rec);
        this.synced[col].set(rec.id, json);
        changed = true;
      }
      for (const id of Array.from(this.synced[col].keys())) if (!idSet.has(id)) this.synced[col].delete(id);
      if (changed) {
        const sorter = SORTERS[col];
        if (sorter) list.sort(sorter);
        this.setArr(col, list);
        changedAny = true;
      }
    }
    this.since = r.data.serverTime || this.since;
    setServerClock(r.data.serverTime); // écart serveur - appareil : les statuts « En ligne » se comparent à l'heure du serveur, pas à celle du PC ou du téléphone

    // Demandes de modification de profil (admin : toutes ; opérateur : la sienne)
    if (Array.isArray(r.data.profileRequests)) {
      const nextPr = r.data.profileRequests as ProfileChangeRequest[];
      if (JSON.stringify(nextPr) !== JSON.stringify(this.profileRequests)) {
        this.profileRequests = nextPr;
        changedAny = true;
      }
    }

    // Présence (admin : tous les opérateurs) et file d'attente (opérateur : sa place)
    if (Array.isArray(r.data.reads)) {
      const nextReads = r.data.reads as ChatRead[];
      if (JSON.stringify(nextReads) !== JSON.stringify(this.reads)) { this.reads = nextReads; changedAny = true; }
    }
    if (Array.isArray(r.data.presence)) {
      const next = r.data.presence as PresenceRow[];
      if (JSON.stringify(next) !== JSON.stringify(this.presence)) { this.presence = next; changedAny = true; }
    }
    if ('queue' in r.data && !Array.isArray(r.data.presence)) {
      const next = (r.data.queue || null) as QueueInfo | null;
      if (JSON.stringify(next) !== JSON.stringify(this.myQueue)) { this.myQueue = next; changedAny = true; }
    }

    // Demandes de mot de passe oublié (admin seulement)
    if (Array.isArray(r.data.resets)) {
      const next = r.data.resets as PasswordResetRequest[];
      if (JSON.stringify(next) !== JSON.stringify(this.resets)) {
        this.resets = next;
        changedAny = true;
      }
    }

    // Demandes de connexion hors horaires (admin seulement)
    if (Array.isArray(r.data.accessRequests)) {
      const next = r.data.accessRequests as AccessRequest[];
      if (JSON.stringify(next) !== JSON.stringify(this.accessRequests)) { this.accessRequests = next; changedAny = true; }
    }

    // Demandes d'inscription (admin seulement)
    if (Array.isArray(r.data.signups)) {
      const next = r.data.signups as SignupRequest[];
      if (JSON.stringify(next) !== JSON.stringify(this.signups)) {
        this.signups = next;
        changedAny = true;
      }
    }

    // Une liste de missions VIDE reste vide : le site ne recrée plus tout seul les 10 missions d'exemple quand l'admin se connecte
    // (ça annulait le nettoyage de la vraie base, M18.2, à chaque connexion). C'est l'admin qui crée ses missions (ou la simulation, M18.5).

    const me = r.data.me ? this.users.find(u => u.id === r.data.me.id) || r.data.me : null;
    if (me) {
      const prev = JSON.stringify(this.currentUser);
      this.currentUser = me;
      if (prev !== JSON.stringify(me)) changedAny = true;
    }
    if (this.dropSettledDecisions()) changedAny = true; // l'état officiel du serveur est là : l'affichage immédiat d'une décision peut partir
    if (changedAny) this.emit();
    if (!this.demo) { await this.offline.attach(this.currentUser); this.offline.onServerState(); } // copie locale et actions en attente (module 13)
    return true;
  }
  leaveCtx(employeeId: string) {
    const co = readCompany(this.getSettings().company);
    return { today: madaToday(), allowance: Number(co.leave.leave_days_per_year) || 0, perWeek: Number(co.leave.work_days_per_week) || 0, others: this.leaves.filter(l => l.employee_id === employeeId) };
  }
  supplierUsed(id: string): boolean {
    return this.purchases.some(o => o.supplier_id === id) || this.stockMoves.some(m => m.supplier_id === id) || this.cash.some(c => c.supplier_id === id);
  }

  // Bons de commande (responsable seulement ; le serveur revérifie chaque bon). Codes d'erreur : 'admin' | 'supplier' | 'date' | 'expected' | 'lines' | 'product' | 'qty' | 'cost' | 'duplicate' | 'missing' | 'status' | 'none' | 'unsynced'.
  // Brouillon (modifiable) → Commandé (figé, seule la quantité reçue avance) → Reçu. Annulé et Reçu sont définitifs. Aucun total n'est enregistré : il se calcule.
  purchaseChecks(d: PurchaseDraft): { ok: true; clean: Extract<ReturnType<typeof checkPurchaseDraft>, { ok: true }>['clean'] } | { ok: false; error: string } {
    const v = checkPurchaseDraft(d);
    if (!v.ok) return { ok: false, error: v.error };
    if (!this.suppliers.some(x => x.id === v.clean.supplier_id)) return { ok: false, error: 'supplier' };
    if (v.clean.lines.some(l => !this.products.some(p => p.id === l.product_id))) return { ok: false, error: 'product' };
    return { ok: true, clean: v.clean };
  }

  /**
   * Inventaire : `counts` = quantité comptée par produit (texte tel que saisi ; vide = pas compté). Pour chaque produit compté dont l'écart n'est pas nul,
   * crée UN mouvement « ajustement » (raison « inventaire », avec la quantité comptée et celle que le stock indiquait). Tout est refusé si une quantité est fausse.
   * Codes d'erreur : 'admin' | 'qty' (quantité illisible ou négative) | 'date' | 'none' (aucun écart à corriger) | 'product'.
   */
  applyInventory(counts: Record<string, string | number>, date: string): { success: boolean; error?: string; adjusted?: number } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return { success: false, error: 'date' };
    if (Object.keys(counts).some(k => !this.products.some(p => p.id === k))) return { success: false, error: 'product' };
    const rows = inventoryRows(this.products, this.stockMoves, counts);
    if (rows.some(r => r.bad)) return { success: false, error: 'qty' };
    const adj = inventoryAdjustments(rows);
    if (!adj.length) return { success: false, error: 'none' };
    const now = new Date().toISOString();
    const moves: StockMove[] = adj.map((a, i) => ({
      id: `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${i}`, product_id: a.product_id, type: 'adjust' as const, qty: a.qty, date, note: 'Inventaire',
      reason: 'inventory' as const, counted_qty: a.counted, expected_qty: a.expected, created_by: this.currentUser!.id, created_at: now, updated_at: now,
    }));
    this.stockMoves = [...moves, ...this.stockMoves];
    this.notify();
    return { success: true, adjusted: moves.length };
  }

  /**
   * Plafond mensuel par catégorie de dépense (Ar). `input` : catégorie → montant ; vide ou 0 = pas de plafond. Le serveur revérifie.
   * Codes d'erreur : 'admin' | 'budget' (montant faux ou trop de catégories). Réponse avec `category` quand c'est une catégorie précise.
   */
  setBudgets(input: Record<string, string | number>): { success: boolean; error?: string; category?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'admin' };
    const v = checkBudgets(input);
    if (!v.ok) return { success: false, error: v.error, category: v.category };
    this.updateSettings({ budgets: v.clean });
    return { success: true };
  }
  /** Devis accepté → facture BROUILLON avec les mêmes lignes (émission aujourd'hui, échéance selon les conditions de paiement). Le devis garde le lien. */
  quoteToInvoice(id: string): { success: boolean; error?: string; invoice_id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const q = this.quotes.find(x => x.id === id);
    if (!q) return { success: false, error: 'missing' };
    if (!canInvoiceQuote(q)) return { success: false, error: q.invoice_id ? 'invoiced' : 'status' };
    const days = readCompany(this.getSettings().company).billing.payment_days;
    const r = this.saveInvoiceDraft(quoteToInvoiceDraft(q, todayMada(), days));
    if (!r.success || !r.id) return { success: false, error: r.error || 'status' };
    this.quotes = this.quotes.map(x => x.id === id ? { ...x, invoice_id: r.id, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true, invoice_id: r.id };
  }

  async newsCall(path: string, body: object): Promise<{ success: boolean; error?: string }> {
    const r = await this.api(path, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok || !r.data?.news) return { success: false, error: r.data?.error || 'Action impossible. Réessaie.' };
    this.applyNews(r.data.news as NewsPost);
    return { success: true };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit() {
    this.listeners.forEach(fn => fn());
  }

  // Appelé après chaque modification locale : envoie au serveur après un court délai
  notify() {
    this.mutationSeq++;
    if (!this.demo) this.offline.onLocalChange();
    if (this.token) {
      this.dirty = true;
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => void this.flush(), 300);
    }
    this.emit();
  }

  /** Version de référence pour « qu'est-ce qui n'est pas encore envoyé ». Normalement la dernière version connue du serveur ; en démo pendant une coupure simulée, l'état au moment de la coupure. */
  syncedForDiff(): Record<Col, Map<string, string>> { return this.demo && this.demoBase ? this.demoBase : this.synced; }

  diff() {
    const changes: Record<string, { upserts: any[]; deletes: string[] }> = {};
    const sent: Record<string, { sets: Map<string, string>; deletes: string[] }> = {};
    const base = this.syncedForDiff();
    for (const col of COLS) {
      const upserts: any[] = [];
      const sets = new Map<string, string>();
      const current = new Set<string>();
      for (const rec of this.arr(col)) {
        current.add(rec.id);
        const json = JSON.stringify(rec);
        if (base[col].get(rec.id) !== json) { upserts.push(rec); sets.set(rec.id, json); }
      }
      const deletes = Array.from(base[col].keys()).filter(id => !current.has(id));
      if (upserts.length || deletes.length) {
        changes[col] = { upserts, deletes };
        sent[col] = { sets, deletes };
      }
    }
    return { changes, sent };
  }

  flushFails = 0;
  /**
   * Quand l'envoi d'une photo échoue (pas de réseau), l'appli garde la version compressée « collée » dans la mission. Au retour du réseau, on l'envoie
   * vraiment (Supabase Storage) et on remplace l'image collée par son adresse : la base ne se remplit pas d'images entières. Si l'envoi échoue, la mission
   * part comme avant (avec l'image collée) : rien n'est jamais perdu. Une même image n'est envoyée qu'une fois.
   */
  async resolveInlineFiles(): Promise<void> {
    if (this.demo || !this.token) return;
    const first = this.diff().changes;
    const cache = new Map<string, string | null>();
    for (const col of ['posts', 'contracts'] as Col[]) {
      for (const rec of first[col]?.upserts || []) {
        for (const f of findInlineFiles(rec)) {
          let url = cache.get(f.value);
          if (url === undefined) { url = await this.uploadFile(f.value); cache.set(f.value, url); }
          if (!url) return; // réseau coupé ou envoi refusé : on arrête là, la mission part comme avant
          const list = this.arr(col);
          const at = list.findIndex(x => x.id === rec.id);
          if (at < 0) continue;
          const next = replaceInlineFile(list[at], f.path, f.value, url); // dans la version ACTUELLE de la mission (elle a pu changer pendant l'envoi)
          if (next) list[at] = next;
        }
      }
    }
  }

  async flush() {
    if (this.syncing || !this.token) return;
    this.syncing = true;
    let retry = false;
    try {
      await this.resolveInlineFiles(); // photos gardées sur l'appareil pendant la coupure : envoyées au bon endroit AVANT l'enregistrement (module 13, M13.5b)
      const { changes, sent } = this.diff();
      if (Object.keys(changes).length === 0) { this.dirty = false; return; }
      const r = await this.api('sync', { method: 'POST', body: JSON.stringify({ changes }) });
      if (!r.ok) { retry = r.status !== 401 && r.status !== 403 && r.status !== 400 && r.status !== 503 || r.status === 503 && r.data?.code !== 'maintenance'; if (!retry) this.dirty = false; this.flushFails++; return; }
      this.flushFails = 0;
      for (const col of Object.keys(sent) as Col[]) {
        sent[col].sets.forEach((json, id) => this.synced[col].set(id, json));
        sent[col].deletes.forEach(id => this.synced[col].delete(id));
      }
      if (!this.demo) this.offline.onLocalChange(); // ce qui vient de partir sort de la file gardée sur l'appareil
      if (r.data.rejected?.length) {
        // Certaines modifications refusées par le serveur : ce que la personne avait fait est gardé dans « À revoir » (raison du serveur), PUIS on recharge l'état officiel
        this.offline.onRejected(r.data.rejected, (col, id) => this.arr(col as Col).find(x => x.id === id));
        this.dirty = false;
        this.since = '';
        this.syncing = false;
        await this.pull(true);
        return;
      }
      const again = this.diff();
      if (Object.keys(again.changes).length > 0) retry = true; else this.dirty = false;
    } finally {
      this.syncing = false;
      if (retry && this.token) {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        // 2,5 s au début, puis de plus en plus long (jusqu'à 30 s) : une panne ne doit pas épuiser les appels gratuits
        const wait = Math.min(30000, 2500 * Math.pow(2, Math.min(this.flushFails, 4)));
        this.syncTimer = setTimeout(() => void this.flush(), wait);
      }
    }
  }
  async login(username: string, password: string, code?: string): Promise<{ success: boolean; error?: string; user?: User; needsCode?: boolean; canRequestAccess?: boolean; accessRequest?: AccessRequestState | null }> {
    const r = await this.api('login', { method: 'POST', body: JSON.stringify(code ? { username, password, code } : { username, password }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Erreur de connexion.', needsCode: r.data?.code === 'totp_required', canRequestAccess: r.data?.code === 'shift' && r.data?.can_request === true, accessRequest: r.data?.request ?? null };
    this.stopPolling();
    void this.offline.onSessionExpired(); // une autre personne se connecte : les actions en attente de la précédente sont gardées
    this.resetLocal();
    this.token = r.data.token;
    try { localStorage.setItem(TOKEN_KEY, r.data.token); } catch { /* ignore */ }
    await this.pull(true);
    this.currentUser = this.users.find(u => u.id === r.data.user.id) || r.data.user;
    this.startPolling();
    this.emit();
    return { success: true, user: this.currentUser as User };
  }

  logout(): void {
    this.demo = false;
    if (this.token) {
      fetch(`${API_BASE}/logout`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } }).catch(() => {});
    }
    { // prévient la personne AVANT de vider les données : ce qui est gardé sur l'appareil partira à sa prochaine connexion
      const st = this.offline.status();
      if (!this.demo && st.enabled && (this.offline.unsent(true).count > 0 || st.review.length > 0)) { try { sessionStorage.setItem('df_login_notice', 'Des actions faites hors ligne sont gardées sur cet appareil. Elles partiront quand tu te reconnecteras avec le même compte.'); } catch { /* ignore */ } }
    }
    void this.offline.beforeLogout(); // fige les actions en attente (synchrone) avant de vider les données ; efface la copie ; garde ce qui n'est pas encore parti
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    this.stopPolling();
    this.resetLocal();
    this.emit();
  }

  /** Arrêt brutal de CE magasin (essais : simule la fermeture d'un onglet). Rien n'est écrit. */
  __dispose(): void { this.stopPolling(); if (this.syncTimer) clearTimeout(this.syncTimer); this.syncTimer = null; this.token = null; this.offline.dispose(); }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Admin : enregistre les réglages (le serveur refuse tout autre utilisateur)
  updateSettings(patch: Partial<AppSettings>): void {
    const next: AppSettings = { ...this.getSettings(), ...patch, id: 'general' };
    this.settings = [next];
    this.notify();
  }

  // Envoie un fichier (data URL) vers Supabase Storage. Retourne le lien public, ou null si échec.
  /** Raison du dernier échec d'envoi de fichier (pour la montrer à la personne). */
  lastUploadError = '';
  /** Envoie un fichier. Avec `tries` > 1 (publications), un échec de connexion ou de serveur (réseau coupé, 4G faible, erreur 5xx, trop de demandes) est réessayé ; une erreur claire (fichier trop gros, type refusé) ne l'est pas. */
  async uploadFile(dataUrl: string, tries = 1): Promise<string | null> {
    this.lastUploadError = '';
    for (let attempt = 1; attempt <= tries; attempt++) {
      const r = await this.api('upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      if (r.ok && r.data?.url) return String(r.data.url);
      const transient = r.status === 0 || r.status >= 500 || r.status === 429;
      this.lastUploadError = String(r.data?.error || (r.status === 0 ? 'Réseau indisponible.' : `Erreur ${r.status}.`));
      if (!transient || attempt === tries || this.demo) break;
      await new Promise(res => setTimeout(res, 700 * attempt));
    }
    return null;
  }

  static readonly MAX_CONTRACTS = 100;

  // Admin exclusive: Update any field of any post session (debut, target, name, tag, employee, shift, status, notes)
  updatePostAdmin(
    postId: string,
    updates: Partial<PostSession>
  ): { success: boolean; error?: string; post?: PostSession } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    // If employee reassigned, verify user
    if (updates.employee_id && updates.employee_id !== post.employee_id) {
      const emp = this.users.find(u => u.id === updates.employee_id);
      if (emp) {
        post.employee_id = emp.id;
        post.employee_name = emp.name;
      }
    }

    if (updates.client_name !== undefined) post.client_name = updates.client_name;
    if (updates.account_tag !== undefined) post.account_tag = updates.account_tag;
    if (updates.shift_type !== undefined) post.shift_type = updates.shift_type;
    if (updates.status !== undefined) post.status = updates.status;
    if (updates.notes !== undefined) post.notes = updates.notes;

    if (updates.initial_score !== undefined) {
      post.initial_score = updates.initial_score;
      // If current score was at old initial score, adjust current too
      if (post.current_score === post.initial_score) {
        post.current_score = updates.initial_score;
      }
    }

    if (updates.current_score !== undefined) {
      post.current_score = updates.current_score;
    }

    if (updates.target_score !== undefined) {
      post.target_score = updates.target_score;
    }

    // Recalculate remaining
    post.remaining_score = Math.max(0, post.target_score - post.current_score);

    if (updates.start_proof_url) post.start_proof_url = updates.start_proof_url;
    if (updates.start_proof_urls) {
      post.start_proof_urls = updates.start_proof_urls;
      if (updates.start_proof_urls.length > 0 && !updates.start_proof_url) {
        post.start_proof_url = updates.start_proof_urls[0];
      }
    }

    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true, post };
  }

  getSecurityLogs(): SecurityViolation[] {
    return [...this.securityLogs];
  }

  getAdvanceRequests(): SalaryAdvanceRequest[] {
    return [...this.advanceRequests];
  }
  sheetQ: OfflineQueue = [];
  sheetQFor = '';
  sheetSending = false;
  sheetTimer: ReturnType<typeof setTimeout> | null = null;
  sheetKey = (uid: string) => `df_sheet_outbox_${uid}`;
  // Supprimer pour tous : l'auteur, ou l'admin (modération)
  canDeleteForAll(msg: ChatMessage, userId: string): boolean {
    const u = this.users.find(x => x.id === userId);
    return !!u && !msg.deleted_at && (msg.sender_id === userId || u.role === 'admin');
  }
  static EDIT_WINDOW_MS = 15 * 60 * 1000;

  // « est en train d'écrire… » : un signe au plus toutes les 2,5 s ; la liste est lue par la messagerie ouverte
  typingSentAt = 0;
  // Mémoire de l'assistant (admin) : notes enregistrées sur le serveur (ligne `mem:<compte>`), en démo seulement dans le navigateur.
  demoMem: { id: string; text: string; at: number }[] = [];
  demoRem: { items: any[]; cfg: any } = { items: [], cfg: { templates: [], morning: '08:00', hide_title: false, quiet_from: '', quiet_to: '' } };

  // « Lu » : on dit au serveur jusqu'où on a lu la conversation (discret, sans barre de chargement)
  lastReadSent = new Map<string, number>();
}

// Ajoute les méthodes rangées dans db/parts/* à la classe (et à son type).
export interface AppStore extends AccountsMethods, AdminToolsMethods, ChatMethods, ClientsMethods, DemoMethods, FinanceMethods, HrMethods, NewsMethods, OfflineMethods, PostsMethods, PurchasingMethods, SettingsMethods, SheetOutboxMethods, SheetsMethods, StockMethods {}
Object.assign(AppStore.prototype, accountsMethods, adminToolsMethods, chatMethods, clientsMethods, demoMethods, financeMethods, hrMethods, newsMethods, offlineMethods, postsMethods, purchasingMethods, settingsMethods, sheetOutboxMethods, sheetsMethods, stockMethods);


export const db = new AppStore();
