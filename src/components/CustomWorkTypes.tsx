// « Créer mon type de travail » (module 26, M26.6b) : dans Réglages > Conditions > Types de travail et paie. Enregistre tout de suite (pas besoin du bouton Enregistrer des Conditions).
// Règles : utils/customWorkTypes.ts (copie serveur contrôlée). Stockage : db.saveCustomWorkType / removeCustomWorkType.
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '../db/store';
import { MEASURES, PAY_MODES, ENTRY_BY, MEASURE_LABEL, PAY_LABEL, ENTRY_LABEL, compatible, describeWorkType, type Measure, type PayMode, type EntryBy } from '../utils/workTypes';
import { CW_MAX_TYPES } from '../utils/customWorkTypes';

const input = 'w-full bg-[#141e2a] border border-slate-700 rounded-lg px-3 py-2 min-h-[44px] text-sm text-white focus:outline-none focus:border-emerald-500';

export const CustomWorkTypes: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  const list = db.getCustomWorkTypes();
  const [open, setOpen] = useState(false);
  const [fr, setFr] = useState(''); const [en, setEn] = useState('');
  const [measure, setMeasure] = useState<Measure>('quantity');
  const [pay, setPay] = useState<PayMode>('piece');
  const [entry, setEntry] = useState<EntryBy[]>(['admin', 'team_lead']);
  const [ufr, setUfr] = useState('boîte'); const [uen, setUen] = useState('box');
  const [err, setErr] = useState('');
  const pays = PAY_MODES.filter(p => compatible(measure, p));
  const needsUnit = measure === 'quantity' || pay === 'piece';
  const changeMeasure = (m: Measure) => { setMeasure(m); if (!compatible(m, pay)) setPay(PAY_MODES.find(p => compatible(m, p)) || 'fixed'); };
  const toggle = (e: EntryBy) => setEntry(p => (p.includes(e) ? p.filter(x => x !== e) : [...p, e]));
  const save = () => {
    const r = db.saveCustomWorkType({ name: { fr, en }, measure, pay, entry, ...(needsUnit ? { unit: { fr: ufr, en: uen } } : {}) });
    if (!r.success) { setErr(r.error || t('Refusé.', 'Refused.')); return; }
    setErr(''); setFr(''); setEn(''); setOpen(false); force(n => n + 1);
  };
  const del = (id: string, name: string) => { if (!window.confirm(t(`Supprimer le type « ${name} » ? Les saisies déjà faites restent.`, `Delete the type "${name}"? Entries already made stay.`))) return; db.removeCustomWorkType(id); force(n => n + 1); };

  return (
    <div data-custom-work-types className="space-y-3 pt-2 border-t border-slate-700">
      <div className="text-slate-200 text-xs font-mono">{t('Mes types de travail', 'My work types')} ({list.length}/{CW_MAX_TYPES})</div>
      {list.length === 0 && <p className="text-[11px] text-slate-400">{t('Aucun pour l\'instant. Crée ton type si ceux du modèle ne conviennent pas.', 'None yet. Create your own if the ones from the model do not fit.')}</p>}
      <ul className="space-y-2">
        {list.map(x => (
          <li key={x.id} className="rounded-lg border border-slate-700 p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{t(x.name.fr, x.name.en)}</div>
              <div className="text-[11px] text-slate-300">{t(describeWorkType(x).fr, describeWorkType(x).en)}</div>
            </div>
            <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => del(x.id, x.name.fr)} className="shrink-0 w-11 h-11 -mt-1 -mr-2 flex items-center justify-center text-rose-300 cursor-pointer"><Trash2 className="w-5 h-5" /></button>
          </li>
        ))}
      </ul>
      {!open ? (
        <button type="button" data-cwt-open onClick={() => setOpen(true)} disabled={list.length >= CW_MAX_TYPES} className="min-h-[44px] px-3 rounded-lg border border-emerald-600 text-emerald-300 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-40"><Plus className="w-4 h-4" />{t('Créer mon type de travail', 'Create my work type')}</button>
      ) : (
        <div className="rounded-lg border border-slate-700 p-3 space-y-3">
          <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Nom en français', 'Name in French')}</span><input data-cwt-fr value={fr} maxLength={60} onChange={e => setFr(e.target.value)} className={input} placeholder="Emballage" /></label>
          <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Nom en anglais', 'Name in English')}</span><input data-cwt-en value={en} maxLength={60} onChange={e => setEn(e.target.value)} className={input} placeholder="Packing" /></label>
          <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Comment on le mesure', 'How it is measured')}</span>
            <select data-cwt-measure value={measure} onChange={e => changeMeasure(e.target.value as Measure)} className={input}>{MEASURES.map(m => <option key={m} value={m}>{t(MEASURE_LABEL[m].fr, MEASURE_LABEL[m].en)}</option>)}</select></label>
          <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Comment on le paie', 'How it is paid')}</span>
            <select data-cwt-pay value={pay} onChange={e => setPay(e.target.value as PayMode)} className={input}>{pays.map(p => <option key={p} value={p}>{t(PAY_LABEL[p].fr, PAY_LABEL[p].en)}</option>)}</select></label>
          {needsUnit && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Unité (français)', 'Unit (French)')}</span><input value={ufr} maxLength={20} onChange={e => setUfr(e.target.value)} className={input} /></label>
              <label className="block space-y-1"><span className="text-xs text-slate-300">{t('Unité (anglais)', 'Unit (English)')}</span><input value={uen} maxLength={20} onChange={e => setUen(e.target.value)} className={input} /></label>
            </div>
          )}
          <fieldset className="space-y-1"><legend className="text-xs text-slate-300">{t('Qui le saisit', 'Who enters it')}</legend>
            {ENTRY_BY.map(e => <label key={e} className="flex items-center gap-3 min-h-[44px] text-sm text-slate-200 cursor-pointer"><input type="checkbox" checked={entry.includes(e)} onChange={() => toggle(e)} className="w-5 h-5 accent-emerald-500" />{t(ENTRY_LABEL[e].fr, ENTRY_LABEL[e].en)}</label>)}
          </fieldset>
          {err && <div role="alert" className="text-rose-300 text-xs">{err}</div>}
          <div className="flex gap-2">
            <button type="button" data-cwt-save onClick={save} className="flex-1 min-h-[44px] rounded-lg bg-emerald-600 text-white text-sm font-bold cursor-pointer">{t('Créer', 'Create')}</button>
            <button type="button" onClick={() => { setOpen(false); setErr(''); }} className="min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-200 text-sm cursor-pointer">{t('Annuler', 'Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};
