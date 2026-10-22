import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { taskProgress, TASK_LIMITS, type MissionTask } from '../utils/taskList';
import { useApp } from '../context/AppContext';

/** Barre « 3/5 » d'une mission (carte). Rien s'il n'y a pas de tâches. */
export const TaskBar: React.FC<{ tasks?: MissionTask[]; done?: string[] }> = ({ tasks, done }) => {
  const { lang } = useApp();
  if (!tasks || tasks.length === 0) return null;
  const p = taskProgress(tasks, done);
  return (
    <div data-notranslate="">
      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>{lang === 'en' ? 'Tasks' : 'Tâches'} {p.done}/{p.total}</span><span>{p.pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-slate-800" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${p.complete ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${p.pct}%` }} />
      </div>
    </div>
  );
};

/** Liste à cocher (opérateur). `onToggle` absent = lecture seule. */
export const TaskChecklist: React.FC<{ tasks: MissionTask[]; done?: string[]; required?: boolean; onToggle?: (id: string) => void }> = ({ tasks, done, required, onToggle }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (tasks.length === 0) return null;
  const p = taskProgress(tasks, done);
  const set = new Set(done || []);
  return (
    <div className="bg-[#131c28] border border-slate-800 rounded-xl p-3 space-y-2" data-notranslate="">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-mono uppercase text-slate-400">{t('Tâches à faire', 'Tasks to do')} · {p.done}/{p.total}</div>
        {required && <span className="text-[11px] text-amber-400 font-semibold">{t('Tout doit être coché avant d\'envoyer', 'Everything must be ticked before sending')}</span>}
      </div>
      <ul className="space-y-1">
        {tasks.map(k => {
          const on = set.has(k.id);
          return (
            <li key={k.id}>
              <button type="button" role="checkbox" aria-checked={on} disabled={!onToggle} onClick={() => onToggle && onToggle(k.id)}
                className={`w-full min-h-[44px] flex items-start gap-3 text-left rounded-lg px-2 py-2 border ${on ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-black/10'} ${onToggle ? 'cursor-pointer' : 'cursor-default opacity-80'}`}>
                {on ? <CheckSquare className="w-5 h-5 text-emerald-400 shrink-0" /> : <Square className="w-5 h-5 text-slate-500 shrink-0" />}
                <span className={`text-sm break-words ${on ? 'text-slate-300 line-through' : 'text-white'}`}>{k.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Saisie des tâches par le responsable : une tâche par ligne + l'option « tout cocher avant d'envoyer ». */
export const TaskListEditor: React.FC<{ text: string; required: boolean; onChange: (v: { text: string; required: boolean }) => void; inputClass: string }> = ({ text, required, onChange, inputClass }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const lines = text.split(/\r?\n/).filter(l => l.trim()).length;
  return (
    <div className="space-y-2" data-notranslate="">
      <label className="block text-xs font-semibold opacity-70">{t('Tâches à cocher (une par ligne, facultatif)', 'Tasks to tick (one per line, optional)')}</label>
      <textarea value={text} rows={4} onChange={e => onChange({ text: e.target.value, required })} placeholder={t('Ex. :\nOuvrir le fichier\nRecopier les fiches\nRelire', 'e.g.\nOpen the file\nCopy the records\nProofread')} className={`${inputClass} resize-y`} />
      <p className={`text-[11px] ${lines > TASK_LIMITS.max ? 'text-red-400' : 'opacity-60'}`}>{lines}/{TASK_LIMITS.max} {t('tâches', 'tasks')}</p>
      <label className="flex items-center gap-2 min-h-[44px] text-sm">
        <input type="checkbox" checked={required} onChange={e => onChange({ text, required: e.target.checked })} className="w-5 h-5" />
        <span>{t('Tout doit être coché avant d\'envoyer la mission', 'Everything must be ticked before the mission is sent')}</span>
      </label>
    </div>
  );
};
