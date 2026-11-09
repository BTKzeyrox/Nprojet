// Contrôle des actualités : qui publie, modifie, voit (règles du site = copie du serveur) + protections du serveur. Lancer : npm run check:news-access
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as N from '../src/utils/newsAccess';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);

const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN NEWSACCESS[^\n]*\n([\s\S]*?)\/\/ ===== END NEWSACCESS =====/);
if (!m) throw new Error('bloc NEWSACCESS introuvable');
new Function(transformSync(m[1] + '\n;globalThis.__n = { cleanNewsPolicy, cleanAudience, cleanAudienceUsers, newsAudience, pickAudience, publishModeFor, canSeeNews, canEditNews };', { loader: 'ts' }).code)();
const S = (globalThis as any).__n;

// ---- Règles de base ----
const P = (o: object) => ({ ...N.DEFAULT_NEWS_POLICY, employee: 'off', team_lead: 'off', accountant: 'off', ...o });
eq(N.cleanNewsPolicy(undefined), { employee: 'review', team_lead: 'review', accountant: 'review', allow_edit: false }, 'réglage jamais touché : comme avant (les trois proposent, le responsable valide), personne ne modifie');
eq(N.cleanNewsPolicy({}), { employee: 'off', team_lead: 'off', accountant: 'off', allow_edit: false }, 'réglage enregistré vide : rien d\'autorisé');
eq(N.cleanNewsPolicy({ employee: 'direct', team_lead: 'bizarre', accountant: 'review', allow_edit: 'oui' }), { employee: 'direct', team_lead: 'off', accountant: 'review', allow_edit: false }, 'réglage inconnu = off, « oui » n\'est pas vrai');
eq(N.cleanAudience(undefined), undefined, 'public absent = tous');
eq(N.cleanAudience([]), undefined, 'public vide = tous');
eq(N.cleanAudience(['employee', 'team_lead', 'accountant']), undefined, 'les trois rôles = tous');
eq(N.cleanAudience(['accountant', 'team_lead']), ['team_lead', 'accountant'], 'mélange : ordre fixe');
eq(N.cleanAudience(['admin', 'x', 'employee', 'employee']), ['employee'], 'rôle inconnu ou « admin » retiré, doublon retiré');
eq(N.cleanAudience('employee'), undefined, 'pas une liste = tous');
eq(N.publishModeFor('admin', undefined), 'direct', 'le responsable publie toujours directement');
eq(N.publishModeFor('employee', undefined), 'review', 'opérateur sans réglage : il propose, le responsable valide (comme avant)');
eq(N.publishModeFor('employee', { employee: 'off' }), 'off', 'opérateur : désactivé par le responsable');
eq(N.publishModeFor('team_lead', P({ team_lead: 'review' })), 'review', 'chef d\'équipe : validation');
eq(N.publishModeFor('accountant', P({ accountant: 'direct' })), 'direct', 'comptable : direct');
eq(N.publishModeFor('inconnu', P({ employee: 'direct' })), 'off', 'rôle inconnu : non');

const post = (o: object) => ({ id: 'n1', author_id: 'a', status: 'published', ...o });
const op = { id: 'o1', role: 'employee' }, tl = { id: 't1', role: 'team_lead' }, ac = { id: 'c1', role: 'accountant' }, ad = { id: 'admin1', role: 'admin' };
ok(N.canSeeNews(post({}), op) && N.canSeeNews(post({}), tl) && N.canSeeNews(post({}), ac), 'sans public : tout le monde voit');
ok(N.canSeeNews(post({ status: undefined }), op), 'ancienne publication sans statut : visible');
ok(!N.canSeeNews(post({ audience: ['team_lead'] }), op) && N.canSeeNews(post({ audience: ['team_lead'] }), tl) && !N.canSeeNews(post({ audience: ['team_lead'] }), ac), 'chefs d\'équipe seulement');
ok(N.canSeeNews(post({ audience: ['accountant'] }), ac) && !N.canSeeNews(post({ audience: ['accountant'] }), op), 'comptables seulement');
ok(N.canSeeNews(post({ audience: ['employee'] }), op) && !N.canSeeNews(post({ audience: ['employee'] }), tl), 'opérateurs seulement');
ok(N.canSeeNews(post({ audience: ['team_lead', 'accountant'] }), tl) && N.canSeeNews(post({ audience: ['team_lead', 'accountant'] }), ac) && !N.canSeeNews(post({ audience: ['team_lead', 'accountant'] }), op), 'mélange');
ok(N.canSeeNews(post({ audience: ['accountant'] }), ad), 'le responsable voit toujours tout');
ok(N.canSeeNews(post({ audience: ['accountant'], author_id: 'o1' }), op), 'l\'auteur voit toujours sa publication');
ok(!N.canSeeNews(post({ status: 'pending' }), op) && N.canSeeNews(post({ status: 'pending', author_id: 'o1' }), op) && N.canSeeNews(post({ status: 'pending' }), ad), 'en attente : l\'auteur et le responsable seulement');
ok(!N.canSeeNews(post({ status: 'rejected' }), tl), 'refusée : pas visible des autres');
ok(!N.canSeeNews(post({}), { id: 'z', role: 'inconnu' }) || N.canSeeNews(post({ audience: undefined }), { id: 'z', role: 'inconnu' }) === true, 'rôle inconnu : pas de crash');
ok(!N.canSeeNews(null, op) && !N.canSeeNews(post({}), null), 'null : non');

const mine = (me: any, o: object = {}) => post({ author_id: me.id, ...o });
ok(N.canEditNews(post({}), ad, undefined), 'le responsable modifie tout');
ok(!N.canEditNews(mine(op), op, undefined), 'sans réglage : pas de modification');
ok(!N.canEditNews(mine(op), op, { employee: 'review' }), 'allow_edit absent : pas de modification');
ok(!N.canEditNews(mine(op), op, P({ employee: 'review' })), 'réglage sans « modifier » : non');
ok(N.canEditNews(mine(op), op, P({ employee: 'review', allow_edit: true })), 'modifier la sienne : oui');
ok(!N.canEditNews(post({ author_id: 'autre' }), op, P({ employee: 'review', allow_edit: true })), 'pas celle d\'un autre');
ok(!N.canEditNews(mine(op), op, P({ employee: 'off', allow_edit: true })), 'rôle qui ne peut plus publier : non');
ok(!N.canEditNews(mine(op, { status: 'pending' }), op, P({ employee: 'review', allow_edit: true })), 'en attente : on la retire, on ne la modifie pas');
ok(N.canEditNews(mine(ac), ac, P({ accountant: 'direct', allow_edit: true })) && !N.canEditNews(mine(tl), tl, P({ accountant: 'direct', allow_edit: true })), 'chaque rôle suit SON réglage');

// ---- Même réponse sur le site et sur le serveur ----
const roles = ['admin', 'employee', 'team_lead', 'accountant', 'inconnu', '', undefined, null, 42];
const modes = ['off', 'review', 'direct', 'x', undefined];
const auds: unknown[] = [undefined, [], ['employee'], ['team_lead'], ['accountant'], ['employee', 'team_lead'], ['team_lead', 'accountant'], ['employee', 'team_lead', 'accountant'], ['admin'], 'employee', null];
const statuses = [undefined, 'published', 'pending', 'rejected'];
for (const a of auds) eq(S.cleanAudience(a), N.cleanAudience(a), `public identique ${JSON.stringify(a)}`);
let same = 0;
for (const r of roles) for (const e of modes) for (const t of modes) for (const c of modes) for (const ed of [true, false, undefined]) {
  const pol = { employee: e, team_lead: t, accountant: c, allow_edit: ed };
  if (JSON.stringify(S.cleanNewsPolicy(pol)) !== JSON.stringify(N.cleanNewsPolicy(pol))) { fails++; console.log('ECHEC réglage différent', JSON.stringify(pol)); }
  if (S.publishModeFor(r, pol) !== N.publishModeFor(r, pol)) { fails++; console.log('ECHEC mode différent', r, JSON.stringify(pol)); }
  for (const st of statuses) for (const au of auds) for (const who of ['o1', 'autre']) {
    const p = { author_id: who, status: st, audience: au }, me = { id: 'o1', role: r };
    if (S.canSeeNews(p, me) !== N.canSeeNews(p, me) || S.canEditNews(p, me, pol) !== N.canEditNews(p, me, pol)) { fails++; console.log('ECHEC site ≠ serveur', JSON.stringify({ p, me, pol })); }
    same++;
  }
}
total += same;

// ---- Protections du serveur (le tri ne se fait pas seulement à l'écran) ----
const has = (re: RegExp, name: string) => ok(re.test(src), name);
has(/canSeeNews\(r\.data, me\)/, 'état : le tri par public se fait côté serveur pour chaque publication');
has(/async function newsSubmit[\s\S]*?publishModeFor\(me\.role, await newsPolicy\(\)\)/, 'news-submit : le réglage décide (direct, validation ou refus)');
has(/async function newsSubmit[\s\S]*?status = 'published'|status: mode === 'direct' \? 'published' : 'pending'/, 'news-submit : publication directe possible');
has(/async function newsEdit[\s\S]*?canEditNews\(/, 'news-edit : le serveur vérifie le droit de modifier');
has(/async function newsAction[\s\S]*?canSeeNews\(/, 'réactions, commentaires, partages : refusés hors public');
has(/pickAudience\(b\.audience, b\.audience_users\)/, 'le public (rôles + personnes choisies) est nettoyé avant d\'être gardé');
has(/keepAud[\s\S]*?pickAudience\(row\.data\.audience, row\.data\.audience_users\)/, 'news-edit : sans nouveau public envoyé, l\'ancien est gardé (rôles ET personnes)');
has(/\.\.\.pickAudience\(rec\.audience === undefined && rec\.audience_users === undefined/, 'synchro du responsable : le public choisi est gardé, un ancien site qui ne l\'envoie pas ne l\'efface pas');
has(/news_publish/, 'le réglage est géré par le serveur');
has(/async function newsDelete[\s\S]*?canEditNews\(row\.data, me, await newsPolicy\(\)\)[\s\S]*?dropFiles\(newsFilesOf\(row\.data\)\)/, 'news-delete : même droit que la modification, fichiers supprimés avec la publication');
has(/action === "news-delete"/, 'news-delete : route branchée');
has(/async function newsEdit[\s\S]*?cleanFiles\(\[f\], me\.id\)/, 'news-edit : un nouveau fichier doit appartenir à la personne qui modifie');
has(/async function newsEdit[\s\S]*?dropFiles\(gone\)/, 'news-edit : les fichiers retirés sont supprimés pour de bon');
has(/async function newsEdit[\s\S]*?if \(!text && !files\.length\)/, 'news-edit : une publication ne peut pas devenir vide');

// ---- Public par personne (BTK 2026-11-09) : rôles entiers + personnes choisies ----
const o1 = { id: 'o1', role: 'employee' }, o2 = { id: 'o2', role: 'employee' }, t1 = { id: 't1', role: 'team_lead' }, a1 = { id: 'a1', role: 'accountant' }, adm = { id: 'adm', role: 'admin' };
const pp = (extra: Record<string, unknown>) => ({ author_id: 'auteur', status: 'published', ...extra });
ok(N.canSeeNews(pp({ audience_users: ['o1'] }), o1) && !N.canSeeNews(pp({ audience_users: ['o1'] }), o2) && !N.canSeeNews(pp({ audience_users: ['o1'] }), t1), 'personnes choisies : seulement elles (même rôle, autre personne = non)');
ok(N.canSeeNews(pp({ audience: ['team_lead'], audience_users: ['o1'] }), t1) && N.canSeeNews(pp({ audience: ['team_lead'], audience_users: ['o1'] }), o1) && !N.canSeeNews(pp({ audience: ['team_lead'], audience_users: ['o1'] }), o2) && !N.canSeeNews(pp({ audience: ['team_lead'], audience_users: ['o1'] }), a1), 'rôle entier + une personne d\'un autre rôle');
ok(N.canSeeNews(pp({ audience_users: ['o1'] }), adm) && N.canSeeNews(pp({ audience_users: ['o1'], author_id: 'o2' }), o2), 'le responsable et l\'auteur voient toujours');
ok(!N.canSeeNews(pp({ audience_users: ['o1'], status: 'pending' }), o1), 'en attente : pas visible même pour la personne choisie');
ok(N.canSeeNews(pp({ audience: ['employee', 'team_lead', 'accountant'], audience_users: ['o1'] }), o2), 'les trois rôles + personnes = tout le monde');
ok(N.canSeeNews(pp({ audience_users: [] }), o2) && N.canSeeNews(pp({ audience_users: 'o1' }), o2) && N.canSeeNews(pp({}), o2), 'liste vide ou mal formée = tout le monde (comme avant)');
eq(N.pickAudience(['accountant'], ['o1', 'o1', '', 7, 'o2']), { audience: ['accountant'], audience_users: ['o1', 'o2'] }, 'garde : rôles + personnes, doublons et valeurs fausses retirés');
eq(N.pickAudience([], []), {}, 'rien de choisi : rien gardé'); eq(N.pickAudience(['employee', 'team_lead', 'accountant'], ['o1']), {}, 'les trois rôles : rien gardé (tout le monde)'); eq(N.pickAudience([], ['o1']), { audience_users: ['o1'] }, 'personnes seules : gardées');
eq(N.cleanAudienceUsers(Array.from({ length: 300 }, (_, i) => 'u' + i)).length, 200, 'au plus 200 personnes');
ok(N.audienceLabel(['employee'], 'fr', ['o1'], id => (id === 'o1' ? 'Hugo' : undefined)).includes('2 personnes') === false && N.audienceLabel(['employee'], 'fr', ['o1'], id => (id === 'o1' ? 'Hugo' : undefined)) === 'Opérateurs + Hugo' && N.audienceLabel([], 'fr', ['a', 'b', 'c', 'd'], () => 'X') === '4 personnes choisies' && N.audienceLabel([], 'fr') === 'Tous', 'étiquette : noms (3 au plus) ou nombre');
const ids = ['o1', 'o2', 't1', 'a1', 'adm', 'inconnu'], rr = ['employee', 'team_lead', 'accountant', 'admin', 'x'];
let sameU = 0;
for (const au of [undefined, [], ['employee'], ['team_lead', 'accountant'], ['employee', 'team_lead', 'accountant'], 'x'] as unknown[]) for (const us of [undefined, [], ['o1'], ['o1', 't1'], ['a1', 'a1', 7], 'o1', ['adm']] as unknown[]) for (const st of statuses) for (const who of ['o1', 'autre']) for (const id of ids) for (const r of rr) {
  const p = { author_id: who, status: st, audience: au, audience_users: us }, me = { id, role: r };
  if (S.canSeeNews(p, me) !== N.canSeeNews(p, me)) { fails++; console.log('ECHEC site ≠ serveur (personnes)', JSON.stringify({ p, me })); }
  if (JSON.stringify(S.pickAudience(au, us)) !== JSON.stringify(N.pickAudience(au, us))) { fails++; console.log('ECHEC garde différente', JSON.stringify({ au, us })); }
  sameU++;
}
total += sameU;

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
