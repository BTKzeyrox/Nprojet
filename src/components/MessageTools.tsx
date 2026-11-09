// Messagerie S4 (2026-11-09) : « Programmer un message » et « Modèles » (fenêtres du menu « + » du chat). Règles : utils/chatTemplates.ts. Utilisé par : ChatView.tsx.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { addTemplate, getTemplates, removeTemplate, scheduleAt, scheduleLabel, TPL_MAX_LEN } from '../utils/chatTemplates';
import { remAddDays, remDateOf } from '../utils/reminderRules';

const Shell: React.FC<{ tag: string; title: string; light: boolean; onClose: () => void; children: React.ReactNode }> = ({ tag, title, light, onClose, children }) => createPortal(
  <div {...{ [tag]: '' }} className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-2xl border shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto ${light ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100'}`}>
      <div className="flex items-center justify-between"><h2 className="font-bold">{title}</h2><button type="button" aria-label="Fermer" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button></div>
      {children}
    </div>
  </div>, document.body);
const fieldCls = (light: boolean) => `w-full rounded-lg border px-3 py-2 text-base ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#141e2a] border-slate-700 text-white'}`;

export const ScheduleDialog: React.FC<{ light: boolean; initial: string; onClose: () => void; onSend: (text: string, ms: number) => void }> = ({ light, initial, onClose, onSend }) => {
  const [text, setText] = useState(initial);
  const [date, setDate] = useState(remAddDays(remDateOf(Date.now()), 1));
  const [time, setTime] = useState('08:00');
  const chk = scheduleAt(date, time, Date.now());
  return (
    <Shell tag="data-schedule-dialog" title="Programmer un message" light={light} onClose={onClose}>
      <textarea data-schedule-text value={text} maxLength={4000} rows={3} onChange={e => setText(e.target.value)} placeholder="Ton message" className={fieldCls(light)} />
      <div className="grid grid-cols-2 gap-2">
        <input data-schedule-date type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" className={fieldCls(light)} />
        <input data-schedule-time type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Heure" className={fieldCls(light)} />
      </div>
      <p className="text-xs opacity-70">Le message part tout seul à l'heure choisie (à une minute près), même si ton téléphone est éteint. Les autres ne le voient pas avant. Tu peux le supprimer d'ici là.</p>
      {!chk.ok && <p className="text-xs text-red-500">{chk.error}</p>}
      <button type="button" data-schedule-send disabled={!text.trim() || !chk.ok} onClick={() => chk.ok && onSend(text.trim(), chk.ms)} className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer">{chk.ok ? `Programmer pour le ${scheduleLabel(chk.ms)}` : 'Programmer'}</button>
    </Shell>
  );
};

export const TemplatesDialog: React.FC<{ light: boolean; uid: string; draft: string; onClose: () => void; onPick: (text: string) => void }> = ({ light, uid, draft, onClose, onPick }) => {
  const [list, setList] = useState(() => getTemplates(uid));
  return (
    <Shell tag="data-templates-dialog" title="Mes modèles" light={light} onClose={onClose}>
      {list.length === 0 && <p className="text-sm opacity-70">Aucun modèle. Écris un message dans la zone de saisie, puis ouvre « Modèles » et garde-le ici.</p>}
      {list.map((t, i) => (
        <div key={i} className="flex items-stretch gap-1">
          <button type="button" data-tpl-pick onClick={() => onPick(t)} className={`flex-1 min-h-[48px] text-left px-3 py-2 rounded-lg border text-sm cursor-pointer ${light ? 'border-slate-300' : 'border-slate-600'}`}>{t.length > 120 ? t.slice(0, 120) + '…' : t}</button>
          <button type="button" data-tpl-del aria-label="Supprimer ce modèle" onClick={() => setList(removeTemplate(uid, i))} className="min-w-[44px] flex items-center justify-center cursor-pointer text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" data-tpl-save disabled={!draft.trim()} onClick={() => setList(addTemplate(uid, draft))} className="w-full min-h-[48px] rounded-xl border font-semibold disabled:opacity-50 cursor-pointer">{draft.trim() ? `Garder mon texte en modèle (max ${TPL_MAX_LEN} caractères)` : 'Écris d\'abord un texte pour le garder'}</button>
    </Shell>
  );
};
