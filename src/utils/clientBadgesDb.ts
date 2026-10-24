// Badges des clients calculés avec les données du site (module 3). Réservé au responsable : un salarié n'a ni clients ni factures.
import { db } from '../db/store';
import { readCompany } from './companyRules';
import { clientMissionsFromPosts, clientThresholds, summarizeClients } from './clients';
import { computeClientBadges, type ClientBadgeResult } from './clientBadges';
import { todayMada } from './stats';

export function clientBadgesFromDb(): ClientBadgeResult {
  const clients = db.getClients(), settings = db.getSettings(), today = todayMada();
  const missions = clientMissionsFromPosts(db.getPosts(), db.getContracts(), clients, { client_price_default_ar: settings.client_price_default_ar, client_prices_by_type: settings.client_prices_by_type });
  const summaries = summarizeClients(clients, missions, today, clientThresholds(readCompany(settings.company)));
  return computeClientBadges({ clients, summaries, missions, invoices: db.getInvoices(), cash: db.getCash(), today });
}
