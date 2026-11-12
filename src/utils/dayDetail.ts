// Règles pures (sans écran, sans serveur) du détail d'un employé pour un jour : connexions, missions et totaux.
// Utilisé par : attendanceView.ts et CalendarView.tsx. Contrôlé par : npm run check:attendance-view, check:day-detail et check:post-stamps.
// Pour modifier : les heures sont en heure de Madagascar (UTC+3, hmMada) ; SESSION_GAP_MS (150 s) est la même valeur que le serveur, à garder identique.
import type { AttendanceRow, PostSession } from '../types';
import { isWorkLine } from './postPay';
import { workLineBy, workLineDetail } from './workLineText';

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
  /** Heures des étapes (HH:MM, heure de Madagascar) : demande de début envoyée, début validé, fin envoyée, fin validée. null = pas enregistrée (anciennes missions : la validation n'a pas d'heure). */
  startSent: string | null; startValidated: string | null; endSent: string | null; endValidated: string | null;
}
/** Une ligne de la feuille du jour (présence, heures, quantité) : jamais montrée comme une mission. `unsent` = encore sur le téléphone (pas partie). */
export interface WorkLineRow { id: string; type: string; text: string; by: string; state: 'validated' | 'waiting' | 'refused'; unsent: boolean }
export interface DayDetail {
  firstSeen: string | null; lastSeen: string | null; onlineSec: number;
  /** Arrivée = première connexion du jour. Départ = fin de la dernière connexion (déconnexion ou dernier signe de vie) ; null si encore en ligne. */
  arrival: string | null; departure: string | null; departureKind: 'out' | 'lost' | 'live' | 'none';
  connections: ConnectionLine[]; hasConnectionLog: boolean; missions: MissionLine[]; workLines: WorkLineRow[];
  totals: { missions: number; validated: number; refused: number; running: number; pay: number; gain: number };
}

const toMin = (hms: string) => { const [h, m] = hms.split(':').map(Number); return h * 60 + m; };
const hm = (hms: string) => hms.slice(0, 5);
const stampHm = (iso: unknown): string | null => (typeof iso === 'string' && iso && Number.isFinite(Date.parse(iso)) ? hmMada(iso) : null);

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
    .filter(p => !isWorkLine(p) && p.employee_id === empId && p.date === date && (clientFilter === 'all' || p.client_name === clientFilter))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(p => {
      let minutes: number | null = null;
      if (p.end_time) { minutes = toMin(p.end_time) - toMin(p.start_time); if (minutes < 0) minutes += 1440; }
      const status = p.status === 'completed' ? 'validated' : p.status === 'rejected' ? 'refused' : p.status === 'force_released' ? 'released' : p.status === 'pending_start' ? 'waiting' : 'running';
      const done = p.status === 'completed';
      return {
        id: p.id, client: p.client_name, start: hm(p.start_time), end: p.end_time ? hm(p.end_time) : null, minutes,
        scoreFrom: p.initial_score, scoreTo: done ? (p.final_score ?? p.current_score) : p.current_score, target: p.target_score, status, pay: done ? (p.calculated_ar || 0) : 0,
        // Demande envoyée : l'heure posée par le serveur ; sinon l'heure de début / de fin de la mission (elles sont notées au moment de l'envoi). Validation : seulement l'heure posée par le serveur.
        startSent: stampHm(p.start_sent_at) ?? hm(p.start_time),
        startValidated: stampHm(p.start_validated_at),
        endSent: stampHm(p.end_sent_at) ?? (p.end_time ? hm(p.end_time) : null),
        endValidated: stampHm(p.end_validated_at),
      };
    });
}

/** Les lignes de la feuille du jour d'une personne pour un jour : même texte que les Validations et l'Historique (workLineText). */
export function workLineRows(posts: PostSession[], empId: string, date: string, isUnsent: (id: string) => boolean = () => false): WorkLineRow[] {
  return posts
    .filter(p => isWorkLine(p) && p.employee_id === empId && p.date === date)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .map(p => ({ id: p.id, type: String(p.client_name || (p as any).work_type || ''), text: workLineDetail(p), by: workLineBy(p), state: p.status === 'completed' ? 'validated' as const : p.status === 'rejected' ? 'refused' as const : 'waiting' as const, unsent: isUnsent(p.id) }));
}

/** Lignes d'une feuille encore GARDÉE sur le téléphone (pas partie) pour une personne et un jour : elles n'existent pas encore côté serveur, mais la personne les a bien saisies. */
export function queuedLineRows(queue: { id: string; state: string; payload?: any }[], empId: string, date: string): WorkLineRow[] {
  const out: WorkLineRow[] = [];
  for (const o of Array.isArray(queue) ? queue : []) {
    const pl = o && o.payload && typeof o.payload === 'object' ? o.payload : null;
    if (!pl || pl.date !== date || !Array.isArray(pl.lines)) continue;
    pl.lines.forEach((l: any, i: number) => {
      if (!l || l.employee_id !== empId) return;
      out.push({ id: `queued-${o.id}-${i}`, type: String(pl.type_label || l.work_type || ''), text: workLineDetail(l), by: '', state: 'waiting', unsent: true });
    });
  }
  return out;
}

export function dayDetail(posts: PostSession[], att: AttendanceRow | undefined, empId: string, date: string, nowMs: number, today: string, clientFilter = 'all', isUnsent?: (id: string) => boolean, queued: { id: string; state: string; payload?: any }[] = []): DayDetail {
  const missions = missionLines(posts, empId, date, clientFilter);
  const conns = connectionLines(att, nowMs, date === today);
  const lastConn = conns[conns.length - 1];
  return {
    arrival: att ? hmMada(att.first_seen) : null,
    departure: lastConn ? lastConn.to : att ? hmMada(att.last_seen) : null,
    departureKind: lastConn ? lastConn.state : att ? 'lost' : 'none',
    firstSeen: att ? hmMada(att.first_seen) : null, lastSeen: att ? hmMada(att.last_seen) : null, onlineSec: att?.online_sec || 0,
    connections: conns, hasConnectionLog: !!att?.sessions?.length, missions, workLines: [...workLineRows(posts, empId, date, isUnsent), ...queuedLineRows(queued, empId, date)],
    totals: {
      missions: missions.length, validated: missions.filter(m => m.status === 'validated').length, refused: missions.filter(m => m.status === 'refused').length,
      running: missions.filter(m => m.status === 'running' || m.status === 'waiting').length, pay: missions.reduce((a, m) => a + m.pay, 0),
      gain: missions.filter(m => m.status === 'validated').reduce((a, m) => a + Math.max(0, m.scoreTo - m.scoreFrom), 0),
    },
  };
}
export const minutesText = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);
