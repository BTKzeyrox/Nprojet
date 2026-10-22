// Contrôles de la page Clients (module 11, lot 2). Règles pures.
// Limites écrites : créances et factures (module 2) n'existent pas encore ; « noms proches » = même nom ou une lettre d'écart.
import { alertId, hasEnough, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { clientMissionsFromPosts, clientThresholds, normalizeName, summarizeClients } from '../../clients';
import { list, plural } from './common';

const settingsPrices = (s: any) => ({ client_price_default_ar: s?.client_price_default_ar, client_prices_by_type: s?.client_prices_by_type });
const GO = { view: 'clients' };

/** Distance d'édition limitée à 1 (suffisant pour « Rivage » / « Rivages »). */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

export const strategicSilent: HealthRule = {
  id: 'clients.strategic-silent', page: 'clients',
  run: (ctx) => {
    const active = ctx.clients.filter(c => c.active !== false);
    if (!hasEnough(active.length, 1)) return [];
    const missions = clientMissionsFromPosts(ctx.posts, ctx.contracts, ctx.clients, settingsPrices(ctx.settings));
    const sums = summarizeClients(ctx.clients, missions, ctx.today, clientThresholds((ctx.settings as any).company));
    const T = ctx.thresholds.strategic_silent_days, out: HealthAlert[] = [];
    for (const c of active) {
      const s = sums.get(c.id);
      if (!s || !s.statuses.includes('strategic') || s.days_since_last === null || s.days_since_last < T) continue;
      out.push({
        id: alertId('clients', 'strategic-silent', c.id), page: 'clients', rule: 'strategic-silent', severity: s.days_since_last >= 2 * T ? 'urgent' : 'watch',
        title_fr: `Client stratégique silencieux : ${c.name}`, title_en: `Silent strategic client: ${c.name}`,
        why_fr: `Aucune mission depuis ${s.days_since_last} jours alors que c'est l'un de vos meilleurs clients.`, why_en: `No mission for ${s.days_since_last} days although this is one of your best clients.`,
        todo_fr: 'Prendre des nouvelles du client.', todo_en: 'Check in with the client.', since: s.last_date, value: s.days_since_last, go: GO,
      } as HealthAlert);
    }
    return out;
  },
};

export const noPrice: HealthRule = {
  id: 'clients.no-price', page: 'clients',
  run: (ctx) => {
    
    const withMissions = new Set<string>();
    for (const p of ctx.posts) if (p.status === 'completed' && p.client_id) withMissions.add(p.client_id);
    for (const c of ctx.contracts) if (c.client_id) withMissions.add(c.client_id);
    const f = ctx.clients.filter(c => c.active !== false && withMissions.has(c.id) && !(typeof c.price_default_ar === 'number') && !Object.keys(c.price_by_type || {}).length);
    if (!f.length) return [];
    const n = f.length;
    return [{
      id: alertId('clients', 'no-price'), page: 'clients', rule: 'no-price', severity: 'info',
      title_fr: `${n} ${plural(n, 'client travaille', 'clients travaillent')} sans tarif propre`, title_en: `${n} ${plural(n, 'client works', 'clients work')} without its own price`,
      why_fr: `Ils prennent le prix par défaut des Réglages : ${list(f.map(c => c.name))}.`, why_en: `They use the default price from Settings: ${list(f.map(c => c.name))}.`,
      todo_fr: 'Vérifier que le prix par défaut est bien celui convenu.', todo_en: 'Check the default price is the agreed one.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

export const similarNames: HealthRule = {
  id: 'clients.similar-names', page: 'clients',
  run: (ctx) => {
    const l = ctx.clients.map(c => ({ c, n: normalizeName(c.name).replace(/ /g, '') })).filter(x => x.n);
    const pairs: string[] = [];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (near(l[i].n, l[j].n)) pairs.push(`${l[i].c.name} / ${l[j].c.name}`);
    if (!pairs.length) return [];
    const n = pairs.length;
    return [{
      id: alertId('clients', 'similar-names'), page: 'clients', rule: 'similar-names', severity: 'info',
      title_fr: `${n} ${plural(n, 'fiche client ressemble', 'fiches clients se ressemblent')} à une autre`, title_en: `${n} client ${plural(n, 'record looks', 'records look')} like another`,
      why_fr: `Doublon possible : ${list(pairs, 2)}. Deux fiches pour le même client coupent son historique en deux.`, why_en: `Possible duplicate: ${list(pairs, 2)}. Two records for one client split its history.`,
      todo_fr: 'Si c\'est le même client, garder une seule fiche.', todo_en: 'If it is the same client, keep a single record.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

export const CLIENT_RULES: HealthRule[] = [strategicSilent, noPrice, similarNames];
