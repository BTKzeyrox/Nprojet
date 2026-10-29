import React, { useMemo, useState } from 'react';
import { db } from '../../db/store';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import type { StockMoveType } from '../../types';
import { DEFAULT_STORAGE_ID, inSpace } from '../../utils/stock';

// Onglet « Mouvements » du Stockage (responsable seulement) : tout l'historique du stock, filtrable. Lecture seule :
// pour corriger un mouvement, on l'ouvre dans l'historique du produit (onglet Produits).
interface Props { lang: 'fr' | 'en'; spaceId?: string }
type Period = '7' | '30' | '90' | 'all';
type TypeFilter = 'all' | StockMoveType;
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const PAGE = 40;

export const StockMovements: React.FC<Props> = ({ lang, spaceId = DEFAULT_STORAGE_ID }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [period, setPeriod] = useState<Period>('30');
  const [type, setType] = useState<TypeFilter>('all');
  const [productId, setProductId] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const { products, moves } = inSpace(db.getProducts(), db.getStockMoves(), spaceId); // un seul stockage à la fois : jamais mélangés
  const today = todayMada();
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const start = useMemo(() => {
    if (period === 'all') return '';
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (Number(period) - 1));
    return d.toISOString().slice(0, 10);
  }, [period, today]);
  const list = useMemo(() => moves
    .filter(m => (!start || m.date >= start) && (type === 'all' || m.type === type) && (!productId || m.product_id === productId))
    .sort((a, b) => (b.date + (b.created_at || '')).localeCompare(a.date + (a.created_at || ''))), [moves, start, type, productId]);
  const nIn = list.filter(m => m.type === 'in').length;
  const nOut = list.filter(m => m.type === 'out').length;
  const nAdj = list.filter(m => m.type === 'adjust').length;
  const chip = (on: boolean) => `min-h-[44px] px-3 rounded-lg text-sm font-semibold border ${on ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`;
  const reset = () => setLimit(PAGE);
  const typeLabel = (ty: string) => (ty === 'in' ? t('Entrée', 'Entry') : ty === 'out' ? t('Sortie', 'Exit') : t('Ajustement', 'Adjustment'));

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Période', 'Period')}>
          {([['7', t('7 jours', '7 days')], ['30', t('30 jours', '30 days')], ['90', t('3 mois', '3 months')], ['all', t('Tout', 'All')]] as [Period, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={period === id} onClick={() => { setPeriod(id); reset(); }} className={chip(period === id)}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Type', 'Type')}>
          {([['all', t('Tous', 'All')], ['in', t('Entrées', 'Entries')], ['out', t('Sorties', 'Exits')], ['adjust', t('Ajustements', 'Adjustments')]] as [TypeFilter, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={type === id} onClick={() => { setType(id); reset(); }} className={chip(type === id)}>{label}</button>
          ))}
        </div>
        <select value={productId} onChange={e => { setProductId(e.target.value); reset(); }} aria-label={t('Produit', 'Product')} className={field}>
          <option value="">{t('Tous les produits', 'All products')}</option>
          {sortedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="text-[11px] text-slate-400">{t(`${list.length} mouvement${list.length > 1 ? 's' : ''} : ${nIn} entrée${nIn > 1 ? 's' : ''}, ${nOut} sortie${nOut > 1 ? 's' : ''}, ${nAdj} ajustement${nAdj > 1 ? 's' : ''}.`, `${list.length} movement${list.length === 1 ? '' : 's'}: ${nIn} ${nIn === 1 ? 'entry' : 'entries'}, ${nOut} ${nOut === 1 ? 'exit' : 'exits'}, ${nAdj} ${nAdj === 1 ? 'adjustment' : 'adjustments'}.`)}</p>
      </div>

      <div className={card}>
        {list.length === 0 ? <div className="text-sm text-slate-400 text-center py-3">{t('Aucun mouvement pour ces filtres.', 'No movement for these filters.')}</div> : (
          <>
            <ul>
              {list.slice(0, limit).map(m => {
                const p = byId.get(m.product_id);
                const plus = m.type === 'in' || (m.type === 'adjust' && m.qty > 0);
                const extra = [m.reason === 'inventory' ? t('Inventaire', 'Stock count') : '', m.type === 'in' && m.unit_cost_ar ? `${formatCurrencyAr(m.unit_cost_ar)} / ${p ? p.unit : t('unité', 'unit')}` : '', m.note].filter(Boolean).join(' · ');
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2 border-t border-slate-800 first:border-t-0 text-sm">
                    <span className="min-w-0">
                      <span className="text-white truncate block">{p ? p.name : t('Produit supprimé', 'Deleted product')}</span>
                      <span className="text-[11px] text-slate-400 block truncate">{m.date} · {typeLabel(m.type)}{extra ? ` · ${extra}` : ''}</span>
                    </span>
                    <span className={`whitespace-nowrap font-semibold ${plus ? 'text-emerald-300' : 'text-rose-300'}`}>{plus ? '+' : '−'}{num(Math.abs(m.qty))} {p ? p.unit : ''}</span>
                  </li>
                );
              })}
            </ul>
            {list.length > limit && <button type="button" onClick={() => setLimit(n => n + PAGE)} className="w-full min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t(`Voir plus (${list.length - limit} restants)`, `Show more (${list.length - limit} left)`)}</button>}
          </>
        )}
      </div>
    </div>
  );
};
