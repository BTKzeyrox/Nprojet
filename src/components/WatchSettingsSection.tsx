import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { WATCH_FIELDS, checkWatchInput } from '../utils/health/watchPrefs';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthThresholds } from '../utils/health/types';
import { getWatchPrefs, setWatchPrefs } from '../utils/healthDb';
import { healthNotifOn, setHealthNotif } from '../utils/notifications';

/** Réglages > Général : « Surveillance » (seuils de la Santé du site). Réglés sur cet appareil ; vide = valeur de départ. */
export const WatchSettingsSection: React.FC = () => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [vals, setVals] = useState<Partial<HealthThresholds>>(() => getWatchPrefs());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const uid = db.getCurrentUser()?.id || '';
  const [open, setOpen] = useState(false);
  const [notifOn, setNotifOn] = useState(() => (uid ? healthNotifOn(uid) : true));
  const change = (key: keyof HealthThresholds, text: string) => {
    const r = checkWatchInput(key, text);
    if (!r.ok) { setErrs(e => ({ ...e, [key]: r.why[l] })); return; }
    setErrs(e => { const n = { ...e }; delete n[key]; return n; });
    const next = { ...vals }; if (r.value === null) delete next[key]; else next[key] = r.value;
    setVals(next); setWatchPrefs(next);
  };
  const reset = () => { setVals({}); setErrs({}); setWatchPrefs({}); };
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-watch-settings>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full min-h-[44px] flex items-center justify-between text-left cursor-pointer" aria-expanded={open}>
        <h3 className="font-tactical font-bold text-white">{t('Surveillance (seuils de la Santé du site)', 'Monitoring (Site health thresholds)')}</h3>
        <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <>
        <p className="text-[11px] text-slate-400">{t('Chaque case montre la valeur de départ. Laissez vide pour la garder. Réglé sur cet appareil seulement ; les alertes sont recalculées tout de suite.', 'Each box shows the default value. Leave it empty to keep it. Set on this device only; alerts are recomputed right away.')}</p>
        <label className="flex items-center gap-2 min-h-[44px] text-sm text-slate-200 cursor-pointer"><input type="checkbox" checked={notifOn} onChange={e => { setNotifOn(e.target.checked); if (uid) setHealthNotif(uid, e.target.checked); }} className="w-5 h-5" />{t('Cloche : alertes urgentes et résumé du jour (après 08:00)', 'Bell: urgent alerts and daily summary (after 08:00)')}</label>
        <div className="space-y-2">
          {WATCH_FIELDS.map(f => (
            <label key={f.key} className="block text-xs text-slate-300 space-y-1">
              <span>{l === 'en' ? f.en : f.fr}</span>
              <span className="flex items-center gap-2">
                <input inputMode="numeric" aria-label={l === 'en' ? f.en : f.fr} defaultValue={vals[f.key] ?? ''} placeholder={String(HEALTH_THRESHOLDS_DEFAULT[f.key])} onBlur={e => change(f.key, e.target.value)} className="w-24 min-h-[44px] rounded-lg bg-[#141e2a] border border-slate-600 px-2 text-white text-sm" />
                <span>{l === 'en' ? f.unit.en : f.unit.fr}</span>
                {vals[f.key] !== undefined && <span className="text-amber-300">{t('modifié', 'changed')}</span>}
              </span>
              {errs[f.key] && <span className="block text-rose-400" role="alert">{errs[f.key]}</span>}
            </label>
          ))}
        </div>
        <button type="button" onClick={reset} disabled={Object.keys(vals).length === 0} className="min-h-[44px] px-3 rounded-lg border border-slate-600 text-slate-100 text-sm disabled:opacity-40 cursor-pointer">{t('Tout remettre aux valeurs de départ', 'Reset everything to defaults')}</button>
      </>}
    </section>
  );
};
