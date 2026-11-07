// Feuille du jour (module 26, M26.5b) : le responsable ou le Chef d'équipe saisit présence, heures, quantité et refus des opérateurs sans réseau.
// Utilisé par : App.tsx (vue « worksheet »). Règles : utils/workEntry.ts (les mêmes que le serveur). Enregistrement : db.addWorkEntries.
// Pour modifier : les types proposés viennent du modèle d'entreprise (Réglages > Entreprise) ; le brouillon est gardé sur l'appareil (localStorage) tant que la feuille n'est pas enregistrée.
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import type { User } from '../types';
import { readCompany } from '../utils/companyRules';
import { findModel, PRESENCE_LABEL, PRESENCE_VALUES, type WorkType } from '../utils/workTypes';
import { weCanEnterFor, WE_DAYS_BACK } from '../utils/workEntry';

type Row = { presence?: string; hours?: string; quantity?: string; rejected?: string };
const REASON: Record<string, string> = {
  employee: "Cet opérateur n'est pas dans ta liste", type: 'Type de travail inconnu', presence: 'Présence inconnue', hours: 'Heures : 0 à 24', quantity: 'Quantité impossible (0 à 100 000)',
  rejected: 'Refusées : pas plus que les faites', empty: 'Rien à enregistrer', duplicate: 'Déjà saisi pour ce jour et ce type', bad: 'Ligne illisible',
};
const SHEET_ERR: Record<string, string> = { date: "Date impossible : aujourd'hui ou les 31 derniers jours.", empty: 'La feuille est vide.', too_many: 'Trop de lignes (100 au plus).' };
const madaToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const draftKey = (uid: string, date: string, type: string) => `df_worksheet_${uid}_${date}_${type}`;
const readDraft = (k: string): Record<string, Row> => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const saveDraft = (k: string, v: Record<string, Row>) => { try { if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* sans stockage : pas de brouillon */ } };

/** Une feuille ne sert qu'aux types où l'on note la présence, les heures ou la quantité. Le responsable les voit tous ; le Chef d'équipe seulement ceux qui lui sont ouverts. */
const sheetTypes = (types: WorkType[], role: string): WorkType[] => types.filter(t => (t.measure === 'presence' || t.measure === 'quantity') && (role === 'admin' || t.entry.includes(role as any)));

export const WorksheetView: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const L = useApp().theme === 'light';
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string; lines?: string[] } | null>(null);

  const people = db.getUsers().filter(u => u.status !== 'blocked' && weCanEnterFor(me, u)).sort((a, b) => a.name.localeCompare(b.name));
  const key = type ? draftKey(me.id, date, type.id) : '';
  useEffect(() => { setRows(key ? readDraft(key) : {}); setMsg(null); }, [key]);
  const set = (uid: string, patch: Row) => setRows(prev => { const next = { ...prev, [uid]: { ...prev[uid], ...patch } }; if (key) saveDraft(key, next); return next; });

  const showHours = !!type && type.measure === 'presence' && type.pay === 'hour';
  const showQty = !!type && type.measure === 'quantity';
  const showPresence = !!type && type.measure === 'presence';
  const filled = (r?: Row) => !!r && !!(r.presence || (r.hours || '').trim() || (r.quantity || '').trim());

  const save = async () => {
    if (!type) return;
    const entries = people.filter(u => filled(rows[u.id]));
    if (entries.length === 0) { setMsg({ ok: false, text: 'Remplis au moins une ligne.' }); return; }
    setBusy(true); setMsg(null);
    const r = await db.addWorkEntries({ date, type_label: type.name.fr, lines: entries.map(u => ({ employee_id: u.id, work_type: type.id, presence: rows[u.id].presence, hours: rows[u.id].hours, quantity: rows[u.id].quantity, rejected: rows[u.id].rejected })) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'Erreur.' || !r.error ? 'Pas de réseau ou erreur : ta saisie est gardée sur cet appareil, réessaie plus tard.' : (SHEET_ERR[r.error] || r.error) }); return; }
    const failed = r.failed || [];
    const failedIds = new Set(failed.map(f => entries[f.line - 1]?.id).filter(Boolean) as string[]);
    const kept: Record<string, Row> = {}; for (const id of failedIds) kept[id] = rows[id];
    setRows(kept); saveDraft(key, kept);
    const n = r.saved || 0;
    setMsg({
      ok: failed.length === 0,
      text: `${n} ligne${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}${r.validated ? ' et validée' + (n > 1 ? 's' : '') : ' : en attente du responsable'}${failed.length ? `, ${failed.length} refusée${failed.length > 1 ? 's' : ''}` : ''}.`,
      lines: failed.map(f => `${entries[f.line - 1]?.name || `Ligne ${f.line}`} : ${REASON[f.error] || 'refusée'}`),
    });
  };

  const card = `rounded-2xl border ${L ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'} p-4`;
  const input = `h-11 w-full rounded-xl border px-3 text-base ${L ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-600 text-slate-100'} focus:outline-none focus:border-emerald-500`;
  const label = `text-xs font-bold ${L ? 'text-slate-600' : 'text-slate-300'}`;

  return (
    <div className="max-w-3xl mx-auto space-y-4" data-worksheet>
      <h1 className={`text-xl font-bold ${L ? 'text-slate-900' : 'text-white'}`}>Feuille du jour</h1>
      {types.length === 0 ? (
        <div className={`${card} text-sm ${L ? 'text-slate-600' : 'text-slate-300'}`} data-worksheet-notype>
          Aucun type de travail à saisir ici. Choisis ton modèle d'entreprise ou crée ton type de travail dans Réglages &gt; Conditions (présence, heures ou quantité).
        </div>
      ) : (
        <>
          <div className={`${card} grid gap-3 sm:grid-cols-2`}>
            <label className="block space-y-1"><span className={label}>Date</span>
              <input type="date" data-worksheet-date value={date} min={addDays(today, -WE_DAYS_BACK)} max={today} onChange={e => setDate(e.target.value || today)} className={input} /></label>
            <label className="block space-y-1"><span className={label}>Type de travail</span>
              <select data-worksheet-type value={type?.id || ''} onChange={e => setTypeId(e.target.value)} className={input}>{types.map(t => <option key={t.id} value={t.id}>{t.name.fr}</option>)}</select></label>
          </div>

          {people.length === 0 ? (
            <div className={`${card} text-sm ${L ? 'text-slate-600' : 'text-slate-300'}`}>Aucun opérateur dans ta liste{me.role === 'team_lead' ? ' (ton équipe est vide ou non renseignée)' : ''}.</div>
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
                            className={`min-h-[44px] px-1 rounded-xl border text-xs font-semibold cursor-pointer ${r.presence === p ? 'bg-emerald-600 border-emerald-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`}>{PRESENCE_LABEL[p].fr}</button>
                        ))}
                      </div>
                    )}
                    {(showHours || showQty) && (
                      <div className="grid grid-cols-2 gap-2">
                        {showHours && <label className="block space-y-1 col-span-2"><span className={label}>Heures</span><input inputMode="decimal" data-field="hours" value={r.hours || ''} onChange={e => set(u.id, { hours: e.target.value })} className={input} placeholder="8" /></label>}
                        {showQty && <label className="block space-y-1"><span className={label}>Quantité{type?.unit ? ` (${type.unit.fr})` : ''}</span><input inputMode="decimal" data-field="quantity" value={r.quantity || ''} onChange={e => set(u.id, { quantity: e.target.value })} className={input} placeholder="0" /></label>}
                        {showQty && <label className="block space-y-1"><span className={label}>Refusées</span><input inputMode="decimal" data-field="rejected" value={r.rejected || ''} onChange={e => set(u.id, { rejected: e.target.value })} className={input} placeholder="0" /></label>}
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
          <button type="button" data-worksheet-save onClick={save} disabled={busy || people.length === 0} className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 cursor-pointer">
            <Save className="w-5 h-5" />{busy ? 'Enregistrement…' : 'Enregistrer la feuille'}
          </button>
        </>
      )}
    </div>
  );
};
