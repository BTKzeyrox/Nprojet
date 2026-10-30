// Rôles (M7.1) : règles pures, sans écran ni serveur. Le serveur (bloc ROLES de df-api) a la même copie ; `npm run check:roles` compare les deux.
// admin = responsable (tout). accountant = Comptable : factures et argent, pas de comptes ni de réglages ni de paie.
// team_lead = Chef d'équipe : valide les missions de SON équipe, sans paie ni réglages ni argent. employee = opérateur.
export const ROLES = ['admin', 'accountant', 'team_lead', 'employee'] as const;
export type Role = typeof ROLES[number];
/** Rôles qu'un admin peut donner en créant un compte (jamais « admin » : un seul responsable). */
export const CREATABLE_ROLES = ['employee', 'accountant', 'team_lead'] as const;

/** Collections d'argent et de stock : lues et écrites par l'admin et le Comptable seulement. */
export const MONEY_COLS = ['cash', 'products', 'stock', 'clients', 'suppliers', 'purchases', 'invoices', 'quotes', 'entries'];
/** Collections jamais envoyées à un non-admin : journal de sécurité + argent. */
export const READ_ADMIN_COLS = ['securityLogs', ...MONEY_COLS];

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const isCreatableRole = (v: unknown): boolean => typeof v === 'string' && (CREATABLE_ROLES as readonly string[]).includes(v);
/** Rôle inconnu = opérateur (le moins de droits). */
export const roleOf = (v: unknown): Role => (isRole(v) ? v : 'employee');
/** Admin ou Comptable : voit et gère l'argent. */
export const isMoneyRole = (role: unknown): boolean => role === 'admin' || role === 'accountant';
/** Opérateur : seul rôle soumis aux vacations, à la présence, à la maintenance et à la paie. */
export const isOperator = (role: unknown): boolean => roleOf(role) === 'employee';
export const canReadCol = (role: unknown, col: string): boolean => role === 'admin' || (isMoneyRole(role) ? MONEY_COLS.includes(col) || !READ_ADMIN_COLS.includes(col) : !READ_ADMIN_COLS.includes(col));
export const canWriteMoneyCol = (role: unknown, col: string): boolean => !MONEY_COLS.includes(col) || isMoneyRole(role);
/** Prix client et objectifs d'argent : admin et Comptable. */
export const seesClientPrice = (role: unknown): boolean => isMoneyRole(role);
/** Routes (hors collections) réservées à l'admin et au Comptable. */
export const MONEY_ROUTES = ['invoice-issue', 'invoice-cancel', 'invoice-pay', 'accounting-sync', 'accounting-post'];
export const canRoute = (role: unknown, action: string): boolean => !MONEY_ROUTES.includes(action) || isMoneyRole(role);
/** Nom d'équipe : texte court, sans retour à la ligne ; vide = pas d'équipe. */
export const cleanTeam = (v: unknown): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
/** Même équipe : les deux ont une équipe et c'est la même (sans tenir compte des majuscules). Sans équipe, jamais. */
export const sameTeam = (a: any, b: any): boolean => { const x = cleanTeam(a && a.team).toLowerCase(), y = cleanTeam(b && b.team).toLowerCase(); return !!x && x === y; };
/** Qui peut valider ou refuser la session d'un opérateur : l'admin, ou le Chef d'équipe de la même équipe (jamais sa propre session ni celle d'un non-opérateur). */
export const canDecidePost = (me: any, owner: any): boolean => !!me && !!owner && (me.role === 'admin' || (me.role === 'team_lead' && isOperator(owner.role) && owner.id !== me.id && sameTeam(me, owner)));
/** Pages du Comptable (identifiants de vue du site). Jamais : paie, comptes, présence, réglages du site, statistiques (elles montrent la paie : sa « Trésorerie » montre l'argent sans salaires). */
export const ACCOUNTANT_VIEWS = ['feed', 'invoices', 'accounting', 'treasury', 'clients', 'purchasing', 'chat', 'settings'] as const;
/** Pages du Chef d'équipe : Actualités, Validations de son équipe, Messages, réglages personnels. Jamais l'argent, la paie ni les comptes. */
export const TEAM_LEAD_VIEWS = ['feed', 'validations', 'chat', 'settings'] as const;
/** Le Comptable et le Chef d'équipe ne peuvent ouvrir que leurs pages ; les autres rôles ne sont pas limités ici (le serveur reste juge). */
export const viewAllowedFor = (role: unknown, view: string): boolean => role === 'accountant' ? (ACCOUNTANT_VIEWS as readonly string[]).includes(view) : role === 'team_lead' ? (TEAM_LEAD_VIEWS as readonly string[]).includes(view) : true;
/** « Voir comme » du responsable : l'écran d'un type de compte (affichage seulement). */
export type ViewAs = Role;
export const ROLE_NAMES: Record<Role, [string, string]> = {
  admin: ['Responsable', 'Manager'], accountant: ['Comptable', 'Accountant'], team_lead: ["Chef d'équipe", 'Team lead'], employee: ['Opérateur', 'Operator'],
};
