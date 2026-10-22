// Notifications push (module 6, M6.4) : règles pures, sans réseau. Contrôlé par `npm run check:push`.
// Rappels d'échéance : quand prévenir, qui prévenir, sans jamais prévenir deux fois. Textes FR/EN des notifications.
// Le serveur (bloc PUSH de df-api) contient la même logique ; `check:push` compare les deux.
import { isRealDate, isRealTime } from './deadlines';

export type PushKind = 'start_ok' | 'end_ok' | 'refused' | 'due_24h' | 'due_1h' | 'late';
export interface PushText { fr: { title: string; body: string }; en: { title: string; body: string } }

const cut = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/** Texte d'une notification (les deux langues : l'appareil choisit selon sa langue). `m.title` = titre de la mission. */
export function pushText(kind: PushKind, m: { post_number?: number; title?: string; reason?: string; due?: string }): PushText {
  const n = Number.isFinite(m.post_number) ? `#${m.post_number} ` : '';
  const t = cut(m.title, 60) || '—';
  const label = `${n}${t}`.trim();
  const reason = cut(m.reason, 120);
  switch (kind) {
    case 'start_ok': return { fr: { title: 'Début validé', body: `${label} : tu peux commencer.` }, en: { title: 'Start approved', body: `${label}: you can start.` } };
    case 'end_ok': return { fr: { title: 'Mission validée', body: `${label} a été validée.` }, en: { title: 'Mission approved', body: `${label} was approved.` } };
    case 'refused': return { fr: { title: 'Mission refusée', body: reason ? `${label} : ${reason}` : `${label} a été refusée.` }, en: { title: 'Mission refused', body: reason ? `${label}: ${reason}` : `${label} was refused.` } };
    case 'due_24h': return { fr: { title: 'Échéance dans moins de 24 h', body: `${label} est à rendre ${cut(m.due, 20)}.` }, en: { title: 'Due within 24 h', body: `${label} is due ${cut(m.due, 20)}.` } };
    case 'due_1h': return { fr: { title: 'Échéance dans moins d\'1 h', body: `${label} est à rendre ${cut(m.due, 20)}.` }, en: { title: 'Due within 1 h', body: `${label} is due ${cut(m.due, 20)}.` } };
    case 'late': return { fr: { title: 'Mission en retard', body: `${label} devait être rendue ${cut(m.due, 20)}.` }, en: { title: 'Mission late', body: `${label} was due ${cut(m.due, 20)}.` } };
  }
}

/** Moment limite en millisecondes : la date + l'heure (23:59 s'il n'y a pas d'heure), à l'heure de Madagascar (UTC+3). NaN si la date est fausse. */
export function dueAtMs(due_date: unknown, due_time?: unknown): number {
  if (!isRealDate(due_date)) return NaN;
  const t = isRealTime(due_time) ? due_time : '23:59';
  return Date.parse(`${due_date}T${t}:00+03:00`);
}

export interface ReminderContract { id: string; post_number: number; client_name: string; no_account?: boolean; due_date?: string; due_time?: string; initial_score: number; target_score: number; current_score?: number }
export interface ReminderPost { employee_id: string; status: string; post_number?: number; client_name: string }
export interface Reminder { key: string; kind: 'due_24h' | 'due_1h' | 'late'; contract_id: string; post_number: number; title: string; due: string; user_ids: string[]; admins: boolean }

export const LATE_WINDOW_MS = 3 * 24 * 3600 * 1000; // un retard plus vieux que 3 jours n'est plus signalé (évite une avalanche au premier passage)

/**
 * Rappels à envoyer maintenant. Règles :
 *  - « dans moins de 24 h » (et plus d'1 h) et « dans moins d'1 h » (seulement si la mission a une heure) : prévient l'opérateur qui a une session ouverte sur la mission ;
 *  - « en retard » (jusqu'à 3 jours de retard) : l'opérateur et les responsables ;
 *  - une mission terminée, sans titre ou « sans compte » ne déclenche rien ;
 *  - la clé identifie rappel + échéance : changer la date limite remet le rappel à zéro.
 */
export function dueReminders(contracts: ReminderContract[], posts: ReminderPost[], nowMs: number): Reminder[] {
  if (!Number.isFinite(nowMs)) return [];
  const out: Reminder[] = [];
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (!c || c.no_account || !String(c.client_name || '').trim()) continue;
    const at = dueAtMs(c.due_date, c.due_time);
    if (!Number.isFinite(at)) continue;
    if (c.target_score > c.initial_score && (c.current_score ?? c.initial_score) >= c.target_score) continue;
    const left = at - nowMs;
    let kind: Reminder['kind'] | null = null;
    if (left < 0) kind = -left <= LATE_WINDOW_MS ? 'late' : null;
    else if (isRealTime(c.due_time) && left <= 3600 * 1000) kind = 'due_1h';
    else if (left <= 24 * 3600 * 1000 && left > 3600 * 1000) kind = 'due_24h';
    else if (left <= 24 * 3600 * 1000 && !isRealTime(c.due_time)) kind = 'due_24h';
    if (!kind) continue;
    const users = [...new Set((Array.isArray(posts) ? posts : []).filter(p => p && (p.status === 'active' || p.status === 'pending_start') && (p.post_number === c.post_number || (!!c.client_name && p.client_name === c.client_name))).map(p => String(p.employee_id)))];
    const admins = kind === 'late';
    if (!users.length && !admins) continue;
    out.push({ key: `${c.id}:${kind}:${c.due_date}:${c.due_time || ''}`, kind, contract_id: c.id, post_number: c.post_number, title: String(c.client_name).trim(), due: `${(c.due_date as string).split('-').reverse().join('/')}${c.due_time ? ' ' + c.due_time : ''}`, user_ids: users, admins });
  }
  return out;
}

const B64U = /^[A-Za-z0-9_-]+$/;
/** Abonnement envoyé par un téléphone : adresse https, deux clés base64url de la bonne taille. Rend null si quelque chose est faux. */
export function cleanPushSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof r.endpoint === 'string' ? r.endpoint.trim() : '';
  if (endpoint.length < 20 || endpoint.length > 600 || !/^https:\/\/[^\s/]+\/\S*$/.test(endpoint)) return null;
  const k = r.keys && typeof r.keys === 'object' ? r.keys : null;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  if (!B64U.test(k.p256dh) || k.p256dh.length !== 87 || !B64U.test(k.auth) || k.auth.length < 20 || k.auth.length > 24) return null;
  return { endpoint, p256dh: k.p256dh, auth: k.auth };
}
