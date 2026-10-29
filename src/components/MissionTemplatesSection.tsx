import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, FileText } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { useApp } from '../context/AppContext';
import { PROOF_MODES, TEMPLATE_LIMITS, type MissionTemplate, type ProofMode } from '../utils/missionTemplates';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';

export const PROOF_LABEL: Record<ProofMode, { fr: string; en: string }> = {
  type: { fr: 'Selon le type de mission', en: 'According to the mission type' },
  none: { fr: 'Aucun justificatif', en: 'No proof' },
  photo: { fr: 'Photo ou capture obligatoire', en: 'Photo or screenshot required' },
  note: { fr: 'Note obligatoire', en: 'Note required' },
  both: { fr: 'Photo et note obligatoires', en: 'Photo and note required' },
};

interface Draft { id: string; name: string; title: string; post_type: string; description: string; proof_mode: ProofMode }
const EMPTY: Draft = { id: '', name: '', title: '', post_type: '', description: '', proof_mode: 'type' };

/** Réglages > Missions : gérer les modèles de mission (créer, modifier, supprimer). Chaque action est enregistrée tout de suite. */
export const MissionTemplatesSection: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [list, setList] = useState<MissionTemplate[]>(db.getMissionTemplates());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => db.subscribe(() => setList(db.getMissionTemplates())), []);
  const types = db.getSettings().post_types || [];

  const save = () => {
    if (!draft) return;
    const r = db.saveMissionTemplate(draft);
    if (!r.success) { setError(r.error || t('Enregistrement impossible.', 'Could not save.')); return; }
    setError(''); setDraft(null);
  };
  const remove = (m: MissionTemplate) => askConfirm({
    title: t(`Supprimer le modèle « ${m.name} » ?`, `Delete the template “${m.name}”?`),
    message: t('Les missions déjà créées avec ce modèle ne changent pas.', 'Missions already created from this template do not change.'),
    confirmLabel: t('Supprimer', 'Delete'), danger: true,
    onConfirm: () => { const r = db.removeMissionTemplate(m.id); if (!r.success) setError(r.error || ''); },
  });

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-notranslate="">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" />{t('Modèles de mission', 'Mission templates')}</h3>
      <p className="text-[11px] text-slate-400">{t('Un modèle garde le titre, le type, la consigne et le justificatif demandé. Il sert dans « Nouvelle mission ». Les modèles sont enregistrés tout de suite.', 'A template keeps the title, type, instruction and required proof. It is used in “New mission”. Templates are saved immediately.')}</p>
      {list.length === 0 && !draft && <p className="text-xs text-slate-500">{t('Aucun modèle. Crée-en un ici, ou depuis une mission (« Enregistrer comme modèle »).', 'No template. Create one here, or from a mission (“Save as template”).')}</p>}
      <ul className="space-y-2">
        {list.map(m => (
          <li key={m.id} className="flex items-start gap-2 rounded-xl border border-slate-700 p-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white break-words">{m.name}</div>
              <div className="text-[11px] text-slate-400 break-words">{[m.title, m.post_type, PROOF_LABEL[m.proof_mode][lang === 'en' ? 'en' : 'fr']].filter(Boolean).join(' · ')}</div>
            </div>
            <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => { setError(''); setDraft({ id: m.id, name: m.name, title: m.title, post_type: m.post_type || '', description: m.description || '', proof_mode: m.proof_mode }); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-600 text-slate-200"><Pencil className="w-4 h-4" /></button>
            <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => remove(m)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-red-500/50 text-red-400"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 p-3">
          {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
          <div><label className={labelCls}>{t('Nom du modèle', 'Template name')}</label><input value={draft.name} maxLength={TEMPLATE_LIMITS.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder={t('Ex. : Saisie de fiches', 'e.g. Data entry')} /></div>
          <div><label className={labelCls}>{t('Titre de la mission (facultatif)', 'Mission title (optional)')}</label><input value={draft.title} maxLength={TEMPLATE_LIMITS.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>{t('Type', 'Type')}</label>
            <select value={draft.post_type} onChange={e => setDraft({ ...draft, post_type: e.target.value })} className={inputCls}>
              <option value="">{t('Aucun', 'None')}</option>
              {draft.post_type && !types.includes(draft.post_type) && <option value={draft.post_type}>{draft.post_type}</option>}
              {types.map(x => <option key={x} value={x}>{x}</option>)}
            </select></div>
          <div><label className={labelCls}>{t('Consigne (facultatif)', 'Instruction (optional)')}</label><textarea value={draft.description} maxLength={TEMPLATE_LIMITS.description} rows={3} onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls + ' font-sans'} /></div>
          <div><label className={labelCls}>{t('Justificatif demandé à la fin', 'Proof required at the end')}</label>
            <select value={draft.proof_mode} onChange={e => setDraft({ ...draft, proof_mode: e.target.value as ProofMode })} className={inputCls}>
              {PROOF_MODES.map(p => <option key={p} value={p}>{PROOF_LABEL[p][lang === 'en' ? 'en' : 'fr']}</option>)}
            </select></div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">{t('Enregistrer le modèle', 'Save template')}</button>
            <button type="button" onClick={() => { setDraft(null); setError(''); }} className="min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-200 text-sm">{t('Annuler', 'Cancel')}</button>
          </div>
        </div>
      ) : (
        <>
          {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
          <button type="button" onClick={() => { setError(''); setDraft({ ...EMPTY }); }} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" />{t('Nouveau modèle', 'New template')}</button>
        </>
      )}
    </section>
  );
};
