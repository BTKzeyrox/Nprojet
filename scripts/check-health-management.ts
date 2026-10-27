// Contrôle des règles du module 15 dans la Santé du site (M15.8) : conflits de planning, paie et dépenses au-dessus du prévu. Pur, sans réseau.
// Lancer : npm run check:health-management
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { MANAGEMENT_RULES } from '../src/utils/health/rules/management';
import { ALL_RULES } from '../src/utils/health/all';
import { ADVICE } from '../src/utils/advice';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-27', NOW = Date.parse('2026-10-27T11:00:00+03:00'); // mardi
const users = [{ id: 'u1', name: 'Hery', role: 'employee', status: 'active' }, { id: 'u2', name: 'Naly', role: 'employee', status: 'active' }] as any;
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users, posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over });
const run = (c: HealthContext) => runHealth(c, MANAGEMENT_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const S = (emp: string, date: string, kind: string) => ({ id: `sh-${emp}-${date.replace(/-/g, '')}`, employee_id: emp, date, kind, created_at: '', updated_at: '', updated_by: '' });
const leave = (emp: string, a: string, b: string, status = 'approved') => ({ id: `l-${emp}-${a}`, employee_id: emp, start_date: a, end_date: b, status });

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
ok(run(ctx({ shifts: null })).alerts.length === 0 && run(ctx({ shifts: [] })).alerts.length === 0, 'planning non chargé ou vide : la règle se tait');

// --- conflits de planning
let r = run(ctx({ shifts: [S('u1', '2026-10-29', 'day')] as any, leaves: [leave('u1', '2026-10-28', '2026-10-30')] as any }));
let a = find(r, 'hr:planning-conflicts');
ok(!!a && a.severity === 'watch' && a.value === 1 && a.since === '2026-10-29' && a.go.view === 'hr' && a.title_fr === '1 conflit de planning dans les 14 prochains jours' && /Hery/.test(a.why_fr) && /29\/10\/2026/.test(a.why_fr), 'congé accepté un jour de vacation : une alerte, nom et date lisibles');
ok(!find(run(ctx({ shifts: [S('u1', '2026-10-29', 'day')] as any, leaves: [leave('u1', '2026-10-28', '2026-10-30', 'pending')] as any })), 'hr:planning-conflicts'), 'congé seulement demandé : aucun conflit');
ok(!find(run(ctx({ shifts: [S('u1', '2026-10-29', 'off')] as any, leaves: [leave('u1', '2026-10-28', '2026-10-30')] as any })), 'hr:planning-conflicts'), 'Repos pendant un congé : aucun conflit');
a = find(run(ctx({ shifts: [S('u1', '2026-10-28', 'night'), S('u1', '2026-10-29', 'day'), S('u2', '2026-10-30', 'day')] as any, leaves: [leave('u2', '2026-10-30', '2026-10-30')] as any })), 'hr:planning-conflicts');
ok(a?.value === 2 && a.title_fr === '2 conflits de planning dans les 14 prochains jours' && a.since === '2026-10-29', 'Nuit puis Jour + congé : 2 conflits comptés, le plus proche en premier');
ok(!!find(run(ctx({ shifts: [S('u1', '2026-10-28', 'night'), S('u1', '2026-10-29', 'day')] as any })), 'hr:planning-conflicts'), 'Nuit puis Jour sans congé : conflit de repos');
const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map(d => S('u1', d, 'day'));
ok(!find(run(ctx({ shifts: week as any, planningMax: 0 })), 'hr:planning-conflicts') && !find(run(ctx({ shifts: week as any, planningMax: 6 })), 'hr:planning-conflicts') && !!find(run(ctx({ shifts: week as any, planningMax: 5 })), 'hr:planning-conflicts'), 'trop de jours : seulement si la limite est réglée et dépassée');
ok(!find(run(ctx({ shifts: [S('u1', '2026-10-20', 'day')] as any, leaves: [leave('u1', '2026-10-20', '2026-10-20')] as any })), 'hr:planning-conflicts'), 'conflit déjà passé : ignoré');
ok(!find(run(ctx({ shifts: [S('u1', '2026-11-10', 'day')] as any, leaves: [leave('u1', '2026-11-10', '2026-11-10')] as any })), 'hr:planning-conflicts') && !!find(run(ctx({ shifts: [S('u1', '2026-11-09', 'day')] as any, leaves: [leave('u1', '2026-11-09', '2026-11-09')] as any })), 'hr:planning-conflicts'), 'fenêtre de 14 jours : le 13e jour compte, le 14e non');
ok(!!find(run(ctx({ shifts: [S('u1', '2026-10-27', 'day')] as any, leaves: [leave('u1', '2026-10-27', '2026-10-27')] as any })), 'hr:planning-conflicts'), 'conflit aujourd\'hui : compté');
ok(run(ctx({ shifts: [null, { id: 'x' }, { employee_id: 'u1', date: 'pas-une-date', kind: 'day' }] as any, leaves: [null, { employee_id: 5 }] as any })).errors.length === 0, 'données abîmées (null, date fausse, congé sans salarié) : aucun plantage');

// --- paie et dépenses au-dessus du prévu
const post = (id: string, date: string, pay: number) => ({ id, status: 'completed', date, calculated_ar: pay, employee_id: 'u1', employee_name: 'Hery', client_name: 'X', post_number: 1 });
const out = (id: string, date: string, amount: number) => ({ id, kind: 'out', category: 'Autre', amount_ar: amount, date, note: '' });
const plan = (revenue_ar: number, payroll_ar: number) => ({ revenue_ar, payroll_ar });
ok(run(ctx({ posts: [post('p1', '2026-10-10', 50000)] as any })).alerts.length === 0, 'aucun prévu réglé : aucune alerte');
r = run(ctx({ posts: [post('p1', '2026-10-10', 60000), post('p2', '2026-10-11', 60000)] as any, settings: { monthly_plan: plan(0, 100000) } as any }));
a = find(r, 'finance:plan-over:payroll');
ok(!!a && a.severity === 'watch' && a.value === 20000 && /120 000 Ar contre 100 000 Ar/.test(a.why_fr) && /120,000 Ar against 100,000 Ar/.test(a.why_en) && a.go.view === 'stats' && a.title_fr === 'Paie au-dessus du prévu ce mois-ci', 'paie 120 000 contre 100 000 prévus : alerte, 20 000 de trop');
ok(!find(run(ctx({ posts: [post('p1', '2026-10-10', 100000)] as any, settings: { monthly_plan: plan(0, 100000) } as any })), 'finance:plan-over:payroll'), 'paie exactement égale au prévu : pas dépassée');
ok(!find(run(ctx({ posts: [post('p1', '2026-09-10', 500000)] as any, settings: { monthly_plan: plan(0, 100000) } as any })), 'finance:plan-over:payroll'), 'dépassement d\'un autre mois : ignoré (seul le mois en cours compte)');
a = find(run(ctx({ cash: [out('c1', '2026-10-05', 150000), out('c2', '2026-10-06', 60000)] as any, settings: { budgets: { Loyer: 100000, Transport: 50000 } } as any })), 'finance:plan-over:expenses');
ok(!!a && a.value === 60000 && a.title_fr === 'Dépenses au-dessus du prévu ce mois-ci', 'dépenses 210 000 contre 150 000 de budgets : alerte');
ok(!find(run(ctx({ cash: [out('c1', '2026-10-05', 150000)] as any, settings: { budgets: { Loyer: 100000, Transport: 50000 } } as any })), 'finance:plan-over:expenses'), 'dépenses égales aux budgets : pas dépassées');
ok(run(ctx({ posts: [post('p1', '2026-10-10', 60000), post('p2', '2026-10-11', 60000)] as any, cash: [out('c1', '2026-10-05', 300000)] as any, settings: { monthly_plan: plan(0, 100000), budgets: { Loyer: 100000 } } as any })).alerts.length === 2, 'paie et dépenses dépassées ensemble : deux alertes séparées');
ok(run(ctx({ settings: { monthly_plan: 'faux', budgets: 5 } as any })).errors.length === 0 && run(ctx({ settings: { monthly_plan: { revenue_ar: -5, payroll_ar: 'x' } } as any })).alerts.length === 0, 'réglages faux : aucun plantage, aucune alerte');

// --- ensemble
const all = run(ctx({ shifts: [S('u1', '2026-10-29', 'day')] as any, leaves: [leave('u1', '2026-10-29', '2026-10-29')] as any, posts: [post('p1', '2026-10-10', 120000)] as any, settings: { monthly_plan: plan(0, 100000) } as any }));
ok(all.alerts.length === 2 && all.errors.length === 0 && all.alerts.every(x => alertProblem(x) === null), 'format commun respecté');
ok(all.alerts.every(x => !/[àâçéèêëîïôùûœ]/i.test(x.title_en + x.why_en + (x.todo_en || ''))), 'anglais sans accents');
ok(['planning-conflicts', 'plan-over'].every(k => !!ADVICE[k] && ADVICE[k].fr.length > 20 && ADVICE[k].en.length > 20 && !/[àâçéèêëîïôùûœ]/i.test(ADVICE[k].en)), 'chaque règle a sa solution (FR et EN)');
ok(MANAGEMENT_RULES.every(x => ALL_RULES.includes(x)), 'les règles sont dans la liste complète');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
