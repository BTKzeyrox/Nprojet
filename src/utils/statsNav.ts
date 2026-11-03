// Onglet de la page Statistiques gardé d'une visite à l'autre (et réglable depuis l'accueil : un clic sur une alerte ouvre le bon onglet).
export type StatsTab = 'stats' | 'finance' | 'report';
let current: StatsTab = 'stats';
export const getStatsTab = (): StatsTab => current;
export const setStatsTab = (t: StatsTab): void => { current = t; try { window.dispatchEvent(new Event('df-stats-tab')); } catch { /* hors navigateur */ } }; // le menu à onglets se remet à jour
