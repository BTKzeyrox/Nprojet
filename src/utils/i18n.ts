export type Language = 'fr' | 'en';

export const TRANSLATIONS = {
  fr: {
    // Brand
    brand_title: 'GESTION PRO',
    brand_sub: 'Gestion du travail à la tâche',
    brand_version: 'ESPACE PRO',

    // Sidebar Menus
    menu_operational: 'Menu Opérationnel',
    nav_grid: 'Grille des Missions',
    nav_grid_sub: '',
    nav_active_post_user: 'Ma Mission en Cours',
    nav_active_post_user_sub: 'Chrono, quantité et justificatifs',
    nav_active_post_admin: 'Suivi des Sessions',
    nav_active_post_admin_sub: 'Opérateurs en ligne',
    nav_employees: 'Opérateurs et sessions',
    nav_employees_sub: 'Équipe, statuts et sessions',
    nav_profile: 'Mon Profil',
    nav_profile_sub: 'Photo et infos',
    nav_advances: 'Avances sur Salaire',
    nav_advances_sub: 'Demandes & acomptes Ar',
    nav_chat: 'Messagerie Directe',
    nav_chat_sub: 'Chat local',
    nav_calendar: 'Calendrier des Vacations',
    nav_calendar_sub: 'Suivi mensuel & quotas',
    nav_security: 'Contrôle et sécurité',
    nav_security_sub: 'Anomalies à vérifier',
    badge_unlimited: 'Illimité',
    badge_anticheat: 'Contrôle',
    badge_posts_count: 'Missions',
    btn_logout: 'Déconnexion',
    logging_out: 'Déconnexion en cours...',

    // Top Stats & Grid
    matrix_badge: 'MATRICE OFFICIELLE · 20 MISSIONS (2x10)',
    view_cards: 'Vue Cartes',
    rate_rule: '1M = 1 000 Ar',
    grid_title: 'GRILLE DES 20 MISSIONS (2x10)',
    grid_desc: 'Sélectionnez une mission pour lancer ou superviser votre session.',
    total_posts: 'Total Missions',
    pay_scale: 'Barème Rémunération',
    filter_all: 'Tous',
    filter_day: ' Jour',
    filter_night: ' Nuit',
    filter_urgent: ' Urgents',
    search_placeholder: 'Rechercher une mission (numéro, titre)...',

    // Card Details
    score_start: 'Départ',
    score_current: 'Actuel',
    score_remaining: 'Reste',
    score_target: 'Cible',
    score_volume: 'Volume',
    score_reward: 'Gain Estimé',
    rank: 'Rang',
    shift_day: ' Vacation Jour',
    shift_night: ' Vacation Nuit',
    status_available: 'DISPONIBLE',
    status_occupied: 'EN COURS PAR',
    status_your_session: 'VOTRE SESSION',
    btn_choose_post: 'Choisir ce Mission & Démarrer',
    btn_access_my_post: 'Accéder à Ma Mission en Cours',
    msg_post_occupied: 'Mission en cours d\'utilisation par un autre opérateur',

    // Login
    login_operator: 'CONNEXION',
    login_title: "ACCÉDER À L'ESPACE DE TRAVAIL",
    login_desc: 'Connectez-vous pour accéder à vos missions.',
    username_label: 'PSEUDO',
    username_placeholder: 'Ex: responsable, tojo, rado',
    password_label: 'MOT DE PASSE',
    btn_connect: 'SE CONNECTER AU SYSTÈME',
    auth_in_progress: 'AUTHENTIFICATION EN COURS...',
    quick_login_label: 'Connexion Rapide (Comptes de Test) :',
    role_admin: ' RESPONSABLE',
    role_day: ' JOUR',
    role_night: ' NUIT',
    role_blocked: ' BLOQUÉ',
    sys_ready: 'Système Prêt',

    // Theme & Lang
    theme_switch_dark: 'Mode Sombre',
    theme_switch_light: 'Mode Clair',
    lang_switch: 'Langue / 语言',
  }
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.fr;

export function getTranslation(lang: Language, key: TranslationKey): string {
  // L'anglais est appliqué sur l'écran par le traducteur (enTranslate) : les textes restent écrits en français
  void lang;
  return TRANSLATIONS.fr[key] || key;
}
