// Assistant IA externe (niveau B, M11.13) côté site. ADMIN SEULEMENT, DÉSACTIVÉ PAR DÉFAUT (case dans Réglages, réglée sur cet appareil).
// Ce qui part : la question tapée + le résumé calculé SANS noms (siteSnapshot). Jamais de noms, de montants détaillés ni de lignes de données.
import { db } from '../db/store';
import { getSnapshot } from './snapshotDb';
import type { Bi } from './assistant';

const KEY = (uid: string) => `df_ai_optin_${uid}`;
export const aiOptIn = (uid: string): boolean => { try { return localStorage.getItem(KEY(uid)) === '1'; } catch { return false; } };
export const setAiOptIn = (uid: string, on: boolean): void => { try { if (on) localStorage.setItem(KEY(uid), '1'); else localStorage.removeItem(KEY(uid)); } catch { /* stockage refusé : reste désactivé */ } };

export const AI_ERRORS: Record<string, Bi> = {
  not_configured: { fr: 'L\'IA externe n\'est pas encore activée sur le serveur (il manque la clé).', en: 'The external AI is not enabled on the server yet (the key is missing).' },
  quota: { fr: 'Le quota gratuit de l\'IA est atteint pour le moment. Réessayez plus tard : les règles continuent de marcher.', en: 'The AI free quota is reached for now. Try again later: the rules keep working.' },
  daily_limit: { fr: 'Limite de questions IA du jour atteinte (20). Les règles continuent de marcher.', en: 'Daily AI question limit reached (20). The rules keep working.' },
  key: { fr: 'La clé de l\'IA est refusée. Il faut la remplacer côté serveur.', en: 'The AI key is refused. It must be replaced on the server.' },
  empty: { fr: 'L\'IA n\'a rien répondu. Reformulez la question.', en: 'The AI gave no answer. Rephrase the question.' },
  demo: { fr: 'L\'IA externe n\'est pas disponible en mode démo.', en: 'The external AI is not available in demo mode.' },
  network: { fr: 'Connexion impossible. Réessayez.', en: 'Connection failed. Try again.' },
  unavailable: { fr: 'L\'IA est indisponible pour le moment.', en: 'The AI is unavailable for now.' },
};
export const aiErrorOf = (code: string): Bi => AI_ERRORS[code] || AI_ERRORS.unavailable;

export type AiAnswer = { ok: true; text: string; left?: number } | { ok: false; error: Bi };
export async function askAi(question: string, lang: 'fr' | 'en'): Promise<AiAnswer> {
  const snap = getSnapshot(); // null si pas admin
  if (!snap) return { ok: false, error: aiErrorOf('admin_only') };
  const r = await db.aiCall('ask', { question, summary: snap, lang });
  if (r.ok && typeof r.data?.text === 'string') return { ok: true, text: r.data.text, left: r.data.left };
  return { ok: false, error: aiErrorOf(r.error || 'unavailable') };
}
