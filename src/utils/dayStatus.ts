// Statut d'une journée pour un opérateur (calendrier individuel ET calendrier global : la MÊME règle, donc les mêmes chiffres). Pur, sans écran.
import type { AppSettings, DayStatus, PostSession } from '../types';
import { isLateDay } from './attendance';
import { isWorkDay } from './workDays';
import { isWorkLine } from './postPay';

/** Statut donné par les LIGNES DE LA FEUILLE DU JOUR (présence, heures, quantité) : suit la valeur saisie, pas l'heure de début ni le score. Une ligne refusée ne compte pas ; une ligne en attente de validation compte (le détail du jour la marque « en attente »). */
export function presenceDayStatus(lines: PostSession[]): DayStatus | null {
  const kept = lines.filter(l => l.status !== 'rejected' && l.status !== 'force_released');
  if (kept.length === 0) return null;
  const val = (l: PostSession) => (l as any).presence as string | undefined;
  const here = kept.filter(l => val(l) !== 'absent'); // pas de valeur de présence (quantité, tâches, heures) = la personne a travaillé
  if (here.length === 0) return 'absent';
  if (here.every(l => val(l) === 'late')) return 'late';
  return 'objective_reached';
}

export function dayStatus(shifts: PostSession[], dateStr: string, firstActivity: string | null, today: string, cfg: AppSettings, onLeave = false): DayStatus {
  // Congé ACCEPTÉ (M5.2) : le jour n'est ni une absence ni un retard, sauf si une mission a vraiment été travaillée ce jour-là
  if (onLeave && isWorkDay(dateStr, (cfg as any).work_days) && !shifts.some(s => s.status !== 'rejected' && s.status !== 'force_released')) return 'leave';
  const lines = shifts.filter(isWorkLine);
  if (lines.length > 0) { // la feuille du jour fait foi pour la présence ; les missions (s'il y en a) peuvent seulement la compléter
    const rest = shifts.filter(s => !isWorkLine(s));
    const pres = presenceDayStatus(lines);
    const base = rest.length > 0 ? dayStatus(rest, dateStr, firstActivity, today, cfg, false) : null;
    if (pres === 'absent' && base === null && onLeave && isWorkDay(dateStr, (cfg as any).work_days)) return 'leave'; // absent saisi sur un congé accepté : jour de congé, pas absence
    if (base === 'test' || base === 'in_progress') return base;
    if (pres && (base === null || base === 'absent' || base === 'no_post')) return pres;
    if (base) return base;
    return dayStatus([], dateStr, firstActivity, today, cfg, onLeave); // toutes les lignes refusées : comme sans saisie
  }
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
