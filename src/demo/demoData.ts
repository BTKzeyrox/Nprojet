import type { CashEntry, Client, Product, StockMove, ChatGroup, ChatMessage, ClientContract, NewsPost, PasswordResetRequest, PostSession, PresenceRow, ProfileChangeRequest, SalaryAdvanceRequest, SignupRequest, User } from '../types';

// Données 100 % inventées pour le mode démo (aucune vraie personne, aucun vrai montant, aucune photo).
// Tout est calculé à partir de la date du jour, avec un générateur « aléatoire » fixe : la démo est la même à chaque ouverture.

import { clientPriceForPost } from '../utils/clientPrice';

export const DEMO_ADMIN_ID = 'demo_admin';
// Prix client inventés pour la démo (les vrais prix se règlent dans Réglages > Missions). Les types sont ceux des missions de la démo.
// Objectifs et seuils inventés pour la démo (objectifs du mois, alertes)
export const DEMO_GOALS = { goal_missions: 120, goal_profit_ar: 400000, goal_max_expenses_ar: 900000, alert_unpaid_days: 30, alert_low_cash_ar: 0 };
export const DEMO_CLIENT_PRICES = { client_price_default_ar: 8000, client_prices_by_type: { 'CONTRÔLE QUALITÉ': 9000, 'WEB': 12000 } as Record<string, number> };
/** Conditions inventées pour la démo (rien de réel : ni numéro fiscal, ni adresse vraie). Locales, jamais envoyées. */
export const DEMO_COMPANY = {
  identity: { name: 'Société Démo', address: 'Lot 12, Antananarivo (démo)', phone: '034 00 000 00', email: 'contact@exemple.mg', logo_url: '', currency: 'Ar' },
  legal: { tax_id: '', register_id: '', notes: ['Données de démonstration'] },
  tax: { vat_enabled: false, vat_rate: 0, vat_exempt_text: 'TVA non applicable (démo)' },
  billing: { invoice_prefix: 'FA-', receipt_prefix: 'RC-', payment_days: 30, late_penalty_text: '', payment_methods_text: 'Espèces, mobile money', invoice_footer: 'Merci de votre confiance' },
  payroll: { pay_day: 5, pay_rounding: 'none' },
  leave: { leave_days_per_year: 30, work_days_per_week: 5, late_limit_time: '08:00' },
  missions: { validation_hours: 48, refusal_reason_required: true },
  options: { invoice_per: 'client_month', quotes_enabled: false, employee_sees_badges: true, employee_sees_attention: false, mission_requires_client: true, badges_enabled: true },
  texts: { internal_rules: 'Arriver avant 08:00.\nEnvoyer ses justificatifs au début et à la fin de chaque mission.\n(texte de démonstration)', customer_terms: 'Paiement à 30 jours. (texte de démonstration)' },
} as const;
const PRICE = 5000; // Ar par mission validée (tarif fixe de la démo)

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const iso = (d: Date, h = 9, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };

const PEOPLE: { id: string; name: string; username: string; shift: 'day' | 'night' }[] = [
  { id: 'demo_u1', name: 'Camille Durand', username: 'camille', shift: 'day' },
  { id: 'demo_u2', name: 'Noé Lambert', username: 'noe', shift: 'day' },
  { id: 'demo_u3', name: 'Inès Moreau', username: 'ines', shift: 'day' },
  { id: 'demo_u4', name: 'Hugo Petit', username: 'hugo', shift: 'night' },
  { id: 'demo_u5', name: 'Léa Roux', username: 'lea', shift: 'day' },
  { id: 'demo_u6', name: 'Sam Fontaine', username: 'sam', shift: 'night' },
];

const MISSIONS: { title: string; type: string; desc: string }[] = [
  { title: 'Saisie des fiches du lot 12', type: 'SAISIE DE FICHES', desc: 'Saisir les fiches papier dans le logiciel de l\'entreprise. Vérifier le numéro de dossier.' },
  { title: 'Saisie des factures de septembre', type: 'SAISIE DE FICHES', desc: 'Reporter montant, date et fournisseur.' },
  { title: 'Relecture des fiches du lot 9', type: 'CONTRÔLE QUALITÉ', desc: 'Relire un échantillon de 30 fiches et noter les erreurs.' },
  { title: 'Contrôle des doublons clients', type: 'CONTRÔLE QUALITÉ', desc: 'Repérer les clients enregistrés deux fois.' },
  { title: 'Classement des dossiers du personnel', type: 'ADMINISTRATIF', desc: 'Classer et numéroter les dossiers.' },
  { title: 'Préparation des courriers du mois', type: 'ADMINISTRATIF', desc: 'Imprimer, plier et ranger par service.' },
  { title: 'Aide à l\'équipe du support', type: 'AIDE', desc: 'Répondre aux questions internes de l\'équipe.' },
  { title: 'Mise à jour du catalogue en ligne', type: 'WEB', desc: 'Corriger les prix et les descriptions des produits.' },
  { title: 'Vérification des liens du site', type: 'WEB', desc: 'Tester les liens et signaler ceux qui sont cassés.' },
  { title: 'Saisie des bons de livraison', type: 'SAISIE DE FICHES', desc: 'Saisir les bons de la semaine.' },
  { title: 'Relecture du guide interne', type: 'CONTRÔLE QUALITÉ', desc: 'Corriger les fautes et les liens du guide.' },
  { title: 'Archivage des contrats 2025', type: 'ADMINISTRATIF', desc: 'Scanner et nommer les fichiers.' },
];

export interface DemoData {
  users: User[];
  contracts: ClientContract[];
  posts: PostSession[];
  advances: SalaryAdvanceRequest[];
  messages: ChatMessage[];
  groups: ChatGroup[];
  news: NewsPost[];
  signups: SignupRequest[];
  resets: PasswordResetRequest[];
  profileRequests: ProfileChangeRequest[];
  presence: PresenceRow[];
  errors: Record<string, unknown>[];
  cash: CashEntry[];
  products: Product[];
  stock: StockMove[];
  clients: Client[];
}

// ----- Finances inventées (paiements reçus et dépenses), cohérentes avec les missions validées de la démo -----
// Règle : les mois passés, les clients ont payé environ 92 % de ce qui a été facturé ; ce mois-ci, environ 70 % (il reste donc « à encaisser »).
// Générateur à part (graine propre) : les autres données de la démo ne changent pas.
export function buildDemoCash(posts: PostSession[], contracts: ClientContract[]): CashEntry[] {
  const r = rng(20261019);
  const today = new Date();
  const todayKey = ymd(today);
  const mk = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const billed: Record<string, number> = {};
  let first = '9999-99-99';
  for (const p of posts) {
    if (p.status !== 'completed' || !p.date) continue;
    const k = p.date.slice(0, 7);
    billed[k] = (billed[k] || 0) + clientPriceForPost(p, contracts, DEMO_CLIENT_PRICES);
    if (p.date < first) first = p.date;
  }
  const clients = ['Atelier Rivage', 'Société Delta Services', 'Maison Lumière', 'Cabinet Horizon'];
  const out: CashEntry[] = [];
  let n = 0;
  const add = (kind: 'in' | 'out', category: string, amount: number, date: string, note: string, client?: string) => {
    if (date > todayKey || date < first || amount < 1) return; // pas de date dans le futur, rien avant le début de la démo
    n++;
    const at = new Date(`${date}T09:00:00`).toISOString();
    out.push({ id: `demo_c${n}`, kind, category, amount_ar: Math.round(amount), date, note, ...(client ? { client_name: client } : {}), created_by: DEMO_ADMIN_ID, created_at: at, updated_at: at });
  };
  const round1000 = (v: number) => Math.round(v / 1000) * 1000;
  const months: [number, number][] = [];
  for (let i = 23; i >= 0; i--) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); months.push([d.getFullYear(), d.getMonth()]); }
  months.forEach(([y, m], idx) => {
    const key = `${y}-${pad(m + 1)}`;
    const isNow = y === today.getFullYear() && m === today.getMonth();
    const b = billed[key] || 0;
    if (b > 0) {
      const c1 = clients[(idx * 3) % clients.length], c2 = clients[(idx * 3 + 1) % clients.length];
      if (isNow) {
        const day = Math.max(1, today.getDate() - 1);
        add('in', 'Paiement client', round1000(b * 0.7), mk(y, m, day), 'Acompte du mois', c1);
      } else {
        const paid = round1000(b * 0.92);
        add('in', 'Paiement client', round1000(paid * 0.6), mk(y, m, 12), 'Virement', c1);
        add('in', 'Paiement client', paid - round1000(paid * 0.6), mk(y, m, 26), 'Virement', c2);
      }
    }
    add('out', 'Loyer', 20000, mk(y, m, 5), 'Local du mois');
    add('out', 'Internet', 10000, mk(y, m, 8), 'Abonnement du mois');
    add('out', 'Achats', round1000(4000 + r() * 6000), mk(y, m, 10 + Math.floor(r() * 8)), 'Fournitures de bureau');
    add('out', 'Transport', round1000(3000 + r() * 5000), mk(y, m, 15 + Math.floor(r() * 10)), 'Déplacements');
    if (idx % 4 === 1) add('out', 'Matériel', round1000(25000 + r() * 25000), mk(y, m, 18), 'Casque et souris');
  });
  add('out', 'Transport', 6000, todayKey, 'Course du jour (démo)'); // la vue « Jour » n'est pas vide
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ----- Stock inventé (6 produits, 12 mois de mouvements). Générateur à part (graine propre) : les autres données de la démo ne changent pas. -----
// La quantité n'est jamais écrite : elle se calcule avec les mouvements, et une sortie ne dépasse jamais ce qu'il y a en stock.
export function buildDemoStock(): { products: Product[]; stock: StockMove[] } {
  const r = rng(20261020);
  const today = new Date();
  const todayKey = ymd(today);
  const at = (d: string) => new Date(`${d}T09:00:00`).toISOString();
  // [nom, catégorie, unité, prix d'achat, prix de vente, seuil, sorties par jour (moyenne), lot de réapprovisionnement, mois sans réapprovisionnement à la fin]
  const defs: [string, string, string, number, number, number, number, number, number][] = [
    ['Papier A4', 'Bureau', 'ramette', 12000, 15000, 10, 0.5, 30, 1],
    ['Cartouche d\'encre', 'Bureau', 'unité', 45000, 55000, 2, 0.06, 2, 0],
    ['Casque audio', 'Matériel', 'unité', 35000, 45000, 3, 0.1, 3, 3],
    ['Souris', 'Matériel', 'unité', 12000, 18000, 3, 0.12, 4, 0],
    ['Clé USB 32 Go', 'Matériel', 'unité', 15000, 20000, 4, 0.08, 3, 0],
    ['Câble réseau 5 m', 'Matériel', 'unité', 8000, 12000, 5, 0.1, 3, 0],
  ];
  const products: Product[] = [];
  const stock: StockMove[] = [];
  let n = 0;
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  defs.forEach(([name, category, unit, buy, sell, thr, perDay, lot, noRestock], i) => {
    const id = `demo_p${i + 1}`;
    products.push({ id, name, category, unit, buy_price_ar: buy, sell_price_ar: sell, alert_threshold: thr, created_by: DEMO_ADMIN_ID, created_at: at(ymd(start)), updated_at: at(ymd(start)) });
    let have = 0;
    const add = (type: 'in' | 'out', qty: number, date: string, note: string, cost?: number) => {
      if (qty <= 0 || date > todayKey) return;
      n++;
      stock.push({ id: `demo_mv${n}`, product_id: id, type, qty, date, note, ...(cost ? { unit_cost_ar: cost } : {}), created_by: DEMO_ADMIN_ID, created_at: at(date), updated_at: at(date) });
      have += type === 'in' ? qty : -qty;
    };
    for (let d = new Date(start); ymd(d) <= todayKey; d.setDate(d.getDate() + 1)) {
      const key = ymd(d);
      const monthsAgo = (today.getFullYear() - d.getFullYear()) * 12 + today.getMonth() - d.getMonth();
      if (d.getDate() === 1 && monthsAgo >= noRestock) add('in', monthsAgo === 11 ? lot * 2 : lot, key, monthsAgo === 11 ? 'Stock de départ' : 'Réapprovisionnement', Math.round(buy * (0.95 + r() * 0.1) / 100) * 100);
      if (r() < perDay && have > 0) add('out', Math.min(have, i === 0 ? 1 + Math.floor(r() * 3) : 1), key, i === 0 ? 'Impression des missions' : 'Remis à un opérateur');
    }
  });
  stock.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { products, stock };
}

// ----- Clients inventés (module Clients) : un de chaque statut, calculés à partir des missions de la démo -----
// Missions du tableau (index dans MISSIONS) rattachées à une fiche. L'index 6 (« Aide à l'équipe du support ») reste sans fiche, comme une ancienne mission :
// l'outil « Missions à rattacher » a donc quelque chose à montrer.
const DEMO_CLIENT_OF_MISSION: Record<number, string> = {
  0: 'demo_cl1', 1: 'demo_cl1', 2: 'demo_cl1', 9: 'demo_cl1', 3: 'demo_cl1', // Atelier Rivage : le plus gros chiffre d'affaires (stratégique)
  4: 'demo_cl2', 5: 'demo_cl2', 7: 'demo_cl2', 8: 'demo_cl2', 10: 'demo_cl2', 11: 'demo_cl2', // Société Delta Services : régulier
};
// Missions supplémentaires de la démo : chacune a son propre historique, pour obtenir les statuts « nouveau », « actif » et « inactif ».
const EXTRA_MISSIONS: { title: string; type: string; desc: string; client: string; back: number[] }[] = [
  { title: 'Numérisation des dossiers du cabinet', type: 'ADMINISTRATIF', desc: 'Scanner les dossiers et nommer les fichiers.', client: 'demo_cl3', back: [38, 9] }, // première mission il y a moins de 60 jours : nouveau
  { title: 'Inventaire du stock de la boutique', type: 'SAISIE DE FICHES', desc: 'Compter les articles et saisir les quantités.', client: 'demo_cl4', back: [78, 71] }, // plus de 60 jours, moins de 3 missions récentes : actif
  { title: 'Rangement des archives de la boutique', type: 'ADMINISTRATIF', desc: 'Trier et ranger les anciennes archives.', client: 'demo_cl5', back: [270, 240, 225, 205, 101] }, // rien depuis plus de 90 jours : inactif
];

function buildDemoClients(): Client[] {
  const at = iso(daysAgo(240), 9);
  const mk = (id: string, name: string, contact: string, phone: string, extra: Partial<Client> = {}): Client => ({
    id, name, contact_name: contact, phone, email: '', address: '', note: '', active: true, created_by: DEMO_ADMIN_ID, created_at: at, updated_at: at, ...extra,
  });
  return [
    mk('demo_cl1', 'Atelier Rivage', 'Mme Rivage', '034 00 000 01', { note: 'Client fidèle depuis deux ans. (démo)', payment_terms_days: 30, price_default_ar: 11000 }),
    mk('demo_cl2', 'Société Delta Services', 'M. Delta', '034 00 000 02', { price_default_ar: 9000, payment_terms_days: 45 }),
    mk('demo_cl3', 'Cabinet Horizon', 'Dr Horizon', '034 00 000 03', { price_default_ar: 15000, note: 'Nouveau client, tarif négocié. (démo)' }),
    mk('demo_cl4', 'Maison Lumière', 'Mme Lumière', '034 00 000 04'),
    mk('demo_cl5', 'Boutique Soleil', 'M. Soleil', '034 00 000 05', { note: 'Plus de commande depuis longtemps : à relancer. (démo)' }),
    mk('demo_cl6', 'Studio Nova', 'Mme Nova', '034 00 000 06', { note: 'Premier contact, pas encore de mission. (démo)' }),
  ];
}

export function buildDemoData(): DemoData {
  const r = rng(20261018);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  // ----- Personnes -----
  const users: User[] = [
    {
      id: DEMO_ADMIN_ID, username: 'demo', name: 'Responsable Démo', role: 'admin', status: 'active', shift: 'day', is_online: true,
      avatar_url: '', phone: '', performance_badge: 'Standard', total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
    },
    ...PEOPLE.map((p, i): User => ({
      id: p.id, username: p.username, name: p.name, role: 'employee', status: 'active', shift: p.shift, is_online: i < 3,
      avatar_url: '', phone: '', performance_badge: i === 0 ? 'Top Booster' : i === 1 ? 'Elite' : 'Standard',
      total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
    })),
  ];

  // ----- Missions du tableau (À faire / En cours / À valider) -----
  const contracts: ClientContract[] = MISSIONS.map((m, i) => ({
    id: `demo_c${i + 1}`, post_number: i + 1, client_name: m.title, account_tag: '', game_mode: '', description: m.desc, post_type: m.type,
    proof_mode: 'type', no_account: false, current_rank: '—', target_rank: '—', initial_score: 0, current_score: 0, target_score: 0,
    recommended_shift: 'any', estimated_reward_ar: PRICE, priority: i % 5 === 0 ? 'Urgente' : 'Normale', region_server: '',
    ...(DEMO_CLIENT_OF_MISSION[i] ? { client_id: DEMO_CLIENT_OF_MISSION[i] } : {}),
  }));
  EXTRA_MISSIONS.forEach((m, k) => contracts.push({
    id: `demo_c${MISSIONS.length + k + 1}`, post_number: MISSIONS.length + k + 1, client_name: m.title, account_tag: '', game_mode: '', description: m.desc, post_type: m.type,
    proof_mode: 'type', no_account: false, current_rank: '—', target_rank: '—', initial_score: 0, current_score: 0, target_score: 0,
    recommended_shift: 'any', estimated_reward_ar: PRICE, priority: 'Normale', region_server: '', client_id: m.client,
  }));

  // ----- Historique : missions des 2 dernières années (dense sur les 60 derniers jours) -----
  const posts: PostSession[] = [];
  let n = 0;
  for (let back = 700; back >= 1; back--) {
    const d = daysAgo(back);
    if (d.getDay() === 0) continue; // pas de dimanche
    const dense = back <= 60; // 60 derniers jours : activité forte ; avant : activité plus légère
    const workers = PEOPLE.filter(() => r() > (dense ? 0.25 : back <= 365 ? 0.62 : 0.72)); // quelques absents
    for (const p of workers) {
      const count = dense ? (r() < 0.45 ? 1 : r() < 0.25 ? 2 : 0) : (r() < 0.55 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const m = pick(MISSIONS);
        const startH = p.shift === 'day' ? 8 + k * 3 : 20 + k;
        const rejected = r() < 0.08;
        const qty = 20 + Math.floor(r() * 80);
        n++;
        posts.push({
          id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: qty, initial_score: 0,
          current_score: qty, final_score: qty, remaining_score: 0, status: rejected ? 'rejected' : 'completed', shift_type: p.shift, date: ymd(d),
          start_time: `${pad(startH % 24)}:${pad(Math.floor(r() * 50))}:00`, end_time: `${pad((startH + 1 + Math.floor(r() * 3)) % 24)}:${pad(Math.floor(r() * 50))}:00`,
          start_proof_url: '', end_proof_url: '', calculated_ar: rejected ? 0 : PRICE, rejection_reason: rejected ? 'Capture illisible, merci de renvoyer.' : undefined,
          notes: `${qty} fiches traitées`, demo: true, created_at: iso(d, startH), updated_at: iso(d, startH + 2),
        });
      }
    }
  }
  // Aujourd'hui, déjà terminées tôt le matin : pour que les vues « Jour » et « Semaine » ne soient pas vides dans la démo
  if (daysAgo(0).getDay() !== 0) {
    PEOPLE.slice(0, 3).forEach((p, i) => {
      for (let k = 0; k < 2; k++) {
        const m = MISSIONS[(i * 2 + k + 3) % MISSIONS.length];
        const startH = 1 + i * 2 + k; // 1 h à 6 h : toujours déjà passé
        const qty = 30 + ((i * 17 + k * 11) % 50);
        n++;
        posts.push({
          id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: qty, initial_score: 0,
          current_score: qty, final_score: qty, remaining_score: 0, status: 'completed', shift_type: p.shift, date: ymd(daysAgo(0)),
          start_time: `${pad(startH)}:10:00`, end_time: `${pad(startH + 1)}:25:00`,
          start_proof_url: '', end_proof_url: '', calculated_ar: PRICE, notes: `${qty} fiches traitées`, demo: true, created_at: iso(daysAgo(0), startH), updated_at: iso(daysAgo(0), startH + 1),
        });
      }
    });
  }
  // Aujourd'hui : une mission en cours, deux à valider
  const today = new Date();
  [[3, 9, 8], [5, 4, 9], [2, 11, 10]].forEach(([who, m, h], i) => {
    const p = PEOPLE[who]; n++;
    posts.push({
      id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: MISSIONS[m].title, account_tag: '', target_score: 30, initial_score: 0,
      current_score: 30, final_score: 30, remaining_score: 0, status: 'completed', shift_type: p.shift, date: ymd(today), start_time: `${pad(h)}:05:00`, end_time: `${pad(h + 1 + (i % 2))}:20:00`,
      start_proof_url: '', end_proof_url: '', calculated_ar: PRICE, notes: '30 fiches traitées', demo: true, created_at: iso(today, h), updated_at: iso(today, h + 1),
    });
  });
  const live: { who: number; m: number; status: 'active' | 'pending_end' | 'pending_start' }[] = [
    { who: 0, m: 0, status: 'active' }, { who: 1, m: 2, status: 'pending_end' }, { who: 2, m: 7, status: 'pending_end' }, { who: 4, m: 4, status: 'pending_start' },
  ];
  live.forEach((l, i) => {
    const p = PEOPLE[l.who]; const m = MISSIONS[l.m];
    n++;
    posts.push({
      id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: 40, initial_score: 0,
      current_score: l.status === 'pending_end' ? 40 : 0, final_score: l.status === 'pending_end' ? 40 : undefined, remaining_score: l.status === 'pending_end' ? 0 : 40,
      status: l.status, shift_type: p.shift, date: ymd(today), start_time: `${pad(8 + i)}:10:00`, start_proof_url: '', post_number: l.m + 1,
      notes: l.status === 'pending_end' ? '40 fiches traitées' : undefined, demo: true, created_at: iso(today, 8 + i), updated_at: iso(today, 9 + i),
    });
  });

  // Historique des missions supplémentaires (sans le générateur aléatoire : le reste de la démo ne change pas)
  EXTRA_MISSIONS.forEach((m, k) => m.back.forEach((back, j) => {
    const p = PEOPLE[(k + j) % PEOPLE.length]; const d = daysAgo(back); const qty = 30 + ((k * 13 + j * 7) % 40); n++;
    posts.push({
      id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: qty, initial_score: 0,
      current_score: qty, final_score: qty, remaining_score: 0, status: 'completed', shift_type: p.shift, date: ymd(d),
      start_time: '09:10:00', end_time: '11:25:00', start_proof_url: '', end_proof_url: '', calculated_ar: PRICE, notes: `${qty} fiches traitées`,
      demo: true, created_at: iso(d, 9), updated_at: iso(d, 11),
    });
  }));

  // Totaux affichés dans les fiches
  for (const u of users) {
    const mine = posts.filter(p => p.employee_id === u.id && p.status === 'completed');
    u.total_earnings_ar = mine.length * PRICE;
    u.total_score_boosted = mine.reduce((a, p) => a + (p.final_score || 0), 0);
  }

  // ----- Avances -----
  const advances: SalaryAdvanceRequest[] = [
    { id: 'demo_a1', employee_id: 'demo_u3', employee_name: 'Inès Moreau', amount_ar: 40000, reason: 'Frais de transport du mois', request_date: ymd(daysAgo(12)), status: 'approved', demo: true },
    { id: 'demo_a3', employee_id: 'demo_u1', employee_name: 'Camille Durand', amount_ar: 30000, reason: 'Frais de santé', request_date: ymd(daysAgo(45)), status: 'approved', demo: true },
    { id: 'demo_a4', employee_id: 'demo_u5', employee_name: 'Léa Roux', amount_ar: 20000, reason: 'Transport', request_date: ymd(daysAgo(80)), status: 'approved', demo: true },
    { id: 'demo_a5', employee_id: 'demo_u4', employee_name: 'Hugo Petit', amount_ar: 35000, reason: 'Loyer', request_date: ymd(daysAgo(130)), status: 'approved', demo: true },
    { id: 'demo_a6', employee_id: 'demo_u6', employee_name: 'Sam Fontaine', amount_ar: 15000, reason: 'Connexion internet', request_date: ymd(daysAgo(200)), status: 'approved', demo: true },
    { id: 'demo_a2', employee_id: 'demo_u2', employee_name: 'Noé Lambert', amount_ar: 25000, reason: 'Facture d\'internet', request_date: ymd(daysAgo(2)), status: 'pending', demo: true },
  ];

  // ----- Messagerie -----
  const t = (daysBack: number, h: number, m: number) => iso(daysAgo(daysBack), h, m);
  const msg = (id: string, from: string, fromName: string, role: 'admin' | 'employee', to: string, text: string, ts: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id, sender_id: from, sender_name: fromName, sender_role: role, recipient_id: to, message: text, timestamp: ts, sent_ms: new Date(ts).getTime(), ...extra });
  const GROUP = 'grp_demo_saisie';
  const groups: ChatGroup[] = [{
    id: GROUP, name: 'Équipe saisie', owner_id: DEMO_ADMIN_ID, members: [DEMO_ADMIN_ID, 'demo_u1', 'demo_u2', 'demo_u3', 'demo_u5'],
    description: 'Questions et annonces sur les saisies de fiches.', created_at: t(30, 9, 0),
  }];
  const m1 = msg('demo_m1', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', 'all', 'Bonjour à tous. Les nouvelles missions de la semaine sont publiées dans le tableau.', t(1, 8, 5), { pinned: true, pinned_at: t(1, 8, 6) });
  const m2 = msg('demo_m2', 'demo_u1', 'Camille Durand', 'employee', GROUP, 'Le lot 12 est terminé, je l\'envoie à valider cet après-midi.', t(0, 10, 12));
  const messages: ChatMessage[] = [
    m1,
    msg('demo_m3', 'demo_u2', 'Noé Lambert', 'employee', 'all', 'Merci, bien reçu !', t(1, 8, 20), { reactions: { '👍': [DEMO_ADMIN_ID, 'demo_u1', 'demo_u3'] } }),
    msg('demo_m4', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', GROUP, 'Pensez à joindre une capture du logiciel à la fin de chaque mission.', t(2, 9, 30), { reactions: { '❤️': ['demo_u1', 'demo_u5'] } }),
    m2,
    msg('demo_m5', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', GROUP, 'Très bien Camille. Je valide dès que c\'est envoyé.', t(0, 10, 20), { reply_to: { id: 'demo_m2', sender_name: 'Camille Durand', text: m2.message } }),
    msg('demo_m6', 'demo_u3', 'Inès Moreau', 'employee', DEMO_ADMIN_ID, 'Bonjour, est-ce que je peux prendre la mission « Relecture du guide interne » ?', t(0, 9, 2)),
    msg('demo_m7', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', 'demo_u3', 'Oui, elle est pour toi. Bon courage !', t(0, 9, 8), { reply_to: { id: 'demo_m6', sender_name: 'Inès Moreau', text: 'Bonjour, est-ce que je peux prendre la mission « Relecture du guide interne » ?' }, reactions: { '🙏': ['demo_u3'] } }),
  ];

  // ----- Actualités -----
  const news: NewsPost[] = [
    { id: 'demo_n1', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Bienvenue dans Gestion Pro', text: 'Ceci est une démonstration avec des données inventées. Vous pouvez tout essayer : créer une mission, la prendre, la valider, écrire un message.', created_at: t(3, 9, 0), pinned: true, loves: ['demo_u1', 'demo_u2', 'demo_u4'], comments: [{ id: 'demo_nc1', user_id: 'demo_u1', user_name: 'Camille Durand', role: 'employee', text: 'Merci, c\'est très clair !', created_at: t(3, 10, 0) }], shares: 2 },
    { id: 'demo_n2', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Nouvelle règle de justificatif', text: 'À partir de lundi, une capture de l\'écran du logiciel est demandée à la fin de chaque saisie de fiches.', created_at: t(6, 14, 0), pinned: false, loves: ['demo_u3'], comments: [], shares: 0 },
    { id: 'demo_n3', author_id: 'demo_u5', author_name: 'Léa Roux', author_role: 'employee', title: '', text: 'Astuce : trier les fiches par numéro avant de commencer fait gagner du temps.', created_at: t(8, 11, 30), pinned: false, loves: [DEMO_ADMIN_ID, 'demo_u1'], comments: [], shares: 1, status: 'published' },
    { id: 'demo_n4', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Objectif du mois atteint', text: 'Bravo à toute l\'équipe : le volume de missions validées a dépassé l\'objectif du mois.', created_at: t(14, 16, 45), pinned: false, loves: PEOPLE.map(p => p.id), comments: [], shares: 3 },
  ];

  // ----- Demandes en attente (pour tester les décisions du responsable) -----
  const signups: SignupRequest[] = [
    { id: 'demo_s1', name: 'Tom Garnier', username: 'tom', phone: '', shift: 'day', status: 'pending', created_at: iso(daysAgo(0), 7, 40), note: 'Disponible le matin.' },
    { id: 'demo_s2', name: 'Alice Perret', username: 'alice', phone: '', shift: 'night', status: 'pending', created_at: iso(daysAgo(1), 18, 5) },
  ];
  const resets: PasswordResetRequest[] = [
    { id: 'demo_r1', user_id: 'demo_u4', username: 'hugo', name: 'Hugo Petit', phone: '', status: 'pending', created_at: iso(daysAgo(0), 8, 15), note: 'J\'ai oublié mon mot de passe.' },
  ];
  const profileRequests: ProfileChangeRequest[] = [
    { id: 'demo_p1', user_id: 'demo_u5', status: 'pending', created_at: iso(daysAgo(0), 9, 5), old: { name: 'Léa Roux', username: 'lea', phone: '', avatar_url: '' }, name: 'Léa Roux-Martin', username: 'lea', phone: '', avatar_url: '', note: 'Mon nom a changé.' },
  ];
  const dayKey = ymd(new Date());
  const presence: PresenceRow[] = ['demo_u1', 'demo_u2', 'demo_u3'].map((id, i) => ({ user_id: id, last_seen: new Date().toISOString(), day: dayKey, online_sec: 5400 + i * 1500, waiting_since: null }));
  const errors: Record<string, unknown>[] = [
    { id: 'demo_e1', kind: 'error', message: 'Exemple d\'erreur (démo) : image introuvable', stack: '', page: 'news', role: 'employee', version: 'démo', count: 3, first_seen: iso(daysAgo(2), 10, 0), last_seen: iso(daysAgo(0), 8, 30), status: 'open' },
    { id: 'demo_e2', kind: 'report', message: 'Signalement d\'exemple (démo) : le bouton est trop petit', stack: '', page: 'chat', role: 'employee', version: 'démo', count: 1, first_seen: iso(daysAgo(1), 14, 0), last_seen: iso(daysAgo(1), 14, 0), status: 'open' },
  ];

  const cash = buildDemoCash(posts, contracts);
  const { products, stock } = buildDemoStock();
  return { users, contracts, posts, advances, messages, groups, news, signups, resets, profileRequests, presence, errors, cash, products, stock, clients: buildDemoClients() };
}
