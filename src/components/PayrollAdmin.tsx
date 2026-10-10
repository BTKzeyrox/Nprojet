import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { Lock, Unlock, Download, Printer, Plus, Wallet, X, BadgeCheck, MinusCircle } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { askReason } from './ReasonModal';
import { dayMada } from '../utils/presence';
import { formatCurrencyAr } from '../utils/formatUtils';
import { Slip, pidLabel, fmtDay, fmtScore, printSlip, downloadCsv } from '../utils/payslip';

const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
// Les 12 dernières périodes, de la plus récente à la plus ancienne
const periodsBack = (mode: 'month' | 'half', count = 12) => {
  const t = dayMada();
  let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  let half: 'A' | 'B' = Number(t.slice(8, 10)) <= 15 ? 'A' : 'B';
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const ym = `${y}-${p2(m)}`;
    if (mode === 'half') {
      out.push(`${ym}-${half}`);
      if (half === 'B') half = 'A';
      else { half = 'B'; m -= 1; if (m === 0) { m = 12; y -= 1; } }
    } else {
      out.push(ym);
      m -= 1; if (m === 0) { m = 12; y -= 1; }
    }
  }
  return out;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Ouverte', cls: 'border-sky-500/50 text-sky-300' },
  to_check: { label: 'À vérifier', cls: 'border-amber-500/60 text-amber-300' },
  closed: { label: 'Clôturée', cls: 'border-emerald-500/50 text-emerald-300' },
  paid: { label: 'Payée', cls: 'border-emerald-400 text-emerald-200' },
};
const AUDIT_LABEL: Record<string, string> = { close: 'Clôture', reopen: 'Réouverture', pay: 'Paiement', unpay: 'Paiement annulé', bonus: 'Prime', penalty: 'Retenue', 'bonus-delete': 'Suppression' };

const inp = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const sum = (a: { amount: number }[]) => a.reduce((t, x) => t + (x.amount || 0), 0);

export const PayrollAdmin: React.FC = () => {
  const mode0 = db.getSettings().pay_period === 'half' ? 'half' : 'month';
  const [pid, setPid] = useState(() => periodsBack(mode0)[0]);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Slip | null>(null);
  const [amountFor, setAmountFor] = useState<{ slip: Slip; type: 'bonus' | 'penalty' } | null>(null);
  const [payFor, setPayFor] = useState<Slip | null>(null);
  useLockBodyScroll(!!open || !!amountFor || !!payFor);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await db.payrollCall('payroll-period', { pid });
    setBusy(false);
    if (!r.success) { setErr(r.error || 'Erreur.'); return; }
    setErr(null);
    setData(r.data);
    setOpen(cur => (cur ? (r.data.slips as Slip[]).find(s => s.user_id === cur.user_id) || null : null));
  }, [pid]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const act = async (route: string, body: Record<string, unknown>) => {
    setBusy(true);
    const r = await db.payrollCall(route, { pid, ...body });
    setBusy(false);
    if (!r.success) { setErr(r.error || 'Erreur.'); return false; }
    setErr(null);
    await load();
    return true;
  };

  const slips: Slip[] = data?.slips || [];
  const status: string = data?.status || 'open';
  const isClosed = status === 'closed' || status === 'paid';
  const cfg = data?.cfg || { methods: [], penalties: false };
  const tot = useMemo(() => {
    const gross = slips.reduce((t, s) => t + s.gross, 0);
    const bonus = slips.reduce((t, s) => t + sum(s.bonuses), 0);
    const pen = slips.reduce((t, s) => t + s.penalty_applied, 0);
    const adv = slips.reduce((t, s) => t + s.advance_deducted, 0);
    const net = slips.reduce((t, s) => t + s.net, 0);
    const paid = slips.reduce((t, s) => t + (s.paid ? s.net : 0), 0);
    return { gross, bonus, pen, adv, net, paid };
  }, [slips]);
  const periods = useMemo(() => {
    const base = periodsBack(data?.cfg?.mode || mode0);
    return base.includes(pid) ? base : [pid, ...base];
  }, [data?.cfg?.mode, mode0, pid]);

  const closePeriod = () => askConfirm({
    title: `Clôturer ${pidLabel(pid)} ?`,
    message: 'Les fiches de paie sont figées : les montants ne changent plus, même si les prix changent. Les avances dues sont retenues. Tu pourras rouvrir avec un motif tant qu\'aucune fiche n\'est payée.',
    confirmLabel: 'Clôturer',
    onConfirm: () => void act('payroll-close', {}),
  });
  const reopen = () => askReason({
    title: `Rouvrir ${pidLabel(pid)} ?`,
    message: 'Les fiches seront supprimées et recalculées. L\'action est écrite dans le journal.',
    confirmLabel: 'Rouvrir',
    onSubmit: reason => void act('payroll-reopen', { reason }),
  });
  const exportCsv = () => downloadCsv(`paie-${pid}${isClosed ? '' : '-apercu'}.csv`, [
    ['Booster', 'Pseudo', 'Téléphone', 'Gagné (Ar)', 'Primes (Ar)', 'Retenues (Ar)', 'Avances retenues (Ar)', 'Net à payer (Ar)', 'Payé le', 'Mode', 'Référence'],
    ...slips.map(s => [s.name, s.username, s.phone, s.gross, sum(s.bonuses), s.penalty_applied, s.advance_deducted, s.net, s.paid?.at || '', s.paid?.method || '', s.paid?.ref || '']),
  ]);

  return (
    <div className="space-y-3">
      <div className="bg-[#0f1722] border border-slate-800 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400 shrink-0" />
          <h3 className="font-tactical font-bold text-white text-base mr-auto">Paie</h3>
          <select value={pid} onChange={e => setPid(e.target.value)} className="h-9 px-2 bg-[#141e2a] border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500">
            {periods.map(p => <option key={p} value={p}>{pidLabel(p)}</option>)}
          </select>
          <span className={`px-2 py-1 border text-[11px] font-mono ${(STATUS[status] || STATUS.open).cls}`}>{(STATUS[status] || STATUS.open).label}</span>
        </div>
        {data && <div className="text-xs font-mono text-slate-400">Du {fmtDay(data.start)} au {fmtDay(data.end)}{data.closed_at ? ` · clôturée le ${fmtDay(data.closed_at)}${data.closed_by_name ? ' par ' + data.closed_by_name : ''}` : ' · aperçu, pas encore figé'}</div>}
        {err && <div className="p-2.5 bg-red-950 border border-red-500/60 text-red-200 text-xs font-semibold">{err}</div>}
        {data && !isClosed && data.pending_validation > 0 && (
          <div className="p-2.5 bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs">{data.pending_validation} session(s) de cette période sont encore à valider ou en cours : la clôture est bloquée tant qu'elles ne sont pas traitées.</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px] font-mono">
          {[['Gagné', tot.gross, 'text-white'], ['Primes', tot.bonus, 'text-emerald-300'], ['Retenues', tot.pen, 'text-red-300'], ['Avances retenues', tot.adv, 'text-amber-300'], ['Net à payer', tot.net, 'text-emerald-200']].map(([l, v, c]) => (
            <div key={l as string} className="bg-[#141e2a] border border-slate-700 p-2"><div className="text-slate-400">{l as string}</div><div className={`font-bold ${c as string}`}>{formatCurrencyAr(v as number)}</div></div>
          ))}
        </div>
        {isClosed && <div className="text-xs font-mono text-slate-300">Déjà payé : <b className="text-emerald-300">{formatCurrencyAr(tot.paid)}</b> · Reste : <b className="text-amber-300">{formatCurrencyAr(tot.net - tot.paid)}</b></div>}
        <div className="flex flex-wrap gap-2">
          {status === 'to_check' && (
            <button type="button" disabled={busy || (data?.pending_validation || 0) > 0} onClick={closePeriod} className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"><Lock className="w-4 h-4" />Clôturer la période</button>
          )}
          {status === 'open' && <span className="text-xs font-mono text-slate-400 self-center">La période se clôture après son dernier jour.</span>}
          {status === 'closed' && (
            <button type="button" disabled={busy} onClick={reopen} className="inline-flex items-center gap-2 px-3 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-slate-200 text-xs font-semibold cursor-pointer"><Unlock className="w-4 h-4" />Rouvrir (motif)</button>
          )}
          <button type="button" disabled={!slips.length} onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-40"><Download className="w-4 h-4" />Exporter (CSV)</button>
        </div>
      </div>

      {busy && !data && <div className="p-3 text-xs font-mono text-slate-400">Chargement…</div>}
      {data && slips.length === 0 && <div className="p-3 bg-[#0f1722] border border-slate-800 text-xs font-mono text-slate-400">Aucune paie sur cette période.</div>}

      {slips.map(s => (
        <div key={s.id} className="bg-[#0f1722] border border-slate-800 p-3 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="min-w-0 lg:w-56">
            <div className="text-white font-bold text-sm break-words">{s.name}</div>
            <div className="text-[11px] font-mono text-slate-400">@{s.username} · {s.lines.length} session(s)</div>
          </div>
          <div className="grid grid-cols-4 gap-2 flex-1 text-center text-[11px] font-mono">
            <div><div className="text-slate-400">Gagné</div><div className="text-white">{formatCurrencyAr(s.gross)}</div></div>
            <div><div className="text-slate-400">Primes</div><div className="text-emerald-300">{formatCurrencyAr(sum(s.bonuses))}</div></div>
            <div><div className="text-slate-400">Retenues</div><div className="text-red-300">{formatCurrencyAr(s.penalty_applied + s.advance_deducted)}</div></div>
            <div><div className="text-slate-400">Net</div><div className="text-emerald-200 font-bold">{formatCurrencyAr(s.net)}</div></div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {s.paid && <span className="inline-flex items-center gap-1 px-2 py-1 border border-emerald-500/50 text-emerald-300 text-[11px] font-mono"><BadgeCheck className="w-3.5 h-3.5" />Payé · {s.paid.method}</span>}
            <button type="button" onClick={() => setOpen(s)} className="px-2.5 py-1.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-xs text-slate-200 cursor-pointer">Fiche</button>
            {!isClosed && <button type="button" onClick={() => setAmountFor({ slip: s, type: 'bonus' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-emerald-500/40 text-xs text-emerald-300 cursor-pointer"><Plus className="w-3.5 h-3.5" />Prime</button>}
            {!isClosed && cfg.penalties && <button type="button" onClick={() => setAmountFor({ slip: s, type: 'penalty' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/40 text-xs text-red-300 cursor-pointer"><MinusCircle className="w-3.5 h-3.5" />Retenue</button>}
            {isClosed && !s.paid && s.net > 0 && <button type="button" onClick={() => setPayFor(s)} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer">Marquer payé</button>}
          </div>
        </div>
      ))}

      {data && data.audit?.length > 0 && (
        <details className="bg-[#0f1722] border border-slate-800 p-3 text-xs font-mono text-slate-300">
          <summary className="cursor-pointer text-slate-200 font-semibold">Journal de cette période ({data.audit.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {data.audit.map((a: any, i: number) => (
              <li key={i} className="break-words"><span className="text-slate-500">{new Date(a.at).toLocaleString('fr-FR')}</span> · <b>{AUDIT_LABEL[a.action] || a.action}</b> · {a.by_name} : {a.detail}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Fiche d'un booster */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/75 overflow-y-auto" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl bg-[#0d1624] border border-slate-600 p-4 space-y-3 text-slate-100 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 mr-auto">
                <h3 className="font-tactical font-bold text-base break-words">{open.name} · {pidLabel(open.pid)}</h3>
                <div className="text-[11px] font-mono text-slate-400">@{open.username}{open.phone ? ` · ${open.phone}` : ''}</div>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-x-auto border border-slate-700">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-[#141e2a] text-slate-300"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Poste</th><th className="p-2 text-right">Points</th><th className="p-2 text-right">Taux / 1M</th><th className="p-2 text-right">Montant</th></tr></thead>
                <tbody>
                  {open.lines.length === 0 && <tr><td colSpan={5} className="p-2 text-slate-400">Aucune session validée.</td></tr>}
                  {open.lines.map(l => (
                    <tr key={l.post_id} className="border-t border-slate-800"><td className="p-2">{fmtDay(l.date)}</td><td className="p-2">{l.post_number ? `Poste ${l.post_number} · ` : ''}{l.client}</td><td className="p-2 text-right">{fmtScore(l.score)}</td><td className="p-2 text-right">{l.rate.toLocaleString('fr-FR')}</td><td className="p-2 text-right">{formatCurrencyAr(l.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs font-mono space-y-1">
              <div className="flex justify-between"><span>Total gagné</span><b>{formatCurrencyAr(open.gross)}</b></div>
              {open.bonuses.map(b => (
                <div key={b.id} className="flex justify-between gap-2 text-emerald-300"><span className="break-words">Prime : {b.reason}</span>
                  <span className="shrink-0">+ {formatCurrencyAr(b.amount)}{!isClosed && <button type="button" className="ml-2 text-slate-400 underline cursor-pointer" onClick={() => askReason({ title: 'Supprimer cette prime ?', confirmLabel: 'Supprimer', onSubmit: reason => void act('payroll-bonus-delete', { id: b.id, reason }) })}>retirer</button>}</span></div>
              ))}
              {open.penalties.map(b => (
                <div key={b.id} className="flex justify-between gap-2 text-red-300"><span className="break-words">Retenue : {b.reason}</span>
                  <span className="shrink-0">− {formatCurrencyAr(b.amount)}{!isClosed && !String(b.id).startsWith('auto-') && <button type="button" className="ml-2 text-slate-400 underline cursor-pointer" onClick={() => askReason({ title: 'Supprimer cette retenue ?', confirmLabel: 'Supprimer', onSubmit: reason => void act('payroll-bonus-delete', { id: b.id, reason }) })}>retirer</button>}</span></div>
              ))}
              {open.advance_deducted > 0 && <div className="flex justify-between text-amber-300"><span>Avances remboursées</span><span>− {formatCurrencyAr(open.advance_deducted)}</span></div>}
              {open.advance_carry > 0 && <div className="flex justify-between text-slate-400"><span>Avance restant à rembourser (reportée)</span><span>{formatCurrencyAr(open.advance_carry)}</span></div>}
              <div className="flex justify-between text-sm pt-1 border-t border-slate-700"><span>Net à payer</span><b className="text-emerald-200">{formatCurrencyAr(open.net)}</b></div>
              {open.paid && <div className="text-emerald-300">Payé le {fmtDay(open.paid.at)} par {open.paid.method}{open.paid.ref ? ` (réf. ${open.paid.ref})` : ''}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => printSlip(open)} className="inline-flex items-center gap-2 px-3 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-xs text-slate-200 cursor-pointer"><Printer className="w-4 h-4" />Imprimer</button>
              {isClosed && open.paid && (
                <button type="button" className="px-3 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/50 text-xs text-red-300 cursor-pointer" onClick={() => askReason({ title: 'Annuler le paiement ?', confirmLabel: 'Annuler le paiement', onSubmit: reason => void act('payroll-pay', { user_id: open.user_id, undo: true, reason }) })}>Annuler le paiement</button>
              )}
            </div>
            <p className="text-[10px] text-slate-500">Ce document n'est pas un bulletin de paie légal : les cotisations sociales ne sont pas calculées.</p>
          </div>
        </div>
      )}

      {/* Prime ou retenue */}
      {amountFor && <AmountModal key={amountFor.slip.user_id + amountFor.type} slip={amountFor.slip} type={amountFor.type} onClose={() => setAmountFor(null)} onSubmit={async (amount, reason) => { const ok = await act('payroll-bonus', { user_id: amountFor.slip.user_id, type: amountFor.type, amount, reason }); if (ok) setAmountFor(null); }} />}
      {/* Marquer payé */}
      {payFor && <PayModal slip={payFor} methods={cfg.methods} onClose={() => setPayFor(null)} onSubmit={async (date, method, ref) => { const ok = await act('payroll-pay', { user_id: payFor.user_id, date, method, ref }); if (ok) setPayFor(null); }} />}
    </div>
  );
};

const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 bg-black/75 overflow-y-auto" onClick={onClose} role="dialog" aria-modal="true">
    <div className="w-full max-w-sm bg-[#0d1624] border border-slate-600 p-4 space-y-3 text-slate-100 my-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-start gap-2"><h3 className="font-tactical font-bold text-base mr-auto">{title}</h3><button type="button" onClick={onClose} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button></div>
      {children}
    </div>
  </div>
);

const AmountModal: React.FC<{ slip: Slip; type: 'bonus' | 'penalty'; onClose: () => void; onSubmit: (amount: number, reason: string) => void }> = ({ slip, type, onClose, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const n = Math.round(Number(amount));
  const ok = Number.isFinite(n) && n >= 1 && reason.trim().length >= 3;
  return (
    <Shell title={`${type === 'bonus' ? 'Prime' : 'Retenue'} pour ${slip.name}`} onClose={onClose}>
      <form className="space-y-3 text-xs font-mono" onSubmit={e => { e.preventDefault(); if (ok) onSubmit(n, reason.trim()); }}>
        <div><label className="block text-slate-300 uppercase mb-1">Montant (Ar)</label><input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} className={inp} autoFocus /></div>
        <div><label className="block text-slate-300 uppercase mb-1">Motif (obligatoire)</label><textarea rows={2} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} className={inp} /></div>
        {type === 'penalty' && <p className="text-[11px] text-amber-300">Vérifie avec un comptable ou l'Inspection du travail que cette retenue est permise.</p>}
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onClose} className="px-3 py-2.5 bg-[#141e2a] border border-slate-600 text-sm cursor-pointer">Annuler</button><button type="submit" disabled={!ok} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-bold text-white cursor-pointer">Ajouter</button></div>
      </form>
    </Shell>
  );
};

const PayModal: React.FC<{ slip: Slip; methods: string[]; onClose: () => void; onSubmit: (date: string, method: string, ref: string) => void }> = ({ slip, methods, onClose, onSubmit }) => {
  const [date, setDate] = useState(dayMada());
  const [method, setMethod] = useState(methods[0] || '');
  const [ref, setRef] = useState('');
  return (
    <Shell title={`Payer ${slip.name}`} onClose={onClose}>
      <form className="space-y-3 text-xs font-mono" onSubmit={e => { e.preventDefault(); if (method) onSubmit(date, method, ref.trim()); }}>
        <div className="text-sm">Net à payer : <b className="text-emerald-300">{formatCurrencyAr(slip.net)}</b></div>
        <div><label className="block text-slate-300 uppercase mb-1">Date</label><input type="date" max={dayMada()} value={date} onChange={e => setDate(e.target.value)} className={inp} /></div>
        <div><label className="block text-slate-300 uppercase mb-1">Mode de paiement</label><select value={method} onChange={e => setMethod(e.target.value)} className={inp}>{methods.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label className="block text-slate-300 uppercase mb-1">Référence (facultatif)</label><input type="text" maxLength={60} value={ref} onChange={e => setRef(e.target.value)} className={inp} placeholder="n° de transaction" /></div>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onClose} className="px-3 py-2.5 bg-[#141e2a] border border-slate-600 text-sm cursor-pointer">Annuler</button><button type="submit" className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer">Marquer payé</button></div>
      </form>
    </Shell>
  );
};
