import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TwoStepDialog } from './TwoStepDialog';
import { setModeSwitchHidden, useModeSwitchHidden } from '../utils/modeSwitch';

// Bouton « Vue opérateur » du menu : l'afficher ou le masquer demande une procédure en 2 étapes
export const ModeSwitchSection: React.FC = () => {
  const L = useApp().theme === 'light';
  const hidden = useModeSwitchHidden();
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-emerald-400" />Mode responsable / opérateur</h3>
      <p className="text-sm text-slate-300">Le bouton « Vue opérateur » du menu de gauche est actuellement <b className={hidden ? 'text-amber-500' : 'text-emerald-500'}>{hidden ? 'masqué' : 'visible'}</b>.</p>
      <p className="text-[11px] text-slate-400">Il permet au responsable de voir le site comme un opérateur. Réglé sur cet appareil. Pour {hidden ? 'l\'afficher' : 'le masquer'}, il faut une procédure en 2 étapes.</p>
      <button type="button" onClick={() => setOpen(true)} className={`w-full min-h-[46px] rounded-lg text-sm font-bold cursor-pointer border ${hidden ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600' : L ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' : 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'}`}>
        {hidden ? 'Afficher le bouton…' : 'Masquer le bouton…'}
      </button>
      {open && (hidden ? (
        <TwoStepDialog
          title="Afficher le bouton « Vue opérateur »"
          intro={['Le bouton « Vue opérateur » reviendra en bas du menu de gauche.', 'Il permet de voir le site comme un opérateur, puis de revenir en mode responsable.']}
          word="AFFICHER"
          confirmLabel="Afficher le bouton"
          onConfirm={() => setModeSwitchHidden(false)}
          onClose={() => setOpen(false)}
        />
      ) : (
        <TwoStepDialog
          title="Masquer le bouton « Vue opérateur »"
          intro={['Le bouton « Vue opérateur » disparaîtra du menu de gauche, sur cet appareil.', 'Si vous êtes en vue opérateur, vous revenez automatiquement en mode responsable.', 'Pour le faire revenir : Réglages, Général, « Afficher le bouton… », puis la même procédure en 2 étapes.']}
          word="MASQUER"
          confirmLabel="Masquer le bouton"
          onConfirm={() => setModeSwitchHidden(true)}
          onClose={() => setOpen(false)}
        />
      ))}
    </section>
  );
};
