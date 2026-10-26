// Contrôle du pont magasin ↔ file d'actions hors ligne (module 13, M13.5), sans réseau. Lancer : npm run check:offline-sync
import { hashJson, textOf, buildOps, applyQueue, rejectedToReview, reapply, type Changes, type SyncedJson } from '../src/utils/offlineSync';
import { OFFLINE_DEFAULTS, type OfflineOp, type Queue } from '../src/utils/offline';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const T0 = '2026-10-24T08:00:00.000Z', T1 = '2026-10-24T09:00:00.000Z', T2 = '2026-10-24T10:00:00.000Z';
const j = (o: unknown) => JSON.stringify(o);
const synced = (m: Record<string, Record<string, unknown>>): SyncedJson => { const out: SyncedJson = {}; for (const [c, recs] of Object.entries(m)) { out[c] = new Map(); for (const [id, r] of Object.entries(recs)) out[c].set(id, j(r)); } return out; };

// ---------- empreinte ----------
{
  ok(hashJson('abc') === hashJson('abc') && hashJson('abc') !== hashJson('abd') && /^[0-9a-f]{8}$/.test(hashJson('')) && hashJson('') === '811c9dc5', 'empreinte : stable, différente si le texte change, 8 caractères');
  const seen = new Set(Array.from({ length: 5000 }, (_, i) => hashJson('mission-' + i)));
  ok(seen.size === 5000, 'empreinte : 5 000 textes proches, aucune collision');
  ok(textOf({ text: ' Bonjour ' }) === ' Bonjour ' && textOf({ title: 'T' }) === 'T' && textOf({ note: '   ', name: 'N' }) === 'N' && textOf({ id: 1 }) === undefined && textOf(null) === undefined && textOf('x') === undefined && textOf({ text: 'x'.repeat(5000) })!.length === 2000, 'texte saisi : le premier champ texte non vide, 2 000 caractères au plus');
}
// ---------- miroir de la comparaison ----------
{
  const s = synced({ posts: { p1: { id: 'p1', v: 1 } }, messages: {} });
  const ch: Changes = { posts: { upserts: [{ id: 'p1', v: 2 }], deletes: [] }, messages: { upserts: [{ id: 'm1', text: 'Salut' }], deletes: [] } };
  const r = buildOps([], ch, s, 'employee', T0);
  ok(r.queue.length === 2 && r.skipped.length === 0 && r.queue.every(o => o.state === 'pending' && o.kind === 'record'), 'deux changements : deux actions en attente');
  const p1 = r.queue.find(o => o.record_id === 'p1')!, m1 = r.queue.find(o => o.record_id === 'm1')!;
  ok(p1.created_offline === false && p1.base_hash === hashJson(j({ id: 'p1', v: 1 })) && p1.action === 'upsert' && (p1.payload as any).v === 2, 'élément qui existait : version de DÉPART notée (empreinte), pas créé hors ligne');
  ok(m1.created_offline === true && m1.base_hash === undefined && m1.text === 'Salut', 'élément nouveau : créé hors ligne, pas de version de départ, texte gardé');
  ok(p1.id === 'posts|p1' && m1.id === 'messages|m1' && p1.bytes > 0, 'numéro d\'action stable (collection|élément), taille calculée');
  // la même comparaison deux fois = même file (pas de doublon, heure de départ gardée)
  const r2 = buildOps(r.queue, { posts: { upserts: [{ id: 'p1', v: 3 }], deletes: [] }, messages: ch.messages }, s, 'employee', T1);
  const p1b = r2.queue.find(o => o.record_id === 'p1')!;
  ok(r2.queue.length === 2 && p1b.created_at === T0 && p1b.base_hash === p1.base_hash && (p1b.payload as any).v === 3, 'modifié une 2e fois : une seule action, dernière valeur, heure et version de DÉPART gardées');
  ok(r2.queue.find(o => o.record_id === 'm1')!.created_offline === true, 'élément créé hors ligne puis modifié : toujours « créé hors ligne »');
  // les essais ratés sont gardés
  const withTries = r.queue.map(o => ({ ...o, tries: 3, next_try_at: T2 }));
  const r3 = buildOps(withTries, ch, s, 'employee', T1);
  ok(r3.queue.every(o => o.tries === 3 && o.next_try_at === T2), 'nombre d\'essais et prochain essai gardés');
  // suppression
  const del = buildOps([], { posts: { upserts: [], deletes: ['p1'] } }, s, 'employee', T0);
  ok(del.queue.length === 1 && del.queue[0].action === 'delete' && (del.queue[0].payload as any).v === 1 && del.queue[0].base_hash === p1.base_hash, 'suppression : dernière version connue gardée, version de départ notée');
  ok(buildOps([], { posts: { upserts: [], deletes: ['inconnu'] } }, s, 'employee', T0).queue[0].payload !== undefined, 'suppression d\'un élément inconnu : payload minimal, pas de plantage');
  // plus rien à envoyer : la file se vide, « À revoir » reste
  const review: OfflineOp = { ...p1, id: 'posts|px|refused|0', state: 'review', review_code: 'refused' };
  const emptied = buildOps([...r.queue, review], {}, s, 'employee', T1);
  ok(emptied.queue.length === 1 && emptied.queue[0].state === 'review', 'tout envoyé : la file se vide, « À revoir » est conservé');
  const snap = j([r.queue, ch, s.posts.get('p1')]);
  buildOps(r.queue, ch, s, 'employee', T1);
  ok(j([r.queue, ch, s.posts.get('p1')]) === snap, 'les données reçues ne sont pas modifiées');
}
// ---------- ce qui doit rester en ligne ----------
{
  const s = synced({});
  const ch: Changes = { cash: { upserts: [{ id: 'c1', amount_ar: 1000000 }], deletes: [] }, posts: { upserts: [{ id: 'p1' }], deletes: [] }, users: { upserts: [{ id: 'u1', role: 'admin' }], deletes: [] } };
  const r = buildOps([], ch, s, 'employee', T0);
  ok(r.queue.length === 1 && r.queue[0].collection === 'posts' && r.skipped.map(x => x.col).sort().join() === 'cash,users' && r.skipped.every(x => x.why.fr.length > 10), 'opérateur : argent et comptes ne sont PAS gardés sur l\'appareil, et c\'est dit');
  const a = buildOps([], { stock: { upserts: [{ id: 's1', qty: 2 }], deletes: [] }, advances: { upserts: [{ id: 'a1' }], deletes: [] }, invoices: { upserts: [{ id: 'i1', status: 'draft' }, { id: 'i2', status: 'issued', number: 'FA-1' }], deletes: [] } }, s, 'admin', T0);
  ok(a.queue.map(o => o.id).sort().join() === 'invoices|i1,stock|s1' && a.skipped.map(x => x.col + ':' + x.id).sort().join() === 'advances:a1,invoices:i2', 'admin : stock et brouillon de facture gardés ; avance et facture avec numéro non gardées');
  ok(buildOps([], { posts: { upserts: [{ id: 'p' }], deletes: [] } }, s, 'accountant', T0).queue.length === 0, 'Comptable : rien n\'est gardé hors ligne');
  ok(buildOps([], { invoices: { upserts: [], deletes: ['i1'] } }, synced({ invoices: { i1: { id: 'i1', status: 'draft' } } }), 'admin', T0).queue.length === 1 && buildOps([], { invoices: { upserts: [], deletes: ['i2'] } }, synced({ invoices: { i2: { id: 'i2', status: 'issued', number: 'FA-2' } } }), 'admin', T0).queue.length === 0, 'supprimer un brouillon de facture : gardé ; supprimer une facture émise : non');
}
// ---------- limites ----------
{
  const s = synced({});
  const many: Changes = { posts: { upserts: Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i })), deletes: [] } };
  const r = buildOps([], many, s, 'employee', T0, { ...OFFLINE_DEFAULTS, max_ops: 10 });
  ok(r.queue.length === 10 && r.skipped.length === 2 && r.skipped[0].why.fr.includes('Trop d\'actions'), 'file pleine : les actions en trop sont signalées, jamais effacées en silence');
  const big = buildOps([], { posts: { upserts: [{ id: 'p1', text: 'x'.repeat(OFFLINE_DEFAULTS.max_op_bytes + 5) }], deletes: [] } }, s, 'employee', T0);
  ok(big.queue.length === 0 && big.skipped.length === 1, 'action trop grosse : signalée');
  const rv = buildOps(Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, kind: 'record' as const, collection: 'posts', record_id: 'x' + i, payload: {}, created_at: T0, tries: 0, state: 'review' as const, bytes: 1 })), many, s, 'employee', T0, { ...OFFLINE_DEFAULTS, max_ops: 12 });
  ok(rv.queue.filter(o => o.state === 'pending').length === 12 && rv.skipped.length === 0, '« À revoir » ne compte pas dans la limite des actions en attente');
}
// ---------- remettre les actions sur les données du serveur ----------
{
  const base = { posts: [{ id: 'p1', v: 1 }, { id: 'p2', v: 1 }], messages: [] as any[] };
  const s = synced({ posts: { p1: { id: 'p1', v: 1 }, p2: { id: 'p2', v: 1 } } });
  const mk = (over: Partial<OfflineOp>): OfflineOp => ({ id: 'x', kind: 'record', collection: 'posts', record_id: 'p1', action: 'upsert', payload: { id: 'p1', v: 9 }, created_at: T0, tries: 0, state: 'pending', bytes: 10, base_hash: hashJson(j({ id: 'p1', v: 1 })), ...over });
  let r = applyQueue(base, s, [mk({})], 'employee');
  ok(r.arrays.posts.find(x => x.id === 'p1').v === 9 && r.applied.length === 1 && r.conflicts.length === 0, 'serveur inchangé : la modification est remise sur les données');
  ok(base.posts[0].v === 1, 'les tableaux reçus ne sont pas modifiés');
  r = applyQueue(base, synced({ posts: { p1: { id: 'p1', v: 2 }, p2: { id: 'p2', v: 1 } } }), [mk({})], 'employee');
  ok(r.conflicts.length === 1 && r.conflicts[0].review_code === 'conflict' && r.conflicts[0].state === 'review' && r.arrays.posts.find(x => x.id === 'p1').v === 1, 'le serveur a changé l\'élément : CONFLIT, la version du serveur est gardée, l\'action va dans « À revoir »');
  ok((r.conflicts[0].payload as any).v === 9, 'conflit : le contenu de la personne est gardé dans « À revoir »');
  r = applyQueue(base, synced({ posts: { p2: { id: 'p2', v: 1 } } }), [mk({})], 'employee');
  ok(r.conflicts.length === 1 && r.conflicts[0].review_code === 'not_found', 'supprimé sur le serveur pendant la coupure : « n\'existe plus », gardé dans « À revoir »');
  r = applyQueue(base, synced({ posts: { p2: { id: 'p2', v: 1 } } }), [mk({ action: 'delete' })], 'employee');
  ok(r.conflicts.length === 0 && r.applied.length === 0, 'supprimer ce qui est déjà supprimé : rien à faire, pas de conflit');
  r = applyQueue(base, s, [mk({ action: 'delete' })], 'employee');
  ok(r.arrays.posts.length === 1 && r.arrays.posts[0].id === 'p2' && r.applied.length === 1, 'suppression remise sur les données');
  r = applyQueue(base, synced({ posts: { p1: { id: 'p1', v: 2 } } }), [mk({ action: 'delete' })], 'employee');
  ok(r.conflicts.length === 1 && r.conflicts[0].review_code === 'conflict', 'supprimer ce que quelqu\'un a modifié entre-temps : conflit');
  r = applyQueue(base, s, [mk({ record_id: 'm9', collection: 'messages', payload: { id: 'm9', text: 'Salut' }, created_offline: true, base_hash: undefined })], 'employee');
  ok(r.arrays.messages.length === 1 && r.arrays.messages[0].text === 'Salut' && r.conflicts.length === 0, 'élément créé hors ligne : ajouté (jamais de conflit)');
  r = applyQueue(base, s, [mk({ record_id: 'new', collection: 'sheets', payload: { id: 'new' }, created_offline: true, base_hash: undefined })], 'employee');
  ok(r.arrays.sheets.length === 1, 'collection absente des données (tableaux) : créée');
  r = applyQueue(base, s, [mk({ record_id: 'new', collection: 'collection-inconnue', payload: { id: 'new' }, created_offline: true, base_hash: undefined })], 'employee');
  ok(r.conflicts.length === 1 && !r.arrays['collection-inconnue'], 'collection inconnue : jamais remise (va dans « À revoir »)');
  r = applyQueue(base, s, [mk({ collection: 'cash', record_id: 'c1', payload: { id: 'c1' }, created_offline: true, base_hash: undefined })], 'employee');
  ok(r.conflicts.length === 1 && r.conflicts[0].review_code === 'refused' && !r.arrays.cash, 'une action qui demande maintenant la connexion (règle changée) : jamais remise, va dans « À revoir »');
  const order = applyQueue({ posts: [] }, {}, [mk({ id: 'b', record_id: 'z', payload: { id: 'z', n: 2 }, created_at: T1, created_offline: true, base_hash: undefined }), mk({ id: 'a', record_id: 'z', payload: { id: 'z', n: 1 }, created_at: T0, created_offline: true, base_hash: undefined })], 'employee');
  ok(order.arrays.posts.length === 1 && order.arrays.posts[0].n === 2, 'actions remises dans l\'ordre où elles ont été faites');
  const rv = applyQueue(base, s, [mk({ state: 'review', review_code: 'refused' })], 'employee');
  ok(rv.applied.length === 0 && rv.arrays.posts[0].v === 1, 'un élément « À revoir » n\'est jamais remis tout seul');
  ok(applyQueue({}, {}, [], 'employee').applied.length === 0 && applyQueue({ posts: [] }, {}, [{ ...mk({}), collection: undefined }], 'employee').applied.length === 0, 'file vide ou action sans collection : rien, sans plantage');
}
// ---------- le serveur refuse ----------
{
  const q: Queue = [{ id: 'posts|p1', kind: 'record', collection: 'posts', record_id: 'p1', action: 'upsert', payload: { id: 'p1', note: 'Mon texte' }, created_at: T0, tries: 2, state: 'pending', bytes: 20, text: 'Mon texte' }];
  const r = rejectedToReview(q, [{ col: 'posts', id: 'p1', reason: 'Mission déjà validée' }], () => undefined, 'employee', T1);
  ok(r.length === 1 && r[0].state === 'review' && r[0].review_code === 'refused' && r[0].review_note === 'Mission déjà validée' && r[0].text === 'Mon texte' && r[0].tries === 0, 'refus du serveur : l\'action va dans « À revoir » avec la raison et le texte');
  const r2 = rejectedToReview([], [{ col: 'messages', id: 'm1', reason: 'Interdit' }], (c, id) => (c === 'messages' && id === 'm1' ? { id: 'm1', text: 'Salut' } : undefined), 'employee', T1);
  ok(r2.length === 1 && r2[0].text === 'Salut' && r2[0].state === 'review', 'refus d\'un message envoyé EN LIGNE : le texte est quand même gardé (avant : perdu en silence)');
  ok(rejectedToReview([], [{ col: 'cash', id: 'c1', reason: 'x' }], () => ({ id: 'c1' }), 'employee', T1).length === 0, 'refus d\'une ligne d\'argent : rien n\'est gardé sur l\'appareil');
  ok(rejectedToReview([], [{ col: 'posts', id: 'inconnu', reason: 'x' }], () => undefined, 'employee', T1).length === 0, 'refus d\'un élément introuvable : rien d\'inventé');
  ok(rejectedToReview([], [null as any, { col: 1 as any, id: 'x', reason: '' }], () => ({}), 'employee', T1).length === 0, 'refus cassés : ignorés');
  const twice = rejectedToReview(rejectedToReview(q, [{ col: 'posts', id: 'p1', reason: 'A' }], () => undefined, 'employee', T1), [{ col: 'posts', id: 'p1', reason: 'B' }], () => ({ id: 'p1', note: 'Mon texte' }), 'employee', T2);
  ok(twice.filter(o => o.state === 'review').length === 2 && new Set(twice.map(o => o.id)).size === 2, 'deux refus du même élément : deux entrées distinctes dans « À revoir »');
  ok(rejectedToReview(q, [{ col: 'posts', id: 'p1', reason: 'x'.repeat(900) }], () => undefined, 'employee', T1)[0].review_note!.length === 300, 'raison très longue : 300 caractères');
  const snap = j(q); rejectedToReview(q, [{ col: 'posts', id: 'p1', reason: 'x' }], () => undefined, 'employee', T1);
  ok(j(q) === snap, 'la file reçue n\'est pas modifiée');
}
// ---------- renvoyer ----------
{
  const op: OfflineOp = { id: 'r', kind: 'record', collection: 'posts', record_id: 'p1', action: 'upsert', payload: { id: 'p1', v: 9 }, created_at: T0, tries: 0, state: 'review', bytes: 5 };
  const a = reapply({ posts: [{ id: 'p1', v: 1 }] }, op);
  ok(a.posts[0].v === 9 && a.posts.length === 1, 'renvoyer : la version de la personne remplace celle du serveur');
  ok(reapply({ posts: [] }, op).posts.length === 1 && reapply({}, op).posts.length === 1, 'renvoyer un élément qui n\'existe plus : recréé');
  ok(reapply({ posts: [{ id: 'p1' }] }, { ...op, action: 'delete' }).posts.length === 0, 'renvoyer une suppression');
  ok(reapply({ posts: [{ id: 'p1' }] }, { ...op, kind: 'call' }).posts.length === 1, 'un appel direct ne touche pas aux données');
}
// ---------- vitesse ----------
{
  const s: SyncedJson = { posts: new Map() };
  const recs = Array.from({ length: 40000 }, (_, i) => ({ id: 'p' + i, v: 1, note: 'x'.repeat(30) }));
  for (const r of recs) s.posts.set(r.id, j(r));
  const t0 = Date.now();
  const changed = recs.slice(0, 1500).map(r => ({ ...r, v: 2 }));
  const b = buildOps([], { posts: { upserts: changed, deletes: [] } }, s, 'employee', T0);
  const arrays = { posts: recs.map(r => ({ ...r })) };
  const ap = applyQueue(arrays, s, b.queue, 'employee');
  const ms = Date.now() - t0;
  ok(b.queue.length === 1500 && ap.applied.length === 1500 && ms < 1500, `40 000 éléments, 1 500 modifiés : actions construites et remises en ${ms} ms (< 1,5 s)`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
