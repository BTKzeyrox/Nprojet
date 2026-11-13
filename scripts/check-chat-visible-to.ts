// Chat : message « visible seulement par X » (M28.3). Règles pures (chatShared, copie exacte côté serveur), serveur, démo, écran. Contrôle : npm run check:chat-visible-to
import { readFileSync } from 'node:fs';
import { canSeeChatMessage, isHiddenFrom, planVisibleTo, VISIBLE_TO_SERVER_LIVE } from '../src/utils/chatShared';
import { canForward } from '../src/utils/chatMarks';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const admin = { id: 'ad', role: 'admin', name: 'Resp' }, lead = { id: 'tl', role: 'team_lead', name: 'Chef' }, emp = { id: 'e1', role: 'employee', name: 'A' }, emp2 = { id: 'e2', role: 'employee', name: 'B' }, emp3 = { id: 'e3', role: 'employee', name: 'C' };
const grp = { id: 'grp_1', owner_id: 'e1', members: ['e1', 'e2', 'e3', 'tl'] };
const all = ['ad', 'tl', 'e1', 'e2', 'e3'];
const msg = { id: 'm', sender_id: 'tl', recipient_id: 'all', visible_to: ['e1'] };
// caché ou visible
ok(!isHiddenFrom(emp, msg) && isHiddenFrom(emp2, msg) && !isHiddenFrom(lead, msg) && !isHiddenFrom(admin, msg), 'visible : la personne choisie, l\'auteur, le responsable ; caché : tous les autres');
ok(!isHiddenFrom(emp2, { ...msg, visible_to: undefined }) && !isHiddenFrom(emp2, { ...msg, visible_to: [] }), 'sans liste (ou liste vide) : message normal pour tous');
ok(isHiddenFrom(null, msg) && isHiddenFrom(emp, null), 'données cassées : caché (jamais d\'erreur)');
ok(!canSeeChatMessage(emp2, msg, null) && canSeeChatMessage(emp, msg, null) && canSeeChatMessage(admin, msg, null), 'canSeeChatMessage applique la restriction (aussi pour « Important »/épingler)');
ok(!canSeeChatMessage(emp3, { ...msg, recipient_id: grp.id, visible_to: ['e2'] }, grp) && canSeeChatMessage(emp, { ...msg, recipient_id: 'grp_1', visible_to: ['e1'] }, grp), 'dans un groupe : membre non listé ne voit pas');
// droits
ok(planVisibleTo(lead, null, 'all', ['e1', 'e2'], all).ok && planVisibleTo(admin, null, 'all', ['e1'], all).ok, 'responsable et chef : OK dans la discussion générale');
ok(planVisibleTo(emp, null, 'all', ['e2'], all).error === 'role', 'un employé ne peut pas restreindre dans la discussion générale');
ok(planVisibleTo(emp, grp, 'grp_1', ['e2'], grp.members).ok && planVisibleTo(emp2, grp, 'grp_1', ['e3'], grp.members).error === 'role', 'créateur du groupe : OK dans SON groupe ; autre membre : refusé');
ok(planVisibleTo(admin, null, 'e1', ['e1'], all).error === 'direct', 'discussion à deux : refusé (inutile)');
ok(planVisibleTo(lead, null, 'all', ['zz'], all).error === 'member', 'une personne qui n\'est pas dans la discussion : refusé');
ok(planVisibleTo(lead, grp, 'grp_1', ['ad'], grp.members).error === 'member', 'groupe : seulement les membres');
ok(planVisibleTo(lead, null, 'all', [], all).error === 'count' && planVisibleTo(lead, null, 'all', ['tl'], all).error === 'count', 'liste vide (ou seulement soi-même) : refusé');
const many = Array.from({ length: 21 }, (_, i) => `u${i}`);
ok(planVisibleTo(lead, null, 'all', many, [...all, ...many]).error === 'count', 'plus de 20 personnes : refusé');
const dup = planVisibleTo(lead, null, 'all', ['e1', 'e1', 'tl', 5 as any, 'e2'], all);
ok(dup.ok && dup.list.join() === 'e1,e2', 'doublons, soi-même et valeurs bizarres ignorés');
ok(planVisibleTo(lead, null, 'all', 'e1' as any, all).error === 'args' && planVisibleTo(null, null, 'all', ['e1'], all).error === 'args', 'arguments cassés : refusé sans erreur');
ok(!canForward({ message: 'x', visible_to: ['e1'] } as any) && canForward({ message: 'x' } as any) && !canForward({ message: 'x', poll: {} } as any), 'un message restreint ne se transfère jamais (et les autres règles de transfert restent)');
// serveur
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/'visible_to', 'visible_names'\]\) delete save\[k\]/.test(srv), 'serveur : visible_to / visible_names jamais pris tels quels d\'un navigateur');
ok(/planVisibleTo\(me, grp, rid, rec\.visible_to, eligible\)/.test(srv) && /visibleNames\(pv\.list\)/.test(srv), 'serveur : droits vérifiés à l\'envoi, noms écrits par le serveur');
ok(/recs\.filter\(\(r: any\) => !isHiddenFrom\(me, r\)\)/.test(srv), 'serveur : le message n\'est pas envoyé aux autres (synchronisation)');
ok((srv.match(/!isHiddenFrom\(me, existing\)/g) || []).length === 2, 'serveur : pas de réaction ni de vote sur un message qu\'on ne voit pas');
ok(/m\.visible_to\.map\(String\)\.filter\(\(x: string\) => x !== String\(m\.sender_id\)\)/.test(srv), 'serveur : seules les personnes choisies sont notifiées');
ok(/répondre à un message « visible seulement par X »/.test(srv) && /od\.visible_to/.test(srv), 'serveur : une réponse garde le même public (la citation ne fuit pas)');

ok(typeof VISIBLE_TO_SERVER_LIVE === 'boolean', 'interrupteur « serveur prêt » présent (false tant que df-api n\'est pas déployé)');
// démo + écran
const st = readFileSync('src/db/store.ts', 'utf8'), ui = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/planVisibleTo\(sender, grp/.test(st) && /q\.visible_to/.test(st), 'démo : mêmes règles et même réponse restreinte');
ok(/data-visible-only/.test(ui) && /Visible seulement par…/.test(ui) && /isHiddenFrom\(currentUser, m\)/.test(ui) && /data-only-chip/.test(ui), 'écran : menu, pastille, ligne « Visible seulement par … », filtre');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
