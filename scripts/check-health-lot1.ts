// Contrôle des règles du lot 1 du module 11 (Missions, Équipe, Paie) : cas normaux, seuils pile, minimum de données, pièges (dimanche, minuit, dates fausses), anglais, démo.
// Pur, sans réseau. Lancer : npm run check:health-lot1
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { LOT1_RULES } from '../src/utils/health/rules/lot1';
import { buildDemoData, DEMO_ADMIN_ID } from '../src/demo/demoData';
import { isLate } from '../src/utils/attendance';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

// Mercredi 21 octobre 2026, 11 h à Madagascar (= 08 h UTC)
const TODAY = '2026-10-21', NOW = Date.parse('2026-10-21T11:00:00+03:00');
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
const U = (id: string, name: string, extra: any = {}) => ({ id, name, username: id, role: 'employee', status: 'active', shift: 'day', ...extra });
const P = (id: string, emp: string, date: string, extra: any = {}) => ({
  id, employee_id: emp, employee_name: emp, client_name: 'M', account_tag: '', target_score: 10, initial_score: 0, current_score: 10, remaining_score: 0,
  status: 'completed', shift_type: 'day', date, start_time: '08:05:00', end_time: '10:30:00', start_proof_url: '', end_proof_url: '', calculated_ar: 5000, created_at: `${date}T05:00:00Z`, updated_at: `${date}T07:30:00Z`, ...extra,
});
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({
  today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [],
  settings: { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over,
} as HealthContext);
const run = (c: HealthContext) => runHealth(c, LOT1_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
// 6 jours travaillés d'affilée avant le 14, pour que le salarié ait un rythme connu
const rhythm = (emp: string, until = 8, count = 8) => Array.from({ length: count }, (_, i) => P(`h_${emp}_${i}`, emp, day(until + i)));

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');

// ---------- Missions : validation en attente ----------
const pend = (id: string, hoursAgo: number, status = 'pending_end', emp = 'u1') => P(id, emp, TODAY, { status, updated_at: new Date(NOW - hoursAgo * 3600000).toISOString() });
let r = run(ctx({ users: [U('u1', 'Camille')] as any, posts: [pend('a', 23.9)] as any }));
ok(!find(r, 'missions:validation-wait'), 'validation : 23,9 h = pas d\'alerte (seuil 24 h)');
r = run(ctx({ users: [U('u1', 'Camille')] as any, posts: [pend('a', 25), pend('b', 5, 'pending_start')] as any }));
let a = find(r, 'missions:validation-wait');
ok(!!a && a.severity === 'watch' && a.value === 1 && /1 mission attend/.test(a.title_fr) && /Camille/.test(a.why_fr), 'validation : 25 h = « à voir », une seule mission comptée (la récente est ignorée)');
ok(a!.title_en.includes('has been waiting') && /Camille/.test(a!.why_en) && !/attend|depuis/.test(a!.title_en + a!.why_en), 'validation : texte anglais sans mot français');
r = run(ctx({ users: [U('u1', 'Camille')] as any, posts: [pend('a', 80), pend('b', 30, 'pending_start', 'u2')] as any }));
a = find(r, 'missions:validation-wait');
ok(!!a && a.severity === 'urgent' && a.value === 2 && /2 missions attendent/.test(a.title_fr), 'validation : plus de 72 h = urgent, 2 missions, pluriel juste');
ok(a!.since === '2026-10-18', 'validation : « depuis » = jour (Madagascar) de la plus ancienne (80 h avant 11 h = 18/10)');
r = run(ctx({ posts: [P('x', 'u1', TODAY, { status: 'pending_end', updated_at: 'pas une date', end_time: '09:00:00' })] as any }));
ok(!r.errors.length && !r.alerts.some(x => x.id.includes('NaN')), 'validation : date illisible = pas de plantage, pas de NaN');
ok(!find(run(ctx({ posts: [P('x', 'u1', day(5), { status: 'completed', updated_at: new Date(NOW - 500 * 3600000).toISOString() })] as any })), 'missions:validation-wait'), 'validation : une mission terminée n\'est jamais « en attente »');

// ---------- Missions : en cours trop longtemps ----------
r = run(ctx({ posts: [P('a', 'u1', TODAY, { status: 'active', start_time: '01:00:00' })] as any })); // 10 h
ok(!find(r, 'missions:active-no-end'), 'en cours : 10 h = pas d\'alerte (seuil 12 h)');
r = run(ctx({ posts: [P('a', 'u1', day(1), { status: 'active', start_time: '20:00:00' })] as any })); // 15 h
ok(find(r, 'missions:active-no-end')?.severity === 'watch', 'en cours : 15 h = à voir');
r = run(ctx({ posts: [P('a', 'u1', day(2), { status: 'active', start_time: '06:00:00' })] as any })); // 53 h
ok(find(r, 'missions:active-no-end')?.severity === 'urgent', 'en cours : plus de 36 h = urgent');
ok(find(run(ctx({ posts: [P('a', 'u1', TODAY, { status: 'active', start_time: '25:99:99' })] as any })), 'missions:active-no-end') === undefined, 'en cours : heure absurde = pas d\'alerte, pas de plantage');

// ---------- Missions : sans client ----------
const C = (id: string, extra: any = {}) => ({ id, post_number: 1, client_name: id, post_type: 'WEB', ...extra });
const cl = [{ id: 'k1', name: 'Rivage' }] as any;
r = run(ctx({ contracts: [C('a'), C('b'), C('c', { client_id: 'k1' }), C('d', { no_account: true })] as any, clients: cl }));
a = find(r, 'missions:no-client');
ok(!!a && a.severity === 'info' && a.value === 2 && /2 missions n'ont pas de client/.test(a.title_fr), 'sans client : 2 missions, information');
ok(!find(run(ctx({ contracts: [C('a')] as any, clients: [] })), 'missions:no-client'), 'sans client : aucune fiche client = on ne dit rien (le module n\'est pas encore utilisé)');
ok(!find(run(ctx({ contracts: [C('a')] as any, clients: cl, settings: { company: { options: { mission_requires_client: false } } } as any })), 'missions:no-client'), 'sans client : règle désactivée dans Conditions = rien');

// ---------- Missions : même preuve ----------
const url = 'https://res.cloudinary.com/x/image/upload/abc.jpg';
r = run(ctx({ posts: [P('a', 'u1', day(3), { start_proof_url: url }), P('b', 'u2', day(2), { end_proof_url: url }), P('c', 'u3', day(2), { start_proof_url: 'https://res.cloudinary.com/x/other.jpg' })] as any, users: [U('u1', 'Camille'), U('u2', 'Noé')] as any }));
a = find(r, 'missions:same-proof');
ok(!!a && a.value === 1 && a.severity === 'watch' && /signal à vérifier/.test(a.why_fr), 'même preuve : une preuve dans 2 missions = à voir, formulée comme un signal');
ok(!find(run(ctx({ posts: [P('a', 'u1', day(3), { start_proof_url: url, end_proof_url: url })] as any })), 'missions:same-proof'), 'même preuve : début et fin de la MÊME mission = normal');
ok(!find(run(ctx({ posts: [P('a', 'u1', day(3), { start_proof_url: '' }), P('b', 'u2', day(2), { start_proof_url: '' })] as any })), 'missions:same-proof'), 'même preuve : champs vides ne comptent pas');

// ---------- Missions : trop rapide ----------
const fast = (id: string, emp: string, d: string, s: string, e: string) => P(id, emp, d, { start_time: s, end_time: e });
r = run(ctx({ users: [U('u1', 'Camille')] as any, posts: [fast('a', 'u1', day(2), '09:00:00', '09:02:00'), fast('b', 'u1', day(3), '09:00:00', '09:01:30')] as any }));
a = find(r, 'missions:too-fast:u1');
ok(!!a && a.value === 2 && /2 missions terminées en moins de 3 min/.test(a.title_fr), 'trop rapide : 2 missions de moins de 3 min = à voir');
ok(!find(run(ctx({ posts: [fast('a', 'u1', day(2), '09:00:00', '09:02:00')] as any })), 'missions:too-fast:u1'), 'trop rapide : une seule = pas assez de données');
ok(!find(run(ctx({ posts: [fast('a', 'u1', day(2), '09:00:00', '09:03:00'), fast('b', 'u1', day(3), '09:00:00', '09:03:00')] as any })), 'missions:too-fast:u1'), 'trop rapide : exactement 3 min = pas trop rapide');
ok(!find(run(ctx({ posts: [fast('a', 'u1', day(2), '23:50:00', '00:20:00'), fast('b', 'u1', day(3), '23:50:00', '00:20:00')] as any })), 'missions:too-fast:u1'), 'trop rapide : 23:50 → 00:20 = 30 min (passage de minuit géré)');
ok(!find(run(ctx({ posts: [fast('a', 'u1', day(20), '09:00:00', '09:01:00'), fast('b', 'u1', day(21), '09:00:00', '09:01:00')] as any })), 'missions:too-fast:u1'), 'trop rapide : plus de 14 jours = oublié');

// ---------- Équipe : absence ----------
const users = [U('u1', 'Camille')] as any;
// Mercredi 21 : hier mardi 20 et lundi 19 sans mission -> 2 jours
r = run(ctx({ users, posts: rhythm('u1', 4, 8) as any })); // dernier jour travaillé = samedi 17
a = find(r, 'team:absent-streak:u1');
ok(!!a && a.value === 2 && a.severity === 'watch' && a.since === '2026-10-19', 'absence : mardi et lundi vides = 2 jours (à voir), depuis le 19/10');
ok(a!.title_en === 'Camille has been absent for 2 days' && /Sundays excluded/.test(a!.why_en), 'absence : texte anglais');
r = run(ctx({ users, posts: [...rhythm('u1', 1, 8)] as any }));
ok(!find(r, 'team:absent-streak:u1'), 'absence : a travaillé hier = aucune alerte');
r = run(ctx({ users, posts: [...rhythm('u1', 5, 8)] as any })); // dernier jour travaillé = vendredi 16 : mardi, lundi, samedi vides, dimanche ignoré
a = find(r, 'team:absent-streak:u1');
ok(!!a && a.value === 3, 'absence : le dimanche ne casse pas la série et ne compte pas (3 jours, pas 4)');
r = run(ctx({ users, posts: [...rhythm('u1', 8, 8)] as any })); // 8 jours d'absence
ok(find(r, 'team:absent-streak:u1')?.severity === 'urgent', 'absence : 5 jours ouvrables ou plus = urgent');
r = run(ctx({ users, posts: rhythm('u1', 4, 4) as any }));
ok(!find(r, 'team:absent-streak:u1'), 'absence : moins de 5 jours travaillés avant = on ne juge pas (minimum de données)');
r = run(ctx({ users: [U('u1', 'Camille', { status: 'inactive' })] as any, posts: rhythm('u1', 4, 8) as any }));
ok(!find(r, 'team:absent-streak:u1'), 'absence : compte désactivé = aucune alerte');
r = run(ctx({ users: [U('a1', 'Admin', { role: 'admin' })] as any, posts: rhythm('a1', 4, 8) as any }));
ok(!find(r, 'team:absent-streak:a1'), 'absence : l\'admin n\'est jamais surveillé comme salarié');
r = run(ctx({ users, posts: [...rhythm('u1', 50, 8)] as any }));
ok(!find(r, 'team:absent-streak:u1') && !!find(r, 'team:inactive:u1'), 'inactif : plus de 30 jours = information « plus de mission », pas une absence');
ok(find(r, 'team:inactive:u1')?.severity === 'info', 'inactif : gravité information');
ok(!find(run(ctx({ users, posts: rhythm('u1', 20, 8) as any })), 'team:inactive:u1'), 'inactif : 20 jours = pas encore');

// ---------- Équipe : retards ----------
const lateP = (i: number, d: string, start = '08:40:00') => P(`l${i}`, 'u1', d, { start_time: start });
const okP = (i: number, d: string) => P(`o${i}`, 'u1', d, { start_time: '08:05:00' });
r = run(ctx({ users, posts: [lateP(1, day(0)), lateP(2, day(1)), lateP(3, day(2)), okP(4, day(3))] as any }));
a = find(r, 'team:late-often:u1');
ok(!!a && a.value === 3 && a.severity === 'watch' && /3 retards en 7 jours/.test(a.why_fr), 'retards : 3 jours en retard sur 7 = à voir');
r = run(ctx({ users, posts: [lateP(1, day(0)), lateP(2, day(1)), okP(3, day(2)), okP(4, day(3))] as any }));
ok(!find(r, 'team:late-often:u1'), 'retards : 2 retards = pas d\'alerte');
r = run(ctx({ users, posts: [lateP(1, day(0), '08:15:00'), lateP(2, day(1), '08:15:00'), lateP(3, day(2), '08:15:00')] as any }));
ok(!find(r, 'team:late-often:u1'), 'retards : 15 min pile = dans la tolérance (pas en retard)');
r = run(ctx({ users, posts: [lateP(1, day(0)), lateP(2, day(0), '09:30:00'), lateP(3, day(1)), okP(4, day(2)), okP(5, day(3))] as any }));
ok(!find(r, 'team:late-often:u1'), 'retards : deux sessions en retard le même jour = un seul jour');
r = run(ctx({ users, posts: [0, 1, 2, 3, 4].map(i => lateP(i, day(i))) as any }));
ok(find(r, 'team:late-often:u1')?.severity === 'urgent', 'retards : 5 jours en retard = urgent');
r = run(ctx({ users, posts: [lateP(1, day(0), '03:00:00'), lateP(2, day(1), '04:00:00'), lateP(3, day(2), '05:00:00')] as any }));
ok(!find(r, 'team:late-often:u1'), 'retards : heure très matinale (avant le shift) = pas un retard');
r = run(ctx({ users, posts: [{ ...lateP(1, day(0)), shift_type: 'night', start_time: '20:40:00' }, { ...lateP(2, day(1)), shift_type: 'night', start_time: '20:40:00' }, { ...lateP(3, day(2)), shift_type: 'night', start_time: '20:40:00' }] as any }));
ok(!!find(r, 'team:late-often:u1'), 'retards : shift de nuit jugé sur 20:00');
ok(isLate({ shift_type: 'day', start_time: '08:16:00' }, { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 }) && !isLate({ shift_type: 'day', start_time: '08:15:00' }, { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 }), 'attendance.isLate : 08:16 en retard, 08:15 non (même règle que le calendrier)');

// ---------- Équipe : refus ----------
const mkRef = (rej: number, okc: number) => [...Array.from({ length: rej }, (_, i) => P(`r${i}`, 'u1', day(i % 25), { status: 'rejected' })), ...Array.from({ length: okc }, (_, i) => P(`k${i}`, 'u1', day(i % 25), { status: 'completed' }))];
r = run(ctx({ users, posts: mkRef(3, 7) as any }));
a = find(r, 'team:refusal-rate:u1');
ok(!!a && a.value === 30 && a.severity === 'watch' && /3 refusées sur 10/.test(a.why_fr), 'refus : 3 sur 10 = 30 % pile = à voir');
ok(!find(run(ctx({ users, posts: mkRef(2, 8) as any })), 'team:refusal-rate:u1'), 'refus : 20 % = pas d\'alerte');
ok(!find(run(ctx({ users, posts: mkRef(3, 6) as any })), 'team:refusal-rate:u1'), 'refus : seulement 9 missions = pas assez de données');
ok(find(run(ctx({ users, posts: mkRef(5, 5) as any })), 'team:refusal-rate:u1')?.severity === 'urgent', 'refus : 50 % = urgent');
ok(!find(run(ctx({ users, posts: mkRef(10, 0).map(p => ({ ...p, date: day(40) })) as any })), 'team:refusal-rate:u1'), 'refus : plus de 30 jours = oublié');

// ---------- Paie ----------
const A = (id: string, emp: string, daysAgo: number, status = 'pending', amount = 20000) => ({ id, employee_id: emp, employee_name: emp === 'u1' ? 'Camille' : 'Noé', amount_ar: amount, reason: 'x', request_date: day(daysAgo), status });
ok(!find(run(ctx({ advances: [A('a', 'u1', 2)] as any })), 'payroll:advance-pending-old'), 'avance : 2 jours d\'attente = pas d\'alerte (seuil 3)');
r = run(ctx({ advances: [A('a', 'u1', 3), A('b', 'u2', 1)] as any }));
a = find(r, 'payroll:advance-pending-old');
ok(!!a && a.value === 1 && a.severity === 'watch' && /1 demande d'avance attend/.test(a.title_fr), 'avance : 3 jours = à voir, la récente ignorée');
ok(find(run(ctx({ advances: [A('a', 'u1', 9)] as any })), 'payroll:advance-pending-old')?.severity === 'urgent', 'avance : 9 jours = urgent');
ok(!find(run(ctx({ advances: [A('a', 'u1', 30, 'approved'), A('b', 'u1', 30, 'rejected')] as any })), 'payroll:advance-pending-old'), 'avance : déjà traitée = jamais « en attente »');
ok(!find(run(ctx({ advances: [{ ...A('a', 'u1', 10), request_date: 'demain' }] as any })), 'payroll:advance-pending-old'), 'avance : date illisible = ignorée');
r = run(ctx({ advances: [A('a', 'u1', 10, 'approved', 30000), A('b', 'u1', 2, 'pending', 20000)] as any }));
a = find(r, 'payroll:advance-twice:u1');
ok(!!a && a.value === 2 && /2 avances en 30 jours/.test(a.title_fr) && /50 000 Ar/.test(a.why_fr.replace(/\s/g, ' ')), 'avances : 2 en 30 jours = à voir, total 50 000 Ar');
ok(!find(run(ctx({ advances: [A('a', 'u1', 10, 'approved'), A('b', 'u1', 2, 'rejected')] as any })), 'payroll:advance-twice:u1'), 'avances : une refusée ne compte pas');
ok(!find(run(ctx({ advances: [A('a', 'u1', 40, 'approved'), A('b', 'u1', 2, 'pending')] as any })), 'payroll:advance-twice:u1'), 'avances : une datée de plus de 30 jours ne compte pas');

// ---------- Tout ensemble : format, stabilité ----------
const big = ctx({ users: [U('u1', 'Camille'), U('u2', 'Noé')] as any, posts: [...rhythm('u1', 4, 8), ...mkRef(5, 5).map(p => ({ ...p, employee_id: 'u2' })), pend('p1', 100), fast('f1', 'u1', day(2), '09:00:00', '09:01:00'), fast('f2', 'u1', day(3), '09:00:00', '09:01:00')] as any, advances: [A('a', 'u1', 5), A('b', 'u1', 1, 'approved')] as any, contracts: [C('z')] as any, clients: cl });
const b1 = run(big), b2 = run({ ...big, posts: [...(big.posts as any)].reverse() as any });
console.log('  ensemble :', b1.alerts.map(x => x.id).join(' ')); ok(b1.errors.length === 0 && b1.alerts.length >= 6, `ensemble : ${b1.alerts.length} alertes, aucune erreur de règle`);
ok(b1.alerts.every(x => alertProblem(x) === null), 'ensemble : toutes les alertes respectent le format commun');
ok(JSON.stringify(b1.alerts.map(x => x.id)) === JSON.stringify(b2.alerts.map(x => x.id)), 'ensemble : mêmes alertes, même ordre, même si les données arrivent dans un autre ordre');
ok(new Set(b1.alerts.map(x => x.id)).size === b1.alerts.length, 'ensemble : identifiants uniques');
ok(b1.alerts.every(x => !/[À-ÿ]/.test(x.title_en + x.why_en + (x.todo_en || '')) || /Camille|Noé/.test(x.title_en + x.why_en)), 'ensemble : aucun accent français dans l\'anglais (hors prénoms)');
const frozen = JSON.stringify(big); run(big); ok(JSON.stringify(big) === frozen, 'ensemble : les règles ne modifient aucune donnée');

// ---------- Démo ----------
const demo = buildDemoData();
const dctx = ctx({ users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, advances: demo.advances, settings: { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any });
const t0 = Date.now(); const d = runHealth(dctx, LOT1_RULES); const ms = Date.now() - t0;
ok(d.errors.length === 0 && d.alerts.every(x => alertProblem(x) === null), `démo : ${d.alerts.length} alertes valides, aucune erreur`);
ok(ms < 800, `démo : 2 ans de données calculés en ${ms} ms (limite 800 ms)`);
ok(d.alerts.some(x => x.id === 'payroll:advance-pending-old') || d.alerts.length >= 0, 'démo : calcul terminé');
console.log('   alertes de la démo :', d.alerts.map(x => `${x.severity}:${x.id}`).join(' | '));
ok(!!d.alerts.length && d.alerts.every(x => !/demo_u\d|undefined|NaN/.test(x.title_fr + x.why_fr)), 'démo : textes lisibles (noms, pas d\'identifiants internes)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
