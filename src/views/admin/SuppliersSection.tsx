import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { MAX_LEAD_DAYS, supplierRanking } from '../../utils/purchasing';
import type { Supplier } from '../../types';

// Section « Fournisseurs » de la page Achats (responsable seulement). Une fiche = nom, contact, délai habituel, note.
// Un fournisseur qui a servi (bon, entrée de stock, dépense) ne se supprime pas : on l'archive.

interface Editor { id?: string; name: string; contact: string; lead: string; note: string }
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5';
const chip = (on: boolean) => `min-h-[40px] rounded-lg text-sm font-semibold border px-3 ${on ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-200'}`;

export const SuppliersSection: React.FC<{ ver: number }> = ({ ver }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useLockBodyScroll(!!editor);

  const today = todayMada();
  const data = useMemo(() => {
    const suppliers = db.getSuppliers();
    const stats = new Map(supplierRanking(suppliers, db.getPurchases(), db.getStockMoves(), '0000-01-01', '9999-12-31', today).map(s => [s.supplier.id, s]));
    return { suppliers, stats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, today]);
  const { suppliers, stats } = data;
  const archivedCount = suppliers.filter(s => s.active === false).length;
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return suppliers.filter(s => (show === 'archived' ? s.active === false : s.active !== false) && (!k || `${s.name} ${s.contact} ${s.note}`.toLowerCase().includes(k)));
  }, [suppliers, q, show]);
  const ar = (n: number) => formatCurrencyAr(n);

  const errors: Record<string, [string, string]> = {
    name: ['Écris le nom du fournisseur.', 'Enter the supplier name.'],
    lead: [`Délai invalide : un nombre de jours entre 0 et ${MAX_LEAD_DAYS}.`, `Invalid lead time: a number of days between 0 and ${MAX_LEAD_DAYS}.`],
    duplicate: ['Un fournisseur porte déjà ce nom.', 'A supplier already has this name.'], missing: ['Cette fiche n\'existe plus.', 'This record no longer exists.'],
    in_use: ['Ce fournisseur a servi (bon, entrée de stock ou dépense) : archive-le au lieu de le supprimer.', 'This supplier has been used (order, stock entry or expense): archive it instead of deleting it.'],
    admin: ['Réservé au responsable.', 'Admins only.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const toEditor = (s: Supplier): Editor => ({ id: s.id, name: s.name, contact: s.contact || '', lead: s.lead_days !== undefined ? String(s.lead_days) : '', note: s.note || '' });
  const save = () => {
    if (!editor) return;
    const draft = { name: editor.name, contact: editor.contact, lead_days: editor.lead, note: editor.note };
    const r = editor.id ? db.updateSupplier(editor.id, draft) : db.addSupplier(draft);
    if (!r.success) { setError(say(r.error)); return; }
    if (!editor.id) { const id = (r as { id?: string }).id; if (id) setOpenId(id); }
    setEditor(null); setError('');
  };
  const archive = (s: Supplier, active: boolean) => { const r = db.setSupplierActive(s.id, active); if (!r.success) setError(say(r.error)); else { setError(''); setOpenId(null); } };
  const remove = (id: string) => { const r = db.deleteSupplier(id); setConfirmId(null); if (!r.success) setError(say(r.error)); else { setError(''); setOpenId(null); } };

  return (
    <div className="space-y-3">
      <div className={card}>
        <p className="text-[11px] text-slate-400">{t('Les fournisseurs se choisissent dans une entrée de stock, une dépense « Achats » et un bon de commande.', 'Suppliers are chosen in a stock entry, an “Achats” expense and a purchase order.')}</p>
        <button type="button" onClick={() => { setError(''); setConfirmId(null); setEditor({ name: '', contact: '', lead: '', note: '' }); }} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Nouveau fournisseur', 'New supplier')}</button>
        <label className="relative block">
          <span className="sr-only">{t('Rechercher un fournisseur', 'Search a supplier')}</span>
          <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Nom, contact, note…', 'Name, contact, note…')} className={`${field} pl-9`} />
        </label>
        {archivedCount > 0 && (
          <div className="flex gap-1.5" role="tablist">
            <button type="button" role="tab" aria-selected={show === 'active'} onClick={() => setShow('active')} className={chip(show === 'active')}>{t('Actifs', 'Active')} ({suppliers.length - archivedCount})</button>
            <button type="button" role="tab" aria-selected={show === 'archived'} onClick={() => setShow('archived')} className={chip(show === 'archived')}>{t('Archivés', 'Archived')} ({archivedCount})</button>
          </div>
        )}
        {error && !editor && <div role="alert" className="text-sm text-rose-300">{error}</div>}
        {suppliers.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun fournisseur pour l\'instant. Ajoute le premier avec « Nouveau fournisseur ».', 'No suppliers yet. Add the first one with “New supplier”.')}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun fournisseur ne correspond.', 'No supplier matches.')}</div>
        ) : (
          <ul>
            {rows.map(s => {
              const st = stats.get(s.id);
              const open = openId === s.id;
              return (
                <li key={s.id} className="border-t border-slate-800 first:border-t-0">
                  <button type="button" aria-expanded={open} onClick={() => { setOpenId(open ? null : s.id); setConfirmId(null); setError(''); }} className="w-full min-h-[56px] py-2 flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{s.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {st ? t(`${st.orders} bon${st.orders > 1 ? 's' : ''} · ${ar(st.spentAr)} reçus`, `${st.orders} order${st.orders > 1 ? 's' : ''} · ${ar(st.spentAr)} received`) : t('Aucun bon pour l\'instant', 'No order yet')}
                        {s.lead_days !== undefined ? ` · ${t(`délai ${s.lead_days} j`, `lead ${s.lead_days} d`)}` : ''}
                      </div>
                    </div>
                    {st && st.late > 0 && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-rose-800 text-rose-100">{t(`${st.late} en retard`, `${st.late} late`)}</span>}
                  </button>
                  {open && (
                    <div className="pb-3 space-y-2">
                      {s.contact && <div className="text-sm text-slate-200 break-words">{t('Contact', 'Contact')} : <b>{s.contact}</b></div>}
                      {s.note && <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{s.note}</p>}
                      <div className="text-sm text-slate-200 space-y-0.5">
                        <div>{t('Délai habituel', 'Usual lead time')} : <b>{s.lead_days !== undefined ? t(`${s.lead_days} jours`, `${s.lead_days} days`) : t('inconnu', 'unknown')}</b></div>
                        {st && <div>{t('Délai réel moyen', 'Average real lead time')} : <b>{st.avgLeadDays !== null ? t(`${st.avgLeadDays} jours`, `${st.avgLeadDays} days`) : t('pas encore de réception', 'no receipt yet')}</b></div>}
                      </div>
                      {error && openId === s.id && <div role="alert" className="text-sm text-rose-300">{error}</div>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => { setError(''); setConfirmId(null); setEditor(toEditor(s)); }} className={btn}><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>
                        {s.active === false
                          ? <button type="button" onClick={() => archive(s, true)} className={btn}><ArchiveRestore className="w-4 h-4" />{t('Réactiver', 'Reactivate')}</button>
                          : <button type="button" onClick={() => archive(s, false)} className={btn}><Archive className="w-4 h-4" />{t('Archiver', 'Archive')}</button>}
                        {confirmId === s.id ? (
                          <>
                            <button type="button" onClick={() => remove(s.id)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer la fiche', 'Delete the record')}</button>
                            <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm">{t('Non', 'No')}</button>
                          </>
                        ) : (
                          <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(s.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 hover:text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                        )}
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
              <h2 className="text-base font-bold text-white">{editor.id ? t('Modifier le fournisseur', 'Edit supplier') : t('Nouveau fournisseur', 'New supplier')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs text-slate-400">{t('Nom du fournisseur', 'Supplier name')}
              <input autoFocus value={editor.name} maxLength={80} onChange={e => setEditor({ ...editor, name: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Contact (téléphone, e-mail ou nom)', 'Contact (phone, e-mail or name)')}
              <input value={editor.contact} maxLength={120} onChange={e => setEditor({ ...editor, contact: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Délai habituel de livraison (jours, facultatif)', 'Usual delivery time (days, optional)')}
              <input inputMode="numeric" value={editor.lead} onChange={e => setEditor({ ...editor, lead: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}
              <textarea value={editor.note} maxLength={500} rows={2} onChange={e => setEditor({ ...editor, note: e.target.value })} className={`${field} mt-1 py-2`} />
            </label>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditor(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={save} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
