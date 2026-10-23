// Essai des devis (M2.9) sans écran réel ni réseau : démo, enregistrement, états, transformation en facture, écran FR et EN.
// Lancer : npm run check:quotes-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { QuotesSection } = await import('../src/views/admin/QuotesSection');
const { InvoicesView } = await import('../src/views/admin/InvoicesView');
const { quoteLabel } = await import('../src/utils/quotes');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const clean = (h: string) => h.replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' ');
const today = todayMada();

// ---------- démo ----------
db.enterDemo('admin');
const qs = db.getQuotes();
ok(qs.length >= 5 && ['draft', 'sent', 'accepted', 'refused'].every(s => qs.some(q => q.status === s)), 'démo : devis dans les 4 états');
ok(qs.some(q => quoteLabel(q, today) === 'expired') && qs.some(q => quoteLabel(q, today) === 'invoiced'), 'démo : un devis expiré et un devis facturé');
ok(new Set(qs.map(q => q.ref)).size === qs.length && qs.every(q => /^DV-\d{4}$/.test(q.ref)), 'démo : références DV-0001… uniques');
ok(qs.every(q => db.getClients().some(c => c.id === q.client_id) && q.lines.length > 0 && q.total_ar === q.lines.reduce((t, l) => t + l.total_ar, 0) + q.tax_ar), 'démo : chaque devis cite un vrai client, total = lignes + TVA');
ok(qs.filter(q => q.invoice_id).every(q => db.getInvoices().some(i => i.id === q.invoice_id)), 'démo : le devis facturé cite une vraie facture');

// ---------- enregistrement et états ----------
(db as any).quotes = [];
const cl = db.getClients()[0];
const L = (d: string, q: string, p: string) => ({ description: d, qty: q, unit_price: p });
const a = db.saveQuote({ client_id: cl.id, date: '2026-10-20', valid_until: '2026-11-20', lines: [L('Saisie', '10', '1000'), L('Mise en forme', '1', '5 000')], note: 'n' });
ok(a.success && db.getQuotes()[0].ref === 'DV-0001' && db.getQuotes()[0].status === 'draft' && db.getQuotes()[0].total_ar === 15000, 'devis créé : DV-0001, brouillon, total calculé 15 000');
ok(db.saveQuote({ client_id: cl.id, date: '2026-10-21', lines: [L('B', '1', '10')] }).success && db.getQuotes().map(q => q.ref).sort().join() === 'DV-0001,DV-0002', 'numéro suivant : DV-0002');
const e = (d: any) => db.saveQuote(d).error;
ok(e({ client_id: '', date: '2026-10-20', lines: [L('a', '1', '1')] }) === 'client' && e({ client_id: 'ghost', date: '2026-10-20', lines: [L('a', '1', '1')] }) === 'no_client' && e({ client_id: cl.id, date: 'nope', lines: [L('a', '1', '1')] }) === 'date' && e({ client_id: cl.id, date: '2026-10-20', valid_until: '2026-10-01', lines: [L('a', '1', '1')] }) === 'valid_before', 'client absent ou inconnu, date fausse, validité avant le devis : refusés');
ok(e({ client_id: cl.id, date: '2026-10-20', lines: [] }) === 'lines' && e({ client_id: cl.id, date: '2026-10-20', lines: [L('', '1', '1')] }) === 'description' && e({ client_id: cl.id, date: '2026-10-20', lines: [L('a', '0', '1')] }) === 'qty' && e({ client_id: cl.id, date: '2026-10-20', lines: [L('a', '1', '-1')] }) === 'price' && e({ client_id: cl.id, date: '2026-10-20', lines: [L('a', '1', '0')] }) === 'total', 'lignes fausses : refusées');
ok(db.getQuotes().length === 2, 'rien n\'a été ajouté par les refus');
const id = a.id!;
ok(db.saveQuote({ id, client_id: cl.id, date: '2026-10-20', valid_until: '', lines: [L('Saisie', '10', '1000')] }).success && db.getQuotes().find(q => q.id === id)!.valid_until === undefined && db.getQuotes().find(q => q.id === id)!.total_ar === 10000, 'brouillon modifié : une validité vidée disparaît, total recalculé');
ok(db.setQuoteStatus(id, 'accepted').error === 'status' && db.setQuoteStatus(id, 'refused').error === 'status', 'un brouillon ne devient pas accepté d\'emblée');
ok(db.quoteToInvoice(id).error === 'status', 'un brouillon ne se transforme pas en facture');
ok(db.setQuoteStatus(id, 'sent').success && db.saveQuote({ id, client_id: cl.id, date: '2026-10-20', lines: [L('Autre', '1', '1')] }).error === 'status', 'envoyé : plus modifiable');
ok(db.deleteQuote(id).error === 'status', 'envoyé : ne se supprime pas');
ok(db.setQuoteStatus(id, 'draft').error === 'status' && db.quoteToInvoice(id).error === 'status', 'envoyé : pas de retour au brouillon, pas encore de facture');
ok(db.setQuoteStatus(id, 'accepted').success && db.setQuoteStatus(id, 'refused').error === 'status', 'accepté : définitif');
const invBefore = db.getInvoices().length;
const t1 = db.quoteToInvoice(id);
const inv = db.getInvoices().find(i => i.id === t1.invoice_id)!;
ok(t1.success && db.getInvoices().length === invBefore + 1 && inv.status === 'draft' && inv.type === 'invoice' && inv.client_id === cl.id && inv.total_ar === 10000 && inv.lines[0].description === 'Saisie' && inv.issue_date === today && (inv.note || '').includes('DV-0001'), 'transformé : UNE facture brouillon, mêmes lignes et total, émise aujourd\'hui, note avec le numéro');
ok(db.getQuotes().find(q => q.id === id)!.invoice_id === inv.id && quoteLabel(db.getQuotes().find(q => q.id === id)!, today) === 'invoiced', 'le devis garde le lien : état « Facturé »');
ok(db.quoteToInvoice(id).error === 'invoiced' && db.getInvoices().length === invBefore + 1, 'deuxième transformation refusée, aucune facture en double');
ok(db.deleteQuote(id).error === 'status', 'un devis facturé ne se supprime pas');
ok(db.deleteInvoiceDraft(inv.id).success && db.getQuotes().find(q => q.id === id)!.invoice_id === undefined, 'facture brouillon supprimée : le devis peut être transformé de nouveau');
ok(db.quoteToInvoice(id).success, 'transformation de nouveau possible');
// refusé et suppression
const b = db.getQuotes().find(q => q.ref === 'DV-0002')!;
ok(db.setQuoteStatus(b.id, 'sent').success && db.setQuoteStatus(b.id, 'refused').success && db.deleteQuote(b.id).success && !db.getQuotes().some(q => q.id === b.id), 'refusé : se supprime');
const c = db.saveQuote({ client_id: cl.id, date: '2026-10-22', lines: [L('z', '1', '5')] });
ok(db.deleteQuote(c.id!).success && db.deleteQuote(c.id!).error === 'missing', 'brouillon : se supprime');
ok(db.saveQuote({ client_id: cl.id, date: '2026-10-22', lines: [L('z', '1', '5')] }).success && db.getQuotes().some(q => q.ref === 'DV-0002'), 'un numéro supprimé libère le plus grand : jamais deux fois le même');

// ---------- opérateur ----------
db.enterDemo('employee');
ok(db.getQuotes().length === 0, 'démo opérateur : aucun devis');
ok(db.saveQuote({ client_id: 'x', date: '2026-10-20', lines: [] }).error === 'admin' && db.setQuoteStatus('x', 'sent').error === 'admin' && db.deleteQuote('x').error === 'admin' && db.quoteToInvoice('x').error === 'admin', 'opérateur : devis refusés');

// ---------- écran ----------
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  mem.delta_lang = lang;
  const html = clean(renderToString(<AppProvider><QuotesSection ver={0} onOpenInvoice={() => {}} /></AppProvider>));
  ok(!bad(html), `${lang} : aucun NaN, « undefined » ni « null » affichés`);
  ok(html.includes(lang === 'en' ? 'New quote' : 'Nouveau devis') && html.includes('DV-0001') && html.includes('DV-0005'), `${lang} : bouton et devis de la démo`);
  ok(html.includes(lang === 'en' ? 'Expired' : 'Expiré') && html.includes(lang === 'en' ? 'Invoiced' : 'Facturé') && html.includes(lang === 'en' ? 'Accepted' : 'Accepté'), `${lang} : états Expiré, Facturé, Accepté`);
  ok(html.includes('min-h-[44px]'), `${lang} : cibles tactiles de 44 px`);
  const page = clean(renderToString(<AppProvider><InvoicesView /></AppProvider>));
  ok(page.includes(lang === 'en' ? 'Quotes' : 'Devis') && !bad(page), `${lang} : l'onglet Devis apparaît dans Facturation (devis activés)`);
}
(db as any).quotes = [];
mem.delta_lang = 'fr';
ok(clean(renderToString(<AppProvider><QuotesSection ver={0} onOpenInvoice={() => {}} /></AppProvider>)).includes('Aucun devis pour l&#x27;instant'), 'liste vide : message clair');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
