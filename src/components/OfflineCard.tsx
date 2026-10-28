import React, { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { copyLine, pick } from '../utils/offlineText';
import { askConfirm } from './ConfirmModal';
import { showToast } from './ToastHost';
import { PinForm } from './OfflinePin';
import { openOfflineCenter } from './OfflineCenter';

/** Réglages > Travail hors ligne : état de la copie sur cet appareil, code de verrouillage, actions en attente, effacer la copie. */
export const OfflineCard: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  const [form, setForm] = useState<null | 'change'>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => { const id = setInterval(() => force(n => n + 1), 2000); return () => clearInterval(id); }, []);

  const st = db.getOfflineStatus();
  const un = db.getUnsent();
  const btn = 'px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer disabled:opacity-50';
  const operator = st.role === 'employee';
  const broken = st.problem === 'corrupt' || st.problem === 'queue_corrupt';

  const erase = () => askConfirm({
    title: t('Effacer la copie de cet appareil ?', 'Erase the copy on this device?'),
    message: t('Les données du serveur ne sont pas touchées. Mais les actions en attente gardées ici (pas encore envoyées) seront perdues pour toujours.', 'Server data is not touched. But actions waiting here (not yet sent) will be lost for good.'),
    confirmLabel: t('Effacer', 'Erase'), cancelLabel: t('Garder', 'Keep'), danger: true,
    onConfirm: () => { void db.offlineEraseLocal().then(() => { setForm(null); showToast(t('Copie effacée.', 'Copy erased.'), 'info'); }); },
  });
  const removeCode = () => askConfirm({
    title: t('Retirer le code ?', 'Remove the code?'),
    message: t('La copie sur cet appareil ne sera plus chiffrée : toute personne qui ouvre ce téléphone pourra la lire.', 'The copy on this device will no longer be encrypted: anyone who opens this phone can read it.'),
    confirmLabel: t('Retirer le code', 'Remove the code'), cancelLabel: t('Garder le code', 'Keep the code'), danger: true,
    onConfirm: () => { void db.offlineRemovePin().then(r => setMsg(r.ok ? t('Code retiré.', 'Code removed.') : pick(r.why, lang))); },
  });

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-testid="offline-card">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><CloudOff className="w-4 h-4 text-emerald-400" />{t('Travail hors ligne', 'Offline work')}</h3>
      <p className="text-[11px] text-slate-400">{t('Quand le réseau est coupé, tu continues à travailler. Tout est gardé sur cet appareil, puis envoyé une seule fois au retour du réseau.', 'When the network is down you keep working. Everything is kept on this device, then sent once when the network returns.')}</p>

      {(
        <>
          <p className="text-sm text-slate-200" data-testid="offline-copy-line">{copyLine(st, lang)}</p>
          {st.can_offline && st.copy_saved_at && !st.locked && <p className="text-[11px] text-slate-400">{t('Dernière copie des données : ', 'Last copy of the data: ')}{new Date(st.copy_saved_at).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
          {st.can_offline && <p className="text-[11px] text-slate-400">{st.role === 'admin'
            ? t('Gardés : missions, messages, clients, stock, Actualités, tableaux. Jamais gardés : paiements, paie, avances, achats, factures émises, mots de passe.', 'Kept: missions, messages, clients, stock, news, sheets. Never kept: payments, payroll, advances, purchases, issued invoices, passwords.')
            : t('Gardés : tes missions, tes messages, tes tableaux. Jamais l\'argent.', 'Kept: your missions, messages and sheets. Never money.')}</p>}
          {st.can_offline && st.role === 'admin' && <p className="text-[11px] text-slate-400">{t('Ton code protège l\'accès à la copie et la chiffre. Si tu l\'oublies, la copie est illisible : tu te reconnectes en ligne et tu retrouves tes données, mais les actions en attente de cet appareil sont perdues.', 'Your code protects and encrypts the copy. If you forget it the copy is unreadable: you sign in online and get your data back, but actions waiting on this device are lost.')}</p>}

          {st.locked && !broken && <PinForm mode="unlock" />}
          {st.needs_code && <PinForm mode="create" label={t('Activer avec ce code', 'Turn on with this code')} onDone={() => setMsg(t('Activé : la copie est chiffrée avec ton code.', 'On: the copy is encrypted with your code.'))} />}

          {st.enabled && st.can_offline && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openOfflineCenter('pending')} className={`${btn} bg-blue-600 border-blue-500 text-white`}>{t(`Actions en attente (${un.count}) et à revoir (${st.review.length})`, `Waiting actions (${un.count}) and to review (${st.review.length})`)}</button>
              <button type="button" onClick={() => setForm(form ? null : 'change')} className={`${btn} border-slate-600 text-slate-200`}>{st.encrypted ? t('Changer le code', 'Change the code') : t('Ajouter un code', 'Add a code')}</button>
              {operator && st.encrypted && <button type="button" onClick={removeCode} className={`${btn} border-slate-600 text-slate-200`}>{t('Retirer le code', 'Remove the code')}</button>}
            </div>
          )}
          {form === 'change' && st.enabled && <PinForm mode="change" onDone={() => { setForm(null); setMsg(t('Code enregistré. Rien n\'a été perdu.', 'Code saved. Nothing was lost.')); }} />}

          {st.can_offline && (st.has_vault || broken) && (
            <button type="button" onClick={erase} className={`${btn} border-red-500/60 text-red-300`} data-testid="offline-erase">{st.locked ? t('Code oublié : effacer la copie de cet appareil', 'Forgot the code: erase the copy on this device') : t('Effacer la copie de cet appareil', 'Erase the copy on this device')}</button>
          )}
        </>
      )}
      {msg && <p className="text-xs text-emerald-300" role="status">{msg}</p>}
    </section>
  );
};
