// Adresses (data-nav) des cartes de la page Finances (Statistiques > Finances) : les liens des chiffres de l'assistant et des alertes
// (budget, bénéfice en baisse, trésorerie basse, à encaisser…) ouvrent la bonne carte et la font clignoter, pas seulement la page.
// Pur : pas d'écran, pas de serveur. Une carte sans adresse dans la page = lien qui ne mène nulle part (contrôlé par check:alert-links et check:assistant).
import type { HealthGo } from './health/types';
import type { FigureId } from './siteSnapshot';

export const FIN_NAV = {
  result: 'fin-result', profit: 'fin-profit', margin: 'fin-margin', toCollect: 'fin-toCollect', treasury: 'fin-treasury',
  costPerMission: 'fin-costPerMission', gainPerMission: 'fin-gainPerMission', invoices: 'fin-invoices',
  flow: 'fin-flow', cum: 'fin-cum', billed: 'fin-billed', expenses: 'fin-expenses', budgets: 'fin-budgets', plan: 'fin-plan',
} as const;
export type FinCard = keyof typeof FIN_NAV;
export const finGo = (k: FinCard): HealthGo => ({ view: 'stats', tab: 'finance', nav: FIN_NAV[k] });

/** Où mène le lien d'un chiffre « Pourquoi ce chiffre ? » : la carte qui l'affiche. La valeur du stock vit dans Stockage. */
export const FIGURE_GO: Record<FigureId, HealthGo> = {
  received: finGo('flow'), expenses: finGo('expenses'), salaries: finGo('result'), profit: finGo('profit'), margin: finGo('margin'),
  billed: finGo('billed'), toCollect: finGo('toCollect'), treasury: finGo('treasury'), costPerMission: finGo('costPerMission'),
  gainPerMission: finGo('gainPerMission'), stockValue: { view: 'storage' }, missionsDone: finGo('result'),
};
