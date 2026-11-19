// Magasin de données : Comptes, inscriptions, accès, avances de salaire, alertes.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { User, SecurityViolation, SalaryAdvanceRequest, PasswordResetRequest, AccessRequest, AccessRequestState, SignupRequest, ProfileChangeRequest, PresenceRow, AttendanceRow, QueueInfo } from '../../types';
import { entryOnlyRecord } from '../../utils/entryOnly';
import { cleanShiftMode } from '../../utils/shiftMode';

export const accountsMethods = defineMethods({

  async setPassword(userId: string, password: string, currentPassword?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('set-password', { method: 'POST', body: JSON.stringify({ userId, password, currentPassword }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  },

  // Mot de passe oublié (sans être connecté) : la réponse est toujours la même
  async requestPasswordReset(username: string, password: string, note?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('forgot', { method: 'POST', body: JSON.stringify({ username, password, note: note || '' }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible. Réessayez.' };
  },

  getProfileRequests(): ProfileChangeRequest[] {
    return [...this.profileRequests];
  },

  // Opérateur : propose de nouvelles infos de profil (validation admin obligatoire)
  async submitProfileRequest(p: { name: string; username: string; phone: string; avatarUrl?: string; note?: string }): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('profile-request', {
      method: 'POST',
      body: JSON.stringify({ name: p.name, username: p.username, phone: p.phone, avatar_url: p.avatarUrl || '', note: p.note || '' }),
    });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible.' };
  },

  async decideProfileRequest(id: string, approve: boolean, reason?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('profile-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok) {
      this.profileRequests = this.profileRequests.filter(x => x.id !== id);
      this.since = '';
      await this.pull(true);
      this.emit();
    }
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  },

  // Demandes de nouveau mot de passe en attente (admin)
  // Public : un futur opérateur demande un compte (validation par l'admin ensuite)
  async requestSignup(p: { name: string; username: string; password: string; phone: string; shift: string; note?: string }): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('signup', { method: 'POST', body: JSON.stringify(p) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Envoi impossible. Réessayez.' };
  },

  /** Public (avant connexion) : le mode des horaires, pour que le formulaire d'inscription cache Jour / Nuit quand il ne sert à rien. Sans réponse : « both » (le formulaire reste comme avant). */
  async getSignupInfo(): Promise<{ shift_mode: 'both' | 'normal' | 'day' | 'night' }> {
    if (this.demo) return { shift_mode: 'both' };
    try {
      const r = await this.apiRaw('signup-info');
      return { shift_mode: r.ok ? cleanShiftMode(r.data?.shift_mode) : 'both' };
    } catch { return { shift_mode: 'both' }; }
  },

  getSignupRequests(): SignupRequest[] {
    if (this.demo) return []; // démo : pas d'inscription ni de décision à prendre
    return [...this.signups];
  },

  async decideSignup(id: string, approve: boolean, reason?: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('signup-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok || r.status === 409 || r.status === 404) {
      this.signups = this.signups.filter(x => x.id !== id);
      this.since = '';
      void this.pull(true);
      this.emit();
    }
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Erreur.' };
  },

  // Arrivées du jour (admin : tous les opérateurs ; opérateur : la sienne)
  async fetchAttendance(day: string): Promise<AttendanceRow[]> {
    const r = await this.api(`attendance?day=${encodeURIComponent(day)}`);
    return r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [];
  },

  getPresence(): PresenceRow[] {
    return [...this.presence];
  },

  getMyQueue(): QueueInfo | null {
    return this.myQueue;
  },

  // Opérateur : « je n'ai pas de mission » (join = true) ou quitter la file (join = false)
  async setWaiting(join: boolean): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('queue', { method: 'POST', body: JSON.stringify({ join }) });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Action impossible.' };
  },

  getPasswordResets(): PasswordResetRequest[] {
    if (this.demo) return []; // démo : pas de mot de passe oublié
    return [...this.resets];
  },

  /** Responsable : déconnecte la personne dans `minutes` minutes (0 = tout de suite), ou annule la déconnexion prévue. */
  async forceLogout(userId: string, p: { minutes?: number; cancel?: boolean }): Promise<{ success: boolean; error?: string; at?: string; openMission?: boolean }> {
    const r = await this.api('force-logout', { method: 'POST', body: JSON.stringify({ userId, ...p }) });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true, at: r.data?.at, openMission: r.data?.open_mission === true } : { success: false, error: r.data?.error || 'Action impossible.' };
  },

  getAccessRequests(): AccessRequest[] {
    if (this.demo) return [];
    return [...this.accessRequests];
  },

  /** Décision du responsable : autoriser (fin de vacation, durée ou heure précise), refuser (motif), ou changer l'heure de fin. */
  async decideAccess(id: string, p: { decision: 'approve' | 'refuse' | 'change'; mode?: 'shift_end' | 'hours' | 'until'; value?: number | string; reason?: string }): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('access-decide', { method: 'POST', body: JSON.stringify({ id, ...p }) });
    if (r.ok) await this.pull(true);
    return r.ok ? { success: true } : { success: false, error: r.data?.error || 'Action impossible.' };
  },

  /** Page de connexion : la personne (qui a prouvé son mot de passe) demande à se connecter hors de ses horaires, avec une raison. */
  async requestAccess(username: string, password: string, reason: string): Promise<{ success: boolean; error?: string; request?: AccessRequestState | null }> {
    const r = await this.api('access-request', { method: 'POST', body: JSON.stringify({ username, password, reason }) });
    return r.ok ? { success: true, request: r.data?.request ?? null } : { success: false, error: r.data?.error || 'Envoi impossible.', request: r.data?.request ?? null };
  },

  async decidePasswordReset(id: string, approve: boolean, reason?: string): Promise<boolean> {
    const r = await this.api('reset-decision', { method: 'POST', body: JSON.stringify({ id, approve, reason }) });
    if (r.ok) {
      this.resets = this.resets.filter(x => x.id !== id);
      this.emit();
    }
    return r.ok;
  },

  getUsers(): User[] {
    return [...this.users];
  },
  // Admin : accès d'un opérateur selon son shift (auto / toute heure / bloqué)
  setAccessMode(userId: string, mode: 'auto' | 'allow' | 'block'): { success: boolean } {
    const user = this.users.find(u => u.id === userId);
    if (!user || user.role === 'admin') return { success: false }; // le responsable n'est jamais limité
    if (mode === 'auto') delete user.access_mode;
    else user.access_mode = mode;
    this.notify();
    return { success: true };
  },

  toggleUserBlock(userId: string): { success: boolean; newStatus: 'active' | 'blocked' } {
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
  },

  deleteUser(userId: string): { success: boolean; error?: string } {
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
  },

  updateUser(userId: string, data: Partial<User>): { success: boolean } {
    const user = this.users.find(u => u.id === userId);
    if (!user) return { success: false };

    Object.assign(user, data);
    this.notify();
    return { success: true };
  },

  /** T3 : donne un vrai compte (pseudo + mot de passe) à un employé « suivi par saisie seulement ». Responsable seulement. */
  async giveAccount(userId: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const uname = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,30}$/.test(uname)) return { success: false, error: 'Pseudo invalide (3 à 30 lettres/chiffres).' };
    if (typeof password !== 'string' || password.length < 6) return { success: false, error: 'Mot de passe : 6 caractères minimum.' };
    const u = this.users.find(x => x.id === userId);
    if (!u || !(u as any).entry_only) return { success: false, error: "Cet employé n'est pas suivi par saisie seulement." };
    if (this.users.some(x => x.id !== userId && String(x.username).toLowerCase() === uname)) return { success: false, error: 'Ce pseudo existe déjà.' };
    if (!this.demo) {
      const r = await this.api('give-account', { method: 'POST', body: JSON.stringify({ userId, username: uname, password }) });
      if (!r.ok) return { success: false, error: r.data?.error || 'Création impossible.' };
    }
    u.username = uname; delete (u as any).entry_only;
    if (!this.demo) this.synced.users.set(u.id, JSON.stringify(u));
    this.emit();
    return { success: true };
  },

  /** Employé « suivi par saisie seulement » (M26.7) : sans compte, sans mot de passe, sans téléphone. Responsable seulement. */
  async addEntryOnlyEmployee(d: { name: string; team?: string; shift?: 'day' | 'night' }): Promise<{ success: boolean; user?: User; error?: string }> {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    if (this.demo) {
      const e = entryOnlyRecord({ ...d, entry_only: true }, Date.now());
      if (!e.ok) return { success: false, error: 'Nom complet manquant.' };
      this.users.push(e.rec as User); this.notify();
      return { success: true, user: e.rec as User };
    }
    const r = await this.api('create-user', { method: 'POST', body: JSON.stringify({ user: { ...d, entry_only: true } }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Création impossible.' };
    const u = r.data.user as User;
    this.users.push(u);
    this.synced.users.set(u.id, JSON.stringify(u));
    this.emit();
    return { success: true, user: u };
  },

  async addUser(
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
  },
  logViolation(data: Omit<SecurityViolation, 'id' | 'timestamp' | 'resolved'>): void {
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
  },

  dismissViolation(id: string): void {
    const log = this.securityLogs.find(l => l.id === id);
    if (log) {
      log.resolved = true;
      this.notify();
    }
  },
  submitAdvanceRequest(params: {
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
  },

  reviewAdvanceRequest(id: string, approve: boolean, notes?: string): { success: boolean } {
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
  },
});

export type AccountsMethods = typeof accountsMethods;
