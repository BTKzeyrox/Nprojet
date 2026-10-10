import { db } from '../db/store';
import { ClientContract, PostSession, PresenceRow, User } from '../types';

// Un booster est « en ligne » s'il a donné signe de vie il y a moins de 90 s
export const ONLINE_MS = 90_000;
const OPEN = ['pending_start', 'active', 'pending_end'];

export type PresenceStatus = 'working' | 'connected' | 'waiting' | 'offline';

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  working: 'En poste',
  connected: 'Connecté sans poste',
  waiting: 'Sans poste (en attente)',
  offline: 'Hors ligne',
};
export const STATUS_DOT: Record<PresenceStatus, string> = {
  working: 'bg-emerald-400',
  connected: 'bg-cyan-400',
  waiting: 'bg-amber-400',
  offline: 'bg-slate-600',
};

export const hasOpenPost = (userId: string, posts: PostSession[]) =>
  posts.some(p => p.employee_id === userId && OPEN.includes(p.status));

// Règle : une session en cours = « En poste » même si le booster a quitté le site.
export const getPresenceStatus = (
  user: User,
  posts: PostSession[],
  presence: PresenceRow[],
  now = Date.now()
): { status: PresenceStatus; onlineSec: number; waitingSince: string | null } => {
  const row = presence.find(r => r.user_id === user.id);
  const fresh = row ? now - new Date(row.last_seen).getTime() < ONLINE_MS : !!user.is_online; // sans données de présence : ancien réglage
  const waitingSince = fresh && row?.waiting_since ? row.waiting_since : null;
  const onlineSec = row && row.day === dayMada(now) ? row.online_sec : 0;
  if (hasOpenPost(user.id, posts)) return { status: 'working', onlineSec, waitingSince: null };
  if (!fresh) return { status: 'offline', onlineSec, waitingSince: null };
  if (waitingSince) return { status: 'waiting', onlineSec, waitingSince };
  return { status: 'connected', onlineSec, waitingSince: null };
};

export const dayMada = (now = Date.now()) => new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);

// File d'attente vue par l'admin : du plus ancien au plus récent
export const getQueue = (users: User[], posts: PostSession[], presence: PresenceRow[], now = Date.now()) =>
  users
    .filter(u => u.role === 'employee' && u.status !== 'blocked')
    .map(u => ({ user: u, ...getPresenceStatus(u, posts, presence, now) }))
    .filter(x => x.status === 'waiting' && x.waitingSince)
    .sort((a, b) => String(a.waitingSince).localeCompare(String(b.waitingSince)))
    .map((x, i) => ({ ...x, position: i + 1, minutes: Math.floor((now - new Date(x.waitingSince as string).getTime()) / 60000) }));

// Postes libres : avec compte, et aucune session en cours dessus
export const getFreePosts = (contracts: ClientContract[], posts: PostSession[]) =>
  contracts.filter(c => !c.no_account && !posts.some(p => p.client_name === c.client_name && OPEN.includes(p.status)));

export const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

export const currentQueueView = () => getQueue(db.getUsers(), db.getPosts(), db.getPresence());
