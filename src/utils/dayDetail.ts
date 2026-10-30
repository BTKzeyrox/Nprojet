import type { AttendanceRow, PostSession } from '../types';

// Détail complet d'un employé pour un jour : connexions (heures de connexion et de déconnexion) et missions. Pur : sans écran ni serveur.
const SESSION_GAP_MS = 150_000; // même valeur que le serveur : au-delà, la connexion est considérée finie
export const hmMada = (iso: string): string => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(11, 16);

export interface ConnectionLine {
  from: string; // HH:MM de connexion
  /** `out` : déconnecté volontairement ; `lost` : plus de signe de vie (fin = dernier signe de vie) ; `live` : en ligne maintenant. */
  state: 'out' | 'lost' | 'live';
  to: string | null; // HH:MM de fin (null si en ligne)
  minutes: number;
}
export interface MissionLine {
  id: string; client: string; start: string; end: string | null; minutes: number | null;
  scoreFrom: number; scoreTo: number; target: number; status: 'validated' | 'refused' | 'running' | 'released' | 'waiting'; pay: number;
}
export interface DayDetail {
  firstSeen: string | null; lastSeen: string | null; onlineSec: number;
  /** Arrivée = première connexion du jour. Départ = fin de la dernière connexion (déconnexion ou dernier signe de vie) ; null si encore en ligne. */
  arrival: string | null; departure: string | null; departureKind: 'out' | 'lost' | 'live' | 'none';
  connections: ConnectionLine[]; hasConnectionLog: boolean; missions: MissionLine[];
  totals: { missions: number; counted: number; validated: number; refused: number; running: number; pay: number; gain: number };
}

const toMin = (hms: string) => { const [h, m] = hms.split(':').map(Number); return h * 60 + m; };
const hm = (hms: string) => hms.slice(0, 5);

export function connectionLines(att: AttendanceRow | undefined, nowMs: number, isToday: boolean): ConnectionLine[] {
  const list = att?.sessions || [];
  return list.map((s, i) => {
    const lastIdx = i === list.length - 1;
    const endIso = s.out || s.last;
    const live = !s.out && isToday && lastIdx && nowMs - new Date(s.last).getTime() <= SESSION_GAP_MS;
    return {
      from: hmMada(s.in),
      state: s.out ? 'out' as const : live ? 'live' as const : 'lost' as const,
      to: live ? null : hmMada(endIso),
      minutes: Math.max(0, Math.round(((live ? nowMs : new Date(endIso).getTime()) - new Date(s.in).getTime()) / 60000)),
    };
  });
}

export function missionLines(posts: PostSession[], empId: string, date: string, clientFilter = 'all'): MissionLine[] {
  return posts
    .filter(p => p.employee_id === empId && p.date === date && (clientFilter === 'all' || p.client_name === clientFilter))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(p => {
      let minutes: number | null = null;
      if (p.end_time) { minutes = toMin(p.end_time) - toMin(p.start_time); if (minutes < 0) minutes += 1440; }
      const status = p.status === 'completed' ? 'validated' : p.status === 'rejected' ? 'refused' : p.status === 'force_released' ? 'released' : p.status === 'pending_start' ? 'waiting' : 'running';
      const done = p.status === 'completed';
      return {
        id: p.id, client: p.client_name, start: hm(p.start_time), end: p.end_time ? hm(p.end_time) : null, minutes,
        scoreFrom: p.initial_score, scoreTo: done ? (p.final_score ?? p.current_score) : p.current_score, target: p.target_score, status, pay: done ? (p.calculated_ar || 0) : 0,
      };
    });
}

export function dayDetail(posts: PostSession[], att: AttendanceRow | undefined, empId: string, date: string, nowMs: number, today: string, clientFilter = 'all'): DayDetail {
  const missions = missionLines(posts, empId, date, clientFilter);
  const conns = connectionLines(att, nowMs, date === today);
  const lastConn = conns[conns.length - 1];
  return {
    arrival: att ? hmMada(att.first_seen) : null,
    departure: lastConn ? lastConn.to : att ? hmMada(att.last_seen) : null,
    departureKind: lastConn ? lastConn.state : att ? 'lost' : 'none',
    firstSeen: att ? hmMada(att.first_seen) : null, lastSeen: att ? hmMada(att.last_seen) : null, onlineSec: att?.online_sec || 0,
    connections: conns, hasConnectionLog: !!att?.sessions?.length, missions,
    totals: {
      missions: missions.length, counted: missions.filter(m => m.status === 'validated' || m.status === 'running' || m.status === 'waiting').length, validated: missions.filter(m => m.status === 'validated').length, refused: missions.filter(m => m.status === 'refused').length,
      running: missions.filter(m => m.status === 'running' || m.status === 'waiting').length, pay: missions.reduce((a, m) => a + m.pay, 0),
      gain: missions.filter(m => m.status === 'validated').reduce((a, m) => a + Math.max(0, m.scoreTo - m.scoreFrom), 0),
    },
  };
}
export const minutesText = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);
