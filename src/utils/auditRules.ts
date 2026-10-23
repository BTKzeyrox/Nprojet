// Journal d'audit (M7.2) : règles pures, sans écran ni serveur. Le serveur (bloc AUDIT de df-api) a la même copie ; `npm run check:audit` compare les deux.
export const AUDIT_ACTIONS = [
  'invoice_issue', 'invoice_cancel', 'invoice_pay', 'delete', 'tariff_change', 'settings_change', 'company_change',
  'user_create', 'user_password', 'signup_decision', 'profile_decision', 'reset_decision',
  'payroll_close', 'payroll_reopen', 'payroll_pay', 'backup_now', 'backup_restore', 'mission_decision',
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];
export interface AuditEntry { id: string; at: string; by: string; by_name: string; action: AuditAction; target_type: string; target_id: string; target_label: string; detail: string }

export const AUDIT_KEEP_DAYS = 365;
export const AUDIT_TARIFF_KEYS = ['price_per_million', 'client_price_default_ar', 'client_prices_by_type'];
const SETTINGS_SKIP = ['company', 'company_log', 'budgets', 'mission_templates'];

const cut = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/** Une ligne du journal, ou null si l'action est inconnue. `at` et `rand` sont donnés par l'appelant (tests fixes). */
export function buildAuditEntry(me: { id?: unknown; name?: unknown; username?: unknown }, action: string, target: { type?: unknown; id?: unknown; label?: unknown } | undefined, detail: unknown, at: string, rand: string): AuditEntry | null {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(action)) return null;
  const t = target || {};
  return {
    id: `${at.replace(/\D/g, '').slice(0, 17)}-${cut(rand, 8)}`,
    at, by: cut(me && me.id, 80), by_name: cut((me && (me.name || me.username)) || '', 80), action: action as AuditAction,
    target_type: cut(t.type, 30), target_id: cut(t.id, 80), target_label: cut(t.label, 80), detail: cut(detail, 300),
  };
}

/** Nom lisible d'une ligne supprimée ou modifiée. */
export function auditLabelOf(d: any): string {
  if (!d || typeof d !== 'object') return '';
  return cut(d.number || d.name || d.client_name || d.title || d.username || d.id || '', 80);
}

const show = (v: unknown) => cut(v !== null && typeof v === 'object' ? JSON.stringify(v) : v, 60) || '—';
/** Changements de tarif : une ligne « champ : avant → après » par clé qui change (comparaison exacte). */
export function auditChanges(before: any, after: any, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const a = before ? before[k] : undefined, b = after ? after[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${k} : ${show(a)} → ${show(b)}`);
  }
  return out;
}

/** Noms des réglages qui ont changé (hors tarifs, déjà notés à part, et hors Conditions, notées par company_log). 12 au plus. */
export function auditSettingsKeys(before: any, after: any): string[] {
  const keys = new Set<string>([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out: string[] = [];
  for (const k of [...keys].sort()) {
    if (SETTINGS_SKIP.includes(k) || AUDIT_TARIFF_KEYS.includes(k)) continue;
    if (JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])) out.push(k);
  }
  return out.slice(0, 12);
}

export const auditCutoffMs = (nowMs: number) => nowMs - AUDIT_KEEP_DAYS * 86400_000;

// ---------- Site seulement : libellés, filtre, regroupement ----------
const LABELS: Record<AuditAction, [string, string]> = {
  invoice_issue: ['Facture émise', 'Invoice issued'], invoice_cancel: ['Facture annulée (avoir)', 'Invoice cancelled (credit note)'], invoice_pay: ['Paiement de facture', 'Invoice payment'],
  delete: ['Suppression', 'Deletion'], tariff_change: ['Changement de tarif', 'Price change'], settings_change: ['Changement de réglage', 'Setting change'], company_change: ['Conditions de l\'entreprise modifiées', 'Company conditions changed'],
  user_create: ['Compte créé', 'Account created'], user_password: ['Mot de passe changé', 'Password changed'], signup_decision: ['Inscription traitée', 'Sign-up handled'], profile_decision: ['Modification de profil traitée', 'Profile change handled'], reset_decision: ['Mot de passe oublié traité', 'Password reset handled'],
  payroll_close: ['Paie clôturée', 'Payroll closed'], payroll_reopen: ['Paie rouverte', 'Payroll reopened'], payroll_pay: ['Paie versée', 'Payroll paid'], backup_now: ['Sauvegarde manuelle', 'Manual backup'], backup_restore: ['Restauration d\'une sauvegarde', 'Backup restored'], mission_decision: ['Mission validée ou refusée', 'Mission approved or refused'],
};
export const auditLabel = (a: string, lang: 'fr' | 'en'): string => { const l = (LABELS as Record<string, [string, string]>)[a]; return l ? l[lang === 'en' ? 1 : 0] : (lang === 'en' ? 'Unknown action' : 'Action inconnue'); };

/** Lignes du serveur nettoyées (une ligne abîmée est ignorée, jamais d'erreur), les plus récentes d'abord. */
export function cleanAuditRows(rows: unknown): AuditEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: AuditEntry[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const x = r as any;
    if (typeof x.id !== 'string' || typeof x.at !== 'string' || Number.isNaN(Date.parse(x.at))) continue;
    out.push({ id: x.id, at: x.at, by: cut(x.by, 80), by_name: cut(x.by_name, 80), action: cut(x.action, 30) as AuditAction, target_type: cut(x.target_type, 30), target_id: cut(x.target_id, 80), target_label: cut(x.target_label, 80), detail: cut(x.detail, 300) });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
}

export interface AuditFilter { action?: string; q?: string; from?: string; to?: string }
/** Filtre : type d'action, texte (nom, cible, détail), dates AAAA-MM-JJ (heure de Madagascar, UTC+3). */
export function filterAudit(rows: AuditEntry[], f: AuditFilter): AuditEntry[] {
  const q = (f.q || '').trim().toLowerCase();
  const day = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);
  return rows.filter(r => {
    if (f.action && r.action !== f.action) return false;
    if (f.from && day(r.at) < f.from) return false;
    if (f.to && day(r.at) > f.to) return false;
    if (q && !`${r.by_name} ${r.target_label} ${r.target_type} ${r.detail}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
export const auditDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);
export function groupAuditByDay(rows: AuditEntry[]): { day: string; rows: AuditEntry[] }[] {
  const out: { day: string; rows: AuditEntry[] }[] = [];
  for (const r of rows) { const d = auditDay(r.at); const last = out[out.length - 1]; if (last && last.day === d) last.rows.push(r); else out.push({ day: d, rows: [r] }); }
  return out;
}
