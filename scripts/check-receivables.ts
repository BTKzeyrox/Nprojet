// Contrôle des créances et relances (M2.7). Lancer : npm run check:receivables
import { chaseText, receivablesAlert, toChase } from '../src/utils/receivables';
import { computeAlerts } from '../src/utils/alerts';
import type { CashEntry, Invoice } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const eq = (got: unknown, want: unknown, m: string) => ok(JSON.stringify(got) === JSON.stringify(want), `${m}${JSON.stringify(got) === JSON.stringify(want) ? '' : ` (obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)})`}`);
const TODAY = '2026-10-22';
const mk = (id: string, client: string, due: string, total: number, o: Partial<Invoice> = {}): Invoice => ({ id, type: 'invoice', number: `FA-2026-${id}`, status: 'issued', client_id: client, client: { name: `Nom ${client}` }, issue_date: '2026-09-01', due_date: due, lines: [], subtotal_ar: total, tax_rate: 0, tax_ar: 0, total_ar: total, ...o });
const pay = (inv: string, amount: number): CashEntry => ({ id: `p${inv}${amount}`, kind: 'in', category: 'Paiement client', amount_ar: amount, date: '2026-10-01', note: '', invoice_id: inv });

const invs = [mk('0001', 'a', '2026-10-01', 10000), mk('0002', 'a', '2026-08-01', 5000), mk('0003', 'b', '2026-10-21', 7000), mk('0004', 'c', '2026-11-30', 9000), mk('0005', 'd', '2026-07-01', 3000, { status: 'draft' }), mk('0006', 'e', '2026-07-01', 4000, { status: 'cancelled' }), mk('0007', 'f', '2026-07-01', 4000, { type: 'credit_note' }), mk('0008', 'g', '2026-10-05', 6000)];
const cash = [pay('0001', 4000), pay('0008', 6000)];
const rows = toChase(invs, cash, TODAY, { a: 'Alpha' });
eq(rows.map(r => r.client_id), ['a', 'b'], 'à relancer : seulement les factures émises en retard et pas soldées (ni brouillon, ni annulée, ni avoir, ni payée, ni pas échue)');
eq(rows[0].invoices.map(i => [i.number, i.balance, i.days_late]), [['FA-2026-0002', 5000, 82], ['FA-2026-0001', 6000, 21]], 'client a : la plus en retard d\'abord ; le reste tient compte du paiement partiel');
eq([rows[0].total, rows[0].max_days, rows[0].client_name, rows[1].client_name], [11000, 82, 'Alpha', 'Nom b'], 'total, retard max, nom de la fiche ou copie du nom');
eq(rows[1].invoices[0].days_late, 1, 'échéance hier : 1 jour de retard');
eq(toChase([invs[0]], [], '2026-10-01'), [], 'le jour même de l\'échéance : pas en retard');
eq(toChase([], [], TODAY), [], 'aucune facture : rien à relancer');

const fr = chaseText(rows[0], { company_name: 'Ma Société', currency: 'Ar', payment_methods: 'Virement', penalty: 'Pénalité 3 %' });
ok(fr.startsWith('Bonjour') && fr.includes('FA-2026-0002') && fr.includes('FA-2026-0001') && fr.includes('82 jours de retard') && fr.includes('21 jours de retard') && fr.includes('11') && fr.includes('Virement') && fr.includes('Pénalité 3 %') && fr.includes('Ma Société'), 'texte FR : factures, retards, total, modes de paiement, pénalité, signature');
ok(fr.includes('déjà été effectué'), 'texte FR : poli (« si déjà payé, ne pas tenir compte »)');
const en = chaseText(rows[1], { lang: 'en' });
ok(en.startsWith('Hello') && en.includes('1 day late') && !en.includes('days late') && en.includes('disregard'), 'texte EN : pluriel correct (1 day) et poli');
ok(!/undefined|NaN|null/.test(fr + en) && !en.includes('Pénalité') && !fr.includes('Modes de paiement') === false, 'pas de undefined ; sans pénalité ni modes saisis, rien d\'inventé');
const plain = chaseText(rows[1], {});
ok(!plain.includes('Modes de paiement') && !plain.includes('Pénalité') && !/undefined|NaN/.test(plain), 'sans réglages : aucune ligne vide inventée');

eq(receivablesAlert([]), null, 'rien en retard : pas d\'alerte');
const al = receivablesAlert(rows)!;
ok(al.level === 'danger' && al.fr.includes('3 factures chez 2 clients') && al.fr.includes('18') && al.en.includes('3 invoices from 2 clients'), 'alerte : 3 factures, 2 clients, montant en retard');
eq([receivablesAlert(toChase([mk('1', 'x', '2026-06-01', 100)], [], TODAY))!.level, receivablesAlert(toChase([mk('1', 'x', '2026-10-01', 100)], [], TODAY))!.level], ['danger', 'warn'], 'plus de 60 jours de retard : alerte rouge, sinon orange');

const base = { today: TODAY, settings: {}, cash, posts: [], contracts: [], advances: [], products: [], moves: [] };
ok(computeAlerts({ ...base, invoices: invs }).some(a => a.id === 'invoices_overdue' && a.go === 'invoices'), 'accueil : alerte « factures en retard » qui ouvre la page Facturation');
ok(!computeAlerts({ ...base }).some(a => a.id === 'invoices_overdue') && !computeAlerts({ ...base, invoices: [] }).some(a => a.id === 'invoices_overdue'), 'sans facture : pas d\'alerte');
ok(!computeAlerts({ ...base, invoices: [mk('9', 'z', '2026-12-01', 5)] }).some(a => a.id === 'invoices_overdue'), 'facture pas encore échue : pas d\'alerte');
console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);
