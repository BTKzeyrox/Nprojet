// Magasin de données : Outils admin : sécurité 2 étapes, restauration, sauvegardes, audit, rapports, erreurs.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { checkReportRecord, cleanAutoReport, periodFromId, type AutoReportSetting, type ReportRecord } from '../../utils/autoReport';
import { cleanAuditRows, type AuditEntry } from '../../utils/auditRules';
import { API_BASE, RESTORE_BASE, AI_BASE } from '../storeShared';

export const adminToolsMethods = defineMethods({
  async totpCall(path: string, body?: unknown): Promise<{ ok: boolean; error?: string; data: any }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.', data: {} };
    const r = await this.api(path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
    return { ok: r.ok, error: r.ok ? undefined : (r.data?.error || 'Erreur, réessaie.'), data: r.data || {} };
  },
  totpStatus() { return this.totpCall('totp-status'); },
  totpStart(password: string) { return this.totpCall('totp-start', { password }); },
  totpEnable(code: string) { return this.totpCall('totp-enable', { code }); },
  totpDisable(password: string, code: string) { return this.totpCall('totp-disable', { password, code }); },
  totpNewBackup(password: string, code: string) { return this.totpCall('totp-new-backup', { password, code }); },
  totpReset(userId: string) { return this.totpCall('totp-reset', { userId }); },
  async restoreCall(path: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string; data?: any }> {
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
  },
  /** Assistant IA externe (admin seulement, fonction séparée df-assistant). En démo : rien ne part au serveur. */
  async aiCall(path: 'status' | 'ask', body: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string; data?: any }> {
    if (this.demo) return { ok: false, error: 'demo' };
    if (this.currentUser?.role !== 'admin') return { ok: false, error: 'admin_only' };
    try {
      const res = await fetch(`${AI_BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, data } : { ok: false, error: String(data?.error || 'unavailable') };
    } catch {
      return { ok: false, error: 'network' };
    }
  },
  restoreStatus() { return this.restoreCall('restore-status'); },
  restoreSetEmail(email: string) { return this.restoreCall('restore-email', { email }); },
  restoreVerifyEmail(code: string) { return this.restoreCall('restore-email-verify', { code }); },
  restoreSendCode() { return this.restoreCall('restore-send-code'); },
  restoreBackupCode() { return this.restoreCall('restore-backup-code'); },
  restoreBackupExecute(id: number, code: string) { return this.restoreCall('restore-backup-execute', { id, code, confirm: 'RESTAURER' }); },
  restoreExecute(code: string) { return this.restoreCall('restore-execute', { code, confirm: 'RESTAURER' }); },
  async sendErrorReport(report: Record<string, unknown>): Promise<void> {
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
  },

  async submitProblemReport(p: { detail: string; screenshotDataUrl?: string; page: string; device: string; version: string }): Promise<{ success: boolean; error?: string }> {
    let screenshot_url = '';
    if (p.screenshotDataUrl) screenshot_url = (await this.uploadFile(p.screenshotDataUrl)) || '';
    const r = await this.api('report-error', { method: 'POST', body: JSON.stringify({ kind: 'report', detail: p.detail, screenshot_url, page: p.page, device: p.device, version: p.version, message: 'Signalement' }) });
    return r.ok ? { success: true } : { success: false, error: r.data?.error || "Envoi impossible. Réessaie plus tard." };
  },

  async fetchErrors(status: 'open' | 'resolved' | 'all'): Promise<any[]> {
    const r = await this.api(`errors?status=${status}`);
    return r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [];
  },

  async updateError(id: string, change: { status?: 'open' | 'resolved'; remove?: boolean }): Promise<boolean> {
    const r = await this.api('error-update', { method: 'POST', body: JSON.stringify({ id, ...change }) });
    return r.ok;
  },
  async listBackups(): Promise<{ ok: boolean; error?: string; rows: { id: number; taken_at: string; tables: number; bytes: number }[] }> {
    const r = await this.api('backups');
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.', rows: [] };
    return { ok: true, rows: Array.isArray(r.data?.rows) ? r.data.rows : [] };
  },
  async listAudit(): Promise<{ ok: boolean; error?: string; rows: AuditEntry[] }> {
    const r = await this.api('audit-list?limit=1000');
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.', rows: [] };
    return { ok: true, rows: cleanAuditRows(r.data?.rows) };
  },
  getAutoReport(): AutoReportSetting { return cleanAutoReport(this.getSettings().auto_report); },
  saveAutoReport(d: unknown): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    this.updateSettings({ auto_report: cleanAutoReport(d) });
    return { success: true };
  },
  async listReports(): Promise<{ ok: boolean; error?: string; rows: Omit<ReportRecord, 'html'>[] }> {
    const r = await this.api('report-list', { method: 'POST', body: '{}' });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.', rows: [] };
    const rows: Omit<ReportRecord, 'html'>[] = [];
    for (const x of Array.isArray(r.data?.rows) ? r.data.rows : []) {
      const c = checkReportRecord(x?.status === 'ready' ? { ...x, html: '-' } : x); // la liste n'a pas le texte : on vérifie le reste
      if (c.ok) { const { html: _h, ...meta } = c.value; rows.push(meta); }
    }
    return { ok: true, rows };
  },
  async openReport(id: string): Promise<{ ok: boolean; error?: string; record?: ReportRecord }> {
    if (!periodFromId(id)) return { ok: false, error: 'Rapport inconnu.' };
    const r = await this.api('report-open', { method: 'POST', body: JSON.stringify({ id }) });
    const c = r.ok ? checkReportRecord(r.data?.record) : null;
    return c && c.ok ? { ok: true, record: c.value } : { ok: false, error: r.data?.error || 'Rapport illisible.' };
  },
  /** Fige la copie (texte du rapport) d'une fiche « en attente ». Une copie déjà figée n'est jamais changée : le serveur rend celle qui existe. */
  async freezeReportCopy(id: string, html: string): Promise<{ ok: boolean; error?: string; record?: ReportRecord; already?: boolean }> {
    if (!periodFromId(id)) return { ok: false, error: 'Rapport inconnu.' };
    const r = await this.api('report-freeze', { method: 'POST', body: JSON.stringify({ id, html }) });
    const c = r.ok ? checkReportRecord(r.data?.record) : null;
    return c && c.ok ? { ok: true, record: c.value, already: !!r.data?.already } : { ok: false, error: r.data?.error || 'Copie impossible.' };
  },
  async getBackup(id: number): Promise<{ ok: boolean; error?: string; backup?: { id: number; taken_at: string; data: unknown } }> {
    const r = await this.api(`backup-get?id=${encodeURIComponent(String(id))}`);
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.' };
    return { ok: true, backup: r.data?.backup };
  },

  /** M16.5 : ajoute un fichier d'export à la liste des sauvegardes (ne change aucune donnée ; l'utiliser passe par « Restaurer »). */
  async backupImport(data: unknown): Promise<{ ok: boolean; error?: string; code?: string; tables?: number; rows?: number }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.' };
    const r = await this.api('backup-import', { method: 'POST', body: JSON.stringify({ data }) });
    return r.ok ? { ok: true, tables: Number(r.data?.tables) || 0, rows: Number(r.data?.rows) || 0 } : { ok: false, error: r.data?.error || 'Erreur.', code: r.data?.code };
  },

  async backupNow(): Promise<{ ok: boolean; error?: string }> {
    const r = await this.api('backup-now', { method: 'POST', body: '{}' });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Erreur.' };
  },
  resetToFactoryDefaults(): void {
    // Ne supprime rien : recharge simplement l'état officiel depuis le serveur
    this.since = '';
    void this.pull(true);
  },

  exportDatabaseSql(): string {
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
  },

  exportDatabaseJson(): string {
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
  },
});

export type AdminToolsMethods = typeof adminToolsMethods;
