// Blocage après trop d'essais de connexion (module 16, M16.3) : règles pures, sans écran, sans serveur, sans réseau.
// Le serveur (bloc LOGINGUARD de df-api) a la même copie ; `npm run check:login-guard` compare les deux et simule des séries d'essais.
// Idée : on compte les essais RATÉS par compte (pseudo tapé) et par adresse. Après quelques ratés, un délai qui double à chaque fois
// (1 min, 2, 4, 8, 16, 30). Jamais un blocage définitif : le délai passe tout seul, et il est plus court pour le responsable (5 min au plus).
// Pendant un délai, le mot de passe n'est même pas vérifié (une bonne réponse n'ouvre rien), et un essai de plus ne rallonge PAS le délai
// (sinon un inconnu pourrait garder le responsable dehors en tapant sans arrêt).

export const GUARD = {
  windowSec: 900, // 15 min sans nouvel essai raté : le compteur est oublié
  account: { free: 5, baseSec: 60, maxSec: 1800, adminMaxSec: 300 },
  ip: { free: 20, baseSec: 60, maxSec: 1800 },
};
export type GuardKind = 'account' | 'ip';
export interface Attempt { fails: number; locks: number; last_at: number; locked_until: number }

const nat = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 8_640_000_000_000_000) : 0);
const EMPTY: Attempt = { fails: 0, locks: 0, last_at: 0, locked_until: 0 };

/** Ce qui vient de la base est nettoyé : une ligne abîmée = aucun compteur (jamais de blocage par erreur). */
export function cleanAttempt(raw: unknown): Attempt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  return { fails: Math.min(nat(r.fails), 1000), locks: Math.min(nat(r.locks), 100), last_at: nat(r.last_at), locked_until: nat(r.locked_until) };
}

/** Secondes d'attente restantes (0 = pas de délai). */
export function lockLeftSec(a: Attempt | undefined, nowMs: number): number {
  const c = cleanAttempt(a);
  if (!c || c.locked_until <= nowMs) return 0;
  return Math.ceil((c.locked_until - nowMs) / 1000);
}

/** Un essai raté de plus : met le compteur à jour et dit si un délai commence maintenant. */
export function afterFailure(prev: Attempt | undefined, nowMs: number, kind: GuardKind, adminAccount = false): { next: Attempt; lockedNow: boolean; lockSec: number } {
  let p: Attempt = cleanAttempt(prev) || EMPTY;
  if (nowMs - Math.max(p.last_at, p.locked_until) > GUARD.windowSec * 1000) p = EMPTY; // plus rien depuis longtemps : on oublie
  if (p.locked_until > nowMs) return { next: p, lockedNow: false, lockSec: 0 }; // déjà en délai : on ne le rallonge pas
  const spec = GUARD[kind];
  const fails = p.fails + 1;
  if (fails < spec.free) return { next: { fails, locks: p.locks, last_at: nowMs, locked_until: 0 }, lockedNow: false, lockSec: 0 };
  const locks = Math.min(p.locks + 1, 100);
  const cap = kind === 'account' && adminAccount ? GUARD.account.adminMaxSec : spec.maxSec;
  const lockSec = Math.min(cap, spec.baseSec * 2 ** Math.min(locks - 1, 20));
  return { next: { fails: 0, locks, last_at: nowMs, locked_until: nowMs + lockSec * 1000 }, lockedNow: true, lockSec };
}

/** Faut-il refuser l'essai avant même de regarder le mot de passe ? On attend le délai le plus long des deux (compte, adresse). */
export function guardDecision(account: Attempt | undefined, ip: Attempt | undefined, nowMs: number): { blocked: boolean; waitSec: number } {
  const waitSec = Math.max(lockLeftSec(account, nowMs), lockLeftSec(ip, nowMs));
  return { blocked: waitSec > 0, waitSec };
}

/** Phrase montrée à la personne (la même, que le compte existe ou non : on ne dit rien de plus à un inconnu). */
export function retryMessage(waitSec: number): string {
  const s = Math.max(1, Math.ceil(waitSec));
  if (s < 60) return `Trop d'essais. Réessayez dans ${s} seconde${s > 1 ? 's' : ''}.`;
  const m = Math.ceil(s / 60);
  return `Trop d'essais. Réessayez dans ${m} minute${m > 1 ? 's' : ''}.`;
}

/** Clés de la table : une pour le compte tapé, une pour l'adresse. Une adresse qui n'a pas la forme d'une adresse IP n'est pas comptée. */
export function guardKeys(username: string, ip: string): { account: string; ip: string | null } {
  const u = String(username ?? '').trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60); // même écriture que la recherche du compte : « a dmin » n'est pas « admin »
  const addr = String(ip ?? '').trim();
  return { account: `a:${u || '_'}`, ip: /^[0-9a-fA-F:.]{3,45}$/.test(addr) ? `i:${addr}` : null };
}
