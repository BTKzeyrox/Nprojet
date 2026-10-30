// Notifications externes (push), partie 2b : les alertes CALCULÉES (stock par stockage, avance en attente, validation en attente, facture en retard),
// envoyées par la tâche planifiée du serveur (toutes les 15 min). Règles pures, sans réseau.
// Le serveur (bloc ALERTS_PUSH de df-api) contient la même logique ; `check:push-alerts` compare les deux.
// Anti-doublon : chaque élément en alerte a une clé ; une clé déjà envoyée ne repart pas tant que l'élément reste en alerte (elle est oubliée quand il va mieux).
// Les « Ignorer / Vérifié » de la Santé du site sont respectés. Jamais de montant dans un push.
import type { PushText } from './pushRules';

export type AlertKind = 'stock_empty' | 'stock_low' | 'adv_wait' | 'val_wait' | 'inv_late';
export type AlertCat = 'stock' | 'validations' | 'invoices';
export interface AlertInput {
  products: { id: string; name: string; alert_threshold: number; storage_id?: string }[];
  moves: { product_id: string; type: string; qty: number }[];
  spaces: { id: string; name: string }[];
  advances: { id: string; employee_name: string; status: string; request_date: string }[];
  posts: { id: string; employee_name: string; client_name: string; status: string; updated_at?: string; created_at?: string }[];
  invoices: { id: string; type?: string; status: string; number?: string; total_ar: number; due_date: string; client?: { name?: string } }[];
  cash: { kind: string; amount_ar: number; invoice_id?: string }[];
}
export interface AlertItem { key: string; id: string; name: string; sub: string; days: number; status: string; space: string }
export interface AlertLink { go: string; filter?: string; nav?: string; space?: string; sfilter?: string; product?: string }
export interface AlertSend { kind: AlertKind; group: string; cat: AlertCat; health_id: string; total: number; fresh: AlertItem[]; text: PushText; link: AlertLink; tag: string }
export interface AckLike { id?: unknown; status?: unknown; at?: unknown; until?: unknown; value_at?: unknown }

const DEFAULT_SPACE = 'main';
const ADVANCE_DAYS = 3; // même valeur de départ que la Santé du site (« avance en attente depuis plus de N jours »)
const VALIDATE_HOURS = 24; // idem (« mission à valider depuis plus de N heures »)
const IGNORE_DAYS = 14; // idem (« Ignorer » sans date : N jours)
const r2 = (n: number) => Math.round(n * 100) / 100;
const cut = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const list3 = (xs: string[]) => `${xs.slice(0, 3).join(', ')}${xs.length > 3 ? '…' : ''}`;

/** Produits épuisés (quantité à 0 ou moins, déjà approvisionnés ou avec un seuil) et produits bas (sous le seuil, encore en stock), stockage par stockage. */
export function stockPushItems(products: AlertInput['products'], moves: AlertInput['moves'], spaces: AlertInput['spaces']): (AlertItem & { state: 'empty' | 'low' })[] {
  const qty = new Map<string, number>(products.map(p => [p.id, 0]));
  const hasMove = new Set<string>();
  for (const m of moves) {
    if (!qty.has(m.product_id)) continue;
    hasMove.add(m.product_id);
    qty.set(m.product_id, r2((qty.get(m.product_id) || 0) + (m.type === 'out' ? -Math.abs(m.qty) : m.type === 'in' ? Math.abs(m.qty) : m.qty)));
  }
  const out: (AlertItem & { state: 'empty' | 'low' })[] = [];
  for (const p of products) {
    const q = qty.get(p.id) || 0;
    const space = p.storage_id || DEFAULT_SPACE;
    const spaceName = spaces.find(s => s.id === space)?.name || space;
    if (q <= 0 && (p.alert_threshold > 0 || hasMove.has(p.id))) out.push({ key: `alert:stk:${p.id}:empty`, id: p.id, name: cut(p.name, 60), sub: spaceName, days: 0, status: '', space, state: 'empty' });
    else if (p.alert_threshold > 0 && q > 0 && q <= p.alert_threshold) out.push({ key: `alert:stk:${p.id}:low`, id: p.id, name: cut(p.name, 60), sub: spaceName, days: 0, status: '', space, state: 'low' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function advWaitItems(advances: AlertInput['advances'], today: string): AlertItem[] {
  return advances.filter(a => a.status === 'pending' && /^\d{4}-\d{2}-\d{2}/.test(a.request_date || ''))
    .map(a => ({ a, d: dayDiff(a.request_date.slice(0, 10), today) })).filter(x => x.d >= ADVANCE_DAYS).sort((x, y) => y.d - x.d)
    .map(x => ({ key: `alert:adv:${x.a.id}`, id: x.a.id, name: cut(x.a.employee_name, 60), sub: '', days: x.d, status: '', space: '' }));
}

export function valWaitItems(posts: AlertInput['posts'], nowMs: number): AlertItem[] {
  return posts.filter(p => p.status === 'pending_start' || p.status === 'pending_end')
    .map(p => ({ p, ms: Date.parse(p.status === 'pending_end' ? (p.updated_at || '') : (p.updated_at || p.created_at || '')) }))
    .filter(x => Number.isFinite(x.ms) && (nowMs - x.ms) / 3600_000 > VALIDATE_HOURS).sort((a, b) => a.ms - b.ms)
    .map(x => ({ key: `alert:val:${x.p.id}:${x.p.status}`, id: x.p.id, name: cut(x.p.employee_name, 60), sub: cut(x.p.client_name, 60), days: 0, status: x.p.status, space: '' }));
}

export function invLateItems(invoices: AlertInput['invoices'], cash: AlertInput['cash'], today: string): AlertItem[] {
  const paid = new Map<string, number>();
  for (const e of cash) if (e.kind === 'in' && e.invoice_id && Number.isFinite(e.amount_ar) && e.amount_ar > 0) paid.set(e.invoice_id, (paid.get(e.invoice_id) || 0) + Math.round(e.amount_ar));
  return invoices.filter(i => i.type !== 'credit_note' && i.status === 'issued' && i.due_date < today && Math.max(0, i.total_ar - (paid.get(i.id) || 0)) > 0)
    .map(i => ({ i, d: dayDiff(i.due_date, today) })).sort((a, b) => b.d - a.d)
    .map(x => ({ key: `alert:inv:${x.i.id}`, id: x.i.id, name: cut(x.i.client?.name, 60), sub: cut(x.i.number, 40), days: x.d, status: '', space: '' }));
}

/** Vrai si une marque « Ignorer / Vérifié » cache encore cette alerte (même règle que la Santé du site : elle revient si la mesure a grandi ou si la marque a expiré). */
export function ackHidden(acks: AckLike[], id: string, value: number, today: string): boolean {
  let ack: AckLike | null = null;
  for (const a of acks) if (a && a.id === id && (a.status === 'ignored' || a.status === 'checked') && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at))) ack = a;
  if (!ack) return false;
  const grew = typeof ack.value_at === 'number' && value > ack.value_at;
  const until = typeof ack.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ack.until) ? ack.until : '';
  const expired = until ? today >= until : ack.status === 'ignored' && dayDiff((ack.at as string).slice(0, 10), today) >= IGNORE_DAYS;
  return !(grew || expired);
}

function textOf(kind: AlertKind, fresh: AlertItem[], multi: boolean): PushText {
  const n = fresh.length, one = fresh[0];
  const where = multi && one.sub && (kind === 'stock_empty' || kind === 'stock_low') ? `${one.sub} : ` : '';
  const names = list3(fresh.map(x => x.name));
  switch (kind) {
    case 'stock_empty': return n === 1 ? { fr: { title: 'Stock épuisé', body: `${where}${one.name}` }, en: { title: 'Out of stock', body: `${where}${one.name}` } } : { fr: { title: `${n} produits épuisés`, body: `${where}${names}` }, en: { title: `${n} products out of stock`, body: `${where}${names}` } };
    case 'stock_low': return n === 1 ? { fr: { title: 'Stock bas', body: `${where}${one.name}` }, en: { title: 'Low stock', body: `${where}${one.name}` } } : { fr: { title: `${n} produits sous le seuil`, body: `${where}${names}` }, en: { title: `${n} products below the threshold`, body: `${where}${names}` } };
    case 'adv_wait': return n === 1 ? { fr: { title: 'Avance en attente', body: `${one.name} · depuis ${one.days} j` }, en: { title: 'Advance waiting', body: `${one.name} · for ${one.days} d` } } : { fr: { title: `${n} avances en attente`, body: names }, en: { title: `${n} advances waiting`, body: names } };
    case 'val_wait': return n === 1 ? { fr: { title: 'Validation en attente', body: one.sub ? `${one.name} · ${one.sub}` : one.name }, en: { title: 'Approval waiting', body: one.sub ? `${one.name} · ${one.sub}` : one.name } } : { fr: { title: `${n} missions à valider`, body: names }, en: { title: `${n} missions to approve`, body: names } };
    case 'inv_late': { const lab = (x: AlertItem) => [x.sub, x.name].filter(Boolean).join(' · '); return n === 1 ? { fr: { title: 'Facture en retard', body: `${lab(one)} · ${one.days} j` }, en: { title: 'Overdue invoice', body: `${lab(one)} · ${one.days} d` } } : { fr: { title: `${n} factures en retard`, body: list3(fresh.map(x => x.name || x.sub)) }, en: { title: `${n} overdue invoices`, body: list3(fresh.map(x => x.name || x.sub)) } }; }
  }
}

function linkOf(kind: AlertKind, fresh: AlertItem[]): AlertLink {
  const one = fresh[0], single = fresh.length === 1;
  switch (kind) {
    case 'stock_empty': return { go: 'storage', space: one.space, sfilter: 'empty', product: one.id };
    case 'stock_low': return { go: 'storage', space: one.space, sfilter: 'low', product: one.id };
    case 'adv_wait': return single ? { go: 'validations', filter: 'advances', nav: `val-adv-${one.id}` } : { go: 'validations', filter: 'advances' };
    case 'val_wait': return { go: 'validations', filter: one.status === 'pending_start' ? 'starts' : 'ends', ...(single ? { nav: `val-post-${one.id}` } : {}) };
    case 'inv_late': return single ? { go: 'invoices', nav: `inv-${one.id}` } : { go: 'invoices' };
  }
}

/** Ce que la tâche planifiée doit envoyer maintenant. `seen` = clés déjà envoyées. `current` = toutes les clés en alerte (les autres clés du journal sont oubliées). */
export function planAlertPush(inp: AlertInput, today: string, nowMs: number, seen: string[], acks: AckLike[]): { current: string[]; sends: AlertSend[] } {
  const seenSet = new Set(seen);
  const multi = inp.spaces.length > 1;
  type G = { kind: AlertKind; group: string; cat: AlertCat; health_id: string; items: AlertItem[] };
  const groups: G[] = [];
  const stock = stockPushItems(inp.products, inp.moves, inp.spaces);
  const spaceIds = [...new Set(stock.map(x => x.space))];
  for (const sp of spaceIds) for (const state of ['empty', 'low'] as const) {
    const items = stock.filter(x => x.space === sp && x.state === state);
    if (items.length) groups.push({ kind: state === 'empty' ? 'stock_empty' : 'stock_low', group: sp, cat: 'stock', health_id: `stock:${state}${multi ? `:${sp}` : ''}`, items });
  }
  const adv = advWaitItems(inp.advances, today); if (adv.length) groups.push({ kind: 'adv_wait', group: 'all', cat: 'validations', health_id: 'payroll:advance-pending-old', items: adv });
  const val = valWaitItems(inp.posts, nowMs); if (val.length) groups.push({ kind: 'val_wait', group: 'all', cat: 'validations', health_id: 'missions:validation-wait', items: val });
  const inv = invLateItems(inp.invoices, inp.cash, today); if (inv.length) groups.push({ kind: 'inv_late', group: 'all', cat: 'invoices', health_id: 'invoices:overdue', items: inv });
  const current = groups.flatMap(g => g.items.map(x => x.key));
  const sends: AlertSend[] = [];
  for (const g of groups) {
    const fresh = g.items.filter(x => !seenSet.has(x.key));
    if (!fresh.length) continue;
    if (ackHidden(acks, g.health_id, g.items.length, today)) continue;
    sends.push({ kind: g.kind, group: g.group, cat: g.cat, health_id: g.health_id, total: g.items.length, fresh, text: textOf(g.kind, fresh, multi), link: linkOf(g.kind, fresh), tag: `${g.kind}:${g.group}`.slice(0, 60) });
  }
  return { current, sends };
}
