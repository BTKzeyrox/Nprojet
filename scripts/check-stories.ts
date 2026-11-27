// Stories (24 h) : règles du site et du serveur, réglage « qui peut publier », écrans. Lancer : npm run check:stories
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { groupStories, firstUnseen, STORY_BG, type StoryItem } from '../src/utils/stories';
import { canPostStory } from '../src/utils/newsAccess';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const rd = (p: string) => readFileSync(p, 'utf8');

const mk = (id: string, a: string, at: string, seen = false): StoryItem => ({ id, author_id: a, author_name: a, author_role: 'employee', kind: 'text', text: 'x', bg: STORY_BG[0], file: null, created_at: at, expires_at: '2999-01-01T00:00:00Z', seen });
const g = groupStories([mk('1', 'b', '2026-11-27T08:00:00Z', true), mk('2', 'a', '2026-11-27T09:00:00Z'), mk('3', 'me', '2026-11-27T07:00:00Z', true), mk('4', 'a', '2026-11-27T10:00:00Z'), mk('5', 'c', '2026-11-27T11:00:00Z')], 'me');
ok(g.map(x => x.author_id).join() === 'me,c,a,b', 'rangée : mes stories, puis les nouveautés (la plus récente d\'abord), puis les déjà vues');
ok(g[2].stories.map(s => s.id).join() === '2,4', 'dans un groupe : de la plus ancienne à la plus récente');
ok(firstUnseen(g[2]) === 0 && firstUnseen(g[3]) === 0 && firstUnseen({ ...g[2], stories: [{ ...g[2].stories[0], seen: true }, g[2].stories[1]] }) === 1, 'on commence à la première story pas vue');

// Serveur : on charge les vraies fonctions du serveur
const src = rd('supabase/functions/df-api/index.ts');
const m = src.match(/\/\/ ===== BEGIN NEWSACCESS[^\n]*\n([\s\S]*?)\/\/ ===== END NEWSACCESS =====/);
const sv = src.match(/const storyView = [\s\S]*?\n};\n/);
if (!m || !sv) throw new Error('blocs serveur introuvables');
new Function(transformSync(m[1] + '\n' + sv[0] + '\n;globalThis.__s = { storyView, canPostStory };', { loader: 'ts' }).code)();
const S = (globalThis as any).__s;
const base = { id: 's1', author_id: 'u1', author_name: 'A', author_role: 'employee', kind: 'text', text: 'hi', bg: '#000', created_at: '2026-11-27T08:00:00Z', expires_at: '2999-01-01T00:00:00Z', viewers: { v1: { name: 'V', at: '2026-11-27T09:00:00Z' } } };
const view = (d: any, me: any) => S.storyView(d, me);
ok(view(base, { id: 'v1', role: 'employee' }) && !('viewers' in view(base, { id: 'v1', role: 'employee' })), 'serveur : un simple spectateur ne voit PAS la liste des vues');
ok(view(base, { id: 'u1', role: 'employee' })?.viewers?.length === 1 && view(base, { id: 'u1', role: 'employee' }).seen === true, 'serveur : l\'auteur voit la liste des vues');
ok(view(base, { id: 'a', role: 'admin' })?.viewers?.length === 1, 'serveur : le responsable voit la liste des vues');
ok(view({ ...base, expires_at: '2000-01-01T00:00:00Z' }, { id: 'u1', role: 'employee' }) === null, 'serveur : une story de plus de 24 h n\'est plus renvoyée');
ok(view({ ...base, audience: ['accountant'] }, { id: 'v2', role: 'employee' }) === null && !!view({ ...base, audience: ['accountant'] }, { id: 'v3', role: 'accountant' }), 'serveur : « Visible par » respecté (un autre rôle ne la voit pas)');
ok(!!view({ ...base, audience: ['accountant'] }, { id: 'a', role: 'admin' }) && !!view({ ...base, audience: ['accountant'] }, { id: 'u1', role: 'employee' }), 'serveur : le responsable et l\'auteur la voient toujours');
ok(view(base, { id: 'v1', role: 'employee' })?.seen === true && view({ ...base, viewers: {} }, { id: 'v1', role: 'employee' })?.seen === false, 'serveur : « vue » ou « pas vue » pour moi');
ok(S.canPostStory({ id: 'e', role: 'employee' }, undefined) === false && canPostStory({ id: 'e', role: 'employee' }, undefined) === false, 'story : par défaut seul le responsable publie (site et serveur)');
ok(S.canPostStory({ id: 'e', role: 'employee' }, { story: { users: ['e'] } }) === true && canPostStory({ id: 'e', role: 'employee' }, { story: { users: ['e'] } }) === true, 'story : une personne choisie peut publier (site et serveur)');

// Serveur : routes et protections
ok(/action === "story-list" && req\.method === "GET"/.test(src) && /action === "story-create" && req\.method === "POST"/.test(src) && /action === "story-seen"/.test(src) && /action === "story-delete"/.test(src), 'serveur : les 4 routes story-*');
ok(/async function storyCreate[\s\S]*?canPostStory\(me, await newsPolicy\(\)\)[\s\S]*?403/.test(src), 'serveur : création refusée sans le droit');
ok(/async function storyCreate[\s\S]*?cleanFiles\(b\.files, me\.id\)/.test(src), 'serveur : la photo doit être un fichier envoyé par la personne elle-même');
ok(/async function storyDelete[\s\S]*?d\.author_id !== me\.id && me\.role !== 'admin'[\s\S]*?403/.test(src), 'serveur : seul l\'auteur ou le responsable supprime');
ok(/async function storyPurge[\s\S]*?dropFiles[\s\S]*?\.delete\(\)\.in\('id'/.test(src) && /await storyPurge\(\)/.test(src), 'serveur : les stories de plus de 24 h et leurs photos sont supprimées');
ok(/STORY_MAX_ACTIVE = 10/.test(src) && /\(count \|\| 0\) >= STORY_MAX_ACTIVE/.test(src), 'serveur : 10 stories actives au plus par personne (pas de doublon sans fin)');
ok(/const STORY_BG = \[([^\]]*)\]/.exec(src)?.[1].replace(/['"\s]/g, '') === STORY_BG.join(','), 'palette de fonds : identique sur le site et le serveur');
const mig = rd('supabase/migrations/20261127_create_df_stories.sql');
ok(/create table if not exists public\.df_stories/.test(mig) && /enable row level security/.test(mig) && /revoke all on public\.df_stories from anon, authenticated/.test(mig), 'migration : table df_stories fermée au public');

// Écrans
const ui = rd('src/components/Stories.tsx'), feed = rd('src/views/FeedView.tsx'), set = rd('src/components/NewsPublishSettings.tsx');
ok(/<StoriesBar me=\{currentUser\}/.test(feed), 'Actualités : la rangée de stories est en haut');
ok(/data-story-viewer/.test(ui) && /data-story-bars/.test(ui) && /data-story-views/.test(ui) && /data-story-viewers/.test(ui), 'lecteur : barres de progression, nombre de vues, liste des vues');
ok(/Escape/.test(ui) && /clientY - d\.y > 90/.test(ui) && /< 250/.test(ui), 'lecteur : Échap, glisser vers le bas pour fermer, toucher à gauche / droite');
ok(/setHeld\(true\)/.test(ui) && /paused = held \|\| panel/.test(ui), 'lecteur : on maintient le doigt = pause');
ok(/data-story-mode="photo"/.test(ui) && /data-story-mode="text"/.test(ui) && /STORY_BG\.map/.test(ui) && /AudiencePicker/.test(ui), 'création : photo ou texte sur fond de couleur, avec « Visible par »');
ok(/data-story-who/.test(set) && /testId="story"/.test(set) && /data-news-users/.test(set), 'réglages : « Qui peut publier une story » et « Personnes choisies »');
ok(/prefers-reduced-motion/.test(rd('src/index.css')) && /df-story-bar/.test(rd('src/index.css')) && !/onAnimationEnd/.test(ui), 'minuteur en JavaScript : le mode « réduire les animations » ne fait pas sauter les stories');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
