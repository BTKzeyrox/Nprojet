// Finances : chiffres « vraie entreprise » (sans écran, sans serveur). Utilisés par l'onglet Finances et par `npm run check:finance-stats`.
// Facturé = missions validées × prix client · Encaissé = paiements reçus · À encaisser = facturé − encaissé
// Dépenses = dépenses saisies + salaires (les avances sont déjà dans les salaires) · Bénéfice = encaissé − dépenses · Marge = bénéfice ÷ encaissé
import type { CashEntry, ClientContract, PostSession } from '../types';
import { buckets, type StatsGranularity, type StatsRange } from './stats';
import { clientPriceForPost } from './clientPrice';
import { canonicalClientName, type ClientRecord } from './clients';

type PriceSettings = Parameters<typeof clientPriceForPost>[2];

export interface FinanceInput {
  cash: CashEntry[];
  posts: PostSession[];
  contracts: ClientContract[];
  prices: PriceSettings;
  pricePerMission: number; // salaire d'une mission si aucun montant figé
  clients?: ClientRecord[]; // fiches clients (admin) : « meilleur client » et le classement reprennent le nom officiel de la fiche
}

const inR = (d: string, r: { start: string; end: string }) => d >= r.start && d <= r.end;
const salaryOf = (p: PostSession, fallback: number): number => Math.max(0, Math.round(typeof p.calculated_ar === 'number' ? p.calculated_ar : fallback));
const typeOf = (p: PostSession, contracts: ClientContract[]): string => {
  const c = contracts.find(x => (p.post_number !== undefined && x.post_number === p.post_number) || (!!x.client_name && x.client_name === p.client_name));
  return (c?.post_type || '').trim() || 'Autre';
};

export interface TypeRow { type: string; done: number; billed: number; salaries: number; margin: number; marginPct: number | null }
export interface FinanceStats {
  received: number; spent: number; salaries: number; totalOut: number;
  profit: number; marginPct: number | null;
  billed: number; toCollect: number; treasury: number;
  done: number; costPerMission: number | null; gainPerMission: number | null;
  byType: TypeRow[];
  bestClient: { name: string; amount: number; id?: string } | null;
  clients: { name: string; amount: number; id?: string }[]; // tous les clients qui ont payé sur la période, du plus gros au plus petit (classement)
  expensesByCategory: { label: string; value: number }[];
  labels: string[];
  fullLabels: string[];
  series: { inflow: number[]; outflow: number[]; billed: number[]; cumulative: number[] };
}

export function computeFinance(input: FinanceInput, g: StatsGranularity, range: StatsRange, lang: 'fr' | 'en' = 'fr', salariesLabel = 'Salaires'): FinanceStats {
  const cash = input.cash.filter(e => inR(e.date, range));
  const done = input.posts.filter(p => p.status === 'completed' && inR(p.date, range));
  const salaryAt = (p: PostSession) => salaryOf(p, input.pricePerMission);
  const priceAt = (p: PostSession) => clientPriceForPost(p, input.contracts, input.prices);

  const received = cash.filter(e => e.kind === 'in').reduce((t, e) => t + e.amount_ar, 0);
  const spent = cash.filter(e => e.kind === 'out').reduce((t, e) => t + e.amount_ar, 0);
  const salaries = done.reduce((t, p) => t + salaryAt(p), 0);
  const billed = done.reduce((t, p) => t + priceAt(p), 0);
  const totalOut = spent + salaries;
  const profit = received - totalOut;

  // Trésorerie = tout l'argent reçu − toutes les dépenses − tous les salaires, depuis le début
  const treasury = input.cash.reduce((t, e) => t + (e.kind === 'in' ? e.amount_ar : -e.amount_ar), 0)
    - input.posts.filter(p => p.status === 'completed').reduce((t, p) => t + salaryAt(p), 0);

  // Par type de mission
  const types = new Map<string, TypeRow>();
  for (const p of done) {
    const k = typeOf(p, input.contracts);
    const row = types.get(k) || { type: k, done: 0, billed: 0, salaries: 0, margin: 0, marginPct: null };
    row.done++; row.billed += priceAt(p); row.salaries += salaryAt(p);
    types.set(k, row);
  }
  const byType = [...types.values()].map(r => ({ ...r, margin: r.billed - r.salaries, marginPct: r.billed > 0 ? Math.round(((r.billed - r.salaries) / r.billed) * 100) : null }))
    .sort((a, b) => b.margin - a.margin || a.type.localeCompare(b.type));

  // Meilleur client : celui qui a le plus payé sur la période (lignes « entrée » avec un nom de client)
  // Avec les fiches clients : un nom qui correspond à UNE fiche prend le nom de la fiche (mêmes clients regroupés, id gardé)
  const records = input.clients || [];
  const byClient = new Map<string, { amount: number; id?: string }>();
  for (const e of cash) {
    if (e.kind !== 'in' || !e.client_name?.trim()) continue;
    const c = records.length ? canonicalClientName(e.client_name, records) : { name: e.client_name.trim(), id: null };
    const row = byClient.get(c.name) || { amount: 0, id: c.id || undefined };
    row.amount += e.amount_ar;
    byClient.set(c.name, row);
  }
  const clientList = [...byClient.entries()].map(([name, v]) => ({ name, amount: v.amount, id: v.id })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const best = clientList[0];

  // Dépenses par catégorie (+ salaires)
  const cats = new Map<string, number>();
  for (const e of cash) if (e.kind === 'out') cats.set(e.category, (cats.get(e.category) || 0) + e.amount_ar);
  if (salaries > 0) cats.set(salariesLabel, (cats.get(salariesLabel) || 0) + salaries);
  const expensesByCategory = [...cats.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  // Séries par barre (heure / jour / mois)
  const b = buckets(g, range, lang);
  const inflow = new Array(b.count).fill(0), outflow = new Array(b.count).fill(0), billedS = new Array(b.count).fill(0);
  const put = (arr: number[], date: string, time: string | undefined, v: number) => { const i = b.index(date, time); if (i >= 0 && i < b.count) arr[i] += v; };
  for (const e of cash) put(e.kind === 'in' ? inflow : outflow, e.date, undefined, e.amount_ar);
  for (const p of done) { put(outflow, p.date, p.start_time, salaryAt(p)); put(billedS, p.date, p.start_time, priceAt(p)); }
  let acc = 0;
  const cumulative = inflow.map((v, i) => (acc += v - outflow[i]));

  return {
    received, spent, salaries, totalOut, profit,
    marginPct: received > 0 ? Math.round((profit / received) * 100) : null,
    billed, toCollect: Math.max(0, billed - received), treasury,
    done: done.length,
    costPerMission: done.length ? Math.round(totalOut / done.length) : null,
    gainPerMission: done.length ? Math.round(profit / done.length) : null,
    byType,
    bestClient: best ? { name: best.name, amount: best.amount, ...(best.id ? { id: best.id } : {}) } : null,
    clients: clientList.map(c => ({ name: c.name, amount: c.amount, ...(c.id ? { id: c.id } : {}) })),
    expensesByCategory,
    labels: b.labels,
    fullLabels: b.fullLabels,
    series: { inflow, outflow, billed: billedS, cumulative },
  };
}
