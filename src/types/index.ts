import type { MissionTemplate } from '../utils/missionTemplates';
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
  price_per_million: number; // Ar pour 1M de score (sert encore aux pénalités automatiques)
  price_per_mission: number; // Ar versés pour chaque mission validée (tarif fixe, quelle que soit la quantité)
  client_price_default_ar?: number; // Ar payés par le client pour une mission validée (prix par défaut, 0 = pas encore réglé)
  client_prices_by_type?: Record<string, number>; // exceptions : prix client par type de mission (clé = nom du type)
  goal_missions?: number; // objectif du mois : missions validées (0 ou vide = pas d'objectif)
  goal_profit_ar?: number; // objectif du mois : bénéfice net en Ar (admin seulement : jamais envoyé aux employés)
  goal_max_expenses_ar?: number; // plafond de dépenses du mois en Ar (admin seulement)
  alert_unpaid_days?: number; // alerte « client qui n'a pas payé depuis X jours » (30 par défaut)
  alert_low_cash_ar?: number; // alerte « trésorerie basse » sous ce montant (0 par défaut = seulement si négative)
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
  mission_templates?: MissionTemplate[]; // modèles de mission (module 6, M6.2) ; admin seulement
  company?: CompanySettings; // Conditions de l'entreprise (module 0) : l'employé ne reçoit que le règlement et les congés
  budgets?: Record<string, number>; // plafond mensuel par catégorie de dépense, en Ar (module 4) : admin seulement, jamais envoyé à un opérateur
  company_log?: CompanyLogEntry[]; // historique des changements des Conditions (écrit par le serveur, admin seulement)
}

/** Conditions de l'entreprise (module 0). Tout est facultatif ; rien n'est écrit en dur ailleurs dans le code. */
export interface CompanySettings {
  identity: { name: string; address: string; phone: string; email: string; logo_url: string; currency: string };
  legal: { tax_id: string; register_id: string; notes: string[] };
  tax: { vat_enabled: boolean; vat_rate: number; vat_exempt_text: string };
  billing: { invoice_prefix: string; receipt_prefix: string; payment_days: number; late_penalty_text: string; payment_methods_text: string; invoice_footer: string };
  payroll: { pay_day: number; pay_rounding: 'none' | '10' | '100' | '1000' };
  leave: { leave_days_per_year: number; work_days_per_week: number; late_limit_time: string };
  missions: { validation_hours: number; refusal_reason_required: boolean };
  clients: { new_days: number; regular_missions: number; regular_months: number; strategic_top_pct: number; strategic_months: number; strategic_min_missions: number; inactive_days: number };
  options: { invoice_per: 'client_month' | 'mission'; quotes_enabled: boolean; employee_sees_badges: boolean; employee_sees_attention: boolean; mission_requires_client: boolean; badges_enabled: boolean };
  texts: { internal_rules: string; customer_terms: string };
}

export interface CompanyLogEntry {
  at: string; // date ISO, posée par le serveur
  by: string; // id de l'admin
  by_name: string;
  path: string; // ex. « tax.vat_rate »
  before: string; // valeur d'avant (coupée à 120 caractères)
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
  client_price_ar?: number; // prix client figé à la validation (les anciennes missions : calculé au besoin)
  client_id?: string; // fiche client (module 1) : jamais envoyé à un opérateur ; copié depuis la mission
  notes?: string;
  tasks_done?: string[]; // identifiants des tâches cochées de la mission (module 6, M6.3)
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
  reactions?: Record<string, string[]>; // réactions emoji : emoji → ids des personnes
}

// Groupe de discussion créé par l'admin ou un booster (recipient_id des messages = id du groupe, « grp_… »)
export interface ChatGroup {
  id: string;
  name: string;
  owner_id: string;
  members: string[];
  admins?: string[]; // administrateurs du groupe (en plus du responsable)
  avatar_url?: string; // photo du groupe
  description?: string; // description (200 caractères max)
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
  proof_mode?: 'type' | 'none' | 'photo' | 'note' | 'both'; // Justificatif demandé à la fin (avancé) : « type » = selon le type de mission
  no_account?: boolean; // Poste sans compte : grisé, non réservable, rempli par l'admin
  current_rank: string;
  target_rank: string;
  initial_score: number; // Début : modifiable par l'admin seulement
  current_score?: number; // Actuel du compte (mis à jour à la validation d'une fin de session)
  account_proof_urls?: string[]; // Preuves du compte client (5 photos max) : l'admin les gère, les boosters les voient
  target_score: number;
  recommended_shift: ShiftType | 'any';
  estimated_reward_ar: number;
  client_price_ar?: number; // prix client propre à cette mission (sinon : prix du type, sinon prix par défaut)
  client_id?: string; // fiche client (module 1) ; les anciennes missions gardent leur texte libre `client_name` ; jamais envoyé à un opérateur
  priority: 'Haute' | 'Normale' | 'Urgente';
  due_date?: string; // date limite AAAA-MM-JJ (module 6, M6.1) ; facultative
  due_time?: string; // heure limite HH:MM ; seulement avec une date
  tasks?: { id: string; text: string }[]; // liste de tâches à cocher (module 6, M6.3), 20 au plus
  tasks_required?: boolean; // vrai = tout doit être coché avant d'envoyer la mission
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

// Fil d'actualité : publications du responsable, avec « J'adore », commentaires et partages
export interface NewsComment {
  id: string;
  user_id: string;
  user_name: string;
  role: UserRole;
  text: string;
  files?: NewsAttachment[];
  reactions?: Record<string, string[]>; // réactions emoji : emoji → ids des personnes
  created_at: string;
}

// Pièce jointe d'une publication ou d'un commentaire (photo compressée, PDF, texte)
export interface NewsAttachment {
  url: string;
  name: string;
  kind: 'image' | 'file';
  size?: number; // octets
}

export type NewsStatus = 'published' | 'pending' | 'rejected';

export interface NewsPost {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  text: string;
  created_at: string;
  pinned: boolean;
  loves: string[]; // ids des personnes qui ont mis « J'adore »
  comments: NewsComment[];
  shares: number;
  files?: NewsAttachment[];
  author_role?: UserRole;
  status?: NewsStatus; // absent = publiée (anciennes publications)
  reject_reason?: string;
  submitted_at?: string;
  files_removed?: number; // fichiers supprimés au refus
}

/** Fiche client (module 1) : visible par l'admin seulement. Le statut n'est jamais stocké : il se calcule (src/utils/clients.ts). */
export interface Client {
  id: string;
  name: string; // raison sociale
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  payment_terms_days?: number; // échéance de ce client (sinon celle de la page Conditions)
  price_default_ar?: number; // tarif propre à ce client
  price_by_type?: Record<string, number>; // exceptions par type de mission
  active?: boolean; // false = archivé (un client qui a des missions n'est jamais supprimé)
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

/** Une ligne d'argent (finances) : entrée (paiement d'un client…) ou sortie (dépense). Visible par l'admin seulement. */
export type CashKind = 'in' | 'out';
export interface CashEntry {
  id: string;
  kind: CashKind;
  category: string;
  amount_ar: number;
  date: string; // AAAA-MM-JJ
  note: string;
  client_name?: string;
  mission_id?: string;
  supplier_id?: string; // fournisseur d'un achat (module 4)
  po_id?: string; // bon de commande qui a créé cette dépense (module 4)
  invoice_id?: string; // facture payée par cette ligne (module 2)
  receipt_no?: string; // numéro de reçu attribué par le serveur (module 2)
  payment_method?: string; // espèces, virement, mobile money…
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Stock (responsable seulement, comme les finances). La quantité en stock n'est JAMAIS saisie : elle se calcule avec les mouvements.
export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string; // « unité », « kg », « boîte »…
  buy_price_ar: number; // prix d'achat par unité
  sell_price_ar: number; // prix de vente par unité
  alert_threshold: number; // voyant rouge quand la quantité est à ce nombre ou en dessous (0 = pas d'alerte)
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}
export type StockMoveType = 'in' | 'out' | 'adjust';
export interface StockMove {
  id: string;
  product_id: string;
  type: StockMoveType; // in = entrée (+), out = sortie (−), adjust = ajustement (+ ou −, pour corriger après un comptage)
  qty: number; // in/out : toujours > 0 ; adjust : positif ou négatif, jamais 0
  date: string; // AAAA-MM-JJ
  note: string;
  unit_cost_ar?: number; // entrée seulement : prix payé par unité (facultatif)
  cash_id?: string; // dépense « Achats » créée avec cette entrée (S3.3)
  supplier_id?: string; // fournisseur de cette entrée (module 4)
  po_id?: string; // bon de commande reçu (module 4)
  reason?: 'inventory'; // ajustement fait après un comptage physique (module 4)
  counted_qty?: number; // inventaire : quantité comptée
  expected_qty?: number; // inventaire : quantité que le stock indiquait
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ---------- Facturation (module 2, responsable seulement) ----------
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled'; // en retard / partiellement payée / payée se CALCULENT (voir src/utils/invoices.ts)
export interface InvoiceLine {
  id: string;
  description: string;
  qty: number; // jusqu'à 2 décimales
  unit_price_ar: number;
  total_ar: number; // qty × prix, arrondi à l'Ar
  refs?: string[]; // identifiants des sessions de mission facturées par cette ligne
}
export interface InvoiceParty { name: string; address?: string; contact_name?: string; email?: string; phone?: string; tax_id?: string; register_id?: string }
export interface Invoice {
  id: string;
  type?: 'invoice' | 'credit_note'; // « avoir » : annule une facture émise
  number?: string; // attribué par le serveur à l'émission (jamais pour un brouillon)
  status: InvoiceStatus;
  client_id: string;
  client: InvoiceParty; // copie du client AU MOMENT de l'émission : un document émis ne change plus
  issuer?: InvoiceParty; // copie de l'entreprise à l'émission
  issue_date: string;
  due_date: string;
  lines: InvoiceLine[];
  subtotal_ar: number;
  tax_rate: number;
  tax_ar: number;
  total_ar: number;
  note?: string;
  credit_of?: string; // avoir : identifiant de la facture annulée
  cancelled_by?: string; // facture annulée : identifiant de l'avoir
  issued_at?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Fournisseurs, bons de commande, inventaire et budgets (module 4, responsable seulement, comme le stock et les finances).
export interface Supplier {
  id: string;
  name: string;
  contact: string; // téléphone, e-mail ou nom : texte libre
  lead_days?: number; // délai habituel de livraison (jours), vide = inconnu
  note: string;
  active: boolean; // faux = archivé (jamais supprimé s'il a servi)
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}
export type PurchaseStatus = 'draft' | 'ordered' | 'received' | 'cancelled';
export interface PurchaseLine {
  product_id: string;
  qty: number; // commandé
  unit_cost_ar: number; // prix convenu par unité
  received_qty: number; // déjà reçu (réception partielle possible)
}
export interface PurchaseOrder {
  id: string;
  ref: string; // « BC-0001 »
  supplier_id: string;
  date: string; // AAAA-MM-JJ, date de la commande
  expected_date?: string; // livraison prévue
  status: PurchaseStatus; // Brouillon → Commandé → Reçu, ou Annulé
  lines: PurchaseLine[]; // figées une fois commandé : seule la quantité reçue avance
  note: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}
