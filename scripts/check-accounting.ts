// Contrôle des règles de comptabilité (module 14, M14.1), sans réseau ni écran. Lancer : npm run check:accounting
import { PLAN, JOURNALS, cleanEntry, reverseEntry, entryIdFor, ledger, trialBalance, incomeStatement, balanceSheet, vatSummary, fiscalYearOf, assignNumbers, isDate, accountOf, classOf, totals, entryReasonText, type Entry } from '../src/utils/accounting';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const L = (account: string, debit: number, credit: number) => ({ account, debit, credit });
const E = (p: any = {}) => ({ id: 'e1', date: '2026-10-05', journal: 'VT', ref: 'FA-0001', label: 'Facture FA-0001', lines: [L('411', 1200, 0), L('706', 0, 1000), L('4457', 0, 200)], ...p });
const good = (p?: any, closed = '') => cleanEntry(E(p), closed) as any;
const bad = (p: any, reason: string, name: string, closed = '') => { const r = good(p, closed); ok(!r.ok && r.reason === reason, name); };

// plan
ok(new Set(PLAN.map(a => a.code)).size === PLAN.length, 'plan : aucun code en double');
ok(PLAN.every(a => /^[1-7]\d{2,3}$/.test(a.code) && a.fr && a.en), 'plan : codes à 3 ou 4 chiffres (classes 1 à 7), noms FR et EN');
ok(PLAN.every(a => (classOf(a.code) === 6) === (a.kind === 'expense') && (classOf(a.code) === 7) === (a.kind === 'income')), 'plan : classe 6 = charges, classe 7 = produits');
ok(['401', '411', '421', '425', '4456', '4457', '512', '514', '531', '641', '706'].every(c => accountOf(c)), 'plan : comptes nécessaires aux écritures automatiques présents');
ok(Object.keys(JOURNALS).length === 7 && Object.values(JOURNALS).every(j => j[0] && j[1]), 'journaux : 7, noms FR et EN');

// écriture valide
const g = good();
ok(g.ok && g.entry.lines.length === 3 && totals(g.entry.lines).debit === 1200, 'écriture équilibrée acceptée');
ok(good({ lines: [{ account: '411', debit: 100 }, { account: '706', credit: 100 }] }).ok, 'ligne sans le champ vide (débit ou crédit absent) acceptée');
ok(good({ label: '<b>x</b>' }).entry.label === 'bx/b' && good({ label: 'x'.repeat(500) }).entry.label.length === 200, 'libellé nettoyé et coupé à 200');
ok(!('zzz' in good({ zzz: 1, lines: [{ ...L('411', 5, 0), zzz: 9 }, L('706', 0, 5)] }).entry) && !('zzz' in good({ lines: [{ ...L('411', 5, 0), zzz: 9 }, L('706', 0, 5)] }).entry.lines[0]), 'champs inconnus ignorés');
ok(good({ source: { type: 'invoice', id: 'i1' } }).entry.source.type === 'invoice' && !('source' in good({ source: { type: '', id: '' } }).entry), 'origine gardée si complète');
// refus
bad({ id: '' }, 'id', 'identifiant vide refusé');
bad({ date: '2026-02-30' }, 'date', 'date impossible refusée');
bad({ date: '05/10/2026' }, 'date', 'date mal écrite refusée');
bad({ date: 20261005 }, 'date', 'date nombre refusée');
bad({ journal: 'XX' }, 'journal', 'journal inconnu refusé');
bad({ label: '   ' }, 'label', 'libellé vide refusé');
bad({ lines: [L('411', 100, 0)] }, 'lines', 'une seule ligne refusée');
bad({ lines: [] }, 'lines', 'aucune ligne refusée');
bad({ lines: 'x' }, 'lines', 'lignes non tableau refusées');
bad({ lines: Array.from({ length: 41 }, (_, i) => (i % 2 ? L('706', 0, 1) : L('411', 1, 0))) }, 'lines', '41 lignes refusées');
bad({ lines: [L('999', 100, 0), L('706', 0, 100)] }, 'account', 'compte hors plan refusé');
bad({ lines: [{ account: 411, debit: 100, credit: 0 }, L('706', 0, 100)] }, 'account', 'compte qui n\'est pas un texte refusé');
bad({ lines: [L('411', 100.5, 0), L('706', 0, 100.5)] }, 'amount', 'montant à virgule refusé');
bad({ lines: [L('411', -100, 0), L('706', 0, -100)] }, 'amount', 'montant négatif refusé');
bad({ lines: [L('411', 100, 0), { account: '706', debit: 0, credit: '100' }] }, 'amount', 'montant texte refusé');
bad({ lines: [L('411', 1e13, 0), L('706', 0, 1e13)] }, 'amount', 'montant énorme refusé');
bad({ lines: [L('411', NaN, 0), L('706', 0, 0)] }, 'amount', 'montant NaN refusé');
bad({ lines: [L('411', 100, 100), L('706', 0, 0)] }, 'line', 'ligne à la fois débit et crédit refusée');
bad({ lines: [L('411', 100, 0), L('706', 0, 0), L('4457', 0, 100)] }, 'line', 'ligne à zéro refusée');
bad({ lines: [L('411', 1200, 0), L('706', 0, 1000), L('4457', 0, 199)] }, 'unbalanced', 'écriture déséquilibrée d\'un Ariar refusée');
ok(!(cleanEntry(null) as any).ok && !(cleanEntry([]) as any).ok && !(cleanEntry('x') as any).ok, 'écriture vide, tableau ou texte refusée');
// période close
bad({ date: '2026-09-30' }, 'closed', 'écriture dans une période close refusée', '2026-09-30');
bad({ date: '2026-08-01' }, 'closed', 'écriture avant la clôture refusée', '2026-09-30');
ok(good({ date: '2026-10-01' }, '2026-09-30').ok, 'écriture le lendemain de la clôture acceptée');
ok(good({ date: '2026-09-30' }, '').ok, 'sans clôture : aucune limite');

// identifiant et contre-passation
ok(entryIdFor({ type: 'invoice', id: 'abc' }) === 'je-invoice-abc' && entryIdFor({ type: 'invoice', id: 'abc' }) === entryIdFor({ type: 'invoice', id: 'abc' }), 'identifiant automatique toujours le même pour la même pièce');
const rev = reverseEntry(g.entry, '2026-10-20', 'e1-rev');
ok(rev.reversal_of === 'e1' && rev.lines[0].debit === 0 && rev.lines[0].credit === 1200 && rev.lines[1].debit === 1000 && (cleanEntry(rev) as any).ok, 'contre-passation : débit et crédit échangés, valide');
ok(totals(g.entry.lines).debit === 1200 && g.entry.lines[0].debit === 1200, 'l\'originale n\'est pas modifiée');
ok(trialBalance([g.entry, rev]).rows.every(r => r.balance_debit === 0 && r.balance_credit === 0), 'écriture + contre-passation = tous les soldes à zéro');
ok(vatSummary([g.entry, rev]).collected === 0, 'TVA : écriture et contre-passation s\'annulent');

// jeu d'écritures réaliste
const mk = (id: string, date: string, journal: string, lines: any[], label = id) => (cleanEntry({ id, date, journal, label, lines }) as any).entry as Entry;
const set: Entry[] = [
  mk('cap', '2026-01-02', 'OD', [L('512', 5000000, 0), L('101', 0, 5000000)]),
  mk('f1', '2026-03-10', 'VT', [L('411', 1200000, 0), L('706', 0, 1000000), L('4457', 0, 200000)]),
  mk('p1', '2026-03-25', 'BQ', [L('512', 700000, 0), L('411', 0, 700000)]),
  mk('d1', '2026-03-28', 'CA', [L('613', 300000, 0), L('531', 0, 300000)]),
  mk('f2', '2026-04-10', 'VT', [L('411', 600000, 0), L('706', 0, 600000)]),
  mk('a1', '2026-04-15', 'AC', [L('601', 200000, 0), L('4456', 40000, 0), L('401', 0, 240000)]),
];
ok(set.every(Boolean), 'jeu d\'essai : toutes les écritures sont valides');
const tb = trialBalance(set);
ok(tb.balanced && tb.debit === tb.credit && tb.debit === 5000000 + 1200000 + 700000 + 300000 + 600000 + 240000, 'balance : total débits = total crédits');
const is = incomeStatement(set);
ok(is.totalIncome === 1600000 && is.totalExpense === 500000 && is.result === 1100000, 'résultat : produits 1 600 000 − charges 500 000 = 1 100 000');
ok(incomeStatement(set, '2026-04-01', '2026-04-30').totalIncome === 600000 && incomeStatement(set, '2026-04-01', '2026-04-30').totalExpense === 200000, 'résultat d\'un seul mois');
const bs = balanceSheet(set, '2026-12-31');
ok(bs.balanced && bs.totalAssets === bs.totalLiabilities && bs.result === 1100000, 'bilan : actif = passif (avec le résultat)');
ok(bs.assets.find(a => a.account === '411')?.amount === 1100000 && bs.assets.find(a => a.account === '512')?.amount === 5700000, 'bilan : clients 1 100 000 et banque 5 700 000');
ok(balanceSheet(set, '2026-03-15').totalAssets === 5000000 + 1200000 && balanceSheet(set, '2026-03-15').balanced, 'bilan à une date passée : seulement ce qui est déjà écrit');
const vat = vatSummary(set);
ok(vat.collected === 200000 && vat.deductible === 40000 && vat.due === 160000, 'TVA : collectée 200 000 − déductible 40 000 = 160 000 à payer');
ok(vatSummary(set, '2026-04-01', '2026-04-30').due === -40000, 'TVA d\'un mois avec seulement du déductible = crédit de TVA négatif');
const lg = ledger(set, '411');
ok(lg.rows.length === 3 && lg.rows.map(r => r.balance).join() === '1200000,500000,1100000' && lg.closing === 1100000 && lg.opening === 0, 'grand livre : solde cumulé 1 200 000 → 500 000 → 1 100 000');
const lg2 = ledger(set, '411', '2026-04-01');
ok(lg2.opening === 500000 && lg2.rows.length === 1 && lg2.closing === 1100000, 'grand livre : solde de départ = ce qui précède la période');
ok(ledger(set, '999').rows.length === 0 && ledger([], '411').closing === 0, 'grand livre : compte sans mouvement ou aucune écriture = vide');
ok(ledger([...set].reverse(), '411').rows.map(r => r.entry_id).join() === lg.rows.map(r => r.entry_id).join(), 'grand livre : même ordre quel que soit l\'ordre de saisie');
// compte qui change de sens
const odd = [mk('o1', '2026-05-01', 'BQ', [L('411', 0, 1000), L('512', 1000, 0)])];
const bo = balanceSheet(odd, '2026-12-31');
ok(bo.balanced && bo.liabilities.some(l => l.account === '411' && l.amount === 1000), 'client créditeur : passe au passif, le bilan reste équilibré');

// au hasard : peu importe ce qu'on saisit, tout reste équilibré
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const codes = PLAN.map(a => a.code);
let made = 0, allBal = true;
const rand: Entry[] = [];
for (let i = 0; i < 400; i++) {
  const k = 2 + Math.floor(rnd() * 5), lines: any[] = [];
  let sum = 0;
  for (let j = 0; j < k - 1; j++) { const a = 1 + Math.floor(rnd() * 5_000_000), d = rnd() < 0.5; sum += d ? a : -a; lines.push(d ? L(codes[Math.floor(rnd() * codes.length)], a, 0) : L(codes[Math.floor(rnd() * codes.length)], 0, a)); }
  if (sum === 0) continue;
  lines.push(sum > 0 ? L(codes[Math.floor(rnd() * codes.length)], 0, sum) : L(codes[Math.floor(rnd() * codes.length)], -sum, 0));
  const r = cleanEntry({ id: 'r' + i, date: `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`, journal: 'OD', label: 'au hasard', lines }) as any;
  if (!r.ok) { allBal = false; continue; }
  made++; rand.push(r.entry);
}
ok(allBal && made > 300, `au hasard : ${made} écritures équilibrées créées toutes acceptées`);
ok(trialBalance(rand).balanced && balanceSheet(rand, '2026-12-31').balanced, 'au hasard : la balance et le bilan restent équilibrés');
const half = trialBalance(rand, '2026-01-01', '2026-06-30'), half2 = trialBalance(rand, '2026-07-01', '2026-12-31');
ok(half.debit + half2.debit === trialBalance(rand).debit && half.balanced && half2.balanced, 'au hasard : deux semestres = l\'année');
ok(rand.every(e => { const r = cleanEntry(reverseEntry(e, '2026-12-31', e.id + '-r')) as any; return r.ok; }) && trialBalance([...rand, ...rand.map(e => reverseEntry(e, '2026-12-31', e.id + '-r'))]).rows.every(r => r.balance_debit === 0 && r.balance_credit === 0), 'au hasard : contre-passer tout remet tout à zéro');

// exercice et dates
ok(JSON.stringify(fiscalYearOf('2026-10-24')) === '{"start":"2026-01-01","end":"2026-12-31"}', 'exercice civil : 1er janvier au 31 décembre');
ok(JSON.stringify(fiscalYearOf('2026-02-10', 7)) === '{"start":"2025-07-01","end":"2026-06-30"}' && JSON.stringify(fiscalYearOf('2026-07-01', 7)) === '{"start":"2026-07-01","end":"2027-06-30"}', 'exercice à cheval sur deux années (juillet à juin)');
ok(JSON.stringify(fiscalYearOf('2028-03-05', 3)) === '{"start":"2028-03-01","end":"2029-02-28"}' && fiscalYearOf('2026-13-01') === null && fiscalYearOf('2026-10-24', 13) === null && fiscalYearOf('2026-10-24', 0) === null, 'exercice : année bissextile, date et mois faux = null');
ok(isDate('2028-02-29') && !isDate('2027-02-29') && !isDate('1999-12-31') && !isDate('2101-01-01'), 'dates : bissextile, bornes 2000 à 2100');
ok(entryReasonText('unbalanced').includes('déséquilibrée') && entryReasonText('unbalanced', 'en').includes('Unbalanced') && entryReasonText('zzz') === 'Écriture refusée.', 'messages FR/EN');

// numérotation locale = celle du serveur
{
  const mk2 = (id: string, date: string, number?: string) => ({ id, date, journal: 'OD', label: id, lines: [], number }) as any;
  const a = assignNumbers([mk2('b', '2026-03-02'), mk2('a', '2026-03-02'), mk2('z', '2025-12-31'), mk2('c', '2026-01-05')], []);
  ok(a.map(e => `${e.id}:${e.number}`).join() === 'z:EC-2025-0001,c:EC-2026-0001,a:EC-2026-0002,b:EC-2026-0003', 'numéros : dans l\'ordre des dates puis des identifiants, une suite par année');
  const b2 = assignNumbers([mk2('n', '2026-05-01')], [mk2('x', '2026-01-01', 'EC-2026-0007'), mk2('y', '2025-01-01', 'EC-2025-0100')]);
  ok(b2[0].number === 'EC-2026-0008', 'numéros : à la suite des numéros existants de la même année');
  ok(assignNumbers([], []).length === 0 && assignNumbers([mk2('q', '2026-01-01')], [mk2('w', '2026-01-01', 'sans numéro')])[0].number === 'EC-2026-0001', 'numéros : rien à numéroter, ou un numéro existant illisible, ne plante pas');
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
