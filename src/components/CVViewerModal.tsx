import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Image as ImageIcon, Sun, Moon, Phone } from 'lucide-react';
import { User } from '../types';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { compressImageToDataUrl } from '../utils/imageUtils';
import { db } from '../db/store';
import { shiftHoursLabel } from '../utils/formatUtils';
import { Avatar } from './Avatar';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

// Fenêtre « Profil » : photo, nom, shift, téléphone (plus de CV ni de pièce d'identité)
export const CVViewerModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user }) => {
  useLockBodyScroll(isOpen);
  const [, force] = useState(0);
  const [error, setError] = useState('');
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Booster qui modifie son propre profil : tout passe par une demande validée par l'admin
  const [fName, setFName] = useState('');
  const [fUser, setFUser] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fAvatar, setFAvatar] = useState<string>('');
  const [fNote, setFNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(false);

  const uid = user?.id;
  useEffect(() => {
    if (!isOpen || !user) return;
    const u = db.getUsers().find(x => x.id === user.id) || user;
    setFName(u.name); setFUser(u.username); setFPhone(u.phone || ''); setFAvatar('');
    setError(''); setInfo(''); setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, uid]);

  if (!isOpen || !user) return null;

  const me = db.getCurrentUser();
  const live = db.getUsers().find(u => u.id === user.id) || user;
  const isSelfBooster = !!me && me.id === live.id && me.role === 'employee';
  const canEdit = !!me && me.role === 'admin';
  const myReq = isSelfBooster ? db.getProfileRequests().find(r => r.user_id === live.id) : undefined;
  const pending = myReq && myReq.status === 'pending' ? myReq : undefined;
  const refused = myReq && myReq.status === 'rejected' ? myReq : undefined;

  const pickForRequest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const small = await compressImageToDataUrl(file);
      const url = await db.uploadFile(small);
      if (!url) setError('Envoi de la photo impossible. Réessaie.');
      else setFAvatar(url);
    } catch {
      setError('Impossible de lire cette image.');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    setError(''); setInfo('');
    setBusy(true);
    const r = await db.submitProfileRequest({ name: fName, username: fUser, phone: fPhone, avatarUrl: fAvatar, note: fNote.trim() });
    setBusy(false);
    if (!r.success) return setError(r.error || 'Envoi impossible.');
    setEditing(false);
    setFAvatar('');
    setInfo('Demande envoyée. Elle sera appliquée après validation de l\'administrateur.');
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const url = await compressImageToDataUrl(file);
      db.updateUser(live.id, { avatar_url: url });
      force(n => n + 1);
    } catch {
      setError('Impossible de lire cette image.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#0d1624] border border-slate-700 p-5 space-y-4 text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-tactical font-bold text-lg">Profil</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Avatar src={live.avatar_url} name={live.name} className="w-32 h-32 text-3xl" />
          <div className="text-center">
            <div className="font-bold text-base">{live.name}</div>
            <div className="text-xs text-slate-400">@{live.username}</div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {live.role === 'employee' && (
            <div className="flex items-center gap-2 text-slate-300">
              {live.shift === 'day' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-300" />}
              {live.shift === 'day' ? `Shift Jour (${shiftHoursLabel('day', db.getSettings())})` : `Shift Nuit (${shiftHoursLabel('night', db.getSettings())})`}
            </div>
          )}
          {live.phone && (
            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-4 h-4 text-cyan-400" />
              {live.phone}
            </div>
          )}
        </div>

        {canEdit && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => camRef.current?.click()}
                className="flex items-center justify-center gap-2 px-2 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold text-center leading-tight"
              >
                <Camera className="w-4 h-4 shrink-0" /> Prendre une photo
              </button>
              <button
                type="button"
                onClick={() => galRef.current?.click()}
                className="flex items-center justify-center gap-2 px-2 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold text-center leading-tight"
              >
                <ImageIcon className="w-4 h-4 shrink-0" /> Changer la photo
              </button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
            <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </>
        )}

        {isSelfBooster && (
          <div className="space-y-2">
            {refused && !pending && (
              <div className="p-2.5 bg-red-950/70 border border-red-500/50 text-red-200 text-xs leading-relaxed">
                Modification refusée : {refused.reason || 'sans motif'}
              </div>
            )}
            {pending && (
              <div className="p-2.5 bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs leading-relaxed">
                Modification en attente de validation par l'administrateur : {pending.name} · @{pending.username}
                {pending.avatar_url !== pending.old.avatar_url ? ' · nouvelle photo' : ''}
              </div>
            )}
            {!editing ? (
              <button
                type="button"
                onClick={() => { setEditing(true); setInfo(''); }}
                className="w-full px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer"
              >
                {pending ? 'Modifier ma demande' : 'Modifier mon profil'}
              </button>
            ) : (
              <div className="space-y-2 text-xs font-mono">
                <p className="text-slate-400 font-sans text-xs leading-relaxed">Les changements ne sont appliqués qu'après validation de l'administrateur.</p>
                <div className="flex items-center gap-3">
                  <Avatar src={fAvatar || live.avatar_url} name={fName || live.name} className="w-14 h-14 text-lg" />
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="px-2 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold cursor-pointer disabled:opacity-50">
                      Photo
                    </button>
                    <button type="button" disabled={busy} onClick={() => galRef.current?.click()} className="px-2 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold cursor-pointer disabled:opacity-50">
                      Galerie
                    </button>
                  </div>
                </div>
                <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pickForRequest} />
                <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={pickForRequest} />
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Nom</label>
                  <input value={fName} onChange={e => setFName(e.target.value)} className="w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Pseudo</label>
                  <input value={fUser} onChange={e => setFUser(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Téléphone</label>
                  <input value={fPhone} onChange={e => setFPhone(e.target.value)} inputMode="tel" className="w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={fNote}
                    onChange={e => setFNote(e.target.value)}
                    placeholder="Un mot pour l'admin (facultatif)"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={() => { setEditing(false); setError(''); }} className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer">
                    Annuler
                  </button>
                  <button type="button" disabled={busy} onClick={sendRequest} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer disabled:opacity-60">
                    {busy ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </div>
            )}
            {info && <div className="p-2.5 bg-emerald-950 border border-emerald-500/50 text-emerald-200 text-xs leading-relaxed">{info}</div>}
          </div>
        )}
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>
    </div>
  );
};
