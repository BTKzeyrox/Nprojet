import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { db } from '../db/store';
import { askReason } from './ReasonModal';
import { ACCESS_HOURS, madaClock, shiftEndMs, resolveAccessUntil, untilFromClock } from '../utils/accessRequest';
import type { AccessRequest, AppSettings } from '../types';

const ROLE_FR: Record<string, string> = { employee: 'Opérateur', accountant: 'Comptable', team_lead: "Chef d'équipe" };

// Choix de la fin d'autorisation : fin de la vacation (par défaut), 1/2/4/8/12 h, ou une heure précise
const EndChoice: React.FC<{ r: AccessRequest; cfg: AppSettings; value: string; onChange: (v: string) => void; clock: string; onClock: (v: string) => void }> = ({ r, cfg, value, onChange, clock, onClock }) => {
  const now = Date.now();
  const end = resolveAccessUntil(r.shift, cfg, now, 'shift_end', undefined) ?? shiftEndMs(r.shift, cfg, now);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={value} onChange={e => onChange(e.target.value)} data-access-end className="min-h-[44px] px-2 text-xs font-mono rounded-lg border bg-slate-800 text-slate-100 border-slate-600 cursor-pointer">
        <option value="shift_end">{`Fin de sa vacation (${madaClock(end)})`}</option>
        {ACCESS_HOURS.map(h => <option key={h} value={`h${h}`}>{`${h} heure${h > 1 ? 's' : ''}`}</option>)}
        <option value="clock">Heure précise…</option>
      </select>
      {value === 'clock' && <input type="time" value={clock} onChange={e => onClock(e.target.value)} className="min-h-[44px] px-2 text-xs font-mono rounded-lg border bg-slate-800 text-slate-100 border-slate-600" aria-label="Heure de fin" />}
    </div>
  );
};

const toBody = (choice: string, clock: string): { mode: 'shift_end' | 'hours' | 'until'; value?: number } | null => {
  if (choice === 'shift_end') return { mode: 'shift_end' };
  if (choice.startsWith('h')) return { mode: 'hours', value: Number(choice.slice(1)) };
  const t = untilFromClock(clock, Date.now());
  return t === null ? null : { mode: 'until', value: t };
};

export const AccessRequestsCard: React.FC<{ requests: AccessRequest[]; cfg: AppSettings }> = ({ requests, cfg }) => {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [clock, setClock] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = requests.filter(r => r.status === 'pending');
  const active = requests.filter(r => r.status === 'approved');
  if (pending.length + active.length === 0) return null;

  const decide = async (r: AccessRequest, decision: 'approve' | 'change') => {
    const body = toBody(choice[r.id] || 'shift_end', clock[r.id] || '');
    if (!body) { setErr('Choisis une heure de fin.'); return; }
    setErr(null); setBusy(true);
    const res = await db.decideAccess(r.id, { decision, ...body });
    setBusy(false);
    if (!res.success) setErr(res.error || 'Action impossible.');
  };
  const who = (r: AccessRequest) => (
    <div className="text-white font-bold text-sm break-words">{r.name} <span className="text-slate-400 font-normal">(@{r.username} · {ROLE_FR[r.role] || r.role} · {r.shift === 'night' ? 'nuit' : 'jour'})</span></div>
  );

  return (
    <div className="bg-[#0d1a1f] border-2 border-cyan-500 p-3 sm:p-4 space-y-3" data-access-card>
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-cyan-400 shrink-0" />
        <h3 className="font-tactical font-black text-white text-sm sm:text-base">{pending.length > 0 ? `${pending.length} connexion${pending.length > 1 ? 's' : ''} hors horaires à valider` : 'Connexions hors horaires autorisées'}</h3>
      </div>
      {err && <div className="p-2 bg-red-950 border rounded-xl border-red-500/60 text-red-200 text-xs font-semibold">{err}</div>}
      {pending.map(r => (
        <div key={r.id} data-nav={`val-acc-${r.id}`} className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 space-y-2">
          <div className="text-xs font-mono space-y-0.5">
            {who(r)}
            <div className="text-cyan-300 break-words">Raison : {r.reason}</div>
            <div className="text-slate-400">Demandé le {new Date(r.created_at).toLocaleString('fr-FR')}</div>
          </div>
          <EndChoice r={r} cfg={cfg} value={choice[r.id] || 'shift_end'} onChange={v => setChoice(c => ({ ...c, [r.id]: v }))} clock={clock[r.id] || ''} onClock={v => setClock(c => ({ ...c, [r.id]: v }))} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => askReason({ title: 'Refuser la demande ?', message: `${r.name} verra ce motif sur la page de connexion.`, onSubmit: reason => void db.decideAccess(r.id, { decision: 'refuse', reason }).then(x => { if (!x.success) setErr(x.error || 'Action impossible.'); }) })}
              className="min-h-[44px] px-3 bg-[#141e2a] hover:bg-[#1b2f44] border rounded-xl border-red-500/60 text-red-300 text-xs font-bold cursor-pointer">Refuser</button>
            <button type="button" disabled={busy} onClick={() => void decide(r, 'approve')} className="min-h-[44px] rounded-xl px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">Autoriser</button>
          </div>
        </div>
      ))}
      {active.map(r => (
        <div key={r.id} data-nav={`val-acc-${r.id}`} className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 space-y-2">
          <div className="text-xs font-mono space-y-0.5">
            {who(r)}
            <div className="text-emerald-300">Autorisé jusqu'à {r.until ? madaClock(Date.parse(r.until)) : '—'} (Madagascar)</div>
          </div>
          <EndChoice r={r} cfg={cfg} value={choice[r.id] || 'shift_end'} onChange={v => setChoice(c => ({ ...c, [r.id]: v }))} clock={clock[r.id] || ''} onClock={v => setClock(c => ({ ...c, [r.id]: v }))} />
          <button type="button" disabled={busy} onClick={() => void decide(r, 'change')} className="w-full min-h-[44px] rounded-xl px-3 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold cursor-pointer">Modifier l'heure de fin</button>
        </div>
      ))}
    </div>
  );
};
