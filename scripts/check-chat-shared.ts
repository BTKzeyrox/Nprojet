// M28.2 : « Important pour tous » et épinglage élargi : mêmes règles sur le site et sur le serveur, droits exacts.
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import * as S from '../src/utils/chatShared';
import { marksOf, markOf } from '../src/utils/chatMarks';
import { markedMessages } from '../src/utils/chatMarksList';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const block = (src: string) => { const a = src.indexOf('// ===== BEGIN CHATSHARED'), b = src.indexOf('// ===== END CHATSHARED ====='); return a >= 0 && b > a ? src.slice(a, b + '// ===== END CHATSHARED ====='.length) : ''; };
const siteSrc = fs.readFileSync('src/utils/chatShared.ts', 'utf8'), apiSrc = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(block(siteSrc).length > 500 && block(siteSrc) === block(apiSrc), 'le bloc du serveur est la copie EXACTE de celui du site (texte identique)');
const SV = new Function(transformSync(block(apiSrc), { loader: 'ts' }).code + '; return { canUseSharedTools, canSeeChatMessage, planSharedMark };')() as typeof S;

const NOW = '2026-11-12T10:00:00.000Z';
const U = { adm: { id: 'adm', role: 'admin', name: 'Direction' }, tl: { id: 'tl', role: 'team_lead', name: 'Chef Un' }, own: { id: 'own', role: 'employee', name: 'Créateur Groupe' }, mem: { id: 'mem', role: 'employee', name: 'Membre' }, out: { id: 'out', role: 'employee', name: 'Dehors' }, acc: { id: 'acc', role: 'accountant', name: 'Compta' } };
const G = { id: 'grp_1', owner_id: 'own', members: ['own', 'mem', 'tl'] };
const m = (o: any = {}) => ({ id: 'm1', sender_id: 'mem', recipient_id: 'grp_1', message: 'x', ...o });

// ---- droits « outils pour tous » ----
ok(S.canUseSharedTools(U.adm, null) && S.canUseSharedTools(U.tl, null) && S.canUseSharedTools(U.own, G) && !S.canUseSharedTools(U.own, null) && !S.canUseSharedTools(U.mem, G) && !S.canUseSharedTools(U.acc, G) && !S.canUseSharedTools(null, G) && !S.canUseSharedTools({ role: 'admin' }, G), 'outils « pour tous » : responsable, chef d\'équipe, créateur du groupe (dans SON groupe seulement) ; pas un membre, pas le comptable, pas sans identifiant');
ok(!S.canUseSharedTools({ id: 'x', role: 'employee' }, { owner_id: 'autre' }), 'créateur d\'un AUTRE groupe : non');
// ---- visibilité ----
ok(S.canSeeChatMessage(U.adm, m(), G) && S.canSeeChatMessage(U.mem, m(), G) && !S.canSeeChatMessage(U.out, m(), G) && S.canSeeChatMessage(U.out, m({ recipient_id: 'all' }), null) && S.canSeeChatMessage(U.out, m({ recipient_id: 'out', sender_id: 'mem' }), null) && !S.canSeeChatMessage(U.out, m({ recipient_id: 'mem', sender_id: 'own' }), null), 'visibilité : responsable voit tout ; membre voit son groupe ; un étranger rien ; « tous », ses propres messages et ceux qui lui sont adressés : oui');
// ---- Important pour tous ----
{
  const on = (u: any, msg: any, g: any = G) => S.planSharedMark(u, msg, g, 'important', true, NOW);
  ok(on(U.adm, m()).ok && on(U.tl, m()).ok && on(U.own, m()).ok, 'poser « Important pour tous » : responsable, chef d\'équipe, créateur du groupe : OK');
  ok(on(U.mem, m()).error === 'role' && on(U.mem, m({ sender_id: 'mem' })).error === 'role' && on(U.acc, m({ recipient_id: 'all' }), null).error === 'role', 'poser : un simple membre, même auteur du message, et le comptable : refusé');
  ok(on(U.out, m()).error === 'gone', 'poser sur un message qu\'on ne voit pas : « introuvable » (on ne révèle pas qu\'il existe)');
  ok(on(U.tl, m({ recipient_id: 'out', sender_id: 'mem' }), null).error === 'gone' && on(U.tl, m({ recipient_id: 'tl', sender_id: 'mem' }), null).ok, 'chef d\'équipe : discussion à deux dont il fait partie : OK ; discussion entre deux autres : introuvable');
  const r = on(U.tl, m()); ok(r.save.important_all.by === 'tl' && r.save.important_all.by_name === 'Chef Un' && r.save.important_all.at === NOW && r.save.message === 'x', 'le message porte qui l\'a posé et quand ; le reste est inchangé');
  const again = on(U.adm, r.save); ok(again.ok && again.save.important_all.by === 'tl', 'déjà posé par quelqu\'un : on garde le premier (pas d\'écrasement)');
  ok(on(U.adm, m({ deleted_at: 'x' })).error === 'deleted', 'un message supprimé ne se marque pas');
  const off = (u: any, msg: any) => S.planSharedMark(u, msg, G, 'important', false, NOW);
  ok(off(U.tl, r.save).ok && !off(U.tl, r.save).save.important_all, 'retirer : celui qui l\'a posé');
  ok(off(U.adm, r.save).ok && !off(U.adm, r.save).save.important_all, 'retirer : le responsable (même s\'il ne l\'a pas posé)');
  ok(off(U.own, r.save).error === 'remove' && off(U.mem, r.save).error === 'remove', 'retirer : le créateur du groupe ou un membre qui ne l\'a pas posé : refusé');
  ok(off(U.tl, m()).same === true, 'retirer quelque chose qui n\'existe pas : rien à faire (pas d\'erreur)');
  const lost = S.planSharedMark({ ...U.tl, role: 'employee' }, r.save, G, 'important', false, NOW); ok(lost.ok, 'celui qui l\'a posé peut le retirer même s\'il n\'a plus le rôle');
}
// ---- épingler ----
{
  const pin = (u: any, msg: any, on = true) => S.planSharedMark(u, msg, G, 'pinned', on, NOW);
  ok(pin(U.mem, m({ sender_id: 'mem' })).ok && pin(U.mem, m({ sender_id: 'mem' })).save.pinned_by === 'mem', 'épingler : l\'auteur, comme avant');
  ok(pin(U.mem, m({ sender_id: 'own' })).error === 'role', 'épingler : un membre, message d\'un autre : refusé');
  ok(pin(U.adm, m()).ok && pin(U.tl, m()).ok && pin(U.own, m()).ok, 'épingler le message d\'un autre : responsable, chef d\'équipe, créateur du groupe');
  const p = pin(U.tl, m()); ok(p.save.pinned === true && p.save.pinned_at === NOW && p.save.pinned_by === 'tl' && p.save.pinned_by_name === 'Chef Un', 'épinglé : date et « par qui »');
  const q = pin(U.own, p.save); ok(q.ok && q.save.pinned_by === 'tl' && q.save.pinned_at === NOW, 'déjà épinglé : on ne change ni la date ni la personne');
  const un = pin(U.own, p.save, false); ok(un.ok && !('pinned' in un.save) && !('pinned_at' in un.save) && !('pinned_by' in un.save) && !('pinned_by_name' in un.save), 'désépingler : tout le repère disparaît');
  ok(pin(U.mem, { ...p.save, sender_id: 'own' }, false).error === 'role' && pin(U.mem, p.save, false).ok, 'désépingler : refusé à un simple membre pour le message d\'un autre ; permis à l\'auteur du message');
  ok(pin(U.out, m()).error === 'gone', 'épingler un message qu\'on ne voit pas : introuvable');
}
// ---- arguments absurdes ----
ok(S.planSharedMark(null, m(), G, 'important', true, NOW).error === 'args' && S.planSharedMark(U.adm, null, G, 'important', true, NOW).error === 'args' && S.planSharedMark(U.adm, m(), G, 'autre', true, NOW).error === 'args' && S.planSharedMark(U.adm, { sender_id: 'x' }, G, 'pinned', true, NOW).error === 'args', 'arguments absurdes : « args », jamais de plantage');
ok(S.planSharedMark(U.adm, m({ important_all: undefined }), G, 'pinned', true, NOW).ok && Object.keys(m()).every(k => k in S.planSharedMark(U.adm, m(), G, 'pinned', true, NOW).save), 'le message d\'origine n\'est jamais modifié sur place (copie) et garde tous ses champs');
{ const orig = m(); S.planSharedMark(U.adm, orig, G, 'important', true, NOW); ok(!('important_all' in orig), 'aucune modification de l\'objet d\'entrée'); }
// ---- site = serveur sur 6 000 cas aléatoires ----
{
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const users = [...Object.values(U), null, { id: 'z', role: 'client' }, { role: 'admin' }, { id: 5, role: 'admin' }] as any[];
  const groups = [G, null, { id: 'grp_2', owner_id: 'mem', members: [] }, { owner_id: 3 }, { members: 'x' }] as any[];
  let same = true;
  for (let i = 0; i < 6000; i++) {
    const msg = pick([m(), m({ recipient_id: 'all' }), m({ recipient_id: 'out' }), m({ sender_id: 'own' }), m({ pinned: true, pinned_at: 'a', pinned_by: 'tl' }), m({ important_all: { by: 'tl', by_name: 'x', at: 'a' } }), m({ deleted_at: 'd' }), null, {}, { id: 'q' }, m({ recipient_id: undefined })]);
    const args = [pick(users), msg, pick(groups), pick(['important', 'pinned', 'zzz']), rnd() < 0.5, NOW] as const;
    if (JSON.stringify((S as any).planSharedMark(...args)) !== JSON.stringify((SV as any).planSharedMark(...args))) { same = false; break; }
    if (S.canUseSharedTools(args[0], args[2]) !== SV.canUseSharedTools(args[0], args[2]) || S.canSeeChatMessage(args[0], args[1], args[2]) !== SV.canSeeChatMessage(args[0], args[1], args[2])) { same = false; break; }
  }
  ok(same, 'site = serveur sur 6 000 cas aléatoires (droits, visibilité, résultat complet)');
}
// ---- serveur : la route, la liste blanche ----
const route = apiSrc.slice(apiSrc.indexOf('async function chatMarkRoute'), apiSrc.indexOf('async function checkGroup'));
ok(/action === "chat-mark" && req\.method === "POST"\) return await chatMarkRoute\(req, res, me\)/.test(apiSrc), 'serveur : route chat-mark enregistrée (POST seulement)');
ok(/b\.mark !== 'important' && b\.mark !== 'pinned'/.test(route) && /typeof b\.on !== 'boolean'/.test(route) && /status\(400\)/.test(route), 'serveur : demande vérifiée (400 si le message, le repère ou on/off est absurde)');
ok(/planSharedMark\(me, msg, group, b\.mark, b\.on, now\)/.test(route) && /getGroup\(msg\.recipient_id\)/.test(route) && /msg\.recipient_id\.startsWith\(GROUP_PREFIX\)/.test(route), 'serveur : le message et son groupe viennent de la base, jamais du navigateur');
ok(/404/.test(route) && /409/.test(route) && /403/.test(route), 'serveur : 404 introuvable, 409 supprimé, 403 interdit');
ok(/auditLog\(me, 'chat_mark'/.test(route) && /if \(!plan\.same\)/.test(route), 'serveur : chaque changement est inscrit au journal ; « rien à faire » n\'écrit rien');
const chk = apiSrc.slice(apiSrc.indexOf('async function checkMessage'), apiSrc.indexOf('// « Important pour tous » et épingler le message d\'un autre'));
ok((chk.match(/'important_all'/g) || []).length >= 2 && (chk.match(/'pinned_by'/g) || []).length >= 2, 'serveur : un navigateur ne peut JAMAIS poser ni garder important_all / pinned_by à la création ni à la suppression');
ok(/delete save\.pinned_by; delete save\.pinned_by_name;/.test(chk), 'serveur : quand l\'auteur désépingle, « par qui » disparaît aussi');
// ---- site : repères, listes, menu, store ----
ok(markOf({ id: 'a', important_all: { by: 'x', by_name: 'x', at: 'a' } } as any, []) === 'important' && marksOf({ id: 'a', pinned: true, important_all: { by: 'x', by_name: 'x', at: 'a' } } as any, []).join() === 'important,pinned', 'repères : « pour tous » colore la bulle et compte comme important pour tout le monde');
ok(markedMessages([{ id: 'a', timestamp: '2026-11-10T08:00:00Z', important_all: { by: 'x', by_name: 'x', at: 'a' } }, { id: 'b', timestamp: '2026-11-10T09:00:00Z' }] as any, [], 'important').map(x => x.id).join() === 'a', 'liste « Importants » : reprend aussi ceux posés « pour tous »');
const cv = fs.readFileSync('src/components/ChatView.tsx', 'utf8'), st = fs.readFileSync('src/db/store.ts', 'utf8');
ok(/'Important pour moi'/.test(cv) && /label: menuMsg\.important_all \? 'Retirer « Important pour tous »' : 'Important pour tous'/.test(cv), 'menu : « Important pour moi » (privé) et « Important pour tous »');
ok(/menuMsg\.important_all \? \(menuMsg\.important_all\.by === currentUser\.id \|\| currentUser\.role === 'admin'\) : sharedTools/.test(cv) && /const sharedTools = canUseSharedTools\(currentUser, current\.kind === 'group'/.test(cv), 'menu : « pour tous » seulement pour ceux qui en ont le droit ; retirer : celui qui l\'a posé ou le responsable');
ok(/menuMsg\.sender_id === currentUser\.id \|\| sharedTools/.test(cv) && /db\.togglePinMessage\(menuMsg\.id, currentUser\.id\); else void db\.setChatMark\(menuMsg\.id, 'pinned'/.test(cv), 'menu : épingler = l\'auteur (comme avant, aussi sans réseau) ou les outils « pour tous » (par le serveur)');
ok(/data-important-all/.test(cv) && /data-pinned-by/.test(cv), 'bulle : « Important pour tous · prénom » et « épinglé par prénom »');
ok(/public async setChatMark\(/.test(st) && /this\.api\('chat-mark'/.test(st) && /planSharedMark\(me, msg, group, mark, on/.test(st), 'store : appel du serveur (démo : mêmes règles en local)');
console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
