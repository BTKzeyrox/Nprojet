// Sondage dans les Actualités (étape C2) : règles, vue selon la personne (anonymat), copie serveur identique, routes, écran, assistant.
import { readFileSync } from 'node:fs';
import { pollClean, pollCounts, pollApplyVote, pollView, POLL_MAX_OPTIONS, POLL_MAX_VOTES } from '../src/utils/pollRules';
import { parsePollIntent, pollPreview, decodePoll, pollDone, POLL_OK_PREFIX, POLL_NO } from '../src/utils/assistantPublish';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const block = (s: string) => { const a = s.indexOf('// ===== BEGIN POLL'), b = s.indexOf('// ===== END POLL ====='); return a < 0 || b < 0 ? '' : s.slice(s.indexOf('\n', a) + 1, b); };

// règles
const P = pollClean({ question: ' Quel jour ? ', options: ['Lundi', 'mardi', ' LUNDI ', '', 'Mercredi'] });
ok(!!P && P.question === 'Quel jour ?' && P.options.map(o => o.text).join('|') === 'Lundi|mardi|Mercredi' && P.options.map(o => o.id).join() === 'o1,o2,o3' && !P.closed && Object.keys(P.votes).length === 0, 'sondage valable : question nettoyée, doublons et vides retirés, numéros o1…, aucun vote');
ok(pollClean({ question: 'Q', options: ['a'] }) === null && pollClean({ question: '', options: ['a', 'b'] }) === null && pollClean({ question: 'Q', options: ['a', 'A'] }) === null && pollClean(null) === null && pollClean('x') === null && pollClean({ question: 'Q' }) === null, 'refusé : un seul choix, question vide, deux choix identiques, rien');
ok(pollClean({ question: 'Q', options: Array.from({ length: 12 }, (_, i) => 'c' + i) })!.options.length === POLL_MAX_OPTIONS && pollClean({ question: 'x'.repeat(500), options: ['a', 'b'] })!.question.length === 200 && pollClean({ question: 'Q', options: ['y'.repeat(300), 'b'] })!.options[0].text.length === 100, '6 choix, question 200 et choix 100 caractères au plus');
ok(pollClean({ question: 'Q', options: ['a', 'b'], votes: { u1: 'o1' }, closed: true })!.closed === false && Object.keys(pollClean({ question: 'Q', options: ['a', 'b'], votes: { u1: 'o1' } })!.votes).length === 0, 'les votes et la clôture envoyés par un navigateur ne sont jamais repris');
ok(pollClean({ question: 'Q', options: [{ text: 'a' }, { text: 'b' }] })!.options.length === 2, 'choix donnés sous forme { text }');

// votes
let p = P!;
let r = pollApplyVote(p, 'u1', 'o1'); ok(r.ok && r.poll.votes.u1 === 'o1', 'voter : le vote est pris');
p = (r as { poll: typeof p }).poll;
r = pollApplyVote(p, 'u1', 'o2'); ok(r.ok && r.poll.votes.u1 === 'o2' && Object.keys(r.poll.votes).length === 1, 'voter pour un autre choix : le vote est remplacé (un vote par personne)');
p = (r as { poll: typeof p }).poll;
r = pollApplyVote(p, 'u1', 'o2'); ok(r.ok && !('u1' in r.poll.votes), 'voter encore pour le même choix : le vote est retiré');
ok(!pollApplyVote(p, 'u1', 'o9').ok && pollApplyVote(p, 'u1', 'o9').ok === false, 'choix inconnu : refusé');
ok(pollApplyVote({ ...p, closed: true }, 'u2', 'o1').ok === false && (pollApplyVote({ ...p, closed: true }, 'u2', 'o1') as { error: string }).error === 'Ce sondage est clos.', 'sondage clos : plus de vote');
const big: Record<string, string> = {}; for (let i = 0; i < POLL_MAX_VOTES; i++) big['u' + i] = 'o1';
ok(!pollApplyVote({ ...p, votes: big }, 'nouveau', 'o1').ok && pollApplyVote({ ...p, votes: big }, 'u1', 'o2').ok, `${POLL_MAX_VOTES} votes au plus ; quelqu'un qui a déjà voté peut encore changer`);
let q = P!; for (const [u, o] of [['a', 'o1'], ['b', 'o1'], ['c', 'o2'], ['d', 'o9']] as const) q = { ...q, votes: { ...q.votes, [u]: o } };
ok(JSON.stringify(pollCounts(q)) === JSON.stringify({ o1: 2, o2: 1, o3: 0 }), 'comptes par choix (un vote pour un choix disparu ne compte pas)');

// anonymat
const vAdmin = pollView(q, 'a', true) as any, vOther = pollView(q, 'c', false) as any, vNone = pollView(q, 'zzz', false) as any;
ok(vAdmin.votes && vAdmin.votes.a === 'o1' && vAdmin.counts.o1 === 2, 'responsable : voit qui a voté quoi + les comptes');
ok(!('votes' in vOther) && vOther.my === 'o2' && vOther.counts.o1 === 2 && !JSON.stringify(vOther).includes('"a"') && !JSON.stringify(vOther).includes('"b"'), 'employé : comptes et SON vote seulement, jamais les autres noms');
ok(!('my' in vNone) && !('votes' in vNone), 'quelqu\'un qui n\'a pas voté : pas de vote affiché');

// copie serveur
const rules = readFileSync('src/utils/pollRules.ts', 'utf8'), srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(block(rules).length > 800 && block(rules) === block(srv), 'la copie des règles dans df-api est IDENTIQUE à utils/pollRules.ts');
ok(/const viewNews = \(d: any, me: any\): any => \(d && d\.poll \? \{ \.\.\.d, poll: pollView\(d\.poll, String\(me\?\.id \|\| ''\), me\?\.role === 'admin'\) \} : d\)/.test(srv), 'serveur : viewNews filtre le sondage selon la personne');
ok((srv.match(/news: viewNews\(d, me\)/g) || []).length === 4 && !/res\.json\(\{ ok: true, news: d \}\)/.test(srv), 'serveur : toutes les réponses « publication » passent par viewNews');
ok(/if \(col === 'news' && !admin\) recs = recs\.map\(\(r: any\) => viewNews\(r, me\)\)/.test(srv), 'serveur : la synchro filtre aussi (un employé ne reçoit jamais la liste des votants)');
ok(/action === "news-vote" && req\.method === "POST"\) return await newsAction\('vote'/.test(srv) && /action === "news-poll-close" && req\.method === "POST"\) return await newsAction\('poll-close'/.test(srv) && /ONCE_ROUTES: readonly string\[\] = \['news-vote'/.test(srv) && /if \(action === "news-vote"\) return await newsAction\('vote'/.test(srv), 'serveur : routes vote (une seule fois par appel) et clôture');
ok(/kind === 'poll-close' && me\.role !== 'admin'\) return res\.status\(403\)/.test(srv) && /d\.poll = \{ \.\.\.d\.poll, closed: closed === true \}/.test(srv), 'serveur : seul le responsable clôt');
ok(/if \(!canSeeNews\(d, me\)\) return res\.status\(404\)[\s\S]{0,300}kind === 'vote' \|\| kind === 'poll-close'/.test(srv), 'serveur : on ne vote que sur une publication qu\'on peut voir');
ok(/\.\.\.\(existing \? \(existing\.poll \? \{ poll: existing\.poll \} : \{\}\) : \(pollClean\(rec\.poll\) \? \{ poll: pollClean\(rec\.poll\) \} : \{\}\)\)/.test(srv), 'serveur : sondage créé une fois (votes remis à zéro) ; une modification ne touche jamais aux votes');
ok(/const voted = !!\(d\.poll && d\.poll\.votes && uid in d\.poll\.votes\)/.test(srv) && /\.\.\.\(voted \? \{ poll: \{ \.\.\.d\.poll, votes: Object\.fromEntries/.test(srv), 'serveur : un compte supprimé emporte ses votes');

// écran + magasin + assistant
const feed = readFileSync('src/views/FeedView.tsx', 'utf8'), blk = readFileSync('src/components/PollBlock.tsx', 'utf8'), store = readFileSync('src/db/store.ts', 'utf8'), chat = readFileSync('src/components/AssistantChat.tsx', 'utf8');
ok(/<PollBlock post=\{post\}/.test(feed) && /db\.voteNews\(post\.id, optionId\)/.test(feed) && /db\.closePollNews\(post\.id, !post\.poll\?\.closed\)/.test(feed) && /Clore le sondage/.test(feed) && /isAdmin && published && post\.poll/.test(feed), 'fil : le sondage s\'affiche, on vote, le responsable le clôt / rouvre');
ok(/data-poll-who/.test(blk) && /isAdmin && total > 0/.test(blk) && /isAdmin && who/.test(blk) && /min-h-\[44px\]/.test(blk) && /Sondage clos/.test(blk) && /disabled=\{!canVote \|\| busy\}/.test(blk), 'écran : « qui a voté » réservé au responsable, choix de 44 px, clos = non cliquable');
ok(/public voteNews\(id: string, option: string\) \{ return this\.newsCall\('news-vote'/.test(store) && /public closePollNews/.test(store) && /case 'news-vote'/.test(store) && /case 'news-poll-close'/.test(store) && /pollClean\(p\.poll\)/.test(store), 'magasin : publier un sondage, voter, clore, faux serveur de démo');
ok(/parsePollIntent\(q\)/.test(chat) && /pollPreview\(poll\)/.test(chat) && /pollIncomplete\(\)/.test(chat) && /decodePoll\(g\.view\)/.test(chat) && /text: dp\.question, poll: \{ question: dp\.question, options: dp\.options \}/.test(chat) && /g\.view === POLL_NO/.test(chat) && /g\.view === 'feed'\) onNavigate/.test(chat), 'assistant : sondage → aperçu ; Confirmer → publication avec sondage ; Annuler → rien');

// assistant : phrases
const S = (t: string) => parsePollIntent(t);
let a = S('Sondage : Quel jour pour la réunion ? lundi, mardi, mercredi') as any;
ok(a && a.question === 'Quel jour pour la réunion ?' && a.options.join('|') === 'lundi|mardi|mercredi' && !a.yesNo, 'sondage : question ? choix, choix, choix');
a = S('crée un sondage : Quel jour ? lundi ou mardi ou mercredi') as any; ok(a && a.options.length === 3, '« ou » sépare aussi les choix');
a = S('Sondage : Jour de la réunion : lundi; mardi\n- mercredi') as any; ok(a && a.question === 'Jour de la réunion' && a.options.join('|') === 'lundi|mardi|mercredi', 'question : choix ; virgule, point-virgule ou ligne');
a = S('sondage : Faut-il ouvrir samedi ?') as any; ok(a && a.yesNo && a.options.join('|') === 'Oui|Non', 'sans choix mais avec « ? » : Oui / Non (dit dans l\'aperçu)');
ok(S('sondage : Quel jour pour la réunion ?') === 'incomplete' && S('sondage : Combien de jours ?') === 'incomplete' && S('sondage : jour de réunion') === 'incomplete' && S('sondage : Quel jour ? lundi') === 'incomplete' && S('sondage : ') === null, 'question sans choix ou un seul choix : il demande ce qui manque');
ok(S('poll: Which day? Monday, Tuesday') !== null && (S('poll: Which day? Monday, Tuesday') as any).options.length === 2, 'anglais : poll: …');
ok(S('sondage') === null && S('mes sondages') === null && S('quel est le résultat du sondage ?') === null && S('publie : fermé lundi') === null && S('') === null, 'les autres phrases ne sont pas prises pour un sondage');
const pv = pollPreview(a);
ok(pv.intent === 'poll_preview' && pv.actions.length === 2 && pv.actions[0].go.view.startsWith(POLL_OK_PREFIX) && pv.actions[1].go.view === POLL_NO && /Rien n'est publié tant que tu n'as pas confirmé/.test(pv.lines.map(l => l.fr).join(' ')) && /toi seul vois qui a voté/.test(pv.lines.map(l => l.fr).join(' ')), 'aperçu : question, choix, anonymat expliqué, Confirmer / Annuler');
const back = decodePoll(pv.actions[0].go.view);
ok(!!back && back.question === a.question && back.options.join() === a.options.join() && decodePoll(POLL_OK_PREFIX + 'xx') === null && decodePoll(POLL_OK_PREFIX + encodeURIComponent('{"q":"Q","o":["a"]}')) === null, 'Confirmer redonne le sondage ; bouton abîmé ou 1 seul choix refusé');
ok(pollDone(true).intent === 'poll_done' && pollDone(false, 'x').intent === 'poll_error', '« Le sondage est publié » seulement si ça a marché');
console.log(`\n${bad ? bad + ' ÉCHEC(S)' : 'tout est bon'}`);
process.exit(bad ? 1 : 0);
