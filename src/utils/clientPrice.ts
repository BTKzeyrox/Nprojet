import type { AppSettings, ClientContract, PostSession } from '../types';
import type { ClientRecord } from './clients';

// Prix client : ce que le client paie pour une mission validée.
// Ordre : 1) prix de la mission  2) prix de son type  3) prix par défaut (Réglages > Missions).
// Un prix vide ou invalide est ignoré ; 0 est un vrai prix (mission offerte).

const valid = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0;

type PriceSettings = Pick<AppSettings, 'client_price_default_ar' | 'client_prices_by_type'>;

/** Prix client pour un type de mission (exception du type, sinon prix par défaut). */
export function clientPriceForType(type: string | undefined, s: PriceSettings): number {
  const byType = s.client_prices_by_type || {};
  if (type && valid(byType[type])) return Math.round(byType[type]);
  return valid(s.client_price_default_ar) ? Math.round(s.client_price_default_ar) : 0;
}

/** Prix client d'une mission : son prix propre, sinon celui du type, sinon le prix par défaut. */
export function clientPriceForContract(c: Pick<ClientContract, 'client_price_ar' | 'post_type'> | undefined, s: PriceSettings): number {
  if (c && valid(c.client_price_ar)) return Math.round(c.client_price_ar);
  return clientPriceForType(c?.post_type, s);
}

/** Prix client d'une mission faite (session) : le prix figé à la validation ; sinon on le recalcule (anciennes missions). */
export function clientPriceForPost(p: Pick<PostSession, 'client_price_ar' | 'post_number' | 'client_name'>, contracts: ClientContract[], s: PriceSettings): number {
  if (valid(p.client_price_ar)) return Math.round(p.client_price_ar);
  const c = contracts.find(x => x.post_number === p.post_number) || contracts.find(x => !!x.client_name && x.client_name === p.client_name);
  return clientPriceForContract(c, s);
}

/** Lit un champ « prix » (texte) : vide = pas de prix propre (undefined) ; sinon un nombre entier >= 0, ou null si invalide. */
export function parsePriceInput(raw: string): number | undefined | null {
  const t = raw.trim();
  if (t === '') return undefined;
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Règle à 5 niveaux (module 1) : 1) prix de la mission  2) prix du client pour ce type  3) prix du client par défaut
 * 4) prix du type (Réglages > Missions)  5) prix par défaut (Réglages). Un prix vide ou invalide est ignoré ; 0 est un vrai prix (mission offerte).
 */
export function clientPriceWithClient(
  c: Pick<ClientContract, 'client_price_ar' | 'post_type'> | undefined,
  client: Pick<ClientRecord, 'price_default_ar' | 'price_by_type'> | undefined,
  s: PriceSettings,
): number {
  if (c && valid(c.client_price_ar)) return Math.round(c.client_price_ar);
  const type = c?.post_type;
  const own = client?.price_by_type || {};
  if (type && valid(own[type])) return Math.round(own[type]);
  if (client && valid(client.price_default_ar)) return Math.round(client.price_default_ar);
  return clientPriceForType(type, s);
}
