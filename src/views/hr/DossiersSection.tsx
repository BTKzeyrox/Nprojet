import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { todayMada } from '../../utils/stats';
import { HR_CONTRACT_LABELS, currentRate, endOfTermIn, seniorityMonths, seniorityText, type HrContract, type HrFile } from '../../utils/hrFile';
import type { User } from '../../types';

// Dossier du salarié (M5.1). Le responsable remplit et modifie ; le salarié lit le sien (« Mon dossier »).
// Les liens des documents sont des liens https (le site ne stocke pas de fichier ici). Le serveur revérifie tout.

export const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
export const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
export const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5';
const lbl = 'block text-[11px] font-semibold text-slate-400 mb-1';
const fmtDate = (d?: string) => (d ? d.split('-').reverse().join('/') : '—');
const fmtAr = (n: number) => `${n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} Ar`;

interface Editor { userId: string; position: string; hire_date: string; contract_type: string; contract_end: string; trial_end: string; e_name: string; e_phone: string; e_rel: string; docs: { id: string; name: string; url: string }[]; rates: { id: string; date: string; from: string; to: string; reason: string }[] }
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const toEditor = (u: User): Editor => {
  const h = u.hr || {};
  return {
    userId: u.id, position: h.position || '', hire_date: h.hire_date || '', contract_type: h.contract_type || '', contract_end: h.contract_end || '', trial_end: h.trial_end || '',
    e_name: h.emergency?.name || '', e_phone: h.emergency?.phone || '', e_rel: h.emergency?.relation || '',
    docs: (h.documents || []).map(d => ({ id: d.id, name: d.name, url: d.url })),
    rates: (h.rate_history || []).map(r => ({ id: r.id, date: r.date, from: r.from_ar !== undefined ? String(r.from_ar) : '', to: String(r.to_ar), reason: r.reason || '' })),
  };
};
const fromEditor = (e: Editor): HrFile => ({
  position: e.position, hire_date: e.hire_date, contract_type: (e.contract_type || undefined) as HrContract | undefined, contract_end: e.contract_end, trial_end: e.trial_end,
  emergency: { name: e.e_name, phone: e.e_phone, relation: e.e_rel },
  documents: e.docs.map(d => ({ id: d.id, name: d.name, url: d.url })),
  rate_history: e.rates.map(r => ({ id: r.id, date: r.date, to_ar: r.to as unknown as number, ...(r.from !== '' ? { from_ar: r.from as unknown as number } : {}), reason: r.reason })),
});

/** Lecture d'un dossier (admin dans la liste, salarié dans « Mon dossier »). */
export const DossierView: React.FC<{ user: User; showRates?: boolean }> = ({ user, showRates = true }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const h = user.hr;
  const today = todayMada();
  if (!h) return <p className="text-sm text-slate-400">{t("Le dossier n'est pas encore rempli.", 'The file is not filled in yet.')}</p>;
  const sen = seniorityText(seniorityMonths(h.hire_date, today), lang === 'en' ? 'en' : 'fr');
  const row = (k: string, v: React.ReactNode) => (<div className="flex flex-wrap justify-between gap-x-3 text-sm py-1 border-b border-slate-800 last:border-0"><span className="text-slate-400">{k}</span><span className="text-white font-medium text-right">{v}</span></div>);
  const rate = currentRate(h);
  return (
    <div className="space-y-2">
      {row(t('Poste', 'Position'), h.position || '—')}
      {row(t("Date d'embauche", 'Hire date'), h.hire_date ? `${fmtDate(h.hire_date)}${sen ? ` (${sen})` : ''}` : '—')}
      {row(t('Contrat', 'Contract'), h.contract_type ? HR_CONTRACT_LABELS[h.contract_type][lang === 'en' ? 1 : 0] : '—')}
      {h.trial_end && row(t("Fin de la période d'essai", 'Trial period ends'), fmtDate(h.trial_end))}
      {h.contract_end && row(t('Fin du contrat', 'Contract ends'), fmtDate(h.contract_end))}
      {row(t("Contact d'urgence", 'Emergency contact'), h.emergency?.name ? `${h.emergency.name}${h.emergency.relation ? ` (${h.emergency.relation})` : ''}${h.emergency.phone ? ` · ${h.emergency.phone}` : ''}` : '—')}
      {!!h.documents?.length && row(t('Documents', 'Documents'), (<span className="flex flex-col items-end">{h.documents.map(d => (<a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">{d.name}</a>))}</span>))}
      {showRates && !!h.rate_history?.length && (
        <div className="pt-2">
          <p className="text-[11px] font-semibold text-slate-400 mb-1">{t('Historique des tarifs', 'Rate history')}{rate ? ` · ${t('dernier', 'latest')} : ${fmtAr(rate.to_ar)}` : ''}</p>
          {[...h.rate_history].reverse().map(r => (<p key={r.id} className="text-xs text-slate-300">{fmtDate(r.date)} : {r.from_ar !== undefined ? `${fmtAr(r.from_ar)} → ` : ''}{fmtAr(r.to_ar)}{r.reason ? ` — ${r.reason}` : ''}</p>))}
        </div>
      )}
    </div>
  );
};

export const DossiersSection: React.FC<{ ver: number }> = ({ ver }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  useLockBodyScroll(!!editor);
  const today = todayMada();
  const people = useMemo(() => db.getUsers().filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name)), [ver]);
  const rows = people.filter(u => !q.trim() || `${u.name} ${u.hr?.position || ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  const errors: Record<string, [string, string]> = {
    hr: ['Dossier illisible.', 'Unreadable file.'], hire_date: ["Date d'embauche incorrecte (jour/mois/année réels, depuis 1990).", 'Wrong hire date (real day/month/year, from 1990).'],
    contract_type: ['Type de contrat inconnu.', 'Unknown contract type.'], contract_end: ["Fin de contrat incorrecte (pas avant l'embauche).", 'Wrong contract end (not before the hire date).'],
    trial_end: ["Fin d'essai incorrecte (pas avant l'embauche).", 'Wrong trial end (not before the hire date).'],
    emergency: ["Contact d'urgence incorrect (un numéro demande un nom ; chiffres, espaces et + seulement).", 'Wrong emergency contact (a number needs a name; digits, spaces and + only).'],
    documents: ['Documents incorrects (10 au plus, un nom et un lien https chacun).', 'Wrong documents (10 at most, each with a name and an https link).'],
    rate_history: ['Tarifs incorrects (date réelle et montant positif ; 50 lignes au plus).', 'Wrong rates (real date and positive amount; 50 rows at most).'],
    admin: ['Réservé au responsable.', 'Admins only.'], missing: ["Cette personne n'existe plus.", 'This person no longer exists.'],
  };
  const say = (c?: string) => { const m = errors[c || ''] || ["Impossible d'enregistrer.", 'Could not save.']; return t(m[0], m[1]); };
  const save = () => {
    if (!editor) return;
    const r = db.setUserHr(editor.userId, fromEditor(editor));
    if (!r.success) { setError(say(r.error)); return; }
    setEditor(null); setError('');
  };
  const set = (p: Partial<Editor>) => setEditor(e => (e ? { ...e, ...p } : e));

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${field} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Chercher un nom ou un poste', 'Search a name or a position')} aria-label={t('Chercher', 'Search')} />
        </div>
        <p className="text-[11px] text-slate-500">{t('Visible par toi et par la personne concernée seulement.', 'Visible to you and to the person concerned only.')}</p>
        {error && !editor && <p className="text-sm text-red-400">{error}</p>}
      </div>
      {rows.length === 0 && <div className={card}><p className="text-sm text-slate-400">{t('Aucun salarié.', 'No employee.')}</p></div>}
      {rows.map(u => {
        const open = openId === u.id;
        const end = endOfTermIn(u.hr, today);
        const sen = seniorityText(seniorityMonths(u.hr?.hire_date, today), lang === 'en' ? 'en' : 'fr');
        return (
          <div key={u.id} className={card}>
            <button type="button" onClick={() => setOpenId(open ? null : u.id)} className="w-full flex items-center gap-2 text-left min-h-[44px]" aria-expanded={open}>
              {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="flex-1">
                <span className="block text-sm font-bold text-white">{u.name}</span>
                <span className="block text-[11px] text-slate-400">{[u.hr?.position, u.hr?.contract_type ? HR_CONTRACT_LABELS[u.hr.contract_type][lang === 'en' ? 1 : 0] : '', sen].filter(Boolean).join(' · ') || t('Dossier vide', 'Empty file')}</span>
              </span>
              {end && end.days <= 30 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-900/60 text-amber-300">{end.kind === 'trial' ? t('Fin d\'essai', 'Trial ends') : t('Fin de contrat', 'Contract ends')} · {end.days === 0 ? t('aujourd\'hui', 'today') : t(`dans ${end.days} j`, `in ${end.days} d`)}</span>}
            </button>
            {open && (
              <>
                <DossierView user={u} />
                <button type="button" className={btn} onClick={() => { setEditor(toEditor(u)); setError(''); }}><Pencil className="w-4 h-4" />{t('Modifier le dossier', 'Edit the file')}</button>
              </>
            )}
          </div>
        );
      })}
      {editor && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto bg-[#0f1722] border border-slate-700 rounded-t-2xl sm:rounded-2xl p-4 space-y-3" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{t('Dossier de', 'File of')} {people.find(p => p.id === editor.userId)?.name}</h2>
              <button type="button" onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300" aria-label={t('Fermer', 'Close')}><X className="w-5 h-5" /></button>
            </div>
            <div><label className={lbl}>{t('Poste', 'Position')}</label><input className={field} value={editor.position} maxLength={80} onChange={e => set({ position: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>{t("Date d'embauche", 'Hire date')}</label><input type="date" className={field} value={editor.hire_date} onChange={e => set({ hire_date: e.target.value })} /></div>
              <div><label className={lbl}>{t('Contrat', 'Contract')}</label>
                <select className={field} value={editor.contract_type} onChange={e => set({ contract_type: e.target.value })}>
                  <option value="">—</option>
                  {(Object.keys(HR_CONTRACT_LABELS) as HrContract[]).map(k => <option key={k} value={k}>{HR_CONTRACT_LABELS[k][lang === 'en' ? 1 : 0]}</option>)}
                </select></div>
              <div><label className={lbl}>{t("Fin de la période d'essai", 'Trial period ends')}</label><input type="date" className={field} value={editor.trial_end} onChange={e => set({ trial_end: e.target.value })} /></div>
              <div><label className={lbl}>{t('Fin du contrat', 'Contract ends')}</label><input type="date" className={field} value={editor.contract_end} onChange={e => set({ contract_end: e.target.value })} /></div>
            </div>
            <p className="text-[11px] font-semibold text-slate-400">{t("Contact d'urgence", 'Emergency contact')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className={field} placeholder={t('Nom', 'Name')} value={editor.e_name} maxLength={80} onChange={e => set({ e_name: e.target.value })} aria-label={t('Nom du contact', 'Contact name')} />
              <input className={field} placeholder={t('Téléphone', 'Phone')} value={editor.e_phone} maxLength={40} inputMode="tel" onChange={e => set({ e_phone: e.target.value })} aria-label={t('Téléphone du contact', 'Contact phone')} />
              <input className={field} placeholder={t('Lien (mère, ami…)', 'Relation (mother, friend…)')} value={editor.e_rel} maxLength={40} onChange={e => set({ e_rel: e.target.value })} aria-label={t('Lien avec le contact', 'Relation')} />
            </div>
            <p className="text-[11px] font-semibold text-slate-400">{t('Documents (liens https)', 'Documents (https links)')}</p>
            {editor.docs.map((d, i) => (
              <div key={d.id} className="flex gap-2">
                <input className={field} placeholder={t('Nom', 'Name')} value={d.name} maxLength={80} onChange={e => set({ docs: editor.docs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label={t('Nom du document', 'Document name')} />
                <input className={field} placeholder="https://…" value={d.url} maxLength={500} onChange={e => set({ docs: editor.docs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} aria-label={t('Lien du document', 'Document link')} />
                <button type="button" className={btn} onClick={() => set({ docs: editor.docs.filter((_, j) => j !== i) })} aria-label={t('Retirer le document', 'Remove the document')}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {editor.docs.length < 10 && <button type="button" className={btn} onClick={() => set({ docs: [...editor.docs, { id: uid('hd'), name: '', url: '' }] })}><Plus className="w-4 h-4" />{t('Ajouter un document', 'Add a document')}</button>}
            <p className="text-[11px] font-semibold text-slate-400">{t('Historique des tarifs (information : la paie utilise les tarifs des Réglages)', 'Rate history (information: payroll uses the rates in Settings)')}</p>
            {editor.rates.map((r, i) => (
              <div key={r.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                <input type="date" className={field} value={r.date} onChange={e => set({ rates: editor.rates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} aria-label={t('Date du changement', 'Change date')} />
                <input className={field} inputMode="numeric" placeholder={t('Avant (Ar)', 'Before (Ar)')} value={r.from} onChange={e => set({ rates: editor.rates.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} aria-label={t('Ancien tarif', 'Old rate')} />
                <input className={field} inputMode="numeric" placeholder={t('Après (Ar)', 'After (Ar)')} value={r.to} onChange={e => set({ rates: editor.rates.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} aria-label={t('Nouveau tarif', 'New rate')} />
                <input className={field} placeholder={t('Motif', 'Reason')} value={r.reason} maxLength={200} onChange={e => set({ rates: editor.rates.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })} aria-label={t('Motif', 'Reason')} />
                <button type="button" className={btn} onClick={() => set({ rates: editor.rates.filter((_, j) => j !== i) })} aria-label={t('Retirer la ligne', 'Remove the row')}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {editor.rates.length < 50 && <button type="button" className={btn} onClick={() => set({ rates: [...editor.rates, { id: uid('hr'), date: today, from: '', to: '', reason: '' }] })}><Plus className="w-4 h-4" />{t('Ajouter un tarif', 'Add a rate')}</button>}
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" className={`${btn} flex-1 justify-center bg-emerald-700 border-emerald-500 text-white`} onClick={save}>{t('Enregistrer', 'Save')}</button>
              <button type="button" className={`${btn} flex-1 justify-center`} onClick={() => setEditor(null)}>{t('Annuler', 'Cancel')}</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};
