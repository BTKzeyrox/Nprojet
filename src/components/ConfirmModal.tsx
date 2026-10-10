import React, { useCallback, useEffect, useState } from 'react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmModalProps {
  options: ConfirmOptions | null;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ options, onClose }) => {
  useLockBodyScroll(!!options);
  if (!options) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm bg-[#0d1624] border border-slate-600 p-5 space-y-4 text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-6 h-6 shrink-0 ${options.danger ? 'text-red-400' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <h3 className="font-tactical font-bold text-base leading-snug">{options.title}</h3>
            {options.message && <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{options.message}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold"
          >
            {options.cancelLabel || 'Annuler'}
          </button>
          <button
            type="button"
            onClick={() => {
              const fn = options.onConfirm;
              onClose();
              fn();
            }}
            className={`px-3 py-2.5 text-sm font-bold text-white ${
              options.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {options.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Utilisation : const { ask, node } = useConfirm();  ask({ title, message, onConfirm });  puis afficher {node}
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const ask = useCallback((o: ConfirmOptions) => setOptions(o), []);
  const node = <ConfirmModal options={options} onClose={() => setOptions(null)} />;
  return { ask, node };
}

// Version globale : un seul <ConfirmHost /> dans App, puis askConfirm({...}) depuis n'importe où
let hostListener: ((o: ConfirmOptions) => void) | null = null;

export const askConfirm = (o: ConfirmOptions) => {
  if (hostListener) hostListener(o);
  else if (window.confirm(o.title)) o.onConfirm();
};

export const ConfirmHost: React.FC = () => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  useEffect(() => {
    hostListener = setOptions;
    return () => {
      hostListener = null;
    };
  }, []);
  return <ConfirmModal options={options} onClose={() => setOptions(null)} />;
};
