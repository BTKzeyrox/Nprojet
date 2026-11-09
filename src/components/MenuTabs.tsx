// Rangée d'onglets du menu simplifié (M22.6) : en haut de chaque entrée qui a plusieurs pages. Toujours au même endroit ; sur téléphone elle défile de côté.
// Utilisé par : App.tsx. Les règles (quels onglets, pour quel rôle) sont dans utils/menuGroups.ts.
import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { MenuGroup } from '../utils/menuGroups';

export const MENU_TABS_H = 56; // hauteur de la rangée (px) : la messagerie, qui prend tout l'écran, en tient compte
export const MenuTabs: React.FC<{ group: MenuGroup; activeTab: string; badges?: Record<string, number>; onPick: (tabId: string) => void; fixed?: boolean }> = ({ group, activeTab, badges = {}, onPick, fixed }) => {
  const { theme, lang } = useApp();
  const L = theme === 'light';
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { // l'onglet ouvert reste visible dans la rangée (téléphone : elle défile de côté)
    const el = rowRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && rowRef.current) rowRef.current.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, [activeTab, group.id]);
  return (
    <div ref={rowRef} data-menu-tabs={group.id} role="tablist" aria-label={lang === 'en' ? group.en : group.fr}
      style={fixed ? { height: MENU_TABS_H, top: 'calc(57px + var(--vvt, 0px))', left: 'var(--sbw, 0px)' } : { height: MENU_TABS_H }}
      className={`${fixed ? 'fixed right-0 z-20' : 'mb-3'} flex items-stretch gap-1.5 overflow-x-auto px-2 py-1.5 border-b ${L ? 'bg-white border-slate-200' : 'bg-[#0b1220] border-slate-700'}`}>
      {group.tabs.map(tb => {
        const on = tb.id === activeTab, n = badges[tb.id] || 0;
        return (
          <button key={tb.id} type="button" role="tab" aria-selected={on} data-menu-tab={tb.id} onClick={() => onPick(tb.id)}
            style={on ? { backgroundColor: '#1d4ed8', color: '#ffffff', borderColor: '#1d4ed8' } : undefined}
            className={`relative shrink-0 min-h-[44px] px-3.5 rounded-lg text-sm font-semibold whitespace-nowrap cursor-pointer border ${on ? '' : L ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50' : 'bg-white/5 text-slate-200 border-white/15 hover:bg-white/10'}`}>
            {lang === 'en' ? tb.en : tb.fr}
            {n > 0 && <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold">{n > 99 ? '99+' : n}</span>}
          </button>
        );
      })}
    </div>
  );
};
