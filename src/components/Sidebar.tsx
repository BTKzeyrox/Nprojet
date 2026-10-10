import { Avatar } from './Avatar';
import { db } from '../db/store';
import React from 'react';
import {
  Layers,
  Gamepad2,
  Users,
  DollarSign,
  MessageSquare,
  Calendar,
  ShieldAlert,
  Image,
  LogOut,
  Home,
  ClipboardCheck,
  History,
  Settings,
  Swords,
  UserCheck,
  Shield,
  X,
  Sun,
  Moon,
  Globe,
  Download,
  Bug,
  LifeBuoy,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { User } from '../types';
import { countPending } from '../utils/pendingCount';
import { useSoundPrefs } from '../utils/notifSound';
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
  canSwitchMode?: boolean; // vrai pour l'admin : peut passer en mode booster
  boosterMode?: boolean;
  onToggleBoosterMode?: () => void;
  onReportProblem?: () => void; // ouvre « Signaler un problème »
  compact?: boolean; // bande d'icônes seulement
  onToggleCompact?: () => void; // ouvrir / fermer la bande
}

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
  const { theme, toggleTheme, lang, setLang, t, startLogoutAnimation } = useApp();
  const [sound, setSound] = useSoundPrefs();
  useLockBodyScroll(!!isOpenMobile); // menu ouvert : la page derrière ne défile plus
  const isAdmin = currentUser.role === 'admin';
  const isLight = theme === 'light';

  // Bilingual Navigation Items
  const navItems = [
    ...(isAdmin
      ? [
          {
            id: 'dashboard',
            label: 'Accueil',
            sublabel: 'Vue générale',
            icon: Home,
          },
          {
            id: 'validations',
            label: 'Validations',
            sublabel: 'Tout ce qui attend',
            icon: ClipboardCheck,
            badge: countPending().total > 0 ? String(countPending().total) : undefined,
            badgeColor: isLight
              ? 'bg-amber-100 text-amber-800 border-amber-300'
              : 'bg-amber-950 text-amber-300 border-amber-500/40',
          },
          {
            id: 'history',
            label: 'Historique',
            sublabel: 'Avances et demandes',
            icon: History,
          },
        ]
      : []),
    ...(isAdmin
      ? []
      : [
          {
            id: 'grid',
            label: t('nav_grid'),
            sublabel: '',
            icon: Layers,
            badge: `${db.getContracts().length} Postes`,
            badgeColor: isLight
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
          },
        ]),
    {
      id: 'active-post',
      label: isAdmin ? t('nav_active_post_admin') : t('nav_active_post_user'),
      sublabel: isAdmin ? t('nav_active_post_admin_sub') : t('nav_active_post_user_sub'),
      icon: Gamepad2,
    },
    ...(isAdmin
      ? [
          {
            id: 'employees',
            label: t('nav_employees'),
            sublabel: t('nav_employees_sub'),
            icon: Users,
          },
        ]
      : [
          {
            id: 'profile',
            label: t('nav_profile'),
            sublabel: t('nav_profile_sub'),
            icon: UserCheck,
          },
        ]),
    {
      id: 'advances',
      label: t('nav_advances'),
      sublabel: t('nav_advances_sub'),
      icon: DollarSign,
    },
    {
      id: 'chat',
      label: t('nav_chat'),
      sublabel: t('nav_chat_sub'),
      icon: MessageSquare,
    },
    {
      id: 'calendar',
      label: t('nav_calendar'),
      sublabel: t('nav_calendar_sub'),
      icon: Calendar,
    },
    ...(isAdmin
      ? [
          {
            id: 'security',
            label: t('nav_security'),
            sublabel: t('nav_security_sub'),
            icon: ShieldAlert,
            badge: t('badge_anticheat'),
            badgeColor: isLight
              ? 'bg-red-100 text-red-800 border-red-300'
              : 'bg-red-950 text-red-300 border-red-500/40',
          },
          {
            id: 'errors',
            label: 'Journal des erreurs',
            sublabel: 'Bugs et signalements',
            icon: Bug,
          },
          {
            id: 'settings',
            label: 'Réglages',
            sublabel: 'Prix, shifts, règles',
            icon: Settings,
          },
        ]
      : []),
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

  const handleLogoutClick = () => {
    // La confirmation et l'animation sont gérées par App
    onLogout();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        onClick={e => { if (compact && onToggleCompact && !(e.target as HTMLElement).closest('button')) onToggleCompact(); }}
        className={`${compact ? 'df-sb-compact w-[4.5rem]' : 'w-72'} fixed top-0 bottom-0 left-0 z-40 h-[100dvh] max-h-[100dvh] overflow-y-auto border-r flex flex-col justify-between transition-transform duration-300 ease-in-out overscroll-contain lg:translate-x-0 ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800 shadow-xl'
            : 'bg-[#090f17] border-slate-800/80 text-slate-100'
        } ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* 1. TOP HEADER: Brand & Identity (Fixed / shrink-0) */}
        <div className={`shrink-0 p-4 sm:p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0c1420] border-slate-800/80'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-0.5 shadow-lg flex items-center justify-center">
              <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${
                isLight ? 'bg-white' : 'bg-[#080d14]'
              }`}>
                <Shield className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <div className="df-sb-text">
              <div className="flex items-center gap-1.5">
                <span className="font-tactical font-black text-base tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                  DELTA FORCE
                </span>
              </div>
            </div>
          </div>

          {/* Bande d'icônes : ouvrir (ou refermer) le menu complet — tablette et grands écrans */}
          {onToggleCompact && (
            <button
              type="button"
              onClick={onToggleCompact}
              title={compact ? 'Ouvrir le menu' : 'Réduire le menu'}
              className="hidden md:inline-flex df-sb-toggle p-1.5 text-slate-400 hover:text-emerald-500 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              {compact ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          )}

          {/* Close button on mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 2. USER MINI CARD (Fixed / shrink-0) */}
        <div className={`shrink-0 px-4 py-3 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50/60 border-slate-200' : 'bg-[#0d1624] border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <Avatar src={currentUser.avatar_url} name={currentUser.name} className="w-8 h-8" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0d1624]" />
            </div>
            <div className="min-w-0 df-sb-text">
              <p className={`text-xs font-bold truncate font-tactical ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {currentUser.name}
              </p>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <span className={isAdmin ? 'text-amber-500 font-semibold' : 'text-emerald-500'}>
                  {isAdmin ? (
                  'ADMINISTRATEUR'
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {currentUser.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                    {currentUser.shift === 'day' ? 'SHIFT JOUR' : 'SHIFT NUIT'}
                  </span>
                )}
                </span>
              </div>
            </div>
          </div>

          <span className={`df-sb-text text-[9px] font-mono px-2 py-0.5 rounded border uppercase ${
            isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-800/80 text-slate-300 border-slate-700/60'
          }`}>
            {currentUser.performance_badge || 'Actif'}
          </span>
        </div>

        {/* 3. SCROLLABLE NAVIGATION AREA (flex-1 min-h-0 overflow-y-auto overscroll-contain) */}
        <div className="flex-1 min-h-[9rem] overflow-y-auto overscroll-contain p-3 space-y-1">

          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  title={compact ? item.label : undefined}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all group cursor-pointer ${
                    isActive
                      ? isLight
                        ? 'bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-sm'
                        : 'bg-gradient-to-r from-emerald-950/90 to-[#12222d] text-white border border-emerald-500/50 shadow-md shadow-emerald-950/40'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                      : 'text-slate-300 hover:text-white hover:bg-[#121c27] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : isLight
                          ? 'bg-slate-100 text-slate-500 group-hover:text-emerald-600 group-hover:bg-slate-200'
                          : 'bg-slate-800/60 text-slate-400 group-hover:text-emerald-400 group-hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </div>
                    <div className="min-w-0 df-sb-text">
                      <div className="text-xs font-tactical font-bold tracking-wide truncate">
                        {item.label}
                      </div>
                      {item.sublabel && (
                        <div className="text-[10px] opacity-60 font-mono truncate">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 font-bold ml-1.5 ${
                        item.badgeColor || (isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-800 text-slate-300 border-slate-700')
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 4. BOTTOM SECTION: Theme Toggle, Language Switcher & Logout */}
        <div className={`shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t space-y-2 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0c1420] border-slate-800/80'
        }`}>
          {/* Theme & Language Controls Row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-[#101b27] hover:bg-[#142333] border-slate-700 text-slate-300'
              }`}
              title={isLight ? t('theme_switch_dark') : t('theme_switch_light')}
            >
              {isLight ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="df-sb-text">Sombre</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="df-sb-text">Clair</span>
                </>
              )}
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === 'fr' ? 'zh' : 'fr')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-[#101b27] hover:bg-[#142333] border-slate-700 text-slate-300'
              }`}
              title="Changer de langue / 切换语言"
            >
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span className="df-sb-text">{lang === 'fr' ? '🇨🇳 中文' : '🇫🇷 FR'}</span>
            </button>
          </div>

          {!isAdmin && (
            <button
              type="button"
              onClick={() => setSound({ ...sound, on: !sound.on })}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                isLight ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#101b27] hover:bg-[#142333] border-slate-700 text-slate-300'
              }`}
              title="Son des notifications"
            >
              <span>{compact ? (sound.on ? '🔔' : '🔕') : sound.on ? '🔔 Son activé' : '🔕 Son coupé'}</span>
            </button>
          )}

          {canSwitchMode && onToggleBoosterMode && (
            <button
              type="button"
              onClick={() => {
                onToggleBoosterMode();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-tactical font-bold uppercase tracking-wider transition-all cursor-pointer ${
                boosterMode
                  ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-white'
                  : 'bg-[#101b27] hover:bg-[#142333] border-emerald-700/60 text-emerald-300'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span className="df-sb-text">{boosterMode ? 'Retour admin' : 'Mode booster'}</span>
            </button>
          )}

          {onReportProblem && db.getSettings().err_report_button !== false && (
            <button
              type="button"
              onClick={() => { onReportProblem(); if (onCloseMobile) onCloseMobile(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 border border-slate-600/60 text-slate-300 hover:text-white text-xs font-tactical font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span className="df-sb-text">Signaler un problème</span>
            </button>
          )}

          {/* Déconnexion Button with smooth animated exit */}
          <button
            onClick={handleLogoutClick}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-white text-xs font-tactical font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm active:scale-98"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="df-sb-text">{t('btn_logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
