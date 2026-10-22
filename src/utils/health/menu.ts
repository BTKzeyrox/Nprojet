// Où va chaque page surveillée dans le menu (pastilles) et comment ouvrir la destination d'une alerte. Pur.
import type { HealthAlert, HealthPage } from './types';
import { HEALTH_PAGES } from './types';

/** Entrée du menu qui porte la pastille d'une page surveillée. `null` = pas d'entrée de menu à elle (comptée dans « Santé du site » seulement). */
export const MENU_ITEM_OF_PAGE: Record<HealthPage, string | null> = {
  missions: 'validations', team: 'employees', payroll: 'advances', finance: 'stats', clients: 'clients', stock: 'stats',
  invoices: 'invoices', suppliers: null, hr: null, performance: 'performance', conditions: 'settings', data: 'history', security: null, system: 'errors',
};

/** Pastille par entrée de menu : nombre d'alertes À VOIR + URGENTES (les « infos » ne font pas de pastille). */
export function menuBadges(alerts: HealthAlert[]): Record<string, { count: number; urgent: boolean }> {
  const out: Record<string, { count: number; urgent: boolean }> = {};
  for (const a of alerts) {
    if (a.severity === 'info') continue;
    const item = MENU_ITEM_OF_PAGE[a.page];
    if (!item) continue;
    const b = out[item] || (out[item] = { count: 0, urgent: false });
    b.count++; if (a.severity === 'urgent') b.urgent = true;
  }
  return out;
}

/** Vues du menu admin qui existent vraiment (une alerte ne doit jamais mener à une page qui n'existe pas). */
export const KNOWN_VIEWS = ['dashboard', 'validations', 'history', 'clients', 'invoices', 'performance', 'stats', 'active-post', 'employees', 'chat', 'calendar', 'advances', 'errors', 'settings', 'health', 'assistant'] as const;
export const isKnownView = (v: string): boolean => (KNOWN_VIEWS as readonly string[]).includes(v);
export const allPagesCovered = (): boolean => HEALTH_PAGES.every(p => p in MENU_ITEM_OF_PAGE);
