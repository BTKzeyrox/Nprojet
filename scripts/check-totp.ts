// Contrôle M16.4 (partie règles) : TOTP contre les vecteurs officiels RFC 6238, secours, copie serveur. Le branchement serveur est contrôlé plus bas (ajouté avec le bloc).
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as T from '../src/utils/totp';
import { AUDIT_ACTIONS, auditLabel } from '../src/utils/auditRules';
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.error('✗', n); } };
const enc = (s: string) => T.base32Encode(new TextEncoder().encode(s));
(async () => {
  // RFC 4648 : base32
  t('base32 « foobar »', enc('foobar') === 'MZXW6YTBOI');
  t('base32 aller-retour', new TextDecoder().decode(T.base32Decode('mzxw 6ytb-oi')!) === 'foobar');
  t('base32 caractère interdit', T.base32Decode('AB1') === null && T.base32Decode('') === null);
  // RFC 6238 annexe B (SHA-1, secret ASCII 12345678901234567890), 6 chiffres = 6 derniers chiffres des valeurs à 8 chiffres
  const sec = enc('12345678901234567890');
  const vec: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
  for (const [sec_, code] of vec) t(`RFC 6238 à ${sec_} s`, (await T.codeAtStep(sec, T.stepOf(sec_ * 1000))) === code);
  // vérification
  const now = 1234567890_000;
  const good = '005924';
  t('bon code accepté', (await T.verifyTotp(sec, good, now)) === T.stepOf(now));
  t('code avec espace accepté', (await T.verifyTotp(sec, '005 924', now)) !== null);
  t('mauvais code refusé', (await T.verifyTotp(sec, '005925', now)) === null);
  t('pas de lettres', (await T.verifyTotp(sec, '00592a', now)) === null && (await T.verifyTotp(sec, '', now)) === null && (await T.verifyTotp(sec, '12345', now)) === null);
  t('horloge en retard de 30 s acceptée', (await T.verifyTotp(sec, good, now + 30_000)) === T.stepOf(now));
  t('horloge en retard de 90 s refusée', (await T.verifyTotp(sec, good, now + 90_000)) === null);
  t('même code rejoué refusé', (await T.verifyTotp(sec, good, now, T.stepOf(now))) === null);
  t('code plus ancien que le dernier pas refusé', (await T.verifyTotp(sec, good, now + 30_000, T.stepOf(now))) === null);
  t('secret abîmé refusé', (await T.verifyTotp('!!!', good, now)) === null);
  // secret et lien
  const rnd = new Uint8Array(32).map((_, i) => i * 7);
  const s = T.secretFromBytes(rnd);
  t('secret 32 lettres', /^[A-Z2-7]{32}$/.test(s));
  t('secret décodable à 20 octets', T.base32Decode(s)!.length === 20);
  t('secret par groupes de 4', T.prettySecret('ABCDEFGH') === 'ABCD EFGH');
  const u = T.otpauthUri(s, 'ad min@x', 'Gestion Pro');
  t('lien otpauth', u.startsWith('otpauth://totp/Gestion%20Pro:ad%20min%40x?secret=' + s) && u.includes('digits=6') && u.includes('period=30'));
  // secours
  const c = T.backupCodeFromBytes(new Uint8Array(10).map((_, i) => 200 + i));
  t('code de secours 5-5', /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c) && !/[ilo01]/.test(c));
  t('code de secours nettoyé', T.cleanBackupCode(c.toUpperCase().replace('-', ' ')) === c.replace('-', ''));
  t('code de secours abîmé', T.cleanBackupCode('abc') === null && T.cleanBackupCode('0000000000') === null);
  const h1 = await T.backupHash('u1', c), h2 = await T.backupHash('u2', c), h3 = await T.backupHash('u1', c.toUpperCase());
  t('empreinte 64 hex', /^[0-9a-f]{64}$/.test(h1));
  t('empreinte liée au compte', h1 !== h2);
  t('empreinte insensible à la casse et au tiret', h1 === h3 && h1 === (await T.backupHash('u1', c.replace('-', ''))));
  t('rôles permis', T.canUseTotp('admin') && T.canUseTotp('accountant') && !T.canUseTotp('employee') && !T.canUseTotp('team_lead') && !T.canUseTotp(undefined));

  // ---- Copie serveur ----
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  const m = src.match(/\/\/ ===== BEGIN TOTP[^\n]*\n([\s\S]*?)\/\/ ===== END TOTP =====/);
  t('bloc serveur trouvé', !!m);
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  const mine = readFileSync('src/utils/totp.ts', 'utf8');
  t('copie serveur = texte du site (mot pour mot)', norm(m?.[1] || '') === norm(mine.slice(mine.indexOf('export const TOTP =')).replace(/export /g, '')));
  const g: any = {};
  new Function('g', transformSync((m?.[1] || '') + '\n;g.x = { codeAtStep, stepOf, verifyTotp, backupHash };', { loader: 'ts' }).code)(g);
  t('copie serveur : mêmes codes (RFC)', (await g.x.codeAtStep(sec, g.x.stepOf(59_000))) === '287082' && (await g.x.verifyTotp(sec, '005924', now, 0)) === T.stepOf(now));
  t('copie serveur : même empreinte', (await g.x.backupHash('u1', c)) === h1);
  // ---- Branchement dans login() et routes ----
  const lg = src.slice(src.indexOf('async function login(req'), src.indexOf('// ---------- messagerie'));
  const iPw = lg.indexOf('checkPw('), iTotp = lg.indexOf('totpGet('), iClear = lg.indexOf('guardClear(');
  t('login : double étape après le mot de passe, avant l\'effacement du compteur', iPw > 0 && iPw < iTotp && iTotp < iClear);
  t('login : code absent = totp_required sans compter', /totp_required/.test(lg) && lg.indexOf("totp_required") < lg.indexOf('guardFail(uname, ip, (await'));
  t('login : code faux compté comme un raté', lg.includes('guardFail(uname, ip, (await getUserRow(cred.user_id))?.role'));
  t('login : panne de lecture = refus (jamais passage)', /catch \(e\) \{ console\.error\(e\); return res\.status\(503\)/.test(lg));
  t('login : pas de passage si le code est faux', lg.indexOf('if (!chk.ok)') > 0 && lg.indexOf('if (!chk.ok)') < iClear);
  for (const r of ['totp-status', 'totp-start', 'totp-enable', 'totp-disable', 'totp-new-backup', 'totp-reset']) t('route ' + r, src.includes(`action === "${r}"`));
  const ts = src.slice(src.indexOf('async function totpStatus'), src.indexOf('async function login(req'));
  t('start/disable/new-backup : mot de passe redemandé', (ts.match(/passwordOk\(me\.id/g) || []).length === 3);
  t('rôle contrôlé (start, enable, status)', (ts.match(/canUseTotp\(me\.role\)/g) || []).length >= 3);
  t('reset : responsable seulement, jamais son propre compte', /me\.role !== "admin"/.test(ts) && /id === me\.id/.test(ts));
  t('le secret n\'est renvoyé qu\'à totp-start', (ts.match(/secret/g) || []).length > 0 && !/res\.json\([^)]*secret[^)]*\)/.test(ts.slice(ts.indexOf('async function totpEnable'))));
  t('suppression du compte efface sa double étape', src.includes("sb.from('df_totp').delete().eq('id', id)"));
  for (const a of ['totp_on', 'totp_off', 'totp_reset']) t('audit ' + a, (AUDIT_ACTIONS as readonly string[]).includes(a) && new RegExp('const AUDIT_ACTIONS = \\[[^\\]]*"' + a + '"').test(src) && auditLabel(a, 'fr') !== a && auditLabel(a, 'en').length > 3);
  const mig = readFileSync('supabase/migrations/20261025_create_df_totp.sql', 'utf8');
  t('migration : RLS + revoke + retour', /enable row level security/.test(mig) && /revoke all on public\.df_totp from anon, authenticated/.test(mig) && /drop table public\.df_totp/.test(mig));
  console.log(`${ok}/${ok + bad} contrôles OK`);
  process.exit(bad ? 1 : 0);
})();
