// Feuille du jour (module 26, M26.5b) : le responsable ou le Chef d'équipe saisit présence, heures, quantité et refus des opérateurs sans réseau.
// Utilisé par : App.tsx (vue « worksheet »). Règles : utils/workEntry.ts (les mêmes que le serveur). Enregistrement : db.addWorkEntries.
// Pour modifier : les types proposés viennent du modèle d'entreprise (Réglages > Entreprise) ; le brouillon est gardé sur l'appareil (localStorage) tant que la feuille n'est pas enregistrée.
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import type { User } from '../types';
import { readCompany } from '../utils/companyRules';
import { findModel, workWord, PRESENCE_LABEL, PRESENCE_VALUES, ABSENCE_REASONS, ABSENCE_LABEL, type WorkType } from '../utils/workTypes';
import { weCanEnterFor, WE_DAYS_BACK } from '../utils/workEntry';
import { summarizeSheet } from '../utils/sheetSummary';
import { PresenceMonthGrid } from '../components/PresenceMonthGrid';
import { workLineDetail } from '../utils/workLineText';
import { missingPeople, dayTotals, copyFromDay } from '../utils/sheetDay';
import { remAddDays } from '../utils/reminderRules';
import { paperSheetHtml, printPaperSheet, applyGroup } from '../utils/paperSheet';

type Row = { presence?: string; hours?: string; quantity?: string; rejected?: string; late_minutes?: string; absence_reason?: string };
const REASON_FR: Record<string, string> = {
  employee: "Cet opérateur n'est pas dans ta liste", type: 'Type de travail inconnu', presence: 'Présence inconnue', hours: 'Heures : 0 à 24', late_minutes: 'Minutes de retard : un nombre entier de 0 à 600', absence_reason: "Motif d'absence inconnu", quantity: 'Quantité impossible (0 à 100 000)',
  rejected: 'Refusées : pas plus que les faites', empty: 'Rien à enregistrer', duplicate: 'Déjà saisi pour ce jour et ce type', bad: 'Ligne illisible',
};
const REASON_EN: Record<string, string> = { employee: 'This operator is not in your list', type: 'Unknown work type', presence: 'Unknown presence', hours: 'Hours: 0 to 24', late_minutes: 'Minutes late: a whole number from 0 to 600', absence_reason: 'Unknown reason for absence', quantity: 'Impossible quantity (0 to 100,000)', rejected: 'Rejected: no more than made', empty: 'Nothing to save', duplicate: 'Already entered for this day and type', bad: 'Unreadable line' };
const SHEET_ERR_EN: Record<string, string> = { date: 'Impossible date: today or the last 31 days.', empty: 'The sheet is empty.', too_many: 'Too many lines (100 at most).' };
const SHEET_ERR: Record<string, string> = { date: "Date impossible : aujourd'hui ou les 31 derniers jours.", empty: 'La feuille est vide.', too_many: 'Trop de lignes (100 au plus).' };
const madaToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const draftKey = (uid: string, date: string, type: string) => `df_worksheet_${uid}_${date}_${type}`;
const readDraft = (k: string): Record<string, Row> => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const saveDraft = (k: string, v: Record<string, Row>) => { try { if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* sans stockage : pas de brouillon */ } };

/** Une feuille ne sert qu'aux types où l'on note la présence, les heures ou la quantité. Le responsable les voit tous ; le Chef d'équipe seulement ceux qui lui sont ouverts. */
const sheetTypes = (types: WorkType[], role: string): WorkType[] => types.filter(t => (t.measure === 'presence' || t.measure === 'quantity') && (role === 'admin' || t.entry.includes(role as any)));

export const WorksheetView: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const app = useApp(); const L = app.theme === 'light'; const en = app.lang === 'en'; const t = (fr: string, e: string) => (en ? e : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const me = db.getCurrentUser() || currentUser;
  const today = madaToday();
  const company = readCompany(db.getSettings().company);
  const model = findModel(company.work.business_model);
  const custom = db.getCustomWorkTypes() as WorkType[];
  const types = useMemo(() => sheetTypes([...(model ? model.types : []), ...custom], me.role), [model, me.role, JSON.stringify(custom)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState(today);
  const [typeId, setTypeId] = useState('');
  const type = types.find(t => t.id === typeId) || types[0];
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [grp, setGrp] = useState({ hours: '', quantity: '', rejected: '' }); // saisie groupée (M26.9)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; lines?: string[] } | null>(null);

  const people = db.getUsers().filter(u => u.status !== 'blocked' && weCanEnterFor(me, u)).sort((a, b) => a.name.localeCompare(b.name));
  const key = type ? draftKey(me.id, date, type.id) : '';
  useEffect(() => { setRows(key ? readDraft(key) : {}); setMsg(null); }, [key]);
  const set = (uid: string, patch: Row) => setRows(prev => { const next = { ...prev, [uid]: { ...prev[uid], ...patch } }; if (key) saveDraft(key, next); return next; });

  const showHours = !!type && type.measure === 'presence' && type.pay === 'hour';
  const showQty = !!type && type.measure === 'quantity';
  const showPresence = !!type && type.measure === 'presence';
  const filled = (r?: Row) => !!r && !!(r.presence || (r.hours || '').trim() || (r.quantity || '').trim());

  const sum = useMemo(() => (type ? summarizeSheet(rows, people, type.id, me, db.getSettings()) : null), [rows, people, type, me.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = (n: number) => `${n.toLocaleString('fr-FR')} Ar`;
  const dayLines = db.getPosts().filter(p => typeof p.id === 'string' && p.id.startsWith(`we-${date}-`) && (p.status === 'completed' || p.status === 'pending_end')); // lignes déjà saisies ce jour-là (M26 T2)
  const missing = type && sum && sum.lines > 0 ? missingPeople(rows, people, dayLines, date, type.id) : []; // M27.1 : personnes oubliées (ne bloque jamais l'enregistrement)
  const myCancelable = me.role === 'admin' ? dayLines : dayLines.filter(p => p.status === 'pending_end' && (p as any).entered_by === me.id); // M27.3 : le chef annule seulement ses lignes en attente
  const totals = dayTotals(dayLines);
  const cancelLine = async (p: { id: string; employee_name?: string; client_name?: string }) => {
    if (!window.confirm(t(`Annuler la ligne de ${p.employee_name || ''} (${p.client_name || ''}) ? Sa paie sera retirée.`, `Cancel ${p.employee_name || ''}'s line (${p.client_name || ''})? Its pay will be removed.`))) return;
    const r = await db.cancelWorkLine(p.id);
    setMsg(r.ok ? { ok: true, text: t('Ligne annulée. Tu peux la saisir à nouveau.', 'Line cancelled. You can enter it again.') } : { ok: false, text: r.error || t('Annulation impossible.', 'Could not cancel.') });
  };
  const groupApply = (patch: { presence?: string; hours?: string; quantity?: string; rejected?: string }) => setRows(prev => { const next = applyGroup(prev, people.map(u => u.id), patch); if (key) saveDraft(key, next); return next; });
  const copyYesterday = () => { // M27.7 : recopie la veille dans les cases vides
    if (!type) return;
    const r = copyFromDay(rows, people, db.getPosts() as any, remAddDays(date, -1), date, type.id);
    if (r.copied === 0) { setMsg({ ok: false, text: t('Rien à copier : personne n\'a de ligne la veille pour ce type, ou les cases sont déjà remplies.', 'Nothing to copy: nobody has a line the day before for this type, or the boxes are already filled.') }); return; }
    setRows(r.rows); if (key) saveDraft(key, r.rows);
    setMsg({ ok: true, text: `${r.copied} ${r.copied > 1 ? t('personnes copiées de la veille', 'people copied from the day before') : t('personne copiée de la veille', 'person copied from the day before')}. ${t('Relis, puis enregistre.', 'Check, then save.')}` });
  };
  const printPaper = () => { if (!type) return; const ok = printPaperSheet(paperSheetHtml(people.map(u => u.name), { name: en ? type.name.en : type.name.fr, measure: type.measure, unit: en ? type.unit?.en : type.unit?.fr }, date, 7, en ? 'en' : 'fr', String((db.getSettings() as any).company_name || ''))); if (!ok) setMsg({ ok: false, text: t("Le navigateur a bloqué la fenêtre d'impression : autorise-la puis réessaie.", 'The browser blocked the print window: allow it and try again.') }); };

  const save = async () => {
    if (!type) return;
    const entries = people.filter(u => filled(rows[u.id]));
    if (entries.length === 0) { setMsg({ ok: false, text: t('Remplis au moins une ligne.', 'Fill in at least one line.') }); return; }
    setBusy(true); setMsg(null);
    const r = await db.addWorkEntries({ date, type_label: type.name.fr, lines: entries.map(u => ({ employee_id: u.id, work_type: type.id, presence: rows[u.id].presence, hours: rows[u.id].hours, quantity: rows[u.id].quantity, rejected: rows[u.id].rejected, late_minutes: rows[u.id].presence === 'late' ? rows[u.id].late_minutes : undefined, absence_reason: rows[u.id].presence === 'absent' ? rows[u.id].absence_reason : undefined })) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'Erreur.' || !r.error ? t('Pas de réseau ou erreur : ta saisie est gardée sur cet appareil, réessaie plus tard.', 'No network or error: your entry is kept on this device, try again later.') : ((en ? SHEET_ERR_EN : SHEET_ERR)[r.error] || r.error) }); return; }
    const failed = r.failed || [];
    const failedIds = new Set(failed.map(f => entries[f.line - 1]?.id).filter(Boolean) as string[]);
    const kept: Record<string, Row> = {}; for (const id of failedIds) kept[id] = rows[id];
    setRows(kept); saveDraft(key, kept);
    const n = r.saved || 0;
    setMsg({
      ok: failed.length === 0,
      text: en
        ? `${n} line${n > 1 ? 's' : ''} saved${r.validated ? ' and approved' : ': waiting for the manager'}${failed.length ? `, ${failed.length} rejected` : ''}.`
        : `${n} ligne${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}${r.validated ? ' et validée' + (n > 1 ? 's' : '') : ' : en attente du responsable'}${failed.length ? `, ${failed.length} refusée${failed.length > 1 ? 's' : ''}` : ''}.`,
      lines: failed.map(f => `${entries[f.line - 1]?.name || `${t('Ligne', 'Line')} ${f.line}`} : ${(en ? REASON_EN : REASON_FR)[f.error] || t('refusée', 'rejected')}`),
    });
  };

  const card = `rounded-2xl border ${L ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'} p-4`;
  const input = `h-11 w-full rounded-xl border px-3 text-base ${L ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-600 text-slate-100'} focus:outline-none focus:border-emerald-500`;
  const label = `text-xs font-bold ${L ? 'text-slate-600' : 'text-slate-300'}`;

  return (
    <div className="max-w-3xl mx-auto space-y-4" data-worksheet>
      <h1 className={`text-xl font-bold ${L ? 'text-slate-900' : 'text-white'}`}>{t('Feuille du jour', 'Daily sheet')}</h1>
      {model && <p data-worksheet-word className={`text-xs ${L ? 'text-slate-500' : 'text-slate-400'}`}>{en ? model.name.en : model.name.fr} · {t('ici on dit', 'here we say')} « {workWord(model.id, en ? 'en' : 'fr')} »</p>}
      {types.length === 0 ? (
        <div className={`${card} text-sm ${L ? 'text-slate-600' : 'text-slate-300'}`} data-worksheet-notype>
          {t("Aucun type de travail à saisir ici. Choisis ton modèle d'entreprise ou crée ton type de travail dans Réglages > Conditions (présence, heures ou quantité).", 'No work type to enter here. Choose your business model or create your own work type in Settings > Conditions (presence, hours or quantity).')}
        </div>
      ) : (
        <>
          <div className={`${card} grid gap-3 sm:grid-cols-2`}>
            <label className="block space-y-1"><span className={label}>{t('Date', 'Date')}</span>
              <input type="date" data-worksheet-date value={date} min={addDays(today, -WE_DAYS_BACK)} max={today} onChange={e => setDate(e.target.value || today)} className={input} /></label>
            <label className="block space-y-1"><span className={label}>{t('Type de travail', 'Work type')}</span>
              <select data-worksheet-type value={type?.id || ''} onChange={e => setTypeId(e.target.value)} className={input}>{types.map(wt => <option key={wt.id} value={wt.id}>{en ? wt.name.en : wt.name.fr}</option>)}</select></label>
          </div>

          {people.length > 0 && (
            <div className={`${card} space-y-2`} data-worksheet-group>
              <div className={`text-xs font-bold ${L ? 'text-slate-600' : 'text-slate-300'}`}>{t('Saisie groupée : remplit d\'un coup les cases vides de toute la liste', 'Group entry: fills the empty boxes of the whole list at once')}</div>
              <div className="flex flex-wrap gap-2 items-end">
                {showPresence && <button type="button" data-group-present onClick={() => groupApply({ presence: 'present' })} className="min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer bg-emerald-600 border-emerald-600 text-white">{t('Tous présents', 'All present')}</button>}
                {showHours && <><label className="block space-y-1"><span className={label}>{t('Heures pour tous', 'Hours for all')}</span><input inputMode="decimal" data-group-hours value={grp.hours} onChange={e => setGrp({ ...grp, hours: e.target.value })} className={`${input} !w-28`} /></label>
                  <button type="button" data-group-hours-apply onClick={() => groupApply({ hours: grp.hours })} className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{t('Appliquer', 'Apply')}</button></>}
                {showQty && <><label className="block space-y-1"><span className={label}>{t('Quantité pour tous', 'Quantity for all')}</span><input inputMode="decimal" data-group-qty value={grp.quantity} onChange={e => setGrp({ ...grp, quantity: e.target.value })} className={`${input} !w-28`} /></label>
                  <button type="button" data-group-qty-apply onClick={() => groupApply({ quantity: grp.quantity })} className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{t('Appliquer', 'Apply')}</button></>}
                <button type="button" data-copy-yesterday onClick={copyYesterday} className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{t('Copier la veille', 'Copy the day before')}</button>
                <button type="button" data-worksheet-print onClick={printPaper} className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{t('Imprimer la feuille papier', 'Print the paper sheet')}</button>
              </div>
            </div>
          )}

          {people.length === 0 ? (
            <div className={`${card} text-sm ${L ? 'text-slate-600' : 'text-slate-300'}`}>{t('Aucun opérateur dans ta liste', 'No operator in your list')}{me.role === 'team_lead' ? t(' (ton équipe est vide ou non renseignée)', ' (your team is empty or not set)') : ''}.</div>
          ) : (
            <div className="space-y-2">
              {people.map(u => {
                const r = rows[u.id] || {};
                return (
                  <div key={u.id} data-worksheet-row={u.id} className={`${card} space-y-2 ${filled(r) ? (L ? 'border-emerald-300' : 'border-emerald-700') : ''}`}>
                    <div className={`font-bold ${L ? 'text-slate-900' : 'text-white'}`}>{u.name}</div>
                    {showPresence && (
                      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`Présence de ${u.name}`}>
                        {PRESENCE_VALUES.map(p => (
                          <button key={p} type="button" aria-pressed={r.presence === p} data-presence={p} onClick={() => set(u.id, { presence: r.presence === p ? undefined : p })}
                            className={`min-h-[44px] px-1 rounded-xl border text-xs font-semibold cursor-pointer ${r.presence === p ? 'bg-emerald-600 border-emerald-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{en ? PRESENCE_LABEL[p].en : PRESENCE_LABEL[p].fr}</button>
                        ))}
                      </div>
                    )}
                    {showPresence && r.presence === 'late' && (
                      <label className="block space-y-1"><span className={label}>{t('Minutes de retard (facultatif)', 'Minutes late (optional)')}</span><input inputMode="numeric" data-field="late_minutes" value={r.late_minutes || ''} onChange={e => set(u.id, { late_minutes: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={input} placeholder="15" /></label>
                    )}
                    {showPresence && r.presence === 'absent' && (
                      <label className="block space-y-1"><span className={label}>{t("Motif d'absence (facultatif)", 'Reason for absence (optional)')}</span>
                        <select data-field="absence_reason" aria-label={t("Motif d'absence", 'Reason for absence')} value={r.absence_reason || ''} onChange={e => set(u.id, { absence_reason: e.target.value || undefined })} className={input}>
                          <option value="">{t('Aucun motif', 'No reason given')}</option>
                          {ABSENCE_REASONS.map(k => <option key={k} value={k}>{en ? ABSENCE_LABEL[k].en : ABSENCE_LABEL[k].fr}</option>)}
                        </select>
                      </label>
                    )}
                    {(showHours || showQty) && (
                      <div className="grid grid-cols-2 gap-2">
                        {showHours && <label className="block space-y-1 col-span-2"><span className={label}>{t('Heures', 'Hours')}</span><input inputMode="decimal" data-field="hours" value={r.hours || ''} onChange={e => set(u.id, { hours: e.target.value })} className={input} placeholder="8" /></label>}
                        {showQty && <label className="block space-y-1"><span className={label}>{t('Quantité', 'Quantity')}{type?.unit ? ` (${en ? type.unit.en : type.unit.fr})` : ''}</span><input inputMode="decimal" data-field="quantity" value={r.quantity || ''} onChange={e => set(u.id, { quantity: e.target.value })} className={input} placeholder="0" /></label>}
                        {showQty && <label className="block space-y-1"><span className={label}>{t('Refusées', 'Rejected')}</span><input inputMode="decimal" data-field="rejected" value={r.rejected || ''} onChange={e => set(u.id, { rejected: e.target.value })} className={input} placeholder="0" /></label>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {msg && (
            <div role="status" data-worksheet-result className={`rounded-2xl border p-3 text-sm ${msg.ok ? (L ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950 border-emerald-700 text-emerald-100') : (L ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-950 border-amber-600 text-amber-100')}`}>
              <div className="flex items-start gap-2 font-semibold">{msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}<span>{msg.text}</span></div>
              {msg.lines && msg.lines.length > 0 && <ul className="mt-1.5 ml-7 list-disc space-y-0.5">{msg.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </div>
          )}
          {sum && sum.lines > 0 && (
            <div data-worksheet-summary className={`${card} space-y-1 text-sm ${L ? 'text-slate-700' : 'text-slate-200'}`}>
              <div className={`text-xs font-bold ${L ? 'text-slate-600' : 'text-slate-300'}`}>{t("Résumé avant d'enregistrer", 'Summary before saving')}</div>
              <div data-summary-lines>{sum.lines} {t(sum.lines > 1 ? 'lignes' : 'ligne', sum.lines > 1 ? 'lines' : 'line')}
                {showPresence && <> · {sum.present} {t(sum.present > 1 ? 'présents' : 'présent', 'present')} · {sum.late} {t('en retard', 'late')} · {sum.half} {t(sum.half > 1 ? 'demi-journées' : 'demi-journée', sum.half > 1 ? 'half days' : 'half day')} · {sum.absent} {t(sum.absent > 1 ? 'absents' : 'absent', 'absent')}</>}
                {showHours && sum.hours > 0 && <> · {sum.hours} {t('h au total', 'h in total')}</>}
                {showQty && <> · {t('quantité', 'quantity')} {sum.quantity}{sum.rejected > 0 ? ` (${t('refusées', 'rejected')} ${sum.rejected})` : ''}</>}
              </div>
              {sum.totalAr !== null ? (
                <div data-summary-total className="font-bold">{t('Paie à inscrire', 'Pay to record')} : {money(sum.totalAr)}{sum.fixed > 0 && <span className="font-normal"> · {sum.fixed} {t('en salaire fixe (payé par période, pas par ligne)', 'on a fixed salary (paid per period, not per line)')}</span>}</div>
              ) : (
                <div data-summary-total className={`text-xs ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('Le montant sera calculé quand le responsable validera cette feuille.', 'The amount will be worked out when the manager approves this sheet.')}</div>
              )}
            </div>
          )}
          {missing.length > 0 && (
            <div data-worksheet-missing role="status" className={`rounded-xl border p-3 text-sm ${L ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-950 border-amber-600 text-amber-100'}`}>
              {missing.length} {missing.length > 1 ? t('opérateurs sans ligne', 'operators without a line') : t('opérateur sans ligne', 'operator without a line')} :{' '}
              {missing.slice(0, 6).map((u, i) => (
                <React.Fragment key={u.id}>{i > 0 && ', '}<button type="button" data-missing-name onClick={() => document.querySelector(`[data-worksheet-row="${u.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="underline font-semibold cursor-pointer min-h-[44px]">{u.name}</button></React.Fragment>
              ))}
              {missing.length > 6 && <> {t('et', 'and')} {missing.length - 6} {t('autres', 'more')}</>}
              <div className="text-xs mt-1 opacity-80">{t("Tu peux enregistrer quand même (absent, en congé…).", 'You can still save (absent, on leave…).')}</div>
            </div>
          )}
          <button type="button" data-worksheet-save onClick={save} disabled={busy || people.length === 0} className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 cursor-pointer">
            <Save className="w-5 h-5" />{busy ? t('Enregistrement…', 'Saving…') : t('Enregistrer la feuille', 'Save the sheet')}
          </button>

          {myCancelable.length > 0 && (
            <div className={`${card} space-y-2`} data-worksheet-existing>
              <div className={`text-xs font-bold ${L ? 'text-slate-600' : 'text-slate-300'}`}>{t('Déjà saisi ce jour-là : une erreur ? Annule la ligne et saisis-la à nouveau.', 'Already entered that day: a mistake? Cancel the line and enter it again.')}</div>
              <div data-day-totals className={`text-xs font-semibold ${L ? 'text-slate-700' : 'text-slate-200'}`}>{totals.lines} {totals.lines > 1 ? t('lignes', 'lines') : t('ligne', 'line')} · {totals.present} {totals.present > 1 ? t('présents', 'present') : t('présent', 'present')} · {t('total', 'total')} {money(totals.validatedAr)}{totals.pending > 0 && <> · {t('en attente', 'pending')} : {totals.pending} {totals.pending > 1 ? t('lignes', 'lines') : t('ligne', 'line')}</>}</div>
              {myCancelable.map(p => (
                <div key={p.id} data-existing-line={p.id} className={`flex items-center gap-2 rounded-xl border p-2 ${L ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-800'}`}>
                  <div className="flex-1 min-w-0 text-sm"><div className="font-semibold truncate">{p.employee_name} · {p.client_name}</div><div className={`text-xs ${L ? 'text-slate-500' : 'text-slate-400'}`}>{workLineDetail(p)}</div></div>
                  <button type="button" data-cancel-line onClick={() => cancelLine(p)} className="min-h-[44px] px-3 rounded-xl border border-red-500 text-red-600 text-sm font-semibold cursor-pointer">{t('Annuler', 'Cancel')}</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <PresenceMonthGrid people={people} today={today} L={L} en={en} />
    </div>
  );
};
