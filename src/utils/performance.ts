import { db } from '../db/store';
import type { PostSession } from '../types';
import { performanceAoa, type ScoreCells } from './performanceExport';
import { downloadWorkbook } from './xlsxA4';

// Statistiques de performance par opérateur (lecture du store, aucun appel serveur).
export type PerfPeriod = '7' | '30' | 'all';

export interface PerfRow {
  id: string;
  name: string;
  done: number; // missions terminées (validées)
  rejected: number; // missions refusées
  open: number; // en cours ou à valider
  rate: number | null; // taux d'acceptation en % (null si aucune mission jugée)
  avgMin: number | null; // délai moyen en minutes (null si aucune mesure)
}

const toMs = (date: string, time?: string): number => {
  const t = new Date(`${date}T${time || '00:00:00'}`).getTime();
  return isNaN(t) ? NaN : t;
};

// Durée d'une mission en minutes (gère le passage de minuit)
const durationMin = (p: PostSession): number | null => {
  if (!p.end_time) return null;
  const s = toMs(p.date, p.start_time);
  let e = toMs(p.date, p.end_time);
  if (isNaN(s) || isNaN(e)) return null;
  if (e < s) e += 86400000;
  const m = Math.round((e - s) / 60000);
  return m >= 0 && m <= 24 * 60 ? m : null;
};

export const fmtDuration = (min: number | null): string => {
  if (min === null) return '–';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
};

export const buildPerformance = (period: PerfPeriod): PerfRow[] => {
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
  const posts = db.getPosts().filter(p => !since || (toMs(p.date) || 0) >= since);
  return db
    .getUsers()
    .filter(u => u.role === 'employee')
    .map(u => {
      const mine = posts.filter(p => p.employee_id === u.id);
      const done = mine.filter(p => p.status === 'completed');
      const rejected = mine.filter(p => p.status === 'rejected').length;
      const open = mine.filter(p => p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end').length;
      const durs = done.map(durationMin).filter((d): d is number => d !== null);
      const judged = done.length + rejected;
      return {
        id: u.id,
        name: u.name,
        done: done.length,
        rejected,
        open,
        rate: judged ? Math.round((done.length / judged) * 100) : null,
        avgMin: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      };
    })
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
};

// Ligne « Total » de l'équipe
export const totalRow = (rows: PerfRow[]): PerfRow => {
  const done = rows.reduce((a, r) => a + r.done, 0);
  const rejected = rows.reduce((a, r) => a + r.rejected, 0);
  const weighted = rows.filter(r => r.avgMin !== null && r.done > 0);
  const wDone = weighted.reduce((a, r) => a + r.done, 0);
  return {
    id: 'total',
    name: 'Total',
    done,
    rejected,
    open: rows.reduce((a, r) => a + r.open, 0),
    rate: done + rejected ? Math.round((done / (done + rejected)) * 100) : null,
    avgMin: wDone ? Math.round(weighted.reduce((a, r) => a + (r.avgMin as number) * r.done, 0) / wDone) : null,
  };
};


const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const stamp = (period: PerfPeriod) => `${period === 'all' ? 'tout' : period + 'j'}-${new Date().toISOString().slice(0, 10)}`;

/** `scores` (facultatif) ajoute les colonnes Score, Tendance, Badges et Points d'attention (module 3). */
export interface ScoreExport { scores: Map<string, ScoreCells>; windowDays: number; lang: string }

export async function exportPerformanceExcel(rows: PerfRow[], period: PerfPeriod, sc?: ScoreExport): Promise<void> {
  const aoa = performanceAoa(rows, totalRow(rows), sc ? sc.scores : null, sc ? sc.windowDays : 30, sc ? sc.lang : 'fr');
  await downloadWorkbook([{ name: 'Performance', rows: aoa }], `performance-${stamp(period)}`); // A4, Times New Roman 12, autre fichier si c'est long (xlsxA4.ts)
}

export function exportPerformanceCsv(rows: PerfRow[], period: PerfPeriod, sc?: ScoreExport): void {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = performanceAoa(rows, totalRow(rows), sc ? sc.scores : null, sc ? sc.windowDays : 30, sc ? sc.lang : 'fr').map(l => l.map(esc).join(';'));
  // BOM + « ; » : s'ouvre correctement dans Excel en français
  save(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `performance-${stamp(period)}.csv`);
}
