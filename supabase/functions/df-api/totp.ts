// Sécurité en deux étapes (TOTP + codes de secours) : règles pures, sans base de données ni réseau.
// Extrait de index.ts le 2026-11-19 (découpage de df-api, tranche 1). Le texte entre BEGIN TOTP et END TOTP est INCHANGÉ :
// il reste une copie mot pour mot de src/utils/totp.ts, contrôlée par scripts/check-totp.ts.
// Les imports se font avec l'extension .ts (obligatoire pour les fonctions Supabase / Deno).

// ===== BEGIN TOTP (sécurité en deux étapes ; ce bloc est contrôlé par scripts/check-totp.ts) =====
const TOTP = { stepSec: 30, digits: 6, window: 1, secretBytes: 20, backupCount: 8, backupLen: 10 };
const TOTP_ROLES = ['admin', 'accountant'] as const;
/** La sécurité en deux étapes est proposée seulement à ces rôles (les opérateurs et chefs d'équipe n'y ont pas accès). */
const canUseTotp = (role: unknown): boolean => role === 'admin' || role === 'accountant';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Texte → octets. Espaces, tirets et minuscules acceptés ; un caractère hors alphabet = null. */
function base32Decode(text: string): Uint8Array | null {
  const s = String(text ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!s || s.length > 128) return null;
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** Un secret tout neuf (20 octets au hasard fournis par l'appelant : crypto.getRandomValues). */
const secretFromBytes = (bytes: Uint8Array): string => base32Encode(bytes.slice(0, TOTP.secretBytes));
/** Secret écrit par groupes de 4 pour être recopié à la main. */
const prettySecret = (s: string): string => String(s).replace(/(.{4})/g, '$1 ').trim();

const stepOf = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP.stepSec);

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg as BufferSource));
}

/** Le code à 6 chiffres d'un pas de 30 secondes (HOTP, RFC 4226). */
async function codeAtStep(secret: string, step: number): Promise<string> {
  const key = base32Decode(secret);
  if (!key || !key.length) return '';
  const msg = new Uint8Array(8);
  let s = Math.max(0, Math.floor(step));
  for (let i = 7; i >= 0; i--) { msg[i] = s & 255; s = Math.floor(s / 256); }
  const h = await hmacSha1(key, msg);
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** TOTP.digits).padStart(TOTP.digits, '0');
}

/** « 123 456 », « 123456 » : seulement 6 chiffres sont acceptés ; sinon null. */
function cleanCode(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}

/** Le code est-il bon à cet instant (±30 s pour les horloges un peu décalées) ? Rend le pas trouvé, ou null.
 *  `lastStep` = dernier pas déjà utilisé : un même code ne sert qu'une fois (on ne peut pas le rejouer). */
async function verifyTotp(secret: string, raw: unknown, nowMs: number, lastStep = 0): Promise<number | null> {
  const code = cleanCode(raw);
  if (!code) return null;
  const now = stepOf(nowMs);
  let found: number | null = null;
  for (let d = -TOTP.window; d <= TOTP.window; d++) {
    const st = now + d;
    if (st <= lastStep) continue;
    if ((await codeAtStep(secret, st)) === code && found === null) found = st; // on teste tous les pas : même durée quel que soit le résultat
  }
  return found;
}

/** Lien que les applis d'authentification savent lire (pour le bouton « Ouvrir dans l'appli » et le QR code). */
function otpauthUri(secret: string, account: string, issuer = 'Gestion Pro'): string {
  const a = encodeURIComponent(String(account).slice(0, 60) || 'compte');
  const i = encodeURIComponent(issuer);
  return `otpauth://totp/${i}:${a}?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=${TOTP.digits}&period=${TOTP.stepSec}`;
}

// ---- Codes de secours : 8 codes à usage unique, pour le téléphone perdu. Seule leur empreinte est gardée. ----
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sans i, l, o, 0, 1 (faciles à confondre)
function backupCodeFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < TOTP.backupLen; i++) s += BACKUP_ALPHABET[bytes[i] % BACKUP_ALPHABET.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}
/** Ce que la personne tape (majuscules, espaces, tiret ou non) → forme normale ; sinon null. */
function cleanBackupCode(raw: unknown): string | null {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${BACKUP_ALPHABET}]{${TOTP.backupLen}}$`).test(s) ? s : null;
}
/** Empreinte d'un code de secours (SHA-256 avec l'identifiant du compte) : le code lui-même n'est jamais gardé. */
async function backupHash(userId: string, code: string): Promise<string> {
  const d = new TextEncoder().encode(`gp-backup:${userId}:${cleanBackupCode(code) ?? ''}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d)), b => b.toString(16).padStart(2, '0')).join('');
}
// ===== END TOTP =====

export { TOTP, canUseTotp, secretFromBytes, verifyTotp, otpauthUri, backupCodeFromBytes, cleanBackupCode, backupHash };
