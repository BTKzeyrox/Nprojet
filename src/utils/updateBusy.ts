// La personne est-elle occupée ? (règle pure, sans réseau) : le rechargement après une mise à jour attend tant que c'est vrai.
// Utilisé par : updateWatcher.ts. Contrôlé par scripts/check-update-wait.ts.
// Pour modifier : TYPING_MS (frappe récente). Un champ actif mais VIDE (après l'envoi d'un message) ne compte pas comme « en train d'écrire ».
export const TYPING_MS = 8000;
interface DocLike { activeElement: unknown; querySelector(s: string): unknown; querySelectorAll(s: string): Iterable<{ value?: string }> }
export function isPageBusy(doc: DocLike, netBusy: number, lastTypedAt: number, now: number = Date.now()): boolean {
  if (netBusy > 0) return true; // envoi en cours
  const a = doc.activeElement as { tagName?: string; isContentEditable?: boolean } | null;
  if (a && (a.tagName === 'SELECT' || a.isContentEditable)) return true;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && now - lastTypedAt < TYPING_MS) return true; // frappe récente
  if (doc.querySelector('.fixed.inset-0')) return true; // fenêtre, menu ou animation ouverte
  const fields = doc.querySelectorAll(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=button]):not([type=submit]), textarea'
  );
  for (const f of fields) if (f.value && f.value.trim() !== '') return true; // texte écrit mais pas encore envoyé
  return false;
}
