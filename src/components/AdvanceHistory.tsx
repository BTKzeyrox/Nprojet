import React, { useMemo, useState } from 'react';
import { Search, X, CheckCircle2, XCircle, Hourglass, HandCoins } from 'lucide-react';
import { SalaryAdvanceRequest, AdvanceStatus } from '../types';
import { formatCurrencyAr } from '../utils/formatUtils';

interface Props {
  advances: SalaryAdvanceRequest[];
  showBooster?: boolean; // admin : filtre par booster
}

type StatusFilter = 'all' | AdvanceStatus;

const STATUS: Record<AdvanceStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-950/80 border-amber-500/50 text-amber-300' },
  approved: { label: 'Validé', cls: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' },
  rejected: { label: 'Rejeté', cls: 'bg-red-950/80 border-red-500/50 text-red-300' },
};

const StatusIcon: React.FC<{ s: AdvanceStatus }> = ({ s }) =>
  s === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : s === 'rejected' ? <XCircle className="w-3.5 h-3.5" /> : <Hourglass className="w-3.5 h-3.5" />;

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
};

// Historique des avances : recherche + filtres (statut, mois, booster, montant) + totaux
export const AdvanceHistory: React.FC<Props> = ({ advances, showBooster = false }) => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [month, setMonth] = useState('all');
  const [booster, setBooster] = useState('all');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const months = useMemo(
    () => Array.from(new Set(advances.map(a => a.request_date.slice(0, 7)))).sort().reverse(),
    [advances]
  );
  const boosters = useMemo(
    () => Array.from(new Set(advances.map(a => a.employee_name))).sort((a, b) => a.localeCompare(b)),
    [advances]
  );

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const lo = min ? Number(min.replace(/\D/g, '')) : 0;
    const hi = max ? Number(max.replace(/\D/g, '')) : Infinity;
    return advances
      .filter(a => {
        if (status !== 'all' && a.status !== status) return false;
        if (month !== 'all' && !a.request_date.startsWith(month)) return false;
        if (booster !== 'all' && a.employee_name !== booster) return false;
        if (a.amount_ar < lo || a.amount_ar > hi) return false;
        if (query && !`${a.employee_name} ${a.reason} ${a.admin_notes || ''}`.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => b.request_date.localeCompare(a.request_date) || b.id.localeCompare(a.id));
  }, [advances, q, status, month, booster, min, max]);

  const sum = (s: AdvanceStatus) => list.filter(a => a.status === s).reduce((t, a) => t + a.amount_ar, 0);
  const count = (s: AdvanceStatus) => advances.filter(a => a.status === s).length;
  const filtersOn = q || status !== 'all' || month !== 'all' || booster !== 'all' || min || max;

  const chip = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold border cursor-pointer ${
      active ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-[#141e2a] border-slate-700 text-slate-300 hover:text-white'
    }`;
  const field = 'w-full bg-[#141e2a] border border-slate-700 px-2 py-2 text-sm text-white focus:border-emerald-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-bold text-white text-sm">
        <HandCoins className="w-4 h-4 text-amber-400" /> Historique des avances
        <span className="ml-auto text-xs text-slate-400 font-semibold">{list.length}/{advances.length}</span>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={showBooster ? 'Rechercher un booster, un motif…' : 'Rechercher un motif…'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={`${field} pl-8 pr-8`}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label="Effacer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Statut */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setStatus('all')} className={chip(status === 'all')}>Tous ({advances.length})</button>
        {(['pending', 'approved', 'rejected'] as AdvanceStatus[]).map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`${chip(status === s)} inline-flex items-center gap-1`}>
            <StatusIcon s={s} /> {STATUS[s].label} ({count(s)})
          </button>
        ))}
      </div>

      {/* Mois, booster, montant */}
      <div className={`grid gap-2 ${showBooster ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <select value={month} onChange={e => setMonth(e.target.value)} className={field}>
          <option value="all">Tous les mois</option>
          {months.map(m => (<option key={m} value={m}>{monthLabel(m)}</option>))}
        </select>
        {showBooster && (
          <select value={booster} onChange={e => setBooster(e.target.value)} className={field}>
            <option value="all">Tous les boosters</option>
            {boosters.map(b => (<option key={b} value={b}>{b}</option>))}
          </select>
        )}
        <input type="text" inputMode="numeric" value={min} onChange={e => setMin(e.target.value.replace(/[^\d]/g, ''))} placeholder="Montant min (Ar)" className={field} />
        <input type="text" inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/[^\d]/g, ''))} placeholder="Montant max (Ar)" className={field} />
      </div>
      {filtersOn && (
        <button type="button" onClick={() => { setQ(''); setStatus('all'); setMonth('all'); setBooster('all'); setMin(''); setMax(''); }} className="text-xs text-slate-300 hover:text-white border border-slate-700 px-3 py-1.5">
          Réinitialiser les filtres
        </button>
      )}

      {/* Totaux du résultat */}
      <div className="grid grid-cols-3 gap-2">
        {(['pending', 'approved', 'rejected'] as AdvanceStatus[]).map(s => (
          <div key={s} className="bg-[#0f1722] border border-slate-800 p-2 min-w-0">
            <div className="text-[10px] uppercase text-slate-400 font-semibold leading-tight">{STATUS[s].label}</div>
            <div className="mt-0.5 font-bold text-xs sm:text-sm text-white break-words">{formatCurrencyAr(sum(s))}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      {list.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-800">
          {advances.length === 0 ? "Aucune demande d'avance enregistrée." : 'Aucune demande ne correspond aux filtres.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {list.map(a => (
            <div key={a.id} data-nav={`adv-${a.id}`} className="bg-[#131c28] border border-slate-800 p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {showBooster && <span className="text-white font-semibold text-sm break-words">{a.employee_name}</span>}
                  <span className="text-base font-bold text-amber-400">{formatCurrencyAr(a.amount_ar)}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] font-bold uppercase ${STATUS[a.status].cls}`}>
                    <StatusIcon s={a.status} /> {STATUS[a.status].label}
                  </span>
                </div>
                <p className="text-slate-300 text-sm break-words">{a.reason}</p>
                {a.admin_notes && (
                  <p className="text-[11px] text-cyan-300 bg-cyan-950/40 p-1.5 border border-cyan-800/60 break-words">Note Admin : {a.admin_notes}</p>
                )}
              </div>
              <div className="text-slate-400 text-[11px] sm:text-right shrink-0">{a.request_date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
