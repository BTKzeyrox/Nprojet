// Magasin de données : Clients et missions-contrats.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { checkDeadline } from '../../utils/deadlines';
import { checkTasks } from '../../utils/taskList';
import { checkClientDraft, checkMissionClient, matchContract, MISSION_CLIENT_MESSAGE, normalizeName, type ClientDraft } from '../../utils/clients';
import { isMoneyRole } from '../../utils/roles';
import { ClientContract, Client } from '../../types';
import { TASKS_MESSAGE, DEADLINE_MESSAGE } from '../storeShared';

export const clientsMethods = defineMethods({
  getClients(): Client[] { return [...this.clients]; }, // admin seulement (l'opérateur n'en reçoit jamais)

  // Clients (responsable seulement ; le serveur revérifie chaque fiche). Codes d'erreur : 'admin' | 'name' | 'email' | 'terms' | 'price' | 'price_by_type' | 'duplicate' | 'missing' | 'in_use'.
  // Le statut d'un client n'est jamais enregistré : il se calcule (src/utils/clients.ts).
  addClient(d: ClientDraft): { success: boolean; error?: string; id?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    const v = checkClientDraft(d);
    if (!v.ok) return { success: false, error: v.error };
    if (this.clients.some(x => normalizeName(x.name) === normalizeName(v.clean.name))) return { success: false, error: 'duplicate' };
    const now = new Date().toISOString();
    const id = `cli-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.clients = [{ id, ...v.clean, active: true, created_by: this.currentUser.id, created_at: now, updated_at: now }, ...this.clients];
    this.notify();
    return { success: true, id };
  },

  updateClient(id: string, d: ClientDraft): { success: boolean; error?: string } {
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
  },

  /** Désactive (archive) ou réactive un client. Un client désactivé reste là avec ses missions et n'apparaît plus dans les listes de choix. */
  setClientActive(id: string, active: boolean): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.clients.some(x => x.id === id)) return { success: false, error: 'missing' };
    this.clients = this.clients.map(x => x.id === id ? { ...x, active, updated_at: new Date().toISOString() } : x);
    this.notify();
    return { success: true };
  },

  /** Supprime une fiche seulement si aucune mission ni session ne la cite (le serveur refuse aussi) : sinon, on la désactive. */
  deleteClient(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || !isMoneyRole(this.currentUser.role)) return { success: false, error: 'admin' };
    if (!this.clients.some(x => x.id === id)) return { success: false, error: 'missing' };
    if (this.contracts.some(c => c.client_id === id) || this.posts.some(p => p.client_id === id)) return { success: false, error: 'in_use' };
    this.clients = this.clients.filter(x => x.id !== id);
    this.notify();
    return { success: true };
  },

  // Admin : ajoute une mission (sans nom de compte = mission « sans compte », grisée)
  addContract(p: { client_name: string; initial_score: number; objective: number; description?: string; post_type?: string; proof_mode?: ClientContract['proof_mode']; client_price_ar?: number; client_id?: string; due_date?: string; due_time?: string; tasks?: { id: string; text: string }[]; tasks_required?: boolean; priority?: ClientContract['priority']; requireClient?: boolean }): { success: boolean; error?: string } {
    if (this.contracts.length >= (this.constructor as typeof AppStore).MAX_CONTRACTS) {
      return { success: false, error: `Maximum ${(this.constructor as typeof AppStore).MAX_CONTRACTS} missions.` };
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
  },

  // Admin : retire une mission (refusé si une session est en cours dessus)
  removeContract(id: string): { success: boolean; error?: string } {
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
  },

  /**
   * Lie une mission à une fiche client (ou enlève le lien avec `null`). Admin seulement ; le serveur revérifie que la fiche existe.
   * L'histoire reste figée : les sessions de cette mission (trouvées par numéro de mission, sinon par titre) qui n'ont pas encore de client prennent le client d'AVANT le changement
   * (ou le nouveau client si la mission n'en avait pas). Une session déjà liée ne change jamais.
   */
  applyContractClient(c: ClientContract, next: string | null): number {
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
  },

  setContractClient(contractId: string, clientId: string | null): { success: boolean; error?: string; stamped?: number } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const c = this.contracts.find(x => x.id === contractId);
    if (!c) return { success: false, error: 'Mission introuvable.' };
    const v = checkMissionClient({ required: false, clientId, clients: this.clients, current: c.client_id || null });
    if (!v.ok) return { success: false, error: MISSION_CLIENT_MESSAGE[v.error].fr };
    const stamped = this.applyContractClient(c, v.client_id);
    this.notify();
    return { success: true, stamped };
  },

  /** Rattache d'un coup les anciennes missions qui portent ce nom (comparé sans accents ni majuscules) à un client. Une ligne confirmée = un appel. */
  attachMissionsByName(text: string, clientId: string): { success: boolean; error?: string; linked?: number } {
    if (this.currentUser?.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const v = checkMissionClient({ required: true, clientId, clients: this.clients });
    if (!v.ok) return { success: false, error: MISSION_CLIENT_MESSAGE[v.error].fr };
    const key = normalizeName(text);
    const list = key ? this.contracts.filter(c => !c.client_id && !c.no_account && normalizeName(c.client_name) === key) : [];
    if (list.length === 0) return { success: false, error: 'Aucune mission à rattacher avec ce nom.' };
    for (const c of list) this.applyContractClient(c, v.client_id);
    this.notify();
    return { success: true, linked: list.length };
  },

  getContracts(): ClientContract[] {
    return [...this.contracts];
  },

  getContractByPostNumber(postNumber: number): ClientContract | undefined {
    return this.contracts.find(c => c.post_number === postNumber);
  },

  // Admin exclusive: Update contract details (name, tag, scores, shift, etc.)
  updateContract(
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
  },
});

export type ClientsMethods = typeof clientsMethods;
