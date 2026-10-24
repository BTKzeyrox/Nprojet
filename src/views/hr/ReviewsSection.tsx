import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { todayMada } from '../../utils/stats';
import { usePerformance } from '../../utils/usePerformance';
import { LEVEL_NAMES } from '../../utils/performanceScore';
import { reviewReasonText, snapshotOf, type Review, type ReviewObjective, type ReviewSnapshot } from '../../utils/reviews';
import { field, card, btn } from './DossiersSection';

// Évaluation périodique (M5.4). Responsable : crée la fiche (photo des scores du module 3), la partage. Salarié : lit ses fiches partagées et accuse lecture.
// Les « points à améliorer » ne sont jamais envoyés au salarié (le serveur les retire).
const lbl = 'block text-[11px] font-semibold text-slate-400 mb-1';
const fmt = (d: string) => d.split('-').reverse().join('/');
const uid = () => `o-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const shift = (d: string, k: number) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);

const Snapshot: React.FC<{ s: ReviewSnapshot }> = ({ s }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const v = (x: number | null) => (x === null ? '—' : String(x));
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-2.5 text-xs text-slate-300 space-y-0.5">
      <p className="font-bold text-white">{t('Scores à la date de la fiche', 'Scores on the review date')} : {s.score === null ? t('pas assez de données', 'not enough data') : `${s.score}/100`}</p>
      <p>{t('Qualité', 'Quality')} {v(s.components.quality)} · {t('Volume', 'Volume')} {v(s.components.volume)} · {t('Ponctualité', 'Punctuality')} {v(s.components.punctuality)} · {t('Régularité', 'Regularity')} {v(s.components.regularity)}</p>
      <p>{t(`${s.done} mission(s) terminée(s) sur ${s.decided} jugée(s)`, `${s.done} mission(s) done out of ${s.decided} judged`)}{s.rate !== null ? ` · ${s.rate} %` : ''}</p>
      {s.badges.length > 0 && <p>{t('Badges', 'Badges')} : {s.badges.map(b => `${b.id} (${LEVEL_NAMES[b.level][lang === 'en' ? 'en' : 'fr']})`).join(', ')}</p>}
    </div>
  );
};

export const ReviewsSection: React.FC<{ ver: number; isAdmin: boolean; myId: string }> = ({ ver, isAdmin, myId }) => {
  const { lang } = useApp();
  const l = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const today = todayMada();
  const reviews = useMemo(() => db.getReviews().filter(r => isAdmin || r.employee_id === myId), [ver, isAdmin, myId]);
  const people = useMemo(() => db.getUsers().filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name)), [ver]);
  const [form, setForm] = useState<null | { id?: string; employee_id: string; period_start: string; period_end: string; objectives: ReviewObjective[]; strengths: string; comments: string; improvements: string; rating: string; status: 'draft' | 'shared'; refresh: boolean }>(null);
  const [error, setError] = useState('');
  const perf = usePerformance();

  const start = () => { setError(''); setForm({ employee_id: '', period_start: shift(today, -89), period_end: today, objectives: [], strengths: '', comments: '', improvements: '', rating: '', status: 'draft', refresh: true }); };
  const edit = (r: Review) => { setError(''); setForm({ id: r.id, employee_id: r.employee_id, period_start: r.period_start, period_end: r.period_end, objectives: r.objectives, strengths: r.strengths || '', comments: r.comments || '', improvements: r.improvements || '', rating: r.rating ? String(r.rating) : '', status: r.status, refresh: false }); };
  const save = (status: 'draft' | 'shared') => {
    if (!form) return;
    const snap = form.refresh && form.status === 'draft' ? snapshotOf(perf.res.employees.get(form.employee_id), new Date().toISOString()) : undefined;
    const r = db.saveReview({ id: form.id, employee_id: form.employee_id, period_start: form.period_start, period_end: form.period_end, status, objectives: form.objectives, strengths: form.strengths, comments: form.comments, improvements: form.improvements, rating: form.rating ? Number(form.rating) : null, snapshot: snap });
    if (!r.success) { setError(reviewReasonText(r.error || '', l)); return; }
    setForm(null); setError('');
  };
  const set = (p: Partial<NonNullable<typeof form>>) => setForm(f => (f ? { ...f, ...p } : f));

  if (form) {
    const shared = form.status === 'shared';
    return (
      <div className={card} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
        <p className="text-sm font-bold text-white">{form.id ? t('Modifier la fiche', 'Edit the review') : t('Nouvelle fiche d\'évaluation', 'New review')}</p>
        {!form.id && (
          <div><label className={lbl}>{t('Salarié', 'Employee')}</label>
            <select className={field} value={form.employee_id} onChange={e => set({ employee_id: e.target.value })}><option value="">—</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        )}
        {!shared && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>{t('Du', 'From')}</label><input type="date" className={field} value={form.period_start} onChange={e => set({ period_start: e.target.value })} /></div>
            <div><label className={lbl}>{t('Au', 'To')}</label><input type="date" className={field} value={form.period_end} onChange={e => set({ period_end: e.target.value })} /></div>
          </div>
        )}
        {!shared && <label className="flex items-center gap-2 text-sm text-slate-200 min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={form.refresh} onChange={e => set({ refresh: e.target.checked })} />{t('Prendre une photo des scores du module Performance à l\'enregistrement', 'Take a snapshot of the Performance scores when saving')}</label>}
        {shared && <p className="text-[11px] text-slate-500">{t('Fiche partagée : la période et les scores sont figés ; un changement de ce que le salarié voit efface son « lu ».', 'Shared review: the period and scores are frozen; changing what the employee sees clears their "read".')}</p>}
        <p className={lbl}>{t('Objectifs', 'Objectives')}</p>
        {form.objectives.map((o, i) => (
          <div key={o.id} className="flex gap-2 items-center">
            <input type="checkbox" className="w-5 h-5 shrink-0" checked={!!o.done} onChange={e => set({ objectives: form.objectives.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} aria-label={t('Atteint', 'Reached')} />
            <input className={field} value={o.text} maxLength={200} onChange={e => set({ objectives: form.objectives.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label={t('Objectif', 'Objective')} />
            <button type="button" className={btn} onClick={() => set({ objectives: form.objectives.filter((_, j) => j !== i) })} aria-label={t('Retirer', 'Remove')}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {form.objectives.length < 10 && <button type="button" className={btn} onClick={() => set({ objectives: [...form.objectives, { id: uid(), text: '' }] })}><Plus className="w-4 h-4" />{t('Ajouter un objectif', 'Add an objective')}</button>}
        <div><label className={lbl}>{t('Points forts (vus par le salarié)', 'Strengths (seen by the employee)')}</label><textarea className={`${field} py-2 min-h-[80px]`} maxLength={1000} value={form.strengths} onChange={e => set({ strengths: e.target.value })} /></div>
        <div><label className={lbl}>{t('Commentaires (vus par le salarié)', 'Comments (seen by the employee)')}</label><textarea className={`${field} py-2 min-h-[80px]`} maxLength={2000} value={form.comments} onChange={e => set({ comments: e.target.value })} /></div>
        <div><label className={lbl}>{t('Points à améliorer — note PRIVÉE, jamais montrée au salarié', 'Points to improve — PRIVATE note, never shown to the employee')}</label><textarea className={`${field} py-2 min-h-[80px]`} maxLength={1000} value={form.improvements} onChange={e => set({ improvements: e.target.value })} /></div>
        <div><label className={lbl}>{t('Note globale (facultatif)', 'Overall rating (optional)')}</label>
          <select className={field} value={form.rating} onChange={e => set({ rating: e.target.value })}><option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></div>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {!shared && <button type="button" className={`${btn} flex-1 justify-center`} onClick={() => save('draft')}>{t('Enregistrer le brouillon', 'Save the draft')}</button>}
          <button type="button" className={`${btn} flex-1 justify-center bg-emerald-700 border-emerald-500 text-white`} onClick={() => save('shared')}><Send className="w-4 h-4" />{shared ? t('Enregistrer', 'Save') : t('Partager avec le salarié', 'Share with the employee')}</button>
          <button type="button" className={btn} onClick={() => setForm(null)}>{t('Annuler', 'Cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isAdmin && <button type="button" className={`${btn} bg-emerald-700 border-emerald-500 text-white`} onClick={start}><Plus className="w-4 h-4" />{t('Nouvelle fiche d\'évaluation', 'New review')}</button>}
      {reviews.length === 0 && <div className={card}><p className="text-sm text-slate-400">{isAdmin ? t('Aucune fiche pour l\'instant.', 'No review yet.') : t('Aucune évaluation partagée pour l\'instant.', 'No shared review yet.')}</p></div>}
      {reviews.map(r => (
        <div key={r.id} className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[160px]">
              <span className="block text-sm font-bold text-white">{isAdmin ? `${r.employee_name} · ` : ''}{fmt(r.period_start)} → {fmt(r.period_end)}</span>
              <span className="block text-[11px] text-slate-400">{r.rating ? `${t('Note', 'Rating')} ${r.rating}/5 · ` : ''}{r.status === 'draft' ? t('Brouillon (le salarié ne le voit pas)', 'Draft (the employee cannot see it)') : r.acknowledged_at ? t(`Lu le ${fmt(r.acknowledged_at.slice(0, 10))}`, `Read on ${fmt(r.acknowledged_at.slice(0, 10))}`) : t('Partagé, pas encore lu', 'Shared, not read yet')}</span>
            </span>
          </div>
          {r.snapshot && <Snapshot s={r.snapshot} />}
          {r.objectives.length > 0 && <ul className="text-sm text-slate-200 space-y-1">{r.objectives.map(o => (<li key={o.id} className="flex items-start gap-2"><Check className={`w-4 h-4 mt-0.5 shrink-0 ${o.done ? 'text-emerald-400' : 'text-slate-600'}`} aria-hidden="true" /><span>{o.text}{o.done ? ` (${t('atteint', 'reached')})` : ''}</span></li>))}</ul>}
          {r.strengths && <p className="text-sm text-slate-200"><span className="text-slate-400">{t('Points forts', 'Strengths')} : </span>{r.strengths}</p>}
          {r.comments && <p className="text-sm text-slate-200"><span className="text-slate-400">{t('Commentaires', 'Comments')} : </span>{r.comments}</p>}
          {isAdmin && r.improvements && <p className="text-sm text-amber-200"><span className="text-amber-400">{t('Privé — à améliorer', 'Private — to improve')} : </span>{r.improvements}</p>}
          <div className="flex flex-wrap gap-2">
            {isAdmin && <button type="button" className={btn} onClick={() => edit(r)}><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>}
            {isAdmin && <button type="button" className={btn} onClick={() => { const x = db.deleteReview(r.id); if (!x.success) setError(reviewReasonText(x.error || '', l)); }} aria-label={t('Supprimer', 'Delete')}><Trash2 className="w-4 h-4" /></button>}
            {!isAdmin && !r.acknowledged_at && <button type="button" className={`${btn} bg-emerald-700 border-emerald-500 text-white`} onClick={() => db.acknowledgeReview(r.id)}><Check className="w-4 h-4" />{t('J\'ai lu cette évaluation', 'I have read this review')}</button>}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </div>
  );
};
