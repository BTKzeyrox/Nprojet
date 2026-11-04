// Menu « / » de l'assistant (comme le clavier de Telegram) : 6 gros boutons, sans défilement, sans recherche, sans titre.
// Pur : pas de serveur, pas d'horloge. Les 5 premiers envoient tout de suite une phrase que l'assistant comprend déjà (vérifié par `check:assistant-menu`) ;
// le 6e ouvre l'éditeur « Rédiger un message » sans rien envoyer. Ce que l'assistant comprend quand on TAPE n'est pas touché (assistant.ts, assistantShortcuts.ts).
import { b } from './assistant';
import type { Bi } from './siteSnapshot';
import type { Shortcut, ShortcutId } from './assistantShortcuts';

/** `send` : part tout de suite · `compose` : ouvre l'éditeur « Rédiger un message ». */
export type MenuKind = 'send' | 'compose';
export interface MenuItem { id: 'morning' | 'todo' | 'money' | 'overdue' | 'working' | 'compose'; label: Bi; send: Bi; kind: MenuKind; count?: number | null }

/** Hauteur du bloc, comme un clavier : entre 220 et 300 px. */
export const MENU_MIN_H = 220, MENU_MAX_H = 300;
/** Hauteur CSS de repli quand le clavier n'a pas pu être mesuré : 40 % de l'écran, entre 220 et 300 px. */
export const MENU_FALLBACK_H = `clamp(${MENU_MIN_H}px, 40dvh, ${MENU_MAX_H}px)`;
/** Hauteur du clavier mesurée avec visualViewport au moment de l'ouverture, bornée à 220–300 px ; `null` si elle n'est pas fiable (clavier fermé, navigateur sans visualViewport). */
export function menuHeightFromKeyboard(innerHeight: number, vvHeight: number | null | undefined, vvOffsetTop: number | null | undefined): number | null {
  if (!Number.isFinite(innerHeight) || typeof vvHeight !== 'number' || !Number.isFinite(vvHeight)) return null;
  const kb = Math.round(innerHeight - vvHeight - (Number.isFinite(vvOffsetTop as number) ? (vvOffsetTop as number) : 0));
  if (kb < 120) return null; // pas de vrai clavier ouvert : mesure fausse
  return Math.min(MENU_MAX_H, Math.max(MENU_MIN_H, kb));
}

const it = (id: MenuItem['id'], fr: string, en: string, kind: MenuKind = 'send', count?: number | null): MenuItem => ({ id, label: b(fr, en), send: b(fr, en), kind, ...(count !== undefined ? { count } : {}) });

/** Les 6 boutons, dans l'ordre de lecture (2 colonnes × 3 lignes). `shortcuts` = la liste du jour (`shortcutList`) pour le nombre de factures en retard. */
export function assistantMenu(shortcuts: Shortcut[] | null = null): MenuItem[] {
  const overdue = shortcuts ? (shortcuts.find(s => s.id === ('overdue' as ShortcutId))?.count ?? 0) : 0;
  return [
    it('morning', 'Résumé du jour', 'Daily summary'),
    it('todo', 'Quoi faire maintenant ?', 'What to do now?'),
    it('money', 'Argent du mois', 'Money this month'),
    it('overdue', 'Factures en retard', 'Overdue invoices', 'send', overdue),
    it('working', 'Qui travaille maintenant', 'Who is working now'),
    it('compose', 'Rédiger un message', 'Write a message', 'compose'),
  ];
}

/** Libellé du bouton avec son chiffre (« Factures en retard (3) ») : pas de chiffre pour 0 ou inconnu. */
export const menuLabel = (m: MenuItem, l: 'fr' | 'en'): string => `${l === 'en' ? m.label.en : m.label.fr}${m.count ? ` (${m.count})` : ''}`;
