// Types de travail, modes de paie et modèles d'entreprise (module 26, M26.2) : règles pures, SANS écran, SANS serveur, SANS réseau, SANS horloge.
// Pourquoi : le site doit s'adapter à toute entreprise (boutique, atelier, sécurité, ménage, restaurant, livraison, chantier, bureau…), y compris du travail fait SANS réseau et saisi par quelqu'un d'autre.
// Un « type de travail » = 3 réglages : COMMENT on le mesure (preuves, présence, quantité, tâches, rien), COMMENT on le paie (par mission, jour, heure, pièce, salaire fixe), QUI le saisit (l'employé, le chef d'équipe, le responsable, papier puis saisie).
// Le mode par défaut reste « par mission » : ce qui existe aujourd'hui ne change pas tant que le responsable ne choisit pas autre chose.
// Contrôlé par : npm run check:work-types. Les écrans et le serveur (calcul réel de la paie) viennent dans les étapes suivantes (M25.3 et après).
import type { Bi } from './siteSnapshot';

const b = (fr: string, en: string): Bi => ({ fr, en });

export const MEASURES = ['proof', 'presence', 'quantity', 'tasks', 'none'] as const;
export type Measure = typeof MEASURES[number];
export const PAY_MODES = ['mission', 'day', 'hour', 'piece', 'fixed'] as const;
export type PayMode = typeof PAY_MODES[number];
export const ENTRY_BY = ['employee', 'team_lead', 'admin', 'paper'] as const;
export type EntryBy = typeof ENTRY_BY[number];

export const MEASURE_LABEL: Record<Measure, Bi> = {
  proof: b('des preuves (photos) et une validation', 'proofs (photos) and a validation'),
  presence: b('la présence (arrivée et départ)', 'presence (arrival and departure)'),
  quantity: b('la quantité produite', 'the quantity produced'),
  tasks: b('des tâches faites ou non', 'tasks done or not'),
  none: b('rien (salaire fixe)', 'nothing (fixed salary)'),
};
export const PAY_LABEL: Record<PayMode, Bi> = {
  mission: b('par mission', 'per mission'), day: b('par jour', 'per day'), hour: b('par heure', 'per hour'), piece: b('par boîte ou pièce', 'per box or piece'), fixed: b('salaire fixe', 'fixed salary'),
};
export const ENTRY_LABEL: Record<EntryBy, Bi> = {
  employee: b('l\'employé, sur son appli', 'the employee, in the app'), team_lead: b('le chef d\'équipe', 'the team lead'), admin: b('le responsable', 'the manager'), paper: b('une feuille papier, saisie ensuite', 'a paper sheet, entered afterwards'),
};

export const DEFAULT_PAY_MODE: PayMode = 'mission';
export const isMeasure = (v: unknown): v is Measure => typeof v === 'string' && (MEASURES as readonly string[]).includes(v);
export const isPayMode = (v: unknown): v is PayMode => typeof v === 'string' && (PAY_MODES as readonly string[]).includes(v);
export const isEntryBy = (v: unknown): v is EntryBy => typeof v === 'string' && (ENTRY_BY as readonly string[]).includes(v);

// ---------- Limites (une valeur absurde est refusée, jamais « corrigée » en silence) ----------
export const MAX_QTY = 100000; // boîtes ou pièces pour une personne et une journée
export const MAX_RATE_AR = 100000000; // 100 millions d'Ar : un prix ou un salaire plus grand est une faute de frappe
export const MAX_HOURS_PER_DAY = 24;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lit un nombre tapé à la main : « 12 500 », « 12,5 », 12.5. Refuse le texte, le négatif, l'infini, l'écriture scientifique (« 1e3 ») et ce qui dépasse `max`. Deux décimales au plus. */
export function cleanNumber(v: unknown, max: number): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null; // chiffres seulement : pas de signe, pas de « e », pas de texte
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return round2(n);
}
export const cleanQty = (v: unknown): number | null => cleanNumber(v, MAX_QTY);
export const cleanRate = (v: unknown): number | null => cleanNumber(v, MAX_RATE_AR);

/** Heure « HH:MM » ou « HH:MM:SS » valide, sinon null. */
export const cleanTime = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : null);

/** Heures entre deux heures du même jour ; si la fin est avant le début, le travail a passé minuit (nuit). Début = fin → 0 h (jamais 24 h). Une heure fausse → null. */
export function hoursBetween(start: unknown, end: unknown): number | null {
  const s = cleanTime(start), e = cleanTime(end);
  if (!s || !e) return null;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let d = m(e) - m(s);
  if (d < 0) d += 24 * 60;
  const h = round2(d / 60);
  return h > MAX_HOURS_PER_DAY ? null : h;
}

// ---------- Présence ----------
export type Presence = 'present' | 'late' | 'half' | 'absent';
export const PRESENCE_VALUES: Presence[] = ['present', 'late', 'half', 'absent'];
/** Une journée compte : présent 1, en retard 1, demi-journée 0,5, absent 0. Une valeur inconnue ne compte rien (jamais de paie inventée). */
export const PRESENCE_FRACTION: Record<Presence, number> = { present: 1, late: 1, half: 0.5, absent: 0 };
export const dayFraction = (p: unknown): number => (typeof p === 'string' && (PRESENCE_VALUES as string[]).includes(p) ? PRESENCE_FRACTION[p as Presence] : 0);
export const PRESENCE_LABEL: Record<Presence, Bi> = { present: b('Présent', 'Present'), late: b('En retard', 'Late'), half: b('Demi-journée', 'Half day'), absent: b('Absent', 'Absent') };

// ---------- Calcul du montant ----------
export interface PayData {
  missions?: number; // missions validées (par mission)
  days?: number; // jours comptés, en fractions (par jour) ; voir dayFraction
  hours?: number; // heures travaillées (par heure)
  pieces?: number; // pièces ou boîtes faites (par pièce)
  rejected?: number; // pièces refusées ou abîmées : elles ne sont pas payées
  periodShare?: number; // part de la période pour un salaire fixe : mois = 1, quinzaine = 0,5
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
/** Pièces payées = pièces faites − pièces refusées (jamais négatif ; on ne peut pas refuser plus que ce qu'on a fait). */
export const acceptedPieces = (pieces: unknown, rejected: unknown): number => Math.max(0, num(pieces) - Math.min(num(rejected), num(pieces)));
/** Montant en Ar, arrondi à l'Ar, jamais négatif, jamais NaN. Un tarif ou une quantité absurde donne 0 (et c'est le contrôle de saisie qui l'a déjà refusé). */
export function payAmount(mode: PayMode, rate: unknown, d: PayData): number {
  const r = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= MAX_RATE_AR ? rate : 0;
  const units = mode === 'mission' ? num(d.missions) : mode === 'day' ? num(d.days) : mode === 'hour' ? num(d.hours) : mode === 'piece' ? acceptedPieces(d.pieces, d.rejected) : num(d.periodShare);
  const amount = Math.round(units * r);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** Le mode de paie d'un employé : le sien s'il en a un (valide), sinon celui de l'entreprise (valide), sinon « par mission » (ce qui existe aujourd'hui). */
export const resolvePayMode = (employeeMode: unknown, companyMode: unknown): PayMode => (isPayMode(employeeMode) ? employeeMode : isPayMode(companyMode) ? companyMode : DEFAULT_PAY_MODE);

// ---------- Un type de travail ----------
export interface WorkType { id: string; name: Bi; measure: Measure; pay: PayMode; entry: EntryBy[]; unit?: Bi }

/** Ce qui va ensemble : une quantité se paie à la pièce ; la présence se paie au jour ou à l'heure ; des preuves ou des tâches se paient à la mission ; un salaire fixe va avec tout. */
export function compatible(measure: Measure, pay: PayMode): boolean {
  if (pay === 'fixed') return true;
  if (pay === 'piece') return measure === 'quantity';
  if (pay === 'day' || pay === 'hour') return measure === 'presence';
  return measure === 'proof' || measure === 'tasks'; // mission
}
const cleanText = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export type WorkTypeCheck = { ok: true; value: WorkType } | { ok: false; error: 'id' | 'name' | 'measure' | 'pay' | 'entry' | 'unit' | 'incompatible' };
/** Vérifie (et nettoie) un type de travail créé à la main. L'erreur dit quel champ est faux : l'écran peut l'afficher. */
export function validateWorkType(x: any): WorkTypeCheck {
  if (!x || typeof x !== 'object') return { ok: false, error: 'id' };
  const id = typeof x.id === 'string' ? x.id.trim() : '';
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(id)) return { ok: false, error: 'id' };
  const fr = cleanText(x.name?.fr, 60), en = cleanText(x.name?.en, 60);
  if (!fr || !en) return { ok: false, error: 'name' };
  if (!isMeasure(x.measure)) return { ok: false, error: 'measure' };
  if (!isPayMode(x.pay)) return { ok: false, error: 'pay' };
  const entry = Array.isArray(x.entry) ? [...new Set(x.entry.filter(isEntryBy))] as EntryBy[] : [];
  if (entry.length === 0 || entry.length > ENTRY_BY.length) return { ok: false, error: 'entry' };
  if (!compatible(x.measure, x.pay)) return { ok: false, error: 'incompatible' };
  const needsUnit = x.measure === 'quantity' || x.pay === 'piece';
  const ufr = cleanText(x.unit?.fr, 20), uen = cleanText(x.unit?.en, 20);
  if (needsUnit && (!ufr || !uen)) return { ok: false, error: 'unit' };
  return { ok: true, value: { id, name: { fr, en }, measure: x.measure, pay: x.pay, entry, ...(needsUnit ? { unit: { fr: ufr, en: uen } } : {}) } };
}

/** Une phrase claire pour l'écran : « Mesuré par la quantité produite (boîte), payé par boîte ou pièce, saisi par le chef d'équipe ». */
export function describeWorkType(t: WorkType): Bi {
  const unit = t.unit ? ` (${t.unit.fr})` : '', unitEn = t.unit ? ` (${t.unit.en})` : '';
  const who = t.entry.map(e => ENTRY_LABEL[e]);
  return b(`Mesuré par ${MEASURE_LABEL[t.measure].fr}${t.measure === 'quantity' ? unit : ''}, payé ${PAY_LABEL[t.pay].fr}, saisi par ${who.map(x => x.fr).join(' ou ')}.`,
    `Measured by ${MEASURE_LABEL[t.measure].en}${t.measure === 'quantity' ? unitEn : ''}, paid ${PAY_LABEL[t.pay].en}, entered by ${who.map(x => x.en).join(' or ')}.`);
}

// ---------- Modèles d'entreprise : un point de départ, tout reste modifiable ----------
export type MenuPreset = 'full' | 'boutique';
export interface BusinessModel { id: string; name: Bi; about: Bi; types: WorkType[]; menu: MenuPreset; work: Bi }
const T = (id: string, fr: string, en: string, measure: Measure, pay: PayMode, entry: EntryBy[], unit?: [string, string]): WorkType => ({ id, name: b(fr, en), measure, pay, entry, ...(unit ? { unit: b(unit[0], unit[1]) } : {}) });

/** `work` = le mot que l'écran emploie à la place de « mission » (course, service, commande…). `types` vide = « Autre » : le responsable crée les siens. */
export const BUSINESS_MODELS: BusinessModel[] = [
  { id: 'shop', name: b('Petite boutique', 'Small shop'), about: b('Vendeurs à salaire fixe ou à la journée ; stock, clients et caisse.', 'Sellers on a fixed salary or daily pay; stock, clients and cash.'), menu: 'boutique', work: b('journée', 'day'),
    types: [T('shop-day', 'Journée en boutique', 'Day in the shop', 'presence', 'day', ['admin']), T('shop-fixed', 'Salaire fixe', 'Fixed salary', 'none', 'fixed', ['admin'])] },
  { id: 'workshop', name: b('Atelier, chocolaterie, couture', 'Workshop, chocolate factory, sewing'), about: b('Fabrication payée à la pièce ; la quantité est comptée sur place, sans réseau.', 'Production paid per piece; the quantity is counted on site, without network.'), menu: 'full', work: b('production', 'production'),
    types: [T('prod-piece', 'Production à la pièce', 'Piece-rate production', 'quantity', 'piece', ['team_lead', 'paper'], ['boîte', 'box']), T('prod-day', 'Journée d\'atelier', 'Workshop day', 'presence', 'day', ['team_lead', 'paper'])] },
  { id: 'security', name: b('Sécurité, gardiennage', 'Security, guarding'), about: b('Postes avec preuves et validation, jour ou nuit (comme le site fonctionne aujourd\'hui).', 'Posts with proofs and validation, day or night (how the site works today).'), menu: 'full', work: b('mission', 'mission'),
    types: [T('guard-mission', 'Mission avec preuves', 'Mission with proofs', 'proof', 'mission', ['employee'])] },
  { id: 'cleaning', name: b('Ménage, services chez les clients', 'Cleaning, services at clients'), about: b('Interventions chez les clients, avec preuves, payées par mission.', 'Visits at clients, with proofs, paid per mission.'), menu: 'full', work: b('intervention', 'visit'),
    types: [T('service-visit', 'Intervention chez un client', 'Visit at a client', 'proof', 'mission', ['employee']), T('service-tasks', 'Tâches d\'entretien', 'Upkeep tasks', 'tasks', 'mission', ['employee', 'team_lead'])] },
  { id: 'restaurant', name: b('Restaurant, hôtel', 'Restaurant, hotel'), about: b('Équipes payées à la journée ou à l\'heure ; la présence est notée par le chef d\'équipe.', 'Teams paid by the day or hour; presence is noted by the team lead.'), menu: 'full', work: b('service', 'shift'),
    types: [T('rest-day', 'Journée de service', 'Service day', 'presence', 'day', ['team_lead']), T('rest-hour', 'Heures de service', 'Service hours', 'presence', 'hour', ['team_lead'])] },
  { id: 'delivery', name: b('Livraison, transport', 'Delivery, transport'), about: b('Courses avec preuve de livraison, payées à la course.', 'Runs with proof of delivery, paid per run.'), menu: 'full', work: b('course', 'run'),
    types: [T('delivery-run', 'Course avec preuve', 'Run with proof', 'proof', 'mission', ['employee'])] },
  { id: 'building', name: b('Chantier, bâtiment', 'Building site'), about: b('Journées de chantier, présence et tâches, notées par le chef de chantier.', 'Site days, presence and tasks, noted by the site lead.'), menu: 'full', work: b('journée', 'day'),
    types: [T('site-day', 'Journée de chantier', 'Site day', 'presence', 'day', ['team_lead', 'paper']), T('site-tasks', 'Tâches du chantier', 'Site tasks', 'tasks', 'mission', ['team_lead'])] },
  { id: 'office', name: b('Bureau, agence', 'Office, agency'), about: b('Salaire fixe ; suivi des tâches.', 'Fixed salary; task tracking.'), menu: 'full', work: b('tâche', 'task'),
    types: [T('office-fixed', 'Salaire fixe', 'Fixed salary', 'none', 'fixed', ['admin']), T('office-tasks', 'Tâches internes', 'Internal tasks', 'tasks', 'mission', ['employee'])] },
  { id: 'other', name: b('Autre (je crée mes types)', 'Other (I create my own types)'), about: b('Aucun type au départ : le responsable décrit son travail avec les 3 réglages.', 'No type at the start: the manager describes the work with the 3 settings.'), menu: 'full', work: b('travail', 'work'), types: [] },
];
export const findModel = (id: unknown): BusinessModel | undefined => BUSINESS_MODELS.find(m => m.id === id);
