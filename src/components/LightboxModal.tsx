import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, ShieldCheck, ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { formatScoreM } from '../utils/formatUtils';
import { downloadFile } from '../utils/attachments';

interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  gallery?: string[]; // toutes les preuves de la session (précédent / suivant)
  names?: string[]; // noms de fichier, dans le même ordre que gallery (pour Télécharger)
  title?: string;
  subtitle?: string;
  score?: number;
  clientTag?: string;
  operatorName?: string;
  timestamp?: string;
  canDelete?: (url: string) => boolean; // affiche « Supprimer » pour l'image affichée
  onDelete?: (url: string) => void;
}

const MIN = 1;
const MAX = 6;
const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));

export const LightboxModal: React.FC<LightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  gallery,
  names,
  title = "Justificatif - Gestion Pro",
  subtitle,
  score,
  clientTag,
  operatorName,
  timestamp,
  canDelete,
  onDelete,
}) => {
  const imgs = gallery && gallery.length > 0 ? gallery : [imageUrl];
  const startIdx = Math.max(0, imgs.indexOf(imageUrl));
  const [idx, setIdx] = useState(startIdx);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const pts = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef(0);
  const lastTap = useRef(0);

  useLockBodyScroll(isOpen);

  const resetView = () => setView({ s: 1, x: 0, y: 0 });
  const zoomBy = (factor: number) =>
    setView(v => {
      const s = clampScale(v.s * factor);
      return s === MIN ? { s, x: 0, y: 0 } : { ...v, s };
    });
  const go = (d: number) => {
    setIdx(i => (i + d + imgs.length) % imgs.length);
    resetView();
  };

  // Ouverture : on se place sur l'image cliquée
  useEffect(() => {
    if (isOpen) {
      setIdx(startIdx);
      resetView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, imageUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && imgs.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && imgs.length > 1) go(1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.3);
      else if (e.key === '-') zoomBy(1 / 1.3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, imgs.length]);

  if (!isOpen) return null;
  const current = imgs[idx] || imageUrl;

  const onWheel = (e: React.WheelEvent) => zoomBy(Math.exp(-e.deltaY * 0.0015));

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = Array.from(pts.current.values());
      lastDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    } else if (pts.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        // double-tap : zoom 2.5x ou retour à 100 %
        setView(v => (v.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      setDragging(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = Array.from(pts.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist.current > 0 && dist > 0) zoomBy(dist / lastDist.current);
      lastDist.current = dist;
    } else if (pts.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setView(v => (v.s > 1 ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) lastDist.current = 0;
    if (pts.current.size === 0) setDragging(false);
  };

  const round = 'w-11 h-11 rounded-full flex items-center justify-center bg-white/12 hover:bg-white/25 backdrop-blur text-white cursor-pointer transition-colors shrink-0';
  const info = [
    operatorName && { k: 'Opérateur', v: operatorName },
    clientTag && { k: 'Mission', v: clientTag },
    score !== undefined && { k: 'Quantité vérifiée', v: formatScoreM(score) },
    timestamp && { k: 'Horodatage', v: timestamp },
  ].filter(Boolean) as { k: string; v: string }[];

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black" role="dialog" aria-modal="true">
      {/* Image plein écran : pincement, molette, double-tap, déplacement */}
      <div
        className="absolute inset-0 overflow-hidden flex items-center justify-center select-none"
        style={{ touchAction: 'none', cursor: view.s > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={current}
          alt="Justificatif"
          draggable={false}
          className="max-h-full max-w-full object-contain pointer-events-none"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />
        {imgs.length > 1 && (
          <>
            <button type="button" onClick={e => { e.stopPropagation(); go(-1); }} onPointerDown={e => e.stopPropagation()} className={`${round} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Précédent"><ChevronLeft className="w-6 h-6" /></button>
            <button type="button" onClick={e => { e.stopPropagation(); go(1); }} onPointerDown={e => e.stopPropagation()} className={`${round} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Suivant"><ChevronRight className="w-6 h-6" /></button>
          </>
        )}
      </div>

      {/* Haut : fermer, titre, actions (flottants sur l'image) */}
      <header className="absolute top-0 inset-x-0 flex items-center gap-3 px-3 pb-6 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <button type="button" onClick={onClose} className={`${round} pointer-events-auto`} title="Fermer (ESC)" aria-label="Fermer"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-white/70 truncate leading-tight">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {onDelete && (!canDelete || canDelete(current)) && (
            <button type="button" onClick={() => onDelete(current)} className={`${round} !bg-red-600/80 hover:!bg-red-600`} title="Supprimer" aria-label="Supprimer"><Trash2 className="w-5 h-5" /></button>
          )}
          <a href={current} download={names?.[idx] || 'photo.png'} onClick={e => { if (names?.[idx]) { e.preventDefault(); void downloadFile(current, names[idx]); } }} className={round} title="Télécharger" aria-label="Télécharger"><Download className="w-5 h-5" /></a>
        </div>
      </header>

      {/* Bas : compteur, zoom (ordinateur) et infos */}
      <footer className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-2 px-3 pt-8 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
        {info.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-4 py-2 rounded-2xl bg-white/12 backdrop-blur text-xs text-white">
            {info.map(i => (<span key={i.k}><span className="text-white/60">{i.k} : </span><span className="font-semibold">{i.v}</span></span>))}
          </div>
        )}
        <div className="flex items-center gap-2 pointer-events-auto">
          {imgs.length > 1 && <span className="px-3 py-1.5 rounded-full bg-white/12 backdrop-blur text-xs font-semibold text-white">{idx + 1} / {imgs.length}</span>}
          <div className="hidden sm:flex items-center rounded-full bg-white/12 backdrop-blur text-white">
            <button type="button" onClick={() => zoomBy(1 / 1.3)} className="p-2.5 rounded-full hover:bg-white/20 cursor-pointer" title="Zoom arrière"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-[11px] font-mono px-1 min-w-11 text-center">{Math.round(view.s * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.3)} className="p-2.5 rounded-full hover:bg-white/20 cursor-pointer" title="Zoom avant"><ZoomIn className="w-4 h-4" /></button>
            <button type="button" onClick={resetView} className="p-2.5 rounded-full hover:bg-white/20 cursor-pointer" title="100 %"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>
      </footer>
      <div className="hidden"><ShieldCheck /><X /></div>
    </div>,
    document.body
  );
};
