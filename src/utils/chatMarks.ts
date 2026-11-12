// Repères sur les messages du chat (2026-11-12) : Important (privé, gardé sur l'appareil), Épinglé (existant), Transféré (nouveau).
// Chacun a sa couleur de bulle. Si plusieurs s'appliquent : Important > Épinglé > Transféré.
// `cleanForwarded` est copiée dans df-api (bloc FORWARD) ; `npm run check:chat-marks` compare les deux.
import type { ChatMessage } from '../types';

export type Mark = 'important' | 'pinned' | 'forwarded';
export const MARK_STYLE: Record<Mark, { bg: string; border: string; fr: string; en: string }> = {
  important: { bg: '#e11d48', border: '#be123c', fr: 'Important', en: 'Important' },
  pinned: { bg: '#d97706', border: '#b45309', fr: 'Épinglé', en: 'Pinned' },
  forwarded: { bg: '#7c3aed', border: '#6d28d9', fr: 'Transféré', en: 'Forwarded' },
};
export const IMPORTANT_MAX = 300;

/** Le repère qui colore la bulle (un message supprimé n'en a aucun). */
export function markOf(m: Pick<ChatMessage, 'pinned' | 'forwarded' | 'deleted_at' | 'id'>, important: readonly string[]): Mark | null {
  if (!m || m.deleted_at) return null;
  if (important.includes(m.id)) return 'important';
  if (m.pinned) return 'pinned';
  if (m.forwarded) return 'forwarded';
  return null;
}
/** Tous les repères d'un message (pour les petites icônes sous la bulle). */
export function marksOf(m: Pick<ChatMessage, 'pinned' | 'forwarded' | 'deleted_at' | 'id'>, important: readonly string[]): Mark[] {
  if (!m || m.deleted_at) return [];
  const r: Mark[] = [];
  if (important.includes(m.id)) r.push('important');
  if (m.pinned) r.push('pinned');
  if (m.forwarded) r.push('forwarded');
  return r;
}
/** Ajoute ou retire un message de la liste des importants (les plus anciens partent au-delà de IMPORTANT_MAX). */
export function toggleImportant(list: readonly string[], id: string): string[] {
  const l = Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
  if (typeof id !== 'string' || !id) return l;
  return l.includes(id) ? l.filter(x => x !== id) : [...l, id].slice(-IMPORTANT_MAX);
}
/** Peut-on transférer ce message ? Pas un message supprimé, programmé ou un sondage. */
export function canForward(m: Pick<ChatMessage, 'deleted_at' | 'send_at' | 'poll' | 'message' | 'attachment_url'>): boolean {
  return !!m && !m.deleted_at && !m.send_at && !m.poll && !!(String(m.message || '').trim() || m.attachment_url);
}
/** D'où vient le message transféré : l'auteur d'origine (un message déjà transféré garde son auteur d'origine). */
export function forwardFrom(m: Pick<ChatMessage, 'sender_name' | 'forwarded'>): string {
  return String((m.forwarded && m.forwarded.from) || m.sender_name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// ===== BEGIN FORWARD (copie exacte de cleanForwarded de src/utils/chatMarks.ts ; contrôlée par scripts/check-chat-marks.ts) =====
export function cleanForwarded(v: any): { from: string } | null {
  if (!v || typeof v !== "object" || typeof v.from !== "string") return null;
  const from = v.from.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return from ? { from } : null;
}
// ===== END FORWARD =====
