export interface PasswordResetRequest {
  id: string;
  user_id: string;
  username: string;
  name: string;
  phone: string;
  status: 'pending';
  created_at: string;
  note?: string; // description facultative du booster
}

export interface AppSettings {
  id: 'general';
  price_per_million: number; // Ar pour 1M de score
  day_shift_start: string; // HH:MM
  day_shift_end: string;
  night_shift_start: string;
  night_shift_end: string;
  late_tolerance_min: number; // tolérance de retard (calendrier)
  access_before_min: number; // connexion permise X min avant le début du shift
  access_after_min: number; // connexion permise X min après la fin du shift
  show_activity_column: boolean; // colonne « Activité » sur la page Employés
  pay_period?: 'month' | 'half'; // paie : mensuelle ou par quinzaine
  advance_cap_pct?: number; // plafond des avances : % de ce qui est gagné dans la période (0 = pas de plafond)
  advance_repay_pct?: number; // part de la paie qui peut servir à rembourser les avances (%)
  pay_methods?: string[]; // modes de paiement proposés
  auto_pen_enabled?: boolean; // pénalités automatiques (retards, absences) calculées dans la paie
  auto_pen_late1_min?: number; auto_pen_late1_m?: number; // retard de X min = −Y M de score
  auto_pen_late2_min?: number; auto_pen_late2_m?: number;
  auto_pen_absent_m?: number; // absence non annoncée = −Y M de score
  penalties_enabled?: boolean; // retenues / pénalités : désactivées par défaut
  badge_start: boolean; // pastille « Début à valider »
  badge_end: boolean; // pastille « Fin à valider »
  badge_advance: boolean; // pastille « Avance à valider »
  badge_profile: boolean; // pastille « Profil à valider »
  badges_clickable: boolean; // un clic sur une pastille ouvre Validations
  alert_idle_1_min: number; // 1re alerte « booster sans poste » (minutes)
  alert_idle_2_min: number; // 2e alerte
  err_report_enabled: boolean; // envoi automatique des erreurs au journal
  err_max_per_session: number; // rapports automatiques maximum par session (quota d'appels)
  err_hide_details: boolean; // cacher le détail technique aux boosters (ils voient seulement le numéro)
  err_report_button: boolean; // bouton « Signaler un problème »
  retry_seconds: number; // délai entre deux tentatives quand la connexion est perdue
  maintenance_on: boolean; // site en maintenance (les boosters sont refusés, l'admin entre)
  maintenance_message: string;
  retention_days: number;
  grid_columns?: number; // colonnes de la grille des postes (2 à 10)
  rules: string;
  post_types: string[];
}

export interface ProfileChangeRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'rejected';
  reason?: string; // motif du refus (visible par le booster)
  created_at: string;
  old: { name: string; username: string; phone: string; avatar_url: string };
  name: string;
  username: string;
  phone: string;
  avatar_url: string;
  note?: string; // description facultative du booster
}

export type UserRole = 'admin' | 'employee';
export type UserStatus = 'active' | 'blocked';
export type ShiftType = 'day' | 'night';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  shift: ShiftType; // 'day' (08:00 - 18:00) or 'night' (20:00 - 06:00)
  is_online: boolean;
  access_mode?: 'auto' | 'allow' | 'block'; // accès selon le shift : auto (défaut), toute heure, bloqué
  avatar_url: string;
  phone: string;
  cv_url?: string;
  cv_data?: {
    rank: string;
    gameExperience: string;
    kdRatio: string;
    hardware: string;
    joinedDate: string;
    languages: string[];
    specialty: string;
  };
  performance_badge: 'Top Booster' | 'Elite' | 'Standard' | 'Under Watch';
  total_score_boosted: number;
  total_earnings_ar: number;
  pending_advance_ar: number;
}

export type PostStatus = 
  | 'idle'
  | 'pending_start'
  | 'active'
  | 'pending_end'
  | 'completed'
  | 'rejected'
  | 'force_released';

export interface PostSession {
  id: string;
  employee_id: string;
  employee_name: string;
  client_name: string;
  account_tag: string;
  target_score: number;
  initial_score: number;
  current_score: number;
  final_score?: number;
  remaining_score: number;
  status: PostStatus;
  shift_type: ShiftType;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time?: string; // HH:MM:SS
  post_number?: number;
  start_proof_url: string;
  start_proof_urls?: string[]; // 1 to 5 proof photos
  end_proof_url?: string;
  end_proof_urls?: string[]; // 1 to 5 proof photos
  rejection_reason?: string;
  calculated_ar?: number; // 1M score = 1,000 Ar
  notes?: string;
  start_notes?: string; // description facultative du booster au début de session
  admin_notes?: string; // description facultative de l'admin à la validation
  demo?: boolean; // donnée de démonstration (supprimable dans Réglages)
  created_at: string;
  updated_at: string;
}

export type ViolationType = 
  | 'score_inversion'
  | 'multi_post_attempt'
  | 'out_of_shift_confinement'
  | 'suspicious_screenshot';

export interface SecurityViolation {
  id: string;
  employee_id: string;
  employee_name: string;
  violation_type: ViolationType;
  description: string;
  timestamp: string;
  details: {
    initial_score?: number;
    attempted_score?: number;
    active_post_id?: string;
    client_name?: string;
    user_agent?: string;
  };
  resolved: boolean;
}

export type AdvanceStatus = 'pending' | 'approved' | 'rejected';

export interface SalaryAdvanceRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  amount_ar: number;
  reason: string;
  request_date: string;
  status: AdvanceStatus;
  admin_notes?: string;
  demo?: boolean;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  recipient_id?: string; // or 'all' / 'admin'
  message: string;
  timestamp: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_kind?: 'image' | 'file';
  edited_at?: string; // message modifié après envoi
  pinned?: boolean; // épinglé en haut de la conversation
  pinned_at?: string;
  reply_to?: { id: string; sender_name: string; text: string; has_attachment?: boolean }; // message cité (réponse)
  deleted_at?: string; // supprimé pour tous : il ne reste qu'une trace
  deleted_by?: 'sender' | 'admin';
  sent_ms?: number; // heure d'envoi côté serveur (fenêtre de modification, coches « lu »)
}

// Groupe de discussion créé par l'admin ou un booster (recipient_id des messages = id du groupe, « grp_… »)
export interface ChatGroup {
  id: string;
  name: string;
  owner_id: string;
  members: string[];
  created_at?: string;
}

// Jusqu'où une personne a lu une conversation (thread = id de l'autre personne, ou id du groupe)
export interface ChatRead {
  user_id: string;
  thread: string;
  ms: number;
}

export interface ClientContract {
  id: string;
  post_number: number; // numéro du poste (1 à 100)
  client_name: string;
  account_tag: string;
  game_mode: string;
  description?: string; // Description du poste (ex: no read, no card...)
  post_type?: string; // Type de poste (ex: NO R/C, YES R/C, RED 9CASE)
  no_account?: boolean; // Poste sans compte : grisé, non réservable, rempli par l'admin
  current_rank: string;
  target_rank: string;
  initial_score: number; // Début : modifiable par l'admin seulement
  current_score?: number; // Actuel du compte (mis à jour à la validation d'une fin de session)
  account_proof_urls?: string[]; // Preuves du compte client (5 photos max) : l'admin les gère, les boosters les voient
  target_score: number;
  recommended_shift: ShiftType | 'any';
  estimated_reward_ar: number;
  priority: 'Haute' | 'Normale' | 'Urgente';
  region_server: string;
}

export type DayStatus = 'objective_reached' | 'late' | 'absent' | 'no_post' | 'test' | 'in_progress';

export interface DayCalendarRecord {
  date: string; // YYYY-MM-DD
  dayStatus: DayStatus;
  shifts: PostSession[];
  notes?: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'employee' | 'date' | 'client';
  dateStr?: string;
  employeeId?: string;
  clientName?: string;
}

// Demande d'inscription d'un nouveau booster (validée par l'admin)
export interface SignupRequest {
  id: string;
  name: string;
  username: string;
  phone: string;
  shift: ShiftType;
  status: 'pending';
  created_at: string;
  note?: string; // description facultative du booster
}

// Présence d'un booster (signe de vie, temps de connexion du jour, file d'attente « sans poste »)
// Arrivée d'un booster un jour donné (première connexion) et temps connecté
export interface AttendanceRow {
  user_id: string;
  day: string;
  first_seen: string;
  last_seen: string;
  online_sec: number;
}

export interface PresenceRow {
  user_id: string;
  last_seen: string;
  day: string;
  online_sec: number;
  waiting_since: string | null;
}
export interface QueueInfo {
  waiting_since: string;
  position: number;
  total: number;
}
