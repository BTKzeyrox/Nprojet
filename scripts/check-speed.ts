// Vitesse et quota (M8.3). 2 ans de données (≈17 500 missions, 10 000 lignes d'argent, 14 600 mouvements, 2 190 factures) : chaque calcul des écrans est chronométré,
// puis les appels au serveur « en boucle » sont inventoriés (le rythme est celui du code). Sans réseau. Lancer : npm run check:speed
import fs from 'node:fs';
import { buildDemoData } from '../src/demo/demoData';
import { runHealth } from '../src/utils/health/registry';
import { ALL_RULES } from '../src/utils/health/all';
import { HEALTH_THRESHOLDS_DEFAULT } from '../src/utils/health/types';
import { computeFinance } from '../src/utils/financeStats';
import { invoiceFigures } from '../src/utils/invoiceStats';
import { toChase } from '../src/utils/receivables';
import { agedBalance } from '../src/utils/invoices';
import { stockRows } from '../src/utils/stock';
import { periodRange } from '../src/utils/stats';
import { computePerformance, rankByScore } from '../src/utils/performanceScore';
import { directionSummary } from '../src/utils/direction';
import { buildSnapshot } from '../src/utils/siteSnapshot';
import { morningSummary, suggestionsReply, respond } from '../src/utils/assistant';
import { planHealthNotifs } from '../src/utils/healthNotif';

let n = 0, fails = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const LIMIT_MS = 2500; // un calcul d'écran qui dépasse 2,5 s sur 2 ans de données = échec
const time = <T,>(name: string, f: () => T): T => { const t = performance.now(); const r = f(); const ms = Math.round(performance.now() - t); ok(ms < LIMIT_MS, `${name} : ${ms} ms (limite ${LIMIT_MS} ms)`); return r; };

const demo: any = buildDemoData();
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const T0 = Date.parse(today + 'T00:00:00Z');
const U = demo.users.filter((u: any) => u.role === 'employee');
const posts: any[] = [], cash: any[] = [], moves: any[] = [], invoices: any[] = [];
for (let d = 0; d < 730; d++) {
  const date = new Date(T0 - d * 864e5).toISOString().slice(0, 10);
  for (let k = 0; k < 24; k++) { const s = demo.posts[(d * 24 + k) % demo.posts.length]; posts.push({ ...s, id: `big_${d}_${k}`, employee_id: U[k % U.length].id, date }); }
  for (let k = 0; k < 14; k++) { const s = demo.cash[(d * 14 + k) % demo.cash.length]; cash.push({ ...s, id: `bc_${d}_${k}`, date }); }
  for (let k = 0; k < 20; k++) { const s = demo.stock[(d * 20 + k) % demo.stock.length]; moves.push({ ...s, id: `bm_${d}_${k}`, date }); }
  for (let k = 0; k < 3; k++) { const s = demo.invoices[(d * 3 + k) % demo.invoices.length]; invoices.push({ ...s, id: `bi_${d}_${k}`, issue_date: date, due_date: date }); }
}
console.log(`jeu de données : ${posts.length} missions, ${cash.length} lignes d'argent, ${moves.length} mouvements, ${invoices.length} factures`);
ok(posts.length >= 17000 && cash.length >= 10000 && moves.length >= 14000 && invoices.length >= 2000, 'jeu de données de 2 ans bien constitué');

const settings = demo.settings?.[0] || demo.settings || {};
const prices = { client_price_default_ar: settings.client_price_default_ar, client_prices_by_type: settings.client_prices_by_type } as any;
const ppm = Number(settings.price_per_mission) || 0;
const base = { today, users: demo.users, posts, contracts: demo.contracts, clients: demo.clients, cash, products: demo.products, moves, advances: demo.advances || [] };
const month = periodRange('month', today), year = periodRange('year', today);

const health = time('Santé du site (toutes les règles)', () => runHealth({ ...base, now: Date.now(), settings: settings as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, purchases: [], invoices } as any, ALL_RULES));
ok(health.errors.length === 0, 'Santé du site : aucune règle en panne sur 2 ans');
const finIn = { cash, posts, contracts: demo.contracts, prices, pricePerMission: ppm, clients: demo.clients };
time('Finances du mois', () => computeFinance(finIn as any, 'month', month));
time('Finances de l\'année', () => computeFinance(finIn as any, 'year', year));
time('Facturation (chiffres du mois)', () => invoiceFigures({ invoices, cash, posts, contracts: demo.contracts, clients: demo.clients, prices, today, range: { start: month.start, end: month.end } } as any));
const names = Object.fromEntries(demo.clients.map((c: any) => [c.id, c.name]));
time('Créances à relancer', () => toChase(invoices, cash, today, names));
time('Balance âgée', () => agedBalance(invoices, cash, today));
time('Stock (lignes)', () => stockRows(demo.products, moves));
const perf = time('Performance de tous les salariés', () => computePerformance({ users: demo.users, posts, contracts: demo.contracts, today } as any));
const ranking = rankByScore(perf);
time('Page Direction', () => directionSummary({ today, cash, posts, contracts: demo.contracts, clients: demo.clients, invoices, products: demo.products, moves, prices, pricePerMission: ppm, ranking, alerts: health.alerts } as any));
const snapIn = { ...base, settings, alerts: health.alerts } as any;
time('Instantané du site (assistant)', () => buildSnapshot(snapIn));
time('Assistant : résumé du jour', () => morningSummary(snapIn, health.alerts));
time('Assistant : suggestions', () => suggestionsReply(snapIn, health.alerts));
time('Assistant : « Pourquoi ce chiffre ? »', () => respond('pourquoi ce chiffre le bénéfice', snapIn, health.alerts));
time('Assistant : récap d\'un employé', () => respond(`récap de ${U[0].name}`, snapIn, health.alerts));
time('Cloche : notifications de la Santé', () => planHealthNotifs(health.alerts, today, Date.now(), []));
// la page ne doit pas devenir plus lente à chaque écran : 5 calculs de suite restent dans la même limite
const t5 = performance.now(); for (let i = 0; i < 5; i++) runHealth({ ...base, now: Date.now(), settings: settings as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, purchases: [], invoices } as any, ALL_RULES); const ms5 = Math.round(performance.now() - t5);
ok(ms5 < LIMIT_MS * 3, `5 recalculs de la Santé de suite : ${ms5} ms (pas de ralentissement qui s'accumule)`);

// ---- quota : appels au serveur en boucle (code lu) ----
const store = fs.readFileSync('src/db/store.ts', 'utf8');
ok(/private pollMs = 20000/.test(store) && /setFastPoll[\s\S]{0,300}8000 : 20000/.test(store), 'rechargement : 20 s normalement, 8 s seulement quand la messagerie ou les actualités sont ouvertes');
ok(/idle > 10 \* 60 \* 1000\) return 3/.test(store) && /idle > 2 \* 60 \* 1000\) return 2/.test(store), 'rechargement : sans action depuis 2 min le délai double, depuis 10 min il triple');
ok(/document\.hidden\)\) void this\.pull\(\)/.test(store), 'rechargement : onglet caché = aucun appel');
ok(/this\.pulling/.test(store), 'rechargement : jamais deux appels en même temps');
const files = fs.readdirSync('src', { recursive: true }).map(String).filter(f => /\.(ts|tsx)$/.test(f));
const loops: string[] = [];
for (const f of files) { const t = fs.readFileSync(`src/${f}`, 'utf8'); for (const m of t.matchAll(/setInterval\(([\s\S]{0,160})/g)) loops.push(`${f}: ${m[1].split('\n')[0].slice(0, 90)}`); }
const KNOWN = ['ConnectionBanner.tsx', 'TopBar.tsx', 'ScrollButtons.tsx', 'QueueButton.tsx', 'DiagPanel.tsx', 'EmployeesManagement.tsx', 'updateWatcher.ts'];
ok(loops.every(l => KNOWN.some(k => l.includes(k))), `minuteurs : seulement ceux déjà connus (${loops.length}) ; un nouveau minuteur fait échouer ce contrôle`);
const timerCalls = loops.filter(l => /fetch|db\.|api\(|pull/.test(l.split(': ').slice(1).join(': ')));
ok(timerCalls.length === 0 || timerCalls.every(l => l.includes('updateWatcher.ts') || l.includes('ConnectionBanner.tsx')), 'minuteurs : à part le vérificateur de version (2 min) et la bannière de connexion, aucun ne parle au serveur');
const nets = (f: string) => /fetch\(|db\.api\(|db\.aiCall|db\.listBackups|db\.fetchErrors/.test(fs.readFileSync(f, 'utf8'));
{ const t = fs.readFileSync('src/utils/healthDb.ts', 'utf8'); const calls = (t.match(/db\.(listBackups|fetchErrors|api|aiCall)\(|fetch\(/g) || []); ok(calls.length === 2 && calls.every(c => /listBackups|fetchErrors/.test(c)) && /export async function loadHealthExternal/.test(t), 'Santé du site : seuls 2 appels serveur (sauvegardes, erreurs), tous deux dans le chargement fait une fois à l\'ouverture de la page'); }
ok(!nets('src/utils/direction.ts') && !nets('src/utils/healthNotif.ts') && !nets('src/utils/assistant.ts') && !nets('src/utils/siteSnapshot.ts') && !nets('src/utils/advice.ts'), 'Direction, cloche, assistant (règles), instantané, solutions : aucun appel serveur');
const hp = fs.readFileSync('src/views/admin/HealthPage.tsx', 'utf8');
ok(/loadHealthExternal\(\)/.test(hp) && !/setInterval/.test(hp), 'page Santé : charge ses listes une fois à l\'ouverture, aucun minuteur');
const ai = fs.readFileSync('supabase/functions/df-assistant/guard.ts', 'utf8');
ok(/DAILY_MAX = 20/.test(ai), 'IA externe : 20 questions par jour et par admin au plus (quota Gemini protégé)');
const chatA = fs.readFileSync('src/components/AssistantChat.tsx', 'utf8');
ok(/inflight\.current/.test(chatA) && /lastQ\.current/.test(chatA), 'IA externe : un seul envoi à la fois et pas de doublon sous 3 s');
// estimation du quota du serveur : appels de rechargement par heure et par personne
const perHour = (ms: number, factor: number) => Math.round(3600e3 / (ms * factor));
console.log(`estimation : ${perHour(20000, 1)} rechargements/heure en activité, ${perHour(20000, 2)} après 2 min sans action, ${perHour(20000, 3)} après 10 min, 0 onglet caché ; 8 s = ${perHour(8000, 1)}/heure avec la messagerie ouverte`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
