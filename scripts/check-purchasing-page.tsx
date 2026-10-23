// Essai de la page Achats (sans écran réel, sans réseau) : démo admin et opérateur, fournisseurs, FR et EN. Complété à chaque étape du module 4.
// Lancer : npm run check:purchasing-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { PurchasingPage } = await import('../src/views/admin/PurchasingPage');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en', tab: 'orders' | 'suppliers' = 'suppliers') => { mem.delta_lang = lang; return renderToString(<AppProvider><PurchasingPage initialTab={tab} /></AppProvider>).replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' '); };

// ---------- démo admin : données cohérentes ----------
db.enterDemo('admin');
const sups = db.getSuppliers(), pos = db.getPurchases(), prods = db.getProducts(), moves = db.getStockMoves(), cash = db.getCash();
ok(sups.length === 3 && sups.filter(s => s.active === false).length === 1, 'démo : 3 fournisseurs dont 1 archivé');
ok(pos.length === 5 && ['draft', 'ordered', 'received', 'cancelled'].every(s => pos.some(o => o.status === s)), 'démo : 5 bons dans les 4 états');
ok(pos.every(o => sups.some(s => s.id === o.supplier_id) && o.lines.every(l => prods.some(p => p.id === l.product_id) && l.qty > 0 && l.received_qty >= 0 && l.received_qty <= l.qty)), 'démo : chaque bon cite un vrai fournisseur et de vrais produits, quantités cohérentes');
ok(moves.filter(m => m.supplier_id).every(m => sups.some(s => s.id === m.supplier_id)) && cash.filter(c => c.supplier_id).every(c => sups.some(s => s.id === c.supplier_id)), 'démo : les liens fournisseur des entrées et des dépenses existent');
ok(new Set(pos.map(o => o.ref)).size === pos.length, 'démo : références de bons uniques');
const recvPo = pos.find(o => o.status === 'received')!;
ok(recvPo.lines.every(l => moves.some(m => m.po_id === recvPo.id && m.product_id === l.product_id && m.qty === l.received_qty)), 'démo : le bon reçu correspond à de vraies entrées de stock');

// ---------- ajout, modification, archivage, suppression ----------
(db as any).suppliers = []; (db as any).purchases = [];
const a = db.addSupplier({ name: 'Papeterie Test', contact: '034 00 000 00', lead_days: '3', note: 'ok' });
const b = db.addSupplier({ name: 'Sans délai' });
ok(a.success && b.success && db.getSuppliers().length === 2, 'ajout de 2 fournisseurs');
ok(db.getSuppliers().every(s => s.active === true && s.created_by && s.created_at), 'chaque fiche : active, créateur et date posés');
ok(db.addSupplier({ name: ' papeterie  TEST ' }).error === 'duplicate' && db.addSupplier({ name: 'Papetêrie Test' }).error === 'duplicate', 'même nom (majuscules, espaces, accents) : refusé');
ok(db.addSupplier({ name: '' }).error === 'name' && db.addSupplier({ name: 'X', lead_days: '999' }).error === 'lead' && db.addSupplier({ name: 'X', lead_days: '-1' }).error === 'lead' && db.addSupplier({ name: 'X', lead_days: 'abc' }).error === 'lead', 'nom vide et délais faux : refusés');
ok(db.getSuppliers().length === 2, 'rien n\'a été ajouté par les refus');
ok(db.updateSupplier(a.id!, { name: 'Papeterie Test', contact: 'x', lead_days: '' }).success && db.getSuppliers().find(s => s.id === a.id)!.lead_days === undefined, 'un délai vidé disparaît vraiment');
ok(db.updateSupplier('nope', { name: 'Z' }).error === 'missing' && db.updateSupplier(a.id!, { name: 'Sans délai' }).error === 'duplicate', 'fiche absente ou nom déjà pris : refusé');
ok(db.setSupplierActive(b.id!, false).success && db.getSuppliers().find(s => s.id === b.id)!.active === false && db.setSupplierActive('nope', false).error === 'missing', 'archivage');
// lien avec le stock et les dépenses
const p0 = db.getProducts()[0];
const mv = db.addStockMove({ product_id: p0.id, type: 'in', qty: '2', date: '2026-10-01', unit_cost: '1000', supplier_id: a.id }, { withExpense: true });
ok(mv.success && db.getStockMoves().find(m => m.id === mv.id)!.supplier_id === a.id && db.getCash().find(c => c.id === mv.cashId)!.supplier_id === a.id, 'entrée de stock avec fournisseur : la dépense « Achats » créée le porte aussi');
ok(db.addStockMove({ product_id: p0.id, type: 'in', qty: '1', date: '2026-10-01', supplier_id: 'ghost' }).error === 'supplier', 'fournisseur inconnu sur une entrée : refusé');
ok(!db.getStockMoves().some(m => m.supplier_id === 'ghost'), 'rien n\'a été écrit');
const out = db.addStockMove({ product_id: p0.id, type: 'out', qty: '1', date: '2026-10-01', supplier_id: a.id });
ok(out.success && db.getStockMoves().find(m => m.id === out.id)!.supplier_id === undefined, 'une sortie n\'a jamais de fournisseur');
const c1 = db.addCash({ kind: 'out', category: 'Achats', amount: '5000', date: '2026-10-02', supplier_id: a.id });
const c2 = db.addCash({ kind: 'out', category: 'Loyer', amount: '5000', date: '2026-10-02', supplier_id: a.id });
const c3 = db.addCash({ kind: 'in', category: 'Paiement', amount: '5000', date: '2026-10-02', supplier_id: a.id });
ok(db.getCash().find(c => c.id === c1.id)!.supplier_id === a.id && db.getCash().find(c => c.id === c2.id)!.supplier_id === undefined && db.getCash().find(c => c.id === c3.id)!.supplier_id === undefined, 'fournisseur gardé seulement sur une dépense « Achats »');
ok(db.addCash({ kind: 'out', category: 'Achats', amount: '5', date: '2026-10-02', supplier_id: 'ghost' }).error === 'supplier', 'fournisseur inconnu sur une dépense : refusé');
ok(db.updateCash(c1.id!, { kind: 'out', category: 'Achats', amount: '5000', date: '2026-10-02', supplier_id: '' }).success && db.getCash().find(c => c.id === c1.id)!.supplier_id === undefined, 'fournisseur retiré d\'une dépense : il disparaît vraiment');
ok(db.deleteSupplier(a.id!).error === 'in_use', 'un fournisseur qui a servi ne se supprime pas');
ok(db.deleteSupplier(b.id!).success && db.getSuppliers().length === 1 && db.deleteSupplier(b.id!).error === 'missing', 'un fournisseur inutilisé se supprime');


// ---------- M4.2 : bons de commande ----------
const P1 = db.getProducts()[0], P2 = db.getProducts()[1];
const line = (p: { id: string }, q: string, c: string) => ({ product_id: p.id, qty: q, unit_cost: c });
const d1 = db.addPurchase({ supplier_id: a.id!, date: '2026-10-01', expected_date: '2026-10-05', lines: [line(P1, '10', '1000'), line(P2, '4', '2500')] });
ok(d1.success && db.getPurchases()[0].ref === 'BC-0001' && db.getPurchases()[0].status === 'draft' && db.getPurchases()[0].lines.every(l => l.received_qty === 0), 'bon créé en brouillon : BC-0001, rien reçu');
ok(db.addPurchase({ supplier_id: a.id!, date: '2026-10-02', lines: [line(P1, '1', '')] }).success && db.getPurchases().map(o => o.ref).sort().join() === 'BC-0001,BC-0002', 'références qui avancent : BC-0002');
const bad1 = (d: any) => db.addPurchase(d).error;
ok(bad1({ supplier_id: 'ghost', date: '2026-10-01', lines: [line(P1, '1', '1')] }) === 'supplier' && bad1({ supplier_id: a.id, date: '2026-13-40', lines: [line(P1, '1', '1')] }) === 'date' && bad1({ supplier_id: a.id, date: '2026-10-10', expected_date: '2026-10-01', lines: [line(P1, '1', '1')] }) === 'expected', 'fournisseur inconnu, date fausse, livraison avant la commande : refusés');
ok(bad1({ supplier_id: a.id, date: '2026-10-01', lines: [] }) === 'lines' && bad1({ supplier_id: a.id, date: '2026-10-01', lines: [line(P1, '0', '1')] }) === 'qty' && bad1({ supplier_id: a.id, date: '2026-10-01', lines: [line(P1, '1', '-5')] }) === 'cost' && bad1({ supplier_id: a.id, date: '2026-10-01', lines: [line(P1, '1', '1'), line(P1, '2', '1')] }) === 'duplicate' && bad1({ supplier_id: a.id, date: '2026-10-01', lines: [line({ id: 'ghost' }, '1', '1')] }) === 'product', 'aucune ligne, quantité 0, prix négatif, doublon, produit inconnu : refusés');
ok(db.getPurchases().length === 2, 'rien n\'a été ajouté par les refus');
const id1 = d1.id!;
ok(db.updatePurchase(id1, { supplier_id: a.id!, date: '2026-10-01', expected_date: '', note: 'maj', lines: [line(P1, '10', '1000'), line(P2, '4', '2500')] }).success && db.getPurchases().find(o => o.id === id1)!.expected_date === undefined, 'brouillon modifié : une livraison prévue vidée disparaît');
ok(db.receivePurchase(id1, { [P1.id]: '1' }, { date: '2026-10-06' }).error === 'status', 'on ne reçoit pas un brouillon');
ok(db.setPurchaseStatus(id1, 'ordered').success && db.updatePurchase(id1, { supplier_id: a.id!, date: '2026-10-01', lines: [line(P1, '99', '1')] }).error === 'status', 'commandé : le bon est figé');
ok(db.deletePurchase(id1).error === 'status' && db.setPurchaseStatus(id1, 'ordered').error === 'status', 'un bon commandé ne se supprime pas et ne se recommande pas');
ok(db.deleteProduct(P1.id).error === 'in_use', 'un produit cité par un bon en cours ne se supprime pas');
// garde « le serveur doit connaître le bon commandé » (hors démo)
(db as any).demo = false;
ok(db.receivePurchase(id1, { [P1.id]: '1' }, { date: '2026-10-06' }).error === 'unsynced', 'hors démo : réception refusée tant que le serveur ne connaît pas le bon « commandé »');
(db as any).synced.purchases.set(id1, JSON.stringify({ status: 'ordered' }));
const qBefore = db.getStockMoves().length, cBefore = db.getCash().length;
ok(db.receivePurchase(id1, { [P1.id]: '11' }, { date: '2026-10-06' }).error === 'qty' && db.receivePurchase(id1, {}, { date: '2026-10-06' }).error === 'none' && db.receivePurchase(id1, { ghost: '1' }, { date: '2026-10-06' }).error === 'product' && db.receivePurchase(id1, { [P1.id]: '1' }, { date: '2026-09-01' }).error === 'date' && db.receivePurchase(id1, { [P1.id]: '1' }, { date: 'nope' }).error === 'date', 'trop reçu, rien reçu, produit inconnu, date avant le bon ou fausse : refusés');
ok(db.getStockMoves().length === qBefore && db.getCash().length === cBefore, 'les refus n\'écrivent rien');
(db as any).demo = true;
// réception partielle avec dépense
const r1 = db.receivePurchase(id1, { [P1.id]: '6' }, { date: '2026-10-06', withExpense: true });
const po1 = db.getPurchases().find(o => o.id === id1)!;
ok(r1.success && po1.status === 'ordered' && po1.lines[0].received_qty === 6 && po1.lines[1].received_qty === 0, 'réception partielle : le bon reste « Commandé », 6 reçus');
const m1 = db.getStockMoves().filter(m => m.po_id === id1);
ok(m1.length === 1 && m1[0].type === 'in' && m1[0].qty === 6 && m1[0].unit_cost_ar === 1000 && m1[0].supplier_id === a.id && m1[0].cash_id === r1.cashId, 'une entrée de stock créée : bon, fournisseur, prix et dépense liés');
const k1 = db.getCash().find(c => c.id === r1.cashId)!;
ok(k1.kind === 'out' && k1.category === 'Achats' && k1.amount_ar === 6000 && k1.po_id === id1 && k1.supplier_id === a.id, 'une dépense « Achats » de 6 000 Ar créée, liée au bon et au fournisseur');
ok(db.setPurchaseStatus(id1, 'cancelled').error === 'status', 'un bon déjà en partie reçu ne s\'annule plus');
// réception finale sans dépense
const r2 = db.receivePurchase(id1, { [P1.id]: '4', [P2.id]: '4' }, { date: '2026-10-08', withExpense: false });
const po1b = db.getPurchases().find(o => o.id === id1)!;
ok(r2.success && r2.cashId === undefined && po1b.status === 'received' && po1b.lines.every(l => l.received_qty === l.qty), 'réception finale : tout reçu, état « Reçu », pas de dépense (case décochée)');
ok(db.getStockMoves().filter(m => m.po_id === id1).length === 3 && db.getStockMoves().filter(m => m.po_id === id1).every(m => !m.cash_id || m.cash_id === r1.cashId), 'trois entrées en tout pour ce bon');
ok(db.receivePurchase(id1, { [P1.id]: '1' }, { date: '2026-10-08' }).error === 'status' && db.setPurchaseStatus(id1, 'cancelled').error === 'status' && db.deletePurchase(id1).error === 'status', 'un bon reçu est définitif');
// bon sans prix : aucune dépense
const d3 = db.addPurchase({ supplier_id: a.id!, date: '2026-10-03', lines: [line(P2, '2', '')] }, true);
const r3 = db.receivePurchase(d3.id!, { [P2.id]: '2' }, { date: '2026-10-04', withExpense: true });
ok(r3.success && r3.cashId === undefined && db.getStockMoves().find(m => m.po_id === d3.id)!.unit_cost_ar === undefined, 'ligne sans prix : entrée sans prix et aucune dépense');
// annulation et suppression
const d4 = db.addPurchase({ supplier_id: a.id!, date: '2026-10-03', lines: [line(P2, '2', '10')] });
ok(db.setPurchaseStatus(d4.id!, 'cancelled').success && db.setPurchaseStatus(d4.id!, 'ordered').error === 'status' && db.deletePurchase(d4.id!).success, 'brouillon annulé : définitif, puis supprimable');
ok(db.deleteSupplier(a.id!).error === 'in_use', 'un fournisseur qui a des bons ne se supprime pas');
ok(db.getPurchases().find(o => o.id === d3.id)!.status === 'received', 'bon sans prix reçu en entier : « Reçu »');

// ---------- opérateur : rien ----------
db.enterDemo('employee');
ok(db.getSuppliers().length === 0 && db.getPurchases().length === 0, 'démo opérateur : aucun fournisseur ni bon');
ok(db.addSupplier({ name: 'Pirate' }).error === 'admin' && db.updateSupplier('x', { name: 'P' }).error === 'admin' && db.setSupplierActive('x', false).error === 'admin' && db.deleteSupplier('x').error === 'admin', 'opérateur : écritures refusées');
ok(db.addPurchase({ supplier_id: 'x', date: '2026-10-01', lines: [] }).error === 'admin' && db.updatePurchase('x', { supplier_id: 'x', date: '2026-10-01', lines: [] }).error === 'admin' && db.setPurchaseStatus('x', 'ordered').error === 'admin' && db.deletePurchase('x').error === 'admin' && db.receivePurchase('x', {}, { date: '2026-10-01' }).error === 'admin', 'opérateur : bons refusés');

// ---------- écran ----------
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  const html = view(lang);
  ok(!bad(html), `${lang} : aucun NaN, « undefined » ni « null » affichés`);
  ok(html.includes(lang === 'en' ? 'Purchasing' : 'Achats') && html.includes(lang === 'en' ? 'New supplier' : 'Nouveau fournisseur'), `${lang} : titre et bouton Nouveau fournisseur`);
  ok(html.includes('Papeterie Analakely') && html.includes('Info Mat') && !html.includes('Ancien Grossiste'), `${lang} : fournisseurs actifs listés, l'archivé caché`);
  ok(html.includes(lang === 'en' ? 'Archived' : 'Archivés'), `${lang} : onglet Archivés présent`);
  ok(html.includes('min-h-[44px]'), `${lang} : cibles tactiles de 44 px`);
  ok(html.includes(lang === 'en' ? 'late' : 'en retard'), `${lang} : le fournisseur en retard est signalé`);
}
(db as any).suppliers = []; // liste vide
ok(view('fr').includes('Aucun fournisseur pour l&#x27;instant') && view('en').includes('No suppliers yet'), 'liste vide : message clair, FR et EN');
// écran des bons (démo remise à zéro)
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  const html = view(lang, 'orders');
  ok(!bad(html), `${lang} bons : aucun NaN, « undefined » ni « null » affichés`);
  ok(['BC-0001', 'BC-0002', 'BC-0003', 'BC-0004', 'BC-0005'].every(r => html.includes(r)), `${lang} bons : les 5 bons de la démo sont listés`);
  ok(html.includes(lang === 'en' ? 'New purchase order' : 'Nouveau bon de commande') && html.includes(lang === 'en' ? 'Ordered' : 'Commandé') && html.includes(lang === 'en' ? 'Late' : 'En retard'), `${lang} bons : bouton, états et retard`);
  ok(html.includes('min-h-[44px]'), `${lang} bons : cibles tactiles de 44 px`);
}
(db as any).purchases = [];
ok(view('fr', 'orders').includes('Aucun bon de commande pour l&#x27;instant') && view('en', 'orders').includes('No purchase orders yet'), 'bons : liste vide, message clair FR et EN');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
