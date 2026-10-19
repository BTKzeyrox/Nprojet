// Contrôle des calculs de la page Statistiques (sans écran, sans serveur).
// Lancer : npx --yes tsx scripts/check-stats.ts
import { addDays, buckets, comparableRanges, computeStats, missionAmount, periodLabel, periodRange, shiftAnchor, variation } from '../src/utils/stats';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

// --- Périodes ---
eq(periodRange('day', '2026-10-18'), { start: '2026-10-18', end: '2026-10-18', days: 1 }, 'jour');
eq(periodRange('week', '2026-10-18'), { start: '2026-10-12', end: '2026-10-18', days: 7 }, 'semaine : un dimanche appartient à la semaine du lundi d\'avant');
eq(periodRange('week', '2026-10-12'), { start: '2026-10-12', end: '2026-10-18', days: 7 }, 'semaine : le lundi est le premier jour');
eq(periodRange('week', '2026-09-30'), { start: '2026-09-28', end: '2026-10-04', days: 7 }, 'semaine à cheval sur deux mois');
eq(periodRange('month', '2026-10-18'), { start: '2026-10-01', end: '2026-10-31', days: 31 }, 'mois de 31 jours');
eq(periodRange('month', '2026-02-10').end, '2026-02-28', 'février 2026 = 28 jours');
eq(periodRange('month', '2024-02-10').end, '2024-02-29', 'février 2024 (bissextile) = 29 jours');
eq(periodRange('year', '2024-06-01').days, 366, 'année bissextile = 366 jours');
eq(periodRange('year', '2026-06-01').days, 365, 'année normale = 365 jours');
eq(shiftAnchor('month', '2026-01-15', -1), '2025-12-01', 'mois précédent de janvier = décembre de l\'année d\'avant');
eq(shiftAnchor('month', '2026-12-31', 1), '2027-01-01', 'mois suivant de décembre = janvier suivant');
eq(shiftAnchor('year', '2026-05-05', -1), '2025-01-01', 'année précédente');
eq(addDays('2026-03-01', -1), '2026-02-28', 'jour avant le 1er mars');

// --- Comparaison juste (période en cours coupée à aujourd'hui) ---
const c = comparableRanges('month', '2026-10-01', '2026-10-18');
eq([c.curEff.end, c.curEff.days, c.prev.start, c.prev.end, c.inProgress], ['2026-10-18', 18, '2026-09-01', '2026-09-18', true], 'mois en cours : comparé aux 18 mêmes jours du mois d\'avant');
const c2 = comparableRanges('month', '2026-03-01', '2026-03-31');
eq([c2.inProgress, c2.prev.end], [false, '2026-02-28'], 'dernier jour du mois : période finie, mois d\'avant entier (28 jours)');
eq(comparableRanges('month', '2026-03-01', '2026-03-30').prev.end, '2026-02-28', 'mars en cours (30 j) : on ne dépasse pas la fin de février');
eq(comparableRanges('week', '2026-11-02', '2026-10-18').isFuture, true, 'période future détectée');

// --- Libellés ---
eq(periodLabel('month', '2026-10-18', 'fr'), 'Octobre 2026', 'titre du mois (FR)');
eq(periodLabel('year', '2026-10-18'), '2026', 'titre de l\'année');

// --- Barres ---
eq([buckets('day', periodRange('day', '2026-10-18')).count, buckets('week', periodRange('week', '2026-10-18')).count, buckets('month', periodRange('month', '2026-10-18')).count, buckets('year', periodRange('year', '2026-10-18')).count], [24, 7, 31, 12], 'nombre de barres : 24 / 7 / 31 / 12');
eq(buckets('month', periodRange('month', '2026-10-18')).index('2026-10-05'), 4, 'barre du 5 octobre = 5e barre');
eq(buckets('year', periodRange('year', '2026-10-18')).index('2026-12-31'), 11, 'barre de décembre = 12e barre');
eq(buckets('day', periodRange('day', '2026-10-18')).index('2026-10-18', '14:35:00'), 14, 'barre de 14 h');

// --- Variation ---
eq(variation(12, 10), { pct: 20, dir: 'up' }, 'variation +20 %');
eq(variation(5, 10), { pct: -50, dir: 'down' }, 'variation -50 %');
eq(variation(3, 0), { pct: null, dir: 'up' }, 'avant = 0 : pas de pourcentage');
eq(variation(0, 0), { pct: null, dir: 'flat' }, '0 et 0 : stable');

// --- Chiffres ---
const mk = (id: string, emp: string, date: string, status: string, extra: Record<string, unknown> = {}) => ({ id, employee_id: emp, employee_name: emp, client_name: 'M' + id, account_tag: '', target_score: 0, initial_score: 0, current_score: 0, remaining_score: 0, status, shift_type: 'day', date, start_time: '09:00:00', end_time: '10:30:00', post_number: 1, start_proof_url: '', created_at: '', updated_at: '', ...extra }) as any;
const input = {
  pricePerMission: 5000,
  users: [
    { id: 'u1', name: 'Ana', role: 'employee', status: 'active', shift: 'day' }, { id: 'u2', name: 'Bob', role: 'employee', status: 'active', shift: 'night' },
    { id: 'u3', name: 'Cid', role: 'employee', status: 'active', shift: 'day' }, { id: 'a', name: 'Admin', role: 'admin', status: 'active', shift: 'day' },
  ] as any,
  contracts: [{ id: 'c1', post_number: 1, client_name: 'M1', post_type: 'SAISIE', priority: 'Normale' }, { id: 'c2', post_number: 2, client_name: 'X', post_type: 'WEB', priority: 'Urgente' }, { id: 'c3', post_number: 3, client_name: 'Y', priority: 'Normale' }, { id: 'c4', post_number: 4, client_name: 'Z', no_account: true }] as any,
  advances: [
    { id: 'v1', employee_id: 'u1', employee_name: 'Ana', amount_ar: 20000, reason: '', request_date: '2026-10-10', status: 'approved' },
    { id: 'v2', employee_id: 'u2', employee_name: 'Bob', amount_ar: 8000, reason: '', request_date: '2026-10-12', status: 'pending' },
    { id: 'v3', employee_id: 'u1', employee_name: 'Ana', amount_ar: 5000, reason: '', request_date: '2026-09-05', status: 'approved' },
  ] as any,
  posts: [
    mk('1', 'u1', '2026-10-05', 'completed', { calculated_ar: 5000 }), mk('2', 'u1', '2026-10-06', 'completed', { calculated_ar: 5000 }), mk('3', 'u2', '2026-10-06', 'completed', { calculated_ar: 7000 }),
    mk('4', 'u2', '2026-10-07', 'rejected'), mk('5', 'u1', '2026-09-05', 'completed', { calculated_ar: 5000 }), mk('6', 'u2', '2026-09-20', 'completed'),
    mk('7', 'u3', '2026-10-17', 'active', { post_number: 2 }), mk('8', 'u3', '2026-10-17', 'pending_end', { post_number: 3 }),
  ] as any,
};
const s = computeStats(input, 'month', '2026-10-01', '2026-10-18');
eq([s.cur.done, s.cur.rejected, s.cur.rate], [3, 1, 75], 'octobre : 3 faites, 1 refusée, taux 75 %');
eq(s.cur.earned, 17000, 'salaires gagnés = somme des montants calculés (5000 + 5000 + 7000)');
eq(s.cur.advances, 20000, 'avances accordées sur la période');
eq(s.prev.done, 1, 'septembre (1 → 18) : 1 mission faite (la mission du 20 septembre est hors comparaison)');
eq(missionAmount(mk('x', 'u1', '2026-10-01', 'completed'), 5000), 5000, 'montant de repli = tarif fixe');
eq(s.series.done[4] + s.series.done[5], 3, 'les 3 missions sont dans les barres des 5 et 6 octobre');
eq(s.byType, [{ label: 'SAISIE', count: 3 }], 'missions par type (liées par numéro de poste)');
eq(s.upcoming, { todo: 1, active: 1, toValidate: 1, urgent: 0, total: 3 }, 'à venir : 1 à faire, 1 en cours, 1 à valider (poste sans compte ignoré)');
eq(s.team.ranking.map(r => [r.name, r.done]), [['Ana', 2], ['Bob', 1], ['Cid', 0]], 'classement des employés');
eq([s.team.active, s.team.day, s.team.night, s.team.idle], [3, 2, 1, ['Cid']], 'équipe : 3 actifs (2 jour, 1 nuit), Cid sans mission');
eq([s.salary.pendingAdvanceCount, s.salary.pendingAdvanceAr], [1, 8000], 'avances en attente');
const f = computeStats(input, 'month', '2026-12-01', '2026-10-18');
eq([f.cur.done, f.series.done.reduce((a, b) => a + b, 0)], [0, 0], 'mois futur : tout à zéro, sans erreur');
const e = computeStats({ ...input, posts: [], advances: [], contracts: [], users: [] }, 'week', '2026-10-18', '2026-10-18');
eq([e.cur.done, e.cur.rate, e.team.perHead, e.cur.avgMin], [0, null, null, null], 'aucune donnée : zéros et « – », sans erreur');
eq(computeStats(input, 'year', '2026-10-18', '2026-10-18').cur.done, 5, 'année 2026 : 5 missions faites (3 en octobre, 2 en septembre)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
