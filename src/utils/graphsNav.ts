// « Voir les graphiques » : un bouton des anciennes pages ouvre la page Graphiques sur le bon groupe (Missions, Argent ou Stock).
// App écoute l'événement et change de page ; la page Graphiques lit le groupe demandé en s'ouvrant. Pas de serveur, pas de minuteur.
import type { GraphFilter } from './graphsPage';
export const OPEN_GRAPHS_EVENT = 'df-open-graphs';
let intent: GraphFilter | null = null;
export const openGraphs = (filter: GraphFilter) => { intent = filter; window.dispatchEvent(new Event(OPEN_GRAPHS_EVENT)); };
export const takeGraphsIntent = (): GraphFilter | null => { const f = intent; intent = null; return f; };
