// Feuille du jour SANS réseau (M27.9) : règles pures de la « boîte d'envoi » des feuilles, sans écran, sans serveur, sans stockage. Contrôlé par `npm run check:sheet-outbox`.
// Principe : une feuille enregistrée sans réseau est gardée sur l'appareil avec UN numéro d'action. Au retour du réseau elle est envoyée avec ce numéro
// (en-tête `x-df-action-id`) : le serveur la fait UNE seule fois, même si la réponse s'est perdue et que l'envoi est refait. Rien n'est jamais perdu en silence :
// ce que le serveur refuse (période de paie clôturée entre-temps, date trop ancienne…) reste visible avec la raison écrite, et la personne décide.
// Réutilise la file d'actions de `offline.ts` (mêmes limites, même délai entre essais, mêmes « À revoir »).
import { OFFLINE_DEFAULTS, afterNetworkFailure, afterRejected, afterSent, discard, dueOps, enqueue, expireOld, newOpId, requeue, reviewCodeFor, summary, type Bilingual, type OfflineLimits, type OfflineOp, type Queue, type Role } from './offline';

export const SHEET_ROUTE = 'work-entry';
export type WorkSheet = { date: string; type_label?: string; lines: unknown[] };

/** Message montré à la personne quand la feuille est gardée sur le téléphone (au lieu de « réessaie plus tard »). */
export const SHEET_QUEUED_TEXT: Bilingual = {
  fr: 'Enregistré sur ton téléphone, envoyé au retour du réseau. Tu peux fermer cet écran : rien n\'est perdu.',
  en: 'Saved on your phone, sent when the network is back. You can close this screen: nothing is lost.',
};

/** Ce que la personne reconnaît dans la liste : jour, type et nombre de lignes. */
export function sheetLabel(op: Pick<OfflineOp, 'payload' | 'text'>): { date: string; type: string; lines: number } {
  const p = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Partial<WorkSheet>;
  return { date: typeof p.date === 'string' ? p.date : '', type: typeof p.type_label === 'string' ? p.type_label : '', lines: Array.isArray(p.lines) ? p.lines.length : 0 };
}

/** Met une feuille dans la file. Refuse avec une raison claire (rôle non autorisé, trop gros, file pleine). `id` : le numéro déjà utilisé au premier envoi (le serveur reconnaît ainsi un envoi refait). */
export function queueSheet(queue: Queue, sheet: WorkSheet, role: Role, nowIso: string, limits: OfflineLimits = OFFLINE_DEFAULTS, id: string = newOpId()): { queue: Queue; id?: string; error?: Bilingual } {
  const label = [sheet.type_label || '', sheet.date || ''].filter(Boolean).join(' · ');
  const op: OfflineOp = { id, kind: 'call', route: SHEET_ROUTE, payload: sheet, created_at: nowIso, tries: 0, state: 'pending', bytes: 0, text: label || undefined };
  const r = enqueue(queue, op, role, limits);
  return r.error ? { queue, error: r.why } : { queue: r.queue, id: op.id };
}

export type Answer = { status: number; error?: string; code?: string };
/**
 * Applique la réponse du serveur à une feuille envoyée :
 *  - réussi (2xx) → sort de la file ;
 *  - panne, coupure, connexion expirée, trop d'appels → reste en attente (nouvel essai plus tard) ;
 *  - refus clair du serveur → « À revoir » avec la raison écrite par le serveur.
 */
export function applyAnswer(queue: Queue, id: string, a: Answer, nowIso: string): { queue: Queue; outcome: 'sent' | 'waiting' | 'review' } {
  if (a.status >= 200 && a.status < 300) return { queue: afterSent(queue, [id]), outcome: 'sent' };
  const code = reviewCodeFor(a.status, a.code);
  if (!code) return { queue: afterNetworkFailure(queue, id, nowIso), outcome: 'waiting' };
  const q = afterRejected(queue, id, code).map(o => (o.id === id ? { ...o, review_note: typeof a.error === 'string' ? a.error.slice(0, 300) : undefined } : o));
  return { queue: q, outcome: 'review' };
}

/** Les feuilles à envoyer maintenant : les plus anciennes d'abord, UNE à la fois (l'ordre est gardé, jamais deux en parallèle). */
export const nextSheet = (queue: Queue, nowIso: string, online: boolean): OfflineOp | null => dueOps(queue, nowIso, online, 1)[0] || null;

/** Une feuille restée plus de `operator_days` jours sans partir passe dans « À revoir » (le serveur refuse de toute façon un jour de plus de 31 jours). */
export const expireSheets = (queue: Queue, nowIso: string, role: Role, limits: OfflineLimits = OFFLINE_DEFAULTS): Queue => expireOld(queue, nowIso, role, limits);

export const sheetCounts = (queue: Queue): { pending: number; review: number; lines: number } => {
  const s = summary(queue);
  return { pending: s.pending, review: s.review, lines: queue.filter(o => o.state === 'pending').reduce((t, o) => t + sheetLabel(o).lines, 0) };
};

/** Raison montrée pour une feuille dans « À revoir » : celle du serveur si elle existe, sinon le texte standard. */
export function sheetReviewReason(op: OfflineOp, lang: string): string {
  if (op.review_note) return op.review_note;
  return op.review_code === 'too_old' ? (lang === 'en' ? 'The sheet stayed on the phone too long: it was not sent automatically.' : 'La feuille est restée trop longtemps sur le téléphone : elle n\'a pas été envoyée automatiquement.') : (lang === 'en' ? 'The server refused this sheet.' : 'Le serveur a refusé cette feuille.');
}

/** Relit la file gardée sur l'appareil : tout ce qui n'est pas une feuille valide est ignoré (jamais d'erreur). */
export function parseStored(raw: string | null | undefined): Queue {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((o: any) => o && typeof o.id === 'string' && o.kind === 'call' && o.route === SHEET_ROUTE && (o.state === 'pending' || o.state === 'review') && o.payload && typeof o.payload === 'object' && Number.isFinite(Date.parse(o.created_at)));
  } catch { return []; }
}

export { discard as discardSheet, requeue as requeueSheet };
