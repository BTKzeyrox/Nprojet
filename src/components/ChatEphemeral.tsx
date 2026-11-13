// « Messages éphémères » (M28.4) : durée de disparition d'une discussion. Le serveur applique les droits et calcule l'heure de disparition de chaque message.
import React from 'react';
import { Timer, X } from 'lucide-react';

export const EPHEMERAL_LABEL: Record<number, string> = { 0: 'Désactivés', 3600000: '1 heure', 86400000: '24 heures', 604800000: '7 jours' };
export const ephemeralText = (ms: number): string => (ms === 3600000 ? '1 h' : ms === 86400000 ? '24 h' : ms === 604800000 ? '7 jours' : '');

export const ChatEphemeral: React.FC<{ light: boolean; title: string; current: number; busy: boolean; error: string; onClose: () => void; onPick: (ms: number) => void }> = ({ light, title, current, busy, error, onClose, onPick }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Messages éphémères" data-ephemeral-dialog>
    <div className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl ${light ? 'bg-white text-slate-900' : 'bg-[#0f1722] text-slate-100 border border-slate-700'}`}>
      <div className="flex items-center gap-2 p-4 border-b border-slate-500/30">
        <Timer className="w-5 h-5 shrink-0" />
        <div className="flex-1 min-w-0"><div className="font-bold text-sm">Messages éphémères</div><div className="text-xs opacity-70 truncate">{title}</div></div>
        <button type="button" aria-label="Fermer" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
      </div>
      <p className="px-4 pt-3 text-xs opacity-80">Les nouveaux messages de cette discussion disparaissent après la durée choisie (photos et fichiers aussi). Les messages déjà envoyés ne changent pas.</p>
      <div className="p-2">
        {[0, 3600000, 86400000, 604800000].map(ms => (
          <button key={ms} type="button" data-ephemeral-pick={ms} disabled={busy} onClick={() => onPick(ms)} className={`w-full min-h-[48px] px-3 flex items-center justify-between rounded-lg text-sm cursor-pointer disabled:opacity-50 ${current === ms ? 'font-bold bg-emerald-600/15' : 'hover:bg-black/5'}`}>
            {EPHEMERAL_LABEL[ms]}{current === ms && <span className="text-emerald-500 text-xs">actuel</span>}
          </button>
        ))}
      </div>
      {error && <div role="alert" className="px-4 pb-3 text-xs text-rose-400">{error}</div>}
    </div>
  </div>
);
