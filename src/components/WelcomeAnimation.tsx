import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { User } from '../types';
import { Avatar } from './Avatar';
import { useApp } from '../context/AppContext';

interface WelcomeAnimationProps {
  user: User;
  onComplete: () => void;
}

// Écran de bienvenue après la connexion : carte arrondie sur le même fond bleu que la page de connexion.
export const WelcomeAnimation: React.FC<WelcomeAnimationProps> = ({ user, onComplete }) => {
  const L = useApp().theme === 'light';
  const [progress, setProgress] = useState(15);
  const [stepText, setStepText] = useState('Chargement de votre espace…');

  useEffect(() => {
    const t1 = setTimeout(() => { setProgress(45); setStepText('Connexion validée'); }, 300);
    const t2 = setTimeout(() => { setProgress(80); setStepText('Préparation de vos missions…'); }, 700);
    const t3 = setTimeout(() => { setProgress(100); setStepText('Espace prêt'); }, 1100);
    const t4 = setTimeout(() => { onComplete(); }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [user, onComplete]);

  const firstName = (user.name || '').trim().split(/\s+/)[0] || user.name;
  const bg = L
    ? 'radial-gradient(circle at 0% 0%, rgba(96,165,250,0.40) 0, transparent 38%), radial-gradient(circle at 30% 100%, rgba(37,99,235,0.35) 0, transparent 45%), linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 55%, #3b82f6 100%)'
    : 'radial-gradient(circle at 0% 0%, rgba(59,130,246,0.22) 0, transparent 38%), radial-gradient(circle at 30% 100%, rgba(37,99,235,0.22) 0, transparent 45%), linear-gradient(160deg, #050b18 0%, #0b1a38 55%, #12306b 100%)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: bg }}>
      <div className={`w-full max-w-sm rounded-[28px] px-6 py-8 text-center shadow-xl ${L ? 'bg-white text-slate-900' : 'bg-[#0f1b2d] text-white'}`}>
        <div className="mx-auto w-20 h-20 rounded-full overflow-hidden border-4 border-blue-500/30">
          <Avatar src={user.avatar_url} name={user.name} className="w-full h-full" />
        </div>
        <p className={`mt-4 text-xs font-bold tracking-[0.18em] uppercase ${L ? 'text-blue-600' : 'text-blue-400'}`}>Gestion Pro</p>
        <h2 className="mt-1 text-2xl font-extrabold break-words">Bonjour {firstName}</h2>
        <p className={`text-sm mt-1 ${L ? 'text-slate-500' : 'text-slate-400'}`}>{user.role === 'admin' ? 'Responsable' : 'Opérateur'}</p>

        <div className="mt-6">
          <div className={`h-2.5 w-full rounded-full overflow-hidden ${L ? 'bg-slate-200' : 'bg-white/10'}`}>
            <div className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <div className={`mt-2.5 flex items-center justify-center gap-1.5 text-sm font-medium ${progress === 100 ? 'text-emerald-600' : L ? 'text-slate-600' : 'text-slate-300'}`}>
            {progress === 100 && <CheckCircle2 className="w-4 h-4" />}
            <span>{stepText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
