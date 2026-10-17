import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { db } from '../../db/store';
import { buildPerformance, totalRow, fmtDuration, exportPerformanceExcel, exportPerformanceCsv, type PerfPeriod, type PerfRow } from '../../utils/performance';

const PERIODS: [PerfPeriod, string][] = [['7', '7 jours'], ['30', '30 jours'], ['all', 'Tout']];

export const PerformancePage: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [period, setPeriod] = useState<PerfPeriod>('30');
  const [busy, setBusy] = useState(false);

  const sig = db.getPosts().map(p => `${p.id}${p.status}${p.end_time || ''}`).join() + db.getUsers().length;
  const rows = useMemo(() => buildPerformance(period), [period, sig]);
  const total = useMemo(() => totalRow(rows), [rows]);
  const empty = total.done + total.rejected + total.open === 0;

  const onExcel = async () => {
    setBusy(true);
    try { await exportPerformanceExcel(rows, period); } catch { /* le navigateur a refusé le téléchargement */ }
    setBusy(false);
  };

  const cell = 'px-3 py-2 text-xs font-mono whitespace-nowrap';
  const line = (r: PerfRow, strong = false) => (
    <tr key={r.id} className={`border-t border-slate-700 ${strong ? 'font-bold text-white bg-[#141e2a]' : 'text-slate-200'}`}>
      <td className={`${cell} text-left`}>{r.name}</td>
      <td className={`${cell} text-right`}>{r.done}</td>
      <td className={`${cell} text-right`}>{r.rejected}</td>
      <td className={`${cell} text-right`}>{r.open}</td>
      <td className={`${cell} text-right`}>{r.rate === null ? '–' : `${r.rate} %`}</td>
      <td className={`${cell} text-right`}>{fmtDuration(r.avgMin)}</td>
    </tr>
  );

  return (
    <div className="max-w-4xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-tactical font-black text-white text-base sm:text-lg">Performance</h2>
          <span className="text-xs font-mono text-slate-400">{rows.length} opérateur{rows.length > 1 ? 's' : ''}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          {PERIODS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)} className={`px-3 py-1.5 border cursor-pointer ${period === k ? 'bg-emerald-600 border-emerald-500 text-white font-bold' : 'bg-[#141e2a] border-slate-700 text-slate-300 hover:text-white'}`}>{label}</button>
          ))}
          <span className="flex-1" />
          <button type="button" disabled={busy || rows.length === 0} onClick={onExcel} className="px-3 py-1.5 border bg-[#141e2a] border-slate-700 text-slate-200 hover:border-emerald-500 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />Excel (.xlsx)
          </button>
          <button type="button" disabled={rows.length === 0} onClick={() => exportPerformanceCsv(rows, period)} className="px-3 py-1.5 border bg-[#141e2a] border-slate-700 text-slate-200 hover:border-emerald-500 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      {rows.length === 0 || empty ? (
        <div className="text-sm text-slate-400 font-mono p-4">Aucune mission sur cette période.</div>
      ) : (
        <div className="bg-[#0f1722] border rounded-xl border-slate-700 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-mono text-slate-400">
                <th className={`${cell} text-left font-normal`}>Opérateur</th>
                <th className={`${cell} text-right font-normal`}>Terminées</th>
                <th className={`${cell} text-right font-normal`}>Refusées</th>
                <th className={`${cell} text-right font-normal`}>En cours</th>
                <th className={`${cell} text-right font-normal`}>Taux d’acceptation</th>
                <th className={`${cell} text-right font-normal`}>Délai moyen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => line(r))}
              {line(total, true)}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500 font-mono px-1">Taux d’acceptation = terminées ÷ (terminées + refusées). Délai moyen = de début à fin de mission, sur les missions terminées.</p>
    </div>
  );
};
