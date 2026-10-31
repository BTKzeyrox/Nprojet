// Générateur de la SIMULATION (module 18, M18.4) : des données inventées mais réalistes sur 2 mois, pour montrer le site en vrai (ex. à un recruteur).
// Fonction PURE : elle ne lit ni n'écrit aucune base, aucun réseau, aucun stockage. Elle rend des listes dans la forme exacte du site ;
// c'est M18.5 qui les charge (jamais ce fichier). Même date en entrée = mêmes données (générateur « aléatoire » à graine fixe).
// Tout est fabriqué avec les VRAIES règles du site (prix client, lignes de facture, écritures comptables) : les chiffres de la simulation sont donc ceux
// que le site calculerait lui-même. Contrôlé par `npm run check:simulation`.
// MARQUE : chaque ligne créée par la simulation a un identifiant qui commence par « sim- » (ou « sh-… » pour le planning, imposé par le site : voir `isSimShift`),
// pour la retrouver et la recharger SANS toucher aux vraies données.
import type { CashEntry, ChatGroup, ChatMessage, Client, ClientContract, Invoice, InvoiceLine, NewsPost, PostSession, SalaryAdvanceRequest } from '../types';
import { assignNumbers, cleanEntry, type Entry } from '../utils/accounting';
import { buildEntries } from '../utils/accountingEntries';
import { addDays, billableMissions, formatNumber, invoiceTotals, proposeLines } from '../utils/invoices';
import { workingDays, type Leave } from '../utils/leaves';
import { mondayOf, planAddDays, type Shift } from '../utils/planning';

export const SIM_PREFIX = 'sim-';
export const SIM_DAYS = 60; // la simulation couvre environ les 60 derniers jours (2 mois ; début au 1er du mois si le premier mois n'a plus que quelques jours)
export const SIM_PAY_PER_MISSION = 5000; // Ar versés à l'opérateur par mission validée
/** Prix facturés au client, par type de mission (les types sans prix propre prennent le prix par défaut). Aucun prix propre à un client : factures et Finances donnent ainsi le même chiffre. */
export const SIM_PRICES = { client_price_default_ar: 8000, client_prices_by_type: { 'CONTRÔLE QUALITÉ': 10000, 'WEB': 13000, 'ADMINISTRATIF': 9000, 'AIDE': 7000 } as Record<string, number> };
export const SIM_BUDGETS: Record<string, number> = { Loyer: 25000, Internet: 12000, Achats: 9000, Transport: 8000 };
export const SIM_MONTHLY_PLAN = { revenue_ar: 2000000, payroll_ar: 1100000 };

/** `monthly` : missions validées visées par mois (le niveau de performance : ~84 Top, ~64 Excellent, ~44 Standard, ~24 À suivre). Chaque jour travaillé compte de 1 à 5 missions. */
export interface SimOperator { id: string; name: string; username: string; shift: 'day' | 'night'; monthly?: number }
export const SIM_DAY_MAX = 5;
export const SIM_OPERATORS: SimOperator[] = [
  { id: 'sim-op1', name: 'Hanitra Rasoamanana', username: 'hanitra', shift: 'day', monthly: 84 },
  { id: 'sim-op2', name: 'Mamy Randrianasolo', username: 'mamy', shift: 'day', monthly: 64 },
  { id: 'sim-op3', name: 'Fidy Rakotoarisoa', username: 'fidy', shift: 'night', monthly: 44 },
  { id: 'sim-op4', name: 'Lalaina Ravelona', username: 'lalaina', shift: 'night', monthly: 24 },
];
export interface SimOptions { today: string; adminId?: string; adminName?: string; operators?: SimOperator[]; /** Jours de travail (0 = dimanche … 6 = samedi) ; par défaut lundi à samedi. La simulation ne met aucune mission les autres jours. */ workDays?: number[] }

export interface SimData {
  today: string; start: string; adminId: string; operators: SimOperator[];
  clients: Client[]; contracts: ClientContract[]; posts: PostSession[]; invoices: Invoice[]; cash: CashEntry[]; entries: Entry[];
  leaves: Leave[]; shifts: Shift[]; advances: SalaryAdvanceRequest[]; groups: ChatGroup[]; messages: ChatMessage[]; news: NewsPost[];
  /** Réglages à poser avec la simulation (prix, plan du mois, budgets). Rien d'autre : jamais les conditions de l'entreprise. */
  settings: { price_per_mission: number; client_price_default_ar: number; client_prices_by_type: Record<string, number>; monthly_plan: { revenue_ar: number; payroll_ar: number }; budgets: Record<string, number> };
}

// ---------- dates (calcul en UTC sur du texte « AAAA-MM-JJ » : le résultat ne dépend ni du fuseau ni de l'heure de la machine) ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const utc = (d: string): Date => new Date(`${d}T00:00:00Z`);
const ymd = (x: Date): string => x.toISOString().slice(0, 10);
const shift = (d: string, n: number): string => ymd(new Date(utc(d).getTime() + n * 86400000));
const dow = (d: string): number => utc(d).getUTCDay(); // 0 = dimanche
const pad = (n: number): string => String(n).padStart(2, '0');
const monthOf = (d: string): string => d.slice(0, 7);
const firstOf = (m: string): string => `${m}-01`;
const lastOf = (m: string): string => { const [y, mo] = m.split('-').map(Number); return ymd(new Date(Date.UTC(y, mo, 0))); };
const nextMonth = (m: string): string => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`; };
const prevMonth = (m: string): string => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`; };
/** Heure de Madagascar (UTC+3) écrite en ISO : « 2026-10-28 » + 9 h → 06:00 UTC. */
const iso = (d: string, h = 9, m = 0): string => new Date(`${d}T${pad(h)}:${pad(m)}:00+03:00`).toISOString();
const round500 = (v: number): number => Math.round(v / 500) * 500;
const round1000 = (v: number): number => Math.round(v / 1000) * 1000;

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const seedOf = (today: string): number => 20261028 + Number(today.replace(/-/g, '')) % 100003;

// ---------- clients et missions (2 clients, 10 missions différentes) ----------
const CLIENTS: { id: string; name: string; contact: string; phone: string; terms: number; note: string }[] = [
  { id: 'sim-cl1', name: 'Cabinet Fanamby', contact: 'Mme Fanamby', phone: '034 00 100 01', terms: 30, note: 'Cabinet de conseil : saisies, contrôle qualité et classement. Paie à 30 jours.' },
  { id: 'sim-cl2', name: 'Boutique Maharavo', contact: 'M. Maharavo', phone: '034 00 100 02', terms: 15, note: 'Boutique en ligne : catalogue, commandes et relation client. Paie à 15 jours.' },
];
const MISSIONS: { title: string; type: string; client: string; desc: string; unit: string }[] = [
  { title: 'Saisie des fiches patients du lot 14', type: 'SAISIE DE FICHES', client: 'sim-cl1', desc: 'Saisir les fiches papier dans le logiciel du cabinet. Vérifier le numéro de dossier.', unit: 'fiches' },
  { title: 'Saisie des factures fournisseurs', type: 'SAISIE DE FICHES', client: 'sim-cl1', desc: 'Reporter montant, date et fournisseur de chaque facture.', unit: 'factures' },
  { title: 'Relecture des dossiers du lot 9', type: 'CONTRÔLE QUALITÉ', client: 'sim-cl1', desc: 'Relire un échantillon de 30 dossiers et noter les erreurs.', unit: 'dossiers' },
  { title: 'Classement des dossiers du personnel', type: 'ADMINISTRATIF', client: 'sim-cl1', desc: 'Classer et numéroter les dossiers du personnel.', unit: 'dossiers' },
  { title: 'Préparation des courriers du mois', type: 'ADMINISTRATIF', client: 'sim-cl1', desc: 'Imprimer, plier et ranger les courriers par service.', unit: 'courriers' },
  { title: 'Mise à jour du catalogue en ligne', type: 'WEB', client: 'sim-cl2', desc: 'Corriger les prix et les descriptions des produits de la boutique.', unit: 'produits' },
  { title: 'Vérification des liens et des prix du site', type: 'WEB', client: 'sim-cl2', desc: 'Tester les liens du site et signaler ceux qui sont cassés.', unit: 'pages' },
  { title: 'Contrôle des commandes de la semaine', type: 'CONTRÔLE QUALITÉ', client: 'sim-cl2', desc: 'Vérifier adresse, produits et montant de chaque commande.', unit: 'commandes' },
  { title: 'Réponses aux questions des clients', type: 'AIDE', client: 'sim-cl2', desc: 'Répondre aux messages des clients de la boutique (support niveau 1).', unit: 'messages' },
  { title: 'Saisie des bons de livraison', type: 'SAISIE DE FICHES', client: 'sim-cl2', desc: 'Saisir les bons de livraison de la semaine.', unit: 'bons' },
];
const REJECT_REASONS = ['Capture illisible, merci de renvoyer.', 'Il manque le numéro de dossier sur plusieurs lignes.', 'Quantité annoncée différente de la preuve.'];

export function buildSimulation(opts: SimOptions): SimData {
  if (!opts || !DATE_RE.test(opts.today)) throw new Error('La simulation demande une date « AAAA-MM-JJ ».');
  const today = opts.today;
  // Début : il y a 60 jours, mais jamais au milieu d'un mois presque fini (un mois de 2 jours ne ferait qu'une facture ridicule) : on passe alors au 1er du mois suivant.
  let start = shift(today, -(SIM_DAYS - 1));
  if (Number(lastOf(monthOf(start)).slice(8)) - Number(start.slice(8)) < 9) start = firstOf(nextMonth(monthOf(start)));
  const wdays = opts.workDays && opts.workDays.length ? opts.workDays : [1, 2, 3, 4, 5, 6];
  const isWd = (d: string): boolean => wdays.includes(dow(d));
  const adminId = opts.adminId || 'admin', adminName = opts.adminName || 'Responsable';
  const operators = (opts.operators && opts.operators.length ? opts.operators : SIM_OPERATORS).map(o => ({ ...o }));
  const r = rng(seedOf(today));
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];

  // ----- Clients -----
  const clients: Client[] = CLIENTS.map(c => ({ id: c.id, name: c.name, contact_name: c.contact, phone: c.phone, email: '', address: '', note: c.note, active: true, payment_terms_days: c.terms, created_by: adminId, created_at: iso(start, 9), updated_at: iso(start, 9) }));
  const clientOf = (id: string): Client => clients.find(c => c.id === id)!;

  // ----- Missions du tableau (10) -----
  const contracts: ClientContract[] = MISSIONS.map((m, i) => ({
    id: `sim-c${i + 1}`, post_number: i + 1, client_name: m.title, account_tag: '', game_mode: '', description: m.desc, post_type: m.type, proof_mode: 'type', no_account: false,
    current_rank: '—', target_rank: '—', initial_score: 0, current_score: 0, target_score: 0, recommended_shift: 'any', estimated_reward_ar: SIM_PAY_PER_MISSION,
    priority: i % 5 === 0 ? 'Urgente' : 'Normale', region_server: '', client_id: m.client,
  }));

  // ----- Congés (décrits ici pour que personne ne travaille un jour de congé accepté) : un à venir (planning), deux passés dont une maladie, un en attente -----
  const opAt = (i: number): SimOperator | undefined => operators[Math.min(i, operators.length - 1)];
  const leaveSpecs: { id: string; op: SimOperator | undefined; type: Leave['type']; from: number; len: number; status: Leave['status']; reason: string }[] = [
    { id: 'sim-lv1', op: operators[0], type: 'paid', from: 9, len: 3, status: 'approved', reason: 'Voyage en famille' },
    { id: 'sim-lv2', op: opAt(2), type: 'sick', from: -25, len: 2, status: 'approved', reason: 'Grippe' },
    { id: 'sim-lv3', op: operators[1], type: 'paid', from: 16, len: 2, status: 'pending', reason: 'Mariage d\'un cousin' },
    { id: 'sim-lv4', op: opAt(3), type: 'paid', from: -13, len: 2, status: 'approved', reason: 'Démarches familiales' },
  ];
  // Un congé commence et finit un jour de travail (jamais seulement le week-end) : on recule la fin / avance le début jusqu'à un jour de travail
  const leaveSpan = (l: { from: number; len: number }): [string, string] => {
    let a = shift(today, l.from), b = shift(today, l.from + l.len - 1);
    while (!isWd(a)) a = shift(a, 1);
    while (b > a && !isWd(b)) b = shift(b, -1);
    return [a, b < a ? a : b];
  };
  const onApprovedLeave = (opId: string, date: string): boolean => leaveSpecs.some(l => { const [a, b] = leaveSpan(l); return l.status === 'approved' && l.op?.id === opId && date >= a && date <= b; });

  // ----- Missions faites par les opérateurs : 60 jours, jamais le dimanche, ~9 % refusées -----
  const posts: PostSession[] = [];
  let n = 0;
  // Heure de début : la plupart du temps à l'heure (de 15 min avant à 10 min après l'heure de la vacation, sous la tolérance de 15 min du site) ; environ 3 % de jours avec un retard
  const startAt = (op: SimOperator, late: boolean): [number, number] => {
    const base = (op.shift === 'day' ? 8 : 20) * 60, minutes = base + (late ? 20 + Math.floor(r() * 25) : -15 + Math.floor(r() * 26));
    return [Math.floor(minutes / 60), minutes % 60];
  };
  const mk = (op: SimOperator, mi: number, date: string, _k: number, status: PostSession['status'], qty: number, late = false, atH?: number, atM?: number): PostSession => {
    const m = MISSIONS[mi];
    const [startH, startM] = atH === undefined ? startAt(op, late) : [atH, atM as number];
    const endMin = startH * 60 + startM + 30 + Math.floor(r() * 71);
    const endH = Math.floor(endMin / 60) % 24, endM = endMin % 60;
    const decided = status === 'completed' || status === 'rejected';
    n++;
    return {
      id: `sim-p${n}`, employee_id: op.id, employee_name: op.name, client_name: m.title, client_id: m.client, post_number: mi + 1, account_tag: '', target_score: qty, initial_score: 0,
      current_score: status === 'active' || status === 'pending_start' ? 0 : qty, ...(decided || status === 'pending_end' ? { final_score: qty } : {}),
      remaining_score: status === 'active' || status === 'pending_start' ? qty : 0, status, shift_type: op.shift, date,
      start_time: `${pad(startH)}:${pad(startM)}:00`, ...(decided || status === 'pending_end' ? { end_time: `${pad(endH)}:${pad(endM)}:00` } : {}),
      start_proof_url: '', end_proof_url: '', calculated_ar: status === 'completed' ? SIM_PAY_PER_MISSION : 0,
      ...(status === 'rejected' ? { rejection_reason: pick(REJECT_REASONS) } : {}), notes: decided || status === 'pending_end' ? `${qty} ${m.unit} traités` : '',
      created_at: iso(date, startH % 24, startM), updated_at: iso(date, (startH + 2) % 24, endM),
    } as PostSession;
  };
  // Chaque mois et chaque opérateur : `monthly` missions validées, réparties sur les jours de travail, de 1 à 5 par jour (quelques jours sans mission). Le mois en cours compte presque tout son objectif (il finit dans 1 à 2 jours).
  const months: string[] = [];
  for (let m = monthOf(start); m <= monthOf(today); m = nextMonth(m)) months.push(m);
  for (const month of months) {
    const from = start > firstOf(month) ? start : firstOf(month), to = lastOf(month);
    const monthDays: string[] = [];
    for (let d = firstOf(month); d <= to; d = shift(d, 1)) if (isWd(d)) monthDays.push(d);
    const upTo = shift(today, -1);
    for (const op of operators) {
      const days = monthDays.filter(d => d >= from && d <= upTo && !onApprovedLeave(op.id, d));
      if (!days.length) continue;
      const share = Math.min(1, monthDays.filter(d => d >= from && d <= upTo).length / monthDays.length + 0.1); // jours écoulés du mois (les congés n'abaissent pas l'objectif : plus de missions les autres jours)
      const M = Math.min(days.length * SIM_DAY_MAX, Math.round((op.monthly ?? 40) * share));
      if (M <= 0) continue;
      const avg = Math.min(4.5, Math.max(1, M / (days.length * 0.8)));
      const A = Math.max(Math.ceil(M / SIM_DAY_MAX), Math.min(days.length, M, Math.round(M / avg)));
      const pool = [...days];
      const active: string[] = [];
      while (active.length < A) active.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      const perDay = new Map<string, number>(active.map(d => [d, 1]));
      for (let left = M - A; left > 0;) { const d = active[Math.floor(r() * active.length)]; if ((perDay.get(d) as number) < SIM_DAY_MAX) { perDay.set(d, (perDay.get(d) as number) + 1); left--; } }
      for (const date of active.sort()) {
        const k = perDay.get(date) as number;
        const extraRejected = k < SIM_DAY_MAX && r() < 0.06; // de temps en temps une mission refusée en plus (elle ne compte pas dans le niveau)
        let [h, mi] = startAt(op, r() < 0.03);
        for (let q = 0; q < k + (extraRejected ? 1 : 0); q++) {
          const rejected = extraRejected && q === k;
          const p = mk(op, Math.floor(r() * MISSIONS.length), date, 0, rejected ? 'rejected' : 'completed', 20 + Math.floor(r() * 70), false, h, mi);
          posts.push(p);
          // La mission suivante commence un peu après la fin de celle-ci (durée de 30 à 100 minutes, pause de 5 à 20 minutes)
          const total = h * 60 + mi + 30 + Math.floor(r() * 71) + 5 + Math.floor(r() * 16);
          h = Math.floor(total / 60) % 24; mi = total % 60;
        }
      }
    }
  }
  // Aujourd'hui : une mission en cours, une à valider, une qui demande à démarrer (le circuit de validation est visible)
  const live: [number, number, PostSession['status']][] = [[0, 0, 'active'], [1, 5, 'pending_end'], [operators.length - 1, 8, 'pending_start']];
  live.forEach(([who, mi, status], i) => { if (isWd(today) && operators[who]) posts.push(mk(operators[who], mi, today, i, status, 40)); });

  // ----- Argent : dépenses mensuelles + paiements des factures (ci-dessous) -----
  const cash: CashEntry[] = [];
  let cn = 0;
  const addCash = (kind: 'in' | 'out', category: string, amount: number, date: string, note: string, extra: Partial<CashEntry> = {}): CashEntry | null => {
    if (date > today || date < start || amount < 1) return null; // jamais dans le futur, jamais avant le début de la simulation
    cn++;
    const e: CashEntry = { id: `sim-cash${cn}`, kind, category, amount_ar: Math.round(amount), date, note, created_by: adminId, created_at: iso(date, 9), updated_at: iso(date, 9), ...extra };
    cash.push(e);
    return e;
  };
  for (let m = monthOf(start); m <= monthOf(today); m = nextMonth(m)) {
    addCash('out', 'Loyer', 25000, `${m}-05`, 'Local du mois');
    addCash('out', 'Internet', 12000, `${m}-08`, 'Abonnement du mois');
    addCash('out', 'Achats', round500(6000 + r() * 3000), `${m}-${pad(10 + Math.floor(r() * 7))}`, 'Fournitures de bureau');
    addCash('out', 'Transport', round500(4000 + r() * 4000), `${m}-${pad(15 + Math.floor(r() * 10))}`, 'Déplacements de l\'équipe');
  }
  addCash('out', 'Matériel', 35000, `${prevMonth(monthOf(today))}-18`, 'Deux casques audio');

  // ----- Factures : une par client et par mois fini (les missions du mois, au prix du site), émise le 2 du mois suivant -----
  const invoices: Invoice[] = [];
  const counters = new Map<string, number>();
  const issuer = { name: 'Entreprise (simulation)', address: 'Antananarivo', phone: '', email: '' };
  const lineOf = (i: number, d: string, qty: number, unit: number, refs?: string[]): InvoiceLine => ({ id: `l${i + 1}`, description: d, qty, unit_price_ar: unit, total_ar: Math.round(qty * unit), ...(refs && refs.length ? { refs } : {}) });
  const party = (c: Client) => ({ name: c.name, contact_name: c.contact_name, phone: c.phone });
  const monthsToBill: string[] = [];
  for (let m = monthOf(start); m < monthOf(today); m = nextMonth(m)) monthsToBill.push(m);
  let invN = 0;
  for (const m of monthsToBill) {
    for (const c of clients) {
      const issue = `${nextMonth(m)}-02`;
      if (issue > today) continue; // pas encore émise : les missions restent « à facturer »
      const range = { start: firstOf(m) < start ? start : firstOf(m), end: lastOf(m) };
      const ms = billableMissions(posts, contracts, c, SIM_PRICES, invoices, range);
      if (!ms.length) continue;
      const lines = proposeLines(ms).map((l, i) => lineOf(i, String(l.description), Number(l.qty), Number(l.unit_price), l.refs));
      const t = invoiceTotals(lines, false, 0);
      invN++;
      invoices.push({ id: `sim-inv${invN}`, type: 'invoice', status: 'issued', client_id: c.id, client: party(c), issuer, issue_date: issue, due_date: addDays(issue, c.payment_terms_days || 30), lines, ...t, created_by: adminId, created_at: iso(issue, 9), updated_at: iso(issue, 9), issued_at: iso(issue, 9) });
    }
  }
  // Brouillon : les missions du mois en cours déjà validées pour le premier client (rien n'est émis tant que le responsable ne l'a pas décidé)
  {
    const c = clients[0], ms = billableMissions(posts, contracts, c, SIM_PRICES, invoices, { start: firstOf(monthOf(today)) < start ? start : firstOf(monthOf(today)), end: today });
    if (ms.length) {
      const lines = proposeLines(ms).map((l, i) => lineOf(i, String(l.description), Number(l.qty), Number(l.unit_price), l.refs));
      invN++;
      invoices.push({ id: `sim-inv${invN}`, type: 'invoice', status: 'draft', client_id: c.id, client: party(c), issue_date: today, due_date: addDays(today, c.payment_terms_days || 30), lines, ...invoiceTotals(lines, false, 0), created_by: adminId, created_at: iso(today, 9), updated_at: iso(today, 9) });
    }
  }
  // Numéros dans l'ordre des dates (le numéro suit l'émission), un compteur par année
  for (const v of invoices.filter(x => x.status === 'issued').sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id))) {
    const y = Number(v.issue_date.slice(0, 4)), key = `FA-${y}`, k = (counters.get(key) || 0) + 1; counters.set(key, k); v.number = formatNumber('FA-', y, k);
  }
  // Paiements : les factures des mois anciens sont payées ; le premier client paie le mois dernier en entier, le second à moitié (une créance reste à relancer)
  const payInvoice = (inv: Invoice, days: number, share: number, method: string): void => {
    const date = addDays(inv.issue_date, days), amount = share >= 1 ? inv.total_ar : round1000(inv.total_ar * share);
    addCash('in', 'Paiement client', amount, date, `Paiement de la facture ${inv.number}`, { client_name: inv.client.name, invoice_id: inv.id, payment_method: method });
  };
  const issued = invoices.filter(i => i.status === 'issued');
  const lastBilled = monthsToBill[monthsToBill.length - 1];
  for (const inv of issued) {
    const old = monthOf(addDays(inv.issue_date, -2)) !== lastBilled;
    if (old) payInvoice(inv, 12, 1, inv.client_id === 'sim-cl1' ? 'Virement' : 'Mobile money');
    else if (inv.client_id === 'sim-cl1') payInvoice(inv, 10, 1, 'Virement');
    else payInvoice(inv, 12, 0.5, 'Mobile money');
  }
  // Reçus numérotés dans l'ordre des dates, un compteur par année
  const rc = new Map<string, number>();
  for (const e of cash.filter(x => x.invoice_id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const y = Number(e.date.slice(0, 4)), k = (rc.get(String(y)) || 0) + 1; rc.set(String(y), k); e.receipt_no = formatNumber('RC-', y, k);
  }
  cash.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  // ----- Avances sur salaire -----
  const advances: SalaryAdvanceRequest[] = [];
  const o1 = operators[0], o3 = operators[Math.min(2, operators.length - 1)];
  if (o1) advances.push({ id: 'sim-a1', employee_id: o1.id, employee_name: o1.name, amount_ar: 30000, reason: 'Frais de transport du mois', request_date: shift(today, -30), status: 'approved' });
  if (o3) advances.push({ id: 'sim-a2', employee_id: o3.id, employee_name: o3.name, amount_ar: 20000, reason: 'Connexion internet', request_date: shift(today, -2), status: 'pending' });

  // ----- Écritures comptables : ce que « Générer les écritures » produit avec ces factures, cet argent et ces avances, plus un capital saisi à la main -----
  const built = buildEntries({ invoices, cash, slips: [], advances }).entries;
  const cap = cleanEntry({ id: 'je-manual-sim-capital', date: start, journal: 'OD', label: 'Capital de départ (simulation)', lines: [{ account: '512', debit: 3000000, credit: 0 }, { account: '531', debit: 300000, credit: 0 }, { account: '101', debit: 0, credit: 3300000 }], source: { type: 'manual', id: 'sim-capital' } }); // la caisse (531) reçoit des espèces au départ : sans elles, les dépenses payées en espèces la rendraient négative
  const entries = assignNumbers(cap.ok ? [...built, cap.entry] : built, []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  // ----- Congés : créés depuis les spécifications ci-dessus -----
  const leaves: Leave[] = [];
  for (const l of leaveSpecs) {
    if (!l.op) continue;
    const [s0, e0] = leaveSpan(l), asked = iso(shift(today, l.status === 'pending' ? -1 : Math.min(l.from, 0) - 3), 10);
    leaves.push({ id: l.id, employee_id: l.op.id, employee_name: l.op.name, type: l.type, start_date: s0, end_date: e0, days: workingDays(s0, e0, 5), status: l.status, reason: l.reason, created_by: l.op.id, created_at: asked, updated_at: asked,
      ...(l.status === 'approved' ? { decided_by: adminId, decided_at: iso(shift(today, -2), 11) } : {}) });
  }

  // ----- Planning : cette semaine et la suivante (lundi à vendredi sur la vacation de chacun, week-end en repos, repos pendant un congé accepté) -----
  const shifts: Shift[] = [];
  const monday = mondayOf(today), at = iso(shift(today, -1), 10);
  const onLeave = (opId: string, d: string): boolean => leaves.some(l => l.status === 'approved' && l.employee_id === opId && d >= l.start_date && d <= l.end_date);
  for (const op of operators) {
    for (let i = 0; i < 14; i++) {
      const date = planAddDays(monday, i), d = i % 7;
      const kind: Shift['kind'] = d >= 5 || onLeave(op.id, date) ? 'off' : op.shift === 'night' ? 'night' : 'day';
      shifts.push({ id: `sh-${op.id}-${date.replace(/-/g, '')}`, employee_id: op.id, date, kind, created_at: at, updated_at: at, updated_by: adminId });
    }
  }

  // ----- Messagerie et actualités -----
  const GROUP = 'sim-grp-equipe';
  const groups: ChatGroup[] = [{ id: GROUP, name: 'Équipe saisie', owner_id: adminId, members: [adminId, ...operators.map(o => o.id)], description: 'Questions et annonces sur les missions de la semaine.', created_at: iso(start, 9) }];
  const msg = (id: string, from: string, fromName: string, role: 'admin' | 'employee', to: string, text: string, ts: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id, sender_id: from, sender_name: fromName, sender_role: role, recipient_id: to, message: text, timestamp: ts, sent_ms: new Date(ts).getTime(), ...extra });
  const t = (back: number, h: number, mi: number): string => iso(shift(today, -back), h, mi);
  const a = (id: string, to: string, text: string, ts: string, extra: Partial<ChatMessage> = {}) => msg(id, adminId, adminName, 'admin', to, text, ts, extra);
  const e = (id: string, op: SimOperator, to: string, text: string, ts: string, extra: Partial<ChatMessage> = {}) => msg(id, op.id, op.name, 'employee', to, text, ts, extra);
  const opA = operators[0], opB = operators[1] || operators[0], opC = operators[Math.min(2, operators.length - 1)];
  const messages: ChatMessage[] = [
    a('sim-m1', 'all', 'Bonjour à tous. Les nouvelles missions de la semaine sont dans le tableau. Pensez à joindre une preuve au début et à la fin.', t(2, 8, 5), { pinned: true, pinned_at: t(2, 8, 6) }),
    e('sim-m2', opB, 'all', 'Bien reçu, merci !', t(2, 8, 20), { reactions: { '👍': [adminId, opA.id] } }),
    a('sim-m3', GROUP, 'Les saisies du lot 14 sont prioritaires cette semaine (Cabinet Fanamby).', t(1, 9, 30)),
    e('sim-m4', opA, GROUP, 'Le lot 14 est presque terminé, j\'envoie la fin de mission cet après-midi.', t(1, 10, 12)),
    a('sim-m5', GROUP, 'Très bien. Je valide dès que c\'est envoyé.', t(1, 10, 20), { reply_to: { id: 'sim-m4', sender_name: opA.name, text: 'Le lot 14 est presque terminé, j\'envoie la fin de mission cet après-midi.' } }),
    e('sim-m6', opC, adminId, 'Bonjour, est-ce que je peux prendre la mission « Réponses aux questions des clients » cette nuit ?', t(0, 7, 2)),
    a('sim-m7', opC.id, 'Oui, elle est pour toi. Bon courage !', t(0, 7, 8)),
  ];
  const news: NewsPost[] = [
    { id: 'sim-n1', author_id: adminId, author_name: adminName, author_role: 'admin', title: 'Nouvelle règle de justificatif', text: 'À partir de lundi, une capture de l\'écran du logiciel est demandée à la fin de chaque mission.', created_at: t(10, 9, 0), pinned: true, loves: [opA.id, opB.id], comments: [], shares: 0 } as NewsPost,
    { id: 'sim-n2', author_id: adminId, author_name: adminName, author_role: 'admin', title: 'Objectif du mois presque atteint', text: 'Bravo à toute l\'équipe : le volume de missions validées est au niveau de l\'objectif du mois.', created_at: t(3, 16, 30), pinned: false, loves: [opC.id], comments: [], shares: 0 } as NewsPost,
  ];

  return {
    today, start, adminId, operators, clients, contracts, posts, invoices, cash, entries, leaves, shifts, advances, groups, messages, news,
    settings: { price_per_mission: SIM_PAY_PER_MISSION, ...SIM_PRICES, monthly_plan: { ...SIM_MONTHLY_PLAN }, budgets: { ...SIM_BUDGETS } },
  };
}

/** Vrai pour une ligne créée par la simulation (identifiant « sim-… »). */
export const isSimId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(SIM_PREFIX);
/** Le planning a un identifiant imposé par le site (`sh-<salarié>-<date>`) : il appartient à la simulation si son salarié en fait partie. */
export const isSimShift = (s: { employee_id?: unknown }, operators: { id: string }[]): boolean => typeof s.employee_id === 'string' && operators.some(o => o.id === s.employee_id);
