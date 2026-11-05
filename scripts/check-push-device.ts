// Contrôle : l'appareil suit le compte ouvert (déconnexion = détaché ; ouverture d'un compte = rattaché). Lancer : npm run check:push-device
import { readFileSync } from 'node:fs';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const push = readFileSync('src/utils/push.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
ok(/export async function unbindPushDevice/.test(push) && /db\.pushUnsubscribe\(sub\.endpoint\)/.test(push), 'push : détacher l\'appareil du compte');
ok(/export async function bindPushDevice/.test(push) && /Notification\.permission !== 'granted'\) return/.test(push) && /db\.pushSubscribe\(sub\.toJSON\(\)\)/.test(push), 'push : rattacher seulement si déjà autorisé');
const lo = app.slice(app.indexOf('const handleLogout'), app.indexOf('db.logout();', app.indexOf('const handleLogout')));
ok(/await Promise\.race\(\[unbindPushDevice\(\)/.test(lo), 'déconnexion : l\'appareil est détaché AVANT db.logout (le jeton sert encore)');
ok(/if \(!currentUser\?\.id\) return;\s*void bindPushDevice\(\)/.test(app) && /push-resync/.test(app), 'ouverture d\'un compte, retour sur l\'appli et changement d\'abonnement : l\'appareil est rattaché');
ok(!/unsubscribe\(\)/.test(push.slice(push.indexOf('export async function unbindPushDevice'), push.indexOf('export async function bindPushDevice'))), 'l\'abonnement du navigateur est gardé (le compte suivant le reprend)');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
