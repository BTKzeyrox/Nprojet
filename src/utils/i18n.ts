export type Language = 'fr' | 'zh';

export const TRANSLATIONS = {
  fr: {
    // Brand
    brand_title: 'DELTA FORCE // HAWK OPS',
    brand_sub: 'Plateforme Tactique de Boosting',
    brand_version: 'QG BOOSTING',

    // Sidebar Menus
    menu_operational: 'Menu Opérationnel',
    nav_grid: 'Grille des Postes',
    nav_grid_sub: '',
    nav_active_post_user: 'Mon Poste en Cours',
    nav_active_post_user_sub: 'Chrono, score & preuves',
    nav_active_post_admin: 'Suivi des Sessions',
    nav_active_post_admin_sub: 'Boosters en ligne',
    nav_employees: 'Gestion des Boosters',
    nav_employees_sub: 'Équipe et statuts',
    nav_profile: 'Mon Profil',
    nav_profile_sub: 'Photo et infos',
    nav_advances: 'Avances sur Salaire',
    nav_advances_sub: 'Demandes & acomptes Ar',
    nav_chat: 'Messagerie Directe',
    nav_chat_sub: 'Chat local',
    nav_calendar: 'Calendrier des Shifts',
    nav_calendar_sub: 'Suivi mensuel & quotas',
    nav_security: 'Surveillance "Petit Malin"',
    nav_security_sub: 'Détection anti-triche',
    badge_unlimited: 'Illimité',
    badge_anticheat: 'Anti-Triche',
    badge_posts_count: 'Postes',
    btn_logout: 'Déconnexion',
    logging_out: 'Déconnexion en cours...',

    // Top Stats & Grid
    matrix_badge: 'MATRICE OFFICIELLE · 20 POSTES (2x10)',
    view_cards: 'Vue Cartes',
    rate_rule: '1M = 1 000 Ar',
    grid_title: 'GRILLE DES 20 POSTES (2x10)',
    grid_desc: 'Sélectionnez un poste pour lancer ou superviser votre session.',
    total_posts: 'Total Postes',
    pay_scale: 'Barème Rémunération',
    filter_all: 'Tous',
    filter_day: ' Jour',
    filter_night: ' Nuit',
    filter_urgent: ' Urgents',
    search_placeholder: 'Rechercher poste (#01..#20, client, tag)...',

    // Card Details
    score_start: 'Départ',
    score_current: 'Actuel',
    score_remaining: 'Reste',
    score_target: 'Cible',
    score_volume: 'Volume',
    score_reward: 'Gain Estimé',
    rank: 'Rang',
    shift_day: ' Shift Jour',
    shift_night: ' Shift Nuit',
    status_available: 'DISPONIBLE',
    status_occupied: 'EN COURS PAR',
    status_your_session: 'VOTRE SESSION',
    btn_choose_post: 'Choisir ce Poste & Démarrer',
    btn_access_my_post: 'Accéder à Mon Poste en Cours',
    msg_post_occupied: 'Poste en cours d\'utilisation par un autre booster',

    // Login
    login_operator: 'CONNEXION OPÉRATEUR',
    login_title: 'ACCÉDER AU TERMINAL DE JEU',
    login_desc: 'Authentifiez-vous pour ouvrir votre session et accéder à la grille.',
    username_label: 'IDENTIFIANT OPÉRATEUR',
    username_placeholder: 'Ex: admin, tojo, rado',
    password_label: 'MOT DE PASSE DE SÉCURITÉ',
    btn_connect: 'SE CONNECTER AU SYSTÈME',
    auth_in_progress: 'AUTHENTIFICATION EN COURS...',
    quick_login_label: 'Connexion Rapide (Comptes de Test) :',
    role_admin: ' ADMIN',
    role_day: ' JOUR',
    role_night: ' NUIT',
    role_blocked: ' BLOQUÉ',
    sys_ready: 'Système Prêt',

    // Theme & Lang
    theme_switch_dark: 'Mode Sombre',
    theme_switch_light: 'Mode Clair',
    lang_switch: 'Langue / 语言',
  },
  zh: {
    // Brand
    brand_title: 'DELTA FORCE // 三角洲行动',
    brand_sub: '战术代练与监控作战指挥部',
    brand_version: '作战指挥QG',

    // Sidebar Menus
    menu_operational: '作战操作菜单',
    nav_grid: '岗位总览',
    nav_grid_sub: '2x10 矩阵全景',
    nav_active_post_user: '当前进行中工位',
    nav_active_post_user_sub: '倒计时、得分与结算截图',
    nav_active_post_admin: '代练会话监控',
    nav_active_post_admin_sub: '在线代练',
    nav_employees: '代练员团队管理',
    nav_employees_sub: '人员状态与游戏履历',
    nav_profile: '个人档案与履历',
    nav_profile_sub: '操作员技术特长',
    nav_advances: '薪资预支申请',
    nav_advances_sub: '预支提款与审核明细',
    nav_chat: '专属实时通讯',
    nav_chat_sub: '无限时交流通道',
    nav_calendar: '排班考勤日历',
    nav_calendar_sub: '月度工时与配额',
    nav_security: '防作弊监控系统',
    nav_security_sub: '多工位与作弊行为拦截',
    badge_unlimited: '不限时',
    badge_anticheat: '防作弊',
    badge_posts_count: '20工位',
    btn_logout: '安全退出',
    logging_out: '正在安全退出系统...',

    // Top Stats & Grid
    matrix_badge: '官方矩阵 · 20工位 (2x10)',
    view_cards: '卡片视图',
    rate_rule: '1M分 = 1000阿里',
    grid_title: '20个代练工位矩阵 (2x10)',
    grid_desc: '在20个客户账号中选择工位，开始代练并提交凭据。',
    total_posts: '总工位数',
    pay_scale: '薪酬兑换规则',
    filter_all: '全部',
    filter_day: ' 白班',
    filter_night: ' 夜班',
    filter_urgent: ' 紧急工单',
    search_placeholder: '搜索工位 (#01..#20, 客户名, 账号标签)...',

    // Card Details
    score_start: '初始积分',
    score_current: '当前积分',
    score_remaining: '剩余积分',
    score_target: '目标积分',
    score_volume: '需刷积分',
    score_reward: '预计收益',
    rank: '目标段位',
    shift_day: ' 白班专享',
    shift_night: ' 夜班专享',
    status_available: '空闲可接',
    status_occupied: '打手正在进行',
    status_your_session: '我的当前工位',
    btn_choose_post: '选择此工位并启动',
    btn_access_my_post: '进入我正在进行的工位',
    msg_post_occupied: '该工位已被其他打手锁定进行中',

    // Login
    login_operator: '操作员认证接入',
    login_title: '登录战术指挥终端',
    login_desc: '请输入凭据登录以接入20工位代练矩阵。',
    username_label: '操作员账号',
    username_placeholder: '例如: admin, tojo, rado',
    password_label: '安全验证密码',
    btn_connect: '验证凭据并登入',
    auth_in_progress: '正在解密身份凭据...',
    quick_login_label: '一键测试登录 (快捷测试账号) :',
    role_admin: ' 管理员',
    role_day: ' 白班打手',
    role_night: ' 夜班打手',
    role_blocked: ' 封禁测试',
    sys_ready: '系统就绪',

    // Theme & Lang
    theme_switch_dark: '暗黑模式',
    theme_switch_light: '明亮模式',
    lang_switch: '语言 / Langue',
  }
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.fr;

export function getTranslation(lang: Language, key: TranslationKey): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  return dict[key] || TRANSLATIONS.fr[key] || key;
}
