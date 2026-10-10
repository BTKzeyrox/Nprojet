import React, { useState } from 'react';
import { X, Camera, Send, CheckCircle2 } from 'lucide-react';
import { db } from '../db/store';
import { compressProofImage } from '../utils/imageUtils';
import { APP_VERSION, deviceInfo, getCurrentPage } from '../utils/errorReport';

interface Props {
  onClose: () => void;
}

// « Signaler un problème » : texte libre + capture facultative ; les infos techniques sont ajoutées automatiquement
export const ReportProblemModal: React.FC<Props> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [shot, setShot] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setShot(await compressProofImage(f));
    } catch {
      setError('Image invalide.');
    }
  };

  const send = async () => {
    if (text.trim().length < 3) return setError('Décris le problème en quelques mots.');
    setBusy(true);
    setError('');
    const r = await db.submitProblemReport({ detail: text.trim(), screenshotDataUrl: shot || undefined, page: getCurrentPage(), device: deviceInfo(), version: APP_VERSION });
    setBusy(false);
    if (r.success) setDone(true);
    else setError(r.error || 'Envoi impossible.');
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0f1722] border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-tactical font-bold text-white">Signaler un problème</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white cursor-pointer" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {done ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-slate-200">Merci, ton signalement est envoyé à l'administrateur.</p>
            <button type="button" onClick={onClose} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer">
              Fermer
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3 text-xs font-mono">
            <div>
              <label className="block text-slate-300 uppercase mb-1">Que s'est-il passé ?</label>
              <textarea
                rows={4}
                maxLength={1000}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Décris ce que tu faisais et ce qui ne marche pas"
                className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center gap-2 cursor-pointer">
                <Camera className="w-4 h-4" /> {shot ? 'Changer la capture' : 'Ajouter une capture (facultatif)'}
                <input type="file" accept="image/*" onChange={pick} className="hidden" />
              </label>
              {shot && <img src={shot} alt="capture" className="h-10 w-auto border border-slate-600" />}
            </div>
            <p className="text-[11px] text-slate-500">La page, ton appareil et la version du site sont ajoutés automatiquement. Jamais ton mot de passe.</p>
            {error && <div className="text-red-300">{error}</div>}
            <button type="button" onClick={send} disabled={busy} className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 cursor-pointer">
              <Send className="w-4 h-4" /> {busy ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
