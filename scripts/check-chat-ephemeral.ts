// Chat : messages éphémères + balayage (M28.4). Règles pures (chatShared = copie exacte côté serveur), serveur, démo, écran. Contrôle : npm run check:chat-ephemeral
import { readFileSync } from 'node:fs';
import { EPHEMERAL_CHOICES, EPHEMERAL_SERVER_LIVE, isExpired, planEphemeral } from '../src/utils/chatShared';
import { isComposerSwipe } from '../src/utils/chatSwipe';
import { AUDIT_ACTIONS } from '../src/utils/auditRules';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const admin = { id: 'ad', role: 'admin' }, lead = { id: 'tl', role: 'team_lead' }, emp = { id: 'e1', role: 'employee' }, emp2 = { id: 'e2', role: 'employee' };
const grp = { id: 'grp_1', owner_id: 'e1', members: ['e1', 'e2', 'tl'] };
const H = 3600000;
ok(EPHEMERAL_CHOICES.join() === `${H},${24 * H},${168 * H}`, 'durées permises : 1 h, 24 h, 7 jours');
ok(planEphemeral(admin, null, 'all', 24 * H).ok && planEphemeral(lead, null, 'all', H).ok && planEphemeral(admin, null, 'all', 0).ms === 0, 'discussion générale : responsable et chef (0 = désactiver)');
ok(planEphemeral(emp, null, 'all', H).error === 'role', 'discussion générale : un employé ne peut pas');
ok(planEphemeral(emp, grp, 'grp_1', H).ok && planEphemeral(emp2, grp, 'grp_1', H).error === 'role', 'groupe : le créateur oui, un autre membre non');
ok(planEphemeral(lead, { ...grp, members: ['e1', 'e2'] }, 'grp_1', H).error === 'role' && planEphemeral(admin, { ...grp, members: ['e1'] }, 'grp_1', H).ok, 'groupe : un chef qui n\'en est pas membre non ; le responsable oui');
ok(planEphemeral(admin, null, 'e1', H).error === 'direct' && planEphemeral(admin, null, 'grp_zz', H).error === 'direct', 'discussion à deux ou groupe inconnu : refusé');
ok(planEphemeral(admin, null, 'all', 5 * 60000).error === 'ms' && planEphemeral(admin, null, 'all', -1).error === 'ms' && planEphemeral(admin, null, 'all', NaN as any).error === 'args' && planEphemeral(admin, null, 'all', '3600000' as any).error === 'args' && planEphemeral(null, null, 'all', H).error === 'args', 'durée inventée, texte ou données cassées : refusé sans erreur');
ok(isExpired({ expires_ms: 100 }, 100) && isExpired({ expires_ms: 100 }, 200) && !isExpired({ expires_ms: 300 }, 200) && !isExpired({}, 200) && !isExpired(null, 200) && !isExpired({ expires_ms: 'x' }, 200) && !isExpired({ expires_ms: 0 }, 200), 'expiré : à l\'heure dite ou après ; pas d\'heure = jamais ; données bizarres = jamais');
// balayage
const W = 390;
ok(isComposerSwipe({ x: 200, y: 700 }, { x: 100, y: 705 }, W) && isComposerSwipe({ x: 100, y: 700 }, { x: 200, y: 690 }, W), 'balayage : horizontal assez long, dans les deux sens');
ok(!isComposerSwipe({ x: 10, y: 700 }, { x: 150, y: 700 }, W) && !isComposerSwipe({ x: W - 10, y: 700 }, { x: 150, y: 700 }, W), 'jamais depuis le bord de l\'écran (geste « retour » de l\'iPhone)');
ok(!isComposerSwipe({ x: 200, y: 700 }, { x: 150, y: 700 }, W) && !isComposerSwipe({ x: 200, y: 600 }, { x: 120, y: 690 }, W), 'trop court ou trop vertical : pas un balayage');
ok(!isComposerSwipe({ x: 200, y: 700 }, { x: 100, y: 700 }, W, true) && !isComposerSwipe(null as any, { x: 1, y: 1 }, W) && !isComposerSwipe({ x: 200, y: 700 }, { x: 100, y: 700 }, 0), 'en train d\'écrire, données cassées, écran sans largeur : rien');
// serveur
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/'expires_ms', 'ephemeral_ms'\]\) delete save\[k\]/.test(srv), 'serveur : expires_ms / ephemeral_ms jamais pris d\'un navigateur');
ok(/Number\(\(st as any\)\?\.data\?\.chat_ephemeral_all_ms\)/.test(srv) && /Number\(grp\.ephemeral_ms\)/.test(srv) && /save\.expires_ms = Date\.now\(\) \+ save\.ephemeral_ms/.test(srv), 'serveur : le mode de la discussion est lu ICI, l\'heure de disparition calculée ICI');
ok(/!isExpired\(r, Date\.now\(\)\)/.test(srv), 'serveur : un message expiré n\'est plus envoyé');
ok(/async function sweepExpiredMessages/.test(srv) && /await sweepExpiredMessages\(\);/.test(srv) && /storage\.from\(BUCKET\)\.remove\(\[path\]\)/.test(srv) && /cldDestroy\(cid\)/.test(srv) && /\.delete\(\)\.eq\('id', \(r as any\)\.id\)/.test(srv), 'serveur : balayage chaque minute, ligne et fichiers effacés');
ok(/out\.expires_ms = nowMs \+ Number\(out\.ephemeral_ms\)/.test(srv), 'serveur : un message programmé commence son compte à rebours à sa sortie');
ok(/chatEphemeralRoute\(req, res, me\)/.test(srv) && /planEphemeral\(me, group, thread, ms\)/.test(srv) && /action === "chat-ephemeral" && req\.method === "POST"/.test(srv), 'serveur : route chat-ephemeral, droits vérifiés ICI');
ok(/if \(existing\?\.chat_ephemeral_all_ms\) toSave\.chat_ephemeral_all_ms = existing\.chat_ephemeral_all_ms; else delete toSave\.chat_ephemeral_all_ms;/.test(srv), 'serveur : le mode de la discussion générale ne se change pas par les réglages');
ok(AUDIT_ACTIONS.includes('chat_mark' as any) && AUDIT_ACTIONS.includes('chat_ephemeral' as any) && /"chat_mark", "chat_ephemeral"\]/.test(srv), 'journal d\'audit : chat_mark et chat_ephemeral enregistrés (site = serveur)');
// démo + écran
const st = readFileSync('src/db/store.ts', 'utf8'), ui = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/getEphemeralMs\(/.test(st) && /setChatEphemeral\(/.test(st) && /'chat-ephemeral'/.test(st) && /planEphemeral\(me, group, threadId, ms\)/.test(st) && /expires_ms: now\.getTime\(\) \+ eph/.test(st), 'démo : mêmes règles, même route');
ok(/data-ephemeral-open/.test(ui) && /data-ephemeral-banner/.test(ui) && /data-ephemeral-msg/.test(ui) && /data-composer-bar/.test(ui) && /isComposerSwipe\(/.test(ui) && /isExpired\(m, nowMs\)/.test(ui), 'écran : bouton, bandeau, minuteur du message, balayage de la barre, masquage à l\'heure');
ok(typeof EPHEMERAL_SERVER_LIVE === 'boolean', 'interrupteur « serveur prêt » présent (false tant que df-api n\'est pas déployé)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
