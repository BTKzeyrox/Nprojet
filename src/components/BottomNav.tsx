// Barre de navigation du bas, sur téléphone seulement : Accueil, Tableau de bord, Messages, Calendrier et le menu (3 barres).
// Utilisé par : App.tsx. Contrôlé par scripts/check-bottom-nav.ts.
// Pour modifier : la liste itemsFor() donne les pages par rôle ; les pages cachées dans les Conditions sont retirées. Elle se masque quand le clavier est ouvert.
// Elle publie sa hauteur dans --bnh (la messagerie, les boutons Haut/Bas et les messages s'arrêtent juste au-dessus).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { itemsFor } from '../utils/bottomNavItems';
import { readCompany } from '../utils/companyRules';
import { isKeyboardOpen } from '../utils/keyboard';
import { User } from '../types';
import { useChatUnread } from '../utils/useChatUnread';

interface BottomNavProps {
  currentUser?: User | null;
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentUser, activeView, onNavigate, onOpenMenu }) => {
  const chatUnread = useChatUnread(currentUser);
  const L = useApp().theme === 'light';
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  // Clavier ouvert : on masque la barre (elle gênerait la saisie)
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
    return () => { vv.removeEventListener('resize', on); document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onFocus); };
  }, []);

  // La hauteur réelle de la barre est publiée (--bnh), puis retirée si la barre est cachée
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
  const hiddenPages = readCompany(db.getSettings().company).modules.hidden;
  const items = itemsFor(currentUser?.role, chatUnread, hiddenPages);

  const btn = (active: boolean) =>
    `relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors ${active ? (L ? 'bg-white/70 text-emerald-700' : 'bg-white/10 text-emerald-400') : L ? 'text-slate-600' : 'text-slate-300'}`;

  return (
    <nav ref={navRef} data-bottom-nav className={`df-bottomnav fixed left-0 right-0 bottom-0 z-30 md:hidden rounded-t-2xl border-t shadow-[0_-2px_12px_rgba(15,30,58,0.12)] ${L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-[#0f1e3a] border-slate-700'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Navigation principale">
      <div className="flex items-stretch gap-1 px-2 pt-1.5 pb-1.5">
        {items.map(it => {
          const I = it.icon;
          const on = activeView === it.id;
          return (
            <button key={it.id} type="button" data-bottom-item={it.id} onClick={() => onNavigate(it.id)} className={btn(on)} aria-current={on ? 'page' : undefined}>
              <I className="w-5 h-5" />
              <span className="max-w-full overflow-hidden text-ellipsis text-nowrap [overflow-wrap:normal] text-[10px] min-[360px]:text-[11px]">{it.label}</span>
              {!!it.badge && it.badge > 0 && (
                <span className="absolute top-0.5 right-[18%] min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{it.badge > 99 ? '99+' : it.badge}</span>
              )}
            </button>
          );
        })}
        <button type="button" data-bottom-menu onClick={onOpenMenu} className={btn(false)} aria-label="Ouvrir le menu">
          <Menu className="w-5 h-5" />
          <span className="text-[10px] min-[360px]:text-[11px]">Menu</span>
        </button>
      </div>
    </nav>
  );
};
