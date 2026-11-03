// Adresses (data-nav) des cartes de la page Finances et de la page Graphiques : les liens des chiffres de l'assistant et des alertes
// (budget, bénéfice en baisse, trésorerie basse, à encaisser, argent reçu, dépenses…) ouvrent la bonne carte et la font clignoter, pas seulement la page.
// Les chiffres (tuiles, budgets, prévu contre réel) restent dans Statistiques > Finances ; les GRAPHIQUES sont dans la page Graphiques (gr-<carte>, voir graphsPage.ts).
// Pur : pas d'écran, pas de serveur. Une carte sans adresse dans la page = lien qui ne mène nulle part (contrôlé par check:alert-links, check:assistant et check:graphs).
import type { HealthGo } from './health/types';
import type { FigureId } from './siteSnapshot';
import { graphNav } from './graphsPage';

export const FIN_NAV = {
  result: 'fin-result', profit: 'fin-profit', margin: 'fin-margin', toCollect: 'fin-toCollect', treasury: 'fin-treasury',
  costPerMission: 'fin-costPerMission', gainPerMission: 'fin-gainPerMission', invoices: 'fin-invoices', budgets: 'fin-budgets', plan: 'fin-plan',
  // Graphiques : ils ont quitté Statistiques > Finances et vivent dans la page Graphiques
  flow: graphNav('flow'), cum: graphNav('cum'), billed: graphNav('billed'), expenses: graphNav('categories'),
} as const;
export type FinCard = keyof typeof FIN_NAV;
const ON_CHARTS_PAGE: FinCard[] = ['flow', 'cum', 'billed', 'expenses'];
/** Où mène une carte d'argent : un chiffre ou un budget = Statistiques > Finances ; un graphique = la page Graphiques. */
export const finGo = (k: FinCard): HealthGo => (ON_CHARTS_PAGE.includes(k) ? { view: 'charts', nav: FIN_NAV[k] } : { view: 'stats', tab: 'finance', nav: FIN_NAV[k] });

/** Où mène le lien d'un chiffre « Pourquoi ce chiffre ? » : la carte qui l'affiche. La valeur du stock vit dans Stockage. */
export const FIGURE_GO: Record<FigureId, HealthGo> = {
  received: finGo('flow'), expenses: finGo('expenses'), salaries: finGo('result'), profit: finGo('profit'), margin: finGo('margin'),
  billed: finGo('billed'), toCollect: finGo('toCollect'), treasury: finGo('treasury'), costPerMission: finGo('costPerMission'),
  gainPerMission: finGo('gainPerMission'), stockValue: { view: 'storage' }, missionsDone: finGo('result'),
};
