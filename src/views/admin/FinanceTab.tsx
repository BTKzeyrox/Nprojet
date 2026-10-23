import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { categoriesFor, filterCash, periodMoney } from '../../utils/finance';
import type { CashEntry, CashKind } from '../../types';
import { BudgetsCard } from './BudgetsCard';
import { FinanceInsights } from './FinanceInsights';

// Onglet « Finances » (responsable seulement) : paiements reçus des clients et dépenses, pour la période choisie en haut de la page.
// Les salaires viennent des missions validées (calculés, jamais saisis) ; les avances sont des salaires versés d'avance : elles ne s'ajoutent pas.
interface Props { range: { start: string; end: string }; lang: 'fr' | 'en'; salariesAr: number; advancesAr: number }
interface Editor { id?: string; kind: CashKind; amount: string; date: string; category: string; custom: string; client: string; note: string; supplier: string }

const CUSTOM = '__custom';
const PAGE = 20;
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const fmtDate = (d: string) => d.split('-').reverse().join('/');

export const FinanceTab: React.FC<Props> = ({ range, lang, salariesAr, advancesAr }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [kind, setKind] = useState<'all' | CashKind>('all');
  const [category, setCategory] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useLockBodyScroll(!!editor);

  const all: CashEntry[] = db.getCash();
  const inRange = useMemo(() => filterCash(all, { ...range, kind: 'all', category: '' }), [all, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => filterCash(all, { ...range, kind, category }), [all, range.start, range.end, kind, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const supplierNames = useMemo(() => Object.fromEntries(db.getSuppliers().map(x => [x.id, x.name])) as Record<string, string>, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = periodMoney(inRange, salariesAr);
  const usedCategories = useMemo(() => [...new Set(inRange.map(e => e.category))].sort((a, b) => a.localeCompare(b)), [inRange]);
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const showSalaryRow = kind !== 'in' && !category && salariesAr > 0;
  const ar = (n: number) => formatCurrencyAr(n);

  const errors: Record<string, [string, string]> = {
    amount: ['Entre un montant supérieur à 0.', 'Enter an amount above 0.'], date: ['Choisis une date valide.', 'Choose a valid date.'],
    category: ['Choisis une catégorie.', 'Choose a category.'], kind: ['Type inconnu.', 'Unknown type.'],
    supplier: ['Ce fournisseur n\'existe plus.', 'This supplier no longer exists.'], admin: ['Réservé au responsable.', 'Admins only.'], missing: ['Cette ligne n\'existe plus.', 'This line no longer exists.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const open = (k: CashKind) => { setError(''); setConfirmId(null); setEditor({ kind: k, amount: '', date: todayMada(), category: categoriesFor(k, all)[0], custom: '', client: '', note: '', supplier: '' }); };
  const edit = (e: CashEntry) => {
    setError(''); setConfirmId(null);
    const known = categoriesFor(e.kind, all).includes(e.category);
    setEditor({ id: e.id, kind: e.kind, amount: String(e.amount_ar), date: e.date, category: known ? e.category : CUSTOM, custom: known ? '' : e.category, client: e.client_name || '', note: e.note || '', supplier: e.supplier_id || '' });
  };
  const save = () => {
    if (!editor) return;
    const draft = { kind: editor.kind, category: editor.category === CUSTOM ? editor.custom : editor.category, amount: editor.amount, date: editor.date, note: editor.note, client_name: editor.kind === 'in' ? editor.client : '', supplier_id: editor.kind === 'out' ? editor.supplier : '' };
    const r = editor.id ? db.updateCash(editor.id, draft) : db.addCash(draft);
    if (!r.success) { setError(say(r.error)); return; }
    setEditor(null);
  };
  const remove = (id: string) => { const r = db.deleteCash(id); setConfirmId(null); if (!r.success) setError(say(r.error)); };

  const tile = (label: string, value: string, tone: string) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-base font-bold truncate ${tone}`}>{value}</div>
    </div>
  );
  const chip = (active: boolean) => `min-h-[40px] rounded-lg text-sm font-semibold border px-3 ${active ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'}`;

  return (
    <div className="space-y-3" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tile(t('Argent reçu', 'Money received'), ar(money.received), 'text-emerald-400')}
          {tile(t('Dépenses', 'Expenses'), ar(money.spent), 'text-rose-400')}
          {tile(t('Salaires (calculés)', 'Salaries (calculated)'), ar(money.salaries), 'text-amber-400')}
          {tile(t('Solde', 'Balance'), ar(money.net), money.net < 0 ? 'text-rose-400' : 'text-sky-300')}
        </div>
        <p className="text-[11px] text-slate-500">
          {t('Solde = argent reçu − dépenses − salaires. Les salaires viennent des missions validées de la période.', 'Balance = money received − expenses − salaries. Salaries come from the missions validated in the period.')}
          {advancesAr > 0 && ` ${t(`Avances versées : ${ar(advancesAr)} (déjà comprises dans les salaires).`, `Advances paid: ${ar(advancesAr)} (already included in salaries).`)}`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open('in')} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Paiement reçu', 'Payment received')}</button>
          <button type="button" onClick={() => open('out')} className="min-h-[44px] rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Dépense', 'Expense')}</button>
        </div>
      </div>

      <FinanceInsights range={range} lang={lang} />

      <BudgetsCard lang={lang} />

      <div className={card}>
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label={t('Type', 'Type')}>
          {([['all', t('Tout', 'All')], ['in', t('Entrées', 'Money in')], ['out', t('Sorties', 'Money out')]] as [('all' | CashKind), string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => { setKind(id); setShowAll(false); }} className={chip(kind === id)}>{label}</button>
          ))}
        </div>
        <select value={category} onChange={e => { setCategory(e.target.value); setShowAll(false); }} className={field} aria-label={t('Catégorie', 'Category')}>
          <option value="">{t('Toutes les catégories', 'All categories')}</option>
          {usedCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {error && !editor && <div role="alert" className="text-sm text-rose-300">{error}</div>}
        {rows.length === 0 && !showSalaryRow ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucune ligne sur cette période.', 'No entries in this period.')}</div>
        ) : (
          <ul>
            {showSalaryRow && (
              <li className="flex items-center gap-2 py-2 border-t border-slate-800">
                <div className="min-w-0 flex-1"><div className="text-sm text-white">{t('Salaires', 'Salaries')}</div><div className="text-[11px] text-slate-400">{t('Calculé avec les missions validées (non modifiable)', 'Calculated from validated missions (not editable)')}</div></div>
                <div className="text-sm font-bold text-rose-400 whitespace-nowrap">− {ar(salariesAr)}</div>
              </li>
            )}
            {shown.map(e => (
              <li key={e.id} className="flex items-center gap-2 py-2 border-t border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{e.category}{e.client_name ? ` · ${e.client_name}` : ''}{e.supplier_id && supplierNames[e.supplier_id] ? ` · ${supplierNames[e.supplier_id]}` : ''}</div>
                  <div className="text-[11px] text-slate-400 truncate">{fmtDate(e.date)}{e.note ? ` · ${e.note}` : ''}</div>
                </div>
                <div className={`text-sm font-bold whitespace-nowrap ${e.kind === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>{e.kind === 'in' ? '+' : '−'} {ar(e.amount_ar)}</div>
                {confirmId === e.id ? (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => remove(e.id)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer', 'Delete')}</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm">{t('Non', 'No')}</button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => edit(e)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white"><Pencil className="w-4 h-4" /></button>
                    <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(e.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {rows.length > PAGE && (
          <button type="button" onClick={() => setShowAll(v => !v)} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 text-sm text-slate-200">
            {showAll ? t('Voir moins', 'Show less') : t(`Voir tout (${rows.length})`, `Show all (${rows.length})`)}
          </button>
        )}
      </div>

      {editor && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setEditor(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{editor.id ? t('Modifier la ligne', 'Edit entry') : editor.kind === 'in' ? t('Paiement reçu d\'un client', 'Payment received from a client') : t('Nouvelle dépense', 'New expense')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs text-slate-400">{t('Montant (Ar)', 'Amount (Ar)')}
              <input inputMode="numeric" autoFocus value={editor.amount} onChange={e => setEditor({ ...editor, amount: e.target.value })} className={`${field} mt-1`} placeholder="150 000" />
            </label>
            <label className="block text-xs text-slate-400">{t('Date', 'Date')}
              <input type="date" value={editor.date} onChange={e => setEditor({ ...editor, date: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Catégorie', 'Category')}
              <select value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })} className={`${field} mt-1`}>
                {categoriesFor(editor.kind, all).map(c => <option key={c} value={c}>{c}</option>)}
                <option value={CUSTOM}>{t('Autre… (je l\'écris)', 'Other… (I type it)')}</option>
              </select>
            </label>
            {editor.category === CUSTOM && <input value={editor.custom} maxLength={40} onChange={e => setEditor({ ...editor, custom: e.target.value })} className={field} placeholder={t('Nom de la catégorie', 'Category name')} aria-label={t('Nom de la catégorie', 'Category name')} />}
            {editor.kind === 'in' && (
              <label className="block text-xs text-slate-400">{t('Client', 'Client')}
                <input value={editor.client} maxLength={80} onChange={e => setEditor({ ...editor, client: e.target.value })} className={`${field} mt-1`} />
              </label>
            )}
            {editor.kind === 'out' && (editor.category === CUSTOM ? editor.custom : editor.category).trim() === 'Achats' && (
              <label className="block text-xs text-slate-400">{t('Fournisseur (facultatif)', 'Supplier (optional)')}
                <select value={editor.supplier} onChange={e => setEditor({ ...editor, supplier: e.target.value })} className={`${field} mt-1`}>
                  <option value="">{t('— Aucun —', '— None —')}</option>
                  {db.getSuppliers().filter(s => s.active !== false || s.id === editor.supplier).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}
              <textarea value={editor.note} maxLength={300} rows={2} onChange={e => setEditor({ ...editor, note: e.target.value })} className={`${field} mt-1 py-2`} />
            </label>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditor(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={save} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
