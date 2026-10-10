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
} from '../types';
import { AVAILABLE_CLIENT_CONTRACTS } from './initialData';

const TOKEN_KEY = 'df_session_token_v2';
// Adresse du projet Supabase : réglage Vercel `VITE_SUPABASE_URL` (pour une copie du site), sinon le projet actuel
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://ljorjzrxkxqacmmkmqdx.supabase.co').replace(/\/+$/, '');
const API_BASE = `${SUPABASE_URL}/functions/v1/df-api`;
const RESTORE_BASE = `${SUPABASE_URL}/functions/v1/df-restore`;
const COLS = ['users', 'posts', 'contracts', 'securityLogs', 'advances', 'messages', 'groups', 'settings'] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'general',
  price_per_million: 1000,
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
  post_types: ['NO R/C', 'YES R/C', 'RED 9CASE'],
};
type Col = (typeof COLS)[number];

const SORTERS: Partial<Record<Col, (a: any, b: any) => number>> = {
  users: (a, b) => (a.role === b.role ? String(a.id).localeCompare(String(b.id)) : a.role === 'admin' ? -1 : 1),
  posts: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
  contracts: (a, b) => (a.post_number || 0) - (b.post_number || 0),
  securityLogs: (a, b) => String(b.id).localeCompare(String(a.id)),
  advances: (a, b) => String(b.id).localeCompare(String(a.id)),
  groups: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)),
  messages: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || String(a.id).localeCompare(String(b.id)),
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
  private resets: PasswordResetRequest[] = [];
  private signups: SignupRequest[] = [];
  private profileRequests: ProfileChangeRequest[] = [];
  private presence: PresenceRow[] = []; // admin : tous les boosters
  private myQueue: QueueInfo | null = null; // booster : sa place dans la file « sans poste »
  private currentUser: User | null = null;
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
  private pollTimer: ReturnType<typeof setInterval> | null = null;
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
      securityLogs: new Map(), advances: new Map(), messages: new Map(), groups: new Map(), settings: new Map(),
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
  public setFastPoll(on: boolean) {
    const ms = on ? 8000 : 20000;
    if (ms === this.pollMs) return;
    this.pollMs = ms;
    if (this.token && this.pollTimer) this.startPolling();
    if (on && this.token) void this.pull();
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void this.pull();
    }, this.pollMs);
    // Retour sur l'onglet (ou l'appli) : on recharge tout de suite, sans attendre 5 s
    if (typeof document !== 'undefined') {
      this.onVisible = () => { if (!document.hidden) void this.pull(); };
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.onVisible && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    this.onVisible = null;
  }

  // Récupère les changements du serveur. Retourne true si la session est valide.
  private pulling = false;
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

  public logout(): void {
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
  public restoreStatus() { return this.restoreCall('restore-status'); }
  public restoreSetEmail(email: string) { return this.restoreCall('restore-email', { email }); }
  public restoreVerifyEmail(code: string) { return this.restoreCall('restore-email-verify', { code }); }
  public restoreSendCode() { return this.restoreCall('restore-send-code'); }
  public restoreExecute(code: string) { return this.restoreCall('restore-execute', { code, confirm: 'RESTAURER' }); }

  // --- Journal des erreurs et signalements ---
  public async sendErrorReport(report: Record<string, unknown>): Promise<void> {
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
  public addContract(p: { client_name: string; initial_score: number; objective: number; description?: string; post_type?: string }): { success: boolean; error?: string } {
    if (this.contracts.length >= DeltaForceStore.MAX_CONTRACTS) {
      return { success: false, error: `Maximum ${DeltaForceStore.MAX_CONTRACTS} postes.` };
    }
    const name = p.client_name.trim();
    const used = new Set(this.contracts.map(c => c.post_number));
    let n = 1;
    while (used.has(n)) n++;
    const initial = Math.max(0, p.initial_score || 0);
    const objective = Math.max(0, p.objective || 0);
    if (name && objective <= 0) return { success: false, error: "L'objectif doit être supérieur à 0." };
    this.contracts.push({
      id: `contract-${Date.now()}`,
      post_number: n,
      client_name: name,
      account_tag: name ? `ACC-${n}` : '',
      game_mode: '',
      description: (p.description || '').trim(),
      post_type: p.post_type || '',
      current_rank: '—',
      target_rank: '—',
      initial_score: name ? initial : 0,
      target_score: name ? initial + objective : 0,
      recommended_shift: 'any',
      estimated_reward_ar: Math.round(objective / 1000),
      priority: 'Normale',
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
    if (!c) return { success: false, error: 'Poste introuvable.' };
    const busy = this.posts.some(
      p =>
        (p.post_number === c.post_number || (!!c.client_name && p.client_name === c.client_name)) &&
        (p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end')
    );
    if (busy) return { success: false, error: 'Ce poste a une session en cours : impossible de le retirer.' };
    this.contracts = this.contracts.filter(x => x.id !== id);
    this.notify();
    return { success: true };
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
      const diff = Math.max(0, contract.target_score - contract.initial_score);
      contract.estimated_reward_ar = Math.round((diff / 1000000) * this.getSettings().price_per_million);
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
    if (!post) return { success: false, error: 'Poste introuvable' };

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
        this.forceReleasePost(existingActive.id, `Remplacement par le poste ${params.clientName}`);
      } else {
        // Log security violation into "Petit Malin"
        this.logViolation({
          employee_id: employee.id,
          employee_name: employee.name,
          violation_type: 'multi_post_attempt',
          description: `Anti-Multi-Poste Block: Tentative d'ouverture de nouveau shift sur client "${params.clientName}" alors que le poste "${existingActive.client_name}" (${existingActive.status}) est déjà en cours.`,
          details: {
            client_name: params.clientName,
            active_post_id: existingActive.id,
          }
        });

        return {
          success: false,
          error: `Anti-Multi-Poste: Vous avez déjà un poste en cours (${existingActive.client_name} - ${existingActive.status}). Vous ne pouvez pas ouvrir un second poste.`
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
    if (!post) return { success: false, error: 'Poste introuvable' };
    if (post.status !== 'pending_start') {
      return { success: false, error: 'Modification impossible: le poste a déjà été validé par un administrateur.' };
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
    if (!post) return { success: false, error: 'Poste introuvable' };
    if (post.status !== 'pending_start') {
      return { success: false, error: 'Annulation impossible: le poste est déjà validé ou en cours.' };
    }

    this.posts = this.posts.filter(p => p.id !== postId);
    this.notify();
    return { success: true };
  }

  // Cancel the end request before admin validation: the session goes back to « en cours »
  public cancelPendingEndPost(postId: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Poste introuvable' };
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
    if (!post) return { success: false, error: 'Poste introuvable' };

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
    if (!post) return { success: false, error: 'Poste introuvable' };

    // Built-in Score Consistency Constraint:
    if (params.finalScore < post.initial_score) {
      // Log security violation in Petit Malin
      this.logViolation({
        employee_id: post.employee_id,
        employee_name: post.employee_name,
        violation_type: 'score_inversion',
        description: `Score Consistency Failure: Le score final soumis (${params.finalScore.toLocaleString()}) est inférieur au score initial vérifié (${post.initial_score.toLocaleString()}) pour le client ${post.client_name}.`,
        details: {
          initial_score: post.initial_score,
          attempted_score: params.finalScore,
          client_name: post.client_name,
          active_post_id: post.id
        }
      });

      return {
        success: false,
        error: 'Final score cannot be lower than initial score.'
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

  // --- ADMIN ACTIONS ---
  public validatePost(postId: string, note?: string): { success: boolean; error?: string; payrollAr?: number } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Poste introuvable' };
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
      // Automated payroll formula: 1M score = 1,000 Ar
      const calculatedAr = Math.round((scoreGained / 1000000) * this.getSettings().price_per_million);

      post.status = 'completed';
      post.calculated_ar = calculatedAr;

      // L'Actuel du compte devient le score final (vu par l'employé suivant)
      const linkedContract =
        this.contracts.find(c => c.post_number === post.post_number) ||
        this.contracts.find(c => c.client_name === post.client_name);
      if (linkedContract) linkedContract.current_score = finalScore;
      post.updated_at = new Date().toISOString();

      if (employee) {
        employee.total_score_boosted = (employee.total_score_boosted || 0) + scoreGained;
        employee.total_earnings_ar = (employee.total_earnings_ar || 0) + calculatedAr;
      }

      this.notify();
      return { success: true, payrollAr: calculatedAr };
    }

    return { success: false, error: 'Statut du poste non éligible pour validation' };
  }

  public rejectPost(postId: string, reason: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Poste introuvable' };
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
    if (!post) return { success: false, error: 'Poste introuvable' };

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
  public updateGroup(id: string, userId: string, patch: { name?: string; members?: string[] }): { success: boolean; error?: string } {
    const g = this.groups.find(x => x.id === id);
    const u = this.users.find(x => x.id === userId);
    if (!g || !u || (g.owner_id !== userId && u.role !== 'admin')) return { success: false, error: 'Seul le responsable du groupe peut le modifier.' };
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (clean.length < 1 || clean.length > 40) return { success: false, error: 'Le nom du groupe doit avoir 1 à 40 caractères.' };
      g.name = clean;
    }
    if (patch.members) {
      const members = [...new Set(patch.members)];
      if (members.length < 1) return { success: false, error: 'Un groupe doit garder au moins un membre.' };
      g.members = members;
      if (!members.includes(g.owner_id)) g.owner_id = members[0];
    }
    this.notify();
    return { success: true };
  }
  public leaveGroup(id: string, userId: string): { success: boolean } {
    const g = this.groups.find(x => x.id === id);
    if (!g || !g.members.includes(userId)) return { success: false };
    const rest = g.members.filter(m => m !== userId);
    if (rest.length === 0) return this.deleteGroup(id, userId);
    g.members = rest;
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
      '-- DELTA FORCE BOOSTING MANAGEMENT SYSTEM',
      '-- STANDALONE PORTABLE SQLITE / MYSQL SCHEMA & DUMP',
      '-- Generated: ' + new Date().toISOString(),
      '',
      'CREATE TABLE IF NOT EXISTS users (',
      '    id VARCHAR(50) PRIMARY KEY,',
      '    username VARCHAR(50) NOT NULL UNIQUE,',
      '    name VARCHAR(100) NOT NULL,',
      '    role VARCHAR(20) NOT NULL DEFAULT "employee",',
      '    status VARCHAR(20) NOT NULL DEFAULT "active",',
      '    shift VARCHAR(20) NOT NULL DEFAULT "day",',
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
          app: 'Delta Force Boosting Management System',
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
