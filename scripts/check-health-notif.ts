// Contrôle des notifications de la cloche (M11.7 / M9.4) : règles pures + câblage. Lancer : npm run check:health-notif
import { readFileSync } from 'node:fs';
import { planHealthNotifs, madaHour, MAX_URGENT_NOTIFS } from '../src/utils/healthNotif';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const A = (id: string, severity: 'urgent' | 'watch' | 'info'): any => ({ id: `team:${id}`, severity, title_fr: `Alerte ${id}`, title_en: id });
const WED = '2026-10-21', SUN = '2026-10-25';
const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+03:00`);

ok(madaHour(at(WED, '07:59')) === 7 && madaHour(at(WED, '08:00')) === 8 && madaHour(at(WED, '23:30')) === 23, 'heure de Madagascar calculée (UTC+3)');
ok(planHealthNotifs([], WED, at(WED, '07:00'), []).length === 0, 'avant 08:00 et sans alerte : rien');
let r = planHealthNotifs([], WED, at(WED, '08:00'), []);
ok(r.length === 1 && r[0].id === `summary-${WED}` && r[0].thread === 'assistant' && r[0].view === 'chat' && /calme/.test(r[0].sub), 'à 08:00 : résumé du jour qui ouvre l\'assistant (« tout est calme »)');
ok(planHealthNotifs([], WED, at(WED, '09:00'), [`summary-${WED}`]).length === 0, 'résumé déjà vu : il ne revient pas');
ok(planHealthNotifs([], `2026-10-26`, at('2026-10-26', '09:00'), [`summary-${WED}`]).length === 1, 'le lendemain : un nouveau résumé');
ok(planHealthNotifs([], SUN, at(SUN, '10:00'), []).length === 0, 'dimanche (repos) : pas de résumé');
r = planHealthNotifs([A('a', 'urgent'), A('b', 'watch'), A('c', 'info')], WED, at(WED, '09:00'), []);
ok(r.length === 2 && r[0].id === 'health-team:a' && r[0].tone === 'urgent' && r[0].view === 'health' && /2? ?point|1 point/.test(r[1].sub), 'seule l\'alerte urgente fait une notification ; le résumé compte les « à voir »');
ok(!r.some(x => x.id === 'health-team:b' || x.id === 'health-team:c'), '« à voir » et « info » ne font pas de notification');
r = planHealthNotifs(Array.from({ length: 9 }, (_, i) => A('u' + i, 'urgent')), WED, at(WED, '07:00'), []);
ok(r.length === MAX_URGENT_NOTIFS, 'au plus 5 notifications urgentes (pas d\'avalanche)');
ok(planHealthNotifs([A('a', 'urgent')], SUN, at(SUN, '03:00'), []).some(x => x.tone === 'urgent'), 'une urgence est signalée même la nuit ou le dimanche');

const nt = readFileSync('src/utils/notifications.ts', 'utf8'), tb = readFileSync('src/components/TopBar.tsx', 'utf8'), ws = readFileSync('src/components/WatchSettingsSection.tsx', 'utf8');
ok(/role === 'admin'\) out\.push\(\.\.\.healthNotifications/.test(nt) && /user\.role !== 'admin' \|\| !healthNotifOn/.test(nt), 'câblage : réservé à l\'admin (un opérateur ne reçoit rien)');
ok(/catch \{ return \[\]; \}/.test(nt), 'câblage : une erreur de la Santé du site ne fait pas tomber la cloche');
ok(/startsWith\('summary-'\)\) markSeen/.test(tb), 'câblage : toucher le résumé le marque comme vu');
ok(/healthNotifOn/.test(ws) && /setHealthNotif/.test(ws), 'réglage : case à cocher dans Réglages > Surveillance');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
