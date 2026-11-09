// Messagerie S4 (2026-11-09) : modèles de messages personnels (réponses rapides, gardés sur CET appareil) et règle du message programmé.
// Utilisé par : components/MessageTools.tsx. La règle d'heure (1 minute à 30 jours) est la même que celle du serveur (checkMessage de df-api).
import { remMs, remDateOf } from './reminderRules';

export const TPL_MAX = 20;
export const TPL_MAX_LEN = 500;
const key = (uid: string) => `df_chat_tpl_${uid}`;

export function getTemplates(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.slice(0, TPL_MAX_LEN)).slice(0, TPL_MAX) : [];
  } catch { return []; }
}
const put = (uid: string, list: string[]): string[] => { try { localStorage.setItem(key(uid), JSON.stringify(list)); } catch { /* stockage refusé : la liste reste pour cette séance seulement */ } return list; };
/** Ajoute un modèle (le même texte n'est jamais gardé deux fois ; 20 au plus, le plus ancien part). */
export function addTemplate(uid: string, text: string): string[] {
  const t = text.replace(/\r/g, '').trim().slice(0, TPL_MAX_LEN);
  const cur = getTemplates(uid);
  if (!t) return cur;
  return put(uid, [t, ...cur.filter(x => x !== t)].slice(0, TPL_MAX));
}
export const removeTemplate = (uid: string, index: number): string[] => put(uid, getTemplates(uid).filter((_, i) => i !== index));

/** Heure d'envoi (Madagascar) → millisecondes, ou la raison du refus. */
export function scheduleAt(date: string, time: string, nowMs: number): { ok: true; ms: number } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: 'Choisis une date et une heure.' };
  const ms = remMs(date, time);
  if (ms < nowMs + 60000) return { ok: false, error: 'Choisis une heure dans le futur.' };
  if (ms > nowMs + 30 * 86400000) return { ok: false, error: 'Au plus 30 jours à l\'avance.' };
  return { ok: true, ms };
}
export const scheduleLabel = (ms: number): string => { const d = remDateOf(ms); const t = new Date(ms + 3 * 3600000).toISOString().slice(11, 16); return `${d.slice(8, 10)}/${d.slice(5, 7)} à ${t}`; };
