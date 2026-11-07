// Règle pure (sans écran, sans serveur) : sessions en attente des opérateurs de l'équipe d'un Chef d'équipe, les plus anciennes d'abord.
// Utilisé par : BottomNav.tsx, Sidebar.tsx et TeamValidations.tsx.
// Pour modifier : qui décide pour qui vient de canDecidePost (roles.ts) ; un autre rôle reçoit une liste vide.
import type { PostSession, User } from '../types';
import { canDecidePost } from './roles';

/** (M26.5c : une saisie faite par le Chef d'équipe lui-même n'apparaît pas ici : personne ne valide sa propre saisie.)
 *  Sessions en attente (début ou fin) des opérateurs de l'équipe du Chef d'équipe, les plus anciennes d'abord. Rien d'autre : jamais un autre groupe. */
export function teamPendingPosts(me: User | null | undefined, users: User[], posts: PostSession[]): PostSession[] {
  if (!me || me.role !== 'team_lead') return [];
  const mates = new Map(users.filter(u => canDecidePost(me, u)).map(u => [u.id, u] as const));
  return posts
    .filter(p => (p.status === 'pending_start' || p.status === 'pending_end') && mates.has(p.employee_id) && !((p as any).entered_by && (p as any).entered_by === me.id))
    .sort((a, b) => (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || ''));
}
