import React, { useEffect, useState } from 'react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { DossiersSection, DossierView, card } from './DossiersSection';
import { LeavesSection } from './LeavesSection';
import { ReviewsSection } from './ReviewsSection';
import { PlanningSection } from './PlanningSection';
import type { User } from '../../types';

// Page « Ressources humaines » (module 5). Responsable : dossiers + congés. Salarié : mon dossier + mes congés.
export type HrTab = 'dossiers' | 'leaves' | 'reviews' | 'planning';

export const HrPage: React.FC<{ currentUser: User; initialTab?: HrTab }> = ({ currentUser, initialTab }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const isAdmin = currentUser.role === 'admin';
  const [ver, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [tab, setTab] = useState<HrTab>(initialTab ?? (isAdmin ? 'leaves' : 'leaves'));
  const me = db.getUsers().find(u => u.id === currentUser.id) || currentUser;
  const tabBtn = (id: HrTab, fr: string, en: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border px-3 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}>{t(fr, en)}</button>
  );
  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <h1 className="text-base sm:text-lg font-bold text-white">{isAdmin ? t('Ressources humaines', 'Human resources') : t('Mon dossier et mes congés', 'My file and my leave')}</h1>
        <p className="text-[11px] text-slate-400">{isAdmin ? t('Dossiers des salariés et demandes de congé.', 'Employee files and leave requests.') : t('Ton dossier (lecture seule) et tes demandes de congé.', 'Your file (read only) and your leave requests.')}</p>
      </div>
      <div className="flex gap-1.5" role="tablist">
        {tabBtn('leaves', 'Congés', 'Leave')}
        {tabBtn('dossiers', isAdmin ? 'Dossiers' : 'Mon dossier', isAdmin ? 'Files' : 'My file')}
        {tabBtn('planning', 'Planning', 'Schedule')}
        {tabBtn('reviews', 'Évaluations', 'Reviews')}
      </div>
      {tab === 'leaves' && <LeavesSection ver={ver} isAdmin={isAdmin} myId={currentUser.id} />}
      {tab === 'planning' && <PlanningSection ver={ver} isAdmin={isAdmin} myId={currentUser.id} />}
      {tab === 'reviews' && <ReviewsSection ver={ver} isAdmin={isAdmin} myId={currentUser.id} />}
      {tab === 'dossiers' && (isAdmin ? <DossiersSection ver={ver} /> : <div className={card}><DossierView user={me} /></div>)}
    </div>
  );
};
