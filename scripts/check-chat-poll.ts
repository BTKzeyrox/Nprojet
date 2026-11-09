// Messagerie : sondage, choix de date et « J'ai lu » dans les discussions et groupes (S1, 2026-11-09). Règles du stockage (vote, retrait, comptes sans noms) + câblage (menu « + », serveur).
// Lancer : npm run check:chat-poll
import { readFileSync } from 'node:fs';
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });
const { AppStore } = await import('../src/db/store');
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };

const st: any = new AppStore();
st.users = [{ id: 'a', name: 'Auteur', username: 'a', role: 'admin' }, { id: 'b', name: 'Bob', username: 'b', role: 'employee' }];
st.messages = [];
st.sendMessage({ senderId: 'a', message: '', recipientId: 'all', poll: { question: 'On y va ?', options: ['Oui', 'Non'] } });
st.sendMessage({ senderId: 'a', message: '', recipientId: 'all', poll: { question: 'Quel jour ?', options: ['lundi', 'mardi', 'jeudi'], kind: 'date' } });
st.sendMessage({ senderId: 'a', message: '', recipientId: 'all', poll: { question: 'Nouvelle consigne', options: [], kind: 'ack' } });
st.sendMessage({ senderId: 'a', message: '', recipientId: 'all', poll: { question: 'X', options: ['seul'] } });
st.sendMessage({ senderId: 'a', message: '', recipientId: 'all', poll: { question: 'X', options: ['pareil', 'pareil'] } });
const [mp, md, ma] = st.messages as any[];
ok(st.messages.length === 3, 'un sondage à 1 choix ou à choix identiques est refusé');
ok(mp.message.startsWith('📊') && md.message.startsWith('📅') && ma.message.startsWith('👁'), 'le texte du message porte le bon symbole');
ok(ma.poll.options.length === 1 && ma.poll.kind === 'ack', '« J\'ai lu » : un seul bouton');

// sondage simple, côté auteur (il voit tout)
const o1 = mp.poll.options[0].id, o2 = mp.poll.options[1].id;
ok(st.voteMessage(mp.id, 'a', o1).success && mp.poll.votes.a === o1 || (mp.poll.votes.a || [])[0] === o1, 'auteur : vote enregistré');
st.voteMessage(mp.id, 'a', o2);
ok(JSON.stringify([].concat(mp.poll.votes.a)) === JSON.stringify([o2]), 'auteur : un autre choix remplace');
st.voteMessage(mp.id, 'a', o2);
ok([].concat(mp.poll.votes.a).length === 0, 'auteur : même choix = retrait, envoyé comme liste vide (le serveur sait retirer)');

// participant : vue sans noms (comme le serveur l'envoie)
const view = { ...mp, poll: { question: mp.poll.question, options: mp.poll.options, closed: false, counts: { [o1]: 2, [o2]: 1 } } };
st.messages = [view];
ok(st.voteMessage(view.id, 'b', o1).success, 'participant : vote');
ok(view.poll.my === o1 && view.poll.counts[o1] === 3 && view.poll.counts[o2] === 1, 'participant : son vote + comptes mis à jour');
st.voteMessage(view.id, 'b', o2);
ok(view.poll.my === o2 && view.poll.counts[o1] === 2 && view.poll.counts[o2] === 2, 'participant : changer déplace sa voix');
st.voteMessage(view.id, 'b', o2);
ok(view.poll.my === undefined && view.poll.counts[o2] === 1 && Array.isArray(view.poll.votes.b) && view.poll.votes.b.length === 0, 'participant : retrait (liste vide envoyée)');
ok(!('a' in (view.poll.votes || {})), 'participant : ne garde jamais les noms des autres');

// choix de date : plusieurs dates
const dv = { ...md, poll: { question: md.poll.question, kind: 'date', options: md.poll.options, closed: false, counts: {} } };
st.messages = [dv];
const [d1, d2] = dv.poll.options.map((o: any) => o.id);
st.voteMessage(dv.id, 'b', d1); st.voteMessage(dv.id, 'b', d2);
ok(Array.isArray(dv.poll.my) && dv.poll.my.length === 2 && dv.poll.counts[d1] === 1 && dv.poll.counts[d2] === 1, 'dates : on peut en choisir plusieurs');
st.voteMessage(dv.id, 'b', d1);
ok(dv.poll.my.join() === d2 && dv.poll.counts[d1] === 0, 'dates : retoucher une date la retire');

// sondage clos
const cv = { ...mp, sender_id: 'a', poll: { ...mp.poll, votes: {}, closed: false } };
st.messages = [cv];
ok(!st.setMessagePollClosed(cv.id, 'b', true).success, 'un participant ne clôt pas le sondage d\'un autre');
ok(st.setMessagePollClosed(cv.id, 'a', true).success && !st.voteMessage(cv.id, 'b', o1).success, 'clos par l\'auteur : plus de vote');
ok(st.setMessagePollClosed(cv.id, 'a', false).success && st.voteMessage(cv.id, 'b', o1).success, 'rouvert : on vote de nouveau');

// ---- câblage ----
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/col === 'messages'\) recs = recs\.map\(\(r: any\) => \(r\.poll && r\.sender_id !== me\.id \? \{ \.\.\.r, poll: pollView\(r\.poll, String\(me\.id\), false\)/.test(srv), 'serveur : seul l\'auteur reçoit les noms des votants');
ok(/Sondage de la discussion[\s\S]{0,1500}pollPicks\(want\)[\s\S]{0,600}POLL_MAX_VOTES/.test(srv), 'serveur : vote relu et limité (choix connus, un seul pour un sondage simple, 2000 votes)');
ok(/if \(existing\.sender_id !== me\.id && !admin\) return \{ ok: false \};\s*next\.closed/.test(srv), 'serveur : clôture seulement par l\'auteur ou le responsable');
const view2 = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/data-chat-plus-menu/.test(view2) && ['file', 'poll', 'date', 'ack'].every(k => view2.includes(`'${k}'`)), 'écran : menu « + » avec Importer, Sondage, Choix de date, « J\'ai lu »');
ok(!/Joindre une photo ou un fichier \(10 Mo max\)/.test(view2) || /fileRef\.current\?\.click\(\)/.test(view2), 'écran : l\'import de fichier existe toujours');
ok(/e\.key === 'Escape'\) setPlusOpen\(false\)/.test(view2), 'écran : Échap ferme le menu');
console.log(`\n${n - fails}/${n} contrôles OK`);
process.exit(fails ? 1 : 0);
