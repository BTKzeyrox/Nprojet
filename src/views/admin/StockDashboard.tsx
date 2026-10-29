import React, { useMemo } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { DEFAULT_STORAGE_ID, inSpace, runOutSoon, stockRows, stockValue, topUsed, valueByMonth } from '../../utils/stock';
import { LineChart, RankBars } from '../../components/charts/Charts';
import { monthTitle } from '../../utils/chartData';
import type { StockFilter } from './StockTab';

// Tableau de bord du Stockage (responsable seulement) : l'essentiel d'un coup d'œil. Lecture seule : rien ne se saisit ici.
interface Props { lang: 'fr' | 'en'; onOpenProducts: (filter: StockFilter) => void; spaceId?: string }
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export const StockDashboard: React.FC<Props> = ({ lang, onOpenProducts, spaceId = DEFAULT_STORAGE_ID }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const { products, moves } = inSpace(db.getProducts(), db.getStockMoves(), spaceId); // un seul stockage à la fois : jamais mélangés
  const today = todayMada();
  const rows = useMemo(() => stockRows(products, moves), [products, moves]);
  const total = stockValue(rows);
  const empty = rows.filter(r => r.empty);
  const low = rows.filter(r => r.low && !r.empty);
  const soon = useMemo(() => runOutSoon(rows, moves, today), [rows, moves, today]);
  const months = useMemo(() => valueByMonth(products, moves, today, 12), [products, moves, today]);
  const start30 = useMemo(() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10); }, [today]);
  const used = useMemo(() => topUsed(products, moves, start30, today, 5), [products, moves, start30, today]);
  const names = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const recent = useMemo(() => [...moves].sort((a, b) => (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || ''))).slice(0, 8), [moves]);
  const ar = (n: number) => formatCurrencyAr(n);

  if (products.length === 0) {
    return (
      <div className={`${card} text-center`}>
        <div className="text-sm text-slate-300">{t('Aucun produit pour l\'instant.', 'No products yet.')}</div>
        <button type="button" onClick={() => onOpenProducts('all')} className="min-h-[44px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />{t('Ajouter le premier produit', 'Add the first product')}</button>
      </div>
    );
  }

  const kpi = (label: string, value: string, tone: string, onClick?: () => void) => {
    const inner = (<><div className="text-[11px] text-slate-400">{label}</div><div className={`text-lg font-bold ${tone}`}>{value}</div></>);
    return onClick
      ? <button type="button" onClick={onClick} className="text-left min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">{inner}</button>
      : <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">{inner}</div>;
  };
  const typeLabel = (ty: string) => (ty === 'in' ? t('Entrée', 'Entry') : ty === 'out' ? t('Sortie', 'Exit') : t('Ajustement', 'Adjustment'));

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="grid grid-cols-2 gap-2">
          {kpi(t('Produits', 'Products'), String(products.length), 'text-white')}
          {kpi(t('Valeur du stock', 'Stock value'), ar(total), 'text-emerald-300')}
          {kpi(t('Épuisés', 'Out of stock'), String(empty.length), empty.length > 0 ? 'text-rose-300' : 'text-white', empty.length > 0 ? () => onOpenProducts('empty') : undefined)}
          {kpi(t('Stock bas', 'Low stock'), String(low.length), low.length > 0 ? 'text-amber-300' : 'text-white', low.length > 0 ? () => onOpenProducts('low') : undefined)}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><AlertTriangle aria-hidden="true" className="w-4 h-4 text-amber-300" />{t('Alertes', 'Alerts')}</h3>
        {empty.length === 0 && low.length === 0 ? <div className="text-sm text-emerald-300">{t('Tout est en ordre : aucun produit épuisé ni bas.', 'All good: nothing out of stock or low.')}</div> : (
          <ul>
            {[...empty, ...low].slice(0, 8).map(r => (
              <li key={r.product.id} className="flex items-center justify-between py-1.5 border-t border-slate-800 first:border-t-0 text-sm">
                <span className="text-white truncate pr-2">{r.product.name}</span>
                <span className={`whitespace-nowrap ${r.empty ? 'text-rose-300' : 'text-amber-300'}`}>{r.empty ? t('épuisé', 'out') : `${num(r.qty)} ${r.product.unit}`}</span>
              </li>
            ))}
          </ul>
        )}
        {empty.length + low.length > 8 && <button type="button" onClick={() => onOpenProducts(empty.length ? 'empty' : 'low')} className="min-h-[44px] text-sm text-sky-300 underline">{t(`Voir les ${empty.length + low.length} produits`, `See all ${empty.length + low.length} products`)}</button>}
      </div>

      {soon.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Bientôt en rupture (30 jours)', 'Running out soon (30 days)')}</h3>
          <ul>
            {soon.slice(0, 6).map(x => (
              <li key={x.product.id} className="flex items-center justify-between py-1.5 border-t border-slate-800 first:border-t-0 text-sm">
                <span className="text-white truncate pr-2">{x.product.name}</span>
                <span className="text-rose-300 whitespace-nowrap">{x.daysLeft === 0 ? t('vide', 'empty') : t(`~${x.daysLeft} j`, `~${x.daysLeft} d`)} · {num(x.qty)} {x.product.unit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <h3 className="text-sm font-bold text-white">{t('Derniers mouvements', 'Latest movements')}</h3>
        {recent.length === 0 ? <div className="text-sm text-slate-400">{t('Aucun mouvement pour l\'instant.', 'No movements yet.')}</div> : (
          <ul>
            {recent.map(m => {
              const p = names.get(m.product_id);
              const sign = m.type === 'out' ? '−' : m.type === 'in' ? '+' : m.qty < 0 ? '−' : '+';
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 py-1.5 border-t border-slate-800 first:border-t-0 text-sm">
                  <span className="min-w-0"><span className="text-white truncate block">{p ? p.name : t('Produit supprimé', 'Deleted product')}</span><span className="text-[11px] text-slate-400">{m.date} · {typeLabel(m.type)}</span></span>
                  <span className={`whitespace-nowrap font-semibold ${sign === '+' ? 'text-emerald-300' : 'text-rose-300'}`}>{sign}{num(Math.abs(m.qty))} {p ? p.unit : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-white">{t('Valeur du stock dans le temps', 'Stock value over time')}</h3>
        <LineChart values={months.values} labels={months.labels} fullLabels={months.keys.map(k => monthTitle(k, lang))} format={v => ar(v)} ariaLabel={t('Valeur du stock à la fin de chaque mois', 'Stock value at the end of each month')} emptyText={t('Pas encore de stock.', 'No stock yet.')} lang={lang} />
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-white">{t('Les plus utilisés (30 derniers jours)', 'Most used (last 30 days)')}</h3>
        {used.length === 0 ? <div className="text-sm text-slate-400">{t('Aucune sortie sur les 30 derniers jours.', 'No exits in the last 30 days.')}</div> : (
          <RankBars lang={lang} ariaLabel={t('Produits les plus utilisés', 'Most used products')} barClass="bg-sky-500"
            items={used.map(u => ({ key: u.product.id, label: u.product.name, value: u.used, valueText: `${num(u.used)} ${u.product.unit}` }))} />
        )}
      </div>
    </div>
  );
};
