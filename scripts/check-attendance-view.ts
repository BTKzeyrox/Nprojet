// Contrôle de l'arrivée, du départ et de la pastille en ligne / hors ligne. Lancer : npm run check:attendance-view
import { onlineBadge, arrivalLine, lastSeenOf, monthPresence, isTracked, TRACKED_ROLES } from '../src/utils/attendanceView';
import { dayDetail } from '../src/utils/dayDetail';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);

const NOW = Date.parse('2026-11-01T09:00:00Z'); // 12:00 à Madagascar
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

// ---- Pastille ----
eq(onlineBadge(ago(10), NOW).online, true, 'pastille : signe de vie il y a 10 s = en ligne');
eq(onlineBadge(ago(89), NOW).online, true, 'pastille : 89 s = encore en ligne');
eq(onlineBadge(ago(90), NOW).online, false, 'pastille : 90 s = hors ligne');
eq(onlineBadge(ago(10), NOW).text, 'En ligne', 'pastille : texte FR');
eq(onlineBadge(ago(10), NOW, 'en').text, 'Online', 'pastille : texte EN');
eq(onlineBadge(ago(600), NOW).text, 'Hors ligne depuis 11:50', 'pastille : « depuis » en heure de Madagascar (09:00 UTC = 12:00)');
eq(onlineBadge(ago(600), NOW, 'en').text, 'Offline since 11:50', 'pastille : EN');
eq(onlineBadge(null, NOW).text, 'Hors ligne', 'pastille : jamais vu = hors ligne, sans heure');
eq(onlineBadge('pas une date', NOW).online, false, 'pastille : date invalide = hors ligne');
eq(onlineBadge(undefined, NOW, 'en').text, 'Offline', 'pastille : EN sans donnée');
ok(!onlineBadge(ago(5), NOW).text.includes('depuis'), 'pastille : en ligne n\'écrit pas « depuis »');
eq(onlineBadge(new Date(NOW + 60000).toISOString(), NOW).online, true, 'pastille : horloge du serveur un peu en avance = en ligne');

// ---- Rôles suivis ----
for (const r of ['employee', 'team_lead', 'accountant']) ok(isTracked(r), `rôle suivi : ${r}`);
ok(!isTracked('admin'), 'l\'administrateur n\'est pas suivi');
ok(!isTracked(undefined) && !isTracked('x'), 'rôle inconnu : pas suivi');
eq([...TRACKED_ROLES].length, 3, '3 rôles suivis');

// ---- Arrivée / départ ----
const day = '2026-11-01';
const att = (sessions: any[], first = '2026-11-01T05:02:00Z', last = '2026-11-01T14:31:00Z') => ({ user_id: 'u1', day, first_seen: first, last_seen: last, online_sec: 3600, sessions });
const D = (a: any, today = '2026-10-31', now = NOW) => dayDetail([], a, 'u1', day, now, today);
eq(arrivalLine(D(undefined)), 'Non enregistrée', 'sans donnée : « Non enregistrée »');
eq(arrivalLine(D(undefined), 'en'), 'Not recorded', 'sans donnée : EN');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: '2026-11-01T14:30:00Z', out: '2026-11-01T14:31:00Z' }]))), 'Arrivée 08:02 · Départ 17:31', 'déconnecté : départ exact');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: '2026-11-01T14:31:00Z' }]))), 'Arrivée 08:02 · Départ estimé 17:31', 'fermé sans déconnexion : départ estimé');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: ago(20) }]), day)), 'Arrivée 08:02 · Encore en ligne', 'encore connecté aujourd\'hui');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: ago(20) }]), day), 'en'), 'Arrival 08:02 · Still online', 'encore connecté : EN');
eq(arrivalLine(D(att([]))), 'Arrivée 08:02 · Départ estimé 17:31', 'ancienne ligne sans connexions : départ estimé depuis le dernier signe de vie');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: '2026-11-01T07:00:00Z', out: '2026-11-01T07:10:00Z' }, { in: '2026-11-01T08:00:00Z', last: '2026-11-01T14:31:00Z', out: '2026-11-01T14:40:00Z' }]))), 'Arrivée 08:02 · Départ 17:40', 'plusieurs connexions : arrivée = la 1re, départ = fin de la dernière');
eq(arrivalLine(D(att([{ in: '2026-11-01T05:02:00Z', last: '2026-11-01T14:31:00Z' }])), 'en'), 'Arrival 08:02 · Estimated departure 17:31', 'départ estimé : EN');
eq(arrivalLine({ arrival: '08:00', departure: null, departureKind: 'none' }), 'Arrivée 08:00', 'arrivée sans départ connu');
// Heure de Madagascar : minuit UTC = 03:00
eq(D(att([{ in: '2026-10-31T21:30:00Z', last: '2026-10-31T22:00:00Z', out: '2026-10-31T22:00:00Z' }], '2026-10-31T21:30:00Z', '2026-10-31T22:00:00Z')).arrival, '00:30', 'minuit passé à Madagascar : 21:30 UTC = 00:30');

// ---- Dernier signe de vie ----
eq(lastSeenOf('A', { last_seen: 'B' }), 'A', 'dernier signe : la présence passe avant');
eq(lastSeenOf(null, { last_seen: 'B' }), 'B', 'dernier signe : sinon la ligne du jour');
eq(lastSeenOf(undefined, undefined), null, 'dernier signe : rien = null');

// ---- Mois ----
eq(monthPresence([]), { days: 0, avgArrival: null }, 'mois : aucun jour');
eq(monthPresence([{ first_seen: '2026-11-01T05:00:00Z' }, { first_seen: '2026-11-02T05:30:00Z' }]), { days: 2, avgArrival: '08:15' }, 'mois : arrivée moyenne 08:00 et 08:30 = 08:15');
eq(monthPresence([{ first_seen: '2026-11-01T05:00:00Z' }]).days, 1, 'mois : 1 jour');

// ---- Écran : le calendrier utilise bien ces règles ----
import { readFileSync } from 'node:fs';
const cal = readFileSync(new URL('../src/views/CalendarView.tsx', import.meta.url), 'utf-8');
ok(cal.includes('OnlinePill') && cal.includes('arrivalLine('), 'écran : pastille et ligne d\'arrivée utilisées dans le calendrier');
ok(!cal.includes('1re connexion :'), 'écran : un seul mot pour l\'heure d\'arrivée (plus « 1re connexion : »)');
ok(cal.includes("u.role === 'team_lead' || u.role === 'accountant'"), 'écran : chefs d\'équipe et comptables dans le calendrier global');
ok(cal.includes("day === today && <OnlinePill"), 'écran : la pastille n\'est montrée que pour aujourd\'hui dans la liste du jour');

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
