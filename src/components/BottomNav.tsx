import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Newspaper, MessageSquare, Calendar, ClipboardCheck, ClipboardList, Menu } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { countPending } from '../utils/pendingCount';
import { isKeyboardOpen } from '../utils/keyboard';

interface BottomNavProps {
  isAdmin: boolean;
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

// Barre du bas (téléphone seulement) : accès direct aux 4 pages les plus utilisées + « Menu »
export const BottomNav: React.FC<BottomNavProps> = ({ isAdmin, activeView, onNavigate, onOpenMenu }) => {
  const L = useApp().theme === 'light';
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
    { id: 'chat', label: 'Messages', icon: MessageSquare },
    { id: 'calendar', label: 'Calendrier', icon: Calendar },
    isAdmin
      ? { id: 'validations', label: 'Validations', icon: ClipboardCheck, badge: pending }
      : { id: 'active-post', label: 'Mon poste', icon: ClipboardList },
  ];

  const base = `df-bottomnav fixed left-0 right-0 bottom-0 z-30 md:hidden rounded-t-2xl border-t shadow-[0_-2px_12px_rgba(15,30,58,0.12)] ${L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-[#0f1e3a] border-slate-700'}`;
  const btn = (active: boolean) =>
    `relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors ${
      active ? (L ? 'bg-white/70 text-emerald-700' : 'bg-white/10 text-emerald-400') : L ? 'text-slate-600' : 'text-slate-300'
    }`;

  return (
    <nav ref={navRef} className={base} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Navigation principale">
      <div className="flex items-stretch gap-1 px-2 pt-1.5 pb-1.5">
        {items.map(it => {
          const I = it.icon;
          return (
            <button key={it.id} type="button" onClick={() => onNavigate(it.id)} className={btn(activeView === it.id)} aria-current={activeView === it.id ? 'page' : undefined}>
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
        <button type="button" onClick={onOpenMenu} className={btn(false)}>
          <Menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
};
