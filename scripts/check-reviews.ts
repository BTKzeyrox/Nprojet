// Contrôle des règles des évaluations (module 5, M5.4), sans réseau ni écran.
// Lancer : npm run check:reviews
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { checkReview, forEmployeeReview, snapshotOf, reviewReasonText } from '../src/utils/reviews';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const NOW = '2026-10-23T08:00:00.000Z';
const adm = { id: 'admin', admin: true }, emp = { id: 'u1', admin: false }, other = { id: 'u2', admin: false };
const snap = { score: 78, components: { quality: 90, volume: 70.4, punctuality: null, regularity: 60 }, badges: [{ id: 'quality', level: 2 }], done: 24, decided: 26, rate: 92, taken_at: '2026-10-23T07:00:00Z' };
const base = (p: any = {}) => ({ id: 'r1', employee_id: 'u1', employee_name: 'Pirate', period_start: '2026-07-01', period_end: '2026-09-30', status: 'draft', objectives: [{ id: 'o1', text: 'Atteindre 95 % de validation' }, { id: 'o2', text: 'Zéro retard', done: true }], strengths: 'Rigoureuse', comments: 'Bon trimestre', improvements: 'Doit mieux communiquer', rating: 4, snapshot: snap, ...p });

// création
const c = checkReview(base(), undefined, adm, NOW) as any;
ok(c.ok && c.save.status === 'draft' && c.save.created_by === 'admin' && c.save.created_at === NOW && !c.save.shared_at, 'brouillon créé par le responsable');
ok(c.save.snapshot.components.volume === 70 && c.save.snapshot.taken_at === '2026-10-23T07:00:00.000Z' && c.save.snapshot.badges[0].level === 2, 'photo des scores gardée (arrondie, date normalisée)');
ok(c.save.objectives[1].done === true && c.save.objectives[0].done === undefined, 'objectif fait / non fait');
ok((checkReview(base({ status: 'shared' }), undefined, adm, NOW) as any).save.shared_at === NOW, 'créée partagée : date de partage posée');
ok((checkReview(base(), undefined, emp, NOW) as any).reason === 'forbidden' && (checkReview(base(), undefined, other, NOW) as any).reason === 'forbidden', 'un salarié ne crée jamais de fiche');
const R = (p: any, reason: string, name: string, ex: any = undefined, who = adm) => { const r = checkReview(base(p), ex, who, NOW) as any; ok(!r.ok && r.reason === reason, name); };
R({ id: '' }, 'id', 'identifiant vide refusé');
R({ status: 'x' }, 'status', 'état inconnu refusé');
R({ employee_id: '' }, 'employee', 'salarié absent refusé');
R({ period_start: '2026-10-01', period_end: '2026-09-01' }, 'period', 'fin avant le début refusée');
R({ period_start: '2026-02-30' }, 'period', 'date impossible refusée');
R({ period_start: '2025-01-01', period_end: '2026-09-30' }, 'period', 'période de plus de 400 jours refusée');
R({ objectives: 'x' }, 'objectives', 'objectifs non tableau refusés');
R({ objectives: Array.from({ length: 11 }, (_, i) => ({ id: 'o' + i, text: 't' })) }, 'objectives', '11 objectifs refusés');
R({ objectives: [{ id: 'o1', text: '' }] }, 'objectives', 'objectif vide refusé');
R({ objectives: [{ id: 'o1', text: 'a' }, { id: 'o1', text: 'b' }] }, 'objectives', 'objectifs en double refusés');
R({ rating: 6 }, 'rating', 'note 6 refusée');
R({ rating: 0 }, 'rating', 'note 0 refusée');
R({ rating: 3.5 }, 'rating', 'note à virgule refusée');
R({ rating: '4' }, 'rating', 'note texte refusée');
R({ snapshot: { ...snap, score: 150 } }, 'snapshot', 'score de 150 refusé');
R({ snapshot: { ...snap, badges: [{ id: 'zzz', level: 1 }] } }, 'snapshot', 'badge inconnu refusé');
R({ snapshot: { ...snap, badges: [{ id: 'quality', level: 4 }] } }, 'snapshot', 'niveau de badge 4 refusé');
R({ snapshot: { ...snap, badges: [{ id: 'quality', level: 1 }, { id: 'quality', level: 2 }] } }, 'snapshot', 'badge en double refusé');
R({ snapshot: { ...snap, done: -1 } }, 'snapshot', 'compteur négatif refusé');
R({ snapshot: { ...snap, taken_at: 'hier' } }, 'snapshot', 'date de photo fausse refusée');
R({ snapshot: 'x' }, 'snapshot', 'photo non objet refusée');
ok((checkReview(base({ rating: undefined }), undefined, adm, NOW) as any).save.rating === undefined && (checkReview(base({ rating: null }), undefined, adm, NOW) as any).ok, 'note facultative');
ok((checkReview(base({ snapshot: undefined }), undefined, adm, NOW) as any).ok && !('snapshot' in (checkReview(base({ snapshot: undefined }), undefined, adm, NOW) as any).save), 'photo facultative');
ok((checkReview(base({ snapshot: { ...snap, score: null, rate: null } }), undefined, adm, NOW) as any).save.snapshot.score === null, 'score vide (pas assez de données) accepté');
ok((checkReview(base({ comments: '<b>x</b>'.repeat(1000) }), undefined, adm, NOW) as any).save.comments.length === 2000 && !(checkReview(base({ strengths: '<i>' }), undefined, adm, NOW) as any).save.comments?.includes('<'), 'textes nettoyés et coupés (2000 / 1000)');
ok(!('strengths' in (checkReview(base({ strengths: '  ' }), undefined, adm, NOW) as any).save), 'texte vide : champ non écrit');
ok((checkReview(base({ employee_name: 'Pirate' }), undefined, adm, NOW) as any).save.employee_name === 'Pirate', 'le nom est celui posé par le serveur (avant l\'appel)');

// modification d'un brouillon
const draft = c.save;
const up = checkReview({ ...draft, comments: 'Changé', period_end: '2026-10-15' }, draft, adm, NOW) as any;
ok(up.ok && up.save.comments === 'Changé' && up.save.period_end === '2026-10-15' && up.save.created_at === draft.created_at, 'brouillon modifiable (période comprise)');
ok((checkReview({ ...draft, employee_id: 'u9' }, draft, adm, NOW) as any).reason === 'employee', 'on ne change pas le salarié d\'une fiche');
const newSnap = { ...snap, score: 50 };
ok((checkReview({ ...draft, snapshot: newSnap }, draft, adm, NOW) as any).save.snapshot.score === 50, 'brouillon : la photo des scores peut être rafraîchie');
ok((checkReview({ ...draft, snapshot: undefined }, draft, adm, NOW) as any).save.snapshot.score === 78, 'sans nouvelle photo : l\'ancienne reste');

// partage
const shared = (checkReview({ ...draft, status: 'shared' }, draft, adm, NOW) as any).save;
ok(shared.status === 'shared' && shared.shared_at === NOW, 'brouillon → partagée : date de partage posée');
ok((checkReview({ ...shared, status: 'draft' }, shared, adm, NOW) as any).reason === 'transition', 'une fiche partagée ne redevient pas brouillon');
const edited = checkReview({ ...shared, period_start: '2020-01-01', period_end: '2020-02-01', snapshot: newSnap, comments: 'Mis à jour' }, shared, adm, '2026-10-24T08:00:00.000Z') as any;
ok(edited.ok && edited.save.period_start === '2026-07-01' && edited.save.snapshot.score === 78 && edited.save.comments === 'Mis à jour' && edited.save.shared_at === NOW, 'partagée : période et photo figées, commentaires modifiables, date de partage gardée');

// accusé de lecture
const ack = checkReview({ ...shared, acknowledged_at: 'x', comments: 'PIRATE', improvements: 'PIRATE', rating: 1, status: 'draft' }, shared, emp, NOW) as any;
ok(ack.ok && ack.save.acknowledged_at === NOW && ack.save.acknowledged_by === 'u1' && ack.save.comments === shared.comments && ack.save.improvements === shared.improvements && ack.save.rating === 4 && ack.save.status === 'shared', 'le salarié accuse lecture : rien d\'autre ne change (champs envoyés ignorés)');
ok((checkReview({ ...shared }, shared, emp, NOW) as any).save === shared, 'le salarié sans accusé : rien ne change');
ok((checkReview({ ...ack.save, acknowledged_at: undefined }, ack.save, emp, NOW) as any).save === ack.save, 'un accusé de lecture ne s\'annule pas');
ok((checkReview({ ...shared, acknowledged_at: 'x' }, shared, other, NOW) as any).reason === 'forbidden', 'un autre salarié ne touche pas à ma fiche');
ok((checkReview({ ...draft, acknowledged_at: 'x' }, draft, emp, NOW) as any).reason === 'forbidden', 'le salarié ne touche jamais à un brouillon');
ok((checkReview({ ...shared, acknowledged_at: 'x' }, undefined, emp, NOW) as any).reason === 'forbidden', 'le salarié ne crée rien en accusant lecture');
const keep = checkReview({ ...ack.save, improvements: 'Autre note privée' }, ack.save, adm, NOW) as any;
ok(keep.ok && keep.save.acknowledged_at === NOW, 'le responsable change une note privée : le « lu » reste');
const reread = checkReview({ ...ack.save, comments: 'Nouveau texte' }, ack.save, adm, NOW) as any;
ok(reread.ok && reread.save.acknowledged_at === undefined && reread.save.acknowledged_by === undefined, 'le responsable change ce que le salarié voit : le « lu » est effacé');
ok((checkReview({ ...ack.save, objectives: [{ id: 'o1', text: 'Atteindre 95 % de validation', done: true }, { id: 'o2', text: 'Zéro retard', done: true }] }, ack.save, adm, NOW) as any).save.acknowledged_at === undefined, 'objectif coché après coup : le « lu » est effacé');

// ce que voit le salarié
const mine = forEmployeeReview(shared) as any;
ok(!('improvements' in mine) && mine.comments === shared.comments && mine.snapshot.score === 78, 'le salarié ne reçoit jamais les points à améliorer');
ok(reviewReasonText('period').includes('400') && reviewReasonText('period', 'en').includes('400 days') && reviewReasonText('zzz') === 'Fiche refusée.', 'messages FR/EN');
const sn = snapshotOf({ score: 70, components: { quality: 1, volume: null, punctuality: 2, regularity: 3 }, badges: [{ id: 'quality', level: 2 }], window: { done: 5, decided: 6, rate: 83 } }, NOW)!;
ok(sn.done === 5 && sn.decided === 6 && sn.rate === 83 && snapshotOf(undefined, NOW) === undefined && (checkReview(base({ snapshot: sn }), undefined, adm, NOW) as any).ok, 'photo prise du module 3 : acceptée par les règles');

// --- le serveur ---
const read = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('supabase/functions/df-api/index.ts');
const site = read('src/utils/reviews.ts');
const region = (t: string) => (/\/\/ BEGIN REVIEWCLEAN\n([\s\S]*?)\/\/ END REVIEWCLEAN\n/.exec(t) || [])[1] || '';
ok(region(site).length > 2500 && region(site) === region(server), 'la fonction du serveur est la copie exacte de celle du site');
const blk = /\/\/ ===== BEGIN REVIEWS [^\n]*\n([\s\S]*?)\/\/ ===== END REVIEWS =====/.exec(server);
ok(!!blk, 'bloc REVIEWS trouvé dans le serveur');
const serverReview = new Function(transformSync(blk![1], { loader: 'ts' }).code + '\nreturn cleanReview;')() as typeof checkReview;
const cases: [any, any, any][] = [
  [base(), undefined, adm], [base(), undefined, emp], [base({ status: 'x' }), undefined, adm], [{ ...draft, comments: 'x' }, draft, adm], [{ ...draft, status: 'shared' }, draft, adm],
  [{ ...shared, status: 'draft' }, shared, adm], [{ ...shared, acknowledged_at: 'x' }, shared, emp], [{ ...shared, acknowledged_at: 'x' }, shared, other], [{ ...ack.save, comments: 'N' }, ack.save, adm],
  [base({ rating: 9 }), undefined, adm], [base({ snapshot: { ...snap, score: 101 } }), undefined, adm], [base({ objectives: [{ id: 'a', text: '' }] }), undefined, adm], [null, undefined, adm],
  [{ ...shared, period_start: '2000-01-01', snapshot: newSnap }, shared, adm], [base({ period_start: '2025-01-01' }), undefined, adm],
];
ok(cases.every(([r, e, a]) => JSON.stringify(serverReview(r, e, a, NOW)) === JSON.stringify(checkReview(r, e, a, NOW))), `site et serveur donnent le même résultat sur ${cases.length} cas`);
ok(/reviews: "df_reviews"/.test(server), 'la collection reviews existe dans le serveur');
ok(/if \(col === 'reviews'\) return q\.eq\('data->>employee_id', me\.id\)\.eq\('data->>status', 'shared'\);/.test(server) && /const scope = \(q: any\) => \{\s*if \(admin\) return q;/.test(server), 'lecture : un salarié ne reçoit que SES fiches partagées (l\'admin passe avant le filtre)');
ok(/if \(col === 'reviews' && me\.role !== 'admin'\) recs = recs\.map\(\(r: any\) => \{ const \{ improvements: _hidden, \.\.\.mine \} = r; return mine; \}\);/.test(server), 'le champ « points à améliorer » est retiré pour tout compte autre que le responsable');
ok(/if \(col === 'reviews'\) \{[\s\S]{0,700}cleanReview\(rec, existing, \{ id: me\.id, admin \}, now\)/.test(server), 'chaque écriture de fiche (tous rôles) passe par cleanReview');
ok(/const eu = await getUserRow\(String\(rec\.employee_id \|\| ''\)\);\s*if \(!eu \|\| eu\.role === 'admin'\)/.test(server) && /rec\.employee_name = eu\.name;/.test(server), 'création : le salarié doit exister, son nom vient du serveur');
ok(!/ADMIN_ONLY_WRITE: string\[\] = \[[^\]]*reviews/.test(server), 'les fiches ne sont pas dans la liste admin seulement (le salarié doit pouvoir accuser lecture)');
ok(/await step\('reviews', async \(\) => \{ await sb\.from\(T\.reviews\)\.delete\(\)\.eq\('data->>employee_id', uid\); \}\);/.test(server), 'supprimer un compte efface ses fiches');
const mig = read('supabase/migrations/20261024_create_df_reviews.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_reviews from anon, authenticated/.test(mig) && /drop table public\.df_reviews/.test(mig), 'migration : RLS, aucun accès public, retour en arrière écrit');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
