import { createPortal } from 'react-dom';
import React, { useState } from 'react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { Pencil, X } from 'lucide-react';
import { db } from '../db/store';
import { PostSession } from '../types';
import { askConfirm } from './ConfirmModal';
import { ScoreInput } from './ScoreInput';
import { compressProofImage } from '../utils/imageUtils';

// Boutons « Modifier » et « Annuler » directement sur la carte d'un poste en attente de validation (booster)
export const PendingPostActions: React.FC<{ post: PostSession; onGoToPost: () => void }> = ({ post, onGoToPost }) => {
  const [editing, setEditing] = useState(false);
  useLockBodyScroll(editing);
  const [score, setScore] = useState(post.initial_score);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStart = post.status === 'pending_start';

  const cancel = () =>
    askConfirm({
      title: isStart ? 'Annuler ce poste ?' : 'Annuler la fin de session ?',
      message: isStart
        ? 'Le poste redeviendra libre. Ta demande de début sera supprimée.'
        : 'La session reprend. Tu pourras renvoyer la fin plus tard.',
      confirmLabel: isStart ? 'Annuler le poste' : 'Annuler la fin',
      cancelLabel: 'Garder',
      danger: true,
      onConfirm: () => {
        const r = isStart ? db.cancelPendingStartPost(post.id) : db.cancelPendingEndPost(post.id);
        if (!r.success) alert(r.error);
      },
    });

  const modify = () => {
    if (isStart) {
      setScore(post.initial_score); setPhoto(null); setErr(''); setEditing(true);
      return;
    }
    // Fin en attente : on reprend la session pour corriger puis renvoyer la fin
    askConfirm({
      title: 'Modifier la fin ?',
      message: 'La demande de fin est retirée et la session reprend : tu pourras la renvoyer corrigée.',
      confirmLabel: 'Modifier',
      cancelLabel: 'Garder',
      onConfirm: () => {
        const r = db.cancelPendingEndPost(post.id);
        if (!r.success) alert(r.error); else onGoToPost();
      },
    });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const small = await compressProofImage(f);
      setPhoto((await db.uploadFile(small)) || small);
    } catch { setErr('Photo impossible à envoyer. Réessaie.'); }
    setBusy(false);
  };

  const save = () => {
    if (score <= 0) { setErr('Score invalide.'); return; }
    const r = db.updatePendingStartPost(post.id, score, photo || undefined);
    if (!r.success) { setErr(r.error || 'Modification impossible.'); return; }
    setEditing(false);
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" onClick={stop(modify)} className="py-2 px-2 text-xs font-bold bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer">
          <Pencil className="w-3.5 h-3.5" />Modifier
        </button>
        <button type="button" onClick={stop(cancel)} className="py-2 px-2 text-xs font-bold bg-[#141e2a] hover:bg-red-950/50 border border-red-500/60 text-red-300 flex items-center justify-center gap-1.5 cursor-pointer">
          <X className="w-3.5 h-3.5" />Annuler
        </button>
      </div>

      {editing && createPortal(
        <div onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setEditing(false); }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 overflow-y-auto overscroll-contain">
          <div onClick={e => e.stopPropagation()} className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-5 space-y-4 text-xs font-mono my-auto">
            <h3 className="font-tactical font-bold text-white text-base">Modifier le poste en attente</h3>
            <p className="text-slate-400">Possible seulement avant la validation de l'admin.</p>
            <div>
              <label className="block text-slate-300 uppercase mb-1">Score de départ (sur la capture)</label>
              <ScoreInput value={score} onChange={setScore} className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white font-bold" />
            </div>
            <div>
              <label className="block text-slate-300 uppercase mb-1">Remplacer la capture (facultatif)</label>
              <input type="file" accept="image/*" onChange={onFile} className="text-slate-400" />
              {busy && <div className="text-cyan-300 mt-1">Photo en cours d'envoi…</div>}
              {photo && !busy && <div className="text-emerald-300 mt-1">Nouvelle photo prête.</div>}
            </div>
            {err && <div className="text-red-300">{err}</div>}
            <div className="pt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded cursor-pointer">Fermer</button>
              <button type="button" disabled={busy} onClick={save} className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded disabled:opacity-50 cursor-pointer">Enregistrer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
