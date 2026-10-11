import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, CheckCircle2, Camera, FileText } from 'lucide-react';
import { getGuide } from '../utils/missionGuides';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';

// Contenu du guide : 4 étapes (l'étape en cours est mise en avant), justificatif attendu.
export const MissionGuideContent: React.FC<{ type?: string; currentStep?: number }> = ({ type, currentStep }) => {
  const g = getGuide(type);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] uppercase font-bold text-cyan-400 tracking-wider">{g.type}</p>
        <p className="text-slate-200 mt-1">{g.summary}</p>
      </div>

      <ol className="space-y-2">
        {g.steps.map((s, i) => {
          const n = i + 1;
          const current = currentStep === n;
          const done = !!currentStep && n < currentStep;
          return (
            <li
              key={s.title}
              className={`flex gap-3 rounded-xl border p-3 ${
                current ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-700 bg-slate-900/60'
              }`}
            >
              <span
                className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  done ? 'bg-emerald-600 text-white' : current ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : n}
              </span>
              <div>
                <p className="font-bold text-white">
                  {s.title}
                  {current && <span className="ml-2 text-[10px] uppercase text-emerald-400">Tu es ici</span>}
                </p>
                <p className="text-slate-300 text-[13px] mt-0.5">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 space-y-2">
        <p className="font-bold text-white">Justificatif à envoyer</p>
        <p className="flex gap-2 text-[13px] text-slate-300">
          <Camera className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          <span>
            {g.endPhotoLabel} — <b>{g.endPhotoRequired ? 'obligatoire' : 'facultatif'}</b>
          </span>
        </p>
        <p className="flex gap-2 text-[13px] text-slate-300">
          <FileText className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          <span>
            {g.endNoteLabel.replace(/ \((obligatoire|facultatif)\)/, '')} — <b>{g.endNoteRequired ? 'obligatoire' : 'facultatif'}</b>
          </span>
        </p>
      </div>
    </div>
  );
};

// Bouton « Comment faire ? » + fenêtre plein écran (portail pour éviter les parents « fixed »).
export const MissionGuideButton: React.FC<{ type?: string; currentStep?: number; className?: string; label?: string }> = ({
  type,
  currentStep,
  className,
  label = 'Comment faire ?',
}) => {
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);
  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ||
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 text-xs font-bold cursor-pointer'
        }
      >
        <HelpCircle className="w-3.5 h-3.5" />
        {label}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-[#0f1722] border border-slate-700 w-full sm:max-w-lg max-h-[92dvh] rounded-t-2xl sm:rounded-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-cyan-400" /> Comment faire ?
                </h3>
                <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto overscroll-contain">
                <MissionGuideContent type={type} currentStep={currentStep} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

// Pour le responsable : ce qu'il vérifie et les motifs de refus fréquents.
export const AdminChecklist: React.FC<{ type?: string }> = ({ type }) => {
  const g = getGuide(type);
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-xs space-y-2">
      <p className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">Le responsable vérifie</p>
      <ul className="space-y-1 text-slate-300">
        {g.checks.map(c => (
          <li key={c} className="flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />{c}</li>
        ))}
      </ul>
      <p className="text-slate-400">
        <b>Motifs de refus fréquents :</b> {g.refusals.join(' · ')}
      </p>
    </div>
  );
};
