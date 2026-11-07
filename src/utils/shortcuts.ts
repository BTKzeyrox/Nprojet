// Raccourcis clavier de l'ordinateur (BTK, 2026-11-08) : logique pure, sans écran. Utilisé par App.tsx (écoute), ShortcutsHelp.tsx (liste affichée) et check:shortcuts.
// Règle d'or : AUCUN raccourci de l'appli ne se déclenche pendant qu'on écrit dans un champ (sauf Ctrl+K), et ceux du navigateur (Ctrl+C, V, X, A, Z, F…) restent intacts.

export interface KeyLike {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; defaultPrevented?: boolean; isComposing?: boolean; repeat?: boolean;
}
export type ShortcutAction =
  | { kind: 'none' }
  | { kind: 'search' }
  | { kind: 'help' }
  | { kind: 'prefix' } // « g » : la touche suivante choisit la page
  | { kind: 'go'; view: 'feed' | 'chat' | 'calendar' | 'dashboard' | 'grid' };

/** Vrai si la cible est un endroit où l'on écrit (champ, zone de texte, liste, texte modifiable). */
export function isTypingElement(el: unknown): boolean {
  const n = el as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!n || !n.tagName) return false;
  const tag = String(n.tagName).toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(String(n.type || 'text').toLowerCase());
  return !!n.isContentEditable;
}

export const GO_TARGETS = (isAdmin: boolean): Record<string, 'feed' | 'chat' | 'calendar' | 'dashboard' | 'grid'> =>
  ({ a: 'feed', m: 'chat', c: 'calendar', t: isAdmin ? 'dashboard' : 'grid' });

export function resolveShortcut(e: KeyLike, typing: boolean, afterG: boolean, isAdmin: boolean): ShortcutAction {
  if (e.defaultPrevented || e.isComposing) return { kind: 'none' };
  const k = String(e.key || '');
  // Ctrl+K / Cmd+K : recherche, de n'importe où (même dans un champ) ; le navigateur n'a pas de raccourci utile sur cette combinaison dans la page
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k.toLowerCase() === 'k') return { kind: 'search' };
  if (e.ctrlKey || e.metaKey || e.altKey) return { kind: 'none' };
  if (typing) return { kind: 'none' };
  if (e.repeat) return { kind: 'none' };
  if (k === '/') return { kind: 'search' };
  if (k === '?') return { kind: 'help' };
  if (afterG) {
    const v = GO_TARGETS(isAdmin)[k.toLowerCase()];
    return v ? { kind: 'go', view: v } : { kind: 'none' };
  }
  if (k === 'g' || k === 'G') return { kind: 'prefix' };
  return { kind: 'none' };
}

/** La liste affichée par « ? » (une seule source : ce qui est affiché = ce qui marche). */
export const SHORTCUT_LIST = (isAdmin: boolean): { group: string; items: { keys: string; label: string }[] }[] => [
  { group: 'Partout (hors champ d\'écriture)', items: [
    { keys: '/  ou  Ctrl + K', label: 'Rechercher' },
    { keys: 'g puis a', label: 'Actualités' },
    { keys: 'g puis m', label: 'Messages' },
    { keys: 'g puis c', label: 'Calendrier' },
    { keys: 'g puis t', label: isAdmin ? 'Tableau de bord' : 'Missions' },
    { keys: '?', label: 'Afficher cette liste' },
    { keys: 'Échap', label: 'Fermer la recherche, le menu ou la fenêtre' },
  ] },
  { group: 'Messagerie', items: [
    { keys: 'Entrée  ou  Ctrl + Entrée', label: 'Envoyer' },
    { keys: '↑ (champ vide)', label: 'Modifier mon dernier message' },
    { keys: 'Échap', label: 'Annuler la réponse ou la modification' },
  ] },
  { group: 'Dans un champ d\'écriture', items: [
    { keys: 'Ctrl + A / C / X / V / Z / Y', label: 'Comme d\'habitude (le navigateur s\'en occupe)' },
  ] },
];
