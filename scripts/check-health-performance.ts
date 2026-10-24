// Contrôle de la règle Performance du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-performance
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT } from '../src/utils/health/types';
import { PERFORMANCE_RULES } from '../src/utils/health/rules/performance';
import { ADVICE } from '../src/utils/advice';
import { addDays } from '../src/utils/stats';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const d = (ago: number) => addDays(TODAY, -ago);
let seq = 0;
const P = (emp: string, date: string): any => ({ id: 'p' + (++seq), employee_id: emp, employee_name: emp, client_name: 'M', post_number: 1, status: 'completed', date, start_time: '09:00:00', end_time: '09:30:00' });
const U = (id: string): any => ({ id, name: id.toUpperCase(), username: id, role: 'employee', status: 'active', shift: 'day' });
const days = (emp: string, count: number, from: number) => Array.from({ length: count }, (_, i) => P(emp, d(from + i)));
const ctx = (users: any[], posts: any[]): HealthContext => ({ today: TODAY, now: NOW, users, posts, contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT } as HealthContext);
const run = (c: HealthContext) => runHealth(c, PERFORMANCE_RULES);

ok(run(ctx([], [])).alerts.length === 0 && run(ctx([], [])).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
let r = run(ctx([U('a'), U('b')], [...days('a', 5, 1), ...days('a', 20, 31), ...days('b', 20, 1), ...days('b', 20, 31)]));
const a = r.alerts.find(x => x.id === 'performance:volume-drop');
ok(!!a && a.severity === 'watch' && a.value === 1 && /\bA\b/.test(a.why_fr) && !/\bB\b/.test(a.why_fr) && a.go.view === 'performance', 'volume en baisse : seule la personne concernée est citée, à voir');
ok(a!.title_fr === '1 employé a nettement moins de missions validées' && /Down at least/.test(a!.why_en) && !/employé|baisse/.test(a!.title_en + a!.why_en), 'singulier correct, anglais propre');
ok(run(ctx([U('a')], [...days('a', 20, 1), ...days('a', 20, 31)])).alerts.length === 0, 'volume stable : aucune alerte');
ok(run(ctx([U('a')], [...days('a', 3, 1), ...days('a', 8, 31)])).alerts.length === 0, 'trop peu de missions avant : pas assez de données, aucune alerte');
ok(r.alerts.every(x => alertProblem(x) === null), 'format commun respecté');
ok(!!ADVICE['volume-drop'] && !/faute|sanction|coupable/i.test(ADVICE['volume-drop'].fr), 'solution dans l\'assistant, sans accusation');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
