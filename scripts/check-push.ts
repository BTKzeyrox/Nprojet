// Contrôle des notifications push (M6.4) : règles, chiffrement (exemple officiel RFC 8291), signature VAPID, copie serveur. Lancer : npm run check:push
import { readFileSync } from 'node:fs';
import { createHmac, createDecipheriv, createECDH, createPublicKey, verify } from 'node:crypto';
import { transformSync } from 'esbuild';
import { cleanPushSubscription, dueAtMs, dueReminders, pushText, type Reminder } from '../src/utils/pushRules';

let fails = 0;
const eq = (got: unknown, want: unknown, name: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const b64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

// ---- Bloc serveur ----
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
const js = transformSync(grab('MISSIONS') + '\n' + grab('PUSH') + '\n;globalThis.__s = { pushText, dueAtMs, dueReminders, cleanPushSubscription, encryptPush, generateVapidKeys, vapidHeader };', { loader: 'ts' }).code;
new Function('createHmac', 'Buffer', js)(createHmac, Buffer);
const S = (globalThis as any).__s;

// ---- Textes ----
const t = pushText('refused', { post_number: 7, title: 'Mon client', reason: 'Capture floue' });
eq(t.fr, { title: 'Mission refusée', body: '#7 Mon client : Capture floue' }, 'texte refus FR avec motif');
eq(t.en.title, 'Mission refused', 'texte refus EN');
eq(pushText('start_ok', {}).fr.body, '— : tu peux commencer.', 'sans titre : tiret');
eq(pushText('late', { title: 'x'.repeat(200) }).fr.body.length < 100, true, 'titre trop long coupé');

// ---- Échéances ----
const NOW = Date.parse('2026-10-21T10:00:00+03:00');
const c = (o: object) => ({ id: 'c1', post_number: 3, client_name: 'Alice', initial_score: 0, target_score: 100, ...o });
const post = [{ employee_id: 'e1', status: 'active', post_number: 3, client_name: 'Alice' }];
eq(dueAtMs('2026-10-21', '12:00'), Date.parse('2026-10-21T12:00:00+03:00'), 'échéance à l\'heure de Madagascar');
eq(dueAtMs('2026-10-21'), Date.parse('2026-10-21T23:59:00+03:00'), 'sans heure : 23:59');
eq(Number.isNaN(dueAtMs('2026-02-30')), true, 'fausse date : NaN');
const r = (cs: any[], ps = post, now = NOW) => dueReminders(cs, ps, now).map((x: Reminder) => `${x.kind}:${x.user_ids.join(',')}:${x.admins}`);
eq(r([c({ due_date: '2026-10-21', due_time: '10:30' })]), ['due_1h:e1:false'], 'dans 30 min avec heure : rappel 1 h');
eq(r([c({ due_date: '2026-10-21', due_time: '18:00' })]), ['due_24h:e1:false'], 'dans 8 h : rappel 24 h');
eq(r([c({ due_date: '2026-10-21' })]), ['due_24h:e1:false'], 'sans heure, ce soir : rappel 24 h');
eq(r([c({ due_date: '2026-10-23', due_time: '10:00' })]), [], 'dans 2 jours : rien');
eq(r([c({ due_date: '2026-10-20', due_time: '10:00' })]), ['late:e1:true'], 'en retard : opérateur et admins');
eq(r([c({ due_date: '2026-10-20', due_time: '10:00' })], []), ['late::true'], 'en retard sans opérateur : admins seuls');
eq(r([c({ due_date: '2026-10-21', due_time: '18:00' })], []), [], 'rappel 24 h sans opérateur : rien');
eq(r([c({ due_date: '2026-10-10' })]), [], 'retard de plus de 3 jours : rien');
eq(r([c({ due_date: '2026-10-20', due_time: '10:00', current_score: 100 })]), [], 'mission terminée : rien');
eq(r([c({ due_date: '2026-10-20', due_time: '10:00', no_account: true })]), [], 'sans compte : rien');
eq(r([c({ due_date: '2026-10-20', due_time: '10:00', client_name: ' ' })]), [], 'sans titre : rien');
eq(r([c({ due_date: 'oups' })]), [], 'date fausse : rien');
eq(dueReminders([c({ due_date: '2026-10-21', due_time: '18:00' })], post, NOW)[0].key, 'c1:due_24h:2026-10-21:18:00', 'clé = mission + type + échéance');
eq(r([c({ due_date: '2026-10-21', due_time: '18:00' })], [{ employee_id: 'e9', status: 'completed', post_number: 3, client_name: 'Alice' }]), [], 'session terminée : personne à prévenir');

// ---- Abonnement ----
const goodSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123def456', keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } };
eq(cleanPushSubscription(goodSub), { endpoint: goodSub.endpoint, p256dh: goodSub.keys.p256dh, auth: goodSub.keys.auth }, 'abonnement valide');
eq([null, 'x', [], { ...goodSub, endpoint: 'http://a.b/cccccccccccccccc' }, { ...goodSub, endpoint: 'https://a.b' }, { ...goodSub, keys: { ...goodSub.keys, p256dh: 'AAAA' } }, { ...goodSub, keys: { p256dh: goodSub.keys.p256dh } }, { ...goodSub, keys: { ...goodSub.keys, auth: 'é'.repeat(22) } }].map(x => cleanPushSubscription(x)), [null, null, null, null, null, null, null, null], 'abonnements faux refusés');
for (const [i, x] of [goodSub, { ...goodSub, endpoint: 'http://a.b/cccccccccccccccc' }, { ...goodSub, keys: { ...goodSub.keys, p256dh: 'AAAA' } }].entries()) eq(S.cleanPushSubscription(x), cleanPushSubscription(x), `serveur = site (abonnement ${i})`);

// ---- Serveur = site (règles) ----
const cases = [[c({ due_date: '2026-10-21', due_time: '10:30' })], [c({ due_date: '2026-10-20' }), c({ id: 'c2', post_number: 4, client_name: 'Bob', due_date: '2026-10-21', due_time: '11:00' })], [c({ due_date: '2026-10-10' })]];
for (const [i, cs] of cases.entries()) eq(S.dueReminders(cs, post, NOW), dueReminders(cs as any, post, NOW), `serveur = site (échéances ${i})`);
for (const k of ['start_ok', 'end_ok', 'refused', 'due_24h', 'due_1h', 'late'] as const) eq(S.pushText(k, { post_number: 2, title: 'T', reason: 'R', due: '21/10/2026' }), pushText(k, { post_number: 2, title: 'T', reason: 'R', due: '21/10/2026' }), `serveur = site (texte ${k})`);

// ---- Chiffrement : exemple officiel RFC 8291 annexe A ----
(async () => {
  const pt = new TextEncoder().encode('When I grow up, I want to be a watermelon');
  const ua = b64u('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');
  const auth = b64u('BTBZMqHH6r4Tts7J_aSIgg');
  const body: Uint8Array = await S.encryptPush(ua, auth, pt, { asPrivate: b64u('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), asPublic: b64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'), salt: b64u('DGv6ra1nlYgDCS1FRnbzlw') });
  eq(Buffer.from(body).toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN', 'chiffrement = exemple officiel du standard (RFC 8291)');

  // Aller-retour indépendant : déchiffrer avec node:crypto, côté « téléphone »
  const dev = createECDH('prime256v1'); dev.generateKeys();
  const devAuth = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
  const msg = JSON.stringify({ fr: { title: 'é', body: 'mission ✓' } });
  const enc: Uint8Array = await S.encryptPush(new Uint8Array(dev.getPublicKey()), new Uint8Array(devAuth), new TextEncoder().encode(msg));
  const salt = enc.slice(0, 16), idlen = enc[20], asPub = enc.slice(21, 21 + idlen), ct = enc.slice(21 + idlen);
  const hm = (k: Uint8Array, d: Uint8Array) => createHmac('sha256', k).update(d).digest();
  const secret = dev.computeSecret(Buffer.from(asPub));
  const ikm = hm(hm(devAuth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), dev.getPublicKey(), Buffer.from(asPub), Buffer.from([1])])).subarray(0, 32);
  const prk = hm(salt, ikm);
  const cek = hm(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hm(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const dc = createDecipheriv('aes-128-gcm', cek, nonce); dc.setAuthTag(Buffer.from(ct.slice(ct.length - 16)));
  const plain = Buffer.concat([dc.update(Buffer.from(ct.slice(0, ct.length - 16))), dc.final()]);
  eq([idlen, plain[plain.length - 1], plain.subarray(0, plain.length - 1).toString('utf8')], [65, 2, msg], 'aller-retour : un téléphone déchiffre bien le message (accents inclus)');
  eq(hex(enc.slice(16, 20)), '00001000', 'taille de bloc 4096 annoncée');
  const enc2: Uint8Array = await S.encryptPush(new Uint8Array(dev.getPublicKey()), new Uint8Array(devAuth), new TextEncoder().encode(msg));
  eq(hex(enc) === hex(enc2), false, 'deux envois du même message sont différents (sel et clé neufs)');

  // VAPID
  const keys = await S.generateVapidKeys();
  eq([b64u(keys.publicKey).length, b64u(keys.privateKey).length, b64u(keys.publicKey)[0]], [65, 32, 4], 'clés VAPID : 65 et 32 octets');
  const h: string = await S.vapidHeader('https://fcm.googleapis.com/fcm/send/xyz', 'https://example.org/', keys.publicKey, keys.privateKey, 1000);
  const mm = h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  eq(!!mm && mm[4] === keys.publicKey, true, 'en-tête VAPID bien formé');
  if (mm) {
    const claims = JSON.parse(Buffer.from(mm[2], 'base64url').toString());
    eq(claims, { aud: 'https://fcm.googleapis.com', exp: 1000 + 43200, sub: 'https://example.org/' }, 'revendications VAPID (adresse du service, 12 h, contact)');
    const pub = b64u(keys.publicKey);
    const k = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(pub.slice(1, 33)).toString('base64url'), y: Buffer.from(pub.slice(33)).toString('base64url') }, format: 'jwk' });
    eq(verify('sha256', Buffer.from(`${mm[1]}.${mm[2]}`), { key: k, dsaEncoding: 'ieee-p1363' }, Buffer.from(mm[3], 'base64url')), true, 'signature VAPID vérifiée avec la clé publique');
  }
  console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);
})();
