import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { disablePush, enablePush, pushEndpoint, pushState, type PushState } from '../utils/push';
import { PUSH_CATS, type PushCat } from '../utils/pushEvents';

/** Réglages > Notifications : recevoir sur ce téléphone les validations, refus et échéances des missions. */
export const NotificationsCard: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [off, setOff] = useState<string[]>([]); // catégories coupées sur cet appareil
  const refresh = () => { void pushState().then(setState); };
  useEffect(refresh, []);
  useEffect(() => { // lit les interrupteurs de cet appareil
    if (state !== 'on') return;
    void pushEndpoint().then(ep => ep ? db.pushPrefs(ep) : null).then(r => { if (r?.ok) setOff(r.off); });
  }, [state]);
  const role = db.getCurrentUser()?.role;
  // Les catégories qui ont un sens pour cette personne (le responsable valide et surveille ; l'opérateur reçoit les réponses à ses demandes)
  const cats: PushCat[] = role === 'admin' ? ['missions', 'validations', 'stock', 'invoices', 'security', 'messages'] : ['missions', 'advances', 'messages'];
  const label = (c: PushCat) => ({ missions: t('Mes missions (validée, refusée, échéances)', 'My missions (approved, refused, deadlines)'), validations: t('À valider (début, fin, avances, inscriptions, profils, mots de passe) et validations en attente', 'To approve (start, end, advances, sign-ups, profiles, passwords) and waiting approvals'), stock: t('Stock épuisé ou bas (par stockage)', 'Out of stock or low stock (per storage)'), invoices: t('Factures en retard', 'Overdue invoices'), advances: t('Réponse à mes avances', 'Answers to my advances'), security: t('Alertes de sécurité', 'Security alerts'), messages: t('Messages reçus', 'Messages received') })[c];
  const toggle = async (c: PushCat) => {
    const next = off.includes(c) ? off.filter(x => x !== c) : [...off, c];
    const ep = await pushEndpoint();
    if (!ep) return;
    setOff(next); // tout de suite à l'écran ; remis comme avant si le serveur refuse
    const r = await db.pushPrefs(ep, next);
    if (r.ok) setOff(r.off); else { setOff(off); setMsg(r.error || ''); }
  };

  const why = (e: string) => e === 'denied' ? t('Notifications refusées dans le navigateur. Autorise-les dans les réglages du site, puis réessaie.', 'Notifications are blocked in the browser. Allow them in the site settings, then try again.')
    : e === 'unsupported' ? t('Ce navigateur ne gère pas les notifications.', 'This browser does not support notifications.') : e;

  const enable = async () => { setBusy(true); setMsg(''); const e = await enablePush(); setMsg(e ? why(e) : ''); setBusy(false); refresh(); };
  const disable = async () => { setBusy(true); setMsg(''); await disablePush(); setBusy(false); refresh(); };
  const test = async () => {
    setBusy(true); setMsg('');
    const r = await db.pushTest();
    setMsg(!r.ok ? (r.error || '') : r.sent > 0 ? t('Notification envoyée : elle arrive dans quelques secondes.', 'Notification sent: it should arrive in a few seconds.') : t('Rien n\'a pu être envoyé. Désactive puis réactive les notifications.', 'Nothing could be sent. Turn notifications off and on again.'));
    setBusy(false);
  };

  const btn = 'px-3 py-2.5 rounded-lg border text-sm font-semibold cursor-pointer disabled:opacity-50';
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-testid="notifications-card">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-400" />{t('Notifications', 'Notifications')}</h3>
      <p className="text-[11px] text-slate-400">{t('Reçois sur cet appareil les mêmes notifications que la cloche, même appli fermée : un clic ouvre le bon endroit. Réglé pour cet appareil seulement. Aucun montant ni texte de message ne s\'affiche sur l\'écran verrouillé.', 'Get the same notifications as the bell on this device, even with the app closed: a tap opens the right place. Set for this device only. No amount or message text is shown on the lock screen.')}</p>
      {state === 'unsupported' && <p className="text-xs text-amber-300">{t('Ce navigateur ne gère pas les notifications.', 'This browser does not support notifications.')}</p>}
      {state === 'ios_install' && <p className="text-xs text-amber-300">{t('Sur iPhone : ouvre le site dans Safari, touche « Partager », puis « Sur l\'écran d\'accueil », et ouvre l\'application depuis l\'écran d\'accueil (iOS 16.4 ou plus).', 'On iPhone: open the site in Safari, tap Share, then Add to Home Screen, and open the app from the home screen (iOS 16.4 or later).')}</p>}
      {state === 'denied' && <p className="text-xs text-amber-300">{why('denied')}</p>}
      {(state === 'off') && <button type="button" disabled={busy} onClick={enable} className={`${btn} bg-emerald-600 border-emerald-500 text-white`}>{t('Activer sur cet appareil', 'Turn on for this device')}</button>}
      {state === 'on' && (
        <>
        <div className="space-y-1" role="group" aria-label={t('Quoi recevoir sur cet appareil', 'What to receive on this device')}>
          {cats.map(c => (
            <label key={c} className="flex items-center gap-2 min-h-[44px] text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={!off.includes(c)} onChange={() => { void toggle(c); }} className="w-5 h-5 accent-emerald-500" />
              {label(c)}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={test} className={`${btn} bg-blue-600 border-blue-500 text-white`}>{t('Envoyer un test', 'Send a test')}</button>
          <button type="button" disabled={busy} onClick={disable} className={`${btn} border-slate-600 text-slate-200`}>{t('Désactiver', 'Turn off')}</button>
        </div>
        </>
      )}
      {msg && <p className="text-xs text-slate-300" role="status">{msg}</p>}
    </section>
  );
};
