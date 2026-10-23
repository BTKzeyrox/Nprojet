import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { categoriesFor } from '../../utils/finance';
import { budgetRows, type BudgetStatus } from '../../utils/purchasing';

// Budgets par catégorie (M4.4, responsable seulement) : un plafond mensuel par catégorie de dépense, une barre d'avancement pour le mois en cours
// (80 % et plus : attention, plus de 100 % : dépassé). L'alerte de l'accueil est calculée dans src/utils/alerts.ts.

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const BAR: Record<BudgetStatus, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-400', over: 'bg-rose-500' };
const TXT: Record<BudgetStatus, string> = { ok: 'text-emerald-400', warn: 'text-amber-300', over: 'text-rose-400' };

export const BudgetsCard: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [editor, setEditor] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  useLockBodyScroll(!!editor);

  const month = todayMada().slice(0, 7);
  const cash = db.getCash();
  const budgets = db.getSettings().budgets;
  const rows = useMemo(() => budgetRows(budgets, cash, month), [budgets, cash, month]);
  const ar = (n: number) => formatCurrencyAr(n);
  const cats = useMemo(() => [...new Set([...categoriesFor('out', cash), ...Object.keys(budgets || {})])].filter(c => c !== 'Salaires'), [cash, budgets]);

  const open = () => { setError(''); setEditor(Object.fromEntries(cats.map(c => [c, budgets?.[c] ? String(budgets[c]) : '']))); };
  const save = () => {
    if (!editor) return;
    const r = db.setBudgets(editor);
    if (!r.success) { setError(r.category ? t(`Montant invalide pour « ${r.category} ».`, `Invalid amount for “${r.category}”.`) : t('Budgets invalides (30 catégories au plus).', 'Invalid budgets (30 categories at most).')); return; }
    setEditor(null); setError('');
  };

  return (
    <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">{t('Budgets du mois', 'Budgets this month')}</h2>
          <p className="text-[11px] text-slate-400">{t('Un plafond par catégorie de dépense. Attention à 80 %, dépassé après 100 %.', 'One cap per expense category. Warning at 80%, exceeded above 100%.')}</p>
        </div>
        <button type="button" onClick={open} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5 shrink-0"><Settings2 className="w-4 h-4" />{t('Régler', 'Set')}</button>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400 py-1">{t('Aucun budget réglé. Touche « Régler » pour fixer un plafond (par exemple Achats ou Internet).', 'No budget set. Tap “Set” to fix a cap (for example Achats or Internet).')}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.category}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-white truncate">{r.category}</span>
                <span className={`font-semibold whitespace-nowrap ${TXT[r.status]}`}>{r.pct} %</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, r.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={r.category}>
                <div className={`h-full ${BAR[r.status]}`} style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} />
              </div>
              <div className="text-[11px] text-slate-400">{ar(r.spent)} / {ar(r.budget)} · {r.left >= 0 ? t(`reste ${ar(r.left)}`, `${ar(r.left)} left`) : t(`dépassé de ${ar(-r.left)}`, `over by ${ar(-r.left)}`)}</div>
            </li>
          ))}
        </ul>
      )}
      {editor && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setEditor(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{t('Budgets mensuels', 'Monthly budgets')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[12px] text-slate-400">{t('Plafond par mois, en Ar. Vide ou 0 = pas de plafond pour cette catégorie.', 'Cap per month, in Ar. Empty or 0 = no cap for this category.')}</p>
            {cats.map(c => (
              <label key={c} className="block text-xs text-slate-400">{c}
                <input inputMode="numeric" value={editor[c] ?? ''} onChange={e => setEditor({ ...editor, [c]: e.target.value })} className={`${field} mt-1`} placeholder="0" />
              </label>
            ))}
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
