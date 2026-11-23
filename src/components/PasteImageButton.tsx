// Bouton « Coller » : prend l'image copiée (capture d'écran, image copiée ailleurs) et l'envoie comme « choisir un fichier ». Sur téléphone, c'est la façon fiable de coller.
// Pour modifier : props onFiles (reçoit les images), disabled, compact (icône seule), className. Si rien n'est collé, une phrase l'explique.
// Utilisé par : ChatView.tsx, FeedView.tsx, ReportProblemModal.tsx, EmployeeDashboard.tsx. Règles : utils/pasteImages.ts (readClipboardImages). Contrôlé par scripts/check-paste-images.ts.
import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { readClipboardImages, pasteReasonText } from '../utils/pasteImages';

export const PasteImageButton: React.FC<{ onFiles: (files: File[]) => void; disabled?: boolean; compact?: boolean; className?: string; label?: string }> = ({ onFiles, disabled, compact, className, label = 'Coller une image' }) => {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const go = async () => {
    clearTimeout(timer.current);
    const r = await readClipboardImages();
    if (r.files.length) { setMsg(''); onFiles(r.files); return; }
    setMsg(pasteReasonText(r.reason));
    timer.current = setTimeout(() => setMsg(''), 5000);
  };
  return (
    <span className="inline-flex flex-col items-start" data-paste-wrap>
      <button type="button" disabled={disabled} onClick={() => void go()} data-paste-button title={label} aria-label={label} className={className || 'flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-slate-500/10'}>
        <ClipboardPaste className="w-4 h-4" />{!compact && label}
      </button>
      {msg && <span role="status" className="text-xs text-amber-500 max-w-[16rem]" data-paste-msg>{msg}</span>}
    </span>
  );
};
