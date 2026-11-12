// Transférer un message : choisir la conversation de destination (le message y est envoyé, avec « Transféré de … »).
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Forward } from 'lucide-react';

export const ChatForward: React.FC<{ threads: { id: string; title: string; subtitle?: string }[]; light: boolean; onPick: (threadId: string) => void; onClose: () => void }> = ({ threads, light, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const norm = (v: string) => (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = threads.filter(t => !q.trim() || norm(t.title).includes(norm(q)));
  const card = light ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-900 text-slate-100 border-slate-700';
  const sub = light ? 'text-slate-500' : 'text-slate-400';
  const field = light ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100';
  return createPortal(
    <div data-chat-forward className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-sm max-h-[75vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${card}`} onClick={e => e.stopPropagation()} role="dialog" aria-label="Transférer le message">
        <div className="p-3 flex items-center gap-2 shrink-0">
          <Forward className="w-5 h-5 text-violet-600 shrink-0" />
          <p className="flex-1 font-semibold text-sm">Transférer à…</p>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${light ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="w-5 h-5" /></button>
        </div>
        <div className="px-3 pb-2 shrink-0 relative">
          <Search className={`w-4 h-4 absolute left-6 top-1/2 -translate-y-[60%] ${sub}`} />
          <input data-chat-forward-search value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une discussion" className={`w-full h-10 pl-9 pr-3 rounded-full border text-sm focus:outline-none focus:border-violet-500 ${field}`} />
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto border-t ${light ? 'border-slate-100' : 'border-slate-800'}`}>
          {list.length === 0 && <p className={`p-4 text-sm text-center ${sub}`}>Aucune discussion.</p>}
          {list.map(t => (
            <button key={t.id} type="button" data-chat-forward-to={t.id} onClick={() => onPick(t.id)} className={`w-full text-left px-4 py-2.5 border-b cursor-pointer ${light ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-slate-800 border-slate-800'}`}>
              <span className="block text-sm font-semibold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
              {t.subtitle && <span className={`block text-[11px] ${sub}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subtitle}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};
