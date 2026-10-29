import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { PERFORMANCE_DEFAULTS, cleanPerformanceConfig, type PerformanceConfig } from '../utils/performanceScore';
import { performanceConfigOf } from '../utils/usePerformance';

// Réglages > Performance (module 3, M3.4) : période, minimums, poids du score, seuils des badges.
// Tout est facultatif : les valeurs de départ sont prudentes. Le serveur revérifie tout à l'enregistrement (bloc PERFORMANCE de df-api).
// Une valeur hors limites est REFUSÉE avec un message (rien n'est enregistré), jamais corrigée en silence.

type Raw = Record<string, string>;
interface Field { id: string; fr: string; en: string; lo: number; hi: number; help?: [string, string] }
const LEVEL_KEYS = ['quality_levels', 'punctuality_levels', 'streak_levels', 'rendement_levels', 'versatility_levels'] as const;
type LevelKey = typeof LEVEL_KEYS[number];

const GENERAL: Field[] = [
  { id: 'window_days', fr: 'Période du score (jours)', en: 'Score period (days)', lo: 7, hi: 90, help: ['Le score regarde les N derniers jours. 30 = le dernier mois.', 'The score looks at the last N days. 30 = the last month.'] },
  { id: 'score_min_missions', fr: 'Missions jugées minimum pour afficher un score', en: 'Judged missions needed to show a score', lo: 1, hi: 200, help: ['Missions validées + refusées. En dessous, aucun score : trop peu de données pour juger.', 'Approved + refused missions. Below this, no score: too little data to judge.'] },
  { id: 'quality_min_missions', fr: 'Missions jugées minimum pour le badge Qualité et l\'employé du mois', en: 'Judged missions needed for the Quality badge and employee of the month', lo: 1, hi: 500 },
];
const WEIGHTS: Field[] = [
  { id: 'w.quality', fr: 'Qualité (missions validées)', en: 'Quality (approved missions)', lo: 0, hi: 100 },
  { id: 'w.volume', fr: 'Volume (missions faites)', en: 'Volume (missions done)', lo: 0, hi: 100 },
  { id: 'w.punctuality', fr: 'Ponctualité (jours sans retard)', en: 'Punctuality (days without delay)', lo: 0, hi: 100 },
  { id: 'w.regularity', fr: 'Régularité (jours actifs)', en: 'Consistency (active days)', lo: 0, hi: 100 },
];
const LEVELS: { key: LevelKey; fr: string; en: string; unit: [string, string]; lo: number; hi: number }[] = [
  { key: 'quality_levels', fr: 'Qualité', en: 'Quality', unit: ['% de missions validées', '% approved missions'], lo: 1, hi: 100 },
  { key: 'punctuality_levels', fr: 'Ponctualité', en: 'Punctuality', unit: ['% de jours sans retard', '% of days without delay'], lo: 1, hi: 100 },
  { key: 'streak_levels', fr: 'Régularité', en: 'Consistency', unit: ['jours de travail d\'affilée', 'working days in a row'], lo: 1, hi: 365 },
  { key: 'rendement_levels', fr: 'Rendement', en: 'Efficiency', unit: ['% de plus que l\'équipe', '% above the team'], lo: 1, hi: 500 },
  { key: 'versatility_levels', fr: 'Polyvalence', en: 'Versatility', unit: ['types de mission différents', 'different mission types'], lo: 1, hi: 50 },
];
const OTHER: Field[] = [
  { id: 'rookie_missions', fr: 'Recrue prometteuse : nombre de premières missions', en: 'Promising rookie: number of first missions', lo: 3, hi: 100 },
  { id: 'rookie_days', fr: 'Recrue prometteuse : première mission il y a moins de (jours)', en: 'Promising rookie: first mission less than (days) ago', lo: 7, hi: 365 },
  { id: 'month_min_team', fr: 'Employé du mois : salariés actifs minimum', en: 'Employee of the month: minimum active employees', lo: 2, hi: 100 },
  { id: 'min_duration_min', fr: 'Durée de mission trop courte, ignorée (minutes)', en: 'Mission too short, ignored (minutes)', lo: 0, hi: 60 },
  { id: 'max_duration_min', fr: 'Durée de mission trop longue, ignorée (minutes)', en: 'Mission too long, ignored (minutes)', lo: 60, hi: 1440 },
  { id: 'default_work_days', fr: 'Jours travaillés par semaine (si Conditions ne le dit pas)', en: 'Working days per week (if Conditions say nothing)', lo: 1, hi: 7 },
];

const toRaw = (c: PerformanceConfig): Raw => {
  const r: Raw = {};
  for (const f of [...GENERAL, ...OTHER]) r[f.id] = String((c as unknown as Record<string, number>)[f.id]);
  for (const k of ['quality', 'volume', 'punctuality', 'regularity'] as const) r[`w.${k}`] = String(c.weights[k]);
  for (const l of LEVELS) c[l.key].forEach((v, i) => { r[`${l.key}.${i}`] = String(v); });
  return r;
};
const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

/** Champs saisis → réglages. Les erreurs disent quel champ est faux : rien n'est enregistré s'il y en a. */
export function fromRaw(raw: Raw, lang: string): { value: PerformanceConfig; errors: string[] } {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  const check = (id: string, label: string, lo: number, hi: number, integer: boolean): number => {
    const v = num(raw[id] ?? '');
    if (!Number.isFinite(v) || v < lo || v > hi || (integer && !Number.isInteger(v))) { errors.push(`${label} (${lo} – ${hi})`); return NaN; }
    return v;
  };
  for (const f of [...GENERAL, ...OTHER]) out[f.id] = check(f.id, t(f.fr, f.en), f.lo, f.hi, true);
  const weights: Record<string, number> = {};
  for (const f of WEIGHTS) weights[f.id.slice(2)] = check(f.id, t(f.fr, f.en), f.lo, f.hi, true);
  out.weights = weights;
  if (Object.values(weights).every(v => v === 0)) errors.push(t('Les 4 poids ne peuvent pas être tous à 0', 'The 4 weights cannot all be 0'));
  for (const l of LEVELS) {
    const vals = [0, 1, 2].map(i => check(`${l.key}.${i}`, `${t(l.fr, l.en)} (${['Bronze', t('Argent', 'Silver'), t('Or', 'Gold')][i]})`, l.lo, l.hi, false));
    if (vals.every(Number.isFinite) && !(vals[0] < vals[1] && vals[1] < vals[2])) errors.push(t(`${l.fr} : les niveaux doivent monter (Bronze < Argent < Or)`, `${l.en}: levels must go up (Bronze < Silver < Gold)`));
    out[l.key] = vals;
  }
  if (Number.isFinite(out.min_duration_min as number) && Number.isFinite(out.max_duration_min as number) && (out.min_duration_min as number) >= (out.max_duration_min as number)) errors.push(t('La durée trop courte doit être plus petite que la durée trop longue', 'The too-short duration must be smaller than the too-long one'));
  return { value: cleanPerformanceConfig(out), errors };
}

const inputCls = 'w-full min-h-[44px] bg-[#141e2a] border border-slate-600 p-2.5 text-white text-sm rounded-lg focus:border-emerald-500 focus:outline-none';
const boxCls = 'bg-[#0f1722] border border-slate-700 rounded-2xl p-4 space-y-3';

export const PerformanceSettings: React.FC<{ lang: string }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const current = () => cleanPerformanceConfig(performanceConfigOf(db.getSettings()));
  const [raw, setRaw] = useState<Raw>(() => toRaw(current()));
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => db.subscribe(() => { if (!touched) setRaw(toRaw(current())); }), [touched]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, v: string) => { setRaw(p => ({ ...p, [id]: v })); setTouched(true); setSaved(false); setErrors([]); };
  const save = () => {
    const r = fromRaw(raw, lang);
    if (r.errors.length) { setErrors(r.errors); return; }
    db.updateSettings({ performance: r.value });
    setRaw(toRaw(r.value)); setTouched(false); setSaved(true); setErrors([]);
  };
  const reset = () => askConfirm({
    title: t('Remettre les valeurs de départ ?', 'Reset to starting values?'),
    message: t('Tous les champs reviennent aux valeurs de départ. Rien n\'est enregistré tant que tu ne touches pas « Enregistrer ».', 'All fields go back to the starting values. Nothing is saved until you tap “Save”.'),
    confirmLabel: t('Remettre', 'Reset'),
    onConfirm: () => { setRaw(toRaw(PERFORMANCE_DEFAULTS)); setTouched(true); setSaved(false); setErrors([]); },
  });

  const field = (f: Field) => (
    <div key={f.id}>
      <label htmlFor={`perf-${f.id}`} className="block text-xs font-bold text-slate-200 mb-1">{t(f.fr, f.en)} <span className="font-normal text-slate-500">({f.lo} – {f.hi})</span></label>
      <input id={`perf-${f.id}`} inputMode="decimal" value={raw[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} className={inputCls} />
      {f.help && <p className="text-[11px] text-slate-400 mt-1">{t(f.help[0], f.help[1])}</p>}
    </div>
  );
  const wTotal = WEIGHTS.reduce((s, f) => s + (Number.isFinite(num(raw[f.id] ?? '')) ? num(raw[f.id]) : 0), 0);

  return (
    <div className="space-y-3" data-notranslate="">
      <div className={boxCls}>
        <h3 className="font-tactical font-bold text-white flex items-center gap-2"><Award className="w-4 h-4 text-emerald-400" />{t('Performance des salariés', 'Employee performance')}</h3>
        <p className="text-xs text-slate-300">{t('Règle ici comment le score et les badges sont calculés. Les changements valent tout de suite pour tous les scores. Si tu ne sais pas : laisse comme ça.', 'Set here how the score and badges are calculated. Changes apply at once to every score. If unsure: leave it as it is.')}</p>
        <button type="button" onClick={reset} className="min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-200 text-xs font-mono hover:border-emerald-500 cursor-pointer">{t('Remettre les valeurs de départ', 'Reset to starting values')}</button>
      </div>

      {errors.length > 0 && <div role="alert" className="p-3 rounded-2xl border border-red-500/60 bg-red-950 text-red-200 text-sm font-semibold">{t('Rien n\'a été enregistré. À corriger : ', 'Nothing was saved. To fix: ')}{errors.join(' ; ')}</div>}
      {saved && <div role="status" className="p-3 rounded-2xl border border-emerald-500/60 bg-emerald-950 text-emerald-200 text-sm font-semibold">{t('Réglages de performance enregistrés.', 'Performance settings saved.')}</div>}

      <section className={boxCls} aria-label={t('Le score', 'The score')}>
        <h4 className="font-tactical font-bold text-white text-sm">{t('Le score', 'The score')}</h4>
        {GENERAL.map(field)}
      </section>

      <section className={boxCls} aria-label={t('Poids du score', 'Score weights')}>
        <h4 className="font-tactical font-bold text-white text-sm">{t('Poids des 4 parties du score', 'Weights of the 4 score parts')}</h4>
        <p className="text-[11px] text-slate-400">{t('Un nombre par partie : plus il est grand, plus la partie compte. Le total n\'a pas besoin de faire 100, il est recalculé.', 'One number per part: the bigger it is, the more it counts. The total does not need to be 100, it is recalculated.')}</p>
        {WEIGHTS.map(field)}
        <p className="text-xs font-mono text-slate-300">{t('Total', 'Total')} : {wTotal}{wTotal > 0 && wTotal !== 100 ? t(` (recalculé à 100 %)`, ` (recalculated to 100 %)`) : ''}</p>
      </section>

      <section className={boxCls} aria-label={t('Seuils des badges', 'Badge thresholds')}>
        <h4 className="font-tactical font-bold text-white text-sm">{t('Seuils des badges (Bronze, Argent, Or)', 'Badge thresholds (Bronze, Silver, Gold)')}</h4>
        <p className="text-[11px] text-slate-400">{t('Chaque niveau doit être plus haut que le précédent.', 'Each level must be higher than the previous one.')}</p>
        {LEVELS.map(l => (
          <div key={l.key}>
            <div className="text-xs font-bold text-slate-200 mb-1">{t(l.fr, l.en)} <span className="font-normal text-slate-500">({t(l.unit[0], l.unit[1])})</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <div key={i}>
                  <label htmlFor={`perf-${l.key}-${i}`} className="block text-[11px] text-slate-400 mb-0.5">{['Bronze', t('Argent', 'Silver'), t('Or', 'Gold')][i]}</label>
                  <input id={`perf-${l.key}-${i}`} inputMode="decimal" value={raw[`${l.key}.${i}`] ?? ''} onChange={e => set(`${l.key}.${i}`, e.target.value)} className={inputCls} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={boxCls} aria-label={t('Autres règles', 'Other rules')}>
        <h4 className="font-tactical font-bold text-white text-sm">{t('Recrue, employé du mois, durées', 'Rookie, employee of the month, durations')}</h4>
        {OTHER.map(field)}
      </section>

      <div className="sticky bottom-2">
        <button type="button" onClick={save} disabled={!touched} className="w-full min-h-[48px] rounded-full bg-emerald-600 text-white font-bold text-sm disabled:opacity-40 cursor-pointer">{t('Enregistrer', 'Save')}</button>
      </div>
    </div>
  );
};
