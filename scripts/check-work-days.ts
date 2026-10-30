// Jours de travail : règle pure, copie du serveur identique, calendrier et Réglages branchés.
import { readFileSync } from 'node:fs';
import { cleanWorkDays, isWorkDay, weekdayOf, DEFAULT_WORK_DAYS } from '../src/utils/workDays';
import { dayStatus } from '../src/utils/dayStatus';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)})`);
eq(cleanWorkDays(undefined), [1, 2, 3, 4, 5, 6], 'par défaut : lundi à samedi');
eq(cleanWorkDays([]), [1, 2, 3, 4, 5, 6], 'liste vide refusée : retour au défaut');
eq(cleanWorkDays([6, 6, 0, 9, -1, 'x', 2]), [0, 2, 6], 'doublons et valeurs fausses retirés, trié');
ok(weekdayOf('2026-10-25') === 0 && weekdayOf('2026-10-26') === 1, '25 oct. 2026 = dimanche, 26 = lundi');
ok(!isWorkDay('2026-10-25') && isWorkDay('2026-10-24'), 'défaut : dimanche = repos, samedi = travail');
ok(isWorkDay('2026-10-25', [0, 1]) && !isWorkDay('2026-10-24', [0, 1]), 'réglé sur dimanche et lundi : samedi devient repos');
// Même code côté serveur : on extrait le bloc et on compare les résultats
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const blk = srv.slice(srv.indexOf('// ===== BEGIN WORKDAYS'), srv.indexOf('// ===== END WORKDAYS'));
const S = new Function(`${blk.replace(/const workDateOf[\s\S]*$/, '')}; return { cleanWorkDays, isWorkDay, DEFAULT_WORK_DAYS };`)() as any;
const samples: unknown[] = [undefined, [], [0], [1, 2, 3], [6, 6, 9], 'x', [0, 1, 2, 3, 4, 5, 6]];
ok(samples.every(v => JSON.stringify(S.cleanWorkDays(v)) === JSON.stringify(cleanWorkDays(v))), 'serveur : même nettoyage que le site');
ok(['2026-10-24', '2026-10-25', '2026-10-26'].every(d => [undefined, [0], [1, 6]].every(w => S.isWorkDay(d, w) === isWorkDay(d, w as any))), 'serveur : même verdict pour chaque jour');
const W = new Function(`${blk}; return workDateOf;`)() as any;
ok(W('night', new Date('2026-10-26T02:00:00Z')) === '2026-10-25' && W('night', new Date('2026-10-26T20:00:00Z')) === '2026-10-26' && W('day', new Date('2026-10-26T02:00:00Z')) === '2026-10-26', 'nuit : le matin compte pour la veille ; jour : le jour même (heure de Madagascar)');
ok(/\['employee', 'accountant', 'team_lead'\]\.includes\(user\.role\)/.test(srv) && /isWorkDay\(workDateOf\(shift, now\), st\.work_days\)/.test(srv), 'serveur : contrôle étendu au Comptable et au Chef d\'équipe, avec les jours de travail');
ok(/user\.role === 'admin'[^\n]*return \{ ok: true \}/.test(srv), 'serveur : le responsable n\'est jamais limité');
// Calendrier : le repos suit le réglage
const cfg = { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any;
ok(dayStatus([], '2026-10-24', '2026-10-01', '2026-10-28', cfg) === 'absent', 'samedi sans mission (travail par défaut) : absent');
ok(dayStatus([], '2026-10-24', '2026-10-01', '2026-10-28', { ...cfg, work_days: [1, 2, 3, 4, 5] }) === 'no_post', 'samedi décoché : repos, jamais une absence');
ok(dayStatus([], '2026-10-25', '2026-10-01', '2026-10-28', { ...cfg, work_days: [0, 1, 2, 3, 4, 5] }) === 'absent', 'dimanche coché : absence possible');
const P = { id: 'p', employee_id: 'a', client_name: 'M', account_tag: '', target_score: 10, initial_score: 0, current_score: 10, status: 'completed', date: '2026-10-25', start_time: '08:05:00', end_time: '12:00:00', calculated_ar: 5000 } as any;
ok(dayStatus([P], '2026-10-25', '2026-10-01', '2026-10-28', cfg) === 'objective_reached', 'travail fait un jour de repos : compté');
const set = readFileSync('src/views/admin/SettingsView.tsx', 'utf8'), emp = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8'), st = readFileSync('src/db/store.ts', 'utf8');
ok(/data-work-days/.test(set) && /DAY_ORDER\.map/.test(set) && /if \(next\.length\) set\('work_days'/.test(set), 'Réglages : 7 cases, au moins un jour');
const sheet = readFileSync('src/components/OperatorSheet.tsx', 'utf8');
ok(/data-testid="act-access"/.test(sheet) && /onSetAccess=/.test(emp) && /user\.role === 'admin'\) return \{ success: false \}/.test(st), 'Employés : accès réglable aussi pour comptables et chefs d\'équipe');
ok(DEFAULT_WORK_DAYS.length === 6, 'défaut : 6 jours');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
