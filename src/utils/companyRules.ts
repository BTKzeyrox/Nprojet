// Conditions de l'entreprise (module 0) : valeurs de départ, validation et filtre employé.
// Règles pures : pas d'écran, pas de serveur. Le serveur (df-api, bloc COMPANY) fait la même vérification ;
// `npm run check:company` compare les deux sur les mêmes cas, pour qu'ils ne se séparent jamais.
import type { CompanySettings } from '../types';

type Spec =
  | { t: 'text'; max: number; multi?: boolean }
  | { t: 'bool' }
  | { t: 'int'; min: number; max: number }
  | { t: 'num'; min: number; max: number }
  | { t: 'enum'; vals: string[] }
  | { t: 'time' }
  | { t: 'email' }
  | { t: 'url' }
  | { t: 'prefix' }
  | { t: 'lines'; n: number; max: number };

export const COMPANY_SPEC: Record<string, Record<string, Spec>> = {
  identity: { name: { t: 'text', max: 80 }, address: { t: 'text', max: 200 }, phone: { t: 'text', max: 40 }, email: { t: 'email' }, logo_url: { t: 'url' }, currency: { t: 'text', max: 8 } },
  legal: { tax_id: { t: 'text', max: 60 }, register_id: { t: 'text', max: 60 }, notes: { t: 'lines', n: 10, max: 200 } },
  tax: { vat_enabled: { t: 'bool' }, vat_rate: { t: 'num', min: 0, max: 100 }, vat_exempt_text: { t: 'text', max: 200 } },
  billing: { invoice_prefix: { t: 'prefix' }, receipt_prefix: { t: 'prefix' }, payment_days: { t: 'int', min: 0, max: 365 }, late_penalty_text: { t: 'text', max: 300 }, payment_methods_text: { t: 'text', max: 200 }, invoice_footer: { t: 'text', max: 300 } },
  payroll: { pay_day: { t: 'int', min: 0, max: 31 }, pay_rounding: { t: 'enum', vals: ['none', '10', '100', '1000'] } },
  leave: { leave_days_per_year: { t: 'int', min: 0, max: 60 }, work_days_per_week: { t: 'int', min: 0, max: 7 }, late_limit_time: { t: 'time' } },
  missions: { validation_hours: { t: 'int', min: 0, max: 720 }, refusal_reason_required: { t: 'bool' } },
  clients: { new_days: { t: 'int', min: 1, max: 365 }, regular_missions: { t: 'int', min: 1, max: 100 }, regular_months: { t: 'int', min: 1, max: 24 }, strategic_top_pct: { t: 'int', min: 1, max: 100 }, strategic_months: { t: 'int', min: 1, max: 36 }, strategic_min_missions: { t: 'int', min: 1, max: 1000 }, inactive_days: { t: 'int', min: 1, max: 730 } },
  options: { invoice_per: { t: 'enum', vals: ['client_month', 'mission'] }, quotes_enabled: { t: 'bool' }, employee_sees_badges: { t: 'bool' }, employee_sees_attention: { t: 'bool' }, mission_requires_client: { t: 'bool' }, badges_enabled: { t: 'bool' } },
  texts: { internal_rules: { t: 'text', max: 5000, multi: true }, customer_terms: { t: 'text', max: 5000, multi: true } },
  modules: { hidden: { t: 'text', max: 400 } },
  watch: { validate_hours: { t: 'int', min: 0, max: 720 }, active_no_end_hours: { t: 'int', min: 0, max: 720 }, late_count: { t: 'int', min: 0, max: 100 }, late_window_days: { t: 'int', min: 0, max: 365 }, absent_streak_days: { t: 'int', min: 0, max: 60 }, refusal_rate_pct: { t: 'int', min: 0, max: 100 }, refusal_min_missions: { t: 'int', min: 0, max: 1000 }, min_periods: { t: 'int', min: 0, max: 60 }, ignore_days: { t: 'int', min: 0, max: 365 }, min_duration_minutes: { t: 'int', min: 0, max: 600 }, advance_pending_days: { t: 'int', min: 0, max: 90 }, inactive_days: { t: 'int', min: 0, max: 365 }, strategic_silent_days: { t: 'int', min: 0, max: 365 }, dormant_days: { t: 'int', min: 0, max: 730 }, others_pct: { t: 'int', min: 0, max: 100 }, backup_max_hours: { t: 'int', min: 0, max: 720 }, error_hours: { t: 'int', min: 0, max: 720 } },
};

/** Valeurs de départ prudentes : rien d'inventé (légal vide), TVA non, 30 jours, FA- / RC-. 0 = « non réglé ». */
export const COMPANY_DEFAULTS: CompanySettings = {
  identity: { name: '', address: '', phone: '', email: '', logo_url: '', currency: 'Ar' },
  legal: { tax_id: '', register_id: '', notes: [] },
  tax: { vat_enabled: false, vat_rate: 0, vat_exempt_text: '' },
  billing: { invoice_prefix: 'FA-', receipt_prefix: 'RC-', payment_days: 30, late_penalty_text: '', payment_methods_text: '', invoice_footer: '' },
  payroll: { pay_day: 0, pay_rounding: 'none' },
  leave: { leave_days_per_year: 0, work_days_per_week: 0, late_limit_time: '' },
  missions: { validation_hours: 0, refusal_reason_required: true },
  clients: { new_days: 60, regular_missions: 3, regular_months: 6, strategic_top_pct: 20, strategic_months: 12, strategic_min_missions: 5, inactive_days: 90 },
  options: { invoice_per: 'client_month', quotes_enabled: false, employee_sees_badges: true, employee_sees_attention: false, mission_requires_client: true, badges_enabled: true },
  texts: { internal_rules: '', customer_terms: '' },
  modules: { hidden: '' },
  watch: { validate_hours: 0, active_no_end_hours: 0, late_count: 0, late_window_days: 0, absent_streak_days: 0, refusal_rate_pct: 0, refusal_min_missions: 0, min_periods: 0, ignore_days: 0, min_duration_minutes: 0, advance_pending_days: 0, inactive_days: 0, strategic_silent_days: 0, dormant_days: 0, others_pct: 0, backup_max_hours: 0, error_hours: 0 },
};

/** Ce qu'un employé a le droit de recevoir : le règlement intérieur et les règles de congés/présence. Rien d'argent. */
export const COMPANY_EMPLOYEE_SECTIONS = ['leave'] as const;

const noTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
const noCtl = (s: string, multi: boolean) => (multi ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') : s.replace(/[\u0000-\u001F\u007F]+/g, ' '));

/** Nettoie une valeur. `bad` = refusée (on garde `fallback`). `undefined` = pas envoyé = on garde `fallback` sans erreur. */
function cleanField(sp: Spec, raw: unknown, fallback: any): { v: any; bad: boolean } {
  if (raw === undefined) return { v: fallback, bad: false };
  const no = { v: fallback, bad: true };
  switch (sp.t) {
    case 'text': {
      if (typeof raw !== 'string') return no;
      const s = noCtl(noTags(raw), !!sp.multi).trim();
      return s.length > sp.max ? no : { v: sp.multi ? s : s.replace(/\s{2,}/g, ' '), bad: false };
    }
    case 'bool': return typeof raw === 'boolean' ? { v: raw, bad: false } : no;
    case 'int': case 'num': {
      if (typeof raw !== 'number' && !(typeof raw === 'string' && raw.trim() !== '')) return no;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < sp.min || n > sp.max) return no;
      return { v: sp.t === 'int' ? Math.round(n) : Math.round(n * 100) / 100, bad: false };
    }
    case 'enum': return typeof raw === 'string' && sp.vals.includes(raw) ? { v: raw, bad: false } : no;
    case 'time': return typeof raw === 'string' && (raw === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) ? { v: raw, bad: false } : no;
    case 'email': return typeof raw === 'string' && (raw === '' || (raw.length <= 120 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(raw))) ? { v: raw, bad: false } : no;
    case 'url': return typeof raw === 'string' && (raw === '' || (raw.length <= 300 && /^https:\/\/[^\s<>"']+$/.test(raw))) ? { v: raw, bad: false } : no;
    case 'prefix': {
      if (typeof raw !== 'string') return no;
      const s = raw.replace(/[^A-Za-z0-9\-_/]/g, '');
      return s.length > 10 ? no : { v: s, bad: false };
    }
    case 'lines': {
      if (!Array.isArray(raw)) return no;
      const out: string[] = [];
      for (const x of raw) {
        if (typeof x !== 'string') return no;
        const s = noCtl(noTags(x), false).trim().replace(/\s{2,}/g, ' ');
        if (s.length > sp.max) return no;
        if (s) out.push(s);
      }
      return out.length > sp.n ? no : { v: out, bad: false };
    }
  }
}

/**
 * Vérifie et complète les Conditions. Retourne toujours un objet complet et valide.
 * Une valeur refusée est remplacée par celle de `base` (l'existant, sinon la valeur de départ) et signalée dans `errors` (ex. « tax.vat_rate »).
 * Un champ ou une section inconnus sont ignorés. Une valeur absente garde `base`.
 */
export function cleanCompany(input: unknown, base: CompanySettings = COMPANY_DEFAULTS): { value: CompanySettings; errors: string[] } {
  const errors: string[] = [];
  const src: any = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (input !== undefined && input !== null && src !== input) errors.push('(tout)');
  const out: any = {};
  for (const sec of Object.keys(COMPANY_SPEC)) {
    const rawSec = src[sec] && typeof src[sec] === 'object' && !Array.isArray(src[sec]) ? src[sec] : {};
    if (src[sec] !== undefined && rawSec !== src[sec]) errors.push(sec);
    out[sec] = {};
    for (const k of Object.keys(COMPANY_SPEC[sec])) {
      const fb = (base as any)?.[sec]?.[k] ?? (COMPANY_DEFAULTS as any)[sec][k];
      const r = cleanField(COMPANY_SPEC[sec][k], rawSec[k], fb);
      if (r.bad) errors.push(`${sec}.${k}`);
      out[sec][k] = Array.isArray(r.v) ? [...r.v] : r.v;
    }
  }
  return { value: out as CompanySettings, errors };
}

/** Lit les Conditions d'un réglage reçu du serveur (employé : sections partielles, le reste prend la valeur de départ). */
export const readCompany = (settingsCompany: unknown): CompanySettings => cleanCompany(settingsCompany).value;

/** Même filtre que le serveur : ce qu'un employé peut recevoir. */
export function companyForEmployee(c: Partial<CompanySettings> | undefined): Partial<CompanySettings> {
  const full = readCompany(c);
  // Les 3 réglages « Badges » (oui/non, rien d'argent) : sans eux le salarié ne peut pas savoir si sa page « Ma performance » est ouverte (module 3).
  const { badges_enabled, employee_sees_badges, employee_sees_attention } = full.options;
  return { leave: full.leave, texts: { internal_rules: full.texts.internal_rules } as CompanySettings['texts'], options: { badges_enabled, employee_sees_badges, employee_sees_attention } as CompanySettings['options'], modules: full.modules };
}

/** Liste des champs changés entre deux versions (pour l'historique). `before` est coupé à 120 caractères. */
export function companyDiff(before: CompanySettings, after: CompanySettings): { path: string; before: string }[] {
  const out: { path: string; before: string }[] = [];
  for (const sec of Object.keys(COMPANY_SPEC)) for (const k of Object.keys(COMPANY_SPEC[sec])) {
    const a = (before as any)[sec][k], b = (after as any)[sec][k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: `${sec}.${k}`, before: (Array.isArray(a) ? a.join(' | ') : String(a)).slice(0, 120) });
  }
  return out;
}
