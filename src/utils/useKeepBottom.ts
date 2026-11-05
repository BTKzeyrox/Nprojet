// Garde le dernier message visible quand le clavier s'ouvre (BTK 2026-11-05 : « quand je tape, le clavier s'ouvre et le message remonte, il est coupé »).
// Quand on touche le champ de saisie et qu'on était en bas, on « colle » la liste en bas pendant ~1,2 s : le clavier met du temps à finir de monter,
// et à chaque changement de taille (visualViewport, fenêtre, la liste elle-même) on redescend. Si on avait remonté lire d'anciens messages, rien ne bouge.
import { useEffect, useRef } from 'react';

export const PIN_MS = 1200;
export const PIN_TICKS = [60, 150, 300, 500, 800, 1100];

export function useKeepBottom(getEl: () => HTMLElement | null, isAtBottom: () => boolean, dep: unknown) {
  const pinUntil = useRef(0);
  const getRef = useRef(getEl); getRef.current = getEl;
  const stick = () => { const el = getRef.current(); if (el) el.scrollTop = el.scrollHeight; };
  useEffect(() => {
    const on = () => { if (Date.now() < pinUntil.current) stick(); };
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', on); vv?.addEventListener('scroll', on); window.addEventListener('resize', on);
    const el = getRef.current();
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(on) : null;
    if (el && ro) ro.observe(el);
    return () => { vv?.removeEventListener('resize', on); vv?.removeEventListener('scroll', on); window.removeEventListener('resize', on); ro?.disconnect(); };
  }, [dep]); // eslint-disable-line react-hooks/exhaustive-deps
  /** À appeler quand le champ de saisie reçoit le focus. */
  const pin = () => {
    if (!isAtBottom()) return;
    pinUntil.current = Date.now() + PIN_MS;
    stick();
    PIN_TICKS.forEach(ms => setTimeout(() => { if (Date.now() < pinUntil.current) stick(); }, ms));
  };
  /** Vrai pendant que le clavier monte : un faux « défilement » dû au redimensionnement ne doit pas compter comme « j'ai remonté ». */
  const pinned = () => Date.now() < pinUntil.current;
  return { pin, pinned };
}
