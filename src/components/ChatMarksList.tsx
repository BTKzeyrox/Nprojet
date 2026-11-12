// Fenêtre « Importants et épinglés » du chat : deux onglets (Importants, Épinglés), « Cette discussion » ou « Toutes », toucher un message y mène directement. Règles : utils/chatMarksList.ts.
// Utilisé par : ChatView.tsx (bouton drapeau de l'en-tête de discussion et de la liste des discussions). Contrôlé par `npm run check:chat-marks-list`.
// Pour modifier : lecture seule (on ne marque ni ne retire ici : menu du message) ; au plus 200 lignes ; Échap ou toucher à côté ferme.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Pin, X } from 'lucide-react';
import type { ChatMessage } from '../types';
import { MARK_STYLE, markBackground, marksOf } from '../utils/chatMarks';
import { markedMessages, previewOf, type MarkTab } from '../utils/chatMarksList';

const MAX_ROWS = 200;
const dayText = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };

export const ChatMarksList: React.FC<{
  msgs: ChatMessage[]; important: readonly string[]; hidden: ReadonlySet<string>; light: boolean;
  startScope: 'this' | 'all';
  inThisThread: (m: ChatMessage) => boolean; threadOf: (m: ChatMessage) => { id: string; title: string } | null;
  onPick: (messageId: string, threadId: string) => void; onClose: () => void;
}> = ({ msgs, important, hidden, light, startScope, inThisThread, threadOf, onPick, onClose }) => {
  const [scope, setScope] = useState<'this' | 'all'>(startScope);
  const [tab, setTab] = useState<MarkTab>('important');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const inScope = useMemo(() => (scope === 'this' ? inThisThread : (m: ChatMessage) => !!threadOf(m)), [scope, inThisThread, threadOf]);
  const lists = useMemo(() => ({
    important: markedMessages(msgs, important, 'important', { hidden, inScope }),
    pinned: markedMessages(msgs, important, 'pinned', { hidden, inScope }),
  }), [msgs, important, hidden, inScope]);
  const rows = lists[tab].slice(0, MAX_ROWS);
  const card = light ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-900 text-slate-100 border-slate-700';
  const sub = light ? 'text-slate-500' : 'text-slate-400';
  const rowCls = light ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-slate-800 border-slate-800';
  const seg = (on: boolean) => `flex-1 min-h-[44px] px-3 text-sm font-semibold cursor-pointer transition-colors ${on ? 'bg-emerald-600 text-white' : light ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`;
  return createPortal(
    <div data-chat-marks className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${card}`} onClick={e => e.stopPropagation()} role="dialog" aria-label="Importants et épinglés">
        <div className="p-3 flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0 text-base font-bold truncate">Importants et épinglés</div>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="w-5 h-5" /></button>
        </div>
        <div className="px-3 pb-2 shrink-0">
          <div className="flex rounded-xl overflow-hidden border border-transparent" role="group" aria-label="Où chercher">
            <button type="button" data-marks-scope="this" aria-pressed={scope === 'this'} onClick={() => setScope('this')} className={seg(scope === 'this')}><span className="block truncate">Cette discussion</span></button>
            <button type="button" data-marks-scope="all" aria-pressed={scope === 'all'} onClick={() => setScope('all')} className={seg(scope === 'all')}>Toutes</button>
          </div>
        </div>
        <div className="px-3 pb-2 shrink-0">
          <div className="flex rounded-xl overflow-hidden" role="tablist">
            <button type="button" role="tab" data-marks-tab="important" aria-selected={tab === 'important'} onClick={() => setTab('important')} className={seg(tab === 'important')}><Flag className="w-4 h-4 inline -mt-0.5 mr-1" />Importants ({lists.important.length})</button>
            <button type="button" role="tab" data-marks-tab="pinned" aria-selected={tab === 'pinned'} onClick={() => setTab('pinned')} className={seg(tab === 'pinned')}><Pin className="w-4 h-4 inline -mt-0.5 mr-1" />Épinglés ({lists.pinned.length})</button>
          </div>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto border-t ${light ? 'border-slate-100' : 'border-slate-800'}`}>
          {rows.length === 0 ? (
            <p data-marks-empty className={`p-4 text-sm text-center ${sub}`}>{tab === 'important'
              ? 'Aucun message important. Maintiens ton doigt sur un message, puis touche « Important » : seul toi le vois.'
              : 'Aucun message épinglé.'}{scope === 'this' && ' (dans cette discussion)'}</p>
          ) : rows.map(m => {
            const th = threadOf(m);
            const k = tab === 'important' ? 'important' : 'pinned';
            return (
              <button key={m.id} type="button" data-marks-row={m.id} onClick={() => { onPick(m.id, th ? th.id : ''); onClose(); }} className={`w-full text-left flex gap-3 px-4 py-2.5 border-b cursor-pointer ${rowCls}`}>
                <span aria-hidden className="w-1.5 shrink-0 rounded-full self-stretch" style={{ backgroundImage: markBackground(k) }} />
                <span className="min-w-0 flex-1">
                  <span className={`flex items-center gap-1.5 text-[11px] ${sub}`}>
                    <b className={light ? 'text-slate-700' : 'text-slate-200'}>{String(m.sender_name || '').split(' ')[0]}</b><span>· {dayText(m.timestamp)}</span>
                    {marksOf(m, important).length > 1 && <span aria-label={`${MARK_STYLE.important.fr} et ${MARK_STYLE.pinned.fr}`} className="inline-flex gap-0.5"><Flag className="w-3 h-3 text-rose-500" /><Pin className="w-3 h-3 text-amber-500" /></span>}
                  </span>
                  <span className="block text-sm" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{previewOf(m)}</span>
                  {scope === 'all' && th && <span className={`block text-[11px] mt-0.5 truncate ${sub}`}>{th.title}</span>}
                </span>
              </button>
            );
          })}
          {lists[tab].length > MAX_ROWS && <p className={`p-3 text-[11px] text-center ${sub}`}>Les {MAX_ROWS} plus récents.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
};
