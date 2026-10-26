// Pont entre le magasin de données et la file d'actions hors ligne (module 13, M13.5) : règles pures, sans réseau, sans stockage.
// Principe : le magasin sait déjà quoi envoyer (il compare ses données à la dernière version connue du serveur). La file d'actions n'est donc PAS un
// deuxième envoyeur : c'est le MIROIR durable de cette comparaison. Au démarrage on remet ces actions sur les données, et le magasin les envoie comme avant.
// Envoyer deux fois la même modification est sans danger (le serveur enregistre « cet élément, dans cet état »).
// Contrôlé par `npm run check:offline-sync`.
import { inlineFileStats } from './dataUrls';
import { OFFLINE_DEFAULTS, collectionPolicy, enqueue, type Bilingual, type OfflineLimits, type OfflineOp, type Queue, type Role } from './offline';

/** Empreinte courte (FNV-1a 32 bits) d'un texte : sert à voir si le serveur a changé un élément pendant qu'on travaillait hors ligne. */
export function hashJson(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export type Changes = Record<string, { upserts: any[]; deletes: string[] }>;
export type SyncedJson = Record<string, Map<string, string>>;
export interface Skipped { col: string; id: string; why: Bilingual }

const key = (col: string, id: string) => `${col}|${id}`;
const TEXT_FIELDS = ['text', 'content', 'message', 'note', 'title', 'name'];
/** Texte saisi par la personne, gardé pour qu'elle puisse le copier si l'action est refusée. */
export function textOf(rec: unknown): string | undefined {
  if (!rec || typeof rec !== 'object') return undefined;
  for (const f of TEXT_FIELDS) { const v = (rec as Record<string, unknown>)[f]; if (typeof v === 'string' && v.trim()) return v.slice(0, 2000); }
  return undefined;
}
const parse = (json: string | undefined): any => { if (json === undefined) return undefined; try { return JSON.parse(json); } catch { return undefined; } };

/**
 * Remplace les actions « en attente » par le miroir de la comparaison actuelle. Garde : le numéro, l'heure de départ et le nombre d'essais d'une action déjà connue,
 * et tous les éléments « À revoir ». Ne garde PAS (et le dit dans `skipped`) ce qui doit rester en ligne seulement (argent, comptes…) ou ne rentre pas dans les limites.
 */
export function buildOps(prev: Queue, changes: Changes, synced: SyncedJson, role: Role, nowIso: string, limits: OfflineLimits = OFFLINE_DEFAULTS): { queue: Queue; skipped: Skipped[] } {
  const before = new Map<string, OfflineOp>();
  for (const o of prev) if (o.state === 'pending' && o.kind === 'record' && o.collection && o.record_id) before.set(key(o.collection, o.record_id), o);
  let queue: Queue = prev.filter(o => o.state === 'review'); // « À revoir » : jamais touchés ici
  const skipped: Skipped[] = [];
  const fresh: OfflineOp[] = [];
  for (const col of Object.keys(changes).sort()) {
    const c = changes[col];
    for (const rec of c.upserts) {
      if (!rec || typeof rec.id !== 'string') continue;
      fresh.push(makeOp(col, rec.id, 'upsert', rec, before.get(key(col, rec.id)), synced, nowIso));
    }
    for (const id of c.deletes) {
      const last = parse(synced[col]?.get(id));
      fresh.push(makeOp(col, id, 'delete', last ?? { id }, before.get(key(col, id)), synced, nowIso));
    }
  }
  fresh.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  for (const op of fresh) {
    const r = enqueue(queue, op, role, limits);
    if (r.error) skipped.push({ col: op.collection!, id: op.record_id!, why: r.why! });
    else queue = r.queue;
  }
  return { queue, skipped };
}

function makeOp(col: string, id: string, action: 'upsert' | 'delete', payload: any, prev: OfflineOp | undefined, synced: SyncedJson, nowIso: string): OfflineOp {
  const baseJson = synced[col]?.get(id);
  const createdOffline = prev ? !!prev.created_offline : baseJson === undefined;
  return {
    id: key(col, id), kind: 'record', collection: col, record_id: id, action, payload, created_offline: createdOffline,
    created_at: prev?.created_at ?? nowIso, tries: prev?.tries ?? 0, next_try_at: prev?.next_try_at, state: 'pending', bytes: 0,
    base_hash: prev ? prev.base_hash : baseJson !== undefined ? hashJson(baseJson) : undefined, // la version de DÉPART est gardée, pas celle d'après la dernière modification
    text: textOf(payload) ?? prev?.text,
    ...photoFields(payload),
  };
}
/** Photos collées dans l'enregistrement : comptées pour respecter les limites (20 photos, 30 Mo). */
function photoFields(payload: unknown): { photos?: number; photo_bytes?: number } {
  const st = inlineFileStats(payload);
  return st.count > 0 ? { photos: st.count, photo_bytes: st.bytes } : {};
}

export type Arrays = Record<string, any[]>;
export interface ApplyResult { arrays: Arrays; applied: Queue; conflicts: Queue }

/**
 * Remet les actions en attente sur les données du serveur (au démarrage ou après la connexion).
 * Si le serveur a changé l'élément depuis (empreinte différente) ou ne l'a plus : CONFLIT. Le serveur gagne, l'action passe dans « À revoir » (le texte est gardé).
 * Ne modifie pas les tableaux reçus.
 */
export function applyQueue(arrays: Arrays, synced: SyncedJson, ops: Queue, role: Role): ApplyResult {
  const out: Arrays = {};
  for (const [c, list] of Object.entries(arrays)) out[c] = [...list];
  const applied: Queue = [], conflicts: Queue = [];
  const pending = ops.filter(o => o.state === 'pending' && o.kind === 'record' && o.collection && o.record_id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const op of pending) {
    const col = op.collection!, id = op.record_id!;
    if (collectionPolicy(role, col, op.payload as any).mode !== 'queue') { conflicts.push({ ...op, state: 'review', review_code: 'refused' }); continue; } // règle changée depuis : jamais envoyée sans accord
    const serverJson = synced[col]?.get(id);
    const list = (out[col] ||= []);
    if (!op.created_offline && op.base_hash) {
      if (serverJson === undefined) {
        if (op.action === 'delete') continue; // déjà supprimé sur le serveur : c'est ce que la personne voulait, rien à faire
        conflicts.push({ ...op, state: 'review', review_code: 'not_found' }); // modifié hors ligne mais supprimé sur le serveur
        continue;
      }
      if (hashJson(serverJson) !== op.base_hash) { conflicts.push({ ...op, state: 'review', review_code: 'conflict' }); continue; }
    }
    const at = list.findIndex(x => x && x.id === id);
    if (op.action === 'delete') { if (at >= 0) list.splice(at, 1); }
    else if (at >= 0) list[at] = op.payload; else list.push(op.payload);
    applied.push(op);
  }
  return { arrays: out, applied, conflicts };
}

export interface RejectedItem { col: string; id: string; reason: string }
/**
 * Le serveur a refusé ces éléments : on garde ce que la personne avait fait dans « À revoir » (avec la raison écrite par le serveur) au lieu de tout recharger en silence.
 * Seulement pour ce qui a le droit d'attendre hors ligne ; le reste (argent, comptes) n'est pas gardé sur l'appareil.
 */
export function rejectedToReview(queue: Queue, rejected: RejectedItem[], lookup: (col: string, id: string) => unknown, role: Role, nowIso: string): Queue {
  let out = [...queue];
  for (const r of rejected) {
    if (!r || typeof r.col !== 'string' || typeof r.id !== 'string') continue;
    const k = key(r.col, r.id);
    const at = out.findIndex(o => o.id === k && o.state === 'pending');
    const base = at >= 0 ? out[at] : undefined;
    const payload = base ? base.payload : lookup(r.col, r.id);
    if (payload === undefined || payload === null) continue;
    if (collectionPolicy(role, r.col, payload as any).mode !== 'queue') continue;
    const op: OfflineOp = { ...(base || { id: k, kind: 'record' as const, collection: r.col, record_id: r.id, action: 'upsert' as const, payload, created_at: nowIso, tries: 0, bytes: 0 }), id: `${k}|refused|${out.filter(o => o.id.startsWith(k + '|refused')).length}`, state: 'review', review_code: 'refused', review_note: String(r.reason || '').slice(0, 300), text: textOf(payload) ?? base?.text, tries: 0, next_try_at: undefined };
    if (at >= 0) out.splice(at, 1);
    out.push(op);
  }
  return out;
}

/** « Renvoyer » depuis « À revoir » : remet le contenu de l'action sur les données (la personne a décidé que sa version doit gagner). */
export function reapply(arrays: Arrays, op: OfflineOp): Arrays {
  const out: Arrays = {};
  for (const [c, l] of Object.entries(arrays)) out[c] = [...l];
  if (op.kind !== 'record' || !op.collection || !op.record_id) return out;
  const list = (out[op.collection] ||= []);
  const at = list.findIndex(x => x && x.id === op.record_id);
  if (op.action === 'delete') { if (at >= 0) list.splice(at, 1); }
  else if (at >= 0) list[at] = op.payload; else list.push(op.payload);
  return out;
}
