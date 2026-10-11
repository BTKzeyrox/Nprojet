import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { downloadFile } from '../utils/attachments';
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
  const round = 'h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 bg-white/12 hover:bg-white/25 text-white text-sm font-semibold cursor-pointer transition-colors shrink-0';
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black" role="dialog" aria-modal="true">
      <header className="shrink-0 flex items-center gap-3 px-3 pb-3 bg-black" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <button type="button" onClick={onClose} className={`${round} !w-11 !px-0`} title="Retour" aria-label="Retour"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate leading-tight flex items-center gap-1.5"><FileText className="w-4 h-4 shrink-0 text-white/70" /><span className="truncate">{name}</span></h3>
          {subtitle && <p className="text-xs text-white/60 truncate leading-tight">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => void downloadFile(url, name)} className={`${round} !w-11 !px-0 sm:!w-auto sm:!px-4`} title="Télécharger" aria-label="Télécharger"><Download className="w-5 h-5" /><span className="hidden sm:inline">Télécharger</span></button>
        <a href={url} target="_blank" rel="noreferrer" className={`${round} !w-11 !px-0`} title="Ouvrir à part" aria-label="Ouvrir à part"><ExternalLink className="w-5 h-5" /></a>
        {onDelete && (
          <button type="button" onClick={onDelete} className={`${round} !w-11 !px-0 !bg-red-600/80 hover:!bg-red-600`} title="Supprimer" aria-label="Supprimer"><Trash2 className="w-5 h-5" /></button>
        )}
      </header>
      <div className="flex-1 min-h-0 bg-white rounded-t-3xl overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <iframe src={url} title={name} className="w-full h-full border-0" />
      </div>
    </div>,
    document.body
  );
};
