// Contrôle : heure (Madagascar) et filtres de la cloche. Lancer : npm run check:notif-view
import { readFileSync } from 'node:fs';
import { notifWhen, filterNotifs, notifCategory } from '../src/utils/notifView';
let f = 0, t = 0;
const eq = (g: unknown, w: unknown, n: string) => { t++; if (JSON.stringify(g) !== JSON.stringify(w)) { f++; console.log(`ECHEC ${n}\n  obtenu ${JSON.stringify(g)}\n  attendu ${JSON.stringify(w)}`); } };
const now = Date.parse('2026-11-02T03:21:00Z'); // 06:21 à Madagascar
eq(notifWhen('2026-11-02T01:05:00Z', now), '04:05', 'aujourd\'hui : heure de Madagascar (UTC+3)');
eq(notifWhen('2026-11-01T22:30:00Z', now), '01:30', 'minuit passé à Madagascar = aujourd\'hui');
eq(notifWhen('2026-11-01T10:00:00Z', now), 'Hier 13:00', 'hier avec heure');
eq(notifWhen('2026-10-28T06:00:00Z', now), '28/10 09:00', 'plus ancien : jour/mois + heure');
eq(notifWhen('2026-11-02', now), "Aujourd'hui", 'date seule : pas d\'heure inventée');
eq(notifWhen('2026-10-20', now), '20/10', 'ancienne date seule');
eq(notifWhen('', now), '', 'vide');
eq(notifWhen('n\'importe quoi', now), '', 'date invalide');
const L = [{ id: 'msg-1', tone: 'info' as const }, { id: 'post-1-x', tone: 'info' as const }, { id: 'rst-1', tone: 'urgent' as const }, { id: 'sec-1', tone: 'urgent' as const }, { id: 'adv-1', tone: 'info' as const }];
eq(L.map(notifCategory), ['messages', 'missions', 'alerts', 'alerts', 'missions'], 'catégories');
eq(filterNotifs(L, 'all', []).length, 5, 'toutes');
eq(filterNotifs(L, 'unread', ['msg-1', 'adv-1']).map(n => n.id), ['post-1-x', 'rst-1', 'sec-1'], 'non lues');
eq(filterNotifs(L, 'messages', []).map(n => n.id), ['msg-1'], 'messages');
eq(filterNotifs(L, 'alerts', []).map(n => n.id), ['rst-1', 'sec-1'], 'alertes');
eq(filterNotifs(L, 'missions', []).map(n => n.id), ['post-1-x', 'adv-1'], 'missions');
const top = readFileSync('src/components/TopBar.tsx', 'utf8');
eq(/data-notif-time/.test(top) && /notifWhen\(n\.at\)/.test(top), true, 'cloche : heure affichée sur chaque notification');
eq(/data-notif-filters/.test(top) && /shown\.slice\(0, 30\)/.test(top), true, 'cloche : filtres branchés');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
