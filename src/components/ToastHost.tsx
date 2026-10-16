import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';
const EVENT = 'df:toast';

/** Affiche une petite notification arrondie en bas de l'écran (remplace aussi les fenêtres alert() du navigateur). */
export function showToast(message: string, type: ToastType = 'info') {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

export const ToastHost: React.FC = () => {
  const [t, setT] = useState<{ message: string; type: ToastType; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; type: ToastType }>).detail;
      if (!d?.message) return;
      window.clearTimeout(timer.current);
      setT({ ...d, id: Date.now() });
      timer.current = window.setTimeout(() => setT(null), d.type === 'error' ? 6000 : 3800);
    };
    window.addEventListener(EVENT, on);
    // Les alert() du navigateur (rectangle gris, bloquant) deviennent des notifications arrondies
    const nativeAlert = window.alert;
    window.alert = (msg?: unknown) => {
      const text = String(msg ?? '');
      const bad = /impossible|erreur|invalide|échec|refus|trop|doit|incorrect|interdit|non /i.test(text);
      showToast(text, bad ? 'error' : 'info');
    };
    return () => {
      window.removeEventListener(EVENT, on);
      window.alert = nativeAlert;
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!t) return null;
  const tone = t.type === 'success' ? 'bg-emerald-600' : t.type === 'error' ? 'bg-red-600' : 'bg-[#0b2a4a]';
  const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertTriangle : Info;
  return (
    <div
      className="fixed left-0 right-0 z-[10000] flex justify-center px-3 pointer-events-none"
      style={{ bottom: 'calc(var(--bnh, 0px) + env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <div key={t.id} className={`pointer-events-auto max-w-[92vw] sm:max-w-md flex items-center gap-2.5 pl-4 pr-2 py-2.5 rounded-full text-white text-sm font-medium shadow-xl ${tone}`} role="status">
        <Icon className="w-5 h-5 shrink-0" />
        <span className="min-w-0 break-words leading-snug">{t.message}</span>
        <button type="button" onClick={() => setT(null)} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 cursor-pointer" aria-label="Fermer"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};
