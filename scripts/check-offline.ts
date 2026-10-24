// Contrôle des règles du mode hors ligne (module 13, M13.2), sans réseau. Lancer : npm run check:offline
import {
  OFFLINE_DEFAULTS, cleanOfflineLimits, collectionPolicy, callPolicy, enqueue, coalesce, retryDelayMs, dueOps, afterSent, afterNetworkFailure, afterRejected, reviewCodeFor,
  expireOld, requeue, discard, reviewList, trimReview, copyText, summary, detectConflict, mergeMoves, stockQty, moveOk, timeNote, copyExpired, tokenUsableOffline,
  pinValid, lockDelaySeconds, hashPin, verifyPin, newSalt, newOpId, sizeOf, REVIEW_TEXT, type OfflineOp, type Queue, type Role,
} from '../src/utils/offline';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const NOW = '2026-10-24T12:00:00.000Z';
const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
const MIN = 60_000, H = 3_600_000, D = 86_400_000;
let seq = 0;
const rec = (collection: string, record_id: string, payload: unknown = { id: record_id }, over: Partial<OfflineOp> = {}): OfflineOp => ({ id: 'op' + String(++seq).padStart(3, '0'), kind: 'record', collection, record_id, action: 'upsert', payload, created_at: NOW, tries: 0, state: 'pending', bytes: 0, ...over });
const call = (route: string, payload: unknown = {}, over: Partial<OfflineOp> = {}): OfflineOp => ({ id: 'op' + String(++seq).padStart(3, '0'), kind: 'call', route, payload, created_at: NOW, tries: 0, state: 'pending', bytes: 0, ...over });
const add = (q: Queue, op: OfflineOp, role: Role = 'employee') => { const r = enqueue(q, op, role); if (r.error) throw new Error('enqueue ' + r.error); return r.queue; };

// ---------- ce qui peut attendre ----------
{
  const op = (c: string, role: Role, rec?: any) => collectionPolicy(role, c, rec).mode;
  ok(['posts', 'messages', 'news', 'sheets'].every(c => op(c, 'employee') === 'queue'), 'opérateur : missions, messages, Actualités, tableaux peuvent attendre');
  ok(['cash', 'advances', 'purchases', 'suppliers', 'invoices', 'quotes', 'users', 'settings', 'clients', 'stock', 'leaves', 'reviews'].every(c => op(c, 'employee') === 'online'), 'opérateur : argent, comptes, réglages, clients, stock, congés : en ligne seulement');
  ok(['posts', 'contracts', 'messages', 'news', 'clients', 'stock', 'products', 'sheets'].every(c => op(c, 'admin') === 'queue'), 'admin : missions, stock, clients, Actualités, messages peuvent attendre (option B)');
  ok(['cash', 'advances', 'purchases', 'suppliers', 'users', 'settings', 'securityLogs'].every(c => op(c, 'admin') === 'online'), 'admin : paiements, paie, avances, achats, comptes, réglages : en ligne seulement');
  ok(op('invoices', 'admin', { status: 'draft' }) === 'queue' && op('quotes', 'admin', { status: 'draft', number: '' }) === 'queue', 'admin : brouillon de facture ou de devis sans numéro peut attendre');
  ok(op('invoices', 'admin', { status: 'draft', number: 'FA-2026-0001' }) === 'online' && op('invoices', 'admin', { status: 'issued' }) === 'online' && op('invoices', 'admin', null) === 'online' && op('invoices', 'admin') === 'online', 'admin : facture émise, avec numéro, ou sans information : en ligne seulement');
  ok(op('invoices', 'employee', { status: 'draft' }) === 'online', 'un opérateur n\'a aucune facture hors ligne');
  ok(op('posts', 'accountant') === 'online' && op('posts', 'team_lead') === 'online', 'Comptable et Chef d\'équipe : rien hors ligne (non décidé)');
  ok(op('inconnue', 'admin') === 'online' && op('', 'employee') === 'online', 'collection inconnue : en ligne (le plus sûr)');
  ok(callPolicy('employee', 'upload').mode === 'queue' && callPolicy('admin', 'upload').mode === 'queue' && callPolicy('employee', 'news-comment').mode === 'queue', 'photos et commentaires : peuvent attendre');
  ok(callPolicy('admin', 'post-decide').mode === 'queue' && callPolicy('employee', 'post-decide').mode === 'online', 'décision sur une mission : l\'admin seulement');
  ok(['login', 'forgot', 'signup', 'create-user', 'set-password', 'reset-decision', 'profile-request', 'profile-decision', 'signup-decision'].every(r => callPolicy('admin', r).mode === 'online' && callPolicy('employee', r).mode === 'online'), 'connexion, comptes, mots de passe : en ligne seulement');
  ok(callPolicy('admin', 'route-inconnue').mode === 'online' && callPolicy('admin', 'queue').mode === 'online' && callPolicy('admin', 'push-subscribe').mode === 'online', 'route inconnue, file « sans poste », notifications : en ligne');
  const all = [collectionPolicy('employee', 'cash'), callPolicy('admin', 'login'), collectionPolicy('admin', 'clients'), collectionPolicy('admin', 'invoices', { status: 'issued' })];
  ok(all.every(v => v.why.fr.length > 10 && v.why.en.length > 10 && !/[àâçéèêëîïôùûœ]/i.test(v.why.en)), 'chaque verdict dit pourquoi, en français et en anglais (sans accent dans l\'anglais)');
}
// ---------- file d'attente : ajout et limites ----------
{
  let q: Queue = [];
  q = add(q, rec('posts', 'p1'));
  ok(q.length === 1 && q[0].state === 'pending' && q[0].bytes > 0, 'ajout : une action en attente, taille calculée');
  const snap = JSON.stringify(q);
  const dup = enqueue(q, { ...q[0] }, 'employee');
  ok(dup.error === 'duplicate' && dup.queue === q && JSON.stringify(q) === snap, 'même numéro d\'action deux fois : refusé, file inchangée');
  ok(enqueue(q, rec('cash', 'c1'), 'employee').error === 'online_only' && enqueue(q, call('login'), 'admin').error === 'online_only', 'action qui demande la connexion : refusée avec un message');
  ok(enqueue(q, { ...rec('posts', 'p2'), created_at: 'pas une date' }, 'employee').error === 'bad_op' && enqueue(q, { ...rec('posts', 'p2'), id: '' }, 'employee').error === 'bad_op' && enqueue(q, null as any, 'employee').error === 'bad_op', 'action cassée (date fausse, sans numéro, vide) : refusée');
  const big = enqueue([], rec('posts', 'p3', { text: 'x'.repeat(OFFLINE_DEFAULTS.max_op_bytes + 10) }), 'employee');
  ok(big.error === 'op_too_big' && !!big.why?.fr, 'action trop grosse : refusée avec un message');
  const lim = { ...OFFLINE_DEFAULTS, max_ops: 3 };
  let q3: Queue = []; for (let i = 0; i < 3; i++) q3 = enqueue(q3, rec('posts', 'x' + i), 'employee', lim).queue;
  ok(enqueue(q3, rec('posts', 'x9'), 'employee', lim).error === 'queue_full', 'file pleine : refusée (jamais effacer pour faire de la place)');
  const withReview = afterRejected(q3, q3[0].id, 'refused');
  ok(enqueue(withReview, rec('posts', 'x9'), 'employee', lim).error === undefined, 'les éléments « À revoir » ne comptent pas dans la limite des actions en attente');
  const ph = (id: string, bytes: number) => call('upload', { id }, { photo_bytes: bytes });
  let qp: Queue = []; for (let i = 0; i < 20; i++) qp = enqueue(qp, ph('f' + i, 1000), 'employee').queue;
  ok(qp.length === 20 && enqueue(qp, ph('f20', 1000), 'employee').error === 'too_many_photos', '21e photo : refusée (limite 20)');
  const qb = enqueue([], ph('a', 25 * 1024 * 1024), 'employee').queue;
  ok(qb.length === 1 && enqueue(qb, ph('b', 6 * 1024 * 1024), 'employee').error === 'photos_too_big' && enqueue(qb, ph('b', 5 * 1024 * 1024), 'employee').error === undefined, 'photos : 30 Mo au total (25 + 6 refusé, 25 + 5 accepté)');
  ok(enqueue([], ph('z', 0), 'employee').queue.length === 1, 'appel sans photo : pas compté comme photo');
  ok(sizeOf({ a: 1 }) === 7 && sizeOf(undefined) === 4, 'taille d\'une action');
  const circular: any = {}; circular.self = circular;
  ok(enqueue([], rec('posts', 'c', circular), 'employee').error === 'op_too_big', 'contenu circulaire : refusé sans planter');
}
// ---------- fusion ----------
{
  let q: Queue = [];
  q = add(q, rec('posts', 'p1', { id: 'p1', v: 1 }, { created_at: ago(5 * MIN), base_updated_at: '2026-10-24T08:00:00.000Z', text: 'premier' }));
  q = add(q, rec('posts', 'p1', { id: 'p1', v: 2 }, { created_at: ago(3 * MIN), base_updated_at: '2026-10-24T09:00:00.000Z' }));
  q = add(q, rec('posts', 'p1', { id: 'p1', v: 3 }, { created_at: ago(1 * MIN) }));
  const c = coalesce(q);
  ok(c.length === 1 && (c[0].payload as any).v === 3, 'même élément modifié 3 fois hors ligne : une seule action, dernière valeur');
  ok(c[0].base_updated_at === '2026-10-24T08:00:00.000Z' && c[0].id === q[0].id && c[0].text === 'premier', 'fusion : version de départ et numéro de la première action gardés, texte gardé');
  const created = coalesce([rec('posts', 'n1', { id: 'n1' }, { created_offline: true }), rec('posts', 'n1', { id: 'n1' }, { action: 'delete', created_at: ago(MIN) })]);
  ok(created.length === 0, 'créé puis supprimé hors ligne : rien à envoyer');
  const existing = coalesce([rec('posts', 'e1', { id: 'e1', v: 1 }), rec('posts', 'e1', { id: 'e1' }, { action: 'delete' })]);
  ok(existing.length === 1 && existing[0].action === 'delete', 'modifié puis supprimé (existe sur le serveur) : une suppression reste');
  const calls = coalesce([call('upload', { n: 1 }), call('upload', { n: 1 })]);
  ok(calls.length === 2, 'appels directs (photos) : jamais fusionnés');
  const other = coalesce([rec('posts', 'a'), rec('posts', 'b'), rec('messages', 'a')]);
  ok(other.length === 3, 'éléments différents (ou collections différentes) : rien n\'est fusionné');
  const first = rec('posts', 'r1', { v: 1 });
  const refused = afterRejected([first], first.id, 'refused');
  const again = coalesce([...refused, rec('posts', 'r1', { v: 2 })]);
  ok(again.length === 2 && again.filter(o => o.state === 'review').length === 1 && again.filter(o => o.state === 'pending').length === 1, 'un élément « À revoir » n\'est jamais fusionné avec une nouvelle action sur le même élément');
  const base = [rec('posts', 'k1')]; const snap = JSON.stringify(base); coalesce(base);
  ok(JSON.stringify(base) === snap, 'fusion : la file reçue n\'est pas modifiée');
  ok(coalesce([]).length === 0, 'file vide');
}
// ---------- envoi, essais, refus ----------
{
  ok([0, 1, 2, 3, 4, 5, 50].map(retryDelayMs).join() === '2500,5000,10000,20000,30000,30000,30000' && retryDelayMs(-3) === 2500 && retryDelayMs(NaN) === 2500, 'délai entre essais : 2,5 s doublé jusqu\'à 30 s');
  const a = rec('posts', 'a', {}, { created_at: ago(3 * MIN) }), b = rec('posts', 'b', {}, { created_at: ago(5 * MIN) }), c = rec('posts', 'c', {}, { created_at: ago(1 * MIN) });
  const q = [a, b, c];
  ok(dueOps(q, NOW, true).map(o => o.record_id).join() === 'b,a,c', 'envoi dans l\'ordre où les actions ont été faites');
  ok(dueOps(q, NOW, false).length === 0, 'hors ligne : rien n\'est envoyé');
  ok(dueOps(q, NOW, true, 2).length === 2 && dueOps(q, NOW, true, 0).length === 0, 'envoi par lots');
  const f = afterNetworkFailure(q, a.id, NOW);
  const fa = f.find(o => o.id === a.id)!;
  ok(fa.tries === 1 && fa.state === 'pending' && fa.next_try_at === new Date(Date.parse(NOW) + 2500).toISOString(), 'panne de réseau : une action de plus, essai dans 2,5 s, toujours en attente');
  ok(!dueOps(f, NOW, true).some(o => o.id === a.id) && dueOps(f, new Date(Date.parse(NOW) + 3000).toISOString(), true).some(o => o.id === a.id), 'l\'action n\'est pas renvoyée avant son heure, puis elle l\'est');
  let g = f; for (let i = 0; i < 10; i++) g = afterNetworkFailure(g, a.id, NOW);
  ok(g.find(o => o.id === a.id)!.state === 'pending' && g.find(o => o.id === a.id)!.tries === 11, 'même après 11 pannes : jamais déplacée dans « À revoir »');
  const s = afterSent(q, [a.id, 'inconnu']);
  ok(s.length === 2 && !s.some(o => o.id === a.id), 'envoyée : sort de la file ; numéro inconnu : ignoré');
  const r = afterRejected(q, b.id, 'conflict');
  ok(r.find(o => o.id === b.id)!.state === 'review' && r.find(o => o.id === b.id)!.review_code === 'conflict' && dueOps(r, NOW, true).every(o => o.id !== b.id), 'refusée : va dans « À revoir » avec la raison, n\'est plus envoyée');
  ok(summary(r).pending === 2 && summary(r).review === 1, 'résumé : 2 en attente, 1 à revoir');
  ok(reviewCodeFor(409) === 'conflict' && reviewCodeFor(404) === 'not_found' && reviewCodeFor(403) === 'blocked' && reviewCodeFor(400, 'x') === 'invalid' && reviewCodeFor(422) === 'invalid' && reviewCodeFor(418) === 'refused', 'refus du serveur : raison selon le statut');
  ok(reviewCodeFor(401) === null && reviewCodeFor(429) === null && reviewCodeFor(500) === null && reviewCodeFor(503, 'maintenance') === null && reviewCodeFor(0) === null && reviewCodeFor(408) === null && reviewCodeFor(200) === null, 'connexion expirée, trop d\'appels, panne : rien n\'est refusé, on réessaie');
  ok((Object.keys(REVIEW_TEXT) as (keyof typeof REVIEW_TEXT)[]).every(k => REVIEW_TEXT[k].fr.length > 10 && REVIEW_TEXT[k].en.length > 10 && !/[àâçéèêëîïôùûœ]/i.test(REVIEW_TEXT[k].en)), 'chaque raison est écrite en français et en anglais');
}
// ---------- trop vieux ----------
{
  const old = rec('posts', 'old', {}, { created_at: ago(7 * D + MIN) }), edge = rec('posts', 'edge', {}, { created_at: ago(7 * D) }), fresh = rec('posts', 'fresh');
  const q = expireOld([old, edge, fresh], NOW, 'employee');
  ok(q.find(o => o.record_id === 'old')!.state === 'review' && q.find(o => o.record_id === 'old')!.review_code === 'too_old' && q.find(o => o.record_id === 'edge')!.state === 'pending' && q.find(o => o.record_id === 'fresh')!.state === 'pending', 'plus de 7 jours : « À revoir » (pile 7 jours : encore en attente)');
  ok(expireOld([old], NOW, 'employee', cleanOfflineLimits({ operator_days: 10 }))[0].state === 'pending', 'limite réglable');
  ok(expireOld([rec('posts', 'x', {}, { created_at: 'cassée' })], NOW, 'employee')[0].state === 'pending', 'date illisible : l\'action est gardée, pas jetée');
  const kept = expireOld([old], NOW, 'employee');
  ok(kept.length === 1 && kept[0].payload !== undefined, 'une action trop vieille n\'est jamais supprimée');
  const rq = requeue(q, q.find(o => o.record_id === 'old')!.id);
  ok(rq.find(o => o.record_id === 'old')!.state === 'pending' && rq.find(o => o.record_id === 'old')!.tries === 0 && rq.find(o => o.record_id === 'old')!.review_code === undefined, 'renvoyer depuis « À revoir » : de nouveau en attente');
  ok(requeue(q, q.find(o => o.record_id === 'fresh')!.id).find(o => o.record_id === 'fresh')!.state === 'pending', 'renvoyer une action déjà en attente : sans effet');
  ok(discard(q, q[0].id).length === 2 && discard(q, 'x').length === 3, 'supprimer : seulement le numéro demandé');
  ok(reviewList(q).length === 1, 'liste « À revoir »');
  const many: Queue = Array.from({ length: 12 }, (_, i) => rec('posts', 'r' + i, {}, { created_at: ago((20 - i) * MIN), state: 'review', review_code: 'refused' }));
  const t = trimReview([...many, rec('posts', 'p')], { ...OFFLINE_DEFAULTS, max_review: 10 });
  ok(t.dropped.length === 2 && t.dropped[0].record_id === 'r0' && t.queue.some(o => o.state === 'pending') && reviewList(t.queue).length === 10, '« À revoir » trop long : les 2 plus anciens sortent, jamais une action en attente');
  ok(trimReview(many, OFFLINE_DEFAULTS).dropped.length === 0, '« À revoir » dans la limite : rien ne sort');
}
// ---------- texte à copier ----------
{
  const withText = rec('news', 'n', { id: 'n' }, { text: 'Bonjour à tous', state: 'review', review_code: 'conflict' });
  ok(copyText(withText, 'fr').startsWith('Bonjour à tous') && copyText(withText, 'fr').includes('Quelqu\'un a modifié') && copyText(withText, 'en').includes('Someone changed'), 'texte à copier : le texte saisi, puis la raison (FR et EN)');
  ok(copyText(rec('posts', 'p', { id: 'p', note: 'ok' }), 'fr').includes('"note":"ok"'), 'sans texte saisi : le contenu de l\'action');
  ok(copyText({ ...rec('posts', 'p'), payload: undefined, text: '   ' }, 'fr').length > 0, 'jamais un texte vide');
  const circ: any = {}; circ.x = circ;
  ok(copyText({ ...rec('posts', 'p'), payload: circ }, 'fr') === '—', 'contenu circulaire : « — » sans planter');
}
// ---------- conflits ----------
{
  ok(detectConflict({ base_updated_at: '2026-10-24T08:00:00.000Z' }, '2026-10-24T09:00:00.000Z') === true, 'le serveur a une version plus récente : conflit');
  ok(detectConflict({ base_updated_at: '2026-10-24T09:00:00.000Z' }, '2026-10-24T09:00:00.000Z') === false && detectConflict({ base_updated_at: '2026-10-24T09:00:00.000Z' }, '2026-10-24T08:00:00.000Z') === false, 'même date ou serveur plus ancien : pas de conflit');
  ok(detectConflict({}, '2026-10-24T09:00:00.000Z') === false && detectConflict({ base_updated_at: '2026-10-24T09:00:00.000Z' }, undefined) === false && detectConflict({ base_updated_at: 'x' }, 'y') === false, 'date inconnue ou fausse : pas de conflit inventé');
}
// ---------- stock ----------
{
  const m = (id: string, type: any, qty: number, product_id = 'P') => ({ id, type, qty, product_id });
  const local = [m('1', 'in', 10), m('2', 'out', 3), m('local1', 'out', 2)];
  const server = [m('1', 'in', 10), m('2', 'out', 3), m('srv1', 'in', 5)];
  const merged = mergeMoves(local, server);
  ok(merged.length === 4 && stockQty(merged, 'P') === 10 && stockQty(merged, 'Q') === 0, 'deux appareils : mouvements additionnés (10 − 3 − 2 + 5 = 10), rien ne s\'écrase');
  ok(JSON.stringify(mergeMoves(server, local).map(x => x.id).sort()) === JSON.stringify(merged.map(x => x.id).sort()), 'fusion identique dans les deux sens');
  ok(mergeMoves(local, local).length === 3 && mergeMoves([], []).length === 0, 'même mouvement envoyé deux fois : compté une fois');
  ok(stockQty([m('a', 'adjust', -4), m('b', 'in', 6)], 'P') === 2 && stockQty([m('c', 'in', NaN)], 'P') === 0, 'ajustement négatif ; quantité cassée ignorée');
  ok(moveOk(m('a', 'in', 1)) && moveOk(m('a', 'out', 2)) && moveOk(m('a', 'adjust', -1)) && !moveOk(m('a', 'in', 0)) && !moveOk(m('a', 'out', -1)) && !moveOk(m('a', 'adjust', 0)) && !moveOk(m('', 'in', 1)) && !moveOk(null) && !moveOk({ id: 'a', product_id: 'P', type: 'zzz' as any, qty: 1 }) && !moveOk(m('a', 'in', NaN)), 'mouvement valable : entrée et sortie > 0, ajustement ≠ 0, avec numéro et produit');
}
// ---------- heure ----------
{
  const t = timeNote('2026-10-24T10:00:00.000Z', '2026-10-24T10:02:00.000Z')!;
  ok(t.trusted_at === '2026-10-24T10:02:00.000Z' && t.skew_min === -2 && !t.flagged, 'heure de confiance = heure du serveur ; écart de 2 min non signalé');
  const bad = timeNote('2026-10-24T08:00:00.000Z', '2026-10-24T10:00:00.000Z')!;
  ok(bad.flagged && bad.skew_min === -120 && bad.trusted_at === '2026-10-24T10:00:00.000Z', 'téléphone en retard de 2 h : signalé, l\'heure du serveur est gardée');
  ok(timeNote('2026-10-24T10:06:00.000Z', '2026-10-24T10:00:00.000Z')!.flagged && !timeNote('2026-10-24T10:05:00.000Z', '2026-10-24T10:00:00.000Z')!.flagged, 'limite à 5 minutes');
  ok(timeNote('x', '2026-10-24T10:00:00.000Z') === null && timeNote('2026-10-24T10:00:00.000Z', '') === null, 'heure illisible : pas de note inventée');
}
// ---------- copie locale et session ----------
{
  ok(copyExpired(ago(23 * H), 'admin', NOW) === false && copyExpired(ago(25 * H), 'admin', NOW) === true, 'copie admin : jetée après 24 h');
  ok(copyExpired(ago(6 * D), 'employee', NOW) === false && copyExpired(ago(8 * D), 'employee', NOW) === true, 'copie opérateur : jetée après 7 jours');
  ok(copyExpired(undefined, 'admin', NOW) && copyExpired('x', 'employee', NOW) && copyExpired(null, 'admin', NOW), 'date illisible : copie non gardée');
  ok(copyExpired(new Date(Date.parse(NOW) + 2 * H).toISOString(), 'employee', NOW) === true && copyExpired(new Date(Date.parse(NOW) + 2 * MIN).toISOString(), 'employee', NOW) === false, 'copie « du futur » (horloge fausse) : refusée au-delà de 5 min');
  ok(copyExpired(ago(30 * H), 'admin', NOW, cleanOfflineLimits({ admin_copy_hours: 48 })) === false, 'durée réglable');
  ok(tokenUsableOffline(Date.parse(NOW) + D, NOW) && !tokenUsableOffline(Date.parse(NOW) - 1, NOW) && !tokenUsableOffline(undefined, NOW) && tokenUsableOffline(new Date(Date.parse(NOW) + D).toISOString(), NOW) && !tokenUsableOffline('x', NOW) && !tokenUsableOffline(NaN, NOW), 'jeton : valable hors ligne tant qu\'il n\'a pas expiré (nombre ou date)');
}
// ---------- réglages ----------
{
  const d = OFFLINE_DEFAULTS;
  ok(JSON.stringify(cleanOfflineLimits(undefined)) === JSON.stringify(d) && JSON.stringify(cleanOfflineLimits('x')) === JSON.stringify(d) && JSON.stringify(cleanOfflineLimits([])) === JSON.stringify(d), 'rien ou n\'importe quoi = valeurs de départ');
  ok(cleanOfflineLimits({ operator_days: 14 }).operator_days === 14 && cleanOfflineLimits({ operator_days: 0 }).operator_days === 7 && cleanOfflineLimits({ operator_days: 99 }).operator_days === 7 && cleanOfflineLimits({ operator_days: NaN }).operator_days === 7 && cleanOfflineLimits({ operator_days: '7' }).operator_days === 7, 'réglage : bonne valeur gardée, absurde = départ');
  ok(cleanOfflineLimits({ max_photos: 0 }).max_photos === 0 && cleanOfflineLimits({ max_photos: 101 }).max_photos === 20, 'photos : 0 permis (désactive), 101 refusé');
  ok(d.operator_days === 7 && d.admin_copy_hours === 24 && d.max_photos === 20 && d.max_photo_bytes === 30 * 1024 * 1024, 'valeurs de départ = décisions de BTK (7 jours, 24 h, 20 photos, 30 Mo)');
}
// ---------- code de verrouillage ----------
{
  ok(pinValid('4827').ok && pinValid('730915').ok && pinValid('19283746').ok, 'codes valables');
  ok(!pinValid('123').ok && !pinValid('123456789').ok && !pinValid('12a4').ok && !pinValid('').ok && !pinValid(1234 as any).ok && !pinValid(null).ok && !pinValid('12 34').ok, 'code trop court, trop long, avec lettre, vide, pas un texte : refusé');
  ok(!pinValid('0000').ok && !pinValid('777777').ok && !pinValid('1234').ok && !pinValid('4321').ok && !pinValid('56789').ok && !pinValid('1212').ok && !pinValid('123123').ok, 'même chiffre, suites, répétitions : refusés');
  ok(pinValid('1235').ok && pinValid('1357').ok, 'presque une suite : accepté');
  ok(!!pinValid('0000').why!.fr && !!pinValid('0000').why!.en, 'le refus dit pourquoi, en FR et EN');
  ok([0, 1, 2, 3, 4, 5, 6, 7, 20].map(lockDelaySeconds).join() === '0,0,0,30,60,300,900,3600,3600' && lockDelaySeconds(-1) === 0 && lockDelaySeconds(NaN) === 0, 'attente après erreurs : 0, 0, 0, 30 s, 1 min, 5 min, 15 min, 1 h');
  const salt = newSalt();
  ok(/^[0-9a-f]{32}$/.test(salt) && newSalt() !== salt, 'sel aléatoire de 16 octets');
  const h = await hashPin('4827', salt, 1000);
  ok(/^[0-9a-f]{64}$/.test(h) && !h.includes('4827'), 'empreinte de 64 caractères, le code n\'y est pas');
  ok(await verifyPin('4827', salt, h, 1000) && !(await verifyPin('4828', salt, h, 1000)) && !(await verifyPin('4827', newSalt(), h, 1000)), 'bon code accepté ; mauvais code ou mauvais sel refusé');
  ok(!(await verifyPin('4827', salt, 'pas-une-empreinte', 1000)) && !(await verifyPin(undefined as any, salt, h, 1000)), 'empreinte cassée ou code absent : refusé sans planter');
  ok(await hashPin('4827', salt, 1000) === h && await hashPin('4827', salt, 2000) !== h, 'même code + même sel = même empreinte (et le nombre de tours compte)');
}
// ---------- numéros d'action ----------
{
  let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const ids = new Set(Array.from({ length: 2000 }, () => newOpId(rnd)));
  ok(ids.size === 2000 && [...ids].every(i => /^[0-9a-f]{24}$/.test(i)), '2 000 numéros d\'action uniques de 24 caractères');
}
// ---------- vitesse ----------
{
  let q: Queue = [];
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) q.push(rec('posts', 'p' + (i % 700), { i }, { created_at: ago((2000 - i) * 1000) }));
  q = coalesce(q);
  const due = dueOps(q, NOW, true, 50);
  const sm = summary(q);
  const ms = Date.now() - t0;
  ok(q.length === 700 && due.length === 50 && sm.pending === 700 && ms < 500, `2 000 actions fusionnées en 700 : ${ms} ms (< 500 ms)`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
