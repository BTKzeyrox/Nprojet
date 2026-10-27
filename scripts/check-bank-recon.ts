// Contrôle du rapprochement bancaire et Mobile Money (M14.7), sans réseau. Lancer : npm run check:bank-recon
import fs from 'node:fs';
import { parseAmount, parseStatementDate, parseStatement, bookLines, reconcile, RECON_LIMITS, STATEMENT_TEMPLATE, STATEMENT_ERROR, STATEMENT_PROBLEM } from '../src/utils/bankRecon';
import { parseCsv } from '../src/utils/importRules';
import type { Entry } from '../src/utils/accounting';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const A = (s: string) => { const r = parseAmount(s); return r.ok ? r.n : r.code; };

ok(A('1200000') === 1200000 && A('1 200 000') === 1200000 && A('1 200 000') === 1200000 && A('1.200.000') === 1200000 && A('1,200,000') === 1200000, 'montants : milliers par espace, point, virgule');
ok(A('-300000') === -300000 && A('(500)') === -500 && A('500-') === -500 && A('+700') === 700 && A('1 234,00') === 1234 && A('1234.00') === 1234 && A('12 000 Ar') === 12000, 'montants : signes, parenthèses, « ,00 », unité Ar');
ok(A('12,5') === 'cents' && A('1 234,56') === 'cents' && A('') === 'empty_amount' && A('abc') === 'amount' && A('1e5') === 'amount' && A('--5') === 'amount' && A('9'.repeat(30)) === 'amount', 'montants refusés : centimes, vide, texte, énorme');
ok(parseStatementDate('2026-10-05') === '2026-10-05' && parseStatementDate('05/10/2026') === '2026-10-05' && parseStatementDate('5-10-2026') === '2026-10-05' && parseStatementDate('05/10/26') === '2026-10-05' && parseStatementDate('05/10/2026 14:30') === '2026-10-05', 'dates : 4 formats, heure ignorée');
ok(parseStatementDate('31/02/2026') === null && parseStatementDate('hier') === null && parseStatementDate('') === null && parseStatementDate('2026-13-01') === null, 'dates fausses refusées');

// lecture du modèle
const tpl = parseStatement(STATEMENT_TEMPLATE);
ok(!tpl.problem && tpl.rows.length === 2 && tpl.errors.length === 0 && tpl.rows[0].amount === 1200000 && tpl.rows[1].amount === -300000 && tpl.rows[0].balance === 1700000, 'le modèle de relevé se lit sans erreur');
// CSV réel : séparateur « ; », colonnes débit / crédit
const csv = 'Date;Libellé;Débit;Crédit\n05/10/2026;Virement client;;1 200 000\n07/10/2026;Loyer;300 000;\n08/10/2026;Erreur;100;200\n09/10/2026;Sans montant;;\n31/02/2026;Date fausse;;50\n10/10/2026;Centimes;;12,5\n';
const p = parseStatement(parseCsv(csv));
ok(!p.problem && p.rows.length === 2 && p.rows[0].amount === 1200000 && p.rows[1].amount === -300000, 'débit / crédit : retrait = sortie, dépôt = entrée');
ok(p.errors.map(e => `${e.line}:${e.code}`).join() === '4:both,5:empty_amount,6:date,7:cents', 'erreurs ligne par ligne (numéro de ligne du fichier)');
ok(parseStatement([]).problem === 'empty' && parseStatement([['a', 'b'], ['1', '2']]).problem === 'no_header' && parseStatement([['Date', 'Libellé']]).problem === 'missing_columns' && parseStatement([['Date', 'Montant']]).problem === 'no_rows', 'problèmes de fichier : vide, sans titres, colonne manquante, sans lignes');
ok(parseStatement([['Date', 'Montant'], ...Array.from({ length: RECON_LIMITS.rows + 1 }, () => ['01/10/2026', '5'])]).problem === 'too_many_rows', 'trop de lignes refusé');
ok(parseStatement([['Relevé de compte'], ['Banque X'], ['Date', 'Description', 'Amount'], ['2026-10-05', 'Dépôt', '50']]).rows.length === 1 && parseStatement(parseCsv('Date,Description,Amount\n2026-10-05,Dépôt,50\n')).rows.length === 1, 'titres après quelques lignes d\'en-tête ; séparateur « , » et titres anglais');
ok(Object.keys(STATEMENT_ERROR).every(k => (STATEMENT_ERROR as any)[k][0] && (STATEMENT_ERROR as any)[k][1]) && Object.keys(STATEMENT_PROBLEM).length === 5, 'textes FR et EN pour chaque erreur');

// rapprochement
const E = (id: string, date: string, account: string, debit: number, credit: number, extra: Partial<Entry> = {}): Entry => ({ id, date, journal: 'BQ', label: id, number: id, lines: [{ account, debit, credit }, { account: '999x', debit: credit, credit: debit } as any], ...extra });
const books = [E('e1', '2026-10-05', '512', 1200000, 0), E('e2', '2026-10-07', '512', 0, 300000), E('e3', '2026-10-12', '512', 50000, 0), E('e4', '2026-10-20', '512', 0, 70000), E('e5', '2026-10-06', '411', 5, 0), E('r1', '2026-10-08', '512', 999, 0, { reversed_by: 'r1-rev' }), E('r1-rev', '2026-10-09', '512', 0, 999, { reversal_of: 'r1' })];
const bl = bookLines(books, '512');
ok(bl.length === 4 && bl.every(b => b.amount !== 999 && b.amount !== -999), 'livres : seulement le compte demandé ; une écriture annulée et son annulation sont ignorées');
const st = parseStatement(parseCsv('Date;Libellé;Montant\n05/10/2026;V1;1200000\n09/10/2026;L;-300000\n15/10/2026;Frais;-2500\n20/10/2026;X;-70000\n20/10/2026;X;-70000\n')).rows;
const r = reconcile(st, bl);
ok(r.matched.length === 3 && r.matched.some(m => m.statement.amount === 1200000 && m.days === 0) && r.matched.some(m => m.statement.amount === -300000 && m.days === 2), 'rapprochés : même montant, date à 3 jours près (le plus proche d\'abord)');
ok(r.statementOnly.length === 2 && r.statementOnly.some(s => s.amount === -2500) && r.statementOnly.some(s => s.amount === -70000), 'relevé seulement : les frais et le 2e « -70 000 » (une ligne des livres ne sert qu\'une fois)');
ok(r.bookOnly.length === 1 && r.bookOnly[0].entry_id === 'e3', 'livres seulement : e3 (dans la période du relevé, absente du relevé)');
ok(r.gap === r.statementOnlyTotal - r.bookOnlyTotal && r.gap === -2500 - 70000 - 50000, 'écart = relevé seulement − livres seulement');
ok(r.duplicates.join() === '5,6' && r.from === '2026-10-05' && r.to === '2026-10-20', 'doublons possibles signalés ; période du relevé');
ok(reconcile(st, bl, 0).matched.length === 2, 'tolérance 0 jour : le virement décalé de 2 jours n\'est plus rapproché');
const far = reconcile([{ line: 2, date: '2026-10-05', label: '', amount: 10 }], [{ entry_id: 'z', date: '2026-10-20', label: '', amount: 10 }]);
ok(far.matched.length === 0 && far.bookOnly.length === 0 && far.statementOnly.length === 1, 'ligne des livres hors période du relevé : ignorée');
const emp = reconcile([], bl);
ok(emp.matched.length === 0 && emp.bookOnly.length === 0 && emp.gap === 0, 'relevé vide : rien');
// on ne modifie pas ses entrées
const stCopy = JSON.stringify(st), blCopy = JSON.stringify(bl); reconcile(st, bl);
ok(JSON.stringify(st) === stCopy && JSON.stringify(bl) === blCopy, 'les données reçues ne sont pas modifiées');

// écran et démo : branchement
const page = fs.readFileSync('src/views/admin/AccountingPage.tsx', 'utf8');
ok(/'recon'/.test(page) && /parseStatement\(/.test(page) && /reconcile\(/.test(page) && /bookLines\(/.test(page), 'page Comptabilité : onglet Rapprochement branché');
ok(!/db\.(postEntry|accountingSync)[^;]*recon/i.test(page.slice(page.indexOf("tab === 'recon'"))), 'le rapprochement n\'écrit rien tout seul');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
