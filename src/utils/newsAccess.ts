// Actualités : qui peut publier, qui peut modifier, qui peut voir (règles pures, copie identique dans supabase/functions/df-api/index.ts, bloc NEWSACCESS ; contrôlé par scripts/check-news-access.ts)
import type { UserRole } from '../types';

export type NewsRole = 'employee' | 'team_lead' | 'accountant';
export type PublishMode = 'off' | 'review' | 'direct';
export interface NewsPolicy { employee: PublishMode; team_lead: PublishMode; accountant: PublishMode; allow_edit: boolean }

export const AUDIENCE_ROLES: NewsRole[] = ['employee', 'team_lead', 'accountant'];
// Par défaut (réglage jamais touché) : comme avant, les trois rôles peuvent proposer une publication, le responsable la valide ; personne ne modifie une publication déjà publiée.
export const DEFAULT_NEWS_POLICY: NewsPolicy = { employee: 'review', team_lead: 'review', accountant: 'review', allow_edit: false };

const isMode = (v: unknown): v is PublishMode => v === 'off' || v === 'review' || v === 'direct';

/** Réglage « Publications des équipes » : absent = valeurs par défaut ; une valeur inconnue dans un réglage enregistré = pas de publication ; la modification n'est autorisée que si `allow_edit` vaut vrai. */
export function cleanNewsPolicy(v: unknown): NewsPolicy {
  if (!v || typeof v !== 'object') return { ...DEFAULT_NEWS_POLICY };
  const o = v as Record<string, unknown>;
  return { employee: isMode(o.employee) ? o.employee : 'off', team_lead: isMode(o.team_lead) ? o.team_lead : 'off', accountant: isMode(o.accountant) ? o.accountant : 'off', allow_edit: o.allow_edit === true };
}

/** Public d'une publication : liste de rôles, ou `undefined` = tout le monde (vide, inconnu ou les trois rôles = tout le monde). */
export function cleanAudience(v: unknown): NewsRole[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = AUDIENCE_ROLES.filter(r => v.includes(r));
  return out.length === 0 || out.length === AUDIENCE_ROLES.length ? undefined : out;
}

export const AUDIENCE_USERS_MAX = 200;
/** Personnes choisies une à une (identifiants, sans doublon, 200 au plus). */
export function cleanAudienceUsers(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) { const id = typeof x === 'string' ? x.trim() : ''; if (id && id.length <= 80 && !out.includes(id)) out.push(id); if (out.length >= AUDIENCE_USERS_MAX) break; }
  return out;
}
/** Public réel d'une publication : rôles entiers + personnes choisies. `open` = tout le monde (rien de choisi, ou les trois rôles). */
export function newsAudience(post: { audience?: unknown; audience_users?: unknown } | null | undefined): { roles: NewsRole[]; users: string[]; open: boolean } {
  const raw = post && Array.isArray(post.audience) ? AUDIENCE_ROLES.filter(r => (post.audience as unknown[]).includes(r)) : [];
  const users = cleanAudienceUsers(post?.audience_users);
  const open = raw.length === AUDIENCE_ROLES.length || (raw.length === 0 && users.length === 0);
  return { roles: open ? [] : raw, users: open ? [] : users, open };
}
export const isRestricted = (post: { audience?: unknown; audience_users?: unknown } | null | undefined): boolean => !newsAudience(post).open;
/** Ce qu'on garde dans la publication : rien si tout le monde la voit ; sinon les rôles entiers et/ou les personnes choisies. */
export function pickAudience(roles: unknown, users: unknown): { audience?: NewsRole[]; audience_users?: string[] } {
  const a = newsAudience({ audience: roles, audience_users: users });
  if (a.open) return {};
  return { ...(a.roles.length ? { audience: a.roles } : {}), ...(a.users.length ? { audience_users: a.users } : {}) };
}

/** Comment une personne publie : `direct` (responsable ou réglage), `review` (en attente de validation) ou `off` (pas de publication). */
export function publishModeFor(role: unknown, policy: unknown): PublishMode {
  if (role === 'admin') return 'direct';
  if (role !== 'employee' && role !== 'team_lead' && role !== 'accountant') return 'off';
  return cleanNewsPolicy(policy)[role];
}

/** Une personne peut-elle voir cette publication ? Le responsable voit tout ; l'auteur voit toujours la sienne (même en attente ou refusée). */
export function canSeeNews(post: { author_id?: string; status?: string; audience?: unknown; audience_users?: unknown } | null | undefined, me: { id?: string; role?: unknown } | null | undefined): boolean {
  if (!post || !me) return false;
  if (me.role === 'admin') return true;
  if (post.author_id && post.author_id === me.id) return true;
  if (post.status !== undefined && post.status !== 'published') return false;
  const a = newsAudience(post);
  if (a.open) return true;
  return !!me.id && a.users.includes(me.id) || ((me.role === 'employee' || me.role === 'team_lead' || me.role === 'accountant') && a.roles.includes(me.role));
}

/** Peut-on modifier cette publication ? Le responsable : toutes. Les autres : seulement les leurs, déjà publiées, si le réglage l'autorise et si leur rôle peut encore publier. */
export function canEditNews(post: { author_id?: string; status?: string } | null | undefined, me: { id?: string; role?: unknown } | null | undefined, policy: unknown): boolean {
  if (!post || !me) return false;
  if (me.role === 'admin') return true;
  if (post.author_id !== me.id) return false;
  if (post.status !== undefined && post.status !== 'published') return false;
  return cleanNewsPolicy(policy).allow_edit && publishModeFor(me.role, policy) !== 'off';
}

const LABELS: Record<NewsRole, [string, string]> = { employee: ['Opérateurs', 'Operators'], team_lead: ['Chefs d\'équipe', 'Team leads'], accountant: ['Comptables', 'Accountants'] };
export const roleLabel = (r: NewsRole, lang: 'fr' | 'en'): string => LABELS[r][lang === 'en' ? 1 : 0];
/** Étiquette du public (« Tous » si non restreint). `users` = personnes choisies (leurs noms si on les connaît, sinon leur nombre). */
export function audienceLabel(aud: unknown, lang: 'fr' | 'en', users?: unknown, nameOf?: (id: string) => string | undefined): string {
  const a = newsAudience({ audience: aud, audience_users: users });
  if (a.open) return lang === 'en' ? 'Everyone' : 'Tous';
  const parts = a.roles.map(r => roleLabel(r, lang));
  if (a.users.length) {
    const names = nameOf ? a.users.map(nameOf).filter((n): n is string => !!n) : [];
    parts.push(names.length === a.users.length && names.length <= 3 ? names.join(', ') : lang === 'en' ? `${a.users.length} chosen ${a.users.length > 1 ? 'people' : 'person'}` : `${a.users.length} personne${a.users.length > 1 ? 's' : ''} choisie${a.users.length > 1 ? 's' : ''}`);
  }
  return parts.join(' + ');
}
export type { UserRole };
