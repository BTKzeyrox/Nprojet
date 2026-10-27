// Contrôle du rapport automatique (M15.5, règles pures). Lancer : npm run check:auto-report
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
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

// ---- Site / serveur : le bloc AUTOREPORT du serveur est le même texte et donne les mêmes réponses
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\/\/ ===== BEGIN AUTOREPORT[^\n]*\n([\s\S]*?)\/\/ ===== END AUTOREPORT =====/);
  ok(!!m, 'serveur : bloc AUTOREPORT présent');
  if (m) {
    const site = readFileSync('src/utils/autoReport.ts', 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l, i, a) => !(i < a.findIndex((x) => !x.startsWith('//')))).join('\n');
    const strip = (s: string) => s.replace(/^export /gm, '').trim();
    ok(strip(site) === strip(m[1]), 'serveur : le bloc est la copie exacte de src/utils/autoReport.ts (sans « export »)');
    const js = transformSync(m[1] + '\n;globalThis.__s = { cleanAutoReport, periodFromId, dueReport, nextAutoReport, checkReportRecord, freezeReport, reportsToPrune, reportNotice };', { loader: 'ts' }).code;
    new Function(js)();
    const s = (globalThis as any).__s;
    const settings = [weekly(1), weekly(7, '23:30'), monthly(1), monthly(31), { ...weekly(1), frequency: 'off' } as AutoReportSetting];
    let same = 0, total = 0;
    for (const st of settings) for (const t of [MS(2026, 10, 26, 7, 59), MS(2026, 10, 26, 8, 0), MS(2026, 10, 26, 9, 59), MS(2026, 10, 26, 10, 0), MS(2026, 10, 27, 0, 15), MS(2026, 11, 1, 8, 30), MS(2026, 11, 30, 8, 5), MS(2027, 1, 1, 8, 0)]) {
      total++;
      const a = JSON.stringify(dueReport(st, t)), b = JSON.stringify(s.dueReport(st, t));
      if (a === b) same++; else console.log('   différence', t, a, b);
    }
    eq(same, total, `serveur et site créent les mêmes rapports aux mêmes instants (${total} cas)`);
    eq(JSON.stringify(s.cleanAutoReport({ frequency: 'weekly', weekday: 9, time: '25:00' })), JSON.stringify(cleanAutoReport({ frequency: 'weekly', weekday: 9, time: '25:00' })), 'serveur et site nettoient le même réglage pareil');
    eq(JSON.stringify(s.checkReportRecord({ ...pending, kind: 'month' })), JSON.stringify(checkReportRecord({ ...pending, kind: 'month' })), 'serveur et site vérifient la même fiche pareil');
    eq(JSON.stringify(s.nextAutoReport(weekly(1), MS(2026, 10, 27, 10))), JSON.stringify(nextAutoReport(weekly(1), MS(2026, 10, 27, 10))), 'serveur et site donnent la même prochaine exécution');
    const p0 = checkReportRecord(pending); if (!p0.ok) throw new Error('fiche de test fausse');
    eq(JSON.stringify(s.freezeReport(p0.value, '<p>x</p>', T1)), JSON.stringify(freezeReport(p0.value, '<p>x</p>', T1)), 'serveur et site figent la même copie');
    eq(JSON.stringify(s.reportsToPrune([{ id: 'm-2026-09' }, { id: 'm-2026-08' }, { id: 'm-2026-07' }], 2)), JSON.stringify(['m-2026-07']), 'serveur : garde les plus récentes');
    eq(JSON.stringify(s.reportNotice(periodFromId('m-2026-09')!)), JSON.stringify(reportNotice(periodFromId('m-2026-09')!)), 'serveur et site écrivent la même notification');
  }
  // Les routes et les garde-fous
  ok(/action === "report-due" && req\.method === "POST"\) return await reportDue\(request, res\)/.test(src), 'serveur : route report-due (POST) branchée avant la connexion');
  const iServe = src.indexOf('Deno.serve('), iDue = src.indexOf('action === "report-due"', iServe), iAuth = src.indexOf('const me = await authenticate(req);', iServe);
  ok(iDue > 0 && iAuth > 0 && iDue < iAuth, 'serveur : report-due est avant « authenticate » (la tâche n\'a pas de session, elle a un secret)');
  for (const r of ['report-list', 'report-open', 'report-freeze']) ok(new RegExp(`action === "${r}" && req\\.method === "POST"\\) return await report\\w+\\(req, res, me\\)`).test(src) && src.indexOf(`action === "${r}"`) > iAuth, `serveur : route ${r} après la connexion`);
  const h = src.match(/async function reportDue\([\s\S]*?\n}\n/);
  ok(!!h, 'serveur : fonction reportDue présente');
  if (h) {
    ok(/x-cron-secret/.test(h[0]) && /timingSafeEqual/.test(h[0]) && /push_cron_secret/.test(h[0]), 'serveur : la tâche planifiée doit donner le secret (comparaison à temps constant)');
    ok(/status\(401\)/.test(h[0]), 'serveur : sans le bon secret → refus 401');
    ok(/\.insert\(/.test(h[0]) && !/\.upsert\(/.test(h[0]) && /23505/.test(h[0]), 'serveur : une fiche déjà créée n\'est jamais recréée ni écrasée (insert, doublon = rien)');
    ok(/reportsToPrune\(/.test(h[0]) && (h[0].match(/\.delete\(/g) || []).length === 1, 'serveur : seule suppression = les fiches au-delà des 24 plus récentes');
  }
  for (const f of ['reportList', 'reportOpen', 'reportFreeze']) {
    const hh = src.match(new RegExp(`async function ${f}\\([\\s\\S]*?\\n}\\n`));
    ok(!!hh && /adminOnly\(res, me\)/.test(hh[0]), `serveur : ${f} réservée au responsable`);
  }
  const fr = src.match(/async function reportFreeze\([\s\S]*?\n}\n/);
  if (fr) {
    ok(/\.eq\('data->>status', 'pending'\)/.test(fr[0]), 'serveur : la copie ne s\'écrit que si la fiche est encore « en attente » (jamais d\'écrasement)');
    ok(/status === 'ready'/.test(fr[0]) && /already: true/.test(fr[0]), 'serveur : une copie déjà figée est rendue telle quelle');
    ok(!/\.delete\(/.test(fr[0]), 'serveur : figer ne supprime rien');
  }
  const lst = src.match(/async function reportList\([\s\S]*?\n}\n/);
  ok(!!lst && !/html:/.test(lst[0]), 'serveur : la liste ne renvoie pas le texte (gros) des rapports');
  ok(/"acct_close", "auto_report", "monthly_plan"/.test(src), 'serveur : réglage jamais envoyé à un opérateur (réglages réservés à l\'admin)');
  ok(/cleanAutoReport\(sentAr\)/.test(src), 'serveur : réglage revérifié à chaque enregistrement des réglages');
  ok(!/T = \{[\s\S]*?df_reports[\s\S]*?\} as const/.test(src), 'serveur : df_reports n\'est pas une collection de la synchro (seulement les routes report-*)');
  const mig = readFileSync('supabase/migrations/20261027_auto_report_cron.sql', 'utf8');
  ok(/cron\.schedule\(\s*'df-report-due'/.test(mig) && /\*\/15 \* \* \* \*/.test(mig) && /report-due/.test(mig) && /push_cron_secret/.test(mig), 'migration : tâche df-report-due toutes les 15 min avec le secret');
  ok(/cron\.unschedule\('df-report-due'\)/.test(mig), 'migration (tâche) : retour en arrière noté');
  ok(!/create table|drop table/i.test(mig.replace(/--[^\n]*/g, '')), 'migration (tâche) : aucune table créée ni supprimée');
  const tab = readFileSync('supabase/migrations/20261027_create_df_reports.sql', 'utf8');
  ok(/enable row level security/i.test(tab) && /revoke all on public\.df_reports from anon, authenticated/i.test(tab), 'migration (table) : RLS active, aucun accès public');
  ok(/drop table public\.df_reports/.test(tab), 'migration (table) : retour en arrière noté');
}

console.log(fails ? `\n${fails} échec(s) sur ${n} contrôles.` : `OK : ${n}/${n} contrôles.`);
process.exit(fails ? 1 : 0);
