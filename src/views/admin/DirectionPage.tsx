import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, Boxes, HeartPulse, Landmark, Target, Trophy, Users, Wallet } from 'lucide-react';
import { PLAN_STATUS_LABEL } from '../../utils/budgetPlan';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { directionSummary } from '../../utils/direction';
import { usePerformance } from '../../utils/usePerformance';
import { rankByScore } from '../../utils/performanceScore';
import { getHealth, subscribeHealth } from '../../utils/healthDb';
import { periodLabel, todayMada } from '../../utils/stats';

// Page « Direction » (M8.1, responsable seulement) : une page de synthèse. AUCUN calcul nouveau (src/utils/direction.ts rassemble les règles existantes).
// Chaque carte renvoie vers la page qui détaille.
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-2.5';
const link = 'min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 underline-offset-2 hover:underline';

export const DirectionPage: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, tick] = useState(0);
  useEffect(() => {
    const a = subscribeHealth(() => tick(x => x + 1)), b = db.subscribe(() => tick(x => x + 1));
    return () => { a(); if (typeof b === 'function') b(); };
  }, []);
  const perf = usePerformance();
  const today = todayMada();
  const s: any = db.getSettings();
  const alerts = getHealth().alerts;
  const sum = useMemo(
    () => directionSummary({
      today, cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), clients: db.getClients(), invoices: db.getInvoices(), products: db.getProducts(), moves: db.getStockMoves(),
      prices: s, pricePerMission: s.price_per_mission || 0, ranking: rankByScore(perf.res), alerts,
      entries: db.getEntries(), monthlyPlan: s.monthly_plan, budgets: s.budgets,
    }),
    [today, db.getCash(), db.getPosts(), db.getContracts(), db.getClients(), db.getInvoices(), db.getProducts(), db.getStockMoves(), db.getEntries(), s, perf.res, alerts], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ar = (n: number) => formatCurrencyAr(n);
  const go = (view: string, fr: string, en: string) => (onNavigate ? <button type="button" className={link} onClick={() => onNavigate(view)}>{t(fr, en)}<ArrowRight className="w-4 h-4" aria-hidden="true" /></button> : null);
  const head = (icon: React.ReactNode, fr: string, en: string) => (<div className="flex items-center gap-2 text-sm font-bold text-white">{icon}{t(fr, en)}</div>);
  const row = (k: string, v: React.ReactNode, tone = 'text-white') => (<div className="flex justify-between gap-3 text-sm"><span className="text-slate-400">{k}</span><span className={`font-semibold text-right ${tone}`}>{v}</span></div>);
  const u = sum.alerts.urgent, w = sum.alerts.watch;

  return (
    <div className="space-y-3 max-w-5xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <h1 className="text-base sm:text-lg font-bold text-white">{t('Direction', 'Management')}</h1>
        <p className="text-[11px] text-slate-400">{t('Le mois en cours en une page :', 'The current month on one page:')} {periodLabel('month', today, lang === 'en' ? 'en' : 'fr')}. {t('Aucun calcul nouveau : ce sont les chiffres des autres pages.', 'No new calculation: these are the figures of the other pages.')}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className={card}>
          {head(<Landmark className="w-4 h-4 text-emerald-400" aria-hidden="true" />, 'Argent du mois', 'Money this month')}
          {row(sum.revenue.estimated ? t('Chiffre d\'affaires (estimé : missions validées)', 'Revenue (estimated: validated missions)') : t(`Chiffre d'affaires (${sum.revenue.invoices} facture(s) émise(s))`, `Revenue (${sum.revenue.invoices} invoice(s) issued)`), ar(sum.revenue.amount))}
          {row(t('Encaissé', 'Received'), ar(sum.money.received))}
          {row(t('Dépenses + salaires', 'Expenses + salaries'), ar(sum.money.out))}
          {row(t('Bénéfice', 'Profit'), `${ar(sum.money.profit)}${sum.money.marginPct !== null ? ` (${sum.money.marginPct} %)` : ''}`, sum.money.profit < 0 ? 'text-red-400' : 'text-emerald-400')}
          {row(t('Trésorerie', 'Cash'), ar(sum.money.treasury), sum.money.treasury < 0 ? 'text-red-400' : 'text-white')}
          {go('stats', 'Voir les finances', 'See the finances')}
        </div>

        <div className={card}>
          {head(<Wallet className="w-4 h-4 text-amber-400" aria-hidden="true" />, 'Créances en retard', 'Overdue receivables')}
          {sum.receivables.clients === 0 ? <p className="text-sm text-slate-400">{t('Aucune facture en retard.', 'No overdue invoice.')}</p> : (
            <>
              {row(t('Total en retard', 'Total overdue'), ar(sum.receivables.total), 'text-amber-300')}
              {row(t('Clients à relancer', 'Clients to chase'), String(sum.receivables.clients))}
              {row(t('Plus ancien retard', 'Oldest delay'), t(`${sum.receivables.oldestDays} jours`, `${sum.receivables.oldestDays} days`))}
              <ul className="text-xs text-slate-300 space-y-0.5">{sum.receivables.top.map(r => (<li key={r.client_id}>{r.client_name} : {ar(r.total)} · {t(`${r.max_days} j`, `${r.max_days} d`)}</li>))}</ul>
            </>
          )}
          {sum.receivables.unbilledTotal > 0 && row(t('Missions validées pas encore facturées', 'Validated missions not yet invoiced'), ar(sum.receivables.unbilledTotal))}
          {go('invoices', 'Voir la facturation', 'See invoicing')}
        </div>

        {sum.accounting && (
          <div className={card}>
            {head(<BookOpen className="w-4 h-4 text-violet-400" aria-hidden="true" />, 'Comptabilité du mois', 'Accounting this month')}
            {row(t('Produits (ventes)', 'Income (sales)'), ar(sum.accounting.income))}
            {row(t('Charges', 'Expenses'), ar(sum.accounting.expense))}
            {row(t('Résultat comptable', 'Accounting result'), ar(sum.accounting.result), sum.accounting.result < 0 ? 'text-red-400' : 'text-emerald-400')}
            {row(t('TVA à payer (collectée − déductible)', 'VAT due (collected − deductible)'), ar(sum.accounting.vatDue))}
            {go('accounting', 'Voir la comptabilité', 'See accounting')}
          </div>
        )}

        {sum.plan && (
          <div className={card}>
            {head(<Target className="w-4 h-4 text-cyan-400" aria-hidden="true" />, 'Prévu contre réel', 'Planned vs actual')}
            {([['revenue', 'Revenus encaissés', 'Revenue received'], ['expenses', 'Dépenses', 'Expenses'], ['payroll', 'Paie', 'Payroll']] as const).map(([k, fr, en]) => {
              const l = sum.plan![k], st = PLAN_STATUS_LABEL[l.status];
              return <React.Fragment key={k}>{row(t(fr, en), l.status === 'none' ? t('rien de prévu', 'nothing planned') : `${ar(l.actual)} / ${ar(l.planned)} · ${lang === 'en' ? st.en : st.fr}`, l.status === 'bad' ? 'text-red-400' : l.status === 'watch' ? 'text-amber-300' : 'text-white')}</React.Fragment>;
            })}
            {go('stats', 'Voir les finances', 'See the finances')}
          </div>
        )}

        <div className={card}>
          {head(<Users className="w-4 h-4 text-sky-400" aria-hidden="true" />, 'Meilleurs clients du mois', 'Top clients this month')}
          {sum.topClients.length === 0 ? <p className="text-sm text-slate-400">{t('Aucun paiement reçu ce mois-ci.', 'No payment received this month.')}</p> : (
            <ol className="text-sm text-slate-200 space-y-1">{sum.topClients.map((c, i) => (<li key={`${c.id || c.name}-${i}`} className="flex justify-between gap-3"><span>{i + 1}. {c.name}</span><span className="font-semibold">{ar(c.amount)}</span></li>))}</ol>
          )}
          {go('clients', 'Voir les clients', 'See clients')}
        </div>

        <div className={card}>
          {head(<Trophy className="w-4 h-4 text-amber-400" aria-hidden="true" />, 'Meilleurs salariés (30 jours)', 'Top employees (30 days)')}
          {sum.topEmployees.length === 0 ? <p className="text-sm text-slate-400">{t('Pas encore assez de missions jugées pour un score.', 'Not enough judged missions for a score yet.')}</p> : (
            <ol className="text-sm text-slate-200 space-y-1">{sum.topEmployees.map((e, i) => (<li key={e.id} className="flex justify-between gap-3"><span>{i + 1}. {e.name}</span><span className="font-semibold">{e.score}/100</span></li>))}</ol>
          )}
          {go('performance', 'Voir la performance', 'See performance')}
        </div>

        <div className={card}>
          {head(<Boxes className="w-4 h-4 text-red-400" aria-hidden="true" />, 'Stock critique', 'Critical stock')}
          {sum.stock.count === 0 ? <p className="text-sm text-slate-400">{t('Aucun produit sous son seuil.', 'No product below its threshold.')}</p> : (
            <>
              <p className="text-xs text-slate-400">{t(`${sum.stock.count} produit(s) sous le seuil d'alerte`, `${sum.stock.count} product(s) below the alert threshold`)}</p>
              <ul className="text-sm text-slate-200 space-y-0.5">{sum.stock.rows.map(r => (<li key={r.product.id} className="flex justify-between gap-3"><span>{r.product.name}</span><span className={`font-semibold ${r.negative ? 'text-red-400' : r.empty ? 'text-amber-300' : 'text-white'}`}>{r.qty} {r.product.unit}</span></li>))}</ul>
            </>
          )}
          {go('stats', 'Voir le stock', 'See stock')}
        </div>

        <div className={card}>
          {head(<HeartPulse className="w-4 h-4 text-red-400" aria-hidden="true" />, 'Alertes', 'Alerts')}
          {u + w === 0 ? <p className="text-sm text-slate-400">{t('Rien à signaler.', 'Nothing to report.')}</p> : (
            <>
              <p className="text-xs text-slate-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />{t(`${u} urgente(s), ${w} à voir`, `${u} urgent, ${w} to watch`)}</p>
              <ul className="text-sm text-slate-200 space-y-1">{sum.alerts.top.map(a => (<li key={a.id} className={a.severity === 'urgent' ? 'text-red-300' : ''}>{lang === 'en' ? a.title_en : a.title_fr}</li>))}</ul>
            </>
          )}
          {go('health', 'Voir la santé du site', 'See site health')}
        </div>
      </div>
    </div>
  );
};
