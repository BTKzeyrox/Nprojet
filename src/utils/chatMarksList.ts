// Liste « Importants et épinglés » du chat (étape 1 de la demande de BTK, 2026-11-12) : règles pures, sans écran ni serveur.
// Utilisé par : ChatMarksList.tsx (fenêtre), ChatView.tsx (compteur du bouton). Contrôlé par `npm run check:chat-marks-list`.
// Pour modifier : « Important » = les messages marqués sur CET appareil (privé) ; « Épinglé » = épinglé pour tout le monde. Un message supprimé, caché par la personne ou programmé pas encore parti n'apparaît jamais.
import type { ChatMessage } from '../types';

export type MarkTab = 'important' | 'pinned';
const ts = (v: unknown): number => { const n = Date.parse(String(v || '')); return Number.isFinite(n) ? n : 0; };

/** Texte court d'un message pour la liste : son texte, sinon « Photo », « Fichier : nom » ou « Sondage : question ». */
export function previewOf(m: Pick<ChatMessage, 'message' | 'attachment_url' | 'attachment_name' | 'attachment_kind' | 'poll'>, max = 140): string {
  const text = String(m.message || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  if (m.poll && m.poll.question) return `Sondage : ${String(m.poll.question).replace(/\s+/g, ' ').trim().slice(0, max - 10)}`;
  if (m.attachment_url) return m.attachment_kind === 'image' ? 'Photo' : `Fichier : ${String(m.attachment_name || '').trim() || 'document'}`;
  return '…';
}

export interface MarkedOpts { hidden?: ReadonlySet<string>; inScope?: (m: ChatMessage) => boolean; now?: number }
/** Les messages d'un onglet, du plus récent au plus ancien (épinglés : par date d'épinglage). Aucun doublon. */
export function markedMessages(msgs: readonly ChatMessage[], important: readonly string[], tab: MarkTab, opts: MarkedOpts = {}): ChatMessage[] {
  const imp = new Set(Array.isArray(important) ? important : []);
  const now = opts.now ?? Date.now();
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of Array.isArray(msgs) ? msgs : []) {
    if (!m || typeof m.id !== 'string' || seen.has(m.id) || m.deleted_at) continue;
    if (opts.hidden && opts.hidden.has(m.id)) continue;
    if (m.send_at && m.send_at > now) continue; // programmé, pas encore parti
    if (opts.inScope && !opts.inScope(m)) continue;
    if (tab === 'important' ? !imp.has(m.id) : !m.pinned) continue;
    seen.add(m.id); out.push(m);
  }
  const key = (m: ChatMessage) => (tab === 'pinned' ? ts(m.pinned_at) || ts(m.timestamp) : ts(m.timestamp));
  return out.sort((a, b) => key(b) - key(a));
}
/** Combien de messages sont importants OU épinglés (un message qui est les deux compte une seule fois) : pastille du bouton. */
export function markedCount(msgs: readonly ChatMessage[], important: readonly string[], opts: MarkedOpts = {}): number {
  const ids = new Set<string>();
  for (const tab of ['important', 'pinned'] as MarkTab[]) for (const m of markedMessages(msgs, important, tab, opts)) ids.add(m.id);
  return ids.size;
}
