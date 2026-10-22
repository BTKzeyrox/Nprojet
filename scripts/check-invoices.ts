// Contrôle des règles de facturation (M2.3), sans réseau et sans écran. Lancer : npm run check:invoices
import { addDays, ageBucket, agedBalance, billableMissions, canCancel, checkInvoiceDraft, checkPayment, dueDate, formatNumber, INVOICE_MAX, invoiceInfo, invoiceTotals, invoiceTotalsAll, invoicedRefs, lineTotal, paidAmount, parseNumber, proposeLines } from '../src/utils/invoices';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const L = (description: string, qty: string | number, unit_price: string | number, refs?: string[]) => ({ description, qty, unit_price, refs });
const base = { client_id: 'c1', issue_date: '2026-10-20', due_date: '2026-11-19' };
const draft = (lines: any[], extra: any = {}) => checkInvoiceDraft({ ...base, lines, ...extra } as any);
const err = (r: any) => (r.ok ? 'ok' : r.error);

// ---------- Lignes, arrondis, totaux ----------
ok(lineTotal(3, 3333) === 9999 && lineTotal(1.5, 3333) === 5000 && lineTotal(0.33, 1000) === 330 && lineTotal(2, 0) === 0, 'total d\'une ligne = quantité × prix, arrondi à l\'Ar (1,5 × 3 333 = 5 000)');
const t1 = invoiceTotals([{ total_ar: 100000 }], true, 20);
ok(t1.subtotal_ar === 100000 && t1.tax_ar === 20000 && t1.total_ar === 120000 && t1.tax_rate === 20, 'TVA 20 % sur 100 000 = 20 000, total 120 000');
ok(invoiceTotals([{ total_ar: 33333 }], true, 18).tax_ar === 6000 && invoiceTotals([{ total_ar: 100000 }], true, 7.25).tax_ar === 7250, 'TVA arrondie à l\'Ar (18 % de 33 333 = 5 999,94 → 6 000) ; taux à 2 décimales (7,25 %)');
ok(invoiceTotals([{ total_ar: 1000 }], false, 20).tax_ar === 0 && invoiceTotals([{ total_ar: 1000 }], false, 20).total_ar === 1000 && invoiceTotals([{ total_ar: 1000 }], false, 20).tax_rate === 0, 'sans TVA : TVA = 0, le taux réglé est ignoré');
ok(invoiceTotals([{ total_ar: 1000 }], true, 250).tax_rate === 100 && invoiceTotals([{ total_ar: 1000 }], true, -5).tax_ar === 0 && invoiceTotals([{ total_ar: 1000 }], true, NaN).tax_ar === 0, 'taux hors limites : plafonné à 100, négatif ou NaN = 0');
ok(invoiceTotals([], true, 20).total_ar === 0 && invoiceTotals([{ total_ar: 1 }], true, 20).tax_ar === 0 && invoiceTotals([{ total_ar: 3 }], true, 20).tax_ar === 1, 'cas minuscules : aucune ligne = 0 ; 20 % de 1 Ar = 0 ; 20 % de 3 Ar = 1 (0,6 arrondi)');
const big = invoiceTotals([{ total_ar: INVOICE_MAX }], true, 99.99);
ok(Number.isSafeInteger(big.total_ar) && big.tax_ar === Math.round(INVOICE_MAX * 0.9999), 'plus gros montant permis : les calculs restent exacts (entiers sûrs)');

// ---------- Une facture valide ----------
const v = draft([L('Saisie des fiches', 12, 8000, ['s1', 's2', 's2']), L('Contrôle qualité', '1,5', '9 000')], { vat_enabled: true, vat_rate: 20, note: 'Merci' });
ok(v.ok && v.clean.lines.length === 2 && v.clean.lines[0].total_ar === 96000 && v.clean.lines[1].qty === 1.5 && v.clean.lines[1].unit_price_ar === 9000 && v.clean.lines[1].total_ar === 13500, 'facture valide : lignes calculées, « 1,5 » et « 9 000 » compris');
ok(v.ok && v.clean.subtotal_ar === 109500 && v.clean.tax_ar === 21900 && v.clean.total_ar === 131400, 'sous-total 109 500 + TVA 21 900 = total 131 400');
ok(v.ok && v.clean.lines.map(l => l.id).join() === 'l1,l2' && v.clean.lines[0].refs!.join() === 's1,s2' && !('refs' in v.clean.lines[1]), 'identifiants de lignes l1, l2 ; sessions citées sans doublon ; pas de refs vides');
// Propriété : le total des lignes = le sous-total, et total = sous-total + TVA (300 factures au hasard)
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let allGood = true, taxGood = true;
for (let i = 0; i < 300; i++) {
  const lines = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, k) => L(`Ligne ${k}`, Math.round(rnd() * 5000) / 100 + 0.01, Math.floor(rnd() * 90000) + 1));
  const rate = Math.round(rnd() * 3000) / 100;
  const r = draft(lines, { vat_enabled: rnd() > 0.3, vat_rate: rate });
  if (!r.ok) { allGood = false; continue; }
  const c = r.clean;
  if (c.lines.reduce((t, l) => t + l.total_ar, 0) !== c.subtotal_ar || c.subtotal_ar + c.tax_ar !== c.total_ar || c.lines.some(l => l.total_ar !== Math.round(l.qty * l.unit_price_ar))) allGood = false;
  if (Math.abs(c.tax_ar - (c.subtotal_ar * c.tax_rate) / 100) > 0.5 + 1e-6) taxGood = false;
}
ok(allGood, 'sur 300 factures au hasard : total des lignes = sous-total, sous-total + TVA = total, chaque ligne = quantité × prix arrondi');
ok(taxGood, 'sur 300 factures au hasard : la TVA ne s\'écarte jamais de plus d\'un demi-Ar du calcul exact');

// ---------- Refus ----------
ok(err(draft([])) === 'lines' && err(draft(null as any)) === 'lines' && err(draft(undefined as any)) === 'lines', '0 ligne : refusé (« lines »), y compris liste absente');
ok(err(checkInvoiceDraft({ ...base, client_id: ' ', lines: [L('x', 1, 1)] } as any)) === 'client' && err(checkInvoiceDraft({ ...base, client_id: undefined, lines: [L('x', 1, 1)] } as any)) === 'client', 'client absent : refusé');
ok(err(checkInvoiceDraft({ ...base, issue_date: '2026-02-31', lines: [L('x', 1, 1)] } as any)) === 'issue_date' && err(checkInvoiceDraft({ ...base, due_date: '20/11/2026', lines: [L('x', 1, 1)] } as any)) === 'due_date' && err(checkInvoiceDraft({ ...base, due_date: '2026-10-19', lines: [L('x', 1, 1)] } as any)) === 'due_before', 'dates : 31 février, mauvais format et échéance avant l\'émission refusés');
ok(draft([L('x', 1, 1)], { due_date: '2026-10-20' }).ok, 'échéance le jour même de l\'émission : acceptée');
ok(err(draft(Array.from({ length: 201 }, (_, i) => L('x' + i, 1, 1)))) === 'too_many_lines' && draft(Array.from({ length: 200 }, (_, i) => L('x' + i, 1, 1))).ok, 'plus de 200 lignes refusé, 200 accepté');
const bl = (l: any) => { const r: any = draft([L('ok', 1, 1), l]); return r.ok ? 'ok' : `${r.error}@${r.line}`; };
ok(bl(L('   ', 1, 1)) === 'description@1' && bl(L(undefined as any, 1, 1)) === 'description@1', 'description vide refusée (avec le numéro de la ligne fautive)');
ok(bl(L('x', 0, 1)) === 'qty@1' && bl(L('x', -2, 1)) === 'qty@1' && bl(L('x', 'abc', 1)) === 'qty@1' && bl(L('x', NaN, 1)) === 'qty@1' && bl(L('x', 1_000_001, 1)) === 'qty@1' && bl(L('x', 0.004, 1)) === 'qty@1', 'quantité 0, négative, texte, NaN, trop grande ou arrondie à 0 : refusée');
ok(bl(L('x', 1, -1)) === 'price@1' && bl(L('x', 1, 'abc')) === 'price@1' && bl(L('x', 1, NaN)) === 'price@1' && bl(L('x', 1, INVOICE_MAX + 1)) === 'price@1', 'prix négatif, texte, NaN ou démesuré : refusé');
ok(err(draft([L('x', 1, 0)])) === 'total' && err(draft([L('x', 1, 0), L('y', 5, 0)])) === 'total', 'facture à 0 Ar : refusée (« total »)');
ok(bl(L('x', 1_000_000, 1_000_000)) === 'total@1', 'une ligne au-dessus du plafond de 100 milliards : refusée');
ok(err(draft([L('x', 1, INVOICE_MAX), L('y', 1, 1)])) === 'total', 'total de la facture au-dessus du plafond : refusé');
ok(draft([L('x', 1, 1)], { note: 'n'.repeat(900) }).ok && (draft([L('x', 1, 1)], { note: 'n'.repeat(900) }) as any).clean.note.length === 500 && (draft([L('d'.repeat(500), 1, 1)]) as any).clean.lines[0].description.length === 200, 'textes trop longs coupés (note 500, description 200)');
ok((draft([L('x', 1, 12000.5)]) as any).clean.lines[0].unit_price_ar === 12001 && (draft([L('x', 1, 12000.4)]) as any).clean.lines[0].unit_price_ar === 12000, 'prix unitaire arrondi à l\'Ar (12 000,5 → 12 001)');

// ---------- Échéance et numéros ----------
ok(addDays('2026-10-20', 30) === '2026-11-19' && addDays('2026-01-31', 1) === '2026-02-01' && addDays('2028-02-28', 1) === '2028-02-29' && addDays('2026-12-31', 1) === '2027-01-01' && addDays('2026-03-29', 1) === '2026-03-30', 'dates : +30 jours, fin de mois, année bissextile, fin d\'année');
ok(dueDate('2026-10-20', 15, 30) === '2026-11-04' && dueDate('2026-10-20', undefined, 30) === '2026-11-19' && dueDate('2026-10-20', 0, 30) === '2026-10-20' && dueDate('2026-10-20', -5, 30) === '2026-11-19' && dueDate('2026-10-20', NaN, undefined) === '2026-10-20', 'échéance : délai du client (même 0), sinon celui des Conditions, sinon 0 ; délai négatif ou NaN ignoré');
ok(formatNumber('FA-', 2026, 1) === 'FA-2026-0001' && formatNumber('RC-', 2026, 123) === 'RC-2026-0123' && formatNumber('FA-', 2026, 12345) === 'FA-2026-12345' && formatNumber('', 2026, 7) === '2026-0007' && formatNumber('FA-', 2026, -3) === 'FA-2026-0000', 'numéro : préfixe, année, compteur sur 4 chiffres au moins');
const pn = parseNumber('FA-2026-0042')!;
ok(pn.prefix === 'FA-' && pn.year === 2026 && pn.counter === 42 && parseNumber('n\'importe quoi') === null && parseNumber('') === null && parseNumber(undefined as any) === null && parseNumber(formatNumber('AV-', 2027, 9))!.counter === 9, 'lire un numéro : préfixe, année, compteur ; texte quelconque = null');

// ---------- États ----------
const inv = (o: any = {}) => ({ id: 'i1', status: 'issued', client_id: 'c1', total_ar: 100000, due_date: '2026-11-19', lines: [], ...o }) as any;
const cashIn = (amount: number, invoice_id = 'i1', kind: 'in' | 'out' = 'in') => ({ kind, amount_ar: amount, invoice_id }) as any;
const today = '2026-10-20';
ok(invoiceInfo(inv({ status: 'draft' }), [cashIn(5)], today).state === 'draft' && invoiceInfo(inv({ status: 'draft' }), [], today).paid === 0, 'brouillon : état « draft », rien de payé');
let i = invoiceInfo(inv(), [], today);
ok(i.state === 'issued' && i.paid === 0 && i.balance === 100000 && !i.overdue && i.days_late === 0, 'émise, pas encore échue : « issued », reste 100 000');
i = invoiceInfo(inv(), [cashIn(40000)], today);
ok(i.state === 'partial' && i.paid === 40000 && i.balance === 60000, 'payée à 40 % : « partial », reste 60 000');
i = invoiceInfo(inv(), [cashIn(40000), cashIn(60000)], today);
ok(i.state === 'paid' && i.balance === 0, 'deux paiements qui font le total : « paid »');
ok(invoiceInfo(inv(), [cashIn(130000)], today).state === 'paid' && invoiceInfo(inv(), [cashIn(130000)], today).balance === 0, 'trop payé (données anciennes) : « paid », reste jamais négatif');
i = invoiceInfo(inv({ due_date: '2026-10-19' }), [], today);
ok(i.state === 'overdue' && i.overdue && i.days_late === 1 && i.balance === 100000, 'échéance hier : en retard de 1 jour');
ok(invoiceInfo(inv({ due_date: '2026-10-20' }), [], today).state === 'issued' && invoiceInfo(inv({ due_date: '2026-10-20' }), [], today).days_late === 0, 'échéance aujourd\'hui : pas encore en retard');
i = invoiceInfo(inv({ due_date: '2026-09-01' }), [cashIn(10000)], today);
ok(i.state === 'overdue' && i.paid === 10000 && i.balance === 90000 && i.days_late === 49, 'payée en partie et échue : « overdue » (le retard prime), reste 90 000, 49 jours');
ok(invoiceInfo(inv({ due_date: '2026-09-01' }), [cashIn(100000)], today).state === 'paid', 'payée en entier après l\'échéance : « paid », plus de retard');
ok(invoiceInfo(inv({ status: 'cancelled' }), [], today).state === 'cancelled' && invoiceInfo(inv({ type: 'credit_note' }), [], today).state === 'credit_note' && !invoiceInfo(inv({ type: 'credit_note', due_date: '2020-01-01' }), [], today).overdue, 'annulée = « cancelled » ; un avoir n\'est jamais en retard');
ok(paidAmount('i1', [cashIn(1000), cashIn(500, 'autre'), cashIn(300, 'i1', 'out'), cashIn(NaN), cashIn(-5), cashIn(250.4)]) === 1250, 'argent reçu : seulement les entrées de CETTE facture, montants valides (NaN et négatifs ignorés)');

// ---------- Paiement ----------
const iss = { type: 'invoice', status: 'issued' } as any;
const bal = { balance: 60000 };
ok(checkPayment({ type: 'invoice', status: 'draft' } as any, bal, { amount: 1000, date: today }).ok === false && (checkPayment({ type: 'invoice', status: 'draft' } as any, bal, { amount: 1000, date: today }) as any).error === 'not_issued', 'paiement sur un brouillon : refusé');
ok((checkPayment({ type: 'invoice', status: 'cancelled' } as any, bal, { amount: 1000, date: today }) as any).error === 'not_issued' && (checkPayment({ type: 'credit_note', status: 'issued' } as any, bal, { amount: 1000, date: today }) as any).error === 'not_issued', 'paiement sur une facture annulée ou sur un avoir : refusé');
ok(['0', 0, -5, 'abc', NaN, '', '0,4'].every(a => (checkPayment(iss, bal, { amount: a as any, date: today }) as any).error === 'amount'), 'montant 0, négatif, texte, vide ou arrondi à 0 : refusé');
const big2 = checkPayment(iss, bal, { amount: 60001, date: today }) as any;
ok(!big2.ok && big2.error === 'too_much' && big2.max === 60000, 'paiement trop grand : refusé, avec le maximum permis (60 000)');
const exact = checkPayment(iss, bal, { amount: '60 000', date: today }) as any;
ok(exact.ok && exact.clean.amount_ar === 60000 && exact.clean.date === today, 'paiement égal au reste : accepté ("60 000" compris)');
ok((checkPayment(iss, bal, { amount: 1000, date: '2026-13-01' }) as any).error === 'date' && (checkPayment(iss, { balance: 0 }, { amount: 1, date: today }) as any).error === 'too_much', 'date fausse refusée ; plus rien à payer : tout paiement est « trop grand »');
ok((checkPayment(iss, bal, { amount: '1 000,6', date: today }) as any).clean.amount_ar === 1001, 'montant arrondi à l\'Ar (1 000,6 → 1 001)');

// ---------- Annulation ----------
ok(canCancel(iss, { paid: 0 }) && !canCancel(iss, { paid: 1 }) && !canCancel({ type: 'invoice', status: 'draft' } as any, { paid: 0 }) && !canCancel({ type: 'invoice', status: 'cancelled' } as any, { paid: 0 }) && !canCancel({ type: 'credit_note', status: 'issued' } as any, { paid: 0 }), 'annulation par avoir : seulement une facture émise sans aucun paiement');

// ---------- Balance âgée ----------
ok(ageBucket(-5) === 'current' && ageBucket(0) === 'current' && ageBucket(1) === 'd30' && ageBucket(30) === 'd30' && ageBucket(31) === 'd60' && ageBucket(60) === 'd60' && ageBucket(61) === 'd90' && ageBucket(90) === 'd90' && ageBucket(91) === 'd90p' && ageBucket(5000) === 'd90p', 'tranches d\'âge : à jour, 1-30, 31-60, 61-90, plus de 90 jours (bornes exactes)');
const daysAgo = (d: number) => addDays(today, -d);
const invs = [
  inv({ id: 'a1', client_id: 'A', total_ar: 100000, due_date: daysAgo(10) }), inv({ id: 'a2', client_id: 'A', total_ar: 50000, due_date: daysAgo(100) }),
  inv({ id: 'b1', client_id: 'B', total_ar: 70000, due_date: addDays(today, 5) }), inv({ id: 'b2', client_id: 'B', total_ar: 30000, due_date: daysAgo(45) }),
  inv({ id: 'p1', client_id: 'C', total_ar: 20000, due_date: daysAgo(5) }), inv({ id: 'd1', client_id: 'D', status: 'draft', due_date: daysAgo(50) }),
  inv({ id: 'x1', client_id: 'E', status: 'cancelled', due_date: daysAgo(50) }), inv({ id: 'cn', client_id: 'F', type: 'credit_note', due_date: daysAgo(50) }),
];
const cash = [cashIn(20000, 'p1'), cashIn(30000, 'a1')];
const aged = agedBalance(invs as any, cash, today);
const A = aged.find(r => r.client_id === 'A')!, B = aged.find(r => r.client_id === 'B')!;
ok(aged.length === 2 && A.d30 === 70000 && A.d90p === 50000 && A.total === 120000 && A.invoices === 2 && A.oldest_days === 100, 'client A : 70 000 (1-30 j, après un paiement de 30 000) + 50 000 (plus de 90 j) = 120 000');
ok(B.current === 70000 && B.d60 === 30000 && B.total === 100000 && B.oldest_days === 45, 'client B : 70 000 pas encore échus + 30 000 (31-60 j)');
ok(!aged.some(r => ['C', 'D', 'E', 'F'].includes(r.client_id)) && aged[0].client_id === 'A', 'ni payée (C), ni brouillon (D), ni annulée (E), ni avoir (F) ; le plus gros retard (A) en premier');
const tt = invoiceTotalsAll(invs as any, cash, today);
ok(tt.billed === 270000 && tt.to_collect === 220000 && tt.overdue === 150000 && tt.count === 5, 'totaux : facturé 270 000 (5 factures émises), à encaisser 220 000, dont 150 000 en retard');
ok(invoiceTotalsAll([], [], today).billed === 0 && agedBalance([], [], today).length === 0, 'aucune facture : zéro, sans erreur');

// ---------- Missions à facturer ----------
const client = { id: 'c1', name: 'Atelier', price_default_ar: 7000, price_by_type: { WEB: 12000 } } as any;
const contracts = [{ post_number: 1, client_name: 'Saisie', client_id: 'c1', post_type: 'SAISIE' }, { post_number: 2, client_name: 'Site web', client_id: 'c1', post_type: 'WEB' }, { post_number: 3, client_name: 'Autre client', client_id: 'c2' }, { post_number: 4, client_name: 'Sans fiche' }] as any[];
const posts = [
  { id: 's1', status: 'completed', date: '2026-10-03', post_number: 1, client_name: 'Saisie' }, { id: 's2', status: 'completed', date: '2026-10-05', post_number: 1, client_name: 'Saisie' },
  { id: 's3', status: 'completed', date: '2026-09-28', post_number: 2, client_name: 'Site web' }, { id: 's4', status: 'completed', date: '2026-10-07', post_number: 1, client_name: 'Saisie', client_price_ar: 9000 },
  { id: 's5', status: 'pending', date: '2026-10-08', post_number: 1, client_name: 'Saisie' }, { id: 's6', status: 'completed', date: '2026-10-09', post_number: 3, client_name: 'Autre client' },
  { id: 's7', status: 'completed', date: '2026-10-10', post_number: 4, client_name: 'Sans fiche' }, { id: 's8', status: 'completed', date: '2026-10-11', post_number: 4, client_name: 'Sans fiche', client_id: 'c1' },
] as any[];
const prices = { client_price_default_ar: 5000 } as any;
const bm = billableMissions(posts, contracts, client, prices, []);
ok(bm.map(m => m.session_id).join() === 's3,s1,s2,s4,s8', 'missions à facturer : les validées de CE client (par sa mission ou par la session), triées par date ; pas les en attente ni celles d\'un autre client');
ok(bm.find(m => m.session_id === 's4')!.price_ar === 9000 && bm.find(m => m.session_id === 's3')!.price_ar === 12000 && bm.find(m => m.session_id === 's1')!.price_ar === 7000, 'prix : celui figé sur la session (9 000), sinon le tarif du client par type (12 000), sinon son tarif par défaut (7 000)');
const invd = [{ status: 'draft', lines: [{ refs: ['s1'] }] }, { status: 'issued', lines: [{ refs: ['s2'] }] }, { status: 'cancelled', lines: [{ refs: ['s3'] }] }, { type: 'credit_note', status: 'issued', lines: [{ refs: ['s4'] }] }] as any[];
ok(billableMissions(posts, contracts, client, prices, invd).map(m => m.session_id).join() === 's3,s4,s8' && invoicedRefs(invd).size === 2, 'déjà facturées : brouillon et facture émise les retiennent ; facture annulée et avoir les rendent');
ok(billableMissions(posts, contracts, client, prices, [], { start: '2026-10-01', end: '2026-10-06' }).map(m => m.session_id).join() === 's1,s2', 'période (un mois, une semaine…) : bornes comprises');
ok(billableMissions([], contracts, client, prices, []).length === 0 && billableMissions(posts, [], client, prices, []).map(m => m.session_id).join() === 's8', 'sans missions ni contrats : liste vide, sans erreur (sauf la session qui porte elle-même le client)');
const pl = proposeLines(bm);
ok(pl.length === 4 && pl.find(l => l.description === 'Saisie' && l.unit_price === 7000)!.qty === 2 && pl.find(l => l.description === 'Saisie' && l.unit_price === 9000)!.qty === 1, 'lignes proposées : un titre à deux prix = deux lignes (2 × 7 000 et 1 × 9 000)');
const sumPl = pl.reduce((t, l) => t + Number(l.qty) * Number(l.unit_price), 0);
ok(sumPl === bm.reduce((t, m) => t + m.price_ar, 0) && pl.flatMap(l => l.refs || []).sort().join() === bm.map(m => m.session_id).sort().join() && proposeLines([]).length === 0, 'lignes proposées : le total = la somme des missions, chaque session citée une seule fois');
const pv = checkInvoiceDraft({ ...base, lines: pl } as any);
ok(pv.ok && pv.clean.total_ar === sumPl, 'les lignes proposées forment une facture valide');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
