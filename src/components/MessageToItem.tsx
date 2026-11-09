// Messagerie S3 (2026-11-09) : transformer un message en rappel, tâche ou événement (menu du message). Créé pour soi seul (shared=false), comme l'assistant.
// Même moteur que l'assistant : buildItem (assistantActions.ts) puis remSave (remindersState.ts) ; aucun nouveau serveur. Utilisé par : ChatView.tsx.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ChatMessage } from '../types';
import { buildItem, type ActionIntent, type ActionKind } from '../utils/assistantActions';
import { remSave } from '../utils/remindersState';
import { remDateOf, remAddDays, remMs } from '../utils/reminderRules';

const KINDS: { k: ActionKind; type: ActionIntent['type']; label: string }[] = [
  { k: 'reminder', type: 'simple', label: 'Rappel' },
  { k: 'task', type: 'task', label: 'Tâche' },
  { k: 'event', type: 'event', label: 'Événement' },
];

export const MessageToItem: React.FC<{ msg: ChatMessage; light: boolean; onClose: () => void }> = ({ msg, light, onClose }) => {
  const today = remDateOf(Date.now());
  const [kind, setKind] = useState<ActionKind>('reminder');
  const [title, setTitle] = useState((msg.poll?.question || msg.message || '').replace(/\s+/g, ' ').trim().slice(0, 120));
  const [date, setDate] = useState(remAddDays(today, 1));
  const [time, setTime] = useState('09:00');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  const type = KINDS.find(x => x.k === kind)!.type;
  const allDay = kind !== 'reminder' && !time;
  const t = time || '09:00';
  const past = !!date && (allDay ? date < today : remMs(date, t) < Date.now() - 60000);
  const valid = title.trim().length > 0 && !!date && !past;
  const field = `w-full rounded-lg border px-3 py-2 text-base ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#141e2a] border-slate-700 text-white'}`;
  const save = async () => {
    setState('busy'); setErr('');
    const a: ActionIntent = { kind, type, title: title.trim().slice(0, 120), date, time: t, allDay: kind === 'reminder' ? false : allDay, subs: [], needDate: false, past: false, guessed: [] };
    const r = await remSave({ ...buildItem(a), note: `Message de ${msg.sender_name}`.slice(0, 200) });
    if (r.ok) setState('done'); else { setState('idle'); setErr(r.error || 'Rien n\'a été créé. Réessaie dans un instant.'); }
  };
  return createPortal(
    <div data-msg-to-item className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-label="Créer à partir du message" onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-2xl border shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto ${light ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100'}`}>
        <div className="flex items-center justify-between"><h2 className="font-bold">À partir de ce message</h2><button type="button" aria-label="Fermer" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button></div>
        {state === 'done' ? (
          <>
            <p data-msg-to-item-done className="text-sm">C'est créé. Tu le retrouves dans « Mes rappels » et le Calendrier (visible par toi seul).</p>
            <button type="button" onClick={onClose} className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold cursor-pointer">Fermer</button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(x => <button key={x.k} type="button" data-mti-kind={x.k} aria-pressed={kind === x.k} onClick={() => setKind(x.k)} className={`min-h-[44px] rounded-lg border text-sm font-semibold cursor-pointer ${kind === x.k ? 'bg-emerald-600 text-white border-emerald-600' : light ? 'border-slate-300' : 'border-slate-600'}`}>{x.label}</button>)}
            </div>
            <input data-mti-title value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Titre" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <input data-mti-date type="date" value={date} onChange={e => setDate(e.target.value)} className={field} aria-label="Date" />
              <input data-mti-time type="time" value={time} onChange={e => setTime(e.target.value)} className={field} aria-label="Heure" />
            </div>
            {kind !== 'reminder' && <p className="text-xs opacity-70">Heure vide = toute la journée.</p>}
            {past && <p className="text-xs text-red-500">Cette date est déjà passée.</p>}
            {err && <p role="alert" className="text-xs text-red-500">{err}</p>}
            <button type="button" data-mti-save disabled={!valid || state === 'busy'} onClick={save} className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer">Créer (visible par moi seul)</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
