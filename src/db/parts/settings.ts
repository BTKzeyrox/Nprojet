// Magasin de données : Réglages, rappels, tâches, notifications, types de mission.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { remClean, remSnoozeUntil } from '../../utils/reminderRules';
import { checkTemplate, cleanTemplates, newTemplateId, type MissionTemplate, type TemplateDraft } from '../../utils/missionTemplates';
import { checkRecurring, cleanRecurring, newRecurringId, RECURRING_MESSAGE, type RecurringDraft, type RecurringRule } from '../../utils/recurring';
import { checkTeamGoal, cleanTeamGoals, newTeamGoalId, TEAM_GOAL_ERROR_MESSAGE, type TeamGoal } from '../../utils/teamGoals';
import { checkMonthlyPlan, cleanMonthlyPlan, MONTHLY_PLAN_ERROR_MESSAGE, type MonthlyPlan } from '../../utils/budgetPlan';
import { AppSettings } from '../../types';
import { cleanCustomTypes, cwValidate, CW_MAX_TYPES } from '../../utils/customWorkTypes';
import { DEFAULT_SETTINGS, TEMPLATE_MESSAGE } from '../storeShared';

export const settingsMethods = defineMethods({

  // Réglages généraux (valeurs par défaut si l'admin n'a rien changé)

  // Paie : appel générique aux routes payroll-* du serveur
  async payrollCall(route: string, body: unknown = {}): Promise<{ success: boolean; data?: any; error?: string }> {
    const r = await this.api(route, { method: 'POST', body: JSON.stringify(body) });
    return r.ok ? { success: true, data: r.data } : { success: false, error: r.data?.error || 'Erreur. Réessaie.' };
  },

  getSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...(this.settings[0] || {}), id: 'general' };
  },

  /** Modèles de mission (M6.2) : gardés dans les réglages, sans nouvelle table. */
  /** Types de travail créés à la main (M26.6b). Visibles par le responsable et le Chef d'équipe. */
  getCustomWorkTypes(): any[] { return cleanCustomTypes(this.getSettings().work_types); },

  /** Crée un type de travail (sans `id`) : le nom français et anglais, la mesure, la paie, qui saisit, l'unité. Responsable seulement ; 12 types au plus. */
  saveCustomWorkType(d: any): { success: boolean; error?: string; type?: any } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getCustomWorkTypes();
    if (list.length >= CW_MAX_TYPES) return { success: false, error: `${CW_MAX_TYPES} types au plus : supprime-en un d'abord.` };
    const slug = String(d?.name?.fr || 'type').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18) || 'type';
    let id = `c-${slug.length < 2 ? slug + '-type' : slug}`; for (let i = 2; list.some(t => t.id === id); i++) id = `c-${slug}-${i}`;
    const v = cwValidate({ ...d, id });
    if (!v.ok) return { success: false, error: ({ id: 'Nom impossible.', name: 'Donne un nom en français ET en anglais.', measure: 'Mesure inconnue.', pay: 'Mode de paie inconnu.', entry: 'Choisis qui saisit.', incompatible: 'Cette mesure ne va pas avec ce mode de paie.', unit: 'Donne l\'unité en français ET en anglais (ex : boîte / box).' } as Record<string, string>)[v.error] || 'Type refusé.' };
    this.updateSettings({ work_types: [...list, v.value] });
    return { success: true, type: v.value };
  },

  removeCustomWorkType(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getCustomWorkTypes();
    if (!list.some(t => t.id === id)) return { success: false, error: 'Type introuvable.' };
    this.updateSettings({ work_types: list.filter(t => t.id !== id) });
    return { success: true };
  },

  getMissionTemplates(): MissionTemplate[] { return cleanTemplates(this.getSettings().mission_templates); },

  /** Crée (sans `id`) ou modifie (avec `id`) un modèle. Admin seulement. */
  saveMissionTemplate(d: TemplateDraft): { success: boolean; error?: string; template?: MissionTemplate } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getMissionTemplates();
    const id = typeof d?.id === 'string' ? d.id : '';
    if (id && !list.some(t => t.id === id)) return { success: false, error: 'Modèle introuvable.' };
    const v = checkTemplate(d, list.filter(t => t.id !== id));
    if (!v.ok) return { success: false, error: TEMPLATE_MESSAGE[v.error] };
    const template = { ...v.value, id: id || newTemplateId(list) };
    this.updateSettings({ mission_templates: id ? list.map(t => (t.id === id ? template : t)) : [...list, template] });
    return { success: true, template };
  },

  removeMissionTemplate(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getMissionTemplates();
    if (!list.some(t => t.id === id)) return { success: false, error: 'Modèle introuvable.' };
    this.updateSettings({ mission_templates: list.filter(t => t.id !== id) });
    return { success: true };
  },

  /** Plan mensuel (M15.4) : revenus et paie prévus par mois, dans les réglages (admin seulement). Les dépenses prévues viennent des budgets par catégorie. */
  getMonthlyPlan(): MonthlyPlan { return cleanMonthlyPlan(this.getSettings().monthly_plan); },
  saveMonthlyPlan(d: { [k: string]: unknown }): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const v = checkMonthlyPlan(d);
    if (!v.ok) return { success: false, error: MONTHLY_PLAN_ERROR_MESSAGE[v.error] };
    this.updateSettings({ monthly_plan: v.value });
    return { success: true };
  },

  /** Objectifs par salarié et par équipe (M15.3) : dans les réglages, sans nouvelle table. La valeur réelle est calculée, jamais saisie. Admin seulement. */
  getTeamGoals(): TeamGoal[] { return cleanTeamGoals(this.getSettings().team_goals) as TeamGoal[]; },
  /** Crée (sans `id`) ou modifie (avec `id`) un objectif. */
  saveTeamGoal(d: { [k: string]: unknown }): { success: boolean; error?: string; goal?: TeamGoal } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getTeamGoals();
    const id = typeof d?.id === 'string' ? d.id : '';
    if (id && !list.some(g => g.id === id)) return { success: false, error: 'Objectif introuvable.' };
    const v = checkTeamGoal(d, list.filter(g => g.id !== id));
    if (!v.ok) return { success: false, error: TEAM_GOAL_ERROR_MESSAGE[v.error] };
    if (v.value.scope === 'employee' && !this.users.some(u => u.id === v.value.employee_id && u.role !== 'admin')) return { success: false, error: TEAM_GOAL_ERROR_MESSAGE.employee };
    const goal = { ...v.value, id: id || newTeamGoalId(list) } as TeamGoal;
    this.updateSettings({ team_goals: id ? list.map(g => (g.id === id ? goal : g)) : [...list, goal] });
    return { success: true, goal };
  },
  removeTeamGoal(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getTeamGoals();
    if (!list.some(g => g.id === id)) return { success: false, error: 'Objectif introuvable.' };
    this.updateSettings({ team_goals: list.filter(g => g.id !== id) });
    return { success: true };
  },

  /** Missions récurrentes (M15.1) : règles gardées dans les réglages, sans nouvelle table. Le serveur crée les missions à l'heure prévue. */
  getRecurringRules(): RecurringRule[] { return cleanRecurring(this.getSettings().recurring_missions); },

  /** Crée (sans `id`) ou modifie (avec `id`) une règle. Admin seulement. */
  saveRecurringRule(d: RecurringDraft): { success: boolean; error?: string; rule?: RecurringRule } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getRecurringRules();
    const id = typeof d?.id === 'string' ? d.id : '';
    if (id && !list.some(r => r.id === id)) return { success: false, error: 'Règle introuvable.' };
    const v = checkRecurring(d, list.filter(r => r.id !== id));
    if (!v.ok) return { success: false, error: RECURRING_MESSAGE[v.error] };
    const rule = { ...v.value, id: id || newRecurringId(list) };
    this.updateSettings({ recurring_missions: id ? list.map(r => (r.id === id ? rule : r)) : [...list, rule] });
    return { success: true, rule };
  },

  /** Arrête ou relance une règle. Rien n'est rattrapé à la reprise : seule la prochaine occurrence est créée. */
  setRecurringActive(id: string, active: boolean): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getRecurringRules();
    if (!list.some(r => r.id === id)) return { success: false, error: 'Règle introuvable.' };
    this.updateSettings({ recurring_missions: list.map(r => (r.id === id ? { ...r, active } : r)) });
    return { success: true };
  },

  /** Supprime une règle. Les missions déjà créées ne changent pas. */
  removeRecurringRule(id: string): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const list = this.getRecurringRules();
    if (!list.some(r => r.id === id)) return { success: false, error: 'Règle introuvable.' };
    this.updateSettings({ recurring_missions: list.filter(r => r.id !== id) });
    return { success: true };
  },
  async pushKey(): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-key');
    return r.ok && typeof r.data?.key === 'string' ? { ok: true, key: r.data.key } : { ok: false, error: r.data?.error || 'Notifications indisponibles.' };
  },
  async pushSubscribe(subscription: unknown): Promise<{ ok: boolean; error?: string }> {
    if (this.demo) return { ok: false, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Erreur.' };
  },
  async pushUnsubscribe(endpoint: string): Promise<void> {
    if (this.demo) return;
    await this.api('push-unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
  },
  async prefsGet(): Promise<Record<string, string> | null> {
    if (this.demo || !this.token) return null;
    const r = await this.api('prefs');
    return r.ok && r.data && typeof r.data.prefs === 'object' && r.data.prefs ? r.data.prefs : null;
  },
  async prefsSet(changes: Record<string, string | null>): Promise<boolean> {
    if (this.demo || !this.token) return false;
    const r = await this.api('prefs-set', { method: 'POST', body: JSON.stringify({ changes }) });
    return r.ok;
  },
  async memFetch(): Promise<{ id: string; text: string; at: number }[] | null> {
    if (this.demo) return [...this.demoMem].sort((a, b) => a.at - b.at);
    if (!this.token) return null;
    const r = await this.api('assistant-memory');
    return r.ok && r.data && Array.isArray(r.data.notes) ? r.data.notes : null;
  },
  async memSave(note: { id?: string; text: string }): Promise<{ ok: boolean; note?: { id: string; text: string; at: number }; error?: string }> {
    if (this.demo) {
      const text = String(note.text || '').trim().slice(0, 500);
      if (!text) return { ok: false, error: 'Note vide.' };
      const old = note.id ? this.demoMem.find(x => x.id === note.id) : undefined;
      const n = { id: old?.id || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text, at: old?.at || Date.now() };
      this.demoMem = [...this.demoMem.filter(x => x.id !== n.id), n];
      return { ok: true, note: n };
    }
    const r = await this.api('assistant-memory-save', { method: 'POST', body: JSON.stringify({ note }) });
    return r.ok ? { ok: true, note: r.data?.note } : { ok: false, error: r.data?.error || 'Enregistrement impossible (pas de réseau ?).' };
  },
  async memDelete(id: string): Promise<boolean> {
    if (this.demo) { this.demoMem = this.demoMem.filter(x => x.id !== id); return true; }
    return (await this.api('assistant-memory-delete', { method: 'POST', body: JSON.stringify({ id }) })).ok;
  },
  async remFetch(): Promise<{ items: any[]; cfg: any; now: number } | null> {
    if (this.demo) return { items: this.demoRem.items, cfg: this.demoRem.cfg, now: Date.now() };
    if (!this.token) return null;
    const r = await this.api('reminders');
    return r.ok && r.data && Array.isArray(r.data.items) ? r.data : null;
  },
  async remSave(item: any): Promise<{ ok: boolean; item?: any; error?: string }> {
    if (this.demo) {
      const me = this.getCurrentUser();
      const it = remClean(item, String(me?.role || 'employee'), String(me?.id || 'demo'), Date.now());
      if (!it) return { ok: false, error: 'Rappel non valable.' };
      this.demoRem.items = [...this.demoRem.items.filter(x => x.id !== it.id), it];
      return { ok: true, item: it };
    }
    const r = await this.api('reminder-save', { method: 'POST', body: JSON.stringify({ item }) });
    return r.ok ? { ok: true, item: r.data?.item } : { ok: false, error: r.data?.error || 'Enregistrement impossible (pas de réseau ?).' };
  },
  async remDelete(id: string): Promise<boolean> {
    if (this.demo) { this.demoRem.items = this.demoRem.items.filter(x => x.id !== id); return true; }
    return (await this.api('reminder-delete', { method: 'POST', body: JSON.stringify({ id }) })).ok;
  },
  async remSnooze(id: string, choice: '10m' | '1h' | 'tomorrow'): Promise<number | null> {
    if (this.demo) { const u = remSnoozeUntil(choice, Date.now(), this.demoRem.cfg.morning); this.demoRem.items = this.demoRem.items.map(x => (x.id === id ? { ...x, snooze_until: u } : x)); return u; }
    const r = await this.api('reminder-snooze', { method: 'POST', body: JSON.stringify({ id, choice }) });
    return r.ok ? Number(r.data?.snooze_until) || null : null;
  },
  async remCfgSave(cfg: any): Promise<any | null> {
    if (this.demo) { this.demoRem.cfg = { ...this.demoRem.cfg, ...cfg }; return this.demoRem.cfg; }
    const r = await this.api('reminder-cfg', { method: 'POST', body: JSON.stringify({ cfg }) });
    return r.ok ? r.data?.cfg || null : null;
  },
  /** Interrupteurs par catégorie de cet appareil : sans `off` on lit ; avec `off` on enregistre (catégories coupées). */
  async pushPrefs(endpoint: string, off?: string[]): Promise<{ ok: boolean; off: string[]; error?: string }> {
    if (this.demo) return { ok: false, off: [], error: 'Indisponible en mode démo.' };
    const r = await this.api('push-prefs', { method: 'POST', body: JSON.stringify(off === undefined ? { endpoint } : { endpoint, off }) });
    return r.ok ? { ok: true, off: Array.isArray(r.data?.off) ? r.data.off : [] } : { ok: false, off: [], error: r.data?.error || 'Erreur.' };
  },
  async pushTest(): Promise<{ ok: boolean; sent: number; error?: string }> {
    if (this.demo) return { ok: false, sent: 0, error: 'Indisponible en mode démo.' };
    const r = await this.api('push-test', { method: 'POST', body: '{}' });
    return r.ok ? { ok: true, sent: Number(r.data?.sent) || 0 } : { ok: false, sent: 0, error: r.data?.error || 'Erreur.' };
  },
});

export type SettingsMethods = typeof settingsMethods;
