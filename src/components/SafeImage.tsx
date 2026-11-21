// Image qui ne montre JAMAIS l'icône « image cassée » du navigateur (hors ligne, lien mort) : à la place, un cadre neutre de la même taille,
// qui redevient la vraie photo tout seul quand la connexion revient. Les photos déjà vues sont gardées par le service worker (public/sw.js, cache « df-images »).
// Utilisé par : FeedView, StockTab, AdminDashboard, EmployeeDashboard, DayDetailsModal, TeamValidations, ChatDialogs, ChatView (avatars de groupe).
// Pour modifier : mêmes propriétés qu'une balise <img> ; `compact` (sans texte) est choisi tout seul pour les petites images (w-/h- de 1 à 16). Règles pures : src/utils/safeImage.ts.
import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { isCompactClass, placeholderLabel } from '../utils/safeImage';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & { compact?: boolean };

export const SafeImage: React.FC<Props> = ({ compact, onError, className = '', alt, src, style, ...rest }) => {
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (!failed) return;
    const retry = () => { setFailed(false); setTries(n => n + 1); }; // connexion revenue : on redemande la photo
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);
  if (failed || !src) {
    const small = compact ?? isCompactClass(className);
    return (
      <span
        role="img"
        aria-label={alt || placeholderLabel(typeof navigator !== 'undefined' ? navigator.onLine : true)}
        className={`${className} flex min-h-[2.5rem] min-w-[2.5rem] flex-col items-center justify-center gap-1 overflow-hidden border border-slate-500/25 bg-slate-500/15 text-center text-slate-400`}
        style={style}
      >
        <ImageOff className={small ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden />
        {!small && <span className="px-2 text-[11px] font-semibold leading-tight">{placeholderLabel(typeof navigator !== 'undefined' ? navigator.onLine : true)}</span>}
      </span>
    );
  }
  return <img key={tries} src={src} alt={alt} className={className} style={style} onError={e => { setFailed(true); onError?.(e); }} {...rest} />;
};
