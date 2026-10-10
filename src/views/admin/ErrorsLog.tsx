import React, { useEffect, useMemo, useState } from 'react';
import { Bug, RefreshCw, Copy, CheckCircle2, RotateCcw, Trash2, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { db } from '../../db/store';
import { askConfirm } from '../../components/ConfirmModal';
import { copyText } from '../../utils/errorReport';

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
const KIND_CLS: Record<Row['kind'], string> = {
  crash: 'bg-red-950 text-red-300 border-red-700',
  error: 'bg-amber-950 text-amber-300 border-amber-700',
  server: 'bg-purple-950 text-purple-300 border-purple-700',
  report: 'bg-cyan-950 text-cyan-300 border-cyan-700',
};
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Journal des erreurs : plantages, erreurs serveur et signalements des boosters, regroupés
export const ErrorsLog: React.FC = () => {
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
      `[Journal DF-boosting] ${KIND_LABEL[r.kind]} — ${r.message}`,
      `Vu ${r.count} fois · première : ${when(r.first_seen)} · dernière : ${when(r.last_seen)} (heure de Madagascar)`,
      `Page : ${r.page || '—'} · Rôle : ${r.role || '—'} · Version du site : ${r.version || '—'}`,
      `Appareil : ${r.device || '—'}`,
      r.users?.length ? `Comptes touchés : ${names(r.users)}` : '',
      r.detail ? `Description du booster : ${r.detail}` : '',
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

  return (
    <div className="max-w-4xl mx-auto px-1.5 sm:px-3 py-3 space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Bug className="w-6 h-6 text-emerald-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-tactical font-bold text-xl text-white">Journal des erreurs</h2>
          <p className="text-xs text-slate-400">Plantages, erreurs du serveur et signalements des boosters. Les erreurs identiques sont regroupées.</p>
        </div>
        <button type="button" onClick={() => void load()} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {(['open', 'resolved', 'all'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`px-3 py-1.5 border cursor-pointer ${status === s ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-[#0f1722] border-slate-700 text-slate-300'}`}>
            {s === 'open' ? 'Ouvertes' : s === 'resolved' ? 'Résolues' : 'Toutes'}
          </button>
        ))}
        <span className="w-px bg-slate-700 mx-1" />
        {(['all', 'crash', 'error', 'server', 'report'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 border cursor-pointer ${kind === k ? 'bg-slate-600 border-slate-400 text-white' : 'bg-[#0f1722] border-slate-700 text-slate-300'}`}>
            {k === 'all' ? 'Tous types' : KIND_LABEL[k]}
          </button>
        ))}
        {shown.length > 0 && (
          <button type="button" onClick={() => copy('ALL', shown.map(forClaude).join('\n\n----------\n\n'))} className="ml-auto px-3 py-1.5 bg-cyan-800 hover:bg-cyan-700 text-white font-bold flex items-center gap-1.5 cursor-pointer">
            <Copy className="w-3.5 h-3.5" /> {copied === 'ALL' ? 'Copié ✓' : `Tout copier pour Claude (${shown.length})`}
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-10 font-mono">Chargement…</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-700">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-200">Aucune erreur dans cette liste</div>
        </div>
      ) : (
        shown.map(r => (
          <div key={r.id} className={`bg-[#0f1722] border p-3 space-y-2 ${r.status === 'resolved' ? 'border-slate-800 opacity-70' : 'border-slate-700'}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${KIND_CLS[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
              {r.count > 1 && <span className="px-1.5 py-0.5 text-[10px] font-bold border border-slate-600 text-slate-200">× {r.count}</span>}
              {r.status === 'resolved' && <span className="px-1.5 py-0.5 text-[10px] font-bold border border-emerald-700 text-emerald-300">Résolue</span>}
              <span className="text-[11px] text-slate-500 ml-auto font-mono">{when(r.last_seen)}</span>
            </div>
            <div className="text-sm text-white font-semibold break-words flex gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{r.message}</span>
            </div>
            {r.detail && <div className="text-sm text-cyan-200 bg-cyan-950/30 border border-cyan-900/60 p-2 break-words whitespace-pre-line">{r.detail}</div>}
            <div className="text-[11px] text-slate-400 font-mono space-y-0.5 break-words">
              <div>Page : {r.page || '—'} · Rôle : {r.role || '—'} · Version : {r.version || '—'}</div>
              <div>Appareil : {r.device || '—'}</div>
              <div>Première fois : {when(r.first_seen)}</div>
              {r.users?.length > 0 && <div>Comptes touchés : {names(r.users)}</div>}
            </div>
            {r.screenshot_url && (
              <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-cyan-300 underline">
                <ImageIcon className="w-3.5 h-3.5" /> Voir la capture
              </a>
            )}
            {r.stack && (
              <details className="text-[11px] text-slate-400 font-mono">
                <summary className="cursor-pointer text-slate-300">Détail technique</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words bg-[#0a0f16] border border-slate-800 p-2">{r.stack}</pre>
              </details>
            )}
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <button type="button" onClick={() => copy(r.id, forClaude(r))} className="px-2.5 py-1.5 bg-cyan-800 hover:bg-cyan-700 text-white font-bold flex items-center gap-1.5 cursor-pointer">
                <Copy className="w-3.5 h-3.5" /> {copied === r.id ? 'Copié ✓' : 'Copier pour Claude'}
              </button>
              {r.status === 'open' ? (
                <button type="button" onClick={() => setRowStatus(r, 'resolved')} className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center gap-1.5 cursor-pointer">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marquer résolue
                </button>
              ) : (
                <button type="button" onClick={() => setRowStatus(r, 'open')} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center gap-1.5 cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" /> Rouvrir
                </button>
              )}
              <button type="button" onClick={() => remove(r)} className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-200 font-bold flex items-center gap-1.5 cursor-pointer ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
