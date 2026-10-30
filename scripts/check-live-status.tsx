// Contrôle du statut EN DIRECT (En cours / En ligne / En pause / Hors ligne) et de son affichage (messagerie, gestion des employés, calendrier global,
// détail du jour). Règles pures + rendu serveur des composants + lecture du code. Sans réseau. Lancer : npm run check:live-status
import React from 'react';
import fs from 'node:fs';
import { renderToString } from 'react-dom/server';
import { liveStatus, liveText, LIVE_META, FRESH_MS, PAUSE_MAX_MS } from '../src/utils/presenceStatus';
import { LiveDot, LiveLine } from '../src/components/LiveStatus';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const NOW = Date.parse('2026-10-28T11:00:00+03:00');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const U = (id = 'u1', online = false) => ({ id, is_online: online }) as any;
const row = (ms: number, waiting = false, id = 'u1') => ({ user_id: id, last_seen: ago(ms), first_seen: ago(ms), day: '2026-10-28', online_sec: 100, waiting_since: waiting ? ago(ms) : undefined }) as any;
const open = (status = 'active', id = 'u1') => [{ id: 'p', employee_id: id, status }] as any;
const live = (u: any, posts: any[], pres: any[]) => liveStatus(u, posts, pres, NOW);

// ----- les 4 statuts -----
ok(live(U(), open('active'), [row(20_000)]).status === 'working', 'mission ouverte + appli active : EN COURS');
ok(['pending_start', 'active', 'pending_end'].every(s => live(U(), open(s), [row(5_000)]).status === 'working'), 'à démarrer, en cours ou fin à valider : tous « en cours »');
ok(live(U(), [], [row(20_000)]).status === 'online', 'aucune mission + appli active : EN LIGNE');
ok(live(U(), open('active'), [row(5 * 60_000)]).status === 'pause' && live(U(), open('active'), [row(5 * 60_000)]).silentMin === 5, 'mission ouverte + appli silencieuse 5 min : EN PAUSE (5 min)');
ok(live(U(), open('active'), [row(45 * 60_000)]).status === 'offline' && live(U(), open('active'), [row(45 * 60_000)]).openMission, 'mission ouverte + silencieuse 45 min : HORS LIGNE (mission encore ouverte)');
ok(live(U(), [], [row(10 * 60_000)]).status === 'offline', 'aucune mission + silencieuse 10 min : HORS LIGNE');
ok(live(U(), open('completed'), [row(20_000)]).status === 'online' && live(U(), open('rejected'), [row(20_000)]).status === 'online', 'mission terminée ou refusée : plus « en cours »');
ok(live(U('u1'), open('active', 'autre'), [row(20_000)]).status === 'online', 'la mission d\'un autre employé ne compte pas');
ok(live(U('u1'), [], [row(20_000, true)]).waiting && !live(U('u1'), open('active'), [row(20_000, true)]).waiting, '« attend une mission » seulement en ligne sans mission');

// ----- limites de temps -----
ok(live(U(), open(), [row(FRESH_MS - 1000)]).status === 'working' && live(U(), open(), [row(FRESH_MS)]).status === 'pause', 'limite 90 s : 89 s = en cours ; 90 s = en pause');
ok(live(U(), open(), [row(PAUSE_MAX_MS)]).status === 'pause' && live(U(), open(), [row(PAUSE_MAX_MS + 1000)]).status === 'offline', 'limite 30 min : 30 min = en pause ; 30 min + 1 s = hors ligne');
ok(live(U(), [], [row(FRESH_MS - 1000)]).status === 'online' && live(U(), [], [row(FRESH_MS)]).status === 'offline', 'sans mission : 89 s = en ligne ; 90 s = hors ligne');

// ----- pas de ligne de présence / données abîmées -----
ok(live(U('u1', true), [], []).status === 'offline' && live(U('u1', false), [], []).status === 'offline', 'sans ligne de présence : HORS LIGNE, même si l\'ancien indicateur « en ligne » est resté bloqué sur vrai');
ok(live(U('u1', true), open(), []).status === 'offline' && live(U('u1', true), open(), []).openMission, 'sans ligne de présence, avec mission ouverte : hors ligne (mission encore ouverte)');
ok(live(U('u1', true), [], [{ user_id: 'u1', last_seen: 'pas-une-date' } as any]).status === 'offline' && live(U(), [], [{ user_id: 'u1', last_seen: 'pas-une-date' } as any]).status === 'offline', 'date illisible : hors ligne, jamais de plantage');
ok(live(U(), [], [{ ...row(0), last_seen: new Date(NOW + 60_000).toISOString() }]).status === 'online', 'horloge en avance (futur) : traité comme actif, pas d\'erreur négative');
ok(['working', 'online', 'pause', 'offline'].every(s => (live(U(), s === 'working' || s === 'pause' ? open() : [], [row(s === 'working' ? 1000 : s === 'online' ? 1000 : s === 'pause' ? 300_000 : 3_600_000)]).status === s)), 'les 4 statuts sont tous atteignables');

// ----- textes -----
const t = (ms: number, withOpen = false, waiting = false, lang: 'fr' | 'en' = 'fr') => liveText(live(U(), withOpen ? open() : [], [row(ms, waiting)]), lang);
ok(t(1000, true) === 'En cours' && t(1000) === 'En ligne' && /attend une mission/.test(t(1000, false, true)), 'texte : En cours / En ligne / En ligne · attend une mission');
ok(/^En pause · appli silencieuse depuis 12 min$/.test(t(12 * 60_000, true)), 'texte : « En pause · appli silencieuse depuis 12 min »');
ok(/^Hors ligne · vu il y a 10 min$/.test(t(10 * 60_000)) && /vu il y a 3 h/.test(t(3 * 3600_000)) && /vu il y a 2 j/.test(t(50 * 3600_000)) && /mission encore ouverte/.test(t(2 * 3600_000, true)), 'texte : hors ligne avec « vu il y a… » (minutes, heures, jours) et « mission encore ouverte »');
ok(t(1000, true, false, 'en') === 'In progress' && /^On break · app silent for 12 min$/.test(t(12 * 60_000, true, false, 'en')) && /seen 10 min ago/.test(t(10 * 60_000, false, false, 'en')) && !/[àâéèêç]/.test(['en'].map(() => t(10 * 60_000, true, false, 'en')).join('')), 'anglais : sans mots français ni accents');
ok(new Set(Object.values(LIVE_META).map(m => m.dot)).size === 4 && Object.values(LIVE_META).every(m => m.fr && m.en && m.text), 'les 4 statuts ont une couleur et un nom différents, en français et en anglais');

// ----- composants -----
const html = renderToString(<div><LiveDot info={live(U(), open(), [row(1000)])} /><LiveLine info={live(U(), open(), [row(5 * 60_000)])} /></div>);
ok(/data-testid="live-dot-working"/.test(html) && /animate-pulse/.test(html) && /data-testid="live-line-pause"/.test(html) && /En pause/.test(html), 'composants : point animé « en cours » et ligne « En pause » rendus');
ok(/title="En ligne"/.test(renderToString(<LiveDot info={live(U(), [], [row(1000)])} />)) && /aria-label=/.test(renderToString(<LiveDot info={live(U(), [], [row(1000)])} />)), 'le point a une infobulle et un nom accessible');

// ----- branchements dans les écrans -----
const rd = (p: string) => fs.readFileSync(p, 'utf8');
const chat = rd('src/components/ChatView.tsx'), emp = rd('src/views/admin/EmployeesManagement.tsx'), cal = rd('src/views/CalendarView.tsx'), modal = rd('src/components/DayDetailsModal.tsx'), speed = rd('scripts/check-speed.ts');
ok(/const liveOf = \(u\?: User \| null\): LiveInfo \| null => \(isAdmin && u && u\.role === 'employee'/.test(chat) && (chat.match(/liveOf\(/g) || []).length >= 3, 'messagerie : statut affiché seulement pour le responsable et pour des opérateurs (jamais un faux « Hors ligne » pour les autres rôles) — liste, photo et en-tête');
ok(/const items: OpItem\[\] = allEmployees\.map\(u => \(\{ user: u, live: liveStatus\(u, posts, presence, nowMs\) \}\)\)/.test(emp) && /<LiveDot info=\{live\}/.test(emp) && /<LiveLine info=\{live\}/.test(emp), 'gestion des employés : point sur la photo et ligne de statut dans chaque ligne de la liste (toujours visibles)');
ok(!/show_activity_column[\s\S]{0,200}data-testid=\{`op-row-/.test(emp), 'gestion des employés : le statut de la ligne ne dépend pas du réglage de la colonne Activité');
ok(/useState<string>\(currentUser\?\.role === 'employee' \? currentUser\.id : initialUserId \|\| 'all'\)/.test(cal) && /data-testid="select-all-employees"/.test(cal) && /<GlobalCalendar/.test(cal), 'calendrier : le responsable arrive sur le calendrier GLOBAL ; « Tous les employés » dans la liste');
ok(/data-testid="leave-filter-approved"/.test(cal) && /data-testid="leave-filter-pending"/.test(cal) && /hasLeaveInMonth\(leaves, u\.id, year, month, leaveFilter\)/.test(cal), 'calendrier : filtre Congés (acceptés / en attente) branché sur la liste des employés');
ok(['gcal-tab-month', 'gcal-tab-summary', 'gcal-tab-day'].every(k => cal.includes(`gcal-tab-${k.slice(9)}`) || cal.includes('data-testid={`gcal-tab-${v}`}')) && /Vue du jour/.test(cal) && /Résumé/.test(cal), 'calendrier global : onglets Mois, Résumé, Vue du jour');
ok(/1re connexion/.test(modal) && /1re mission/.test(modal) && !/Arrivée : /.test(modal), 'détail du jour : « Arrivée » remplacée par « 1re connexion » et « 1re mission » (avec une explication)');
ok(/'useNow\.ts'/.test(speed), 'l\'horloge locale (useNow) est déclarée dans la liste des minuteurs connus');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
