// Les pages de la barre du bas (téléphone) selon le rôle. Utilisé par : components/BottomNav.tsx. Contrôlé par scripts/check-bottom-nav.ts.
import type React from 'react';
import { Home, LayoutDashboard, MessageSquare, Calendar } from 'lucide-react';
import { isViewHidden } from './moduleSwitch';

export interface NavItem { id: string; label: string; icon: React.ElementType; badge?: number }

/** Les pages de la barre du bas selon le rôle. Le comptable et le chef d'équipe n'ont pas de calendrier : leur page principale s'ouvre avec « Tableau de bord ». */
export function itemsFor(role: string | undefined, chatUnread: number, hiddenPages: string): NavItem[] {
  const all: NavItem[] = [
    { id: 'feed', label: 'Accueil', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'chat', label: 'Messages', icon: MessageSquare, badge: chatUnread },
    { id: 'calendar', label: 'Calendrier', icon: Calendar },
  ];
  const keep = role === 'accountant' || role === 'team_lead' ? all.filter(i => i.id !== 'calendar') : all;
  return keep.filter(i => !isViewHidden(hiddenPages, i.id));
}
