import React, { useMemo } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { computeFinance } from '../../utils/financeStats';
import { daysBetween, todayMada, type StatsGranularity } from '../../utils/stats';
import { DonutChart, RankBars, XYChart, compactNumber } from '../../components/charts/Charts';
import { BilledReceivedBars, MoneyFlowChart } from '../../components/charts/StyledCharts';
import { invoiceFigures } from '../../utils/invoiceStats';
import { forecastMonth, monthFigures } from '../../utils/goals';
import { actualUntil, forecastLine } from '../../utils/chartData';
import { WhyFigure } from '../../components/WhyFigure';
import type { FigureId } from '../../utils/siteSnapshot';

// Chiffres et graphiques financiers de la période (responsable seulement). Tout est calculé ici, sans appel serveur.
interface Props { range: { start: string; end: string }; lang: 'fr' | 'en' }

// Le type de période se devine avec le nombre de jours : 1 = jour, 7 = semaine, 28 à 31 = mois, plus = année
const granOf = (days: number): StatsGranularity => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 92 ? 'month' : 'year');

const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const BY: Record<StatsGranularity, { fr: string; en: string }> = {
  day: { fr: 'par heure', en: 'by hour' }, week: { fr: 'par jour', en: 'by day' }, month: { fr: 'par jour', en: 'by day' }, year: { fr: 'par mois', en: 'by month' },
};

export const FinanceInsights: React.FC<Props> = ({ range: r, lang }) => {
  const days = Math.max(1, daysBetween(r.start, r.end) + 1);
  const g = granOf(days);
  const range = { start: r.start, end: r.end, days };
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const s = db.getSettings();
  const cash = db.getCash(), posts = db.getPosts(), contracts = db.getContracts(), clients = db.getClients();
  const f = useMemo(
    () => computeFinance({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0, clients }, g, range, lang, t('Salaires', 'Salaries')),
    [cash, posts, contracts, clients, s, g, range.start, range.end, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const invoices = db.getInvoices();
  const inv = useMemo(
    () => (invoices.length || clients.length ? invoiceFigures({ invoices, cash, posts, contracts, clients, prices: s, today: todayMada(), range: { start: r.start, end: r.end } }) : null),
    [invoices, cash, posts, contracts, clients, s, r.start, r.end], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ar = (n: number) => formatCurrencyAr(n);
  const short = (n: number) => compactNumber(n);
  // Objectif de bénéfice et prévision de fin de mois : seulement sur le mois en cours (par jour)
  const today = todayMada();
  const onThisMonth = g === 'month' && r.start <= today && today <= r.end;
  const todayIdx = onThisMonth ? daysBetween(r.start, today) : -1;
  const fc = onThisMonth ? forecastMonth(monthFigures({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0 }, today)) : null;
  const goalProfit = onThisMonth ? Number(s.goal_profit_ar) || 0 : 0;
  const cum = f.series.cumulative;
  const cumSeries = todayIdx >= 0 && todayIdx < cum.length
    ? [
        { key: 'cum', label: t('Bénéfice cumulé', 'Cumulative profit'), values: actualUntil(cum, todayIdx), kind: 'area' as const },
        ...(fc ? [{ key: 'fc', label: t('Prévision fin de mois', 'End-of-month forecast'), values: forecastLine(cum, todayIdx, fc.profit), kind: 'line' as const, dashed: true, color: '#a78bfa' }] : []),
      ]
    : [{ key: 'cum', label: t('Bénéfice cumulé', 'Cumulative profit'), values: cum, kind: 'area' as const }];
  const tile = (label: string, value: string, tone = 'text-white', hint?: string, why?: FigureId) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0">
      <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1"><span className="truncate">{label}</span>{why && <WhyFigure id={why} range={r} lang={lang} />}</div>
      <div className={`text-base font-bold truncate ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 truncate">{hint}</div>}
    </div>
  );
  const dash = '—';
  const noPrice = f.billed === 0 && f.done > 0;

  return (
    <div className="space-y-3" data-notranslate="">
      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Résultat de la période', 'Result for the period')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tile(t('Bénéfice net', 'Net profit'), ar(f.profit), f.profit < 0 ? 'text-rose-400' : 'text-emerald-400', t('reçu − dépenses − salaires', 'received − expenses − salaries'), 'profit')}
          {tile(t('Marge', 'Margin'), f.marginPct === null ? dash : `${f.marginPct} %`, f.marginPct !== null && f.marginPct < 0 ? 'text-rose-400' : 'text-white', f.marginPct === null ? t('aucun paiement reçu', 'no payment received') : t('bénéfice ÷ reçu', 'profit ÷ received'), 'margin')}
          {tile(t('À encaisser', 'To collect'), ar(f.toCollect), 'text-amber-400', t(`facturé ${ar(f.billed)}`, `billed ${ar(f.billed)}`), 'toCollect')}
          {tile(t('Trésorerie', 'Cash on hand'), ar(f.treasury), f.treasury < 0 ? 'text-rose-400' : 'text-sky-300', t('depuis le début', 'since the start'), 'treasury')}
          {tile(t('Coût par mission', 'Cost per mission'), f.costPerMission === null ? dash : ar(f.costPerMission), 'text-white', t(`${f.done} mission(s) validée(s)`, `${f.done} validated mission(s)`), 'costPerMission')}
          {tile(t('Gain par mission', 'Gain per mission'), f.gainPerMission === null ? dash : ar(f.gainPerMission), f.gainPerMission !== null && f.gainPerMission < 0 ? 'text-rose-400' : 'text-white', undefined, 'gainPerMission')}
        </div>
        <div className="text-sm text-slate-300">
          {t('Meilleur client', 'Best client')} : {f.bestClient ? <b className="text-white">{f.bestClient.name} · {ar(f.bestClient.amount)}</b> : <span className="text-slate-500">{dash}</span>}
        </div>
        {inv && (invoices.length > 0 || inv.unbilled_count > 0) && (
          <div className="border-t border-slate-700 pt-3 space-y-2" data-testid="invoice-figures">
            <h3 className="text-xs font-bold text-slate-300">{t('Factures (module Facturation)', 'Invoices (Invoicing module)')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {tile(t('Émises sur la période', 'Issued in the period'), ar(inv.issued_total), 'text-white', t(`${inv.issued_count} facture(s)`, `${inv.issued_count} invoice(s)`))}
              {tile(t('Reste à payer', 'Left to pay'), ar(inv.to_collect), 'text-amber-400', t(`${inv.open_count} facture(s) ouverte(s)`, `${inv.open_count} open invoice(s)`))}
              {tile(t('Dont en retard', 'Of which overdue'), ar(inv.overdue), inv.overdue > 0 ? 'text-rose-400' : 'text-white')}
              {tile(t('Pas encore facturé', 'Not yet invoiced'), ar(inv.unbilled_total), inv.unbilled_total > 0 ? 'text-sky-300' : 'text-white', t(`${inv.unbilled_count} mission(s) validée(s)`, `${inv.unbilled_count} approved mission(s)`))}
            </div>
            <p className="text-[11px] text-slate-500">{t('« À encaisser » plus haut = missions validées × prix client − argent reçu (sert aux marges). Les chiffres ci-dessus viennent des factures émises.', '“To collect” above = approved missions × client price − money received (used for margins). The figures here come from issued invoices.')}</p>
          </div>
        )}
        {noPrice && <p className="text-[11px] text-amber-300">{t('Le prix client vaut 0 : « À encaisser » et les marges restent à 0. Règle-le dans Réglages > Missions.', 'Client price is 0: “To collect” and margins stay at 0. Set it in Settings > Missions.')}</p>}
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Clients : argent reçu', 'Clients: money received')}</h2>
        <RankBars lang={lang} ariaLabel={t('Classement des clients par argent reçu', 'Clients ranked by money received')} format={ar} limit={5} showShare
          emptyText={t('Aucun paiement avec un nom de client sur cette période.', 'No payment with a client name in this period.')}
          items={f.clients.map(c => ({ key: c.name, label: c.name, value: c.amount, valueText: ar(c.amount) }))} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Argent reçu et dépenses', 'Money in and out')} <span className="text-xs font-normal text-slate-400">({BY[g][lang]})</span></h2>
        <MoneyFlowChart labels={f.labels} fullLabels={f.fullLabels} inflow={f.series.inflow} outflow={f.series.outflow} format={ar} axisFormat={short} lang={lang}
          inLabel={t('Argent reçu', 'Money received')} outLabel={t('Dépenses', 'Expenses')} balanceLabel={t('Solde', 'Balance')} ariaLabel={t('Argent reçu et dépenses', 'Money received and expenses')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Bénéfice cumulé', 'Cumulative profit')}</h2>
        <XYChart labels={f.labels} fullLabels={f.fullLabels} lang={lang} format={ar} axisFormat={short} summary="last" signColors legend={cumSeries.length > 1}
          ariaLabel={t('Bénéfice cumulé', 'Cumulative profit')} series={cumSeries}
          refLines={goalProfit > 0 ? [{ value: goalProfit, label: t('Objectif', 'Goal'), color: '#a78bfa' }] : []} />
        {fc && <p className="text-[11px] text-slate-500">{t(`Prévision : ${ar(fc.profit)} à la fin du mois, au rythme actuel.`, `Forecast: ${ar(fc.profit)} at the end of the month at the current pace.`)}</p>}
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Facturé et reçu', 'Billed and received')}</h2>
        <BilledReceivedBars labels={f.labels} fullLabels={f.fullLabels} billed={f.series.billed} received={f.series.inflow} format={ar} axisFormat={short} lang={lang}
          billedLabel={t('Facturé', 'Billed')} receivedLabel={t('Reçu', 'Received')} leftLabel={t('Reste à encaisser', 'Left to collect')} ariaLabel={t('Facturé et reçu', 'Billed and received')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Dépenses par catégorie', 'Expenses by category')}</h2>
        <DonutChart items={f.expensesByCategory} format={short} centerLabel="Ar" lang={lang} ariaLabel={t('Dépenses par catégorie', 'Expenses by category')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Marge par type de mission', 'Margin by mission type')}</h2>
        <RankBars lang={lang} ariaLabel={t('Marge par type de mission', 'Margin by mission type')} emptyText={t('Aucune mission validée sur cette période.', 'No validated mission in this period.')} format={ar}
          items={f.byType.map(r => ({
            key: r.type, label: r.type, value: r.margin, valueText: `${r.margin < 0 ? '−' : ''}${ar(Math.abs(r.margin))}${r.marginPct !== null ? ` · ${r.marginPct} %` : ''}`,
            sub: <div className="text-[11px] text-slate-400">{t(`${r.done} mission(s) · facturé ${ar(r.billed)} · salaires ${ar(r.salaries)}`, `${r.done} mission(s) · billed ${ar(r.billed)} · salaries ${ar(r.salaries)}`)}</div>,
          }))} />
        <p className="text-[11px] text-slate-500">{t('Marge d\'un type = prix client − salaire des missions validées (sans les autres dépenses).', 'Type margin = client price − salaries of validated missions (other expenses not included).')}</p>
      </div>
    </div>
  );
};
