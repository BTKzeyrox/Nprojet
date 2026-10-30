import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { inSpace, STOCK_SPACE_MAX } from '../../utils/stock';

// Fenêtre « Stockages » (responsable seulement) : créer, renommer, supprimer (un stockage VIDE seulement). Les stockages ne se mélangent jamais.
interface Props { lang: 'fr' | 'en'; onClose: () => void; onSelect: (id: string) => void }
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';

export const StockSpacesDialog: React.FC<Props> = ({ lang, onClose, onSelect }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const spaces = db.getStockSpaces();
  const products = db.getProducts();
  const count = (id: string) => inSpace(products, [], id).products.length;
  const errors: Record<string, [string, string]> = {
    space_name: ['Écris un nom de stockage.', 'Enter a storage name.'],
    space_exists: ['Ce nom existe déjà.', 'This name already exists.'],
    space_max: [`${STOCK_SPACE_MAX} stockages au plus.`, `${STOCK_SPACE_MAX} storages at most.`],
    space_last: ['Il faut garder au moins un stockage.', 'Keep at least one storage.'],
    space_not_empty: ['Ce stockage contient des produits : supprime-les d\'abord (ils ne sont jamais déplacés en cachette).', 'This storage holds products: delete them first (they are never moved behind your back).'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const add = () => {
    setError('');
    const r = db.addStockSpace(newName);
    if (!r.success || !r.id) { setError(say(r.error)); return; }
    setNewName(''); onSelect(r.id);
  };
  const rename = (id: string) => { setError(''); const r = db.renameStockSpace(id, editText); if (!r.success) { setError(say(r.error)); return; } setEditing(null); };
  const remove = (id: string) => { setError(''); const r = db.deleteStockSpace(id); setConfirmDel(null); if (!r.success) setError(say(r.error)); };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={t('Stockages', 'Storages')} onClick={onClose} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{t('Stockages', 'Storages')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Fermer', 'Close')} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[11px] text-slate-400">{t('Chaque stockage a ses propres produits, quantités, alertes et graphiques : ils ne se mélangent jamais. Un stockage ne se supprime que s\'il est vide.', 'Each storage has its own products, quantities, alerts and charts: they never mix. A storage can only be deleted when empty.')}</p>

        <ul>
          {spaces.map(s => (
            <li key={s.id} className="py-2 border-t border-slate-800 first:border-t-0">
              {editing === s.id ? (
                <div className="flex gap-2">
                  <input autoFocus value={editText} maxLength={40} aria-label={t('Nouveau nom', 'New name')} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(s.id); }} className={field} />
                  <button type="button" onClick={() => rename(s.id)} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 text-white text-sm font-semibold">{t('OK', 'OK')}</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Annuler', 'Cancel')}</button>
                </div>
              ) : confirmDel === s.id ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-rose-300 flex-1">{t(`Supprimer « ${s.name} » ?`, `Delete “${s.name}”?`)}</span>
                  <button type="button" onClick={() => remove(s.id)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer', 'Delete')}</button>
                  <button type="button" onClick={() => setConfirmDel(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Garder', 'Keep')}</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { onSelect(s.id); onClose(); }} className="flex-1 min-w-0 min-h-[44px] text-left text-sm text-white truncate">{s.name} <span className="text-[11px] text-slate-400">· {t(`${count(s.id)} produit${count(s.id) > 1 ? 's' : ''}`, `${count(s.id)} product${count(s.id) === 1 ? '' : 's'}`)}</span></button>
                  <button type="button" onClick={() => { setError(''); setEditing(s.id); setEditText(s.name); }} aria-label={t(`Renommer ${s.name}`, `Rename ${s.name}`)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-200 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => { setError(''); setConfirmDel(s.id); }} aria-label={t(`Supprimer ${s.name}`, `Delete ${s.name}`)} className="min-h-[44px] min-w-[44px] rounded-lg border border-rose-800 text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input value={newName} maxLength={40} placeholder={t('Nouveau stockage (ex. Dépôt)', 'New storage (e.g. Warehouse)')} aria-label={t('Nouveau stockage', 'New storage')} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} className={field} />
          <button type="button" onClick={add} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t('Ajouter', 'Add')}</button>
        </div>
        {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
      </div>
    </div>
  );
};
