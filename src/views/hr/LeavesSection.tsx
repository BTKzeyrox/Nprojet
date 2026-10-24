import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { todayMada } from '../../utils/stats';
import { readCompany } from '../../utils/companyRules';
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, LEAVE_TYPES, leaveBalance, leaveReasonText, workingDays, type Leave, type LeaveType } from '../../utils/leaves';
import { field, card, btn } from './DossiersSection';

// Congés (M5.2). Salarié : solde, demande, annulation. Responsable : décider, enregistrer un congé, annuler, supprimer.
const lbl = 'block text-[11px] font-semibold text-slate-400 mb-1';
const fmt = (d: string) => d.split('-').reverse().join('/');
const statusCls: Record<Leave['status'], string> = { pending: 'bg-amber-900/60 text-amber-300', approved: 'bg-emerald-900/60 text-emerald-300', rejected: 'bg-red-900/60 text-red-300', cancelled: 'bg-slate-700 text-slate-300' };

export const LeavesSection: React.FC<{ ver: number; isAdmin: boolean; myId: string }> = ({ ver, isAdmin, myId }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 1 : 0;
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const today = todayMada();
  const [form, setForm] = useState({ employee_id: '', type: 'paid' as LeaveType, start_date: today, end_date: today, reason: '', approved: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ask, setAsk] = useState<{ id: string; status: 'rejected' | 'cancelled'; text: string } | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const data = useMemo(() => {
    const leaves = db.getLeaves();
    const co = readCompany(db.getSettings().company);
    return { leaves, allowance: Number(co.leave.leave_days_per_year) || 0, perWeek: Number(co.leave.work_days_per_week) || 0, people: db.getUsers().filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver]);
  const { leaves, allowance, perWeek, people } = data;
  const year = Number(today.slice(0, 4));
  const mine = leaves.filter(x => x.employee_id === myId);
  const bal = leaveBalance(leaves, isAdmin ? form.employee_id : myId, year, allowance, perWeek);
  const nbDays = form.start_date && form.end_date && form.end_date >= form.start_date ? workingDays(form.start_date, form.end_date, perWeek) : 0;

  const submit = () => {
    const r = db.requestLeave({ ...form, employee_id: isAdmin ? form.employee_id : undefined, approved: isAdmin && form.approved });
    if (!r.success) { setError(r.error === 'employee' ? t('Choisis un salarié.', 'Choose an employee.') : leaveReasonText(r.error || '', lang === 'en' ? 'en' : 'fr')); setNotice(''); return; }
    setError(''); setNotice(isAdmin ? t('Congé enregistré.', 'Leave recorded.') : t('Demande envoyée : le responsable va répondre.', 'Request sent: the manager will answer.'));
    setForm(f => ({ ...f, reason: '', approved: false }));
  };
  const decide = (id: string, status: 'approved' | 'rejected' | 'cancelled', reason?: string) => {
    const r = db.decideLeave(id, status, reason);
    if (!r.success) { setError(leaveReasonText(r.error || '', lang === 'en' ? 'en' : 'fr')); return; }
    setError(''); setNotice(''); setAsk(null);
  };
  const remove = (id: string) => { const r = db.deleteLeave(id); if (!r.success) setError(leaveReasonText(r.error || '')); else setError(''); };

  const list = (isAdmin ? leaves : mine).filter(x => (isAdmin && filter === 'open' ? x.status === 'pending' || (x.status === 'approved' && x.end_date >= today) : true));
  const nameOf = (x: Leave) => x.employee_name || people.find(p => p.id === x.employee_id)?.name || '';

  return (
    <div className="space-y-3">
      {(allowance > 0 || !isAdmin) && !isAdmin && (
        <div className={card}>
          <p className="text-sm font-bold text-white">{t(`Mes congés payés ${year}`, `My paid leave ${year}`)}</p>
          {allowance > 0 ? (
            <p className="text-sm text-slate-300">{t(`${bal.left} jour(s) restant(s) sur ${bal.allowance}`, `${bal.left} day(s) left out of ${bal.allowance}`)} · {t(`pris : ${bal.used}`, `taken: ${bal.used}`)}{bal.pending > 0 ? ` · ${t(`en attente : ${bal.pending}`, `pending: ${bal.pending}`)}` : ''}</p>
          ) : <p className="text-sm text-slate-400">{t("Le nombre de jours par an n'est pas réglé : pas de solde.", 'The yearly number of days is not set: no balance.')}</p>}
        </div>
      )}
      <div className={card}>
        <p className="text-sm font-bold text-white">{isAdmin ? t('Enregistrer un congé', 'Record a leave') : t('Demander un congé', 'Request leave')}</p>
        {isAdmin && (
          <div><label className={lbl}>{t('Salarié', 'Employee')}</label>
            <select className={field} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">—</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div><label className={lbl}>{t('Type', 'Type')}</label>
            <select className={field} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LeaveType })}>
              {LEAVE_TYPES.map(k => <option key={k} value={k}>{LEAVE_TYPE_LABELS[k][l]}</option>)}
            </select></div>
          <div><label className={lbl}>{t('Du', 'From')}</label><input type="date" className={field} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value, end_date: form.end_date < e.target.value ? e.target.value : form.end_date })} /></div>
          <div><label className={lbl}>{t('Au (inclus)', 'To (included)')}</label><input type="date" className={field} value={form.end_date} min={form.start_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
        </div>
        <input className={field} placeholder={t('Motif (facultatif)', 'Reason (optional)')} maxLength={300} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} aria-label={t('Motif', 'Reason')} />
        <p className="text-[11px] text-slate-400">{t(`${nbDays} jour(s) ouvré(s)`, `${nbDays} working day(s)`)}{isAdmin && form.employee_id && allowance > 0 && form.type === 'paid' ? ` · ${t(`solde restant : ${bal.left}`, `balance left: ${bal.left}`)}` : ''}</p>
        {isAdmin && <label className="flex items-center gap-2 text-sm text-slate-200 min-h-[44px]"><input type="checkbox" checked={form.approved} onChange={e => setForm({ ...form, approved: e.target.checked })} className="w-5 h-5" />{t('Déjà accepté', 'Already approved')}</label>}
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        {notice && <p className="text-sm text-emerald-400" role="status">{notice}</p>}
        <button type="button" className={`${btn} bg-emerald-700 border-emerald-500 text-white justify-center`} onClick={submit}><Plus className="w-4 h-4" />{isAdmin ? t('Enregistrer', 'Record') : t('Envoyer la demande', 'Send the request')}</button>
      </div>
      {isAdmin && (
        <div className="flex gap-1.5" role="tablist">
          {(['open', 'all'] as const).map(k => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border px-3 ${filter === k ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}>{k === 'open' ? t('À traiter et à venir', 'To handle and upcoming') : t('Tout l\'historique', 'Full history')}</button>)}
        </div>
      )}
      {list.length === 0 && <div className={card}><p className="text-sm text-slate-400">{t('Aucune demande.', 'No request.')}</p></div>}
      {list.map(x => {
        const started = x.start_date <= today;
        return (
          <div key={x.id} className={card}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[160px]">
                <span className="block text-sm font-bold text-white">{isAdmin ? `${nameOf(x)} · ` : ''}{LEAVE_TYPE_LABELS[x.type][l]}</span>
                <span className="block text-[11px] text-slate-400">{fmt(x.start_date)} → {fmt(x.end_date)} · {t(`${x.days} j ouvré(s)`, `${x.days} working d`)}{x.reason ? ` · ${x.reason}` : ''}</span>
                {x.decision_reason && <span className="block text-[11px] text-slate-300">{t('Réponse', 'Answer')} : {x.decision_reason}</span>}
              </span>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${statusCls[x.status]}`}>{LEAVE_STATUS_LABELS[x.status][l]}</span>
            </div>
            {ask?.id === x.id ? (
              <div className="space-y-2">
                <input className={field} autoFocus placeholder={t('Motif (3 caractères au moins)', 'Reason (at least 3 characters)')} maxLength={300} value={ask.text} onChange={e => setAsk({ ...ask, text: e.target.value })} aria-label={t('Motif', 'Reason')} />
                <div className="flex gap-2">
                  <button type="button" className={`${btn} flex-1 justify-center bg-red-800 border-red-600 text-white`} onClick={() => decide(x.id, ask.status, ask.text)}>{ask.status === 'rejected' ? t('Refuser', 'Refuse') : t('Annuler le congé', 'Cancel the leave')}</button>
                  <button type="button" className={`${btn} flex-1 justify-center`} onClick={() => setAsk(null)}>{t('Retour', 'Back')}</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {isAdmin && x.status === 'pending' && <button type="button" className={`${btn} bg-emerald-700 border-emerald-500 text-white`} onClick={() => decide(x.id, 'approved')}><Check className="w-4 h-4" />{t('Accepter', 'Approve')}</button>}
                {isAdmin && x.status === 'pending' && <button type="button" className={btn} onClick={() => setAsk({ id: x.id, status: 'rejected', text: '' })}><X className="w-4 h-4" />{t('Refuser', 'Refuse')}</button>}
                {isAdmin && x.status === 'approved' && <button type="button" className={btn} onClick={() => setAsk({ id: x.id, status: 'cancelled', text: '' })}>{t('Annuler', 'Cancel')}</button>}
                {!isAdmin && (x.status === 'pending' || (x.status === 'approved' && !started)) && <button type="button" className={btn} onClick={() => decide(x.id, 'cancelled')}>{t('Annuler ma demande', 'Cancel my request')}</button>}
                {isAdmin && (x.status === 'cancelled' || x.status === 'rejected') && <button type="button" className={btn} onClick={() => remove(x.id)} aria-label={t('Supprimer', 'Delete')}><Trash2 className="w-4 h-4" /></button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
