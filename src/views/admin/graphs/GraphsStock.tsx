// Cartes « Stock » de la page Graphiques : valeur du stock dans le temps, produits les plus sortis, valeur par catégorie, fournisseurs, achats les plus chers.
// Mêmes calculs que Stockage > Tableau de bord et Analyses (src/utils/stock.ts, purchasing.ts) ; la période est celle de toute la page. Un seul stockage à la fois (jamais mélangés). Responsable seulement.
import React, { useMemo } from 'react';
import { db } from '../../../db/store';
import { formatCurrencyAr } from '../../../utils/formatUtils';
import { supplierRanking, topPurchased } from '../../../utils/purchasing';
import { categoryKey, inSpace, stockRows, topUsed, valueByMonth } from '../../../utils/stock';
import { LineChart, RankBars, compactNumber } from '../../../components/charts/Charts';
import { monthTitle } from '../../../utils/chartData';
import { GraphCard } from './GraphCard';

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
interface Props { range: { start: string; end: string }; today: string; lang: 'fr' | 'en'; spaceId: string; show: (id: string) => boolean }

export const GraphsStock: React.FC<Props> = ({ range, today, lang, spaceId, show }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const { products, moves } = inSpace(db.getProducts(), db.getStockMoves(), spaceId);
  const end = range.end > today ? today : range.end; // pas de futur : les jours qui ne sont pas arrivés n'ont rien
  const months = useMemo(() => valueByMonth(products, moves, today, 12), [products, moves, today]);
  const used = useMemo(() => topUsed(products, moves, range.start, end, 5), [products, moves, range.start, end]);
  const suppliers = useMemo(() => supplierRanking(db.getSuppliers(), db.getPurchases(), moves, range.start, end, today).slice(0, 5), [moves, range.start, end, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const bought = useMemo(() => topPurchased(products, moves, range.start, end, 5), [products, moves, range.start, end]);
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
  const none = (fr: string, en: string) => <div className="text-sm text-slate-400">{t(fr, en)}</div>;
  return (
    <>
      {show('stockvalue') && (
        <GraphCard id="stockvalue" title={t('Valeur du stock dans le temps', 'Stock value over time')} note={t('Les 12 derniers mois, avec les prix d\'achat actuels.', 'The last 12 months, using current purchase prices.')}>
          <LineChart values={months.values} labels={months.labels} fullLabels={months.keys.map(k => monthTitle(k, lang))} format={v => ar(v)} ariaLabel={t('Valeur du stock à la fin de chaque mois', 'Stock value at the end of each month')} emptyText={t('Pas encore de stock.', 'No stock yet.')} lang={lang} />
        </GraphCard>
      )}
      {show('stockused') && (
        <GraphCard id="stockused" title={t('Produits les plus sortis', 'Most used products')}>
          {used.length === 0 ? none('Aucune sortie sur cette période.', 'No exits in this period.') : (
            <RankBars lang={lang} ariaLabel={t('Produits les plus utilisés', 'Most used products')} barClass="bg-sky-500" items={used.map(u => ({ key: u.product.id, label: u.product.name, value: u.used, valueText: `${num(u.used)} ${u.product.unit}` }))} />
          )}
        </GraphCard>
      )}
      {show('stockcat') && (
        <GraphCard id="stockcat" title={t('Valeur du stock par catégorie', 'Stock value by category')} note={t('Aujourd\'hui : quantité × prix d\'achat, par catégorie.', 'Today: quantity × purchase price, by category.')}>
          {byCategory.length === 0 ? none('Pas encore de stock en valeur.', 'No stock value yet.') : (
            <RankBars lang={lang} ariaLabel={t('Valeur du stock par catégorie', 'Stock value by category')} barClass="bg-emerald-500"
              items={byCategory.map(x => ({ key: x.key, label: x.name, value: x.value, valueText: `${compactNumber(x.value)} Ar · ${t(`${x.n} produit${x.n > 1 ? 's' : ''}`, `${x.n} product${x.n > 1 ? 's' : ''}`)}` }))} />
          )}
        </GraphCard>
      )}
      {show('suppliers') && (
        <GraphCard id="suppliers" title={t('Fournisseurs', 'Suppliers')} note={t('Valeur reçue des bons (quantité reçue × prix convenu), du plus gros fournisseur au plus petit.', 'Value received from orders (received quantity × agreed price), biggest supplier first.')}>
          {suppliers.length === 0 ? none('Aucun bon de commande commandé sur cette période.', 'No purchase order placed in this period.') : (
            <RankBars lang={lang} ariaLabel={t('Fournisseurs classés par valeur reçue', 'Suppliers ranked by value received')} barClass="bg-amber-500"
              items={suppliers.map(x => ({ key: x.supplier.id, label: x.supplier.name, value: x.spentAr, valueText: `${compactNumber(x.spentAr)} Ar · ${t(`${x.orders} bon${x.orders > 1 ? 's' : ''}`, `${x.orders} order${x.orders > 1 ? 's' : ''}`)}${x.late > 0 ? ` · ${t(`${x.late} en retard`, `${x.late} late`)}` : ''}` }))} />
          )}
        </GraphCard>
      )}
      {show('bought') && (
        <GraphCard id="bought" title={t('Produits achetés le plus cher', 'Most expensive purchases')} note={t('Dépense totale par produit (entrées avec un prix), prix moyen et dernier prix payé par unité.', 'Total spent per product (entries with a price), average and last price paid per unit.')}>
          {bought.length === 0 ? none('Aucune entrée avec un prix payé sur cette période.', 'No stock entry with a price paid in this period.') : (
            <RankBars lang={lang} ariaLabel={t('Produits achetés le plus cher', 'Most expensive purchases')} barClass="bg-rose-500"
              items={bought.map(x => ({ key: x.product.id, label: x.product.name, value: x.spentAr, valueText: `${compactNumber(x.spentAr)} Ar · ${t('moy.', 'avg')} ${compactNumber(x.avgUnitCost)} · ${t('dernier', 'last')} ${compactNumber(x.lastUnitCost)}` }))} />
          )}
        </GraphCard>
      )}
    </>
  );
};
