// Contrôle des règles de performance des salariés (module 3, partie A) : score, badges, niveaux, échantillon minimum, tendance, employé du mois.
// Sans écran, sans serveur. Lancer : npm run check:badges
import { cleanPerformanceConfig, computePerformance, employeeOfMonth, forEmployee, rankByScore, PERFORMANCE_DEFAULTS, type PerformanceInput } from '../src/utils/performanceScore';
import { addDays } from '../src/utils/stats';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);

const TODAY = '2026-10-21'; // un mercredi
const d = (ago: number) => addDays(TODAY, -ago);
const pad = (x: number) => String(x).padStart(2, '0');
let seq = 0;
const P = (emp: string, date: string, status = 'completed', o: { start?: string; dur?: number; no?: number; client?: string; id?: string } = {}): any => {
  const start = o.start ?? '09:00:00', dur = o.dur ?? 30;
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m + dur;
  return { id: o.id ?? 'p' + (++seq), employee_id: emp, employee_name: emp, client_name: o.client ?? 'M', post_number: o.no ?? 1, status, date, start_time: start, end_time: `${pad(Math.floor(tot / 60) % 24)}:${pad(tot % 60)}:00` };
};
const U = (id: string, shift = 'day', role = 'employee', status = 'active'): any => ({ id, name: id.toUpperCase(), username: id, role, status, shift });
const days = (emp: string, count: number, from = 1, status = 'completed', o: any = {}) => Array.from({ length: count }, (_, i) => P(emp, d(from + i), status, o));
const run = (users: any[], posts: any[], extra: Partial<PerformanceInput> = {}) => computePerformance({ users, posts, contracts: [], today: TODAY, ...extra });
const one = (id: string, users: any[], posts: any[], extra: Partial<PerformanceInput> = {}) => run(users, posts, extra).employees.get(id)!;
const badgeLevels = (p: any) => Object.fromEntries(p.badges.map((b: any) => [b.id, b.level]));

// --- Réglages ---
eq(cleanPerformanceConfig(undefined), PERFORMANCE_DEFAULTS, 'réglages absents : valeurs de départ');
eq(cleanPerformanceConfig({ weights: { quality: 0, volume: 0, punctuality: 0, regularity: 0 } }).weights, PERFORMANCE_DEFAULTS.weights, 'poids tous à zéro refusés');
eq(cleanPerformanceConfig({ quality_levels: [95, 90, 98] }).quality_levels, [90, 95, 98], 'niveaux qui ne montent pas : retour aux valeurs de départ');
eq(cleanPerformanceConfig({ quality_levels: [90, 95] }).quality_levels, [90, 95, 98], 'niveaux incomplets refusés');
eq(cleanPerformanceConfig({ window_days: 'x', score_min_missions: -3, month_min_team: 1000 }).window_days, 30, 'valeur texte refusée');
eq([cleanPerformanceConfig({ score_min_missions: -3 }).score_min_missions, cleanPerformanceConfig({ month_min_team: 1000 }).month_min_team], [10, 5], 'valeurs hors limites refusées');
eq(cleanPerformanceConfig({ quality_levels: [80, 85, 99], window_days: 14 }).window_days, 14, 'réglage valide gardé');

// --- Échantillon minimum, salariés pris en compte ---
eq(one('a', [U('a')], []).score, null, 'aucune mission : pas de score');
eq(one('a', [U('a')], []).attention, [], 'aucune mission : aucun point d\'attention');
eq(one('a', [U('a')], days('a', 1)).enough, false, '1 mission : pas assez de données');
eq(one('a', [U('a')], days('a', 9)).score, null, '9 missions jugées : pas de score');
ok(typeof one('a', [U('a')], days('a', 10)).score === 'number', '10 missions jugées : un score apparaît');
eq([...run([U('a'), U('adm', 'day', 'admin'), U('x', 'day', 'employee', 'inactive')], days('a', 10)).employees.keys()], ['a'], 'seuls les salariés actifs sont évalués (pas l\'admin, pas les inactifs)');
eq(run([U('a')], days('zz', 12)).employees.get('a')!.window.done, 0, 'missions d\'un inconnu ignorées');
eq(run([U('a')], [...days('a', 10), ...days('a', 10)].map((p, i) => (i >= 10 ? { ...p, id: days('a', 1)[0].id } : p))).employees.get('a')!.window.done >= 10, true, 'doublon d\'identifiant : compté une seule fois (voir cas suivant)');
const dup = P('a', d(1), 'completed', { id: 'same' });
eq(one('a', [U('a')], [dup, { ...dup }, { ...dup }]).window.done, 1, 'une mission envoyée trois fois ne compte qu\'une fois');
eq(one('a', [U('a')], [P('a', d(31)), P('a', d(30)), P('a', d(29)), P('a', d(1)), P('a', d(0)), P('a', d(-1))]).window.done, 3, 'fenêtre de 30 jours : d(29), d(1), d(0) comptent ; d(30), d(31) et le futur non');

// --- Qualité ---
const q = (done: number, rej: number) => one('a', [U('a')], [...days('a', done), ...days('a', rej, done + 1, 'rejected')]);
eq(badgeLevels(q(18, 2)).quality, 1, 'qualité : 18 validées sur 20 = 90 % = Bronze (20 missions pile)');
eq(badgeLevels(q(19, 1)).quality, 2, 'qualité : 19 sur 20 = 95 % = Argent');
eq(badgeLevels(q(20, 0)).quality, 3, 'qualité : 20 sur 20 = 100 % = Or');
eq(badgeLevels(q(17, 3)).quality, undefined, 'qualité : 85 % = pas de badge');
eq(badgeLevels(q(19, 0)).quality, undefined, 'qualité : 19 missions seulement = pas de badge (échantillon minimum 20)');
eq(one('a', [U('a')], [...days('a', 25), ...days('a', 24), ...days('a', 1, 1, 'rejected')]).window.rate, 98, 'qualité : 49 sur 50 = 98 % (deux missions par jour)');
eq(badgeLevels(one('a', [U('a')], [...days('a', 25), ...days('a', 24), ...days('a', 1, 1, 'rejected')])).quality, 3, 'qualité : 98 % = Or');
eq(badgeLevels(one('a', [U('a')], [...days('a', 29), ...days('a', 3, 30, 'rejected')])).quality, 3, 'les missions refusées de plus de 30 jours n\'entrent pas dans la fenêtre (100 % = Or)');
eq(q(16, 4).attention.map(a => a.code), ['low_quality'], 'point d\'attention : 80 % de validation');
eq(q(18, 2).attention.map(a => a.code).includes('low_quality'), false, 'pas de point d\'attention à 90 %');
ok(typeof q(18, 2).badges.find(b => b.id === 'quality')!.why.fr === 'string' && q(18, 2).badges[0].why.fr.includes('90') && q(18, 2).badges[0].why.en.includes('90'), 'chaque badge explique pourquoi, en français et en anglais');
ok(q(18, 2).badges.find(b => b.id === 'quality')!.next!.fr.length > 0, 'Bronze : indique ce qu\'il manque pour le niveau suivant');
eq(q(20, 0).badges.find(b => b.id === 'quality')!.next, undefined, 'Or : pas de niveau suivant');

// --- Durées absurdes ---
const fast = one('a', [U('a')], [...days('a', 12), ...days('a', 3, 13, 'completed', { dur: 1 })]);
eq([fast.window.suspectFast, fast.attention.map(a => a.code).includes('too_fast')], [3, true], '3 missions validées en 1 minute : signalées à l\'admin');
eq(one('a', [U('a')], days('a', 3, 1, 'completed', { dur: 1 })).window.perHour, null, 'durées de 1 minute ignorées pour le rendement');
eq(one('a', [U('a')], [P('a', d(1), 'completed', { start: '23:30:00', dur: 40 })]).window.hours, 40 / 60, 'passage de minuit : 40 minutes');
eq(one('a', [U('a')], [P('a', d(1), 'completed', { dur: 1000 })]).window.hours, 0, 'durée de plus de 16 heures ignorée');
eq(one('a', [U('a')], [P('a', d(1), 'completed', { dur: 2 })]).window.suspectFast, 0, '2 minutes pile : durée acceptée');

// --- Volume ---
const solo = one('a', [U('a')], days('a', 12));
eq(solo.components.volume, null, 'équipe d\'une personne : pas de volume');
const duo = run([U('a'), U('b')], [...days('a', 12), ...days('b', 12)]);
eq([Math.round(duo.employees.get('a')!.components.volume! * 100) / 100, duo.team.avgDone], [83.33, 12], 'deux salariés au même niveau : volume 83 (la moyenne ×1,2 donne 100)');
const duo2 = run([U('a'), U('b')], [...days('a', 24), ...days('b', 12)]);
eq(duo2.employees.get('a')!.components.volume, 100, 'volume plafonné à 100');
eq(run([U('a'), U('b')], [...days('a', 12)]).employees.get('a')!.components.volume, null, 'un seul salarié a travaillé : pas de volume');

// --- Ponctualité ---
const lateMany = (emp: string, count: number, lateOn: number[], shift = 'day') => Array.from({ length: count }, (_, i) => P(emp, d(1 + i), 'completed', { start: lateOn.includes(i) ? '08:10:00' : '07:50:00' }));
eq(one('a', [U('a')], lateMany('a', 12, [])).components.punctuality, null, 'sans heure limite de retard (Conditions vide) : ponctualité non calculée');
eq(one('a', [U('a')], lateMany('a', 12, []), { lateLimitTime: 'abc' }).components.punctuality, null, 'heure limite invalide : ignorée');
const pOk = one('a', [U('a')], lateMany('a', 10, []), { lateLimitTime: '08:00' });
eq([pOk.components.punctuality, pOk.window.workedDays, badgeLevels(pOk).punctuality], [100, 10, 3], '10 jours sans retard : 100 % = Or');
const pOne = one('a', [U('a')], lateMany('a', 10, [3]), { lateLimitTime: '08:00' });
eq([pOne.components.punctuality, badgeLevels(pOne).punctuality], [90, 1], '1 retard sur 10 jours : 90 % = Bronze');
eq(one('a', [U('a')], lateMany('a', 4, []), { lateLimitTime: '08:00' }).components.punctuality, null, 'moins de 5 jours de travail : pas de ponctualité');
eq(one('a', [U('a', 'night')], lateMany('a', 10, []), { lateLimitTime: '08:00' }).components.punctuality, null, 'salarié de nuit : ponctualité non calculée');
eq(one('a', [U('a')], [...lateMany('a', 8, []), P('a', d(9), 'completed', { start: '07:00:00' }), P('a', d(9), 'completed', { start: '11:00:00' })], { lateLimitTime: '08:00' }).window.lateDays, 0, 'c\'est la première mission de la journée qui compte');
eq(one('a', [U('a')], lateMany('a', 10, [0, 1, 2]), { lateLimitTime: '08:00' }).attention.map(a => a.code).includes('often_late'), true, '3 retards sur 10 jours (70 %) : point d\'attention');
eq(one('a', [U('a')], lateMany('a', 10, []), { lateLimitTime: '08:00' }).attention.map(a => a.code).includes('often_late'), false, 'aucun retard : aucun point d\'attention');

// --- Régularité : jours d'affilée ---
const streak = (dates: string[], extra: Partial<PerformanceInput> = {}) => one('a', [U('a')], dates.map(x => P('a', x)), extra);
eq(streak(Array.from({ length: 5 }, (_, i) => d(1 + i))).window.bestStreak, 5, '5 jours d\'affilée');
eq(badgeLevels(streak(Array.from({ length: 5 }, (_, i) => d(1 + i)))).regularity, 1, '5 jours d\'affilée = Bronze');
eq(badgeLevels(streak(Array.from({ length: 4 }, (_, i) => d(1 + i)))).regularity, undefined, '4 jours d\'affilée = pas de badge');
eq(badgeLevels(streak(Array.from({ length: 10 }, (_, i) => d(1 + i)))).regularity, 2, '10 jours d\'affilée = Argent');
eq(badgeLevels(streak(Array.from({ length: 20 }, (_, i) => d(1 + i)))).regularity, 3, '20 jours d\'affilée = Or');
// Du lundi 12 au samedi 17 octobre, puis le lundi 19 : le dimanche 18 sans mission ne casse pas la série
const mon12 = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19'];
eq(streak(mon12).window.bestStreak, 7, 'le dimanche sans mission ne casse pas la série (lundi à samedi + lundi = 7)');
eq(streak(mon12, { workDaysPerWeek: 7 }).window.bestStreak, 6, 'si on travaille 7 jours sur 7, le dimanche manquant casse la série');
eq(streak(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16']).window.bestStreak, 2, 'un mercredi manquant casse la série');
eq(Math.round(streak(Array.from({ length: 12 }, (_, i) => d(1 + i))).components.regularity!), Math.round(1200 / 26), 'régularité : jours actifs ÷ 26 jours attendus (6 jours par semaine)');
eq(Math.round(streak(Array.from({ length: 12 }, (_, i) => d(1 + i)), { workDaysPerWeek: 5 }).components.regularity!), Math.round(1200 / 21), 'régularité avec 5 jours par semaine : ÷ 21');

// --- Rendement ---
const speed = run([U('a'), U('b')], [...days('a', 20, 1, 'completed', { dur: 30 }), ...days('b', 20, 1, 'completed', { dur: 60 })]);
eq([badgeLevels(speed.employees.get('a')!).rendement, badgeLevels(speed.employees.get('b')!).rendement], [3, undefined], 'rendement : le plus rapide gagne Or (+50 %), l\'autre rien');
eq(badgeLevels(run([U('a'), U('b')], [...days('a', 19, 1, 'completed', { dur: 30 }), ...days('b', 19, 1, 'completed', { dur: 60 })]).employees.get('a')!).rendement, undefined, 'rendement : moins de 20 missions = pas de badge');
eq(badgeLevels(one('a', [U('a')], days('a', 25, 1, 'completed', { dur: 30 }))).rendement, undefined, 'rendement : seul dans l\'équipe, pas de comparaison');
const r10 = run([U('a'), U('b')], [...days('a', 20, 1, 'completed', { dur: 30 }), ...days('b', 20, 1, 'completed', { dur: 36 })]);
eq(badgeLevels(r10.employees.get('a')!).rendement, 1, 'rendement : +10 % exactement = Bronze');

// --- Polyvalence (types de mission) ---
const contracts: any[] = [{ id: 'c1', post_number: 1, client_name: 'M1', post_type: 'SAISIE' }, { id: 'c2', post_number: 2, client_name: 'M2', post_type: 'WEB' }, { id: 'c3', post_number: 3, client_name: 'M3', post_type: 'ADMIN' }, { id: 'c4', post_number: 4, client_name: 'M4', post_type: 'CONTRÔLE' }, { id: 'c5', post_number: 5, client_name: 'M5', post_type: 'AIDE' }, { id: 'c6', post_number: 6, client_name: 'M6', post_type: '' }];
const typed = (nos: number[]) => one('a', [U('a')], nos.map((no, i) => P('a', d(1 + i), 'completed', { no, client: 'M' + no })), { contracts } as any);
eq(typed([1]).badges.find(b => b.id === 'versatility'), undefined, '1 type : pas de polyvalence');
eq(badgeLevels(typed([1, 2])).versatility, 1, '2 types = Bronze');
eq(badgeLevels(typed([1, 2, 3])).versatility, 2, '3 types = Argent');
eq(badgeLevels(typed([1, 2, 3, 4, 5])).versatility, 3, '5 types = Or');
eq(typed([1, 1, 1, 6]).window.types, ['SAISIE'], 'un type vide est ignoré, les doublons aussi');

// --- Recrue prometteuse ---
eq(badgeLevels(one('a', [U('a')], days('a', 10, 1))).rookie, 1, 'recrue : 10 premières missions toutes validées, récentes');
eq(badgeLevels(one('a', [U('a')], [...days('a', 9, 2), P('a', d(1), 'rejected')])).rookie, undefined, 'recrue : une refusée parmi les 10 premières = pas de badge');
eq(badgeLevels(one('a', [U('a')], days('a', 9, 1))).rookie, undefined, 'recrue : 9 missions seulement');
eq(badgeLevels(one('a', [U('a')], days('a', 10, 95))).rookie, undefined, 'recrue : première mission trop ancienne (plus de 90 jours)');
eq(badgeLevels(one('a', [U('a')], [...days('a', 10, 100), ...days('a', 3, 1)])).rookie, undefined, 'recrue : ce sont les 10 premières missions de toute sa vie qui comptent');

// --- Score ---
const sc = run([U('a'), U('b')], [...days('a', 14), ...days('a', 1, 15, 'rejected'), ...days('b', 10)]).employees.get('a')!;
const w = PERFORMANCE_DEFAULTS.weights, c = sc.components;
eq(c.punctuality, null, 'sans heure limite : composante ponctualité absente');
eq(sc.score, Math.round((w.quality * c.quality! + w.volume * c.volume! + w.regularity * c.regularity!) / (w.quality + w.volume + w.regularity)), 'sans ponctualité : les poids restants sont recalculés à 100 %');
const sc4 = run([U('a'), U('b')], [...days('a', 14), ...days('a', 1, 15, 'rejected'), ...days('b', 10)], { lateLimitTime: '09:30' }).employees.get('a')!;
eq(sc4.components.punctuality, 100, 'avec heure limite 09:30 et départ à 09:00 : ponctualité 100');
eq(sc4.score, Math.round((w.quality * sc4.components.quality! + w.volume * sc4.components.volume! + w.punctuality * 100 + w.regularity * sc4.components.regularity!) / 100), 'avec les 4 composantes : 40 / 25 / 20 / 15');
eq(one('a', [U('a')], days('a', 12), { cfg: { weights: { quality: 100, volume: 0, punctuality: 0, regularity: 0 } } }).score, 100, 'poids personnalisés : seule la qualité compte');
ok(one('a', [U('a')], days('a', 12)).score! >= 0 && one('a', [U('a')], days('a', 12)).score! <= 100, 'le score reste entre 0 et 100');
const noWeight = one('a', [U('a')], days('a', 12), { cfg: { weights: { quality: 0, volume: 0, punctuality: 0, regularity: 100 } } });
eq(noWeight.score, Math.round(noWeight.components.regularity!), 'poids 100 % sur la régularité : le score est la régularité');
eq(one('a', [U('a')], [...days('a', 5), ...days('a', 5, 6, 'rejected')], { cfg: { score_min_missions: 12 } }).score, null, 'seuil de missions réglable (12) : 10 missions ne suffisent pas');

// --- Tendance ---
const tr = one('a', [U('a')], [...days('a', 12, 1), ...days('a', 12, 31), ...days('a', 12, 61)]);
eq([tr.trend.scores.map(s => s !== null), tr.trend.delta === 0 || typeof tr.trend.delta === 'number'], [[true, true, true], true], 'tendance : 3 fenêtres de 30 jours');
eq(one('a', [U('a')], days('a', 12, 1)).trend.delta, null, 'tendance : pas de fenêtre précédente = pas d\'écart');
eq(one('a', [U('a')], [...days('a', 12, 1, 'completed'), ...days('a', 12, 31, 'rejected')]).trend.delta !== null, true, 'tendance : écart calculé quand les deux fenêtres ont assez de données');

// --- Points d'attention ---
eq(one('a', [U('a')], [...days('a', 5, 1), ...days('a', 20, 31)]).attention.map(a => a.code).includes('volume_drop'), true, 'point d\'attention : volume en baisse de 75 %');
eq(one('a', [U('a')], [...days('a', 12, 10)]).attention.map(a => a.code).includes('inactive_7d'), true, 'point d\'attention : rien de validé depuis 7 jours');
eq(one('a', [U('a')], [...days('a', 12, 1)]).attention.map(a => a.code).includes('inactive_7d'), false, 'actif cette semaine : pas d\'alerte d\'inactivité');
const mine = forEmployee(q(16, 4));
eq(['attention' in mine, 'badges' in mine, 'score' in mine], [false, true, true], 'le salarié ne reçoit jamais ses points d\'attention (D9), seulement score et badges (D8)');

// --- Classement ---
const rk = rankByScore({ today: TODAY, cfg: PERFORMANCE_DEFAULTS, team: { size: 4, workers: 4, avgDone: 1, perHour: 1 }, employees: new Map([['a', { id: 'a', name: 'A', score: 90 }], ['b', { id: 'b', name: 'B', score: 90 }], ['c', { id: 'c', name: 'C', score: 80 }], ['z', { id: 'z', name: 'Z', score: null }]] as any) });
eq(rk.map(r => [r.id, r.rank]), [['a', 1], ['b', 1], ['c', 3], ['z', null]], 'classement : ex æquo au même rang (1, 1, 3), sans score en fin de liste');

// --- Employé du mois ---
const five = ['a', 'b', 'c', 'd', 'e'].map(i => U(i));
const month = (emp: string, count: number, rej = 0) => [...Array.from({ length: count }, (_, i) => P(emp, `2026-09-${pad(1 + i)}`)), ...Array.from({ length: rej }, (_, i) => P(emp, `2026-09-${pad(1 + count + i)}`, 'rejected'))];
eq(employeeOfMonth({ users: five.slice(0, 4), posts: month('a', 22), contracts: [], today: TODAY }, '2026-09').reason, 'team_too_small', 'employé du mois : moins de 5 salariés actifs');
const eom = employeeOfMonth({ users: five, posts: [...month('a', 22), ...month('b', 21, 1), ...month('c', 20, 2)], contracts: [], today: TODAY }, '2026-09');
eq([eom.winners.map(x => x.id), eom.eligible], [['a'], 3], 'employé du mois : le meilleur score parmi ceux qui ont 20 missions ou plus');
eq(employeeOfMonth({ users: five, posts: [...month('a', 22), ...month('b', 22)], contracts: [], today: TODAY }, '2026-09').winners.map(x => x.id), ['a', 'b'], 'employé du mois : ex æquo = tous cités');
eq(employeeOfMonth({ users: five, posts: [...month('a', 12), ...month('b', 15)], contracts: [], today: TODAY }, '2026-09').reason, 'nobody_eligible', 'employé du mois : personne n\'a 20 missions');
eq(employeeOfMonth({ users: five, posts: month('a', 22), contracts: [], today: TODAY }, '2026-9').reason, 'nobody_eligible', 'employé du mois : mois mal écrit refusé');
eq(employeeOfMonth({ users: five, posts: [...month('a', 22), P('a', '2026-10-01'), ...month('b', 21, 1)], contracts: [], today: TODAY }, '2026-09').winners.map(x => x.id), ['a'], 'employé du mois : seules les missions du mois comptent');
const feb = (emp: string, extra: any[] = []) => [...Array.from({ length: 20 }, (_, i) => P(emp, `2024-02-${pad(10 + i > 29 ? 29 : 10 + i)}`, 'completed', { id: `${emp}f${i}` })), ...extra];
eq(employeeOfMonth({ users: five, posts: [...feb('a'), P('a', '2024-03-01', 'rejected', { id: 'mar1' })], contracts: [], today: '2024-03-10' }, '2024-02').winners.map(x => x.id), ['a'], 'février 2024 (bissextile) : le 29 février compte, le 1er mars non');
eq(employeeOfMonth({ users: five, posts: [...month('a', 22).map((p, i) => ({ ...p, date: `2026-12-${pad(1 + i)}` })), P('b', '2027-01-01', 'rejected')], contracts: [], today: '2027-01-15' }, '2026-12').winners.map(x => x.id), ['a'], 'décembre : le mois s\'arrête le 31, le 1er janvier est exclu');

// --- Pureté et vitesse ---
const frozenPosts = Object.freeze(days('a', 12).map(p => Object.freeze(p))) as any;
let threw = false; try { run(Object.freeze([Object.freeze(U('a'))]) as any, frozenPosts); employeeOfMonth({ users: Object.freeze(five) as any, posts: frozenPosts, contracts: [], today: TODAY }, '2026-09'); } catch { threw = true; }
eq(threw, false, 'les données reçues ne sont jamais modifiées');
const many = Array.from({ length: 200 }, (_, i) => U('e' + i, i % 2 ? 'night' : 'day'));
const lots: any[] = []; for (let i = 0; i < 40000; i++) lots.push(P('e' + (i % 200), d(i % 85), i % 17 === 0 ? 'rejected' : 'completed', { start: i % 5 ? '07:50:00' : '08:20:00', dur: 20 + (i % 40), no: 1 + (i % 5), id: 'big' + i }));
const t0 = Date.now(); const big = run(many, lots, { lateLimitTime: '08:00', contracts } as any); const ms1 = Date.now() - t0;
eq([big.employees.size, ms1 < 1200], [200, true], `200 salariés et 40 000 missions : calculé en ${ms1} ms (moins de 1,2 s)`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
