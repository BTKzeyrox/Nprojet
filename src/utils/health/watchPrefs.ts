// Réglages « Surveillance » (M11.14) : seuils de la Santé du site, réglés SUR CET APPAREIL (aucun serveur). Pur, sauf lecture/écriture du stockage local, protégée.
// Les seuils partagés par toute l'équipe (Conditions) demandent de modifier le serveur : étape à part, avec accord.
import { HEALTH_THRESHOLDS_DEFAULT, HEALTH_THRESHOLDS_MAX, type HealthThresholds } from './types';

export interface WatchField { key: keyof HealthThresholds; fr: string; en: string; unit: { fr: string; en: string } }
const h = { fr: 'heures', en: 'hours' }, d = { fr: 'jours', en: 'days' }, pc = { fr: '%', en: '%' }, n = { fr: 'fois', en: 'times' }, mi = { fr: 'missions', en: 'missions' }, mn = { fr: 'minutes', en: 'minutes' }, pe = { fr: 'périodes', en: 'periods' };
export const WATCH_FIELDS: WatchField[] = [
  { key: 'validate_hours', fr: 'Mission à valider depuis plus de', en: 'Mission waiting for validation for more than', unit: h },
  { key: 'active_no_end_hours', fr: 'Mission en cours sans preuve de fin depuis plus de', en: 'Mission in progress without end proof for more than', unit: h },
  { key: 'late_count', fr: 'Retards : alerte à partir de', en: 'Late arrivals: alert from', unit: n },
  { key: 'late_window_days', fr: '…sur les derniers', en: '…over the last', unit: d },
  { key: 'absent_streak_days', fr: 'Absent jours de suite : alerte à partir de', en: 'Absent days in a row: alert from', unit: d },
  { key: 'refusal_rate_pct', fr: 'Taux de refus au-dessus de', en: 'Refusal rate above', unit: pc },
  { key: 'refusal_min_missions', fr: '…sur au moins', en: '…over at least', unit: mi },
  { key: 'min_periods', fr: 'Périodes de données minimum avant de comparer', en: 'Minimum periods of data before comparing', unit: pe },
  { key: 'ignore_days', fr: '« Ignorer » sans date dure', en: '"Ignore" without a date lasts', unit: d },
  { key: 'min_duration_minutes', fr: 'Mission terminée en moins de (trop rapide)', en: 'Mission finished in less than (too fast)', unit: mn },
  { key: 'advance_pending_days', fr: 'Avance en attente depuis plus de', en: 'Advance pending for more than', unit: d },
  { key: 'inactive_days', fr: 'Employé sans mission depuis', en: 'Employee without missions for', unit: d },
  { key: 'strategic_silent_days', fr: 'Client Stratégique sans mission depuis', en: 'Strategic client without missions for', unit: d },
  { key: 'dormant_days', fr: 'Produit sans mouvement depuis', en: 'Product without movement for', unit: d },
  { key: 'others_pct', fr: 'Catégorie « Autres » au-dessus de', en: '"Other" category above', unit: pc },
  { key: 'backup_max_hours', fr: 'Sauvegarde de nuit absente depuis plus de', en: 'Nightly backup missing for more than', unit: h },
  { key: 'error_hours', fr: 'Erreurs du site vues dans les dernières', en: 'Site errors seen in the last', unit: h },
];

/** Lit des réglages enregistrés : seulement des nombres entiers entre 1 et le maximum ; tout le reste est ignoré (valeur de départ). */
export function parseWatchPrefs(raw: unknown): Partial<HealthThresholds> {
  let src: any = raw;
  if (typeof raw === 'string') { try { src = JSON.parse(raw); } catch { return {}; } }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
  const out: Partial<HealthThresholds> = {};
  for (const k of Object.keys(HEALTH_THRESHOLDS_DEFAULT) as (keyof HealthThresholds)[]) {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= HEALTH_THRESHOLDS_MAX[k] && v !== HEALTH_THRESHOLDS_DEFAULT[k]) out[k] = v;
  }
  return out;
}
/** Valide ce que l'admin tape : { ok } ou la raison. Vide = valeur de départ (retire le réglage). */
export function checkWatchInput(key: keyof HealthThresholds, text: string): { ok: true; value: number | null } | { ok: false; why: { fr: string; en: string } } {
  const s = String(text ?? '').trim();
  if (s === '') return { ok: true, value: null };
  if (!/^\d{1,5}$/.test(s)) return { ok: false, why: { fr: 'Écrivez un nombre entier (ex. 24).', en: 'Write a whole number (e.g. 24).' } };
  const v = Number(s), max = HEALTH_THRESHOLDS_MAX[key];
  if (v < 1 || v > max) return { ok: false, why: { fr: `Entre 1 et ${max}.`, en: `Between 1 and ${max}.` } };
  return { ok: true, value: v === HEALTH_THRESHOLDS_DEFAULT[key] ? null : v };
}
const KEY = (uid: string) => `df_watch_${uid}`;
export const loadWatchPrefs = (uid: string): Partial<HealthThresholds> => { try { return parseWatchPrefs(localStorage.getItem(KEY(uid))); } catch { return {}; } };
export const saveWatchPrefs = (uid: string, p: Partial<HealthThresholds>): void => { try { const clean = parseWatchPrefs(p); if (Object.keys(clean).length) localStorage.setItem(KEY(uid), JSON.stringify(clean)); else localStorage.removeItem(KEY(uid)); } catch { /* stockage refusé : les valeurs de départ restent */ } };
