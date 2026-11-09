// Grille de présence du mois (M27.10) : les personnes en lignes, les jours en colonnes, P / R / ½ / A et le total de jours. Règles pures, sans écran ni serveur.
// Source : les lignes de la Feuille du jour (celles qui servent à la paie) : validées ou « en attente ». Les missions normales ne comptent pas ici.
// Utilisé par : PresenceMonthGrid.tsx (sous la Feuille du jour). Contrôlé par `npm run check:month-grid`.
// Pour modifier : `days` = jours payés (somme des fractions : P 1, R 1, ½ 0,5, A 0), lignes VALIDÉES seulement ; « missing » = jours de travail passés (Réglages) sans aucune ligne, à partir de `since` (arrivée de la personne).
import { isWorkLine } from './postPay';
import { PRESENCE_FRACTION, PRESENCE_VALUES, type Presence } from './workTypes';
import { isWorkDay, weekdayOf } from './workDays';

export type GridLetter = 'P' | 'R' | 'H' | 'A';
const LETTER: Record<Presence, GridLetter> = { present: 'P', late: 'R', half: 'H', absent: 'A' };
export interface GridCell { letter: GridLetter | ''; pending: boolean; missing: boolean }
export interface GridDay { n: number; date: string; dow: number; rest: boolean; future: boolean }
export interface GridRow { id: string; name: string; cells: GridCell[]; days: number; pendingCells: number; counts: Record<GridLetter, number>; missing: number }
export interface MonthGrid { days: GridDay[]; rows: GridRow[] }

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
/** Nombre de jours d'un mois (month : 0 = janvier). */
export const daysInMonthOf = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function monthGrid(year: number, month: number, people: { id: string; name: string; since?: string }[], posts: any[], today: string, workDays?: unknown): MonthGrid {
  const n = daysInMonthOf(year, month);
  const prefix = `${year}-${pad(month + 1)}-`;
  const days: GridDay[] = Array.from({ length: n }, (_, i) => {
    const date = `${prefix}${pad(i + 1)}`;
    return { n: i + 1, date, dow: weekdayOf(date), rest: !isWorkDay(date, workDays), future: date > today };
  });
  // meilleure ligne par (personne, jour) : validée avant en attente ; à rang égal, la plus forte fraction
  const best = new Map<string, { rank: number; frac: number; presence: Presence }>();
  for (const p of Array.isArray(posts) ? posts : []) {
    if (!p || !isWorkLine(p) || (p.status !== 'completed' && p.status !== 'pending_end')) continue;
    if (typeof p.date !== 'string' || !p.date.startsWith(prefix) || typeof p.employee_id !== 'string') continue;
    if (!(PRESENCE_VALUES as string[]).includes(p.presence)) continue;
    const k = `${p.employee_id}|${p.date}`;
    const cand = { rank: p.status === 'completed' ? 2 : 1, frac: PRESENCE_FRACTION[p.presence as Presence], presence: p.presence as Presence };
    const cur = best.get(k);
    if (!cur || cand.rank > cur.rank || (cand.rank === cur.rank && cand.frac > cur.frac)) best.set(k, cand);
  }
  const rows: GridRow[] = (Array.isArray(people) ? people : []).filter(u => u && typeof u.id === 'string').map(u => {
    const counts: Record<GridLetter, number> = { P: 0, R: 0, H: 0, A: 0 };
    let total = 0, pendingCells = 0, missing = 0;
    const cells: GridCell[] = days.map(d => {
      const b = best.get(`${u.id}|${d.date}`);
      if (b) {
        counts[LETTER[b.presence]]++;
        if (b.rank === 2) total += b.frac; else pendingCells++;
        return { letter: LETTER[b.presence], pending: b.rank === 1, missing: false };
      }
      const miss = !d.future && !d.rest && (!u.since || d.date >= u.since);
      if (miss) missing++;
      return { letter: '' as const, pending: false, missing: miss };
    });
    return { id: u.id, name: String(u.name || ''), cells, days: Math.round(total * 100) / 100, pendingCells, counts, missing };
  });
  return { days, rows };
}
