// Règles du SERVEUR pour les actions envoyées après une coupure (module 13, M13.7) : « une même action n'est exécutée qu'une fois ».
// Le téléphone numérote chaque appel direct (en-tête `x-df-action-id`) et joint son heure (`x-df-device-time`). Si la réponse se perd et que le téléphone
// renvoie le même appel, le serveur NE le refait PAS : il rend la réponse gardée la première fois. Ce fichier est pur (sans réseau, sans base) ;
// son texte est recopié dans `supabase/functions/df-api/index.ts` (bloc OFFLINE_ACTIONS) et `npm run check:offline-server` vérifie que les deux sont identiques.
// Qui est concerné : seulement les appels qui NE se répètent PAS sans risque (commentaire, réaction-bascule, publication, décision de mission, rapport d'erreur).

// ===== BEGIN OFFLINE_ACTIONS (M13.7 : copie exacte de src/utils/offlineServer.ts ; ce bloc est contrôlé par scripts/check-offline-server.ts) =====
export const ONCE_ROUTES: readonly string[] = ['news-react', 'news-comment', 'news-comment-delete', 'news-comment-react', 'news-share', 'news-submit', 'post-decide', 'report-error'];
export const ACTION_RUNNING_MS = 120_000; // un appel « en cours » depuis plus longtemps est considéré comme tombé en panne : il peut être refait
export const ACTION_KEEP_DAYS = 30; // les fiches plus anciennes sont effacées
export const ACTION_BODY_MAX = 16_000; // réponse gardée : 16 000 caractères au plus (au-delà : seulement le code)

export interface ActionRecord {
  state: 'running' | 'done';
  route: string;
  started_at: string; // heure du serveur au début
  received_at: string; // heure de réception par le serveur
  device_time: string | null; // heure du téléphone quand l'action a été faite (nettoyée, sinon null)
  skew_s: number | null; // écart serveur - téléphone en secondes (négatif : le téléphone est en avance)
  status?: number;
  body?: string;
  body_cut?: boolean;
}
export interface ActionStore {
  claim(key: string, rec: ActionRecord): Promise<boolean>; // crée la fiche ; faux si elle existe déjà (jamais deux fois)
  read(key: string): Promise<ActionRecord | null>;
  update(key: string, rec: ActionRecord): Promise<void>;
  takeover(key: string, old: ActionRecord, rec: ActionRecord): Promise<boolean>; // remplace une fiche « en cours » tombée en panne, seulement si personne ne l'a changée entre-temps
  drop(key: string): Promise<void>;
}
export type OnceOutcome = { kind: 'fresh' | 'replay'; status: number; body: string; record: ActionRecord } | { kind: 'busy'; status: 409; body: string };

/** Numéro d'action accepté : 8 à 64 caractères (lettres, chiffres, - _ . :). Sinon null (l'appel est refusé avec une raison claire). */
export function cleanActionId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:-]{8,64}$/.test(s) ? s : null;
}
/** Heure du téléphone : acceptée si c'est une vraie date entre 2020 et demain ; sinon null (on l'ignore, on ne refuse pas l'action pour ça). */
export function cleanDeviceTime(v: unknown, nowMs: number): { iso: string | null; skew_s: number | null } {
  if (typeof v !== 'string' || v.length > 40) return { iso: null, skew_s: null };
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < Date.UTC(2020, 0, 1) || t > nowMs + 24 * 3600 * 1000) return { iso: null, skew_s: null };
  return { iso: new Date(t).toISOString(), skew_s: Math.round((nowMs - t) / 1000) };
}
/** Clé de la fiche : propre à la personne (une autre personne ne peut ni rejouer ni deviner la réponse). `anon` : appel sans connexion (rapport d'erreur). */
export function actionKey(userId: string | null, actionId: string): string { return `${userId || 'anon'}:${actionId}`; }

const iso = (ms: number) => new Date(ms).toISOString();
export const BUSY_BODY = JSON.stringify({ error: 'Cette action est déjà en cours d\'envoi : patiente quelques secondes, puis réessaie.', code: 'in_progress' });

/**
 * Exécute `exec` UNE seule fois pour ce numéro d'action.
 * - première fois : la fiche est créée (« en cours »), l'action est faite, la réponse est gardée (sauf erreur serveur 5xx : la fiche est effacée pour permettre un nouvel essai) ;
 * - déjà faite : on rend la même réponse, sans refaire ;
 * - en cours (appel simultané) : 409 « déjà en cours » ; si l'appel est tombé en panne depuis plus de 2 minutes, il est refait ;
 * - si `exec` lève une erreur, la fiche « en cours » est effacée puis l'erreur remonte (le téléphone pourra réessayer).
 */
export async function runOnce(store: ActionStore, key: string, route: string, deviceTimeRaw: unknown, nowMs: number, exec: () => Promise<{ status: number; body: string }>): Promise<OnceOutcome> {
  const dt = cleanDeviceTime(deviceTimeRaw, nowMs);
  const mine: ActionRecord = { state: 'running', route, started_at: iso(nowMs), received_at: iso(nowMs), device_time: dt.iso, skew_s: dt.skew_s };
  let owner = await store.claim(key, mine);
  if (!owner) {
    const old = await store.read(key);
    if (old && old.state === 'done') return { kind: 'replay', status: old.status ?? 200, body: old.body ?? JSON.stringify({ ok: (old.status ?? 200) < 400, replayed: true, note: 'Action déjà faite : la réponse d\'origine était trop longue pour être gardée.' }), record: old };
    if (old && old.state === 'running' && nowMs - Date.parse(old.started_at) < ACTION_RUNNING_MS) return { kind: 'busy', status: 409, body: BUSY_BODY };
    owner = old ? await store.takeover(key, old, mine) : await store.claim(key, mine); // fiche tombée en panne (ou disparue entre-temps)
    if (!owner) return { kind: 'busy', status: 409, body: BUSY_BODY };
  }
  let out: { status: number; body: string };
  try { out = await exec(); } catch (e) { await store.drop(key); throw e; }
  if (out.status >= 500) { await store.drop(key); return { kind: 'fresh', status: out.status, body: out.body, record: { ...mine, status: out.status } }; }
  const cut = out.body.length > ACTION_BODY_MAX;
  const done: ActionRecord = { ...mine, state: 'done', status: out.status, ...(cut ? { body_cut: true } : { body: out.body }) };
  await store.update(key, done);
  return { kind: 'fresh', status: out.status, body: out.body, record: done };
}
// ===== END OFFLINE_ACTIONS =====
