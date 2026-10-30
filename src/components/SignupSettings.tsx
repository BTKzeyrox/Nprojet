import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';

/** Réglages > Inscriptions : l'admin ouvre ou ferme « Créer un compte ». Le bouton reste visible pour tout le monde ; fermé, le serveur refuse chaque nouvelle demande. */
export const SignupSettings: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const open = db.getSettings().signup_open !== false;
  const pending = db.getSignupRequests().length;
  const set = (v: boolean) => db.updateSettings({ signup_open: v });
  const btn = 'px-3 py-2.5 rounded-lg border text-sm font-semibold cursor-pointer min-h-[44px]';
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-testid="signup-settings" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><UserPlus className="w-4 h-4 text-emerald-400" />{t('Inscriptions', 'Sign-ups')}</h3>
      <p className="text-[11px] text-slate-400">{t('Le bouton « Créer un compte » reste visible sur la page de connexion. Quand les inscriptions sont fermées, personne ne peut envoyer de nouvelle demande : un message l\'explique. Les demandes déjà reçues restent à décider, et les comptes existants ne changent pas.', 'The “Create an account” button stays visible on the login page. When sign-ups are closed, nobody can send a new request: a message explains why. Requests already received still wait for your decision, and existing accounts do not change.')}</p>
      <p className={`text-sm font-semibold ${open ? 'text-emerald-300' : 'text-amber-300'}`} role="status">{open ? t('Inscriptions ouvertes', 'Sign-ups open') : t('Inscriptions fermées', 'Sign-ups closed')}{pending > 0 ? ` · ${pending} ${t('demande(s) en attente', 'request(s) waiting')}` : ''}</p>
      <div className="flex flex-wrap gap-2">
        {open
          ? <button type="button" onClick={() => set(false)} className={`${btn} bg-[#141e2a] border-amber-600/70 text-amber-300`}>{t('Fermer les inscriptions', 'Close sign-ups')}</button>
          : <button type="button" onClick={() => set(true)} className={`${btn} bg-emerald-600 border-emerald-500 text-white`}>{t('Ouvrir les inscriptions', 'Open sign-ups')}</button>}
      </div>
    </section>
  );
};
