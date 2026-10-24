// Contrôle de la page « Direction » (M8.1) : AUCUN nouveau calcul. Chaque chiffre est comparé à celui de sa règle d'origine, sur la démo et sur des cas piégés.
// Lancer : npm run check:direction
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.fetch = async () => { throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { directionSummary, DIRECTION_LIMITS } = await import('../src/utils/direction');
const { computeFinance } = await import('../src/utils/financeStats');
const { invoiceFigures } = await import('../src/utils/invoiceStats');
const { toChase } = await import('../src/utils/receivables');
const { stockRows } = await import('../src/utils/stock');
const { periodRange } = await import('../src/utils/stats');
const { computePerformance, rankByScore } = await import('../src/utils/performanceScore');
const { performanceInput } = await import('../src/utils/usePerformance');
const { getHealth } = await import('../src/utils/healthDb');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (o: unknown) => /NaN|Infinity|undefined|\[object/.test(JSON.stringify(o, (_k, v) => (v === undefined ? 'undefined' : typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v)));

db.enterDemo('admin');
const s: any = db.getSettings();
const today = todayMada();
const ranking = rankByScore(computePerformance(performanceInput()));
const alerts = getHealth().alerts;
const input = (over: any = {}) => ({
  today, cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), clients: db.getClients(), invoices: db.getInvoices(), products: db.getProducts(), moves: db.getStockMoves(),
  prices: s, pricePerMission: s.price_per_mission || 0, ranking, alerts, ...over,
});
const sum = directionSummary(input());
const month = periodRange('month', today);

// ---- chaque chiffre = celui de sa règle d'origine
const fin = computeFinance({ cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), prices: s, pricePerMission: s.price_per_mission || 0, clients: db.getClients() }, 'month', month);
const inv = invoiceFigures({ invoices: db.getInvoices(), cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), clients: db.getClients(), prices: s, today, range: { start: month.start, end: month.end } });
ok(sum.month.start === month.start && sum.month.end === month.end, 'le mois est celui de la période « mois » des Statistiques');
ok(sum.money.received === fin.received && sum.money.out === fin.totalOut && sum.money.profit === fin.profit && sum.money.marginPct === fin.marginPct && sum.money.treasury === fin.treasury, 'argent : encaissé, dépenses + salaires, bénéfice, marge, trésorerie = Finances');
ok(sum.money.profit === sum.money.received - sum.money.out, 'bénéfice = encaissé − dépenses (la règle des Finances)');
ok(sum.revenue.estimated === (inv.issued_count === 0) && sum.revenue.amount === (inv.issued_count > 0 ? inv.issued_total : fin.billed) && sum.revenue.invoices === inv.issued_count, 'chiffre d\'affaires : factures émises du mois, sinon missions validées (marqué estimé)');
const chase = toChase(db.getInvoices(), db.getCash(), today, Object.fromEntries(db.getClients().map(c => [c.id, c.name])));
ok(sum.receivables.total === chase.reduce((t, r) => t + r.total, 0) && sum.receivables.clients === chase.length && sum.receivables.top.length === Math.min(chase.length, DIRECTION_LIMITS.chase) && sum.receivables.top.every((r, k) => r === chase[k] || JSON.stringify(r) === JSON.stringify(chase[k])), 'créances en retard = les relances (total, nombre de clients, les plus en retard d\'abord)');
ok(sum.receivables.unbilledTotal === inv.unbilled_total, 'missions pas encore facturées = Facturation');
ok(JSON.stringify(sum.topClients) === JSON.stringify(fin.clients.slice(0, 5)) && sum.topClients.length <= DIRECTION_LIMITS.clients, 'meilleurs clients = classement des Finances (5 au plus)');
const rows = stockRows(db.getProducts(), db.getStockMoves()).filter(r => r.low || r.negative);
ok(sum.stock.count === rows.length && sum.stock.rows.length === Math.min(rows.length, 5) && sum.stock.rows.every(r => r.low || r.negative), 'stock critique = voyant rouge du Stock ou quantité négative');
ok(JSON.stringify(sum.topEmployees.map(e => e.id)) === JSON.stringify(ranking.filter(r => r.score !== null).slice(0, 3).map(r => r.id)) && sum.topEmployees.length <= 3, 'meilleurs salariés = classement du module Performance (3 au plus)');
ok(sum.alerts.urgent === alerts.filter(a => a.severity === 'urgent').length && sum.alerts.watch === alerts.filter(a => a.severity === 'watch').length && sum.alerts.top.length <= 5 && sum.alerts.top.every(a => a.severity !== 'info'), 'alertes = Santé du site (compteurs, 5 au plus, jamais les « info »)');
ok(JSON.stringify(sum.alerts.top.map(a => a.id)) === JSON.stringify(alerts.filter(a => a.severity !== 'info').slice(0, 5).map(a => a.id)), 'alertes : même ordre que la Santé du site');
ok(!bad(sum), 'démo : aucun NaN, Infinity ni undefined');
ok(JSON.stringify(directionSummary(input())) === JSON.stringify(sum), 'même données = même résultat');

// ---- sans aucune donnée
const empty = directionSummary({ today, cash: [], posts: [], contracts: [], clients: [], invoices: [], products: [], moves: [], prices: {} as any, pricePerMission: 0, ranking: [], alerts: [] });
ok(!bad(empty) && empty.revenue.amount === 0 && empty.revenue.estimated === true && empty.money.profit === 0 && empty.receivables.total === 0 && empty.receivables.oldestDays === 0 && empty.topClients.length === 0 && empty.topEmployees.length === 0 && empty.stock.count === 0 && empty.alerts.top.length === 0, 'aucune donnée : tout à zéro, rien ne plante');
ok(directionSummary({ ...input(), ranking: [{ id: 'a', name: 'A', score: null, rank: null }, { id: 'b', name: 'B', score: 80, rank: 1 }] }).topEmployees.length === 1, 'un salarié sans score (pas assez de données) n\'est jamais dans le top');
ok(directionSummary({ ...input(), ranking: Array.from({ length: 9 }, (_, k) => ({ id: 'e' + k, name: 'E' + k, score: 90 - k, rank: k + 1 })) }).topEmployees.map(e => e.id).join() === 'e0,e1,e2', 'top salariés : 3 premiers, dans l\'ordre');

// ---- stock piégé : seuil 0 à 0 pas critique ; négatif d'abord
const P = (id: string, name: string, thr: number) => ({ id, name, category: '', unit: 'unité', buy_price_ar: 100, sell_price_ar: 150, alert_threshold: thr, created_at: '2026-01-01T00:00:00Z' }) as any;
const M = (id: string, pid: string, type: string, qty: number) => ({ id, product_id: pid, type, qty, date: '2026-10-01', created_at: '2026-10-01T00:00:00Z' }) as any;
const st = directionSummary({ ...input({ products: [P('p1', 'Sans suivi', 0), P('p2', 'Bas', 5), P('p3', 'Négatif', 5), P('p4', 'Bon', 5), P('p5', 'Épuisé', 5)], moves: [M('m2', 'p2', 'in', 3), M('m3', 'p3', 'out', 2), M('m4', 'p4', 'in', 50), M('m5', 'p5', 'in', 5), M('m6', 'p5', 'out', 5)] }) }).stock;
ok(st.rows.map(r => r.product.id).join() === 'p3,p5,p2' && st.count === 3 && st.negative === 1 && st.empty === 2, 'stock : négatif, puis épuisé, puis bas ; produit sans seuil et produit en règle absents');

// ---- alertes : « info » jamais dans le top, compteurs justes
const A = (id: string, sev: string) => ({ id: `team:r:${id}`, page: 'team', rule: 'r', severity: sev, title_fr: 't', title_en: 't', why_fr: 'w', why_en: 'w', since: null, go: { view: 'x' } }) as any;
const al = directionSummary({ ...input(), alerts: [A('1', 'urgent'), A('2', 'info'), A('3', 'watch'), A('4', 'watch'), A('5', 'watch'), A('6', 'watch'), A('7', 'watch'), A('8', 'watch')] }).alerts;
ok(al.urgent === 1 && al.watch === 6 && al.info === 1 && al.top.length === 5 && al.top[0].id === 'team:r:1' && !al.top.some(a => a.severity === 'info'), 'alertes : compteurs justes, 5 au plus, urgentes en premier, jamais « info »');

// ---- créances : tout est en retard si on avance de 2 ans
const late = directionSummary(input({ today: '2028-10-24' }));
const lateChase = toChase(db.getInvoices(), db.getCash(), '2028-10-24', Object.fromEntries(db.getClients().map(c => [c.id, c.name])));
ok(late.receivables.total === lateChase.reduce((t, r) => t + r.total, 0) && late.receivables.oldestDays === Math.max(0, ...lateChase.map(r => r.max_days)) && late.receivables.top.length <= 3, 'créances : deux ans plus tard, mêmes chiffres que les relances');
ok(late.month.start === '2028-10-01' && late.month.end === '2028-10-31', 'mois de la page = mois de la date donnée');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
