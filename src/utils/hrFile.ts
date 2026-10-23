// Dossier du salarié (module 5, M5.1) : règles pures, sans écran ni serveur.
// Le dossier est gardé dans la fiche du compte (champ `hr` de `df_users`, pas de nouvelle table).
// Visible par l'admin et par le salarié concerné SEULEMENT (le serveur retire `hr` pour tout autre compte).
// `cleanHrFile` a une copie exacte dans le bloc HR de `supabase/functions/df-api/index.ts` : `npm run check:hr` compare les deux.
// IMPORTANT : la fonction ci-dessous ne doit pas utiliser d'import ni de constante hors du bloc « BEGIN HRCLEAN … END HRCLEAN ».

export type HrContract = 'permanent' | 'fixed' | 'trial' | 'intern' | 'freelance' | 'other';
export interface HrDocument { id: string; name: string; url: string; added_at?: string }
export interface HrRateChange { id: string; date: string; to_ar: number; from_ar?: number; reason?: string }
export interface HrFile {
  position?: string;
  hire_date?: string;
  contract_type?: HrContract;
  contract_end?: string;
  trial_end?: string;
  emergency?: { name?: string; phone?: string; relation?: string };
  documents?: HrDocument[];
  rate_history?: HrRateChange[];
}

// BEGIN HRCLEAN
const HR_CONTRACTS = ['permanent', 'fixed', 'trial', 'intern', 'freelance', 'other'];
const HR_MAX_DOCS = 10;
const HR_MAX_RATES = 50;
const HR_MAX_MONEY = 1_000_000_000_000;
const hrDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '1990-01-01' && v <= '2100-12-31' ? v : null;
};
/** Vérifie et nettoie un dossier salarié. Vide ou absent = « pas de dossier » (hr: null). Un champ faux refuse tout le dossier. */
function cleanHrFile(raw: any): { ok: true; hr: any } | { ok: false; reason: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, hr: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'hr' };
  const text = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
  const none = (v: unknown) => v === undefined || v === null || v === '';
  const out: any = {};
  const position = text(raw.position, 80);
  if (position) out.position = position;
  if (!none(raw.hire_date)) { const d = hrDate(raw.hire_date); if (!d) return { ok: false, reason: 'hire_date' }; out.hire_date = d; }
  if (!none(raw.contract_type)) {
    if (typeof raw.contract_type !== 'string' || !HR_CONTRACTS.includes(raw.contract_type)) return { ok: false, reason: 'contract_type' };
    out.contract_type = raw.contract_type;
  }
  if (!none(raw.contract_end)) {
    const d = hrDate(raw.contract_end);
    if (!d || (out.hire_date && d < out.hire_date)) return { ok: false, reason: 'contract_end' };
    out.contract_end = d;
  }
  if (!none(raw.trial_end)) {
    const d = hrDate(raw.trial_end);
    if (!d || (out.hire_date && d < out.hire_date)) return { ok: false, reason: 'trial_end' };
    out.trial_end = d;
  }
  if (!none(raw.emergency)) {
    const e = raw.emergency;
    if (typeof e !== 'object' || Array.isArray(e)) return { ok: false, reason: 'emergency' };
    const em: any = {};
    const name = text(e.name, 80), phone = text(e.phone, 40), relation = text(e.relation, 40);
    if (phone && !/^[0-9 +().-]{3,40}$/.test(phone)) return { ok: false, reason: 'emergency' };
    if (phone && !name) return { ok: false, reason: 'emergency' }; // un numéro sans nom ne sert à rien en urgence
    if (name) em.name = name;
    if (phone) em.phone = phone;
    if (relation) em.relation = relation;
    if (Object.keys(em).length) out.emergency = em;
  }
  if (!none(raw.documents)) {
    if (!Array.isArray(raw.documents) || raw.documents.length > HR_MAX_DOCS) return { ok: false, reason: 'documents' };
    const seen = new Set<string>();
    const docs: any[] = [];
    for (const d of raw.documents) {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'documents' };
      const id = text(d.id, 80), name = text(d.name, 80), url = typeof d.url === 'string' ? d.url.trim() : '';
      if (!id || !name || seen.has(id) || url.length > 500 || !/^https:\/\/[^\s<>"']+$/.test(url)) return { ok: false, reason: 'documents' };
      seen.add(id);
      const doc: any = { id, name, url };
      if (typeof d.added_at === 'string' && !isNaN(Date.parse(d.added_at))) doc.added_at = new Date(d.added_at).toISOString();
      docs.push(doc);
    }
    if (docs.length) out.documents = docs;
  }
  if (!none(raw.rate_history)) {
    if (!Array.isArray(raw.rate_history) || raw.rate_history.length > HR_MAX_RATES) return { ok: false, reason: 'rate_history' };
    const seen = new Set<string>();
    const rows: any[] = [];
    const money = (v: unknown): number | null => {
      if (!(typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= HR_MAX_MONEY ? Math.round(n) : null;
    };
    for (const r of raw.rate_history) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, reason: 'rate_history' };
      const id = text(r.id, 80), date = hrDate(r.date), to = money(r.to_ar);
      if (!id || seen.has(id) || !date || to === null) return { ok: false, reason: 'rate_history' };
      seen.add(id);
      const row: any = { id, date, to_ar: to };
      if (!none(r.from_ar)) { const f = money(r.from_ar); if (f === null) return { ok: false, reason: 'rate_history' }; row.from_ar = f; }
      const reason = text(r.reason, 200);
      if (reason) row.reason = reason;
      rows.push(row);
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    if (rows.length) out.rate_history = rows;
  }
  return { ok: true, hr: Object.keys(out).length ? out : null };
}
// END HRCLEAN

export const checkHrFile = (raw: unknown) => cleanHrFile(raw);

export const HR_CONTRACT_LABELS: Record<HrContract, [string, string]> = {
  permanent: ['CDI (durée indéterminée)', 'Permanent'],
  fixed: ['CDD (durée déterminée)', 'Fixed term'],
  trial: ["Période d'essai", 'Trial period'],
  intern: ['Stage', 'Internship'],
  freelance: ['Indépendant', 'Freelance'],
  other: ['Autre', 'Other'],
};

const toUtc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
/** Nombre de jours entiers de `a` à `b` (b après a = positif). Dates AAAA-MM-JJ ; autre chose = null. */
export function daysBetween(a: string, b: string): number | null {
  if (!hrDate(a) || !hrDate(b)) return null;
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Ancienneté en mois pleins à la date `today` (jour du mois compté : 15/01 → 14/02 = 0 mois). Null si pas de date d'embauche ou date future. */
export function seniorityMonths(hire?: string, today?: string): number | null {
  if (!hire || !today || !hrDate(hire) || !hrDate(today) || hire > today) return null;
  const [hy, hm, hd] = hire.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - hy) * 12 + (tm - hm);
  if (td < hd) months -= 1;
  return Math.max(0, months);
}

/** « 2 ans et 1 mois », « 5 mois », « moins d'un mois ». */
export function seniorityText(months: number | null, lang: 'fr' | 'en' = 'fr'): string {
  if (months === null || !Number.isFinite(months) || months < 0) return '';
  const y = Math.floor(months / 12), m = months % 12;
  if (lang === 'en') {
    if (months < 1) return 'less than a month';
    const ys = y ? `${y} year${y > 1 ? 's' : ''}` : '', ms = m ? `${m} month${m > 1 ? 's' : ''}` : '';
    return [ys, ms].filter(Boolean).join(' and ');
  }
  if (months < 1) return "moins d'un mois";
  const ys = y ? `${y} an${y > 1 ? 's' : ''}` : '', ms = m ? `${m} mois` : '';
  return [ys, ms].filter(Boolean).join(' et ');
}

/** Jours restants avant la fin de la période d'essai ou du contrat à durée déterminée (le plus proche), sinon null. 0 = c'est aujourd'hui ; négatif = déjà passé (on ne le signale pas). */
export function endOfTermIn(hr: HrFile | null | undefined, today: string): { kind: 'trial' | 'contract'; days: number; date: string } | null {
  if (!hr) return null;
  const cands: { kind: 'trial' | 'contract'; days: number; date: string }[] = [];
  if (hr.trial_end) { const d = daysBetween(today, hr.trial_end); if (d !== null && d >= 0) cands.push({ kind: 'trial', days: d, date: hr.trial_end }); }
  if (hr.contract_end) { const d = daysBetween(today, hr.contract_end); if (d !== null && d >= 0) cands.push({ kind: 'contract', days: d, date: hr.contract_end }); }
  cands.sort((a, b) => a.days - b.days);
  return cands[0] || null;
}

/** Dernier tarif connu d'après l'historique (le plus récent par date). */
export function currentRate(hr: HrFile | null | undefined): HrRateChange | null {
  const rows = hr?.rate_history || [];
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))[0];
}
