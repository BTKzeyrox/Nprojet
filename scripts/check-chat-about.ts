// Messagerie : discussions épinglées, appui long (épingler / cacher) et fiche « À propos » (clic sur le rond de profil). Règles pures + câblage de l'écran.
import { readFileSync } from 'node:fs';
const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const P = await import('../src/utils/chatPrefs');
const A = await import('../src/utils/chatAbout');

// ---- épingler une discussion ----
ok(P.getPinnedThreads('u1').length === 0, 'au début : rien d\'épinglé');
ok(P.togglePinnedThread('u1', 'b').join() === 'b' && P.togglePinnedThread('u1', 'c').join() === 'b,c', 'épingler ajoute');
ok(P.togglePinnedThread('u1', 'b').join() === 'c', 'ré-appuyer désépingle');
ok(P.getPinnedThreads('u2').length === 0, 'les épingles sont par personne');
const list = [{ id: 'all' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
ok(P.pinFirst(list, ['c', 'a']).map(x => x.id).join() === 'all,a,c,b,d', 'ordre : groupe général, épinglées (ordre de la liste), puis le reste');
ok(P.pinFirst(list, ['all', 'd']).map(x => x.id).join() === 'all,d,a,b,c', 'le groupe général reste en tête même épinglé');
ok(P.pinFirst(list, []).map(x => x.id).join() === 'all,a,b,c,d', 'sans épingle : ordre inchangé');
mem['df_chat_pinthreads_u3'] = '{pas du json';
ok(P.getPinnedThreads('u3').length === 0, 'stockage abîmé : aucune erreur');

// ---- fiche « À propos » ----
const op = { id: 'u9', username: 'operator1', name: 'Opérateur 1', role: 'employee', shift: 'night', team: 'Nuit A', is_online: true, phone: '034 00 000 00', avatar_url: '' } as any;
const th = { id: 'u9', kind: 'user' as const, title: 'Opérateur 1', subtitle: '@operator1', user: op };
const asAdmin = A.aboutThread(th, { viewer: { id: 'user-admin-1', role: 'admin' }, pinned: false, hidden: false, canOpenFullProfile: true });
ok(asAdmin.facts.some(f => f.label === 'Téléphone') && asAdmin.facts.some(f => f.value === 'Opérateur') && asAdmin.facts.some(f => f.value === 'Nuit') && asAdmin.facts.some(f => f.value === 'En ligne'), 'responsable : rôle, poste, état et téléphone');
ok(asAdmin.actions.join() === 'write,full_profile,pin,hide', 'responsable : écrire, profil complet, épingler, cacher');
const asEmp = A.aboutThread({ ...th, id: 'u8', user: { ...op, id: 'u8' } }, { viewer: { id: 'u9', role: 'employee' }, pinned: true, hidden: true });
ok(!asEmp.facts.some(f => f.label === 'Téléphone'), 'opérateur : jamais le téléphone d\'un collègue');
ok(!asEmp.facts.some(f => /Ar|gain|paie|salaire/i.test(f.label + f.value)), 'opérateur : aucune donnée d\'argent');
ok(asEmp.actions.join() === 'write,unpin,show', 'déjà épinglée et cachée : propose désépingler et afficher');
const en = A.aboutThread(th, { viewer: { id: 'x', role: 'admin' }, pinned: false, hidden: false, lang: 'en' });
ok(en.facts.some(f => f.label === 'Role' && f.value === 'Operator') && en.facts.some(f => f.value === 'Online'), 'anglais : rôle et état traduits');
const all = A.aboutThread({ id: 'all', kind: 'all', title: 'Groupe général', subtitle: '' }, { viewer: { id: 'x', role: 'admin' }, pinned: false, hidden: false });
ok(all.actions.join() === 'write', 'groupe général : on ne le cache pas et il est déjà en tête');
const grp = A.aboutThread({ id: 'grp_1', kind: 'group', title: 'Équipe', subtitle: '5 membres' }, { viewer: { id: 'x', role: 'employee' }, pinned: false, hidden: false });
ok(grp.actions.join() === 'write,group_info,pin,hide' && grp.facts.some(f => f.value === '5 membres'), 'groupe : écrire, infos, épingler, cacher');
const pair = A.aboutThread({ id: 'pair:a:b', kind: 'pair', title: 'A ↔ B', subtitle: '' }, { viewer: { id: 'x', role: 'admin' }, pinned: false, hidden: false });
ok(!pair.actions.includes('write'), 'discussion entre opérateurs (lecture seule) : pas « Écrire »');
ok(A.roleLabel('team_lead') === "Chef d'équipe" && A.roleLabel('???') === 'Membre', 'libellés de rôle');

// ---- écran ----
const chat = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/startRowPress/.test(chat) && /onContextMenu=\{e => \{ e\.preventDefault\(\); stopRowPress\(\)/.test(chat) && /450/.test(chat), 'liste : appui long (450 ms) ou clic droit sur une discussion');
ok(/rowLong\.current/.test(chat), 'l\'appui long n\'ouvre pas la discussion en même temps');
ok(/data-row-avatar/.test(chat) && /À propos de/.test(chat), 'liste : le petit rond de profil ouvre « À propos »');
ok(/data-msg-avatar/.test(chat) && /setAboutOf\(\{ id: msg\.sender_id/.test(chat), 'messages : le rond de profil ouvre « À propos »');
ok(/pinFirst\(/.test(chat) && /pinnedThreads\.includes\(t\.id\)/.test(chat), 'les discussions épinglées sont en tête avec une épingle');
ok(/menuOnly: true/.test(chat) && /a === 'pin' \|\| a === 'unpin' \|\| a === 'hide' \|\| a === 'show'/.test(chat), 'appui long : seulement épingler / cacher');
const cmp = readFileSync('src/components/ChatAbout.tsx', 'utf8');
ok(/min-h-\[48px\]/.test(cmp) && /data-about-action/.test(cmp) && /aria-modal/.test(cmp), 'fiche : cibles tactiles de 48 px, dialogue accessible');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
