// Les pages qu'on peut cacher, rangées comme le menu simplifié (Réglages > Général > Pages du menu). Règles PURES (aucun écran, aucun serveur), contrôlées par check:boutique.
import { ADMIN_GROUPS } from './menuGroups';

export interface Row { hide: string; fr: string; en: string }
/** Les pages qu'on peut cacher, rangées par entrée du menu simplifié (une page qui apparaît deux fois, comme « stats », n'a qu'un interrupteur). */
export const MENU_ROWS: { group: string; fr: string; en: string; rows: Row[] }[] = (() => {
  const seen = new Set<string>();
  return ADMIN_GROUPS.map(g => ({
    group: g.id, fr: g.fr, en: g.en,
    rows: g.tabs.filter(t => t.hide && !seen.has(t.hide) && (seen.add(t.hide), true)).map(t => ({ hide: t.hide as string, fr: t.hide === 'stats' ? 'Statistiques et Finances' : t.fr, en: t.hide === 'stats' ? 'Statistics and Finances' : t.en })),
  })).filter(g => g.rows.length > 0).concat([{ group: 'operator', fr: 'Vue de l\'opérateur', en: 'Operator view', rows: [{ hide: 'my-performance', fr: 'Ma performance', en: 'My performance' }] }]);
})();
/** Les pages qu'on ne peut pas cacher (jamais) : pour le dire clairement à l'écran. */
export const ALWAYS_SHOWN = { fr: 'Actualités, Opérateurs, Trésorerie, Comptabilité, Santé du site, Journal des erreurs, Sécurité, Réglages', en: 'News, Operators, Treasury, Accounting, Site health, Error log, Security, Settings' };

