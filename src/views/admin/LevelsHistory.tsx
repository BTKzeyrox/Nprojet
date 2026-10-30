import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { cleanLevels, levelInfo, monthCount, lastMonths, monthLabel } from '../../utils/monthLevel';
import { todayMada } from '../../utils/stats';

const TONE = ['text-amber-300', 'text-slate-200', 'text-emerald-300', 'text-cyan-300'];

/** Historique mensuel : pour chaque opérateur et chacun des 6 derniers mois, les missions validées et le niveau (calculés, jamais saisis). */
export const LevelsHistory: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const cfg = cleanLevels(db.getSettings().perf_levels);
  const posts = db.getPosts();
  const months = lastMonths(todayMada().slice(0, 7), 6);
  const emps = db.getUsers().filter(u => u.role === 'employee').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const cell = 'px-3 py-2 text-xs font-mono whitespace-nowrap';
  return (
    <div className="bg-[#0f1722] border rounded-xl border-slate-700 overflow-x-auto" data-levels-history>
      <div className="p-3 text-[11px] text-slate-400 font-mono">
        Niveau d'après les missions validées du mois : {cfg.names.map((n, i) => `${n}${i === 0 ? '' : ` dès ${cfg.mins[i - 1]}`}`).join(' · ')}. « Très faible » sous {cfg.very_low}. Le mois en cours n'est pas fini.
      </div>
      {emps.length === 0 ? <div className="p-4 text-sm text-slate-400 font-mono">Aucun opérateur.</div> : (
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-mono text-slate-400">
              <th className={`${cell} text-left font-normal`}>Opérateur</th>
              {months.map((m, i) => <th key={m} className={`${cell} text-right font-normal`}>{monthLabel(m)}{i === 0 ? ' (en cours)' : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {emps.map(u => (
              <tr key={u.id} className="border-t border-slate-700 text-slate-200">
                <td className={`${cell} text-left`}>{u.name}</td>
                {months.map(m => {
                  const info = levelInfo(monthCount(posts, u.id, m), cfg);
                  return (
                    <td key={m} className={`${cell} text-right`} data-level-cell>
                      <div className="font-bold">{info.count}</div>
                      <div className={`${TONE[info.index]} text-[10px]`}>{info.name}{info.veryLow && info.count > 0 ? ' · très faible' : ''}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
