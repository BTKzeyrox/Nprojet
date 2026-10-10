import React, { useEffect, useState } from 'react';
import { ArrowLeft, IdCard, Calendar, MessageSquare, DollarSign, ShieldAlert, Gamepad2 } from 'lucide-react';
import { db } from '../../db/store';
import { User } from '../../types';
import { Avatar } from '../../components/Avatar';
import { formatCurrencyAr, formatScoreM } from '../../utils/formatUtils';
import { getPresenceStatus, STATUS_LABEL, formatDuration } from '../../utils/presence';

interface Props {
  userId: string;
  onBack: () => void;
  onGo: (view: string) => void; // ouvre une page en gardant ce booster en vue
  onOpenCV: (u: User) => void;
}

const STATUS: Record<string, string> = {
  idle: 'Libre', pending_start: 'Début à valider', active: 'En cours', pending_end: 'Fin à valider',
  completed: 'Terminé', rejected: 'Refusé', force_released: 'Débloqué',
};
const ADV: Record<string, string> = { pending: 'En attente', approved: 'Acceptée', rejected: 'Refusée' };

const card = 'bg-[#0f1722] border border-slate-700 p-3 sm:p-4 space-y-2';
const h = 'font-tactical font-bold text-white text-sm';

export const BoosterPage: React.FC<Props> = ({ userId, onBack, onGo, onOpenCV }) => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const u = db.getUsers().find(x => x.id === userId);
  if (!u) {
    return (
      <div className="max-w-3xl mx-auto p-3 space-y-3">
        <button onClick={onBack} className="text-sm text-emerald-400 flex items-center gap-1.5 cursor-pointer"><ArrowLeft className="w-4 h-4" />Retour</button>
        <div className="text-slate-300 text-sm">Booster introuvable.</div>
      </div>
    );
  }

  const posts = db.getPosts().filter(p => p.employee_id === u.id).sort((a, b) => (b.updated_at || b.date).localeCompare(a.updated_at || a.date));
  const current = posts.filter(p => p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end');
  const advances = db.getAdvanceRequests().filter(a => a.employee_id === u.id).sort((a, b) => b.request_date.localeCompare(a.request_date));
  const alerts = db.getSecurityLogs().filter(l => l.employee_id === u.id && !l.resolved);
  const pendingAdv = advances.filter(a => a.status === 'pending');
  const doneCount = posts.filter(p => p.status === 'completed').length;
  const ps = getPresenceStatus(u, db.getPosts(), db.getPresence());

  const link = 'flex items-center gap-2.5 p-3 bg-[#141e2a] border border-slate-700 hover:border-emerald-500 text-left text-sm text-slate-100 cursor-pointer';

  return (
    <div className="max-w-3xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <button onClick={onBack} className="text-sm text-emerald-400 flex items-center gap-1.5 cursor-pointer"><ArrowLeft className="w-4 h-4" />Retour</button>

      <div className={`${card} flex items-center gap-3`}>
        <Avatar src={u.avatar_url} name={u.name} className="w-14 h-14 rounded-full" />
        <div className="min-w-0 flex-1">
          <h2 className="font-tactical font-black text-lg text-white truncate">{u.name}</h2>
          <div className="text-xs font-mono text-slate-400 break-words">
            @{u.username} · {u.phone || 'pas de téléphone'} · {u.shift === 'night' ? 'Nuit' : 'Jour'}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-mono">
            <span className={`px-1.5 py-0.5 border ${u.status === 'blocked' ? 'border-red-500/60 text-red-300' : 'border-emerald-500/50 text-emerald-300'}`}>{u.status === 'blocked' ? 'Bloqué' : 'Actif'}</span>
            <span className={`px-1.5 py-0.5 border ${ps.status === 'offline' ? 'border-slate-600 text-slate-400' : ps.status === 'waiting' ? 'border-amber-500/60 text-amber-300' : 'border-cyan-500/50 text-cyan-300'}`}>{STATUS_LABEL[ps.status]}</span>
            {ps.onlineSec > 0 && <span className="px-1.5 py-0.5 border border-slate-600 text-slate-300">Connecté aujourd'hui : {formatDuration(ps.onlineSec)}</span>}
            <span className="px-1.5 py-0.5 border border-slate-600 text-slate-300">{u.performance_badge}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        {[
          ['Gains', formatCurrencyAr(u.total_earnings_ar)],
          ['Score boosté', formatScoreM(u.total_score_boosted)],
          ['Sessions finies', String(doneCount)],
          ['Avance en cours', formatCurrencyAr(u.pending_advance_ar || 0)],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#0f1722] border border-slate-700 p-2.5">
            <div className="text-slate-400">{k}</div>
            <div className="text-white font-bold text-sm mt-0.5 break-words">{v}</div>
          </div>
        ))}
      </div>

      <div className={card}>
        <h3 className={h}>Liens</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button className={link} onClick={() => onOpenCV(u)}><IdCard className="w-4 h-4 text-emerald-400 shrink-0" />Profil complet</button>
          <button className={link} onClick={() => onGo('calendar')}><Calendar className="w-4 h-4 text-emerald-400 shrink-0" />Son calendrier</button>
          <button className={link} onClick={() => onGo('chat')}><MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />Messagerie privée</button>
          <button className={link} onClick={() => onGo('history')}><DollarSign className="w-4 h-4 text-amber-400 shrink-0" />Son historique (avances, demandes){pendingAdv.length > 0 ? ` (${pendingAdv.length} en attente)` : ''}</button>
          <button className={link} onClick={() => onGo(current.some(p => p.status !== 'active') ? 'validations' : 'dashboard')}><Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />Postes{current.length > 0 ? ` (${current.length} en cours)` : ''}</button>
          <button className={link} onClick={() => onGo('security')}><ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />Sécurité{alerts.length > 0 ? ` (${alerts.length} alerte${alerts.length > 1 ? 's' : ''})` : ''}</button>
        </div>
      </div>

      <div className={card}>
        <h3 className={h}>Poste en cours</h3>
        {current.length === 0 ? <div className="text-xs text-slate-400">Aucun poste en cours.</div> : current.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs font-mono border-t border-slate-800 pt-2">
            <span className="text-white break-words min-w-0">{p.client_name}</span>
            <span className="text-slate-300 shrink-0">{formatScoreM(p.initial_score)} → {formatScoreM(p.current_score)} / {formatScoreM(p.target_score)}</span>
            <span className="text-amber-300 shrink-0">{STATUS[p.status] || p.status}</span>
          </div>
        ))}
      </div>

      <div className={card}>
        <h3 className={h}>Avances</h3>
        {advances.length === 0 ? <div className="text-xs text-slate-400">Aucune avance.</div> : advances.slice(0, 5).map(a => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-xs font-mono border-t border-slate-800 pt-2">
            <span className="text-slate-300 shrink-0">{a.request_date}</span>
            <span className="text-white">{formatCurrencyAr(a.amount_ar)}</span>
            <span className={a.status === 'approved' ? 'text-emerald-300' : a.status === 'rejected' ? 'text-red-300' : 'text-amber-300'}>{ADV[a.status]}</span>
          </div>
        ))}
      </div>

      <div className={card}>
        <h3 className={h}>Dernières sessions</h3>
        {posts.length === 0 ? <div className="text-xs text-slate-400">Aucune session.</div> : posts.slice(0, 8).map(p => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs font-mono border-t border-slate-800 pt-2">
            <span className="text-slate-300 shrink-0">{p.date}</span>
            <span className="text-white break-words min-w-0 flex-1">{p.client_name}</span>
            <span className="text-slate-300 shrink-0">{STATUS[p.status] || p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
