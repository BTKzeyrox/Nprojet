import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Pause, Play } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { useApp } from '../context/AppContext';
import { PROOF_MODES, type ProofMode } from '../utils/missionTemplates';
import { PROOF_LABEL } from './MissionTemplatesSection';
import { RECURRING_LIMITS, describeRule, madagascarDate, nextRun, type RecurringRule } from '../utils/recurring';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';
const DAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAYS_FULL_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_FULL_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Draft {
  id: string; name: string; title: string; post_type: string; description: string; proof_mode: ProofMode; objective: string; client_id: string;
  priority: string; deadline: boolean; due_after_days: string; due_time: string;
  frequency: string; weekdays: number[]; month_day: string; time: string; start_date: string; end_date: string; active: boolean;
}
const EMPTY = (): Draft => ({
  id: '', name: '', title: '', post_type: '', description: '', proof_mode: 'type', objective: '', client_id: '', priority: 'Normale', deadline: false, due_after_days: '0', due_time: '',
  frequency: 'daily', weekdays: [1, 2, 3, 4, 5], month_day: '1', time: '08:00', start_date: madagascarDate(Date.now()), end_date: '', active: true,
});
const fromRule = (r: RecurringRule): Draft => ({
  id: r.id, name: r.name, title: r.title, post_type: r.post_type || '', description: r.description || '', proof_mode: r.proof_mode, objective: r.objective ? String(r.objective) : '', client_id: r.client_id || '',
  priority: r.priority, deadline: r.due_after_days !== undefined, due_after_days: String(r.due_after_days ?? 0), due_time: r.due_time || '',
  frequency: r.frequency, weekdays: r.weekdays.length ? r.weekdays : [1, 2, 3, 4, 5], month_day: String(r.month_day), time: r.time, start_date: r.start_date, end_date: r.end_date || '', active: r.active,
});
const toInput = (d: Draft) => ({
  id: d.id || undefined, name: d.name, title: d.title, post_type: d.post_type, description: d.description, proof_mode: d.proof_mode,
  objective: d.objective.trim() === '' ? 0 : Number(d.objective), client_id: d.client_id, priority: d.priority,
  ...(d.deadline ? { due_after_days: Number(d.due_after_days), due_time: d.due_time } : {}),
  frequency: d.frequency, weekdays: d.frequency === 'weekly' ? d.weekdays : [], month_day: Number(d.month_day), time: d.time, start_date: d.start_date, end_date: d.end_date, active: d.active,
});
const fmt = (ms: number) => new Date(ms + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

/** Réglages > Missions : les missions qui reviennent toutes seules. Le serveur les crée à l'heure prévue (heure de Madagascar). Chaque action est enregistrée tout de suite. */
export const RecurringMissionsSection: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [list, setList] = useState<RecurringRule[]>(db.getRecurringRules());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => db.subscribe(() => setList(db.getRecurringRules())), []);
  const types = db.getSettings().post_types || [];
  const clients = db.getClients().filter(c => c.active !== false);
  const dayName = (i: number) => (lang === 'en' ? DAYS_FULL_EN[i] : DAYS_FULL_FR[i]);

  const save = () => {
    if (!draft) return;
    const r = db.saveRecurringRule(toInput(draft));
    if (!r.success) { setError(r.error || t('Enregistrement impossible.', 'Could not save.')); return; }
    setError(''); setDraft(null);
  };
  const toggle = (r: RecurringRule) => { const x = db.setRecurringActive(r.id, !r.active); if (!x.success) setError(x.error || ''); };
  const remove = (r: RecurringRule) => askConfirm({
    title: t(`Supprimer la règle « ${r.name} » ?`, `Delete the rule “${r.name}”?`),
    message: t('Les missions déjà créées ne changent pas. Plus aucune nouvelle mission ne sera créée par cette règle.', 'Missions already created do not change. This rule will no longer create missions.'),
    confirmLabel: t('Supprimer', 'Delete'), danger: true,
    onConfirm: () => { const x = db.removeRecurringRule(r.id); if (!x.success) setError(x.error || ''); },
  });
  const set = (p: Partial<Draft>) => draft && setDraft({ ...draft, ...p });

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-notranslate="">
      <h3 className="font-tactical font-bold text-white">{t('Missions récurrentes', 'Recurring missions')}</h3>
      <p className="text-[11px] text-slate-400">{t('Une règle crée une mission toute seule : chaque jour, certains jours de la semaine, ou un jour du mois, à l\'heure choisie (heure de Madagascar). Si le serveur est arrêté plus de 2 heures, la mission manquée n\'est pas créée après coup. Une règle arrêtée puis relancée ne rattrape rien.', 'A rule creates a mission by itself: every day, on chosen weekdays, or on a day of the month, at the chosen time (Madagascar time). If the server is down for more than 2 hours, the missed mission is not created afterwards. A paused rule that is resumed does not catch up.')}</p>
      {list.length === 0 && !draft && <p className="text-xs text-slate-500">{t('Aucune règle.', 'No rule.')}</p>}
      <ul className="space-y-2">
        {list.map(r => {
          const nx = nextRun(r, Date.now());
          return (
            <li key={r.id} className={`flex items-start gap-2 rounded-xl border p-2.5 ${r.active ? 'border-slate-700' : 'border-slate-700 opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white break-words">{r.name}{!r.active && <span className="ml-2 text-[10px] font-mono text-amber-400 uppercase">{t('arrêtée', 'paused')}</span>}</div>
                <div className="text-[11px] text-slate-400 break-words">{[r.title, describeRule(r, lang === 'en' ? 'en' : 'fr')].filter(Boolean).join(' · ')}</div>
                <div className="text-[11px] text-slate-500">{nx ? t(`Prochaine mission : ${fmt(nx)}`, `Next mission: ${fmt(nx)}`) : r.active ? t('Terminée (date de fin passée).', 'Finished (end date passed).') : t('Arrêtée : rien ne sera créé.', 'Paused: nothing will be created.')}</div>
              </div>
              <button type="button" aria-label={r.active ? t('Arrêter', 'Pause') : t('Relancer', 'Resume')} onClick={() => toggle(r)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-600 text-slate-200">{r.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
              <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => { setError(''); setDraft(fromRule(r)); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-600 text-slate-200"><Pencil className="w-4 h-4" /></button>
              <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => remove(r)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-red-500/50 text-red-400"><Trash2 className="w-4 h-4" /></button>
            </li>
          );
        })}
      </ul>
      {draft ? (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 p-3">
          {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
          <div><label className={labelCls}>{t('Nom de la règle', 'Rule name')}</label><input value={draft.name} maxLength={RECURRING_LIMITS.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder={t('ex : Rapport du matin', 'e.g. Morning report')} /></div>
          <div><label className={labelCls}>{t('Titre de la mission', 'Mission title')}</label><input value={draft.title} maxLength={RECURRING_LIMITS.title} onChange={e => set({ title: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>{t('Type', 'Type')}</label>
            <select value={draft.post_type} onChange={e => set({ post_type: e.target.value })} className={inputCls}>
              <option value="">{t('Aucun', 'None')}</option>
              {draft.post_type && !types.includes(draft.post_type) && <option value={draft.post_type}>{draft.post_type}</option>}
              {types.map(x => <option key={x} value={x}>{x}</option>)}
            </select></div>
          <div><label className={labelCls}>{t('Client (facultatif)', 'Client (optional)')}</label>
            <select value={draft.client_id} onChange={e => set({ client_id: e.target.value })} className={inputCls}>
              <option value="">{t('Aucun', 'None')}</option>
              {draft.client_id && !clients.some(c => c.id === draft.client_id) && <option value={draft.client_id}>{draft.client_id}</option>}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className={labelCls}>{t('Consigne (facultatif)', 'Instruction (optional)')}</label><textarea value={draft.description} maxLength={RECURRING_LIMITS.description} rows={2} onChange={e => set({ description: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>{t('Quantité à faire', 'Quantity to do')}</label><input inputMode="numeric" value={draft.objective} onChange={e => set({ objective: e.target.value.replace(/[^\d]/g, '') })} className={inputCls} placeholder="0" /></div>
            <div><label className={labelCls}>{t('Priorité', 'Priority')}</label>
              <select value={draft.priority} onChange={e => set({ priority: e.target.value })} className={inputCls}>
                <option value="Normale">{t('Normale', 'Normal')}</option><option value="Haute">{t('Haute', 'High')}</option><option value="Urgente">{t('Urgente', 'Urgent')}</option>
              </select></div>
          </div>
          <div><label className={labelCls}>{t('Justificatif demandé à la fin', 'Proof required at the end')}</label>
            <select value={draft.proof_mode} onChange={e => set({ proof_mode: e.target.value as ProofMode })} className={inputCls}>
              {PROOF_MODES.map(p => <option key={p} value={p}>{PROOF_LABEL[p][lang === 'en' ? 'en' : 'fr']}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={draft.deadline} onChange={e => set({ deadline: e.target.checked })} className="w-5 h-5" />{t('Mettre une date limite', 'Set a deadline')}</label>
          {draft.deadline && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>{t('Jours après la création (0 à 30)', 'Days after creation (0 to 30)')}</label><input inputMode="numeric" value={draft.due_after_days} onChange={e => set({ due_after_days: e.target.value.replace(/[^\d]/g, '') })} className={inputCls} /></div>
              <div><label className={labelCls}>{t('Heure limite (facultatif)', 'Deadline time (optional)')}</label><input type="time" value={draft.due_time} onChange={e => set({ due_time: e.target.value })} className={inputCls} /></div>
            </div>
          )}
          <div><label className={labelCls}>{t('Répéter', 'Repeat')}</label>
            <select value={draft.frequency} onChange={e => set({ frequency: e.target.value })} className={inputCls}>
              <option value="daily">{t('Chaque jour', 'Every day')}</option><option value="weekly">{t('Chaque semaine (jours choisis)', 'Every week (chosen days)')}</option><option value="monthly">{t('Chaque mois (un jour choisi)', 'Every month (a chosen day)')}</option>
            </select></div>
          {draft.frequency === 'weekly' && (
            <div className="flex gap-1.5" role="group" aria-label={t('Jours de la semaine', 'Weekdays')}>
              {DAYS_FR.map((_, i) => { const d = i + 1; const on = draft.weekdays.includes(d); return (
                <button key={d} type="button" aria-pressed={on} aria-label={dayName(i)} onClick={() => set({ weekdays: on ? draft.weekdays.filter(x => x !== d) : [...draft.weekdays, d] })} className={`min-h-[44px] flex-1 rounded-lg border text-sm font-mono ${on ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-600 text-slate-300'}`}>{lang === 'en' ? DAYS_FULL_EN[i].slice(0, 2) : DAYS_FR[i]}</button>
              ); })}
            </div>
          )}
          {draft.frequency === 'monthly' && (
            <div><label className={labelCls}>{t('Jour du mois (le 31 = dernier jour des mois courts)', 'Day of the month (31 = last day of short months)')}</label><input inputMode="numeric" value={draft.month_day} onChange={e => set({ month_day: e.target.value.replace(/[^\d]/g, '') })} className={inputCls} /></div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>{t('Heure', 'Time')}</label><input type="time" value={draft.time} onChange={e => set({ time: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>{t('Début', 'Start')}</label><input type="date" value={draft.start_date} onChange={e => set({ start_date: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>{t('Fin (facultatif)', 'End (optional)')}</label><input type="date" value={draft.end_date} onChange={e => set({ end_date: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">{t('Enregistrer la règle', 'Save rule')}</button>
            <button type="button" onClick={() => { setDraft(null); setError(''); }} className="min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-200 text-sm">{t('Annuler', 'Cancel')}</button>
          </div>
        </div>
      ) : (
        <>
          {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
          <button type="button" onClick={() => { setError(''); setDraft(EMPTY()); }} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" />{t('Nouvelle règle', 'New rule')}</button>
        </>
      )}
    </section>
  );
};
