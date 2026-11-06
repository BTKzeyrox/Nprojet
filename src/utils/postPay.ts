// Paie d'une session validée (module 26, M26.4) : règles pures, sans écran ni serveur.
// Le serveur (bloc DECIDE de df-api) a la même copie ; `npm run check:payroll-modes` compare les deux sur les mêmes cas, pour qu'elles ne se séparent jamais.
// RÈGLE D'OR : une mission NORMALE (sans `work_type`) est payée exactement comme avant : le prix fixe par mission (Réglages > Missions), quels que soient le mode de paie, les tarifs ou l'employé.
// Seule une LIGNE DE TRAVAIL (production, présence : `work_type` présent, saisie par le chef d'équipe ou le responsable) est payée selon le mode : celui de l'employé s'il en a un, sinon celui de l'entreprise, sinon « par mission ».
// Le montant est calculé UNE FOIS, à la validation, puis figé dans `calculated_ar` : les bulletins, avances et la performance ne changent pas.
import { MAX_HOURS_PER_DAY, MAX_QTY, MAX_RATE_AR, acceptedPieces, dayFraction, isPayMode, payAmount, type PayMode } from './workTypes';

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const rateOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_RATE_AR ? v : 0);
const unitsOf = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : 0);

/** Une ligne de travail = une session qui porte un type de travail (production ou présence) ; une mission normale n'en a pas. */
export const isWorkLine = (post: any): boolean => !!post && typeof post === 'object' && typeof post.work_type === 'string' && post.work_type.length > 0;

/** Le mode de paie qui s'applique : celui de l'employé (valide), sinon celui de l'entreprise (valide), sinon « par mission ». */
export function payModeFor(employee: any, settings: any): PayMode {
  const work = settings && settings.company && settings.company.work;
  if (isPayMode(employee && employee.pay_mode)) return employee.pay_mode;
  if (isPayMode(work && work.pay_default)) return work.pay_default;
  return 'mission';
}

/** Montant en Ar (entier, jamais négatif, jamais NaN) d'une session qu'on valide. */
export function postPayAr(post: any, employee: any, settings: any): number {
  const missionPay = Math.max(0, Math.round(num(settings && settings.price_per_mission)));
  if (!isWorkLine(post)) return missionPay; // mission normale : comme avant
  const mode = payModeFor(employee, settings);
  if (mode === 'mission') return missionPay; // une ligne de travail payée « par mission » = une mission
  if (mode === 'fixed') return 0; // le salaire fixe se paie par période, pas par ligne (voir le plan, M26.4)
  const work = (settings && settings.company && settings.company.work) || {};
  const own = rateOf(employee && employee.pay_rate_ar); // le tarif propre de l'employé remplace celui de l'entreprise (0 ou absent = celui de l'entreprise)
  const rate = own > 0 ? own : rateOf(work[`rate_${mode}_ar`]);
  const pieces = unitsOf(post.quantity, MAX_QTY), rejected = unitsOf(post.rejected, MAX_QTY);
  return payAmount(mode, rate, { days: dayFraction(post.presence), hours: unitsOf(post.hours, MAX_HOURS_PER_DAY), pieces, rejected: Math.min(rejected, pieces) });
}
/** Le prix client d'une ligne de travail est toujours 0 : elle n'est facturée à aucun client (la production n'a pas de client). */
export const workLineClientPrice = 0;
