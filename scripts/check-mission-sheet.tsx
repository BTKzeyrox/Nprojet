// Contrôle du tableau préparé par mission (M18.6) : règles, serveur (même texte), démo en mémoire, écran. Sans réseau. Lancer : npm run check:mission-sheet
import fs from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const S = await import('../src/utils/sheets');
const M = await import('../src/utils/missionSheet');
const A = await import('../src/utils/sheetAuto');
const { db } = await import('../src/db/store');
const { MySheets } = await import('../src/components/MySheets');
const { AppProvider } = await import('../src/context/AppContext');
const { buildSimulation } = await import('../src/sim/simulation');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const NOW = '2026-10-28T08:00:00.000Z';

// ---- 1. Le modèle selon le type de mission
const types: [string, string][] = [['Saisie de fiches', 'fiches'], ['Contrôle qualité', 'qualite'], ['Tâche administrative', 'admin'], ['Demande d’aide', 'aide'], ['Tâche web', 'web'], ['SAISIE DE FICHES', 'fiches'], ['CONTRÔLE QUALITÉ', 'qualite'], ['ADMINISTRATIF', 'admin'], ['WEB', 'web'], ['AIDE', 'aide'], ['Controle qualite', 'qualite'], ['n\'importe quoi', 'suivi'], ['', 'suivi']];
for (const [t, want] of types) ok(M.missionModelFor(t) === want, `type « ${t} » → modèle ${want}`);
ok(M.missionModelFor(undefined) === 'suivi' && M.missionModelFor(null) === 'suivi' && M.missionModelFor(42) === 'suivi', 'type absent ou faux → suivi de tâches');
const sim = buildSimulation({ today: '2026-10-28' });
const simTypes = [...new Set(sim.contracts.map(c => String(c.post_type)))];
ok(simTypes.length === 5 && simTypes.every(t => M.missionModelFor(t) !== 'suivi'), `les 5 types de la simulation (${simTypes.join(', ')}) ont chacun leur modèle`);
ok(new Set(simTypes.map(M.missionModelFor)).size === 5, 'les 5 types de la simulation donnent 5 modèles différents');

// ---- 2. Le tableau préparé
const sh = M.buildMissionSheet({ postId: 'post-1792000000000', postNumber: 4, date: '2026-10-28', type: 'Saisie de fiches', now: NOW })!;
ok(!!sh && sh.id === 'sp-post-1792000000000' && sh.post_id === 'post-1792000000000', 'identifiant imposé « sp- » + id de la session, avec le lien post_id');
ok(sh.title === 'Mission n° 4 — 2026-10-28', 'titre FR « Mission n° 4 — date »');
ok(J(S.activeColumns(sh).map(c => c.name)) === J(['Date', 'N° de fiche', 'Nom', 'Quantité', 'Remarque']), 'colonnes de la saisie de fiches');
ok(S.activeRows(sh).length === 1, 'une première ligne vide');
ok(S.sheetProblems(sh).length === 0, 'aucun problème dans le tableau préparé');
const en = M.buildMissionSheet({ postId: 'p1', postNumber: 2, date: '2026-10-28', type: 'WEB', lang: 'en', now: NOW })!;
ok(en.title === 'Mission #2 — 2026-10-28' && S.activeColumns(en)[0].name === 'Page or link' && J(S.activeColumns(en)[1].options) === J(['None', 'Broken link', 'Wrong price', 'Wrong text']), 'anglais : titre, colonnes et choix de la liste');
const web = M.buildMissionSheet({ postId: 'p2', date: '2026-10-28', type: 'Tâche web', now: NOW })!;
ok(web.title === 'Mission — 2026-10-28', 'sans numéro de mission : « Mission — date »');
ok(S.activeColumns(M.buildMissionSheet({ postId: 'p3', date: '2026-10-28', type: 'Contrôle qualité', now: NOW })!).filter(c => c.type === 'check').length === 2, 'contrôle qualité : 2 cases à cocher (contrôlé, erreur trouvée)');
ok(M.buildMissionSheet({ postId: '', date: 'x', now: NOW }) === null && M.buildMissionSheet({ postId: 'x'.repeat(58), date: 'x', now: NOW }) === null, 'identifiant de session vide ou trop long (> 60 avec le préfixe) : refusé');
ok(M.buildMissionSheet({ postId: 'x'.repeat(57), date: 'x', now: NOW }) !== null, 'identifiant de session de 57 signes : accepté (60 avec « sp- »)');
for (const key of ['fiches', 'qualite', 'admin', 'web', 'aide', 'suivi'] as const) { const t = M.buildMissionSheet({ postId: 'z' + key, date: '2026-10-28', type: key === 'fiches' ? 'fiche' : key === 'qualite' ? 'qualité' : key === 'admin' ? 'admin' : key === 'web' ? 'web' : key === 'aide' ? 'aide' : 'zzz', now: NOW })!; ok(!!S.cleanSheet(t) && S.cleanSheet(t)!.post_id === 'z' + key && S.sheetChars(t) < 20000, `modèle « ${key} » : tableau valide, léger, lien conservé après nettoyage`); }
ok(M.isMissionSheet(sh) && !M.isMissionSheet({ id: 'sp-autre', post_id: 'post-1' }) && !M.isMissionSheet({ id: 's1' }), 'isMissionSheet : le lien et l\'identifiant doivent s\'accorder');

// ---- 3. Faut-il préparer le tableau ?
const P = { id: 'post-1', employee_id: 'u1', status: 'pending_start' };
ok(M.needsMissionSheet(P, 'u1', 'employee', []), 'l\'opérateur démarre sa session : oui');
ok(M.needsMissionSheet({ ...P, status: 'active' }, 'u1', 'employee', []), 'session en cours : oui');
ok(!M.needsMissionSheet({ ...P, status: 'completed' }, 'u1', 'employee', []) && !M.needsMissionSheet({ ...P, status: 'rejected' }, 'u1', 'employee', []), 'session finie ou refusée : non');
ok(!M.needsMissionSheet(P, 'u1', 'employee', ['sp-post-1']), 'déjà préparé : non (jamais de doublon)');
ok(!M.needsMissionSheet(P, 'u2', 'employee', []) && !M.needsMissionSheet(P, 'u1', 'admin', []), 'ce n\'est pas son opérateur, ou c\'est le responsable : non');

// ---- 4. Le nettoyage garde le lien
ok(S.cleanSheet({ ...sh })!.post_id === sh.post_id, 'cleanSheet garde post_id');
ok(S.cleanSheet({ ...sh, post_id: 'p'.repeat(100) })!.post_id!.length === 60, 'post_id trop long : coupé à 60');
ok(S.cleanSheet({ ...sh, post_id: 5 })!.post_id === undefined, 'post_id qui n\'est pas du texte : ignoré');

// ---- 5. Serveur : même texte, mêmes règles
const src = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
const bm = /\/\/ ===== BEGIN SHEETS[^\n]*\n([\s\S]*?)\/\/ ===== END SHEETS =====/.exec(src);
ok(!!bm, 'serveur : bloc SHEETS présent');
const srv = new Function(`${transformSync(bm![1], { loader: 'ts' }).code}\nreturn { cleanSheet, cleanSheetWrite, SHEET_LIMITS };`)() as any;
ok(srv.SHEET_LIMITS.missionSheets === S.LIMITS.missionSheets && S.LIMITS.missionSheets === 400, 'serveur et site : mêmes 400 tableaux de mission');
ok(J(srv.cleanSheet(sh, NOW)) === J(S.cleanSheet(sh, NOW)), 'serveur et site nettoient le tableau de mission pareil');
const me = { id: 'u1', name: 'Ana', role: 'employee' };
const W = (rec: any, ex: any, who: any, counts: any = { active: 0, total: 0, mission: 0 }, post: any = { employee_id: 'u1' }) => srv.cleanSheetWrite(rec, ex, who, NOW, counts, post);
ok(W(sh, undefined, me).ok && W(sh, undefined, me).save.post_id === sh.post_id && W(sh, undefined, me).save.owner_id === 'u1', 'serveur : tableau de SA session accepté, propriétaire = celui qui écrit');
ok(W(sh, undefined, me, undefined, { employee_id: 'u2' }).reason === 'post', 'serveur : la session d\'un AUTRE opérateur est refusée');
ok(W(sh, undefined, me, undefined, null).reason === 'post', 'serveur : session introuvable : refusé');
ok(W({ ...sh, id: 'sp-autre-session' }, undefined, me).reason === 'post' && W({ ...sh, id: 'mon-id' }, undefined, me).reason === 'post', 'serveur : identifiant libre refusé (il doit être sp- + session : un seul par session)');
for (const role of ['admin', 'accountant', 'team_lead']) ok(W(sh, undefined, { ...me, role }).reason === 'forbidden', `serveur : le rôle ${role} n'écrit pas de tableau de mission`);
const stored = W(sh, undefined, me).save;
ok(W({ ...stored, rows: [] }, stored, me).ok, 'serveur : l\'opérateur modifie son tableau de mission');
ok(W({ ...stored, post_id: 'post-autre' }, stored, me).save.post_id === stored.post_id, 'serveur : le lien avec la session ne change JAMAIS (même identifiant, autre session envoyée : on garde l\'ancienne)');
ok(W({ ...stored, post_id: 'post-autre', id: 'sp-post-autre' }, stored, me).reason === 'post', 'serveur : changer le tableau vers une autre session (autre identifiant) est refusé');
ok(W({ ...stored, post_id: undefined }, stored, me).save.post_id === stored.post_id, 'serveur : le lien ne peut pas être retiré');
const perso = S.fromTemplate(S.TEMPLATES[1], 'Mon tableau', NOW);
const ownPerso = { ...perso, owner_id: 'u1', owner_name: 'Ana' };
ok(W({ ...perso, post_id: 'post-1' }, ownPerso, me).save.post_id === undefined, 'serveur : on ne peut pas coller un lien à un tableau personnel existant');
ok(W({ ...stored, owner_id: 'u9' }, { ...stored, owner_id: 'u9' }, me).reason === 'forbidden', 'serveur : jamais le tableau de mission d\'un autre');
ok(W(sh, undefined, me, { active: 20, total: 20, mission: 0 }).ok, 'serveur : 20 tableaux personnels n\'empêchent pas le tableau de mission');
ok(W(perso, undefined, me, { active: 20, total: 20, mission: 0 }, null).reason === 'limit', 'serveur : le 21e tableau PERSONNEL est toujours refusé');
ok(W(perso, undefined, me, { active: 0, total: 0, mission: 399 }, null).ok && W(perso, undefined, me, { active: 0, total: 0, mission: 9999 }, null).ok, 'serveur : les tableaux de mission ne comptent pas dans la limite des tableaux personnels');
ok(W(sh, undefined, me, { active: 0, total: 0, mission: 399 }).ok && W(sh, undefined, me, { active: 0, total: 0, mission: 400 }).reason === 'limit', 'serveur : 400 tableaux de mission au plus');
ok(W(sh, stored, me, { active: 0, total: 0, mission: 400 }).ok, 'serveur : un tableau de mission déjà là reste modifiable même à 400');
const big = { ...sh, rows: Array.from({ length: 5000 }, (_, i) => ({ id: 'r' + i, cells: Object.fromEntries(sh.columns.map(c => [c.id, 'z'.repeat(400)])) })) };
ok(W(big, undefined, me).reason === 'size', 'serveur : la taille maximale vaut aussi pour un tableau de mission');
// La synchro : séparation des comptes et recherche de la session
const syncPart = /if \(col === 'sheets'\) \{[\s\S]*?toSave = sv\.save;/.exec(src);
ok(!!syncPart, 'serveur : synchro des tableaux trouvée');
if (syncPart) {
  const b = syncPart[0];
  ok(/others\.filter\(\(x: any\) => !x\.data\.post_id\)/.test(b) && /mission: others\.length - personal\.length/.test(b), 'serveur : les comptes personnels et de mission sont séparés');
  ok(/!existing && typeof rec\.post_id === 'string' && rec\.post_id/.test(b) && /from\(T\.posts\)\.select\('data'\)\.eq\('id', rec\.post_id\)/.test(b), 'serveur : la session est cherchée en base (jamais crue sur parole), seulement à la création');
  ok(/cleanSheetWrite\([\s\S]*?counts, sessionRow\)/.test(b), 'serveur : la session trouvée est donnée à la règle d\'écriture');
}

// ---- 6. Le site, en mémoire (démo des contrôles) : démarrage d'une session
db.enterDemo('employee');
const emp = db.getCurrentUser()!;
const contract = db.getContracts().find(c => c.post_type)!;
// libérer une éventuelle session ouverte de la démo
const open = db.getPosts().find(p => p.employee_id === emp.id && ['pending_start', 'active', 'pending_end'].includes(p.status));
if (open) db.forceReleasePost(open.id, 'essai');
const before = db.getSheets().filter(s => s.owner_id === emp.id).length;
const r1 = db.startPost({ employeeId: emp.id, clientName: contract.client_name, accountTag: contract.account_tag, targetScore: contract.target_score, initialScore: 0, postNumber: contract.post_number, shiftType: 'day', status: 'pending_start' });
ok(r1.success && !!r1.post, 'démarrer une session : accepté');
const mine = db.getSheets().filter(s => s.owner_id === emp.id);
const made = mine.find(s => s.id === M.missionSheetId(r1.post!.id));
ok(mine.length === before + 1 && !!made && made.post_id === r1.post!.id, 'un seul tableau préparé, lié à la session');
ok(!!made && J(S.activeColumns(made).map(c => c.name)) === J(S.activeColumns(M.buildMissionSheet({ postId: 'x', date: 'x', type: contract.post_type, now: NOW })!).map(c => c.name)), `colonnes = modèle du type « ${contract.post_type} » de la mission`);
(db as any).prepareMissionSheet(r1.post);
(db as any).prepareMissionSheet(r1.post);
ok(db.getSheets().filter(s => s.owner_id === emp.id).length === before + 1, 'préparé deux fois de plus : toujours UN seul tableau (pas de doublon)');
ok(db.getSheets().filter(s => s.owner_id === emp.id && !s.post_id).length === before, 'les tableaux personnels ne bougent pas');
await new Promise(r => setTimeout(r, 5)); // les identifiants de session viennent de l'horloge : deux départs dans la même milliseconde sont impossibles pour une personne
const r2 = db.startPost({ employeeId: emp.id, clientName: contract.client_name, accountTag: contract.account_tag, targetScore: contract.target_score, initialScore: 0, postNumber: contract.post_number, shiftType: 'day', status: 'pending_start', autoReplaceExisting: true });
ok(r2.success && r2.post!.id !== r1.post!.id && db.getSheets().filter(s => s.owner_id === emp.id && s.post_id).length >= 2, 'une AUTRE session : son propre tableau');
const html = renderToString(<AppProvider><MySheets /></AppProvider>);
ok(html.includes('Tableaux de mes missions') && html.includes(made!.title) && !/NaN|undefined|\[object/.test(html), 'écran « Mes tableaux » : groupe « Tableaux de mes missions » avec le tableau, sans erreur');
// Le responsable : il lit, il n'en crée pas
db.enterDemo('admin');
const adm = db.getCurrentUser()!;
const emp2 = db.getUsers().find(u => u.role === 'employee')!;
const before2 = db.getSheets().length;
const ra = db.startPost({ employeeId: emp2.id, clientName: contract.client_name, accountTag: '', targetScore: 10, initialScore: 0, postNumber: contract.post_number, shiftType: 'day', status: 'active', autoReplaceExisting: true });
ok(ra.success && db.getSheets().length === before2 && !db.getSheets().some(s => s.post_id === ra.post!.id), 'le responsable qui démarre pour un opérateur ne crée AUCUN tableau (il n\'a pas le droit d\'écrire)');
ok(adm.role === 'admin', 'responsable bien connecté pour l\'essai');
const htmlAdmin = renderToString(<AppProvider><MySheets /></AppProvider>);
ok(!/NaN|undefined|\[object/.test(htmlAdmin), 'écran du responsable sans erreur');
ok(calls === 0, `aucun appel réseau (${calls})`);

// ---- 7. Écran : les tableaux de mission ne comptent pas dans les 20
const ui = fs.readFileSync('src/components/MySheets.tsx', 'utf8');
ok(/x\.deleted_at && !x\.post_id\)\.length >= S\.LIMITS\.sheetsPerPerson/.test(ui), 'écran : seuls les tableaux personnels comptent dans « 20 au maximum »');

// ---- M19 : tableaux préparés plus intelligents
{
  const fiches = M.buildMissionSheet({ postId: 'pf', date: '2026-10-28', type: 'Saisie de fiches', now: NOW })!;
  const qual = M.buildMissionSheet({ postId: 'pq', date: '2026-10-28', type: 'Contrôle qualité', now: NOW })!;
  ok(S.activeColumns(fiches).some(c => c.name === 'N° de fiche' && c.type === 'code') && S.activeColumns(qual).some(c => c.name === 'N° de dossier' && c.type === 'code'), 'M19 : « N° de fiche » et « N° de dossier » sont des colonnes Code (REF001, REF002…)');
  const r0 = S.activeRows(fiches)[0].cells, cd = S.activeColumns(fiches).find(c => c.type === 'code')!, dt = S.activeColumns(fiches).find(c => c.type === 'date')!;
  ok(r0[cd.id] === 'REF001' && r0[dt.id] === '2026-10-28', 'M19 : la première ligne arrive déjà remplie (REF001, date de la mission)');
  const more = A.addRowAuto(fiches, NOW, '2026-10-29')!;
  ok(S.activeRows(more)[1].cells[cd.id] === 'REF002', 'M19 : la ligne suivante reçoit REF002');
  ok(S.activeColumns(M.buildMissionSheet({ postId: 'ps', date: '2026-10-28', type: 'Suivi', now: NOW })!).every(c => c.type !== 'code'), 'M19 : le suivi de tâches n\'a pas de code (rien à numéroter)');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
