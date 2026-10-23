// Contrôle des chiffres de facturation dans Finances et dans le rapport (M2.8), sans réseau. Lancer : npm run check:invoice-stats
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { FinanceInsights } = await import('../src/views/admin/FinanceInsights');
const { invoiceFigures, invoiceSheetRows, agedSheetRows } = await import('../src/utils/invoiceStats');
const { buildReport, exportSheets, reportHtml } = await import('../src/utils/report');
const { computeFinance } = await import('../src/utils/financeStats');
const { todayMada } = await import('../src/utils/stats');

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(h);

db.enterDemo('admin');
const today = todayMada();
const month = today.slice(0, 7);
const clients = db.getClients();
const c1 = clients[0];
const range = { start: `${month}-01`, end: `${month}-31` };
const settings = db.getSettings();
const prices = { client_price_default_ar: settings.client_price_default_ar, client_prices_by_type: settings.client_prices_by_type };
const base = { cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), clients, prices, today, range };

// Sans facture
const none = invoiceFigures({ ...base, invoices: [] });
ok(none.issued_total === 0 && none.to_collect === 0 && none.overdue === 0 && none.collected === 0, 'aucune facture : tout à 0');
ok(none.unbilled_count > 0 && none.unbilled_total > 0, 'démo : des missions validées ne sont pas encore facturées');

// Les factures de la démo servent à vérifier que tout s'affiche ; les chiffres exacts se vérifient sur les factures créées ici
const demoIds = new Set(db.getInvoices().map(v => v.id));
const withDemo = invoiceFigures({ ...base, invoices: db.getInvoices() });
ok(withDemo.issued_count + withDemo.open_count > 0 && withDemo.to_collect > 0 && withDemo.overdue > 0, 'démo : des factures ouvertes et en retard sont comptées');

// Avec factures (créées par le store, comme sur l'écran)
const a = db.saveInvoiceDraft({ client_id: c1.id, issue_date: `${month}-02`, due_date: `${month}-03`, lines: [{ description: 'A', qty: 2, unit_price: 10000 }] });
const b = db.saveInvoiceDraft({ client_id: c1.id, issue_date: `${month}-02`, due_date: '2099-01-01', lines: [{ description: 'B', qty: 1, unit_price: 5000 }] });
const d = db.saveInvoiceDraft({ client_id: c1.id, issue_date: `${month}-02`, due_date: '2099-01-01', lines: [{ description: 'D', qty: 1, unit_price: 7000 }] });
const e = db.saveInvoiceDraft({ client_id: c1.id, issue_date: `${month}-02`, due_date: '2099-01-01', lines: [{ description: 'Brouillon', qty: 1, unit_price: 999 }] });
for (const x of [a, b, d]) await db.issueInvoice(x.id!);
await db.payInvoice(a.id!, { amount: 8000, date: `${month}-02` });
await db.cancelInvoice(d.id!);
const invs = db.getInvoices().filter(v => !demoIds.has(v.id));
const f = invoiceFigures({ ...base, cash: db.getCash(), invoices: invs });
ok(f.issued_count === 2 && f.issued_total === 25000, 'émises sur la période : 2 factures, 25 000 Ar (A 20 000 + B 5 000) ; la brouillon, l\'annulée et l\'avoir ne comptent pas');
ok(f.cancelled_total === 7000, 'annulée de la période : 7 000 Ar à part');
ok(f.to_collect === 17000 && f.open_count === 2, 'reste à payer : 12 000 sur A + 5 000 sur B = 17 000 Ar');
ok(f.overdue === (today > `${month}-03` ? 12000 : 0), 'en retard : A (échéance le 3 du mois) seulement si la date est passée');
ok(f.collected === 8000, 'argent reçu sur factures : 8 000 Ar');
ok(f.unbilled_total <= none.unbilled_total && f.unbilled_total < none.unbilled_total + 1, 'les missions facturées ne sont plus « pas encore facturées »');
ok(e.success && invoiceFigures({ ...base, cash: db.getCash(), invoices: invs.filter(v => v.status !== 'draft') }).issued_total === f.issued_total, 'un brouillon ne change aucun chiffre');
const outside = invoiceFigures({ ...base, cash: db.getCash(), invoices: invs, range: { start: '2000-01-01', end: '2000-01-31' } });
ok(outside.issued_total === 0 && outside.collected === 0 && outside.to_collect === f.to_collect, 'autre période : rien d\'émis, mais le reste à payer reste celui d\'aujourd\'hui');

// Les chiffres historiques ne bougent pas
const fin0 = { cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), prices: settings, pricePerMission: settings.price_per_mission || 0, clients };
const before = computeFinance(fin0, 'month', { ...range, days: 31 });
ok(before.billed >= 0 && before.toCollect === Math.max(0, before.billed - before.received), '« facturé » et « à encaisser » historiques : même formule qu\'avant (missions × prix − reçu)');

// Lignes Excel
const nm = (id: string) => clients.find(c => c.id === id)?.name || '';
const rows = invoiceSheetRows(invs, db.getCash(), today, range, nm, s => s);
ok(rows.length === 4 && rows.every(r => r.length === 9), 'onglet Factures : 4 lignes (A, B, D annulée, avoir) sur 9 colonnes ; pas de brouillon');
ok(rows.some(r => typeof r[4] === 'number' && (r[4] as number) < 0), 'l\'avoir est en négatif');
const aged = agedSheetRows(invs, db.getCash(), today, nm);
ok(aged.length === 1 && aged[0][6] === 17000 && aged[0][7] === 2, 'onglet Créances : un client, 17 000 Ar, 2 factures');

// Rapport
const rin = (lang: 'fr' | 'en', invoices?: typeof invs) => ({ today, anchor: today, lang, settings, posts: db.getPosts(), contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(), cash: db.getCash(), products: db.getProducts(), moves: db.getStockMoves(), clients, invoices });
const plain = exportSheets(buildReport(rin('fr')));
ok(plain.length === 8 && !plain.some(x => x.name === 'Factures'), 'rapport sans facture : toujours 8 onglets, rien de nouveau');
for (const lang of ['fr', 'en'] as const) {
  const rep = buildReport(rin(lang, invs));
  const sheets = exportSheets(rep);
  const names = sheets.map(x => x.name);
  ok(sheets.length === 10 && new Set(names).size === 10 && names.includes(lang === 'en' ? 'Invoices' : 'Factures') && names.includes(lang === 'en' ? 'Receivables' : 'Créances'), `rapport ${lang} : 10 onglets dont Factures et Créances`);
  ok(sheets.every(x => x.name.length <= 31 && x.rows.every(r => r.every(c => typeof c === 'string' || (typeof c === 'number' && Number.isFinite(c))))), `rapport ${lang} : cellules valides`);
  ok(sheets[0].rows.some(r => String(r[0]).includes(lang === 'en' ? 'Left to pay on invoices' : 'Reste à payer sur les factures') && r[1] === 17000), `rapport ${lang} : résumé avec le reste à payer sur factures`);
  const h = reportHtml(rep);
  ok(!bad(h) && h.includes(lang === 'en' ? 'Left to pay on invoices' : 'Reste à payer sur les factures'), `page imprimable ${lang} : lignes de factures, pas de NaN`);
}

// Écran Finances
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><FinanceInsights range={range} lang={lang} /></AppProvider>).replace(/<!-- -->/g, ''); };
const fr = view('fr'), en = view('en');
ok(fr.includes('invoice-figures') && fr.includes('Pas encore facturé') && fr.includes('Reste à payer') && en.includes('Not yet invoiced') && en.includes('Left to pay'), 'Finances : carte « Factures » en FR et EN');
ok(!bad(fr) && !bad(en), 'Finances : pas de NaN / undefined / null');
ok(calls === 0, 'rien ne part sur internet');
console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);
