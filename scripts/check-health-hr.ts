// Contrôle des alertes RH et de l'effet des congés sur la Santé du site (modules 5 et 11). Pur, sans réseau.
// Lancer : npm run check:health-hr
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT } from '../src/utils/health/types';
import { HR_RULES } from '../src/utils/health/rules/hr';
import { TEAM_RULES } from '../src/utils/health/rules/team';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00'); // mercredi
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const U = (id: string, name: string, extra: any = {}) => ({ id, name, username: id, role: 'employee', status: 'active', shift: 'day', ...extra });
const P = (id: string, emp: string, date: string) => ({ id, employee_id: emp, employee_name: emp, client_name: 'M', account_tag: '', target_score: 10, initial_score: 0, current_score: 10, remaining_score: 0, status: 'completed', shift_type: 'day', date, start_time: '08:05:00', end_time: '10:30:00', start_proof_url: '', end_proof_url: '', calculated_ar: 5000, created_at: `${date}T05:00:00Z`, updated_at: `${date}T07:30:00Z` });
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over } as HealthContext);
const LV = (id: string, emp: string, start: string, end: string, status: string, created = `${day(5)}T07:00:00Z`) => ({ id, employee_id: emp, employee_name: emp === 'u1' ? 'Camille' : 'Noé', type: 'paid', start_date: start, end_date: end, days: 3, status, created_by: emp, created_at: created, updated_at: created });
const run = (c: HealthContext) => runHealth(c, HR_RULES);
const team = (c: HealthContext) => runHealth(c, TEAM_RULES);
const find = (r: { alerts: any[] }, id: string) => r.alerts.find(a => a.id === id);

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte RH');

// demandes en attente
let r = run(ctx({ leaves: [LV('l1', 'u1', day(-10), day(-12), 'pending', `${day(2)}T07:00:00Z`)] as any }));
ok(!find(r, 'hr:leave-pending:l1'), 'demande de 2 jours : pas encore d\'alerte (seuil 3 jours)');
r = run(ctx({ leaves: [LV('l1', 'u1', day(-10), day(-12), 'pending')] as any }));
let a = find(r, 'hr:leave-pending:l1');
ok(!!a && a.severity === 'watch' && a.value === 5 && /Camille/.test(a.title_fr) && /5 jours/.test(a.title_fr) && a.go.view === 'hr', 'demande de 5 jours : « à voir », mène à la page RH');
ok(a!.title_en.includes('unanswered') && !/jours|depuis|demande/.test(a!.title_en + a!.why_en + a!.todo_en), 'demande : texte anglais sans mot français');
r = run(ctx({ leaves: [LV('l1', 'u1', day(0), day(-2), 'pending')] as any }));
ok(find(r, 'hr:leave-pending:l1')?.severity === 'urgent', 'demande dont le congé a déjà commencé : urgent');
r = run(ctx({ leaves: [LV('l1', 'u1', day(8), day(6), 'pending')] as any }));
ok(!find(r, 'hr:leave-pending:l1'), 'demande pour un congé déjà passé : plus rien à décider, pas d\'alerte');
r = run(ctx({ leaves: [LV('l1', 'u1', day(-10), day(-12), 'approved'), LV('l2', 'u1', day(-10), day(-12), 'rejected'), LV('l3', 'u1', day(-10), day(-12), 'cancelled')] as any }));
ok(r.alerts.length === 0, 'congé accepté, refusé ou annulé : aucune alerte');
r = run(ctx({ leaves: [LV('l1', 'u1', day(-10), day(-12), 'pending', 'pas une date')] as any }));
ok(r.alerts.length === 0 && r.errors.length === 0, 'date de demande illisible : pas de plantage');

// fin d'essai ou de contrat
const hrOf = (extra: any) => [U('u1', 'Camille', { hr: extra })] as any;
r = run(ctx({ users: hrOf({ trial_end: day(-15) }) }));
ok(r.alerts.length === 0, 'fin d\'essai dans 15 jours : pas d\'alerte (seuil 14)');
r = run(ctx({ users: hrOf({ trial_end: day(-14) }) }));
a = find(r, 'hr:trial-ending:u1');
ok(!!a && a.severity === 'watch' && a.value === 14 && /dans 14 jours/.test(a.title_fr), 'fin d\'essai dans 14 jours : « à voir »');
r = run(ctx({ users: hrOf({ trial_end: day(-3) }) }));
ok(find(r, 'hr:trial-ending:u1')?.severity === 'urgent', 'fin d\'essai dans 3 jours : urgent');
r = run(ctx({ users: hrOf({ trial_end: day(0) }) }));
a = find(r, 'hr:trial-ending:u1');
ok(!!a && /aujourd'hui/.test(a.title_fr) && /today/.test(a.title_en), 'fin d\'essai aujourd\'hui : dit « aujourd\'hui » / « today »');
r = run(ctx({ users: hrOf({ trial_end: day(1) }) }));
ok(r.alerts.length === 0, 'fin d\'essai déjà passée : pas d\'alerte');
r = run(ctx({ users: hrOf({ contract_end: day(-7) }) }));
a = find(r, 'hr:contract-ending:u1');
ok(!!a && a.severity === 'watch' && /Fin du contrat/.test(a.title_fr) && a.title_en.startsWith('Contract'), 'fin de CDD dans 7 jours : alerte contrat');
r = run(ctx({ users: [U('u1', 'Camille', { status: 'inactive', hr: { trial_end: day(-2) } }), U('a1', 'Resp', { role: 'admin', hr: { trial_end: day(-2) } })] as any }));
ok(r.alerts.length === 0, 'compte inactif ou admin : pas d\'alerte');
r = run(ctx({ users: [U('u1', 'Camille')] as any }));
ok(r.alerts.length === 0, 'pas de dossier : rien à signaler');
r = run(ctx({ users: hrOf({ trial_end: day(-5) }), leaves: [LV('l1', 'u1', day(-10), day(-12), 'pending')] as any }));
ok(r.alerts.every(x => alertProblem(x) === null), 'toutes les alertes RH respectent le format commun');

// congés et absences (page Équipe)
const rhythm = (emp: string, until: number, count = 8) => Array.from({ length: count }, (_, i) => P(`h_${emp}_${i}`, emp, day(until + i)));
const users = [U('u1', 'Camille')] as any;
r = team(ctx({ users, posts: rhythm('u1', 4) as any })); // dernier jour travaillé samedi 17 ; lundi 19 et mardi 20 vides
ok(find(r, 'team:absent-streak:u1')?.value === 2, 'sans congé : lundi et mardi vides = 2 jours d\'absence');
r = team(ctx({ users, posts: rhythm('u1', 4) as any, leaves: [LV('l1', 'u1', '2026-10-19', '2026-10-20', 'approved')] as any }));
ok(!find(r, 'team:absent-streak:u1'), 'congé accepté lundi et mardi : plus d\'absence');
r = team(ctx({ users, posts: rhythm('u1', 4) as any, leaves: [LV('l1', 'u1', '2026-10-19', '2026-10-19', 'approved')] as any }));
ok(!find(r, 'team:absent-streak:u1') || find(r, 'team:absent-streak:u1')!.value < 2, 'congé accepté lundi seulement : une seule journée d\'absence (mardi), sous le seuil');
r = team(ctx({ users, posts: rhythm('u1', 4) as any, leaves: [LV('l1', 'u1', '2026-10-19', '2026-10-20', 'pending'), LV('l2', 'u1', '2026-10-19', '2026-10-20', 'rejected')] as any }));
ok(find(r, 'team:absent-streak:u1')?.value === 2, 'demande en attente ou refusée : l\'absence compte toujours');
r = team(ctx({ users, posts: rhythm('u1', 4) as any, leaves: [LV('l1', 'u2', '2026-10-19', '2026-10-20', 'approved')] as any }));
ok(find(r, 'team:absent-streak:u1')?.value === 2, 'le congé d\'un autre salarié ne change rien');
ok(/exclus/.test(find(team(ctx({ users, posts: rhythm('u1', 4) as any })), 'team:absent-streak:u1')!.why_fr) && /excluded/.test(find(team(ctx({ users, posts: rhythm('u1', 4) as any })), 'team:absent-streak:u1')!.why_en), 'le texte ne dit plus « congés pas pris en compte »');
const longAgo = rhythm('u1', 40, 8);
r = team(ctx({ users, posts: longAgo as any }));
ok(!!find(r, 'team:inactive:u1'), 'sans congé : 40 jours sans mission = information « inactif »');
r = team(ctx({ users, posts: longAgo as any, leaves: [LV('l1', 'u1', day(2), day(-5), 'approved')] as any }));
ok(!find(r, 'team:inactive:u1'), 'en congé accepté aujourd\'hui : pas « inactif »');

// démo
const demo = buildDemoData();
const dr = runHealth(ctx({ today: TODAY, users: demo.users, leaves: demo.leaves } as any), HR_RULES);
ok(dr.errors.length === 0, 'démo : les règles RH tournent sans erreur');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
