// Boutons du bas de l'assistant : chacun montre un vrai chiffre du jour et mène à l'élément exact (À valider, Avances, Factures en retard, Stock bas, Qui travaille, Argent du mois, Clients silencieux, Résumé du jour).
// Pur : pas de serveur, pas d'horloge cachée (l'heure vient de l'entrée), les noms restent dans le navigateur. Un bouton sans rien à montrer se cache.
import type { HealthGo } from './health/types';
import { b, ar, dmy, plural, waitGroups, waitedText, morningSummary, type Reply } from './assistant';
import { buildSnapshot, type Bi, type SnapshotInput } from './siteSnapshot';
import type { HealthAlert } from './health/types';
import { invoiceInfo } from './invoices';
import { stockRows, inSpace, DEFAULT_STOCK_SPACES } from './stock';
import { clientMissionsFromPosts, clientThresholds, summarizeClients, normalizeName } from './clients';
import { finGo } from './financeNav';

export type ShortcutId = 'validate' | 'advances' | 'overdue' | 'stock' | 'working' | 'money' | 'silent' | 'morning';
export interface Shortcut { id: ShortcutId; q: Bi; label: Bi; count: number | null }

const SHOWN = 4; // lignes et boutons montrés ; le reste = « + N autres »
const more = (n: number): Bi => b(`+ ${n} autre${n > 1 ? 's' : ''}`, `+ ${n} more`);
const cut = (x: Bi): Bi => b(x.fr.slice(0, 48), x.en.slice(0, 48));

// ---------- Données de chaque bouton ----------
const pendingItems = (i: SnapshotInput, advances: boolean) => waitGroups(i).filter(g => (g.kind === 'advance') === advances).flatMap(g => g.items);
export const overdueRows = (i: SnapshotInput) => (i.invoices || []).map(inv => ({ inv, info: invoiceInfo(inv, i.cash, i.today) })).filter(x => x.info.overdue)
  .sort((x, y) => y.info.days_late - x.info.days_late || y.info.balance - x.info.balance || x.inv.id.localeCompare(y.inv.id));
export function lowStockRows(i: SnapshotInput) {
  const spaces = i.spaces && i.spaces.length ? i.spaces : DEFAULT_STOCK_SPACES, out: { space: { id: string; name: string }; row: ReturnType<typeof stockRows>[number] }[] = [];
  for (const sp of spaces) { const mine = inSpace(i.products, i.moves, sp.id); for (const row of stockRows(mine.products, mine.moves)) if (row.low) out.push({ space: sp, row }); }
  return out.sort((x, y) => Number(y.row.empty) - Number(x.row.empty) || x.row.qty - y.row.qty || x.row.product.name.localeCompare(y.row.product.name));
}
export function silentClients(i: SnapshotInput) {
  const missions = clientMissionsFromPosts(i.posts, i.contracts, i.clients as any, { client_price_default_ar: i.settings?.client_price_default_ar, client_prices_by_type: i.settings?.client_prices_by_type });
  const sums = summarizeClients(i.clients as any, missions, i.today, clientThresholds(i.settings?.company));
  return i.clients.filter(c => c.active !== false).map(c => ({ c, s: sums.get(c.id) })).filter(x => x.s && x.s.days_since_last !== null && x.s.statuses.includes('inactive'))
    .sort((x, y) => Number(y.s!.statuses.includes('strategic')) - Number(x.s!.statuses.includes('strategic')) || (y.s!.days_since_last as number) - (x.s!.days_since_last as number) || x.c.name.localeCompare(y.c.name));
}
const workingNow = (i: SnapshotInput) => {
  const live = i.posts.filter(p => p.status === 'active'), wait = i.posts.filter(p => p.status === 'pending_start' || p.status === 'pending_end');
  const busy = new Set([...live, ...wait].map(p => p.employee_id));
  const idle = i.users.filter(u => u.role === 'employee' && (u.status === undefined || u.status === 'active') && !busy.has(u.id));
  return { live, wait, idle };
};

/** Les boutons à montrer, avec leur chiffre. Un bouton qui n'a rien à montrer (0) est caché ; « Qui travaille », « Argent du mois » et « Résumé du jour » sont toujours là. */
export function shortcutList(i: SnapshotInput): Shortcut[] {
  const all: Shortcut[] = [];
  const add = (id: ShortcutId, fr: string, en: string, count: number | null) => { if (count === 0) return; all.push({ id, q: b(fr, en), label: count === null ? b(fr, en) : b(`${fr} (${count})`, `${en} (${count})`), count }); };
  add('validate', 'À valider', 'To validate', pendingItems(i, false).length);
  add('advances', 'Avances', 'Advances', pendingItems(i, true).length);
  add('overdue', 'Factures en retard', 'Overdue invoices', overdueRows(i).length);
  add('stock', 'Stock bas', 'Low stock', lowStockRows(i).length);
  add('working', 'Qui travaille maintenant', 'Who is working now', null);
  add('money', 'Argent du mois', 'Money this month', null);
  add('silent', 'Clients silencieux', 'Silent clients', silentClients(i).length);
  add('morning', 'Résumé du jour', 'Daily summary', null);
  return all;
}

const PHRASES: Record<ShortcutId, RegExp> = {
  validate: /^(a valider|to validate)$/, advances: /^(avances?|advances?)$/, overdue: /^(factures? en retard|overdue invoices?)$/, stock: /^(stock bas|low stock)$/,
  working: /^(qui travaille( maintenant)?|who is working( now)?)$/, money: /^(argent du mois|money this month)$/, silent: /^(clients? silencieux|silent clients?)$/, morning: /^(resume du jour|daily summary)$/,
};
/** Reconnaît le texte exact d'un bouton (écrit à la main aussi). Le reste de la phrase libre garde son chemin habituel. */
export function detectShortcut(text: string): ShortcutId | null {
  const t = normalizeName(String(text || '').slice(0, 60));
  return (Object.keys(PHRASES) as ShortcutId[]).find(id => PHRASES[id].test(t)) || null;
}

// ---------- Réponses ----------
const reply = (intent: string, title: Bi, lines: Bi[], actions: Reply['actions'], sources: Bi, empty = false): Reply => ({ intent, title, lines, actions, sources, ...(empty ? { empty: true } : {}) });
const src = (i: SnapshotInput, fr: string, en: string): Bi => b(`d'après ${fr} au ${dmy(i.today)}`, `based on ${en} on ${i.today}`);
const nothing = (i: SnapshotInput, title: Bi, fr: string, en: string, from: Bi): Reply => reply('shortcut', title, [b(fr, en)], [], from, true);

function pendingReply(i: SnapshotInput, advances: boolean): Reply {
  const title = advances ? b('Avances en attente', 'Pending advances') : b('À valider', 'To validate'), from = src(i, 'les demandes en attente', 'pending requests');
  const items = pendingItems(i, advances), now = i.nowMs ?? null;
  if (!items.length) return nothing(i, title, advances ? 'Aucune avance en attente.' : 'Rien à valider pour le moment.', advances ? 'No pending advance.' : 'Nothing to validate right now.', from);
  const shown = items.slice(0, SHOWN), rest = items.length - shown.length;
  const lines = shown.map((x, k) => { const w = waitedText(x.since, now, x.coarse); return b(`${k + 1}. ${x.label.fr}${w ? ` (en attente ${w.fr})` : ''}`, `${k + 1}. ${x.label.en}${w ? ` (waiting ${w.en})` : ''}`); });
  if (rest > 0) lines.push(b(`… et ${rest} autre${rest > 1 ? 's' : ''}.`, `… and ${rest} more.`));
  return reply('shortcut', b(`${title.fr} : ${items.length}`, `${title.en}: ${items.length}`), lines, [...shown.map(x => ({ label: cut(x.label), go: x.go })), ...(rest > 0 ? [{ label: more(rest), go: advances ? { view: 'validations', filter: 'advances' } : { view: 'validations' } }] : [])], from);
}

function overdueReply(i: SnapshotInput): Reply {
  const title = b('Factures en retard', 'Overdue invoices'), from = src(i, 'les factures émises et l\'argent reçu', 'issued invoices and money received'), rows = overdueRows(i);
  if (!rows.length) return nothing(i, title, 'Aucune facture en retard.', 'No overdue invoice.', from);
  const shown = rows.slice(0, SHOWN), rest = rows.length - shown.length, total = rows.reduce((t, x) => t + x.info.balance, 0);
  const lines = shown.map((x, k) => { const who = x.inv.client?.name || '?', num = x.inv.number || '—'; return b(`${k + 1}. ${num} · ${who} : ${ar(x.info.balance, 'fr')} (${x.info.days_late} j de retard)`, `${k + 1}. ${num} · ${who}: ${ar(x.info.balance, 'en')} (${x.info.days_late} d late)`); });
  if (rest > 0) lines.push(b(`… et ${rest} autre${rest > 1 ? 's' : ''}.`, `… and ${rest} more.`));
  lines.push(b(`Reste à encaisser : ${ar(total, 'fr')} sur ${rows.length} ${plural(rows.length, 'facture', 'factures')}.`, `Left to collect: ${ar(total, 'en')} on ${rows.length} ${plural(rows.length, 'invoice', 'invoices')}.`));
  return reply('shortcut', b(`${title.fr} : ${rows.length}`, `${title.en}: ${rows.length}`), lines, [...shown.map(x => ({ label: b(`Ouvrir ${x.inv.number || 'la facture'}`.slice(0, 48), `Open ${x.inv.number || 'the invoice'}`.slice(0, 48)), go: { view: 'invoices', nav: `inv-${x.inv.id}` } })), ...(rest > 0 ? [{ label: more(rest), go: { view: 'invoices' } }] : [])], from);
}

function stockReply(i: SnapshotInput): Reply {
  const title = b('Stock bas', 'Low stock'), from = src(i, 'les produits et leurs mouvements', 'products and their movements'), rows = lowStockRows(i);
  if (!rows.length) return nothing(i, title, 'Aucun produit sous son seuil.', 'No product below its threshold.', from);
  const multi = new Set(rows.map(x => x.space.id)).size > 1 || (i.spaces || []).length > 1, shown = rows.slice(0, SHOWN), rest = rows.length - shown.length;
  const lines = shown.map(({ space, row }, k) => { const pre = multi ? `${space.name} · ` : ''; return b(`${k + 1}. ${pre}${row.product.name} : ${row.empty ? 'épuisé' : `${row.qty} restant${row.qty > 1 ? 's' : ''} (seuil ${row.product.alert_threshold})`}`, `${k + 1}. ${pre}${row.product.name}: ${row.empty ? 'out of stock' : `${row.qty} left (threshold ${row.product.alert_threshold})`}`); });
  if (rest > 0) lines.push(b(`… et ${rest} autre${rest > 1 ? 's' : ''}.`, `… and ${rest} more.`));
  return reply('shortcut', b(`${title.fr} : ${rows.length}`, `${title.en}: ${rows.length}`), lines, [...shown.map(({ space, row }) => ({ label: b(row.product.name.slice(0, 48), row.product.name.slice(0, 48)), go: { view: 'storage', storage: { space: space.id, filter: row.empty ? 'empty' as const : 'low' as const, product: row.product.id } } })), ...(rest > 0 ? [{ label: more(rest), go: { view: 'storage', storage: { filter: 'low' as const } } }] : [])], from);
}

function workingReply(i: SnapshotInput): Reply {
  const { live, wait, idle } = workingNow(i), from = src(i, 'les missions en cours et la liste des employés actifs', 'ongoing missions and the active employees list');
  const title = b(`Maintenant : ${live.length} en mission`, `Now: ${live.length} on a mission`);
  const lines: Bi[] = [];
  for (const p of live.slice(0, SHOWN)) lines.push(b(`• ${p.employee_name || 'Un opérateur'} · ${p.client_name || 'une mission'}`, `• ${p.employee_name || 'An operator'} · ${p.client_name || 'a mission'}`));
  if (live.length > SHOWN) lines.push(b(`… et ${live.length - SHOWN} autre${live.length - SHOWN > 1 ? 's' : ''} en mission.`, `… and ${live.length - SHOWN} more on a mission.`));
  if (live.length === 0) lines.push(b('Personne n\'est en mission pour le moment.', 'Nobody is on a mission right now.'));
  if (wait.length) lines.push(b(`${wait.length} ${plural(wait.length, 'étape attend', 'étapes attendent')} ta validation.`, `${wait.length} ${plural(wait.length, 'step is', 'steps are')} waiting for your validation.`));
  lines.push(b(`${idle.length} employé${idle.length > 1 ? 's' : ''} actif${idle.length > 1 ? 's' : ''} sans mission en ce moment (les absences et congés ne sont pas comptés ici).`, `${idle.length} active employee${idle.length === 1 ? '' : 's'} without a mission right now (absences and leave are not counted here).`));
  const seen = new Set<string>(), who = [...live, ...wait].filter(p => !seen.has(p.employee_id) && seen.add(p.employee_id)).slice(0, 3);
  return reply('shortcut', title, lines, [...who.map(p => ({ label: b((p.employee_name || 'Un opérateur').slice(0, 48), (p.employee_name || 'An operator').slice(0, 48)), go: { view: 'employees', nav: `emp-${p.employee_id}` } })), { label: b('Ouvrir Employés', 'Open Employees'), go: { view: 'employees' } }], from);
}

function moneyReply(i: SnapshotInput): Reply {
  const f = buildSnapshot(i).finance, from = src(i, 'la caisse et les missions validées du mois', 'the cash book and the month\'s validated missions');
  const m = f.margin_pct === null ? '' : ` (marge ${f.margin_pct} %)`, mEn = f.margin_pct === null ? '' : ` (margin ${f.margin_pct}%)`;
  return reply('shortcut', b('Argent du mois', 'Money this month'), [
    b(`Reçu : ${ar(f.received, 'fr')} · Dépenses : ${ar(f.expenses, 'fr')} · Salaires : ${ar(f.salaries, 'fr')}`, `Received: ${ar(f.received, 'en')} · Expenses: ${ar(f.expenses, 'en')} · Salaries: ${ar(f.salaries, 'en')}`),
    b(`Bénéfice : ${ar(f.profit, 'fr')}${m}`, `Profit: ${ar(f.profit, 'en')}${mEn}`),
    b(`Trésorerie : ${ar(f.treasury, 'fr')} · À encaisser : ${ar(f.to_collect, 'fr')}`, `Cash on hand: ${ar(f.treasury, 'en')} · To collect: ${ar(f.to_collect, 'en')}`),
  ], [{ label: b('Voir le bénéfice', 'See the profit'), go: finGo('profit') }, { label: b('Voir la trésorerie', 'See the cash'), go: finGo('treasury') }, { label: b('Voir à encaisser', 'See to collect'), go: finGo('toCollect') }], from);
}

function silentReply(i: SnapshotInput): Reply {
  const title = b('Clients silencieux', 'Silent clients'), from = src(i, 'les missions des clients actifs', 'active clients\' missions'), rows = silentClients(i);
  if (!rows.length) return nothing(i, title, 'Aucun client silencieux : tous ont eu une mission récemment.', 'No silent client: all had a mission recently.', from);
  const shown = rows.slice(0, SHOWN), rest = rows.length - shown.length;
  const lines = shown.map(({ c, s }, k) => { const st = s!.statuses.includes('strategic'); return b(`${k + 1}. ${c.name} : aucune mission depuis ${s!.days_since_last} j${st ? ' (stratégique)' : ''}`, `${k + 1}. ${c.name}: no mission for ${s!.days_since_last} d${st ? ' (strategic)' : ''}`); });
  if (rest > 0) lines.push(b(`… et ${rest} autre${rest > 1 ? 's' : ''}.`, `… and ${rest} more.`));
  return reply('shortcut', b(`${title.fr} : ${rows.length}`, `${title.en}: ${rows.length}`), lines, [...shown.map(({ c }) => ({ label: b(`Client : ${c.name}`.slice(0, 48), `Client: ${c.name}`.slice(0, 48)), go: { view: 'clients', nav: `client-${c.id}` } as HealthGo })), ...(rest > 0 ? [{ label: more(rest), go: { view: 'clients' } }] : [])], from);
}

export function shortcutReply(id: ShortcutId, i: SnapshotInput, alerts: HealthAlert[]): Reply {
  switch (id) {
    case 'validate': return pendingReply(i, false);
    case 'advances': return pendingReply(i, true);
    case 'overdue': return overdueReply(i);
    case 'stock': return stockReply(i);
    case 'working': return workingReply(i);
    case 'money': return moneyReply(i);
    case 'silent': return silentReply(i);
    default: return morningSummary(i, alerts);
  }
}
