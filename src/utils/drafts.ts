// Brouillons de texte (BTK, 2026-11-12) : ce qu'on tape sans l'avoir envoyé est gardé sur l'appareil et remis au retour (changement d'application, rechargement, réseau coupé).
// Règle simple : un texte vide efface le brouillon ; envoyé avec succès (champ vidé) = brouillon effacé ; 7 jours maximum ; 20 000 caractères au plus par champ ; 60 brouillons au plus par personne.
// Rangé par personne (clé df_drafts_<id>), effacé à la déconnexion. Jamais de mot de passe, de code ni de clé : seuls les champs branchés explicitement sont gardés (voir useDraft).
// Utilisé par : utils/useDraft.ts. Contrôlé par `npm run check:drafts`.
export const DRAFTS_PREFIX = 'df_drafts_';
export const DRAFT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const DRAFT_MAX_CHARS = 20000;
export const DRAFT_MAX_COUNT = 60;
type Store = Record<string, { t: string; at: number }>;

const keyOf = (uid: string) => DRAFTS_PREFIX + uid;
function load(uid: string, nowMs: number): Store {
  try {
    const o = JSON.parse(localStorage.getItem(keyOf(uid)) || '{}');
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(o as Record<string, any>)) {
      if (v && typeof v.t === 'string' && v.t.trim() && Number.isFinite(Number(v.at)) && nowMs - Number(v.at) <= DRAFT_MAX_AGE_MS && /^[\w:.-]{1,100}$/.test(k)) out[k] = { t: v.t.slice(0, DRAFT_MAX_CHARS), at: Number(v.at) };
    }
    return out;
  } catch { return {}; }
}
function write(uid: string, s: Store): void {
  try { if (Object.keys(s).length) localStorage.setItem(keyOf(uid), JSON.stringify(s)); else localStorage.removeItem(keyOf(uid)); } catch { /* stockage plein ou bloqué : pas de brouillon, jamais d'erreur */ }
}

/** Le brouillon de ce champ ('' si aucun, trop vieux ou abîmé). */
export function readDraft(uid: string | undefined, scope: string, nowMs: number = Date.now()): string {
  if (!uid) return '';
  return load(uid, nowMs)[scope]?.t || '';
}
/** Garde le texte ; un texte vide (ou que des espaces) efface le brouillon. */
export function writeDraft(uid: string | undefined, scope: string, text: string, nowMs: number = Date.now()): void {
  if (!uid || !/^[\w:.-]{1,100}$/.test(scope)) return;
  const s = load(uid, nowMs);
  if (!text.trim()) delete s[scope]; else s[scope] = { t: text.slice(0, DRAFT_MAX_CHARS), at: nowMs };
  const keys = Object.keys(s);
  if (keys.length > DRAFT_MAX_COUNT) keys.sort((a, b) => s[a].at - s[b].at).slice(0, keys.length - DRAFT_MAX_COUNT).forEach(k => delete s[k]);
  write(uid, s);
}
/** Déconnexion : tous les brouillons de cet appareil sont effacés. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(DRAFTS_PREFIX)) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
