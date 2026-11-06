// Résumé de la Santé du site, posé en haut du Tableau de bord (le détail reste dans l'onglet « Santé du site » du même groupe).
// Utilisé par : views/admin/AdminDashboard.tsx. Pour modifier : alertes lues par getHealth() (src/utils/healthDb.ts).
import React, { useEffect, useState } from 'react';
import { HeartPulse, ChevronRight } from 'lucide-react';
import { getHealth, loadHealthExternal, subscribeHealth } from '../utils/healthDb';

export const HealthSummary: React.FC<{ lang: 'fr' | 'en'; onOpen: () => void }> = ({ lang, onOpen }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const off = subscribeHealth(() => tick(x => x + 1));
    void loadHealthExternal();
    return off;
  }, []);
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const h = getHealth();
  const urgent = h.alerts.filter(a => a.severity === 'urgent').length;
  const watch = h.alerts.filter(a => a.severity === 'watch').length;
  const info = h.alerts.filter(a => a.severity === 'info').length;
  const calm = urgent + watch + info === 0;
  return (
    <section data-health-summary className="bg-[#0f1722] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
      <HeartPulse className={`w-5 h-5 shrink-0 ${urgent > 0 ? 'text-rose-400' : watch > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
      <h3 className="font-bold text-white mr-auto">{t('Santé du site', 'Site health')}</h3>
      {calm ? (
        <span className="text-sm text-emerald-300">{t('Rien à signaler', 'Nothing to report')}</span>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="px-2 py-1 rounded-full bg-rose-600/20 text-rose-300 border border-rose-600/50">{urgent} {t('urgent(s)', 'urgent')}</span>
          <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-600/50">{watch} {t('à voir', 'to check')}</span>
          <span className="px-2 py-1 rounded-full bg-sky-600/15 text-sky-300 border border-sky-600/50">{info} info</span>
        </div>
      )}
      <button type="button" data-health-details onClick={onOpen} className="min-h-[36px] px-3 rounded-xl border border-slate-600 bg-[#141e2a] hover:border-slate-400 text-slate-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">
        {t('Détails', 'Details')}<ChevronRight className="w-4 h-4" />
      </button>
    </section>
  );
};
