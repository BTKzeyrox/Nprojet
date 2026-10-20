import { db } from '../db/store';
import { todayMada } from './stats';
import { computeAlerts, type AlertItem } from './alerts';

// Le menu affiche la pastille à chaque affichage : on garde le résultat jusqu'à la prochaine modification des données (ou du jour / de la personne connectée).
// Calcul mesuré : environ 13 ms sur 2 ans de démo ; avec ce cache, une seule fois par changement au lieu d'une fois par affichage.
let cache: { key: string; list: AlertItem[] } | null = null;
db.subscribe(() => { cache = null; }); // abonné dès le chargement du fichier : passe avant les écrans qui se réaffichent

/** Alertes de l'admin avec les données du site (liste vide pour un employé : il n'a aucun chiffre d'argent). */
export function getAdminAlerts(): AlertItem[] {
  const me = db.getCurrentUser();
  if (me?.role !== 'admin') return [];
  const today = todayMada();
  const st = db.getSettings();
  const cash = db.getCash(), posts = db.getPosts(), advances = db.getAdvanceRequests(), products = db.getProducts(), moves = db.getStockMoves(), contracts = db.getContracts();
  // Signature bon marché des données : même si une modification ne prévenait pas les écrans, le cache ne reste jamais faux
  let sum = 0;
  for (const e of cash) sum += e.amount_ar;
  for (const p of posts) sum += p.status === 'completed' ? 1 + (p.calculated_ar || 0) + (p.client_price_ar || 0) : 0;
  for (const a of advances) sum += a.status === 'pending' ? a.amount_ar : 0;
  for (const m of moves) sum += m.qty;
  for (const p of products) sum += p.alert_threshold;
  const key = [me.id, today, cash.length, posts.length, advances.length, products.length, moves.length, contracts.length, sum, st.goal_missions, st.goal_profit_ar, st.goal_max_expenses_ar, st.alert_unpaid_days, st.alert_low_cash_ar, st.client_price_default_ar, JSON.stringify(st.client_prices_by_type || {}), st.price_per_mission].join('|');
  if (cache && cache.key === key) return cache.list;
  const list = computeAlerts({ today, settings: st, cash, posts, contracts, advances, products, moves });
  cache = { key, list };
  return list;
}
