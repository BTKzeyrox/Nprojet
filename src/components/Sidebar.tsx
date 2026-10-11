import { Avatar } from './Avatar';
import { db } from '../db/store';
import React from 'react';
import {
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
  Eye,
  UserCheck,
  X,
  Sun,
  Moon,
  Bug,
  LifeBuoy,
  LogOut,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { User } from '../types';
import { countPending } from '../utils/pendingCount';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  currentUser: User;
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onOpenEmployeeCV?: (employee: User) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  canSwitchMode?: boolean; // vrai pour le responsable : peut passer en vue opérateur
  boosterMode?: boolean;
  onToggleBoosterMode?: () => void;
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
  canSwitchMode = false,
  boosterMode = false,
  onToggleBoosterMode,
  compact = false,
  onToggleCompact,
}) => {
  const { theme, t } = useApp();
  useLockBodyScroll(!!isOpenMobile); // menu ouvert : la page derrière ne défile plus
  const isAdmin = currentUser.role === 'admin';
  const isLight = theme === 'light';
  const pending = countPending().total;

  const navItems: { id: string; label: string; icon: React.ElementType; badge?: string; tone?: 'alert' | 'info' }[] = [
    { id: 'feed', label: 'Actualités', icon: Newspaper },
    ...(isAdmin
      ? [
          { id: 'dashboard', label: 'Tableau de bord', icon: Home },
          { id: 'validations', label: 'Validations', icon: ClipboardCheck, badge: pending > 0 ? String(pending) : undefined, tone: 'alert' as const },
          { id: 'history', label: 'Historique', icon: History },
        ]
      : [
          { id: 'grid', label: t('nav_grid'), icon: Layers, badge: String(db.getContracts().length), tone: 'info' as const },
        ]),
    { id: 'active-post', label: isAdmin ? t('nav_active_post_admin') : t('nav_active_post_user'), icon: ClipboardList },
    isAdmin
      ? { id: 'employees', label: t('nav_employees'), icon: Users }
      : { id: 'profile', label: t('nav_profile'), icon: UserCheck },
    { id: 'chat', label: t('nav_chat'), icon: MessageSquare },
    { id: 'calendar', label: t('nav_calendar'), icon: Calendar },
    ...(isAdmin ? [{ id: 'errors', label: 'Journal des erreurs', icon: Bug }] : []),
    { id: 'settings', label: 'Réglages', icon: Settings },
  ];

  const handleItemClick = (id: string) => {
    if (id === 'profile' && onOpenEmployeeCV) {
      onOpenEmployeeCV(currentUser);
      if (onCloseMobile) onCloseMobile();
      return;
    }
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  const navy = '#0b2a4a';

  return (
    <>
      {/* Fond sombre derrière le menu sur téléphone */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        onClick={e => { if (compact && onToggleCompact && !(e.target as HTMLElement).closest('button')) onToggleCompact(); }}
        className={`df-sb ${compact ? 'df-sb-compact w-[4.5rem]' : 'w-72'} fixed top-0 bottom-0 left-0 z-40 h-[100dvh] max-h-[100dvh] overflow-y-auto border-r flex flex-col justify-between transition-transform duration-300 ease-in-out overscroll-contain lg:translate-x-0 ${
          isLight ? 'bg-white border-slate-200 text-slate-800 shadow-sm' : 'bg-[#0a1628] border-slate-800 text-slate-100'
        } ${isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* 1. En-tête : logo et nom */}
        <div className={`shrink-0 p-4 border-b flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-sm"
              style={{ background: navy }}
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
              className="hidden md:inline-flex df-sb-toggle p-1.5 rounded-lg transition-colors cursor-pointer df-sb-icon"
            >
              {compact ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          )}

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg transition-colors df-sb-icon"
              title="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 2. Profil */}
        <div className="df-sb-profile shrink-0 px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <Avatar src={currentUser.avatar_url} name={currentUser.name} className="w-9 h-9" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0 df-sb-text">
              <p className="df-sb-title text-sm font-semibold truncate">{currentUser.name}</p>
              <p className="df-sb-sub text-xs inline-flex items-center gap-1">
                {isAdmin ? (
                  'Responsable'
                ) : (
                  <>
                    {currentUser.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                    {currentUser.shift === 'day' ? 'Vacation jour' : 'Vacation nuit'}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Navigation */}
        <div className="flex-1 min-h-[9rem] overflow-y-auto overscroll-contain p-3">
          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  title={compact ? item.label : undefined}
                  onClick={() => handleItemClick(item.id)}
                                    aria-current={isActive ? 'page' : undefined}
                  className="df-sb-item w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-[18px] h-[18px] shrink-0" />
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
          {canSwitchMode && onToggleBoosterMode && (
            <button
              type="button"
              onClick={() => {
                onToggleBoosterMode();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                boosterMode ? 'df-sb-warn' : 'df-sb-btn'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span className="df-sb-text">{boosterMode ? 'Retour responsable' : 'Vue opérateur'}</span>
            </button>
          )}

          {onReportProblem && db.getSettings().err_report_button !== false && (
            <button
              type="button"
              onClick={() => { onReportProblem(); if (onCloseMobile) onCloseMobile(); }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors cursor-pointer df-sb-btn`}
            >
              <LifeBuoy className="w-4 h-4" />
              <span className="df-sb-text">Signaler un problème</span>
            </button>
          )}

          <button
            onClick={onLogout}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
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
