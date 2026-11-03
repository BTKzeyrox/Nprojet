// Barre de navigation du bas, sur téléphone seulement : quatre ou cinq pages directes selon le rôle, plus le bouton Menu.
// Utilisé par : App.tsx.
// Pour modifier : les listes items, accountantItems et teamLeadItems donnent les pages par rôle ; les pages cachées dans les Conditions sont retirées. Elle se masque quand le clavier est ouvert.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Newspaper, MessageSquare, Calendar, ClipboardCheck, ClipboardList, Menu, Receipt, Building2, Landmark, Home, Wallet, Package } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { countPending } from '../utils/pendingCount';
import { teamPendingPosts } from '../utils/teamLead';
import { isViewHidden } from '../utils/moduleSwitch';
import { readCompany } from '../utils/companyRules';
import { isKeyboardOpen } from '../utils/keyboard';
import { User } from '../types';
import { useChatUnread } from '../utils/useChatUnread';
import { menuFor, locate } from '../utils/menuGroups';
import { mergedFor, useMenuMode, getLastTabs } from '../utils/menuMode';
import { goToEntry, bottomEntriesOf } from '../utils/menuNav';
import { getStatsTab } from '../utils/statsNav';

interface BottomNavProps {
  isAdmin: boolean;
  currentUser?: User | null;
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

// Barre du bas (téléphone seulement) : accès direct aux 4 pages les plus utilisées + « Menu »
export const BottomNav: React.FC<BottomNavProps> = ({ isAdmin, currentUser, activeView, onNavigate, onOpenMenu }) => {
  const chatUnread = useChatUnread(currentUser);
  const L = useApp().theme === 'light';
  const merged = mergedFor(currentUser?.role, useMenuMode());
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  // Clavier ouvert : on masque la barre (elle resterait cachée derrière le clavier ou gênerait la saisie)
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setKb(isKeyboardOpen(vv));
    const onFocus = () => { on(); setTimeout(on, 120); setTimeout(on, 400); };
    on();
    vv.addEventListener('resize', on);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      vv.removeEventListener('resize', on);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, []);

  // La hauteur réelle de la barre est publiée (--bnh) : la messagerie s'arrête juste au-dessus
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = navRef.current;
    if (!el || kb) { root.style.removeProperty('--bnh'); return; }
    const set = () => root.style.setProperty('--bnh', `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty('--bnh'); };
  }, [kb]);

  if (kb) return null;

  const pending = isAdmin ? countPending().total : 0;
  const items: { id: string; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'feed', label: 'Actualités', icon: Newspaper },
    { id: 'chat', label: 'Messages', icon: MessageSquare, badge: chatUnread },
    { id: 'calendar', label: 'Calendrier', icon: Calendar },
    isAdmin
      ? { id: 'validations', label: 'Validations', icon: ClipboardCheck, badge: pending }
      : { id: 'active-post', label: 'Ma mission', icon: ClipboardList },
  ];
  // Comptable : ses pages seulement (Actualités, Messages, Facturation, Clients)
  const accountantItems: typeof items = [
    { id: 'feed', label: 'Actualités', icon: Newspaper },
    { id: 'chat', label: 'Messages', icon: MessageSquare, badge: chatUnread },
    { id: 'invoices', label: 'Facturation', icon: Receipt },
    { id: 'treasury', label: 'Trésorerie', icon: Landmark },
    { id: 'clients', label: 'Clients', icon: Building2 },
  ];
  // Chef d'équipe : Actualités, Messages, Validations de son équipe
  const teamLeadItems: typeof items = [
    { id: 'feed', label: 'Actualités', icon: Newspaper },
    { id: 'chat', label: 'Messages', icon: MessageSquare, badge: chatUnread },
    { id: 'validations', label: 'Validations', icon: ClipboardCheck, badge: teamPendingPosts(currentUser, db.getUsers(), db.getPosts()).length },
  ];
  const hiddenPages = readCompany(db.getSettings().company).modules.hidden;
  const shownItems = (currentUser?.role === 'accountant' ? accountantItems : currentUser?.role === 'team_lead' ? teamLeadItems : items).filter(it => !isViewHidden(hiddenPages, it.id));
  // Menu simplifié (M22.6) : les entrées de la barre du bas (Actualités, Messages, Missions, Accueil…) à la place des pages seules
  const ICON: Record<string, React.ElementType> = { home: Home, feed: Newspaper, missions: ClipboardCheck, clients: Building2, money: Wallet, stock: Package, messages: MessageSquare };
  const groups = merged && currentUser ? menuFor(currentUser.role, hiddenPages) : [];
  const mergedShown = bottomEntriesOf(currentUser?.role).map(id => groups.find(g => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g).map(g => ({ id: g.id, label: g.fr, icon: ICON[g.id] || Calendar, badge: g.id === 'messages' ? chatUnread : g.id === 'missions' ? (currentUser?.role === 'team_lead' ? teamPendingPosts(currentUser, db.getUsers(), db.getPosts()).length : pending) : 0 }));
  const activeGroup = merged && currentUser ? locate(currentUser.role, activeView, hiddenPages, getStatsTab())?.group : undefined;
  const barItems = merged ? mergedShown : shownItems;
  const isOn = (id: string) => (merged ? activeGroup === id : activeView === id);
  const go = (id: string) => { if (merged) { const g = groups.find(x => x.id === id); if (g) { goToEntry(g, getLastTabs()[g.id], onNavigate); return; } } onNavigate(id); };

  const base = `df-bottomnav fixed left-0 right-0 bottom-0 z-30 md:hidden rounded-t-2xl border-t shadow-[0_-2px_12px_rgba(15,30,58,0.12)] ${L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-[#0f1e3a] border-slate-700'}`;
  const btn = (active: boolean) =>
    `relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors ${
      active ? (L ? 'bg-white/70 text-emerald-700' : 'bg-white/10 text-emerald-400') : L ? 'text-slate-600' : 'text-slate-300'
    }`;

  return (
    <nav ref={navRef} className={base} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Navigation principale">
      <div className="flex items-stretch gap-1 px-2 pt-1.5 pb-1.5">
        {barItems.map(it => {
          const I = it.icon;
          return (
            <button key={it.id} type="button" data-tour={`nav-${merged ? groups.find(g => g.id === it.id)?.tabs[0].view || it.id : it.id}`} onClick={() => go(it.id)} className={btn(isOn(it.id))} aria-current={isOn(it.id) ? 'page' : undefined}>
              <I className="w-5 h-5" />
              <span className="truncate max-w-full">{it.label}</span>
              {!!it.badge && it.badge > 0 && (
                <span className="absolute top-0.5 right-[18%] min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {it.badge > 99 ? '99+' : it.badge}
                </span>
              )}
            </button>
          );
        })}
        <button type="button" data-tour="nav-menu" onClick={onOpenMenu} className={btn(false)}>
          <Menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
};
