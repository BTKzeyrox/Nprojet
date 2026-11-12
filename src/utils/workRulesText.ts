// Règles écrites d'un type de travail (Réglages > Types de travail et paie) : ce que le site DEMANDE, COMPTE et PAIE pour ce type.
// Aucune règle nouvelle : on relit celles qui existent (workTypes.ts : mesure, paie, qui saisit ; companyRules.ts : tarifs, retard, absences ; calendrier : « Travail saisi »).
// Pure : pas d'écran, pas de serveur. Contrôlé par `npm run check:work-rules-text`.
import { ABSENCE_REASONS, ABSENCE_LABEL, ENTRY_LABEL, LATE_RULE_LABEL, MEASURE_LABEL, PAY_LABEL, isPayMode, type LateRule, type WorkType } from './workTypes';

export interface RuleLine { key: 'enter' | 'ask' | 'calendar' | 'pay' | 'late' | 'absence'; fr: string; en: string }
const money = (n: unknown): string => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} Ar`;

/** Les lignes de règles d'un type, dans l'ordre où la personne les rencontre : saisie, champs demandés, calendrier, paie, retard, absence. `work` = réglages `company.work` (peut être vide). */
export function workRuleLines(t: WorkType, work: any = {}): RuleLine[] {
  const w = work && typeof work === 'object' ? work : {};
  const out: RuleLine[] = [];
  const who = t.entry.map(e => ENTRY_LABEL[e]);
  out.push({ key: 'enter', fr: `Saisi par : ${who.map(x => x.fr).join(' ou ')}.`, en: `Entered by: ${who.map(x => x.en).join(' or ')}.` });
  const unit = t.unit ? t.unit.fr : 'unité', unitEn = t.unit ? t.unit.en : 'unit';
  const ask: Record<string, [string, string]> = {
    presence: ['présence du jour (présent, en retard, demi-journée, absent)', 'presence of the day (present, late, half day, absent)'],
    quantity: [`quantité faite (${unit}) et quantité refusée`, `quantity done (${unitEn}) and quantity rejected`],
    proof: ['une preuve (capture ou photo), comme une mission', 'a proof (screenshot or photo), like a mission'],
    tasks: ['les tâches faites dans la journée', 'the tasks done during the day'],
    none: ['rien de plus (le travail est compté tel quel)', 'nothing more (the work is counted as is)'],
  };
  const a = ask[t.measure] || ask.none;
  out.push({ key: 'ask', fr: `Le site demande : ${a[0]}. Mesure : ${MEASURE_LABEL[t.measure].fr}.`, en: `The site asks for: ${a[1]}. Measured by: ${MEASURE_LABEL[t.measure].en}.` });
  out.push(t.measure === 'proof'
    ? { key: 'calendar', fr: 'Calendrier : suit les missions (début, fin, score).', en: 'Calendar: follows the missions (start, end, score).' }
    : { key: 'calendar', fr: 'Calendrier : apparaît dans « Travail saisi » du jour, jamais comme une mission ; une saisie encore sur le téléphone est marquée « pas encore envoyée ».', en: 'Calendar: shown in "Work entered" of the day, never as a mission; an entry still on the phone is marked "not sent yet".' });
  const rateKey = t.pay === 'day' ? 'rate_day_ar' : t.pay === 'hour' ? 'rate_hour_ar' : t.pay === 'piece' ? 'rate_piece_ar' : t.pay === 'fixed' ? 'rate_fixed_ar' : '';
  const rate = rateKey ? Number(w[rateKey]) || 0 : 0;
  const payMode = isPayMode(t.pay) ? t.pay : 'mission';
  out.push(rateKey
    ? { key: 'pay', fr: `Paie : ${PAY_LABEL[payMode].fr}${rate > 0 ? `, tarif de l'entreprise ${money(rate)} (le tarif propre d'un employé passe avant)` : ' : AUCUN TARIF réglé dans les Conditions, la paie sera à 0 tant qu\'il manque'}.`, en: `Pay: ${PAY_LABEL[payMode].en}${rate > 0 ? `, company rate ${money(rate)} (an employee's own rate comes first)` : ': NO RATE set in Conditions, pay will be 0 until it is'}.` }
    : { key: 'pay', fr: `Paie : ${PAY_LABEL[payMode].fr} (le prix d'une mission des Réglages).`, en: `Pay: ${PAY_LABEL[payMode].en} (the mission price from Settings).` });
  if (t.measure === 'presence') {
    const lr = (['never', 'per_minute', 'per_15'] as string[]).includes(w.late_rule) ? (w.late_rule as LateRule) : 'never';
    out.push({ key: 'late', fr: `Retard retiré de la paie : ${LATE_RULE_LABEL[lr].fr.toLowerCase()}.`, en: `Lateness taken off pay: ${LATE_RULE_LABEL[lr].en.toLowerCase()}.` });
    const paid = ABSENCE_REASONS.filter(r => w[`absence_paid_${r}`] === true);
    out.push({ key: 'absence', fr: `Absence payée : ${paid.length ? paid.map(r => ABSENCE_LABEL[r].fr.toLowerCase()).join(', ') : 'aucun motif'}.`, en: `Paid absence: ${paid.length ? paid.map(r => ABSENCE_LABEL[r].en.toLowerCase()).join(', ') : 'no reason'}.` });
  }
  return out;
}
