import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** Procédure en 2 étapes : (1) lire et continuer, (2) taper un mot pour confirmer. */
export const TwoStepDialog: React.FC<{
  title: string;
  intro: string[];            // étape 1 : ce qui va se passer
  word: string;               // étape 2 : le mot à taper
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, intro, word, confirmLabel, onConfirm, onClose }) => {
  const L = useApp().theme === 'light';
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toUpperCase() === word.toUpperCase();
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  const ghost = `flex-1 min-h-[46px] rounded-full text-sm font-bold cursor-pointer ${L ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`;
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={onClose}>
      <div className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl p-5 space-y-4 ${L ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1b2d] border-slate-700 text-white'}`} style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center gap-3">
          <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${L ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/15 text-blue-400'}`}><ShieldCheck className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base leading-tight">{title}</h3>
            <p className={`text-xs ${sub}`}>Étape {step} sur 2</p>
          </div>
          <button type="button" onClick={onClose} className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${L ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'}`} title="Fermer"><X className="w-5 h-5" /></button>
        </div>

        {/* Barre des 2 étapes */}
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-1.5 flex-1 rounded-full bg-blue-600" />
          <span className={`h-1.5 flex-1 rounded-full ${step === 2 ? 'bg-blue-600' : L ? 'bg-slate-200' : 'bg-white/15'}`} />
        </div>

        {step === 1 ? (
          <>
            <div className={`space-y-2 text-sm rounded-2xl p-3 ${L ? 'bg-slate-50' : 'bg-white/5'}`}>
              {intro.map((t, i) => <p key={i}>{t}</p>)}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={ghost}>Annuler</button>
              <button type="button" onClick={() => setStep(2)} className="flex-1 min-h-[46px] rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">Continuer</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">Pour confirmer, tapez le mot <b className="font-mono tracking-wider">{word}</b> ci-dessous.</p>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={word}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className={`w-full rounded-full border px-4 py-3 text-center font-mono tracking-widest focus:outline-none focus:border-blue-500 ${L ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0a1424] border-slate-600 text-white'}`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep(1); setTyped(''); }} className={ghost}>Retour</button>
              <button type="button" disabled={!ok} onClick={() => { onConfirm(); onClose(); }} className="flex-1 min-h-[46px] rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">{confirmLabel}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
