// Contrôle des chiffres financiers (sans réseau). Lancer : npm run check:finance-stats
import { computeFinance } from '../src/utils/financeStats';
import { periodRange } from '../src/utils/stats';
import type { CashEntry, ClientContract, PostSession } from '../src/types';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

const cash = (id: string, kind: 'in' | 'out', amount_ar: number, date: string, category: string, client_name = ''): CashEntry => ({ id, kind, amount_ar, date, category, note: '', client_name, created_by: 'a', created_at: date } as unknown as CashEntry);
const post = (id: string, n: number, date: string, hour: string, sal: number, price?: number): PostSession => ({ id, post_number: n, client_name: `M${n}`, date, start_time: hour, status: 'completed', calculated_ar: sal, client_price_ar: price } as unknown as PostSession);
const contract = (n: number, type: string): ClientContract => ({ id: `c${n}`, post_number: n, client_name: `M${n}`, post_type: type } as unknown as ClientContract);

const range = periodRange('month', '2026-10-15');
const input = {
  cash: [
    cash('1', 'in', 100000, '2026-10-05', 'Paiement client', 'Client A'),
    cash('2', 'in', 50000, '2026-10-20', 'Paiement client', 'Client B'),
    cash('3', 'in', 30000, '2026-10-21', 'Paiement client', 'Client A'),
    cash('4', 'out', 20000, '2026-10-06', 'Loyer'),
    cash('5', 'out', 5000, '2026-10-07', 'Internet'),
    cash('6', 'in', 999999, '2026-09-30', 'Paiement client', 'Client Z'), // hors période
  ],
  posts: [post('p1', 1, '2026-10-03', '08:00:00', 5000, 12000), post('p2', 2, '2026-10-10', '09:00:00', 5000, 12000), post('p3', 3, '2026-10-11', '10:00:00', 4000, 8000), post('p4', 1, '2026-09-10', '08:00:00', 5000, 12000)],
  contracts: [contract(1, 'Saisie'), contract(2, 'Saisie'), contract(3, 'Support')],
  prices: { client_price_default_ar: 0, client_prices_by_type: {} },
  pricePerMission: 5000,
};
const f = computeFinance(input, 'month', range);

ok(f.received === 180000, 'reçu = 100 000 + 50 000 + 30 000 (septembre exclu)');
ok(f.spent === 25000, 'dépenses saisies = 25 000');
ok(f.salaries === 14000, 'salaires = 5 000 + 5 000 + 4 000');
ok(f.totalOut === 39000, 'dépenses totales = saisies + salaires');
ok(f.profit === f.received - f.totalOut && f.profit === 141000, 'bénéfice = reçu − dépenses (141 000)');
ok(f.marginPct === 78, 'marge = 141 000 ÷ 180 000 = 78 %');
ok(f.billed === 32000, 'facturé = prix figés 12 000 + 12 000 + 8 000');
ok(f.toCollect === 0, 'à encaisser jamais négatif (reçu > facturé)');
ok(f.done === 3 && f.costPerMission === 13000 && f.gainPerMission === 47000, 'coût et gain par mission (39 000 ÷ 3, 141 000 ÷ 3)');
ok(f.bestClient?.name === 'Client A' && f.bestClient.amount === 130000, 'meilleur client = Client A (130 000)');
ok(f.clients.length >= 1 && f.clients[0].name === 'Client A' && f.clients[0].amount === 130000 && f.clients.every((c, i, a) => i === 0 || a[i - 1].amount >= c.amount), 'classement des clients : du plus gros au plus petit, le premier = le meilleur client');
ok(f.clients.reduce((t, c) => t + c.amount, 0) <= f.received, 'classement des clients : leur total ne dépasse jamais l\'argent reçu');
const saisie = f.byType.find(r => r.type === 'Saisie');
ok(!!saisie && saisie.done === 2 && saisie.billed === 24000 && saisie.margin === 14000 && saisie.marginPct === 58, 'marge du type Saisie : 24 000 − 10 000 = 14 000 (58 %)');
ok(f.byType[0].type === 'Saisie' || f.byType[0].margin >= f.byType[1].margin, 'types triés par marge');
ok(f.expensesByCategory.reduce((t, c) => t + c.value, 0) === f.totalOut, 'anneau des dépenses = dépenses totales');
ok(f.expensesByCategory.some(c => c.label === 'Salaires' && c.value === 14000), 'salaires dans l\'anneau');
ok(f.treasury === (100000 + 50000 + 30000 + 999999 - 25000) - (14000 + 5000), 'trésorerie = tout reçu − toutes dépenses − tous salaires (septembre compris)');
ok(f.series.inflow.length === f.labels.length && f.series.inflow.reduce((a, b) => a + b, 0) === f.received, 'barres des entrées = reçu');
ok(f.series.outflow.reduce((a, b) => a + b, 0) === f.totalOut, 'barres des sorties = dépenses totales');
ok(f.series.cumulative[f.series.cumulative.length - 1] === f.profit, 'dernier point du cumul = bénéfice');
ok(f.series.billed.reduce((a, b) => a + b, 0) === f.billed, 'barres du facturé = facturé');

// Cas limites
const empty = computeFinance({ ...input, cash: [], posts: [] }, 'month', range);
ok(empty.profit === 0 && empty.marginPct === null && empty.costPerMission === null && empty.bestClient === null && empty.clients.length === 0 && empty.byType.length === 0, 'période vide : zéros, pas de division par 0');
const loss = computeFinance({ ...input, cash: [cash('x', 'in', 1000, '2026-10-02', 'Paiement client'), cash('y', 'out', 9000, '2026-10-03', 'Achats')], posts: [] }, 'month', range);
ok(loss.profit === -8000 && loss.marginPct === -800, 'perte : bénéfice et marge négatifs');
const noPrice = computeFinance({ ...input, posts: [post('q', 9, '2026-10-04', '08:00:00', 5000)], contracts: [] }, 'month', range);
ok(noPrice.billed === 0 && noPrice.toCollect === 0, 'prix client 0 : facturé 0, pas d\'erreur');
for (const g of ['day', 'week', 'year'] as const) {
  const r = periodRange(g, '2026-10-15');
  const x = computeFinance(input, g, r);
  ok(x.series.inflow.length === x.labels.length && x.series.cumulative.every(Number.isFinite), `granularité ${g} : séries complètes, nombres valides`);
}
// M1.6 : « meilleur client » et classement avec les fiches clients
{
  const recs = [{ id: 'k1', name: 'Client A' }, { id: 'k2', name: 'Client B' }, { id: 'k3', name: 'Doublon' }, { id: 'k4', name: 'doublon' }] as any[];
  const cs = [cash('a1', 'in', 40000, '2026-10-02', 'Paiement client', 'client  a'), cash('a2', 'in', 30000, '2026-10-03', 'Paiement client', 'CLIENT A'), cash('b1', 'in', 50000, '2026-10-04', 'Paiement client', 'Client B'),
    cash('x1', 'in', 20000, '2026-10-05', 'Paiement client', 'Inconnu SA'), cash('d1', 'in', 5000, '2026-10-06', 'Paiement client', 'Doublon')];
  const g = computeFinance({ ...input, cash: cs, clients: recs }, 'month', range);
  ok(g.bestClient?.name === 'Client A' && g.bestClient.amount === 70000 && g.bestClient.id === 'k1', 'avec fiches : « client  a » et « CLIENT A » comptent pour la fiche « Client A » (70 000)');
  ok(g.clients.map(c => c.name).join('|') === 'Client A|Client B|Inconnu SA|Doublon', 'classement : fiches regroupées, nom sans fiche gardé tel quel, deux fiches de même nom = nom saisi');
  ok(g.clients.find(c => c.name === 'Inconnu SA')?.id === undefined && g.clients.find(c => c.name === 'Doublon')?.id === undefined, 'nom sans fiche ou ambigu : pas d\'identifiant');
  const h = computeFinance({ ...input, cash: cs }, 'month', range);
  ok(h.clients.length === 5 && h.clients.some(c => c.name === 'client  a') && h.clients.every(c => c.id === undefined), 'sans fiches : ancien comportement (noms saisis séparés)');
  ok(computeFinance({ ...input, cash: cs, clients: [] }, 'month', range).bestClient?.name === 'Client B', 'liste de fiches vide : ancien comportement');
}
const text = JSON.stringify(f);
ok(!/NaN|Infinity|null.*undefined/.test(text), 'aucun NaN ni Infinity');

console.log(`\n${n - fails}/${n} contrôles OK`);
process.exit(fails ? 1 : 0);
