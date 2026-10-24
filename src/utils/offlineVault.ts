// Copie locale du mode hors ligne (module 13, M13.3) : garder sur l'appareil, PAR PERSONNE, la dernière copie des données et la file d'actions,
// pour qu'elles survivent à un rechargement, à la fermeture de l'onglet ou à un téléphone qui tue l'appli.
// Décisions de BTK (2026-10-24) : option A = la copie de l'ADMIN est CHIFFRÉE avec son code de verrouillage (AES-GCM, clé tirée du code par PBKDF2) ;
// copie admin 24 h, opérateur 7 jours ; effacée à la déconnexion ; rien d'argent pour l'admin (liste ci-dessous).
// Ce fichier ne touche ni au magasin de données ni à un écran : il fournit la « chambre forte » (`Vault`). Contrôlé par `npm run check:offline-vault`.
// Le branchement dans l'appli (relire au démarrage, enregistrer à chaque changement) se fait avec la file d'attente (M13.5).
//
// Limites à connaître : (1) le stockage réel (IndexedDB) n'est essayé que dans un vrai navigateur, par BTK ; (2) un code oublié = copie illisible :
// la personne se reconnecte en ligne et retrouve tout (les actions en attente de cette copie sont perdues : l'écran devra le dire avant d'effacer) ;
// (3) un opérateur sans code a une copie NON chiffrée (il n'a pas de données d'argent) ; un admin sans code n'a PAS de copie.
import { OFFLINE_DEFAULTS, copyExpired, lockDelaySeconds, pinValid, type Bilingual, type OfflineLimits, type Queue, type Role } from './offline';

// ---------- Stockage (clé → valeur) ----------
export interface KV {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<boolean>; // false = échec (appareil plein, navigation privée…) ; ne lève jamais d'erreur
  del(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
}
/** Stockage en mémoire (essais). */
export function memoryKV(): KV & { raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>();
  return {
    raw,
    async get(k) { return raw.has(k) ? structuredClone(raw.get(k)) : undefined; },
    async set(k, v) { raw.set(k, structuredClone(v)); return true; },
    async del(k) { raw.delete(k); return true; },
    async keys() { return [...raw.keys()]; },
  };
}
/** Stockage du navigateur (IndexedDB). Sans IndexedDB ou en cas d'erreur : ne garde rien, jamais d'exception. */
export function idbKV(dbName = 'df_offline', storeName = 'kv'): KV {
  let opening: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    if (opening) return opening;
    opening = new Promise(resolve => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore(storeName); } catch { /* déjà là */ } };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return opening;
  };
  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, fallback: T): Promise<T> => open().then(db => new Promise<T>(resolve => {
    if (!db) return resolve(fallback);
    try {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    } catch { resolve(fallback); }
  }));
  return {
    get: k => run<unknown>('readonly', s => s.get(k), undefined),
    set: async (k, v) => (await run<IDBValidKey | undefined>('readwrite', s => s.put(v, k) as IDBRequest<IDBValidKey | undefined>, undefined)) !== undefined,
    del: async k => { await run('readwrite', s => s.delete(k), undefined); return true; },
    keys: async () => ((await run<IDBValidKey[]>('readonly', s => s.getAllKeys(), [])) || []).map(String),
  };
}

// ---------- Ce qui est gardé sur l'appareil ----------
/** Collections gardées pour l'ADMIN : ce qu'il peut modifier hors ligne (option B). Jamais : paiements, paie, avances, achats, fournisseurs, factures, devis, journal de sécurité, congés, évaluations. */
export const ADMIN_COLLECTIONS = ['users', 'posts', 'contracts', 'messages', 'groups', 'settings', 'news', 'products', 'stock', 'clients', 'sheets'] as const;
/** Collections JAMAIS gardées pour un opérateur (il ne les reçoit déjà pas ; ceinture et bretelles). */
export const OPERATOR_DENIED = ['securityLogs', 'advances', 'cash', 'products', 'stock', 'clients', 'invoices', 'quotes', 'suppliers', 'purchases'] as const;
/** Réglages gardés pour l'ADMIN : horaires, types de mission, modèles, règlement, affichage. Pas de prix, paie, objectifs, budgets, société, journal. */
export const ADMIN_SETTINGS_KEYS = ['id', 'day_shift_start', 'day_shift_end', 'night_shift_start', 'night_shift_end', 'late_tolerance_min', 'access_before_min', 'access_after_min', 'show_activity_column',
  'badge_start', 'badge_end', 'badge_advance', 'badge_profile', 'badges_clickable', 'alert_idle_1_min', 'alert_idle_2_min', 'retry_seconds', 'grid_columns', 'rules', 'post_types', 'mission_templates', 'performance'] as const;
/** Champs gardés pour les comptes (pas de téléphone, de mot de passe, de jeton, de salaire) : l'admin ne modifie aucun compte hors ligne. */
export const USER_FIELDS = ['id', 'name', 'username', 'role', 'status', 'shift', 'avatar', 'avatar_url', 'created_at'] as const;

export type State = Record<string, unknown>;
/** Ne garde de l'état que ce qui a le droit d'être sur l'appareil de cette personne. Ne modifie pas l'état reçu. */
export function filterForDevice(role: Role, state: State): State {
  const out: State = {};
  if (!state || typeof state !== 'object') return out;
  if (role === 'admin') {
    for (const col of ADMIN_COLLECTIONS) {
      const v = state[col];
      if (v === undefined) continue;
      if (col === 'users' && Array.isArray(v)) out[col] = v.map(u => pickFields(u, USER_FIELDS));
      else if (col === 'settings') out[col] = Array.isArray(v) ? v.map(r => pickFields(r, ADMIN_SETTINGS_KEYS)) : pickFields(v, ADMIN_SETTINGS_KEYS);
      else out[col] = v;
    }
    return out;
  }
  if (role === 'employee') {
    const denied = new Set<string>(OPERATOR_DENIED);
    for (const [k, v] of Object.entries(state)) if (!denied.has(k)) out[k] = v;
    return out;
  }
  return out; // Comptable, Chef d'équipe : rien n'est gardé (pas encore décidé)
}
function pickFields(rec: unknown, fields: readonly string[]): unknown {
  if (!rec || typeof rec !== 'object') return rec;
  const o: Record<string, unknown> = {};
  for (const f of fields) if (f in (rec as Record<string, unknown>)) o[f] = (rec as Record<string, unknown>)[f];
  return o;
}

// ---------- Chiffrement (AES-GCM, clé tirée du code) ----------
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string): Uint8Array<ArrayBuffer> => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const hexToBytes = (h: string): Uint8Array<ArrayBuffer> => { const m = h.match(/.{2}/g) || []; const u = new Uint8Array(m.length); m.forEach((x, i) => { u[i] = parseInt(x, 16); }); return u; };
const randHex = (n: number): string => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
export const KDF_ITERATIONS = 150_000;

async function deriveKey(pin: string, saltHex: string, iterations: number): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
interface Sealed { iv: string; ct: string }
async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(value))));
  return { iv: b64(iv), ct: b64(ct) };
}
async function open(key: CryptoKey, s: Sealed): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.ct)); // l'étiquette d'authentification détecte un mauvais code ET un contenu modifié
    return { ok: true, value: JSON.parse(td.decode(pt)) };
  } catch { return { ok: false }; }
}

// ---------- La chambre forte ----------
const VERSION = 1;
const CHECK = 'df-offline-ok';
interface Meta { v: number; user_id: string; role: Role; enc: boolean; salt: string | null; iterations: number; check: Sealed | null; saved_at: string | null }
interface Fails { count: number; last_at: string }
export interface Vault { kv: KV; userId: string; role: Role; key: CryptoKey | null; enc: boolean }
const k = (kind: string, uid: string) => `${kind}:${uid}`;
const t = (iso: string) => Date.parse(iso);

export type CreateResult = { status: 'ok'; vault: Vault } | { status: 'no_pin' | 'weak_pin' | 'not_allowed' | 'storage_error' | 'exists'; why: Bilingual };
const MSG: Record<string, Bilingual> = {
  no_pin: { fr: 'Un code de verrouillage est obligatoire pour garder des données hors ligne.', en: 'A lock code is required to keep data offline.' },
  not_allowed: { fr: 'Ce compte ne travaille pas encore hors ligne.', en: 'This account cannot work offline yet.' },
  exists: { fr: 'Une copie locale existe déjà : ouvre-la avec ton code, ou change le code sans rien perdre.', en: 'A local copy already exists: open it with your code, or change the code without losing anything.' },
  storage_error: { fr: 'Impossible d\'écrire sur cet appareil (plein ou navigation privée).', en: 'Cannot write on this device (full or private browsing).' },
};
export interface VaultOptions { iterations?: number }

/** Crée la chambre forte d'une personne. REFUSE s'il en existe déjà une (elle peut contenir des actions en attente) : l'ouvrir avec `unlockVault`, changer le code avec `changePin`, ou l'effacer EXPLICITEMENT avec `wipeVault`. Admin : code OBLIGATOIRE ; opérateur : code facultatif (sans code, copie non chiffrée). */
export async function createVault(kv: KV, userId: string, role: Role, pin: string | undefined, opts: VaultOptions = {}): Promise<CreateResult> {
  if (role !== 'admin' && role !== 'employee') return { status: 'not_allowed', why: MSG.not_allowed };
  if (!userId) return { status: 'not_allowed', why: MSG.not_allowed };
  if (pin === undefined || pin === '') {
    if (role === 'admin') return { status: 'no_pin', why: MSG.no_pin };
  } else {
    const v = pinValid(pin);
    if (!v.ok) return { status: 'weak_pin', why: v.why! };
  }
  if (await kv.get(k('meta', userId))) return { status: 'exists', why: MSG.exists };
  const iterations = opts.iterations ?? KDF_ITERATIONS;
  let key: CryptoKey | null = null, meta: Meta;
  if (pin) {
    const salt = randHex(16);
    key = await deriveKey(pin, salt, iterations);
    meta = { v: VERSION, user_id: userId, role, enc: true, salt, iterations, check: await seal(key, CHECK), saved_at: null };
  } else meta = { v: VERSION, user_id: userId, role, enc: false, salt: null, iterations: 0, check: null, saved_at: null };
  if (!(await kv.set(k('meta', userId), meta))) return { status: 'storage_error', why: MSG.storage_error };
  return { status: 'ok', vault: { kv, userId, role, key, enc: !!pin } };
}

export type UnlockResult =
  | { status: 'ok'; vault: Vault }
  | { status: 'none' | 'locked' | 'expired' | 'wrong_user' | 'newer_version' | 'corrupt' }
  | { status: 'wrong_pin'; wait_seconds: number }
  | { status: 'wait'; wait_seconds: number };

/** Ouvre la chambre forte d'une personne avec son code. Après 3 erreurs de suite : attente (30 s, 1 min, 5 min, 15 min, 1 h). Rien n'est jamais effacé pour un mauvais code. */
export async function unlockVault(kv: KV, userId: string, role: Role, pin: string | undefined, nowIso: string, limits: OfflineLimits = OFFLINE_DEFAULTS): Promise<UnlockResult> {
  const meta = (await kv.get(k('meta', userId))) as Meta | undefined;
  if (meta === undefined || meta === null) return { status: 'none' };
  if (typeof meta !== 'object') return { status: 'corrupt' }; // fiche illisible : l'écran propose d'effacer et de recommencer (jamais effacée sans demande)
  if (meta.user_id !== userId || meta.role !== role) return { status: 'wrong_user' };
  if (typeof meta.v !== 'number' || meta.v > VERSION) return { status: 'newer_version' }; // écrite par une version plus récente : on n'y touche pas
  if (meta.saved_at && copyExpired(meta.saved_at, role, nowIso, limits)) { await wipeVault(kv, userId); return { status: 'expired' }; }
  if (!meta.enc) return { status: 'ok', vault: { kv, userId, role, key: null, enc: false } };
  if (!pin) return { status: 'locked' };
  const fails = ((await kv.get(k('fail', userId))) as Fails | undefined) || { count: 0, last_at: nowIso };
  const need = lockDelaySeconds(fails.count);
  if (need > 0) { const left = Math.ceil(need - (t(nowIso) - t(fails.last_at)) / 1000); if (left > 0) return { status: 'wait', wait_seconds: left }; }
  if (!meta.salt || !meta.check) return { status: 'corrupt' };
  let key: CryptoKey;
  try { key = await deriveKey(pin, meta.salt, meta.iterations || KDF_ITERATIONS); } catch { return { status: 'corrupt' }; }
  const chk = await open(key, meta.check);
  if (!chk.ok || chk.value !== CHECK) {
    const next = { count: fails.count + 1, last_at: nowIso };
    await kv.set(k('fail', userId), next);
    return { status: 'wrong_pin', wait_seconds: lockDelaySeconds(next.count) };
  }
  await kv.del(k('fail', userId));
  return { status: 'ok', vault: { kv, userId, role, key, enc: true } };
}

/** Efface TOUT ce qui concerne cette personne (déconnexion). */
export async function wipeVault(kv: KV, userId: string): Promise<void> { for (const kind of ['meta', 'copy', 'queue', 'fail']) await kv.del(k(kind, userId)); }
/** Efface tout (appareil partagé, déconnexion complète). */
export async function wipeAllVaults(kv: KV): Promise<void> { for (const key of await kv.keys()) if (/^(meta|copy|queue|fail):/.test(key)) await kv.del(key); }

export type PutResult = { ok: true; bytes: number } | { ok: false; reason: 'too_big' | 'storage_error' | 'not_allowed' | 'no_meta'; why: Bilingual };
const PUT_MSG = {
  too_big: { fr: 'Les données sont trop grosses pour être gardées hors ligne sur cet appareil.', en: 'The data is too big to keep offline on this device.' },
  storage_error: MSG.storage_error, not_allowed: MSG.not_allowed,
  no_meta: { fr: 'Copie locale non initialisée.', en: 'Local copy not initialised.' },
};
export const MAX_COPY_BYTES = 25 * 1024 * 1024;
const store = async (v: Vault, kind: 'copy' | 'queue', value: unknown, maxBytes: number): Promise<PutResult> => {
  const json = JSON.stringify(value);
  if (json.length > maxBytes) return { ok: false, reason: 'too_big', why: PUT_MSG.too_big };
  const payload = v.enc ? await seal(v.key!, value) : { plain: value };
  if (!(await v.kv.set(k(kind, v.userId), { v: VERSION, ...payload }))) return { ok: false, reason: 'storage_error', why: PUT_MSG.storage_error };
  return { ok: true, bytes: json.length };
};

/** Enregistre la copie des données (filtrée selon le rôle) et note l'heure. Écrit d'abord la copie, puis l'heure : une coupure entre les deux garde l'ancienne heure (plus prudent). */
export async function putCopy(v: Vault, state: State, nowIso: string, maxBytes = MAX_COPY_BYTES): Promise<PutResult> {
  if (v.role !== 'admin' && v.role !== 'employee') return { ok: false, reason: 'not_allowed', why: PUT_MSG.not_allowed };
  const meta = (await v.kv.get(k('meta', v.userId))) as Meta | undefined;
  if (!meta) return { ok: false, reason: 'no_meta', why: PUT_MSG.no_meta };
  const r = await store(v, 'copy', filterForDevice(v.role, state), maxBytes);
  if (!r.ok) return r;
  if (!(await v.kv.set(k('meta', v.userId), { ...meta, saved_at: nowIso }))) return { ok: false, reason: 'storage_error', why: PUT_MSG.storage_error };
  return r;
}
/** Enregistre la file d'actions (à chaque action : la clé est déjà dérivée, rien de lent). Une action en attente n'est jamais filtrée. */
export async function putQueue(v: Vault, queue: Queue, maxBytes = MAX_COPY_BYTES): Promise<PutResult> {
  if (v.role !== 'admin' && v.role !== 'employee') return { ok: false, reason: 'not_allowed', why: PUT_MSG.not_allowed };
  return store(v, 'queue', queue, maxBytes);
}

async function load(v: Vault, kind: 'copy' | 'queue'): Promise<{ status: 'ok'; value: unknown } | { status: 'none' | 'corrupt' | 'newer_version' }> {
  const raw = (await v.kv.get(k(kind, v.userId))) as { v?: number; plain?: unknown; iv?: string; ct?: string } | undefined;
  if (!raw) return { status: 'none' };
  if (typeof raw.v !== 'number' || raw.v > VERSION) return { status: 'newer_version' };
  if (!v.enc) return 'plain' in raw ? { status: 'ok', value: raw.plain } : { status: 'corrupt' };
  if (typeof raw.iv !== 'string' || typeof raw.ct !== 'string') return { status: 'corrupt' };
  const o = await open(v.key!, { iv: raw.iv, ct: raw.ct });
  return o.ok ? { status: 'ok', value: o.value } : { status: 'corrupt' };
}
export async function getCopy(v: Vault): Promise<{ status: 'ok'; state: State; saved_at: string | null } | { status: 'none' | 'corrupt' | 'newer_version' }> {
  const r = await load(v, 'copy');
  if (r.status !== 'ok') return r;
  if (!r.value || typeof r.value !== 'object' || Array.isArray(r.value)) return { status: 'corrupt' };
  const meta = (await v.kv.get(k('meta', v.userId))) as Meta | undefined;
  return { status: 'ok', state: r.value as State, saved_at: meta?.saved_at ?? null };
}
export async function getQueue(v: Vault): Promise<{ status: 'ok'; queue: Queue } | { status: 'none' | 'corrupt' | 'newer_version' }> {
  const r = await load(v, 'queue');
  if (r.status !== 'ok') return r;
  return Array.isArray(r.value) ? { status: 'ok', queue: r.value as Queue } : { status: 'corrupt' };
}
/** Y a-t-il des actions en attente sur cet appareil ? L'écran de déconnexion doit prévenir avant d'effacer. */
export async function pendingCount(v: Vault): Promise<number> {
  const q = await getQueue(v);
  return q.status === 'ok' ? q.queue.filter(o => o && o.state === 'pending').length : 0;
}

/**
 * Change le code SANS rien perdre : relit la copie et la file avec l'ancien code, puis les réécrit avec une nouvelle clé (nouveau sel).
 * Si une étape échoue, l'ancien état reste valable (les nouvelles données ne remplacent l'ancien qu'à la fin, la fiche `meta` en dernier).
 * Admin : le nouveau code est obligatoire ; opérateur : un code vide retire le chiffrement.
 */
export async function changePin(v: Vault, newPin: string | undefined, nowIso: string, opts: VaultOptions = {}): Promise<CreateResult> {
  if (v.role === 'admin' && !newPin) return { status: 'no_pin', why: MSG.no_pin };
  if (newPin) { const ok = pinValid(newPin); if (!ok.ok) return { status: 'weak_pin', why: ok.why! }; }
  const meta = (await v.kv.get(k('meta', v.userId))) as Meta | undefined;
  if (!meta) return { status: 'not_allowed', why: MSG.not_allowed };
  const copy = await load(v, 'copy'), queue = await load(v, 'queue');
  if (copy.status === 'corrupt' || queue.status === 'corrupt') return { status: 'storage_error', why: MSG.storage_error }; // on ne réécrit pas par-dessus ce qu'on ne sait pas lire
  const iterations = opts.iterations ?? KDF_ITERATIONS;
  let key: CryptoKey | null = null, next: Meta;
  if (newPin) { const salt = randHex(16); key = await deriveKey(newPin, salt, iterations); next = { ...meta, enc: true, salt, iterations, check: await seal(key, CHECK) }; }
  else next = { ...meta, enc: false, salt: null, iterations: 0, check: null };
  const nv: Vault = { kv: v.kv, userId: v.userId, role: v.role, key, enc: !!newPin };
  for (const [kind, r] of [['copy', copy], ['queue', queue]] as const) {
    if (r.status !== 'ok') continue;
    const payload = nv.enc ? await seal(nv.key!, r.value) : { plain: r.value };
    if (!(await v.kv.set(k(kind, v.userId), { v: VERSION, ...payload }))) return { status: 'storage_error', why: MSG.storage_error };
  }
  if (!(await v.kv.set(k('meta', v.userId), { ...next, saved_at: meta.saved_at ?? nowIso }))) return { status: 'storage_error', why: MSG.storage_error };
  await v.kv.del(k('fail', v.userId));
  return { status: 'ok', vault: nv };
}
