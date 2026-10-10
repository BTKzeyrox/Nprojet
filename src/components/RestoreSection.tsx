import React, { useEffect, useState } from 'react';
import { Download, Mail, RotateCcw, ShieldAlert } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { downloadBackupExcel } from '../utils/backupExcel';

type Step = 'idle' | 'warn' | 'code';

const btn = 'w-full min-h-[46px] px-4 text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const inputCls = 'w-full bg-[#0d1622] border border-slate-600 p-2.5 text-white text-sm';

/** Restauration du site (remise à zéro) : Gmail vérifié, 2 confirmations, code reçu par mail. */
export const RestoreSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [mailCodeSent, setMailCodeSent] = useState(false);
  const [mailCode, setMailCode] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [word, setWord] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    db.restoreStatus().then(r => {
      if (r.ok) { setSavedEmail(r.data?.email || ''); setEmail(r.data?.email || ''); setVerified(!!r.data?.verified); }
    });
  }, []);

  const say = (text: string, ok = false) => setMsg({ text, ok });

  const saveEmail = async () => {
    setBusy(true); setMsg(null);
    const r = await db.restoreSetEmail(email.trim());
    setBusy(false);
    if (!r.ok) return say(r.error || 'Erreur.');
    setSavedEmail(email.trim().toLowerCase()); setVerified(false); setMailCodeSent(true);
    say('Code envoyé. Regardez votre boîte Gmail (et les spams).', true);
  };
  const verifyEmail = async () => {
    setBusy(true); setMsg(null);
    const r = await db.restoreVerifyEmail(mailCode);
    setBusy(false);
    if (!r.ok) return say(r.error || 'Code incorrect.');
    setVerified(true); setMailCodeSent(false); setMailCode('');
    say('Adresse Gmail vérifiée.', true);
  };
  const backup = async () => {
    setMsg(null);
    try { await downloadBackupExcel(); say('Sauvegarde téléchargée.', true); } catch { say("La sauvegarde n'a pas pu être créée."); }
  };
  const askResetCode = async () => {
    setBusy(true); setMsg(null);
    const r = await db.restoreSendCode();
    setBusy(false);
    if (!r.ok) return say(r.error || 'Erreur.');
    setStep('code'); say('Code envoyé sur votre Gmail.', true);
  };
  const execute = async () => {
    setBusy(true); setMsg(null);
    const r = await db.restoreExecute(resetCode);
    setBusy(false);
    if (!r.ok) return say(r.error || 'Erreur.');
    say('Remise à zéro terminée. Rechargement…', true);
    setTimeout(() => window.location.reload(), 1200);
  };

  return (
    <section className="bg-[#0f1722] border border-red-900/60 p-4 space-y-4">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-red-400" /> Restauration du site
      </h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        La restauration est une <b className="text-red-300">remise à zéro définitive</b> : elle efface tous les boosters, sessions, historiques,
        avances, paies et messages. Elle garde votre compte admin, les Réglages et les postes (scores remis au début).
        Téléchargez d'abord une sauvegarde.
      </p>

      <button type="button" onClick={backup} className={`${btn} bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-200`}>
        <Download className="w-4 h-4" /> Sauvegarder (Excel)
      </button>

      {/* 1. Gmail de l'admin */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <label className="text-[11px] uppercase text-slate-300 font-bold flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-cyan-400" /> Gmail de l'administrateur {verified && <span className="text-emerald-400">· vérifié</span>}
        </label>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@gmail.com" className={inputCls} />
        {(!verified || email.trim().toLowerCase() !== savedEmail) && (
          <button type="button" disabled={busy || !email.trim()} onClick={saveEmail} className={`${btn} bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white`}>
            {savedEmail && !verified ? 'Renvoyer le code de vérification' : 'Enregistrer et envoyer le code'}
          </button>
        )}
        {(mailCodeSent || (savedEmail && !verified)) && (
          <div className="flex gap-2">
            <input inputMode="numeric" maxLength={6} value={mailCode} onChange={e => setMailCode(e.target.value.replace(/\D/g, ''))} placeholder="Code à 6 chiffres" className={inputCls} />
            <button type="button" disabled={busy || mailCode.length !== 6} onClick={verifyEmail} className="px-4 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">Vérifier</button>
          </div>
        )}
      </div>

      {/* 2. Restauration : 2 confirmations puis code par mail */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <button
          type="button"
          disabled={!verified || busy}
          onClick={() => { setStep('warn'); setWord(''); setResetCode(''); setMsg(null); }}
          className={`${btn} bg-red-950/70 hover:bg-red-900 border border-red-700 text-red-200`}
        >
          <ShieldAlert className="w-4 h-4" /> Restaurer le site (remise à zéro)
        </button>
        {!verified && <p className="text-[11px] text-amber-300">Enregistrez et vérifiez votre Gmail pour activer ce bouton.</p>}

        {step === 'warn' && (
          <div className="border border-red-700 bg-red-950/30 p-3 space-y-2">
            <p className="text-xs text-red-200 font-bold">Confirmation 1 sur 2</p>
            <p className="text-[11px] text-slate-300">Tout sera effacé, sans retour possible. Écrivez le mot <b>RESTAURER</b> pour continuer.</p>
            <input value={word} onChange={e => setWord(e.target.value)} placeholder="RESTAURER" autoCapitalize="characters" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep('idle')} className={`${btn} bg-slate-800 border border-slate-600 text-slate-200`}>Annuler</button>
              <button
                type="button"
                disabled={word.trim() !== 'RESTAURER' || busy}
                onClick={() =>
                  askConfirm({
                    title: 'Dernière chance',
                    message: 'Confirmation 2 sur 2 : tous les boosters, sessions, historiques, avances, paies et messages seront effacés pour toujours. Un code va être envoyé sur votre Gmail.',
                    confirmLabel: 'Oui, envoyer le code',
                    danger: true,
                    onConfirm: askResetCode,
                  })
                }
                className={`${btn} bg-red-700 hover:bg-red-600 text-white`}
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {step === 'code' && (
          <div className="border border-red-700 bg-red-950/30 p-3 space-y-2">
            <p className="text-xs text-red-200 font-bold">Code reçu par mail</p>
            <p className="text-[11px] text-slate-300">Entrez le code à 6 chiffres envoyé à {savedEmail}. Il est valable 10 minutes.</p>
            <input inputMode="numeric" maxLength={6} value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))} placeholder="Code à 6 chiffres" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep('idle')} className={`${btn} bg-slate-800 border border-slate-600 text-slate-200`}>Annuler</button>
              <button type="button" disabled={resetCode.length !== 6 || busy} onClick={execute} className={`${btn} bg-red-700 hover:bg-red-600 text-white`}>
                Effacer et restaurer
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <div className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{msg.text}</div>}
    </section>
  );
};
