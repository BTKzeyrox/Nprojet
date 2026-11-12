// Recherche de messages dans la conversation ouverte : par texte, par jour (date cliquable dans le fil ou sélecteur de date). Règle : utils/chatSearch.ts.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, CalendarDays } from 'lucide-react';
import type { ChatMessage } from '../types';
import { searchMessages, firstOfDay } from '../utils/chatSearch';

const dayText = (d: string) => d.split('-').reverse().join('/');

export const ChatSearch: React.FC<{ msgs: ChatMessage[]; initialDay?: string | null; light: boolean; onPick: (id: string) => void; onClose: () => void }> = ({ msgs, initialDay = null, light, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [day, setDay] = useState<string | null>(initialDay);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!initialDay) inputRef.current?.focus(); }, [initialDay]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const res = useMemo(() => searchMessages(msgs, q, day, new Date().getFullYear()), [msgs, q, day]);
  const first = useMemo(() => firstOfDay(msgs, res.day), [msgs, res.day]);
  const card = light ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-900 text-slate-100 border-slate-700';
  const sub = light ? 'text-slate-500' : 'text-slate-400';
  const field = light ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100';
  const row = light ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-slate-800 border-slate-800';
  return createPortal(
    <div data-chat-search className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${card}`} onClick={e => e.stopPropagation()} role="dialog" aria-label="Rechercher dans la conversation">
        <div className="p-3 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${sub}`} />
            <input ref={inputRef} data-chat-search-input value={q} onChange={e => setQ(e.target.value)} placeholder="Texte ou date (12/11)" className={`w-full h-10 pl-9 pr-3 rounded-full border text-sm focus:outline-none focus:border-emerald-500 ${field}`} />
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="w-5 h-5" /></button>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
          <label className={`flex items-center gap-1.5 text-xs ${sub}`}><CalendarDays className="w-4 h-4 text-emerald-600" />Jour
            <input data-chat-search-day type="date" value={day || ''} onChange={e => setDay(e.target.value || null)} className={`h-8 px-2 rounded-lg border text-xs ${field}`} />
          </label>
          {day && <button type="button" data-chat-search-clear-day onClick={() => setDay(null)} className="text-xs text-emerald-600 font-semibold cursor-pointer">Tous les jours</button>}
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto border-t ${light ? 'border-slate-100' : 'border-slate-800'}`}>
          {res.total === 0 ? (
            <p data-chat-search-empty className={`p-4 text-sm text-center ${sub}`}>{!q.trim() && !day ? 'Écris un mot, une date (12/11) ou choisis un jour.' : 'Aucun message trouvé.'}</p>
          ) : (
            <>
              {first && <button type="button" data-chat-search-goday onClick={() => { onPick(first); onClose(); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-emerald-600 border-b border-emerald-600/20 cursor-pointer">Aller au début du {dayText(res.day!)}</button>}
              <p className={`px-4 pt-2 pb-1 text-[11px] ${sub}`}>{res.total} message{res.total > 1 ? 's' : ''}{res.day ? ` · ${dayText(res.day)}` : ''}{res.total > res.hits.length ? ` · les ${res.hits.length} plus récents` : ''}</p>
              {res.hits.map(h => (
                <button key={h.id} type="button" data-chat-search-hit={h.id} onClick={() => { onPick(h.id); onClose(); }} className={`w-full text-left px-4 py-2.5 border-b cursor-pointer ${row}`}>
                  <span className={`block text-[11px] ${sub}`}>{dayText(h.day)} · {h.time} · {h.sender.split(' ')[0]}</span>
                  <span className="block text-sm" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{h.text || '…'}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
