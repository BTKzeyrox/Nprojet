// « Visible seulement par… » (M28.3) : choix des personnes qui verront le prochain message. Le serveur cache ensuite le message à tous les autres (règles : utils/chatShared.ts).
import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

export interface VisiblePerson { id: string; name: string }

export const ChatVisibleTo: React.FC<{ light: boolean; people: VisiblePerson[]; initial: string[]; onClose: () => void; onPick: (ids: string[]) => void }> = ({ light, people, initial, onClose, onPick }) => {
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (id: string) => setSel(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 20 ? p : [...p, id]));
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Visible seulement par" data-visible-to-dialog>
      <div className={`w-full sm:max-w-sm max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl ${light ? 'bg-white text-slate-900' : 'bg-[#0f1722] text-slate-100 border border-slate-700'}`}>
        <div className="flex items-center gap-2 p-4 border-b border-slate-500/30">
          <Lock className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0"><div className="font-bold text-sm">Visible seulement par…</div><div className="text-xs opacity-70">Les autres ne verront pas ce message. Le responsable le voit toujours.</div></div>
          <button type="button" aria-label="Fermer" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <ul className="overflow-y-auto p-2">
          {people.length === 0 && <li className="p-3 text-sm opacity-70">Personne à choisir.</li>}
          {people.map(p => (
            <li key={p.id}><label className="flex items-center gap-3 min-h-[48px] px-2 rounded-lg cursor-pointer text-sm"><input type="checkbox" data-visible-person={p.id} checked={sel.includes(p.id)} onChange={() => toggle(p.id)} className="w-5 h-5 accent-emerald-500" />{p.name}</label></li>
          ))}
        </ul>
        <div className="p-3 border-t border-slate-500/30 flex gap-2">
          <button type="button" data-visible-to-ok disabled={sel.length === 0} onClick={() => onPick(sel)} className="flex-1 min-h-[44px] rounded-lg bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-40">{sel.length ? `Choisir (${sel.length})` : 'Choisis au moins une personne'}</button>
          {initial.length > 0 && <button type="button" onClick={() => onPick([])} className="min-h-[44px] px-3 rounded-lg border border-slate-500/50 text-sm cursor-pointer">Retirer</button>}
        </div>
      </div>
    </div>
  );
};
