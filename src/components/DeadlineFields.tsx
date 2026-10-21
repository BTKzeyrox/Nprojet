import React from 'react';
import { Flame } from 'lucide-react';
import { dueLabel, dueState, PRIORITIES, type MissionPriority } from '../utils/deadlines';
import { todayMada } from '../utils/stats';
import { useApp } from '../context/AppContext';

const PRIORITY_LABEL: Record<MissionPriority, { fr: string; en: string }> = {
  Normale: { fr: 'Normale', en: 'Normal' }, Haute: { fr: 'Haute', en: 'High' }, Urgente: { fr: 'Urgente', en: 'Urgent' },
};

interface FieldsProps {
  date: string; time: string; priority: MissionPriority;
  onChange: (v: { date: string; time: string; priority: MissionPriority }) => void;
  inputClass: string;
}

/** Champs « date limite, heure, priorité » (facultatifs) : formulaire d'ajout et fenêtre de modification d'une mission. */
export const DeadlineFields: React.FC<FieldsProps> = ({ date, time, priority, onChange, inputClass }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return (
    <div className="space-y-3" data-notranslate="">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold mb-1.5 opacity-70">{t('Date limite (facultatif)', 'Deadline (optional)')}</label>
          <input type="date" value={date} onChange={e => onChange({ date: e.target.value, time: e.target.value ? time : '', priority })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 opacity-70">{t('Heure (facultatif)', 'Time (optional)')}</label>
          <input type="time" value={time} disabled={!date} onChange={e => onChange({ date, time: e.target.value, priority })} className={`${inputClass} disabled:opacity-40`} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1.5 opacity-70">{t('Priorité', 'Priority')}</label>
        <select value={priority} onChange={e => onChange({ date, time, priority: e.target.value as MissionPriority })} className={inputClass}>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p][lang === 'en' ? 'en' : 'fr']}</option>)}
        </select>
      </div>
      {date && <button type="button" onClick={() => onChange({ date: '', time: '', priority })} className="min-h-[44px] px-3 rounded-lg border border-slate-600 text-xs font-semibold">{t('Enlever la date limite', 'Remove the deadline')}</button>}
    </div>
  );
};

/** Pastilles d'une carte : « Urgent » / « Priorité haute » et l'échéance (en retard, aujourd'hui, dans N j). Rien si la mission n'a ni l'un ni l'autre. */
export const DeadlineBadges: React.FC<{ due_date?: string; due_time?: string; priority?: string; done?: boolean }> = ({ due_date, due_time, priority, done }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Indian/Antananarivo', hour: '2-digit', minute: '2-digit', hour12: false });
  const st = dueState({ due_date, due_time }, todayMada(), now, !!done);
  const label = dueLabel(st, l);
  const urgent = priority === 'Urgente', high = priority === 'Haute';
  if (!label && !urgent && !high) return null;
  const tone = st.kind === 'late' ? 'bg-red-500/15 text-red-400 border-red-500/40' : st.kind === 'today' || st.kind === 'soon' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-slate-500/15 text-slate-300 border-slate-500/40';
  return (
    <div className="flex flex-wrap gap-1.5" data-notranslate="">
      {urgent && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-bold border bg-red-500/15 text-red-400 border-red-500/40"><Flame className="w-3 h-3" />{l === 'en' ? 'Urgent' : 'Urgent'}</span>}
      {high && !urgent && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-bold border bg-orange-500/15 text-orange-400 border-orange-500/40">{l === 'en' ? 'High priority' : 'Priorité haute'}</span>}
      {label && <span className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded-full font-semibold border ${tone}`}>{label}{due_time && st.kind !== 'late' ? ` · ${due_time}` : ''}</span>}
    </div>
  );
};
