// Chiffres financiers de la période : bénéfice, marge, à encaisser, trésorerie, coût et gain par mission, factures. Les GRAPHIQUES sont dans la page Graphiques (bouton en bas).
// Utilisé par : FinanceTab.tsx. Contrôlé par : npm run check:finance-page et npm run check:invoice-stats.
// Pour modifier : responsable seulement ; tout est calculé dans la page, sans appel serveur (computeFinance, invoiceFigures). La période vient de la page qui l'affiche (prop range). Textes FR/EN avec t(fr, en).
import React, { useMemo } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { computeFinance } from '../../utils/financeStats';
import { daysBetween, todayMada, type StatsGranularity } from '../../utils/stats';
import { invoiceFigures } from '../../utils/invoiceStats';
import { WhyFigure } from '../../components/WhyFigure';
import { OpenGraphsButton } from '../../components/OpenGraphsButton';
import type { FigureId } from '../../utils/siteSnapshot';
import { FIN_NAV } from '../../utils/financeNav';

// Chiffres et graphiques financiers de la période (responsable seulement). Tout est calculé ici, sans appel serveur.
interface Props { range: { start: string; end: string }; lang: 'fr' | 'en' }

// Le type de période se devine avec le nombre de jours : 1 = jour, 7 = semaine, 28 à 31 = mois, plus = année
const granOf = (days: number): StatsGranularity => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 92 ? 'month' : 'year');

const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
export const FinanceInsights: React.FC<Props> = ({ range: r, lang }) => {
  const days = Math.max(1, daysBetween(r.start, r.end) + 1);
  const g = granOf(days);
  const range = { start: r.start, end: r.end, days };
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const s = db.getSettings();
  const cash = db.getCashNet(), posts = db.getPosts(), contracts = db.getContracts(), clients = db.getClients();
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
  const tile = (label: string, value: string, tone = 'text-white', hint?: string, why?: FigureId) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0" data-nav={why ? `fin-${why}` : undefined}>
      <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1"><span className="truncate">{label}</span>{why && <WhyFigure id={why} range={r} lang={lang} />}</div>
      <div className={`text-base font-bold truncate ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 truncate">{hint}</div>}
    </div>
  );
  const dash = '—';
  const noPrice = f.billed === 0 && f.done > 0;

  return (
    <div className="space-y-3" data-notranslate="">
      <div className={box} data-nav={FIN_NAV.result}>
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Résultat de la période', 'Result for the period')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tile(t('Bénéfice net', 'Net profit'), ar(f.profit), f.profit < 0 ? 'text-rose-400' : 'text-emerald-400', t('reçu − dépenses − salaires', 'received − expenses − salaries'), 'profit')}
          {tile(t('Marge', 'Margin'), f.marginPct === null ? dash : `${f.marginPct} %`, f.marginPct !== null && f.marginPct < 0 ? 'text-rose-400' : 'text-white', f.marginPct === null ? t('aucun paiement reçu', 'no payment received') : t('bénéfice ÷ reçu', 'profit ÷ received'), 'margin')}
          {tile(t('Estimé à encaisser', 'Estimated to collect'), ar(f.toCollect), 'text-amber-400', t(`facturé ${ar(f.billed)}`, `billed ${ar(f.billed)}`), 'toCollect')}
          {tile(t('Trésorerie', 'Cash on hand'), ar(f.treasury), f.treasury < 0 ? 'text-rose-400' : 'text-sky-300', t('depuis le début', 'since the start'), 'treasury')}
          {tile(t('Coût par mission', 'Cost per mission'), f.costPerMission === null ? dash : ar(f.costPerMission), 'text-white', t(`${f.done} mission(s) validée(s)`, `${f.done} validated mission(s)`), 'costPerMission')}
          {tile(t('Gain par mission', 'Gain per mission'), f.gainPerMission === null ? dash : ar(f.gainPerMission), f.gainPerMission !== null && f.gainPerMission < 0 ? 'text-rose-400' : 'text-white', undefined, 'gainPerMission')}
        </div>
        <div className="text-sm text-slate-300">
          {t('Meilleur client', 'Best client')} : {f.bestClient ? <b className="text-white">{f.bestClient.name} · {ar(f.bestClient.amount)}</b> : <span className="text-slate-500">{dash}</span>}
        </div>
        {inv && (invoices.length > 0 || inv.unbilled_count > 0) && (
          <div className="border-t border-slate-700 pt-3 space-y-2" data-testid="invoice-figures" data-nav={FIN_NAV.invoices}>
            <h3 className="text-xs font-bold text-slate-300">{t('Factures (module Facturation)', 'Invoices (Invoicing module)')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {tile(t('Émises sur la période', 'Issued in the period'), ar(inv.issued_total), 'text-white', t(`${inv.issued_count} facture(s)`, `${inv.issued_count} invoice(s)`))}
              {tile(t('Reste à payer', 'Left to pay'), ar(inv.to_collect), 'text-amber-400', t(`${inv.open_count} facture(s) ouverte(s)`, `${inv.open_count} open invoice(s)`))}
              {tile(t('Dont en retard', 'Of which overdue'), ar(inv.overdue), inv.overdue > 0 ? 'text-rose-400' : 'text-white')}
              {tile(t('Pas encore facturé', 'Not yet invoiced'), ar(inv.unbilled_total), inv.unbilled_total > 0 ? 'text-sky-300' : 'text-white', t(`${inv.unbilled_count} mission(s) validée(s)`, `${inv.unbilled_count} approved mission(s)`))}
            </div>
            <p className="text-[11px] text-slate-500">{t('« Estimé à encaisser » plus haut = missions validées × prix client − argent reçu (sert aux marges). Les chiffres ci-dessus viennent des factures émises.', '“Estimated to collect” above = approved missions × client price − money received (used for margins). The figures here come from issued invoices.')}</p>
          </div>
        )}
        {noPrice && <p className="text-[11px] text-amber-300">{t('Le prix client vaut 0 : « Estimé à encaisser » et les marges restent à 0. Règle-le dans Réglages > Missions.', 'Client price is 0: “Estimated to collect” and margins stay at 0. Set it in Settings > Missions.')}</p>}
      </div>

      <OpenGraphsButton filter="money" lang={lang} hint={t('Les graphiques (argent reçu et dépenses, bénéfice cumulé, facturé et reçu, dépenses par catégorie, clients, marge par type) sont maintenant dans la page Graphiques.', 'The charts (money in and out, cumulative profit, billed and received, expenses by category, clients, margin by type) are now in the Charts page.')} />
    </div>
  );
};
