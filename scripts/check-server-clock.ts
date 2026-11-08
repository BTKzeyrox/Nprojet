// Horloge du serveur : un appareil dont l'horloge avance ou retarde ne doit plus fausser « En ligne / Hors ligne ».
import fs from 'node:fs';
import { setServerClock, serverNowMs, clockOffsetMs, resetServerClock, SERVER_TIME_MARGIN_MS } from '../src/utils/serverClock';
import { liveStatus } from '../src/utils/presenceStatus';
import { countOnline, countOnlineStaff } from '../src/utils/presenceCount';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const realNow = Date.now.bind(Date);
const setDevice = (shiftMs: number) => { Date.now = () => realNow() + shiftMs; }; // « l'horloge de l'appareil avance de shiftMs »
const restore = () => { Date.now = realNow; resetServerClock(); };
const iso = (ms: number) => new Date(ms).toISOString();
const row = (id: string, agoS: number, serverMs: number) => ({ user_id: id, last_seen: iso(serverMs - agoS * 1000), day: '2026-11-08', online_sec: 60, waiting_since: null });

// ---- règles pures ----
const t0 = realNow();
ok(setServerClock(undefined) === null && setServerClock('pas une date') === null && setServerClock(12345 as any) === null, 'réponse sans heure valable : ignorée');
ok(clockOffsetMs() === 0, 'sans réponse du serveur, écart = 0 (comportement d\'avant)');
ok(setServerClock(iso(t0 - SERVER_TIME_MARGIN_MS), t0) === 0, 'horloge juste : écart 0 (le serveur envoie son heure - 3 s)');
ok(setServerClock(iso(t0 + 365 * 24 * 3600 * 1000), t0) === null && clockOffsetMs() === 0, 'écart absurde (plus de 30 jours) : ignoré');
resetServerClock();

// ---- PC qui AVANCE de 5 min : avant la correction, tout le monde « Hors ligne » ----
{
  const serverMs = realNow();
  setDevice(5 * 60_000);
  const u = { id: 'op1' };
  const r = [row('op1', 10, serverMs)]; // signe de vie vieux de 10 s (heure du serveur)
  ok(liveStatus(u, [], r, Date.now()).status === 'offline', 'sans correction, un PC en avance de 5 min voit « Hors ligne » (le défaut constaté)');
  const off = setServerClock(iso(serverMs - SERVER_TIME_MARGIN_MS), Date.now());
  ok(off !== null && Math.abs((off as number) + 5 * 60_000) < 50, 'écart retenu = -5 min (l\'appareil avance)');
  ok(Math.abs(serverNowMs() - serverMs) < 100, 'serverNowMs() retrouve l\'heure du serveur');
  ok(liveStatus(u, [], r).status === 'online', 'avec la correction : « En ligne » (heure par défaut = serveur)');
  ok(countOnline([{ id: 'op1', role: 'employee', status: 'active' } as any], r).online === 1, 'compteur « En ligne » corrigé aussi');
  ok(countOnlineStaff([{ id: 'tl1', role: 'team_lead', status: 'active' } as any], [row('tl1', 20, serverMs)]).online === 1, 'chefs et comptables : compteur corrigé aussi');
  ok(liveStatus(u, [], [row('op1', 200, serverMs)]).status === 'offline', 'silence réel de 200 s : toujours « Hors ligne »');
  restore();
}
// ---- PC qui RETARDE de 3 min : avant la correction, un opérateur silencieux depuis 4 min paraissait « En ligne » à tort ----
{
  const serverMs = realNow();
  setDevice(-3 * 60_000);
  const u = { id: 'op1' };
  const old = [row('op1', 240, serverMs)]; // silencieux depuis 4 min (heure du serveur)
  ok(liveStatus(u, [], old, Date.now()).status === 'online', 'sans correction, un PC en retard de 3 min voit « En ligne » à tort (silence de 4 min vu comme 1 min)');
  setServerClock(iso(serverMs - SERVER_TIME_MARGIN_MS), Date.now());
  ok(liveStatus(u, [], old).status === 'offline', 'avec la correction : « Hors ligne » (silence réel de 4 min)');
  restore();
}

// ---- branchements ----
const rd = (p: string) => fs.readFileSync(p, 'utf8');
ok(/setServerClock\(r\.data\.serverTime\)/.test(rd('src/db/store.ts')), 'store : l\'écart est mis à jour à chaque rechargement');
ok(/useState\(\(\) => serverNowMs\(\)\)/.test(rd('src/utils/useNow.ts')) && /setNow\(serverNowMs\(\)\)/.test(rd('src/utils/useNow.ts')), 'useNow : les écrans se redessinent à l\'heure du serveur');
ok(/now = serverNowMs\(\)/.test(rd('src/utils/presenceStatus.ts')) && !/now = Date\.now\(\)/.test(rd('src/utils/presenceStatus.ts')), 'presenceStatus : heure par défaut = serveur');
ok((rd('src/utils/presenceCount.ts').match(/now = serverNowMs\(\)/g) || []).length === 3 && !/now = Date\.now\(\)/.test(rd('src/utils/presenceCount.ts')), 'presenceCount : 3 fonctions à l\'heure du serveur');
ok(/getQueue[^\n]*now = serverNowMs\(\)/.test(rd('src/utils/presence.ts')) && /onlineSecToday[^\n]*now = serverNowMs\(\)/.test(rd('src/utils/presence.ts')), 'presence : file d\'attente et durée du jour à l\'heure du serveur');

console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
