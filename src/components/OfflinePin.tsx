import React, { useEffect, useState } from 'react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { pinValid } from '../utils/offline';
import { pick } from '../utils/offlineText';

/**
 * Formulaire du code de verrouillage du mode hors ligne (4 à 8 chiffres).
 * - `unlock` : un champ, ouvre la copie verrouillée ; après des erreurs, une attente s'affiche (rien n'est jamais effacé pour un mauvais code).
 * - `create` / `change` : deux champs (le code et sa confirmation), le code est vérifié avant d'être envoyé.
 */
export const PinForm: React.FC<{ mode: 'unlock' | 'create' | 'change'; onDone?: () => void; label?: string; autoFocus?: boolean }> = ({ mode, onDone, label, autoFocus }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(() => db.getOfflineStatus().wait_seconds);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);
  const submit = async () => {
    if (busy || wait > 0) return;
    setMsg('');
    if (mode !== 'unlock') {
      const v = pinValid(pin);
      if (!v.ok) { setMsg(pick(v.why!, lang)); return; }
      if (pin !== pin2) { setMsg(t('Les deux codes ne sont pas pareils.', 'The two codes do not match.')); return; }
    } else if (pin.length < 4) { setMsg(t('Entre ton code (4 à 8 chiffres).', 'Enter your code (4 to 8 digits).')); return; }
    setBusy(true);
    const r = mode === 'unlock' ? await db.offlineUnlock(pin) : await db.offlineSetPin(pin);
    setBusy(false);
    if (r.ok) { setPin(''); setPin2(''); onDone?.(); return; }
    setPin('');
    if (r.wait_seconds && r.wait_seconds > 0) setWait(r.wait_seconds);
    setMsg(pick(r.why, lang));
  };

  const field = 'w-full rounded-xl bg-[#0b1220] border border-slate-600 px-3 py-2.5 text-white text-center text-lg tracking-[0.4em] outline-none focus:border-emerald-500 disabled:opacity-50';
  return (
    <div className="space-y-2" data-testid="pin-form">
      <label className="block text-xs text-slate-300">
        {mode === 'unlock' ? t('Ton code de verrouillage', 'Your lock code') : mode === 'create' ? t('Choisis un code (4 à 8 chiffres)', 'Choose a code (4 to 8 digits)') : t('Nouveau code (4 à 8 chiffres)', 'New code (4 to 8 digits)')}
        <input type="password" inputMode="numeric" autoComplete="off" autoFocus={autoFocus} maxLength={8} value={pin} disabled={busy || wait > 0}
          onChange={e => setPin(digits(e.target.value))} onKeyDown={e => { if (e.key === 'Enter' && mode === 'unlock') void submit(); }} className={`${field} mt-1`} aria-label={t('Code', 'Code')} />
      </label>
      {mode !== 'unlock' && (
        <label className="block text-xs text-slate-300">
          {t('Le même code, encore une fois', 'The same code, once more')}
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin2} disabled={busy}
            onChange={e => setPin2(digits(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} className={`${field} mt-1`} aria-label={t('Confirmer le code', 'Confirm the code')} />
        </label>
      )}
      {wait > 0 && <p className="text-xs text-amber-300" role="status">{t(`Trop d'erreurs. Réessaie dans ${wait} s.`, `Too many mistakes. Try again in ${wait} s.`)}</p>}
      {msg && wait <= 0 && <p className="text-xs text-red-300" role="alert">{msg}</p>}
      <button type="button" disabled={busy || wait > 0} onClick={() => void submit()} className="w-full px-3 py-2.5 rounded-full border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
        {busy ? t('Un instant…', 'One moment…') : label || (mode === 'unlock' ? t('Ouvrir', 'Open') : t('Enregistrer le code', 'Save the code'))}
      </button>
    </div>
  );
};
