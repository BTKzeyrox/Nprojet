// Une ligne de la feuille du jour EN ATTENTE (saisie du chef) n'est pas une mission en cours : elle ne bloque personne, ne met personne « en cours », ne fausse aucun compteur.
// Une seule règle (`isOpenMission`, postPay.ts), copiée côté serveur (`hasOpenMission`). Contrôle : npm run check:open-mission
import { readFileSync } from 'node:fs';
import { isOpenMission, isWorkLine, OPEN_POST_STATUS } from '../src/utils/postPay';
import { liveStatus } from '../src/utils/presenceStatus';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const mission = (status: string): any => ({ id: 'm-' + status, employee_id: 'e1', client_name: 'Client X', status, date: '2026-11-13' });
const line = (status: string): any => ({ id: 'we-' + status, employee_id: 'e1', client_name: 'Présence', work_type: 'presence', presence: 'present', status, date: '2026-11-13' });
ok(OPEN_POST_STATUS.join() === 'pending_start,active,pending_end', 'statuts ouverts : début à valider, en cours, fin à valider');
ok(['pending_start', 'active', 'pending_end'].every(s => isOpenMission(mission(s))) && !isOpenMission(mission('completed')) && !isOpenMission(mission('rejected')), 'mission : ouverte seulement dans les 3 statuts');
ok(['pending_start', 'active', 'pending_end', 'completed'].every(s => !isOpenMission(line(s))), 'ligne de la feuille du jour : jamais une mission ouverte');
ok(!isOpenMission(null) && !isOpenMission(undefined) && !isOpenMission('x'), 'données cassées : non (sans erreur)');
const pr = readFileSync('src/utils/presence.ts', 'utf8');
ok(isWorkLine(line('pending_end')) && /hasOpenPost = [\s\S]{0,160}isOpenMission\(p\)/.test(pr) && /getFreePosts[\s\S]{0,260}isOpenMission\(p\)/.test(pr), 'file d\'attente et missions libres : une ligne en attente ne compte pas (même règle)');
const user: any = { id: 'e1', role: 'employee', status: 'active' };
const now = Date.parse('2026-11-13T10:00:00Z');
const presence: any = [{ user_id: 'e1', last_seen: new Date(now - 10000).toISOString(), waiting_since: new Date(now - 60000).toISOString(), online_sec: 100, day: '2026-11-13' }];
const lv = liveStatus(user, [line('pending_end')], presence, now), lm = liveStatus(user, [mission('pending_end')], presence, now);
ok(lv.openMission === false && lv.waiting === true && lm.openMission === true && lm.waiting === false, 'statut en direct : une ligne en attente laisse la personne « en attente de mission » ; une mission la met en cours');
// site : les endroits qui comptaient les lignes comme missions
const read = (f: string) => readFileSync(f, 'utf8');
const st = read('src/db/store.ts');
ok(/p\.employee_id === employeeId && isOpenMission\(p\)/.test(st), 'site : « mission en cours » de l\'employé = vraie mission (une ligne en attente ne le bloque plus)');
ok(/isOpenMission\(p\)/.test(read('src/components/AccessBanner.tsx')) && /isOpenMission\(p\)/.test(read('src/components/OperatorSheet.tsx')) && /current = posts\.filter\(isOpenMission\)/.test(read('src/views/admin/OperatorPage.tsx')), 'site : bandeau d\'accès, fiche opérateur, page opérateur');
ok(/p\.status === 'completed' && !isWorkLine\(p\)/.test(read('src/views/admin/OperatorPage.tsx')) && /!isWorkLine\(p\) && p\.employee_id === activeId/.test(read('src/views/CalendarView.tsx')), 'site : « sessions finies » et résumé du mois d\'une personne = missions seulement');
ok(/open: mine\.filter\(isOpenMission\)\.length/.test(read('src/utils/assistant.ts')), 'site : l\'assistant ne compte pas les lignes comme missions ouvertes');
// serveur
const srv = read('supabase/functions/df-api/index.ts');
ok(/async function hasOpenMission\(userId: string\)[\s\S]{0,300}!r\.work_type/.test(srv), 'serveur : hasOpenMission ignore les lignes (work_type)');
ok((srv.match(/await hasOpenMission\(/g) || []).length === 4 && !/\.in\('data->>status', OPEN_STATUS\)\.limit\(1\)/.test(srv), 'serveur : horaires de connexion, file d\'attente, déconnexion forcée utilisent la même règle (plus aucune vérification « une ligne = mission »)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
