import React, { useMemo, useState } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { supplierRanking, topPurchased } from '../../utils/purchasing';
import { categoryKey, DEFAULT_STORAGE_ID, inSpace, stockPeriod, stockRows, topUsed, valueByMonth } from '../../utils/stock';
import { LineChart, RankBars, compactNumber } from '../../components/charts/Charts';
import { monthTitle } from '../../utils/chartData';

// Onglet « Analyses » du Stockage (responsable seulement) : les graphiques du stock, avec leur propre période. Lecture seule.
interface Props { lang: 'fr' | 'en'; spaceId?: string }
type Period = 'month' | '30' | '90' | '365';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export const StockAnalytics: React.FC<Props> = ({ lang, spaceId = DEFAULT_STORAGE_ID }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [per, setPer] = useState<Period>('30');
  const { products, moves } = inSpace(db.getProducts(), db.getStockMoves(), spaceId); // un seul stockage à la fois : jamais mélangés
  const today = todayMada();
  const range = useMemo(() => {
    if (per === 'month') return { start: `${today.slice(0, 8)}01`, end: today };
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (Number(per) - 1));
    return { start: d.toISOString().slice(0, 10), end: today };
  }, [per, today]);
  const period = useMemo(() => stockPeriod(products, moves, range.start, range.end), [products, moves, range.start, range.end]);
  const months = useMemo(() => valueByMonth(products, moves, today, 12), [products, moves, today]);
  const used = useMemo(() => topUsed(products, moves, range.start, range.end, 5), [products, moves, range.start, range.end]);
  const suppliersRank = useMemo(() => supplierRanking(db.getSuppliers(), db.getPurchases(), moves, range.start, range.end, today).slice(0, 5), [moves, range.start, range.end, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const bought = useMemo(() => topPurchased(products, moves, range.start, range.end, 5), [products, moves, range.start, range.end]);
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; value: number; n: number }>();
    for (const r of stockRows(products, moves)) {
      const key = categoryKey(r.product.category) || '__none__';
      const cur = map.get(key) || { name: r.product.category.trim() || t('Sans catégorie', 'No category'), value: 0, n: 0 };
      cur.value += r.value; cur.n += 1; map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [products, moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const ar = (n: number) => formatCurrencyAr(n);
  const chip = (on: boolean) => `min-h-[44px] px-3 rounded-lg text-sm font-semibold border ${on ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`;

  if (products.length === 0) return <div className={`${card} text-center text-sm text-slate-400`}>{t('Ajoute d\'abord des produits : les analyses apparaissent ensuite.', 'Add products first: the analyses appear afterwards.')}</div>;
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Période', 'Period')}>
          {([['month', t('Ce mois', 'This month')], ['30', t('30 jours', '30 days')], ['90', t('3 mois', '3 months')], ['365', t('12 mois', '12 months')]] as [Period, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={per === id} onClick={() => setPer(id)} className={chip(per === id)}>{label}</button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">{t(`Sur la période : ${period.entries} entrée${period.entries > 1 ? 's' : ''}, ${period.exits} sortie${period.exits > 1 ? 's' : ''}.`, `In the period: ${period.entries} ${period.entries === 1 ? 'entry' : 'entries'}, ${period.exits} ${period.exits === 1 ? 'exit' : 'exits'}.`)}</p>
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-white">{t('Valeur du stock par catégorie', 'Stock value by category')}</h3>
        {byCategory.length === 0 ? <div className="text-sm text-slate-400">{t('Pas encore de stock en valeur.', 'No stock value yet.')}</div> : (
          <RankBars lang={lang} ariaLabel={t('Valeur du stock par catégorie', 'Stock value by category')} barClass="bg-emerald-500"
            items={byCategory.map(x => ({ key: x.key, label: x.name, value: x.value, valueText: `${compactNumber(x.value)} Ar · ${t(`${x.n} produit${x.n > 1 ? 's' : ''}`, `${x.n} product${x.n > 1 ? 's' : ''}`)}` }))} />
        )}
        <p className="text-[11px] text-slate-500">{t('Aujourd\'hui : quantité × prix d\'achat, par catégorie.', 'Today: quantity × purchase price, by category.')}</p>
      </div>

      {products.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Valeur du stock dans le temps', 'Stock value over time')}</h3>
          <LineChart values={months.values} labels={months.labels} fullLabels={months.keys.map(k => monthTitle(k, lang))} format={v => ar(v)} ariaLabel={t('Valeur du stock à la fin de chaque mois', 'Stock value at the end of each month')} emptyText={t('Pas encore de stock.', 'No stock yet.')} lang={lang} />
          <p className="text-[11px] text-slate-500">{t('Les 12 derniers mois, avec les prix d\'achat actuels.', 'The last 12 months, using current purchase prices.')}</p>
        </div>
      )}

      {products.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Produits les plus utilisés (période)', 'Most used products (period)')}</h3>
          {used.length === 0 ? <div className="text-sm text-slate-400">{t('Aucune sortie sur cette période.', 'No exits in this period.')}</div> : (
            <RankBars lang={lang} ariaLabel={t('Produits les plus utilisés', 'Most used products')} barClass="bg-sky-500"
              items={used.map(u => ({ key: u.product.id, label: u.product.name, value: u.used, valueText: `${num(u.used)} ${u.product.unit}` }))} />
          )}
          {period.soldAr > 0 && <p className="text-[11px] text-slate-500">{t(`Valeur des sorties au prix de vente : ${compactNumber(period.soldAr)} Ar.`, `Value of exits at selling price: ${compactNumber(period.soldAr)} Ar.`)}</p>}
        </div>
      )}

      {products.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Fournisseurs (période)', 'Suppliers (period)')}</h3>
          {suppliersRank.length === 0 ? <div className="text-sm text-slate-400">{t('Aucun bon de commande commandé sur cette période.', 'No purchase order placed in this period.')}</div> : (
            <RankBars lang={lang} ariaLabel={t('Fournisseurs classés par valeur reçue', 'Suppliers ranked by value received')} barClass="bg-amber-500"
              items={suppliersRank.map(x => ({ key: x.supplier.id, label: x.supplier.name, value: x.spentAr, valueText: `${compactNumber(x.spentAr)} Ar · ${t(`${x.orders} bon${x.orders > 1 ? 's' : ''}`, `${x.orders} order${x.orders > 1 ? 's' : ''}`)}${x.late > 0 ? ` · ${t(`${x.late} en retard`, `${x.late} late`)}` : ''}` }))} />
          )}
          <p className="text-[11px] text-slate-500">{t('Valeur reçue des bons (quantité reçue × prix convenu), classée du plus gros fournisseur au plus petit.', 'Value received from orders (received quantity × agreed price), biggest supplier first.')}</p>
        </div>
      )}

      {products.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Produits achetés le plus cher (période)', 'Most expensive purchases (period)')}</h3>
          {bought.length === 0 ? <div className="text-sm text-slate-400">{t('Aucune entrée avec un prix payé sur cette période.', 'No stock entry with a price paid in this period.')}</div> : (
            <RankBars lang={lang} ariaLabel={t('Produits achetés le plus cher', 'Most expensive purchases')} barClass="bg-rose-500"
              items={bought.map(x => ({ key: x.product.id, label: x.product.name, value: x.spentAr, valueText: `${compactNumber(x.spentAr)} Ar · ${t('moy.', 'avg')} ${compactNumber(x.avgUnitCost)} · ${t('dernier', 'last')} ${compactNumber(x.lastUnitCost)}` }))} />
          )}
          <p className="text-[11px] text-slate-500">{t('Dépense totale par produit (entrées avec un prix), prix moyen et dernier prix payé par unité.', 'Total spent per product (entries with a price), average and last price paid per unit.')}</p>
        </div>
      )}

    </div>
  );
};
