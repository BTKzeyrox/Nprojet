// Paiements annulés (Module 23, M23.3a) : règle UNIQUE pour savoir quelles lignes de caisse comptent vraiment.
// Un paiement saisi par erreur n'est jamais supprimé : on ajoute une ligne de correction (sortie de même montant, même facture)
// qui cite le paiement par `void_of`. La paire « paiement + correction » s'annule : les statistiques, la trésorerie, les budgets,
// les rapports et le reste à payer l'ignorent. Le solde de la caisse est le même avec ou sans la paire.
// Tant qu'aucune ligne n'a `void_of` (cas d'aujourd'hui), rien ne change : la liste est rendue telle quelle.

export interface VoidLike { id: string; kind: string; amount_ar: number; invoice_id?: string; void_of?: string }

/** Correspondances valides « ligne de correction → paiement annulé » : même facture, même montant, un paiement qu'on annule une seule fois. */
export function voidPairs<T extends VoidLike>(cash: T[]): Map<string, string> {
  const pairs = new Map<string, string>(); // id de la correction → id du paiement
  if (!Array.isArray(cash) || !cash.some(c => c && c.void_of)) return pairs;
  const byId = new Map<string, T>();
  for (const c of cash) if (c && typeof c.id === 'string') byId.set(c.id, c);
  const used = new Set<string>();
  for (const c of cash) {
    if (!c || typeof c.void_of !== 'string' || !c.void_of || c.kind !== 'out') continue;
    const p = byId.get(c.void_of);
    if (!p || p.kind !== 'in' || used.has(p.id)) continue;
    if (!p.invoice_id || p.invoice_id !== c.invoice_id || p.amount_ar !== c.amount_ar) continue;
    used.add(p.id); pairs.set(c.id, p.id);
  }
  return pairs;
}

/** Ids des paiements annulés. */
export const voidedPaymentIds = <T extends VoidLike>(cash: T[]): Set<string> => new Set(voidPairs(cash).values());

/** La caisse « qui compte » : sans les paires paiement + correction. Une correction sans paiement valable reste visible (anomalie à voir). */
export function cashEffective<T extends VoidLike>(cash: T[]): T[] {
  const pairs = voidPairs(cash);
  if (!pairs.size) return cash;
  const drop = new Set<string>([...pairs.keys(), ...pairs.values()]);
  return cash.filter(c => !(c && drop.has(c.id)));
}
