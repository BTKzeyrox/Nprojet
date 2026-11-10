// Messagerie S3 + S4 (2026-11-09) : rappel/tâche/événement depuis un message, modèles de messages, message programmé. Règles pures + câblage (écran et serveur).
// Lancer : npm run check:chat-tools
import { readFileSync } from 'node:fs';
const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const T = await import('../src/utils/chatTemplates');

// ---- modèles ----
ok(T.getTemplates('u1').length === 0, 'au début : aucun modèle');
T.addTemplate('u1', '  Bien reçu, merci.  '); T.addTemplate('u1', 'Je suis en retard.');
ok(T.getTemplates('u1').join('|') === 'Je suis en retard.|Bien reçu, merci.', 'ajout : le plus récent d\'abord, espaces retirés');
T.addTemplate('u1', 'Bien reçu, merci.');
ok(T.getTemplates('u1').length === 2 && T.getTemplates('u1')[0] === 'Bien reçu, merci.', 'le même texte n\'est jamais gardé deux fois');
T.addTemplate('u1', '   ');
ok(T.getTemplates('u1').length === 2, 'un texte vide n\'est pas gardé');
ok(T.removeTemplate('u1', 0).join('|') === 'Je suis en retard.', 'suppression d\'un modèle');
for (let i = 0; i < 30; i++) T.addTemplate('u2', 'm' + i);
ok(T.getTemplates('u2').length === T.TPL_MAX && T.getTemplates('u2')[0] === 'm29', '20 modèles au plus, le plus ancien part');
ok(T.addTemplate('u3', 'x'.repeat(900))[0].length === T.TPL_MAX_LEN, 'un modèle est coupé à 500 caractères');
ok(T.getTemplates('u4').length === 0 && T.getTemplates('u1').length === 1, 'les modèles sont par personne');
mem['df_chat_tpl_u5'] = '{abîmé'; ok(T.getTemplates('u5').length === 0, 'stockage abîmé : aucune erreur');

// ---- message programmé : heure ----
const now = Date.UTC(2026, 10, 9, 3, 0); // 9 nov 2026 06:00 à Madagascar
ok(T.scheduleAt('2026-11-09', '06:30', now).ok === true, 'dans 30 minutes : accepté');
ok(T.scheduleAt('2026-11-09', '06:00', now).ok === false, 'maintenant ou passé : refusé');
ok(T.scheduleAt('2026-11-09', '06:00', now - 0).ok === false && T.scheduleAt('2026-11-08', '09:00', now).ok === false, 'hier : refusé');
ok(T.scheduleAt('2026-12-10', '06:00', now).ok === false && T.scheduleAt('2026-12-08', '06:00', now).ok === true, 'plus de 30 jours : refusé ; 29 jours : accepté');
ok(T.scheduleAt('', '06:30', now).ok === false && T.scheduleAt('2026-11-10', '25:00', now).ok === false, 'date ou heure absente / fausse : refusé');
const r = T.scheduleAt('2026-11-10', '08:00', now) as any;
ok(r.ms === Date.UTC(2026, 10, 10, 5, 0), 'l\'heure est celle de Madagascar (08:00 = 05:00 UTC)');
ok(T.scheduleLabel(r.ms) === '10/11 à 08:00', 'étiquette : « 10/11 à 08:00 »');

// ---- câblage serveur ----
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/at < nowMs \+ 60000 \|\| at > nowMs \+ 30 \* 86400000/.test(srv), 'serveur : 1 minute à 30 jours (comme l\'écran)');
ok(/recs\.filter\(\(r: any\) => !r\.send_at \|\| r\.sender_id === me\.id\)/.test(srv), 'serveur : les autres ne reçoivent pas un message programmé');
ok(/!toSave\.send_at\) pushJobs\.push\(pushMessage/.test(srv), 'serveur : pas de notification avant l\'heure');
ok(/async function releaseScheduledMessages[\s\S]{0,900}if \(!d\.deleted_at\) await pushMessage\(out\)/.test(srv), 'serveur : à l\'heure le message part, notifié, sauf s\'il est supprimé');
ok(/await releaseScheduledMessages\(\);\s*const nowMs = Date\.now\(\);\s*(?:const sheetSent = await sheetReminderRun\(nowMs\);\s*)?const \{ data: rows \} = await sb\.from\(REMINDERS\)/.test(srv), 'serveur : la tâche planifiée des rappels (chaque minute) libère les messages');
ok(/'reactions', 'send_at'\]\) delete save\[k\]/.test(srv), 'serveur : un message supprimé ne part pas');
// ---- câblage écran ----
const cv = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(['schedule', 'templates'].every(k => cv.includes(`'${k}'`)) && /data-scheduled-badge/.test(cv), 'écran : menu « + » avec Programmer et Modèles, étiquette sur le message programmé');
ok(/k: 'item', label: 'Rappel, tâche, événement'/.test(cv), 'écran : menu du message « Rappel, tâche, événement »');
const mi = readFileSync('src/components/MessageToItem.tsx', 'utf8');
ok(/shared/.test(readFileSync('src/utils/assistantActions.ts', 'utf8')) && /buildItem\(a\)/.test(mi) && /remSave/.test(mi), 'rappel depuis un message : même moteur que l\'assistant, visible par soi seul');
console.log(`\n${n - fails}/${n} contrôles OK`);
process.exit(fails ? 1 : 0);
