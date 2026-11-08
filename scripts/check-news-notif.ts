// Cloche de notifications : publications (Actualités). Sans serveur : le store est remplacé par une liste de publications d'essai.
import { readFileSync } from 'node:fs';
const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
(globalThis as any).window = (globalThis as any).window || { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const { db } = await import('../src/db/store');
const N = await import('../src/utils/notifications');

const H = 3600000, now = Date.now(), iso = (ago: number) => new Date(now - ago).toISOString();
const u = (id: string, role: string) => ({ id, role, name: id, status: 'active' } as any);
const adm = u('adm', 'admin'), u1 = u('u1', 'employee'), u2 = u('u2', 'team_lead'), u3 = u('u3', 'accountant');
const cm = (id: string, user: string, parent: string | undefined, ago: number) => ({ id, user_id: user, user_name: user, role: 'employee', text: 'x', ...(parent ? { parent_id: parent } : {}), created_at: iso(ago) });
const post = (o: any) => ({ title: '', text: 'Texte', pinned: false, loves: [], comments: [], shares: 0, ...o });
const posts: any[] = [
  post({ id: 'P1', author_id: 'adm', author_name: 'Direction', title: 'Réunion lundi', created_at: iso(1 * H) }),
  post({ id: 'P2', author_id: 'adm', author_name: 'Direction', created_at: iso(10 * 24 * H) }),
  post({ id: 'P3', author_id: 'u2', author_name: 'Chef', status: 'pending', submitted_at: iso(30 * 24 * H), created_at: iso(30 * 24 * H) }),
  post({ id: 'P4', author_id: 'u1', author_name: 'Opérateur', status: 'rejected', reject_reason: 'Hors sujet', submitted_at: iso(2 * H), created_at: iso(2 * H) }),
  post({ id: 'P5', author_id: 'u1', author_name: 'Opérateur', status: 'published', submitted_at: iso(3 * H), created_at: iso(1 * H) }),
  post({ id: 'P6', author_id: 'u1', author_name: 'Opérateur', status: 'published', submitted_at: iso(5 * H), created_at: iso(5 * H) }),
  post({ id: 'P7', author_id: 'u1', author_name: 'Opérateur', status: 'published', created_at: iso(2 * 24 * H), comments: [
    cm('c1', 'u2', undefined, 5 * H), cm('c2', 'u1', undefined, 4 * H), cm('c3', 'u3', 'c1', 3 * H), cm('c4', 'u2', 'c2', 2 * H), cm('c5', 'u3', undefined, 9 * 24 * H),
  ] }),
];
(db as any).getNews = () => posts;
const ids = (l: { id: string }[]) => l.map(x => x.id).sort();
const has = (l: { id: string }[], prefix: string) => l.some(x => x.id.startsWith(prefix));

// ---- le responsable ----
const A = N.newsNotifications(adm, now);
ok(has(A, 'newsp-P3'), 'responsable : une publication en attente (même ancienne) = « à valider »');
ok(!has(A, 'news-P1') && !has(A, 'news-P2'), 'responsable : jamais pour ses propres publications ni pour une publication vieille de plus de 7 jours');
ok(!has(A, 'newsr-') && !has(A, 'newsok-'), 'responsable : pas de « validée / refusée » (c\'est lui qui décide)');
ok(A.find(x => x.id.startsWith('newsp-P3'))!.tone === 'urgent' && A.find(x => x.id.startsWith('newsp-P3'))!.view === 'feed' && A.find(x => x.id.startsWith('newsp-P3'))!.nav === 'news:P3', 'à valider : urgent, ouvre la publication exacte dans les Actualités');
ok(has(A, 'news-P7') && has(A, 'news-P5') && has(A, 'news-P6') && !has(A, 'newsc-'), 'responsable : les publications des employés sont signalées ; « a commenté ta publication » seulement pour l\'auteur');

// ---- un opérateur (auteur de P4, P5, P6, P7) ----
const B = N.newsNotifications(u1, now);
ok(has(B, 'news-P1'), 'opérateur : nouvelle publication du responsable (moins de 7 jours)');
ok(!has(B, 'news-P2'), 'opérateur : une publication de plus de 7 jours n\'est plus signalée');
ok(!has(B, 'news-P5') && !has(B, 'news-P6') && !has(B, 'news-P7'), 'opérateur : jamais « nouvelle publication » pour ses propres publications');
ok(!has(B, 'newsp-'), 'opérateur : « à valider » est réservé au responsable');
const rej = B.find(x => x.id.startsWith('newsr-P4'));
ok(!!rej && rej.sub === 'Motif : Hors sujet' && rej.tone === 'bad' && rej.title === 'Publication refusée', 'auteur : publication refusée, avec le motif');
const val = B.find(x => x.id.startsWith('newsok-P5'));
ok(!!val && val.tone === 'ok' && val.title === 'Publication validée', 'auteur : publication validée (la validation a remis la date à « maintenant »)');
ok(!has(B, 'newsok-P6'), 'auteur : publiée directement (pas de validation) = pas de « validée »');
ok(has(B, 'newsc-c1') && has(B, 'newsc-c3'), 'auteur : commentaires des autres sur sa publication');
ok(!has(B, 'newsc-c2'), 'auteur : jamais pour son propre commentaire');
ok(has(B, 'newsrp-c4') && !has(B, 'newsc-c4'), 'réponse à MON commentaire : « a répondu à ton commentaire » seulement (pas en double avec « a commenté »)');
ok(!has(B, 'newsc-c5') && !has(B, 'newsrp-c5'), 'un commentaire de plus de 7 jours n\'est plus signalé');

// ---- une autre personne : réponse reçue, pas la publication des autres ----
const C = N.newsNotifications(u2, now);
ok(has(C, 'newsrp-c3'), 'réponse reçue : la personne dont on répond au commentaire est prévenue');
ok(!has(C, 'newsc-') , 'une personne qui n\'est pas l\'auteur ne reçoit pas « a commenté ta publication »');
ok(!has(C, 'newsr-') && !has(C, 'newsok-'), 'seul l\'auteur reçoit validée / refusée');
ok(has(C, 'news-P1') && has(C, 'news-P4') === false && has(C, 'news-P5'), 'nouvelle publication (publiée) : oui ; refusée d\'un autre : non');

// ---- forme ----
ok(ids(B).length === new Set(ids(B)).size, 'chaque notification a un identifiant unique et stable');
ok(B.every(x => x.view === 'feed' && x.nav && x.nav.startsWith('news:')), 'toutes ouvrent la page Actualités sur la publication exacte');
ok(N.newsNotifications(u1, now).map(x => x.id).join() === B.map(x => x.id).join(), 'mêmes identifiants à chaque calcul (la notification lue reste lue)');
ok(N.newsNotifications(u3, now).length > 0 && N.newsNotifications(u3, now).length <= 40, 'au plus 40 notifications d\'Actualités');
(db as any).getNews = () => { throw new Error('panne'); };
ok(N.newsNotifications(u1, now).length === 0, 'une panne du store ne fait jamais tomber la cloche');
(db as any).getNews = () => posts;

// ---- lecture à l'ouverture des Actualités ----
const before = N.newsNotifications(u1);
const newsIds = before.filter(x => x.id.startsWith('news-')).map(x => x.id);
ok(newsIds.length > 0 && N.unreadCount(u1, before) === before.length, 'avant : tout est « pas lu »');
N.markNewsSeen(u1);
const after = N.unreadCount(u1, before);
ok(newsIds.every(i => !N.isUnread(u1, before.find(x => x.id === i)!)) && after === before.length - newsIds.length, 'ouvrir les Actualités : les « nouvelle publication » sont lues, le reste (commentaires, validée, refusée) reste à lire jusqu\'au clic');

// ---- branchements ----
const rd = (p: string) => readFileSync(p, 'utf8');
ok(/out\.push\(\.\.\.newsNotifications\(user\)\)/.test(rd('src/utils/notifications.ts')), 'la cloche inclut les Actualités');
ok(/markNewsSeen\(currentUser\)/.test(rd('src/views/FeedView.tsx')), 'les Actualités marquent « nouvelle publication » comme lue à l\'ouverture');
ok(/news: t\('Actualités/.test(rd('src/components/NotificationsCard.tsx')) && /'messages', 'news'\]/.test(rd('src/components/NotificationsCard.tsx')), 'Réglages > Notifications : un interrupteur « Actualités » pour tous les rôles');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
