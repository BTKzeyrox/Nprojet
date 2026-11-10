// Statistiques : réglage « Feuille du jour dans les Statistiques » (money par défaut / all / none), 2026-11-10.
// Lancer : npm run check:stats-work-lines
import { readFileSync } from 'node:fs';
import { computeStats } from '../src/utils/stats';
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const mk = (id: string, emp: string, date: string, ar: number, extra: any = {}) => ({ id, employee_id: emp, employee_name: emp, client_name: 'C' + id, account_tag: '', target_s: 0, date, start_time: '08:00:00', end_time: '10:00:00', status: 'completed', calculated_ar: ar, post_number: 1, ...extra });
const input: any = {
  pricePerMission: 5000,
  users: [{ id: 'u1', name: 'Ana', role: 'employee', status: 'active', shift: 'day' }, { id: 'u2', name: 'Bob', role: 'employee', status: 'active', shift: 'day' }],
  contracts: [], advances: [],
  posts: [mk('1', 'u1', '2026-10-05', 5000), mk('2', 'u1', '2026-10-06', 5000), mk('we-2026-10-07-u2-presence', 'u2', '2026-10-07', 12000, { work_type: 'presence' }), mk('we-2026-10-08-u1-carton', 'u1', '2026-10-08', 3000, { work_type: 'carton' })],
};
const run = (m?: any) => computeStats({ ...input, workLines: m }, 'month', '2026-10-01', '2026-10-18');
const d = run(); // défaut
ok(d.cur.done === 2 && d.cur.earned === 25000, 'par défaut (argent seulement) : 2 missions, mais 25 000 Ar de salaires (5000 + 5000 + 12000 + 3000)');
ok(d.team.ranking.find(r => r.id === 'u1')!.earned === 13000 && d.team.ranking.find(r => r.id === 'u1')!.done === 2 && d.team.ranking.find(r => r.id === 'u2')!.earned === 12000 && d.team.ranking.find(r => r.id === 'u2')!.done === 0, 'classement : l\'argent des lignes compte, pas le nombre de missions');
ok(d.series.earned.reduce((a, b) => a + b, 0) === 25000 && d.series.done.reduce((a, b) => a + b, 0) === 2, 'barres : argent 25 000, missions 2');
ok(d.salary.perHead === Math.round(25000 / d.cur.workers), 'salaire par tête recalculé avec l\'argent des lignes');
const a = run('all'); ok(a.cur.done === 4 && a.cur.earned === 25000, '« comme des missions » : 4 missions, 25 000 Ar (comportement d\'avant)');
const n = run('none'); ok(n.cur.done === 2 && n.cur.earned === 10000 && n.team.ranking.find(r => r.id === 'u2')!.earned === 0, '« ignorée » : 2 missions, 10 000 Ar');
ok(JSON.stringify(run('money')) === JSON.stringify(d), 'valeur absente = argent seulement');
ok(run('bizarre' as any).cur.done === 2, 'valeur inconnue : se comporte comme « argent seulement »');
const noLines = computeStats({ ...input, posts: input.posts.slice(0, 2) }, 'month', '2026-10-01', '2026-10-18');
ok(JSON.stringify(computeStats({ ...input, posts: input.posts.slice(0, 2), workLines: 'money' }, 'month', '2026-10-01', '2026-10-18')) === JSON.stringify(noLines), 'sans aucune ligne de feuille : résultat identique à avant');
const cc = readFileSync('src/components/CompanyConditions.tsx', 'utf8'), cr = readFileSync('src/utils/companyRules.ts', 'utf8'), sv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/key: 'stats_lines', kind: 'select'/.test(cc) && /dflt: \['Argent seulement\./.test(cc), 'réglage visible dans Réglages > Conditions, défaut annoncé');
ok(/stats_lines: 'money'/.test(cr) && /stats_lines: "money"/.test(sv) && /stats_lines: \{ t: "enum", vals: \["money", "all", "none"\] \}/.test(sv), 'valeur de départ « money » et liste de valeurs permises, côté site et côté serveur');
console.log(`\n${pass}/${pass + fail} contrôles OK`);
process.exit(fail ? 1 : 0);
