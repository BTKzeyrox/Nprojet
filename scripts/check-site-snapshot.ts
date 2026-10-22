// Contrôle de l'instantané du site et de « Pourquoi ce chiffre ? » (M11.9). Pur, sans réseau. Lancer : npm run check:site-snapshot
import fs from 'node:fs';
import { buildSnapshot, explainFigure, FIGURE_IDS, type SnapshotInput } from '../src/utils/siteSnapshot';
import { computeFinance } from '../src/utils/financeStats';
import { periodRange } from '../src/utils/stats';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const demo = buildDemoData(), today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({ today, settings: { price_per_mission: 500, client_price_default_ar: 1500 }, users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock, advances: demo.advances, alerts: [], ...over });
const I = input();
const range = periodRange('month', today);
const f = computeFinance({ cash: I.cash, posts: I.posts, contracts: I.contracts, prices: { client_price_default_ar: 1500 } as any, pricePerMission: 500, clients: I.clients as any }, 'month', range);

// ---------- Instantané ----------
const s = buildSnapshot(I);
ok(s.as_of === today && s.period.start === range.start && s.period.end === range.end, 'instantané : date et période du mois');
ok(s.finance.received === f.received && s.finance.profit === f.profit && s.finance.margin_pct === f.marginPct && s.finance.to_collect === f.toCollect && s.finance.treasury === f.treasury, 'instantané : les chiffres d\'argent sont ceux de la page Finances');
ok(s.missions.validated === f.done, 'instantané : missions validées = celles de la page Finances');
ok(s.clients.total === demo.clients.length && Object.values(s.clients.by_status).reduce((t, x) => t + (x || 0), 0) === demo.clients.length, 'instantané : chaque client est compté une seule fois dans un statut');
ok(s.stock.products === demo.products.length && s.stock.value >= 0, 'instantané : stock compté, valeur jamais négative');
const json = JSON.stringify(s);
ok(!/NaN|undefined|null,"?\w*":NaN|Infinity/.test(json), 'instantané : aucun NaN ni undefined');
const names = [...demo.users.map(u => u.name), ...demo.clients.map(c => c.name), ...demo.products.map(p => p.name), ...demo.users.map(u => u.username)].filter(x => x && x.length > 3);
ok(names.every(nm => !json.includes(nm)), 'instantané : aucun nom de personne, de client ni de produit (jamais les données brutes)');
ok(json.length < 1500, `instantané : petit (${json.length} caractères) : il pourra être donné à un assistant sans fuite`);
ok(JSON.stringify(buildSnapshot(input({ posts: [...I.posts].reverse(), cash: [...I.cash].reverse() }))) === json, 'instantané : même résultat quel que soit l\'ordre des données');
const frozen = JSON.stringify(I); buildSnapshot(I); ok(JSON.stringify(I) === frozen, 'instantané : aucune donnée modifiée');
const e0 = buildSnapshot(input({ users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [] }));
ok(e0.finance.margin_pct === null && e0.missions.validated === 0 && e0.clients.total === 0 && e0.stock.value === 0, 'instantané : site vide = zéros et marge vide, sans plantage');
const al = buildSnapshot(input({ alerts: [{ id: 'team:a', page: 'team', severity: 'urgent' }, { id: 'stock:b', page: 'stock', severity: 'watch' }, { id: 'stock:c', page: 'stock', severity: 'info' }] as any }));
ok(al.health.urgent === 1 && al.health.watch === 1 && al.health.info === 1 && al.health.by_page.stock === 2, 'instantané : alertes comptées par gravité et par page (sans leur texte)');

// ---------- Pourquoi ce chiffre ? ----------
const ex = (id: any, over?: Partial<SnapshotInput>) => explainFigure(id, over ? input(over) : I);
ok(FIGURE_IDS.length === 12 && FIGURE_IDS.every(id => ex(id).id === id), 'explication : 12 chiffres expliqués');
const val = (id: string) => ex(id).value;
ok(val('received') === f.received && val('profit') === f.profit && val('margin') === f.marginPct && val('billed') === f.billed && val('toCollect') === f.toCollect && val('treasury') === f.treasury && val('expenses') === f.totalOut && val('salaries') === f.salaries && val('costPerMission') === f.costPerMission && val('gainPerMission') === f.gainPerMission && val('missionsDone') === f.done, 'explication : chaque valeur est EXACTEMENT celle de la page Finances');
const pr = ex('profit'); const sum = (pr.parts[0].value || 0) - (pr.parts[1].value || 0) - (pr.parts[2].value || 0);
ok(pr.parts.length === 4 && sum === pr.value, 'bénéfice : encaissé − dépenses − salaires = le chiffre montré');
const exp = ex('expenses');
ok((exp.parts[0].value || 0) + (exp.parts[1].value || 0) === exp.value, 'dépenses : saisies + salaires = le total');
const tc = ex('toCollect');
ok(Math.max(0, (tc.parts[0].value || 0) - (tc.parts[1].value || 0)) === tc.value, 'à encaisser : facturé − encaissé (jamais négatif)');
const mg = ex('margin');
ok(mg.value === null || mg.value === Math.round(((mg.parts[0].value || 0) / (mg.parts[1].value || 1)) * 100), 'marge : bénéfice ÷ encaissé');
const tr = ex('treasury'); ok(tr.period === null && Math.round((tr.parts[0].value || 0) - (tr.parts[1].value || 0) - (tr.parts[2].value || 0)) === tr.value, 'trésorerie : tout depuis le début, sans période');
for (const id of ['received', 'expenses', 'salaries', 'billed', 'missionsDone', 'stockValue']) {
  const e = ex(id);
  ok(e.lines.length <= 10 && e.lines.every((l, k) => k === 0 || e.lines[k - 1].value >= l.value), `${id} : au plus 10 lignes, de la plus grosse à la plus petite`);
  ok(e.total_lines >= e.lines.length, `${id} : le total de lignes est donné (${e.total_lines})`);
}
const rec = ex('received'); ok(rec.total_lines === I.cash.filter(c => c.kind === 'in' && c.date >= range.start && c.date <= range.end).length, 'argent reçu : nombre de lignes exact pour la période');
const sv = ex('stockValue'); ok(sv.lines.reduce((t, l) => t + l.value, 0) <= (sv.value || 0), 'stock : les lignes montrées ne dépassent pas la valeur totale');
// Période personnalisée
const yr = explainFigure('received', I, { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` });
ok(yr.period?.start === `${today.slice(0, 4)}-01-01` && (yr.value || 0) >= (val('received') || 0), 'période : une période choisie est respectée (l\'année contient le mois)');
// Données vides : rien d'inventé
const empty = input({ users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [] });
ok(explainFigure('margin', empty).value === null && !!explainFigure('margin', empty).missing, 'données vides : la marge est vide et l\'explication dit pourquoi');
ok(explainFigure('costPerMission', empty).value === null && !!explainFigure('costPerMission', empty).missing, 'données vides : coût par mission vide, avec la raison');
ok(FIGURE_IDS.every(id => { const e = explainFigure(id, empty); return !/NaN|undefined/.test(JSON.stringify(e)); }), 'données vides : aucun NaN ni undefined');
// Mission sans prix client
const noPrice = input({ settings: { price_per_mission: 500 }, clients: [], contracts: [], cash: [] });
ok(!!explainFigure('billed', noPrice).missing === (explainFigure('billed', noPrice).value === 0 && noPrice.posts.some(p => p.status === 'completed' && p.date >= range.start && p.date <= range.end)), 'prix client à 0 : l\'explication le signale quand il y a des missions');
// Textes
for (const id of FIGURE_IDS) {
  const e = ex(id), texts = [e.name, e.formula, e.sources, ...e.parts.map(p => p.label), ...(e.missing ? [e.missing] : [])];
  ok(texts.every(t => t.fr.trim() && t.en.trim()) && texts.every(t => !/[àâçéèêëîïôùûœ]/i.test(t.en)), `${id} : textes FR et EN présents, anglais sans accent français`);
}
// Sécurité et branchement
const glue = fs.readFileSync('src/utils/snapshotDb.ts', 'utf8');
ok(/role !== 'admin'\) return null/.test(glue), 'sécurité : sans admin, aucune donnée n\'est lue (contrôlé dans le code)');
const fi = fs.readFileSync('src/views/admin/FinanceInsights.tsx', 'utf8');
ok(['profit', 'margin', 'toCollect', 'treasury', 'costPerMission', 'gainPerMission'].every(id => fi.includes(`'${id}')`)), 'écran : les 6 chiffres de « Résultat de la période » ont leur bouton « Pourquoi ? »');
const t0 = Date.now(); for (const id of FIGURE_IDS) explainFigure(id, I); buildSnapshot(I);
ok(Date.now() - t0 < 500, `vitesse : instantané et 12 explications en ${Date.now() - t0} ms (limite 500)`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
