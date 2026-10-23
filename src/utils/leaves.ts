// Congés et absences (module 5, M5.2) : règles pures, sans écran ni serveur.
// Une demande vit dans la table `df_leaves` (collection `leaves`). Le salarié la crée (en attente), l'admin l'accepte ou la refuse (motif obligatoire au refus).
// Un congé ACCEPTÉ apparaît au calendrier et n'est plus compté comme jour manqué (absence) ni comme alerte d'absence.
// `cleanLeave` a une copie exacte dans le bloc LEAVES de `supabase/functions/df-api/index.ts` : `npm run check:leaves` compare les deux.
// IMPORTANT : le bloc « BEGIN LEAVECLEAN … END LEAVECLEAN » ne doit utiliser ni import ni constante extérieure.

export type LeaveType = 'paid' | 'unpaid' | 'sick' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface Leave {
  id: string;
  employee_id: string;
  employee_name: string;
  type: LeaveType;
  start_date: string; // AAAA-MM-JJ
  end_date: string; // AAAA-MM-JJ, au plus 90 jours après le début
  days: number; // jours OUVRÉS calculés par le serveur (jamais saisis)
  reason?: string;
  status: LeaveStatus;
  decision_reason?: string;
  decided_by?: string;
  decided_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// BEGIN LEAVECLEAN
const LV_TYPES = ['paid', 'unpaid', 'sick', 'other'];
const LV_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];
const LV_MAX_SPAN = 90;
const lvDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '2000-01-01' && v <= '2100-12-31' ? v : null;
};
const lvShift = (v: string, n: number): string => { const d = new Date(v + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Jours ouvrés de `start` à `end` compris. perWeek = jours travaillés par semaine (Conditions) : 6 (défaut, dimanche = repos), 5 (samedi aussi), 7 (aucun repos) ; 0 ou faux = 6. Limité à l'année `year` si fourni. */
function leaveWorkingDays(start: string, end: string, perWeek: number, year?: number): number {
  const pw = perWeek === 5 || perWeek === 7 ? perWeek : 6;
  let n = 0, d = start, guard = 0;
  while (d <= end && guard++ < 400) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay(); // 0 = dimanche, 6 = samedi
    const off = pw === 7 ? false : pw === 6 ? dow === 0 : dow === 0 || dow === 6;
    if (!off && (year === undefined || Number(d.slice(0, 4)) === year)) n++;
    d = lvShift(d, 1);
  }
  return n;
}
/** Jours de congé PAYÉ déjà pris ou demandés (acceptés ou en attente) pendant l'année `year`, sans la demande `exceptId`. */
function leavePaidUsed(others: any[], year: number, perWeek: number, exceptId: string): number {
  let used = 0;
  for (const o of others || []) {
    if (!o || o.id === exceptId || o.type !== 'paid' || (o.status !== 'approved' && o.status !== 'pending')) continue;
    if (!lvDate(o.start_date) || !lvDate(o.end_date)) continue;
    used += leaveWorkingDays(o.start_date, o.end_date, perWeek, year);
  }
  return used;
}
/**
 * Vérifie une demande de congé et applique le changement demandé. Le serveur ne fait jamais confiance au navigateur.
 * actor : { id, name, admin } (admin = responsable). ctx : { today, allowance (jours par an, 0 = pas de solde), perWeek, others (les autres demandes du même salarié) }.
 * Création : le salarié ne crée que SA demande « en attente » ; l'admin peut créer pour un salarié (en attente ou déjà acceptée). Dates, type et motif ne changent plus après la création.
 * Changement d'état : en attente → acceptée / refusée (admin ; refus = motif de 3 caractères ou plus) ; en attente → annulée (le salarié ou l'admin) ;
 * acceptée → annulée (le salarié seulement si le congé n'a pas commencé ; l'admin avec un motif). Refusée et annulée ne changent plus.
 */
function cleanLeave(rec: any, existing: any, actor: { id: string; name: string; admin: boolean }, now: string, ctx: { today: string; allowance: number; perWeek: number; others: any[] }): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || typeof rec.id !== 'string' || !rec.id || rec.id.length > 80) return { ok: false, reason: 'id' };
  const text = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
  const status = typeof rec.status === 'string' && LV_STATUS.includes(rec.status) ? rec.status : null;
  if (!status) return { ok: false, reason: 'status' };
  if (!existing) {
    const empId = actor.admin ? (typeof rec.employee_id === 'string' ? rec.employee_id : '') : actor.id;
    if (!empId || empId.length > 80) return { ok: false, reason: 'employee' };
    if (!actor.admin && rec.employee_id !== actor.id) return { ok: false, reason: 'employee' };
    if (!actor.admin && status !== 'pending') return { ok: false, reason: 'status' };
    if (actor.admin && status !== 'pending' && status !== 'approved') return { ok: false, reason: 'status' };
    if (typeof rec.type !== 'string' || !LV_TYPES.includes(rec.type)) return { ok: false, reason: 'type' };
    const start = lvDate(rec.start_date), end = lvDate(rec.end_date);
    if (!start || !end || end < start) return { ok: false, reason: 'dates' };
    if (lvShift(start, LV_MAX_SPAN) < end) return { ok: false, reason: 'span' };
    if (start < lvShift(ctx.today, -30)) return { ok: false, reason: 'past' }; // au plus 30 jours en arrière (maladie déclarée en retard)
    if (start > lvShift(ctx.today, 365)) return { ok: false, reason: 'future' };
    const days = leaveWorkingDays(start, end, ctx.perWeek);
    if (days < 1) return { ok: false, reason: 'no_working_day' };
    for (const o of ctx.others || []) {
      if (o && o.id !== rec.id && (o.status === 'pending' || o.status === 'approved') && lvDate(o.start_date) && lvDate(o.end_date) && o.start_date <= end && start <= o.end_date) return { ok: false, reason: 'overlap' };
    }
    if (rec.type === 'paid' && ctx.allowance > 0) {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        const want = leaveWorkingDays(start, end, ctx.perWeek, y);
        if (want > 0 && leavePaidUsed(ctx.others, y, ctx.perWeek, rec.id) + want > ctx.allowance) return { ok: false, reason: 'balance' };
      }
    }
    const reason = text(rec.reason, 300);
    const save: any = { id: rec.id, employee_id: empId, employee_name: text(actor.admin ? (rec.employee_name || '') : actor.name, 80), type: rec.type, start_date: start, end_date: end, days, status, created_by: actor.id, created_at: now, updated_at: now };
    if (reason) save.reason = reason;
    if (status === 'approved') { save.decided_by = actor.id; save.decided_at = now; }
    return { ok: true, save };
  }
  // Modification d'une demande qui existe : seul l'état peut changer.
  if (!actor.admin && existing.employee_id !== actor.id) return { ok: false, reason: 'forbidden' };
  if (status === existing.status) return { ok: true, save: existing }; // rien ne change (les autres champs envoyés sont ignorés)
  const decision = text(rec.decision_reason, 300);
  const from = existing.status;
  const started = lvDate(existing.start_date) !== null && existing.start_date <= ctx.today;
  let allowed = false;
  if (from === 'pending' && status === 'approved') allowed = actor.admin;
  else if (from === 'pending' && status === 'rejected') { allowed = actor.admin; if (allowed && decision.length < 3) return { ok: false, reason: 'decision_reason' }; }
  else if (from === 'pending' && status === 'cancelled') allowed = true;
  else if (from === 'approved' && status === 'cancelled') {
    allowed = actor.admin || !started;
    if (actor.admin && decision.length < 3) return { ok: false, reason: 'decision_reason' };
  }
  if (!allowed) return { ok: false, reason: 'transition' };
  if (status === 'approved') {
    const start = existing.start_date, end = existing.end_date;
    for (const o of ctx.others || []) {
      if (o && o.id !== existing.id && o.status === 'approved' && lvDate(o.start_date) && lvDate(o.end_date) && o.start_date <= end && start <= o.end_date) return { ok: false, reason: 'overlap' };
    }
    if (existing.type === 'paid' && ctx.allowance > 0) {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        const want = leaveWorkingDays(start, end, ctx.perWeek, y);
        if (want > 0 && leavePaidUsed(ctx.others, y, ctx.perWeek, existing.id) + want > ctx.allowance) return { ok: false, reason: 'balance' };
      }
    }
  }
  const save: any = { ...existing, status, updated_at: now };
  if (actor.admin && (status === 'approved' || status === 'rejected' || status === 'cancelled')) {
    save.decided_by = actor.id; save.decided_at = now;
    if (decision) save.decision_reason = decision; else delete save.decision_reason;
  }
  if (!actor.admin && status === 'cancelled') { save.decided_by = actor.id; save.decided_at = now; delete save.decision_reason; }
  return { ok: true, save };
}
// END LEAVECLEAN

export const workingDays = leaveWorkingDays;
export const checkLeave = cleanLeave;
export const paidUsed = leavePaidUsed;
export const LEAVE_TYPES = LV_TYPES as LeaveType[];

export const LEAVE_TYPE_LABELS: Record<LeaveType, [string, string]> = {
  paid: ['Congé payé', 'Paid leave'], unpaid: ['Congé sans solde', 'Unpaid leave'], sick: ['Maladie', 'Sick leave'], other: ['Autre absence', 'Other absence'],
};
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, [string, string]> = {
  pending: ['En attente', 'Pending'], approved: ['Accepté', 'Approved'], rejected: ['Refusé', 'Refused'], cancelled: ['Annulé', 'Cancelled'],
};
/** Message court pour une raison de refus du serveur ou des règles. */
export function leaveReasonText(reason: string, lang: 'fr' | 'en' = 'fr'): string {
  const m: Record<string, [string, string]> = {
    id: ['Demande illisible.', 'Unreadable request.'], status: ['État de la demande incorrect.', 'Wrong request state.'], employee: ['Salarié incorrect.', 'Wrong employee.'],
    type: ['Choisis un type de congé.', 'Choose a leave type.'], dates: ['Dates incorrectes (la fin ne peut pas être avant le début).', 'Wrong dates (the end cannot be before the start).'],
    span: [`Une demande dure ${LV_MAX_SPAN} jours au plus.`, `A request lasts at most ${LV_MAX_SPAN} days.`], past: ['Début trop ancien (30 jours en arrière au plus).', 'Start too old (30 days back at most).'],
    future: ['Début trop lointain (un an au plus).', 'Start too far away (one year at most).'], no_working_day: ['Aucun jour ouvré dans ces dates.', 'No working day in these dates.'],
    overlap: ['Ces dates chevauchent une autre demande.', 'These dates overlap another request.'], balance: ['Pas assez de jours de congé payé restants cette année.', 'Not enough paid leave days left this year.'],
    decision_reason: ['Écris un motif (3 caractères au moins).', 'Write a reason (at least 3 characters).'], transition: ["Ce changement n'est pas permis.", 'This change is not allowed.'], forbidden: ['Interdit.', 'Forbidden.'],
  };
  const x = m[reason];
  return x ? x[lang === 'en' ? 1 : 0] : (lang === 'en' ? 'Request refused.' : 'Demande refusée.');
}

/** Congé ACCEPTÉ d'un salarié qui couvre ce jour ? (Ne dit pas si le jour est ouvré : dimanche reste un repos.) */
export function leaveOn(leaves: Pick<Leave, 'employee_id' | 'start_date' | 'end_date' | 'status' | 'type'>[] | undefined, employeeId: string, date: string): Leave['type'] | null {
  for (const l of leaves || []) if (l.employee_id === employeeId && l.status === 'approved' && l.start_date <= date && date <= l.end_date) return l.type;
  return null;
}

/** Solde de congé payé d'une année : { allowance, used (accepté), pending (en attente), left }. allowance 0 = pas de solde réglé → left null. */
export function leaveBalance(leaves: Leave[] | undefined, employeeId: string, year: number, allowance: number, perWeek: number) {
  let used = 0, pending = 0;
  for (const l of leaves || []) {
    if (l.employee_id !== employeeId || l.type !== 'paid') continue;
    const d = leaveWorkingDays(l.start_date, l.end_date, perWeek, year);
    if (l.status === 'approved') used += d; else if (l.status === 'pending') pending += d;
  }
  const a = Number.isFinite(allowance) && allowance > 0 ? Math.round(allowance) : 0;
  return { allowance: a, used, pending, left: a > 0 ? Math.max(0, a - used - pending) : null as number | null };
}
