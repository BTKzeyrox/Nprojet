// Interrupteur de modules : le responsable peut CACHER des pages du menu (rien n'est supprimé, les données restent).
// Règles pures : pas d'écran, pas de serveur. Contrôlé par `npm run check:modules`.
// Jamais cachables : Actualités (feed), Réglages (settings), Santé du site, Journal des erreurs, Équipe / Mon profil (comptes).
export interface HideableModule { id: string; fr: string; en: string; group: 'work' | 'money' | 'team' | 'talk' }

export const HIDEABLE_MODULES: HideableModule[] = [
  { id: 'dashboard', fr: 'Tableau de bord', en: 'Dashboard', group: 'work' },
  { id: 'validations', fr: 'Validations', en: 'Validations', group: 'work' },
  { id: 'history', fr: 'Historique', en: 'History', group: 'work' },
  { id: 'active-post', fr: 'Missions (Ma mission)', en: 'Missions (My mission)', group: 'work' },
  { id: 'grid', fr: 'Contrats', en: 'Contracts', group: 'work' },
  { id: 'clients', fr: 'Clients', en: 'Clients', group: 'money' },
  { id: 'invoices', fr: 'Facturation', en: 'Invoicing', group: 'money' },
  { id: 'purchasing', fr: 'Achats', en: 'Purchasing', group: 'money' },
  { id: 'storage', fr: 'Stockage', en: 'Storage', group: 'money' },
  { id: 'advances', fr: 'Paie', en: 'Payroll', group: 'money' },
  { id: 'stats', fr: 'Statistiques', en: 'Statistics', group: 'money' },
  { id: 'direction', fr: 'Direction', en: 'Direction', group: 'money' },
  { id: 'performance', fr: 'Performance', en: 'Performance', group: 'team' },
  { id: 'my-performance', fr: 'Ma performance', en: 'My performance', group: 'team' },
  { id: 'hr', fr: 'Ressources humaines', en: 'Human resources', group: 'team' },
  { id: 'sheets', fr: 'Tableaux', en: 'Tables', group: 'team' },
  { id: 'chat', fr: 'Messagerie', en: 'Messaging', group: 'talk' },
  { id: 'calendar', fr: 'Calendrier', en: 'Calendar', group: 'talk' },
];

const IDS = new Set(HIDEABLE_MODULES.map(m => m.id));

/** « a,b,c » → liste d'identifiants connus, sans doublon (tout le reste est ignoré). */
export const parseHidden = (csv: unknown): string[] => {
  if (typeof csv !== 'string') return [];
  const out: string[] = [];
  for (const raw of csv.split(',')) { const id = raw.trim(); if (IDS.has(id) && !out.includes(id)) out.push(id); }
  return out;
};
export const hiddenToCsv = (ids: string[]): string => parseHidden(ids.join(',')).join(',');
/** Cette page est-elle cachée par le responsable ? (feed, settings… : toujours visibles) */
export const isViewHidden = (csv: unknown, view: string): boolean => parseHidden(csv).includes(view);
