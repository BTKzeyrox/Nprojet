import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { productStorage } from '../../utils/stock';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { isLate, lineTotal, planReceipt, poHasReceipt, poReceivedValue, poTotal, remainingQty } from '../../utils/purchasing';
import type { PurchaseOrder, PurchaseStatus } from '../../types';

// Section « Bons de commande » de la page Achats (responsable seulement).
// Brouillon (modifiable) → Commandé (figé) → Reçu (total ou partiel : les entrées de stock et la dépense « Achats » se créent à la réception, après confirmation).

interface LineEd { product_id: string; qty: string; cost: string }
interface Editor { id?: string; supplier: string; date: string; expected: string; note: string; lines: LineEd[] }
interface Receive { id: string; date: string; qty: Record<string, string>; expense: boolean }

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5';
const chip = (on: boolean) => `min-h-[40px] rounded-lg text-sm font-semibold border px-3 ${on ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`;
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const TONE: Record<PurchaseStatus, string> = { draft: 'bg-slate-700 text-slate-100', ordered: 'bg-sky-800 text-sky-100', received: 'bg-emerald-800 text-emerald-100', cancelled: 'bg-rose-900 text-rose-100' };
const LABEL: Record<PurchaseStatus, [string, string]> = { draft: ['Brouillon', 'Draft'], ordered: ['Commandé', 'Ordered'], received: ['Reçu', 'Received'], cancelled: ['Annulé', 'Cancelled'] };

export const PurchaseOrdersSection: React.FC<{ ver: number }> = ({ ver }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [filter, setFilter] = useState<PurchaseStatus | 'all' | 'late'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [recv, setRecv] = useState<Receive | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useLockBodyScroll(!!editor || !!recv);

  const today = todayMada();
  const data = useMemo(() => ({ orders: db.getPurchases(), suppliers: db.getSuppliers(), products: db.getProducts() }), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const { orders, suppliers, products } = data;
  const supName = (id: string) => suppliers.find(s => s.id === id)?.name || '—';
  const prod = (id: string) => products.find(p => p.id === id);
  const spaces = db.getStockSpaces();
  const sp = (p?: { storage_id?: string }) => (p && spaces.length > 1 ? ` · ${spaces.find(s => s.id === productStorage(p))?.name ?? ''}` : ''); // le nom du stockage, seulement s'il y en a plusieurs
  const ar = (n: number) => formatCurrencyAr(n);
  const lbl = (s: PurchaseStatus) => (lang === 'en' ? LABEL[s][1] : LABEL[s][0]);
  const lateCount = orders.filter(o => isLate(o, today)).length;
  const count = (s: PurchaseStatus) => orders.filter(o => o.status === s).length;
  const rows = orders.filter(o => filter === 'all' ? true : filter === 'late' ? isLate(o, today) : o.status === filter);
  const toReceive = orders.filter(o => o.status === 'ordered').reduce((n, o) => n + poTotal(o) - poReceivedValue(o), 0);

  const errors: Record<string, [string, string]> = {
    supplier: ['Choisis un fournisseur (qui existe encore).', 'Choose a supplier (that still exists).'], date: ['Date invalide.', 'Invalid date.'],
    expected: ['Livraison prévue invalide (pas avant la date de commande).', 'Invalid expected delivery (not before the order date).'],
    lines: ['Ajoute au moins une ligne (50 au plus).', 'Add at least one line (50 at most).'], product: ['Un produit n\'existe plus ou n\'est pas choisi.', 'A product no longer exists or is not chosen.'],
    qty: ['Quantité invalide (plus que 0 ; à la réception, pas plus que le reste).', 'Invalid quantity (more than 0; when receiving, no more than what is left).'], cost: ['Prix invalide.', 'Invalid price.'],
    duplicate: ['Un produit est présent deux fois : une seule ligne par produit.', 'A product appears twice: one line per product.'],
    missing: ['Ce bon n\'existe plus.', 'This order no longer exists.'], status: ['Ce bon ne peut plus changer ainsi.', 'This order can no longer change that way.'],
    none: ['Entre au moins une quantité reçue.', 'Enter at least one received quantity.'],
    unsynced: ['Attends quelques secondes que le bon soit enregistré sur le serveur, puis réessaie.', 'Wait a few seconds for the order to be saved on the server, then try again.'],
    admin: ['Réservé au responsable.', 'Admins only.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const emptyEditor = (): Editor => ({ supplier: '', date: today, expected: '', note: '', lines: [{ product_id: '', qty: '', cost: '' }] });
  const toEditor = (o: PurchaseOrder): Editor => ({ id: o.id, supplier: o.supplier_id, date: o.date, expected: o.expected_date || '', note: o.note || '', lines: o.lines.map(l => ({ product_id: l.product_id, qty: String(l.qty), cost: l.unit_cost_ar ? String(l.unit_cost_ar) : '' })) });
  const draftOf = (e: Editor) => ({ supplier_id: e.supplier, date: e.date, expected_date: e.expected, note: e.note, lines: e.lines.map(l => ({ product_id: l.product_id, qty: l.qty, unit_cost: l.cost })) });
  const save = (order: boolean) => {
    if (!editor) return;
    let id = editor.id;
    if (id) {
      const r = db.updatePurchase(id, draftOf(editor));
      if (!r.success) { setError(say(r.error)); return; }
      if (order) { const o = db.setPurchaseStatus(id, 'ordered'); if (!o.success) { setError(say(o.error)); return; } }
    } else {
      const r = db.addPurchase(draftOf(editor), order);
      if (!r.success) { setError(say(r.error)); return; }
      id = r.id;
    }
    if (id) setOpenId(id);
    setEditor(null); setError('');
  };
  const act = (fn: () => { success: boolean; error?: string }) => { const r = fn(); if (!r.success) setError(say(r.error)); else { setError(''); setConfirmId(null); } };

  const recvOrder = recv ? orders.find(o => o.id === recv.id) : undefined;
  const preview = useMemo(() => (recvOrder && recv ? planReceipt(recvOrder, Object.fromEntries(Object.entries(recv.qty).filter(([, v]) => String(v).trim() !== ''))) : null), [recvOrder, recv]);
  const startReceive = (o: PurchaseOrder) => { setError(''); setConfirmId(null); setRecv({ id: o.id, date: today, qty: Object.fromEntries(o.lines.map(l => [l.product_id, String(remainingQty(l))])), expense: true }); };
  const doReceive = () => {
    if (!recv) return;
    const r = db.receivePurchase(recv.id, Object.fromEntries(Object.entries(recv.qty).filter(([, v]) => String(v).trim() !== '')), { date: recv.date, withExpense: recv.expense });
    if (!r.success) { setError(say(r.error)); return; }
    setOpenId(recv.id); setRecv(null); setError('');
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0"><div className="text-[11px] text-slate-400">{t('Bons en attente', 'Open orders')}</div><div className="text-base font-bold text-white">{count('ordered')}</div></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0"><div className="text-[11px] text-slate-400">{t('Reste à recevoir', 'Left to receive')}</div><div className="text-base font-bold text-sky-300 truncate">{ar(toReceive)}</div></div>
        </div>
        <button type="button" onClick={() => { setError(''); setEditor(emptyEditor()); }} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Nouveau bon de commande', 'New purchase order')}</button>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Filtrer par état', 'Filter by state')}>
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>{t('Tous', 'All')} ({orders.length})</button>
          {(['draft', 'ordered', 'received', 'cancelled'] as PurchaseStatus[]).map(s => <button key={s} type="button" role="tab" aria-selected={filter === s} onClick={() => setFilter(s)} className={chip(filter === s)}>{lbl(s)} ({count(s)})</button>)}
          {lateCount > 0 && <button type="button" role="tab" aria-selected={filter === 'late'} onClick={() => setFilter('late')} className={chip(filter === 'late')}>{t('En retard', 'Late')} ({lateCount})</button>}
        </div>
        {error && !editor && !recv && <div role="alert" className="text-sm text-rose-300">{error}</div>}
        {orders.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun bon de commande pour l\'instant. Ajoute d\'abord un fournisseur, puis crée le premier bon.', 'No purchase orders yet. Add a supplier first, then create the first order.')}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun bon dans cet état.', 'No order in this state.')}</div>
        ) : (
          <ul>
            {rows.map(o => {
              const open = openId === o.id;
              const late = isLate(o, today);
              return (
                <li key={o.id} className="border-t border-slate-800 first:border-t-0">
                  <button type="button" aria-expanded={open} onClick={() => { setOpenId(open ? null : o.id); setConfirmId(null); setError(''); }} className="w-full min-h-[56px] py-2 flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{o.ref} · {supName(o.supplier_id)}</div>
                      <div className="text-[11px] text-slate-400 truncate">{fmtDate(o.date)} · {ar(poTotal(o))}{o.expected_date && o.status === 'ordered' ? ` · ${t('prévu le', 'expected')} ${fmtDate(o.expected_date)}` : ''}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 max-w-[45%]">
                      <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[o.status]}`}>{lbl(o.status)}</span>
                      {late && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-rose-800 text-rose-100">{t('En retard', 'Late')}</span>}
                    </div>
                  </button>
                  {open && (
                    <div className="pb-3 space-y-2">
                      <ul className="rounded-lg bg-slate-900/60 border border-slate-800 divide-y divide-slate-800">
                        {o.lines.map(l => (
                          <li key={l.product_id} className="p-2 text-sm flex items-center gap-2">
                            <div className="min-w-0 flex-1"><div className="text-white truncate">{prod(l.product_id)?.name || t('Produit supprimé', 'Deleted product')}{sp(prod(l.product_id))}</div>
                              <div className="text-[11px] text-slate-400">{l.qty} {prod(l.product_id)?.unit || ''} × {l.unit_cost_ar > 0 ? ar(l.unit_cost_ar) : t('prix à compléter', 'price to fill in')}{o.status !== 'draft' ? ` · ${t('reçu', 'received')} ${l.received_qty}/${l.qty}` : ''}</div></div>
                            <div className="text-sm font-semibold text-slate-100 whitespace-nowrap">{ar(lineTotal(l))}</div>
                          </li>
                        ))}
                      </ul>
                      <div className="text-sm text-slate-200">{t('Total du bon', 'Order total')} : <b>{ar(poTotal(o))}</b>{poHasReceipt(o) ? <span className="text-slate-400"> · {t('déjà reçu', 'already received')} {ar(poReceivedValue(o))}</span> : null}</div>
                      {o.note && <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{o.note}</p>}
                      {error && openId === o.id && !editor && !recv && <div role="alert" className="text-sm text-rose-300">{error}</div>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {o.status === 'draft' && <button type="button" onClick={() => { setError(''); setEditor(toEditor(o)); }} className={btn}><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>}
                        {o.status === 'draft' && <button type="button" onClick={() => act(() => db.setPurchaseStatus(o.id, 'ordered'))} className="min-h-[44px] px-3 rounded-lg bg-sky-700 text-white text-sm font-semibold">{t('Commander', 'Place order')}</button>}
                        {o.status === 'ordered' && <button type="button" onClick={() => startReceive(o)} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 text-white text-sm font-semibold">{t('Recevoir', 'Receive')}</button>}
                        {(o.status === 'draft' || (o.status === 'ordered' && !poHasReceipt(o))) && <button type="button" onClick={() => act(() => db.setPurchaseStatus(o.id, 'cancelled'))} className={btn}>{t('Annuler le bon', 'Cancel order')}</button>}
                        {(o.status === 'draft' || o.status === 'cancelled') && (confirmId === o.id ? (
                          <>
                            <button type="button" onClick={() => act(() => db.deletePurchase(o.id))} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer le bon', 'Delete the order')}</button>
                            <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm">{t('Non', 'No')}</button>
                          </>
                        ) : <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(o.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 hover:text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editor && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setEditor(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{editor.id ? t('Modifier le brouillon', 'Edit draft') : t('Nouveau bon de commande', 'New purchase order')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs text-slate-400">{t('Fournisseur', 'Supplier')}
              <select value={editor.supplier} onChange={e => setEditor({ ...editor, supplier: e.target.value })} className={`${field} mt-1`}>
                <option value="">{t('— Choisir —', '— Choose —')}</option>
                {suppliers.filter(s => s.active !== false || s.id === editor.supplier).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">{t('Date de commande', 'Order date')}<input type="date" value={editor.date} onChange={e => setEditor({ ...editor, date: e.target.value })} className={`${field} mt-1`} /></label>
              <label className="block text-xs text-slate-400">{t('Livraison prévue', 'Expected delivery')}<input type="date" value={editor.expected} onChange={e => setEditor({ ...editor, expected: e.target.value })} className={`${field} mt-1`} /></label>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">{t('Lignes (un produit par ligne)', 'Lines (one product per line)')}</div>
              {editor.lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-slate-800 p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={l.product_id} aria-label={t('Produit', 'Product')} onChange={e => { const p = prod(e.target.value); setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, product_id: e.target.value, cost: x.cost || (p?.buy_price_ar ? String(p.buy_price_ar) : '') } : x) }); }} className={field}>
                      <option value="">{t('Produit…', 'Product…')}</option>
                      {products.filter(p => p.id === l.product_id || !editor.lines.some(x => x.product_id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}{sp(p)}</option>)}
                    </select>
                    {editor.lines.length > 1 && <button type="button" aria-label={t('Retirer la ligne', 'Remove line')} onClick={() => setEditor({ ...editor, lines: editor.lines.filter((_, j) => j !== i) })} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 flex items-center justify-center"><X className="w-4 h-4" /></button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input inputMode="decimal" value={l.qty} aria-label={t('Quantité', 'Quantity')} placeholder={t('Quantité', 'Quantity')} onChange={e => setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} className={field} />
                    <input inputMode="numeric" value={l.cost} aria-label={t('Prix par unité (Ar)', 'Price per unit (Ar)')} placeholder={t('Prix/unité (Ar)', 'Price/unit (Ar)')} onChange={e => setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, cost: e.target.value } : x) })} className={field} />
                  </div>
                </div>
              ))}
              {editor.lines.length < 50 && <button type="button" onClick={() => setEditor({ ...editor, lines: [...editor.lines, { product_id: '', qty: '', cost: '' }] })} className={btn}><Plus className="w-4 h-4" />{t('Ajouter une ligne', 'Add a line')}</button>}
            </div>
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}<textarea value={editor.note} maxLength={300} rows={2} onChange={e => setEditor({ ...editor, note: e.target.value })} className={`${field} mt-1 py-2`} /></label>
            <p className="text-[11px] text-slate-500">{t('Un bon commandé ne change plus (seule la quantité reçue avance). Un prix vide pourra être complété plus tard : sans prix, aucune dépense n\'est calculée pour la ligne.', 'An ordered order no longer changes (only the received quantity moves). An empty price can be filled in later: without a price, no expense is calculated for the line.')}</p>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => save(false)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Enregistrer le brouillon', 'Save draft')}</button>
              <button type="button" onClick={() => save(true)} className="min-h-[44px] rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-sm font-semibold">{t('Commander', 'Place order')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {recv && recvOrder && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setRecv(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{t('Recevoir', 'Receive')} {recvOrder.ref}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setRecv(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[12px] text-slate-400">{t('Écris la quantité reçue maintenant pour chaque ligne (0 ou vide = rien reçu). Tu peux recevoir en plusieurs fois.', 'Enter the quantity received now for each line (0 or empty = nothing received). You can receive in several steps.')}</p>
            {recvOrder.lines.filter(l => remainingQty(l) > 0).map(l => (
              <label key={l.product_id} className="block text-xs text-slate-400">{prod(l.product_id)?.name || '—'}{sp(prod(l.product_id))} · {t('reste', 'left')} {remainingQty(l)} {prod(l.product_id)?.unit || ''}
                <input inputMode="decimal" value={recv.qty[l.product_id] ?? ''} onChange={e => setRecv({ ...recv, qty: { ...recv.qty, [l.product_id]: e.target.value } })} className={`${field} mt-1`} />
              </label>
            ))}
            <label className="block text-xs text-slate-400">{t('Date de réception', 'Receipt date')}<input type="date" value={recv.date} onChange={e => setRecv({ ...recv, date: e.target.value })} className={`${field} mt-1`} /></label>
            {preview && preview.ok && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2 space-y-1 text-sm text-slate-200">
                <div>{t(`${preview.plan.moves.length} entrée${preview.plan.moves.length > 1 ? 's' : ''} de stock seront créées.`, `${preview.plan.moves.length} stock entr${preview.plan.moves.length > 1 ? 'ies' : 'y'} will be created.`)}</div>
                {preview.plan.amount > 0 ? (
                  <label className="flex items-start gap-2 min-h-[44px]"><input type="checkbox" checked={recv.expense} onChange={e => setRecv({ ...recv, expense: e.target.checked })} className="mt-1 w-5 h-5" /><span>{t('Créer aussi UNE dépense « Achats » de', 'Also create ONE “Achats” expense of')} <b className="text-amber-300">{ar(preview.plan.amount)}</b></span></label>
                ) : <div className="text-[12px] text-amber-300">{t('Aucun prix sur ces lignes : aucune dépense ne sera créée.', 'No price on these lines: no expense will be created.')}</div>}
                <div className="text-[12px] text-slate-400">{preview.plan.status === 'received' ? t('Le bon sera complet : état « Reçu ».', 'The order will be complete: state “Received”.') : t('Réception partielle : le bon reste « Commandé ».', 'Partial receipt: the order stays “Ordered”.')}</div>
              </div>
            )}
            {preview && !preview.ok && <div className="text-[12px] text-amber-300">{say(preview.error)}</div>}
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRecv(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={doReceive} disabled={!preview || !preview.ok} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold">{t('Confirmer la réception', 'Confirm receipt')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
