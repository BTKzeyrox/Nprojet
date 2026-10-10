import { db } from '../db/store';
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, Terminal, Zap, CheckCircle2, Crosshair } from 'lucide-react';
import { User } from '../types';

interface WelcomeAnimationProps {
  user: User;
  onComplete: () => void;
}

export const WelcomeAnimation: React.FC<WelcomeAnimationProps> = ({ user, onComplete }) => {
  const [progress, setProgress] = useState(15);
  const [stepText, setStepText] = useState('DÉCRYPTAGE DU PROTOCOLE HAWK OPS...');
  const [glitchActive, setGlitchActive] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(40);
      setStepText(`AUTHENTIFICATION VALIDÉE : ${user.name.toUpperCase()}`);
    }, 300);

    const t2 = setTimeout(() => {
      setProgress(75);
      setStepText(`DÉPLOIEMENT DE LA MATRICE DES ${db.getContracts().length || 20} POSTES CLIENTS...`);
      setGlitchActive(true);
    }, 700);

    const t3 = setTimeout(() => {
      setProgress(100);
      setStepText('SYSTÈME OPÉRATIONNEL · BIENVENUE AU QG !');
      setGlitchActive(false);
    }, 1100);

    const t4 = setTimeout(() => {
      onComplete();
    }, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [user, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b10]/95 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Background Matrix/Radar Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px]" />
      
      <div className="relative w-full max-w-md p-8 bg-[#0b121c]/90 border border-emerald-500/40 rounded-2xl shadow-[0_0_50px_rgba(16,185,129,0.25)] text-center overflow-hidden">
        {/* Ambient Top Light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
        
        {/* Central Tactical Icon */}
        <div className="relative mx-auto w-20 h-20 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping opacity-60" />
          <div className="absolute inset-2 rounded-full border border-dashed border-emerald-400/60 animate-spin" style={{ animationDuration: '8s' }} />
          <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-950 to-slate-900 border border-emerald-500/50 flex items-center justify-center shadow-lg">
            <Crosshair className={`w-8 h-8 text-emerald-400 ${glitchActive ? 'scale-110 text-cyan-400' : 'transition-transform'}`} />
          </div>
        </div>

        {/* User Role & Name Greeting */}
        <div className="space-y-1 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>SESSION {user.role === 'admin' ? 'SUPERVISEUR ADMIN' : `BOOSTER SHIFT ${user.shift.toUpperCase()}`}</span>
          </div>

          <h2 className="text-2xl font-tactical font-black text-white tracking-wider mt-2">
            BIENVENUE, {user.name.toUpperCase()}
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Delta Force : Hawk Ops · Centre de Boosting Sécurisé
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 text-left">
          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
            <span className="truncate pr-2 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {stepText}
            </span>
            <span className="font-bold shrink-0">{progress}%</span>
          </div>

          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
            <span>GRILLE {db.getContracts().length || 20} POSTES</span>
            <span className="text-emerald-500">SYNCHRONISÉ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
