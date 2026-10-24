// Contrôles « Qualité des données » (module 11, lot 3) : des chiffres ou des liens qui ne peuvent pas être justes. Règles pures.
// Limites écrites : pas de contrôle des fichiers (photos) ; les liens vers factures/fournisseurs viendront avec leurs modules.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert, HealthGo } from '../types';
import { list, plural } from './common';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GO: HealthGo = { view: 'history' };
const mk = (rule: string, severity: HealthAlert['severity'], fr: [string, string, string], en: [string, string, string], n: number, since: string | null, go: HealthGo = GO): HealthAlert => ({
  id: alertId('data', rule), page: 'data', rule, severity, title_fr: fr[0], title_en: en[0], why_fr: fr[1], why_en: en[1], todo_fr: fr[2], todo_en: en[2], since, value: n, go,
});

/** Mission ou session dont la fiche client n'existe plus (seulement si des fiches existent). */
export const clientGone: HealthRule = {
  id: 'data.client-gone', page: 'data',
  run: (ctx) => {
    if (!ctx.clients.length) return [];
    const ids = new Set(ctx.clients.map(c => c.id));
    const f = [...ctx.contracts.filter(c => c.client_id && !ids.has(c.client_id)).map(c => c.client_name || `mission ${c.post_number}`), ...ctx.posts.filter(p => p.client_id && !ids.has(p.client_id)).map(p => p.client_name || p.id)];
    if (!f.length) return [];
    const n = f.length;
    return [mk('client-gone', 'watch',
      [`${n} ${plural(n, 'mission pointe', 'missions pointent')} vers un client qui n'existe plus`, `Fiche client introuvable pour : ${list([...new Set(f)])}. Ces missions ne comptent plus pour aucun client.`, 'Recréer la fiche ou rattacher la mission à un autre client.'],
      [`${n} ${plural(n, 'mission points', 'missions point')} to a client that no longer exists`, `Client record not found for: ${list([...new Set(f)])}. These missions no longer count for any client.`, 'Recreate the record or link the mission to another client.'], n, null, { view: 'clients' })];
  },
};

/** Dates dans le futur (sessions de mission, avances). */
export const futureDates: HealthRule = {
  id: 'data.future-dates', page: 'data',
  run: (ctx) => {
    const f = [...ctx.posts.map(p => p.date), ...ctx.advances.map(a => String(a.request_date || '').slice(0, 10))].filter(d => DATE.test(d) && d > ctx.today).sort();
    if (!f.length) return [];
    const n = f.length;
    return [mk('future-dates', 'watch',
      [`${n} ${plural(n, 'date est', 'dates sont')} dans le futur`, `Missions ou avances datées après aujourd'hui (la première : ${f[0].split('-').reverse().join('/')}). Les totaux et le calendrier peuvent être faux.`, 'Corriger la date.'],
      [`${n} ${plural(n, 'date is', 'dates are')} in the future`, `Missions or advances dated after today (the first: ${f[0]}). Totals and calendar may be wrong.`, 'Fix the date.'], n, f[0])];
  },
};

/** Montants impossibles : négatifs ou illisibles. */
export const badAmounts: HealthRule = {
  id: 'data.bad-amounts', page: 'data',
  run: (ctx) => {
    const bad = (x: unknown): boolean => x !== undefined && x !== null && (typeof x !== 'number' || !Number.isFinite(x) || x < 0);
    const n = ctx.posts.filter(p => bad(p.calculated_ar) || bad(p.client_price_ar)).length + ctx.cash.filter(c => typeof c.amount_ar !== 'number' || !Number.isFinite(c.amount_ar) || c.amount_ar <= 0).length
      + ctx.advances.filter(a => typeof a.amount_ar !== 'number' || !Number.isFinite(a.amount_ar) || a.amount_ar <= 0).length + ctx.products.filter(p => bad(p.buy_price_ar) || bad(p.sell_price_ar)).length;
    if (!n) return [];
    return [mk('bad-amounts', 'urgent',
      [`${n} ${plural(n, 'montant est impossible', 'montants sont impossibles')}`, 'Montant négatif, nul ou illisible dans les missions, l\'argent, les avances ou le stock. Les totaux sont faux tant que ce n\'est pas corrigé.', 'Ouvrir la ligne concernée et corriger le montant.'],
      [`${n} ${plural(n, 'amount is', 'amounts are')} impossible`, 'Negative, zero or unreadable amount in missions, money, advances or stock. Totals are wrong until fixed.', 'Open the line and fix the amount.'], n, null, { view: 'stats', tab: 'finance' })];
  },
};

/** Même salarié, même jour, même mission et même heure de début : doublon de session. */
export const duplicateSessions: HealthRule = {
  id: 'data.duplicate-sessions', page: 'data',
  run: (ctx) => {
    const g = new Map<string, number>();
    for (const p of ctx.posts) { if (!p.employee_id || !DATE.test(p.date || '') || !p.start_time) continue; const k = [p.employee_id, p.date, p.post_number ?? p.client_name, p.start_time].join('|'); g.set(k, (g.get(k) || 0) + 1); }
    const d = [...g.entries()].filter(([, c]) => c >= 2);
    if (!d.length) return [];
    const n = d.length;
    return [mk('duplicate-sessions', 'watch',
      [`${n} ${plural(n, 'session en double', 'sessions en double')}`, 'Même salarié, même jour, même mission et même heure de début : la paie peut compter deux fois.', 'Garder une seule session.'],
      [`${n} duplicated ${plural(n, 'session', 'sessions')}`, 'Same employee, day, post and start time: payroll may count it twice.', 'Keep a single session.'], n, d.map(([k]) => k.split('|')[1]).sort()[0])];
  },
};

/** Champs vides qui ne devraient pas l'être (nom de produit, salarié d'une session). */
export const emptyFields: HealthRule = {
  id: 'data.empty-fields', page: 'data',
  run: (ctx) => {
    const n = ctx.products.filter(p => !String(p.name || '').trim()).length + ctx.posts.filter(p => !String(p.employee_name || '').trim()).length + ctx.clients.filter(c => !String(c.name || '').trim()).length;
    if (!n) return [];
    return [mk('empty-fields', 'info',
      [`${n} ${plural(n, 'fiche a', 'fiches ont')} un nom vide`, 'Produit, client ou session sans nom : difficile à retrouver dans les listes.', 'Ajouter le nom.'],
      [`${n} ${plural(n, 'record has', 'records have')} an empty name`, 'Product, client or session without a name: hard to find in lists.', 'Add the name.'], n, null)];
  },
};

/** Mouvement de stock dont le produit n'existe plus. */
export const orphanMoves: HealthRule = {
  id: 'data.orphan-moves', page: 'data',
  run: (ctx) => {
    if (!ctx.products.length) return [];
    const ids = new Set(ctx.products.map(p => p.id)), n = ctx.moves.filter(m => !ids.has(m.product_id)).length;
    if (!n) return [];
    return [mk('orphan-moves', 'watch',
      [`${n} ${plural(n, 'mouvement de stock n\'a plus', 'mouvements de stock n\'ont plus')} de produit`, 'Ils ne comptent dans aucune quantité.', 'Recréer le produit ou supprimer ces mouvements.'],
      [`${n} stock ${plural(n, 'movement has', 'movements have')} no product left`, 'They count in no quantity.', 'Recreate the product or delete these movements.'], n, null, { view: 'stats', tab: 'stock' })];
  },
};

export const DATA_RULES: HealthRule[] = [clientGone, futureDates, badAmounts, duplicateSessions, emptyFields, orphanMoves];
