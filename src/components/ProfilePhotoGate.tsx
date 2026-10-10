import React, { useRef, useState } from 'react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { Camera, Image as ImageIcon, Check, LogOut } from 'lucide-react';
import { User } from '../types';
import { db } from '../db/store';
import { compressImageToDataUrl } from '../utils/imageUtils';
import { Avatar } from './Avatar';

interface Props {
  user: User;
  onDone: () => void;
  onLogout: () => void;
}

// Écran obligatoire : l'employé doit ajouter sa photo de profil avant d'utiliser le site
export const ProfilePhotoGate: React.FC<Props> = ({ user, onDone, onLogout }) => {
  const [photo, setPhoto] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useLockBodyScroll(true);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setPhoto(await compressImageToDataUrl(file));
    } catch {
      setError("Impossible de lire cette image. Essayez une autre photo.");
    }
  };

  const save = async () => {
    if (busy) return;
    if (!photo) {
      setError('Ajoutez votre photo pour continuer.');
      return;
    }
    setBusy(true);
    setError('');
    // La photo est envoyée au stockage (lien court) ; si l'envoi échoue, on garde la photo dans le compte
    let avatar = photo;
    try {
      const url = await db.uploadFile(photo);
      if (url) avatar = url;
    } catch { /* on garde la photo locale */ }
    db.updateUser(user.id, { avatar_url: avatar });
    setBusy(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0d1624] border border-slate-700 p-5 space-y-4 text-slate-100">
        <div>
          <h2 className="font-tactical font-bold text-lg">Votre photo de profil</h2>
          <p className="text-sm text-slate-400 mt-1">
            Bienvenue {user.name}. Ajoutez une photo de vous pour continuer.
          </p>
        </div>

        <div className="flex justify-center">
          <Avatar src={photo} name={user.name} className="w-32 h-32 text-3xl" />
        </div>

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
            <ImageIcon className="w-4 h-4 shrink-0" /> Choisir une image
          </button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
        <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={pick} />

        {error && <div className="text-sm text-red-400 border border-red-500/40 bg-red-950/40 p-2">{error}</div>}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60"
        >
          <Check className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Enregistrer et continuer'}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-400 hover:text-white"
        >
          <LogOut className="w-4 h-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
};
