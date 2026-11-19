// Constantes et petits outils partagés par le magasin de données (store.ts) et ses parties (db/parts/*.ts).
// Utilisé par : db/store.ts et db/parts/*.ts. Pour modifier : changer ici, rien d'autre à toucher.
import type { TasksError } from '../utils/taskList';
import { AppSettings } from '../types';
import siteConfig from '../../site.config.json';
import { supabaseUrl, type SiteConfig } from '../utils/siteConfig';

export const TOKEN_KEY = 'df_session_token_v2';
// Adresse du projet Supabase : lue dans site.config.json (les comptes du site, à un seul endroit). Le réglage Vercel `VITE_SUPABASE_URL` est facultatif et passe avant.
export const SUPABASE_URL = supabaseUrl(siteConfig as SiteConfig, import.meta.env.VITE_SUPABASE_URL);
export const API_BASE = `${SUPABASE_URL}/functions/v1/df-api`;
export const RESTORE_BASE = `${SUPABASE_URL}/functions/v1/df-restore`;
export const AI_BASE = `${SUPABASE_URL}/functions/v1/df-assistant`;
export const COLS = ['users', 'posts', 'contracts', 'securityLogs', 'advances', 'messages', 'groups', 'settings', 'news', 'cash', 'products', 'stock', 'clients', 'invoices', 'quotes', 'suppliers', 'purchases', 'leaves', 'shifts', 'reviews', 'sheets', 'entries'] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'general',
  price_per_million: 1000,
  price_per_mission: 5000,
  client_price_default_ar: 0, // à régler dans Réglages > Missions (0 = pas encore réglé)
  client_prices_by_type: {},
  work_days: [1, 2, 3, 4, 5, 6],
  day_shift_start: '08:00',
  day_shift_end: '17:00',
  night_shift_start: '19:30',
  night_shift_end: '04:30',
  shift_mode: 'both',
  late_tolerance_min: 15,
  access_before_min: 60,
  access_after_min: 60,
  show_activity_column: true,
  pay_period: 'month',
  advance_cap_pct: 0,
  advance_repay_pct: 100,
  pay_methods: ['MVola', 'Orange Money', 'Airtel Money', 'Espèces'],
  penalties_enabled: false,
  auto_pen_enabled: true,
  auto_pen_late1_min: 15,
  auto_pen_late1_m: 1,
  auto_pen_late2_min: 30,
  auto_pen_late2_m: 2,
  auto_pen_absent_m: 5,
  badge_start: true,
  badge_end: true,
  badge_advance: true,
  badge_profile: true,
  badges_clickable: true,
  alert_idle_1_min: 15,
  alert_idle_2_min: 30,
  err_report_enabled: true,
  err_max_per_session: 3,
  err_hide_details: true,
  err_report_button: true,
  retry_seconds: 15,
  maintenance_on: false,
  maintenance_message: 'Le site est en maintenance. Réessaie un peu plus tard.',
  retention_days: 7,
  grid_columns: 2,
  rules: '',
  post_types: ['Saisie de fiches', 'Contrôle qualité', 'Tâche administrative', 'Demande d’aide', 'Tâche web'],
};
export type Col = (typeof COLS)[number];

export const SORTERS: Partial<Record<Col, (a: any, b: any) => number>> = {
  users: (a, b) => (a.role === b.role ? String(a.id).localeCompare(String(b.id)) : a.role === 'admin' ? -1 : 1),
  posts: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
  contracts: (a, b) => (a.post_number || 0) - (b.post_number || 0),
  securityLogs: (a, b) => String(b.id).localeCompare(String(a.id)),
  advances: (a, b) => String(b.id).localeCompare(String(a.id)),
  news: (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  cash: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  products: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  stock: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  clients: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  invoices: (a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id).localeCompare(String(a.id)),
  suppliers: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)),
  quotes: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.ref || '').localeCompare(String(a.ref || '')) || String(b.id).localeCompare(String(a.id)),
  entries: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.number || b.id).localeCompare(String(a.number || a.id)),
  reviews: (a, b) => String(b.period_end || '').localeCompare(String(a.period_end || '')) || String(a.id).localeCompare(String(b.id)),
  sheets: (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(a.id).localeCompare(String(b.id)),
  leaves: (a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || String(a.id).localeCompare(String(b.id)),
  shifts: (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)),
  purchases: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.ref || '').localeCompare(String(a.ref || '')) || String(b.id).localeCompare(String(a.id)),
  groups: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)),
  messages: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || String(a.id).localeCompare(String(b.id)),
};

export const TEMPLATE_MESSAGE: Record<'name' | 'duplicate' | 'limit' | 'proof' | 'format', string> = {
  name: 'Donne un nom au modèle.',
  duplicate: 'Un modèle porte déjà ce nom.',
  limit: 'Maximum 30 modèles de mission.',
  proof: 'Justificatif inconnu.',
  format: 'Modèle illisible.',
};

export const TASKS_MESSAGE: Record<TasksError, string> = {
  format: 'Liste de tâches illisible.',
  empty_text: 'Une tâche ne peut pas être vide.',
  too_many: 'Maximum 20 tâches par mission.',
  duplicate_id: 'Deux tâches portent le même identifiant.',
  required_without_tasks: 'Ajoute au moins une tâche pour exiger qu\'elles soient toutes cochées.',
};

export const DEADLINE_MESSAGE: Record<'date' | 'time' | 'time_without_date' | 'priority', string> = {
  date: 'La date limite n\'est pas une vraie date.',
  time: 'L\'heure limite doit être entre 00:00 et 23:59.',
  time_without_date: 'Choisis une date pour pouvoir ajouter une heure.',
  priority: 'Priorité inconnue.',
};
