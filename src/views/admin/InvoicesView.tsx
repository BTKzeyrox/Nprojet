import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, FilePlus2, Pencil, Download, FileText, Plus, Printer, Search, Send, Trash2, Wallet, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { readCompany } from '../../utils/companyRules';
import { askConfirm } from '../../components/ConfirmModal';
import {
  agedBalance, billableMissions, canCancel, dueDate, invoiceInfo, invoiceTotals, invoiceTotalsAll, lineTotal, proposeLines,
  type InvoiceError, type InvoiceState, type LineDraft,
} from '../../utils/invoices';
import { parseAmount } from '../../utils/finance';
import { chaseText, toChase } from '../../utils/receivables';
import { smsLink, whatsappLink } from '../../utils/messageLinks';
import { invoiceHtml, printDoc, receiptHtml } from '../../utils/invoiceDoc';
import { downloadInvoiceExcel, downloadPdfFromHtml } from '../../utils/exportDoc';
import type { Invoice } from '../../types';
import { QuotesSection } from './QuotesSection';

// Page « Facturation » (responsable seulement) : liste, brouillon, émission, paiement, avoir.
// Le numéro, le reçu et les totaux définitifs sont toujours posés par le serveur ; l'état (payée, en retard…) se calcule (src/utils/invoices.ts).

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const btn = 'min-h-[44px] px-3 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer';
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');

export const STATE_LABEL: Record<InvoiceState, { fr: string; en: string; tone: string }> = {
  draft: { fr: 'Brouillon', en: 'Draft', tone: 'bg-slate-700 text-slate-100' },
  issued: { fr: 'Émise', en: 'Issued', tone: 'bg-sky-800 text-sky-100' },
  partial: { fr: 'Partiellement payée', en: 'Partly paid', tone: 'bg-amber-700 text-amber-50' },
  paid: { fr: 'Payée', en: 'Paid', tone: 'bg-emerald-800 text-emerald-100' },
  overdue: { fr: 'En retard', en: 'Overdue', tone: 'bg-rose-800 text-rose-100' },
  cancelled: { fr: 'Annulée', en: 'Cancelled', tone: 'bg-slate-600 text-slate-200' },
  credit_note: { fr: 'Avoir', en: 'Credit note', tone: 'bg-violet-800 text-violet-100' },
};

const ERRORS: Record<string, [string, string]> = {
  admin: ['Réservé au responsable.', 'Managers only.'],
  client: ['Choisis un client.', 'Choose a client.'], no_client: ['Ce client n\'existe plus.', 'This client no longer exists.'],
  issue_date: ['Date d\'émission invalide.', 'Invalid issue date.'], due_date: ['Date d\'échéance invalide.', 'Invalid due date.'],
  due_before: ['L\'échéance ne peut pas être avant l\'émission.', 'The due date cannot be before the issue date.'],
  lines: ['Ajoute au moins une ligne.', 'Add at least one line.'], too_many_lines: ['Trop de lignes (200 au maximum).', 'Too many lines (200 max).'],
  description: ['Chaque ligne a besoin d\'une description.', 'Every line needs a description.'],
  qty: ['Quantité invalide (plus que 0).', 'Invalid quantity (more than 0).'], price: ['Prix invalide.', 'Invalid price.'],
  total: ['Total invalide : une facture doit être de plus de 0 Ar et sous 100 milliards.', 'Invalid total: an invoice must be above 0 Ar and under 100 billion.'],
  ref_used: ['Une de ces missions est déjà dans une autre facture.', 'One of these missions is already on another invoice.'],
  not_draft: ['Seul un brouillon peut être modifié ou supprimé. Une facture émise s\'annule par un avoir.', 'Only a draft can be edited or deleted. An issued invoice is cancelled by a credit note.'],
  missing: ['Facture introuvable.', 'Invoice not found.'],
};

interface Editor { id?: string; client_id: string; issue_date: string; due_date: string; dueTouched: boolean; lines: { description: string; qty: string; price: string; refs?: string[] }[]; note: string; picked: string[] }
interface Pay { id: string; amount: string; date: string; method: string; note: string }

export const InvoicesView: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [ver, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [q, setQ] = useState('');
  const [state, setState] = useState<InvoiceState | 'all'>('all');
  const [clientId, setClientId] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [tab, setTab] = useState<'list' | 'receivables' | 'quotes'>('list');
  const [chaseLang, setChaseLang] = useState<'fr' | 'en'>(lang === 'en' ? 'en' : 'fr');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useLockBodyScroll(!!editor || !!pay || !!openId);

  const today = todayMada();
  const d = useMemo(() => {
    const settings = db.getSettings();
    return { invoices: db.getInvoices(), cash: db.getCash(), clients: db.getClients(), posts: db.getPosts(), contracts: db.getContracts(), company: readCompany(settings.company), prices: { client_price_default_ar: settings.client_price_default_ar, client_prices_by_type: settings.client_prices_by_type } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver]);
  const { invoices, cash, clients, company } = d;
  const ar = (n: number) => formatCurrencyAr(n);
  const clientName = (id: string) => clients.find(c => c.id === id)?.name || invoices.find(i => i.client_id === id)?.client?.name || '—';
  const msg = (code: string) => { const e = ERRORS[code]; return e ? t(e[0], e[1]) : code || t('Erreur.', 'Error.'); };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.map(inv => ({ inv, info: invoiceInfo(inv, cash, today) })).filter(({ inv, info }) =>
      (state === 'all' || info.state === state) && (clientId === 'all' || inv.client_id === clientId) &&
      (!needle || `${inv.number || ''} ${inv.client?.name || ''} ${clientName(inv.client_id)}`.toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, cash, today, q, state, clientId, clients]);
  const totals = useMemo(() => invoiceTotalsAll(invoices, cash, today), [invoices, cash, today]);
  const aged = useMemo(() => agedBalance(invoices, cash, today), [invoices, cash, today]);
  const chase = useMemo(() => toChase(invoices, cash, today, Object.fromEntries(clients.map(c => [c.id, c.name]))), [invoices, cash, today, clients]);
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { setError(t('Copie impossible : sélectionne le texte et copie-le à la main.', 'Copy failed: select the text and copy it by hand.')); } };

  // ----- éditeur de brouillon -----
  const newEditor = (): Editor => ({ client_id: '', issue_date: today, due_date: dueDate(today, undefined, company.billing.payment_days), dueTouched: false, lines: [], note: '', picked: [] });
  const editDraft = (inv: Invoice): Editor => ({ id: inv.id, client_id: inv.client_id, issue_date: inv.issue_date, due_date: inv.due_date, dueTouched: true, lines: inv.lines.map(l => ({ description: l.description, qty: String(l.qty), price: String(l.unit_price_ar), refs: l.refs })), note: inv.note || '', picked: [] });
  const patch = (p: Partial<Editor>) => setEditor(e => {
    if (!e) return e;
    const n = { ...e, ...p };
    if (!n.dueTouched && ('client_id' in p || 'issue_date' in p)) n.due_date = dueDate(n.issue_date, clients.find(c => c.id === n.client_id)?.payment_terms_days, company.billing.payment_days);
    return n;
  });
  const billable = useMemo(() => {
    if (!editor || !editor.client_id) return [];
    const client = clients.find(c => c.id === editor.client_id);
    if (!client) return [];
    return billableMissions(d.posts, d.contracts, client, d.prices, invoices.filter(i => i.id !== editor.id));
  }, [editor?.client_id, editor?.id, invoices, d, clients]); // eslint-disable-line react-hooks/exhaustive-deps
  const usedHere = new Set((editor?.lines || []).flatMap(l => l.refs || []));
  const available = billable.filter(m => !usedHere.has(m.session_id));
  const addPicked = () => {
    if (!editor) return;
    const picked = available.filter(m => editor.picked.includes(m.session_id));
    const add = proposeLines(picked).map((l: LineDraft) => ({ description: l.description, qty: String(l.qty), price: String(l.unit_price), refs: l.refs }));
    patch({ lines: [...editor.lines, ...add], picked: [] });
  };
  const draftLines = (editor?.lines || []).map(l => { const qty = Math.round(parseAmount(l.qty) * 100) / 100; const p = Math.round(parseAmount(l.price)); return Number.isFinite(qty) && Number.isFinite(p) ? lineTotal(qty, p) : 0; });
  const preview = invoiceTotals(draftLines.map(total_ar => ({ total_ar })), company.tax.vat_enabled, company.tax.vat_rate);

  const save = () => {
    if (!editor) return;
    const r = db.saveInvoiceDraft({ id: editor.id, client_id: editor.client_id, issue_date: editor.issue_date, due_date: editor.due_date, note: editor.note, lines: editor.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.price, refs: l.refs })) });
    if (!r.success) { setError(msg(r.error || '') + (r.line !== undefined ? ` (${t('ligne', 'line')} ${r.line + 1})` : '')); return; }
    setError(''); setEditor(null); if (r.id) setOpenId(r.id);
  };

  // ----- actions sur le serveur -----
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setBusy(true); setError('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error || t('Erreur.', 'Error.')); else done?.();
  };
  const issue = (inv: Invoice) => askConfirm({
    title: t('Émettre cette facture ?', 'Issue this invoice?'),
    message: t('Le numéro sera attribué maintenant et il sera définitif. Une facture émise ne se modifie plus : si tu t\'es trompé, tu l\'annules par un avoir.', 'The number is assigned now and is final. An issued invoice can no longer be edited: if you made a mistake, you cancel it with a credit note.'),
    confirmLabel: t('Émettre', 'Issue'), onConfirm: () => { void run(() => db.issueInvoice(inv.id)); },
  });
  const cancel = (inv: Invoice) => askConfirm({
    title: t(`Annuler la facture ${inv.number} ?`, `Cancel invoice ${inv.number}?`),
    message: t('Un avoir sera créé (nouveau numéro) et la facture sera marquée annulée. Les missions redeviennent à facturer.', 'A credit note will be created (new number) and the invoice marked cancelled. The missions become billable again.'),
    confirmLabel: t('Annuler la facture', 'Cancel invoice'), danger: true, onConfirm: () => { void run(() => db.cancelInvoice(inv.id)); },
  });
  const remove = (inv: Invoice) => askConfirm({
    title: t('Supprimer ce brouillon ?', 'Delete this draft?'), message: t('Un brouillon n\'a pas de numéro : rien n\'est perdu côté numérotation.', 'A draft has no number: nothing is lost in the numbering.'),
    confirmLabel: t('Supprimer', 'Delete'), danger: true, onConfirm: () => { const r = db.deleteInvoiceDraft(inv.id); if (!r.success) setError(msg(r.error || '')); else setOpenId(null); },
  });
  const submitPay = () => {
    if (!pay) return;
    const amount = Math.round(parseAmount(pay.amount));
    if (!Number.isFinite(amount) || amount < 1) { setError(t('Montant invalide.', 'Invalid amount.')); return; }
    void run(() => db.payInvoice(pay.id, { amount, date: pay.date, method: pay.method, note: pay.note }), () => setPay(null));
  };

  const open = invoices.find(i => i.id === openId) || null;
  const openInfo = open ? invoiceInfo(open, cash, today) : null;
  const payments = open ? cash.filter(c => c.invoice_id === open.id && c.kind === 'in') : [];
  const Badge = ({ s }: { s: InvoiceState }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${STATE_LABEL[s].tone}`}>{lang === 'en' ? STATE_LABEL[s].en : STATE_LABEL[s].fr}</span>;
  const modal = (children: React.ReactNode, onClose: () => void) => createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onClose} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>{children}</div>
    </div>, document.body);
  const closeBtn = (onClose: () => void) => <button type="button" aria-label={t('Fermer', 'Close')} onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 cursor-pointer"><X className="w-5 h-5" /></button>;

  return (
    <div className="max-w-5xl mx-auto px-1.5 sm:px-3 py-3 space-y-4" data-testid="invoices-page">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-tactical font-black text-lg text-white flex items-center gap-2"><FilePlus2 className="w-6 h-6 text-emerald-500" />{t('Facturation', 'Invoicing')}</h2>
        <button type="button" onClick={() => { setError(''); setEditor(newEditor()); }} className={`${btn} bg-emerald-600 border-emerald-500 text-white`}><Plus className="w-4 h-4" />{t('Nouvelle facture', 'New invoice')}</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={card}><p className="text-[11px] text-slate-400">{t('Facturé (émises)', 'Billed (issued)')}</p><p className="text-base font-bold text-white">{ar(totals.billed)}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">{t('À encaisser', 'To collect')}</p><p className="text-base font-bold text-white">{ar(totals.to_collect)}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">{t('Dont en retard', 'Of which overdue')}</p><p className={`text-base font-bold ${totals.overdue > 0 ? 'text-rose-300' : 'text-white'}`}>{ar(totals.overdue)}</p></div>
      </div>

      <div className={`grid ${company.options.quotes_enabled ? 'grid-cols-3' : 'grid-cols-2'} gap-2`} role="tablist">
        {([['list', t('Factures', 'Invoices')], ['receivables', `${t('Créances', 'Receivables')}${chase.length ? ` (${chase.length})` : ''}`], ...(company.options.quotes_enabled ? [['quotes', t('Devis', 'Quotes')]] : [])] as [typeof tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`${btn} ${tab === k ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-200'}`}>{label}</button>
        ))}
      </div>

      {error && !editor && !pay && <p className="text-sm text-rose-300" role="alert">{error}</p>}

      {tab === 'quotes' && company.options.quotes_enabled && <QuotesSection ver={ver} onOpenInvoice={id => { setTab('list'); setState('all'); setClientId('all'); setQ(''); setOpenId(id); }} />}

      {tab === 'list' && <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Numéro ou client…', 'Number or client…')} className={`${field} pl-9`} /></div>
        <select value={state} onChange={e => setState(e.target.value as InvoiceState | 'all')} className={field} aria-label={t('État', 'State')}>
          <option value="all">{t('Tous les états', 'All states')}</option>
          {(Object.keys(STATE_LABEL) as InvoiceState[]).map(s => <option key={s} value={s}>{lang === 'en' ? STATE_LABEL[s].en : STATE_LABEL[s].fr}</option>)}
        </select>
        <select value={clientId} onChange={e => setClientId(e.target.value)} className={field} aria-label={t('Client', 'Client')}>
          <option value="all">{t('Tous les clients', 'All clients')}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>}

      {tab === 'list' && (rows.length === 0 ? (
        <div className={card}><p className="text-sm text-slate-300">{invoices.length === 0 ? t('Aucune facture pour le moment. Clique sur « Nouvelle facture » pour commencer : tu peux y mettre les missions validées d\'un client.', 'No invoice yet. Click “New invoice” to start: you can add a client\'s approved missions.') : t('Aucune facture ne correspond à ces filtres.', 'No invoice matches these filters.')}</p></div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ inv, info }) => (
            <li key={inv.id}>
              <button type="button" onClick={() => { setError(''); setOpenId(inv.id); }} className={`${card} w-full text-left cursor-pointer hover:border-emerald-600`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-white text-sm">{inv.number || t('Brouillon', 'Draft')}</span>
                  <Badge s={info.state} />
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-200 truncate">{clientName(inv.client_id)}</span>
                  <span className="font-bold text-white whitespace-nowrap">{ar(inv.total_ar)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>{fmtDate(inv.issue_date)} → {t('échéance', 'due')} {fmtDate(inv.due_date)}</span>
                  {info.balance > 0 && inv.status === 'issued' && <span className={info.overdue ? 'text-rose-300' : ''}>{t('Reste', 'Left')} {ar(info.balance)}{info.overdue ? ` · ${info.days_late} ${t('j de retard', 'd late')}` : ''}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ))}

      {tab === 'receivables' && (
        <div className="space-y-3" data-testid="receivables">
          <div className={card}>
            <h3 className="font-bold text-white text-sm">{t('Ce que les clients doivent (par retard)', 'What clients owe (by delay)')}</h3>
            {aged.length === 0 ? <p className="text-sm text-slate-300">{t('Aucune créance : toutes les factures émises sont payées.', 'No receivable: all issued invoices are paid.')}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs text-slate-200"><thead><tr className="text-slate-400 text-left"><th className="py-1">{t('Client', 'Client')}</th><th className="text-right">{t('Pas échu', 'Not due')}</th><th className="text-right">1-30 j</th><th className="text-right">31-60 j</th><th className="text-right">61-90 j</th><th className="text-right">90+ j</th><th className="text-right">{t('Total', 'Total')}</th></tr></thead>
                <tbody>{aged.map(r => <tr key={r.client_id} className="border-t border-slate-800"><td className="py-1.5 pr-2">{clientName(r.client_id)}</td>{[r.current, r.d30, r.d60, r.d90, r.d90p].map((v, k) => <td key={k} className={`text-right whitespace-nowrap ${v > 0 && k >= 3 ? 'text-rose-300' : ''}`}>{v ? ar(v) : '–'}</td>)}<td className="text-right font-bold whitespace-nowrap">{ar(r.total)}</td></tr>)}</tbody></table></div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-white text-sm">{t('À relancer', 'To chase')} ({chase.length})</h3>
            <select value={chaseLang} onChange={e => setChaseLang(e.target.value as 'fr' | 'en')} className={`${field} !w-auto`} aria-label={t('Langue du message', 'Message language')}><option value="fr">{t('Message en français', 'Message in French')}</option><option value="en">{t('Message en anglais', 'Message in English')}</option></select></div>
          {chase.length === 0 ? <div className={card}><p className="text-sm text-slate-300">{t('Personne à relancer : aucune facture n\'a dépassé son échéance.', 'Nobody to chase: no invoice is past its due date.')}</p></div> : chase.map(r => {
            const text = chaseText(r, { lang: chaseLang, company_name: company.identity.name, currency: company.identity.currency, payment_methods: company.billing.payment_methods_text, penalty: company.billing.late_penalty_text });
            return (
              <div key={r.client_id} className={card}>
                <div className="flex items-center justify-between gap-2"><span className="font-bold text-white text-sm">{r.client_name}</span><span className="text-rose-300 text-sm font-bold whitespace-nowrap">{ar(r.total)} · {r.max_days} {t('j', 'd')}</span></div>
                <ul className="text-xs text-slate-300 space-y-0.5">{r.invoices.map(i => <li key={i.id}>{i.number} · {t('échue le', 'due')} {fmtDate(i.due_date)} · {ar(i.balance)} · {i.days_late} {t('j de retard', 'd late')}</li>)}</ul>
                <textarea readOnly value={text} rows={8} className={`${field} py-2 font-mono text-xs`} aria-label={t('Texte de relance', 'Reminder text')} />
                <button type="button" onClick={() => copy(r.client_id, text)} className={`${btn} bg-blue-600 border-blue-500 text-white`}>{copied === r.client_id ? t('Copié !', 'Copied!') : t('Copier le texte', 'Copy the text')}</button>
                {(() => {
                  const phone = clients.find(c => c.id === r.client_id)?.phone;
                  const wa = whatsappLink(phone, text), sms = smsLink(phone, text);
                  return (
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-2">
                        <a href={wa.url} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-700 border-emerald-600 text-white text-center`}>{t('Envoyer par WhatsApp', 'Send by WhatsApp')}</a>
                        <a href={sms.url} className={`${btn} bg-slate-800 border-slate-600 text-white text-center`}>{t('Envoyer par SMS', 'Send by SMS')}</a>
                      </div>
                      <p className="text-[11px] text-slate-400">{wa.hasPhone ? t('Le message s\'ouvre déjà écrit : tu appuies sur « envoyer ».', 'The message opens already written: you press "send".') : t('Pas de numéro valide pour ce client : tu choisis le contact dans WhatsApp ou SMS (ou ajoute le numéro dans Clients).', 'No valid number for this client: pick the contact in WhatsApp or SMS (or add the number in Clients).')}{wa.truncated ? ' ' + t('Texte raccourci pour le lien : utilise « Copier le texte » pour le message complet.', 'Text shortened for the link: use "Copy the text" for the full message.') : ''}</p>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {open && openInfo && !editor && !pay && modal(<>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{open.type === 'credit_note' ? t('Avoir', 'Credit note') : t('Facture', 'Invoice')} {open.number || t('(brouillon)', '(draft)')}</h2>
          {closeBtn(() => setOpenId(null))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300"><Badge s={openInfo.state} /><span>{clientName(open.client_id)}</span><span>· {fmtDate(open.issue_date)} → {fmtDate(open.due_date)}</span></div>
        {open.credit_of && <p className="text-xs text-slate-400">{t('Annule la facture', 'Cancels invoice')} {invoices.find(i => i.id === open.credit_of)?.number || ''}</p>}
        {open.cancelled_by && <p className="text-xs text-slate-400">{t('Annulée par l\'avoir', 'Cancelled by credit note')} {invoices.find(i => i.id === open.cancelled_by)?.number || ''}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm text-slate-200"><thead><tr className="text-[11px] text-slate-400 text-left"><th className="py-1">{t('Description', 'Description')}</th><th className="text-right">{t('Qté', 'Qty')}</th><th className="text-right">{t('Prix', 'Price')}</th><th className="text-right">{t('Total', 'Total')}</th></tr></thead>
          <tbody>{open.lines.map(l => <tr key={l.id} className="border-t border-slate-800"><td className="py-1.5 pr-2">{l.description}</td><td className="text-right">{l.qty}</td><td className="text-right whitespace-nowrap">{ar(l.unit_price_ar)}</td><td className="text-right whitespace-nowrap">{ar(l.total_ar)}</td></tr>)}</tbody></table></div>
        <div className="text-sm text-slate-200 space-y-0.5 text-right">
          <p>{t('Sous-total', 'Subtotal')} : {ar(open.subtotal_ar)}</p>
          {open.tax_rate > 0 && <p>{t('TVA', 'VAT')} {open.tax_rate} % : {ar(open.tax_ar)}</p>}
          <p className="font-bold text-white text-base">{t('Total', 'Total')} : {ar(open.total_ar)}</p>
          {open.status === 'issued' && open.type !== 'credit_note' && <><p>{t('Déjà payé', 'Already paid')} : {ar(openInfo.paid)}</p><p className="font-bold">{t('Reste à payer', 'Left to pay')} : {ar(openInfo.balance)}</p></>}
        </div>
        {open.note && <p className="text-xs text-slate-400 whitespace-pre-wrap">{open.note}</p>}
        {payments.length > 0 && <div><h3 className="text-xs font-bold text-slate-300 mb-1">{t('Paiements reçus', 'Payments received')}</h3><ul className="text-sm text-slate-200 space-y-1">{payments.map(p => <li key={p.id} className="flex items-center justify-between gap-2"><span>{fmtDate(p.date)} · {p.receipt_no || ''} {p.payment_method ? `· ${p.payment_method}` : ''}</span><span className="flex items-center gap-2">{ar(p.amount_ar)}<button type="button" onClick={() => printDoc(receiptHtml(p, open, cash, { lang, company }))} className="min-h-[36px] px-2 rounded border border-slate-600 text-xs text-slate-100 cursor-pointer inline-flex items-center gap-1"><Printer className="w-3.5 h-3.5" />{t('Reçu', 'Receipt')}</button><button type="button" onClick={() => void downloadPdfFromHtml(receiptHtml(p, open, cash, { lang, company }), `recu-${p.receipt_no || p.id}`).catch(() => setError(t('Export PDF impossible.', 'PDF export failed.')))} className="min-h-[36px] px-2 rounded border border-slate-600 text-xs text-slate-100 cursor-pointer inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />PDF</button></span></li>)}</ul></div>}
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => printDoc(invoiceHtml(open, { lang, company, paid: openInfo.paid, creditOfNumber: invoices.find(i => i.id === open.credit_of)?.number }))} className={`${btn} border-slate-600 text-slate-100`}><Printer className="w-4 h-4" />{t('Imprimer', 'Print')}</button>
          <button type="button" onClick={() => void downloadPdfFromHtml(invoiceHtml(open, { lang, company, paid: openInfo.paid, creditOfNumber: invoices.find(i => i.id === open.credit_of)?.number }), `${open.type === 'credit_note' ? 'avoir' : 'facture'}-${open.number || open.id}`).catch(() => setError(t('Export PDF impossible.', 'PDF export failed.')))} className={`${btn} border-slate-600 text-slate-100`}><FileText className="w-4 h-4" />{t('Télécharger PDF', 'Download PDF')}</button>
          <button type="button" onClick={() => void downloadInvoiceExcel(open, lang === 'en' ? 'en' : 'fr')} className={`${btn} border-slate-600 text-slate-100`}><Download className="w-4 h-4" />Excel</button>
          {open.status === 'draft' && <>
            <button type="button" disabled={busy} onClick={() => { setError(''); setEditor(editDraft(open)); }} className={`${btn} border-slate-600 text-slate-100`}><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>
            <button type="button" disabled={busy} onClick={() => issue(open)} className={`${btn} bg-emerald-600 border-emerald-500 text-white`}><Send className="w-4 h-4" />{t('Émettre', 'Issue')}</button>
            <button type="button" disabled={busy} onClick={() => remove(open)} className={`${btn} border-rose-700 text-rose-200`}><Trash2 className="w-4 h-4" />{t('Supprimer', 'Delete')}</button>
          </>}
          {open.status === 'issued' && open.type !== 'credit_note' && openInfo.balance > 0 && <button type="button" disabled={busy} onClick={() => { setError(''); setPay({ id: open.id, amount: String(openInfo.balance), date: today, method: '', note: '' }); }} className={`${btn} bg-emerald-600 border-emerald-500 text-white`}><Wallet className="w-4 h-4" />{t('Enregistrer un paiement', 'Record a payment')}</button>}
          {canCancel(open, openInfo) && <button type="button" disabled={busy} onClick={() => cancel(open)} className={`${btn} border-rose-700 text-rose-200`}><Ban className="w-4 h-4" />{t('Annuler (avoir)', 'Cancel (credit note)')}</button>}
          {openInfo.state === 'paid' && <span className="inline-flex items-center gap-1 text-emerald-300 text-sm"><CheckCircle2 className="w-4 h-4" />{t('Payée en totalité', 'Fully paid')}</span>}
        </div>
        {open.status === 'issued' && open.type !== 'credit_note' && openInfo.paid > 0 && <p className="text-[11px] text-slate-400">{t('Cette facture a reçu de l\'argent : pour l\'annuler, supprime d\'abord le paiement dans Finances.', 'This invoice has received money: to cancel it, first delete the payment in Finances.')}</p>}
      </>, () => setOpenId(null))}

      {editor && modal(<>
        <div className="flex items-center justify-between"><h2 className="text-base font-bold text-white">{editor.id ? t('Modifier le brouillon', 'Edit draft') : t('Nouvelle facture', 'New invoice')}</h2>{closeBtn(() => setEditor(null))}</div>
        <label className="block text-xs text-slate-400">{t('Client', 'Client')}
          <select value={editor.client_id} onChange={e => patch({ client_id: e.target.value, picked: [] })} disabled={!!editor.id && editor.lines.length > 0} className={`${field} mt-1`}>
            <option value="">{t('— Choisir —', '— Choose —')}</option>
            {clients.filter(c => c.active !== false || c.id === editor.client_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-slate-400">{t('Date d\'émission', 'Issue date')}<input type="date" value={editor.issue_date} onChange={e => patch({ issue_date: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-slate-400">{t('Échéance', 'Due date')}<input type="date" value={editor.due_date} onChange={e => patch({ due_date: e.target.value, dueTouched: true })} className={`${field} mt-1`} /></label>
        </div>
        {editor.client_id && <div className="rounded-lg border border-slate-700 p-2 space-y-2">
          <p className="text-xs font-bold text-slate-300">{t('Missions validées à facturer', 'Approved missions to invoice')} ({available.length})</p>
          {available.length === 0 ? <p className="text-xs text-slate-400">{t('Aucune mission validée sans facture pour ce client.', 'No approved mission without an invoice for this client.')}</p> : <>
            <ul className="max-h-40 overflow-y-auto space-y-1">{available.map(m => <li key={m.session_id}><label className="flex items-center gap-2 text-sm text-slate-200 min-h-[36px]"><input type="checkbox" checked={editor.picked.includes(m.session_id)} onChange={e => patch({ picked: e.target.checked ? [...editor.picked, m.session_id] : editor.picked.filter(x => x !== m.session_id) })} />{fmtDate(m.date)} · {m.title || '—'} · {ar(m.price_ar)}</label></li>)}</ul>
            <div className="flex gap-2"><button type="button" onClick={() => patch({ picked: available.map(m => m.session_id) })} className={`${btn} border-slate-600 text-slate-100`}>{t('Tout cocher', 'Select all')}</button><button type="button" disabled={editor.picked.length === 0} onClick={addPicked} className={`${btn} bg-blue-600 border-blue-500 text-white`}>{t('Ajouter à la facture', 'Add to invoice')}</button></div></>}
        </div>}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">{t('Lignes', 'Lines')}</p>
          {editor.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
              <input aria-label={t('Description', 'Description')} placeholder={t('Description', 'Description')} value={l.description} maxLength={200} onChange={e => patch({ lines: editor.lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} className={`${field} col-span-12 sm:col-span-6`} />
              <input aria-label={t('Quantité', 'Quantity')} inputMode="decimal" value={l.qty} onChange={e => patch({ lines: editor.lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} className={`${field} col-span-3 sm:col-span-2`} />
              <input aria-label={t('Prix unitaire', 'Unit price')} inputMode="numeric" value={l.price} onChange={e => patch({ lines: editor.lines.map((x, j) => j === i ? { ...x, price: e.target.value } : x) })} className={`${field} col-span-5 sm:col-span-2`} />
              <span className="col-span-3 sm:col-span-1 text-right text-xs text-slate-300 pb-3">{ar(draftLines[i])}</span>
              <button type="button" aria-label={t('Retirer la ligne', 'Remove line')} onClick={() => patch({ lines: editor.lines.filter((_, j) => j !== i) })} className="col-span-1 min-h-[44px] text-rose-300 cursor-pointer"><Trash2 className="w-4 h-4 mx-auto" /></button>
            </div>
          ))}
          <button type="button" onClick={() => patch({ lines: [...editor.lines, { description: '', qty: '1', price: '' }] })} className={`${btn} border-slate-600 text-slate-100`}><Plus className="w-4 h-4" />{t('Ajouter une ligne libre', 'Add a free line')}</button>
        </div>
        <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}<textarea value={editor.note} maxLength={500} onChange={e => patch({ note: e.target.value })} className={`${field} mt-1 py-2`} rows={2} /></label>
        <div className="text-sm text-slate-200 text-right space-y-0.5">
          <p>{t('Sous-total', 'Subtotal')} : {ar(preview.subtotal_ar)}</p>
          {company.tax.vat_enabled && <p>{t('TVA', 'VAT')} {preview.tax_rate} % : {ar(preview.tax_ar)}</p>}
          <p className="font-bold text-white">{t('Total', 'Total')} : {ar(preview.total_ar)}</p>
        </div>
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={save} className={`${btn} bg-emerald-600 border-emerald-500 text-white flex-1`}>{t('Enregistrer le brouillon', 'Save draft')}</button><button type="button" onClick={() => setEditor(null)} className={`${btn} border-slate-600 text-slate-100`}>{t('Annuler', 'Cancel')}</button></div>
        <p className="text-[11px] text-slate-400">{t('Le brouillon n\'a pas de numéro. Le numéro est attribué quand tu cliques sur « Émettre ».', 'A draft has no number. The number is assigned when you click “Issue”.')}</p>
      </>, () => setEditor(null))}

      {pay && modal(<>
        <div className="flex items-center justify-between"><h2 className="text-base font-bold text-white">{t('Enregistrer un paiement', 'Record a payment')}</h2>{closeBtn(() => setPay(null))}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-slate-400">{t('Montant (Ar)', 'Amount (Ar)')}<input inputMode="numeric" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="block text-xs text-slate-400">{t('Date', 'Date')}<input type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} className={`${field} mt-1`} /></label>
        </div>
        <label className="block text-xs text-slate-400">{t('Mode de paiement (facultatif)', 'Payment method (optional)')}<input value={pay.method} maxLength={40} placeholder={t('espèces, virement, mobile money…', 'cash, transfer, mobile money…')} onChange={e => setPay({ ...pay, method: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}<input value={pay.note} maxLength={300} onChange={e => setPay({ ...pay, note: e.target.value })} className={`${field} mt-1`} /></label>
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
        <p className="text-[11px] text-slate-400">{t('Le paiement ne peut pas dépasser ce qui reste à payer. Un numéro de reçu est attribué et la ligne apparaît dans Finances.', 'A payment cannot exceed what is left to pay. A receipt number is assigned and the line appears in Finances.')}</p>
        <button type="button" disabled={busy} onClick={submitPay} className={`${btn} bg-emerald-600 border-emerald-500 text-white w-full`}>{t('Enregistrer', 'Save')}</button>
      </>, () => setPay(null))}
    </div>
  );
};
