import React from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { badgeAccess, usePerformance } from '../utils/usePerformance';
import { forEmployee } from '../utils/performanceScore';
import { PerformanceCard } from './PerformanceBadges';

// « Ma performance » (opérateur) : SON score et SES badges, avec le pourquoi. Jamais ceux des autres, jamais le classement (D8).
// Les points d'attention ET le détail du score (qui montrerait les parties faibles) ne sont montrés que si le responsable l'a choisi dans Conditions (D9, « Non » au départ) : sinon le salarié ne voit que ses réussites.
// L'écran ne reçoit que la fiche de la personne connectée : rien de l'équipe n'est affiché.

export const MyPerformance: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const { res } = usePerformance();
  const me = db.getCurrentUser();
  const access = badgeAccess();
  const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3 max-w-2xl mx-auto';

  if (!me || me.role !== 'employee') return null;
  if (!access.enabled || !access.seesBadges) {
    return <div className={box}><p className="text-sm text-slate-300">{t('Cette page n\'est pas activée pour le moment.', 'This page is not turned on at the moment.')}</p></div>;
  }
  const mine = res.employees.get(me.id);
  if (!mine) return <div className={box}><p className="text-sm text-slate-300">{t('Pas de données pour ton compte.', 'No data for your account.')}</p></div>;

  const shown = access.seesAttention ? mine : forEmployee(mine);
  return (
    <div className={box}>
      <h2 className="font-tactical font-black text-white text-base sm:text-lg">{t('Ma performance', 'My performance')}</h2>
      <PerformanceCard p={shown} cfg={res.cfg} lang={lang} tone="neutral" self showBreakdown={access.seesAttention} />
      <p className="text-[11px] text-slate-500">{t('Ton score et tes badges sont calculés sur tes missions. Seuls toi et le responsable les voient : tu ne vois jamais ceux des autres.', 'Your score and badges are calculated from your missions. Only you and the manager see them: you never see anyone else\'s.')}</p>
    </div>
  );
};
