import { db } from '../db/store';
import { todayMada } from './stats';
import { computeAlerts, type AlertItem } from './alerts';

/** Alertes de l'admin avec les données du site (liste vide pour un employé : il n'a aucun chiffre d'argent). */
export function getAdminAlerts(): AlertItem[] {
  if (db.getCurrentUser()?.role !== 'admin') return [];
  return computeAlerts({
    today: todayMada(), settings: db.getSettings(),
    cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), advances: db.getAdvanceRequests(),
    products: db.getProducts(), moves: db.getStockMoves(),
  });
}
