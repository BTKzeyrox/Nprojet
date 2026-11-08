// Présence des opérateurs : file d'attente « sans mission », missions libres, durée de connexion du jour ; lit le store.
// Le STATUT (En cours / En ligne / En pause / Hors ligne) n'est PLUS calculé ici : une seule règle pour tout le site, `liveStatus` dans presenceStatus.ts.
// Utilisé par : DayDetailsModal.tsx, OperatorSheet.tsx, PayrollAdmin.tsx, QueueButton.tsx, notifications.ts, CalendarView.tsx, AdminDashboard.tsx, EmployeesManagement.tsx et 1 autre.
// Pour modifier : en ligne = signe de vie de moins de 120 s (ONLINE_MS) ; ne pas se fier à is_online (resté bloqué sur vrai) ; dayMada = jour de Madagascar (UTC+3).
import { db } from '../db/store';
import { ClientContract, PostSession, PresenceRow, User } from '../types';
import { ONLINE_MS } from './presenceCount';
import { liveStatus } from './presenceStatus';

// Un opérateur est « en ligne » s'il a donné signe de vie il y a moins de 120 s
export { ONLINE_MS };
const OPEN = ['pending_start', 'active', 'pending_end'];

export const hasOpenPost = (userId: string, posts: PostSession[]) =>
  posts.some(p => p.employee_id === userId && OPEN.includes(p.status));

/** Secondes de connexion AUJOURD'HUI (jour de Madagascar) d'une personne ; 0 sans ligne de présence ou si la ligne date d'un autre jour. */
export const onlineSecToday = (userId: string, presence: PresenceRow[], now = Date.now()): number => {
  const row = presence.find(r => r.user_id === userId);
  return row && row.day === dayMada(now) ? row.online_sec : 0;
};

export const dayMada = (now = Date.now()) => new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);

// File d'attente vue par l'admin : du plus ancien au plus récent
export const getQueue = (users: User[], posts: PostSession[], presence: PresenceRow[], now = Date.now()) =>
  users
    .filter(u => u.role === 'employee' && u.status !== 'blocked')
    .map(u => ({ user: u, waitingSince: liveStatus(u, posts, presence, now).waiting ? (presence.find(r => r.user_id === u.id)?.waiting_since ?? null) : null }))
    .filter((x): x is { user: User; waitingSince: string } => !!x.waitingSince)
    .sort((a, b) => a.waitingSince.localeCompare(b.waitingSince))
    .map((x, i) => ({ ...x, position: i + 1, minutes: Math.floor((now - new Date(x.waitingSince).getTime()) / 60000) }));

// Missions libres : avec compte, et aucune session en cours dessus
export const getFreePosts = (contracts: ClientContract[], posts: PostSession[]) =>
  contracts.filter(c => !c.no_account && !posts.some(p => p.client_name === c.client_name && OPEN.includes(p.status)));

export const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

export const currentQueueView = () => getQueue(db.getUsers(), db.getPosts(), db.getPresence());
