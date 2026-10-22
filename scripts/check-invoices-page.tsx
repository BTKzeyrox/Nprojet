// Essai de l'écran Facturation côté site (store démo, sans réseau). Lancer : npm run check:invoices-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { InvoicesView } = await import('../src/views/admin/InvoicesView');
const { invoiceInfo } = await import('../src/utils/invoices');

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(h);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><InvoicesView /></AppProvider>).replace(/<!-- -->/g, ''); };

db.enterDemo('admin');
const client = db.getClients()[0];
ok(!!client, 'démo : au moins un client');
ok(db.getInvoices().length === 0, 'démo : aucune facture au départ');
ok(view('fr').includes('Aucune facture') && view('en').includes('No invoice yet'), 'liste vide : message clair FR et EN');

const draft = (o: object = {}) => ({ client_id: client.id, issue_date: '2026-10-20', due_date: '2026-11-19', lines: [{ description: 'Saisie de fiches', qty: 3, unit_price: 5000 }], ...o });
ok(db.saveInvoiceDraft(draft({ client_id: '' })).error === 'client', 'sans client : refusé');
ok(db.saveInvoiceDraft(draft({ lines: [] })).error === 'lines', '0 ligne : refusé');
ok(db.saveInvoiceDraft(draft({ lines: [{ description: 'x', qty: 0, unit_price: 5 }] })).error === 'qty', 'quantité 0 : refusée');
ok(db.saveInvoiceDraft(draft({ lines: [{ description: 'x', qty: 1, unit_price: 0 }] })).error === 'total', 'total à 0 Ar : refusé');
ok(db.saveInvoiceDraft(draft({ client_id: 'inconnu' })).error === 'no_client', 'client inconnu : refusé');
const a = db.saveInvoiceDraft(draft({ lines: [{ description: 'Saisie de fiches', qty: 3, unit_price: 5000, refs: ['s1'] }] }));
ok(a.success && !!a.id, 'brouillon créé');
const inv = () => db.getInvoices().find(i => i.id === a.id)!;
ok(inv().status === 'draft' && !inv().number && inv().total_ar === 15000, 'brouillon : sans numéro, total recalculé 15 000 Ar');
ok(db.saveInvoiceDraft(draft({ lines: [{ description: 'autre', qty: 1, unit_price: 100, refs: ['s1'] }] })).error === 'ref_used', 'même mission dans deux factures : refusé');
ok(db.saveInvoiceDraft({ ...draft({ lines: [{ description: 'Saisie', qty: 2, unit_price: 5000, refs: ['s1'] }] }), id: a.id }).success && inv().total_ar === 10000, 'modifier son propre brouillon : permis (garde sa mission)');
const frHtml = view('fr');
ok(frHtml.includes('Brouillon') && !bad(frHtml), 'liste : le brouillon apparaît, pas de NaN / undefined');

const r1 = await db.issueInvoice(a.id!);
ok(r1.ok && inv().status === 'issued' && /^FA-\d{4}-0001$/.test(inv().number || ''), 'émission : numéro FA-AAAA-0001 attribué');
ok(db.saveInvoiceDraft({ ...draft(), id: a.id }).error === 'not_draft', 'facture émise : plus modifiable');
ok(db.deleteInvoiceDraft(a.id!).error === 'not_draft', 'facture émise : jamais supprimée');
ok(!(await db.issueInvoice(a.id!)).ok, 'émettre deux fois : refusé (un seul numéro)');

const p1 = await db.payInvoice(a.id!, { amount: 4000, date: '2026-10-21', method: 'virement' });
ok(p1.ok && invoiceInfo(inv(), db.getCash(), '2026-10-22').paid === 4000 && invoiceInfo(inv(), db.getCash(), '2026-10-22').state === 'partial', 'paiement partiel : état « partiellement payée »');
ok(db.getCash().some(c => c.invoice_id === a.id && !!c.receipt_no && c.category === 'Paiement client'), 'le paiement crée une ligne Finances avec un numéro de reçu');
const tooMuch = await db.payInvoice(a.id!, { amount: 7000, date: '2026-10-21' });
ok(!tooMuch.ok, 'paiement au-dessus du reste (6 000 Ar) : refusé');
ok(!(await db.cancelInvoice(a.id!)).ok, 'annuler une facture déjà payée en partie : refusé');
ok((await db.payInvoice(a.id!, { amount: 6000, date: '2026-10-22' })).ok && invoiceInfo(inv(), db.getCash(), '2026-10-22').state === 'paid', 'solde payé : état « payée »');
ok(!(await db.payInvoice(a.id!, { amount: 1, date: '2026-10-22' })).ok, 'payer une facture soldée : refusé');

const b = db.saveInvoiceDraft(draft({ lines: [{ description: 'À annuler', qty: 1, unit_price: 20000 }] }));
await db.issueInvoice(b.id!);
const nb = db.getInvoices().find(i => i.id === b.id)!;
ok(/-0002$/.test(nb.number || ''), 'deuxième facture : numéro suivant (0002)');
ok((await db.cancelInvoice(b.id!)).ok, 'annulation sans paiement : permise');
const credit = db.getInvoices().find(i => i.type === 'credit_note');
ok(!!credit && /^AV-/.test(credit.number || '') && credit.credit_of === b.id, 'un avoir AV-… est créé et cite la facture');
ok(db.getInvoices().find(i => i.id === b.id)!.status === 'cancelled', 'la facture annulée est marquée annulée');
ok(db.saveInvoiceDraft(draft({ lines: [{ description: 'Refaire', qty: 1, unit_price: 5, refs: ['s9'] }] })).success, 'après annulation, on peut refaire une facture');

const html = view('fr'), en = view('en');
ok(!bad(html) && !bad(en), 'page avec factures : pas de NaN / undefined / null (FR et EN)');
ok(html.includes('Payée') && html.includes('Annulée') && html.includes('Avoir') && en.includes('Paid') && en.includes('Credit note'), 'états affichés en FR et en EN');
ok(/Facturé/.test(html) && /À encaisser/.test(html), 'totaux « facturé » et « à encaisser » affichés');

db.enterDemo('employee');
ok(db.getInvoices().length === 0 && db.saveInvoiceDraft(draft()).error === 'admin' && !(await db.issueInvoice('x')).ok, 'employé : aucune facture, aucune action');
ok(calls === 0, 'rien ne part sur internet en démo');
console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);
