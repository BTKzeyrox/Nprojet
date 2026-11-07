// Liste des raccourcis clavier (touche « ? »). Utilisé par : App.tsx. Contenu : utils/shortcuts.ts (SHORTCUT_LIST).
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { SHORTCUT_LIST } from '../utils/shortcuts';

export const ShortcutsHelp: React.FC<{ isAdmin: boolean; onClose: () => void }> = ({ isAdmin, onClose }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" data-shortcuts-help onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-extrabold text-lg mr-auto">Raccourcis clavier</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {SHORTCUT_LIST(isAdmin).map(g => (
          <section key={g.group} className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{g.group}</h3>
            {g.items.map(it => (
              <div key={g.group + it.keys} className="flex items-center gap-3 text-sm">
                <kbd className="shrink-0 min-w-[7rem] px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 font-mono text-xs text-center shadow-[0_1px_0_rgba(15,30,58,0.15)]">{it.keys}</kbd>
                <span>{it.label}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
