// Validation à plusieurs niveaux (module 15, M15.6). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:approval-limit`.
// Le responsable règle un plafond (en Ar). Au-dessus de ce plafond, la décision sur une mission (valider un début, valider une fin, refuser) revient au responsable :
// le Chef d'équipe n'a plus le droit de décider. Le montant comparé est le PRIX CLIENT de la mission (la paie est la même pour toutes les missions, elle ne peut pas servir de seuil).
// Le calcul se fait chez le serveur (le Chef d'équipe ne doit jamais voir les prix). Le serveur a la même copie, dans le bloc LEADLIMIT de df-api.
export const TEAM_LEAD_LIMIT_MAX = 1000000000;

/** Le plafond du réglage : un nombre entier d'Ar. 0, absent ou valeur fausse = pas de plafond. */
export function cleanTeamLeadLimit(v: unknown): number {
  return typeof v === 'number' && isFinite(v) && v >= 1 ? Math.min(Math.round(v), TEAM_LEAD_LIMIT_MAX) : 0;
}

/** Vrai si la décision doit venir du responsable : c'est un Chef d'équipe, un plafond est réglé et le prix de la mission est STRICTEMENT au-dessus. Le responsable n'est jamais bloqué. */
export function decisionNeedsAdmin(role: unknown, price: unknown, limit: unknown): boolean {
  const l = cleanTeamLeadLimit(limit);
  return role === 'team_lead' && l > 0 && typeof price === 'number' && isFinite(price) && price > l;
}
