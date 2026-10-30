import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { categoryKey, categoryOptions, cleanCategoryName, DEFAULT_STOCK_CATEGORIES, STOCK_CATEGORY_MAX } from '../../utils/stock';

// Fenêtre « Catégories » du Stockage (responsable seulement) : la liste par défaut, qu'on peut ajouter, renommer, supprimer, remettre.
interface Props { lang: 'fr' | 'en'; onClose: () => void }
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';

export const StockCategoriesDialog: React.FC<Props> = ({ lang, onClose }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState('');
  const products = db.getProducts();
  const list = categoryOptions(db.getStockCategories(), products);
  const count = (c: string) => products.filter(p => categoryKey(p.category) === categoryKey(c)).length;
  const errors: Record<string, [string, string]> = {
    category: ['Écris un nom de catégorie.', 'Enter a category name.'],
    category_exists: ['Cette catégorie existe déjà.', 'This category already exists.'],
    category_max: [`${STOCK_CATEGORY_MAX} catégories au plus.`, `${STOCK_CATEGORY_MAX} categories at most.`],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const add = () => {
    setError('');
    const name = cleanCategoryName(newName);
    if (!name) { setError(say('category')); return; }
    if (list.some(c => categoryKey(c) === categoryKey(name))) { setError(say('category_exists')); return; }
    if (list.length >= STOCK_CATEGORY_MAX) { setError(say('category_max')); return; }
    const r = db.setStockCategories([...db.getStockCategories(), name]);
    if (!r.success) { setError(say(r.error)); return; }
    setNewName('');
  };
  const rename = (from: string) => {
    setError('');
    const r = db.renameStockCategory(from, editText);
    if (!r.success) { setError(say(r.error)); return; }
    setEditing(null);
  };
  const remove = (name: string) => { setError(''); const r = db.deleteStockCategory(name); setConfirmDel(null); if (!r.success) setError(say(r.error)); };
  const reset = () => { setError(''); const r = db.setStockCategories(DEFAULT_STOCK_CATEGORIES); setConfirmReset(false); if (!r.success) setError(say(r.error)); };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={t('Catégories', 'Categories')} onClick={onClose} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{t('Catégories', 'Categories')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Fermer', 'Close')} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[11px] text-slate-400">{t('La catégorie d\'un produit est facultative. Renommer une catégorie change aussi ses produits ; la supprimer laisse ses produits sans catégorie.', 'A product\'s category is optional. Renaming a category also changes its products; deleting it leaves its products without a category.')}</p>

        <ul>
          {list.map(c => (
            <li key={categoryKey(c)} className="py-2 border-t border-slate-800 first:border-t-0">
              {editing === c ? (
                <div className="flex gap-2">
                  <input autoFocus value={editText} maxLength={40} aria-label={t('Nouveau nom', 'New name')} onChange={e => setEditText(e.target.value)} className={field} />
                  <button type="button" onClick={() => rename(c)} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 text-white text-sm font-semibold">{t('OK', 'OK')}</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Annuler', 'Cancel')}</button>
                </div>
              ) : confirmDel === c ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-rose-300 flex-1">{count(c) > 0 ? t(`Supprimer « ${c} » ? ${count(c)} produit${count(c) > 1 ? 's' : ''} sans catégorie.`, `Delete “${c}”? ${count(c)} product${count(c) > 1 ? 's' : ''} without category.`) : t(`Supprimer « ${c} » ?`, `Delete “${c}”?`)}</span>
                  <button type="button" onClick={() => remove(c)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer', 'Delete')}</button>
                  <button type="button" onClick={() => setConfirmDel(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Garder', 'Keep')}</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm text-white truncate">{c} <span className="text-[11px] text-slate-400">· {count(c)}</span></span>
                  <button type="button" onClick={() => { setError(''); setEditing(c); setEditText(c); }} aria-label={t(`Renommer ${c}`, `Rename ${c}`)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-200 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => { setError(''); setConfirmDel(c); }} aria-label={t(`Supprimer ${c}`, `Delete ${c}`)} className="min-h-[44px] min-w-[44px] rounded-lg border border-rose-800 text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-slate-400 py-2">{t('Aucune catégorie. Ajoutes-en une, ou remets la liste par défaut.', 'No category. Add one, or restore the default list.')}</li>}
        </ul>

        <div className="flex gap-2">
          <input value={newName} maxLength={40} placeholder={t('Nouvelle catégorie', 'New category')} aria-label={t('Nouvelle catégorie', 'New category')} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} className={field} />
          <button type="button" onClick={add} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t('Ajouter', 'Add')}</button>
        </div>
        {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}

        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-amber-300 flex-1">{t('Remplacer la liste par la liste par défaut ? Les produits ne changent pas.', 'Replace the list with the default list? Products do not change.')}</span>
            <button type="button" onClick={reset} className="min-h-[44px] px-3 rounded-lg bg-amber-700 text-white text-sm font-semibold">{t('Remettre', 'Restore')}</button>
            <button type="button" onClick={() => setConfirmReset(false)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Annuler', 'Cancel')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className="w-full min-h-[44px] rounded-lg border border-slate-700 text-slate-300 text-sm">{t('Remettre la liste par défaut', 'Restore the default list')}</button>
        )}
      </div>
    </div>
  );
};
