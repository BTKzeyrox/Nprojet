import type { PostSession, User } from '../types';
import { canDecidePost } from './roles';

/** Sessions en attente (début ou fin) des opérateurs de l'équipe du Chef d'équipe, les plus anciennes d'abord. Rien d'autre : jamais un autre groupe. */
export function teamPendingPosts(me: User | null | undefined, users: User[], posts: PostSession[]): PostSession[] {
  if (!me || me.role !== 'team_lead') return [];
  const mates = new Map(users.filter(u => canDecidePost(me, u)).map(u => [u.id, u] as const));
  return posts
    .filter(p => (p.status === 'pending_start' || p.status === 'pending_end') && mates.has(p.employee_id))
    .sort((a, b) => (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || ''));
}
