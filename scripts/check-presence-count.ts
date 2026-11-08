// « Opérateurs en ligne » de l'accueil (X / Y) : seuls les actifs avec un signe de vie récent comptent. Lancer : npm run check:presence-count
import { readFileSync } from 'node:fs';
import { countOnline, countOnlineStaff, isFresh, ONLINE_MS } from '../src/utils/presenceCount';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const now = Date.parse('2026-11-05T09:00:00Z');
const ago = (s: number) => new Date(now - s * 1000).toISOString();
const emp = (id: string, status?: string) => ({ id, role: 'employee', status });
const users = [emp('a'), emp('b'), emp('c'), emp('d'), emp('e', 'blocked'), { id: 'adm', role: 'admin' }];
ok(ONLINE_MS === 120000, 'en ligne = signe de vie de moins de 120 s');
// BTK : « 4/5 en ligne alors qu'aucun opérateur n'est actif » : des vieilles lignes de présence ne comptent plus
const stale = ['a', 'b', 'c', 'd'].map(id => ({ user_id: id, last_seen: ago(3600) }));
ok(JSON.stringify(countOnline(users, stale, now)) === '{"online":0,"total":4}', 'personne n\'a donné signe de vie : 0 / 4 (le compte bloqué et l\'admin ne comptent pas)');
ok(JSON.stringify(countOnline(users, [{ user_id: 'a', last_seen: ago(30) }, { user_id: 'b', last_seen: ago(119) }, { user_id: 'c', last_seen: ago(121) }], now)) === '{"online":2,"total":4}', 'signe de vie de 30 s et 119 s = en ligne ; 121 s = hors ligne');
ok(countOnline(users, [{ user_id: 'e', last_seen: ago(5) }], now).online === 0, 'un compte bloqué n\'est jamais compté en ligne');
ok(countOnline(users, [{ user_id: 'adm', last_seen: ago(5) }], now).online === 0, 'l\'admin n\'est pas un opérateur');
ok(countOnline(users, [], now).online === 0 && countOnline([], [], now).total === 0, 'aucune présence ou aucun opérateur : 0 sur 0, sans plantage');
ok(!isFresh(undefined, now) && !isFresh({ user_id: 'a', last_seen: 'pas une date' }, now) && !isFresh({ user_id: 'a', last_seen: ago(-3600) }, now), 'sans ligne, date illisible ou date dans le futur : hors ligne');
ok(countOnline([emp('a')], [{ user_id: 'a', last_seen: ago(10) }], now).online <= countOnline([emp('a')], [{ user_id: 'a', last_seen: ago(10) }], now).total, 'en ligne ne dépasse jamais le total');
const dash = readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8');
ok(/countOnline\(users, presence\)/.test(dash) && /onlineCount\.online\}<span[^>]*> \/ \{onlineCount\.total\}/.test(dash) && /\{onlineCount\.online \+ staffCount\.online\} En Ligne/.test(dash) && !/onlineEmployees|nbEmployees/.test(dash), 'accueil : la tuile et le titre « En ligne » utilisent les mêmes comptes (opérateurs + chefs et comptables)');
ok(/isTracked\(u\.role\) && u\.status !== 'blocked'\)/.test(dash) && /ROLE_RANK/.test(dash), 'accueil : la liste de l\'équipe connectée (opérateurs, chefs d\'équipe, comptables) ne montre pas les comptes bloqués');

{
  const us = [{ id: 'c1', role: 'team_lead' }, { id: 'c2', role: 'accountant' }, { id: 'c3', role: 'accountant', status: 'blocked' }, { id: 'e1', role: 'employee' }, { id: 'ad', role: 'admin' }];
  const nowS = Date.now(); const agoS = (s: number) => new Date(nowS - s * 1000).toISOString();
  const r = countOnlineStaff(us, [{ user_id: 'c1', last_seen: agoS(30) }, { user_id: 'c2', last_seen: agoS(500) }, { user_id: 'e1', last_seen: agoS(5) }, { user_id: 'ad', last_seen: agoS(5) }], nowS);
  ok(JSON.stringify(r) === '{"online":1,"total":2}', 'chefs et comptables : comptés à part, bloqués ignorés, opérateurs et admin exclus');
}
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
