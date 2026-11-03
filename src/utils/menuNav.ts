// Menu simplifié : aller à une entrée ou à un onglet, et quelles entrées sont dans la barre du bas (téléphone). Pur, sauf le réglage de l'onglet de Statistiques.
import { menuFor, openView, type MenuGroup, type MenuTab } from './menuGroups';
import { setStatsTab } from './statsNav';

export const BOTTOM_ENTRIES: Record<string, string[]> = {
  admin: ['feed', 'messages', 'missions', 'home'],
  accountant: ['feed', 'messages', 'clients', 'money', 'stock'],
  team_lead: ['feed', 'messages', 'missions'],
};
export const bottomEntriesOf = (role: unknown): string[] => BOTTOM_ENTRIES[String(role)] || [];

/** Ouvre une page du menu : règle l'onglet de Statistiques (chiffres ou Finances) puis change de page. */
export function goTo(target: { view: string; statsTab?: 'finance' }, navigate: (view: string) => void): void {
  if (target.view === 'stats') setStatsTab(target.statsTab === 'finance' ? 'finance' : 'stats');
  navigate(target.view);
}
export const goToEntry = (g: MenuGroup, lastTab: string | undefined, navigate: (view: string) => void): void => goTo(openView(g, lastTab), navigate);
export const goToTab = (t: MenuTab, navigate: (view: string) => void): void => goTo({ view: t.view, statsTab: t.statsTab }, navigate);
export const groupOf = (role: unknown, id: string, hiddenCsv: unknown): MenuGroup | undefined => menuFor(role, hiddenCsv).find(g => g.id === id);
