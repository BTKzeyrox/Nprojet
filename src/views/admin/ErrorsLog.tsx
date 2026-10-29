import React, { useEffect, useMemo, useState } from 'react';
import { Bug, RefreshCw, Copy, CheckCircle2, RotateCcw, Trash2, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { db } from '../../db/store';
import { askConfirm } from '../../components/ConfirmModal';
import { copyText } from '../../utils/errorReport';
import { useApp } from '../../context/AppContext';

interface Row {
  id: string;
  kind: 'crash' | 'error' | 'server' | 'report';
  message: string;
  stack: string;
  page: string;
  role: string;
  device: string;
  version: string;
  detail: string | null;
  screenshot_url: string | null;
  users: string[];
  count: number;
  first_seen: string;
  last_seen: string;
  status: 'open' | 'resolved';
}

const KIND_LABEL: Record<Row['kind'], string> = { crash: 'Plantage', error: 'Erreur', server: 'Serveur', report: 'Signalement' };
const KIND_CLS = (L: boolean): Record<Row['kind'], string> => ({
  crash: L ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-500/15 text-red-300 border-red-500/30',
  error: L ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  server: L ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  report: L ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/15 text-blue-300 border-blue-500/30',
});
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Journal des erreurs : plantages, erreurs serveur et signalements des opérateurs, regroupés
export const ErrorsLog: React.FC = () => {
  const L = useApp().theme === 'light';
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [kind, setKind] = useState<'all' | Row['kind']>('all');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  const load = async () => {
    setLoading(true);
    setRows((await db.fetchErrors(status)) as Row[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [status]);

  const names = (ids: string[]) => {
    const users = db.getUsers();
    return ids.map(id => users.find(u => u.id === id)?.name || id).join(', ');
  };
  const shown = useMemo(() => rows.filter(r => kind === 'all' || r.kind === kind), [rows, kind]);

  // Texte à me donner (Claude) pour corriger : tout le contexte au même endroit
  const forClaude = (r: Row) =>
    [
      `[Journal Gestion Pro] ${KIND_LABEL[r.kind]} — ${r.message}`,
      `Vu ${r.count} fois · première : ${when(r.first_seen)} · dernière : ${when(r.last_seen)} (heure de Madagascar)`,
      `Page : ${r.page || '—'} · Rôle : ${r.role || '—'} · Version du site : ${r.version || '—'}`,
      `Appareil : ${r.device || '—'}`,
      r.users?.length ? `Comptes touchés : ${names(r.users)}` : '',
      r.detail ? `Description de l’opérateur : ${r.detail}` : '',
      r.screenshot_url ? `Capture : ${r.screenshot_url}` : '',
      r.stack ? `\nPile :\n${r.stack}` : '',
      '\nDemande : trouve la cause et propose un correctif (recap court puis j\'attends mon « GO » avant de coder).',
    ].filter(Boolean).join('\n');

  const copy = async (id: string, text: string) => {
    if (await copyText(text)) {
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    }
  };
  const setRowStatus = async (r: Row, next: 'open' | 'resolved') => {
    if (await db.updateError(r.id, { status: next })) void load();
  };
  const remove = (r: Row) =>
    askConfirm({
      title: 'Supprimer ce rapport ?',
      message: 'Il disparaît du journal. Si l\'erreur revient, elle sera enregistrée de nouveau.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => { void db.updateError(r.id, { remove: true }).then(load); },
    });

  const card = `rounded-3xl border p-4 space-y-2.5 ${L ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f1b2d] border-slate-700/60'}`;
  const txt = L ? 'text-slate-900' : 'text-white';
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  const pill = (on: boolean) => `px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${on ? 'bg-blue-600 border-blue-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-transparent border-slate-600 text-slate-300 hover:bg-white/10'}`;
  const btn = 'px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors';
  const kindCls = KIND_CLS(L);

  return (
    <div className="max-w-4xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <div className={`${card} flex items-center gap-3 flex-wrap`}>
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${L ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/15 text-blue-400'}`}><Bug className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className={`font-bold text-lg leading-tight ${txt}`}>Journal des erreurs</h2>
          <p className={`text-xs ${sub}`}>Plantages, erreurs du serveur et signalements. Les erreurs identiques sont regroupées.</p>
        </div>
        <button type="button" onClick={() => void load()} className={`${btn} ${L ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'resolved', 'all'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={pill(status === s)}>
            {s === 'open' ? 'Ouvertes' : s === 'resolved' ? 'Résolues' : 'Toutes'}
          </button>
        ))}
        <span className={`w-px h-5 mx-1 ${L ? 'bg-slate-300' : 'bg-slate-600'}`} />
        {(['all', 'crash', 'error', 'server', 'report'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} className={pill(kind === k)}>
            {k === 'all' ? 'Tous types' : KIND_LABEL[k]}
          </button>
        ))}
        {shown.length > 0 && (
          <button type="button" onClick={() => copy('ALL', shown.map(forClaude).join('\n\n----------\n\n'))} className={`${btn} ml-auto bg-blue-600 hover:bg-blue-500 text-white`}>
            <Copy className="w-3.5 h-3.5" /> {copied === 'ALL' ? 'Copié ✓' : `Tout copier pour Claude (${shown.length})`}
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className={`text-center text-sm py-10 ${sub}`}>Chargement…</div>
      ) : shown.length === 0 ? (
        <div className={`${card} text-center py-10`}>
          <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
          <div className={`text-sm font-semibold ${txt}`}>Aucune erreur dans cette liste</div>
        </div>
      ) : (
        shown.map(r => (
          <div key={r.id} className={`${card} ${r.status === 'resolved' ? 'opacity-70' : ''}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${kindCls[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
              {r.count > 1 && <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${L ? 'border-slate-300 text-slate-700' : 'border-slate-600 text-slate-200'}`}>× {r.count}</span>}
              {r.status === 'resolved' && <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-emerald-500/40 text-emerald-600 bg-emerald-500/10">Résolue</span>}
              <span className={`text-[11px] ml-auto ${sub}`}>{when(r.last_seen)}</span>
            </div>
            <div className={`text-sm font-semibold break-words flex gap-1.5 ${txt}`}>
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{r.message}</span>
            </div>
            {r.detail && <div className={`text-sm rounded-2xl p-3 break-words whitespace-pre-line ${L ? 'bg-blue-50 text-blue-900' : 'bg-blue-500/10 text-blue-100'}`}>{r.detail}</div>}
            <div className={`text-[11px] space-y-0.5 break-words ${sub}`}>
              <div>Page : {r.page || '—'} · Rôle : {r.role || '—'} · Version : {r.version || '—'}</div>
              <div>Appareil : {r.device || '—'}</div>
              <div>Première fois : {when(r.first_seen)}</div>
              {r.users?.length > 0 && <div>Comptes touchés : {names(r.users)}</div>}
            </div>
            {r.screenshot_url && (
              <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline">
                <ImageIcon className="w-3.5 h-3.5" /> Voir la photo
              </a>
            )}
            {r.stack && (
              <details className={`text-[11px] ${sub}`}>
                <summary className="cursor-pointer font-semibold">Détail technique</summary>
                <pre className={`mt-1.5 whitespace-pre-wrap break-words rounded-2xl p-3 font-mono ${L ? 'bg-slate-50 border border-slate-200 text-slate-700' : 'bg-black/30 text-slate-300'}`}>{r.stack}</pre>
              </details>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => copy(r.id, forClaude(r))} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>
                <Copy className="w-3.5 h-3.5" /> {copied === r.id ? 'Copié ✓' : 'Copier pour Claude'}
              </button>
              {r.status === 'open' ? (
                <button type="button" onClick={() => setRowStatus(r, 'resolved')} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marquer résolue
                </button>
              ) : (
                <button type="button" onClick={() => setRowStatus(r, 'open')} className={`${btn} ${L ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                  <RotateCcw className="w-3.5 h-3.5" /> Rouvrir
                </button>
              )}
              <button type="button" onClick={() => remove(r)} className={`${btn} ml-auto border ${L ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}>
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
