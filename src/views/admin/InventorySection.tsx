import React, { useMemo, useState } from 'react';
import { db } from '../../db/store';
import { productStorage } from '../../utils/stock';
import { useApp } from '../../context/AppContext';
import { todayMada } from '../../utils/stats';
import { inventoryAdjustments, inventoryRows } from '../../utils/purchasing';

// Section « Inventaire » de la page Achats (responsable seulement) : on compte ce qu'il y a vraiment, l'écart s'affiche,
// et un clic crée les ajustements (mouvement « ajustement », raison « inventaire »). Le stock n'est jamais saisi à la main.

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export const InventorySection: React.FC<{ ver: number }> = ({ ver }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const spaces = db.getStockSpaces();
  const sp = (p?: { storage_id?: string }) => (p && spaces.length > 1 ? ` · ${spaces.find(s => s.id === productStorage(p))?.name ?? ''}` : ''); // le nom du stockage, seulement s'il y en a plusieurs
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayMada());
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const data = useMemo(() => ({ products: db.getProducts(), moves: db.getStockMoves() }), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => inventoryRows(data.products, data.moves, counts), [data, counts]);
  const adj = useMemo(() => inventoryAdjustments(rows), [rows]);
  const history = useMemo(() => data.moves.filter(m => m.reason === 'inventory').slice(0, 20), [data]);
  const name = (id: string) => data.products.find(p => p.id === id);

  const errors: Record<string, [string, string]> = {
    qty: ['Une quantité comptée est fausse (un nombre de 0 ou plus).', 'A counted quantity is wrong (a number, 0 or more).'], date: ['Date invalide.', 'Invalid date.'],
    none: ['Aucun écart à corriger : le stock indiqué est déjà juste.', 'No difference to fix: the stock shown is already right.'], product: ['Un produit n\'existe plus.', 'A product no longer exists.'],
    admin: ['Réservé au responsable.', 'Admins only.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };
  const apply = (only?: string) => {
    const use = only ? { [only]: counts[only] } : Object.fromEntries(Object.entries(counts).filter(([, v]) => String(v).trim() !== ''));
    const r = db.applyInventory(use, date);
    if (!r.success) { setError(say(r.error)); setDone(''); return; }
    setError(''); setDone(t(`${r.adjusted} ajustement${(r.adjusted || 0) > 1 ? 's' : ''} enregistré${(r.adjusted || 0) > 1 ? 's' : ''}.`, `${r.adjusted} adjustment${(r.adjusted || 0) > 1 ? 's' : ''} saved.`));
    setCounts(c => { const n = { ...c }; if (only) delete n[only]; else for (const k of Object.keys(use)) delete n[k]; return n; });
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <p className="text-[11px] text-slate-400">{t('Compte ce qu\'il y a vraiment sur l\'étagère. Laisse vide un produit que tu ne comptes pas. L\'écart se calcule tout seul.', 'Count what is really on the shelf. Leave a product empty if you do not count it. The difference is calculated for you.')}</p>
        <label className="block text-xs text-slate-400">{t('Date du comptage', 'Count date')}<input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${field} mt-1`} /></label>
        {data.products.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun produit en stock pour l\'instant. Ajoute des produits dans Stock.', 'No products yet. Add products in Stock.')}</div>
        ) : (
          <ul>
            {rows.map(r => (
              <li key={r.product.id} className="border-t border-slate-800 first:border-t-0 py-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{r.product.name}{sp(r.product)}</div>
                  <div className="text-[11px] text-slate-400">{t('Le stock indique', 'Stock shows')} {r.expected} {r.product.unit}
                    {r.diff !== null && <b className={r.diff === 0 ? 'text-emerald-400' : 'text-amber-300'}> · {r.diff === 0 ? t('juste', 'correct') : `${t('écart', 'difference')} ${sign(r.diff)}`}</b>}
                    {r.bad && <b className="text-rose-300"> · {t('quantité fausse', 'wrong quantity')}</b>}</div>
                </div>
                <input inputMode="decimal" value={counts[r.product.id] ?? ''} aria-label={`${t('Quantité comptée', 'Counted quantity')} ${r.product.name}`} placeholder={t('Compté', 'Counted')} onChange={e => { setDone(''); setCounts({ ...counts, [r.product.id]: e.target.value }); }} className="w-24 min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white" />
                {r.diff !== null && r.diff !== 0 && <button type="button" onClick={() => apply(r.product.id)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Ajuster', 'Adjust')}</button>}
              </li>
            ))}
          </ul>
        )}
        {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
        {done && <div role="status" className="text-sm text-emerald-300">{done}</div>}
        {data.products.length > 0 && <button type="button" onClick={() => apply()} disabled={adj.length === 0} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold">{adj.length > 0 ? t(`Ajuster tous les écarts (${adj.length})`, `Adjust all differences (${adj.length})`) : t('Ajuster tous les écarts', 'Adjust all differences')}</button>}
      </div>

      <div className={card}>
        <h2 className="text-sm font-bold text-white">{t('Historique des inventaires', 'Inventory history')}</h2>
        {history.length === 0 ? (
          <div className="text-sm text-slate-400 py-2 text-center">{t('Aucun inventaire fait pour l\'instant.', 'No inventory done yet.')}</div>
        ) : (
          <ul>
            {history.map(m => (
              <li key={m.id} className="border-t border-slate-800 first:border-t-0 py-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{name(m.product_id)?.name || t('Produit supprimé', 'Deleted product')}</div>
                  <div className="text-[11px] text-slate-400">{fmtDate(m.date)} · {m.expected_qty ?? '?'} → {m.counted_qty ?? '?'}</div>
                </div>
                <div className={`text-sm font-bold whitespace-nowrap ${m.qty > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{sign(m.qty)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
