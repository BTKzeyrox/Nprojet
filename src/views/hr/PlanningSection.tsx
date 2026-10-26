import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Eraser } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { askConfirm } from '../../components/ConfirmModal';
import { todayMada } from '../../utils/stats';
import { CONFLICT_LABEL, SHIFT_ERROR_MESSAGE, SHIFT_LABEL, coverage, isOnLeave, mondayOf, planAddDays, planConflicts, shiftId, weekDates, type ShiftKind } from '../../utils/planning';
import { card, btn } from './DossiersSection';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CYCLE: Array<ShiftKind | ''> = ['', 'day', 'night', 'off'];
const KIND_CLS: Record<ShiftKind | 'empty', string> = {
  day: 'bg-amber-600/30 border-amber-500 text-amber-200', night: 'bg-indigo-600/30 border-indigo-400 text-indigo-200', off: 'bg-slate-700/40 border-slate-500 text-slate-300', empty: 'border-slate-700 text-slate-600',
};
const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/**
 * Onglet « Planning » de la page Ressources humaines (M15.2).
 * Responsable : grille de la semaine (un clic fait défiler vide → Jour → Nuit → Repos → vide), conflits signalés, copie de la semaine précédente.
 * Salarié : son planning de la semaine et de la suivante, en lecture seule. Chaque changement est enregistré tout de suite.
 */
export const PlanningSection: React.FC<{ ver: number; isAdmin: boolean; myId: string }> = ({ isAdmin, myId }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const days = lang === 'en' ? DAYS_EN : DAYS_FR;
  const today = todayMada();
  const [monday, setMonday] = useState(mondayOf(today));
  const [error, setError] = useState('');
  const dates = weekDates(monday);
  const shifts = db.getShifts();
  const leaves = db.getLeaves();
  const staff = db.getUsers().filter(u => (u.role === 'employee' || u.role === 'team_lead') && u.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const byKey = useMemo(() => new Map(shifts.map(s => [s.id, s] as const)), [shifts]);
  const max = db.getPlanningMaxPerWeek();
  const conflicts = planConflicts(shifts, leaves, { maxPerWeek: max }).filter(c => dates.includes(c.date));
  const conflictAt = (emp: string, date: string) => conflicts.some(c => c.employee_id === emp && c.date === date && c.kind !== 'too_many');
  const nameOf = (id: string) => staff.find(u => u.id === id)?.name || db.getUsers().find(u => u.id === id)?.name || id;
  const kindAt = (emp: string, date: string): ShiftKind | '' => (byKey.get(shiftId(emp, date))?.kind as ShiftKind) || '';
  const fail = (e?: string) => setError(SHIFT_ERROR_MESSAGE[e || ''] || t('Enregistrement impossible.', 'Could not save.'));

  const cycle = (emp: string, date: string) => {
    const cur = kindAt(emp, date);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const r = next ? db.applyShifts([{ employee_id: emp, date, kind: next }]) : db.applyShifts([], [{ employee_id: emp, date }]);
    setError(r.success ? '' : (SHIFT_ERROR_MESSAGE[r.error || ''] || t('Enregistrement impossible.', 'Could not save.')));
  };
  const copyPrevious = () => {
    const prev = weekDates(planAddDays(monday, -7));
    const set: Array<{ employee_id: string; date: string; kind: ShiftKind }> = [];
    for (const u of staff) dates.forEach((d, i) => { const k = kindAt(u.id, prev[i]); if (k && !kindAt(u.id, d)) set.push({ employee_id: u.id, date: d, kind: k }); });
    if (!set.length) { setError(t('Rien à copier : la semaine précédente est vide, ou cette semaine est déjà remplie.', 'Nothing to copy: last week is empty, or this week is already filled.')); return; }
    const r = db.applyShifts(set); if (!r.success) fail(r.error); else setError('');
  };
  const clearWeek = () => {
    const clear = shifts.filter(s => dates.includes(s.date)).map(s => ({ employee_id: s.employee_id, date: s.date }));
    if (!clear.length) return;
    askConfirm({
      title: t('Vider la semaine ?', 'Clear the week?'), message: t(`${clear.length} case(s) du ${dm(dates[0])} au ${dm(dates[6])} seront vidées.`, `${clear.length} cell(s) from ${dm(dates[0])} to ${dm(dates[6])} will be cleared.`),
      confirmLabel: t('Vider', 'Clear'), danger: true, onConfirm: () => { const r = db.applyShifts([], clear); if (!r.success) fail(r.error); else setError(''); },
    });
  };

  const nav = (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={t('Semaine précédente', 'Previous week')} onClick={() => setMonday(planAddDays(monday, -7))} className={btn}><ChevronLeft className="w-4 h-4" /></button>
      <div className="flex-1 text-center text-sm font-semibold text-white">{t('Semaine du', 'Week of')} {dm(dates[0])} {t('au', 'to')} {dm(dates[6])}</div>
      <button type="button" aria-label={t('Semaine suivante', 'Next week')} onClick={() => setMonday(planAddDays(monday, 7))} className={btn}><ChevronRight className="w-4 h-4" /></button>
      {monday !== mondayOf(today) && <button type="button" onClick={() => setMonday(mondayOf(today))} className={btn}>{t('Aujourd\'hui', 'Today')}</button>}
    </div>
  );

  if (!isAdmin) {
    const next = weekDates(planAddDays(monday, 7));
    const week = (ds: string[]) => (
      <ul className="space-y-1.5">
        {ds.map((d, i) => { const k = kindAt(myId, d); const leave = isOnLeave(leaves, myId, d); return (
          <li key={d} className={`flex items-center gap-3 rounded-lg border px-3 min-h-[44px] ${d === today ? 'border-emerald-500' : 'border-slate-700'}`}>
            <span className="w-16 text-xs font-mono text-slate-300">{days[i]} {dm(d)}</span>
            <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${KIND_CLS[k || 'empty']}`}>{k ? SHIFT_LABEL[k][lang === 'en' ? 'en' : 'fr'] : t('Non planifié', 'Not planned')}</span>
            {leave && <span className="text-[11px] text-emerald-300">{t('Congé accepté', 'Approved leave')}</span>}
          </li>
        ); })}
      </ul>
    );
    return (
      <div className={card}>
        <h2 className="text-sm font-bold text-white">{t('Mon planning', 'My schedule')}</h2>
        {nav}
        {week(dates)}
        <h3 className="text-xs font-bold text-slate-300 uppercase font-mono pt-1">{t('Semaine suivante', 'Next week')}</h3>
        {week(next)}
        <p className="text-[11px] text-slate-500">{t('Le planning est fait par le responsable. Pour un changement, parle-lui.', 'The schedule is made by the manager. For a change, talk to them.')}</p>
      </div>
    );
  }

  const cov = coverage(shifts, dates);
  return (
    <div className="space-y-3">
      <div className={card}>
        <h2 className="text-sm font-bold text-white">{t('Planning des équipes', 'Team schedule')}</h2>
        <p className="text-[11px] text-slate-400">{t('Un clic sur une case : Jour, puis Nuit, puis Repos, puis vide. Les changements sont enregistrés tout de suite. Les congés acceptés et les conflits sont signalés, rien n\'est bloqué.', 'One tap on a cell: Day, then Night, then Off, then empty. Changes are saved at once. Approved leave and conflicts are flagged, nothing is blocked.')}</p>
        {nav}
        {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
        {staff.length === 0 ? <p className="text-xs text-slate-500">{t('Aucun salarié actif à planifier.', 'No active employee to schedule.')}</p> : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
              <thead><tr><th className="text-left text-slate-400 font-mono font-normal w-28">{t('Salarié', 'Employee')}</th>{dates.map((d, i) => <th key={d} className={`font-mono font-normal ${d === today ? 'text-emerald-300' : 'text-slate-400'}`}>{days[i]}<br />{dm(d)}</th>)}</tr></thead>
              <tbody>
                {staff.map(u => (
                  <tr key={u.id}>
                    <td className="text-slate-200 font-semibold break-words pr-1">{u.name}</td>
                    {dates.map(d => {
                      const k = kindAt(u.id, d), leave = isOnLeave(leaves, u.id, d), bad = conflictAt(u.id, d);
                      const label = k ? SHIFT_LABEL[k][lang === 'en' ? 'en' : 'fr'] : t('vide', 'empty');
                      return (
                        <td key={d}>
                          <button type="button" onClick={() => cycle(u.id, d)} aria-label={`${u.name}, ${dm(d)} : ${label}${leave ? ', ' + t('congé accepté', 'approved leave') : ''}${bad ? ', ' + t('conflit', 'conflict') : ''}`}
                            className={`relative w-full min-h-[44px] rounded-md border font-mono font-bold ${KIND_CLS[k || 'empty']} ${bad ? 'ring-2 ring-red-500' : ''}`}>
                            {k ? SHIFT_LABEL[k].short : '·'}
                            {leave && <span className="absolute top-0.5 right-1 text-[9px] text-emerald-300">{t('C', 'L')}</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="text-slate-400 font-mono">{t('Présents', 'On duty')}</td>
                  {cov.map(c => <td key={c.date} className="text-center text-[10px] font-mono text-slate-300">{t('J', 'D')}{c.day} · {t('N', 'N')}{c.night}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500">{t('J = Jour, N = Nuit, R = Repos, C = congé accepté (cadre rouge = conflit).', 'D = Day, N = Night, R = Off, L = approved leave (red frame = conflict).')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyPrevious} className={btn}><Copy className="w-4 h-4" />{t('Copier la semaine précédente', 'Copy last week')}</button>
          <button type="button" onClick={clearWeek} className={`${btn} text-red-300`}><Eraser className="w-4 h-4" />{t('Vider la semaine', 'Clear week')}</button>
        </div>
      </div>
      <div className={card}>
        <h3 className="text-sm font-bold text-white">{t('Conflits de la semaine', 'Conflicts this week')}</h3>
        {conflicts.length === 0 ? <p className="text-xs text-emerald-300">{t('Aucun conflit.', 'No conflict.')}</p> : (
          <ul className="space-y-1.5">
            {conflicts.map(c => (
              <li key={`${c.kind}-${c.employee_id}-${c.date}`} className="rounded-lg border border-red-500/50 px-3 py-2 text-xs text-slate-200">
                <b>{nameOf(c.employee_id)}</b> · {c.kind === 'too_many' ? `${t('semaine du', 'week of')} ${dm(c.date)}` : dm(c.date)} · {CONFLICT_LABEL[c.kind][lang === 'en' ? 'en' : 'fr']}{c.kind === 'too_many' && max > 0 ? ` (${t('limite', 'limit')} ${max})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
