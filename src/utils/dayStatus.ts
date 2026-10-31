// Statut d'une journée pour un opérateur (calendrier individuel ET calendrier global : la MÊME règle, donc les mêmes chiffres). Pur, sans écran.
import type { AppSettings, DayStatus, PostSession } from '../types';
import { isLateDay } from './attendance';
import { isWorkDay } from './workDays';

export function dayStatus(shifts: PostSession[], dateStr: string, firstActivity: string | null, today: string, cfg: AppSettings, onLeave = false): DayStatus {
  // Congé ACCEPTÉ (M5.2) : le jour n'est ni une absence ni un retard, sauf si une mission a vraiment été travaillée ce jour-là
  if (onLeave && isWorkDay(dateStr, (cfg as any).work_days) && !shifts.some(s => s.status !== 'rejected' && s.status !== 'force_released')) return 'leave';
  if (shifts.length > 0) {
    const hasInProgress = shifts.some(s => s.status === 'active' || s.status === 'pending_start' || s.status === 'pending_end');
    const isTest = shifts.some(s => s.client_name.toLowerCase().includes('test') || s.account_tag.toLowerCase().includes('qa'));
    const allCompleted = shifts.every(s => s.status === 'completed');
    const reached = shifts.some(s => s.status === 'completed' && (s.final_score ?? s.current_score) >= s.target_score);
    const worked = shifts.filter(s => s.status !== 'rejected' && s.status !== 'force_released');
    if (isTest) return 'test';
    if (hasInProgress) return 'in_progress';
    if (worked.length > 0 && isLateDay(worked, cfg)) return 'late';
    if (reached || allCompleted) return 'objective_reached';
    return 'absent';
  }
  // Jour passé qui est un jour de travail (Réglages ; par défaut lundi à samedi) depuis la première activité, sans aucune session = absence
  if (firstActivity && dateStr >= firstActivity && dateStr < today) {
    if (isWorkDay(dateStr, (cfg as any).work_days)) return 'absent';
  }
  return 'no_post';
}
