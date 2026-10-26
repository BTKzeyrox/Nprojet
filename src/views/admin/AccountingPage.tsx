import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, ChevronDown, ChevronRight, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { todayMada } from '../../utils/stats';
import { JOURNALS, PLAN, accountOf, balanceSheet, entryReasonText, fiscalYearOf, incomeStatement, ledger, totals, trialBalance, vatByMonth, type Entry, type Journal } from '../../utils/accounting';
import { downloadVatExcel } from '../../utils/exportDoc';

// Comptabilité (M14.4). Responsable et Comptable : journal, grand livre, balance, résultat, bilan, saisie d'une écriture. Annuler une écriture : responsable seulement.
// Le site LIT les écritures ; elles s'écrivent par les routes accounting-* (le serveur revérifie, numérote et note tout dans le journal d'audit).
// AVERTISSEMENT : le plan comptable est un plan minimal de départ, à faire valider par un expert-comptable avant tout usage officiel.
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-2.5';
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold inline-flex items-center justify-center gap-1.5';
const lbl = 'block text-[11px] font-semibold text-slate-400 mb-1';
const num = (n: number) => n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const fmtDate = (d: string) => d.split('-').reverse().join('/');
export type Tab = 'journal' | 'ledger' | 'balance' | 'result' | 'sheet' | 'vat';
type Preset = 'month' | 'year' | 'all' | 'custom';
interface Draft { date: string; journal: Journal; label: string; ref: string; lines: { account: string; debit: string; credit: string }[] }

export const AccountingPage: React.FC<{ initialTab?: Tab }> = ({ initialTab }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const l2 = lang === 'en' ? 1 : 0;
  const today = todayMada();
  const me = db.getCurrentUser();
  const isAdmin = me?.role === 'admin';
  const [, tick] = useState(0);
  useEffect(() => { const u = db.subscribe(() => tick(x => x + 1)); return () => { if (typeof u === 'function') u(); }; }, []);
  const entries = db.getEntries();

  const [tab, setTab] = useState<Tab>(initialTab ?? 'journal');
  const [preset, setPreset] = useState<Preset>('year');
  const fy = fiscalYearOf(today) || { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` };
  const [custom, setCustom] = useState({ from: fy.start, to: today });
  const range = useMemo(() => {
    if (preset === 'all') return { from: undefined as string | undefined, to: undefined as string | undefined };
    if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
    if (preset === 'year') return { from: fy.start, to: fy.end };
    return { from: custom.from || undefined, to: custom.to || undefined };
  }, [preset, custom, today, fy.start, fy.end]);
  const [q, setQ] = useState('');
  const [jf, setJf] = useState<'' | Journal>('');
  const [open, setOpen] = useState<string | null>(null);
  const [account, setAccount] = useState('411');
  const [asOf, setAsOf] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formErr, setFormErr] = useState('');
  const [rev, setRev] = useState<{ id: string; date: string; reason: string } | null>(null);
  useLockBodyScroll(!!draft);

  const accLabel = (code: string) => { const a = accountOf(code); return a ? `${code} ${a[lang === 'en' ? 'en' : 'fr']}` : code; };
  const byId = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);
  const inRange = (e: Entry) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to);
  const list = useMemo(() => entries.filter(e => inRange(e) && (!jf || e.journal === jf) && (!q.trim() || `${e.number} ${e.label} ${e.ref || ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [entries, range, jf, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setBusy(true); setMsg(null);
    const r = await db.accountingSync();
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error || t('Impossible de générer les écritures.', 'Could not generate the entries.') }); return; }
    const d = r.data || {};
    const bad = Array.isArray(d.skipped) ? d.skipped.length : 0;
    setMsg({ ok: true, text: t(`${d.created} écriture(s) créée(s), ${d.existing} déjà là${bad ? `, ${bad} pièce(s) refusée(s) à corriger` : ''}.`, `${d.created} entry(ies) created, ${d.existing} already there${bad ? `, ${bad} document(s) refused to fix` : ''}.`) });
  };
  const newDraft = (): Draft => ({ date: today, journal: 'OD', label: '', ref: '', lines: [{ account: '512', debit: '', credit: '' }, { account: '101', debit: '', credit: '' }] });
  const amountOf = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/\s/g, '')));
  const dTot = draft ? totals(draft.lines.map(x => ({ account: x.account, debit: amountOf(x.debit) || 0, credit: amountOf(x.credit) || 0 }))) : { debit: 0, credit: 0 };
  const save = async () => {
    if (!draft) return;
    const lines = draft.lines.map(x => ({ account: x.account, debit: amountOf(x.debit), credit: amountOf(x.credit) }));
    const r = await db.postEntry({ date: draft.date, journal: draft.journal, label: draft.label, ref: draft.ref, lines });
    if (!r.ok) { setFormErr(r.error || t('Écriture refusée.', 'Entry refused.')); return; }
    setDraft(null); setFormErr(''); setMsg({ ok: true, text: t('Écriture enregistrée.', 'Entry saved.') });
  };
  const doReverse = async () => {
    if (!rev) return;
    const r = await db.reverseEntryById(rev.id, rev.date, rev.reason);
    if (!r.ok) { setMsg({ ok: false, text: r.error || t('Annulation refusée.', 'Reversal refused.') }); return; }
    setRev(null); setMsg({ ok: true, text: t('Écriture annulée par une écriture inverse.', 'Entry reversed by an opposite entry.') });
  };
  const setLine = (i: number, p: Partial<Draft['lines'][number]>) => setDraft(d => (d ? { ...d, lines: d.lines.map((x, j) => (j === i ? { ...x, ...p } : x)) } : d));

  const tabBtn = (id: Tab, fr: string, en: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-[44px] rounded-lg text-sm font-semibold border px-3 shrink-0 ${tab === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}>{t(fr, en)}</button>
  );
  const th = 'text-[11px] font-semibold text-slate-400 text-right px-2 py-1';
  const td = 'px-2 py-1 text-sm text-slate-200 text-right whitespace-nowrap';
  const tdl = 'px-2 py-1 text-sm text-slate-200 text-left';

  const tb = useMemo(() => trialBalance(entries, range.from, range.to), [entries, range]);
  const is = useMemo(() => incomeStatement(entries, range.from, range.to), [entries, range]);
  const bs = useMemo(() => balanceSheet(entries, asOf), [entries, asOf]);
  const lg = useMemo(() => ledger(entries, account, range.from, range.to), [entries, account, range]);
  const vat = useMemo(() => vatByMonth(entries, range.from, range.to), [entries, range]);

  return (
    <div className="space-y-3 max-w-5xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Comptabilité', 'Accounting')}</h1>
        <p className="text-[11px] text-amber-300">{t('Plan comptable minimal de départ : à faire valider par un expert-comptable avant tout usage officiel.', 'Minimal starting chart of accounts: have an accountant validate it before any official use.')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-emerald-700 border-emerald-500 text-white`} onClick={generate} disabled={busy}><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />{t('Générer les écritures', 'Generate the entries')}</button>
          <button type="button" className={btn} onClick={() => { setDraft(newDraft()); setFormErr(''); }}><Plus className="w-4 h-4" aria-hidden="true" />{t('Saisir une écriture', 'Enter an entry')}</button>
        </div>
        <p className="text-[11px] text-slate-500">{t('« Générer » crée l\'écriture de chaque facture, avoir, paiement, dépense, paie et avance qui n\'en a pas encore. Cliquer plusieurs fois ne crée jamais de doublon. Les montants sont en Ariary.', '"Generate" creates the entry of every invoice, credit note, payment, expense, payroll and advance that has none yet. Clicking several times never creates duplicates. Amounts are in Ariary.')}</p>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabBtn('journal', 'Journal', 'Journal')}{tabBtn('ledger', 'Grand livre', 'Ledger')}{tabBtn('balance', 'Balance', 'Trial balance')}{tabBtn('result', 'Résultat', 'Income')}{tabBtn('sheet', 'Bilan', 'Balance sheet')}{tabBtn('vat', 'TVA', 'VAT')}
      </div>

      {tab !== 'sheet' && (
        <div className={card}>
          <div className="flex flex-wrap gap-1.5">
            {([['month', 'Ce mois', 'This month'], ['year', 'Cette année', 'This year'], ['all', 'Tout', 'All'], ['custom', 'Dates', 'Dates']] as [Preset, string, string][]).map(([k, fr, en]) => (
              <button key={k} type="button" onClick={() => setPreset(k)} aria-pressed={preset === k} className={`min-h-[44px] rounded-lg text-sm font-semibold border px-3 ${preset === k ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`}>{t(fr, en)}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>{t('Du', 'From')}</label><input type="date" className={field} value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} /></div>
              <div><label className={lbl}>{t('Au', 'To')}</label><input type="date" className={field} value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} /></div>
            </div>
          )}
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-2">
          <div className={card}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className={field} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Chercher un numéro, un libellé, une pièce', 'Search a number, a label, a document')} aria-label={t('Chercher', 'Search')} />
              <select className={field} value={jf} onChange={e => setJf(e.target.value as '' | Journal)} aria-label={t('Journal', 'Journal')}>
                <option value="">{t('Tous les journaux', 'All journals')}</option>
                {(Object.keys(JOURNALS) as Journal[]).map(j => <option key={j} value={j}>{j} · {JOURNALS[j][l2]}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-slate-500">{t(`${list.length} écriture(s) sur ${entries.length}`, `${list.length} entry(ies) out of ${entries.length}`)}</p>
          </div>
          {entries.length === 0 && <div className={card}><p className="text-sm text-slate-400">{t('Aucune écriture. Appuie sur « Générer les écritures » pour créer celles de tes factures, paiements, dépenses et paies.', 'No entry yet. Tap "Generate the entries" to create those of your invoices, payments, expenses and payroll.')}</p></div>}
          {list.map(e => {
            const t2 = totals(e.lines), o = open === e.id, reversed = !!e.reversed_by, isRev = !!e.reversal_of;
            return (
              <div key={e.id} className={card}>
                <button type="button" onClick={() => setOpen(o ? null : e.id)} className="w-full flex items-center gap-2 text-left min-h-[44px]" aria-expanded={o}>
                  {o ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white truncate">{e.label}</span>
                    <span className="block text-[11px] text-slate-400">{e.number} · {fmtDate(e.date)} · {e.journal}{e.ref ? ` · ${e.ref}` : ''}</span>
                  </span>
                  <span className="text-sm font-semibold text-white">{num(t2.debit)}</span>
                  {reversed && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-700 text-slate-300">{t('Annulée', 'Reversed')}</span>}
                  {isRev && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-900/60 text-amber-300">{t('Annulation', 'Reversal')}</span>}
                </button>
                {o && (
                  <>
                    <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={`${th} text-left`}>{t('Compte', 'Account')}</th><th className={th}>{t('Débit', 'Debit')}</th><th className={th}>{t('Crédit', 'Credit')}</th></tr></thead>
                      <tbody>{e.lines.map((x, i) => (<tr key={i} className="border-t border-slate-800"><td className={tdl}>{accLabel(x.account)}</td><td className={td}>{x.debit ? num(x.debit) : ''}</td><td className={td}>{x.credit ? num(x.credit) : ''}</td></tr>))}</tbody></table></div>
                    {e.source && <p className="text-[11px] text-slate-500">{t('Origine', 'Source')} : {e.source.type}{reversed ? ` · ${t('annulée par', 'reversed by')} ${byId.get(e.reversed_by!)?.number || ''}` : ''}{isRev ? ` · ${t('annule', 'reverses')} ${byId.get(e.reversal_of!)?.number || ''}` : ''}</p>}
                    {isAdmin && !reversed && !isRev && (rev?.id === e.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" className={field} value={rev.date} min={e.date} onChange={x => setRev({ ...rev, date: x.target.value })} aria-label={t('Date de l\'annulation', 'Reversal date')} />
                          <input className={field} value={rev.reason} maxLength={150} placeholder={t('Motif (3 caractères au moins)', 'Reason (at least 3 characters)')} onChange={x => setRev({ ...rev, reason: x.target.value })} aria-label={t('Motif', 'Reason')} />
                        </div>
                        <div className="flex gap-2"><button type="button" className={`${btn} flex-1 bg-red-800 border-red-600 text-white`} onClick={doReverse}>{t('Annuler l\'écriture', 'Reverse the entry')}</button><button type="button" className={`${btn} flex-1`} onClick={() => setRev(null)}>{t('Retour', 'Back')}</button></div>
                      </div>
                    ) : <button type="button" className={btn} onClick={() => setRev({ id: e.id, date: e.date > today ? e.date : today, reason: '' })}><Ban className="w-4 h-4" aria-hidden="true" />{t('Annuler (écriture inverse)', 'Reverse (opposite entry)')}</button>)}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'ledger' && (
        <div className={card}>
          <label className={lbl}>{t('Compte', 'Account')}</label>
          <select className={field} value={account} onChange={e => setAccount(e.target.value)}>{PLAN.map(a => <option key={a.code} value={a.code}>{a.code} {a[lang === 'en' ? 'en' : 'fr']}</option>)}</select>
          <p className="text-xs text-slate-400">{t('Solde au départ', 'Opening balance')} : {num(lg.opening)} · {t('Solde à la fin', 'Closing balance')} : <span className="font-bold text-white">{num(lg.closing)}</span> <span className="text-slate-500">({t('débit moins crédit', 'debit minus credit')})</span></p>
          {lg.rows.length === 0 ? <p className="text-sm text-slate-400">{t('Aucun mouvement sur cette période.', 'No movement in this period.')}</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={`${th} text-left`}>{t('Date', 'Date')}</th><th className={`${th} text-left`}>{t('Libellé', 'Label')}</th><th className={th}>{t('Débit', 'Debit')}</th><th className={th}>{t('Crédit', 'Credit')}</th><th className={th}>{t('Solde', 'Balance')}</th></tr></thead>
              <tbody>{lg.rows.map((r, i) => (<tr key={i} className="border-t border-slate-800"><td className={tdl}>{fmtDate(r.date)}</td><td className={tdl}>{byId.get(r.entry_id)?.number} {r.label}</td><td className={td}>{r.debit ? num(r.debit) : ''}</td><td className={td}>{r.credit ? num(r.credit) : ''}</td><td className={`${td} font-semibold`}>{num(r.balance)}</td></tr>))}</tbody></table></div>
          )}
        </div>
      )}

      {tab === 'balance' && (
        <div className={card}>
          <p className={`text-sm font-bold ${tb.balanced ? 'text-emerald-400' : 'text-red-400'}`}>{tb.balanced ? t('Balance équilibrée : total des débits = total des crédits.', 'Balanced: total debits = total credits.') : t('ATTENTION : balance déséquilibrée.', 'WARNING: unbalanced trial balance.')}</p>
          {tb.rows.length === 0 ? <p className="text-sm text-slate-400">{t('Aucune écriture sur cette période.', 'No entry in this period.')}</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={`${th} text-left`}>{t('Compte', 'Account')}</th><th className={th}>{t('Débit', 'Debit')}</th><th className={th}>{t('Crédit', 'Credit')}</th><th className={th}>{t('Solde débiteur', 'Debit balance')}</th><th className={th}>{t('Solde créditeur', 'Credit balance')}</th></tr></thead>
              <tbody>{tb.rows.map(r => (<tr key={r.account} className="border-t border-slate-800"><td className={tdl}>{accLabel(r.account)}</td><td className={td}>{num(r.debit)}</td><td className={td}>{num(r.credit)}</td><td className={td}>{r.balance_debit ? num(r.balance_debit) : ''}</td><td className={td}>{r.balance_credit ? num(r.balance_credit) : ''}</td></tr>))}
                <tr className="border-t-2 border-slate-600 font-bold"><td className={tdl}>{t('Total', 'Total')}</td><td className={td}>{num(tb.debit)}</td><td className={td}>{num(tb.credit)}</td><td className={td} /><td className={td} /></tr></tbody></table></div>
          )}
        </div>
      )}

      {tab === 'result' && (
        <div className={card}>
          {[[t('Produits', 'Income'), is.income, is.totalIncome], [t('Charges', 'Expenses'), is.expense, is.totalExpense]].map(([title, rows, total]) => (
            <div key={String(title)}>
              <p className="text-sm font-bold text-white">{String(title)}</p>
              {(rows as { account: string; amount: number }[]).length === 0 ? <p className="text-xs text-slate-500">—</p> : (rows as { account: string; amount: number }[]).map(r => (<div key={r.account} className="flex justify-between text-sm text-slate-300"><span>{accLabel(r.account)}</span><span>{num(r.amount)}</span></div>))}
              <div className="flex justify-between text-sm font-bold text-white border-t border-slate-700 mt-1 pt-1"><span>{t('Total', 'Total')}</span><span>{num(total as number)}</span></div>
            </div>
          ))}
          <div className={`flex justify-between text-base font-bold ${is.result < 0 ? 'text-red-400' : 'text-emerald-400'}`}><span>{is.result < 0 ? t('Perte', 'Loss') : t('Bénéfice', 'Profit')}</span><span>{num(is.result)}</span></div>
        </div>
      )}

      {tab === 'sheet' && (
        <div className={card}>
          <div className="max-w-[220px]"><label className={lbl}>{t('À la date du', 'As of')}</label><input type="date" className={field} value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
          <p className={`text-sm font-bold ${bs.balanced ? 'text-emerald-400' : 'text-red-400'}`}>{bs.balanced ? t('Bilan équilibré : actif = passif.', 'Balanced: assets = liabilities.') : t('ATTENTION : bilan déséquilibré.', 'WARNING: unbalanced balance sheet.')}</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold text-white">{t('Actif', 'Assets')}</p>
              {bs.assets.map(r => (<div key={r.account} className="flex justify-between text-sm text-slate-300"><span>{accLabel(r.account)}</span><span>{num(r.amount)}</span></div>))}
              <div className="flex justify-between text-sm font-bold text-white border-t border-slate-700 mt-1 pt-1"><span>{t('Total actif', 'Total assets')}</span><span>{num(bs.totalAssets)}</span></div>
            </div>
            <div>
              <p className="text-sm font-bold text-white">{t('Passif', 'Liabilities and equity')}</p>
              {bs.liabilities.map(r => (<div key={r.account} className="flex justify-between text-sm text-slate-300"><span>{accLabel(r.account)}</span><span>{num(r.amount)}</span></div>))}
              <div className="flex justify-between text-sm text-slate-300"><span>{t('Résultat cumulé', 'Cumulative result')}</span><span>{num(bs.result)}</span></div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-slate-700 mt-1 pt-1"><span>{t('Total passif', 'Total liabilities')}</span><span>{num(bs.totalLiabilities)}</span></div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">{t('Tant que la clôture d\'exercice n\'existe pas, le résultat est cumulé depuis le début.', 'Until year-end closing exists, the result is cumulative since the start.')}</p>
        </div>
      )}

      {tab === 'vat' && (
        <div className={card}>
          <p className="text-sm font-bold text-white">{t('TVA de la période', 'VAT for the period')}</p>
          {vat.months.length === 0 ? <p className="text-sm text-slate-400">{t('Aucune TVA sur cette période (aucune facture avec TVA, aucune écriture sur 4456 ou 4457).', 'No VAT in this period (no invoice with VAT, no entry on 4456 or 4457).')}</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={`${th} text-left`}>{t('Mois', 'Month')}</th><th className={th}>{t('Collectée', 'Collected')}</th><th className={th}>{t('Déductible', 'Deductible')}</th><th className={th}>{t('À payer', 'Due')}</th></tr></thead>
              <tbody>{vat.months.map(m => (<tr key={m.month} className="border-t border-slate-800"><td className={tdl}>{m.month.split('-').reverse().join('/')}</td><td className={td}>{num(m.collected)}</td><td className={td}>{num(m.deductible)}</td><td className={td}>{num(m.due)}</td></tr>))}
                <tr className="border-t-2 border-slate-600 font-bold"><td className={tdl}>{t('Total', 'Total')}</td><td className={td}>{num(vat.total.collected)}</td><td className={td}>{num(vat.total.deductible)}</td><td className={td}>{num(vat.total.due)}</td></tr></tbody></table></div>
          )}
          <p className={`text-base font-bold ${vat.total.due < 0 ? 'text-sky-300' : 'text-white'}`}>{vat.total.due < 0 ? t('Crédit de TVA', 'VAT credit') : t('TVA à payer', 'VAT to pay')} : {num(Math.abs(vat.total.due))} Ar</p>
          <button type="button" className={btn} onClick={() => downloadVatExcel(vat, `${range.from || ''} → ${range.to || ''}`.trim(), lang === 'en' ? 'en' : 'fr')} disabled={vat.months.length === 0}>{t('Télécharger le brouillon (Excel)', 'Download the draft (Excel)')}</button>
          <p className="text-[11px] text-slate-500">{t('La TVA collectée vient des factures et des avoirs. La TVA déductible n\'est PAS générée toute seule (les dépenses n\'ont pas de champ TVA) : saisis tes achats avec TVA par « Saisir une écriture » (modèle « Achat avec TVA »). Brouillon à valider par un expert-comptable avant toute déclaration.', 'Collected VAT comes from invoices and credit notes. Deductible VAT is NOT generated automatically (expenses have no VAT field): enter your purchases with VAT via "Enter an entry" (template "Purchase with VAT"). Draft to be validated by an accountant before any return.')}</p>
        </div>
      )}

      {draft && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0f1722] border border-slate-700 rounded-t-2xl sm:rounded-2xl p-4 space-y-3" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
            <div className="flex items-center justify-between"><h2 className="text-base font-bold text-white">{t('Saisir une écriture', 'Enter an entry')}</h2><button type="button" onClick={() => setDraft(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300" aria-label={t('Fermer', 'Close')}><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>{t('Date', 'Date')}</label><input type="date" className={field} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
              <div><label className={lbl}>{t('Journal', 'Journal')}</label><select className={field} value={draft.journal} onChange={e => setDraft({ ...draft, journal: e.target.value as Journal })}>{(Object.keys(JOURNALS) as Journal[]).map(j => <option key={j} value={j}>{j} · {JOURNALS[j][l2]}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2"><label className={lbl}>{t('Libellé', 'Label')}</label><input className={field} maxLength={200} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></div>
              <div><label className={lbl}>{t('Pièce (facultatif)', 'Document (optional)')}</label><input className={field} maxLength={80} value={draft.ref} onChange={e => setDraft({ ...draft, ref: e.target.value })} /></div>
            </div>
            {draft.lines.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_88px_88px_44px] gap-1.5 items-center">
                <select className={field} value={x.account} onChange={e => setLine(i, { account: e.target.value })} aria-label={t('Compte', 'Account')}>{PLAN.map(a => <option key={a.code} value={a.code}>{a.code} {a[lang === 'en' ? 'en' : 'fr']}</option>)}</select>
                <input className={field} inputMode="numeric" placeholder={t('Débit', 'Debit')} value={x.debit} onChange={e => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : x.credit })} aria-label={t('Débit', 'Debit')} />
                <input className={field} inputMode="numeric" placeholder={t('Crédit', 'Credit')} value={x.credit} onChange={e => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : x.debit })} aria-label={t('Crédit', 'Credit')} />
                <button type="button" className={`${btn} px-0`} disabled={draft.lines.length <= 2} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })} aria-label={t('Retirer la ligne', 'Remove the line')}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">{draft.lines.length < 40 && <button type="button" className={btn} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { account: '512', debit: '', credit: '' }] })}><Plus className="w-4 h-4" />{t('Ajouter une ligne', 'Add a line')}</button>}<button type="button" className={btn} onClick={() => setDraft({ ...draft, journal: 'AC', label: draft.label || 'Achat avec TVA', lines: [{ account: '601', debit: '', credit: '' }, { account: '4456', debit: '', credit: '' }, { account: '401', debit: '', credit: '' }] })}>{t('Modèle : achat avec TVA', 'Template: purchase with VAT')}</button></div>
            <p className={`text-sm font-semibold ${dTot.debit === dTot.credit && dTot.debit > 0 ? 'text-emerald-400' : 'text-amber-300'}`}>{t('Débits', 'Debits')} {num(dTot.debit)} · {t('Crédits', 'Credits')} {num(dTot.credit)} {dTot.debit === dTot.credit && dTot.debit > 0 ? '✓' : `· ${t('écart', 'gap')} ${num(Math.abs(dTot.debit - dTot.credit))}`}</p>
            {formErr && <p className="text-sm text-red-400" role="alert">{(() => { const m = /\(([a-z_]+)\)/.exec(formErr); return m ? entryReasonText(m[1], lang === 'en' ? 'en' : 'fr') : formErr; })()}</p>}
            <div className="flex gap-2"><button type="button" className={`${btn} flex-1 bg-emerald-700 border-emerald-500 text-white`} onClick={save}>{t('Enregistrer', 'Save')}</button><button type="button" className={`${btn} flex-1`} onClick={() => setDraft(null)}>{t('Annuler', 'Cancel')}</button></div>
            <p className="text-[11px] text-slate-500">{t('Une écriture enregistrée ne se modifie jamais : pour corriger, on l\'annule par une écriture inverse puis on en saisit une nouvelle.', 'A saved entry is never edited: to correct it, reverse it with an opposite entry and enter a new one.')}</p>
          </div>
        </div>, document.body)}
    </div>
  );
};
