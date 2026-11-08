// Horloge du SERVEUR : les signes de vie (dernière activité, arrivée, départ) sont écrits avec l'heure du serveur. Comparés à l'heure de l'appareil, un PC ou un téléphone
// dont l'horloge avance (ou retarde) de plus de 2 minutes faisait passer tout le monde « Hors ligne ». Le site retient donc l'écart serveur - appareil à chaque rechargement.
// Règles pures, sans écran ni réseau ; contrôlées par `npm run check:server-clock`.
// Utilisé par : store.ts (écart mis à jour à chaque rechargement), useNow.ts, presenceStatus.ts, presenceCount.ts et presence.ts (heure « maintenant » des statuts).
// Pour modifier : le serveur envoie `serverTime` = son heure moins 3 s (marge de recouvrement, voir `state` dans df-api) ; d'où SERVER_TIME_MARGIN_MS.
export const SERVER_TIME_MARGIN_MS = 3000;
const MAX_OFFSET_MS = 30 * 24 * 3600 * 1000; // un écart de plus de 30 jours n'est pas une horloge qui dérive : on l'ignore
let offsetMs = 0;

/** Mémorise l'écart (heure du serveur - heure de l'appareil). Renvoie l'écart retenu, ou null si la réponse n'a pas d'heure valable (rien ne change). */
export function setServerClock(serverTimeIso: unknown, localNowMs: number = Date.now()): number | null {
  const t = typeof serverTimeIso === 'string' ? Date.parse(serverTimeIso) : NaN;
  if (!Number.isFinite(t)) return null;
  const off = t + SERVER_TIME_MARGIN_MS - localNowMs;
  if (!Number.isFinite(off) || Math.abs(off) > MAX_OFFSET_MS) return null;
  offsetMs = off;
  return off;
}

/** Écart actuel en millisecondes (positif : l'appareil retarde ; négatif : l'appareil avance). 0 tant que le serveur n'a rien répondu. */
export const clockOffsetMs = (): number => offsetMs;
/** « Maintenant » à l'heure du serveur : à utiliser pour comparer avec `last_seen` et les autres heures écrites par le serveur. */
export const serverNowMs = (): number => Date.now() + offsetMs;
export const resetServerClock = (): void => { offsetMs = 0; };
