// Contrôle des écritures automatiques (module 14, M14.2) : chaque total est comparé à celui des autres pages (créances, TVA, argent). Sans réseau.
// Lancer : npm run check:accounting-entries
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.fetch = async () => { throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const A: any = await import('../src/utils/accountingEntries');
const { trialBalance, balanceSheet, vatSummary, incomeStatement, cleanEntry } = await import('../src/utils/accounting');
const { invoiceInfo } = await import('../src/utils/invoices');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bal = (tb: ReturnType<typeof trialBalance>, code: string) => { const r = tb.rows.find(x => x.account === code); return r ? r.debit - r.credit : 0; };

// ---- modes de paiement et catégories
const ca = A.cashAccountFor;
ok(ca('Espèces').account === '531' && ca('ESPECES').journal === 'CA' && ca('cash').account === '531' && ca('').account === '531' && ca(undefined).account === '531' && ca('truc inconnu').account === '531', 'trésorerie : espèces, vide ou inconnu = caisse (valeur par défaut)');
ok(['virement', 'Virement bancaire', 'chèque', 'Cheque', 'banque', 'carte'].every(m => ca(m).account === '512' && ca(m).journal === 'BQ'), 'trésorerie : virement, chèque, banque, carte = banque');
ok(['MVola', 'mvola', 'Orange Money', 'Airtel Money', 'mobile money', 'Mobile-Money'].every(m => ca(m).account === '514' && ca(m).journal === 'MM'), 'trésorerie : MVola, Orange Money, Airtel Money = Mobile Money');
ok(A.expenseAccountFor('Achats') === '601' && A.expenseAccountFor('Loyer') === '613' && A.expenseAccountFor('Internet') === '626' && A.expenseAccountFor('Matériel') === '606' && A.expenseAccountFor('Transport') === '624' && A.expenseAccountFor('Autres') === '658' && A.expenseAccountFor('Inconnue') === '658' && A.expenseAccountFor(undefined) === '658', 'dépenses : chaque catégorie a son compte, inconnue = charges diverses');

// ---- pièces une par une
const inv = (p: any = {}) => ({ id: 'i1', type: 'invoice', number: 'FA-2026-0001', status: 'issued', client_id: 'c1', client: { name: 'Acme' }, issue_date: '2026-10-05', due_date: '2026-11-04', lines: [], subtotal_ar: 1000, tax_rate: 20, tax_ar: 200, total_ar: 1200, ...p }) as any;
let r: any = A.entryForInvoice(inv());
ok(r.ok && r.entry.id === 'je-invoice-i1' && r.entry.journal === 'VT' && r.entry.ref === 'FA-2026-0001' && r.entry.lines.map((l: any) => `${l.account}:${l.debit}/${l.credit}`).join() === '411:1200/0,706:0/1000,4457:0/200', 'facture : client 1 200 / vente 1 000 + TVA 200');
r = A.entryForInvoice(inv({ tax_ar: 0, tax_rate: 0, total_ar: 1000 }));
ok(r.ok && r.entry.lines.length === 2, 'facture sans TVA : 2 lignes, pas de TVA');
ok(A.entryForInvoice(inv({ status: 'draft' })).reason === 'draft' && A.entryForInvoice(inv({ status: 'cancelled' })).ok, 'brouillon : rien ; facture annulée : garde son écriture (l\'avoir la contre-passe)');
ok(A.entryForInvoice(inv({ total_ar: 0, subtotal_ar: 0, tax_ar: 0 })).reason === 'zero' && A.entryForInvoice(inv({ total_ar: 1300 })).reason === 'totals' && A.entryForInvoice(inv({ subtotal_ar: 1000.5, total_ar: 1200.5 })).reason === 'totals' && A.entryForInvoice(inv({ tax_ar: -200, total_ar: 800 })).reason === 'totals', 'facture à zéro, totaux incohérents, centimes ou TVA négative : refusées avec une raison');
ok(A.entryForInvoice(inv({ issue_date: '2026-02-30' })).reason === 'date' && A.entryForInvoice(inv({ type: 'credit_note' })).reason === 'credit_note', 'date fausse refusée ; un avoir n\'est pas une facture');
r = A.entryForCreditNote(inv({ id: 'cn1', type: 'credit_note', number: 'AV-2026-0001', issue_date: '2026-10-20' }));
ok(r.ok && r.entry.id === 'je-credit_note-cn1' && r.entry.lines.map((l: any) => `${l.account}:${l.debit}/${l.credit}`).join() === '706:1000/0,4457:200/0,411:0/1200', 'avoir : exactement l\'inverse de la facture');
ok(A.entryForCreditNote(inv()).reason === 'not_credit_note' && A.entryForCreditNote(inv({ type: 'credit_note', status: 'draft' })).reason === 'draft', 'avoir : seulement un avoir émis');
const cash = (p: any = {}) => ({ id: 'k1', kind: 'in', category: 'Paiement client', amount_ar: 700, date: '2026-10-10', note: '', invoice_id: 'i1', payment_method: 'virement', receipt_no: 'RC-2026-0001', ...p }) as any;
r = A.entryForCash(cash());
ok(r.ok && r.entry.journal === 'BQ' && r.entry.lines[0].account === '512' && r.entry.lines[1].account === '411' && r.entry.ref === 'RC-2026-0001', 'paiement de facture : banque / client, avec le numéro de reçu');
ok(A.entryForCash(cash({ invoice_id: undefined })).entry.lines[1].account === '411' && A.entryForCash(cash({ invoice_id: undefined, category: 'Autre entrée' })).entry.lines[1].account === '758', 'entrée sans facture : « paiement client » → client ; « autre entrée » → produits divers');
r = A.entryForCash(cash({ id: 'k2', kind: 'out', category: 'Loyer', amount_ar: 300, payment_method: 'espèces', invoice_id: undefined, note: 'Octobre' }));
ok(r.ok && r.entry.id === 'je-expense-k2' && r.entry.lines[0].account === '613' && r.entry.lines[1].account === '531' && r.entry.journal === 'CA' && r.entry.label.includes('Octobre'), 'dépense : loyer / caisse');
ok(A.entryForCash(cash({ amount_ar: 0 })).reason === 'amount' && A.entryForCash(cash({ amount_ar: -5 })).reason === 'amount' && A.entryForCash(cash({ amount_ar: 10.5 })).reason === 'amount' && A.entryForCash(cash({ kind: 'zzz' })).reason === 'kind' && A.entryForCash(cash({ date: 'hier' })).reason === 'date', 'argent : montant nul, négatif ou à virgule, genre inconnu, date fausse : refusés');
const slip = (p: any = {}) => ({ id: 'slip-2026-10-u1', name: 'Marie', period_end: '2026-10-31', net: 900000, advance_deducted: 100000, paid: null, ...p }) as any;
r = A.entryForSlipClose(slip());
ok(r.ok && r.entry.journal === 'PA' && r.entry.date === '2026-10-31' && r.entry.lines.map((l: any) => `${l.account}:${l.debit}/${l.credit}`).join() === '641:1000000/0,421:0/900000,425:0/100000', 'clôture de paie : charge 1 000 000 = dû 900 000 + avance reprise 100 000');
ok(A.entryForSlipClose(slip({ advance_deducted: 0 })).entry.lines.length === 2 && A.entryForSlipClose(slip({ net: 0 })).entry.lines.length === 2 && A.entryForSlipClose(slip({ net: 0, advance_deducted: 0 })).reason === 'zero', 'paie : sans avance, net à zéro, tout à zéro');
r = A.entryForSlipPaid(slip({ paid: { at: '2026-11-03', method: 'MVola' } }));
ok(r.ok && r.entry.date === '2026-11-03' && r.entry.journal === 'MM' && r.entry.lines[0].account === '421' && r.entry.lines[1].account === '514' && A.entryForSlipPaid(slip()).reason === 'not_paid' && A.entryForSlipPaid(slip({ net: 0, paid: { at: '2026-11-03' } })).reason === 'zero', 'paie payée : dû / Mobile Money ; pas payée ou net à zéro : rien');
const adv = (p: any = {}) => ({ id: 'a1', employee_id: 'u1', employee_name: 'Marie', amount_ar: 100000, reason: '', request_date: '2026-10-12', status: 'approved', ...p }) as any;
ok(A.entryForAdvance(adv()).entry.lines.map((l: any) => `${l.account}:${l.debit}/${l.credit}`).join() === '425:100000/0,531:0/100000' && A.entryForAdvance(adv({ status: 'pending' })).reason === 'not_approved' && A.entryForAdvance(adv({ status: 'rejected' })).reason === 'not_approved' && A.entryForAdvance(adv({ amount_ar: 0 })).reason === 'amount', 'avance : seulement approuvée, avance / caisse');

// ---- ensemble : la vie d'un client, d'une paie
const set = {
  invoices: [inv(), inv({ id: 'i2', number: 'FA-2026-0002', issue_date: '2026-10-06', status: 'cancelled' }), inv({ id: 'cn2', type: 'credit_note', number: 'AV-2026-0001', issue_date: '2026-10-07', credit_of: 'i2' }), inv({ id: 'i3', status: 'draft' })],
  cash: [cash(), cash({ id: 'k2', kind: 'out', category: 'Loyer', amount_ar: 300, payment_method: 'espèces', invoice_id: undefined })],
  slips: [slip({ paid: { at: '2026-11-03', method: 'virement' } })], advances: [adv(), adv({ id: 'a2', status: 'pending' })],
};
const b = A.buildEntries(set as any);
ok(b.skipped.length === 0 && b.entries.length === 8, 'ensemble : 8 écritures (brouillon et avance en attente écrits pour rien, aucun refus)');
ok(b.entries.every((e: any) => (cleanEntry(e) as any).ok) && new Set(b.entries.map((e: any) => e.id)).size === b.entries.length, 'ensemble : toutes valides, aucun identifiant en double');
const tb = trialBalance(b.entries);
ok(tb.balanced, 'ensemble : balance équilibrée');
ok(bal(tb, '411') === 1200 - 700 && bal(tb, '706') === -1000 && bal(tb, '4457') === -200, 'ensemble : une facture annulée + son avoir = zéro ; il reste la facture i1 (client 500 après 700 payés)');
ok(bal(tb, '421') === 0 && bal(tb, '425') === 100000 - 100000 && bal(tb, '641') === 1000000, 'paie : dette envers le salarié soldée, avance entièrement reprise, charge 1 000 000');
ok(JSON.stringify(A.buildEntries(set as any)) === JSON.stringify(b), 'générer deux fois = même résultat (jamais de doublon)');
ok(JSON.stringify(A.buildEntries({ invoices: [...set.invoices].reverse(), cash: [...set.cash].reverse(), slips: set.slips, advances: [...set.advances].reverse() } as any).entries) === JSON.stringify(b.entries), 'même résultat quel que soit l\'ordre des pièces');
const badSet = A.buildEntries({ invoices: [inv({ id: 'x', total_ar: 5 })], cash: [cash({ id: 'y', amount_ar: 0 })], slips: [], advances: [] } as any);
ok(badSet.entries.length === 0 && badSet.skipped.map((s: any) => s.reason).join() === 'totals,amount', 'pièces incohérentes : refusées et signalées (type, identifiant, raison)');
ok(A.buildEntries({ invoices: [], cash: [], slips: [], advances: [] }).entries.length === 0 && A.buildEntries({} as any).entries.length === 0, 'aucune pièce : aucune écriture, pas de plantage');

// ---- sur la démo : les totaux de la comptabilité = ceux des autres pages
db.enterDemo('admin');
const today = todayMada();
const invs = db.getInvoices(), cashes = db.getCash();
const demo = A.buildEntries({ invoices: invs, cash: cashes, slips: [], advances: db.getAdvanceRequests() });
ok(demo.skipped.length === 0 && demo.entries.length > 5, `démo : ${demo.entries.length} écritures, aucune pièce refusée`);
const dtb = trialBalance(demo.entries);
ok(dtb.balanced && balanceSheet(demo.entries, '2100-12-31').balanced, 'démo : balance et bilan équilibrés');
const real = invs.filter(i => i.type !== 'credit_note' && (i.status === 'issued' || i.status === 'cancelled')), cns = invs.filter(i => i.type === 'credit_note' && i.status === 'issued');
ok(-bal(dtb, '706') === real.reduce((t, i) => t + i.subtotal_ar, 0) - cns.reduce((t, i) => t + i.subtotal_ar, 0), 'démo : ventes (706) = total des factures émises moins les avoirs');
ok(vatSummary(demo.entries).collected === real.reduce((t, i) => t + i.tax_ar, 0) - cns.reduce((t, i) => t + i.tax_ar, 0), 'démo : TVA collectée = somme de la TVA des factures moins celle des avoirs');
const unattached = cashes.filter(c => c.kind === 'in' && !c.invoice_id && c.category === 'Paiement client').reduce((t, c) => t + c.amount_ar, 0);
const owed = invs.filter(i => i.type !== 'credit_note' && i.status === 'issued').reduce((t, i) => t + invoiceInfo(i, cashes, today).balance, 0);
ok(bal(dtb, '411') === owed - unattached, `démo : clients (411) = ce que les relances disent qu'on nous doit (${owed} Ar) moins les paiements sans facture (${unattached} Ar)`);
const inAll = cashes.filter(c => c.kind === 'in').reduce((t, c) => t + c.amount_ar, 0), outAll = cashes.filter(c => c.kind === 'out').reduce((t, c) => t + c.amount_ar, 0);
const advPaid = db.getAdvanceRequests().filter(a => a.status === 'approved').reduce((t, a) => t + a.amount_ar, 0);
ok(bal(dtb, '512') + bal(dtb, '514') + bal(dtb, '531') === inAll - outAll - advPaid, 'démo : banque + Mobile Money + caisse = argent entré − argent sorti − avances versées');
ok(incomeStatement(demo.entries).totalExpense === outAll, 'démo : toutes les charges = toutes les dépenses des Finances');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
