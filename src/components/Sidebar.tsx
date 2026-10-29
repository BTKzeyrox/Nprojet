import { Avatar } from './Avatar';
import { db } from '../db/store';
import { viewAllowedFor } from '../utils/roles';
import { isViewHidden } from '../utils/moduleSwitch';
import { readCompany } from '../utils/companyRules';
import { teamPendingPosts } from '../utils/teamLead';
import React from 'react';
import {
  BookOpen,
  Briefcase,
  Gauge,
  Layers,
  Newspaper,
  ClipboardList,
  Users,
  MessageSquare,
  Calendar,
  Home,
  ClipboardCheck,
  History,
  Settings,
  UserCheck,
  X,
  Sun,
  Moon,
  Bug,
  LifeBuoy,
  LogOut,
  PanelLeftOpen,
  PanelLeftClose,
  BarChart3,
  TrendingUp,
  Wallet,
  Building2,
  Receipt,
  Truck,
  Package,
  HeartPulse,
  Award,
  Table2,
  Landmark,
} from 'lucide-react';
import { User } from '../types';
import { countPending } from '../utils/pendingCount';
import { getMenuBadges, subscribeHealth } from '../utils/healthDb';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { useApp } from '../context/AppContext';
import { useChatUnread } from '../utils/useChatUnread';
import { getAdminAlerts } from '../utils/alertsDb';
import { badgeAccess } from '../utils/usePerformance';

interface SidebarProps {
  currentUser: User;
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onOpenEmployeeCV?: (employee: User) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onReportProblem?: () => void; // ouvre « Signaler un problème »
  compact?: boolean; // bande d'icônes seulement
  onToggleCompact?: () => void; // ouvrir / fermer la bande
}

// Menu de gauche : sobre, bleu marine, sans sous-titres.
// La structure (4 blocs : en-tête, profil, navigation, bas) est utilisée par les règles .df-sb-compact de index.css.
export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeView,
  onNavigate,
  onLogout,
  onReportProblem,
  onOpenEmployeeCV,
  isOpenMobile = false,
  onCloseMobile,
  compact = false,
  onToggleCompact,
}) => {
  const { theme, t, lang } = useApp();
  // Menu ouvert sur téléphone (moins de 768 px) : la page derrière ne défile plus. Dès 768 px (tablette, ordinateur : menu toujours visible,
  // ou agrandi par le bouton), la page garde son défilement : sinon elle restait figée.
  const [isWide, setIsWide] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setIsWide(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, []);
  const [, setHealthTick] = React.useState(0);
  React.useEffect(() => subscribeHealth(() => setHealthTick(n => n + 1)), []); // le calcul des pastilles se fait au repos : on se réaffiche quand il est prêt
  useLockBodyScroll(!!isOpenMobile && !isWide);
  const isAdmin = currentUser.role === 'admin';
  const isAccountant = currentUser.role === 'accountant';
  const isTeamLead = currentUser.role === 'team_lead';
  const teamPending = isTeamLead ? teamPendingPosts(currentUser, db.getUsers(), db.getPosts()).length : 0; // sessions de SON équipe seulement
  const isLight = theme === 'light';
  const pending = countPending().total;
  const chatUnread = useChatUnread(currentUser);
  const health = isAdmin ? getMenuBadges() : { byItem: {} as Record<string, { count: number; urgent: boolean }>, total: 0, urgent: 0 }; // pastilles « Santé du site » (admin seulement)
  const alertCount = isAdmin ? getAdminAlerts().length : 0; // pastille rouge : alertes de l'accueil (argent, stock, avances)

  const navItems: { id: string; label: string; icon: React.ElementType; badge?: string; tone?: 'alert' | 'info' }[] = [
    { id: 'feed', label: 'Actualités', icon: Newspaper },
    ...(isAdmin || isAccountant || isTeamLead
      ? [
          { id: 'dashboard', label: 'Tableau de bord', icon: Home },
          { id: 'validations', label: 'Validations', icon: ClipboardCheck, badge: (isTeamLead ? teamPending : pending) > 0 ? String(isTeamLead ? teamPending : pending) : undefined, tone: 'alert' as const },
          { id: 'history', label: 'Historique', icon: History },
          { id: 'clients', label: 'Clients', icon: Building2 },
          { id: 'invoices', label: 'Facturation', icon: Receipt },
          { id: 'accounting', label: 'Comptabilité', icon: BookOpen },
          ...(isAccountant ? [{ id: 'treasury', label: 'Trésorerie', icon: Landmark }] : []),
          { id: 'purchasing', label: 'Achats', icon: Truck },
          ...(isAdmin ? [{ id: 'storage', label: 'Stockage', icon: Package }] : []),
          { id: 'performance', label: 'Performance', icon: BarChart3 },
          { id: 'stats', label: 'Statistiques', icon: TrendingUp, badge: alertCount > 0 ? String(alertCount) : undefined, tone: 'alert' as const },
        ]
      : [
          { id: 'grid', label: t('nav_grid'), icon: Layers, badge: String(db.getContracts().length), tone: 'info' as const },
        ]),
    ...(isAdmin ? [{ id: 'direction', label: 'Direction', icon: Gauge }] : []),
    { id: 'active-post', label: isAdmin ? t('nav_active_post_admin') : t('nav_active_post_user'), icon: ClipboardList },
    isAdmin
      ? { id: 'employees', label: t('nav_employees'), icon: Users }
      : { id: 'profile', label: t('nav_profile'), icon: UserCheck },
    { id: 'hr', label: isAdmin ? 'Ressources humaines' : 'Mon dossier et congés', icon: Briefcase },
    { id: 'chat', label: t('nav_chat'), icon: MessageSquare, badge: chatUnread > 0 ? String(chatUnread) : undefined, tone: 'alert' as const },
    { id: 'calendar', label: t('nav_calendar'), icon: Calendar },
    ...(currentUser.role === 'employee' && badgeAccess().enabled && badgeAccess().seesBadges ? [{ id: 'my-performance', label: lang === 'en' ? 'My performance' : 'Ma performance', icon: Award }] : []), // module 3 : son propre score et ses badges
    ...(currentUser.role === 'employee' ? [{ id: 'sheets', label: lang === 'en' ? 'My tables' : 'Mes tableaux', icon: Table2 }] : isAdmin ? [{ id: 'sheets', label: lang === 'en' ? 'Team tables' : 'Tableaux de l\'équipe', icon: Table2 }] : []), // module 12 : saisie type Excel (l'admin lit celles de l'équipe)
    { id: 'advances', label: isAdmin ? 'Paie' : 'Ma paie', icon: Wallet },
    ...(isAdmin ? [{ id: 'health', label: 'Santé du site', icon: HeartPulse, badge: health.total > 0 ? String(health.total) : undefined, tone: 'alert' as const }] : []),
    ...(isAdmin ? [{ id: 'errors', label: 'Journal des erreurs', icon: Bug }] : []),
    { id: 'settings', label: 'Réglages', icon: Settings },
  ].filter(it => viewAllowedFor(currentUser.role, it.id) && !isViewHidden(readCompany(db.getSettings().company).modules.hidden, it.id)).map(it => (isAdmin && !it.badge && health.byItem[it.id] ? { ...it, badge: String(health.byItem[it.id].count), tone: 'alert' as const } : it));

  // Déjà dans la barre du bas (téléphone) : on ne les répète pas dans le menu
  const inBottomBar = ['feed', 'chat', 'calendar', isAdmin || isTeamLead ? 'validations' : 'active-post'];

  const handleItemClick = (id: string) => {
    if (id === 'profile' && onOpenEmployeeCV) {
      onOpenEmployeeCV(currentUser);
      if (onCloseMobile) onCloseMobile();
      return;
    }
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  const navy = 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)';

  return (
    <>
      {/* Fond sombre derrière le menu sur téléphone */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 lg:hidden transition-opacity"
          style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.35)' : 'rgba(8,16,32,0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        onClick={e => { if (compact && onToggleCompact && !(e.target as HTMLElement).closest('button')) onToggleCompact(); }}
        className={`df-sb ${compact ? 'df-sb-compact w-[4.5rem]' : 'w-72'} fixed top-3 bottom-3 left-3 z-40 h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-in-out overscroll-contain lg:translate-x-0 ${
          isLight ? 'bg-white border-slate-200 text-slate-800 shadow-sm' : 'bg-[#0a1628] border-slate-800 text-slate-100'
        } ${isOpenMobile ? 'translate-x-0' : '-translate-x-[110%] md:translate-x-0'}`}
      >
        {/* 1. En-tête : logo et nom */}
        <div className="shrink-0 p-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-black shadow-sm"
              style={{ background: navy, color: '#ffffff' }}
              aria-hidden="true"
            >
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="df-sb-text">
              <span className="df-sb-title block text-base font-extrabold leading-tight">Gestion Pro</span>
              <span className="df-sb-sub block text-[11px] leading-tight">Suivi des missions</span>
            </div>
          </div>

          {onToggleCompact && (
            <button
              type="button"
              onClick={onToggleCompact}
              title={compact ? 'Ouvrir le menu' : 'Réduire le menu'}
              className="hidden md:inline-flex df-sb-toggle p-1.5 rounded-full transition-colors cursor-pointer df-sb-icon"
            >
              {compact ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          )}

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-full transition-colors df-sb-icon"
              title="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>


        {/* 3. Navigation */}
        <div className="flex-1 min-h-[9rem] overflow-y-auto overscroll-contain p-3">
          <nav className="space-y-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  title={compact ? item.label : undefined}
                  onClick={() => handleItemClick(item.id)}
                                    aria-current={isActive ? 'page' : undefined}
                  className={`df-sb-item w-full ${inBottomBar.includes(item.id) ? 'hidden md:flex' : 'flex'} items-center justify-between pl-2 pr-3 py-2 rounded-lg text-left transition-colors cursor-pointer`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="df-sb-tile w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="df-sb-text text-sm font-semibold truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`df-sb-badge text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${item.tone === 'alert' ? 'df-sb-alert' : ''}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 4. Bas : vue opérateur, signaler un problème, déconnexion */}
        <div className={`shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t space-y-2 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>

          {onReportProblem && !isAdmin && db.getSettings().err_report_button !== false && (
            <button
              type="button"
              onClick={() => { onReportProblem(); if (onCloseMobile) onCloseMobile(); }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer df-sb-btn`}
            >
              <LifeBuoy className="w-4 h-4" />
              <span className="df-sb-text">Signaler un problème</span>
            </button>
          )}

          <button
            onClick={onLogout}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${
              'df-sb-danger'
            }`}
          >
            <LogOut className="w-4 h-4" />
            <span className="df-sb-text">{t('btn_logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
