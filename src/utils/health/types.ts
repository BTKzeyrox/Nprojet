// Moteur d'alertes « Admin IA Pro » (module 11) : format commun de toutes les alertes. Règles pures, sans écran, sans serveur.
// Contrôlé par `npm run check:health`. Les alertes montrent des chiffres d'argent et de personnes : à n'utiliser que pour l'admin.

/** Gravité : Info (pour savoir), À voir (à regarder bientôt), Urgent (à traiter maintenant). */
export type HealthSeverity = 'info' | 'watch' | 'urgent';
export const SEVERITY_ORDER: HealthSeverity[] = ['urgent', 'watch', 'info'];
export const severityRank = (s: HealthSeverity): number => SEVERITY_ORDER.indexOf(s); // 0 = le plus grave

/** Une page surveillée (une entrée du menu, ou un sujet transversal). Les contrôleurs d'une page arrivent quand la page existe. */
export const HEALTH_PAGES = [
  'missions', 'team', 'payroll', 'finance', 'clients', 'stock', 'invoices', 'suppliers', 'hr', 'performance',
  'conditions', 'data', 'security', 'system',
] as const;
export type HealthPage = typeof HEALTH_PAGES[number];

/** Où mener l'admin : `view` = identifiant de la vue du menu, `tab` et `filter` ouvrent la bonne partie, déjà filtrée. */
export interface HealthGo { view: string; tab?: string; filter?: string }

export interface HealthAlert {
  id: string; // stable : le même problème a toujours le même identifiant (voir alertId)
  page: HealthPage;
  rule: string; // règle qui l'a produite
  severity: HealthSeverity;
  title_fr: string; title_en: string;
  why_fr: string; why_en: string; // POURQUOI : les chiffres (« 3 retards en 7 jours »)
  todo_fr?: string; todo_en?: string; // QUE FAIRE
  since: string | null; // depuis quand (AAAA-MM-JJ), null si inconnu
  value?: number; // mesure du problème (sert à savoir s'il s'aggrave après « Vérifié »)
  go: HealthGo;
}

/** Marque posée par l'admin sur une alerte. « Ignorer » ou « Vérifié » la cache ; elle revient si le problème s'aggrave. */
export type HealthAckStatus = 'ignored' | 'checked';
export interface HealthAck {
  id: string; // identifiant de l'alerte
  status: HealthAckStatus;
  reason: string; // la raison est gardée (facultative, 200 caractères)
  at: string; // date et heure ISO de la marque
  until?: string | null; // « Ignorer jusqu'au » AAAA-MM-JJ : l'alerte revient ce jour-là
  severity_at: HealthSeverity; // gravité au moment de la marque
  value_at?: number; // mesure au moment de la marque
}

/** Seuils réglables (valeurs de départ prudentes ; ils iront dans Réglages > Conditions > Surveillance à l'étape M11.14). */
export interface HealthThresholds {
  validate_hours: number; // mission à valider depuis plus de N heures
  active_no_end_hours: number; // mission « en cours » depuis plus de N heures sans preuve de fin
  late_count: number; // en retard N fois…
  late_window_days: number; // …sur les N derniers jours
  absent_streak_days: number; // absent N jours de suite
  refusal_rate_pct: number; // taux de refus supérieur à N %…
  refusal_min_missions: number; // …sur au moins N missions
  min_periods: number; // minimum de périodes de données avant de comparer à la médiane
  ignore_days: number; // « Ignorer » sans date : N jours
  min_duration_minutes: number; // mission terminée en moins de N minutes = trop rapide
  advance_pending_days: number; // avance en attente depuis plus de N jours
  inactive_days: number; // salarié sans mission depuis N jours
}
export const HEALTH_THRESHOLDS_DEFAULT: HealthThresholds = {
  validate_hours: 24, active_no_end_hours: 12, late_count: 3, late_window_days: 7, absent_streak_days: 2,
  refusal_rate_pct: 30, refusal_min_missions: 10, min_periods: 3, ignore_days: 14,
  min_duration_minutes: 3, advance_pending_days: 3, inactive_days: 30,
};
/** Plus grandes valeurs acceptées (une valeur absurde est ignorée : on garde alors la valeur de départ). */
export const HEALTH_THRESHOLDS_MAX: HealthThresholds = {
  validate_hours: 24 * 30, active_no_end_hours: 24 * 30, late_count: 100, late_window_days: 365, absent_streak_days: 60,
  refusal_rate_pct: 100, refusal_min_missions: 1000, min_periods: 60, ignore_days: 365,
  min_duration_minutes: 600, advance_pending_days: 90, inactive_days: 365,
};

/** Seuils tirés de la page Conditions (section « watch », plus tard). Une valeur absente, fausse ou hors limites prend la valeur de départ. */
export function healthThresholds(company: { watch?: Partial<HealthThresholds> } | undefined | null): HealthThresholds {
  const src: any = (company && company.watch) || {};
  const out: any = { ...HEALTH_THRESHOLDS_DEFAULT };
  for (const k of Object.keys(HEALTH_THRESHOLDS_DEFAULT) as (keyof HealthThresholds)[]) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= HEALTH_THRESHOLDS_MAX[k]) out[k] = Math.round(v);
  }
  return out as HealthThresholds;
}
