// Chargement doux des images : pendant le téléchargement, un fond qui « respire » (même taille que l'image, donc pas de saut de mise en page) ;
// quand l'image est prête, elle apparaît en fondu (0,2 s). Une image déjà en mémoire s'affiche tout de suite, sans fondu.
// Utilisé par : SafeImage, Avatar, ChatView (photos des messages), LightboxModal. Styles : index.css (.df-img-loading, .df-img-in). Contrôlé par : npm run check:soft-image.
import { useCallback, useEffect, useState } from 'react';

export type SoftState = 'loading' | 'fade' | 'ready';
export const softClass = (s: SoftState): string => (s === 'loading' ? 'df-img-loading' : s === 'fade' ? 'df-img-in' : '');
/** Une image déjà prête (en mémoire) : pas d'attente, pas de fondu. */
export const isAlreadyLoaded = (el: { complete?: boolean; naturalWidth?: number } | null | undefined): boolean => !!el && el.complete === true && (el.naturalWidth || 0) > 0;

export function useSoftImage(src: string | undefined) {
  const [state, setState] = useState<SoftState>('loading');
  useEffect(() => { setState('loading'); }, [src]);
  const ref = useCallback((el: HTMLImageElement | null) => { if (isAlreadyLoaded(el)) setState('ready'); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLoad = useCallback(() => setState(s => (s === 'loading' ? 'fade' : s)), []);
  // sécurité : si l'image n'annonce jamais sa fin (erreur silencieuse), le fond ne respire pas à l'infini
  useEffect(() => { if (state !== 'loading') return; const t = window.setTimeout(() => setState('ready'), 20000); return () => window.clearTimeout(t); }, [state]);
  return { ref, onLoad, className: softClass(state), state };
}
