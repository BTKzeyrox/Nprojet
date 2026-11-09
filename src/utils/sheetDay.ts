// Feuille du jour : qui manque, total du jour, avancement du jour (M27.1, M27.2, M27.6, 2026-11-09). Règles pures, sans écran ni serveur.
// Une ligne de la feuille est une mission « we-<date>-<id de l'opérateur>-<type> » (voir workEntry.ts). Utilisé par : WorksheetView.tsx, WorksheetShortcut.tsx.
export type DayPost = { id?: unknown; status?: string; calculated_ar?: unknown; presence?: string };
export type DayPerson = { id: string; status?: string };
type Row = { presence?: string; hours?: string; quantity?: string };

const isRowFilled = (r?: Row): boolean => !!r && !!(r.presence || String(r.hours ?? '').trim() || String(r.quantity ?? '').trim());
const idStr = (p: DayPost): string => (typeof p.id === 'string' ? p.id : '');
const counted = (p: DayPost): boolean => p.status === 'completed' || p.status === 'pending_end';

/** Personnes de la liste sans ligne : ni tapée sur l'écran, ni déjà enregistrée ce jour-là pour ce type de travail. Les comptes bloqués ne comptent pas. */
export function missingPeople<T extends DayPerson>(rows: Record<string, Row>, people: T[], dayLines: DayPost[], date: string, workType: string): T[] {
  return people.filter(u => u.status !== 'blocked' && !isRowFilled(rows[u.id]) && !dayLines.some(p => counted(p) && idStr(p) === `we-${date}-${u.id}-${workType}`));
}

export interface DayTotals { lines: number; present: number; validatedAr: number; pending: number; }
/** Total du jour : lignes, présents (présent, en retard, demi-journée), montant des lignes validées, lignes en attente de validation. */
export function dayTotals(dayLines: DayPost[]): DayTotals {
  const t: DayTotals = { lines: 0, present: 0, validatedAr: 0, pending: 0 };
  for (const p of dayLines) {
    if (!counted(p)) continue;
    t.lines++;
    if (p.presence === 'present' || p.presence === 'late' || p.presence === 'half') t.present++;
    if (p.status === 'completed') t.validatedAr += Number(p.calculated_ar) > 0 ? Math.round(Number(p.calculated_ar)) : 0; else t.pending++;
  }
  return t;
}

/** « 8 sur 12 saisis » : une personne est saisie dès qu'elle a une ligne (n'importe quel type) ce jour-là. */
export function dayProgress(people: DayPerson[], posts: DayPost[], today: string): { done: number; total: number } {
  const active = people.filter(u => u.status !== 'blocked');
  const done = active.filter(u => posts.some(p => counted(p) && idStr(p).startsWith(`we-${today}-${u.id}-`))).length;
  return { done, total: active.length };
}
