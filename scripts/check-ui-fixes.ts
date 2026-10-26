// Contrôle des corrections du 2026-10-26 : commentaires visibles dans l'actualité, profil cliquable avec « Message », un seul œil sur les mots de passe, vacation à l'inscription, messagerie sans emoji.
import { readFileSync } from 'node:fs';
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.error('✗', n); } };
const r = (p: string) => readFileSync(p, 'utf8');
const feed = r('src/views/FeedView.tsx'), cv = r('src/components/CVViewerModal.tsx'), app = r('src/App.tsx'), chat = r('src/components/ChatView.tsx'), login = r('src/views/LoginView.tsx'), css = r('src/index.css');
t('actualité : derniers commentaires visibles sans rien ouvrir', feed.includes('PREVIEW_COMMENTS') && /post\.comments\.slice\(-PREVIEW_COMMENTS\)/.test(feed) && /\(open \|\| post\.comments\.length > 0\)/.test(feed));
t('actualité : « Voir les N commentaires »', /Voir les \{post\.comments\.length\} commentaires/.test(feed));
t('actualité : le champ de réponse reste caché tant qu\'on n\'a pas ouvert', /\{open && <div className="flex gap-2">/.test(feed));
t('actualité : le nom du responsable (publication et commentaire) ouvre aussi le profil', (feed.match(/openProfile\(post\.author_id\)/g) || []).length >= 4 && /openProfile\(c\.user_id\)[^>]*>\{c\.role === 'admin'/.test(feed));
t('profil : bouton Message (pas sur son propre profil)', /onMessage && !!me && me\.id !== live\.id/.test(cv) && cv.includes('> Message'));
t('profil : Message ouvre la discussion privée', /onMessage=\{u => \{ setCvModalUser\(null\); setChatThread\(u\.id\); setActiveView\('chat'\); \}\}/.test(app) && /setPickedUsers\(p => \(p\.includes\(t\)/.test(chat));
t('messagerie : plus de réactions emoji', !/EmojiPicker|ReactionChips/.test(chat));
t('login : le bouton « afficher » du navigateur est caché', /input::-ms-reveal/.test(css));
t('login / inscription / oubli : un seul œil par paire de champs', (login.match(/\{eyeBtn\(/g) || []).length === 3);
t('inscription : choix de la vacation Jour / Nuit envoyé au serveur', /role="radiogroup"/.test(login) && /setSgShift\(v\)/.test(login) && /shift: sgShift/.test(login));
console.log(`${ok}/${ok + bad} contrôles OK`);
process.exit(bad ? 1 : 0);
