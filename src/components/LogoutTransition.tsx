import React from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LogoutTransition: React.FC = () => {
  const { isLoggingOut, t, theme } = useApp();

  if (!isLoggingOut) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`p-6 rounded-2xl border shadow-2xl text-center max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200 ${
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-800'
          : 'bg-[#0b121b] border-emerald-500/40 text-white'
      }`}>
        <div className="relative mx-auto w-14 h-14 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping opacity-50" />
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-950 to-slate-900 border border-red-500/40 flex items-center justify-center">
            <LogOut className="w-6 h-6 text-red-400 animate-pulse" />
          </div>
        </div>

        <h3 className="text-base font-tactical font-black tracking-wider uppercase mb-1">
          {t('logging_out')}
        </h3>
        <p className="text-xs font-mono opacity-60">
          DELTA FORCE // HAWK OPS
        </p>

        <div className="mt-4 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-red-500 to-amber-400 animate-[pulse_1s_infinite] w-full" />
        </div>
      </div>
    </div>
  );
};
