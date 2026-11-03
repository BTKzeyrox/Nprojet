// Contrôle des paiements annulés (Module 23, M23.3a) : la paire « paiement + correction » s'annule partout, et les écrans de chiffres lisent la caisse « nette ».
// Lancer : npm run check:cash-void
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { cashEffective, voidPairs, voidedPaymentIds } from '../src/utils/cashVoid';
import { cashSinceStart, treasuryCharts } from '../src/utils/treasuryCharts';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

const E = (id: string, kind: 'in' | 'out', amount_ar: number, extra: any = {}) => ({ id, kind, category: kind === 'in' ? 'Paiement client' : 'Loyer', amount_ar, date: '2026-10-05', note: '', ...extra });
const balance = (l: any[]) => l.reduce((t, c) => t + (c.kind === 'in' ? c.amount_ar : -c.amount_ar), 0);

const pay = E('p1', 'in', 5000, { invoice_id: 'f1' });
const fix = E('v1', 'out', 5000, { invoice_id: 'f1', void_of: 'p1', category: 'Correction de paiement' });
const other = E('o1', 'in', 2000, { invoice_id: 'f2' });
const rent = E('r1', 'out', 700);

// ---------- rien ne change sans correction
const plain = [pay, other, rent];
ok(cashEffective(plain) === plain, 'sans ligne de correction : la liste est rendue telle quelle (même objet), aucun changement d\'aujourd\'hui');
ok(cashEffective([]).length === 0 && voidPairs([]).size === 0, 'caisse vide : rien');
ok((() => { try { cashEffective(null as any); cashEffective(undefined as any); return true; } catch { return false; } })(), 'liste absente : pas de plantage');

// ---------- la paire s'annule
const all = [pay, other, fix, rent];
const eff = cashEffective(all);
ok(eff.length === 2 && eff.every(c => c.id === 'o1' || c.id === 'r1'), 'paiement + correction retirés, le reste est gardé');
ok(balance(eff) === balance(all) && balance(all) === 2000 - 700, 'le solde de la caisse est le même avec ou sans la paire');
ok(voidedPaymentIds(all).has('p1') && voidedPaymentIds(all).size === 1, 'ids des paiements annulés : p1');
ok(all.length === 4, 'la liste d\'origine n\'est pas modifiée (jamais de suppression)');

// ---------- ce qui n'est PAS une paire valable reste visible
const keep = (list: any[], name: string) => ok(cashEffective(list).length === list.length && voidPairs(list).size === 0, name);
keep([pay, { ...fix, amount_ar: 4000 }], 'montants différents : pas une paire, tout reste visible');
keep([pay, { ...fix, invoice_id: 'f9' }], 'autre facture : pas une paire');
keep([pay, { ...fix, kind: 'in' }], 'correction qui n\'est pas une sortie : pas une paire');
keep([{ ...pay, kind: 'out' }, fix], 'le « paiement » cité est une sortie : pas une paire');
keep([fix], 'correction sans son paiement : reste visible (anomalie à voir)');
keep([E('p3', 'in', 5000), { ...fix, void_of: 'p3' }], 'paiement sans facture : pas une paire (seuls les paiements de factures s\'annulent)');
const twice = cashEffective([pay, fix, { ...fix, id: 'v2' }]);
ok(twice.length === 1 && twice[0].id === 'v2', 'un paiement ne s\'annule qu\'une fois : la 2e correction reste visible');
ok(cashEffective([null, undefined, { id: 5 }, pay, fix] as any).length === 3, 'lignes abîmées : aucun plantage');

// ---------- les chiffres ne bougent pas avec la paire
const TODAY = '2026-10-10';
ok(cashSinceStart(cashEffective(all) as any, TODAY).balance === cashSinceStart(plain.filter(c => c.id !== 'p1') as any, TODAY).balance, 'en caisse depuis le début : pareil que si le paiement n\'avait jamais existé');
const withPair = treasuryCharts(cashEffective(all) as any, { start: '2026-10-01', end: '2026-10-31' }, TODAY);
const without = treasuryCharts(plain.filter(c => c.id !== 'p1') as any, { start: '2026-10-01', end: '2026-10-31' }, TODAY);
ok(JSON.stringify(withPair.inflow) === JSON.stringify(without.inflow) && JSON.stringify(withPair.outflow) === JSON.stringify(without.outflow), 'trésorerie : reçu et dépenses du mois identiques avec ou sans la paire (la correction ne compte pas comme une dépense)');

// ---------- garde-fou : qui lit la caisse complète, qui lit la caisse nette
const RAW_OK = ['src/db/store.ts', 'src/views/admin/InvoicesView.tsx', 'src/views/admin/FinanceTab.tsx', 'src/utils/backupExcel.ts', 'src/utils/healthDb.ts'];
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const files = walk('src');
const raw = files.filter(f => /db\.getCash\(\)/.test(readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')));
ok(raw.every(f => RAW_OK.includes(f)), `seuls ces fichiers lisent la caisse complète : ${RAW_OK.filter(f => f !== 'src/db/store.ts').join(', ')} (autres trouvés : ${raw.filter(f => !RAW_OK.includes(f)).join(', ') || 'aucun'})`);
const net = files.filter(f => /db\.getCashNet\(\)/.test(readFileSync(f, 'utf8')));
ok(['TreasuryPage', 'TreasuryCharts', 'DirectionPage', 'FinanceInsights', 'BudgetsCard', 'PlanVsActualCard', 'ReportTab', 'ClientsPage', 'GraphsMoney', 'AutoReportCard', 'GoalsPanel', 'alertsDb', 'clientBadgesDb', 'snapshotDb'].every(k => net.some(f => f.includes(k))), 'les 14 écrans et outils de chiffres lisent la caisse nette');
const store = readFileSync('src/db/store.ts', 'utf8');
ok(/getCashNet\(\): CashEntry\[\] \{ return cashEffective\(this\.cash\); \}/.test(store), 'la caisse nette passe par cashEffective');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
