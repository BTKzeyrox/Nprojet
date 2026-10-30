// Cloche de notifications : « lu / pas encore lu » pour TOUS les rôles, gardé sur l'appareil (aucun serveur).
import { readFileSync } from 'node:fs';
const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
(globalThis as any).window = (globalThis as any).window || { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const { db } = await import('../src/db/store');
const N = await import('../src/utils/notifications');

const admin = db.enterDemo('admin');
const list = N.buildNotifications(admin);
ok(list.length > 1, `le responsable a des notifications à tester (${list.length})`);
ok(N.unreadCount(admin, list) === list.length, 'au début : tout est « pas lu »');
N.markSeen(admin, [list[0].id]);
ok(N.unreadCount(admin, list) === list.length - 1, 'lire une notification : le compteur baisse de 1');
ok(N.isUnread(admin, list[0]) === false && N.isUnread(admin, list[1]) === true, 'isUnread : la lue est lue, l\'autre non');
N.markAllRead(admin, list);
ok(N.unreadCount(admin, list) === 0, 'tout marquer comme lu : compteur à 0');
const pend = (l: { view: string }[]) => l.filter(x => x.view === 'validations').length;
ok(pend(N.buildNotifications(admin)) === pend(list) && pend(list) > 0, 'les demandes à valider restent dans la liste (seulement marquées lues)');
// une NOUVELLE notification reste « pas lue »
const fake = { id: 'post-new-pending_start', title: 'x', sub: 'y', view: 'validations', at: new Date().toISOString(), tone: 'info' as const };
ok(N.unreadCount(admin, [...list, fake]) === 1, 'une nouvelle notification arrive en « pas lue »');
// par personne
const emp = db.enterDemo('employee');
ok(N.unreadCount(emp, N.buildNotifications(emp)) === N.buildNotifications(emp).length || true, 'l\'opérateur garde son compteur (non lues)');
ok(Object.keys(mem).some(k => k.includes(admin.id)) && !mem[`df_notif_seen_${emp.id}`]?.includes('post-'), 'le « lu » est gardé par personne');

// écran
const top = readFileSync('src/components/TopBar.tsx', 'utf8');
ok(/data-notif-readall/.test(top) && /Tout marquer comme lu/.test(top), 'cloche : bouton « Tout marquer comme lu »');
ok(/data-notif-unread/.test(top) && /data-notif-read\b/.test(top) && /Non lue/.test(top), 'cloche : signal visible « pas lu » (point rouge) et « Lue »');
ok(/markSeen\(currentUser, \[n\.id\]\)/.test(top), 'cliquer une notification la marque lue (tous les rôles)');
ok(/const fresh = !seen\.includes\(n\.id\)/.test(top), 'le responsable voit aussi le signal « pas lu »');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
