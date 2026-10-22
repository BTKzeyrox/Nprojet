// Contrôle de la facture, de l'avoir et du reçu imprimables (M2.6). Lancer : npm run check:invoice-doc
import { invoiceConsistent, invoiceHtml, receiptHtml } from '../src/utils/invoiceDoc';
import { readCompany } from '../src/utils/companyRules';
import type { CashEntry, Invoice } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(h);

const co = readCompany({ identity: { name: 'Ma Société', address: '12 rue A', phone: '0340000000', email: 'a@b.mg', logo_url: 'https://x.y/logo.png', currency: 'Ar' }, legal: { tax_id: 'NIF123', register_id: 'RC9', notes: ['Mention légale 1'] }, tax: { vat_enabled: true, vat_rate: 20, vat_exempt_text: '' }, billing: { invoice_prefix: 'FA-', receipt_prefix: 'RC-', payment_days: 30, late_penalty_text: 'Pénalité de retard 3 %', payment_methods_text: 'Virement', invoice_footer: 'Merci de votre confiance' }, texts: { internal_rules: '', customer_terms: 'Conditions générales' } });
const inv: Invoice = { id: 'i1', type: 'invoice', number: 'FA-2026-0001', status: 'issued', client_id: 'c1', client: { name: 'Client <b>X</b> & Fils', address: '1 av. B', email: 'c@d.mg' }, issuer: { name: 'Ma Société', address: '12 rue A', tax_id: 'NIF123' }, issue_date: '2026-10-20', due_date: '2026-11-19', lines: [{ id: 'l1', description: 'Saisie <script>alert(1)</script>', qty: 3, unit_price_ar: 5000, total_ar: 15000 }, { id: 'l2', description: 'Contrôle', qty: 2, unit_price_ar: 10000, total_ar: 20000 }], subtotal_ar: 35000, tax_rate: 20, tax_ar: 7000, total_ar: 42000, note: 'Note <i>x</i>' };

ok(invoiceConsistent(inv), 'détail cohérent : somme des lignes, TVA, total');
ok(!invoiceConsistent({ ...inv, total_ar: 42001 }) && !invoiceConsistent({ ...inv, subtotal_ar: 34999 }) && !invoiceConsistent({ ...inv, lines: [{ ...inv.lines[0], total_ar: 14999 }, inv.lines[1]] }), 'écart de total, de sous-total ou de ligne : détecté');

for (const lang of ['fr', 'en'] as const) {
  const h = invoiceHtml(inv, { lang, company: co, paid: 10000 });
  ok(!bad(h), `${lang} : pas de NaN / undefined / null`);
  ok(h.includes('FA-2026-0001') && h.includes('42') && h.includes(lang === 'en' ? 'Invoice' : 'Facture'), `${lang} : numéro, total et titre`);
  ok(!h.includes('<script>') && !h.includes('<b>X</b>') && !h.includes('<i>x</i>') && h.includes('&lt;script&gt;'), `${lang} : tout est échappé (description, client, note)`);
  ok(h.includes('NIF123') && h.includes('Mention légale 1') && h.includes('Merci de votre confiance') && h.includes('Pénalité de retard 3 %') && h.includes('Conditions générales'), `${lang} : mentions de l'entreprise, pied de page, pénalité, conditions`);
  ok(/TVA|VAT/.test(h) && h.includes('20 %'), `${lang} : TVA affichée`);
  ok(h.includes(lang === 'en' ? 'Left to pay' : 'Reste à payer') && !h.includes('ÉCART') && !h.includes('MISMATCH'), `${lang} : reste à payer, pas d'avertissement`);
}
ok(invoiceHtml(inv, { company: co, paid: 0 }).includes('<img src="https://x.y/logo.png"'), 'logo https affiché');
ok(!invoiceHtml(inv, { company: readCompany({ ...co, identity: { ...co.identity, logo_url: 'javascript:alert(1)' } }), paid: 0 }).includes('javascript:'), 'logo non https : jamais affiché');
ok(invoiceHtml({ ...inv, total_ar: 1 }, { company: co }).includes('ÉCART DE CALCUL'), 'total faux : avertissement rouge');
const draft = invoiceHtml({ ...inv, number: undefined, status: 'draft' }, { company: co });
ok(draft.includes('BROUILLON') && !draft.includes('Reste à payer'), 'brouillon : bandeau « sans valeur de facture », pas de reste à payer');
ok(invoiceHtml({ ...inv, status: 'cancelled' }, { company: co }).includes('FACTURE ANNULÉE'), 'facture annulée : bandeau');
const credit = invoiceHtml({ ...inv, type: 'credit_note', number: 'AV-2026-0001', credit_of: 'i1' }, { company: co, creditOfNumber: 'FA-2026-0001' });
ok(credit.includes('Avoir') && credit.includes('Annule la facture') && credit.includes('FA-2026-0001') && !credit.includes('Reste à payer') && !credit.includes('Conditions générales'), 'avoir : titre, facture annulée citée, pas de reste à payer ni de conditions');
const noVat = invoiceHtml({ ...inv, tax_rate: 0, tax_ar: 0, total_ar: 35000 }, { company: readCompany({ ...co, tax: { vat_enabled: false, vat_rate: 0, vat_exempt_text: 'TVA non applicable' } }) });
ok(noVat.includes('TVA non applicable') && !/TVA 0/.test(noVat), 'sans TVA : mention d\'exonération, pas de ligne TVA');
ok(!bad(invoiceHtml({ ...inv, client: { name: '' }, issuer: undefined, note: undefined, lines: [] } as any, { company: readCompany(null) })), 'données vides : jamais undefined');

const p = (id: string, date: string, amount: number, no: string): CashEntry => ({ id, kind: 'in', category: 'Paiement client', amount_ar: amount, date, note: '', invoice_id: 'i1', receipt_no: no, payment_method: 'virement', created_at: `${date}T10:00:00Z`, client_name: 'Client' });
const pays = [p('p1', '2026-10-21', 10000, 'RC-2026-0001'), p('p2', '2026-10-25', 12000, 'RC-2026-0002'), { ...p('p3', '2026-10-22', 999, 'RC-X'), invoice_id: 'autre' }];
const r1 = receiptHtml(pays[0], inv, pays, { company: co }), r2 = receiptHtml(pays[1], inv, pays, { company: co, lang: 'en' });
ok(r1.includes('RC-2026-0001') && r1.includes('Reçu de paiement') && r1.includes('FA-2026-0001'), 'reçu : numéro, titre, facture');
ok(r1.includes('32') && r1.includes('000') && /Reste à payer/.test(r1), 'reçu 1 : reste 32 000 après 10 000');
const left = (h: string) => { const m = /Left to pay[\s\S]*?<b>([\d\s  ,.]+)/.exec(h) || /Reste à payer[\s\S]*?<b>([\d\s  ,.]+)/.exec(h); return m ? m[1].replace(/\D/g, '') : ''; };
ok(left(r1) === '32000', 'reçu 1 : reste exactement 32 000');
ok(left(r2) === '20000' && r2.includes('Payment receipt'), 'reçu 2 (EN) : cumul 22 000, reste 20 000 ; le paiement d\'une autre facture est ignoré');
ok(!bad(r1) && !bad(r2) && !receiptHtml({ ...pays[0], note: '<img onerror=x>' }, inv, pays, { company: co }).includes('<img onerror'), 'reçu : pas de NaN, note échappée');
console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);
