import React from 'react';
import { ArrowLeft, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';

interface FileViewerModalProps {
  url: string;
  name: string;
  subtitle?: string;
  onClose: () => void;
  onDelete?: () => void; // absent : pas le droit de supprimer
}

/** Visionneuse de fiches (PDF, texte) dans l'app : « Retour » et « Supprimer » toujours visibles. */
export const FileViewerModal: React.FC<FileViewerModalProps> = ({ url, name, subtitle, onClose, onDelete }) => {
  useLockBodyScroll(true);
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0a111a]" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }} role="dialog" aria-modal="true">
      <header className="shrink-0 px-2 sm:px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="flex items-center gap-2 px-3 min-h-[44px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold shrink-0 cursor-pointer">
          <ArrowLeft className="w-4 h-4 text-emerald-400" /> Retour
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h3 className="font-tactical text-xs sm:text-sm font-bold text-white break-words leading-tight flex items-center justify-center gap-1.5">
            <FileText className="w-4 h-4 shrink-0 text-emerald-400" /> <span className="break-all">{name}</span>
          </h3>
          {subtitle && <p className="text-[10px] text-slate-400 font-mono break-words leading-tight">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold" title="Ouvrir à part">
            <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Ouvrir</span>
          </a>
          {onDelete && (
            <button type="button" onClick={onDelete} className="flex items-center gap-1.5 px-3 min-h-[44px] bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-bold cursor-pointer">
              <Trash2 className="w-4 h-4" /> <span>Supprimer</span>
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 bg-white">
        <iframe src={url} title={name} className="w-full h-full border-0" />
      </div>
    </div>
  );
};
