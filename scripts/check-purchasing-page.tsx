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
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><PurchasingPage /></AppProvider>).replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' '); };

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

// ---------- opérateur : rien ----------
db.enterDemo('employee');
ok(db.getSuppliers().length === 0 && db.getPurchases().length === 0, 'démo opérateur : aucun fournisseur ni bon');
ok(db.addSupplier({ name: 'Pirate' }).error === 'admin' && db.updateSupplier('x', { name: 'P' }).error === 'admin' && db.setSupplierActive('x', false).error === 'admin' && db.deleteSupplier('x').error === 'admin', 'opérateur : écritures refusées');

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
(db as any).suppliers = [];
ok(view('fr').includes('Aucun fournisseur pour l&#x27;instant') && view('en').includes('No suppliers yet'), 'liste vide : message clair, FR et EN');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
