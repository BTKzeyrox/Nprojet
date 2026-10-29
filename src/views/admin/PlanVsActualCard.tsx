import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { budgetVsActual, plannedExpenses, PLAN_STATUS_LABEL, type PlanLine, type PlanStatus } from '../../utils/budgetPlan';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';
const STATUS_CLS: Record<PlanStatus, string> = {
  good: 'text-emerald-300 border-emerald-500', watch: 'text-amber-300 border-amber-500', bad: 'text-red-300 border-red-500', open: 'text-sky-300 border-sky-500', none: 'text-slate-500 border-slate-700',
};

/**
 * Carte « Prévu contre réel » de l'onglet Finances (M15.4, responsable seulement).
 * Prévu : dépenses = total des budgets par catégorie ; revenus et paie = deux montants mensuels que le responsable règle ici.
 * Réel : toujours calculé (argent reçu, dépenses payées, salaires des missions validées), jamais saisi. Les 6 derniers mois, le plus récent en premier.
 */
export const PlanVsActualCard: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const s = db.getSettings();
  const plan = db.getMonthlyPlan();
  const [rev, setRev] = useState(plan.revenue_ar ? String(plan.revenue_ar) : '');
  const [pay, setPay] = useState(plan.payroll_ar ? String(plan.payroll_ar) : '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = todayMada();
  const cash = db.getCash(), posts = db.getPosts(), contracts = db.getContracts(), clients = db.getClients();
  const rows = useMemo(
    () => budgetVsActual({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0, clients }, plan, s.budgets, today, 6).reverse(),
    [cash, posts, contracts, clients, s, plan.revenue_ar, plan.payroll_ar, today], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const exp = plannedExpenses(s.budgets);
  const ar = (n: number) => formatCurrencyAr(n);
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${ar(Math.abs(n))}`;
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const save = () => {
    const r = db.saveMonthlyPlan({ revenue_ar: rev.trim() === '' ? 0 : Number(rev), payroll_ar: pay.trim() === '' ? 0 : Number(pay) });
    setMsg({ ok: r.success, text: r.success ? t('Plan enregistré.', 'Plan saved.') : (r.error || t('Enregistrement impossible.', 'Could not save.')) });
  };
  const line = (label: string, l: PlanLine, kind: 'revenue' | 'cost') => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 py-1.5 border-t border-slate-800 first:border-t-0">
      <div className="text-sm font-semibold text-white">{label}</div>
      <span className={`justify-self-end rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[l.status]}`}>{PLAN_STATUS_LABEL[l.status][lang === 'en' ? 'en' : 'fr']}</span>
      <div className="col-span-2 flex flex-wrap justify-between gap-x-3 text-xs font-mono text-slate-300">
        <span>{t('Prévu', 'Planned')} : {l.status === 'none' ? '—' : ar(l.planned)}</span>
        <span>{t('Réel', 'Actual')} : {ar(l.actual)}</span>
        {l.status !== 'none' && <span>{t('Écart', 'Gap')} : {signed(l.gap)}{kind === 'cost' ? (l.gap < 0 ? t(' (dépassé)', ' (over)') : t(' (marge)', ' (left)')) : ''}</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-[#0f1722] border border-slate-700 rounded-2xl p-3 sm:p-4 space-y-3">
      <h2 className="text-sm font-bold text-white">{t('Prévu contre réel', 'Planned vs actual')}</h2>
      <p className="text-[11px] text-slate-400">{t('Le réel est calculé : argent reçu, dépenses payées, salaires des missions validées. Le prévu des dépenses est le total des budgets par catégorie ci-dessus. Règle ici les revenus et la paie prévus chaque mois.', 'The actual is computed: money received, expenses paid, salaries of validated missions. Planned expenses are the total of the category budgets above. Set the planned monthly revenue and payroll here.')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>{t('Revenus prévus / mois (Ar)', 'Planned revenue / month (Ar)')}</label><input inputMode="numeric" value={rev} onChange={e => { setRev(e.target.value.replace(/[^\d]/g, '')); setMsg(null); }} className={inputCls} placeholder="0" /></div>
        <div><label className={labelCls}>{t('Paie prévue / mois (Ar)', 'Planned payroll / month (Ar)')}</label><input inputMode="numeric" value={pay} onChange={e => { setPay(e.target.value.replace(/[^\d]/g, '')); setMsg(null); }} className={inputCls} placeholder="0" /></div>
      </div>
      <div className="text-xs font-mono text-slate-400">{t('Dépenses prévues / mois (budgets par catégorie)', 'Planned expenses / month (category budgets)')} : {exp > 0 ? ar(exp) : t('aucun budget réglé', 'no budget set')}</div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="min-h-[44px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">{t('Enregistrer le plan', 'Save plan')}</button>
        {msg && <span role="status" className={`text-xs font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{msg.text}</span>}
      </div>
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.month} className="rounded-xl border border-slate-700 p-2.5">
            <div className="text-sm font-bold text-white capitalize mb-1">{monthLabel(r.month)}{r.partial && <span className="ml-2 text-[11px] font-mono font-normal text-sky-300 normal-case">{t('mois en cours', 'current month')}</span>}</div>
            {line(t('Revenus', 'Revenue'), r.revenue, 'revenue')}
            {line(t('Dépenses', 'Expenses'), r.expenses, 'cost')}
            {line(t('Paie', 'Payroll'), r.payroll, 'cost')}
            {line(t('Bénéfice', 'Profit'), r.profit, 'revenue')}
          </li>
        ))}
      </ul>
    </div>
  );
};
