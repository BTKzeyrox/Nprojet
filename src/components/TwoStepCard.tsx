import React, { useEffect, useState } from 'react';
import { ShieldCheck, Copy, Download } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { prettySecret } from '../utils/totp';

// Sécurité en deux étapes (module 16, M16.4) : carte des Réglages, pour le responsable et le Comptable seulement (le serveur décide).
// Le secret est montré UNE fois, au moment de l'ajouter dans l'appli d'authentification ; les codes de secours aussi.
type Step = 'idle' | 'password' | 'scan' | 'codes' | 'off' | 'new-codes';
const input = 'w-full min-h-[44px] bg-[#141e2a] border border-slate-600 rounded-lg px-3 text-white text-sm focus:border-emerald-500 focus:outline-none';
const btn = 'min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-100 text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50';
const btnMain = 'min-h-[44px] px-4 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50';

export const TwoStepCard: React.FC = () => {
  const { lang } = useApp();
  const en = lang === 'en';
  const t = (fr: string, e: string) => (en ? e : fr);
  const [status, setStatus] = useState<{ eligible: boolean; enabled: boolean; backup_left: number } | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await db.totpStatus();
    if (r.ok) setStatus({ eligible: !!r.data.eligible, enabled: !!r.data.enabled, backup_left: Number(r.data.backup_left) || 0 });
  };
  useEffect(() => { void load(); }, []);

  if (!status?.eligible) return null;
  const reset = () => { setStep('idle'); setPw(''); setCode(''); setErr(''); setSecret(''); setUri(''); };
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } finally { setBusy(false); } };

  const start = () => run(async () => {
    const r = await db.totpStart(pw);
    if (!r.ok) { setErr(r.error || ''); return; }
    setSecret(String(r.data.secret)); setUri(String(r.data.uri)); setPw(''); setStep('scan');
  });
  const enable = () => run(async () => {
    const r = await db.totpEnable(code);
    if (!r.ok) { setErr(r.error || ''); return; }
    setCodes(r.data.backup_codes || []); setSecret(''); setUri(''); setCode(''); setStep('codes'); void load();
  });
  const disable = () => run(async () => {
    const r = await db.totpDisable(pw, code);
    if (!r.ok) { setErr(r.error || ''); return; }
    reset(); void load();
  });
  const newCodes = () => run(async () => {
    const r = await db.totpNewBackup(pw, code);
    if (!r.ok) { setErr(r.error || ''); return; }
    setCodes(r.data.backup_codes || []); setPw(''); setCode(''); setStep('codes'); void load();
  });
  const copyCodes = () => { try { void navigator.clipboard.writeText(codes.join('\n')); } catch { /* le bouton Télécharger reste */ } };
  const downloadCodes = () => {
    const blob = new Blob([`Gestion Pro : codes de secours (chacun ne sert qu'une fois)\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'codes-de-secours.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" {...(en ? { 'data-notranslate': '' } : {})}>
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" />{t('Sécurité en deux étapes', 'Two-step sign-in')}</h3>
      <p className="text-[11px] text-slate-400">{t("Facultatif. Après ton mot de passe, le site demande un code à 6 chiffres donné par une application sur ton téléphone (Google Authenticator, Microsoft Authenticator, Aegis…).", 'Optional. After your password, the site asks for a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Aegis…).')}</p>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}

      {step === 'idle' && !status.enabled && <button type="button" className={btnMain} onClick={() => setStep('password')}>{t('Activer', 'Turn on')}</button>}
      {step === 'idle' && status.enabled && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-300">{t('Active.', 'On.')} {t(`Codes de secours restants : ${status.backup_left}.`, `Backup codes left: ${status.backup_left}.`)}</p>
          {status.backup_left <= 2 && <p className="text-[12px] text-amber-300">{t('Presque plus de codes de secours : fais-en de nouveaux.', 'Few backup codes left: make new ones.')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setStep('new-codes')}>{t('Nouveaux codes de secours', 'New backup codes')}</button>
            <button type="button" className={btn} onClick={() => setStep('off')}>{t('Désactiver', 'Turn off')}</button>
          </div>
        </div>
      )}

      {step === 'password' && (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void start(); }}>
          <label className="block text-xs text-slate-300">{t('Ton mot de passe, pour confirmer', 'Your password, to confirm')}</label>
          <input className={input} type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
          <div className="flex gap-2"><button type="submit" className={btnMain} disabled={busy || !pw}>{t('Continuer', 'Continue')}</button><button type="button" className={btn} onClick={reset}>{t('Annuler', 'Cancel')}</button></div>
        </form>
      )}

      {step === 'scan' && (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void enable(); }}>
          <p className="text-sm text-slate-200">{t("1. Dans ton application d'authentification, ajoute un compte avec cette clé :", '1. In your authenticator app, add an account with this key:')}</p>
          <p className="font-mono text-base text-white bg-[#141e2a] rounded-lg p-3 break-all select-all">{prettySecret(secret)}</p>
          <a href={uri} className={btn}>{t("Ouvrir dans l'application", 'Open in the app')}</a>
          <p className="text-sm text-slate-200">{t("2. Tape ici le code à 6 chiffres qu'elle affiche :", '2. Type the 6-digit code it shows:')}</p>
          <input className={input} inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)} placeholder="123456" />
          <div className="flex gap-2"><button type="submit" className={btnMain} disabled={busy || code.replace(/\s/g, '').length < 6}>{t('Activer', 'Turn on')}</button><button type="button" className={btn} onClick={reset}>{t('Annuler', 'Cancel')}</button></div>
        </form>
      )}

      {step === 'codes' && (
        <div className="space-y-3">
          <p className="text-sm text-amber-200">{t("Garde ces codes de secours en lieu sûr. Chacun ne sert qu'une fois, si tu perds ton téléphone. Ils ne seront plus montrés.", "Keep these backup codes somewhere safe. Each works once, if you lose your phone. They won't be shown again.")}</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-white bg-[#141e2a] rounded-lg p-3 select-all">{codes.map(c => <li key={c}>{c}</li>)}</ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={copyCodes}><Copy className="w-4 h-4" />{t('Copier', 'Copy')}</button>
            <button type="button" className={btn} onClick={downloadCodes}><Download className="w-4 h-4" />{t('Télécharger', 'Download')}</button>
            <button type="button" className={btnMain} onClick={() => { setCodes([]); reset(); }}>{t("C'est noté", 'Done')}</button>
          </div>
        </div>
      )}

      {(step === 'off' || step === 'new-codes') && (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void (step === 'off' ? disable() : newCodes()); }}>
          <label className="block text-xs text-slate-300">{t('Ton mot de passe', 'Your password')}</label>
          <input className={input} type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
          <label className="block text-xs text-slate-300">{t("Un code de l'application (ou un code de secours)", 'A code from the app (or a backup code)')}</label>
          <input className={input} autoComplete="one-time-code" autoCapitalize="off" value={code} onChange={e => setCode(e.target.value)} />
          <div className="flex gap-2"><button type="submit" className={btnMain} disabled={busy || !pw || !code}>{step === 'off' ? t('Désactiver', 'Turn off') : t('Faire de nouveaux codes', 'Make new codes')}</button><button type="button" className={btn} onClick={reset}>{t('Annuler', 'Cancel')}</button></div>
        </form>
      )}
    </section>
  );
};
