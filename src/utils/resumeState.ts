// Reprise après rechargement (BTK, 2026-11-12) : quand le téléphone retire le site de la mémoire (changement d'application, 1 à 10 minutes) puis le recharge,
// la personne retrouve la même page, la même discussion et la même position, si elle est partie depuis moins de 30 minutes. Garde seulement : page, discussion, hauteur de défilement. Jamais de texte écrit.
// Utilisé par : App.tsx (page, défilement), ChatView.tsx (discussion ouverte). Contrôlé par `npm run check:resume`. Stockage : localStorage de l'appareil, clé df_resume, par personne ; effacé à la déconnexion.
export const RESUME_KEY = 'df_resume';
export const RESUME_MAX_MS = 30 * 60 * 1000;
export interface Resume { uid: string; view: string; scroll: number; chat: string; at: number }

/** Relit la valeur gardée : renvoie null si elle est abîmée, trop vieille (plus de 30 min), d'une autre personne ou sans page. Ne lève jamais d'erreur. */
export function parseResume(raw: string | null | undefined, uid: string, nowMs: number): Resume | null {
  try {
    const o = JSON.parse(raw || 'null');
    if (!o || typeof o !== 'object' || !uid || o.uid !== uid) return null;
    const at = Number(o.at);
    if (!Number.isFinite(at) || nowMs - at > RESUME_MAX_MS || at - nowMs > 60_000) return null;
    const view = typeof o.view === 'string' ? o.view.slice(0, 40) : '';
    if (!/^[a-z0-9_-]+$/i.test(view)) return null;
    const scroll = Number.isFinite(Number(o.scroll)) ? Math.min(200000, Math.max(0, Math.round(Number(o.scroll)))) : 0;
    const chat = typeof o.chat === 'string' && /^[\w:.-]{1,80}$/.test(o.chat) ? o.chat : '';
    return { uid, view, scroll, chat, at };
  } catch { return null; }
}

export function readResume(uid: string | undefined, nowMs: number = Date.now()): Resume | null {
  try { return uid ? parseResume(localStorage.getItem(RESUME_KEY), uid, nowMs) : null; } catch { return null; }
}

/** Note un changement (page, défilement ou discussion) ; l'heure est remise à maintenant. */
export function noteResume(uid: string | undefined, patch: Partial<Pick<Resume, 'view' | 'scroll' | 'chat'>>, nowMs: number = Date.now()): void {
  if (!uid) return;
  try {
    const old = parseResume(localStorage.getItem(RESUME_KEY), uid, nowMs);
    const next: Resume = { uid, view: old?.view || 'feed', scroll: old?.scroll || 0, chat: old?.chat || '', at: nowMs, ...patch };
    localStorage.setItem(RESUME_KEY, JSON.stringify(next));
  } catch { /* stockage bloqué : on ne reprend simplement pas */ }
}

// Discussion à rouvrir UNE seule fois, juste après un rechargement (sinon « Messagerie » garderait toujours la dernière discussion).
let bootChat = '';
export const setBootChat = (c: string): void => { bootChat = c; };
export function takeBootChat(): string { const c = bootChat; bootChat = ''; return c; }

export function clearResume(): void { try { localStorage.removeItem(RESUME_KEY); } catch { /* ignore */ } }
