// Contrôle du rapport automatique (M15.5, règles pures). Lancer : npm run check:auto-report
import { AUTO_REPORT_DEFAULT, AUTO_REPORT_LIMITS, checkReportRecord, cleanAutoReport, describeAutoReport, dueReport, freezeReport, nextAutoReport, periodForRun, periodFromId, reportNotice, reportRunsOn, reportsToPrune, type AutoReportSetting, type ReportRecord } from '../src/utils/autoReport';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);
const MS = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h - 3, mi); // heure de Madagascar → millisecondes UTC
const weekly = (weekday: number, time = '08:00'): AutoReportSetting => ({ frequency: 'weekly', weekday, month_day: 1, time });
const monthly = (day: number, time = '08:00'): AutoReportSetting => ({ frequency: 'monthly', weekday: 1, month_day: day, time });

// ---- Réglage : nettoyage
eq(cleanAutoReport(undefined), AUTO_REPORT_DEFAULT, 'rien reçu = arrêté');
eq(cleanAutoReport(null), AUTO_REPORT_DEFAULT, 'null = arrêté');
eq(cleanAutoReport([]), AUTO_REPORT_DEFAULT, 'tableau = arrêté');
eq(cleanAutoReport('weekly'), AUTO_REPORT_DEFAULT, 'texte = arrêté');
eq(cleanAutoReport({ frequency: 'weekly', weekday: 3, month_day: 15, time: '17:30' }), { frequency: 'weekly', weekday: 3, month_day: 15, time: '17:30' }, 'réglage valide gardé');
eq(cleanAutoReport({ frequency: 'daily' }).frequency, 'off', 'fréquence inconnue = arrêté');
eq(cleanAutoReport({ frequency: 'weekly', weekday: 8 }).weekday, 1, 'jour 8 = lundi (départ)');
eq(cleanAutoReport({ frequency: 'weekly', weekday: 2.5 }).weekday, 1, 'jour non entier = départ');
eq(cleanAutoReport({ frequency: 'monthly', month_day: 0 }).month_day, 1, 'jour 0 du mois = départ');
eq(cleanAutoReport({ frequency: 'monthly', month_day: 32 }).month_day, 1, 'jour 32 du mois = départ');
eq(cleanAutoReport({ frequency: 'monthly', month_day: '5' }).month_day, 1, 'jour en texte = départ');
eq(cleanAutoReport({ time: '8:00' }).time, '08:00', 'heure 8:00 = départ');
eq(cleanAutoReport({ time: '24:00' }).time, '08:00', 'heure 24:00 = départ');
eq(cleanAutoReport({ frequency: 'weekly', extra: 1 }), { ...AUTO_REPORT_DEFAULT, frequency: 'weekly' }, 'champ inconnu ignoré');
eq(cleanAutoReport(JSON.parse('{"__proto__":{"x":1},"frequency":"weekly"}')), { ...AUTO_REPORT_DEFAULT, frequency: 'weekly' }, 'clé dangereuse sans effet');

// ---- Périodes
eq(periodFromId('w-2026-10-12'), { id: 'w-2026-10-12', kind: 'week', start: '2026-10-12', end: '2026-10-18' }, 'semaine du lundi 12 au dimanche 18');
eq(periodFromId('w-2026-10-13'), null, 'une semaine qui ne commence pas un lundi est refusée');
eq(periodFromId('w-2026-02-30'), null, 'date fausse refusée');
eq(periodFromId('m-2026-09'), { id: 'm-2026-09', kind: 'month', start: '2026-09-01', end: '2026-09-30' }, 'septembre : 30 jours');
eq(periodFromId('m-2028-02')?.end, '2028-02-29', 'février bissextile : 29');
eq(periodFromId('m-2026-02')?.end, '2026-02-28', 'février 2026 : 28');
eq(periodFromId('m-2026-13'), null, 'mois 13 refusé');
eq(periodFromId('m-1999-12'), null, 'année avant 2000 refusée');
eq(periodFromId('x-2026-09'), null, 'préfixe inconnu refusé');
eq(periodFromId(5), null, 'identifiant qui n\'est pas du texte refusé');
eq(periodFromId(undefined), null, 'identifiant absent refusé');

// ---- Jour concerné
ok(reportRunsOn(weekly(1), '2026-10-26'), 'lundi 26/10/2026 tombe sur « lundi »');
ok(!reportRunsOn(weekly(1), '2026-10-27'), 'mardi ne tombe pas sur « lundi »');
ok(reportRunsOn(weekly(7), '2026-10-25'), 'dimanche = jour 7');
ok(!reportRunsOn({ ...weekly(1), frequency: 'off' }, '2026-10-26'), 'arrêté ne tombe jamais');
ok(reportRunsOn(monthly(1), '2026-11-01'), 'le 1er tombe le 1er');
ok(reportRunsOn(monthly(31), '2026-11-30'), 'le 31 tombe le 30 novembre');
ok(!reportRunsOn(monthly(31), '2026-11-29'), 'le 31 ne tombe pas le 29 novembre');
ok(reportRunsOn(monthly(31), '2026-02-28'), 'le 31 tombe le 28 février');
ok(!reportRunsOn(monthly(5), 'pas une date'), 'date fausse : jamais');

// ---- Période finie couverte
eq(periodForRun(weekly(1), '2026-10-26')?.id, 'w-2026-10-19', 'lundi 26/10 : rapport de la semaine du 19 au 25');
eq(periodForRun(weekly(3), '2026-10-28')?.id, 'w-2026-10-19', 'mercredi 28/10 : rapport de la semaine d\'avant (19 au 25)');
eq(periodForRun(weekly(7), '2026-10-25')?.id, 'w-2026-10-12', 'dimanche 25/10 : la semaine en cours n\'est pas finie, c\'est celle d\'avant');
eq(periodForRun(monthly(1), '2026-11-01')?.id, 'm-2026-10', 'le 1er novembre : rapport d\'octobre');
eq(periodForRun(monthly(1), '2027-01-01')?.id, 'm-2026-12', 'le 1er janvier : rapport de décembre de l\'année d\'avant');
eq(periodForRun({ ...monthly(1), frequency: 'off' }, '2026-11-01'), null, 'arrêté : aucune période');
eq(periodForRun(monthly(1), 'faux'), null, 'date fausse : aucune période');

// ---- À créer maintenant
{
  const s = weekly(1, '08:00'); // lundi 08:00
  eq(dueReport(s, MS(2026, 10, 26, 7, 59)), null, '1 min avant l\'heure : rien');
  eq(dueReport(s, MS(2026, 10, 26, 8, 0))?.id, 'w-2026-10-19', 'à l\'heure pile : créé');
  eq(dueReport(s, MS(2026, 10, 26, 9, 59))?.id, 'w-2026-10-19', 'avant 2 h : créé');
  eq(dueReport(s, MS(2026, 10, 26, 10, 0)), null, 'à 2 h pile : trop tard, pas rattrapé');
  eq(dueReport(s, MS(2026, 10, 27, 8, 0)), null, 'mardi : rien');
  eq(dueReport({ ...s, frequency: 'off' }, MS(2026, 10, 26, 8, 0)), null, 'arrêté : rien');
  // Même identifiant à chaque passage de la tâche : pas de doublon possible
  eq(dueReport(s, MS(2026, 10, 26, 8, 0))?.id === dueReport(s, MS(2026, 10, 26, 9, 45))?.id, true, 'même identifiant à 08:00 et 09:45');
  // Passage de minuit : réglé à 23:30, la tâche passe encore le lendemain à 00:15
  const late = weekly(1, '23:30');
  eq(dueReport(late, MS(2026, 10, 27, 0, 15))?.id, 'w-2026-10-19', '23:30 : encore créé à 00:15 le lendemain');
  eq(dueReport(late, MS(2026, 10, 27, 1, 30)), null, '23:30 : plus à 01:30');
  const m = monthly(1, '08:00');
  eq(dueReport(m, MS(2026, 11, 1, 8, 30))?.id, 'm-2026-10', 'mensuel : 1er novembre 08:30');
  eq(dueReport(m, MS(2026, 11, 2, 8, 30)), null, 'mensuel : le 2, rien');
  eq(dueReport(monthly(31, '08:00'), MS(2026, 11, 30, 8, 5))?.id, 'm-2026-10', 'le 31 : tombe le 30 novembre');
}

// ---- Prochaine exécution
eq(nextAutoReport({ ...weekly(1), frequency: 'off' }, MS(2026, 10, 27, 10)), null, 'arrêté : pas de prochaine');
eq(nextAutoReport(weekly(1), MS(2026, 10, 27, 10)), MS(2026, 11, 2, 8), 'mardi 27/10 : prochain lundi 2/11 à 08:00');
eq(nextAutoReport(weekly(1), MS(2026, 10, 26, 7)), MS(2026, 10, 26, 8), 'lundi 07:00 : le jour même à 08:00');
eq(nextAutoReport(weekly(1), MS(2026, 10, 26, 8)), MS(2026, 11, 2, 8), 'lundi 08:00 pile : la semaine suivante');
eq(nextAutoReport(monthly(1), MS(2026, 10, 27, 10)), MS(2026, 11, 1, 8), 'mensuel : 1er novembre');

// ---- Fiche de rapport
const T0 = '2026-10-26T05:00:00.000Z', T1 = '2026-10-27T06:30:00.000Z';
const pending = { id: 'w-2026-10-19', status: 'pending', created_at: T0 };
{
  const v = checkReportRecord(pending);
  eq(v.ok && v.value, { id: 'w-2026-10-19', kind: 'week', start: '2026-10-19', end: '2026-10-25', status: 'pending', created_at: T0 }, 'fiche en attente : type et dates recalculés');
  const lie = checkReportRecord({ ...pending, kind: 'month', start: '2000-01-01', end: '2000-01-31' });
  eq(lie.ok && lie.value.kind + lie.value.start + lie.value.end, 'week2026-10-192026-10-25', 'type, début et fin envoyés sont ignorés');
}
const bad = (d: unknown, error: string, name: string) => eq(checkReportRecord(d), { ok: false, error }, name);
bad(null, 'format', 'rien refusé');
bad([], 'format', 'tableau refusé');
bad(JSON.parse('{"__proto__":{"x":1},"id":"m-2026-09","status":"pending","created_at":"' + T0 + '"}'), 'format', 'clé dangereuse refusée');
bad({ ...pending, id: 'w-2026-10-20' }, 'id', 'semaine qui ne commence pas un lundi refusée');
bad({ ...pending, id: 'rapport' }, 'id', 'identifiant libre refusé');
bad({ ...pending, status: 'done' }, 'status', 'état inconnu refusé');
bad({ ...pending, created_at: 'hier' }, 'date', 'date de création fausse refusée');
bad({ ...pending, created_at: 5 }, 'date', 'date de création en nombre refusée');
bad({ ...pending, html: '<p>x</p>' }, 'status', 'en attente avec un texte refusée');
bad({ ...pending, status: 'ready', frozen_at: T1 }, 'html', 'prête sans texte refusée');
bad({ ...pending, status: 'ready', frozen_at: T1, html: '   ' }, 'html', 'prête avec texte vide refusée');
bad({ ...pending, status: 'ready', frozen_at: T1, html: 'x'.repeat(AUTO_REPORT_LIMITS.html + 1) }, 'html', 'texte trop gros refusé');
bad({ ...pending, status: 'ready', html: '<p>x</p>' }, 'date', 'prête sans date de copie refusée');
bad({ ...pending, status: 'ready', frozen_at: T1, html: 42 }, 'html', 'texte qui n\'est pas du texte refusé');
ok(checkReportRecord({ ...pending, status: 'ready', frozen_at: T1, html: 'x'.repeat(AUTO_REPORT_LIMITS.html) }).ok, 'texte à la limite exacte accepté');

// ---- Copie figée : une seule fois
{
  const p = checkReportRecord(pending); if (!p.ok) throw new Error('fiche de test fausse');
  const f = freezeReport(p.value, '<p>Rapport</p>', T1);
  eq(f && { status: f.status, frozen_at: f.frozen_at, html: f.html, id: f.id }, { status: 'ready', frozen_at: T1, html: '<p>Rapport</p>', id: 'w-2026-10-19' }, 'fiche en attente : copie figée');
  eq(f && freezeReport(f, '<p>Autre</p>', '2026-10-28T00:00:00.000Z'), null, 'fiche déjà prête : JAMAIS changée');
  eq(freezeReport(null, '<p>x</p>', T1), null, 'fiche absente : rien');
  eq(freezeReport(p.value, '', T1), null, 'texte vide : refusé');
  eq(freezeReport(p.value, 7, T1), null, 'texte qui n\'est pas du texte : refusé');
  eq(freezeReport(p.value, 'x'.repeat(AUTO_REPORT_LIMITS.html + 1), T1), null, 'texte trop gros : refusé');
  eq(p.value.status, 'pending', 'la fiche d\'origine n\'est pas modifiée');
}

// ---- Garder les 24 plus récentes
{
  const ids: { id: string }[] = [];
  for (let i = 0; i < 30; i++) ids.push({ id: `w-${new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10)}` }); // 30 lundis
  const del = reportsToPrune(ids);
  eq(del.length, 6, '30 fiches : 6 à supprimer');
  eq(del.includes('w-2026-01-05') && del.includes('w-2026-02-09') && !del.includes('w-2026-02-16'), true, 'les 6 plus anciennes');
  eq(reportsToPrune(ids.slice(0, 24)), [], '24 fiches : rien à supprimer');
  eq(reportsToPrune([]), [], 'liste vide : rien');
  eq(reportsToPrune([{ id: 'm-2026-09' }, { id: 'm-2026-08' }, { id: 'm-2026-07' }], 2), ['m-2026-07'], 'garde les 2 plus récentes (limite donnée)');
}

// ---- Textes
eq(reportNotice(periodFromId('w-2026-10-19')!).fr.title, 'Rapport de la semaine prêt', 'notification semaine FR');
eq(reportNotice(periodFromId('m-2026-09')!).en.title, 'Monthly report ready', 'notification mois EN');
ok(reportNotice(periodFromId('m-2026-09')!).fr.body.includes('2026-09-01') && reportNotice(periodFromId('m-2026-09')!).fr.body.includes('2026-09-30'), 'la notification cite la période');
eq(describeAutoReport(AUTO_REPORT_DEFAULT), 'Arrêté', 'phrase : arrêté FR');
eq(describeAutoReport(AUTO_REPORT_DEFAULT, 'en'), 'Off', 'phrase : arrêté EN');
eq(describeAutoReport(weekly(1)), 'Chaque lundi à 08:00', 'phrase : chaque lundi');
eq(describeAutoReport(weekly(5, '17:00'), 'en'), 'Every Friday at 17:00', 'phrase : chaque vendredi EN');
eq(describeAutoReport(monthly(1)), 'Le 1er de chaque mois à 08:00', 'phrase : le 1er');
eq(describeAutoReport(monthly(15)), 'Le 15 de chaque mois à 08:00', 'phrase : le 15');

console.log(fails ? `\n${fails} échec(s) sur ${n} contrôles.` : `OK : ${n}/${n} contrôles.`);
process.exit(fails ? 1 : 0);
