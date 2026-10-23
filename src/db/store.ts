import { checkDraft, type CashDraft } from '../utils/finance';
import { checkDeadline } from '../utils/deadlines';
import { canSubmitTasks, checkTasks, cleanDone, cleanTasks, toggleTask, type TasksError } from '../utils/taskList';
import { checkTemplate, cleanTemplates, newTemplateId, type MissionTemplate, type TemplateDraft } from '../utils/missionTemplates';
import { checkClientDraft, checkMissionClient, matchContract, MISSION_CLIENT_MESSAGE, normalizeName, type ClientDraft } from '../utils/clients';
import { checkMoveDraft, checkProductDraft, purchaseAmount, quantities, type MoveDraft, type ProductDraft } from '../utils/stock';
import { checkSupplierDraft, type SupplierDraft } from '../utils/purchasing';
import { checkInvoiceDraft, invoiceInfo, invoiceTotals, formatNumber, type InvoiceDraft } from '../utils/invoices';
import { buildDemoData, DEMO_ADMIN_ID, DEMO_CLIENT_PRICES, DEMO_COMPANY, DEMO_GOALS } from '../demo/demoData';
import { companyForEmployee, readCompany } from '../utils/companyRules';
import { isMoneyRole } from '../utils/roles';
import { buildAuditEntry, cleanAuditRows, type AuditEntry } from '../utils/auditRules';
import {
  User,
  PostSession,
  SecurityViolation,
  SalaryAdvanceRequest,
  ChatMessage,
  ShiftType,
  ClientContract,
  PasswordResetRequest,
  SignupRequest,
  AppSettings,
  ProfileChangeRequest,
  PresenceRow,
  AttendanceRow,
  QueueInfo,
  ChatGroup,
  ChatRead,
  NewsPost,
  CashEntry,
  Product,
  StockMove,
  Supplier,
  PurchaseOrder,
  Client,
  Invoice,
  NewsAttachment,
} from '../types';
import { AVAILABLE_CLIENT_CONTRACTS } from './initialData';
import { clientPriceForContract } from '../utils/clientPrice';

const TOKEN_KEY = 'df_session_token_v2';
// Adresse du projet Supabase : réglage Vercel `VITE_SUPABASE_URL` (pour une copie du site), sinon le projet actuel
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://ljorjzrxkxqacmmkmqdx.supabase.co').replace(/\/+$/, '');
const API_BASE = `${SUPABASE_URL}/functions/v1/df-api`;
const RESTORE_BASE = `${SUPABASE_URL}/functions/v1/df-restore`;
const AI_BASE = `${SUPABASE_URL}/functions/v1/df-assistant`;
const COLS = ['users', 'posts', 'contracts', 'securityLogs', 'advances', 'messages', 'groups', 'settings', 'news', 'cash', 'products', 'stock', 'clients', 'invoices', 'suppliers', 'purchases'] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'general',
  price_per_million: 1000,
  price_per_mission: 5000,
  client_price_default_ar: 0, // à régler dans Réglages > Missions (0 = pas encore réglé)
  client_prices_by_type: {},
  day_shift_start: '08:00',
  day_shift_end: '18:00',
  night_shift_start: '20:00',
  night_shift_end: '06:00',
  late_tolerance_min: 15,
  access_before_min: 60,
  access_after_min: 60,
  show_activity_column: true,
  pay_period: 'month',
  advance_cap_pct: 0,
  advance_repay_pct: 100,
  pay_methods: ['MVola', 'Orange Money', 'Airtel Money', 'Espèces'],
  penalties_enabled: false,
  auto_pen_enabled: true,
  auto_pen_late1_min: 15,
  auto_pen_late1_m: 1,
  auto_pen_late2_min: 30,
  auto_pen_late2_m: 2,
  auto_pen_absent_m: 5,
  badge_start: true,
  badge_end: true,
  badge_advance: true,
  badge_profile: true,
  badges_clickable: true,
  alert_idle_1_min: 15,
  alert_idle_2_min: 30,
  err_report_enabled: true,
  err_max_per_session: 3,
  err_hide_details: true,
  err_report_button: true,
  retry_seconds: 15,
  maintenance_on: false,
  maintenance_message: 'Le site est en maintenance. Réessaie un peu plus tard.',
  retention_days: 7,
  grid_columns: 2,
  rules: '',
  post_types: ['Saisie de fiches', 'Contrôle qualité', 'Tâche administrative', 'Demande d’aide', 'Tâche web'],
};
type Col = (typeof COLS)[number];

const SORTERS: Partial<Record<Col, (a: any, b: any) => number>> = {
  users: (a, b) => (a.role === b.role ? String(a.id).localeCompare(String(b.id)) : a.role === 'admin' ? -1 : 1),
  posts: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
  contracts: (a, b) => (a.post_number || 0) - (b.post_number || 0),
  securityLogs: (a, b) => String(b.id).localeCompare(String(a.id)),
  advances: (a, b) => String(b.id).localeCompare(String(a.id)),
  news: (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  cash: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  products: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  stock: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  clients: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  invoices: (a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id).localeCompare(String(a.id)),
  suppliers: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  purchases: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.ref || '').localeCompare(String(a.ref || '')) || String(b.id).localeCompare(String(a.id)),
  groups: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)),
  messages: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || String(a.id).localeCompare(String(b.id)),
};

const TEMPLATE_MESSAGE: Record<'name' | 'duplicate' | 'limit' | 'proof' | 'format', string> = {
  name: 'Donne un nom au modèle.',
  duplicate: 'Un modèle porte déjà ce nom.',
  limit: 'Maximum 30 modèles de mission.',
  proof: 'Justificatif inconnu.',
  format: 'Modèle illisible.',
};

const TASKS_MESSAGE: Record<TasksError, string> = {
  format: 'Liste de tâches illisible.',
  empty_text: 'Une tâche ne peut pas être vide.',
  too_many: 'Maximum 20 tâches par mission.',
  duplicate_id: 'Deux tâches portent le même identifiant.',
  required_without_tasks: 'Ajoute au moins une tâche pour exiger qu\'elles soient toutes cochées.',
};

const DEADLINE_MESSAGE: Record<'date' | 'time' | 'time_without_date' | 'priority', string> = {
  date: 'La date limite n\'est pas une vraie date.',
  time: 'L\'heure limite doit être entre 00:00 et 23:59.',
  time_without_date: 'Choisis une date pour pouvoir ajouter une heure.',
  priority: 'Priorité inconnue.',
};

class DeltaForceStore {
  private users: User[] = [];
  private posts: PostSession[] = [];
  private contracts: ClientContract[] = [];
  private securityLogs: SecurityViolation[] = [];
  private advanceRequests: SalaryAdvanceRequest[] = [];
  private messages: ChatMessage[] = [];
  private groups: ChatGroup[] = [];
  private reads: ChatRead[] = [];
  private settings: AppSettings[] = [];
  private news: NewsPost[] = [];
  private cash: CashEntry[] = []; // finances (admin seulement : le serveur n'envoie rien aux employés)
  private products: Product[] = []; // stock (admin seulement, comme les finances)
  private stockMoves: StockMove[] = [];
  private invoices: Invoice[] = []; // factures et avoirs (admin seulement)
  private suppliers: Supplier[] = []; // fournisseurs (admin seulement)
  private purchases: PurchaseOrder[] = []; // bons de commande (admin seulement)
  private clients: Client[] = []; // fiches clients (admin seulement : le serveur n'envoie rien aux employés)
  private resets: PasswordResetRequest[] = [];
  private signups: SignupRequest[] = [];
  private profileRequests: ProfileChangeRequest[] = [];
  private presence: PresenceRow[] = []; // admin : tous les boosters
  private myQueue: QueueInfo | null = null; // booster : sa place dans la file « sans poste »
  private currentUser: User | null = null;
  private demo = false; // mode démo : données inventées, aucun appel au serveur
  private demoErrors: any[] = []; // mode démo : journal d'erreurs inventé
  private demoBackups: { id: number; taken_at: string; tables: number; bytes: number }[] = []; // mode démo : sauvegardes inventées
  private listeners: Set<() => void> = new Set();

  // --- Synchronisation avec le serveur (Supabase via /api) ---
  private token: string | null = null;
  private since = '';
  private synced: Record<Col, Map<string, string>> = this.emptySynced();
  private dirty = false;
  private syncing = false;
  private mutationSeq = 0; // +1 à chaque modification locale : sert à ignorer une réponse serveur devenue périmée
  private onVisible: (() => void) | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = Date.now(); // dernière action de la personne (clic, touche, toucher) : sert à ralentir la synchro
  private onActivity: (() => void) | null = null;
  private readyPromise: Promise<void>;

  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
    this.readyPromise = this.token ? this.restore() : Promise.resolve();
  }

  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private emptySynced(): Record<Col, Map<string, string>> {
    return {
      users: new Map(), posts: new Map(), contracts: new Map(),
      securityLogs: new Map(), advances: new Map(), messages: new Map(), groups: new Map(), settings: new Map(), news: new Map(), cash: new Map(), products: new Map(), stock: new Map(), clients: new Map(), invoices: new Map(), suppliers: new Map(), purchases: new Map(),
    };
  }

  private arr(col: Col): any[] {
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
      case 'suppliers': return this.suppliers;
      case 'purchases': return this.purchases;
    }
  }

  private setArr(col: Col, value: any[]) {
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
      case 'suppliers': this.suppliers = value; break;
      case 'purchases': this.purchases = value; break;
    }
  }

  private resetLocal() {
    COLS.forEach(c => this.setArr(c, []));
    this.synced = this.emptySynced();
    this.since = '';
    this.dirty = false;
    this.resets = [];
    this.signups = [];
    this.profileRequests = [];
    this.presence = [];
    this.reads = [];
    this.myQueue = null;
    this.currentUser = null;
  }

  // Activité réseau visible (barre de chargement) : les actions de l'utilisateur, pas la synchro automatique
  private netBusy = 0;
  private netListeners = new Set<(busy: number) => void>();
  public onNetwork(fn: (busy: number) => void) {
    this.netListeners.add(fn);
    return () => { this.netListeners.delete(fn); };
  }
  private netTick(delta: number) {
    this.netBusy = Math.max(0, this.netBusy + delta);
    this.netListeners.forEach(fn => fn(this.netBusy));
  }

  private async api(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    const visible = path.split('?')[0] !== 'state'; // la synchro automatique (state?since=…) ne montre pas de barre
    if (visible) this.netTick(1);
    try {
      return await this.apiRaw(path, init);
    } finally {
      if (visible) this.netTick(-1);
    }
  }

  // --- État de la connexion (bandeau « Connexion perdue ») et erreurs serveur ---
  private connDown = false;
  private connListeners = new Set<(down: boolean) => void>();
  public serverErrorHook: ((path: string, status: number) => void) | null = null;
  public onConnection(fn: (down: boolean) => void): () => void {
    this.connListeners.add(fn);
    fn(this.connDown);
    return () => { this.connListeners.delete(fn); };
  }
  private setConn(down: boolean) {
    if (down === this.connDown) return;
    this.connDown = down;
    this.connListeners.forEach(f => f(down));
  }
  public retryNow() {
    void this.pull(true);
    void this.flush();
  }

  private async apiRaw(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    if (this.demo) return this.demoApi(path, init); // mode démo : un « faux serveur » local, rien ne part sur internet
    try {
      const res = await fetch(`${API_BASE}/${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
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
        if (data?.code === 'shift' && data.error) { try { sessionStorage.setItem('df_login_notice', String(data.error)); } catch { /* ignore */ } }
        this.expireSession();
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      this.setConn(true);
      return { ok: false, status: 0, data: { error: 'Réseau indisponible.' } };
    }
  }

  private expireSession() {
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    this.stopPolling();
    this.resetLocal();
    this.emit();
  }

  private async restore() {
    const ok = await this.pull(true);
    if (ok) this.startPolling();
  }

  // Délai entre deux rechargements : 20 s normalement, plus court seulement quand la messagerie est ouverte
  private pollMs = 20000;
  // Plusieurs écrans peuvent demander le mode rapide (messagerie, actualités) : on compte, 8 s tant qu'un écran l'utilise
  private fastCount = 0;
  public setFastPoll(on: boolean) {
    this.fastCount = Math.max(0, this.fastCount + (on ? 1 : -1));
    const ms = this.fastCount > 0 ? 8000 : 20000;
    if (ms === this.pollMs) return;
    this.pollMs = ms;
    if (this.token && this.pollTimer) this.startPolling();
    if (on && this.token) void this.pull();
  }

  // Économie de quota : sans action depuis 2 min le délai double, depuis 10 min il triple.
  // Une seule action (clic, touche, toucher) remet la vitesse normale et recharge tout de suite.
  // Temps écoulé depuis la dernière action de la personne (pour ralentir aussi les autres rechargements)
  public idleMs(): number { return Date.now() - this.lastActivity; }

  private idleFactor(): number {
    const idle = Date.now() - this.lastActivity;
    if (idle > 10 * 60 * 1000) return 3;
    if (idle > 2 * 60 * 1000) return 2;
    return 1;
  }

  private scheduleNextPull() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      if (!this.token) return;
      // Onglet caché : on ne recharge pas, mais on garde le minuteur (le retour sur l'onglet recharge déjà)
      if (!(typeof document !== 'undefined' && document.hidden)) void this.pull();
      this.scheduleNextPull();
    }, this.pollMs * this.idleFactor());
  }

  private startPolling() {
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

  private stopPolling() {
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
  private pulling = false;
  // Actualisation demandée à la main (tirer la page vers le bas)
  public async refreshNow(): Promise<boolean> {
    return this.pull(true);
  }

  private async pull(force = false): Promise<boolean> {
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

  private async pullInner(force = false): Promise<boolean> {
    if (!this.token) return false;
    const tokenAtStart = this.token;
    const seqAtStart = this.mutationSeq;
    const r = await this.api(`state?since=${encodeURIComponent(this.since)}`);
    if (!r.ok) return false;
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
      list = list.filter(x => idSet.has(x.id));
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

    // Demandes de modification de profil (admin : toutes ; booster : la sienne)
    if (Array.isArray(r.data.profileRequests)) {
      const nextPr = r.data.profileRequests as ProfileChangeRequest[];
      if (JSON.stringify(nextPr) !== JSON.stringify(this.profileRequests)) {
        this.profileRequests = nextPr;
        changedAny = true;
      }
    }

    // Présence (admin : tous les boosters) et file d'attente (booster : sa place)
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

    // Demandes d'inscription (admin seulement)
    if (Array.isArray(r.data.signups)) {
      const next = r.data.signups as SignupRequest[];
      if (JSON.stringify(next) !== JSON.stringify(this.signups)) {
        this.signups = next;
        changedAny = true;
      }
    }

    // Premier démarrage : l'admin remplit les 20 postes
    if (r.data.me?.role === 'admin' && this.contracts.length === 0 && (cols.contracts?.ids || []).length === 0) {
      this.contracts = [...AVAILABLE_CLIENT_CONTRACTS];
      this.notify();
      changedAny = true;
    }

    const me = r.data.me ? this.users.find(u => u.id === r.data.me.id) || r.data.me : null;
    if (me) {
      const prev = JSON.stringify(this.currentUser);
      this.currentUser = me;
      if (prev !== JSON.stringify(me)) changedAny = true;
    }
    if (changedAny) this.emit();
    return true;
  }

  // --- Fil d'actualité ---
  /** Lignes d'argent (entrées et sorties). Toujours vide pour un employé : le serveur ne lui envoie rien. */
  public getCash(): CashEntry[] { return [...this.cash]; }

  // Finances (responsable seulement ; le serveur revérifie chaque ligne). Les lignes partent avec la synchro habituelle.
  // En cas de refus, `error` est un code : 'admin' | 'kind' | 'amount' | 'date' | 'category' | 'missing'.
  public addCash(d: CashDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const now = new Date().toISOString();
    const id = `cash-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.cash = [{ id, ...v.clean, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.cash];
    this.notify();
    return { success: true, id };
  }

  public updateCash(id: string, d: CashDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const old = this.cash.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const { supplier_id: _sid, ...oldCash } = old; // un fournisseur vidé par l'admin disparaît vraiment
    this.cash = this.cash.map(x => x.id === id ? { ...oldCash, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }

  public deleteCash(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.cash.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.cash = this.cash.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  }

  // --- Factures (module 2, responsable seulement). Brouillons : modifiables ici (le serveur revérifie les totaux). ---
  // Émission, paiement et avoir passent par des routes dédiées : le numéro et le reçu sont attribués par le serveur, jamais ici.
  // Codes d'erreur d'un brouillon : 'admin' | 'client' | 'issue_date' | 'due_date' | 'due_before' | 'lines' | 'too_many_lines' | 'description' | 'qty' | 'price' | 'total' | 'note' | 'missing' | 'not_draft' | 'no_client' | 'ref_used'.
  public getInvoices(): Invoice[] { return [...this.invoices]; }

  public saveInvoiceDraft(d: InvoiceDraft & { id?: string }): { success: boolean; error?: string; line?: number; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const company = readCompany(this.getSettings().company);
    const v = checkInvoiceDraft({ ...d, vat_enabled: company.tax.vat_enabled, vat_rate: company.tax.vat_rate });
    if (!v.ok) return { success: false, error: v.error, line: v.line };
    const client = this.clients.find(c => c.id === v.clean.client_id);
    if (!client) return { success: false, error: 'no_client' };
    const used = new Set<string>();
    for (const i of this.invoices) if (i.id !== d.id && i.type !== 'credit_note' && i.status !== 'cancelled') for (const l of i.lines) for (const r of l.refs || []) used.add(r);
    if (v.clean.lines.some(l => (l.refs || []).some(r => used.has(r)))) return { success: false, error: 'ref_used' }; // une mission ne va que dans une facture
    const now = new Date().toISOString();
    if (d.id) {
      const old = this.invoices.find(x => x.id === d.id);
      if (!old) return { success: false, error: 'missing' };
      if (old.status !== 'draft' || old.type === 'credit_note') return { success: false, error: 'not_draft' };
      this.invoices = this.invoices.map(x => x.id === d.id ? { ...x, ...v.clean, client: { name: client.name }, updated_at: now } : x);
      this.notify();
      return { success: true, id: d.id };
    }
    const id = `inv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.invoices = [{ id, type: 'invoice', status: 'draft', ...v.clean, client: { name: client.name }, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.invoices];
    this.notify();
    return { success: true, id };
  }

  public deleteInvoiceDraft(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const inv = this.invoices.find(x => x.id === id);
    if (!inv) return { success: false, error: 'missing' };
    if (inv.status !== 'draft' || inv.type === 'credit_note') return { success: false, error: 'not_draft' }; // une facture émise ne se supprime jamais : on l'annule par un avoir
    this.invoices = this.invoices.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  }

  /** Envoie d'abord les changements en attente (le serveur lit le brouillon enregistré), puis appelle la route. */
  private async invoiceCall(route: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (!isMoneyRole(this.currentUser?.role)) return { ok: false, error: 'Réservé au responsable et au comptable.' };
    if (!this.demo) {
      for (let i = 0; i < 50 && this.syncing; i++) await new Promise(r => setTimeout(r, 100));
      await this.flush();
    }
    const r = await this.api(route, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.' };
    if (!this.demo) { this.since = ''; await this.pull(true); }
    return { ok: true, data: r.data };
  }
  public issueInvoice(id: string) { return this.invoiceCall('invoice-issue', { id }); }
  public cancelInvoice(id: string) { return this.invoiceCall('invoice-cancel', { id }); }
  public payInvoice(id: string, p: { amount: number; date: string; method?: string; note?: string }) { return this.invoiceCall('invoice-pay', { id, ...p }); }

  // --- Stock (responsable seulement ; le serveur revérifie chaque ligne). La quantité se calcule avec les mouvements, elle n'est jamais saisie. ---
  public getClients(): Client[] { return [...this.clients]; } // admin seulement (l'opérateur n'en reçoit jamais)

  // Clients (responsable seulement ; le serveur revérifie chaque fiche). Codes d'erreur : 'admin' | 'name' | 'email' | 'terms' | 'price' | 'price_by_type' | 'duplicate' | 'missing' | 'in_use'.
  // Le statut d'un client n'est jamais enregistré : il se calcule (src/utils/clients.ts).
  public addClient(d: ClientDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkClientDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.clients.some(x => normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const now = new Date().toISOString();
    const id = `cli-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.clients = [{ id, ...v.clean, active: true, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.clients];
    this.notify();
    return { success: true, id };
  }

  public updateClient(id: string, d: ClientDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const old = this.clients.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkClientDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.clients.some(x => x.id !== id && normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    // Les champs facultatifs vidés par l'admin disparaissent vraiment (on ne garde pas l'ancienne valeur).
    const { payment_terms_days: _t, price_default_ar: _p, price_by_type: _b, ...base } = old;
    this.clients = this.clients.map(x => x.id === id ? { ...base, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }

  /** Désactive (archive) ou réactive un client. Un client désactivé reste là avec ses missions et n'apparaît plus dans les listes de choix. */
  public setClientActive(id: string, active: boolean): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.clients.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.clients = this.clients.map(x => x.id === id ? { ...x, active, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }

  /** Supprime une fiche seulement si aucune mission ni session ne la cite (le serveur refuse aussi) : sinon, on la désactive. */
  public deleteClient(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.clients.some(x => x.id === id)) return { success: false, error: 'missing' };
    if (this.contracts.some(c => c.client_id === id) || this.posts.some(p => p.client_id === id)) return { success: false, error: 'in_use' };
    this.clients = this.clients.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  }

  // Fournisseurs (responsable seulement ; le serveur revérifie chaque fiche). Codes d'erreur : 'admin' | 'name' | 'lead' | 'duplicate' | 'missing' | 'in_use'.
  public getSuppliers(): Supplier[] { return [...this.suppliers]; }
  private supplierUsed(id: string): boolean {
    return this.purchases.some(o => o.supplier_id === id) || this.stockMoves.some(m => m.supplier_id === id) || this.cash.some(c => c.supplier_id === id);
  }
  public addSupplier(d: SupplierDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkSupplierDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.suppliers.some(x => normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const now = new Date().toISOString();
    const id = `sup-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.suppliers = [{ id, ...v.clean, active: true, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.suppliers];
    this.notify();
    return { success: true, id };
  }
  public updateSupplier(id: string, d: SupplierDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const old = this.suppliers.find(x => x.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkSupplierDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.suppliers.some(x => x.id !== id && normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const { lead_days: _l, ...base } = old; // un délai vidé disparaît vraiment
    this.suppliers = this.suppliers.map(x => x.id === id ? { ...base, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }
  /** Archive ou réactive. Un fournisseur archivé reste là avec ses bons et n'apparaît plus dans les listes de choix. */
  public setSupplierActive(id: string, active: boolean): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.suppliers.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.suppliers = this.suppliers.map(x => x.id === id ? { ...x, active, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }
  /** Supprime seulement un fournisseur qui n'a servi à rien (le serveur refuse aussi) : sinon, on l'archive. */
  public deleteSupplier(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.suppliers.some(x => x.id === id)) return { success: false, error: 'missing' };
    if (this.supplierUsed(id)) return { success: false, error: 'in_use' };
    this.suppliers = this.suppliers.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  }

  public getPurchases(): PurchaseOrder[] { return [...this.purchases]; }
  public getProducts(): Product[] { return [...this.products]; }
  public getStockMoves(): StockMove[] { return [...this.stockMoves]; }

  public addProduct(d: ProductDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkProductDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    const now = new Date().toISOString();
    const id = `prod-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.products = [{ id, ...v.clean, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.products];
    this.notify();
    return { success: true, id };
  }

  public updateProduct(id: string, d: ProductDraft): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.products.some(x => x.id === id)) return { success: false, error: 'missing' };
    const v = checkProductDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    this.products = this.products.map(x => x.id === id ? { ...x, ...v.clean, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  }

  /** Supprime le produit ET tous ses mouvements (le serveur fait pareil). */
  public deleteProduct(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.products.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.products = this.products.filter(x => x.id !== id);
    this.stockMoves = this.stockMoves.filter(m => m.product_id !== id);
    this.notify();
    return { success: true };
  }

  /**
   * Entrée, sortie ou ajustement. Une sortie qui dépasse le stock est refusée ('stock') ; un ajustement ne peut pas rendre le stock négatif.
   * `withExpense` (entrée avec un prix payé) : crée aussi une dépense « Achats » du même montant, liée à l'entrée (S3.3).
   */
  public addStockMove(d: MoveDraft, opts: { withExpense?: boolean } = {}): { success: boolean; error?: string; id?: string; cashId?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkMoveDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    const p = this.products.find(x => x.id === v.clean.product_id);
    if (!p) return { success: false, error: 'product' };
    if (v.clean.supplier_id && !this.suppliers.some(s => s.id === v.clean.supplier_id)) return { success: false, error: 'supplier' };
    const have = quantities([p], this.stockMoves).get(p.id) || 0;
    if (v.clean.type !== 'in' && have + (v.clean.type === 'out' ? -v.clean.qty : v.clean.qty) < 0) return { success: false, error: 'stock' };
    const now = new Date().toISOString();
    const id = `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    let cashId: string | undefined;
    if (opts.withExpense && v.clean.type === 'in') {
      const amount = purchaseAmount(v.clean.qty, v.clean.unit_cost_ar);
      if (amount < 1) return { success: false, error: 'cost' }; // pas de prix : pas de dépense à créer
      const c = this.addCash({ kind: 'out', category: 'Achats', amount, date: v.clean.date, note: `Stock : ${p.name} (${v.clean.qty} ${p.unit})`, ...(v.clean.supplier_id ? { supplier_id: v.clean.supplier_id } : {}) });
      if (!c.success) return { success: false, error: c.error };
      cashId = c.id;
    }
    this.stockMoves = [{ id, ...v.clean, ...(cashId ? { cash_id: cashId } : {}), created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.stockMoves];
    this.notify();
    return { success: true, id, cashId };
  }

  /** Supprime un mouvement (la quantité se recalcule). Refusé si cela rendrait le stock négatif. La dépense liée, s'il y en a une, reste : elle se supprime dans Finances. */
  public deleteStockMove(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const m = this.stockMoves.find(x => x.id === id);
    if (!m) return { success: false, error: 'missing' };
    const rest = this.stockMoves.filter(x => x.id !== id);
    const p = this.products.find(x => x.id === m.product_id);
    if (p && (quantities([p], rest).get(p.id) || 0) < 0 && (quantities([p], this.stockMoves).get(p.id) || 0) >= 0) return { success: false, error: 'stock' };
    this.stockMoves = rest;
    this.notify();
    return { success: true };
  }

  public getNews(): NewsPost[] {
    return [...this.news];
  }

  // Le responsable publie (envoyé au serveur avec la synchro habituelle)
  public publishNews(p: { title: string; text: string; pinned?: boolean; files?: NewsAttachment[] }): { success: boolean; error?: string } {
    const me = this.currentUser;
    if (!me || me.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const text = p.text.trim();
    const files = p.files || [];
    if (!text && files.length === 0) return { success: false, error: 'Écris un texte ou joins un fichier.' };
    const rec: NewsPost = {
      id: `news-${Date.now()}`, author_id: me.id, author_name: 'Responsable', author_role: 'admin', title: p.title.trim().slice(0, 120),
      text: text.slice(0, 2000), created_at: new Date().toISOString(), pinned: !!p.pinned, status: 'published', files,
      loves: [], comments: [], shares: 0,
    };
    this.news = [rec, ...this.news].sort(SORTERS.news!);
    this.notify();
    return { success: true };
  }

  // L'employé propose une publication : le serveur la garde « en attente » jusqu'à la décision du responsable
  public submitNews(p: { title: string; text: string; files?: NewsAttachment[] }) {
    return this.newsCall('news-submit', { title: p.title, text: p.text, files: p.files || [] });
  }

  // Le responsable valide ou refuse une publication en attente (motif obligatoire au refus)
  public decideNews(id: string, decision: 'approve' | 'reject', reason?: string) {
    return this.newsCall('news-decision', { id, decision, reason: reason || '' });
  }

  // L'auteur retire sa publication tant qu'elle n'est pas validée
  public async withdrawNews(id: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('news-withdraw', { method: 'POST', body: JSON.stringify({ id }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Action impossible. Réessaie.' };
    this.news = this.news.filter(x => x.id !== id);
    this.synced.news.delete(id);
    this.emit();
    return { success: true };
  }

  public togglePinNews(id: string) {
    const n = this.news.find(x => x.id === id);
    if (!n || this.currentUser?.role !== 'admin') return;
    this.news = this.news.map(x => (x.id === id ? { ...x, pinned: !x.pinned } : x)).sort(SORTERS.news!);
    this.notify();
  }

  public deleteNews(id: string) {
    if (this.currentUser?.role !== 'admin') return;
    this.news = this.news.filter(x => x.id !== id);
    this.notify();
  }

  // Actions des lecteurs : le serveur renvoie la publication à jour, on la remplace tout de suite
  private applyNews(doc: NewsPost) {
    const list = this.news.filter(x => x.id !== doc.id);
    list.push(doc);
    list.sort(SORTERS.news!);
    this.news = list;
    this.synced.news.set(doc.id, JSON.stringify(doc));
    this.emit();
  }

  private async newsCall(path: string, body: object): Promise<{ success: boolean; error?: string }> {
    const r = await this.api(path, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok || !r.data?.news) return { success: false, error: r.data?.error || 'Action impossible. Réessaie.' };
    this.applyNews(r.data.news as NewsPost);
    return { success: true };
  }

  // « J'adore » : l'écran change tout de suite, puis le serveur confirme. En cas d'erreur, on revient en arrière.
  public async toggleLoveNews(id: string): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    const n = this.news.find(x => x.id === id);
    if (!me || !n) return this.newsCall('news-react', { id });
    const before = n.loves;
    const after = before.includes(me.id) ? before.filter(x => x !== me.id) : [...before, me.id];
    this.news = this.news.map(x => (x.id === id ? { ...x, loves: after } : x));
    this.emit();
    const r = await this.newsCall('news-react', { id });
    if (!r.success) {
      this.news = this.news.map(x => (x.id === id ? { ...x, loves: before } : x));
      this.emit();
    }
    return r;
  }
  public commentNews(id: string, text: string, files?: NewsAttachment[]) { return this.newsCall('news-comment', { id, text, files: files || [] }); }
  public deleteCommentNews(id: string, commentId: string) { return this.newsCall('news-comment-delete', { id, commentId }); }
  public shareNews(id: string) { return this.newsCall('news-share', { id }); }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach(fn => fn());
  }

  // Appelé après chaque modification locale : envoie au serveur après un court délai
  private notify() {
    this.mutationSeq++;
    if (this.token) {
      this.dirty = true;
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => void this.flush(), 300);
    }
    this.emit();
  }

  private diff() {
    const changes: Record<string, { upserts: any[]; deletes: string[] }> = {};
    const sent: Record<string, { sets: Map<string, string>; deletes: string[] }> = {};
    for (const col of COLS) {
      const upserts: any[] = [];
      const sets = new Map<string, string>();
      const current = new Set<string>();
      for (const rec of this.arr(col)) {
        current.add(rec.id);
        const json = JSON.stringify(rec);
        if (this.synced[col].get(rec.id) !== json) { upserts.push(rec); sets.set(rec.id, json); }
      }
      const deletes = Array.from(this.synced[col].keys()).filter(id => !current.has(id));
      if (upserts.length || deletes.length) {
        changes[col] = { upserts, deletes };
        sent[col] = { sets, deletes };
      }
    }
    return { changes, sent };
  }

  private flushFails = 0;
  private async flush() {
    if (this.syncing || !this.token) return;
    this.syncing = true;
    let retry = false;
    try {
      const { changes, sent } = this.diff();
      if (Object.keys(changes).length === 0) { this.dirty = false; return; }
      const r = await this.api('sync', { method: 'POST', body: JSON.stringify({ changes }) });
      if (!r.ok) { retry = r.status !== 401 && r.status !== 403 && r.status !== 400 && r.status !== 503 || r.status === 503 && r.data?.code !== 'maintenance'; if (!retry) this.dirty = false; this.flushFails++; return; }
      this.flushFails = 0;
      for (const col of Object.keys(sent) as Col[]) {
        sent[col].sets.forEach((json, id) => this.synced[col].set(id, json));
        sent[col].deletes.forEach(id => this.synced[col].delete(id));
      }
      if (r.data.rejected?.length) {
        // Certaines modifications refusées par le serveur : on recharge l'état officiel
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

  // --- AUTHENTICATION ---
  public async login(username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
    const r = await this.api('login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Erreur de connexion.' };
    this.stopPolling();
    this.resetLocal();
    this.token = r.data.token;
    try { localStorage.setItem(TOKEN_KEY, r.data.token); } catch { /* ignore */ }
    await this.pull(true);
    this.currentUser = this.users.find(u => u.id === r.data.user.id) || r.data.user;
    this.startPolling();
    this.emit();
    return { success: true, user: this.currentUser as User };
  }

  // Faux serveur du mode démo : répond comme le vrai, mais ne modifie que les données fictives en mémoire.
  private demoApi(path: string, init?: RequestInit): { ok: boolean; status: number; data: any } {
    const route = path.split('?')[0];
    let body: any = {};
    try { body = JSON.parse(String(init?.body || '{}')); } catch { body = {}; }
    const me = this.currentUser;
    const ok = (data: any = { ok: true }) => ({ ok: true, status: 200, data });
    const fail = (error: string) => ({ ok: false, status: 400, data: { error } });
    const nowIso = new Date().toISOString();
    const post = (id: string) => this.news.find(n => n.id === id);
    const keep = (n: NewsPost) => ok({ news: JSON.parse(JSON.stringify(n)) });
    switch (route) {
      case 'news-react': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        n.loves = n.loves.includes(me.id) ? n.loves.filter(x => x !== me.id) : [...n.loves, me.id];
        return keep(n);
      }
      case 'news-comment': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        const text = String(body.text || '').trim().slice(0, 1000);
        if (!text && !(body.files || []).length) return fail('Écris un commentaire.');
        n.comments = [...n.comments, { id: `demo_nc${Date.now()}`, user_id: me.id, user_name: me.name, role: me.role, text, files: body.files || [], created_at: nowIso }];
        return keep(n);
      }
      case 'news-comment-delete': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        n.comments = n.comments.filter(c => c.id !== body.commentId);
        return keep(n);
      }
      case 'news-share': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        n.shares = (n.shares || 0) + 1;
        return keep(n);
      }
      case 'news-submit': {
        if (!me) return fail('Connexion perdue.');
        const n: NewsPost = {
          id: `demo_n${Date.now()}`, author_id: me.id, author_name: me.name, author_role: me.role, title: String(body.title || '').slice(0, 120), text: String(body.text || '').slice(0, 4000),
          files: body.files || [], created_at: nowIso, pinned: false, loves: [], comments: [], shares: 0, status: me.role === 'admin' ? 'published' : 'pending',
        };
        this.news = [n, ...this.news];
        return keep(n);
      }
      case 'news-decision': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        if (body.decision === 'approve') { n.status = 'published'; n.created_at = nowIso; } else { n.status = 'rejected'; n.reject_reason = String(body.reason || ''); }
        return keep(n);
      }
      case 'news-withdraw': return ok();
      case 'upload': return ok({ url: String(body.dataUrl || '') }); // le fichier reste dans la page (aucun envoi)
      case 'create-user': {
        const u = { ...(body.user || {}), id: body.user?.id || `demo_u${Date.now()}` } as User;
        return ok({ user: u });
      }
      case 'payroll-period': {
        // Mode démo : fiches de paie calculées dans le navigateur (lecture seule : clôturer, payer, primes ne changent rien)
        const pidStr = String(body.pid || '');
        const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(pidStr);
        if (!m) return fail('Période invalide.');
        const y = Number(m[1]), mo = Number(m[2]);
        const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const from = m[3] === 'B' ? 16 : 1, to = m[3] === 'A' ? 15 : last;
        const p2 = (n: number) => String(n).padStart(2, '0');
        const start = `${y}-${p2(mo)}-${p2(from)}`, end = `${y}-${p2(mo)}-${p2(to)}`;
        const isClosed = end < nowIso.slice(0, 10);
        const emps = this.users.filter(u => u.role === 'employee');
        const slips = emps.map((u, i) => {
          const mine = this.posts.filter(x => x.employee_id === u.id && x.status === 'completed' && x.date >= start && x.date <= end);
          const gross = mine.reduce((tt, x) => tt + Math.max(0, Math.round(typeof x.calculated_ar === 'number' ? x.calculated_ar : 0)), 0);
          return { id: `slip-${pidStr}-${u.id}`, pid: pidStr, period_start: start, period_end: end, user_id: u.id, name: u.name, username: u.username, phone: u.phone || '', lines: [], gross, bonuses: [], penalties: [], penalty_applied: 0, advance_due_before: 0, advance_deducted: 0, advance_carry: 0, net: gross, paid: isClosed && i % 2 === 0 && gross > 0 ? { at: `${end}T10:00:00.000Z`, method: 'Mobile money', ref: '', by_name: 'Responsable' } : null };
        }).filter(sl => sl.gross > 0);
        const pending = this.posts.filter(x => ['pending_start', 'pending_end', 'active'].includes(x.status) && x.date >= start && x.date <= end).length;
        return ok({ pid: pidStr, start, end, status: isClosed ? 'closed' : 'open', closed_at: isClosed ? `${end}T12:00:00.000Z` : null, closed_by_name: isClosed ? 'Responsable' : '', slips, pending_validation: pending, audit: [], index: [], cfg: { methods: ['Mobile money', 'Espèces'], penalties: false, cap_pct: 50, repay_pct: 30, mode: m[3] ? 'half' : 'month' } });
      }
      case 'attendance': {
        const day = decodeURIComponent((path.split('day=')[1] || '').split('&')[0]) || nowIso.slice(0, 10);
        const emps = this.users.filter(u => u.role === 'employee');
        const mine = me?.role === 'admin' ? emps : emps.filter(u => u.id === me?.id);
        return ok({ rows: mine.map((u, i) => ({ user_id: u.id, day, first_seen: `${day}T0${7 + (i % 3)}:${10 + i * 7}:00.000Z`, last_seen: `${day}T1${i % 4}:30:00.000Z`, online_sec: 3600 * (3 + (i % 4)) + i * 420 })) });
      }
      case 'audit-list': {
        // Mode démo : lignes inventées, jamais d'appel réseau
        const me0 = { id: DEMO_ADMIN_ID, name: 'Responsable' };
        const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
        const mk = (h: number, a: string, ty: string, label: string, detail: string) => buildAuditEntry(me0, a, { type: ty, id: `demo-${a}-${h}`, label }, detail, ago(h), `d${h}`);
        return ok({ rows: [mk(1, 'invoice_issue', 'invoices', 'F-2026-0012', 'Client : Alice'), mk(3, 'invoice_pay', 'invoices', 'F-2026-0011', '150000 Ar'), mk(26, 'tariff_change', 'settings', 'Réglages', 'client_price_default_ar : 1000 → 1200'), mk(50, 'delete', 'clients', 'Client test', ''), mk(72, 'settings_change', 'settings', 'Réglages', 'day_shift_start'), mk(120, 'backup_now', 'backups', 'Sauvegarde', '')].filter(Boolean) });
      }
      case 'backups': return ok({ rows: [...this.demoBackups].sort((a, b) => b.id - a.id) });
      case 'backup-now': {
        const id = Math.max(0, ...this.demoBackups.map(b => b.id)) + 1;
        this.demoBackups = [...this.demoBackups, { id, taken_at: nowIso, tables: 20, bytes: 204800 + id * 512 }];
        return ok({ ok: true, id });
      }
      case 'backup-get': {
        const row = this.demoBackups.find(b => b.id === Number(new URLSearchParams(path.split('?')[1] || '').get('id')));
        if (!row) return fail('Sauvegarde introuvable.');
        return ok({ backup: { ...row, data: { _demo: true, users: this.users, contracts: this.contracts, posts: this.posts, advances: this.advanceRequests, messages: this.messages, groups: this.groups, news: this.news, cash: this.cash, products: this.products, stock: this.stockMoves, clients: this.clients, invoices: this.invoices, suppliers: this.suppliers, purchases: this.purchases } } });
      }
      case 'errors': {
        const st = new URLSearchParams(path.split('?')[1] || '').get('status') || 'open';
        return ok({ rows: this.demoErrors.filter(e => st === 'all' || e.status === st) });
      }
      case 'error-update': {
        const e = this.demoErrors.find(x => x.id === body.id); if (!e) return fail('Introuvable.');
        if (body.remove) this.demoErrors = this.demoErrors.filter(x => x.id !== body.id); else if (body.status) e.status = body.status;
        return ok();
      }
      case 'profile-request': {
        if (!me) return fail('Connexion perdue.');
        this.profileRequests = [...this.profileRequests.filter(x => x.user_id !== me.id), {
          id: `demo_p${Date.now()}`, user_id: me.id, status: 'pending', created_at: nowIso,
          old: { name: me.name, username: me.username, phone: me.phone || '', avatar_url: me.avatar_url || '' },
          name: String(body.name || me.name), username: String(body.username || me.username), phone: String(body.phone || ''), avatar_url: String(body.avatar_url || ''), note: String(body.note || ''),
        }];
        this.emit();
        return ok();
      }
      case 'profile-decision': {
        const pr = this.profileRequests.find(x => x.id === body.id); if (!pr) return fail('Demande introuvable.');
        if (body.approve) {
          this.users = this.users.map(u => (u.id === pr.user_id ? { ...u, name: pr.name, username: pr.username, phone: pr.phone, avatar_url: pr.avatar_url || u.avatar_url } : u));
          if (me && me.id === pr.user_id) this.currentUser = this.users.find(u => u.id === me.id) || me;
        }
        return ok();
      }
      case 'signup-decision': {
        const sg = this.signups.find(x => x.id === body.id); if (!sg) return fail('Demande introuvable.');
        if (body.approve) {
          const u: User = { id: `demo_u${Date.now()}`, username: sg.username, name: sg.name, role: 'employee', status: 'active', shift: sg.shift, is_online: false, avatar_url: '', phone: sg.phone, performance_badge: 'Standard', total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0 };
          this.users = [...this.users, u];
        }
        return ok();
      }
      case 'queue': {
        if (!me) return fail('Connexion perdue.');
        const others = this.presence.filter(x => x.waiting_since && x.user_id !== me.id);
        if (body.join) {
          this.myQueue = { waiting_since: nowIso, position: others.length + 1, total: others.length + 1 };
          this.presence = [...this.presence.filter(x => x.user_id !== me.id), { user_id: me.id, last_seen: nowIso, day: nowIso.slice(0, 10), online_sec: 600, waiting_since: nowIso }];
        } else {
          this.myQueue = null;
          this.presence = this.presence.map(x => (x.user_id === me.id ? { ...x, waiting_since: null } : x));
        }
        this.emit();
        return ok();
      }
      case 'invoice-issue': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'draft') return fail('Cette facture n\'est plus un brouillon.');
        const co = readCompany(this.getSettings().company);
        const client = this.clients.find(c => c.id === inv.client_id);
        const year = Number(nowIso.slice(0, 4));
        const n = this.invoices.filter(x => x.type !== 'credit_note' && x.number?.startsWith(`${co.billing.invoice_prefix}${year}-`)).length + 1;
        const t = invoiceTotals(inv.lines, co.tax.vat_enabled, co.tax.vat_rate);
        this.invoices = this.invoices.map(x => x.id === inv.id ? { ...x, ...t, status: 'issued', number: formatNumber(co.billing.invoice_prefix, year, n), issued_at: nowIso, client: { name: client?.name || inv.client.name, address: client?.address, email: client?.email, phone: client?.phone }, issuer: { name: co.identity.name, address: co.identity.address, email: co.identity.email, phone: co.identity.phone, tax_id: co.legal.tax_id, register_id: co.legal.register_id } } : x);
        this.emit();
        return ok({ ok: true });
      }
      case 'invoice-pay': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'issued' || inv.type === 'credit_note') return fail('Cette facture n\'est pas émise.');
        const info = invoiceInfo(inv, this.cash, nowIso.slice(0, 10));
        const amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount < 1) return fail('Montant invalide.');
        if (amount > info.balance) return fail(`Le paiement dépasse le reste à payer (${info.balance} Ar).`);
        const co = readCompany(this.getSettings().company);
        const n = this.cash.filter(x => x.receipt_no?.startsWith(`${co.billing.receipt_prefix}${nowIso.slice(0, 4)}-`)).length + 1;
        this.cash = [{ id: `cash-${Date.now().toString(36)}`, kind: 'in', category: 'Paiement client', amount_ar: amount, date: String(body.date || nowIso.slice(0, 10)), note: String(body.note || ''), client_name: inv.client.name, invoice_id: inv.id, receipt_no: formatNumber(co.billing.receipt_prefix, Number(nowIso.slice(0, 4)), n), payment_method: String(body.method || ''), created_at: nowIso, updated_at: nowIso }, ...this.cash];
        this.emit();
        return ok({ ok: true });
      }
      case 'invoice-cancel': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'issued' || inv.type === 'credit_note') return fail('Cette facture ne peut pas être annulée.');
        if (invoiceInfo(inv, this.cash, nowIso.slice(0, 10)).paid > 0) return fail('Cette facture a déjà reçu un paiement : supprime d\'abord le paiement.');
        const n = this.invoices.filter(x => x.type === 'credit_note' && x.number?.startsWith(`AV-${nowIso.slice(0, 4)}-`)).length + 1;
        const credit: Invoice = { ...inv, id: `cn-${Date.now().toString(36)}`, type: 'credit_note', number: formatNumber('AV-', Number(nowIso.slice(0, 4)), n), credit_of: inv.id, cancelled_by: undefined, issue_date: nowIso.slice(0, 10), issued_at: nowIso, created_at: nowIso, updated_at: nowIso };
        delete credit.cancelled_by;
        this.invoices = [credit, ...this.invoices.map(x => x.id === inv.id ? { ...x, status: 'cancelled' as const, cancelled_by: credit.id } : x)];
        this.emit();
        return ok({ ok: true });
      }
      case 'typing': return ok({ typing: [] });
      default: return ok(); // chat-read, report-error, queue, set-password, décisions… : accepté, sans rien envoyer
    }
  }

  // ----- Mode démo : tout se passe dans le navigateur, avec des données inventées (rien n'est envoyé au serveur) -----
  public isDemo(): boolean { return this.demo; }
  public enterDemo(role: 'admin' | 'employee'): User {
    this.stopPolling();
    this.resetLocal();
    this.token = null;
    this.demo = true;
    const d = buildDemoData();
    // Les fiches clients ne sont pas visibles par un opérateur : ni les fiches, ni le lien client_id sur les missions (comme le vrai serveur)
    const strip = <T extends object>(x: T): T => { const { client_id, ...rest } = x as any; return rest as T; };
    this.users = d.users; this.contracts = role === 'admin' ? d.contracts : d.contracts.map(strip); this.posts = role === 'admin' ? d.posts : d.posts.map(strip); this.advanceRequests = d.advances;
    this.clients = role === 'admin' ? d.clients : [];
    this.messages = d.messages; this.groups = d.groups; this.news = d.news;
    this.signups = d.signups; this.resets = d.resets; this.profileRequests = d.profileRequests; this.presence = d.presence; this.myQueue = null;
    this.demoErrors = d.errors;
    this.settings = [{ ...DEFAULT_SETTINGS, ...DEMO_CLIENT_PRICES, ...DEMO_GOALS, company: role === 'admin' ? readCompany(DEMO_COMPANY) : (companyForEmployee(DEMO_COMPANY as any) as any) }]; // prix client, objectifs et conditions inventés ; l'opérateur de la démo ne reçoit que le règlement et les congés, comme avec le vrai serveur
    this.cash = role === 'admin' ? d.cash : []; // les finances ne sont visibles que par le responsable, même en démo
    this.products = role === 'admin' ? d.products : []; // le stock aussi
    this.stockMoves = role === 'admin' ? d.stock : [];
    this.invoices = role === 'admin' ? d.invoices : [];
    this.suppliers = role === 'admin' ? d.suppliers : [];
    this.purchases = role === 'admin' ? d.purchases : [];
    this.demoBackups = [{ id: 1, taken_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(), tables: 20, bytes: 204800 }];
    this.currentUser = d.users.find(u => (role === 'admin' ? u.id === DEMO_ADMIN_ID : u.id === 'demo_u1')) as User;
    this.emit();
    return this.currentUser;
  }

  public logout(): void {
    this.demo = false;
    if (this.token) {
      fetch(`${API_BASE}/logout`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } }).catch(() => {});
    }
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    this.stopPolling();
    this.resetLocal();
    this.emit();
  }

  public async setPassword(userId: string, password: string, currentPassword?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('set-password', { method: 'POST', body: JSON.stringify({ userId, password, currentPassword }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Réglages généraux (valeurs par défaut si l'admin n'a rien changé)
  // Admin : supprime les sessions et avances de démonstration, puis recalcule les totaux des boosters
  public removeDemoData(): number {
    const before = this.posts.length + this.advanceRequests.length;
    this.posts = this.posts.filter(p => !p.demo);
    this.advanceRequests = this.advanceRequests.filter(a => !a.demo);
    this.users.forEach(u => {
      if (u.role !== 'employee') return;
      const done = this.posts.filter(p => p.employee_id === u.id && p.status === 'completed');
      u.total_score_boosted = done.reduce((a, p) => a + Math.max(0, (p.final_score ?? p.current_score) - p.initial_score), 0);
      u.total_earnings_ar = done.reduce((a, p) => a + (p.calculated_ar || 0), 0);
      u.pending_advance_ar = this.advanceRequests.filter(a => a.employee_id === u.id && a.status === 'pending').reduce((x, a) => x + a.amount_ar, 0);
    });
    this.notify();
    return before - (this.posts.length + this.advanceRequests.length);
  }

  // Paie : appel générique aux routes payroll-* du serveur
  public async payrollCall(route: string, body: unknown = {}): Promise<{ success: boolean; data?: any; error?: string }> {
    const r = await this.api(route, { method: 'POST', body: JSON.stringify(body) });
    return r.ok ? { success: true, data: r.data } : { success: false, error: r.data?.error || 'Erreur. Réessaie.' };
  }

  public getSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...(this.settings[0] || {}), id: 'general' };
  }

  /** Modèles de mission (M6.2) : gardés dans les réglages, sans nouvelle table. */
  public getMissionTemplates(): MissionTemplate[] { return cleanTemplates(this.getSettings().mission_templates); }

  /** Crée (sans `id`) ou modifie (avec `id`) un modèle. Admin seulement. */
  public saveMissionTemplate(d: TemplateDraft): { success: boolean; error?: string; template?: MissionTemplate } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getMissionTemplates();
    const id = typeof d?.id === 'string' ? d.id : '';
    if (id && !list.some(t => t.id === id)) return { success: false, error: 'Modèle introuvable.' };
    const v = checkTemplate(d, list.filter(t => t.id !== id));
    if (!v.ok) return { success: false, error: TEMPLATE_MESSAGE[v.error] };
    const template = { ...v.value, id: id || newTemplateId(list) };
    this.updateSettings({ mission_templates: id ? list.map(t => (t.id === id ? template : t)) : [...list, template] });
    return { success: true, template };
  }

  public removeMissionTemplate(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getMissionTemplates();
    if (!list.some(t => t.id === id)) return { success: false, error: 'Modèle introuvable.' };
    this.updateSettings({ mission_templates: list.filter(t => t.id !== id) });
    return { success: true };
  }

  // Admin : enregistre les réglages (le serveur refuse tout autre utilisateur)
  public updateSettings(patch: Partial<AppSettings>): void {
    const next: AppSettings = { ...this.getSettings(), ...patch, id: 'general' };
    this.settings = [next];
    this.notify();
  }

  // Envoie un fichier (data URL) vers Supabase Storage. Retourne le lien public, ou null si échec.
  public async uploadFile(dataUrl: string): Promise<string | null> {
    const r = await this.api('upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
    return r.ok && r.data?.url ? String(r.data.url) : null;
  }

  // --- Restauration du site (remise à zéro) : Gmail admin + code par mail ---
  private async restoreCall(path: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (this.demo) {
      // Mode démo : la remise à zéro est simulée dans le navigateur (n'importe quel code est accepté), rien ne part au serveur
      if (path === 'restore-status') return { ok: true, data: { email: 'demo@gmail.com', verified: true } };
      if (path === 'restore-execute') this.enterDemo(this.currentUser?.role === 'admin' ? 'admin' : 'employee');
      return { ok: true, data: { ok: true } };
    }
    this.netTick(1);
    try {
      const res = await fetch(`${RESTORE_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data };
      return { ok: false, error: data?.error || 'Erreur. Réessayez.' };
    } catch {
      return { ok: false, error: 'Connexion impossible. Réessayez.' };
    } finally {
      this.netTick(-1);
    }
  }
  /** Assistant IA externe (admin seulement, fonction séparée df-assistant). En démo : rien ne part au serveur. */
  public async aiCall(path: 'status' | 'ask', body: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (this.demo) return { ok: false, error: 'demo' };
    if (this.currentUser?.role !== 'admin') return { ok: false, error: 'admin_only' };
    try {
      const res = await fetch(`${AI_BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, data } : { ok: false, error: String(data?.error || 'unavailable') };
    } catch {
      return { ok: false, error: 'network' };
    }
  }
  public restoreStatus() { return this.restoreCall('restore-status'); }
  public restoreSetEmail(email: string) { return this.restoreCall('restore-email', { email }); }
  public restoreVerifyEmail(code: string) { return this.restoreCall('restore-email-verify', { code }); }
  public restoreSendCode() { return this.restoreCall('restore-send-code'); }
  public restoreBackupCode() { return this.restoreCall('restore-backup-code'); }
  public restoreBackupExecute(id: number, code: string) { return this.restoreCall('restore-backup-execute', { id, code, confirm: 'RESTAURER' }); }
  public restoreExecute(code: string) { return this.restoreCall('restore-execute', { code, confirm: 'RESTAURER' }); }

  // --- Journal des erreurs et signalements ---
  public async sendErrorReport(report: Record<string, unknown>): Promise<void> {
    if (this.demo) {
      // Mode démo : rien ne part au serveur ; un signalement apparaît seulement dans le journal fictif
      if (report.kind === 'report') {
        const now = new Date().toISOString();
        this.demoErrors = [{ id: `demo_e${Date.now()}`, kind: 'report', message: String(report.message || 'Signalement').slice(0, 300), stack: '', page: String(report.page || ''), role: this.currentUser?.role || '', version: 'démo', count: 1, first_seen: now, last_seen: now, status: 'open' }, ...this.demoErrors];
      }
      return;
    }
    try {
      await fetch(`${API_BASE}/report-error`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(report),
      });
    } catch { /* serveur injoignable : le rapport reste dans le navigateur (bouton « Copier le rapport ») */ }
  }

  public async submitProblemReport(p: { detail: string; screenshotDataUrl?: string; page: string; device: string; version: string }): Promise<{ success: boolean; error?: string }> {
    let screenshot_url = '';
    if (p.screenshotDataUrl) screenshot_url = (await this.uploadFile(p.screenshotDataUrl)) || '';
    const r = await this.api('report-error', { method: 'POST', body: JSON.stringify({ kind: 'report', detail: p.detail, screenshot_url, page: p.page, device: p.device, version: p.version, message: 'Signalement' }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || "Envoi impossible. Réessaie plus tard." };
  }

  public async fetchErrors(status: 'open' | 'resolved' | 'all'): Promise<any[]> {
    const r = await this.api(`errors?status=${status}`);
    return r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [];
  }

  public async updateError(id: string, change: { status?: 'open' | 'resolved'; remove?: boolean }): Promise<boolean> {
    const r = await this.api('error-update', { method: 'POST', body: JSON.stringify({ id, ...change }) });
    return r.ok;
  }

  // Mot de passe oublié (sans être connecté) : la réponse est toujours la même
  public async requestPasswordReset(username: string, password: string, note?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('forgot', { method: 'POST', body: JSON.stringify({ username, password, note: note || '' }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible. Réessayez.' };
  }

  public getProfileRequests(): ProfileChangeRequest[] {
    return [...this.profileRequests];
  }

  // Booster : propose de nouvelles infos de profil (validation admin obligatoire)
  public async submitProfileRequest(p: { name: string; username: string; phone: string; avatarUrl?: string; note?: string }): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('profile-request', {
      method: 'POST',
      body: JSON.stringify({ name: p.name, username: p.username, phone: p.phone, avatar_url: p.avatarUrl || '', note: p.note || '' }),
    });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible.' };
  }

  public async decideProfileRequest(id: string, approve: boolean, reason?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('profile-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok) {
      this.profileRequests = this.profileRequests.filter(x => x.id !== id);
      this.since = '';
      await this.pull(true);
      this.emit();
    }
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  }

  // Demandes de nouveau mot de passe en attente (admin)
  // Public : un futur booster demande un compte (validation par l'admin ensuite)
  public async requestSignup(p: { name: string; username: string; password: string; phone: string; shift: string; note?: string }): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('signup', { method: 'POST', body: JSON.stringify(p) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible. Réessayez.' };
  }

  public getSignupRequests(): SignupRequest[] {
    return [...this.signups];
  }

  public async decideSignup(id: string, approve: boolean, reason?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('signup-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok || r.status === 409 || r.status === 404) {
      this.signups = this.signups.filter(x => x.id !== id);
      this.since = '';
      void this.pull(true);
      this.emit();
    }
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  }

  // Arrivées du jour (admin : tous les boosters ; booster : la sienne)
  public async fetchAttendance(day: string): Promise<AttendanceRow[]> {
    const r = await this.api(`attendance?day=${encodeURIComponent(day)}`);
    return r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [];
  }

  public getPresence(): PresenceRow[] {
    return [...this.presence];
  }

  public getMyQueue(): QueueInfo | null {
    return this.myQueue;
  }

  // Booster : « je n'ai pas de poste » (join = true) ou quitter la file (join = false)
  public async setWaiting(join: boolean): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('queue', { method: 'POST', body: JSON.stringify({ join }) });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Action impossible.' };
  }

  public getPasswordResets(): PasswordResetRequest[] {
    return [...this.resets];
  }

  public async decidePasswordReset(id: string, approve: boolean, reason?: string): Promise<boolean> {
    const r = await this.api('reset-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok) {
      this.resets = this.resets.filter(x => x.id !== id);
      this.emit();
    }
    return r.ok;
  }

  public getUsers(): User[] {
    return [...this.users];
  }

  public getPosts(): PostSession[] {
    return [...this.posts];
  }

  public static readonly MAX_CONTRACTS = 100;

  // Admin : ajoute un poste (sans nom de compte = poste « sans compte », grisé)
  public addContract(p: { client_name: string; initial_score: number; objective: number; description?: string; post_type?: string; proof_mode?: ClientContract['proof_mode']; client_price_ar?: number; client_id?: string; due_date?: string; due_time?: string; tasks?: { id: string; text: string }[]; tasks_required?: boolean; priority?: ClientContract['priority']; requireClient?: boolean }): { success: boolean; error?: string } {
    if (this.contracts.length >= DeltaForceStore.MAX_CONTRACTS) {
      return { success: false, error: `Maximum ${DeltaForceStore.MAX_CONTRACTS} missions.` };
    }
    const name = p.client_name.trim();
    // Client de la mission (module 1) : `requireClient` vient du réglage « Une mission a toujours un client » (les formulaires le passent ; sans lui, rien n'est exigé)
    let clientId: string | null = null;
    if (p.client_id !== undefined || p.requireClient) {
      const v = checkMissionClient({ required: !!p.requireClient, clientId: p.client_id, clients: this.clients });
      if (!v.ok) return { success: false, error: MISSION_CLIENT_MESSAGE[v.error].fr };
      clientId = v.client_id;
    }
    const dl = checkDeadline({ due_date: p.due_date, due_time: p.due_time, priority: p.priority });
    if (!dl.ok) return { success: false, error: DEADLINE_MESSAGE[dl.error] };
    const tk = checkTasks(p.tasks, p.tasks_required);
    if (!tk.ok) return { success: false, error: TASKS_MESSAGE[tk.error] };
    const used = new Set(this.contracts.map(c => c.post_number));
    let n = 1;
    while (used.has(n)) n++;
    const initial = Math.max(0, p.initial_score || 0);
    const objective = Math.max(0, p.objective || 0);
    this.contracts.push({
      id: (() => { let id = `contract-${Date.now()}`; for (let k = 2; this.contracts.some(c => c.id === id); k++) id = `contract-${Date.now()}-${k}`; return id; })(), // jamais deux missions avec le même identifiant, même ajoutées dans la même milliseconde
      post_number: n,
      client_name: name,
      account_tag: name ? `ACC-${n}` : '',
      game_mode: '',
      description: (p.description || '').trim(),
      post_type: p.post_type || '',
      proof_mode: p.proof_mode || 'type',
      current_rank: '—',
      target_rank: '—',
      initial_score: name ? initial : 0,
      target_score: name ? initial + objective : 0,
      recommended_shift: 'any',
      estimated_reward_ar: Math.round(this.getSettings().price_per_mission || 0),
      // Prix client propre à la mission : seulement s'il est donné (sinon prix du type, puis prix par défaut)
      ...(typeof p.client_price_ar === 'number' && isFinite(p.client_price_ar) && p.client_price_ar >= 0 ? { client_price_ar: Math.round(p.client_price_ar) } : {}),
      ...(clientId ? { client_id: clientId } : {}),
      priority: dl.priority,
      ...(dl.due_date ? { due_date: dl.due_date } : {}),
      ...(dl.due_time ? { due_time: dl.due_time } : {}),
      ...(tk.tasks.length ? { tasks: tk.tasks } : {}),
      ...(tk.required ? { tasks_required: true } : {}),
      region_server: '—',
      no_account: !name,
    });
    this.contracts.sort((a, b) => a.post_number - b.post_number);
    this.notify();
    return { success: true };
  }

  // Admin : retire un poste (refusé si une session est en cours dessus)
  public removeContract(id: string): { success: boolean; error?: string } {
    const c = this.contracts.find(x => x.id === id);
    if (!c) return { success: false, error: 'Mission introuvable.' };
    const busy = this.posts.some(
      p =>
        (p.post_number === c.post_number || (!!c.client_name && p.client_name === c.client_name)) &&
        (p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end')
    );
    if (busy) return { success: false, error: 'Cette mission a une session en cours : impossible de le retirer.' };
    this.contracts = this.contracts.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  }

  /**
   * Lie une mission à une fiche client (ou enlève le lien avec `null`). Admin seulement ; le serveur revérifie que la fiche existe.
   * L'histoire reste figée : les sessions de cette mission (trouvées par numéro de poste, sinon par titre) qui n'ont pas encore de client prennent le client d'AVANT le changement
   * (ou le nouveau client si la mission n'en avait pas). Une session déjà liée ne change jamais.
   */
  private applyContractClient(c: ClientContract, next: string | null): number {
    const old = c.client_id || null;
    if (old === next) return 0;
    const freezeId = old || next;
    let stamped = 0;
    if (freezeId) {
      const now = new Date().toISOString();
      for (const p of this.posts) {
        if (!p.client_id && matchContract(p, this.contracts) === c) { p.client_id = freezeId; p.updated_at = now; stamped++; } // mêmes sessions que celles comptées pour le client de la mission
      }
    }
    if (next) c.client_id = next; else delete c.client_id;
    return stamped;
  }

  public setContractClient(contractId: string, clientId: string | null): { success: boolean; error?: string; stamped?: number } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const c = this.contracts.find(x => x.id === contractId);
    if (!c) return { success: false, error: 'Mission introuvable.' };
    const v = checkMissionClient({ required: false, clientId, clients: this.clients, current: c.client_id || null });
    if (!v.ok) return { success: false, error: MISSION_CLIENT_MESSAGE[v.error].fr };
    const stamped = this.applyContractClient(c, v.client_id);
    this.notify();
    return { success: true, stamped };
  }

  /** Rattache d'un coup les anciennes missions qui portent ce nom (comparé sans accents ni majuscules) à un client. Une ligne confirmée = un appel. */
  public attachMissionsByName(text: string, clientId: string): { success: boolean; error?: string; linked?: number } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const v = checkMissionClient({ required: true, clientId, clients: this.clients });
    if (!v.ok) return { success: false, error: MISSION_CLIENT_MESSAGE[v.error].fr };
    const key = normalizeName(text);
    const list = key ? this.contracts.filter(c => !c.client_id && !c.no_account && normalizeName(c.client_name) === key) : [];
    if (list.length === 0) return { success: false, error: 'Aucune mission à rattacher avec ce nom.' };
    for (const c of list) this.applyContractClient(c, v.client_id);
    this.notify();
    return { success: true, linked: list.length };
  }

  public getContracts(): ClientContract[] {
    return [...this.contracts];
  }

  public getContractByPostNumber(postNumber: number): ClientContract | undefined {
    return this.contracts.find(c => c.post_number === postNumber);
  }

  // Admin exclusive: Update contract details (name, tag, scores, shift, etc.)
  public updateContract(
    contractId: string,
    updates: Partial<ClientContract>
  ): { success: boolean; error?: string; contract?: ClientContract } {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) return { success: false, error: 'Contrat introuvable' };

    // Date limite et priorité (M6.1) : revérifiées ; un champ vidé disparaît vraiment
    if ('due_date' in updates || 'due_time' in updates || 'priority' in updates) {
      if ('due_date' in updates && !updates.due_date && !('due_time' in updates)) updates = { ...updates, due_time: '' }; // sans date, plus d'heure
      const dl = checkDeadline({ due_date: 'due_date' in updates ? updates.due_date : contract.due_date, due_time: 'due_time' in updates ? updates.due_time : contract.due_time, priority: 'priority' in updates ? updates.priority : contract.priority });
      if (!dl.ok) return { success: false, error: DEADLINE_MESSAGE[dl.error] };
      updates = { ...updates, priority: dl.priority };
      delete updates.due_date; delete updates.due_time;
      if (dl.due_date) updates.due_date = dl.due_date; else delete contract.due_date;
      if (dl.due_time) updates.due_time = dl.due_time; else delete contract.due_time;
    }
    // Liste de tâches (M6.3) : revérifiée ; vider la liste retire aussi l'exigence « tout cocher »
    if ('tasks' in updates || 'tasks_required' in updates) {
      const list = 'tasks' in updates ? updates.tasks : contract.tasks;
      const tk = checkTasks(list, 'tasks_required' in updates ? updates.tasks_required : (Array.isArray(list) && list.length ? contract.tasks_required : false));
      if (!tk.ok) return { success: false, error: TASKS_MESSAGE[tk.error] };
      updates = { ...updates };
      delete updates.tasks; delete updates.tasks_required;
      if (tk.tasks.length) updates.tasks = tk.tasks; else delete contract.tasks;
      if (tk.required) updates.tasks_required = true; else delete contract.tasks_required;
    }
    const oldClientName = contract.client_name;
    Object.assign(contract, updates);

    // Si le Début dépasse l'Actuel du compte, l'Actuel suit le Début
    if (
      updates.initial_score !== undefined &&
      contract.current_score !== undefined &&
      contract.current_score < contract.initial_score
    ) {
      contract.current_score = contract.initial_score;
    }

    // If target score or initial score changed, recalculate reward estimate
    if (updates.target_score !== undefined || updates.initial_score !== undefined) {
      contract.estimated_reward_ar = Math.round(this.getSettings().price_per_mission || 0);
    }

    // Sync any active or pending post on this contract
    const relatedPosts = this.posts.filter(
      p => p.client_name === oldClientName && (p.status === 'active' || p.status === 'pending_start')
    );
    relatedPosts.forEach(post => {
      if (updates.client_name) post.client_name = updates.client_name;
      if (updates.account_tag) post.account_tag = updates.account_tag;
      if (updates.target_score) {
        post.target_score = updates.target_score;
        post.remaining_score = Math.max(0, updates.target_score - post.current_score);
      }
      if (updates.recommended_shift && updates.recommended_shift !== 'any') {
        post.shift_type = updates.recommended_shift;
      }
      post.updated_at = new Date().toISOString();
    });

    this.notify();
    return { success: true, contract };
  }

  // Admin exclusive: Update any field of any post session (debut, target, name, tag, employee, shift, status, notes)
  public updatePostAdmin(
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

  public getSecurityLogs(): SecurityViolation[] {
    return [...this.securityLogs];
  }

  public getAdvanceRequests(): SalaryAdvanceRequest[] {
    return [...this.advanceRequests];
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  // --- ANTI-CHEAT & POST WORKFLOW ---
  public getActiveOrPendingPost(employeeId: string): PostSession | undefined {
    return this.posts.find(
      p => p.employee_id === employeeId && (p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end')
    );
  }

  public startPost(params: {
    employeeId: string;
    clientName: string;
    accountTag: string;
    targetScore: number;
    initialScore: number;
    proofUrl?: string;
    proofUrls?: string[]; // 1 to 4 photos
    postNumber?: number;
    shiftType: ShiftType;
    notes?: string;
    status?: 'active' | 'pending_start';
    autoReplaceExisting?: boolean;
  }): { success: boolean; error?: string; post?: PostSession } {
    const employee = this.users.find(u => u.id === params.employeeId);
    if (!employee) {
      return { success: false, error: 'Employé introuvable' };
    }

    if (employee.status === 'blocked') {
      return { success: false, error: 'Access denied. Account is blocked.' };
    }

    // 1. Anti-Multi-Poste Check or Auto-Replace:
    const existingActive = this.getActiveOrPendingPost(params.employeeId);
    if (existingActive) {
      if (params.autoReplaceExisting) {
        // Gracefully release the previous session to allow immediate switch
        this.forceReleasePost(existingActive.id, `Remplacement par la mission ${params.clientName}`);
      } else {
        // Log security violation into "Petit Malin"
        this.logViolation({
          employee_id: employee.id,
          employee_name: employee.name,
          violation_type: 'multi_post_attempt',
          description: `Anti-Multi-Mission Block: Tentative d'ouverture de nouveau vacation sur client "${params.clientName}" alors que la mission "${existingActive.client_name}" (${existingActive.status}) est déjà en cours.`,
          details: {
            client_name: params.clientName,
            active_post_id: existingActive.id,
          }
        });

        return {
          success: false,
          error: `Anti-Multi-Mission: Vous avez déjà une mission en cours (${existingActive.client_name} - ${existingActive.status}). Vous ne pouvez pas ouvrir un second mission.`
        };
      }
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = now.toISOString().split('T')[0];

    const proofList = (params.proofUrls && params.proofUrls.length > 0)
      ? params.proofUrls
      : (params.proofUrl ? [params.proofUrl] : []);

    const newPost: PostSession = {
      id: `post-${Date.now()}`,
      employee_id: employee.id,
      employee_name: employee.name,
      client_name: params.clientName,
      account_tag: params.accountTag || `ACC-${Math.floor(1000 + Math.random() * 9000)}`,
      target_score: params.targetScore,
      initial_score: params.initialScore,
      current_score: params.initialScore,
      remaining_score: Math.max(0, params.targetScore - params.initialScore),
      status: params.status || 'pending_start',
      shift_type: params.shiftType,
      date: dateStr,
      start_time: timeStr,
      post_number: params.postNumber,
      start_proof_url: proofList[0] || '',
      start_proof_urls: proofList,
      notes: params.notes,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.posts.unshift(newPost);
    this.notify();
    return { success: true, post: newPost };
  }

  // Edit pending start post before admin validation
  public updatePendingStartPost(
    postId: string,
    newInitialScore: number,
    newProofUrl?: string,
    newProofUrls?: string[]
  ): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (post.status !== 'pending_start') {
      return { success: false, error: 'Modification impossible: la mission a déjà été validé par un administrateur.' };
    }

    post.initial_score = newInitialScore;
    post.current_score = newInitialScore;
    post.remaining_score = Math.max(0, post.target_score - newInitialScore);
    
    if (newProofUrls && newProofUrls.length > 0) {
      post.start_proof_urls = newProofUrls;
      post.start_proof_url = newProofUrls[0];
    } else if (newProofUrl) {
      post.start_proof_url = newProofUrl;
      post.start_proof_urls = [newProofUrl];
    }
    
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  // Cancel pending start post before admin validation
  public cancelPendingStartPost(postId: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (post.status !== 'pending_start') {
      return { success: false, error: 'Annulation impossible: la mission est déjà validé ou en cours.' };
    }

    this.posts = this.posts.filter(p => p.id !== postId);
    this.notify();
    return { success: true };
  }

  // Cancel the end request before admin validation: the session goes back to « en cours »
  public cancelPendingEndPost(postId: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (post.status !== 'pending_end') {
      return { success: false, error: 'Annulation impossible: la fin est déjà validée ou la session n\'est pas en attente de fin.' };
    }
    post.status = 'active';
    post.final_score = undefined;
    post.end_proof_url = '';
    post.end_proof_urls = [];
    post.end_time = undefined;
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  // Update current score during active post
  public updateCurrentScore(postId: string, newScore: number): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    post.current_score = newScore;
    post.remaining_score = Math.max(0, post.target_score - newScore);
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  // Submit End Form with mandatory score consistency check
  public submitEndPost(params: {
    postId: string;
    finalScore: number;
    endProofUrl?: string;
    endProofUrls?: string[];
    notes?: string;
  }): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === params.postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    // Liste de tâches (M6.3) : si la mission exige que tout soit coché, on n'envoie pas avant
    const ct = matchContract(post, this.contracts);
    if (ct && !canSubmitTasks(cleanTasks(ct.tasks), post.tasks_done, ct.tasks_required)) return { success: false, error: 'Coche toutes les tâches avant d\'envoyer la mission.' };

    // Built-in Score Consistency Constraint:
    if (params.finalScore < post.initial_score) {
      // Log security violation in Petit Malin
      this.logViolation({
        employee_id: post.employee_id,
        employee_name: post.employee_name,
        violation_type: 'score_inversion',
        description: `Volume Consistency Failure: Le volume final soumis (${params.finalScore.toLocaleString()}) est inférieur au volume initial vérifié (${post.initial_score.toLocaleString()}) pour le client ${post.client_name}.`,
        details: {
          initial_score: post.initial_score,
          attempted_score: params.finalScore,
          client_name: post.client_name,
          active_post_id: post.id
        }
      });

      return {
        success: false,
        error: 'Final volume cannot be lower than initial volume.'
      };
    }

    const now = new Date();
    const endProofList = (params.endProofUrls && params.endProofUrls.length > 0)
      ? params.endProofUrls
      : (params.endProofUrl ? [params.endProofUrl] : []);

    post.final_score = params.finalScore;
    post.current_score = params.finalScore;
    post.remaining_score = Math.max(0, post.target_score - params.finalScore);
    post.end_proof_url = endProofList[0] || params.endProofUrl || '';
    post.end_proof_urls = endProofList;
    post.end_time = now.toTimeString().split(' ')[0];
    post.status = 'pending_end';
    if (params.notes) {
      post.notes = post.notes ? `${post.notes} | ${params.notes}` : params.notes;
    }
    post.updated_at = now.toISOString();

    this.notify();
    return { success: true };
  }

  /** Coche ou décoche une tâche sur une session ouverte. L'opérateur : seulement la sienne. Rend les cases cochées. */
  public toggleSessionTask(postId: string, taskId: string): { success: boolean; error?: string; done?: string[] } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    const me = this.currentUser;
    if (!me) return { success: false, error: 'Connexion requise.' };
    if (me.role !== 'admin' && post.employee_id !== me.id) return { success: false, error: 'Ce n\'est pas ta mission.' };
    if (post.status !== 'active' && post.status !== 'pending_start') return { success: false, error: 'La mission n\'est plus ouverte.' };
    const ct = matchContract(post, this.contracts);
    const tasks = cleanTasks(ct?.tasks);
    if (!tasks.some(t => t.id === taskId)) return { success: false, error: 'Tâche introuvable.' };
    post.tasks_done = toggleTask(tasks, post.tasks_done, taskId);
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true, done: cleanDone(post.tasks_done, tasks) };
  }

  // --- ADMIN ACTIONS ---
  public validatePost(postId: string, note?: string): { success: boolean; error?: string; payrollAr?: number } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (note && note.trim()) post.admin_notes = note.trim();

    const employee = this.users.find(u => u.id === post.employee_id);

    if (post.status === 'pending_start') {
      post.status = 'active';
      post.updated_at = new Date().toISOString();
      this.notify();
      return { success: true };
    }

    if (post.status === 'pending_end') {
      const finalScore = post.final_score ?? post.current_score;
      const scoreGained = Math.max(0, finalScore - post.initial_score);
      // Paie à tarif fixe : chaque mission validée rapporte le même montant (Réglages → Missions)
      const calculatedAr = Math.max(0, Math.round(this.getSettings().price_per_mission || 0));

      post.status = 'completed';
      post.calculated_ar = calculatedAr;

      // L'Actuel du compte devient le score final (vu par l'employé suivant)
      const linkedContract =
        this.contracts.find(c => c.post_number === post.post_number) ||
        this.contracts.find(c => c.client_name === post.client_name);
      if (linkedContract) linkedContract.current_score = finalScore;
      // Prix client figé à la validation (comme la paie) : changer les prix ensuite ne modifie pas cette mission
      post.client_price_ar = clientPriceForContract(linkedContract, this.getSettings());
      post.updated_at = new Date().toISOString();

      if (employee) {
        employee.total_score_boosted = (employee.total_score_boosted || 0) + scoreGained;
        employee.total_earnings_ar = (employee.total_earnings_ar || 0) + calculatedAr;
      }

      this.notify();
      return { success: true, payrollAr: calculatedAr };
    }

    return { success: false, error: 'Statut de la mission non éligible pour validation' };
  }

  public rejectPost(postId: string, reason: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (!reason.trim()) return { success: false, error: 'Un motif de rejet est obligatoire' };

    post.status = 'rejected';
    post.rejection_reason = reason.trim();
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  // Emergency Force Release Post to unstick bugged shifts
  public forceReleasePost(postId: string, reason = 'Force release by administrator'): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    post.status = 'force_released';
    post.notes = post.notes ? `${post.notes} [FORCE RELEASED: ${reason}]` : `[FORCE RELEASED: ${reason}]`;
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  // --- USER PROFILE & SECURITY CONTROLS ---
  // Admin : accès d'un booster selon son shift (auto / toute heure / bloqué)
  public setAccessMode(userId: string, mode: 'auto' | 'allow' | 'block'): { success: boolean } {
    const user = this.users.find(u => u.id === userId);
    if (!user || user.role !== 'employee') return { success: false };
    if (mode === 'auto') delete user.access_mode;
    else user.access_mode = mode;
    this.notify();
    return { success: true };
  }

  public toggleUserBlock(userId: string): { success: boolean; newStatus: 'active' | 'blocked' } {
    const user = this.users.find(u => u.id === userId);
    if (!user) return { success: false, newStatus: 'active' };

    user.status = user.status === 'blocked' ? 'active' : 'blocked';
    if (user.status === 'blocked') {
      user.is_online = false;
    }
    
    // Update matching security logs if unblocking
    if (user.status === 'active') {
      this.securityLogs.forEach(log => {
        if (log.employee_id === userId) {
          log.resolved = true;
        }
      });
    }

    this.notify();
    return { success: true, newStatus: user.status };
  }

  public deleteUser(userId: string): { success: boolean; error?: string } {
    const user = this.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'Utilisateur introuvable' };
    if (user.role === 'admin') return { success: false, error: 'Impossible de supprimer un compte administrateur.' };

    this.users = this.users.filter(u => u.id !== userId);
    // Ses données disparaissent aussi à l'écran tout de suite ; le serveur efface le reste (fichiers, publications…)
    this.posts = this.posts.filter(p => p.employee_id !== userId);
    this.advanceRequests = this.advanceRequests.filter(a => a.employee_id !== userId);
    this.securityLogs = this.securityLogs.filter(v => v.employee_id !== userId);
    const ownedGroups = new Set(this.groups.filter(g => g.owner_id === userId).map(g => g.id));
    this.groups = this.groups.filter(g => g.owner_id !== userId);
    this.messages = this.messages.filter(m => m.sender_id !== userId && m.recipient_id !== userId && !(m.recipient_id && ownedGroups.has(m.recipient_id)));
    this.notify();
    return { success: true };
  }

  public updateUser(userId: string, data: Partial<User>): { success: boolean } {
    const user = this.users.find(u => u.id === userId);
    if (!user) return { success: false };

    Object.assign(user, data);
    this.notify();
    return { success: true };
  }

  public async addUser(
    userData: Omit<User, 'id' | 'is_online' | 'total_score_boosted' | 'total_earnings_ar' | 'pending_advance_ar'>,
    password: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const r = await this.api('create-user', { method: 'POST', body: JSON.stringify({ user: userData, password }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Création impossible.' };
    const u = r.data.user as User;
    this.users.push(u);
    this.synced.users.set(u.id, JSON.stringify(u));
    this.emit();
    return { success: true, user: u };
  }

  // --- SECURITY LOGS ("Petit Malin") ---
  public logViolation(data: Omit<SecurityViolation, 'id' | 'timestamp' | 'resolved'>): void {
    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    const newLog: SecurityViolation = {
      ...data,
      id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: timeStr,
      resolved: false,
    };
    this.securityLogs.unshift(newLog);
    this.notify();
  }

  public dismissViolation(id: string): void {
    const log = this.securityLogs.find(l => l.id === id);
    if (log) {
      log.resolved = true;
      this.notify();
    }
  }

  // --- SALARY ADVANCE (DMD d'avance) ---
  public submitAdvanceRequest(params: {
    employeeId: string;
    amountAr: number;
    reason: string;
  }): { success: boolean; error?: string } {
    const employee = this.users.find(u => u.id === params.employeeId);
    if (!employee) return { success: false, error: 'Employé introuvable' };

    const newReq: SalaryAdvanceRequest = {
      id: `adv-${Date.now()}`,
      employee_id: employee.id,
      employee_name: employee.name,
      amount_ar: params.amountAr,
      reason: params.reason,
      request_date: new Date().toISOString().split('T')[0],
      status: 'pending',
    };

    this.advanceRequests.unshift(newReq);
    employee.pending_advance_ar = (employee.pending_advance_ar || 0) + params.amountAr;
    this.notify();
    return { success: true };
  }

  public reviewAdvanceRequest(id: string, approve: boolean, notes?: string): { success: boolean } {
    const req = this.advanceRequests.find(r => r.id === id);
    if (!req) return { success: false };

    const employee = this.users.find(u => u.id === req.employee_id);
    req.status = approve ? 'approved' : 'rejected';
    req.admin_notes = notes;

    if (employee && !approve) {
      employee.pending_advance_ar = Math.max(0, (employee.pending_advance_ar || 0) - req.amount_ar);
    }

    this.notify();
    return { success: true };
  }

  // --- MESSAGES ---
  public sendMessage(params: {
    senderId: string;
    message: string;
    recipientId?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentKind?: 'image' | 'file';
    replyTo?: ChatMessage; // message cité
  }): { success: boolean } {
    const sender = this.users.find(u => u.id === params.senderId);
    if (!sender || (!params.message.trim() && !params.attachmentUrl)) return { success: false };

    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    const q = params.replyTo;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender_id: sender.id,
      sender_name: sender.name,
      sender_role: sender.role,
      recipient_id: params.recipientId || 'all',
      message: params.message.trim(),
      timestamp: timeStr,
      sent_ms: now.getTime(),
      ...(q && !q.deleted_at
        ? { reply_to: { id: q.id, sender_name: q.sender_name, text: (q.message || '').slice(0, 140), has_attachment: !!q.attachment_url } }
        : {}),
      ...(params.attachmentUrl
        ? { attachment_url: params.attachmentUrl, attachment_name: params.attachmentName || 'fichier', attachment_kind: params.attachmentKind || 'file' }
        : {}),
    };

    this.messages.push(newMsg);
    this.notify();
    return { success: true };
  }

  // Comme WhatsApp : on modifie et on épingle SEULEMENT ses propres messages (même l'admin)
  private isOwnMessage(msg: ChatMessage, userId: string): boolean {
    return msg.sender_id === userId && !msg.deleted_at;
  }
  // Supprimer pour tous : l'auteur, ou l'admin (modération)
  public canDeleteForAll(msg: ChatMessage, userId: string): boolean {
    const u = this.users.find(x => x.id === userId);
    return !!u && !msg.deleted_at && (msg.sender_id === userId || u.role === 'admin');
  }
  public static EDIT_WINDOW_MS = 15 * 60 * 1000;
  public canEditMessage(msg: ChatMessage, userId: string): boolean {
    if (!this.isOwnMessage(msg, userId)) return false;
    if (!msg.message && msg.attachment_url && msg.attachment_kind) return !!msg.message; // une photo sans texte : rien à modifier
    return !msg.sent_ms || Date.now() - msg.sent_ms <= DeltaForceStore.EDIT_WINDOW_MS;
  }

  // Réaction emoji sur un message : une seule par personne ; le même emoji une 2e fois la retire
  public reactMessage(id: string, userId: string, emoji: string) {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || msg.deleted_at) return;
    const had = (msg.reactions?.[emoji] || []).includes(userId);
    const next: Record<string, string[]> = {};
    for (const [e, list] of Object.entries(msg.reactions || {})) {
      const rest = list.filter(x => x !== userId);
      if (rest.length) next[e] = rest;
    }
    if (!had) next[emoji] = [...(next[emoji] || []), userId];
    if (Object.keys(next).length) msg.reactions = next; else delete msg.reactions;
    this.notify();
  }

  // « est en train d'écrire… » : un signe au plus toutes les 2,5 s ; la liste est lue par la messagerie ouverte
  private typingSentAt = 0;
  public pingTyping(to: string) {
    if (!this.token) return;
    const now = Date.now();
    if (now - this.typingSentAt < 2500) return;
    this.typingSentAt = now;
    void this.apiRaw('typing', { method: 'POST', body: JSON.stringify({ to }) }); // sans barre de chargement
  }
  // --- Sauvegardes de nuit (admin) ---
  public async listBackups(): Promise<{ ok: boolean; error?: string; rows: { id: number; taken_at: string; tables: number; bytes: number }[] }> {
    const r = await this.api('backups');
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.', rows: [] };
    return { ok: true, rows: Array.isArray(r.data?.rows) ? r.data.rows : [] };
  }
  // --- Journal d'audit (M7.2, admin) : lecture seule ; le serveur écrit les lignes ---
  public async listAudit(): Promise<{ ok: boolean; error?: string; rows: AuditEntry[] }> {
    const r = await this.api('audit-list?limit=1000');
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.', rows: [] };
    return { ok: true, rows: cleanAuditRows(r.data?.rows) };
  }
  public async getBackup(id: number): Promise<{ ok: boolean; error?: string; backup?: { id: number; taken_at: string; data: unknown } }> {
    const r = await this.api(`backup-get?id=${encodeURIComponent(String(id))}`);
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.' };
    return { ok: true, backup: r.data?.backup };
  }
  // --- Notifications push (M6.4) : le mode démo n'en a pas (rien ne part sur internet) ---
  public async pushKey(): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-key');
    return r.ok && typeof r.data?.key === 'string' ? { ok: true, key: r.data.key } : { ok: false, error: r.data?.error || 'Notifications indisponibles.' };
  }
  public async pushSubscribe(subscription: unknown): Promise<{ ok: boolean; error?: string }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Erreur.' };
  }
  public async pushUnsubscribe(endpoint: string): Promise<void> {
    if (this.demo) return;
    await this.api('push-unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
  }
  public async pushTest(): Promise<{ ok: boolean; sent: number; error?: string }> {
    if (this.demo) return { ok: false, sent: 0, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-test', { method: 'POST', body: '{}' });
    return r.ok ? { ok: true, sent: Number(r.data?.sent) || 0 } : { ok: false, sent: 0, error: r.data?.error || 'Erreur.' };
  }

  public async backupNow(): Promise<{ ok: boolean; error?: string }> {
    const r = await this.api('backup-now', { method: 'POST', body: '{}' });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Erreur.' };
  }

  public async fetchTyping(): Promise<{ user_id: string; to: string }[]> {
    if (!this.token) return [];
    const r = await this.apiRaw('typing');
    return r.ok && Array.isArray(r.data?.typing) ? r.data.typing : [];
  }

  public editMessage(id: string, userId: string, text: string): { success: boolean; error?: string } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.isOwnMessage(msg, userId)) return { success: false, error: 'Tu peux modifier seulement tes propres messages.' };
    if (!this.canEditMessage(msg, userId)) return { success: false, error: 'Tu peux modifier un message pendant 15 minutes après son envoi.' };
    const clean = text.trim();
    if (!clean && !msg.attachment_url) return { success: false, error: 'Le message ne peut pas être vide.' };
    if (clean === msg.message) return { success: true };
    const now = new Date();
    msg.message = clean;
    msg.edited_at = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    this.notify();
    return { success: true };
  }

  public togglePinMessage(id: string, userId: string): { success: boolean } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.isOwnMessage(msg, userId)) return { success: false };
    if (msg.pinned) {
      msg.pinned = false;
      delete msg.pinned_at;
    } else {
      const now = new Date();
      msg.pinned = true;
      msg.pinned_at = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    }
    this.notify();
    return { success: true };
  }

  // Supprimer pour tous : une trace « message supprimé » reste dans la conversation
  public deleteMessage(id: string, userId: string): { success: boolean } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.canDeleteForAll(msg, userId)) return { success: false };
    msg.deleted_at = new Date().toISOString();
    msg.deleted_by = msg.sender_id === userId ? 'sender' : 'admin';
    msg.message = '';
    delete msg.attachment_url; delete msg.attachment_name; delete msg.attachment_kind;
    delete msg.pinned; delete msg.pinned_at; delete msg.reply_to; delete msg.edited_at;
    this.notify();
    return { success: true };
  }

  // --- Groupes de discussion ---
  public getGroups(): ChatGroup[] { return [...this.groups]; }
  public getChatReads(): ChatRead[] { return [...this.reads]; }

  public createGroup(ownerId: string, name: string, memberIds: string[]): { success: boolean; id?: string; error?: string } {
    const clean = name.trim();
    if (clean.length < 1 || clean.length > 40) return { success: false, error: 'Le nom du groupe doit avoir 1 à 40 caractères.' };
    const members = [...new Set([ownerId, ...memberIds])];
    if (members.length < 2) return { success: false, error: 'Choisis au moins un autre membre.' };
    const id = `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.groups.push({ id, name: clean, owner_id: ownerId, members, created_at: new Date().toISOString() });
    this.notify();
    return { success: true, id };
  }
  public updateGroup(id: string, userId: string, patch: { name?: string; members?: string[]; avatar_url?: string; description?: string; admins?: string[] }): { success: boolean; error?: string } {
    const g = this.groups.find(x => x.id === id);
    const u = this.users.find(x => x.id === userId);
    const isOwner = !!g && !!u && (g.owner_id === userId || u.role === 'admin');
    const isGroupAdmin = !!g && (g.admins || []).includes(userId);
    if (!g || !u || (!isOwner && !isGroupAdmin)) return { success: false, error: 'Seul un administrateur du groupe peut le modifier.' };
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (clean.length < 1 || clean.length > 40) return { success: false, error: 'Le nom du groupe doit avoir 1 à 40 caractères.' };
      g.name = clean;
    }
    if (patch.members) {
      const members = [...new Set(patch.members)];
      if (members.length < 1) return { success: false, error: 'Un groupe doit garder au moins un membre.' };
      if (!isOwner && ![g.owner_id, ...(g.admins || [])].filter(x => x !== userId).every(x => members.includes(x))) {
        return { success: false, error: 'Tu ne peux pas retirer le responsable ni un autre administrateur.' };
      }
      g.members = members;
      if (!members.includes(g.owner_id)) g.owner_id = members[0];
      if (g.admins) g.admins = g.admins.filter(x => members.includes(x));
    }
    if (patch.avatar_url !== undefined) g.avatar_url = patch.avatar_url || undefined;
    if (patch.description !== undefined) g.description = patch.description.trim().slice(0, 200) || undefined;
    if (patch.admins && isOwner) g.admins = [...new Set(patch.admins)].filter(x => g.members.includes(x) && x !== g.owner_id);
    this.notify();
    return { success: true };
  }
  public leaveGroup(id: string, userId: string): { success: boolean } {
    const g = this.groups.find(x => x.id === id);
    if (!g || !g.members.includes(userId)) return { success: false };
    const rest = g.members.filter(m => m !== userId);
    if (rest.length === 0) return this.deleteGroup(id, userId);
    g.members = rest;
    if (g.admins) g.admins = g.admins.filter(x => x !== userId);
    if (g.owner_id === userId) g.owner_id = rest[0];
    this.notify();
    return { success: true };
  }
  public deleteGroup(id: string, userId: string): { success: boolean } {
    const g = this.groups.find(x => x.id === id);
    const u = this.users.find(x => x.id === userId);
    if (!g || !u || (g.owner_id !== userId && u.role !== 'admin')) return { success: false };
    this.groups = this.groups.filter(x => x.id !== id);
    this.messages = this.messages.filter(m => m.recipient_id !== id);
    this.notify();
    return { success: true };
  }

  // « Lu » : on dit au serveur jusqu'où on a lu la conversation (discret, sans barre de chargement)
  private lastReadSent = new Map<string, number>();
  public markThreadRead(thread: string, ms: number): void {
    if (!this.token || !ms || (this.lastReadSent.get(thread) || 0) >= ms) return;
    this.lastReadSent.set(thread, ms);
    void this.apiRaw('chat-read', { method: 'POST', body: JSON.stringify({ thread, ms }) }).catch(() => {
      this.lastReadSent.delete(thread);
    });
  }

  // --- RESET / EXPORT SQL & JSON BACKUP ---
  public resetToFactoryDefaults(): void {
    // Ne supprime rien : recharge simplement l'état officiel depuis le serveur
    this.since = '';
    void this.pull(true);
  }

  public exportDatabaseSql(): string {
    const sqlStatements = [
      '-- GESTION PRO',
      '-- STANDALONE PORTABLE SQLITE / MYSQL SCHEMA & DUMP',
      '-- Generated: ' + new Date().toISOString(),
      '',
      'CREATE TABLE IF NOT EXISTS users (',
      '    id VARCHAR(50) PRIMARY KEY,',
      '    username VARCHAR(50) NOT NULL UNIQUE,',
      '    name VARCHAR(100) NOT NULL,',
      '    role VARCHAR(20) NOT NULL DEFAULT "employee",',
      '    status VARCHAR(20) NOT NULL DEFAULT "active",',
      '    vacation VARCHAR(20) NOT NULL DEFAULT "day",',
      '    is_online INTEGER NOT NULL DEFAULT 0,',
      '    phone VARCHAR(30),',
      '    performance_badge VARCHAR(50) DEFAULT "Standard",',
      '    total_score_boosted BIGINT DEFAULT 0,',
      '    total_earnings_ar BIGINT DEFAULT 0,',
      '    pending_advance_ar BIGINT DEFAULT 0',
      ');',
      '',
      'CREATE TABLE IF NOT EXISTS posts (',
      '    id VARCHAR(50) PRIMARY KEY,',
      '    employee_id VARCHAR(50) NOT NULL,',
      '    client_name VARCHAR(100) NOT NULL,',
      '    account_tag VARCHAR(100),',
      '    target_score BIGINT NOT NULL,',
      '    initial_score BIGINT NOT NULL,',
      '    current_score BIGINT NOT NULL,',
      '    final_score BIGINT,',
      '    remaining_score BIGINT NOT NULL,',
      '    status VARCHAR(30) NOT NULL,',
      '    shift_type VARCHAR(20) NOT NULL,',
      '    date DATE NOT NULL,',
      '    start_time TIME NOT NULL,',
      '    end_time TIME,',
      '    start_proof_url TEXT,',
      '    end_proof_url TEXT,',
      '    calculated_ar BIGINT DEFAULT 0,',
      '    notes TEXT,',
      '    created_at DATETIME NOT NULL',
      ');',
      '',
      'CREATE TABLE IF NOT EXISTS security_violations (',
      '    id VARCHAR(50) PRIMARY KEY,',
      '    employee_id VARCHAR(50) NOT NULL,',
      '    violation_type VARCHAR(50) NOT NULL,',
      '    description TEXT NOT NULL,',
      '    timestamp DATETIME NOT NULL,',
      '    resolved INTEGER DEFAULT 0',
      ');',
      '',
      'CREATE TABLE IF NOT EXISTS salary_advances (',
      '    id VARCHAR(50) PRIMARY KEY,',
      '    employee_id VARCHAR(50) NOT NULL,',
      '    amount_ar BIGINT NOT NULL,',
      '    reason TEXT NOT NULL,',
      '    request_date DATE NOT NULL,',
      '    status VARCHAR(20) DEFAULT "pending"',
      ');',
      '',
      '-- INSERT INITIAL USERS'
    ];

    this.users.forEach(u => {
      sqlStatements.push(
        `INSERT INTO users VALUES ('${u.id}', '${u.username}', '${u.name.replace(/'/g, "''")}', '${u.role}', '${u.status}', '${u.shift}', ${u.is_online ? 1 : 0}, '${u.phone}', '${u.performance_badge}', ${u.total_score_boosted}, ${u.total_earnings_ar}, ${u.pending_advance_ar});`
      );
    });

    sqlStatements.push('', '-- INSERT POST SESSIONS');
    this.posts.forEach(p => {
      sqlStatements.push(
        `INSERT INTO posts VALUES ('${p.id}', '${p.employee_id}', '${p.client_name.replace(/'/g, "''")}', '${p.account_tag}', ${p.target_score}, ${p.initial_score}, ${p.current_score}, ${p.final_score ?? 'NULL'}, ${p.remaining_score}, '${p.status}', '${p.shift_type}', '${p.date}', '${p.start_time}', ${p.end_time ? `'${p.end_time}'` : 'NULL'}, '[PROOF_BLOB]', '[PROOF_BLOB]', ${p.calculated_ar || 0}, '${(p.notes || '').replace(/'/g, "''")}', '${p.created_at}');`
      );
    });

    return sqlStatements.join('\n');
  }

  public exportDatabaseJson(): string {
    return JSON.stringify(
      {
        meta: {
          app: 'Gestion Pro Gestion Management System',
          version: '1.0.0',
          exported_at: new Date().toISOString(),
        },
        users: this.users,
        posts: this.posts,
        security_logs: this.securityLogs,
        salary_advances: this.advanceRequests,
        messages: this.messages,
      },
      null,
      2
    );
  }
}

export const db = new DeltaForceStore();
