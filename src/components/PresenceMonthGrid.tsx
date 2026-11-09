// Grille de présence du mois (M27.10) sous la Feuille du jour : personnes × jours, avec P / R / ½ / A, les jours oubliés en tiret et le total de jours payés. Lecture seule.
// Utilisé par : WorksheetView.tsx. Règles dans utils/monthGrid.ts (`npm run check:month-grid`). Textes FR/EN avec t(fr, en).
// Pour modifier : le tableau défile dans son propre conteneur (jamais la page entière), la colonne des noms reste visible ; clair et sombre ; case en tirets = ligne encore « en attente » de validation.
import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../db/store';
import { monthGrid, type GridLetter } from '../utils/monthGrid';

const DOW_FR = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], DOW_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const PresenceMonthGrid: React.FC<{ people: { id: string; name: string; created_at?: string }[]; today: string; L: boolean; en: boolean }> = ({ people, today, L, en }) => {
  const t = (fr: string, e: string) => (en ? e : fr);
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const grid = useMemo(() => (open ? monthGrid(ym.y, ym.m, people.map(u => ({ id: u.id, name: u.name, since: typeof u.created_at === 'string' ? u.created_at.slice(0, 10) : undefined })), db.getPosts(), today, (db.getSettings() as any).work_days) : null),
    [open, ym, people.map(u => u.id).join(','), today, db.getPosts()]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (d: number) => setYm(p => { const x = p.y * 12 + p.m + d; return { y: Math.floor(x / 12), m: ((x % 12) + 12) % 12 }; });
  const label = new Date(Date.UTC(ym.y, ym.m, 1)).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const tone: Record<GridLetter, string> = L
    ? { P: 'bg-emerald-100 text-emerald-800', R: 'bg-amber-100 text-amber-800', H: 'bg-sky-100 text-sky-800', A: 'bg-rose-100 text-rose-800' }
    : { P: 'bg-emerald-900/60 text-emerald-200', R: 'bg-amber-900/60 text-amber-200', H: 'bg-sky-900/60 text-sky-200', A: 'bg-rose-900/60 text-rose-200' };
  const glyph = (l: GridLetter) => (l === 'H' ? '½' : l);
  const base = L ? 'bg-white text-slate-800 border-slate-200' : 'bg-slate-900 text-slate-100 border-slate-700';
  const stick = L ? 'bg-white' : 'bg-slate-900';

  return (
    <div data-month-grid className={`rounded-xl border p-3 space-y-2 ${L ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
      <button type="button" data-month-grid-toggle aria-expanded={open} onClick={() => setOpen(o => !o)} className={`w-full min-h-[44px] flex items-center gap-2 text-sm font-bold ${L ? 'text-slate-800' : 'text-slate-100'}`}>
        <CalendarDays className="w-4 h-4" />{t('Présence du mois', 'Attendance for the month')}<span className="ml-auto text-xs font-normal opacity-70">{open ? t('Masquer', 'Hide') : t('Afficher', 'Show')}</span>
      </button>
      {open && grid && (
        <>
          <div className="flex items-center justify-between gap-2">
            <button type="button" data-month-prev aria-label={t('Mois précédent', 'Previous month')} onClick={() => shift(-1)} className={`min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center ${base}`}><ChevronLeft className="w-4 h-4" /></button>
            <div data-month-label className={`text-sm font-semibold capitalize ${L ? 'text-slate-800' : 'text-slate-100'}`}>{label}</div>
            <button type="button" data-month-next aria-label={t('Mois suivant', 'Next month')} onClick={() => shift(1)} className={`min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center ${base}`}><ChevronRight className="w-4 h-4" /></button>
          </div>
          {grid.rows.length === 0 ? (
            <div className="text-xs opacity-70">{t('Personne dans la liste.', 'Nobody in the list.')}</div>
          ) : (
            <div data-month-grid-scroll className="overflow-x-auto">
              <table className="border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className={`sticky left-0 z-10 text-left px-2 py-1 font-semibold ${stick}`}>{t('Nom', 'Name')}</th>
                    {grid.days.map(d => (
                      <th key={d.n} className={`px-0.5 py-1 min-w-[28px] text-center font-semibold ${d.rest ? 'opacity-50' : ''}`}><div>{d.n}</div><div className="font-normal opacity-70">{(en ? DOW_EN : DOW_FR)[d.dow]}</div></th>
                    ))}
                    <th className="px-2 py-1 text-center font-semibold">{t('Jours', 'Days')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map(r => (
                    <tr key={r.id} data-grid-row={r.id}>
                      <th className={`sticky left-0 z-10 text-left px-2 py-1 font-semibold whitespace-nowrap max-w-[120px] truncate ${stick}`}>{r.name}</th>
                      {r.cells.map((c, i) => (
                        <td key={i} data-grid-cell={c.letter || (c.missing ? 'missing' : 'none')} title={c.pending ? t('En attente de validation', 'Waiting for approval') : undefined}
                          className={`min-w-[28px] h-7 text-center border ${c.letter ? `${tone[c.letter]} font-bold ${c.pending ? 'border-dashed opacity-70 ' + (L ? 'border-slate-500' : 'border-slate-300') : 'border-transparent'}` : `${grid.days[i].rest || grid.days[i].future ? (L ? 'bg-slate-100 border-transparent' : 'bg-slate-800/60 border-transparent') : 'border-transparent'} ${c.missing ? (L ? 'text-rose-600' : 'text-rose-300') : ''}`}`}>
                          {c.letter ? glyph(c.letter) : c.missing ? '–' : ''}
                        </td>
                      ))}
                      <td data-grid-total className="px-2 text-center font-bold whitespace-nowrap">{r.days}{r.pendingCells > 0 && <span className="font-normal opacity-70"> (+{r.pendingCells})</span>}{r.missing > 0 && <span className={`font-normal ${L ? 'text-rose-600' : 'text-rose-300'}`}> · {r.missing} {t('oubli', 'missed')}{r.missing > 1 && !en ? 's' : ''}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div data-month-legend className="text-[11px] opacity-80">
            P = {t('présent', 'present')} · R = {t('en retard', 'late')} · ½ = {t('demi-journée', 'half day')} · A = {t('absent', 'absent')} · – = {t('rien saisi (jour de travail passé)', 'nothing entered (past work day)')} · {t('tirets', 'dashed')} = {t('en attente de validation', 'waiting for approval')} · {t('Jours = jours payés (lignes validées)', 'Days = paid days (approved lines)')}
          </div>
        </>
      )}
    </div>
  );
};
