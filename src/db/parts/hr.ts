// Magasin de données : Congés, planning, fiches RH et évaluations.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { readCompany } from '../../utils/companyRules';
import { checkLeave, type Leave, type LeaveType } from '../../utils/leaves';
import { checkShift, shiftId, type Shift, type ShiftKind } from '../../utils/planning';
import { checkReview, type Review } from '../../utils/reviews';
import { checkHrFile, type HrFile } from '../../utils/hrFile';
import { User } from '../../types';

export const hrMethods = defineMethods({

  // Congés (M5.2). Mêmes règles que le serveur (`checkLeave`) : le site refuse avant d'envoyer, le serveur revérifie quand même.
  // Codes d'erreur : ceux de `leaveReasonText` ('dates', 'overlap', 'balance'…) + 'login' | 'missing'.
  getLeaves(): Leave[] { return [...this.leaves]; },
  requestLeave(d: { employee_id?: string; type: LeaveType; start_date: string; end_date: string; reason?: string; approved?: boolean }): { success: boolean; error?: string; id?: string } {
    const me = this.currentUser;
    if (!me) return { success: false, error: 'login' };
    const admin = me.role === 'admin';
    const empId = admin ? String(d.employee_id || '') : me.id;
    const emp = this.users.find(u => u.id === empId);
    if (!emp || emp.role === 'admin') return { success: false, error: 'employee' };
    const now = new Date().toISOString();
    const id = `lv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const rec = { id, employee_id: empId, employee_name: emp.name, type: d.type, start_date: d.start_date, end_date: d.end_date, reason: d.reason || '', status: admin && d.approved ? 'approved' : 'pending' };
    const v = checkLeave(rec, undefined, { id: me.id, name: me.name, admin }, now, this.leaveCtx(empId));
    if (!v.ok) return { success: false, error: v.reason };
    this.leaves = [v.save as Leave, ...this.leaves];
    this.notify();
    return { success: true, id };
  },
  /** Accepter, refuser ou annuler. Refus et annulation par l'admin : motif de 3 caractères ou plus. Le salarié ne peut qu'annuler. */
  decideLeave(id: string, status: 'approved' | 'rejected' | 'cancelled', reason?: string): { success: boolean; error?: string } {
    const me = this.currentUser;
    if (!me) return { success: false, error: 'login' };
    const old = this.leaves.find(l => l.id === id);
    if (!old) return { success: false, error: 'missing' };
    const v = checkLeave({ ...old, status, decision_reason: reason || '' }, old, { id: me.id, name: me.name, admin: me.role === 'admin' }, new Date().toISOString(), this.leaveCtx(old.employee_id));
    if (!v.ok) return { success: false, error: v.reason };
    this.leaves = this.leaves.map(l => (l.id === id ? (v.save as Leave) : l));
    this.notify();
    return { success: true };
  },
  /** Supprime une demande (responsable seulement ; le salarié annule, il ne supprime pas). */
  deleteLeave(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || this.currentUser.role !== 'admin') return { success: false, error: 'admin' };
    if (!this.leaves.some(l => l.id === id)) return { success: false, error: 'missing' };
    this.leaves = this.leaves.filter(l => l.id !== id);
    this.notify();
    return { success: true };
  },

  // Planning des équipes (M15.2). Mêmes règles que le serveur (`checkShift`) : le site refuse avant d'envoyer, le serveur revérifie quand même.
  // Responsable seulement en écriture ; un salarié ne reçoit que son planning (le serveur filtre).
  getShifts(): Shift[] { return [...this.shifts]; },
  /** Limite de jours travaillés par semaine (Conditions de l'entreprise) ; 0 = pas de limite. */
  getPlanningMaxPerWeek(): number { return Number(readCompany(this.getSettings().company).leave.work_days_per_week) || 0; },
  /**
   * Applique plusieurs cases d'un coup (une seule synchronisation) : `set` = entrées à écrire, `clear` = cases à vider (entrée supprimée).
   * Tout est vérifié avant : si une entrée est fausse, rien n'est changé.
   */
  applyShifts(set: Array<{ employee_id: string; date: string; kind: ShiftKind; note?: string }>, clear: Array<{ employee_id: string; date: string }> = []): { success: boolean; error?: string } {
    if (!this.currentUser || this.currentUser.role !== 'admin') return { success: false, error: 'admin' };
    const now = new Date().toISOString(), me = this.currentUser.id;
    const byId = new Map(this.shifts.map(s => [s.id, s] as const));
    const next: Shift[] = [];
    for (const d of set) {
      const v = checkShift(d);
      if (!v.ok) return { success: false, error: v.error };
      if (!this.users.some(u => u.id === v.value.employee_id && u.role !== 'admin')) return { success: false, error: 'employee' };
      const old = byId.get(v.value.id);
      next.push({ id: v.value.id, employee_id: v.value.employee_id, date: v.value.date, kind: v.value.kind as ShiftKind, ...(v.value.note ? { note: v.value.note } : {}), created_at: old?.created_at || now, updated_at: now, updated_by: me });
    }
    const gone = new Set(clear.map(c => shiftId(c.employee_id, c.date)));
    const put = new Map(next.map(s => [s.id, s] as const));
    this.shifts = [...this.shifts.filter(s => !gone.has(s.id) && !put.has(s.id)), ...next];
    this.notify();
    return { success: true };
  },

  // Dossier du salarié (M5.1) : responsable seulement en écriture ; le salarié lit le sien. Le serveur revérifie (bloc HR).
  setUserHr(userId: string, hr: HrFile | null): { success: boolean; error?: string } {
    if (!this.currentUser || this.currentUser.role !== 'admin') return { success: false, error: 'admin' };
    const u = this.users.find(x => x.id === userId);
    if (!u || u.role === 'admin') return { success: false, error: 'missing' };
    const v = checkHrFile(hr);
    if (!v.ok) return { success: false, error: v.reason };
    this.users = this.users.map(x => {
      if (x.id !== userId) return x;
      const { hr: _old, ...rest } = x;
      return (v.hr ? { ...rest, hr: v.hr } : rest) as User;
    });
    this.notify();
    return { success: true };
  },
  // Évaluations (M5.4). Mêmes règles que le serveur (`checkReview`). Le responsable écrit ; le salarié lit ses fiches partagées et accuse lecture.
  getReviews(): Review[] { return [...this.reviews]; },
  saveReview(d: { id?: string; employee_id?: string; period_start: string; period_end: string; status: 'draft' | 'shared'; objectives: { id: string; text: string; done?: boolean }[]; strengths?: string; comments?: string; improvements?: string; rating?: number | null; snapshot?: Review['snapshot'] }): { success: boolean; error?: string; id?: string } {
    const me = this.currentUser;
    if (!me || me.role !== 'admin') return { success: false, error: 'forbidden' };
    const old = d.id ? this.reviews.find(r => r.id === d.id) : undefined;
    if (d.id && !old) return { success: false, error: 'id' };
    const empId = old ? old.employee_id : String(d.employee_id || '');
    const emp = this.users.find(u => u.id === empId);
    if (!emp || emp.role === 'admin') return { success: false, error: 'employee' };
    const id = old ? old.id : `rv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const rec = { ...(old || {}), ...d, id, employee_id: empId, employee_name: emp.name, rating: d.rating ?? undefined };
    const v = checkReview(rec, old, { id: me.id, admin: true }, now);
    if (!v.ok) return { success: false, error: v.reason };
    this.reviews = old ? this.reviews.map(r => (r.id === id ? (v.save as Review) : r)) : [v.save as Review, ...this.reviews];
    this.notify();
    return { success: true, id };
  },
  /** Le salarié marque sa fiche partagée comme lue. */
  acknowledgeReview(id: string): { success: boolean; error?: string } {
    const me = this.currentUser;
    if (!me) return { success: false, error: 'forbidden' };
    const old = this.reviews.find(r => r.id === id);
    if (!old) return { success: false, error: 'id' };
    const now = new Date().toISOString();
    const v = checkReview({ ...old, acknowledged_at: now }, old, { id: me.id, admin: me.role === 'admin' }, now);
    if (!v.ok) return { success: false, error: v.reason };
    this.reviews = this.reviews.map(r => (r.id === id ? (v.save as Review) : r));
    this.notify();
    return { success: true };
  },
  deleteReview(id: string): { success: boolean; error?: string } {
    if (!this.currentUser || this.currentUser.role !== 'admin') return { success: false, error: 'forbidden' };
    if (!this.reviews.some(r => r.id === id)) return { success: false, error: 'id' };
    this.reviews = this.reviews.filter(r => r.id !== id);
    this.notify();
    return { success: true };
  },
});

export type HrMethods = typeof hrMethods;
