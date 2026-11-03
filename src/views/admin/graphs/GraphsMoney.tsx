// Cartes « Argent » de la page Graphiques : argent reçu et dépenses, bénéfice cumulé, solde de la caisse, facturé et reçu, dépenses par catégorie, clients, d'où vient l'argent, marge par type.
// Mêmes calculs que Statistiques > Finances (computeFinance) et que la Trésorerie (treasuryCharts). « Argent reçu et dépenses » et « Dépenses par catégorie » se lisent AVEC les salaires (Finances) ou SANS (la caisse, comme la Trésorerie) : un seul bouton pour les deux cartes. Responsable seulement.
import React, { useMemo, useState } from 'react';
import { db } from '../../../db/store';
import { formatCurrencyAr } from '../../../utils/formatUtils';
import { computeFinance } from '../../../utils/financeStats';
import { daysBetween, type StatsGranularity } from '../../../utils/stats';
import { treasuryCharts } from '../../../utils/treasuryCharts';
import { forecastMonth, monthFigures } from '../../../utils/goals';
import { actualUntil, forecastLine } from '../../../utils/chartData';
import { cashRangeFor, cashRangeIsMonthOfYear } from '../../../utils/graphsPage';
import { DonutChart, RankBars, XYChart, compactNumber } from '../../../components/charts/Charts';
import { BilledReceivedBars, MoneyFlowChart } from '../../../components/charts/StyledCharts';
import { GraphCard, GraphToggle } from './GraphCard';

const BY: Record<StatsGranularity, { fr: string; en: string }> = {
  day: { fr: 'par heure', en: 'by hour' }, week: { fr: 'par jour', en: 'by day' }, month: { fr: 'par jour', en: 'by day' }, year: { fr: 'par mois', en: 'by month' },
};
interface Props { g: StatsGranularity; range: { start: string; end: string }; anchor: string; today: string; lang: 'fr' | 'en'; show: (id: string) => boolean }

export const GraphsMoney: React.FC<Props> = ({ g, range: r, anchor, today, lang, show }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [mode, setMode] = useState<'all' | 'cash'>('all'); // avec les salaires (Finances) ou sans (la caisse)
  const days = Math.max(1, daysBetween(r.start, r.end) + 1), range = { start: r.start, end: r.end, days };
  const s = db.getSettings(), cash = db.getCash(), posts = db.getPosts(), contracts = db.getContracts(), clients = db.getClients();
  const f = useMemo(() => computeFinance({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0, clients }, g, range, lang, t('Salaires', 'Salaries')),
    [cash, posts, contracts, clients, s, g, range.start, range.end, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const cr = cashRangeFor(g, anchor, today);
  const c = useMemo(() => treasuryCharts(cash, cr, today), [cash, cr.start, cr.end, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const ar = (n: number) => formatCurrencyAr(n), short = (n: number) => compactNumber(n);
  const rank = (list: { label: string; value: number }[]) => list.map(x => ({ key: x.label, label: x.label, value: x.value, valueText: ar(x.value) }));
  // Bénéfice cumulé : objectif et prévision de fin de mois, seulement sur le mois en cours (comme Finances)
  const onThisMonth = g === 'month' && r.start <= today && today <= r.end, todayIdx = onThisMonth ? daysBetween(r.start, today) : -1;
  const fc = onThisMonth ? forecastMonth(monthFigures({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0 }, today)) : null;
  const goalProfit = onThisMonth ? Number(s.goal_profit_ar) || 0 : 0, cum = f.series.cumulative;
  const cumSeries = todayIdx >= 0 && todayIdx < cum.length
    ? [{ key: 'cum', label: t('Bénéfice cumulé', 'Cumulative profit'), values: actualUntil(cum, todayIdx), kind: 'area' as const },
       ...(fc ? [{ key: 'fc', label: t('Prévision fin de mois', 'End-of-month forecast'), values: forecastLine(cum, todayIdx, fc.profit), kind: 'line' as const, dashed: true, color: '#a78bfa' }] : [])]
    : [{ key: 'cum', label: t('Bénéfice cumulé', 'Cumulative profit'), values: cum, kind: 'area' as const }];
  const toggle = <GraphToggle label={t('Avec ou sans les salaires', 'With or without salaries')} value={mode} onChange={v => setMode(v === 'cash' ? 'cash' : 'all')} options={[['all', t('Avec salaires', 'With salaries')], ['cash', t('Caisse (sans salaires)', 'Cash (no salaries)')]]} />;
  const monthNote = cashRangeIsMonthOfYear(g) ? t(`Affiche le mois du ${cr.start.split('-').reverse().join('/')} au ${cr.end.split('-').reverse().join('/')} : la caisse se lit jour par jour.`, `Shows the month from ${cr.start} to ${cr.end}: the cash is read day by day.`) : undefined;
  const modeNote = mode === 'all'
    ? t('Dépenses = dépenses saisies + salaires des missions validées (comme Statistiques > Finances).', 'Expenses = entered expenses + salaries of validated missions (as in Statistics > Finances).')
    : t('Sans aucun salaire : seulement ce qui passe par la caisse (comme la page Trésorerie).', 'No salaries: only what goes through the cash book (as in the Treasury page).');
  return (
    <>
      {show('flow') && (
        <GraphCard id="flow" title={`${t('Argent reçu et dépenses', 'Money in and out')} (${mode === 'all' ? BY[g][lang] : t('par jour', 'by day')})`} right={toggle} note={[modeNote, mode === 'cash' ? monthNote : ''].filter(Boolean).join(' ')}>
          {mode === 'all'
            ? <MoneyFlowChart labels={f.labels} fullLabels={f.fullLabels} inflow={f.series.inflow} outflow={f.series.outflow} format={ar} axisFormat={short} lang={lang}
                inLabel={t('Argent reçu', 'Money received')} outLabel={t('Dépenses', 'Expenses')} balanceLabel={t('Solde', 'Balance')} ariaLabel={t('Argent reçu et dépenses', 'Money received and expenses')} />
            : <MoneyFlowChart labels={c.labels} fullLabels={c.fullLabels} inflow={c.inflow} outflow={c.outflow} format={ar} axisFormat={short} lang={lang}
                inLabel={t('Argent reçu', 'Money received')} outLabel={t('Dépenses', 'Expenses')} balanceLabel={t('Solde', 'Balance')} ariaLabel={t('Argent reçu et dépenses, sans salaires', 'Money received and expenses, without salaries')} />}
        </GraphCard>
      )}
      {show('cum') && (
        <GraphCard id="cum" title={t('Bénéfice cumulé', 'Cumulative profit')} note={fc ? t(`Prévision : ${ar(fc.profit)} à la fin du mois, au rythme actuel.`, `Forecast: ${ar(fc.profit)} at the end of the month at the current pace.`) : undefined}>
          <XYChart labels={f.labels} fullLabels={f.fullLabels} lang={lang} format={ar} axisFormat={short} summary="last" signColors legend={cumSeries.length > 1} ariaLabel={t('Bénéfice cumulé', 'Cumulative profit')} series={cumSeries}
            refLines={goalProfit > 0 ? [{ value: goalProfit, label: t('Objectif', 'Goal'), color: '#a78bfa' }] : []} />
        </GraphCard>
      )}
      {show('balance') && (
        <GraphCard id="balance" title={t('Solde de la caisse', 'Cash balance')} note={monthNote}>
          <XYChart labels={c.labels} fullLabels={c.fullLabels} lang={lang} format={ar} axisFormat={short} summary="last" signColors
            ariaLabel={t('Solde de la caisse jour après jour : il part de ce qui restait à la fin du mois précédent', 'Cash balance day by day: it starts from what was left at the end of the previous month')}
            series={[{ key: 'bal', label: t('Solde de la caisse', 'Cash balance'), values: c.balanceTotal, kind: 'area' as const }]} />
        </GraphCard>
      )}
      {show('billed') && (
        <GraphCard id="billed" title={t('Facturé et reçu', 'Billed and received')}>
          <BilledReceivedBars labels={f.labels} fullLabels={f.fullLabels} billed={f.series.billed} received={f.series.inflow} format={ar} axisFormat={short} lang={lang}
            billedLabel={t('Facturé', 'Billed')} receivedLabel={t('Reçu', 'Received')} leftLabel={t('Reste à encaisser', 'Left to collect')} ariaLabel={t('Facturé et reçu', 'Billed and received')} />
        </GraphCard>
      )}
      {show('categories') && (
        <GraphCard id="categories" title={t('Dépenses par catégorie', 'Expenses by category')} right={toggle} note={[modeNote, mode === 'cash' ? monthNote : ''].filter(Boolean).join(' ')}>
          {mode === 'all'
            ? <DonutChart items={f.expensesByCategory} format={short} centerLabel="Ar" lang={lang} ariaLabel={t('Dépenses par catégorie', 'Expenses by category')} />
            : <RankBars lang={lang} ariaLabel={t('Dépenses par catégorie', 'Expenses by category')} format={ar} limit={6} showShare emptyText={t('Aucune dépense sur cette période.', 'No expense in this period.')} items={rank(c.outByCategory)} />}
        </GraphCard>
      )}
      {show('clients') && (
        <GraphCard id="clients" title={t('Clients : argent reçu', 'Clients: money received')}>
          <RankBars lang={lang} ariaLabel={t('Classement des clients par argent reçu', 'Clients ranked by money received')} format={ar} limit={5} showShare
            emptyText={t('Aucun paiement avec un nom de client sur cette période.', 'No payment with a client name in this period.')} items={f.clients.map(x => ({ key: x.name, label: x.name, value: x.amount, valueText: ar(x.amount) }))} />
        </GraphCard>
      )}
      {show('sources') && (
        <GraphCard id="sources" title={t('D\'où vient l\'argent', 'Where the money comes from')} note={monthNote}>
          <RankBars lang={lang} ariaLabel={t('Argent reçu par catégorie', 'Money received by category')} format={ar} limit={6} showShare emptyText={t('Aucun argent reçu sur cette période.', 'No money received in this period.')} items={rank(c.inByCategory)} />
        </GraphCard>
      )}
      {show('margin') && (
        <GraphCard id="margin" title={t('Marge par type de mission', 'Margin by mission type')} note={t('Marge d\'un type = prix client − salaire des missions validées (sans les autres dépenses).', 'Type margin = client price − salaries of validated missions (other expenses not included).')}>
          <RankBars lang={lang} ariaLabel={t('Marge par type de mission', 'Margin by mission type')} emptyText={t('Aucune mission validée sur cette période.', 'No validated mission in this period.')} format={ar}
            items={f.byType.map(x => ({ key: x.type, label: x.type, value: x.margin, valueText: `${x.margin < 0 ? '−' : ''}${ar(Math.abs(x.margin))}${x.marginPct !== null ? ` · ${x.marginPct} %` : ''}`,
              sub: <div className="text-[11px] text-slate-400">{t(`${x.done} mission(s) · facturé ${ar(x.billed)} · salaires ${ar(x.salaries)}`, `${x.done} mission(s) · billed ${ar(x.billed)} · salaries ${ar(x.salaries)}`)}</div> }))} />
        </GraphCard>
      )}
    </>
  );
};
