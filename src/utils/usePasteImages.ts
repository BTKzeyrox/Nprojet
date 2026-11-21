// Écoute le collage d'images sur toute la page tant que `enabled` est vrai (écrans sans champ de texte, comme la fenêtre des photos de début de mission).
import { useEffect, useRef } from 'react';
import { takePastedImages } from './pasteImages';
export function usePasteImages(take: (files: File[]) => void, enabled: boolean): void {
  const ref = useRef(take);
  ref.current = take;
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => { takePastedImages(e as unknown as { clipboardData: DataTransfer | null; preventDefault(): void }, f => ref.current(f)); };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled]);
}
