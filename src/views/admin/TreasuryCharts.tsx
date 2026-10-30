import React, { useMemo } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { treasuryCharts } from '../../utils/treasuryCharts';
import { XYChart, RankBars, compactNumber } from '../../components/charts/Charts';
import { MoneyFlowChart } from '../../components/charts/StyledCharts';

const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';

// Graphiques de la Trésorerie : argent reçu, dépenses, solde et catégories. Aucun salaire.
export const TreasuryCharts: React.FC<{ range: { start: string; end: string }; lang: 'fr' | 'en' }> = ({ range, lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const cash = db.getCash();
  const today = todayMada();
  const c = useMemo(() => treasuryCharts(cash, range, today), [cash, range.start, range.end, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const ar = (n: number) => formatCurrencyAr(n);
  const items = (list: { label: string; value: number }[]) => list.map(x => ({ key: x.label, label: x.label, value: x.value, valueText: ar(x.value) }));
  return (
    <div className="space-y-3" data-treasury-charts data-notranslate="">
      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Argent reçu et dépenses, jour par jour', 'Money in and out, day by day')}</h2>
        <MoneyFlowChart labels={c.labels} fullLabels={c.fullLabels} inflow={c.inflow} outflow={c.outflow} format={ar} axisFormat={compactNumber} lang={lang}
          inLabel={t('Argent reçu', 'Money received')} outLabel={t('Dépenses', 'Expenses')} balanceLabel={t('Solde', 'Balance')} ariaLabel={t('Argent reçu et dépenses', 'Money received and expenses')} />
      </div>
      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Solde du mois', 'Balance of the month')}</h2>
        <XYChart labels={c.labels} fullLabels={c.fullLabels} lang={lang} format={ar} axisFormat={compactNumber} summary="last" signColors
          ariaLabel={t('Solde cumulé du mois (reçu − dépenses)', 'Cumulative balance of the month (received − expenses)')}
          series={[{ key: 'bal', label: t('Solde cumulé', 'Cumulative balance'), values: c.balance, kind: 'area' as const }]} />
      </div>
      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Où part l\'argent', 'Where the money goes')}</h2>
        <RankBars lang={lang} ariaLabel={t('Dépenses par catégorie', 'Expenses by category')} format={ar} limit={6} showShare
          emptyText={t('Aucune dépense sur ce mois.', 'No expense this month.')} items={items(c.outByCategory)} />
      </div>
      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('D\'où vient l\'argent', 'Where the money comes from')}</h2>
        <RankBars lang={lang} ariaLabel={t('Argent reçu par catégorie', 'Money received by category')} format={ar} limit={6} showShare
          emptyText={t('Aucun argent reçu sur ce mois.', 'No money received this month.')} items={items(c.inByCategory)} />
      </div>
    </div>
  );
};
