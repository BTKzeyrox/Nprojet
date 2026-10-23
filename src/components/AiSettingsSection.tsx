import React, { useEffect, useState } from 'react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { aiOptIn, setAiOptIn } from '../utils/aiAssist';

/** Réglages > Général : « IA externe pour l'assistant ». Désactivée par défaut, réglée sur cet appareil, avec l'avertissement de confidentialité. */
export const AiSettingsSection: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const uid = db.getCurrentUser()?.id || '';
  const demo = db.isDemo();
  const [on, setOn] = useState(() => aiOptIn(uid));
  const [status, setStatus] = useState<{ configured: boolean; left: number; max: number } | 'error' | null>(null);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    void db.aiCall('status').then(r => { if (alive) setStatus(r.ok ? { configured: !!r.data?.configured, left: Number(r.data?.left ?? 0), max: Number(r.data?.max ?? 20) } : 'error'); });
    return () => { alive = false; };
  }, [demo]);
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-ai-settings>
      <h3 className="font-tactical font-bold text-white">{t('IA externe pour l\'assistant (facultatif)', 'External AI for the assistant (optional)')}</h3>
      <p className="text-sm text-slate-300">{t('Quand l\'assistant ne comprend pas une question, il peut la poser à une IA (Gemini). Sans cette case, rien ne sort du site.', 'When the assistant does not understand a question, it can ask an AI (Gemini). Without this box, nothing leaves the site.')}</p>
      <p className="text-xs text-amber-300 leading-relaxed">{t('Confidentialité : seuls partent votre question et un résumé SANS noms (chiffres globaux). Avec l\'offre gratuite de Google, ces textes peuvent servir à améliorer ses produits et être lus par des relecteurs. N\'écrivez pas de noms, de numéros ni d\'informations sensibles dans vos questions. L\'IA peut se tromper : vérifiez avant d\'agir.', 'Privacy: only your question and a summary WITHOUT names (overall figures) are sent. With Google\'s free plan, these texts may be used to improve its products and be read by reviewers. Do not write names, numbers or sensitive information in your questions. The AI can be wrong: check before acting.')}</p>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-sm text-white">
        <input type="checkbox" className="w-5 h-5" checked={on} disabled={demo} onChange={e => { setOn(e.target.checked); setAiOptIn(uid, e.target.checked); }} />
        {t('Utiliser l\'IA externe sur cet appareil', 'Use the external AI on this device')}
      </label>
      <p className="text-[11px] text-slate-400" data-ai-status>
        {demo ? t('Indisponible en mode démo.', 'Not available in demo mode.')
          : status === null ? t('Vérification du serveur…', 'Checking the server…')
          : status === 'error' ? t('Serveur injoignable pour le moment.', 'Server not reachable right now.')
          : status.configured ? t(`Serveur prêt. Questions IA restantes aujourd'hui : ${status.left} sur ${status.max}.`, `Server ready. AI questions left today: ${status.left} of ${status.max}.`)
          : t('Le serveur n\'a pas encore de clé : l\'IA reste coupée tant qu\'elle n\'est pas ajoutée.', 'The server has no key yet: the AI stays off until it is added.')}
      </p>
    </section>
  );
};
