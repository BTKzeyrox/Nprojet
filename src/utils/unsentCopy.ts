// Filet de sécurité des textes envoyés SANS réseau et SANS copie protégée (BTK, 2026-11-12) : un responsable qui n'a pas créé son code de coffre n'a rien de gardé sur l'appareil ;
// si le téléphone recharge la page avant le retour du réseau, ce qu'il avait envoyé (message, publication, commentaire) disparaissait. On garde ici le TEXTE seulement, en clair,
// pour le lui rendre (« À récupérer »). Les éléments gardés par le coffre (kept) ne sont jamais copiés ici : ils reviennent tout seuls.
// Utilisé par : components/ConnectionBanner.tsx (copie en direct), components/UnsentRecovery.tsx (récupération). Contrôlé par `npm run check:unsent-copy`.
// Rangé par personne ; 7 jours ; 30 textes au plus ; 2000 caractères au plus par texte ; effacé à la déconnexion.
export const LIVE_PREFIX = 'df_unsent_live_';
export const LEFT_PREFIX = 'df_unsent_left_';
export const COPY_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const COPY_MAX = 30;
export const COPY_MAX_CHARS = 2000;
export interface Copy { key: string; col: string; text: string; at: number }
export interface UnsentLike { key: string; col: string; action: string; created: boolean; text?: string; kept: boolean }

const clean = (raw: string | null, nowMs: number): Copy[] => {
  try {
    const a = JSON.parse(raw || '[]');
    if (!Array.isArray(a)) return [];
    return a.filter((c: any) => c && typeof c.key === 'string' && typeof c.col === 'string' && typeof c.text === 'string' && c.text.trim() && Number.isFinite(Number(c.at)) && nowMs - Number(c.at) <= COPY_MAX_AGE_MS)
      .map((c: any) => ({ key: c.key.slice(0, 120), col: c.col.slice(0, 40), text: c.text.slice(0, COPY_MAX_CHARS), at: Number(c.at) })).slice(-COPY_MAX);
  } catch { return []; }
};
const put = (key: string, list: Copy[]) => { try { if (list.length) localStorage.setItem(key, JSON.stringify(list.slice(-COPY_MAX))); else localStorage.removeItem(key); } catch { /* plein ou bloqué : pas de copie, jamais d'erreur */ } };
const get = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

/** Les textes à copier : créés sans réseau, pas gardés par le coffre, avec un texte. */
export const copyCandidates = (items: UnsentLike[]): UnsentLike[] => items.filter(i => i.action === 'upsert' && i.created && !i.kept && !!i.text && !!i.text.trim());

const booted = new Set<string>(); // personnes dont les restes de la page précédente ont déjà été mis de côté, depuis le chargement de cette page
/** Test seulement : simule un rechargement de la page. */
export const _newPage = (): void => booted.clear();
/** Les textes encore « en direct » quand la page précédente est morte deviennent « à récupérer ». Fait UNE fois par chargement de page, toujours AVANT toute nouvelle copie en direct. */
function boot(uid: string, nowMs: number): void {
  if (booted.has(uid)) return;
  booted.add(uid);
  const live = clean(get(LIVE_PREFIX + uid), nowMs), left = clean(get(LEFT_PREFIX + uid), nowMs);
  if (live.length) {
    const have = new Set(left.map(c => c.key + '|' + c.text));
    put(LEFT_PREFIX + uid, [...left, ...live.filter(c => !have.has(c.key + '|' + c.text))]);
  }
  try { localStorage.removeItem(LIVE_PREFIX + uid); } catch { /* ignore */ }
}

/** Met à jour la copie « en direct » : exactement ce qui est en attente maintenant (ce qui est parti disparaît). */
export function syncLive(uid: string | undefined, items: UnsentLike[], nowMs: number = Date.now()): void {
  if (!uid) return;
  boot(uid, nowMs);
  const old = clean(get(LIVE_PREFIX + uid), nowMs), seen = new Map(old.map(c => [c.key, c.at]));
  put(LIVE_PREFIX + uid, copyCandidates(items).map(i => ({ key: i.key, col: i.col, text: (i.text as string).slice(0, COPY_MAX_CHARS), at: seen.get(i.key) ?? nowMs })));
}
/** Au démarrage de l'appli : la liste « à récupérer » (restes de la page précédente + ce qui n'a pas encore été ignoré). */
export function bootRecover(uid: string | undefined, nowMs: number = Date.now()): Copy[] {
  if (!uid) return [];
  boot(uid, nowMs);
  return clean(get(LEFT_PREFIX + uid), nowMs);
}
export const readLeft = (uid: string | undefined, nowMs: number = Date.now()): Copy[] => (uid ? clean(get(LEFT_PREFIX + uid), nowMs) : []);
/** « Ignorer » : retire un texte (par clé + texte), ou tout si `all`. */
export function dismissLeft(uid: string | undefined, which: { key: string; text: string } | 'all', nowMs: number = Date.now()): Copy[] {
  if (!uid) return [];
  const rest = which === 'all' ? [] : clean(get(LEFT_PREFIX + uid), nowMs).filter(c => !(c.key === which.key && c.text === which.text));
  put(LEFT_PREFIX + uid, rest); return rest;
}
export function clearAllCopies(): void {
  try { const ks: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith(LIVE_PREFIX) || k.startsWith(LEFT_PREFIX))) ks.push(k); } ks.forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}
