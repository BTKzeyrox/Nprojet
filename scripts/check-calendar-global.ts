// Contrôle du calendrier GLOBAL (tous les employés) : mois, résumé, vue du jour, filtre congés. Pur, sans réseau.
// Principe : chaque total global = la somme exacte des calendriers individuels (même règle `dayStatus`). Lancer : npm run check:calendar-global
import { dayStatus } from '../src/utils/dayStatus';
import { empMonth, globalMonth, globalSummary, dayView, hasLeaveInMonth, firstActivityOf } from '../src/utils/calendarGlobal';
import { buildSimulation } from '../src/sim/simulation';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const cfg = { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any;
const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
const U = (id: string, name: string, shift: 'day' | 'night') => ({ id, name, username: id, role: 'employee', shift, status: 'active' }) as any;
const P = (id: string, emp: string, date: string, status: string, start = '08:05:00', end: string | undefined = '12:00:00', pay = 5000, extra: any = {}) => ({
  id, employee_id: emp, employee_name: emp, client_name: 'Mission A', account_tag: '', target_score: 10, initial_score: 0, current_score: status === 'completed' ? 10 : 0, final_score: status === 'completed' ? 10 : undefined,
  status, shift_type: 'day', date, start_time: start, end_time: end, calculated_ar: status === 'completed' ? pay : 0, ...extra }) as any;
const L = (id: string, emp: string, a: string, b: string, status = 'approved', type = 'paid') => ({ id, employee_id: emp, start_date: a, end_date: b, status, type }) as any;
const TODAY = '2026-10-28';

// ----- dayStatus : la règle d'un jour (la même que l'ancien calendrier individuel) -----
const st = (shifts: any[], date: string, first: string | null, leave = false) => dayStatus(shifts, date, first, TODAY, cfg, leave);
ok(st([], '2026-10-12', '2026-10-01', true) === 'leave', 'congé accepté sans mission : « en congé »');
ok(st([P('x', 'a', '2026-10-12', 'completed')], '2026-10-12', '2026-10-01', true) === 'objective_reached', 'congé mais mission travaillée ce jour-là : le travail l\'emporte');
ok(st([], '2026-10-13', '2026-10-01') === 'absent', 'jour passé (mardi) sans mission, après la 1re activité : absent');
ok(st([], '2026-10-11', '2026-10-01') === 'no_post', 'dimanche : repos, jamais une absence');
ok(st([], '2026-09-20', '2026-10-01') === 'no_post' && st([], '2026-10-13', null) === 'no_post', 'avant la 1re activité ou sans activité : pas de mission');
ok(st([P('x', 'a', '2026-10-13', 'completed', '08:40:00')], '2026-10-13', '2026-10-01') === 'late', 'mission débutée à 08:40 (tolérance 15 min) : en retard');
ok(st([P('x', 'a', '2026-10-13', 'completed', '08:10:00')], '2026-10-13', '2026-10-01') === 'objective_reached', 'mission à 08:10 : dans la tolérance, pas en retard');
ok(st([P('x', 'a', '2026-10-13', 'active', '08:00:00', undefined)], '2026-10-13', '2026-10-01') === 'in_progress', 'mission ouverte : en cours');
ok(st([P('x', 'a', '2026-10-13', 'rejected')], '2026-10-13', '2026-10-01') === 'absent', 'seulement des missions refusées : absent');

// ----- Données de contrôle : 3 employés, un mois (octobre 2026) -----
const emps = [U('a', 'Aina', 'day'), U('b', 'Bao', 'day'), U('c', 'Cia', 'night')];
const posts = [
  P('p1', 'a', '2026-10-05', 'completed'), P('p2', 'a', '2026-10-06', 'completed'), P('p3', 'a', '2026-10-07', 'completed', '08:40:00'), P('p4', 'a', '2026-10-08', 'active', '08:00:00', null as any),
  P('p5', 'b', '2026-10-05', 'completed'), P('p6', 'b', '2026-10-06', 'completed'), P('p7', 'b', '2026-10-13', 'rejected', '08:00:00', '09:00:00'),
  P('p8', 'c', '2026-10-05', 'completed', '20:05:00', '23:00:00', 5000, { shift_type: 'night' }), P('p9', 'c', '2026-10-06', 'completed', '20:05:00', '23:00:00', 5000, { shift_type: 'night', client_name: 'Mission B' }),
];
const leaves = [L('l1', 'b', '2026-10-12', '2026-10-14'), L('l2', 'c', '2026-10-20', '2026-10-21', 'pending'), L('l3', 'a', '2026-10-27', '2026-10-27', 'rejected')];
const first = firstActivityOf(posts);
const ctx = { posts, leaves, today: TODAY, cfg };
const g = globalMonth(2026, 9, emps, ctx, first);

ok(g.length === 31 && g[0].dateStr === '2026-10-01' && g[30].dateStr === '2026-10-31', 'octobre : 31 jours');
ok(globalMonth(2028, 1, emps, ctx, first).length === 29 && globalMonth(2026, 1, emps, ctx, first).length === 28, 'février : 28 jours, 29 en année bissextile');
// Propriété centrale : chaque case globale = somme des calendriers individuels
const perEmp = emps.map(e => empMonth(2026, 9, e.id, ctx, first));
const sameAsSum = g.every((d, i) => (['objective_reached', 'late', 'absent', 'no_post', 'test', 'in_progress', 'leave'] as const).every(s => d.counts[s] === perEmp.filter(m => m[i].status === s).length));
ok(sameAsSum, 'chaque jour : les nombres par statut = somme exacte des calendriers individuels');
ok(g.every(d => sum(Object.values(d.counts)) === emps.length), 'chaque jour : un statut et un seul par employé (le total fait toujours 3)');
const d5 = g[4], d7 = g[6], d12 = g[11], d13 = g[12], d20 = g[19];
ok(d5.present === 3 && d5.absent === 0 && d5.missions === 3 && d5.validated === 3 && d5.pay === 15000, '5 octobre : 3 présents, 3 missions validées, 15 000 Ar');
ok(d7.late === 1 && d7.counts.absent === 2 && d7.present === 1, '7 octobre : Aina en retard (08:40), Bao et Cia absents');
ok(d12.onLeave === 1 && d12.leaveNames.join() === 'Bao' && d12.absent === 2, '12 octobre : Bao en congé accepté (nommé), les 2 autres absents');
ok(d13.onLeave === 1 && d13.counts.absent === 2 && d13.missions === 1, '13 octobre : la mission refusée de Bao compte comme mission mais pas comme jour travaillé');
ok(d20.pendingLeave === 1 && d20.pendingNames.join() === 'Cia' && d20.onLeave === 0, '20 octobre : demande en attente de Cia visible, pas comptée comme congé');
ok(!g.some(d => d.leaveNames.includes('Aina')), 'une demande refusée n\'apparaît nulle part');
ok(g[10].counts.no_post === 3 && g[10].present === 0, '11 octobre (dimanche) : repos pour tous');
ok(g[29].counts.no_post === 3 && g[29].absent === 0, 'jours futurs : jamais d\'absence');

// ----- Résumé -----
const advances = [{ employee_id: 'a', request_date: '2026-10-10', status: 'approved', amount_ar: 3000 }, { employee_id: 'b', request_date: '2026-10-11', status: 'pending', amount_ar: 2000 }, { employee_id: 'a', request_date: '2026-09-30', status: 'approved', amount_ar: 9999 }];
const sm = globalSummary(2026, 9, emps, ctx, first, advances);
ok(sm.rows.length === 3 && sm.employees === 3, 'résumé : une ligne par employé');
ok(sm.missions === sum(sm.rows.map(r => r.missions)) && sm.validated === sum(sm.rows.map(r => r.validated)) && sm.pay === sum(sm.rows.map(r => r.pay)) && sm.absences === sum(sm.rows.map(r => r.absences)) && sm.lateDays === sum(sm.rows.map(r => r.lateDays)) && sm.workedDays === sum(sm.rows.map(r => r.workedDays)), 'résumé : chaque total = somme des lignes');
ok(sm.missions === posts.length && sm.validated === 7 && sm.refused === 1 && sm.inProgress === 1, 'résumé : 9 missions, 7 validées, 1 refusée, 1 en cours');
ok(sm.pay === 35000 && sm.advApproved === 3000 && sm.advPending === 2000 && sm.net === 32000, 'résumé : paie 35 000 − avances acceptées du mois 3 000 = 32 000 (l\'avance de septembre est ignorée)');
ok(sm.leaveDays === 3 && sm.pendingLeaveDays === 2, 'résumé : 3 jours de congé accepté, 2 jours de demande en attente');
const aRow = sm.rows.find(r => r.id === 'a')!;
ok(aRow.workedDays === 4 && aRow.lateDays === 1 && aRow.validated === 3, 'résumé : ligne d\'Aina (4 jours dont 1 en retard, 3 validées)');
const only = globalSummary(2026, 9, emps, { ...ctx, clientFilter: 'Mission B' }, first, advances);
ok(only.missions === 1 && only.pay === 5000 && only.absences === sm.absences, 'filtre mission : seuls les chiffres des missions filtrées changent, pas les statuts de présence');
const empty = globalSummary(2026, 9, [], ctx, first, advances);
ok(empty.employees === 0 && empty.pay === 0 && empty.net === 0 && globalMonth(2026, 9, [], ctx, first).every(d => d.present === 0 && d.pay === 0), 'aucun employé : tout à zéro, aucun plantage');
ok([sm.pay, sm.net, sm.workedDays, sm.absences].every(Number.isFinite), 'résumé : aucun NaN');

// Un congé qui couvre un dimanche : le dimanche s'affiche « en congé » mais ne compte pas dans les jours de congé du résumé (c'est un repos)
{
  const d = [U('d', 'Dia', 'day')], lv = [L('lx', 'd', '2026-10-09', '2026-10-12')], cx = { posts: [P('q', 'd', '2026-10-05', 'completed')], leaves: lv, today: TODAY, cfg };
  const fd = firstActivityOf(cx.posts), gd = globalMonth(2026, 9, d, cx, fd), sd = globalSummary(2026, 9, d, cx, fd);
  ok(gd[10].onLeave === 1 && sd.leaveDays === 3, 'congé du vendredi 9 au lundi 12 : le dimanche 11 est affiché en congé, mais le résumé compte 3 jours (vendredi, samedi, lundi)');
}

// ----- Vue du jour -----
const v7 = dayView('2026-10-07', emps, ctx, first);
ok(v7.map(r => r.name).join() === 'Aina,Bao,Cia' && v7[0].status === 'late' && v7[0].lateMin === 40 && v7[0].firstStart === '08:40', 'jour du 7 : Aina en tête (en retard de 40 min, 1re mission 08:40), puis les absents');
const v8 = dayView('2026-10-08', emps, ctx, first);
ok(v8[0].name === 'Aina' && v8[0].status === 'in_progress' && v8[0].open && v8[0].lastEnd === null, 'jour du 8 : mission en cours (pas de fin), classée en premier');
const v12 = dayView('2026-10-12', emps, ctx, first);
ok(v12.some(r => r.name === 'Bao' && r.status === 'leave' && r.leave === 'paid') && v12.every(r => r.firstStart === null), 'jour du 12 : Bao en congé payé, personne n\'a travaillé');
const v20 = dayView('2026-10-20', emps, ctx, first);
ok(v20.find(r => r.id === 'c')!.pendingLeave === true, 'jour du 20 : la demande en attente de Cia est signalée');
const v5 = dayView('2026-10-05', emps, ctx, first);
ok(v5.find(r => r.id === 'c')!.shift === 'night' && v5.find(r => r.id === 'c')!.lastEnd === '23:00' && v5.every(r => r.validated === 1 && r.pay === 5000), 'jour du 5 : fin de mission et paie par employé');
ok(v7.every((r, i, a) => i === 0 || ['in_progress', 'late', 'objective_reached', 'test', 'absent', 'leave', 'no_post'].indexOf(a[i - 1].status) <= ['in_progress', 'late', 'objective_reached', 'test', 'absent', 'leave', 'no_post'].indexOf(r.status)), 'vue du jour : triée en cours, retards, présents, absents, congés');
ok(sum(v5.map(r => r.pay)) === g[4].pay && dayView('2026-10-05', emps, ctx, first).filter(r => r.status === 'objective_reached').length === g[4].counts.objective_reached, 'vue du jour = case du mois correspondante');

// ----- Filtre congés -----
ok(hasLeaveInMonth(leaves, 'b', 2026, 9, 'approved') && !hasLeaveInMonth(leaves, 'c', 2026, 9, 'approved') && hasLeaveInMonth(leaves, 'c', 2026, 9, 'pending') && !hasLeaveInMonth(leaves, 'a', 2026, 9, 'approved') && !hasLeaveInMonth(leaves, 'a', 2026, 9, 'pending'), 'filtre congés : acceptés (Bao), en attente (Cia), les demandes refusées ne comptent pas');
ok(emps.every(e => hasLeaveInMonth(leaves, e.id, 2026, 9, 'all')) && !hasLeaveInMonth(leaves, 'b', 2026, 10, 'approved') && hasLeaveInMonth([L('x', 'b', '2026-09-28', '2026-10-02')], 'b', 2026, 9, 'approved'), 'filtre congés : « tous » garde tout ; un congé à cheval sur deux mois compte dans les deux');

// ----- Sur les données de la simulation (2 mois, 4 opérateurs) -----
const sim = buildSimulation({ today: TODAY });
const simEmps = sim.operators.map(o => U(o.id, o.name, o.shift));
const sctx = { posts: sim.posts, leaves: sim.leaves as any, today: TODAY, cfg };
const sfirst = firstActivityOf(sim.posts);
for (const [y, m] of [[2026, 8], [2026, 9]] as const) {
  const gd = globalMonth(y, m, simEmps, sctx, sfirst), per = simEmps.map(e => empMonth(y, m, e.id, sctx, sfirst));
  ok(gd.every((d, i) => d.absent === per.filter(x => x[i].status === 'absent').length && d.late === per.filter(x => x[i].status === 'late').length && d.onLeave === per.filter(x => x[i].status === 'leave').length && d.pay === sum(per.map(x => x[i].pay))), `simulation ${y}-${String(m + 1).padStart(2, '0')} : le global = somme des 4 calendriers individuels, jour par jour`);
  const s2 = globalSummary(y, m, simEmps, sctx, sfirst, sim.advances as any);
  ok(s2.pay === sim.posts.filter(p => p.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}-`) && p.status === 'completed').reduce((a, p) => a + (p.calculated_ar || 0), 0), `simulation ${y}-${String(m + 1).padStart(2, '0')} : la paie du résumé = missions validées du mois`);
}
const sdays = globalMonth(2026, 9, simEmps, sctx, sfirst);
const ndays = globalMonth(2026, 10, simEmps, sctx, sfirst);
ok(sdays.some(d => d.onLeave > 0 && d.leaveNames.length > 0) && ndays.some(d => d.pendingLeave > 0 && d.pendingNames.length > 0) && ndays.some(d => d.onLeave > 0), 'simulation : congés acceptés en octobre, congé à venir et demande en attente en novembre, tous visibles dans le calendrier global');
ok(sdays.every(d => ![d.pay, d.missions, d.present].some(x => !Number.isFinite(x))), 'simulation : aucun NaN');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
