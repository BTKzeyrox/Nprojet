import React, { useEffect, useState } from 'react';
import { Printer, ChevronDown, ChevronUp, BadgeCheck } from 'lucide-react';
import { db } from '../db/store';
import { formatCurrencyAr } from '../utils/formatUtils';
import { Slip, pidLabel, fmtDay, fmtScore, printSlip } from '../utils/payslip';

export interface AdvanceRoom {
  pid: string; start: string; end: string; gross: number; bonuses: number; due: number;
  cap_pct: number; max: number | null; used: number; available: number | null;
}

// Plafond d'avance possible pour le booster connecté (lu sur le serveur)
export const useAdvanceRoom = (active: boolean): AdvanceRoom | null => {
  const [room, setRoom] = useState<AdvanceRoom | null>(null);
  useEffect(() => {
    if (!active) return;
    let on = true;
    void db.payrollCall('payroll-mine').then(r => { if (on && r.success) setRoom(r.data.current); });
    return () => { on = false; };
  }, [active]);
  return room;
};

export const AdvanceRoomInfo: React.FC<{ room: AdvanceRoom | null }> = ({ room }) => {
  if (!room) return null;
  return (
    <div className="p-2.5 bg-[#141e2a] border border-slate-700 text-[11px] font-mono space-y-1 mb-3">
      <div className="flex justify-between"><span className="text-slate-400">Gagné cette période</span><span className="text-white">{formatCurrencyAr(room.gross + room.bonuses)}</span></div>
      {room.due > 0 && <div className="flex justify-between"><span className="text-slate-400">Avances à rembourser</span><span className="text-amber-300">{formatCurrencyAr(room.due)}</span></div>}
      {room.available === null ? (
        <div className="text-slate-400">Pas de plafond d'avance.</div>
      ) : (
        <div className="flex justify-between"><span className="text-slate-400">Avance possible ({room.cap_pct} % du gagné)</span><span className={room.available > 0 ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>{formatCurrencyAr(room.available)}</span></div>
      )}
    </div>
  );
};

export const MyPayroll: React.FC = () => {
  const [data, setData] = useState<{ slips: Slip[]; current: AdvanceRoom } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void db.payrollCall('payroll-mine').then(r => { if (!on) return; if (r.success) setData(r.data); else setErr(r.error || 'Erreur.'); });
    return () => { on = false; };
  }, []);

  if (err) return <div className="p-3 bg-red-950 border border-red-500/60 text-red-200 text-xs">{err}</div>;
  if (!data) return <div className="p-3 text-xs font-mono text-slate-400">Chargement…</div>;
  const c = data.current;

  return (
    <div className="space-y-3">
      <div className="bg-[#0f1722] border border-slate-800 p-3 sm:p-4 space-y-2">
        <h3 className="font-tactical font-bold text-white text-base">Période en cours : {pidLabel(c.pid)}</h3>
        <div className="text-[11px] font-mono text-slate-400">Du {fmtDay(c.start)} au {fmtDay(c.end)} · estimation, figée à la clôture par l'administrateur</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-[11px] font-mono">
          <div className="bg-[#141e2a] border border-slate-700 p-2"><div className="text-slate-400">Gagné</div><div className="text-white font-bold">{formatCurrencyAr(c.gross)}</div></div>
          <div className="bg-[#141e2a] border border-slate-700 p-2"><div className="text-slate-400">Primes</div><div className="text-emerald-300 font-bold">{formatCurrencyAr(c.bonuses)}</div></div>
          <div className="bg-[#141e2a] border border-slate-700 p-2 col-span-2 sm:col-span-1"><div className="text-slate-400">Avances à rembourser</div><div className="text-amber-300 font-bold">{formatCurrencyAr(c.due)}</div></div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-tactical font-bold text-white text-base">Mes fiches de paie</h3>
        {data.slips.length === 0 && <div className="p-3 bg-[#0f1722] border border-slate-800 text-xs font-mono text-slate-400">Aucune fiche pour l'instant. Elle apparaît quand l'administrateur clôture une période.</div>}
        {data.slips.map(s => {
          const open = openId === s.id;
          return (
            <div key={s.id} className="bg-[#0f1722] border border-slate-800">
              <button type="button" onClick={() => setOpenId(open ? null : s.id)} className="w-full flex items-center gap-3 p-3 text-left cursor-pointer">
                <div className="min-w-0 mr-auto">
                  <div className="text-white font-bold text-sm">{pidLabel(s.pid)}</div>
                  <div className="text-[11px] font-mono text-slate-400">{s.lines.length} session(s) · gagné {formatCurrencyAr(s.gross)}</div>
                </div>
                {s.paid ? <span className="inline-flex items-center gap-1 px-2 py-1 border border-emerald-500/50 text-emerald-300 text-[11px] font-mono"><BadgeCheck className="w-3.5 h-3.5" />Payé</span>
                  : <span className="px-2 py-1 border border-amber-500/60 text-amber-300 text-[11px] font-mono">À payer</span>}
                <div className="text-right"><div className="text-[10px] font-mono text-slate-400">Net</div><div className="text-emerald-200 font-bold text-sm">{formatCurrencyAr(s.net)}</div></div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {open && (
                <div className="border-t border-slate-800 p-3 space-y-2 text-[11px] font-mono">
                  <div className="overflow-x-auto border border-slate-700">
                    <table className="w-full">
                      <thead className="bg-[#141e2a] text-slate-300"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Poste</th><th className="p-2 text-right">Points</th><th className="p-2 text-right">Montant</th></tr></thead>
                      <tbody>{s.lines.map(l => <tr key={l.post_id} className="border-t border-slate-800"><td className="p-2">{fmtDay(l.date)}</td><td className="p-2">{l.post_number ? `Poste ${l.post_number} · ` : ''}{l.client}</td><td className="p-2 text-right">{fmtScore(l.score)}</td><td className="p-2 text-right">{formatCurrencyAr(l.amount)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {s.bonuses.map(b => <div key={b.id} className="flex justify-between text-emerald-300"><span className="break-words">Prime : {b.reason}</span><span>+ {formatCurrencyAr(b.amount)}</span></div>)}
                  {s.penalties.map(b => <div key={b.id} className="flex justify-between text-red-300"><span className="break-words">Retenue : {b.reason}</span><span>− {formatCurrencyAr(b.amount)}</span></div>)}
                  {s.advance_deducted > 0 && <div className="flex justify-between text-amber-300"><span>Avances remboursées</span><span>− {formatCurrencyAr(s.advance_deducted)}</span></div>}
                  {s.advance_carry > 0 && <div className="flex justify-between text-slate-400"><span>Avance restant à rembourser</span><span>{formatCurrencyAr(s.advance_carry)}</span></div>}
                  {s.paid && <div className="text-emerald-300">Payé le {fmtDay(s.paid.at)} par {s.paid.method}{s.paid.ref ? ` (réf. ${s.paid.ref})` : ''}</div>}
                  <button type="button" onClick={() => printSlip(s)} className="inline-flex items-center gap-2 px-3 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-xs text-slate-200 cursor-pointer"><Printer className="w-4 h-4" />Imprimer</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
