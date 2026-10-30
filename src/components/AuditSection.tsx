import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { db } from '../db/store';
import { AUDIT_ACTIONS, auditLabel, filterAudit, groupAuditByDay, type AuditEntry } from '../utils/auditRules';

/** Journal d'audit (M7.2) : qui a fait quoi et quand. Admin seulement (le serveur refuse les autres). Gardé 12 mois. */
export const AuditSection: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shown, setShown] = useState(50);

  const load = useCallback(async () => {
    setErr('');
    const r = await db.listAudit();
    if (r.ok) setRows(r.rows);
    else { setRows([]); setErr(r.error || t('Erreur.', 'Error.')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => filterAudit(rows || [], { action, q, from, to }), [rows, action, q, from, to]);
  const groups = useMemo(() => groupAuditByDay(filtered.slice(0, shown)), [filtered, shown]);
  const hhmm = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(11, 16);
  const fld = 'min-h-[44px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white w-full';

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><ScrollText className="w-4 h-4 text-emerald-400" /> {t('Journal d\'audit', 'Audit log')}</h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">{t('Qui a fait quoi et quand : factures, suppressions, tarifs, réglages, comptes, paie. Gardé 12 mois. Seul le responsable le voit. Les mots de passe et les montants des Conditions n\'y sont jamais écrits.', 'Who did what and when: invoices, deletions, prices, settings, accounts, payroll. Kept 12 months. Only the manager sees it. Passwords and company-condition values are never written here.')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select value={action} onChange={e => { setAction(e.target.value); setShown(50); }} className={fld} aria-label={t('Type d\'action', 'Action type')}>
          <option value="">{t('Toutes les actions', 'All actions')}</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{auditLabel(a, lang)}</option>)}
        </select>
        <input value={q} onChange={e => { setQ(e.target.value); setShown(50); }} placeholder={t('Chercher (nom, cible, détail)', 'Search (name, target, detail)')} className={fld} />
        <label className="text-[11px] text-slate-400">{t('Du', 'From')}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setShown(50); }} className={`${fld} mt-1`} /></label>
        <label className="text-[11px] text-slate-400">{t('Au', 'To')}<input type="date" value={to} onChange={e => { setTo(e.target.value); setShown(50); }} className={`${fld} mt-1`} /></label>
      </div>
      <button type="button" onClick={() => void load()} className="w-full min-h-[44px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-semibold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> {t('Actualiser', 'Refresh')}</button>

      {rows === null && <div className="text-sm text-slate-400">{t('Chargement…', 'Loading…')}</div>}
      {err && <div className="text-sm text-red-300">{err}</div>}
      {rows !== null && !err && filtered.length === 0 && <div className="text-sm text-slate-300">{rows.length === 0 ? t('Rien dans le journal pour le moment.', 'Nothing in the log yet.') : t('Aucune ligne avec ces filtres.', 'No line matches these filters.')}</div>}

      {groups.map(g => (
        <div key={g.day} className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{g.day}</div>
          <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
            {g.rows.map(r => (
              <li key={r.id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-white font-semibold">{auditLabel(r.action, lang)}</span><span className="text-[11px] text-slate-500 shrink-0">{hhmm(r.at)}</span></div>
                <div className="text-[12px] text-slate-300">{r.by_name || '—'}{r.target_label ? ` · ${r.target_label}` : ''}</div>
                {r.detail && <div className="text-[11px] text-slate-400 break-words">{r.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {filtered.length > shown && <button type="button" onClick={() => setShown(s => s + 50)} className="w-full min-h-[44px] rounded-lg border border-slate-600 text-slate-200 text-sm font-semibold">{t('Voir plus', 'Show more')} ({filtered.length - shown})</button>}
    </section>
  );
};
