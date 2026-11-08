// Champs de message à plusieurs lignes (BTK, 2026-11-08) : même règle partout.
// Ordinateur (souris + clavier réels) : Entrée ou Ctrl/Cmd+Entrée envoie, Maj+Entrée passe à la ligne.
// Téléphone / tablette : Entrée passe à la ligne, c'est le bouton qui envoie.
import { useEffect } from 'react';
import type { RefObject } from 'react';

export type ComposerKey = { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean };
export type ComposerAction = 'send' | 'newline' | 'none';

export const isDesktopPointer = (): boolean => {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
};

export const composerEnter = (e: ComposerKey, desktop: boolean): ComposerAction => {
  if (e.key !== 'Enter' || e.isComposing) return 'none'; // saisie en cours (accents, clavier asiatique) : on ne touche à rien
  if (e.ctrlKey || e.metaKey) return 'send';
  if (e.shiftKey || e.altKey) return 'newline';
  return desktop ? 'send' : 'newline';
};

export const COMPOSER_MAX_PX = 144; // ~6 lignes puis le champ défile

// Le champ grandit avec le texte, puis défile.
export const growTo = (el: { style: { height: string }; scrollHeight: number }, minPx: number, maxPx = COMPOSER_MAX_PX): number => {
  el.style.height = 'auto';
  const h = Math.max(minPx, Math.min(el.scrollHeight, maxPx));
  el.style.height = `${h}px`;
  return h;
};

export const useAutoGrow = (ref: RefObject<HTMLTextAreaElement | null>, value: string, minPx: number, maxPx = COMPOSER_MAX_PX): void => {
  useEffect(() => { if (ref.current) growTo(ref.current, minPx, maxPx); }, [ref, value, minPx, maxPx]);
};
