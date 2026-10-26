// Contrôle des corrections du 2026-10-26 : commentaires visibles dans l'actualité, profil cliquable avec « Message », un seul œil sur les mots de passe, vacation à l'inscription, messagerie sans emoji.
import { readFileSync } from 'node:fs';
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.error('✗', n); } };
const r = (p: string) => readFileSync(p, 'utf8');
const feed = r('src/views/FeedView.tsx'), cv = r('src/components/CVViewerModal.tsx'), app = r('src/App.tsx'), chat = r('src/components/ChatView.tsx'), login = r('src/views/LoginView.tsx'), css = r('src/index.css');
t('actualité : derniers commentaires visibles sans rien ouvrir', feed.includes('PREVIEW_COMMENTS') && /tops\.slice\(-PREVIEW_COMMENTS\)/.test(feed) && /\(open \|\| post\.comments\.length > 0\)/.test(feed));
t('actualité : « Voir les N commentaires »', /Voir les \{post\.comments\.length\} commentaires/.test(feed));
t('actualité : le champ de réponse reste caché tant qu\'on n\'a pas ouvert', /\{open && <div className="flex gap-2">/.test(feed));
t('actualité : le nom du responsable (publication et commentaire) ouvre aussi le profil', (feed.match(/openProfile\(post\.author_id\)/g) || []).length >= 4 && /openProfile\(c\.user_id\)[^>]*>\{c\.role === 'admin'/.test(feed));
t('profil : bouton Message (pas sur son propre profil)', /onMessage && !!me && me\.id !== live\.id/.test(cv) && cv.includes('> Message'));
t('profil : Message ouvre la discussion privée', /onMessage=\{u => \{ setCvModalUser\(null\); setChatThread\(u\.id\); setActiveView\('chat'\); \}\}/.test(app) && /setPickedUsers\(p => \(p\.includes\(t\)/.test(chat));
t('messagerie : plus de réactions emoji', !/EmojiPicker|ReactionChips/.test(chat));
t('login : le bouton « afficher » du navigateur est caché', /input::-ms-reveal/.test(css));
t('login / inscription / oubli : un seul œil par paire de champs', (login.match(/\{eyeBtn\(/g) || []).length === 3);
t('inscription : choix de la vacation Jour / Nuit envoyé au serveur', /role="radiogroup"/.test(login) && /setSgShift\(v\)/.test(login) && /shift: sgShift/.test(login));
// Réponses aux commentaires (comme Facebook, 2 niveaux)
const api = r('supabase/functions/df-api/index.ts'), store = r('src/db/store.ts'), types = r('src/types/index.ts');
const na = api.slice(api.indexOf('async function newsAction'), api.indexOf('async function newsAction') + 4200);
t('réponses : champs parent_id et reply_to_name', /parent_id\?: string/.test(types) && /reply_to_name\?: string/.test(types));
t('réponses : le serveur range une réponse à une réponse sous le commentaire de premier niveau', /target\.parent_id \? d\.comments\.find\(\(x: any\) => x\.id === target\.parent_id\) \|\| target : target/.test(na));
t('réponses : commentaire introuvable = refus', /Le commentaire auquel tu réponds n.{1,2}existe plus/.test(na));
t('réponses : le nom cité est nettoyé et limité à 80', /replyToName \?\? ''\)\.replace\([^)]*\)\.trim\(\)\.slice\(0, 80\)/.test(na));
t('réponses : supprimer un commentaire supprime ses réponses (serveur et démo)', /x\.id !== commentId && x\.parent_id !== commentId/.test(na) && /c\.id !== body\.commentId && c\.parent_id !== body\.commentId/.test(store));
t('réponses : le site envoie parentId et affiche « Répondre »', /parentId: reply\.parentId/.test(store) && feed.includes('>Répondre</button>') && /Réponse à <b>\{reply\.name\}/.test(feed));
t('réponses : décalées sous leur commentaire', /ml-10/.test(feed) && /replies\.map\(r => renderComment\(r, true\)\)/.test(feed));
t('réponses : repliées par défaut, un bouton Afficher / Masquer par commentaire', feed.includes('useState<Set<string>>(new Set())') && feed.includes('shownReplies.has(c.id) && replies.map(r => renderComment(r, true))') && feed.includes('Masquer les réponses') && feed.includes('`Afficher ${replies.length}'));
t('réponses : « Répondre » prend le curseur dans le geste du doigt (clavier du téléphone)', /flushSync\(\(\) => \{ setReply\(/.test(feed) && /el\.focus\(\{ preventScroll: true \}\)/.test(feed) && /enterKeyHint="send"/.test(feed));
t('réponses : le commentaire cité s\'affiche au-dessus du champ', /reply\.excerpt/.test(feed) && /Réponse à <b>\{reply\.name\}/.test(feed));
t('réponses : sa propre réponse est dépliée après l\'envoi', /setShownReplies\(prev => new Set\(prev\)\.add\(reply\.parentId\)\)/.test(feed));
// Albums de photos (comme WhatsApp)
t('photos : on peut choisir plusieurs photos à la fois', /type="file" multiple/.test(chat) && /Array\.from\(e\.target\.files/.test(chat));
t('photos : un album = un album_id commun, envoyé photo par photo', /album_id\?: string/.test(types) && /album_id: String\(params\.albumId\)/.test(store) && /albumId = files\.length > 1/.test(chat));
t('photos : citation sur la 1re photo, texte sur la dernière', /noText: i < files\.length - 1, noReply: i > 0/.test(chat));
t('photos : grille de 4 cases au plus, la 4e floue avec « +N »', /album\.slice\(0, 4\)/.test(chat) && /blur-\[3px\]/.test(chat) && /\+\{album\.length - 4\}/.test(chat));
t('photos : les photos suivantes d\'un album ne font pas de bulle à part', /prevM\.album_id === msg\.album_id && prevM\.sender_id === msg\.sender_id\) return null/.test(chat));
console.log(`${ok}/${ok + bad} contrôles OK`);
process.exit(bad ? 1 : 0);
