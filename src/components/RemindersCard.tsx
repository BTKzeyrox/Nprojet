// Carte « À faire » du Calendrier (module 25) : liste des tâches, rendez-vous, échéances et rappels de la personne, bouton « + Ajouter », formulaire complet.
// Utilisé par : CalendarView.tsx. Règles : src/utils/reminderRules.ts (types par rôle, rappels conseillés). Données : src/utils/remindersState.ts (serveur = référence).
// Pour modifier : les types permis par rôle sont dans REM_ROLE_TYPES (le serveur les impose aussi) ; textes FR/EN avec t(fr, en).
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, Clock, Trash2, Pencil, X, BellRing, ListChecks, Repeat, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { remCfg, remDelete, remItems, remLoaded, remReload, remSave, remSaveCfg, remSnooze, remSubscribe, type RemCfg } from '../utils/remindersState';
import { REM_MAX_FIRES, REM_ROLE_TYPES, REM_TYPE_LABEL, remDateOf, remOccurrences, remSuggest, type RemFire, type RemItem, type RemType } from '../utils/reminderRules';

const todayMada = () => remDateOf(Date.now());
const PRIO_COLOR: Record<string, string> = { low: 'text-slate-400', normal: 'text-blue-500', high: 'text-amber-500', urgent: 'text-red-500' };
const TYPE_FIELDS: Record<RemType, string[]> = {
  task: ['subtasks', 'note'], appointment: ['place', 'person', 'duration', 'note'], event: ['place', 'duration', 'note'], deadline: ['amount', 'link', 'note'], payment: ['amount', 'person', 'link', 'note'],
  followup: ['person', 'note'], call: ['person', 'note'], checklist: ['subtasks', 'note'], important: ['note'], simple: ['note'],
};
const LINKS: [string, string, string][] = [['', 'Aucune', 'None'], ['invoices', 'Factures', 'Invoices'], ['cash', 'Trésorerie', 'Cash'], ['stock', 'Stock', 'Stock'], ['clients', 'Clients', 'Clients']];
const newId = () => `rem_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

/** Un rappel en texte (pastille). */
export function fireLabel(f: RemFire, lang: 'fr' | 'en'): string {
  const fr = lang !== 'en';
  if (f.k === 'at') return fr ? "À l'heure" : 'At the time';
  if (f.k === 'before') { const n = f.n || 0; const v = n % 1440 === 0 ? `${n / 1440} ${fr ? 'j' : 'd'}` : n % 60 === 0 ? `${n / 60} h` : `${n} min`; return fr ? `${v} avant` : `${v} before`; }
  if (f.k === 'morning') return (f.d || 0) === 0 ? (fr ? `Le matin ${f.at}` : `Morning ${f.at}`) : (fr ? `J-${f.d} à ${f.at}` : `D-${f.d} at ${f.at}`);
  if (f.k === 'overdue') return fr ? `En retard : chaque jour ${f.at}` : `Overdue: daily ${f.at}`;
  return new Date(f.iso || 0).toLocaleString(fr ? 'fr-FR' : 'en-GB', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface FormProps { item: RemItem | null; onClose: () => void; L: boolean; lang: 'fr' | 'en'; role: string; cfg: RemCfg; presetDate?: string }
const ReminderForm: React.FC<FormProps> = ({ item, onClose, L, lang, role, cfg, presetDate }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  useLockBodyScroll(true);
  const allowed = (REM_ROLE_TYPES[role] || REM_ROLE_TYPES.employee) as RemType[];
  const [type, setType] = useState<RemType>(item?.type || 'task');
  const [tpl, setTpl] = useState<string>(item?.template || '');
  const [title, setTitle] = useState(item?.title || '');
  const [date, setDate] = useState(item?.date || presetDate || todayMada());
  const [time, setTime] = useState(item?.time || '09:00');
  const [allDay, setAllDay] = useState(item?.all_day || false);
  const [duration, setDuration] = useState(item?.duration_min || 0);
  const [priority, setPriority] = useState(item?.priority || 'normal');
  const [status, setStatus] = useState(item?.status || 'todo');
  const [note, setNote] = useState(item?.note || '');
  const [place, setPlace] = useState(item?.place || '');
  const [person, setPerson] = useState(item?.person || '');
  const [amount, setAmount] = useState(item?.amount ? String(item.amount) : '');
  const [link, setLink] = useState(item?.link || '');
  const [label, setLabel] = useState(item?.label || '');
  const [subs, setSubs] = useState(item?.subtasks || []);
  const [freq, setFreq] = useState<RemItem['repeat']['freq']>(item?.repeat.freq || 'none');
  const [until, setUntil] = useState(item?.repeat.until || '');
  const [shared, setShared] = useState(item?.shared || false);
  const [fires, setFires] = useState<RemFire[]>(item?.fires || remSuggest(item?.type || 'task', { time, all_day: allDay, morning: cfg.morning }));
  const [touchedFires, setTouchedFires] = useState(!!item);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState('');
  // ajout d'un rappel
  const [addK, setAddK] = useState<'before' | 'morning' | 'exact' | 'overdue' | 'at'>('before');
  const [addN, setAddN] = useState(30);
  const [addU, setAddU] = useState<'m' | 'h' | 'd' | 'w'>('m');
  const [addD, setAddD] = useState(1);
  const [addAt, setAddAt] = useState(cfg.morning || '08:00');
  const [addIso, setAddIso] = useState('');

  const fields = TYPE_FIELDS[type];
  const reSuggest = (ty = type, ad = allDay) => { setFires(remSuggest(ty, { time, all_day: ad, morning: cfg.morning })); setTouchedFires(false); };
  const pickType = (ty: RemType, templateId = '') => {
    setType(ty); setTpl(templateId);
    const tp = cfg.templates.find(x => x.id === templateId);
    if (tp && tp.fires.length) { setFires(tp.fires as RemFire[]); setTouchedFires(false); }
    else if (!touchedFires) setFires(remSuggest(ty, { time, all_day: allDay, morning: cfg.morning }));
  };
  const addFire = () => {
    if (fires.length >= REM_MAX_FIRES) { setErr(t(`${REM_MAX_FIRES} rappels au plus.`, `${REM_MAX_FIRES} reminders at most.`)); return; }
    const id = `r${Date.now() % 1e6}${fires.length}`;
    let f: RemFire | null = null;
    if (addK === 'at') f = { id, k: 'at' };
    else if (addK === 'before') f = { id, k: 'before', n: Math.max(1, addN) * { m: 1, h: 60, d: 1440, w: 10080 }[addU] };
    else if (addK === 'morning') f = { id, k: 'morning', d: Math.max(0, addD), at: addAt };
    else if (addK === 'overdue') f = { id, k: 'overdue', at: addAt };
    else if (addK === 'exact' && addIso) f = { id, k: 'exact', iso: new Date(addIso + '+03:00').toISOString() };
    if (!f) { setErr(t('Choisis la date et l\'heure.', 'Pick the date and time.')); return; }
    setErr(''); setFires([...fires, f]); setTouchedFires(true);
  };
  const submit = async () => {
    if (!title.trim()) { setErr(t('Le titre est obligatoire.', 'The title is required.')); return; }
    setBusy(true); setErr('');
    const r = await remSave({
      id: item?.id || newId(), type, title, date, time, all_day: allDay, duration_min: duration, priority, status, note, place, person, label, link, amount: Number(amount) || 0,
      subtasks: subs, repeat: { freq, until }, shared, fires, template: tpl, snooze_until: item?.snooze_until || 0, created_ms: item?.created_ms || Date.now(), done_at: item?.done_at || '',
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error || t('Enregistrement impossible.', 'Could not save.')); return; }
    onClose();
  };
  const fieldCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${L ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0a1424] border-slate-600 text-white'}`;
  const lab = `block text-[11px] font-semibold mb-1 ${L ? 'text-slate-500' : 'text-slate-400'}`;
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${on ? 'bg-blue-600 border-blue-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700' : 'bg-transparent border-slate-600 text-slate-300'}`;
  const myTpls = cfg.templates;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={onClose} data-reminder-form>
      <div className={`w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border p-4 space-y-3 ${L ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1b2d] border-slate-700 text-white'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">{item ? t('Modifier', 'Edit') : t('Ajouter', 'Add')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Fermer', 'Close')} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-500/20"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <span className={lab}>{t('Type', 'Type')}</span>
          <div className="flex flex-wrap gap-1.5">
            {allowed.map(ty => <button key={ty} type="button" onClick={() => pickType(ty)} className={chip(type === ty && !tpl)}>{REM_TYPE_LABEL[ty][lang]}</button>)}
            {myTpls.map(m => <button key={m.id} type="button" onClick={() => pickType((allowed.includes(m.base as RemType) ? m.base : 'task') as RemType, m.id)} className={chip(tpl === m.id)} style={m.color ? { borderColor: m.color } : undefined}>★ {m.name}</button>)}
          </div>
        </div>
        <div><label className={lab}>{t('Titre (obligatoire)', 'Title (required)')}</label><input className={fieldCls} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder={t('Ex. Rendez-vous avec le fournisseur', 'e.g. Meeting with supplier')} autoFocus /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lab}>{t('Date', 'Date')}</label><input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className={lab}>{t('Heure', 'Time')}</label><input type="time" className={fieldCls} value={time} disabled={allDay} onChange={e => setTime(e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={allDay} onChange={e => { setAllDay(e.target.checked); if (!touchedFires) reSuggest(type, e.target.checked); }} />{t('Journée entière', 'All day')}</label>
        {fields.includes('duration') && !allDay && (
          <div><label className={lab}>{t('Durée (minutes)', 'Duration (minutes)')}</label><input type="number" min={0} max={1440} className={fieldCls} value={duration || ''} onChange={e => setDuration(Number(e.target.value) || 0)} /></div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lab}>{t('Priorité', 'Priority')}</label>
            <select className={fieldCls} value={priority} onChange={e => setPriority(e.target.value as RemItem['priority'])}>
              <option value="low">{t('Basse', 'Low')}</option><option value="normal">{t('Normale', 'Normal')}</option><option value="high">{t('Haute', 'High')}</option><option value="urgent">{t('Urgente', 'Urgent')}</option>
            </select></div>
          {item && <div><label className={lab}>{t('Statut', 'Status')}</label>
            <select className={fieldCls} value={status} onChange={e => setStatus(e.target.value as RemItem['status'])}>
              <option value="todo">{t('À faire', 'To do')}</option><option value="doing">{t('En cours', 'In progress')}</option><option value="done">{t('Fait', 'Done')}</option><option value="canceled">{t('Annulé', 'Canceled')}</option>
            </select></div>}
        </div>
        {fields.includes('place') && <div><label className={lab}>{t('Lieu', 'Place')}</label><input className={fieldCls} value={place} onChange={e => setPlace(e.target.value)} maxLength={120} /></div>}
        {fields.includes('person') && <div><label className={lab}>{t('Personne ou client concerné', 'Person or client')}</label><input className={fieldCls} value={person} onChange={e => setPerson(e.target.value)} maxLength={120} /></div>}
        {fields.includes('amount') && <div><label className={lab}>{t('Montant (Ar)', 'Amount (Ar)')}</label><input type="number" min={0} className={fieldCls} value={amount} onChange={e => setAmount(e.target.value)} /></div>}
        {fields.includes('link') && <div><label className={lab}>{t('Page du site liée', 'Linked page')}</label>
          <select className={fieldCls} value={link} onChange={e => setLink(e.target.value)}>{LINKS.map(([v, fr, en]) => <option key={v} value={v}>{lang === 'en' ? en : fr}</option>)}</select></div>}
        {fields.includes('subtasks') && (
          <div>
            <label className={lab}>{type === 'checklist' ? t('Points à cocher', 'Checklist points') : t('Sous-tâches', 'Subtasks')}</label>
            <div className="space-y-1">
              {subs.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.done} onChange={e => setSubs(subs.map(x => x.id === s.id ? { ...x, done: e.target.checked } : x))} />
                  <span className="flex-1 min-w-0 break-words">{s.text}</span>
                  <button type="button" aria-label={t('Retirer', 'Remove')} onClick={() => setSubs(subs.filter(x => x.id !== s.id))} className="cursor-pointer text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className={fieldCls} value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSub.trim()) { e.preventDefault(); setSubs([...subs, { id: `t${Date.now() % 1e6}${subs.length}`, text: newSub.trim(), done: false }]); setNewSub(''); } }} placeholder={t('Ajouter un point…', 'Add a point…')} maxLength={120} />
                <button type="button" className={chip(false)} onClick={() => { if (newSub.trim()) { setSubs([...subs, { id: `t${Date.now() % 1e6}${subs.length}`, text: newSub.trim(), done: false }]); setNewSub(''); } }}>+</button>
              </div>
            </div>
          </div>
        )}
        {fields.includes('note') && <div><label className={lab}>{t('Note', 'Note')}</label><textarea className={fieldCls} rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lab}>{t('Répétition', 'Repeat')}</label>
            <select className={fieldCls} value={freq} onChange={e => setFreq(e.target.value as RemItem['repeat']['freq'])}>
              <option value="none">{t('Aucune', 'None')}</option><option value="day">{t('Chaque jour', 'Daily')}</option><option value="week">{t('Chaque semaine', 'Weekly')}</option><option value="month">{t('Chaque mois', 'Monthly')}</option><option value="year">{t('Chaque année', 'Yearly')}</option>
            </select></div>
          {freq !== 'none' && <div><label className={lab}>{t('Jusqu\'au (facultatif)', 'Until (optional)')}</label><input type="date" className={fieldCls} value={until} onChange={e => setUntil(e.target.value)} /></div>}
        </div>
        <div>
          <label className={lab}>{t('Étiquette de couleur', 'Color label')}</label>
          <div className="flex gap-2">{['', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'].map(c => <button key={c || 'none'} type="button" aria-label={c || 'none'} onClick={() => setLabel(c)} className={`w-7 h-7 rounded-full border-2 cursor-pointer ${label === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ background: c || (L ? '#e2e8f0' : '#334155') }} />)}</div>
        </div>
        {/* Rappels : pastilles */}
        <div className={`rounded-2xl border p-3 space-y-2 ${L ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-white/[0.03]'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold flex items-center gap-1.5"><BellRing className="w-4 h-4 text-blue-500" />{t('Rappels', 'Reminders')} <span className="text-xs font-normal opacity-70" data-fire-count>({fires.length}/{REM_MAX_FIRES})</span></span>
            <button type="button" className="text-xs font-semibold text-blue-500 cursor-pointer" onClick={() => reSuggest()}>{t('Remettre les conseillés', 'Reset suggested')}</button>
          </div>
          <div className="flex flex-wrap gap-1.5" data-fire-pills>
            {fires.length === 0 && <span className="text-xs opacity-70">{t('Aucun rappel : tu ne seras pas prévenu.', 'No reminder: you will not be notified.')}</span>}
            {fires.map(f => (
              <span key={f.id} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs border ${L ? 'bg-white border-slate-300' : 'bg-white/10 border-slate-600'}`}>
                {fireLabel(f, lang)}
                <button type="button" aria-label={t('Retirer ce rappel', 'Remove this reminder')} className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-500/20" onClick={() => { setFires(fires.filter(x => x.id !== f.id)); setTouchedFires(true); }}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-1.5">
            <select className={`${fieldCls} !w-auto`} value={addK} onChange={e => setAddK(e.target.value as typeof addK)}>
              <option value="before">{t('Avant l\'heure', 'Before')}</option><option value="morning">{t('Le matin', 'Morning')}</option><option value="exact">{t('Date précise', 'Exact date')}</option><option value="overdue">{t('En retard', 'Overdue')}</option><option value="at">{t('À l\'heure', 'At the time')}</option>
            </select>
            {addK === 'before' && <><input type="number" min={1} className={`${fieldCls} !w-16`} value={addN} onChange={e => setAddN(Number(e.target.value) || 1)} />
              <select className={`${fieldCls} !w-auto`} value={addU} onChange={e => setAddU(e.target.value as typeof addU)}><option value="m">min</option><option value="h">{t('heures', 'hours')}</option><option value="d">{t('jours', 'days')}</option><option value="w">{t('semaines', 'weeks')}</option></select></>}
            {addK === 'morning' && <><input type="number" min={0} className={`${fieldCls} !w-16`} value={addD} onChange={e => setAddD(Math.max(0, Number(e.target.value) || 0))} /><span className="text-xs pb-2">{t('jour(s) avant, à', 'day(s) before, at')}</span><input type="time" className={`${fieldCls} !w-auto`} value={addAt} onChange={e => setAddAt(e.target.value)} /></>}
            {addK === 'overdue' && <input type="time" className={`${fieldCls} !w-auto`} value={addAt} onChange={e => setAddAt(e.target.value)} />}
            {addK === 'exact' && <input type="datetime-local" className={`${fieldCls} !w-auto`} value={addIso} onChange={e => setAddIso(e.target.value)} />}
            <button type="button" className={chip(false)} onClick={addFire}>{t('Ajouter', 'Add')}</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /><Users className="w-4 h-4 opacity-70" />{t('Partager avec mon équipe', 'Share with my team')}</label>
        {err && <div className="text-sm text-red-500" role="alert">{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 h-11 rounded-xl text-sm font-semibold cursor-pointer ${L ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'}`}>{t('Annuler', 'Cancel')}</button>
          <button type="button" disabled={busy} onClick={submit} className="flex-1 h-11 rounded-xl text-sm font-bold bg-blue-600 text-white cursor-pointer disabled:opacity-60">{busy ? '…' : t('Enregistrer', 'Save')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Réglages des rappels : heure « du matin », titre masqué, heures calmes, modèles perso. */
const ReminderSettings: React.FC<{ L: boolean; lang: 'fr' | 'en'; cfg: RemCfg; onClose: () => void }> = ({ L, lang, cfg, onClose }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const role = db.getCurrentUser()?.role || 'employee';
  const allowed = (REM_ROLE_TYPES[role] || REM_ROLE_TYPES.employee) as RemType[];
  useLockBodyScroll(true);
  const [morning, setMorning] = useState(cfg.morning);
  const [hide, setHide] = useState(cfg.hide_title);
  const [qf, setQf] = useState(cfg.quiet_from);
  const [qt, setQt] = useState(cfg.quiet_to);
  const [tpls, setTpls] = useState(cfg.templates);
  const [mail, setMail] = useState(!!cfg.mail);
  const [name, setName] = useState('');
  const [base, setBase] = useState<RemType>('task');
  const [msg, setMsg] = useState('');
  const fieldCls = `rounded-xl border px-3 py-2 text-sm ${L ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0a1424] border-slate-600 text-white'}`;
  const save = async () => { const ok = await remSaveCfg({ morning, hide_title: hide, quiet_from: qf, quiet_to: qt, templates: tpls, mail }); setMsg(ok ? t('Enregistré.', 'Saved.') : t('Enregistrement impossible.', 'Could not save.')); if (ok) setTimeout(onClose, 600); };
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={onClose} data-reminder-settings>
      <div className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border p-4 space-y-3 ${L ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1b2d] border-slate-700 text-white'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-bold">{t('Réglages des rappels', 'Reminder settings')}</h2><button type="button" onClick={onClose} aria-label={t('Fermer', 'Close')} className="cursor-pointer"><X className="w-4 h-4" /></button></div>
        <label className="flex items-center justify-between gap-2 text-sm">{t('« Le matin » = ', '“Morning” = ')}<input type="time" className={fieldCls} value={morning} onChange={e => setMorning(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} />{t('Masquer le titre dans la notification', 'Hide the title in the notification')}</label>
        {role === 'admin' && <label className="flex items-start gap-2 text-sm cursor-pointer" data-reminder-mail><input type="checkbox" className="mt-1" checked={mail} onChange={e => setMail(e.target.checked)} /><span>{t('Recevoir aussi les rappels par mail', 'Also receive reminders by email')}<span className="block text-[11px] opacity-70">{t('Réservé au responsable. Marche seulement si la clé du service d\'envoi est installée sur le serveur ; sinon rien n\'est envoyé.', 'Admin only. Works only if the mail service key is installed on the server; otherwise nothing is sent.')}</span></span></label>}
        <div className="text-sm">{t('Heures calmes (aucune notification pendant cette plage)', 'Quiet hours (no notification in this range)')}
          <div className="flex items-center gap-2 mt-1"><input type="time" className={fieldCls} value={qf} onChange={e => setQf(e.target.value)} /><span>→</span><input type="time" className={fieldCls} value={qt} onChange={e => setQt(e.target.value)} />{(qf || qt) && <button type="button" className="text-xs text-blue-500 cursor-pointer" onClick={() => { setQf(''); setQt(''); }}>{t('Aucune', 'None')}</button>}</div></div>
        <div className="text-sm font-bold">{t('Mes modèles de tâche', 'My task templates')}</div>
        <div className="space-y-1">
          {tpls.length === 0 && <div className="text-xs opacity-70">{t('Aucun modèle. Un modèle garde un nom, un type et la série de rappels.', 'No template yet. A template keeps a name, a type and a reminder series.')}</div>}
          {tpls.map(m => <div key={m.id} className="flex items-center justify-between text-sm"><span>★ {m.name} <span className="opacity-60">({REM_TYPE_LABEL[m.base as RemType]?.[lang] || m.base}, {m.fires.length} {t('rappels', 'reminders')})</span></span><button type="button" aria-label={t('Retirer', 'Remove')} className="text-red-500 cursor-pointer" onClick={() => setTpls(tpls.filter(x => x.id !== m.id))}><X className="w-3.5 h-3.5" /></button></div>)}
          <div className="flex flex-wrap gap-2 pt-1">
            <input className={`${fieldCls} flex-1 min-w-[8rem]`} value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder={t('Ex. Contrôle de la caisse', 'e.g. Cash check')} />
            <select className={fieldCls} value={base} onChange={e => setBase(e.target.value as RemType)}>{allowed.map(ty => <option key={ty} value={ty}>{REM_TYPE_LABEL[ty][lang]}</option>)}</select>
            <button type="button" className="px-3 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer" onClick={() => { if (name.trim() && tpls.length < 30) { setTpls([...tpls, { id: `m${Date.now() % 1e7}`, name: name.trim(), color: '', base, fires: remSuggest(base, { morning }), fields: [] }]); setName(''); } }}>{t('Créer', 'Create')}</button>
          </div>
          <div className="text-[11px] opacity-70">{t('La série de rappels du modèle est celle conseillée pour son type.', 'The template uses the suggested reminder series for its type.')}</div>
        </div>
        {msg && <div className="text-sm" role="status">{msg}</div>}
        <button type="button" onClick={save} className="w-full h-11 rounded-xl text-sm font-bold bg-blue-600 text-white cursor-pointer">{t('Enregistrer', 'Save')}</button>
      </div>
    </div>,
    document.body
  );
};

type Tab = 'open' | 'late' | 'done';
/** La carte « À faire ». */
/** `day` (AAAA-MM-JJ) : version « page du jour » du Calendrier : tous les éléments de CE jour, « Ajouter » déjà réglé sur ce jour. */
export const RemindersCard: React.FC<{ day?: string }> = ({ day }) => {
  const { theme, lang } = useApp();
  const L = theme === 'light';
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const me = db.getCurrentUser();
  const [, setTick] = useState(0);
  const [form, setForm] = useState<{ item: RemItem | null } | null>(null);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [open, setOpen] = useState(true);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  useEffect(() => { void remReload(); return remSubscribe(() => setTick(x => x + 1)); }, []);
  const today = todayMada();
  const items = remItems();
  const nextDate = (it: RemItem): string => {
    if (it.repeat.freq === 'none') return it.date;
    return remOccurrences(it, today, remDateOf(Date.now() + 800 * 86400000))[0] || it.date;
  };
  const view = useMemo(() => {
    const active = items.filter(i => i.status === 'todo' || i.status === 'doing');
    const withD = active.map(i => ({ i, d: nextDate(i) }));
    const late = withD.filter(x => x.d < today).sort((a, b) => a.d.localeCompare(b.d));
    const upcoming = withD.filter(x => x.d >= today).sort((a, b) => (a.d + (a.i.all_day ? '00:00' : a.i.time)).localeCompare(b.d + (b.i.all_day ? '00:00' : b.i.time)));
    const done = items.filter(i => i.status === 'done' || i.status === 'canceled').sort((a, b) => (b.done_at || b.date).localeCompare(a.done_at || a.date)).slice(0, 30).map(i => ({ i, d: i.date }));
    return { late, upcoming, done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, today]);
  const dayList = day ? items.filter(i => (i.repeat.freq === 'none' ? i.date === day : remOccurrences(i, day, day).length > 0)).sort((a, b) => (a.all_day ? '00:00' : a.time).localeCompare(b.all_day ? '00:00' : b.time)).map(i => ({ i, d: day })) : [];
  const list = day ? dayList : tab === 'late' ? view.late : tab === 'done' ? view.done : view.upcoming;
  const card = `rounded-3xl border ${L ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f1b2d] border-slate-700/60'}`;
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  const mine = (i: RemItem) => String(i.user_id) === String(me?.id);
  const toggleDone = async (i: RemItem) => {
    const done = i.status === 'done';
    await remSave({ ...i, status: done ? 'todo' : 'done', done_at: done ? '' : new Date().toISOString() });
  };
  const dayLabel = (d: string) => (d === today ? t('Aujourd\'hui', 'Today') : d === remDateOf(Date.now() + 86400000) ? t('Demain', 'Tomorrow') : new Date(d + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
  const tabBtn = (k: Tab, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${tab === k ? 'bg-blue-600 border-blue-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700' : 'bg-transparent border-slate-600 text-slate-300'}`}>{label}{n ? ` (${n})` : ''}</button>
  );
  return (
    <div className={`${card} p-3 sm:p-4 space-y-3`} data-reminders-card>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 font-bold text-sm cursor-pointer" aria-expanded={open}>
          <ListChecks className="w-5 h-5 text-blue-500" />{day ? t('Rappels et tâches du jour', 'Reminders and tasks of the day') : t('À faire', 'To do')}
          {!day && view.late.length > 0 && <span className="text-[11px] font-bold rounded-full bg-red-500 text-white px-1.5">{view.late.length}</span>}
        </button>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('Réglages des rappels', 'Reminder settings')} onClick={() => setSettings(true)} className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${L ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'}`}><BellRing className="w-4 h-4" /></button>
          <button type="button" onClick={() => setForm({ item: null })} className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer" data-reminder-add><Plus className="w-4 h-4" />{t('Ajouter', 'Add')}</button>
        </div>
      </div>
      {open && (
        <>
          {!day && <div className="flex flex-wrap gap-1.5">{tabBtn('open', t('À venir', 'Upcoming'), view.upcoming.length)}{tabBtn('late', t('En retard', 'Overdue'), view.late.length)}{tabBtn('done', t('Fait', 'Done'), 0)}</div>}
          {!remLoaded() && <div className={`text-sm ${sub}`}>{t('Chargement…', 'Loading…')}</div>}
          {remLoaded() && list.length === 0 && <div className={`text-sm ${sub}`}>{day ? t('Rien de prévu ce jour-là. Touche « Ajouter ».', 'Nothing planned that day. Tap “Add”.') : tab === 'open' ? t('Rien à faire pour l\'instant. Touche « Ajouter ».', 'Nothing to do right now. Tap “Add”.') : tab === 'late' ? t('Rien en retard.', 'Nothing overdue.') : t('Rien de fait pour l\'instant.', 'Nothing done yet.')}</div>}
          <ul className="space-y-1.5">
            {list.map(({ i, d }) => (
              <li key={i.id} data-nav={`rem-${i.id}`} className={`rounded-2xl border px-3 py-2 ${L ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-white/[0.03]'}`} style={i.label ? { borderLeft: `4px solid ${i.label}` } : undefined}>
                <div className="flex items-start gap-2">
                  {mine(i) ? (
                    <button type="button" aria-label={i.status === 'done' ? t('Remettre à faire', 'Mark as to do') : t('Marquer comme fait', 'Mark as done')} onClick={() => void toggleDone(i)} className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer ${i.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : L ? 'border-slate-300' : 'border-slate-500'}`}>{i.status === 'done' && <Check className="w-3.5 h-3.5" />}</button>
                  ) : <Users className="w-5 h-5 mt-0.5 shrink-0 opacity-60" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold break-words ${i.status === 'done' || i.status === 'canceled' ? 'line-through opacity-60' : ''}`}>{i.title}</div>
                    <div className={`text-[11px] flex flex-wrap items-center gap-x-2 ${sub}`}>
                      <span>{REM_TYPE_LABEL[i.type][lang]}</span>
                      <span className={d < today && i.status !== 'done' ? 'text-red-500 font-semibold' : ''}>{dayLabel(d)}{i.all_day ? '' : ` · ${i.time}`}</span>
                      <span className={PRIO_COLOR[i.priority]}>{i.priority === 'urgent' ? t('Urgente', 'Urgent') : i.priority === 'high' ? t('Haute', 'High') : ''}</span>
                      {i.repeat.freq !== 'none' && <Repeat className="w-3 h-3" />}
                      {i.fires.length > 0 && <span className="inline-flex items-center gap-0.5"><BellRing className="w-3 h-3" />{i.fires.length}</span>}
                      {i.subtasks.length > 0 && <span>{i.subtasks.filter(s => s.done).length}/{i.subtasks.length}</span>}
                      {i.place && <span>{i.place}</span>}{i.person && <span>{i.person}</span>}
                      {i.amount > 0 && <span>{i.amount.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} Ar</span>}
                    </div>
                  </div>
                  {mine(i) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {(i.status === 'todo' || i.status === 'doing') && <button type="button" aria-label={t('Reporter', 'Snooze')} onClick={() => setSnoozeFor(snoozeFor === i.id ? null : i.id)} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-500/20"><Clock className="w-4 h-4" /></button>}
                      <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => setForm({ item: i })} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-500/20"><Pencil className="w-4 h-4" /></button>
                      <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setSure(sure === i.id ? null : i.id)} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                {snoozeFor === i.id && (
                  <div className="flex flex-wrap gap-1.5 mt-2" data-snooze-menu>
                    {([['10m', '10 min'], ['1h', '1 h'], ['tomorrow', t('Demain', 'Tomorrow')]] as const).map(([k, l]) => (
                      <button key={k} type="button" className="px-3 py-1 rounded-xl text-xs font-semibold bg-blue-600 text-white cursor-pointer" onClick={async () => { await remSnooze(i.id, k); setSnoozeFor(null); }}>{t('Reporter', 'Snooze')} : {l}</button>
                    ))}
                  </div>
                )}
                {sure === i.id && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" data-delete-confirm>
                    <span>{t('Supprimer « ', 'Delete “')}{i.title}{t(' » pour de bon ?', '” for good?')}</span>
                    <button type="button" className="px-3 py-1 rounded-xl bg-red-500 text-white font-semibold cursor-pointer" onClick={async () => { await remDelete(i.id); setSure(null); }}>{t('Oui, supprimer', 'Yes, delete')}</button>
                    <button type="button" className="px-3 py-1 rounded-xl bg-slate-500/20 font-semibold cursor-pointer" onClick={() => setSure(null)}>{t('Non', 'No')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {form && <ReminderForm item={form.item} presetDate={day} onClose={() => setForm(null)} L={L} lang={lang === 'en' ? 'en' : 'fr'} role={String(me?.role || 'employee')} cfg={remCfg()} />}
      {settings && <ReminderSettings L={L} lang={lang === 'en' ? 'en' : 'fr'} cfg={remCfg()} onClose={() => setSettings(false)} />}
    </div>
  );
};
