import React, { useEffect, useState } from 'react';
import { Lock, WifiOff, RefreshCw } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { PinForm } from './OfflinePin';
import { ConfirmHost, askConfirm } from './ConfirmModal';

/**
 * Écran affiché quand l'appli s'ouvre SANS réseau et que la copie de la personne est protégée par un code (admin : toujours).
 * Le bon code ouvre la dernière copie des données. Tant que le code n'est pas entré, rien n'est lu.
 */
export const OfflineUnlockView: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const retry = async () => {
    setBusy(true); setNote('');
    const ok = await db.retryOnline();
    setBusy(false);
    if (!ok) setNote(t('Toujours pas de réseau.', 'Still no network.'));
  };
  const forgot = () => askConfirm({
    title: t('Code oublié : effacer la copie ?', 'Forgot the code: erase the copy?'),
    message: t('La copie de cet appareil sera effacée, avec les actions en attente qu\'elle contient. Tes données du serveur ne sont pas touchées : tu te reconnectes avec ton mot de passe quand le réseau est là.', 'The copy on this device will be erased, with any waiting actions it contains. Your server data is not touched: you sign in with your password when the network is back.'),
    confirmLabel: t('Effacer la copie', 'Erase the copy'), cancelLabel: t('Annuler', 'Cancel'), danger: true,
    onConfirm: () => { void db.offlineEraseLocal(); },
  });

  return (
    <div className="flex-1 flex items-center justify-center p-4" data-testid="offline-unlock">
      <div className="w-full max-w-sm bg-[#0d1624] border border-slate-600 rounded-2xl p-5 space-y-4 text-slate-100">
        <div className="flex items-start gap-3">
          <Lock className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h1 className="font-tactical font-bold text-lg leading-snug">{t('Ouvrir sans réseau', 'Open without network')}</h1>
            <p className="text-sm text-slate-300 mt-1 flex items-start gap-1.5"><WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />{t('Pas de réseau. Entre ton code pour ouvrir la dernière copie de tes données.', 'No network. Enter your code to open the latest copy of your data.')}</p>
          </div>
        </div>
        <PinForm mode="unlock" autoFocus />
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => void retry()} className="px-3 py-2.5 rounded-lg border border-slate-600 text-slate-200 text-sm font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><RefreshCw className="w-4 h-4" />{t('Réessayer la connexion', 'Try the connection again')}</button>
          {note && <p className="text-xs text-amber-300 text-center" role="status">{note}</p>}
          <button type="button" onClick={forgot} className="px-3 py-2 rounded-lg text-xs text-red-300 cursor-pointer">{t('Code oublié ?', 'Forgot the code?')}</button>
        </div>
      </div>
      <ConfirmHost />
    </div>
  );
};
