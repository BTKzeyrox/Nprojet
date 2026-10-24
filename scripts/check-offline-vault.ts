// Contrôle de la copie locale chiffrée du mode hors ligne (module 13, M13.3), sans réseau. Lancer : npm run check:offline-vault
// Le chiffrement est RÉEL (AES-GCM, PBKDF2) ; on réduit seulement le nombre de tours pour que l'essai soit rapide.
import {
  memoryKV, createVault, unlockVault, putCopy, getCopy, putQueue, getQueue, pendingCount, wipeVault, wipeAllVaults, changePin, filterForDevice,
  ADMIN_COLLECTIONS, ADMIN_SETTINGS_KEYS, USER_FIELDS, OPERATOR_DENIED, type KV, type Vault,
} from '../src/utils/offlineVault';
import type { OfflineOp, Queue } from '../src/utils/offline';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const NOW = '2026-10-24T12:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const H = 3_600_000, D = 86_400_000, S = 1000;
const IT = { iterations: 2000 };
const MARK = 'SECRET-PRIX-ACHAT-987654';
let seq = 0;
const op = (over: Partial<OfflineOp> = {}): OfflineOp => ({ id: 'o' + ++seq, kind: 'record', collection: 'stock', record_id: 'm' + seq, action: 'upsert', payload: { id: 'm' + seq, note: MARK }, created_at: NOW, tries: 0, state: 'pending', bytes: 50, ...over });
const state = () => ({
  users: [{ id: 'u1', name: 'Rina', username: 'rina', role: 'employee', status: 'active', shift: 'day', phone: '0341234567', password_hash: 'XYZ', token: 'TOK', total_score_boosted: 99 }],
  posts: [{ id: 'p1', client_price_ar: 5000, note: MARK }], contracts: [{ id: 'k1' }], messages: [{ id: 'm1' }], groups: [], news: [{ id: 'n1' }], clients: [{ id: 'c1', name: 'Alpha' }],
  products: [{ id: 'pr1', name: 'Clé', buy_price_ar: 100 }], stock: [{ id: 's1', product_id: 'pr1', type: 'in', qty: 5 }], sheets: [{ id: 'sh1' }],
  settings: [{ id: 'general', day_shift_start: '08:00', price_per_mission: 7777, advance_cap_pct: 50, company: { bank: 'IBAN-SECRET' }, budgets: { x: 1 }, post_types: ['WEB'], rules: 'Règlement' }],
  cash: [{ id: 'cash1', amount_ar: 1000000 }], advances: [{ id: 'a1' }], invoices: [{ id: 'i1' }], quotes: [{ id: 'q1' }], suppliers: [{ id: 'su1' }], purchases: [{ id: 'pu1' }], leaves: [{ id: 'l1' }], reviews: [{ id: 'r1' }], securityLogs: [{ id: 'sl1' }],
});
const rawText = (kv: ReturnType<typeof memoryKV>) => JSON.stringify([...kv.raw.entries()]);
const must = async (kv: KV, uid: string, role: 'admin' | 'employee', pin?: string): Promise<Vault> => { const r = await createVault(kv, uid, role, pin, IT); if (r.status !== 'ok') throw new Error('create ' + r.status); return r.vault; };

// ---------- ce qui est gardé ----------
{
  const a = filterForDevice('admin', state()) as any;
  ok(ADMIN_COLLECTIONS.every(c => c in a) && Object.keys(a).length === ADMIN_COLLECTIONS.length, 'admin : seulement les collections prévues (missions, stock, clients, Actualités, messages…)');
  ok(!['cash', 'advances', 'invoices', 'quotes', 'suppliers', 'purchases', 'leaves', 'reviews', 'securityLogs'].some(c => c in a), 'admin : jamais paiements, avances, factures, devis, achats, fournisseurs, congés, évaluations, journal de sécurité');
  ok(JSON.stringify(a.users[0]) === JSON.stringify({ id: 'u1', name: 'Rina', username: 'rina', role: 'employee', status: 'active', shift: 'day' }) && !JSON.stringify(a.users).includes('0341234567') && !JSON.stringify(a.users).includes('XYZ') && !JSON.stringify(a.users).includes('TOK'), 'admin : comptes réduits (ni téléphone, ni mot de passe, ni jeton, ni score)');
  const st = a.settings[0];
  ok(st.post_types[0] === 'WEB' && st.day_shift_start === '08:00' && st.rules === 'Règlement' && !('price_per_mission' in st) && !('advance_cap_pct' in st) && !('company' in st) && !('budgets' in st) && !JSON.stringify(a).includes('IBAN-SECRET'), 'admin : réglages réduits (horaires, postes, règlement ; ni prix, ni paie, ni société, ni budgets)');
  ok(a.posts[0].client_price_ar === 5000 && a.products[0].buy_price_ar === 100, 'admin : les missions et produits gardés restent COMPLETS (sinon une modification hors ligne effacerait le prix) — c\'est le chiffrement qui protège');
  const e = filterForDevice('employee', state()) as any;
  ok(OPERATOR_DENIED.every(c => !(c in e)) && ['users', 'posts', 'contracts', 'messages', 'news', 'sheets', 'settings', 'leaves', 'reviews'].every(c => c in e), 'opérateur : tout sauf argent, clients, stock, journal de sécurité');
  ok(Object.keys(filterForDevice('accountant', state())).length === 0 && Object.keys(filterForDevice('team_lead', state())).length === 0, 'Comptable et Chef d\'équipe : rien n\'est gardé');
  const base = state(); const snap = JSON.stringify(base); filterForDevice('admin', base); filterForDevice('employee', base);
  ok(JSON.stringify(base) === snap, 'l\'état reçu n\'est jamais modifié');
  ok(Object.keys(filterForDevice('admin', null as any)).length === 0 && Object.keys(filterForDevice('admin', {} as any)).length === 0 && filterForDevice('admin', { users: 'cassé' } as any).users === 'cassé' && USER_FIELDS.length > 0 && ADMIN_SETTINGS_KEYS.includes('id' as never), 'état vide ou cassé : pas de plantage');
}
// ---------- création ----------
{
  const kv = memoryKV();
  ok((await createVault(kv, 'ad', 'admin', undefined, IT)).status === 'no_pin' && (await createVault(kv, 'ad', 'admin', '', IT)).status === 'no_pin', 'admin sans code : pas de copie');
  ok((await createVault(kv, 'ad', 'admin', '1234', IT)).status === 'weak_pin' && (await createVault(kv, 'ad', 'admin', '12', IT)).status === 'weak_pin', 'code faible ou trop court : refusé avec la raison');
  ok((await createVault(kv, 'ad', 'accountant', '4827', IT)).status === 'not_allowed' && (await createVault(kv, '', 'admin', '4827', IT)).status === 'not_allowed' && kv.raw.size === 0, 'Comptable ou identifiant vide : refusé, rien d\'écrit');
  const r = await createVault(kv, 'ad', 'admin', '4827', IT);
  ok(r.status === 'ok' && r.vault.enc && !!r.vault.key && kv.raw.has('meta:ad'), 'admin avec un bon code : copie chiffrée créée');
  ok(!rawText(kv).includes('4827'), 'le code n\'est écrit nulle part');
  const again = await createVault(kv, 'ad', 'admin', '4827', IT);
  ok(again.status === 'exists', 'une copie existe déjà : refusé (elle peut contenir des actions en attente)');
  const op2 = await createVault(kv, 'op', 'employee', undefined, IT);
  ok(op2.status === 'ok' && !op2.vault.enc && op2.vault.key === null, 'opérateur sans code : copie non chiffrée');
  const op3 = await createVault(kv, 'op2', 'employee', '4827', IT);
  ok(op3.status === 'ok' && op3.vault.enc, 'opérateur avec un code : chiffrée aussi');
  const broken: KV = { ...memoryKV(), set: async () => false };
  ok((await createVault(broken, 'ad', 'admin', '4827', IT)).status === 'storage_error', 'appareil plein : message clair, pas d\'exception');
}
// ---------- aller-retour chiffré ----------
{
  const kv = memoryKV();
  const v = await must(kv, 'ad', 'admin', '4827');
  const p = await putCopy(v, state(), NOW);
  ok(p.ok && p.bytes > 100, 'copie admin enregistrée');
  const q: Queue = [op(), op({ payload: { id: 'x', note: MARK } })];
  ok((await putQueue(v, q)).ok, 'file d\'actions enregistrée');
  ok(!rawText(kv).includes(MARK) && !rawText(kv).includes('Rina') && !rawText(kv).includes('Alpha') && !rawText(kv).includes('"stock"'), 'sur le disque : aucun texte lisible (ni nom, ni prix, ni note)');
  const u = await unlockVault(kv, 'ad', 'admin', '4827', at(10 * 60_000));
  ok(u.status === 'ok', 'bon code : ouvert');
  if (u.status !== 'ok') throw new Error('unlock');
  const c = await getCopy(u.vault);
  ok(c.status === 'ok' && c.status === 'ok' && (c as any).saved_at === NOW && (c as any).state.posts[0].note === MARK && !('cash' in (c as any).state), 'copie relue : identique, sans argent, avec son heure');
  const qq = await getQueue(u.vault);
  ok(qq.status === 'ok' && (qq as any).queue.length === 2 && (qq as any).queue[0].payload.note === MARK && await pendingCount(u.vault) === 2, 'file relue : identique, 2 actions en attente');
  ok((await unlockVault(kv, 'ad', 'admin', undefined, NOW)).status === 'locked', 'sans code : verrouillé');
  const w = await unlockVault(kv, 'ad', 'admin', '4828', NOW);
  ok(w.status === 'wrong_pin' && (w as any).wait_seconds === 0 && kv.raw.has('copy:ad') && kv.raw.has('queue:ad'), 'mauvais code : refusé, RIEN n\'est effacé');
  ok((await unlockVault(kv, 'ad', 'admin', '4827', NOW)).status === 'ok', 'le bon code marche encore après une erreur');
  ok((await unlockVault(kv, 'ad2', 'admin', '4827', NOW)).status === 'none', 'autre personne : aucune copie');
  ok((await unlockVault(kv, 'ad', 'employee', '4827', NOW)).status === 'wrong_user', 'même identifiant mais autre rôle : refusé');
  const v2 = await must(kv, 'op', 'employee');
  await putCopy(v2, state(), NOW); await putQueue(v2, [op()]);
  const o = await unlockVault(kv, 'op', 'employee', undefined, at(D));
  ok(o.status === 'ok' && (await getCopy((o as any).vault)).status === 'ok' && JSON.stringify([...kv.raw.entries()].filter(([k]) => k === 'copy:op')).includes('Rina'), 'opérateur sans code : relu sans code (copie non chiffrée)');
}
// ---------- essais ratés : attentes ----------
{
  const kv = memoryKV();
  const v = await must(kv, 'ad', 'admin', '4827'); await putCopy(v, state(), NOW);
  const bad = (t: number) => unlockVault(kv, 'ad', 'admin', '0000x'.slice(0, 4) + '9', at(t));
  const seqW: string[] = [];
  for (const t of [0, 1, 2]) { const r = await bad(t * S); seqW.push(r.status + ':' + ((r as any).wait_seconds ?? '')); }
  ok(seqW.join() === 'wrong_pin:0,wrong_pin:0,wrong_pin:30', '3 erreurs de suite : à la 3e, 30 s d\'attente annoncées');
  const during = await unlockVault(kv, 'ad', 'admin', '4827', at(2 * S + 10 * S));
  ok(during.status === 'wait' && (during as any).wait_seconds === 20, 'pendant l\'attente, même le BON code est refusé (20 s restantes)');
  ok((await unlockVault(kv, 'ad', 'admin', '4827', at(2 * S + 31 * S))).status === 'ok', 'après l\'attente : le bon code ouvre et remet le compteur à zéro');
  ok(!kv.raw.has('fail:ad'), 'compteur d\'erreurs effacé après un succès');
  let last: any; for (let i = 0; i < 7; i++) last = await bad(100 * S + i * 4000 * S);
  ok(last.status === 'wrong_pin' && last.wait_seconds === 3600, '7 erreurs : attente d\'1 heure');
  ok(kv.raw.has('copy:ad') && kv.raw.has('meta:ad'), 'même après 7 erreurs : la copie n\'est JAMAIS effacée');
}
// ---------- expiration ----------
{
  const kv = memoryKV();
  const v = await must(kv, 'ad', 'admin', '4827'); await putCopy(v, state(), NOW); await putQueue(v, [op()]);
  ok((await unlockVault(kv, 'ad', 'admin', '4827', at(23 * H))).status === 'ok', 'copie admin de 23 h : encore bonne');
  const e = await unlockVault(kv, 'ad', 'admin', '4827', at(25 * H));
  ok(e.status === 'expired' && kv.raw.size === 0, 'copie admin de 25 h : expirée, TOUT est effacé');
  const kv2 = memoryKV();
  const v2 = await must(kv2, 'op', 'employee'); await putCopy(v2, state(), NOW);
  ok((await unlockVault(kv2, 'op', 'employee', undefined, at(6 * D))).status === 'ok' && (await unlockVault(kv2, 'op', 'employee', undefined, at(8 * D))).status === 'expired', 'opérateur : bonne à 6 jours, expirée à 8 jours');
  const kv3 = memoryKV();
  const v3 = await must(kv3, 'ad', 'admin', '4827');
  ok((await unlockVault(kv3, 'ad', 'admin', '4827', at(30 * D))).status === 'ok', 'copie jamais enregistrée (pas d\'heure) : pas d\'expiration inventée');
}
// ---------- contenu abîmé, version, taille, stockage ----------
{
  const kv = memoryKV();
  const v = await must(kv, 'ad', 'admin', '4827'); await putCopy(v, state(), NOW); await putQueue(v, [op()]);
  const rec: any = kv.raw.get('copy:ad'); const ct = rec.ct as string;
  rec.ct = ct.slice(0, 40) + (ct[40] === 'A' ? 'B' : 'A') + ct.slice(41);
  ok((await getCopy(v)).status === 'corrupt' && (await getQueue(v)).status === 'ok', 'copie modifiée : détectée (« abîmée »), la file reste lisible');
  kv.raw.set('queue:ad', { v: 1, iv: 'x', ct: 'y' });
  ok((await getQueue(v)).status === 'corrupt', 'file illisible : « abîmée » sans plantage');
  kv.raw.set('copy:ad', { v: 99, iv: 'a', ct: 'b' });
  ok((await getCopy(v)).status === 'newer_version', 'copie écrite par une version plus récente : on n\'y touche pas');
  const meta: any = kv.raw.get('meta:ad'); kv.raw.set('meta:ad', { ...meta, v: 99 });
  ok((await unlockVault(kv, 'ad', 'admin', '4827', NOW)).status === 'newer_version' && kv.raw.has('copy:ad'), 'fiche d\'une version plus récente : refusée, rien d\'effacé');
  kv.raw.set('meta:ad', { ...meta, salt: null });
  ok((await unlockVault(kv, 'ad', 'admin', '4827', NOW)).status === 'corrupt', 'fiche sans sel : « abîmée »');
  kv.raw.set('meta:ad', 'n\'importe quoi');
  ok((await unlockVault(kv, 'ad', 'admin', '4827', NOW)).status === 'corrupt' && kv.raw.has('copy:ad'), 'fiche absurde : « abîmée » sans plantage, rien d\'effacé tout seul');
  ok((await createVault(kv, 'ad', 'admin', '4827', IT)).status === 'exists', 'fiche abîmée : on ne peut pas créer par-dessus, il faut l\'effacer explicitement');
  const kv2 = memoryKV(); const v2 = await must(kv2, 'ad', 'admin', '4827');
  const big = { ...state(), posts: [{ id: 'x', note: 'z'.repeat(2_000_000) }] };
  const r = await putCopy(v2, big, NOW, 1_000_000);
  ok(!r.ok && (r as any).reason === 'too_big' && !!(r as any).why.fr && !kv2.raw.has('copy:ad'), 'données trop grosses : refusées avec un message, ancienne copie intacte');
  const full: KV = { ...kv2, set: async (k: string, val: unknown) => (k.startsWith('copy:') ? false : kv2.set(k, val)) };
  const rf = await putCopy({ ...v2, kv: full }, state(), NOW);
  ok(!rf.ok && (rf as any).reason === 'storage_error', 'appareil plein : message clair, pas d\'exception');
  ok(!(await putCopy({ ...v2, role: 'accountant' }, state(), NOW)).ok && !(await putQueue({ ...v2, role: 'team_lead' }, [])).ok, 'Comptable et Chef d\'équipe : rien n\'est enregistré');
  const vm = await must(memoryKV(), 'zz', 'admin', '4827'); await vm.kv.del('meta:zz');
  ok((await putCopy(vm, state(), NOW) as any).reason === 'no_meta', 'copie non initialisée : refus clair');
  ok((await getCopy(await must(memoryKV(), 'e', 'employee'))).status === 'none' && (await getQueue(await must(memoryKV(), 'e', 'employee'))).status === 'none', 'rien d\'enregistré : « aucune copie »');
}
// ---------- changement de code sans perte ----------
{
  const kv = memoryKV();
  const v = await must(kv, 'ad', 'admin', '4827'); await putCopy(v, state(), NOW); await putQueue(v, [op(), op()]);
  const oldMeta = JSON.stringify(kv.raw.get('meta:ad'));
  ok((await changePin(v, undefined, NOW, IT)).status === 'no_pin' && (await changePin(v, '1111', NOW, IT)).status === 'weak_pin' && JSON.stringify(kv.raw.get('meta:ad')) === oldMeta, 'admin : retirer le code ou en mettre un faible est refusé, rien ne change');
  const r = await changePin(v, '90817', at(H), IT);
  ok(r.status === 'ok', 'code changé');
  if (r.status !== 'ok') throw new Error('changePin');
  ok((await unlockVault(kv, 'ad', 'admin', '4827', at(2 * H))).status === 'wrong_pin', 'l\'ancien code ne marche plus');
  const u = await unlockVault(kv, 'ad', 'admin', '90817', at(2 * H));
  ok(u.status === 'ok' && (await getCopy((u as any).vault)).status === 'ok' && await pendingCount((u as any).vault) === 2, 'le nouveau code ouvre : copie et 2 actions en attente retrouvées (rien perdu)');
  ok(!rawText(kv).includes(MARK), 'toujours aucun texte lisible sur le disque');
  ok(((await getCopy((u as any).vault)) as any).saved_at === NOW, 'l\'heure de la copie est conservée (changer le code ne rajeunit pas la copie)');
  const kv2 = memoryKV(); const vo = await must(kv2, 'op', 'employee', '4827'); await putQueue(vo, [op()]);
  const plain = await changePin(vo, undefined, NOW, IT);
  ok(plain.status === 'ok' && !(plain as any).vault.enc && JSON.stringify([...kv2.raw.entries()]).includes(MARK) && await pendingCount((plain as any).vault) === 1, 'opérateur : retirer le code garde les actions (copie non chiffrée)');
  const kv3 = memoryKV(); const v3 = await must(kv3, 'ad', 'admin', '4827'); await putQueue(v3, [op()]);
  kv3.raw.set('queue:ad', { v: 1, iv: 'x', ct: 'y' });
  const before = JSON.stringify([...kv3.raw.entries()]);
  ok((await changePin(v3, '90817', NOW, IT)).status === 'storage_error' && JSON.stringify([...kv3.raw.entries()]) === before, 'file illisible : le changement de code est refusé, RIEN n\'est réécrit par-dessus');
  const kv4 = memoryKV(); const v4 = await must(kv4, 'ad', 'admin', '4827'); await putCopy(v4, state(), NOW);
  const flaky: KV = { ...kv4, set: async (k: string, val: unknown) => (k === 'meta:ad' ? false : kv4.set(k, val)) };
  ok((await changePin({ ...v4, kv: flaky }, '90817', NOW, IT)).status === 'storage_error', 'coupure à la dernière étape : erreur annoncée');
}
// ---------- effacement ----------
{
  const kv = memoryKV();
  const a = await must(kv, 'ad', 'admin', '4827'); await putCopy(a, state(), NOW); await putQueue(a, [op()]);
  const b = await must(kv, 'op', 'employee'); await putCopy(b, state(), NOW); await putQueue(b, [op()]);
  await kv.set('autre:truc', 1);
  await wipeVault(kv, 'ad');
  ok(![...kv.raw.keys()].some(k => k.endsWith(':ad')) && kv.raw.has('meta:op') && kv.raw.has('autre:truc'), 'effacer une personne : seulement la sienne');
  await wipeAllVaults(kv);
  ok(kv.raw.size === 1 && kv.raw.has('autre:truc'), 'tout effacer : copies, files et compteurs, mais pas les autres données de l\'appareil');
}
// ---------- vitesse ----------
{
  const kv = memoryKV();
  const t0 = Date.now();
  const v = await must(kv, 'ad', 'admin', '4827');
  const q: Queue = Array.from({ length: 2000 }, () => op());
  const s: any = state(); s.posts = Array.from({ length: 20000 }, (_, i) => ({ id: 'p' + i, status: 'completed', client_name: 'Client', note: 'x'.repeat(40) }));
  await putCopy(v, s, NOW); await putQueue(v, q);
  const u = await unlockVault(kv, 'ad', 'admin', '4827', NOW);
  const c = await getCopy((u as any).vault), qq = await getQueue((u as any).vault);
  const ms = Date.now() - t0;
  ok(c.status === 'ok' && (c as any).state.posts.length === 20000 && qq.status === 'ok' && (qq as any).queue.length === 2000 && ms < 4000, `20 000 missions + 2 000 actions chiffrées, enregistrées et relues : ${ms} ms (< 4 s)`);
  const t1 = Date.now(); for (let i = 0; i < 20; i++) await putQueue(v, q.slice(0, 50 + i)); const per = (Date.now() - t1) / 20;
  ok(per < 100, `enregistrer la file à chaque action (clé déjà prête) : ${per.toFixed(1)} ms par action (< 100 ms)`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
