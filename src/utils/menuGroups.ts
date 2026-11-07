// Menu fusionné (module 22, M22.5) : règles PURES, sans écran ni serveur. 25 entrées d'avant → 12 entrées (Calendrier et Réglages ont leur propre entrée) avec onglets.
// Rien n'est supprimé : chaque ancienne page est un onglet. Les droits viennent de roles.ts (aucun rôle ne gagne ni ne perd de page).
// Contrôlé par `npm run check:menu-groups`.
import { viewAllowedFor } from './roles';
import { parseHidden } from './moduleSwitch';
import { KNOWN_VIEWS } from './health/menu';
import { WORK_SETTINGS_LIVE } from './workTypes';

export interface MenuTab { id: string; view: string; statsTab?: 'finance'; hide?: string; hideIfAll?: string[]; fr: string; en: string }
export interface MenuGroup { id: string; fr: string; en: string; tabs: MenuTab[] }

const tab = (id: string, fr: string, en: string, extra: Partial<MenuTab> = {}): MenuTab => ({ id, view: id, fr, en, ...extra });

/** Le menu du responsable (toutes les pages). Les autres rôles en voient une partie (voir menuFor). */
export const ADMIN_GROUPS: MenuGroup[] = [
  { id: 'home', fr: 'Tableau de bord', en: 'Dashboard', tabs: [tab('dashboard', 'Tableau de bord', 'Dashboard', { hide: 'dashboard' }), tab('health', 'Santé du site', 'Site health'), tab('direction', 'Direction', 'Direction', { hide: 'direction' })] },
  { id: 'feed', fr: 'Actualités', en: 'News', tabs: [tab('feed', 'Actualités', 'News')] },
  { id: 'missions', fr: 'Missions', en: 'Missions', tabs: [tab('validations', 'À valider', 'To approve', { hide: 'validations' }), tab('grid', 'Tableau des missions', 'Mission board', { hide: 'grid' }), tab('history', 'Historique', 'History', { hide: 'history' }), tab('stats', 'Statistiques', 'Statistics', { hide: 'stats', hideIfAll: ['validations', 'grid', 'history'] })] },
  { id: 'team', fr: 'Équipe', en: 'Team', tabs: [tab('employees', 'Opérateurs', 'Operators'), tab('active-post', 'Sessions', 'Sessions', { hide: 'active-post' }), tab('worksheet', 'Feuille du jour', 'Daily sheet'), tab('performance', 'Performance', 'Performance', { hide: 'performance' }), tab('hr', 'Ressources humaines', 'Human resources', { hide: 'hr' }), tab('advances', 'Paie', 'Payroll', { hide: 'advances' })] },
  { id: 'clients', fr: 'Clients', en: 'Clients', tabs: [tab('clients', 'Clients', 'Clients', { hide: 'clients' }), tab('invoices', 'Facturation', 'Invoicing', { hide: 'invoices' })] },
  { id: 'money', fr: 'Argent', en: 'Money', tabs: [{ id: 'finance', view: 'stats', statsTab: 'finance', hide: 'stats', fr: 'Finances', en: 'Finances' }, tab('treasury', 'Trésorerie', 'Treasury'), tab('accounting', 'Comptabilité', 'Accounting')] },
  { id: 'stock', fr: 'Stock', en: 'Stock', tabs: [tab('storage', 'Stockage', 'Storage', { hide: 'storage' }), tab('purchasing', 'Achats', 'Purchasing', { hide: 'purchasing' })] },
  { id: 'charts', fr: 'Graphiques', en: 'Charts', tabs: [tab('charts', 'Graphiques', 'Charts', { hide: 'charts' })] },
  { id: 'messages', fr: 'Messages', en: 'Messages', tabs: [tab('chat', 'Messagerie', 'Messaging', { hide: 'chat' })] },
  { id: 'calendar', fr: 'Calendrier', en: 'Calendar', tabs: [tab('calendar', 'Calendrier', 'Calendar', { hide: 'calendar' })] },
  { id: 'control', fr: 'Contrôle', en: 'Control', tabs: [tab('errors', 'Journal des erreurs', 'Error log'), tab('security', 'Sécurité', 'Security'), tab('sheets', 'Tableaux d\'équipe', 'Team tables', { hide: 'sheets' })] },
  { id: 'settings', fr: 'Réglages', en: 'Settings', tabs: [tab('settings', 'Réglages', 'Settings')] },
];
export const MAX_TABS = 5;

/** Menu de l'opérateur : inchangé (une entrée = une page). Il garde sa vue simple. */
export const EMPLOYEE_VIEWS = ['feed', 'grid', 'active-post', 'advances', 'chat', 'calendar', 'hr', 'sheets', 'my-performance', 'settings'] as const;
const EMPLOYEE_LABELS: Record<string, [string, string]> = {
  feed: ['Actualités', 'News'], grid: ['Contrats', 'Contracts'], 'active-post': ['Ma mission', 'My mission'], advances: ['Ma paie', 'My pay'], chat: ['Messagerie', 'Messaging'], calendar: ['Calendrier', 'Calendar'],
  hr: ['Mon dossier et congés', 'My file and leave'], sheets: ['Mes tableaux', 'My tables'], 'my-performance': ['Ma performance', 'My performance'], settings: ['Réglages', 'Settings'],
};

/** Anciennes vues qui n'étaient pas dans le menu mais qui existent (sous-page, fiche) → l'onglet où elles vivent maintenant. */
export const VIEW_ALIASES: Record<string, string> = { sessions: 'active-post', operator: 'employees' };
/** Pages qui ne sont pas des entrées du menu (fenêtre du profil). */
export const NON_MENU_VIEWS = ['profile', 'login'];

const clone = (g: MenuGroup, tabs: MenuTab[]): MenuGroup => ({ ...g, tabs });

/** Le menu d'un rôle : entrées et onglets visibles, pages cachées par le responsable retirées. Une entrée sans onglet disparaît. Rôle inconnu = opérateur. */
export function menuFor(role: unknown, hiddenCsv: unknown = ''): MenuGroup[] {
  if (role !== 'admin' && role !== 'accountant' && role !== 'team_lead') {
    return EMPLOYEE_VIEWS.filter(v => !parseHidden(hiddenCsv).includes(v)).map(v => ({ id: v, fr: EMPLOYEE_LABELS[v][0], en: EMPLOYEE_LABELS[v][1], tabs: [tab(v, EMPLOYEE_LABELS[v][0], EMPLOYEE_LABELS[v][1])] }));
  }
  const hidden = parseHidden(hiddenCsv); // comme aujourd'hui : une page cachée par le responsable l'est pour tous les rôles
  return ADMIN_GROUPS
    .map(g => clone(g, g.tabs.filter(t => (WORK_SETTINGS_LIVE || t.view !== 'worksheet') && viewAllowedFor(role, t.view) && !(t.hide && hidden.includes(t.hide)) && !(t.hideIfAll && t.hideIfAll.every(h => hidden.includes(h))))))
    .filter(g => g.tabs.length > 0);
}

/** Où vit une ancienne vue dans le menu d'un rôle ? `null` = pas accessible à ce rôle (ou vue inconnue). Un lien d'alerte, de l'assistant ou de la cloche passe par ici. */
export function locate(role: unknown, view: string, hiddenCsv: unknown = '', statsTab?: string): { group: string; tab: string } | null {
  const v = VIEW_ALIASES[view] || view;
  for (const g of menuFor(role, hiddenCsv)) {
    const hit = g.tabs.find(t => t.view === v && (v !== 'stats' || (statsTab === 'finance' ? t.statsTab === 'finance' : !t.statsTab))); // « stats » a deux onglets : chiffres (Missions) et Finances (Argent)
    if (hit) return { group: g.id, tab: hit.id };
  }
  return null;
}
/** Toutes les vues qu'un rôle peut ouvrir dans le nouveau menu. */
export const reachableViews = (role: unknown, hiddenCsv: unknown = ''): string[] => [...new Set(menuFor(role, hiddenCsv).flatMap(g => g.tabs.map(t => t.view)))];
/** Première page à ouvrir quand on touche une entrée (le dernier onglet retenu, s'il est encore permis, sinon le premier). */
export const openView = (g: MenuGroup, lastTab?: string): { view: string; statsTab?: 'finance' } => { const t = g.tabs.find(x => x.id === lastTab) || g.tabs[0]; return { view: t.view, statsTab: t.statsTab }; };
/** Toutes les anciennes vues du menu du responsable (pour vérifier que rien ne se perd). */
export const OLD_ADMIN_VIEWS: readonly string[] = [...KNOWN_VIEWS, 'grid', 'sessions', 'security', 'sheets', 'operator'];

/** Où se trouve une page dans le menu, en clair : « Argent › Finances » (une entrée qui n'a qu'une page : « Actualités »). */
export const placeOf = (g: MenuGroup, t: MenuTab, lang: 'fr' | 'en' = 'fr'): string => {
  const gl = lang === 'en' ? g.en : g.fr, tl = lang === 'en' ? t.en : t.fr;
  return g.tabs.length > 1 && gl !== tl ? `${gl} › ${tl}` : gl;
};
/** Même chose à partir d'une ancienne vue et d'un rôle ; '' si la page n'existe pas pour ce rôle. */
export function placeOfView(role: unknown, view: string, hiddenCsv: unknown = '', lang: 'fr' | 'en' = 'fr', statsTab?: string): string {
  const loc = locate(role, view, hiddenCsv, statsTab);
  if (!loc) return '';
  const g = menuFor(role, hiddenCsv).find(x => x.id === loc.group)!, t = g.tabs.find(x => x.id === loc.tab)!;
  return placeOf(g, t, lang);
}
