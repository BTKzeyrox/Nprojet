// Menu « / » de l'assistant (comme le menu de commandes de Telegram) : tous les messages prêts à envoyer, rangés par groupe.
// Pur : pas de serveur, pas d'horloge. Chaque message est une phrase que l'assistant comprend déjà (vérifié par `check:assistant-menu`) :
// toucher un message l'envoie tout de suite et il reste dans l'historique comme un message normal. Aucun nom de personne dans le menu.
import { b } from './assistant';
import { FIGURE_IDS, type Bi, type FigureId } from './siteSnapshot';
import type { Shortcut, ShortcutId } from './assistantShortcuts';

export type MenuGroupId = 'summaries' | 'today' | 'money' | 'help';
export interface MenuItem { id: string; label: Bi; send: Bi; count?: number | null }
export interface MenuGroup { id: MenuGroupId; title: Bi; items: MenuItem[] }

const item = (id: string, fr: string, en: string, sendFr = fr, sendEn = en, count?: number | null): MenuItem => ({ id, label: b(fr, en), send: b(sendFr, sendEn), ...(count !== undefined ? { count } : {}) });

/** Un chiffre : le libellé du menu et la question qui l'explique (formule et lignes), comme « Pourquoi la marge ? ». */
export const FIGURE_MENU: Record<FigureId, { label: Bi; send: Bi }> = {
  received: { label: b('Argent reçu', 'Money received'), send: b('Pourquoi l\'argent reçu ?', 'Why the money received?') },
  expenses: { label: b('Dépenses', 'Expenses'), send: b('Pourquoi les dépenses ?', 'Why the expenses?') },
  salaries: { label: b('Salaires', 'Salaries'), send: b('Pourquoi les salaires ?', 'Why the salaries?') },
  profit: { label: b('Bénéfice', 'Profit'), send: b('Pourquoi le bénéfice ?', 'Why the profit?') },
  margin: { label: b('Marge', 'Margin'), send: b('Pourquoi la marge ?', 'Why the margin?') },
  billed: { label: b('Facturé', 'Billed'), send: b('Pourquoi le facturé ?', 'Why the billed amount?') },
  toCollect: { label: b('Estimé à encaisser', 'Estimated to collect'), send: b('Pourquoi l\'estimé à encaisser ?', 'Why estimated to collect?') },
  treasury: { label: b('Trésorerie', 'Cash on hand'), send: b('Pourquoi la trésorerie ?', 'Why the cash on hand?') },
  costPerMission: { label: b('Coût par mission', 'Cost per mission'), send: b('Pourquoi le coût par mission ?', 'Why the cost per mission?') },
  gainPerMission: { label: b('Gain par mission', 'Gain per mission'), send: b('Pourquoi le gain par mission ?', 'Why the gain per mission?') },
  stockValue: { label: b('Valeur du stock', 'Stock value'), send: b('Pourquoi la valeur du stock ?', 'Why the stock value?') },
  missionsDone: { label: b('Missions validées', 'Validated missions'), send: b('Pourquoi les missions validées ?', 'Why the validated missions?') },
};

/** Les boutons « chiffre du jour » repris dans le menu (toujours montrés, avec le chiffre quand il y en a un). */
const TODAY: [ShortcutId, string, string][] = [['validate', 'À valider', 'To validate'], ['advances', 'Avances', 'Advances'], ['overdue', 'Factures en retard', 'Overdue invoices'], ['stock', 'Stock bas', 'Low stock'], ['silent', 'Clients silencieux', 'Silent clients']];

/**
 * Les groupes du menu. `shortcuts` = la liste du jour (`shortcutList`) pour montrer les chiffres ; sans elle, les libellés restent simples.
 * Un groupe n'est jamais vide.
 */
export function assistantMenu(shortcuts: Shortcut[] | null = null): MenuGroup[] {
  const count = (id: ShortcutId): number | undefined => (shortcuts ? (shortcuts.find(s => s.id === id)?.count ?? 0) : undefined);
  return [
    { id: 'summaries', title: b('Résumés', 'Summaries'), items: [
      item('morning', 'Résumé du jour', 'Daily summary'),
      item('todo', 'Quoi faire maintenant ?', 'What to do now?'),
      item('suggest', 'Suggestions', 'Suggestions'),
      item('team', 'Liste les employés', 'List the employees'),
      item('working', 'Qui travaille maintenant', 'Who is working now'),
    ] },
    { id: 'today', title: b('À traiter aujourd\'hui', 'To handle today'), items: TODAY.map(([id, fr, en]) => item(id, fr, en, fr, en, count(id))) },
    { id: 'money', title: b('Argent et chiffres', 'Money and figures'), items: [
      item('money', 'Argent du mois', 'Money this month'),
      ...FIGURE_IDS.map(f => item(`figure-${f}`, FIGURE_MENU[f].label.fr, FIGURE_MENU[f].label.en, FIGURE_MENU[f].send.fr, FIGURE_MENU[f].send.en)),
    ] },
    { id: 'help', title: b('Aide', 'Help'), items: [item('help', 'Ce que tu sais faire', 'What you can do', 'Aide', 'Help')] },
  ];
}

/** Libellé du menu avec son chiffre (« Factures en retard (3) ») : pas de chiffre pour 0 ou inconnu. */
export const menuLabel = (it: MenuItem, l: 'fr' | 'en'): string => `${l === 'en' ? it.label.en : it.label.fr}${it.count ? ` (${it.count})` : ''}`;
