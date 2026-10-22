// Contrôles « Système » (module 11, M9.2 partie A) : sauvegarde de nuit et erreurs du site. Règles pures.
// Elles ne lisent que des listes que le serveur donne DÉJÀ à l'admin (sauvegardes, erreurs) : aucun appel de plus, aucune table, aucun changement du serveur.
// Limites écrites : pas de quota ni de journal des connexions (partie B, demande un journal serveur) ; si la liste n'est pas chargée, on se tait.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { duration, plural } from './common';

const dayOf = (ms: number): string => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);

/** Dernière sauvegarde plus vieille que le seuil (26 h : la sauvegarde de nuit est à 02 h, heure de Madagascar). */
export const backupMissing: HealthRule = {
  id: 'system.backup-missing', page: 'system',
  run: (ctx) => {
    if (!Array.isArray(ctx.backups)) return [];
    const times = ctx.backups.map(b => Date.parse(String(b.taken_at))).filter(Number.isFinite);
    const T = ctx.thresholds.backup_max_hours, go = { view: 'settings' };
    if (!times.length) {
      return [{
        id: alertId('system', 'backup-missing'), page: 'system', rule: 'backup-missing', severity: 'urgent',
        title_fr: 'Aucune sauvegarde trouvée', title_en: 'No backup found',
        why_fr: 'La liste des sauvegardes est vide : si la base a un problème, rien ne permet de revenir en arrière.', why_en: 'The backup list is empty: if the database has a problem, there is nothing to roll back to.',
        todo_fr: 'Faire une sauvegarde maintenant (Réglages > Sauvegardes) et vérifier la sauvegarde de nuit.', todo_en: 'Take a backup now (Settings > Backups) and check the nightly backup.', since: null, value: 0, go,
      } as HealthAlert];
    }
    const last = Math.max(...times), hours = (ctx.now - last) / 3600_000;
    if (!(hours > T)) return [];
    return [{
      id: alertId('system', 'backup-missing'), page: 'system', rule: 'backup-missing', severity: hours > 2 * T ? 'urgent' : 'watch',
      title_fr: 'La sauvegarde de nuit est en retard', title_en: 'The nightly backup is late',
      why_fr: `Dernière sauvegarde il y a ${duration(hours, 'fr')} (seuil : ${T} h).`, why_en: `Last backup ${duration(hours, 'en')} ago (threshold: ${T} h).`,
      todo_fr: 'Faire une sauvegarde maintenant (Réglages > Sauvegardes) puis vérifier la tâche de nuit.', todo_en: 'Take a backup now (Settings > Backups), then check the nightly job.',
      since: dayOf(last), value: Math.round(hours), go,
    } as HealthAlert];
  },
};

/** Erreurs du site encore ouvertes et revues dans les dernières heures. */
export const recentErrors: HealthRule = {
  id: 'system.recent-errors', page: 'system',
  run: (ctx) => {
    if (!Array.isArray(ctx.errors)) return [];
    const from = ctx.now - ctx.thresholds.error_hours * 3600_000;
    const open = ctx.errors.filter(e => e && e.status !== 'resolved' && e.kind !== 'report' && Number.isFinite(Date.parse(String(e.last_seen))) && Date.parse(String(e.last_seen)) >= from);
    if (!open.length) return [];
    const n = open.length, times = open.reduce((t, e) => t + (Number.isFinite(e.count) && (e.count as number) > 0 ? (e.count as number) : 1), 0);
    const top = [...open].sort((a, b) => (b.count || 1) - (a.count || 1))[0], msg = String(top.message || '').replace(/\s+/g, ' ').slice(0, 80);
    const crash = open.some(e => e.kind === 'crash');
    const since = dayOf(Math.min(...open.map(e => Date.parse(String(e.last_seen)))));
    return [{
      id: alertId('system', 'recent-errors'), page: 'system', rule: 'recent-errors', severity: crash || n >= 5 ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'erreur du site est', 'erreurs du site sont')} ouverte${n > 1 ? 's' : ''} (${ctx.thresholds.error_hours} h)`, title_en: `${n} site ${plural(n, 'error is', 'errors are')} open (${ctx.thresholds.error_hours} h)`,
      why_fr: `${times} fois au total. La plus fréquente : « ${msg || 'sans message'} »${crash ? '. Au moins un plantage complet.' : '.'}`, why_en: `${times} times in total. The most frequent: "${msg || 'no message'}"${crash ? '. At least one full crash.' : '.'}`,
      todo_fr: 'Ouvrir le journal des erreurs, copier le rapport pour le développeur, puis marquer « résolu ».', todo_en: 'Open the error log, copy the report for the developer, then mark it "resolved".',
      since, value: n, go: { view: 'errors' },
    } as HealthAlert];
  },
};

export const SYSTEM_RULES: HealthRule[] = [backupMissing, recentErrors];
