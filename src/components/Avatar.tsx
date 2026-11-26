// Photo de profil ronde, ou les initiales du nom sur fond bleu quand il n'y a pas de photo.
// Utilisé par : CVViewerModal.tsx, ChatAbout.tsx, ChatDialogs.tsx, ChatView.tsx, NewsShareSheet.tsx, OperatorSheet.tsx, ProfilePhotoGate.tsx, Sidebar.tsx et 7 autres.
// Pour modifier : props src, name et className (taille par défaut w-8 h-8).
import React, { useEffect, useState } from 'react';
import { useSoftImage } from '../utils/softImage';

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
}

// Photo de profil, ou initiales si aucune photo OU si la photo ne se charge pas (hors ligne) : jamais l'icône « image cassée ».
// La photo revient toute seule quand la connexion revient.
export const Avatar: React.FC<AvatarProps> = ({ src, name, className = 'w-8 h-8' }) => {
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const soft = useSoftImage(src || undefined);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (!failed) return;
    const retry = () => { setFailed(false); setTries(n => n + 1); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);
  if (src && !failed) {
    return <img key={tries} ref={soft.ref} src={src} alt={name} onLoad={soft.onLoad} onError={() => setFailed(true)} className={`${className} rounded-full object-cover border border-slate-300/60 shrink-0 ${soft.className}`} />;
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <div
      className={`${className} rounded-full shrink-0 flex items-center justify-center bg-blue-600/15 text-blue-600 border border-blue-500/30 font-bold text-xs`}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
