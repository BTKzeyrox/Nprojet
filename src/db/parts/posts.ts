// Magasin de données : Missions : démarrer, finir, valider, refuser.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import type { Role as OfflineRole } from '../../utils/offline';
import { newOpId } from '../../utils/offline';
import { queueSheet, applyAnswer } from '../../utils/sheetOutbox';
import { canSubmitTasks, cleanDone, cleanTasks, toggleTask } from '../../utils/taskList';
import { matchContract } from '../../utils/clients';
import { PostSession, ShiftType } from '../../types';
import { clientPriceForContract } from '../../utils/clientPrice';
import { isOpenMission, isWorkLine, postPayAr, workLineClientPrice } from '../../utils/postPay';
import { weSelfEntered } from '../../utils/workEntry';
import { planWorkCancel } from '../../utils/workEntry';

export const postsMethods = defineMethods({

  getPosts(): PostSession[] {
    if (this.pendingDecisions.size === 0) return [...this.posts];
    // Décision en cours d'envoi (voir decidePostNow) : on MONTRE déjà le nouvel état, mais la vraie liste (this.posts) n'est pas touchée.
    return this.posts.map(p => { const d = this.pendingDecisions.get(p.id); return d ? { ...p, status: d.status, ...(d.reason ? { rejection_reason: d.reason } : {}) } : p; });
  },
  getActiveOrPendingPost(employeeId: string): PostSession | undefined {
    return this.posts.find(
      p => p.employee_id === employeeId && isOpenMission(p)
    );
  },

  startPost(params: {
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

    // 1. Anti-Multi-Mission Check or Auto-Replace:
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
    this.prepareMissionSheet(newPost);
    this.notify();
    return { success: true, post: newPost };
  },

  // Edit pending start post before admin validation
  updatePendingStartPost(
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
  },

  // Cancel pending start post before admin validation
  cancelPendingStartPost(postId: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (post.status !== 'pending_start') {
      return { success: false, error: 'Annulation impossible: la mission est déjà validé ou en cours.' };
    }

    this.posts = this.posts.filter(p => p.id !== postId);
    this.notify();
    return { success: true };
  },

  // Cancel the end request before admin validation: the session goes back to « en cours »
  cancelPendingEndPost(postId: string): { success: boolean; error?: string } {
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
  },

  // Update current score during active post
  updateCurrentScore(postId: string, newScore: number): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    post.current_score = newScore;
    post.remaining_score = Math.max(0, post.target_score - newScore);
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  },

  // Submit End Form with mandatory score consistency check
  submitEndPost(params: {
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
  },

  /** Coche ou décoche une tâche sur une session ouverte. L'opérateur : seulement la sienne. Rend les cases cochées. */
  toggleSessionTask(postId: string, taskId: string): { success: boolean; error?: string; done?: string[] } {
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
  },
  validatePost(postId: string, note?: string): { success: boolean; error?: string; payrollAr?: number } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (weSelfEntered(this.currentUser, post)) return { success: false, error: 'Tu ne peux pas valider ta propre saisie.' }; // M26.5a : personne ne valide sa propre saisie
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
      // Paie : une mission normale = le tarif fixe (Réglages → Missions), comme avant ; une ligne de travail (production, présence) = selon le mode de paie (module 26, src/utils/postPay.ts)
      const calculatedAr = postPayAr(post, employee, this.getSettings());

      post.status = 'completed';
      post.calculated_ar = calculatedAr;

      // L'Actuel du compte devient le score final (vu par l'employé suivant)
      const linkedContract =
        this.contracts.find(c => c.post_number === post.post_number) ||
        this.contracts.find(c => c.client_name === post.client_name);
      if (linkedContract && !isWorkLine(post)) linkedContract.current_score = finalScore;
      // Prix client figé à la validation (comme la paie) : changer les prix ensuite ne modifie pas cette mission
      post.client_price_ar = isWorkLine(post) ? workLineClientPrice : clientPriceForContract(linkedContract, this.getSettings()); // une ligne de travail n'est facturée à aucun client
      post.updated_at = new Date().toISOString();

      if (employee) {
        employee.total_score_boosted = (employee.total_score_boosted || 0) + scoreGained;
        employee.total_earnings_ar = (employee.total_earnings_ar || 0) + calculatedAr;
      }

      this.notify();
      return { success: true, payrollAr: calculatedAr };
    }

    return { success: false, error: 'Statut de la mission non éligible pour validation' };
  },

  /** Feuille du jour (M26.5a) : présence, heures, quantité et refus saisis par le responsable ou le Chef d'équipe. Réponse : nombre de lignes enregistrées et lignes refusées (numéro + raison). Sans réseau (M27.9) : gardée sur l'appareil (`queued`), envoyée au retour du réseau. */
  async addWorkEntries(sheet: { date: string; type_label?: string; lines: any[] }): Promise<{ ok: boolean; error?: string; saved?: number; failed?: { line: number; error: string }[]; validated?: boolean; queued?: boolean }> {
    const me = this.currentUser;
    if (!me || (me.role !== 'admin' && me.role !== 'team_lead')) return { ok: false, error: 'Réservé au responsable et au chef d\'équipe.' };
    const id = newOpId(), nowIso = new Date().toISOString();
    const r = await this.sheetCall(sheet, id, nowIso);
    if (r.status >= 200 && r.status < 300) {
      if (!this.demo) { this.since = ''; void this.pull(true); }
      return { ok: true, saved: Number(r.data?.saved) || 0, failed: Array.isArray(r.data?.failed) ? r.data.failed : [], validated: !!r.data?.validated };
    }
    // Panne, coupure, connexion expirée : la feuille est gardée sur l'appareil avec CE numéro (le serveur a peut-être déjà fait la première demande : il ne la refera pas).
    if (applyAnswer([], '', { status: r.status }, nowIso).outcome === 'waiting' && this.sheetLoad()) {
      const q = queueSheet(this.sheetQ, sheet, me.role as OfflineRole, nowIso, undefined, id);
      if (q.error) return { ok: false, error: q.error.fr };
      const before = this.sheetQ; this.sheetQ = q.queue;
      if (!this.sheetSave()) { this.sheetQ = before; return { ok: false, error: 'Impossible de garder la feuille sur cet appareil (mémoire pleine ou navigation privée). Réessaie avec le réseau.' }; }
      this.sheetSchedule(); this.emit();
      return { ok: true, queued: true, saved: 0, failed: [] };
    }
    return { ok: false, error: r.data?.error || 'Erreur.' };
  },

  /** Annule une ligne de la feuille du jour (responsable seulement) : retire sa paie, la supprime ; elle peut être saisie à nouveau. En ligne seulement. */
  async cancelWorkLine(postId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.demo) {
      const post = this.posts.find(p => p.id === postId);
      const emp = post ? this.users.find(u => u.id === post.employee_id) : undefined;
      const plan = planWorkCancel(this.currentUser, post, emp, false);
      if (!plan.ok) return { ok: false, error: plan.error === 'role' ? 'Seulement le responsable, ou le chef pour sa propre ligne en attente.' : "Ce n'est pas une ligne de la feuille du jour." };
      this.posts = this.posts.filter(p => p.id !== plan.id);
      if (plan.user && emp) emp.total_earnings_ar = plan.user.total_earnings_ar;
      this.notify();
      return { ok: true };
    }
    const r = await this.api('work-line-cancel', { method: 'POST', body: JSON.stringify({ id: postId }) });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Erreur.' };
    this.posts = this.posts.filter(p => p.id !== postId);
    this.notify();
    return { ok: true };
  },

  rejectPost(postId: string, reason: string): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };
    if (!reason.trim()) return { success: false, error: 'Un motif de rejet est obligatoire' };

    post.status = 'rejected';
    post.rejection_reason = reason.trim();
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  },

  // Emergency Force Release Post to unstick bugged shifts
  forceReleasePost(postId: string, reason = 'Force release by administrator'): { success: boolean; error?: string } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Mission introuvable' };

    post.status = 'force_released';
    post.notes = post.notes ? `${post.notes} [FORCE RELEASED: ${reason}]` : `[FORCE RELEASED: ${reason}]`;
    post.updated_at = new Date().toISOString();
    this.notify();
    return { success: true };
  },
  /**
   * Valider ou refuser SANS faire attendre l'écran : le nouvel état s'affiche tout de suite (`ok: true`), la décision part au serveur
   * en arrière-plan, et `settled` donne le résultat réel. Si le serveur refuse ou si le réseau tombe, l'affichage revient à l'état d'avant
   * (`settled` = { ok: false, error }). La paie et le prix client restent calculés par le serveur seulement : aucun chiffre n'est inventé ici.
   * Le rechargement complet qui suit ne bloque plus personne ; l'affichage immédiat part dès que l'état officiel est arrivé (ou après 20 s au plus).
   */
  decidePostNow(id: string, approve: boolean, reason?: string, note?: string): { ok: boolean; error?: string; settled: Promise<{ ok: boolean; error?: string }> } {
    const done = (r: { ok: boolean; error?: string }) => ({ ...r, settled: Promise.resolve(r) });
    const me = this.currentUser;
    if (!me || (me.role !== 'team_lead' && me.role !== 'admin')) return done({ ok: false, error: 'Réservé au chef d\'équipe.' });
    if (weSelfEntered(me, this.posts.find(p => p.id === id))) return done({ ok: false, error: 'Tu ne peux pas valider ta propre saisie.' }); // M26.5c
    if (this.demo) { const r = approve ? this.validatePost(id, note) : this.rejectPost(id, reason || ''); return done(r.success ? { ok: true } : { ok: false, error: r.error }); }
    if (!approve && !(reason || '').trim()) return done({ ok: false, error: 'Un motif de rejet est obligatoire' });
    if (this.pendingDecisions.has(id)) return done({ ok: false, error: 'Une décision est déjà en cours pour cette mission.' });
    const post = this.posts.find(p => p.id === id);
    const waiting = post?.status === 'pending_start' || post?.status === 'pending_end';
    if (post && waiting) this.pendingDecisions.set(id, { status: !approve ? 'rejected' : post.status === 'pending_start' ? 'active' : 'completed', reason: approve ? undefined : (reason || '').trim(), settled: false });
    if (this.pendingDecisions.has(id)) this.emit();
    const settled = (async (): Promise<{ ok: boolean; error?: string }> => {
      const r = await this.api('post-decide', { method: 'POST', body: JSON.stringify({ id, approve, reason: approve ? undefined : reason, note: approve ? note : undefined }) });
      const entry = this.pendingDecisions.get(id);
      if (!r.ok) { // refusé ou réseau tombé : on revient à l'état d'avant
        if (entry) { this.pendingDecisions.delete(id); this.emit(); }
        return { ok: false, error: r.data?.error || 'Erreur.' };
      }
      if (entry) {
        entry.settled = true; // le prochain rechargement réussi enlève l'affichage immédiat
        setTimeout(() => { if (this.pendingDecisions.get(id) === entry) { this.pendingDecisions.delete(id); this.emit(); } }, 20000); // filet : jamais bloqué
      }
      this.since = '';
      void this.pull(true); // en arrière-plan : le vrai état (paie, prix client, totaux) arrive sans bloquer l'écran
      return { ok: true };
    })();
    return { ok: true, settled };
  },

  /** Même chose, en attendant la réponse du serveur (gardée pour les appels qui veulent le résultat final). */
  async decidePost(id: string, approve: boolean, reason?: string, note?: string): Promise<{ ok: boolean; error?: string }> {
    const r = this.decidePostNow(id, approve, reason, note);
    return r.ok ? r.settled : { ok: false, error: r.error };
  },

  /** Enlève l'affichage immédiat des décisions déjà confirmées par le serveur. Renvoie vrai si quelque chose a changé. */
  dropSettledDecisions(): boolean {
    let any = false;
    for (const [id, d] of this.pendingDecisions) if (d.settled) { this.pendingDecisions.delete(id); any = true; }
    return any;
  },
});

export type PostsMethods = typeof postsMethods;
