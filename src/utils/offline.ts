// Mode hors ligne (module 13, M13.2) : règles pures, SANS écran, SANS serveur, SANS stockage. Contrôlé par `npm run check:offline`.
// Ce fichier dit QUOI peut attendre, COMBIEN de temps, COMMENT fusionner, ce qui va dans « À revoir » et comment verrouiller. Les étapes suivantes
// (copie locale M13.3, service worker M13.4, file d'attente M13.5, écrans M13.6, serveur M13.7) s'appuient dessus.
// Décisions de BTK (2026-10-24, `TODO_MODULES.md` module 13) :
//  • Hors ligne : l'opérateur (missions, messages, Actualités, photos, ses tableaux) ET l'admin (missions, stock, clients, Actualités, messages) ;
//    factures et devis seulement en BROUILLON sans numéro ; paiements, paie, avances, comptes, mots de passe : EN LIGNE seulement.
//  • Rien n'est jamais supprimé en silence : ce que le serveur refuse ou ce qui est trop vieux va dans « À revoir » (texte gardé, copiable).
//  • Le serveur gagne en cas de conflit ; le texte de la personne reste dans « À revoir ».
//  • Heure : celle du serveur (réception) sert à la paie et à la présence ; l'heure du téléphone n'est qu'une note.
//  • Copie locale : opérateur 7 jours, admin 24 heures ; code de verrouillage (4 à 8 chiffres) pour ouvrir l'appli hors ligne.

export type Role = 'admin' | 'employee' | 'accountant' | 'team_lead';
export interface Bilingual { fr: string; en: string }

// ---------- Limites ----------
export interface OfflineLimits {
  operator_days: number; // une action d'opérateur attend au plus N jours
  admin_days: number; // idem pour l'admin
  admin_copy_hours: number; // la copie locale de l'admin est jetée après N heures sans connexion
  operator_copy_days: number; // idem pour l'opérateur
  max_ops: number; // actions en attente (hors « À revoir »)
  max_review: number; // éléments « À revoir »
  max_photos: number; // photos en attente
  max_photo_bytes: number; // taille totale des photos en attente
  max_op_bytes: number; // taille d'une action (hors photo)
}
export const OFFLINE_DEFAULTS: OfflineLimits = {
  operator_days: 7, admin_days: 7, admin_copy_hours: 24, operator_copy_days: 7,
  max_ops: 2000, max_review: 500, max_photos: 20, max_photo_bytes: 30 * 1024 * 1024, max_op_bytes: 1_500_000,
};
const intIn = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
export function cleanOfflineLimits(raw: unknown): OfflineLimits {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = OFFLINE_DEFAULTS;
  return {
    operator_days: intIn(r.operator_days, 1, 30, d.operator_days), admin_days: intIn(r.admin_days, 1, 30, d.admin_days),
    admin_copy_hours: intIn(r.admin_copy_hours, 1, 24 * 30, d.admin_copy_hours), operator_copy_days: intIn(r.operator_copy_days, 1, 30, d.operator_copy_days),
    max_ops: intIn(r.max_ops, 10, 20000, d.max_ops), max_review: intIn(r.max_review, 10, 5000, d.max_review),
    max_photos: intIn(r.max_photos, 0, 100, d.max_photos), max_photo_bytes: intIn(r.max_photo_bytes, 0, 200 * 1024 * 1024, d.max_photo_bytes), max_op_bytes: intIn(r.max_op_bytes, 1000, 20_000_000, d.max_op_bytes),
  };
}

// ---------- Ce qui peut attendre ----------
export interface Verdict { mode: 'queue' | 'online'; why: Bilingual }
const Q: Verdict = { mode: 'queue', why: { fr: 'Peut attendre : envoyé dès le retour de la connexion.', en: 'Can wait: sent as soon as the connection is back.' } };
const money: Verdict = { mode: 'online', why: { fr: 'Touche à l\'argent : seulement avec la connexion.', en: 'Touches money: only with a connection.' } };
const account: Verdict = { mode: 'online', why: { fr: 'Comptes et mots de passe : vérifiés par le serveur, seulement avec la connexion.', en: 'Accounts and passwords are checked by the server: only with a connection.' } };
const other: Verdict = { mode: 'online', why: { fr: 'Pas encore possible hors ligne.', en: 'Not possible offline yet.' } };

const OPERATOR_COLLECTIONS = new Set(['posts', 'messages', 'news', 'sheets']);
const ADMIN_COLLECTIONS = new Set(['posts', 'contracts', 'messages', 'news', 'clients', 'stock', 'products', 'sheets']);
const MONEY_COLLECTIONS = new Set(['cash', 'advances', 'purchases', 'suppliers', 'invoices', 'quotes']);
const ACCOUNT_COLLECTIONS = new Set(['users', 'settings', 'securityLogs']);

/** Une modification de la collection `collection` peut-elle attendre ? `rec` précise pour les factures et devis (brouillon sans numéro seulement). */
export function collectionPolicy(role: Role, collection: string, rec?: { status?: unknown; number?: unknown } | null): Verdict {
  if (role !== 'admin' && role !== 'employee') return other; // Comptable et Chef d'équipe : pas encore (non décidé)
  if (collection === 'invoices' || collection === 'quotes') {
    if (role !== 'admin') return money;
    const draft = !!rec && rec.status === 'draft' && (rec.number === undefined || rec.number === null || rec.number === '');
    return draft ? { mode: 'queue', why: { fr: 'Brouillon sans numéro : peut attendre ; le numéro est donné à l\'émission, en ligne.', en: 'Draft without a number: can wait; the number is given when issued, online.' } } : { mode: 'online', why: { fr: 'Facture ou devis émis, ou avec numéro : seulement avec la connexion.', en: 'Issued invoice or quote, or one with a number: only with a connection.' } };
  }
  if (MONEY_COLLECTIONS.has(collection)) return money;
  if (ACCOUNT_COLLECTIONS.has(collection)) return account;
  const set = role === 'admin' ? ADMIN_COLLECTIONS : OPERATOR_COLLECTIONS;
  return set.has(collection) ? Q : other;
}

const BOTH_CALLS = new Set(['upload', 'report-error', 'news-comment', 'news-comment-delete', 'news-share', 'news-react', 'news-submit', 'news-withdraw']);
const ADMIN_CALLS = new Set(['post-decide', 'news-decision']);
const MONEY_CALLS = new Set<string>([]);
const ACCOUNT_CALLS = new Set(['login', 'forgot', 'signup', 'signup-decision', 'create-user', 'set-password', 'reset-decision', 'profile-request', 'profile-decision']);

/** Un appel direct au serveur (route) peut-il attendre ? Route inconnue = en ligne (le plus sûr). */
export function callPolicy(role: Role, route: string): Verdict {
  if (role !== 'admin' && role !== 'employee') return other;
  if (BOTH_CALLS.has(route)) return Q;
  if (ADMIN_CALLS.has(route)) return role === 'admin' ? Q : { mode: 'online', why: { fr: 'Réservé au responsable.', en: 'Manager only.' } };
  if (MONEY_CALLS.has(route)) return money;
  if (ACCOUNT_CALLS.has(route)) return account;
  return other;
}

// ---------- La file d'actions ----------
export type OpState = 'pending' | 'review';
export type ReviewCode = 'conflict' | 'refused' | 'blocked' | 'not_found' | 'invalid' | 'too_old' | 'full';
export const REVIEW_TEXT: Record<ReviewCode, Bilingual> = {
  conflict: { fr: 'Quelqu\'un a modifié cet élément pendant que tu étais hors ligne : la version du serveur est gardée.', en: 'Someone changed this item while you were offline: the server version is kept.' },
  refused: { fr: 'Le serveur a refusé cette action.', en: 'The server refused this action.' },
  blocked: { fr: 'Compte bloqué ou accès fermé : l\'action n\'a pas été prise.', en: 'Account blocked or access closed: the action was not taken.' },
  not_found: { fr: 'L\'élément n\'existe plus sur le serveur.', en: 'The item no longer exists on the server.' },
  invalid: { fr: 'Le serveur a jugé les données invalides.', en: 'The server judged the data invalid.' },
  too_old: { fr: 'Action restée trop longtemps hors ligne : elle n\'a pas été envoyée automatiquement.', en: 'Action stayed offline too long: it was not sent automatically.' },
  full: { fr: 'La file d\'attente était pleine.', en: 'The queue was full.' },
};
export interface OfflineOp {
  id: string; // numéro unique de l'action : le serveur ignore un doublon (M13.7)
  kind: 'record' | 'call';
  collection?: string; record_id?: string; action?: 'upsert' | 'delete'; created_offline?: boolean; // kind « record »
  route?: string; // kind « call »
  payload: unknown;
  created_at: string; // heure du TÉLÉPHONE (ISO) : seulement une note
  base_updated_at?: string; // date de la version du serveur sur laquelle la personne a travaillé
  base_hash?: string; // empreinte de la version du serveur sur laquelle la personne a travaillé (absente = élément créé hors ligne)
  review_note?: string; // raison écrite par le serveur quand il refuse (affichée dans « À revoir »)
  tries: number; next_try_at?: string;
  state: OpState; review_code?: ReviewCode;
  bytes: number; photo_bytes?: number; // taille de l'action ; taille de la photo (route « upload »)
  text?: string; // texte saisi, gardé pour être copié depuis « À revoir »
}
export type Queue = OfflineOp[];

const time = (iso: string | undefined): number => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : NaN; };
export const addMs = (iso: string, ms: number): string => new Date(time(iso) + ms).toISOString();

/** Numéro d'action : 24 caractères hexadécimaux. `rnd` pour les tests. */
export function newOpId(rnd: () => number = Math.random): string { let s = ''; for (let i = 0; i < 24; i++) s += Math.floor(rnd() * 16).toString(16); return s; }

export const sizeOf = (payload: unknown): number => { try { return JSON.stringify(payload ?? null).length; } catch { return Infinity; } };

export interface EnqueueResult { queue: Queue; error?: 'queue_full' | 'op_too_big' | 'too_many_photos' | 'photos_too_big' | 'online_only' | 'duplicate' | 'bad_op'; why?: Bilingual }
const ERR: Record<NonNullable<EnqueueResult['error']>, Bilingual> = {
  queue_full: { fr: 'Trop d\'actions en attente : connecte-toi pour les envoyer avant d\'en ajouter.', en: 'Too many actions waiting: get online to send them before adding more.' },
  op_too_big: { fr: 'Cette action est trop grosse pour attendre hors ligne.', en: 'This action is too big to wait offline.' },
  too_many_photos: { fr: 'Trop de photos en attente : connecte-toi pour les envoyer.', en: 'Too many photos waiting: get online to send them.' },
  photos_too_big: { fr: 'Les photos en attente prennent trop de place : connecte-toi pour les envoyer.', en: 'Waiting photos take too much space: get online to send them.' },
  online_only: { fr: 'Cette action demande la connexion.', en: 'This action needs a connection.' },
  duplicate: { fr: 'Cette action est déjà dans la file.', en: 'This action is already in the queue.' },
  bad_op: { fr: 'Action invalide.', en: 'Invalid action.' },
};

/** Ajoute une action à la file (copie : la file reçue n'est jamais modifiée). Refuse avec un message clair, jamais en silence. */
export function enqueue(queue: Queue, op: OfflineOp, role: Role, limits: OfflineLimits = OFFLINE_DEFAULTS): EnqueueResult {
  const fail = (e: NonNullable<EnqueueResult['error']>): EnqueueResult => ({ queue, error: e, why: ERR[e] });
  if (!op || typeof op.id !== 'string' || !op.id || (op.kind !== 'record' && op.kind !== 'call') || !Number.isFinite(time(op.created_at))) return fail('bad_op');
  if (queue.some(o => o.id === op.id)) return fail('duplicate');
  const verdict = op.kind === 'record' ? (op.collection ? collectionPolicy(role, op.collection, (op.payload && typeof op.payload === 'object' ? op.payload : null) as { status?: unknown; number?: unknown } | null) : other) : callPolicy(role, op.route || '');
  if (verdict.mode !== 'queue') return fail('online_only'); // pour une suppression, `payload` = dernière version connue de l'élément (le brouillon d'une facture se supprime hors ligne, une facture émise non)
  const bytes = Number.isFinite(op.bytes) && op.bytes > 0 ? op.bytes : sizeOf(op.payload); // taille non donnée (0) : calculée ; contenu illisible : Infinity, donc refusé
  if (!Number.isFinite(bytes) || bytes > limits.max_op_bytes) return fail('op_too_big');
  const pending = queue.filter(o => o.state === 'pending');
  if (pending.length >= limits.max_ops) return fail('queue_full');
  if (op.photo_bytes && op.photo_bytes > 0) {
    if (pending.filter(o => (o.photo_bytes || 0) > 0).length >= limits.max_photos) return fail('too_many_photos');
    if (pending.reduce((t, o) => t + (o.photo_bytes || 0), 0) + op.photo_bytes > limits.max_photo_bytes) return fail('photos_too_big');
  }
  return { queue: [...queue, { ...op, bytes, tries: op.tries || 0, state: 'pending' }] };
}

/** Fusionne les actions « enregistrement » faites sur le même élément. Les appels directs ne sont jamais fusionnés. */
export function coalesce(queue: Queue): Queue {
  const out: Queue = [];
  const index = new Map<string, number>();
  for (const op of queue) {
    if (op.state !== 'pending' || op.kind !== 'record' || !op.collection || !op.record_id) { out.push(op); continue; }
    const key = `${op.collection}\u0000${op.record_id}`;
    const at = index.get(key);
    if (at === undefined) { index.set(key, out.length); out.push(op); continue; }
    const prev = out[at];
    if (op.action === 'delete') {
      if (prev.created_offline) { out[at] = null as unknown as OfflineOp; index.delete(key); continue; } // créé puis supprimé hors ligne : le serveur n'a jamais rien su, rien à envoyer
      out[at] = { ...op, created_offline: false, base_updated_at: prev.base_updated_at ?? op.base_updated_at };
    } else {
      out[at] = { ...op, created_offline: prev.created_offline || op.created_offline, base_updated_at: prev.base_updated_at ?? op.base_updated_at, text: op.text ?? prev.text, id: prev.id }; // dernière valeur ; le numéro de la première action est gardé
    }
  }
  return out.filter(Boolean);
}

/** Délai avant le prochain essai : 2,5 s, 5 s, 10 s, 20 s, puis 30 s au plus (comme l'envoi actuel). */
export const retryDelayMs = (tries: number): number => Math.min(30000, 2500 * Math.pow(2, Math.min(Math.max(0, Number.isFinite(tries) ? Math.floor(tries) : 0), 4)));

/** Actions à envoyer maintenant, dans l'ordre où elles ont été faites. Rien du tout si l'appareil est hors ligne. */
export function dueOps(queue: Queue, nowIso: string, online: boolean, batch = 20): OfflineOp[] {
  if (!online) return [];
  const now = time(nowIso);
  return queue.filter(o => o.state === 'pending' && (!o.next_try_at || time(o.next_try_at) <= now)).sort((a, b) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id)).slice(0, Math.max(0, batch));
}

/** Envoi réussi : l'action sort de la file. */
export const afterSent = (queue: Queue, ids: string[]): Queue => { const s = new Set(ids); return queue.filter(o => !s.has(o.id)); };

/** Panne de réseau : on réessaie plus tard, l'action reste en attente (jamais déplacée dans « À revoir »). */
export function afterNetworkFailure(queue: Queue, id: string, nowIso: string): Queue {
  return queue.map(o => (o.id === id && o.state === 'pending' ? { ...o, tries: o.tries + 1, next_try_at: addMs(nowIso, retryDelayMs(o.tries)) } : o));
}

/** Le serveur a répondu non : l'action va dans « À revoir » avec la raison, le texte est gardé. */
export function afterRejected(queue: Queue, id: string, code: ReviewCode): Queue {
  return queue.map(o => (o.id === id ? { ...o, state: 'review' as const, review_code: code, next_try_at: undefined } : o));
}

/** Code d'un refus du serveur (statut HTTP et code d'erreur) vers la raison montrée. */
export function reviewCodeFor(status: number, code?: string): ReviewCode | null {
  if (status === 409 || code === 'conflict') return 'conflict';
  if (status === 404) return 'not_found';
  if (status === 403 || code === 'blocked' || code === 'schedule') return 'blocked';
  if (status === 400 || status === 413 || status === 422) return 'invalid';
  if (status === 401) return null; // connexion expirée : rien n'est perdu, reconnexion puis envoi
  if (status === 429) return null; // trop d'appels : on réessaie plus tard
  if (status >= 500 || status === 0 || status === 408) return null; // panne : on réessaie
  if (status >= 400) return 'refused';
  return null;
}

/** Les actions plus vieilles que la limite passent dans « À revoir » (jamais supprimées). */
export function expireOld(queue: Queue, nowIso: string, role: Role, limits: OfflineLimits = OFFLINE_DEFAULTS): Queue {
  const max = (role === 'admin' ? limits.admin_days : limits.operator_days) * 86_400_000;
  const now = time(nowIso);
  return queue.map(o => (o.state === 'pending' && Number.isFinite(time(o.created_at)) && now - time(o.created_at) > max ? { ...o, state: 'review' as const, review_code: 'too_old' as const } : o));
}

/** Remet une action de « À revoir » dans la file (la personne décide). */
export const requeue = (queue: Queue, id: string): Queue => queue.map(o => (o.id === id && o.state === 'review' ? { ...o, state: 'pending' as const, review_code: undefined, tries: 0, next_try_at: undefined } : o));
/** Supprime une action : seulement sur demande explicite de la personne. */
export const discard = (queue: Queue, id: string): Queue => queue.filter(o => o.id !== id);
export const reviewList = (queue: Queue): OfflineOp[] => queue.filter(o => o.state === 'review');

/** Si « À revoir » déborde, les plus anciens éléments sortent de la liste (jamais ceux en attente). */
export function trimReview(queue: Queue, limits: OfflineLimits = OFFLINE_DEFAULTS): { queue: Queue; dropped: OfflineOp[] } {
  const review = reviewList(queue);
  if (review.length <= limits.max_review) return { queue, dropped: [] };
  const sorted = [...review].sort((a, b) => time(a.created_at) - time(b.created_at));
  const drop = new Set(sorted.slice(0, review.length - limits.max_review).map(o => o.id));
  return { queue: queue.filter(o => !drop.has(o.id)), dropped: queue.filter(o => drop.has(o.id)) };
}

/** Texte à copier depuis « À revoir » : le texte saisi s'il existe, sinon le contenu de l'action. Jamais vide. */
export function copyText(op: OfflineOp, lang: string): string {
  const reason = op.review_code ? (lang === 'en' ? REVIEW_TEXT[op.review_code].en : REVIEW_TEXT[op.review_code].fr) : '';
  const body = op.text && op.text.trim() ? op.text : (() => { try { return JSON.stringify(op.payload); } catch { return ''; } })() || '—';
  return reason ? `${body}\n\n(${reason})` : body;
}

export interface QueueSummary { pending: number; review: number; photos: number; bytes: number; oldest: string | null }
export function summary(queue: Queue): QueueSummary {
  const pending = queue.filter(o => o.state === 'pending');
  const oldest = pending.map(o => o.created_at).filter(c => Number.isFinite(time(c))).sort((a, b) => time(a) - time(b))[0] || null;
  return { pending: pending.length, review: reviewList(queue).length, photos: pending.filter(o => (o.photo_bytes || 0) > 0).length, bytes: pending.reduce((t, o) => t + o.bytes + (o.photo_bytes || 0), 0), oldest };
}

// ---------- Conflits ----------
/** Le serveur a-t-il une version plus récente que celle sur laquelle la personne a travaillé ? Sans date de base : pas de conflit connu. */
export function detectConflict(op: Pick<OfflineOp, 'base_updated_at'>, serverUpdatedAt: string | undefined | null): boolean {
  const base = time(op.base_updated_at), server = time(serverUpdatedAt || undefined);
  return Number.isFinite(base) && Number.isFinite(server) && server > base;
}

export interface MoveLike { id: string; product_id: string; type: 'in' | 'out' | 'adjust'; qty: number }
/** Union des mouvements de stock du téléphone et du serveur (par numéro) : rien ne s'écrase, les quantités s'additionnent. */
export function mergeMoves<T extends MoveLike>(local: T[], server: T[]): T[] {
  const by = new Map<string, T>();
  for (const m of server) by.set(m.id, m);
  for (const m of local) if (!by.has(m.id)) by.set(m.id, m);
  return [...by.values()];
}
/** Quantité d'un produit = somme des mouvements (+ entrées, − sorties, ± ajustements). */
export function stockQty(moves: MoveLike[], productId: string): number {
  return moves.reduce((t, m) => (m.product_id !== productId || !Number.isFinite(m.qty) ? t : m.type === 'in' ? t + m.qty : m.type === 'out' ? t - m.qty : t + m.qty), 0);
}
/** Un mouvement de stock peut-il être enregistré hors ligne ? Entrée et sortie : quantité positive ; ajustement : jamais 0. */
export function moveOk(m: Partial<MoveLike> | null | undefined): boolean {
  if (!m || typeof m.id !== 'string' || !m.id || typeof m.product_id !== 'string' || !m.product_id || !Number.isFinite(m.qty)) return false;
  if (m.type === 'in' || m.type === 'out') return (m.qty as number) > 0;
  if (m.type === 'adjust') return (m.qty as number) !== 0;
  return false;
}

// ---------- Heure ----------
export interface TimeNote { device_at: string; received_at: string; trusted_at: string; skew_min: number; flagged: boolean }
/** L'heure de confiance est TOUJOURS celle du serveur ; l'écart avec le téléphone est signalé au-delà de 5 minutes. */
export function timeNote(deviceIso: string, receivedIso: string, flagMin = 5): TimeNote | null {
  const d = time(deviceIso), r = time(receivedIso);
  if (!Number.isFinite(d) || !Number.isFinite(r)) return null;
  const skew = Math.round((d - r) / 60000);
  return { device_at: deviceIso, received_at: receivedIso, trusted_at: receivedIso, skew_min: skew, flagged: Math.abs(skew) > flagMin };
}

// ---------- Session et copie locale ----------
/** La copie locale est-elle trop vieille ? Admin : 24 h ; opérateur : 7 jours (à partir de la dernière synchro réussie). */
export function copyExpired(savedAtIso: string | undefined | null, role: Role, nowIso: string, limits: OfflineLimits = OFFLINE_DEFAULTS): boolean {
  const saved = time(savedAtIso || undefined), now = time(nowIso);
  if (!Number.isFinite(saved) || !Number.isFinite(now)) return true; // date illisible : on ne garde pas
  const max = role === 'admin' ? limits.admin_copy_hours * 3_600_000 : limits.operator_copy_days * 86_400_000;
  return now - saved > max || saved - now > 5 * 60_000; // copie « du futur » (horloge fausse) : refusée
}
/** Une personne déjà connectée peut rouvrir l'appli sans réseau tant que son jeton (30 jours) n'a pas expiré. */
export function tokenUsableOffline(expiresAtMsOrIso: number | string | undefined | null, nowIso: string): boolean {
  const exp = typeof expiresAtMsOrIso === 'number' ? expiresAtMsOrIso : time(typeof expiresAtMsOrIso === 'string' ? expiresAtMsOrIso : undefined);
  return Number.isFinite(exp) && exp > time(nowIso);
}

// ---------- Code de verrouillage ----------
/** 4 à 8 chiffres, pas tous identiques, pas une suite (1234, 4321, 2468 non vérifié), pas une date évidente répétée. */
export function pinValid(pin: unknown): { ok: boolean; why?: Bilingual } {
  const bad = (fr: string, en: string) => ({ ok: false, why: { fr, en } });
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) return bad('Le code doit faire 4 à 8 chiffres.', 'The code must be 4 to 8 digits.');
  if (/^(\d)\1+$/.test(pin)) return bad('Évite un code avec le même chiffre partout.', 'Avoid a code with the same digit everywhere.');
  const d = pin.split('').map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every(x => x === 1) || steps.every(x => x === -1)) return bad('Évite une suite de chiffres (1234, 4321).', 'Avoid a run of digits (1234, 4321).');
  if (pin.length % 2 === 0 && pin.slice(0, pin.length / 2) === pin.slice(pin.length / 2)) return bad('Évite un code qui se répète (1212).', 'Avoid a repeating code (1212).');
  return { ok: true };
}
/** Attente (en secondes) avant un nouvel essai après `failures` erreurs de suite : rien jusqu'à 2, puis 30 s, 1 min, 5 min, 15 min, 1 h. Les actions en attente ne sont JAMAIS effacées. */
export function lockDelaySeconds(failures: number): number {
  const f = Math.max(0, Math.floor(Number.isFinite(failures) ? failures : 0));
  return f <= 2 ? 0 : f === 3 ? 30 : f === 4 ? 60 : f === 5 ? 300 : f === 6 ? 900 : 3600;
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const newSalt = (): string => { const a = new Uint8Array(16); globalThis.crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
/** Empreinte du code (PBKDF2, SHA-256). Le code n'est jamais gardé. NB : elle protège l'ACCÈS à l'écran, pas les données sur le disque (voir M13.3 : chiffrement de la copie admin). */
export async function hashPin(pin: string, saltHex: string, iterations = 150_000): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from((saltHex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));
  return hex(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export async function verifyPin(pin: string, saltHex: string, expectedHex: string, iterations = 150_000): Promise<boolean> {
  if (typeof pin !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const got = await hashPin(pin, saltHex, iterations);
  let diff = 0; for (let i = 0; i < 64; i++) diff |= got.charCodeAt(i) ^ expectedHex.charCodeAt(i); // comparaison sans arrêt anticipé
  return diff === 0;
}
