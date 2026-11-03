// Page « Graphiques » du responsable : tous les graphiques du site sur une seule page (16 cartes), classés Missions / Argent / Stock,
// une seule période pour toutes les cartes. Règles pures : pas d'écran, pas de serveur, pas d'horloge cachée (`today` est donné).
// Contrôlé par : npm run check:graphs. Les cartes elles-mêmes sont dans src/views/admin/graphs/.
import { periodRange, type StatsGranularity } from './stats';
import type { Bi } from './siteSnapshot';

export type GraphGroup = 'missions' | 'money' | 'stock';
export type GraphFilter = 'all' | GraphGroup;
export interface GraphCardDef { id: string; group: GraphGroup; title: Bi }
const b = (fr: string, en: string): Bi => ({ fr, en });

/** Les 16 cartes, dans l'ordre d'affichage. Fusions : « Missions par type » (grille + barres + anneau), « Argent reçu et dépenses » et « Dépenses par catégorie » (avec ou sans salaires), « Valeur du stock » et « Produits les plus sortis » (Tableau de bord + Analyses). */
export const GRAPH_CARDS: GraphCardDef[] = [
  { id: 'missions', group: 'missions', title: b('Missions faites, par type', 'Missions done, by type') },
  { id: 'team', group: 'missions', title: b('Équipe : missions faites', 'Team: missions done') },
  { id: 'salaries', group: 'missions', title: b('Salaires', 'Salaries') },
  { id: 'flow', group: 'money', title: b('Argent reçu et dépenses', 'Money in and out') },
  { id: 'cum', group: 'money', title: b('Bénéfice cumulé', 'Cumulative profit') },
  { id: 'balance', group: 'money', title: b('Solde de la caisse', 'Cash balance') },
  { id: 'billed', group: 'money', title: b('Facturé et reçu', 'Billed and received') },
  { id: 'categories', group: 'money', title: b('Dépenses par catégorie', 'Expenses by category') },
  { id: 'clients', group: 'money', title: b('Clients : argent reçu', 'Clients: money received') },
  { id: 'sources', group: 'money', title: b('D\'où vient l\'argent', 'Where the money comes from') },
  { id: 'margin', group: 'money', title: b('Marge par type de mission', 'Margin by mission type') },
  { id: 'stockvalue', group: 'stock', title: b('Valeur du stock dans le temps', 'Stock value over time') },
  { id: 'stockused', group: 'stock', title: b('Produits les plus sortis', 'Most used products') },
  { id: 'stockcat', group: 'stock', title: b('Valeur du stock par catégorie', 'Stock value by category') },
  { id: 'suppliers', group: 'stock', title: b('Fournisseurs', 'Suppliers') },
  { id: 'bought', group: 'stock', title: b('Produits achetés le plus cher', 'Most expensive purchases') },
];
export const GRAPH_GROUPS: { id: GraphFilter; label: Bi }[] = [
  { id: 'all', label: b('Tout', 'All') }, { id: 'missions', label: b('Missions', 'Missions') }, { id: 'money', label: b('Argent', 'Money') }, { id: 'stock', label: b('Stock', 'Stock') },
];
/** L'adresse (data-nav) de chaque carte : un lien d'alerte ou de l'assistant peut la faire clignoter. */
export const graphNav = (id: string): string => `gr-${id}`;
export const graphCount = (f: GraphFilter): number => (f === 'all' ? GRAPH_CARDS.length : GRAPH_CARDS.filter(c => c.group === f).length);
export const visibleCards = (f: GraphFilter): GraphCardDef[] => (f === 'all' ? GRAPH_CARDS : GRAPH_CARDS.filter(c => c.group === f));
export const isGraphFilter = (v: unknown): v is GraphFilter => v === 'all' || v === 'missions' || v === 'money' || v === 'stock';

/** Une seule période pour toutes les cartes : semaine, mois ou année (avec les flèches). */
export const GRAPH_GRANS: StatsGranularity[] = ['week', 'month', 'year'];
export const isGraphGran = (v: unknown): v is StatsGranularity => v === 'week' || v === 'month' || v === 'year';

/** Les cartes de la caisse (solde, d'où vient l'argent, « sans salaires ») se lisent jour par jour : pour une année, on montre un mois (le mois en cours, ou décembre d'une année passée). */
export function cashRangeFor(g: StatsGranularity, anchor: string, today: string): { start: string; end: string } {
  if (g !== 'year') { const r = periodRange(g, anchor); return { start: r.start, end: r.end }; }
  const y = anchor.slice(0, 4);
  const m = today.slice(0, 4) === y ? periodRange('month', today) : periodRange('month', `${y}-12-15`);
  return { start: m.start, end: m.end };
}
/** Le mois montré par les cartes de la caisse quand la période est une année : à dire clairement sous la carte. */
export const cashRangeIsMonthOfYear = (g: StatsGranularity): boolean => g === 'year';
