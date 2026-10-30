// Contrôles de la page Stock (module 11, lot 2). Règles pures.
// Limites écrites : « valeur du stock qui chute » vient avec M11.6 (statistique) ; l'achat sans mouvement est un simple signal.
import { alertId, hasEnough, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { DEFAULT_STOCK_SPACES, inSpace, stockRows } from '../../stock';
import { dayDiff, list, plural } from './common';

const GO = { view: 'storage' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const negativeQty: HealthRule = {
  id: 'stock.negative', page: 'stock',
  run: (ctx) => {
    const f = stockRows(ctx.products, ctx.moves).filter(r => r.negative);
    if (!f.length) return [];
    const n = f.length;
    return [{
      id: alertId('stock', 'negative'), page: 'stock', rule: 'negative', severity: 'urgent',
      title_fr: `${n} ${plural(n, 'produit a', 'produits ont')} une quantité négative`, title_en: `${n} ${plural(n, 'product has', 'products have')} a negative quantity`,
      why_fr: `Impossible en vrai : ${list(f.map(r => `${r.product.name} (${r.qty})`))}. Une entrée a été oubliée ou une sortie est en trop.`, why_en: `Impossible in reality: ${list(f.map(r => `${r.product.name} (${r.qty})`))}. An entry was forgotten or an exit is extra.`,
      todo_fr: 'Ajouter l\'entrée oubliée ou faire un ajustement après comptage.', todo_en: 'Add the forgotten entry or make an adjustment after counting.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

export const outOfStock: HealthRule = {
  id: 'stock.empty', page: 'stock',
  run: (ctx) => {
    // Rupture = quantité à 0 d'un produit qui a déjà eu du stock ou un seuil d'alerte (un produit jamais approvisionné n'est pas « en rupture »).
    const rows = stockRows(ctx.products, ctx.moves).filter(r => r.qty === 0 && (r.product.alert_threshold > 0 || ctx.moves.some(m => m.product_id === r.product.id)));
    if (!rows.length) return [];
    const n = rows.length;
    return [{
      id: alertId('stock', 'empty'), page: 'stock', rule: 'empty', severity: 'urgent',
      title_fr: `${n} ${plural(n, 'produit est en rupture', 'produits sont en rupture')}`, title_en: `${n} ${plural(n, 'product is', 'products are')} out of stock`,
      why_fr: `Quantité à zéro : ${list(rows.map(r => r.product.name))}.`, why_en: `Quantity at zero: ${list(rows.map(r => r.product.name))}.`,
      todo_fr: 'Racheter ou noter l\'arrivée prochaine.', todo_en: 'Reorder or note the next arrival.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

export const lowStock: HealthRule = {
  id: 'stock.low', page: 'stock',
  run: (ctx) => {
    const rows = stockRows(ctx.products, ctx.moves).filter(r => r.low && r.qty > 0);
    if (!rows.length) return [];
    const n = rows.length;
    return [{
      id: alertId('stock', 'low'), page: 'stock', rule: 'low', severity: 'watch',
      title_fr: `${n} ${plural(n, 'produit est sous', 'produits sont sous')} le seuil d'alerte`, title_en: `${n} ${plural(n, 'product is', 'products are')} below the alert threshold`,
      why_fr: `${list(rows.map(r => `${r.product.name} (${r.qty} ${r.product.unit}, seuil ${r.product.alert_threshold})`), 2)}.`, why_en: `${list(rows.map(r => `${r.product.name} (${r.qty} ${r.product.unit}, threshold ${r.product.alert_threshold})`), 2)}.`,
      todo_fr: 'Prévoir un réapprovisionnement.', todo_en: 'Plan a restock.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

/** Produit en stock mais sans aucun mouvement depuis N jours (et créé depuis plus de N jours). */
export const dormant: HealthRule = {
  id: 'stock.dormant', page: 'stock',
  run: (ctx) => {
    const T = ctx.thresholds.dormant_days, last = new Map<string, string>();
    for (const m of ctx.moves) if (DATE.test(m.date || '') && m.date <= ctx.today && (last.get(m.product_id) || '') < m.date) last.set(m.product_id, m.date);
    const rows = stockRows(ctx.products, ctx.moves).filter(r => {
      if (r.qty <= 0) return false;
      const ref = last.get(r.product.id) || String(r.product.created_at || '').slice(0, 10);
      return DATE.test(ref) && dayDiff(ref, ctx.today) >= T;
    });
    if (!hasEnough(rows.length, 1)) return [];
    const n = rows.length;
    return [{
      id: alertId('stock', 'dormant'), page: 'stock', rule: 'dormant', severity: 'info',
      title_fr: `${n} ${plural(n, 'produit dort', 'produits dorment')} en stock`, title_en: `${n} ${plural(n, 'product sits', 'products sit')} idle in stock`,
      why_fr: `Aucun mouvement depuis ${T} jours ou plus : ${list(rows.map(r => r.product.name))}. Argent immobilisé : ${Math.round(rows.reduce((t, r) => t + r.value, 0)).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} Ar.`,
      why_en: `No movement for ${T} days or more: ${list(rows.map(r => r.product.name))}. Money tied up: ${Math.round(rows.reduce((t, r) => t + r.value, 0)).toLocaleString('en-US')} Ar.`,
      todo_fr: 'Vérifier le comptage ou écouler le produit.', todo_en: 'Check the count or sell the product off.', since: null, value: n, go: GO,
    } as HealthAlert];
  },
};

/** Dépense « Achats » des 30 derniers jours sans mouvement de stock lié (signal, pas une erreur). */
export const purchaseNoMove: HealthRule = {
  id: 'stock.purchase-no-move', page: 'stock',
  run: (ctx) => {
    if (!ctx.products.length) return []; // pas de stock tenu : on ne dit rien
    const linked = new Set(ctx.moves.map(m => m.cash_id).filter(Boolean));
    const from = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
    const f = ctx.cash.filter(c => c.kind === 'out' && c.category === 'Achats' && DATE.test(c.date || '') && c.date >= from && c.date <= ctx.today && !linked.has(c.id));
    if (!f.length) return [];
    const n = f.length;
    return [{
      id: alertId('stock', 'purchase-no-move'), page: 'stock', rule: 'purchase-no-move', severity: 'info',
      title_fr: `${n} ${plural(n, 'achat n\'a pas', 'achats n\'ont pas')} d'entrée en stock`, title_en: `${n} ${plural(n, 'purchase has', 'purchases have')} no stock entry`,
      why_fr: 'Dépenses « Achats » des 30 derniers jours sans mouvement de stock lié. Normal si ce n\'est pas du stock.', why_en: '"Purchases" expenses of the last 30 days with no linked stock movement. Fine if it is not stock.',
      todo_fr: 'Si c\'est du stock, ajouter l\'entrée correspondante.', todo_en: 'If it is stock, add the matching entry.', since: f.map(c => c.date).sort()[0], value: n, go: GO,
    } as HealthAlert];
  },
};

/** Une règle du stock vue stockage par stockage : jamais de mélange. Avec plusieurs stockages, chaque alerte porte le nom du stockage,
 *  son propre identifiant (stock:<règle>:<stockage>) et un lien exact : le bon stockage, le bon filtre, le produit le plus urgent. */
const perSpace = (rule: HealthRule): HealthRule => ({
  id: rule.id, page: rule.page,
  run: (ctx) => {
    const spaces = ctx.spaces && ctx.spaces.length ? ctx.spaces : DEFAULT_STOCK_SPACES;
    const multi = spaces.length > 1;
    const out: HealthAlert[] = [];
    for (const sp of spaces) {
      const mine = inSpace(ctx.products, ctx.moves, sp.id);
      const rows = stockRows(mine.products, mine.moves);
      for (const a of rule.run({ ...ctx, products: mine.products, moves: mine.moves })) {
        const first = a.rule === 'negative' ? rows.find(r => r.negative)
          : a.rule === 'empty' ? rows.find(r => r.qty === 0)
          : a.rule === 'low' ? rows.filter(r => r.low && r.qty > 0).sort((x, y) => x.qty - y.qty)[0]
          : undefined;
        const filter = a.rule === 'empty' ? 'empty' : a.rule === 'low' ? 'low' : 'all';
        out.push({ ...a, ...(multi ? { id: alertId('stock', a.rule, sp.id), title_fr: `${sp.name} : ${a.title_fr}`, title_en: `${sp.name}: ${a.title_en}` } : {}), go: { view: 'storage', storage: { space: sp.id, filter, ...(first ? { product: first.product.id } : {}) } } });
      }
    }
    return out;
  },
});

export const STOCK_RULES: HealthRule[] = [perSpace(negativeQty), perSpace(outOfStock), perSpace(lowStock), perSpace(dormant), purchaseNoMove];
