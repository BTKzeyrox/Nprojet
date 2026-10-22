// Contrôles de la page Conditions et des Réglages (module 11, lot 3) : réglage manquant ou qui se contredit. Règles pures.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { readCompany } from '../../companyRules';
import { list, plural } from './common';

const GO = { view: 'settings' };

/** Réglages importants restés vides (information : le site marche, mais certains documents et calculs seront incomplets). */
export const missingSettings: HealthRule = {
  id: 'conditions.missing', page: 'conditions',
  run: (ctx) => {
    const c = readCompany((ctx.settings as any).company), s: any = ctx.settings, fr: string[] = [], en: string[] = [];
    if (!c.identity.name) { fr.push('nom de l\'entreprise'); en.push('company name'); }
    if (!c.payroll.pay_day) { fr.push('jour de paie'); en.push('pay day'); }
    if (!c.leave.work_days_per_week) { fr.push('jours travaillés par semaine'); en.push('work days per week'); }
    if (!(Number(s.price_per_mission) > 0)) { fr.push('prix par mission'); en.push('price per mission'); }
    if (!fr.length) return [];
    return [{
      id: alertId('conditions', 'missing'), page: 'conditions', rule: 'missing', severity: 'info',
      title_fr: `${fr.length} ${plural(fr.length, 'réglage important est vide', 'réglages importants sont vides')}`, title_en: `${en.length} important ${plural(en.length, 'setting is', 'settings are')} empty`,
      why_fr: `À remplir : ${list(fr, 4)}. Sans eux, des documents et des calculs restent incomplets.`, why_en: `To fill in: ${list(en, 4)}. Without them, documents and calculations stay incomplete.`,
      todo_fr: 'Ouvrir la page Conditions et compléter.', todo_en: 'Open the Conditions page and fill them in.', since: null, value: fr.length, go: { view: 'settings' },
    } as HealthAlert];
  },
};

/** Valeurs qui se contredisent. */
export const incoherent: HealthRule = {
  id: 'conditions.incoherent', page: 'conditions',
  run: (ctx) => {
    const c = readCompany((ctx.settings as any).company), s: any = ctx.settings, fr: string[] = [], en: string[] = [];
    const bad = (t: unknown) => typeof t !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
    if (s.day_shift_start !== undefined && s.day_shift_end !== undefined && (bad(s.day_shift_start) || bad(s.day_shift_end))) { fr.push('horaires du jour illisibles'); en.push('unreadable day hours'); }
    if (s.night_shift_start !== undefined && s.night_shift_end !== undefined && (bad(s.night_shift_start) || bad(s.night_shift_end))) { fr.push('horaires de nuit illisibles'); en.push('unreadable night hours'); }
    if (Number(s.late_tolerance_min) > 120) { fr.push('tolérance de retard au-delà de 2 h'); en.push('late tolerance above 2 h'); }
    if (Number(s.advance_cap_pct) > 100 || Number(s.advance_repay_pct) > 100) { fr.push('pourcentage d\'avance au-dessus de 100 %'); en.push('advance percentage above 100%'); }
    if (c.tax.vat_enabled && !(c.tax.vat_rate > 0)) { fr.push('TVA activée avec un taux à 0'); en.push('VAT enabled with a 0 rate'); }
    if (c.clients.strategic_min_missions < c.clients.regular_missions) { fr.push('client stratégique demande moins de missions qu\'un régulier'); en.push('strategic client needs fewer missions than a regular one'); }
    if (c.leave.work_days_per_week > 0 && c.leave.work_days_per_week < 3) { fr.push('moins de 3 jours travaillés par semaine'); en.push('fewer than 3 work days per week'); }
    if (!fr.length) return [];
    return [{
      id: alertId('conditions', 'incoherent'), page: 'conditions', rule: 'incoherent', severity: 'watch',
      title_fr: `${fr.length} ${plural(fr.length, 'réglage semble', 'réglages semblent')} incohérent${fr.length > 1 ? 's' : ''}`, title_en: `${en.length} ${plural(en.length, 'setting looks', 'settings look')} inconsistent`,
      why_fr: `${list(fr, 4)}. C'est un signal : vérifier que c'est voulu.`, why_en: `${list(en, 4)}. This is a signal: check it is intended.`,
      todo_fr: 'Relire ces réglages.', todo_en: 'Review these settings.', since: null, value: fr.length, go: GO,
    } as HealthAlert];
  },
};

export const CONDITIONS_RULES: HealthRule[] = [missingSettings, incoherent];
