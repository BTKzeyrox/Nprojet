// M25 : règles des rappels (types, rôles, séries conseillées, heures, compte à rebours, répétition, reporter) + copie serveur identique.
import { readFileSync } from 'node:fs';
import * as R from '../src/utils/reminderRules';
let bad = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` (obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)})`}`);

// heures de Madagascar
eq(R.remMs('2027-01-10', '15:00'), Date.UTC(2027, 0, 10, 12, 0), '15:00 à Madagascar = 12:00 UTC');
eq(R.remDateOf(Date.UTC(2027, 0, 9, 22, 0)), '2027-01-10', 'minuit passé à Madagascar = jour suivant');
eq(R.remAddMonths('2027-01-31', 1), '2027-02-28', 'fin de mois : 31 janvier + 1 mois = 28 février');
eq(R.remDayDiff('2027-01-07', '2027-01-10'), 3, 'écart en jours');

// types et rôles
const base = { type: 'appointment', title: 'Rendez-vous avec X', date: '2027-01-10', time: '15:00', fires: R.remSuggest('appointment', { time: '15:00' }) };
ok(R.remClean(base, 'employee', 'u1', 1000)?.type === 'appointment', 'opérateur : rendez-vous permis');
ok(R.remClean({ ...base, type: 'payment' }, 'employee', 'u1', 1000) === null, 'opérateur : paiement refusé');
ok(R.remClean({ ...base, type: 'payment' }, 'accountant', 'u1', 1000)?.type === 'payment', 'comptable : paiement permis');
ok(R.remClean({ ...base, type: 'important' }, 'accountant', 'u1', 1000) === null, 'comptable : date importante refusée');
ok(R.remClean({ ...base, type: 'important' }, 'team_lead', 'u1', 1000)?.type === 'important', 'chef : date importante permise');
ok(R.remClean({ ...base, type: 'followup' }, 'employee', 'u1', 1000) === null, 'opérateur : relance refusée');
ok(R.remClean({ ...base, title: '  ' }, 'admin', 'u1', 1000) === null, 'titre obligatoire');
ok(R.remClean({ ...base, date: '2027-13-40' }, 'admin', 'u1', 1000) === null, 'date obligatoire et valable');
ok(R.remClean({ ...base, type: 'hack' }, 'admin', 'u1', 1000) === null, 'type inconnu refusé');
const many = R.remClean({ ...base, fires: Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, k: 'at' })) }, 'admin', 'u1', 1000)!;
eq(many.fires.length, 8, '8 rappels au plus par élément');
const mine = R.remClean({ ...base, user_id: 'autre', kind: 'x' }, 'admin', 'moi', 1000)!;
eq([mine.user_id, mine.kind], ['moi', 'item'], 'le propriétaire est imposé par le serveur (jamais celui envoyé)');
ok(R.remClean({ ...base, title: 'a'.repeat(500), note: 'b'.repeat(5000) }, 'admin', 'u', 1)!.title.length === 120, 'titre coupé à 120 signes');
ok(R.remClean({ ...base, link: '../../etc' }, 'admin', 'u', 1)!.link === '', 'lien de page : seulement un nom de page simple');

// série conseillée (rendez-vous du 10 janvier à 15 h)
const s = R.remSuggest('appointment', { time: '15:00' });
eq(s.map(x => x.k + (x.d ?? x.n ?? '')), ['morning3', 'morning2', 'morning1', 'morning0', 'before300', 'before60', 'at'], 'rendez-vous : J-3, J-2, J-1, matin, 5 h, 1 h, à l\'heure');
eq(R.remSuggest('simple').map(x => x.k), ['at'], 'rappel simple : à l\'heure');
eq(R.remSuggest('task').map(x => x.k), ['morning', 'morning', 'at', 'overdue'], 'tâche : la veille, le matin, à l\'heure, en retard');
eq(R.remSuggest('deadline').length, 5, 'échéance : J-7, J-3, J-1, matin, en retard');
eq(R.remSuggest('important').map(x => x.d), [7, 1, 0], 'date importante : J-7, J-1, matin');
eq(R.remSuggest('appointment', { all_day: true }).every(x => x.k === 'morning'), true, 'journée entière : pas de rappel « à l\'heure »');
eq(R.remSuggest('simple', { morning: '07:30' }).length, 1, 'matin réglable (ici sans effet pour un rappel simple)');
eq(R.remSuggest('call', { morning: '07:30' })[0].at, '07:30', '« le matin » suit le réglage');

// envois d'un rendez-vous
const it = R.remClean({ ...base, created_ms: R.remMs('2027-01-01', '10:00') }, 'admin', 'u1', 0)!;
const all = R.remDue(it, R.remMs('2027-01-01', '00:00'), R.remMs('2027-01-11', '00:00'));
eq(all.map(x => new Date(x.at + 3 * 3600000).toISOString().slice(0, 16)), ['2027-01-07T08:00', '2027-01-08T08:00', '2027-01-09T08:00', '2027-01-10T08:00', '2027-01-10T10:00', '2027-01-10T14:00', '2027-01-10T15:00'], 'les 7 rappels partent aux bonnes heures');
const keys = new Set(all.map(x => x.key));
eq(keys.size, 7, 'chaque envoi a une clé unique (jamais deux fois)');
const late = R.remClean({ ...base, created_ms: R.remMs('2027-01-10', '09:00') }, 'admin', 'u1', 0)!;
eq(R.remDue(late, R.remMs('2027-01-01', '00:00'), R.remMs('2027-01-11', '00:00')).length, 3, 'rendez-vous créé le jour même : les rappels déjà passés sont ignorés');
eq(R.remDue({ ...it, status: 'done' }, 0, 9e15).length, 0, 'élément fait : plus de rappel');
eq(R.remDue({ ...it, status: 'canceled' }, 0, 9e15).length, 0, 'élément annulé : plus de rappel');

// compte à rebours
const cd = (atDate: string, atTime: string) => R.remCountdown('fr', it, '2027-01-10', R.remMs(atDate, atTime));
eq(cd('2027-01-07', '08:00'), 'Dans 3 jours (J-3) à 15:00', 'J-3');
eq(cd('2027-01-08', '08:00'), 'Dans 2 jours (J-2) à 15:00', 'J-2');
eq(cd('2027-01-09', '08:00'), 'Demain à 15:00 (J-1)', 'J-1');
eq(cd('2027-01-10', '08:00'), "Dans 7 heures (aujourd'hui à 15:00)", 'le matin même');
eq(cd('2027-01-10', '10:00'), "Dans 5 heures (aujourd'hui à 15:00)", '5 heures');
eq(cd('2027-01-10', '14:00'), 'Dans 1 heure (à 15:00)', '1 heure');
eq(cd('2027-01-10', '15:00'), "C'est maintenant", 'à l\'heure');
eq(R.remCountdown('en', it, '2027-01-10', R.remMs('2027-01-07', '08:00')), 'In 3 days (D-3) at 15:00', 'anglais');
eq(R.remCountdown('fr', it, '2027-01-10', R.remMs('2027-01-12', '08:00')), 'En retard de 2 jours', 'en retard');
const tx = R.remText(it, '2027-01-10', R.remMs('2027-01-07', '08:00'), false);
eq([tx.fr.title, tx.fr.body], ['Rendez-vous avec X', 'Rendez-vous · Dans 3 jours (J-3) à 15:00'], 'texte de la notification');
const hid = R.remText(it, '2027-01-10', R.remMs('2027-01-07', '08:00'), true);
ok(!JSON.stringify(hid).includes('avec X'), 'titre masqué : le titre n\'apparaît nulle part');

// tâche en retard : chaque jour à 8 h, 30 jours au plus
const task = R.remClean({ type: 'task', title: 'Appeler', date: '2027-01-10', time: '09:00', fires: [{ id: 'o', k: 'overdue', at: '08:00' }], created_ms: R.remMs('2027-01-01', '10:00') }, 'admin', 'u', 0)!;
eq(R.remDue(task, R.remMs('2027-01-10', '12:00'), R.remMs('2027-01-13', '12:00')).length, 3, 'en retard : un rappel par jour à 8 h');
eq(R.remDue(task, 0, R.remMs('2027-06-01', '00:00')).length, 30, 'en retard : 30 jours au plus');

// répétition
const rep = R.remClean({ type: 'task', title: 'Contrôle', date: '2027-01-05', time: '09:00', fires: [{ id: 'a', k: 'at' }], repeat: { freq: 'week', until: '2027-02-01' }, created_ms: 0 }, 'admin', 'u', 0)!;
eq(R.remDue(rep, R.remMs('2027-01-01', '00:00'), R.remMs('2027-03-01', '00:00')).map(x => x.occ), ['2027-01-05', '2027-01-12', '2027-01-19', '2027-01-26'], 'chaque semaine jusqu\'à la date de fin');
const day = R.remClean({ type: 'simple', title: 'x', date: '2027-01-30', time: '09:00', fires: [{ id: 'a', k: 'at' }], repeat: { freq: 'month', until: '' }, created_ms: 0 }, 'admin', 'u', 0)!;
eq(R.remDue(day, R.remMs('2027-01-01', '00:00'), R.remMs('2027-04-15', '00:00')).map(x => x.occ), ['2027-01-30', '2027-02-28', '2027-03-30'], 'chaque mois : fin de février respectée');

// reporter (snooze)
eq(R.remSnoozeUntil('10m', 1000), 1000 + 600000, 'reporter 10 min');
eq(R.remSnoozeUntil('1h', 0), 3600000, 'reporter 1 h');
eq(R.remSnoozeUntil('tomorrow', R.remMs('2027-01-10', '22:00')), R.remMs('2027-01-11', '08:00'), 'reporter à demain 8 h');
const sn = { ...it, snooze_until: R.remMs('2027-01-12', '10:00') };
eq(R.remDue(sn, R.remMs('2027-01-11', '00:00'), R.remMs('2027-01-13', '00:00')).filter(x => x.fire.id === 'snooze').length, 1, 'un élément reporté repart à l\'heure choisie');

// heures calmes
eq(R.remQuietShift(R.remMs('2027-01-10', '23:30'), { from: '22:00', to: '07:00' }), R.remMs('2027-01-11', '07:00'), 'heures calmes : 23 h 30 repoussé à 7 h');
eq(R.remQuietShift(R.remMs('2027-01-10', '03:00'), { from: '22:00', to: '07:00' }), R.remMs('2027-01-10', '07:00'), 'heures calmes : 3 h repoussé à 7 h le même jour');
eq(R.remQuietShift(R.remMs('2027-01-10', '12:00'), { from: '22:00', to: '07:00' }), R.remMs('2027-01-10', '12:00'), 'hors plage : inchangé');


const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
// assistant : « mes rappels »
import { detectIntent, remindersReply, remindersSummary } from '../src/utils/assistant';
eq(detectIntent('mes rappels').kind, 'reminders', 'assistant : « mes rappels » est compris');
eq(detectIntent('rendez-vous de demain ?').kind, 'reminders', 'assistant : « rendez-vous » est compris');
eq(detectIntent('quoi faire maintenant ?').kind, 'todo', 'assistant : « quoi faire » reste la liste des priorités');
const NOW = R.remMs('2027-01-08', '10:00');
const mk = (o: any) => R.remClean({ type: 'task', time: '09:00', fires: [], created_ms: 0, ...o }, 'admin', 'u', 0)!;
const ex = [mk({ title: 'En retard', date: '2027-01-05' }), mk({ title: 'Aujourd\'hui', date: '2027-01-08' }), mk({ title: 'Dans 2 jours', date: '2027-01-10' }), mk({ title: 'Loin', date: '2027-03-10' }), mk({ title: 'Fait', date: '2027-01-08', status: 'done' })];
const rs = remindersSummary(ex, NOW);
eq([rs.late.length, rs.today.length, rs.soon.length], [1, 1, 1], 'assistant : en retard / aujourd\'hui / sous 7 jours (le fait et le lointain sont ignorés)');
const rr = remindersReply(ex, NOW);
ok(rr.lines.some(l => l.fr.includes('J-2')), 'assistant : le « J-2 » est dans la réponse');
ok(remindersReply([], NOW).empty === true, 'assistant : aucun rappel = une ligne qui le dit');
ok(rr.actions.length === 1 && rr.actions[0].go.view === 'calendar', 'assistant : un bouton vers le Calendrier, rien d\'autre (il ne crée ni ne supprime)');

// écran, cloche, serveur, base
const rd = (f: string) => readFileSync(f, 'utf8');
const card = rd('src/components/RemindersCard.tsx'), cal = rd('src/views/CalendarView.tsx'), notif = rd('src/utils/notifications.ts'), top = rd('src/components/TopBar.tsx');
ok(/<RemindersCard \/>/.test(cal), 'Calendrier : la carte « À faire » est affichée pour tous les rôles');
ok(/data-reminder-add/.test(card) && /Ajouter/.test(card) && /Remettre les conseillés/.test(card) && /REM_MAX_FIRES/.test(card), 'écran : bouton « Ajouter », pastilles de rappels, « Remettre les conseillés », 8 au plus');
ok(/REM_ROLE_TYPES\[role\]/.test(card) && /snoozeFor/.test(card) && /data-delete-confirm/.test(card), 'écran : types selon le rôle, reporter, suppression avec confirmation');
ok(/reminderNotifications\(user\)/.test(notif) && /nowMs - 24 \* 3600000/.test(notif) && /remReload/.test(top), 'cloche : rappels manqués des dernières 24 h (rechargés au démarrage et au retour sur l\'appli)');
ok(/String\(it\.user_id\) !== String\(user\.id\)/.test(notif), 'cloche : seulement MES rappels');
ok(/action === "reminders" && req\.method === "GET"/.test(srv) && /action === "reminder-save"/.test(srv) && /action === "reminders-due" && req\.method === "POST"/.test(srv), 'serveur : routes lister, enregistrer, supprimer, reporter, tâche chaque minute');
const dueFn = srv.slice(srv.indexOf('async function remindersDue'), srv.indexOf('// ----- M13.7'));
ok(/timingSafeEqual/.test(dueFn) && /x-cron-secret/.test(dueFn), 'serveur : la tâche planifiée exige le secret');
ok(/PUSH_LOG/.test(dueFn) && /seenSet\.has\(q\.x\.key\)/.test(dueFn), 'serveur : chaque envoi a sa clé, jamais deux fois');
ok(/remClean\(req\.body\?\.item, String\(me\.role\), uid/.test(srv) && /String\(\(old as any\)\.data\?\.user_id\) !== uid/.test(srv), 'serveur : le rôle et le propriétaire viennent de la session, jamais du téléphone');
ok(/\.eq\('data->>user_id', uid\)/.test(srv.slice(srv.indexOf('async function remListRoute'), srv.indexOf('async function remSaveRoute'))), 'serveur : la liste ne rend que MES éléments (+ partagés de MON équipe)');
ok(/RESEND_API_KEY/.test(dueFn.length ? srv : '') && /role === 'admin'\) mailed/.test(dueFn) && /if \(!key \|\| !to\) return false/.test(srv), 'mail : admin seulement, et rien n\'est envoyé sans la clé du service (jamais d\'erreur)');
const mig = rd('supabase/migrations/20261105_create_df_reminders.sql'), cron = rd('supabase/migrations/20261105_reminders_cron.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_reminders from anon, authenticated/.test(mig) && /drop table public\.df_reminders/.test(mig), 'base : accès fermé au public, retour en arrière écrit');
ok(/'\* \* \* \* \*'/.test(cron) && /unschedule\('df-reminders-due'\)/.test(cron) && /push_cron_secret/.test(cron), 'base : tâche chaque minute, retour en arrière écrit');

// copie serveur identique
const region = (t: string) => (t.match(/\/\/ ===== BEGIN REMINDERS[^\n]*\n([\s\S]*?)\/\/ ===== END REMINDERS =====/) || [])[1] || '';
ok(region(readFileSync('src/utils/reminderRules.ts', 'utf8')).length > 4000 && region(readFileSync('src/utils/reminderRules.ts', 'utf8')) === region(srv), 'la copie du serveur est identique à celle du site');
ok(!/^\s*import\s/m.test(region(readFileSync('src/utils/reminderRules.ts', 'utf8'))), 'aucune importation dans le bloc copié');
console.log(`\n${n - bad}/${n} contrôles réussis`);
process.exit(bad ? 1 : 0);
