// Fiche « À propos » d'une personne ou d'un groupe dans la messagerie : règles pures (quoi montrer, quelles actions), sans écran ni serveur.
// Vie privée : un opérateur ne voit jamais de donnée d'argent ni de dossier RH d'un collègue ; le téléphone n'est montré qu'au responsable.
import type { User } from '../types';

export type AboutAction = 'write' | 'pin' | 'unpin' | 'hide' | 'show' | 'full_profile' | 'group_info';
export interface AboutThread { id: string; kind: 'all' | 'user' | 'group' | 'pair'; title: string; subtitle: string; user?: User }
export interface AboutFacts { label: string; value: string }
export interface About { title: string; subtitle: string; facts: AboutFacts[]; actions: AboutAction[] }

const ROLE_FR: Record<string, string> = { admin: 'Responsable', employee: 'Opérateur', accountant: 'Comptable', team_lead: "Chef d'équipe" };
const ROLE_EN: Record<string, string> = { admin: 'Manager', employee: 'Operator', accountant: 'Accountant', team_lead: 'Team lead' };
export const roleLabel = (role: unknown, lang: 'fr' | 'en' = 'fr'): string => (lang === 'en' ? ROLE_EN : ROLE_FR)[String(role)] || (lang === 'en' ? 'Member' : 'Membre');

export interface AboutOptions { viewer: Pick<User, 'id' | 'role'>; pinned: boolean; hidden: boolean; lang?: 'fr' | 'en'; canOpenFullProfile?: boolean }

export function aboutThread(t: AboutThread, o: AboutOptions): About {
  const en = o.lang === 'en';
  const tt = (fr: string, e: string) => (en ? e : fr);
  const isAdmin = o.viewer.role === 'admin';
  const actions: AboutAction[] = [];
  const facts: AboutFacts[] = [];
  if (t.kind === 'user' && t.user) {
    const u = t.user;
    facts.push({ label: tt('Rôle', 'Role'), value: roleLabel(u.role, o.lang) });
    if (u.username) facts.push({ label: tt('Identifiant', 'Username'), value: `@${u.username}` });
    if (u.role === 'employee' || u.role === 'team_lead') {
      if (u.team) facts.push({ label: tt('Équipe', 'Team'), value: u.team });
      facts.push({ label: tt('Poste', 'Shift'), value: u.shift === 'night' ? tt('Nuit', 'Night') : tt('Jour', 'Day') });
    }
    facts.push({ label: tt('État', 'Status'), value: u.is_online ? tt('En ligne', 'Online') : tt('Hors ligne', 'Offline') });
    if (isAdmin && u.phone) facts.push({ label: tt('Téléphone', 'Phone'), value: u.phone });
    actions.push('write');
    if (o.canOpenFullProfile) actions.push('full_profile');
  } else if (t.kind === 'group') {
    facts.push({ label: tt('Type', 'Type'), value: tt('Groupe', 'Group') });
    facts.push({ label: tt('Membres', 'Members'), value: t.subtitle });
    actions.push('write', 'group_info');
  } else if (t.kind === 'all') {
    facts.push({ label: tt('Type', 'Type'), value: tt('Groupe de toute l\'équipe', 'Group of the whole team') });
    actions.push('write');
  } else {
    facts.push({ label: tt('Type', 'Type'), value: tt('Entre opérateurs (lecture seule)', 'Between operators (read only)') });
  }
  if (t.kind !== 'all') { // le groupe général est toujours en tête et ne se cache pas
    actions.push(o.pinned ? 'unpin' : 'pin');
    actions.push(o.hidden ? 'show' : 'hide');
  }
  return { title: t.title, subtitle: t.subtitle, facts, actions };
}
