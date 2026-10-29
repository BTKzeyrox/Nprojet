import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileSpreadsheet, History, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { ImportDialog } from '../../components/ImportDialog';
import { db } from '../../db/store';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { compressImageToDataUrl } from '../../utils/imageUtils';
import { categoryKey, categoryOptions, checkMoveDraft, cleanCategoryName, purchaseAmount, runOutSoon, stockRows, stockValue } from '../../utils/stock';
import { StockCategoriesDialog } from './StockCategoriesDialog';
import type { Product, StockMoveType } from '../../types';

// Onglet « Stock » (responsable seulement) : produits, quantités calculées avec les mouvements, voyant rouge sous le seuil.
// La quantité n'est JAMAIS saisie : on ajoute une entrée, une sortie ou un ajustement, et le total se recalcule.
interface Props { lang: 'fr' | 'en'; initialFilter?: StockFilter }
interface ProductEditor { id?: string; name: string; category: string; unit: string; buy: string; sell: string; threshold: string; qty: string; photo: string }
export type StockFilter = 'all' | 'low' | 'empty';
const NEW_CAT = '__new__';
const NONE_CAT = '__none__';
const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
interface MoveEditor { product: Product; type: StockMoveType; qty: string; date: string; cost: string; note: string; expense: boolean; supplier: string }

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export const StockTab: React.FC<Props> = ({ lang, initialFilter }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [pEdit, setPEdit] = useState<ProductEditor | null>(null);
  const [importing, setImporting] = useState(false);
  const [mEdit, setMEdit] = useState<MoveEditor | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null); // produit à supprimer
  const [confirmMove, setConfirmMove] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>(initialFilter ?? 'all');
  const [sortBy, setSortBy] = useState<'name' | 'qty'>('name');
  const [added, setAdded] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [catMode, setCatMode] = useState<'list' | 'new'>('list');
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null);
  useLockBodyScroll(!!pEdit || !!mEdit);

  const products = db.getProducts();
  const moves = db.getStockMoves();
  const today = todayMada();
  const rows = useMemo(() => stockRows(products, moves), [products, moves]);
  const total = stockValue(rows);
  const red = rows.filter(r => r.low).length;
  const emptyCount = rows.filter(r => r.empty).length;
  const lowCount = rows.filter(r => r.low && !r.empty).length;
  const catOptions = categoryOptions(db.getStockCategories(), products); // la liste de l'admin + les catégories déjà utilisées
  const catValue = pEdit ? (catOptions.find(c => categoryKey(c) === categoryKey(pEdit.category)) ?? '') : '';
  const shown = useMemo(() => {
    const k = norm(query);
    const list = rows.filter(r => (filter === 'all' || (filter === 'empty' ? r.empty : r.low && !r.empty)) && (!catFilter || (catFilter === NONE_CAT ? !r.product.category.trim() : categoryKey(r.product.category) === categoryKey(catFilter))) && (!k || norm(r.product.name).includes(k) || norm(r.product.category).includes(k)));
    return sortBy === 'qty' ? [...list].sort((a, b) => a.qty - b.qty || a.product.name.localeCompare(b.product.name)) : list;
  }, [rows, query, filter, sortBy, catFilter]);
  const soon = useMemo(() => runOutSoon(rows, moves, today), [rows, moves, today]);
  const ar = (n: number) => formatCurrencyAr(n);

  const errors: Record<string, [string, string]> = {
    name: ['Écris le nom du produit.', 'Enter the product name.'], buy: ['Prix d\'achat invalide.', 'Invalid purchase price.'], sell: ['Prix de vente invalide.', 'Invalid selling price.'],
    category: ['Écris un nom de catégorie.', 'Enter a category name.'], category_exists: ['Cette catégorie existe déjà.', 'This category already exists.'],
    photo: ['Photo refusée : renvoie-la.', 'Photo rejected: send it again.'], threshold: ['Seuil d\'alerte invalide.', 'Invalid alert threshold.'], type: ['Type inconnu.', 'Unknown type.'],
    qty: ['Entre une quantité (pas 0 ; une entrée et une sortie sont positives).', 'Enter a quantity (not 0; entries and exits are positive).'],
    date: ['Choisis une date valide.', 'Choose a valid date.'], cost: ['Prix payé invalide, ou à remplir pour créer la dépense.', 'Invalid price paid, or fill it in to create the expense.'],
    product: ['Ce produit n\'existe plus.', 'This product no longer exists.'], stock: ['Il n\'y a pas assez en stock pour cela.', 'There is not enough in stock for that.'],
    supplier: ['Ce fournisseur n\'existe plus.', 'This supplier no longer exists.'], in_use: ['Ce produit est dans un bon de commande en cours (brouillon ou commandé) : termine ou annule le bon avant.', 'This product is in an open purchase order (draft or ordered): finish or cancel the order first.'], admin: ['Réservé au responsable.', 'Admins only.'], missing: ['Cette ligne n\'existe plus.', 'This line no longer exists.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const newProduct = () => { setError(''); setAdded(''); setCatMode('list'); setPEdit({ name: '', category: '', unit: '', buy: '', sell: '', threshold: '', qty: '', photo: '' }); };
  const editProduct = (p: Product) => { setError(''); setCatMode('list'); setConfirmId(null); setPEdit({ id: p.id, name: p.name, category: p.category, unit: p.unit, buy: p.buy_price_ar ? String(p.buy_price_ar) : '', sell: p.sell_price_ar ? String(p.sell_price_ar) : '', threshold: p.alert_threshold ? String(p.alert_threshold) : '', qty: '', photo: p.photo_url || '' }); };
  const rememberCategory = (raw: string) => { const name = cleanCategoryName(raw); const list = db.getStockCategories(); if (name && list.length < 30 && !list.some(c => categoryKey(c) === categoryKey(name))) db.setStockCategories([...list, name]); };
  const saveProduct = (another = false) => {
    if (!pEdit) return;
    const draft = { name: pEdit.name, category: pEdit.category, unit: pEdit.unit, buy_price: pEdit.buy, sell_price: pEdit.sell, alert_threshold: pEdit.threshold, photo_url: pEdit.photo };
    if (pEdit.id) {
      const r = db.updateProduct(pEdit.id, draft);
      if (!r.success) { setError(say(r.error)); return; }
      rememberCategory(pEdit.category);
      setPEdit(null);
      return;
    }
    // Nouveau produit : la quantité de départ est vérifiée AVANT de créer le produit, puis ajoutée comme une entrée « Stock de départ ».
    let startQty = 0;
    if (pEdit.qty.trim() !== '') {
      const mv = checkMoveDraft({ product_id: 'x', type: 'in', qty: pEdit.qty, date: today });
      if (!mv.ok) { setError(say(mv.error)); return; }
      startQty = mv.clean.qty;
    }
    const r = db.addProduct(draft);
    if (!r.success || !r.id) { setError(say(r.error)); return; }
    rememberCategory(pEdit.category);
    if (startQty > 0) {
      const m = db.addStockMove({ product_id: r.id, type: 'in', qty: startQty, date: today, note: t('Stock de départ', 'Starting stock') });
      if (!m.success) { setPEdit(null); setError(t('Produit créé, mais la quantité n\'a pas été ajoutée : utilise « Entrée ».', 'Product created, but the quantity was not added: use “Entry”.')); return; }
    }
    if (another) { setAdded(pEdit.name.trim()); setError(''); setPEdit({ name: '', category: pEdit.category, unit: pEdit.unit, buy: '', sell: '', threshold: '', qty: '', photo: '' }); return; }
    setPEdit(null);
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file || !pEdit) return;
    setError(''); setPhotoBusy(true);
    try {
      const small = await compressImageToDataUrl(file, 640);
      const url = await db.uploadFile(small);
      if (!url) { setError(t('Photo non envoyée. Vérifie la connexion et réessaie.', 'Photo not sent. Check the connection and try again.')); return; }
      setPEdit(cur => cur ? { ...cur, photo: url } : cur);
    } catch { setError(t('Image illisible.', 'Unreadable image.')); } finally { setPhotoBusy(false); }
  };
  const quickMove = (p: Product, type: 'in' | 'out') => { setError(''); const r = db.addStockMove({ product_id: p.id, type, qty: 1, date: today, note: '' }); if (!r.success) setError(say(r.error)); };
  const removeProduct = (id: string) => { const r = db.deleteProduct(id); setConfirmId(null); if (!r.success) setError(say(r.error)); };

  const newMove = (p: Product, type: StockMoveType) => { setError(''); setMEdit({ product: p, type, qty: '', date: today, cost: type === 'in' && p.buy_price_ar ? String(p.buy_price_ar) : '', note: '', expense: false, supplier: '' }); };
  const costNum = mEdit ? Number(String(mEdit.cost).replace(/[\s\u00a0]/g, '').replace(',', '.')) : 0;
  const qtyNum = mEdit ? Number(String(mEdit.qty).replace(/[\s\u00a0]/g, '').replace(',', '.')) : 0;
  const expenseAmount = mEdit && mEdit.type === 'in' && Number.isFinite(costNum) && Number.isFinite(qtyNum) ? purchaseAmount(qtyNum, costNum) : 0;
  const saveMove = () => {
    if (!mEdit) return;
    const r = db.addStockMove({ product_id: mEdit.product.id, type: mEdit.type, qty: mEdit.qty, date: mEdit.date, note: mEdit.note, unit_cost: mEdit.type === 'in' ? mEdit.cost : undefined, supplier_id: mEdit.type === 'in' ? mEdit.supplier : undefined }, { withExpense: mEdit.type === 'in' && mEdit.expense });
    if (!r.success) { setError(say(r.error)); return; }
    setMEdit(null);
  };
  const removeMove = (id: string) => { const r = db.deleteStockMove(id); setConfirmMove(null); if (!r.success) setError(say(r.error)); };

  const tile = (label: string, value: string, tone: string) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-base font-bold truncate ${tone}`}>{value}</div>
    </div>
  );
  const typeLabel = (x: StockMoveType) => (x === 'in' ? t('Entrée', 'Entry') : x === 'out' ? t('Sortie', 'Exit') : t('Ajustement', 'Adjustment'));

  return (
    <div className="space-y-3" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tile(t('Valeur du stock', 'Stock value'), ar(total), 'text-sky-300')}
          {tile(t('Produits', 'Products'), String(products.length), 'text-white')}
          {tile(t('Sous le seuil', 'Below threshold'), String(red), red > 0 ? 'text-rose-400' : 'text-emerald-400')}
          {tile(t('Épuisés', 'Out of stock'), String(emptyCount), emptyCount > 0 ? 'text-rose-400' : 'text-emerald-400')}
        </div>
        <p className="text-[11px] text-slate-500">{t('Valeur = quantité × prix d\'achat. La quantité se calcule avec les entrées, sorties et ajustements : on ne la saisit jamais.', 'Value = quantity × purchase price. The quantity is calculated from entries, exits and adjustments: it is never typed in.')}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={newProduct} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Nouveau produit', 'New product')}</button>
          <button type="button" onClick={() => setImporting(true)} className="w-full sm:w-auto sm:px-4 min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center justify-center gap-1.5 whitespace-nowrap"><FileSpreadsheet className="w-4 h-4" />{t('Importer (Excel, CSV)', 'Import (Excel, CSV)')}</button>
          <button type="button" onClick={() => setCatOpen(true)} className="w-full sm:w-auto sm:px-4 min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center justify-center gap-1.5 whitespace-nowrap"><Tag className="w-4 h-4" />{t('Catégories', 'Categories')}</button>
        </div>
      </div>

      {error && !pEdit && !mEdit && <div role="alert" className="text-sm text-rose-300">{error}</div>}

      {rows.length > 0 && (
        <div className={card}>
          {(emptyCount > 0 || lowCount > 0) && (
            <div className="flex flex-wrap gap-2" role="status">
              {emptyCount > 0 && <button type="button" onClick={() => setFilter('empty')} className="min-h-[44px] px-3 rounded-lg bg-rose-900/40 border border-rose-700 text-rose-200 text-sm font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{t(`${emptyCount} épuisé${emptyCount > 1 ? 's' : ''}`, `${emptyCount} out of stock`)}</button>}
              {lowCount > 0 && <button type="button" onClick={() => setFilter('low')} className="min-h-[44px] px-3 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-200 text-sm font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{t(`${lowCount} stock bas`, `${lowCount} low stock`)}</button>}
            </div>
          )}
          <div className="relative">
            <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Rechercher un produit ou une catégorie', 'Search a product or category')} aria-label={t('Rechercher un produit', 'Search a product')} className={`${field} pl-9`} />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} aria-label={t('Catégorie', 'Category')} className={field}>
            <option value="">{t('Toutes les catégories', 'All categories')}</option>
            <option value={NONE_CAT}>{t('Sans catégorie', 'No category')}</option>
            {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Filtrer', 'Filter')}>
            {([['all', t('Tous', 'All'), rows.length], ['low', t('Stock bas', 'Low'), lowCount], ['empty', t('Épuisés', 'Out'), emptyCount]] as [StockFilter, string, number][]).map(([id, label, n]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-[44px] px-3 rounded-lg text-sm font-semibold border ${filter === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`}>{label} ({n})</button>
            ))}
            <button type="button" aria-pressed={sortBy === 'qty'} onClick={() => setSortBy(sortBy === 'name' ? 'qty' : 'name')} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm ml-auto">{sortBy === 'name' ? t('Tri : nom', 'Sort: name') : t('Tri : moins en stock', 'Sort: lowest first')}</button>
          </div>
        </div>
      )}

      <div className={card}>
        {rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun produit pour l\'instant. Ajoute le premier avec « Nouveau produit ».', 'No products yet. Add the first one with “New product”.')}</div>
        ) : shown.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun produit ne correspond.', 'No matching product.')}</div>
        ) : (
          <ul>
            {shown.map(r => {
              const p = r.product;
              const hist = moves.filter(m => m.product_id === p.id).slice(0, 8);
              return (
                <li key={p.id} className="py-2 border-t border-slate-800 first:border-t-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className={`w-3 h-3 rounded-full flex-shrink-0 ${r.low ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    {p.photo_url && <button type="button" onClick={() => setZoom({ url: p.photo_url || '', name: p.name })} aria-label={t(`Agrandir la photo de ${p.name}`, `Enlarge photo of ${p.name}`)} className="flex-shrink-0"><img src={p.photo_url} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover border border-slate-700" /></button>}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{p.name}{p.category ? <span className="text-slate-500"> · {p.category}</span> : null}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {t('Valeur', 'Value')} {ar(r.value)}{p.alert_threshold > 0 ? ` · ${t('seuil', 'threshold')} ${num(p.alert_threshold)}` : ''}
                        {r.low && <span className="text-rose-400 font-semibold"> · {r.empty ? t('en rupture', 'out of stock') : t('stock bas', 'low stock')}</span>}
                      </div>
                    </div>
                    <div className={`text-sm font-bold whitespace-nowrap ${r.low ? 'text-rose-400' : 'text-white'}`}>{num(r.qty)} <span className="text-[11px] font-normal text-slate-400">{p.unit}</span></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" aria-label={t(`Retirer 1 ${p.unit}`, `Remove 1 ${p.unit}`)} onClick={() => quickMove(p, 'out')} className="min-h-[44px] min-w-[44px] rounded-lg border border-rose-700 text-rose-300 text-base font-bold flex items-center justify-center">−1</button>
                    <button type="button" aria-label={t(`Ajouter 1 ${p.unit}`, `Add 1 ${p.unit}`)} onClick={() => quickMove(p, 'in')} className="min-h-[44px] min-w-[44px] rounded-lg border border-emerald-600 text-emerald-300 text-base font-bold flex items-center justify-center">+1</button>
                    <button type="button" onClick={() => newMove(p, 'in')} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t('Entrée', 'Entry')}</button>
                    <button type="button" onClick={() => newMove(p, 'out')} className="min-h-[44px] px-3 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t('Sortie', 'Exit')}</button>
                    <button type="button" aria-label={t('Historique', 'History')} aria-pressed={openHistory === p.id} onClick={() => setOpenHistory(openHistory === p.id ? null : p.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 flex items-center justify-center"><History className="w-4 h-4" /></button>
                    <button type="button" aria-label={t('Modifier', 'Edit')} onClick={() => editProduct(p)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                    {confirmId === p.id ? (
                      <>
                        <button type="button" onClick={() => removeProduct(p.id)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer avec ses mouvements', 'Delete with its movements')}</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm">{t('Non', 'No')}</button>
                      </>
                    ) : (
                      <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(p.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 hover:text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  {openHistory === p.id && (
                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2 space-y-1">
                      {hist.length === 0 ? <div className="text-[11px] text-slate-400">{t('Aucun mouvement.', 'No movements.')}</div> : hist.map(m => (
                        <div key={m.id} className="flex items-center gap-2 text-[12px]">
                          <div className="min-w-0 flex-1 text-slate-300 truncate">{fmtDate(m.date)} · {typeLabel(m.type)}{m.note ? ` · ${m.note}` : ''}{m.cash_id ? ` · ${t('dépense liée', 'linked expense')}` : ''}</div>
                          <div className={`font-semibold whitespace-nowrap ${m.type === 'out' || m.qty < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{m.type === 'out' ? '−' : m.qty < 0 ? '−' : '+'}{num(Math.abs(m.qty))}</div>
                          {confirmMove === m.id ? (
                            <span className="flex gap-1">
                              <button type="button" onClick={() => removeMove(m.id)} className="min-h-[44px] px-2 rounded-lg bg-rose-700 text-white text-xs font-semibold">{t('Supprimer', 'Delete')}</button>
                              <button type="button" onClick={() => setConfirmMove(null)} className="min-h-[44px] px-2 rounded-lg border border-slate-700 text-slate-200 text-xs">{t('Non', 'No')}</button>
                            </span>
                          ) : (
                            <button type="button" aria-label={t('Supprimer ce mouvement', 'Delete this movement')} onClick={() => setConfirmMove(m.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {products.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-bold text-white">{t('Bientôt en rupture', 'Running out soon')}</h3>
          {soon.length === 0 ? <div className="text-sm text-slate-400">{t('Rien d\'urgent : aucun produit ne sera vide dans les 14 prochains jours (selon les sorties des 30 derniers jours).', 'Nothing urgent: no product will run out in the next 14 days (based on exits in the last 30 days).')}</div> : (
            <ul>
              {soon.map(x => (
                <li key={x.product.id} className="flex items-center justify-between py-1.5 border-t border-slate-800 first:border-t-0 text-sm">
                  <span className="text-white truncate pr-2">{x.product.name}</span>
                  <span className="text-rose-300 whitespace-nowrap">{x.daysLeft === 0 ? t('vide', 'empty') : t(`~${x.daysLeft} j`, `~${x.daysLeft} d`)} · {num(x.qty)} {x.product.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {importing && <ImportDialog kind="products" onClose={() => setImporting(false)} />}
      {catOpen && <StockCategoriesDialog lang={lang} onClose={() => setCatOpen(false)} />}

      {pEdit && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setPEdit(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{pEdit.id ? t('Modifier le produit', 'Edit product') : t('Nouveau produit', 'New product')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setPEdit(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            {added && !pEdit.id && <div role="status" className="text-sm text-emerald-300">{t(`✓ « ${added} » ajouté. Suivant :`, `✓ “${added}” added. Next:`)}</div>}
            <label className="block text-xs text-slate-400">{t('Nom', 'Name')}
              <input autoFocus value={pEdit.name} maxLength={80} onChange={e => setPEdit({ ...pEdit, name: e.target.value })} className={`${field} mt-1`} />
            </label>
            <div className="flex items-center gap-3">
              {pEdit.photo ? <img src={pEdit.photo} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-700" /> : <div aria-hidden="true" className="w-16 h-16 rounded-lg border border-dashed border-slate-700" />}
              <div className="flex-1 flex flex-wrap gap-2">
                <label className={`min-h-[44px] px-3 rounded-lg border border-slate-600 text-slate-200 text-sm font-semibold flex items-center cursor-pointer ${photoBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                  {photoBusy ? t('Envoi…', 'Sending…') : pEdit.photo ? t('Changer la photo', 'Change photo') : t('Ajouter une photo', 'Add a photo')}
                  <input type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {pEdit.photo && <button type="button" onClick={() => setPEdit({ ...pEdit, photo: '' })} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Retirer', 'Remove')}</button>}
              </div>
            </div>
            {!pEdit.id && (
              <label className="block text-xs text-slate-400">{t('Quantité en stock maintenant (facultatif)', 'Quantity in stock now (optional)')}
                <input inputMode="decimal" value={pEdit.qty} onChange={e => setPEdit({ ...pEdit, qty: e.target.value })} className={`${field} mt-1`} placeholder="0" />
              </label>
            )}
            <details open={!!pEdit.id} className="rounded-lg border border-slate-800 p-2">
              <summary className="min-h-[44px] flex items-center text-sm text-slate-300 cursor-pointer">{t('Plus de détails (catégorie, unité, prix, alerte)', 'More details (category, unit, prices, alert)')}</summary>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="block text-xs text-slate-400">
                    <label>{t('Catégorie (facultatif)', 'Category (optional)')}
                      {catMode === 'list' ? (
                        <select value={catValue} onChange={e => { if (e.target.value === NEW_CAT) { setCatMode('new'); setPEdit({ ...pEdit, category: '' }); } else setPEdit({ ...pEdit, category: e.target.value }); }} className={`${field} mt-1`}>
                          <option value="">{t('Aucune', 'None')}</option>
                          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value={NEW_CAT}>{t('+ Nouvelle catégorie…', '+ New category…')}</option>
                        </select>
                      ) : (
                        <input autoFocus value={pEdit.category} maxLength={40} placeholder={t('Nom de la catégorie', 'Category name')} onChange={e => setPEdit({ ...pEdit, category: e.target.value })} className={`${field} mt-1`} />
                      )}
                    </label>
                    {catMode === 'new' && <button type="button" onClick={() => setCatMode('list')} className="min-h-[44px] text-sky-300 underline">{t('Choisir dans la liste', 'Pick from the list')}</button>}
                  </div>
                  <label className="block text-xs text-slate-400">{t('Unité', 'Unit')}
                    <input value={pEdit.unit} maxLength={16} placeholder={t('unité', 'unit')} onChange={e => setPEdit({ ...pEdit, unit: e.target.value })} className={`${field} mt-1`} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-slate-400">{t('Prix d\'achat (Ar)', 'Purchase price (Ar)')}
                    <input inputMode="numeric" value={pEdit.buy} onChange={e => setPEdit({ ...pEdit, buy: e.target.value })} className={`${field} mt-1`} />
                  </label>
                  <label className="block text-xs text-slate-400">{t('Prix de vente (Ar)', 'Selling price (Ar)')}
                    <input inputMode="numeric" value={pEdit.sell} onChange={e => setPEdit({ ...pEdit, sell: e.target.value })} className={`${field} mt-1`} />
                  </label>
                </div>
                <label className="block text-xs text-slate-400">{t('Seuil d\'alerte (voyant rouge à cette quantité ou moins)', 'Alert threshold (red light at this quantity or less)')}
                  <input inputMode="decimal" value={pEdit.threshold} onChange={e => setPEdit({ ...pEdit, threshold: e.target.value })} className={`${field} mt-1`} placeholder="0" />
                </label>
              </div>
            </details>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPEdit(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={() => saveProduct(false)} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
            </div>
            {!pEdit.id && <button type="button" onClick={() => saveProduct(true)} className="w-full min-h-[44px] rounded-lg border border-emerald-600 text-emerald-300 text-sm font-semibold">{t('Enregistrer et ajouter un autre', 'Save and add another')}</button>}
          </div>
        </div>,
        document.body,
      )}

      {mEdit && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setMEdit(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{mEdit.product.name}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setMEdit(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label={t('Type de mouvement', 'Movement type')}>
              {(['in', 'out', 'adjust'] as StockMoveType[]).map(x => (
                <button key={x} type="button" role="tab" aria-selected={mEdit.type === x} onClick={() => setMEdit({ ...mEdit, type: x, expense: x === 'in' ? mEdit.expense : false })}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold border ${mEdit.type === x ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`}>{typeLabel(x)}</button>
              ))}
            </div>
            <label className="block text-xs text-slate-400">{mEdit.type === 'adjust' ? t('Quantité à ajouter ou retirer (ex. −3 après un comptage)', 'Quantity to add or remove (e.g. −3 after a count)') : t(`Quantité (${mEdit.product.unit})`, `Quantity (${mEdit.product.unit})`)}
              <input autoFocus inputMode="decimal" value={mEdit.qty} onChange={e => setMEdit({ ...mEdit, qty: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Date', 'Date')}
              <input type="date" value={mEdit.date} onChange={e => setMEdit({ ...mEdit, date: e.target.value })} className={`${field} mt-1`} />
            </label>
            {mEdit.type === 'in' && (
              <>
                <label className="block text-xs text-slate-400">{t('Fournisseur (facultatif)', 'Supplier (optional)')}
                  <select value={mEdit.supplier} onChange={e => setMEdit({ ...mEdit, supplier: e.target.value })} className={`${field} mt-1`}>
                    <option value="">{t('— Aucun —', '— None —')}</option>
                    {db.getSuppliers().filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">{t('Prix payé par unité (Ar, facultatif)', 'Price paid per unit (Ar, optional)')}
                  <input inputMode="numeric" value={mEdit.cost} onChange={e => setMEdit({ ...mEdit, cost: e.target.value })} className={`${field} mt-1`} />
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-200 min-h-[44px]">
                  <input type="checkbox" checked={mEdit.expense} onChange={e => setMEdit({ ...mEdit, expense: e.target.checked })} className="mt-1 w-5 h-5" />
                  <span>{t('Créer aussi la dépense « Achats » dans les Finances', 'Also create the “Achats” expense in Finances')}{expenseAmount > 0 ? <b className="text-amber-300"> — {ar(expenseAmount)}</b> : null}</span>
                </label>
                {mEdit.expense && expenseAmount < 1 && <div className="text-[12px] text-amber-300">{t('Entre le prix payé par unité pour calculer le montant de la dépense.', 'Enter the price paid per unit to calculate the expense amount.')}</div>}
                {mEdit.expense && expenseAmount > 0 && <div className="text-[12px] text-slate-400">{t(`Une dépense de ${ar(expenseAmount)} sera ajoutée aux Finances à la date du ${fmtDate(mEdit.date)}. Tu pourras la supprimer là-bas.`, `An expense of ${ar(expenseAmount)} will be added to Finances on ${fmtDate(mEdit.date)}. You can delete it there.`)}</div>}
              </>
            )}
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}
              <textarea value={mEdit.note} maxLength={300} rows={2} onChange={e => setMEdit({ ...mEdit, note: e.target.value })} className={`${field} mt-1 py-2`} />
            </label>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMEdit(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={saveMove} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={zoom.name} onClick={() => setZoom(null)} className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-3">
          <img src={zoom.url} alt={zoom.name} className="max-w-full max-h-[75vh] rounded-lg" />
          <div className="text-white text-sm">{zoom.name}</div>
          <button type="button" onClick={() => setZoom(null)} className="min-h-[44px] px-4 rounded-lg bg-slate-800 text-white text-sm font-semibold">{t('Fermer', 'Close')}</button>
        </div>
      )}
    </div>
  );
};
