import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, ShieldCheck, ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { formatScoreM } from '../utils/formatUtils';

interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  gallery?: string[]; // toutes les preuves de la session (précédent / suivant)
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
  title = "Capture d'écran de jeu - Delta Force",
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

  const iconBtn = 'p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }} role="dialog" aria-modal="true">
      {/* Barre du haut */}
      <header className="w-full shrink-0 px-2 sm:px-4 py-2.5 bg-[#0a111a]/95 border-b border-slate-800 flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold shrink-0" title="Retour (ESC)">
          <ArrowLeft className="w-4 h-4 text-emerald-400" /> Retour
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h3 className="font-tactical text-xs sm:text-sm font-bold text-white break-words leading-tight">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-400 font-mono break-words leading-tight">{subtitle}</p>}
          {imgs.length > 1 && <p className="text-[11px] text-emerald-300 font-bold mt-0.5">{idx + 1} / {imgs.length}</p>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:flex items-center bg-[#101b28] border border-slate-700">
            <button type="button" onClick={() => zoomBy(1 / 1.3)} className={iconBtn} title="Zoom arrière"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-[11px] font-mono px-1.5 text-slate-300 min-w-11 text-center">{Math.round(view.s * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.3)} className={iconBtn} title="Zoom avant"><ZoomIn className="w-4 h-4" /></button>
            <button type="button" onClick={resetView} className={`${iconBtn} border-l border-slate-700`} title="100 %"><RotateCcw className="w-4 h-4" /></button>
          </div>
          {onDelete && (!canDelete || canDelete(current)) && (
            <button type="button" onClick={() => onDelete(current)} className="flex items-center gap-1.5 px-3 min-h-[40px] bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-bold cursor-pointer" title="Supprimer">
              <Trash2 className="w-4 h-4" /> <span>Supprimer</span>
            </button>
          )}
          <a href={current} download="preuve.png" className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white" title="Télécharger l'image">
            <Download className="w-4 h-4" />
          </a>
          <button type="button" onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white" title="Fermer" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Image : pincement, molette, double-tap, déplacement */}
      <div
        className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center select-none"
        style={{ touchAction: 'none', cursor: view.s > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={current}
          alt="Preuve"
          draggable={false}
          className="max-h-full max-w-full object-contain pointer-events-none"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />

        {imgs.length > 1 && (
          <>
            <button type="button" onClick={e => { e.stopPropagation(); go(-1); }} onPointerDown={e => e.stopPropagation()}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 border border-slate-600 text-white" aria-label="Précédent">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); go(1); }} onPointerDown={e => e.stopPropagation()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 border border-slate-600 text-white" aria-label="Suivant">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Infos */}
      {(score !== undefined || clientTag || operatorName || timestamp) && (
        <footer className="w-full shrink-0 px-4 py-2.5 bg-[#0a111a]/95 border-t border-slate-800 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs font-mono">
          {operatorName && (<div><span className="text-slate-500 uppercase text-[10px] block">Opérateur</span><span className="text-white font-semibold">{operatorName}</span></div>)}
          {clientTag && (<div><span className="text-slate-500 uppercase text-[10px] block">Compte Client</span><span className="text-cyan-400 font-semibold">{clientTag}</span></div>)}
          {score !== undefined && (<div><span className="text-slate-500 uppercase text-[10px] block">Score Vérifié</span><span className="text-emerald-400 font-bold">{formatScoreM(score)}</span></div>)}
          {timestamp && (<div><span className="text-slate-500 uppercase text-[10px] block">Horodatage</span><span className="text-slate-400">{timestamp}</span></div>)}
        </footer>
      )}
      <div className="hidden"><ShieldCheck /></div>
    </div>
  );
};
