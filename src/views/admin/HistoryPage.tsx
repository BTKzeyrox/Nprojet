import React, { useEffect, useMemo, useState } from 'react';
import { Search, DollarSign, Gamepad2, IdCard, UserPlus, KeyRound } from 'lucide-react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';

type Kind = 'advance' | 'session' | 'profile' | 'signup' | 'reset';
type St = 'pending' | 'accepted' | 'refused';
interface Row { id: string; kind: Kind; who: string; whoId?: string; title: string; detail: string; motif: string; status: St; date: string; blob: string }

const KIND: Record<Kind, string> = { advance: 'Avance', session: 'Session', profile: 'Profil', signup: 'Inscription', reset: 'Mot de passe' };
const ST_LABEL: Record<St, string> = { pending: 'En attente', accepted: 'Accepté', refused: 'Refusé' };
const ST_CLS: Record<St, string> = { pending: 'border-amber-500/60 text-amber-300', accepted: 'border-emerald-500/50 text-emerald-300', refused: 'border-red-500/60 text-red-300' };
const ICON: Record<Kind, React.ComponentType<{ className?: string }>> = { advance: DollarSign, session: Gamepad2, profile: IdCard, signup: UserPlus, reset: KeyRound };

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmtDate = (d: string) => { const t = new Date(d); return isNaN(t.getTime()) ? d : t.toLocaleDateString('fr-FR'); };

export const buildHistory = (): Row[] => {
  const rows: Row[] = [];
  db.getAdvanceRequests().forEach(a =>
    rows.push({ id: `adv-${a.id}`, kind: 'advance', who: a.employee_name, whoId: a.employee_id, title: `Avance ${formatCurrencyAr(a.amount_ar)}`, detail: a.reason, motif: a.status === 'rejected' ? a.admin_notes || '' : '', status: a.status === 'approved' ? 'accepted' : a.status === 'rejected' ? 'refused' : 'pending', date: a.request_date, blob: `${a.amount_ar} ${a.reason} ${a.admin_notes || ''}` }));
  db.getPosts().forEach(p => {
    const st: St | null = p.status === 'pending_start' || p.status === 'pending_end' ? 'pending' : p.status === 'completed' ? 'accepted' : p.status === 'rejected' ? 'refused' : null;
    if (!st) return;
    const label = p.status === 'pending_start' ? 'Début' : p.status === 'pending_end' ? 'Fin' : p.status === 'completed' ? 'Session terminée' : 'Session refusée';
    rows.push({ id: `post-${p.id}`, kind: 'session', who: p.employee_name, whoId: p.employee_id, title: `${label} · ${p.client_name}`, detail: `Poste ${p.post_number ?? ''}${p.admin_notes ? ` · ${p.admin_notes}` : ''}`.trim(), motif: st === 'refused' ? p.rejection_reason || '' : '', status: st, date: p.updated_at || p.date, blob: `${p.client_name} ${p.rejection_reason || ''} ${p.admin_notes || ''}` });
  });
  db.getProfileRequests().forEach(r => {
    const u = db.getUsers().find(x => x.id === r.user_id);
    rows.push({ id: `prf-${r.id}`, kind: 'profile', who: r.old?.name || u?.name || '', whoId: r.user_id, title: 'Changement de profil', detail: `${r.old?.name || ''} → ${r.name}`, motif: r.status === 'rejected' ? r.reason || '' : '', status: r.status === 'rejected' ? 'refused' : 'pending', date: r.created_at, blob: `${r.name} ${r.username} ${r.reason || ''}` });
  });
  db.getSignupRequests().forEach(r =>
    rows.push({ id: `sig-${r.id}`, kind: 'signup', who: r.name, title: 'Demande d’inscription', detail: `@${r.username} · ${r.phone}`, motif: '', status: 'pending', date: r.created_at, blob: `${r.username} ${r.phone}` }));
  db.getPasswordResets().forEach(r =>
    rows.push({ id: `rst-${r.id}`, kind: 'reset', who: r.name, whoId: r.user_id, title: 'Mot de passe oublié', detail: `@${r.username}`, motif: '', status: 'pending', date: r.created_at, blob: r.username }));
  return rows.sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
};

const sel = 'h-9 px-2 bg-[#141e2a] border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500';

export const HistoryPage: React.FC<{ initialBoosterId?: string }> = ({ initialBoosterId }) => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [status, setStatus] = useState<'all' | St>('all');
  const [booster, setBooster] = useState<string>(initialBoosterId || 'all');
  const [period, setPeriod] = useState<'all' | '7' | '30'>('all');
  const [limit, setLimit] = useState(50);

  const all = buildHistory();
  const boosters = db.getUsers().filter(u => u.role === 'employee');

  const rows = useMemo(() => {
    const s = norm(q.trim());
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
    return all.filter(r =>
      (kind === 'all' || r.kind === kind) &&
      (status === 'all' || r.status === status) &&
      (booster === 'all' || r.whoId === booster) &&
      (!since || (new Date(r.date).getTime() || 0) >= since) &&
      (!s || norm(`${r.who} ${r.title} ${r.detail} ${r.motif} ${r.blob} ${KIND[r.kind]}`).includes(s))
    );
  }, [all.length, q, kind, status, booster, period, db.getAdvanceRequests().map(a => a.status).join(), db.getPosts().map(p => p.status).join()]);

  const reset = () => { setQ(''); setKind('all'); setStatus('all'); setBooster('all'); setPeriod('all'); setLimit(50); };
  const filtered = q || kind !== 'all' || status !== 'all' || booster !== 'all' || period !== 'all';

  return (
    <div className="max-w-4xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <div className="bg-[#0f1722] border border-slate-700 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-tactical font-black text-white text-base sm:text-lg">Historique</h2>
          <span className="text-xs font-mono text-slate-400">{rows.length} résultat{rows.length > 1 ? 's' : ''}</span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(50); }} placeholder="Rechercher : nom, client, montant, motif…" className="w-full h-9 pl-9 pr-3 bg-[#141e2a] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500" />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-mono">
          {([['all', 'Tout'], ['advance', 'Avances'], ['session', 'Sessions'], ['profile', 'Profils'], ['signup', 'Inscriptions'], ['reset', 'Mots de passe']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setKind(k); setLimit(50); }} className={`px-3 py-1.5 border cursor-pointer ${kind === k ? 'bg-emerald-600 border-emerald-500 text-white font-bold' : 'bg-[#141e2a] border-slate-700 text-slate-300 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select aria-label="Statut" className={sel} value={status} onChange={e => { setStatus(e.target.value as any); setLimit(50); }}>
            <option value="all">Tous les statuts</option><option value="pending">En attente</option><option value="accepted">Accepté</option><option value="refused">Refusé</option>
          </select>
          <select aria-label="Booster" className={sel} value={booster} onChange={e => { setBooster(e.target.value); setLimit(50); }}>
            <option value="all">Tous les boosters</option>
            {boosters.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select aria-label="Période" className={sel} value={period} onChange={e => { setPeriod(e.target.value as any); setLimit(50); }}>
            <option value="all">Toute la période</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option>
          </select>
          <button type="button" disabled={!filtered} onClick={reset} className={`${sel} ${filtered ? 'cursor-pointer hover:border-emerald-500' : 'opacity-40'}`}>Effacer les filtres</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-400 font-mono p-4">Aucun résultat.</div>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, limit).map(r => {
            const I = ICON[r.kind];
            return (
              <div key={r.id} className="bg-[#0f1722] border border-slate-700 p-3 flex items-start gap-3">
                <I className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 text-xs font-mono space-y-0.5">
                  <div className="text-white font-bold text-sm break-words">{r.who ? `${r.who} · ` : ''}{r.title}</div>
                  {r.detail && <div className="text-slate-300 break-words">{r.detail}</div>}
                  {r.motif && <div className="text-red-300 break-words">Motif : {r.motif}</div>}
                  <div className="text-slate-500">{KIND[r.kind]} · {fmtDate(r.date)}</div>
                </div>
                <span className={`px-1.5 py-0.5 border text-[10px] font-mono shrink-0 ${ST_CLS[r.status]}`}>{ST_LABEL[r.status]}</span>
              </div>
            );
          })}
          {rows.length > limit && (
            <button type="button" onClick={() => setLimit(l => l + 50)} className="w-full py-2 border border-slate-700 text-xs font-mono text-slate-300 hover:border-emerald-500 cursor-pointer">Afficher plus ({rows.length - limit})</button>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500 font-mono px-1">Les inscriptions et mots de passe déjà traités ne gardent pas de trace : seules celles en attente apparaissent.</p>
    </div>
  );
};
