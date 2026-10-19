import React, { useMemo } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { computeFinance } from '../../utils/financeStats';
import { daysBetween, type StatsGranularity } from '../../utils/stats';
import { BarChart, DonutChart, LineChart, compactNumber } from '../../components/charts/Charts';

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
  const cash = db.getCash(), posts = db.getPosts(), contracts = db.getContracts();
  const f = useMemo(
    () => computeFinance({ cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0 }, g, range, lang, t('Salaires', 'Salaries')),
    [cash, posts, contracts, s, g, range.start, range.end, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ar = (n: number) => formatCurrencyAr(n);
  const short = (n: number) => compactNumber(n);
  const tile = (label: string, value: string, tone = 'text-white', hint?: string) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
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
          {tile(t('Bénéfice net', 'Net profit'), ar(f.profit), f.profit < 0 ? 'text-rose-400' : 'text-emerald-400', t('reçu − dépenses − salaires', 'received − expenses − salaries'))}
          {tile(t('Marge', 'Margin'), f.marginPct === null ? dash : `${f.marginPct} %`, f.marginPct !== null && f.marginPct < 0 ? 'text-rose-400' : 'text-white', f.marginPct === null ? t('aucun paiement reçu', 'no payment received') : t('bénéfice ÷ reçu', 'profit ÷ received'))}
          {tile(t('À encaisser', 'To collect'), ar(f.toCollect), 'text-amber-400', t(`facturé ${ar(f.billed)}`, `billed ${ar(f.billed)}`))}
          {tile(t('Trésorerie', 'Cash on hand'), ar(f.treasury), f.treasury < 0 ? 'text-rose-400' : 'text-sky-300', t('depuis le début', 'since the start'))}
          {tile(t('Coût par mission', 'Cost per mission'), f.costPerMission === null ? dash : ar(f.costPerMission), 'text-white', t(`${f.done} mission(s) validée(s)`, `${f.done} validated mission(s)`))}
          {tile(t('Gain par mission', 'Gain per mission'), f.gainPerMission === null ? dash : ar(f.gainPerMission), f.gainPerMission !== null && f.gainPerMission < 0 ? 'text-rose-400' : 'text-white')}
        </div>
        <div className="text-sm text-slate-300">
          {t('Meilleur client', 'Best client')} : {f.bestClient ? <b className="text-white">{f.bestClient.name} · {ar(f.bestClient.amount)}</b> : <span className="text-slate-500">{dash}</span>}
        </div>
        {noPrice && <p className="text-[11px] text-amber-300">{t('Le prix client vaut 0 : « À encaisser » et les marges restent à 0. Règle-le dans Réglages > Missions.', 'Client price is 0: “To collect” and margins stay at 0. Set it in Settings > Missions.')}</p>}
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Argent reçu et dépenses', 'Money in and out')} <span className="text-xs font-normal text-slate-400">({BY[g][lang]})</span></h2>
        <BarChart values={f.series.inflow} compare={f.series.outflow} compareLabel={t('Dépenses', 'Expenses')} labels={f.labels} format={short} unit="Ar" lang={lang} ariaLabel={t('Argent reçu (barres) et dépenses (traits)', 'Money received (bars) and expenses (lines)')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Bénéfice cumulé', 'Cumulative profit')}</h2>
        <LineChart values={f.series.cumulative} labels={f.labels} format={short} lang={lang} ariaLabel={t('Bénéfice cumulé', 'Cumulative profit')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Facturé (barres) et reçu (traits)', 'Billed (bars) and received (lines)')}</h2>
        <BarChart values={f.series.billed} compare={f.series.inflow} compareLabel={t('Reçu', 'Received')} labels={f.labels} format={short} unit="Ar" lang={lang} ariaLabel={t('Facturé et reçu', 'Billed and received')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Dépenses par catégorie', 'Expenses by category')}</h2>
        <DonutChart items={f.expensesByCategory} format={short} centerLabel="Ar" lang={lang} ariaLabel={t('Dépenses par catégorie', 'Expenses by category')} />
      </div>

      <div className={box}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Marge par type de mission', 'Margin by mission type')}</h2>
        {f.byType.length === 0 ? <div className="text-sm text-slate-400">{t('Aucune mission validée sur cette période.', 'No validated mission in this period.')}</div> : (
          <ul>
            {f.byType.map(r => (
              <li key={r.type} className="flex items-center gap-2 py-2 border-t border-slate-800 first:border-t-0">
                <div className="min-w-0 flex-1"><div className="text-sm text-white truncate">{r.type}</div><div className="text-[11px] text-slate-400">{t(`${r.done} mission(s) · facturé ${ar(r.billed)} · salaires ${ar(r.salaries)}`, `${r.done} mission(s) · billed ${ar(r.billed)} · salaries ${ar(r.salaries)}`)}</div></div>
                <div className={`text-sm font-bold whitespace-nowrap ${r.margin < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{ar(r.margin)}{r.marginPct !== null ? ` · ${r.marginPct} %` : ''}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-500">{t('Marge d\'un type = prix client − salaire des missions validées (sans les autres dépenses).', 'Type margin = client price − salaries of validated missions (other expenses not included).')}</p>
      </div>
    </div>
  );
};
