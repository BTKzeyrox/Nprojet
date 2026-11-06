// Arrivée, départ et pastille « en ligne / hors ligne » pour TOUS les rôles suivis (opérateur, chef d'équipe, comptable).
// Règles pures, sans écran ni réseau ; contrôlées par `npm run check:attendance-view`. Heures à Madagascar (+3 h), jamais l'heure du téléphone.
// Arrivée = première connexion du jour. Départ = déconnexion si la personne s'est déconnectée, sinon dernier signe de vie (« estimé »).
import type { AttendanceRow } from '../types';
import { FRESH_MS } from './presenceStatus';
import { hmMada, type DayDetail } from './dayDetail';

export type Lang = 'fr' | 'en';
/** Rôles dont on suit la présence (l'administrateur n'est pas suivi). */
export const TRACKED_ROLES = ['employee', 'team_lead', 'accountant'] as const;
export const isTracked = (role: string | undefined | null): boolean => (TRACKED_ROLES as readonly string[]).includes(String(role));

export interface OnlineBadge { online: boolean; since: string | null; text: string }

/** Pastille simple : En ligne = signe de vie depuis moins de 120 s ; sinon Hors ligne « depuis HH:MM » (null = jamais vu). */
export function onlineBadge(lastSeenIso: string | null | undefined, nowMs: number, lang: Lang = 'fr'): OnlineBadge {
  const t = lastSeenIso ? new Date(lastSeenIso).getTime() : NaN;
  const en = lang === 'en';
  if (!Number.isFinite(t)) return { online: false, since: null, text: en ? 'Offline' : 'Hors ligne' };
  if (nowMs - t < FRESH_MS) return { online: true, since: null, text: en ? 'Online' : 'En ligne' };
  const since = hmMada(new Date(t).toISOString());
  return { online: false, since, text: en ? `Offline since ${since}` : `Hors ligne depuis ${since}` };
}

/** Texte « Arrivée 08:02 · Départ 17:31 » (ou « Départ estimé », « Encore en ligne »). Sans donnée : « Non enregistrée ». */
export function arrivalLine(d: Pick<DayDetail, 'arrival' | 'departure' | 'departureKind'>, lang: Lang = 'fr'): string {
  const en = lang === 'en';
  if (!d.arrival) return en ? 'Not recorded' : 'Non enregistrée';
  const arr = `${en ? 'Arrival' : 'Arrivée'} ${d.arrival}`;
  if (d.departureKind === 'live') return `${arr} · ${en ? 'Still online' : 'Encore en ligne'}`;
  if (!d.departure) return arr;
  if (d.departureKind === 'out') return `${arr} · ${en ? 'Departure' : 'Départ'} ${d.departure}`;
  return `${arr} · ${en ? 'Estimated departure' : 'Départ estimé'} ${d.departure}`;
}

/** Dernier signe de vie d'une personne à partir de la présence (aujourd'hui) ou, à défaut, de la ligne de présence du jour. */
export function lastSeenOf(presenceLast: string | null | undefined, att: Pick<AttendanceRow, 'last_seen'> | undefined): string | null {
  return presenceLast || att?.last_seen || null;
}

/** Résumé du mois pour une personne : jours de présence et arrivée moyenne (HH:MM, heure de Madagascar). */
export function monthPresence(rows: Pick<AttendanceRow, 'first_seen'>[]): { days: number; avgArrival: string | null } {
  if (!rows.length) return { days: 0, avgArrival: null };
  const mins = rows.map(r => { const [h, m] = hmMada(r.first_seen).split(':').map(Number); return h * 60 + m; });
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return { days: rows.length, avgArrival: `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}` };
}
