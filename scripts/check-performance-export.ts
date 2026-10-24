// Contrôle de l'export des scores et des badges (module 3, M3.8), sans réseau. Lancer : npm run check:performance-export
import { computePerformance } from '../src/utils/performanceScore';
import { computeClientBadges } from '../src/utils/clientBadges';
import { summarizeClients } from '../src/utils/clients';
import { performanceAoa, scoreCellsFor, reportPerformance, performanceSheets, badgeLabel } from '../src/utils/performanceExport';
import { addDays } from '../src/utils/stats';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const TODAY = '2026-10-21';
const d = (ago: number) => addDays(TODAY, -ago);
const pad = (x: number) => String(x).padStart(2, '0');
let seq = 0;
const P = (emp: string, date: string, status = 'completed'): any => ({ id: 'p' + (++seq), employee_id: emp, employee_name: emp, client_name: 'M', post_number: 1, status, date, start_time: '09:00:00', end_time: '09:30:00', type: 'WEB' });
const U = (id: string): any => ({ id, name: id.toUpperCase(), username: id, role: 'employee', status: 'active', shift: 'day' });
const days = (emp: string, count: number, status = 'completed') => Array.from({ length: count }, (_, i) => P(emp, d(1 + i), status));
const users = ['a', 'b', 'c'].map(U);
const posts = [...days('a', 25), ...days('b', 12), ...days('b', 1, 'rejected').map(p => ({ ...p, date: d(30) })), ...days('c', 3)];
const res = computePerformance({ users, posts, contracts: [], today: TODAY });
const cells = scoreCellsFor(res, 'fr');
const rows = ['a', 'b', 'c'].map((id, i) => ({ id, name: id.toUpperCase(), done: [25, 12, 3][i], rejected: [0, 1, 0][i], open: 0, rate: [100, 92, 100][i], avgMin: 30 }));
const total = { id: 'total', name: 'Total', done: 40, rejected: 1, open: 0, rate: 98, avgMin: 30 };
const bad = (x: unknown) => /NaN|Infinity|undefined|\[object/.test(JSON.stringify(x));

// ----- tableau Performance -----
{
  const plain = performanceAoa(rows, total, null, 30, 'fr');
  ok(plain[0].length === 6 && plain.length === 5 && plain[0][0] === 'Opérateur' && plain[4][0] === 'Total', 'sans scores : les 6 colonnes d\'origine, rien ne change');
  ok(JSON.stringify(plain[1]) === JSON.stringify(['A', 25, 0, 0, 100, 30]), 'sans scores : ligne identique à l\'ancien export');
  const full = performanceAoa(rows, total, cells, 30, 'fr');
  ok(full[0].length === 10 && full[0][6] === 'Score (30 j)' && full[0][8] === 'Badges' && full.every(r => r.length === 10), 'avec scores : 4 colonnes en plus, toutes les lignes ont 10 cellules');
  const a = res.employees.get('a')!, c = res.employees.get('c')!;
  ok(full[1][6] === a.score && typeof a.score === 'number', 'le score du salarié A est dans sa ligne');
  ok(c.score === null && full[3][6] === '', '3 missions : pas de score, cellule vide (jamais « null » ni 0)');
  ok(String(full[1][8]).length > 0 && String(full[1][8]).includes('·') || a.badges.length === 0, 'les badges sont écrits avec leur niveau (« Qualité · Or »)');
  const known = [res.employees.get('a')!.score, res.employees.get('b')!.score].filter((x): x is number => typeof x === 'number');
  ok(full[4][6] === Math.round(known.reduce((x, y) => x + y, 0) / known.length), 'ligne Total : moyenne des scores connus');
  ok(performanceAoa(rows, total, cells, 14, 'en')[0][6] === 'Score (14 d)', 'anglais : « Score (14 d) », fenêtre réglée');
  const unknown = performanceAoa([{ ...rows[0], id: 'zzz' }], total, cells, 30, 'fr');
  ok(unknown[1].slice(6).join('') === '' && unknown[1].length === 10, 'salarié sans score connu : cellules vides, tableau toujours rectangulaire');
  ok(!bad(full) && !bad(performanceAoa([], total, cells, 30, 'fr')), 'aucun NaN ni « undefined » ; tableau vide accepté');
  ok(performanceAoa([], total, null, 30, 'fr').length === 2, 'aucun salarié : en-tête + total seulement');
}
// ----- étiquettes de badges -----
{
  ok(badgeLabel({ id: 'quality', level: 3, value: 99, why: { fr: '', en: '' } }, 'fr') === 'Qualité · Or' && badgeLabel({ id: 'quality', level: 1, value: 90, why: { fr: '', en: '' } }, 'en') === 'Quality · Bronze', 'étiquette de badge FR et EN');
  ok(badgeLabel({ id: 'rookie', level: 1, value: 10, why: { fr: '', en: '' } }, 'fr') === 'Recrue prometteuse', 'recrue : sans niveau');
}
// ----- section du rapport -----
{
  const clients = [{ id: 'k1', name: 'Alpha', active: true }, { id: 'k2', name: 'Bravo', active: true }] as any[];
  const inv = [{ id: 'i1', number: 'FA-1', status: 'issued', type: 'invoice', client_id: 'k1', client: { name: 'Alpha' }, issue_date: '2026-06-01', due_date: '2026-06-30', total_ar: 100000 }] as any[];
  const cres = computeClientBadges({ clients, summaries: summarizeClients(clients, [], TODAY), missions: [], invoices: inv, cash: [], today: TODAY });
  const rp = reportPerformance(res, cres, 'fr')!;
  ok(!!rp && rp.employees.length === 3 && rp.clients.length === 1 && rp.clients[0].name === 'Alpha', 'rapport : 3 salariés et 1 client à surveiller');
  ok(rp.employees[0].score !== null && rp.employees[rp.employees.length - 1].score === null, 'rapport : classés par score, sans score en dernier');
  ok(rp.clients[0].badges === 'À surveiller' && rp.clients[0].attention.includes('FA-1'), 'rapport : client « À surveiller » avec le pourquoi');
  const en = reportPerformance(res, cres, 'en')!;
  ok(en.clients[0].badges === 'To watch' && en.clients[0].attention.includes('days late'), 'rapport (anglais) : badge et raison traduits');
  ok(reportPerformance(undefined, undefined, 'fr') === null && reportPerformance(computePerformance({ users: [], posts: [], contracts: [], today: TODAY }), undefined, 'fr') === null, 'rapport : rien à montrer = pas de section (null)');
  const sheets = performanceSheets(rp, 'fr');
  ok(sheets.length === 2 && sheets[0].name === 'Performance équipe' && sheets[1].name === 'Clients à surveiller' && sheets.every(s => s.name.length <= 31), 'feuilles Excel : 2 onglets, noms de 31 caractères au plus');
  ok(sheets[0].rows.length === 4 && sheets[0].rows.every(r => r.length === 5) && sheets[1].rows.every(r => r.length === 4), 'feuilles : tableaux rectangulaires');
  ok(performanceSheets(null, 'fr').length === 0 && performanceSheets({ windowDays: 30, employees: [], clients: [] }, 'fr').length === 0, 'feuilles : aucune si rien à montrer');
  ok(!bad(sheets) && !bad(rp), 'feuilles : aucun NaN ni « undefined »');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
