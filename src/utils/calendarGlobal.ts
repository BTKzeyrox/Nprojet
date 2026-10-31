// Calendrier GLOBAL (tous les employés) : mois, résumé et vue du jour. Règles pures, sans écran, sans réseau ; contrôlé par `npm run check:calendar-global`.
// Chaque jour de chaque employé est jugé par `dayStatus` (la même règle que le calendrier d'un seul employé) : les totaux globaux sont la somme exacte des calendriers individuels.
import type { AppSettings, DayStatus, PostSession, User } from '../types';
import type { Leave, LeaveType } from './leaves';
import { dayStatus } from './dayStatus';
import { isWorkDay } from './workDays';
import { toMin } from './attendance';
import { effShift } from './shiftMode';

export type LeaveFilter = 'all' | 'approved' | 'pending';
export interface CalCtx { posts: PostSession[]; leaves: Leave[]; today: string; cfg: AppSettings; clientFilter?: string }
export interface EmpDay { dateStr: string; day: number; status: DayStatus; missions: number; validated: number; pay: number; leave: LeaveType | null; pendingLeave: boolean }

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const OPEN = ['active', 'pending_start', 'pending_end'];
const WORKED_STATUS: DayStatus[] = ['objective_reached', 'late', 'in_progress', 'test'];
const isRestDay = (dateStr: string, workDays?: unknown) => !isWorkDay(dateStr, workDays); // jour de repos = jour non coché dans Réglages

/** Première date d'activité de chaque employé (début du suivi des absences). */
export function firstActivityOf(posts: PostSession[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of posts) if (!map[p.employee_id] || p.date < map[p.employee_id]) map[p.employee_id] = p.date;
  return map;
}

const leaveKind = (leaves: Leave[], empId: string, date: string, status: 'approved' | 'pending', workDays?: unknown): LeaveType | null => {
  if (!isWorkDay(date, workDays)) return null; // un jour de repos (Réglages) n'est jamais « en congé »
  for (const l of leaves) if (l.employee_id === empId && l.status === status && l.start_date <= date && date <= l.end_date) return l.type;
  return null;
};

/** Les jours d'un mois pour un employé. Même calcul que l'ancien calendrier individuel (le filtre de mission ne change pas le statut, seulement les chiffres). */
export function empMonth(year: number, month: number, empId: string, ctx: CalCtx, first: Record<string, string>): EmpDay[] {
  const mine = ctx.posts.filter(p => p.employee_id === empId);
  const n = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const dateStr = ymd(year, month, i + 1);
    const all = mine.filter(p => p.date === dateStr);
    const shown = ctx.clientFilter && ctx.clientFilter !== 'all' ? all.filter(p => p.client_name === ctx.clientFilter) : all;
    const leave = leaveKind(ctx.leaves, empId, dateStr, 'approved', (ctx.cfg as any).work_days);
    return {
      dateStr, day: i + 1,
      status: dayStatus(all, dateStr, first[empId] || null, ctx.today, ctx.cfg, leave !== null),
      missions: shown.length,
      validated: shown.filter(p => p.status === 'completed').length,
      pay: shown.filter(p => p.status === 'completed').reduce((a, p) => a + (p.calculated_ar || 0), 0),
      leave, pendingLeave: leaveKind(ctx.leaves, empId, dateStr, 'pending', (ctx.cfg as any).work_days) !== null,
    };
  });
}

export interface GlobalDay {
  dateStr: string; day: number;
  counts: Record<DayStatus, number>;
  present: number; // ont travaillé (objectif, retard, en cours, test)
  late: number; absent: number; onLeave: number; pendingLeave: number;
  missions: number; validated: number; pay: number;
  leaveNames: string[]; // en congé accepté ce jour-là
  pendingNames: string[]; // demande de congé en attente ce jour-là
}
const zeroCounts = (): Record<DayStatus, number> => ({ objective_reached: 0, late: 0, absent: 0, no_post: 0, test: 0, in_progress: 0, leave: 0 });

/** Le mois de tous les employés donnés : une case par jour, avec le nombre de présents, retards, absents, congés, missions et la paie. */
export function globalMonth(year: number, month: number, emps: User[], ctx: CalCtx, first: Record<string, string>): GlobalDay[] {
  const n = new Date(year, month + 1, 0).getDate();
  const per = emps.map(e => ({ e, days: empMonth(year, month, e.id, ctx, first) }));
  return Array.from({ length: n }, (_, i) => {
    const counts = zeroCounts(), leaveNames: string[] = [], pendingNames: string[] = [];
    let missions = 0, validated = 0, pay = 0;
    for (const { e, days } of per) {
      const d = days[i];
      counts[d.status]++; missions += d.missions; validated += d.validated; pay += d.pay;
      if (d.leave) leaveNames.push(e.name);
      if (d.pendingLeave) pendingNames.push(e.name);
    }
    const present = WORKED_STATUS.reduce((a, s) => a + counts[s], 0);
    return { dateStr: ymd(year, month, i + 1), day: i + 1, counts, present, late: counts.late, absent: counts.absent, onLeave: counts.leave, pendingLeave: pendingNames.length, missions, validated, pay, leaveNames, pendingNames };
  });
}

export interface EmpSummary { id: string; name: string; workedDays: number; absences: number; lateDays: number; leaveDays: number; missions: number; validated: number; refused: number; pay: number }
export interface GlobalSummary {
  employees: number; workedDays: number; absences: number; lateDays: number; leaveDays: number; pendingLeaveDays: number;
  missions: number; validated: number; refused: number; inProgress: number; pay: number; advApproved: number; advPending: number; net: number;
  rows: EmpSummary[];
}

/** Le résumé du mois pour tous les employés donnés : totaux + une ligne par employé (la somme des lignes = les totaux). `leaveDays` ne compte pas les dimanches (repos). */
export function globalSummary(year: number, month: number, emps: User[], ctx: CalCtx, first: Record<string, string>, advances: { employee_id: string; request_date: string; status: string; amount_ar: number }[] = []): GlobalSummary {
  const prefix = `${year}-${pad(month + 1)}-`;
  const rows: EmpSummary[] = emps.map(e => {
    const days = empMonth(year, month, e.id, ctx, first);
    const mine = ctx.posts.filter(p => p.employee_id === e.id && p.date.startsWith(prefix) && (!ctx.clientFilter || ctx.clientFilter === 'all' || p.client_name === ctx.clientFilter));
    return {
      id: e.id, name: e.name,
      workedDays: days.filter(d => WORKED_STATUS.includes(d.status)).length,
      absences: days.filter(d => d.status === 'absent').length,
      lateDays: days.filter(d => d.status === 'late').length,
      leaveDays: days.filter(d => d.status === 'leave' && !isRestDay(d.dateStr, (ctx.cfg as any).work_days)).length,
      missions: mine.length,
      validated: mine.filter(p => p.status === 'completed').length,
      refused: mine.filter(p => p.status === 'rejected').length,
      pay: mine.filter(p => p.status === 'completed').reduce((a, p) => a + (p.calculated_ar || 0), 0),
    };
  });
  const sum = (f: (r: EmpSummary) => number) => rows.reduce((a, r) => a + f(r), 0);
  const ids = new Set(emps.map(e => e.id));
  const myAdv = advances.filter(a => ids.has(a.employee_id) && a.request_date.startsWith(prefix));
  const advApproved = myAdv.filter(a => a.status === 'approved').reduce((a, x) => a + x.amount_ar, 0);
  const advPending = myAdv.filter(a => a.status === 'pending').reduce((a, x) => a + x.amount_ar, 0);
  const pendingLeaveDays = emps.reduce((a, e) => a + empMonth(year, month, e.id, ctx, first).filter(d => d.pendingLeave && !isRestDay(d.dateStr, (ctx.cfg as any).work_days)).length, 0);
  const inProgress = ctx.posts.filter(p => ids.has(p.employee_id) && p.date.startsWith(prefix) && OPEN.includes(p.status) && (!ctx.clientFilter || ctx.clientFilter === 'all' || p.client_name === ctx.clientFilter)).length;
  const pay = sum(r => r.pay);
  return {
    employees: emps.length, workedDays: sum(r => r.workedDays), absences: sum(r => r.absences), lateDays: sum(r => r.lateDays), leaveDays: sum(r => r.leaveDays), pendingLeaveDays,
    missions: sum(r => r.missions), validated: sum(r => r.validated), refused: sum(r => r.refused), inProgress, pay, advApproved, advPending, net: pay - advApproved, rows,
  };
}

export interface DayRow {
  id: string; name: string; shift: 'day' | 'night'; status: DayStatus; leave: LeaveType | null; pendingLeave: boolean;
  firstStart: string | null; lastEnd: string | null; open: boolean; lateMin: number;
  missions: number; validated: number; refused: number; pay: number;
}
const ORDER: DayStatus[] = ['in_progress', 'late', 'objective_reached', 'test', 'absent', 'leave', 'no_post'];

/** La vue d'un jour : une ligne par employé, avec son statut ce jour-là, l'heure de sa première mission et sa dernière fin. Triée : en cours, retards, présents, absents, congés. */
export function dayView(dateStr: string, emps: User[], ctx: CalCtx, first: Record<string, string>): DayRow[] {
  const rows: DayRow[] = emps.map(e => {
    const all = ctx.posts.filter(p => p.employee_id === e.id && p.date === dateStr);
    const worked = all.filter(p => p.status !== 'rejected' && p.status !== 'force_released').sort((a, b) => a.start_time.localeCompare(b.start_time));
    const leave = leaveKind(ctx.leaves, e.id, dateStr, 'approved', (ctx.cfg as any).work_days);
    const status = dayStatus(all, dateStr, first[e.id] || null, ctx.today, ctx.cfg, leave !== null);
    const firstStart = worked.length ? worked[0].start_time.slice(0, 5) : null;
    const base = effShift(e.shift, ctx.cfg.shift_mode) === 'night' ? ctx.cfg.night_shift_start : ctx.cfg.day_shift_start;
    const diff = firstStart ? toMin(firstStart) - toMin(base) : 0;
    const ends = worked.filter(p => p.end_time).map(p => p.end_time!.slice(0, 5)).sort();
    return {
      id: e.id, name: e.name, shift: e.shift === 'night' ? 'night' : 'day', status, leave, pendingLeave: leaveKind(ctx.leaves, e.id, dateStr, 'pending', (ctx.cfg as any).work_days) !== null,
      firstStart, lastEnd: ends.length ? ends[ends.length - 1] : null, open: all.some(p => OPEN.includes(p.status)),
      lateMin: status === 'late' && diff > 0 && diff < 12 * 60 ? diff : 0,
      missions: all.length, validated: all.filter(p => p.status === 'completed').length, refused: all.filter(p => p.status === 'rejected').length,
      pay: all.filter(p => p.status === 'completed').reduce((a, p) => a + (p.calculated_ar || 0), 0),
    };
  });
  return rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
}

/** Filtre « congés » : garde les employés qui ont un congé (accepté ou en attente) pendant le mois. */
export function hasLeaveInMonth(leaves: Leave[], empId: string, year: number, month: number, kind: LeaveFilter): boolean {
  if (kind === 'all') return true;
  const start = ymd(year, month, 1), end = ymd(year, month, new Date(year, month + 1, 0).getDate());
  return leaves.some(l => l.employee_id === empId && l.status === kind && l.start_date <= end && l.end_date >= start);
}
