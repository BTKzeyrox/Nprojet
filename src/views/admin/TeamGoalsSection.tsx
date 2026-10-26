import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { askConfirm } from '../../components/ConfirmModal';
import { todayMada } from '../../utils/stats';
import { TEAM_GOAL_LIMITS, TEAM_GOAL_METRIC_LABEL, TEAM_GOAL_STATUS_LABEL, teamGoalActual, teamGoalAppliesTo, teamGoalProgress, teamGoalStatus, type TeamGoal, type TeamGoalMetric, type TeamGoalStatus } from '../../utils/teamGoals';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';
const STATUS_CLS: Record<TeamGoalStatus, string> = {
  reached: 'text-emerald-300 border-emerald-500', open: 'text-sky-300 border-sky-500', missed: 'text-red-300 border-red-500', upcoming: 'text-slate-300 border-slate-500', no_data: 'text-slate-400 border-slate-600',
};
const BAR_CLS: Record<TeamGoalStatus, string> = { reached: 'bg-emerald-500', open: 'bg-sky-500', missed: 'bg-red-500', upcoming: 'bg-slate-500', no_data: 'bg-slate-600' };
const shiftMonth = (m: string, n: number): string => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };

interface Draft { id: string; name: string; scope: string; employee_id: string; metric: string; target: string; allMonths: boolean; month: string }
const EMPTY = (month: string): Draft => ({ id: '', name: '', scope: 'team', employee_id: '', metric: 'done', target: '', allMonths: true, month });

/** Onglet « Objectifs » de la page Performance (M15.3) : objectifs d'équipe et de salarié. La valeur réelle est CALCULÉE à partir des missions, jamais saisie. Chaque action est enregistrée tout de suite. */
export const TeamGoalsSection: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const today = todayMada();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [goals, setGoals] = useState<TeamGoal[]>(db.getTeamGoals());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => db.subscribe(() => setGoals(db.getTeamGoals())), []);
  const posts = db.getPosts();
  const staff = db.getUsers().filter(u => (u.role === 'employee' || u.role === 'team_lead') && u.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id?: string) => db.getUsers().find(u => u.id === id)?.name || id || '';
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shown = goals.filter(g => teamGoalAppliesTo(g, month));

  const save = () => {
    if (!draft) return;
    const r = db.saveTeamGoal({ id: draft.id || undefined, name: draft.name, scope: draft.scope, ...(draft.scope === 'employee' ? { employee_id: draft.employee_id } : {}), metric: draft.metric, target: draft.target.trim() === '' ? 0 : Number(draft.target), month: draft.allMonths ? '' : draft.month });
    if (!r.success) { setError(r.error || t('Enregistrement impossible.', 'Could not save.')); return; }
    setError(''); setDraft(null);
  };
  const remove = (g: TeamGoal) => askConfirm({
    title: t(`Supprimer l'objectif « ${g.name} » ?`, `Delete the goal “${g.name}”?`), message: t('Les missions ne changent pas.', 'Missions are not changed.'),
    confirmLabel: t('Supprimer', 'Delete'), danger: true, onConfirm: () => { const r = db.removeTeamGoal(g.id); if (!r.success) setError(r.error || ''); },
  });
  const set = (p: Partial<Draft>) => draft && setDraft({ ...draft, ...p });

  return (
    <div className="space-y-3">
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <h2 className="font-tactical font-black text-white text-base sm:text-lg">{t('Objectifs', 'Goals')}</h2>
        <p className="text-[11px] text-slate-400">{t('Un objectif a une cible (la valeur prévue). La valeur réelle est calculée à partir des missions du mois : elle n\'est jamais saisie. Taux de validation = missions validées sur missions jugées (validées + refusées).', 'A goal has a target (the planned value). The actual value is computed from the month\'s missions: it is never typed in. Validation rate = validated missions out of judged missions (validated + rejected).')}</p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('Mois précédent', 'Previous month')} onClick={() => setMonth(shiftMonth(month, -1))} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 text-center text-sm font-semibold text-white capitalize">{monthLabel(month)}</div>
          <button type="button" aria-label={t('Mois suivant', 'Next month')} onClick={() => setMonth(shiftMonth(month, 1))} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {error && !draft && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
        {shown.length === 0 && !draft && <p className="text-xs text-slate-500">{goals.length === 0 ? t('Aucun objectif.', 'No goal.') : t('Aucun objectif pour ce mois.', 'No goal for this month.')}</p>}
        <ul className="space-y-2">
          {shown.map(g => {
            const a = teamGoalActual(g, posts, month);
            const st = teamGoalStatus(g, a.actual, month, today);
            const pr = teamGoalProgress(g.target, a.actual);
            const unit = TEAM_GOAL_METRIC_LABEL[g.metric as TeamGoalMetric].unit;
            return (
              <li key={g.id} className="rounded-xl border border-slate-700 p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white break-words">{g.name}</div>
                    <div className="text-[11px] text-slate-400 break-words">{g.scope === 'team' ? t('Toute l\'équipe', 'Whole team') : nameOf(g.employee_id)} · {TEAM_GOAL_METRIC_LABEL[g.metric as TeamGoalMetric][lang === 'en' ? 'en' : 'fr']} · {g.month === '' ? t('chaque mois', 'every month') : monthLabel(g.month)}</div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[st]}`}>{TEAM_GOAL_STATUS_LABEL[st][lang === 'en' ? 'en' : 'fr']}</span>
                  <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => { setError(''); setDraft({ id: g.id, name: g.name, scope: g.scope, employee_id: g.employee_id || '', metric: g.metric, target: String(g.target), allMonths: g.month === '', month: g.month || month }); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-600 text-slate-200"><Pencil className="w-4 h-4" /></button>
                  <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => remove(g)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-red-500/50 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pr.pct}><div className={`h-full ${BAR_CLS[st]}`} style={{ width: `${pr.pct}%` }} /></div>
                <div className="flex flex-wrap justify-between gap-x-3 text-xs font-mono text-slate-300">
                  <span>{t('Prévu', 'Planned')} : {g.target}{unit}</span>
                  <span>{t('Réel', 'Actual')} : {a.actual === null ? '—' : `${a.actual}${unit}`}</span>
                  <span>{a.actual === null ? t('Aucune mission jugée', 'No judged mission') : pr.gap > 0 ? `${t('Reste', 'Left')} : ${pr.gap}${unit}` : t('Écart : 0', 'Gap: 0')}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {draft ? (
          <div className="space-y-3 rounded-xl border border-emerald-500/40 p-3">
            {error && <div role="alert" className="text-xs text-red-400 font-semibold">{error}</div>}
            <div><label className={labelCls}>{t('Nom de l\'objectif', 'Goal name')}</label><input value={draft.name} maxLength={TEAM_GOAL_LIMITS.name} onChange={e => set({ name: e.target.value })} className={inputCls} placeholder={t('ex : 40 missions validées', 'e.g. 40 validated missions')} /></div>
            <div><label className={labelCls}>{t('Pour', 'For')}</label>
              <select value={draft.scope} onChange={e => set({ scope: e.target.value })} className={inputCls}>
                <option value="team">{t('Toute l\'équipe', 'Whole team')}</option><option value="employee">{t('Un salarié', 'One employee')}</option>
              </select></div>
            {draft.scope === 'employee' && (
              <div><label className={labelCls}>{t('Salarié', 'Employee')}</label>
                <select value={draft.employee_id} onChange={e => set({ employee_id: e.target.value })} className={inputCls}>
                  <option value="">{t('Choisir…', 'Choose…')}</option>
                  {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>{t('Mesure', 'Measure')}</label>
                <select value={draft.metric} onChange={e => set({ metric: e.target.value })} className={inputCls}>
                  <option value="done">{TEAM_GOAL_METRIC_LABEL.done[lang === 'en' ? 'en' : 'fr']}</option><option value="rate">{TEAM_GOAL_METRIC_LABEL.rate[lang === 'en' ? 'en' : 'fr']}</option>
                </select></div>
              <div><label className={labelCls}>{draft.metric === 'rate' ? t('Cible (en %)', 'Target (in %)') : t('Cible (missions)', 'Target (missions)')}</label><input inputMode="numeric" value={draft.target} onChange={e => set({ target: e.target.value.replace(/[^\d]/g, '') })} className={inputCls} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={draft.allMonths} onChange={e => set({ allMonths: e.target.checked })} className="w-5 h-5" />{t('Chaque mois', 'Every month')}</label>
            {!draft.allMonths && <div><label className={labelCls}>{t('Mois', 'Month')}</label><input type="month" value={draft.month} onChange={e => set({ month: e.target.value })} className={inputCls} /></div>}
            <div className="flex gap-2">
              <button type="button" onClick={save} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
              <button type="button" onClick={() => { setDraft(null); setError(''); }} className="min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-200 text-sm">{t('Annuler', 'Cancel')}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setError(''); setDraft(EMPTY(month)); }} className="min-h-[44px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" />{t('Nouvel objectif', 'New goal')}</button>
        )}
      </div>
    </div>
  );
};
