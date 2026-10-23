import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, FilePlus2, Pencil, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { readCompany } from '../../utils/companyRules';
import { QUOTE_NAMES, canDeleteQuote, canInvoiceQuote, canQuoteTransition, checkQuoteDraft, quoteLabel } from '../../utils/quotes';
import type { Quote } from '../../types';

// Onglet « Devis » de la page Facturation (facultatif : réglage « Devis activés »). Mêmes lignes qu'une facture ;
// Brouillon (modifiable) → Envoyé (figé) → Accepté ou Refusé ; un devis accepté se transforme en facture brouillon en un clic.

interface LineEd { description: string; qty: string; price: string }
interface Editor { id?: string; client_id: string; date: string; valid_until: string; lines: LineEd[]; note: string }

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const btn = 'min-h-[44px] px-3 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer';
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const TONE: Record<string, string> = { draft: 'bg-slate-700 text-slate-100', sent: 'bg-sky-800 text-sky-100', accepted: 'bg-emerald-800 text-emerald-100', refused: 'bg-rose-900 text-rose-100', expired: 'bg-amber-800 text-amber-100', invoiced: 'bg-violet-800 text-violet-100' };

export const QuotesSection: React.FC<{ ver: number; onOpenInvoice: (id: string) => void }> = ({ ver, onOpenInvoice }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useLockBodyScroll(!!editor);

  const today = todayMada();
  const d = useMemo(() => ({ quotes: db.getQuotes(), clients: db.getClients(), company: readCompany(db.getSettings().company) }), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const { quotes, clients, company } = d;
  const ar = (n: number) => formatCurrencyAr(n);
  const nameOf = (x: Quote) => clients.find(c => c.id === x.client_id)?.name || x.client?.name || '—';
  const label = (x: Quote) => { const k = quoteLabel(x, today); return lang === 'en' ? QUOTE_NAMES[k].en : QUOTE_NAMES[k].fr; };
  const rows = useMemo(() => { const k = q.trim().toLowerCase(); return quotes.filter(x => !k || `${x.ref} ${nameOf(x)}`.toLowerCase().includes(k)); }, [quotes, q, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors: Record<string, [string, string]> = {
    client: ['Choisis un client.', 'Choose a client.'], no_client: ['Ce client n\'existe plus.', 'This client no longer exists.'], date: ['Date invalide.', 'Invalid date.'],
    valid_until: ['Fin de validité invalide.', 'Invalid validity date.'], valid_before: ['La fin de validité ne peut pas être avant la date du devis.', 'The validity date cannot be before the quote date.'],
    lines: ['Ajoute au moins une ligne.', 'Add at least one line.'], too_many_lines: ['Trop de lignes (200 au plus).', 'Too many lines (200 at most).'], description: ['Chaque ligne a besoin d\'une description.', 'Each line needs a description.'],
    qty: ['Quantité invalide (plus que 0).', 'Invalid quantity (more than 0).'], price: ['Prix invalide.', 'Invalid price.'], total: ['Le total doit être plus grand que 0.', 'The total must be more than 0.'],
    missing: ['Ce devis n\'existe plus.', 'This quote no longer exists.'], status: ['Ce devis ne peut plus changer ainsi.', 'This quote can no longer change that way.'],
    invoiced: ['Ce devis a déjà donné une facture.', 'This quote already gave an invoice.'], admin: ['Réservé au responsable.', 'Admins only.'],
  };
  const say = (code?: string) => { const m = errors[code || '']; return m ? t(m[0], m[1]) : t('Impossible d\'enregistrer.', 'Could not save.'); };

  const newEditor = (): Editor => ({ client_id: '', date: today, valid_until: '', lines: [{ description: '', qty: '1', price: '' }], note: '' });
  const toEditor = (x: Quote): Editor => ({ id: x.id, client_id: x.client_id, date: x.date, valid_until: x.valid_until || '', note: x.note || '', lines: x.lines.map(l => ({ description: l.description, qty: String(l.qty), price: String(l.unit_price_ar) })) });
  const draftOf = (e: Editor) => ({ id: e.id, client_id: e.client_id, date: e.date, valid_until: e.valid_until, note: e.note, lines: e.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.price })) });
  const preview = useMemo(() => (editor ? checkQuoteDraft({ ...draftOf(editor), vat_enabled: company.tax.vat_enabled, vat_rate: company.tax.vat_rate }) : null), [editor, company]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    if (!editor) return;
    const r = db.saveQuote(draftOf(editor));
    if (!r.success) { setError(say(r.error)); return; }
    if (r.id) setOpenId(r.id);
    setEditor(null); setError('');
  };
  const act = (fn: () => { success: boolean; error?: string }) => { const r = fn(); if (!r.success) setError(say(r.error)); else { setError(''); setConfirmId(null); } };
  const toInvoice = (x: Quote) => { const r = db.quoteToInvoice(x.id); if (!r.success) { setError(say(r.error)); return; } setError(''); if (r.invoice_id) onOpenInvoice(r.invoice_id); };

  return (
    <div className="space-y-3">
      <div className={card}>
        <p className="text-[11px] text-slate-400">{t('Un devis a les mêmes lignes qu\'une facture. Une fois accepté, il se transforme en facture brouillon en un clic.', 'A quote has the same lines as an invoice. Once accepted, it turns into a draft invoice in one click.')}</p>
        <button type="button" onClick={() => { setError(''); setEditor(newEditor()); }} className={`${btn} w-full bg-emerald-700 border-emerald-600 text-white`}><Plus className="w-4 h-4" />{t('Nouveau devis', 'New quote')}</button>
        <label className="relative block"><span className="sr-only">{t('Rechercher un devis', 'Search a quote')}</span><Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Numéro ou client…', 'Number or client…')} className={`${field} pl-9`} /></label>
        {error && !editor && <div role="alert" className="text-sm text-rose-300">{error}</div>}
        {quotes.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun devis pour l\'instant. Clique sur « Nouveau devis » pour commencer.', 'No quotes yet. Tap “New quote” to start.')}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun devis ne correspond.', 'No quote matches.')}</div>
        ) : (
          <ul>
            {rows.map(x => {
              const open = openId === x.id; const k = quoteLabel(x, today);
              return (
                <li key={x.id} className="border-t border-slate-800 first:border-t-0">
                  <button type="button" aria-expanded={open} onClick={() => { setOpenId(open ? null : x.id); setConfirmId(null); setError(''); }} className="w-full min-h-[56px] py-2 flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0 flex-1"><div className="text-sm text-white truncate">{x.ref} · {nameOf(x)}</div>
                      <div className="text-[11px] text-slate-400 truncate">{fmtDate(x.date)} · {ar(x.total_ar)}{x.valid_until ? ` · ${t('valable jusqu\'au', 'valid until')} ${fmtDate(x.valid_until)}` : ''}</div></div>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[k]}`}>{label(x)}</span>
                  </button>
                  {open && (
                    <div className="pb-3 space-y-2">
                      <ul className="rounded-lg bg-slate-900/60 border border-slate-800 divide-y divide-slate-800">
                        {x.lines.map(l => <li key={l.id} className="p-2 text-sm flex items-center gap-2"><div className="min-w-0 flex-1"><div className="text-white break-words">{l.description}</div><div className="text-[11px] text-slate-400">{l.qty} × {ar(l.unit_price_ar)}</div></div><div className="font-semibold text-slate-100 whitespace-nowrap">{ar(l.total_ar)}</div></li>)}
                      </ul>
                      <div className="text-sm text-slate-200">{x.tax_ar > 0 ? <span className="text-slate-400">{t('TVA', 'VAT')} {x.tax_rate} % : {ar(x.tax_ar)} · </span> : null}{t('Total du devis', 'Quote total')} : <b>{ar(x.total_ar)}</b></div>
                      {x.note && <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{x.note}</p>}
                      {error && openId === x.id && !editor && <div role="alert" className="text-sm text-rose-300">{error}</div>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {x.status === 'draft' && <button type="button" onClick={() => { setError(''); setEditor(toEditor(x)); }} className={`${btn} border-slate-600 text-slate-100`}><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>}
                        {canQuoteTransition(x, 'sent') && <button type="button" onClick={() => act(() => db.setQuoteStatus(x.id, 'sent'))} className={`${btn} bg-sky-700 border-sky-600 text-white`}><Send className="w-4 h-4" />{t('Marquer envoyé', 'Mark as sent')}</button>}
                        {canQuoteTransition(x, 'accepted') && <button type="button" onClick={() => act(() => db.setQuoteStatus(x.id, 'accepted'))} className={`${btn} bg-emerald-700 border-emerald-600 text-white`}>{t('Accepté', 'Accepted')}</button>}
                        {canQuoteTransition(x, 'refused') && <button type="button" onClick={() => act(() => db.setQuoteStatus(x.id, 'refused'))} className={`${btn} border-slate-600 text-slate-100`}>{t('Refusé', 'Refused')}</button>}
                        {canInvoiceQuote(x) && <button type="button" onClick={() => toInvoice(x)} className={`${btn} bg-violet-700 border-violet-600 text-white`}><FilePlus2 className="w-4 h-4" />{t('Transformer en facture', 'Turn into invoice')}</button>}
                        {x.invoice_id && <button type="button" onClick={() => onOpenInvoice(x.invoice_id!)} className={`${btn} border-slate-600 text-slate-100`}>{t('Voir la facture', 'See the invoice')}</button>}
                        {canDeleteQuote(x) && (confirmId === x.id ? (
                          <><button type="button" onClick={() => act(() => db.deleteQuote(x.id))} className={`${btn} bg-rose-700 border-rose-600 text-white`}>{t('Supprimer le devis', 'Delete the quote')}</button><button type="button" onClick={() => setConfirmId(null)} className={`${btn} border-slate-600 text-slate-200`}>{t('Non', 'No')}</button></>
                        ) : <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(x.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 hover:text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>)}
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
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-bold text-white">{editor.id ? t('Modifier le devis', 'Edit quote') : t('Nouveau devis', 'New quote')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button></div>
            <label className="block text-xs text-slate-400">{t('Client', 'Client')}
              <select value={editor.client_id} onChange={e => setEditor({ ...editor, client_id: e.target.value })} className={`${field} mt-1`}>
                <option value="">{t('— Choisir —', '— Choose —')}</option>
                {clients.filter(c => c.active !== false || c.id === editor.client_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">{t('Date du devis', 'Quote date')}<input type="date" value={editor.date} onChange={e => setEditor({ ...editor, date: e.target.value })} className={`${field} mt-1`} /></label>
              <label className="block text-xs text-slate-400">{t('Valable jusqu\'au (facultatif)', 'Valid until (optional)')}<input type="date" value={editor.valid_until} onChange={e => setEditor({ ...editor, valid_until: e.target.value })} className={`${field} mt-1`} /></label>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-300">{t('Lignes', 'Lines')}</p>
              {editor.lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-slate-800 p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input aria-label={t('Description', 'Description')} placeholder={t('Description', 'Description')} value={l.description} maxLength={200} onChange={e => setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} className={field} />
                    {editor.lines.length > 1 && <button type="button" aria-label={t('Retirer la ligne', 'Remove line')} onClick={() => setEditor({ ...editor, lines: editor.lines.filter((_, j) => j !== i) })} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-rose-300 flex items-center justify-center"><X className="w-4 h-4" /></button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label={t('Quantité', 'Quantity')} inputMode="decimal" placeholder={t('Quantité', 'Quantity')} value={l.qty} onChange={e => setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} className={field} />
                    <input aria-label={t('Prix unitaire', 'Unit price')} inputMode="numeric" placeholder={t('Prix unitaire (Ar)', 'Unit price (Ar)')} value={l.price} onChange={e => setEditor({ ...editor, lines: editor.lines.map((x, j) => j === i ? { ...x, price: e.target.value } : x) })} className={field} />
                  </div>
                </div>
              ))}
              {editor.lines.length < 200 && <button type="button" onClick={() => setEditor({ ...editor, lines: [...editor.lines, { description: '', qty: '1', price: '' }] })} className={`${btn} border-slate-600 text-slate-100`}><Plus className="w-4 h-4" />{t('Ajouter une ligne', 'Add a line')}</button>}
            </div>
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}<textarea value={editor.note} maxLength={500} rows={2} onChange={e => setEditor({ ...editor, note: e.target.value })} className={`${field} mt-1 py-2`} /></label>
            <div className="text-sm text-slate-200">{t('Total', 'Total')} : <b>{preview && preview.ok ? ar(preview.clean.total_ar) : '—'}</b>{preview && preview.ok && preview.clean.tax_ar > 0 ? <span className="text-slate-400"> ({t('TVA', 'VAT')} {preview.clean.tax_rate} %)</span> : null}</div>
            <p className="text-[11px] text-slate-500">{t('Un devis envoyé ne change plus. Le total est calculé pour toi, jamais saisi.', 'A sent quote no longer changes. The total is calculated for you, never typed.')}</p>
            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditor(null)} className={`${btn} border-slate-600 text-slate-200`}>{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={save} className={`${btn} bg-emerald-700 border-emerald-600 text-white`}>{t('Enregistrer le brouillon', 'Save draft')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
