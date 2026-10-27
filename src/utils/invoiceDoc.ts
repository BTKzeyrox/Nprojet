// Facture, avoir et reçu imprimables (A4), même méthode que le bulletin de paie : page claire isolée, tout échappé, « Imprimer » puis « Enregistrer en PDF ».
// Le serveur a déjà posé le numéro, les copies du client et de l'entreprise et les totaux ; ici on met en page et on vérifie que le détail retombe sur le total.
import type { CashEntry, CompanySettings, Invoice, InvoiceParty } from '../types';
import { PRINT_FONT, PRINT_FONT_FACE, PRINT_MARGIN_MM, PRINT_PT } from './printFormat';

export type DocLang = 'fr' | 'en';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const safeLogo = (u: string) => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '');
const loc = (lang: DocLang) => (lang === 'en' ? 'en-GB' : 'fr-FR');
const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : '');

export interface DocContext { lang?: DocLang; company: CompanySettings; invoice?: Invoice; creditOfNumber?: string; paid?: number }

/** Le détail retombe-t-il sur le total ? (sous-total = somme des lignes, total = sous-total + TVA, chaque ligne = quantité × prix) */
export function invoiceConsistent(inv: Pick<Invoice, 'lines' | 'subtotal_ar' | 'tax_ar' | 'total_ar'>): boolean {
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  if (!lines.every(l => Math.round(num(l.qty) * num(l.unit_price_ar)) === num(l.total_ar))) return false;
  const sub = lines.reduce((t, l) => t + num(l.total_ar), 0);
  return sub === num(inv.subtotal_ar) && sub + num(inv.tax_ar) === num(inv.total_ar);
}

const L = {
  fr: {
    invoice: 'Facture', credit: 'Avoir', receipt: 'Reçu de paiement', draft: 'BROUILLON : sans numéro, sans valeur de facture', cancelled: 'FACTURE ANNULÉE (voir l\'avoir)', no: 'N°', issued: 'Date d\'émission', due: 'Échéance', client: 'Client',
    desc: 'Description', qty: 'Qté', price: 'Prix unitaire', total: 'Total', subtotal: 'Sous-total', vat: 'TVA', totalDue: 'TOTAL', paid: 'Déjà payé', left: 'Reste à payer', cancels: 'Annule la facture', tax: 'N° fiscal', reg: 'N° d\'immatriculation',
    terms: 'Conditions', payDays: 'Paiement à', days: 'jours', methods: 'Modes de paiement', mismatch: 'ÉCART DE CALCUL : le total imprimé ne correspond pas au détail. Ne pas utiliser ce document avant vérification.',
    amount: 'Montant reçu', date: 'Date du paiement', method: 'Mode de paiement', forInv: 'Pour la facture', invTotal: 'Total de la facture', paidTotal: 'Total payé à ce jour', receivedFrom: 'Reçu de', sig: 'Signature', lang: 'fr', file: 'Facture', fileR: 'Reçu', fileC: 'Avoir', note: 'Note',
  },
  en: {
    invoice: 'Invoice', credit: 'Credit note', receipt: 'Payment receipt', draft: 'DRAFT: no number, not a valid invoice', cancelled: 'INVOICE CANCELLED (see credit note)', no: 'No.', issued: 'Issue date', due: 'Due date', client: 'Client',
    desc: 'Description', qty: 'Qty', price: 'Unit price', total: 'Total', subtotal: 'Subtotal', vat: 'VAT', totalDue: 'TOTAL', paid: 'Already paid', left: 'Left to pay', cancels: 'Cancels invoice', tax: 'Tax ID', reg: 'Registration no.',
    terms: 'Terms', payDays: 'Payment within', days: 'days', methods: 'Payment methods', mismatch: 'CALCULATION MISMATCH: the printed total does not match the detail. Do not use this document before checking.',
    amount: 'Amount received', date: 'Payment date', method: 'Payment method', forInv: 'For invoice', invTotal: 'Invoice total', paidTotal: 'Total paid to date', receivedFrom: 'Received from', sig: 'Signature', lang: 'en', file: 'Invoice', fileR: 'Receipt', fileC: 'Credit note', note: 'Note',
  },
} as const;

const money = (n: number, cur: string, lang: DocLang) => `${Math.round(num(n)).toLocaleString(loc(lang))} ${cur || 'Ar'}`;

const STYLE = `<style>${PRINT_FONT_FACE}
@page{size:A4;margin:${PRINT_MARGIN_MM}mm}
body{font-family:${PRINT_FONT};color:#111;margin:0;font-size:${PRINT_PT}pt;line-height:1.4}
.head{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
.head img{max-height:56px;max-width:140px}.head .co b{font-size:15px}.head .co div{color:#333}
h1{font-size:20px;margin:0 0 8px;letter-spacing:.5px;text-transform:uppercase}h2{font-size:13px;margin:14px 0 6px}
.banner{border:2px dashed #b45309;color:#92400e;background:#fffbeb;padding:6px 8px;margin:0 0 10px;font-weight:bold}
.bad{border:2px solid #b91c1c;color:#7f1d1d;background:#fef2f2;padding:6px 8px;margin:10px 0;font-weight:bold}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-bottom:8px}.meta span{color:#555}
.party{border:1px solid #aaa;padding:6px 8px;margin:6px 0 10px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee}td.r,th.r{text-align:right;white-space:nowrap}tr{break-inside:avoid}
.tot{width:55%;margin-left:45%;margin-top:8px}.tot td{border-color:#ccc}.tot .big td{font-size:15px;font-weight:bold;background:#e8f5e9;border:2px solid #111}
.note{font-size:11px;color:#555;margin-top:8px;white-space:pre-wrap}.sig{margin-top:34px;width:45%;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#333;min-height:46px}
</style>`;

function header(c: CompanySettings, who: InvoiceParty | undefined, t: typeof L['fr'] | typeof L['en']): string {
  const id = c.identity, lg = c.legal;
  const name = who?.name || id.name;
  const lines = [name, who?.address ?? id.address, [who?.phone ?? id.phone, who?.email ?? id.email].filter(Boolean).join(' · '), (who?.tax_id ?? lg.tax_id) ? `${t.tax} : ${who?.tax_id ?? lg.tax_id}` : '', (who?.register_id ?? lg.register_id) ? `${t.reg} : ${who?.register_id ?? lg.register_id}` : ''].filter(Boolean);
  const logo = safeLogo(id.logo_url);
  return `<div class="head">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div class="co">${lines.map((h, i) => (i === 0 ? `<b>${esc(h)}</b>` : `<div>${esc(h)}</div>`)).join('')}</div></div>`;
}

export function invoiceHtml(inv: Invoice, ctx: DocContext): string {
  const lang: DocLang = ctx.lang === 'en' ? 'en' : 'fr';
  const t = L[lang];
  const c = ctx.company;
  const cur = c.identity.currency || 'Ar';
  const m = (n: number) => esc(money(n, cur, lang));
  const isCredit = inv.type === 'credit_note';
  const title = isCredit ? t.credit : t.invoice;
  const cl = inv.client || { name: '' };
  const clientLines = [cl.name, cl.address, [cl.phone, cl.email].filter(Boolean).join(' · '), cl.tax_id ? `${t.tax} : ${cl.tax_id}` : ''].filter(Boolean);
  const paid = num(ctx.paid);
  const consistent = invoiceConsistent(inv);
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  const vatText = c.tax.vat_enabled ? '' : String(c.tax.vat_exempt_text || '');
  const terms = [c.billing.payment_days > 0 ? `${t.payDays} ${c.billing.payment_days} ${t.days}.` : '', c.billing.late_penalty_text, c.billing.payment_methods_text ? `${t.methods} : ${c.billing.payment_methods_text}` : '', c.texts.customer_terms].filter(Boolean);
  const notes = [...(c.legal.notes || []).filter(Boolean), c.billing.invoice_footer].filter(Boolean);
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><title>${esc(title)} ${esc(inv.number || '')}</title>${STYLE}</head><body>
${header(c, inv.issuer, t)}
<h1>${esc(title)} ${inv.number ? esc(inv.number) : ''}</h1>
${inv.status === 'draft' && !isCredit ? `<div class="banner">${esc(t.draft)}</div>` : ''}${inv.status === 'cancelled' ? `<div class="banner">${esc(t.cancelled)}</div>` : ''}
<div class="meta"><div><span>${esc(t.issued)} :</span> <b>${esc(day(inv.issue_date))}</b></div>${isCredit ? `<div><span>${esc(t.cancels)} :</span> <b>${esc(ctx.creditOfNumber || '')}</b></div>` : `<div><span>${esc(t.due)} :</span> <b>${esc(day(inv.due_date))}</b></div>`}</div>
<div class="party"><span style="color:#555">${esc(t.client)}</span>${clientLines.map((x, i) => (i === 0 ? `<div><b>${esc(x)}</b></div>` : `<div>${esc(x)}</div>`)).join('')}</div>
<table><tr><th>${esc(t.desc)}</th><th class="r">${esc(t.qty)}</th><th class="r">${esc(t.price)}</th><th class="r">${esc(t.total)}</th></tr>
${lines.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${esc(num(l.qty).toLocaleString(loc(lang)))}</td><td class="r">${m(l.unit_price_ar)}</td><td class="r">${m(l.total_ar)}</td></tr>`).join('')}</table>
<table class="tot"><tr><td>${esc(t.subtotal)}</td><td class="r">${m(inv.subtotal_ar)}</td></tr>
${num(inv.tax_rate) > 0 ? `<tr><td>${esc(t.vat)} ${esc(inv.tax_rate)} %</td><td class="r">${m(inv.tax_ar)}</td></tr>` : ''}
<tr class="big"><td>${esc(t.totalDue)}</td><td class="r">${m(inv.total_ar)}</td></tr>
${!isCredit && inv.status === 'issued' ? `<tr><td>${esc(t.paid)}</td><td class="r">${m(paid)}</td></tr><tr><td><b>${esc(t.left)}</b></td><td class="r"><b>${m(Math.max(0, num(inv.total_ar) - paid))}</b></td></tr>` : ''}</table>
${consistent ? '' : `<div class="bad">${esc(t.mismatch)}</div>`}
${vatText ? `<div class="note">${esc(vatText)}</div>` : ''}
${inv.note ? `<div class="note">${esc(t.note)} : ${esc(inv.note)}</div>` : ''}
${!isCredit && terms.length ? `<h2>${esc(t.terms)}</h2><div class="note" style="margin-top:0">${terms.map(esc).join('\n')}</div>` : ''}
${notes.length ? `<div class="note">${notes.map(esc).join('\n')}</div>` : ''}
</body></html>`;
}

/** Reçu d'un paiement. Le « total payé à ce jour » compte les paiements jusqu'à celui-ci inclus (dans l'ordre date, création). */
export function receiptHtml(pay: CashEntry, inv: Invoice, allPayments: CashEntry[], ctx: DocContext): string {
  const lang: DocLang = ctx.lang === 'en' ? 'en' : 'fr';
  const t = L[lang];
  const c = ctx.company;
  const m = (n: number) => esc(money(n, c.identity.currency || 'Ar', lang));
  const key = (e: CashEntry) => `${e.date}|${e.created_at || ''}|${e.id}`;
  const upTo = allPayments.filter(e => e.invoice_id === inv.id && e.kind === 'in' && key(e) <= key(pay)).reduce((s, e) => s + num(e.amount_ar), 0);
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><title>${esc(t.fileR)} ${esc(pay.receipt_no || '')}</title>${STYLE}</head><body>
${header(c, inv.issuer, t)}
<h1>${esc(t.receipt)} ${pay.receipt_no ? esc(pay.receipt_no) : ''}</h1>
<div class="meta"><div><span>${esc(t.date)} :</span> <b>${esc(day(pay.date))}</b></div><div><span>${esc(t.receivedFrom)} :</span> <b>${esc(inv.client?.name || pay.client_name || '')}</b></div>
<div><span>${esc(t.method)} :</span> ${esc(pay.payment_method || '—')}</div><div><span>${esc(t.forInv)} :</span> <b>${esc(inv.number || '')}</b></div></div>
<table class="tot" style="margin-left:0;width:100%"><tr class="big"><td>${esc(t.amount)}</td><td class="r">${m(pay.amount_ar)}</td></tr>
<tr><td>${esc(t.invTotal)}</td><td class="r">${m(inv.total_ar)}</td></tr><tr><td>${esc(t.paidTotal)}</td><td class="r">${m(upTo)}</td></tr>
<tr><td><b>${esc(t.left)}</b></td><td class="r"><b>${m(Math.max(0, num(inv.total_ar) - upTo))}</b></td></tr></table>
${pay.note ? `<div class="note">${esc(t.note)} : ${esc(pay.note)}</div>` : ''}
<div class="sig">${esc(t.sig)}</div>
</body></html>`;
}

// Impression par un cadre caché : fonctionne aussi sur téléphone (pas de fenêtre à ouvrir)
export const printDoc = (html: string) => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentWindow!.document;
  d.open(); d.write(html); d.close();
  setTimeout(() => { try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { /* ignore */ } setTimeout(() => f.remove(), 2000); }, 300);
};
