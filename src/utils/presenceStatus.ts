// Statut EN DIRECT d'un opérateur : En cours / En ligne / En pause / Hors ligne. Règles pures, sans écran, sans réseau ; contrôlé par `npm run check:live-status`.
// Il n'y a pas de bouton « pause » : le statut se DÉDUIT de ce que le site sait vraiment (mission ouverte ou non, dernier signe de vie de l'appli).
//   En cours   = une mission est ouverte (à valider, en cours ou fin à valider) ET l'appli a donné signe de vie il y a moins de 90 s ;
//   En ligne   = aucune mission ouverte, appli active (on ajoute « attend une mission » s'il est dans la file) ;
//   En pause   = une mission est ouverte, mais l'appli est silencieuse depuis 90 s à 30 min (téléphone verrouillé, pause café, coupure courte) ;
//   Hors ligne = appli silencieuse depuis plus de 30 min avec une mission ouverte, ou depuis plus de 90 s sans mission.
// Seul le responsable reçoit les signes de vie (`db.getPresence()`) : pour les autres rôles on n'affiche RIEN plutôt qu'un faux « Hors ligne ».
import type { PostSession, PresenceRow, User } from '../types';

export const FRESH_MS = 90_000; // signe de vie récent
export const PAUSE_MAX_MS = 30 * 60_000; // au-delà : hors ligne
const OPEN = ['pending_start', 'active', 'pending_end'];

export type LiveStatus = 'working' | 'online' | 'pause' | 'offline';
export interface LiveInfo { status: LiveStatus; waiting: boolean; openMission: boolean; silentMin: number | null }

export function liveStatus(user: Pick<User, 'id' | 'is_online'>, posts: PostSession[], presence: PresenceRow[], now = Date.now()): LiveInfo {
  const row = presence.find(r => r.user_id === user.id);
  const last = row ? new Date(row.last_seen).getTime() : NaN;
  const silentMs = row && Number.isFinite(last) ? Math.max(0, now - last) : null;
  const fresh = silentMs !== null ? silentMs < FRESH_MS : !!user.is_online; // pas de ligne de présence : ancien indicateur de connexion
  const openMission = posts.some(p => p.employee_id === user.id && OPEN.includes(p.status));
  const waiting = fresh && !!row?.waiting_since && !openMission;
  const silentMin = silentMs === null ? null : Math.floor(silentMs / 60000);
  if (openMission) {
    if (fresh) return { status: 'working', waiting: false, openMission, silentMin };
    if (silentMs !== null && silentMs <= PAUSE_MAX_MS) return { status: 'pause', waiting: false, openMission, silentMin };
    return { status: 'offline', waiting: false, openMission, silentMin };
  }
  return { status: fresh ? 'online' : 'offline', waiting, openMission, silentMin };
}

export const LIVE_META: Record<LiveStatus, { fr: string; en: string; dot: string; text: string }> = {
  working: { fr: 'En cours', en: 'In progress', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  online: { fr: 'En ligne', en: 'Online', dot: 'bg-cyan-400', text: 'text-cyan-400' },
  pause: { fr: 'En pause', en: 'On break', dot: 'bg-amber-400', text: 'text-amber-400' },
  offline: { fr: 'Hors ligne', en: 'Offline', dot: 'bg-slate-500', text: 'text-slate-400' },
};

const ago = (min: number, lang: 'fr' | 'en'): string => {
  if (min < 1) return lang === 'en' ? 'a moment ago' : 'à l\'instant';
  if (min < 60) return lang === 'en' ? `${min} min ago` : `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return lang === 'en' ? `${h} h ago` : `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return lang === 'en' ? `${d} d ago` : `il y a ${d} j`;
};

/** Texte complet du statut : « En pause · appli silencieuse depuis 12 min ». */
export function liveText(info: LiveInfo, lang: 'fr' | 'en' = 'fr'): string {
  const base = LIVE_META[info.status][lang];
  const en = lang === 'en';
  if (info.status === 'pause' && info.silentMin !== null) return `${base} · ${en ? 'app silent for' : 'appli silencieuse depuis'} ${info.silentMin} min`;
  if (info.status === 'online' && info.waiting) return `${base} · ${en ? 'waiting for a mission' : 'attend une mission'}`;
  if (info.status === 'offline') {
    const seen = info.silentMin === null ? '' : ` · ${en ? 'seen' : 'vu'} ${ago(info.silentMin, lang)}`;
    return `${base}${info.openMission ? ` · ${en ? 'mission still open' : 'mission encore ouverte'}` : ''}${seen}`;
  }
  return base;
}
