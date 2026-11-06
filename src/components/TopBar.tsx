// Barre du haut : bouton du menu, recherche globale (pages, missions, opérateurs, comptes, dates), cloche de notifications et profil.
// Utilisé par : App.tsx.
// Pour modifier : props currentUser, onOpenMenu, onNavigate, onOpenOperator, onOpenProfile, operatorMode. Les types de résultat de recherche sont dans KIND_LABEL.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Menu, Search, X, Users, ClipboardList, Calendar, FileText, Newspaper, MessageSquare } from 'lucide-react';
import { User } from '../types';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { subscribeHealth } from '../utils/healthDb';
import { useChatUnread } from '../utils/useChatUnread';
import { remReload, remSubscribe } from '../utils/remindersState';
import { buildNotifications, markSeen, markAllRead, unreadCount, getSeen, SEEN_EVENT } from '../utils/notifications';
import { setValFilterIntent } from '../utils/navIntent';
import { setNavTarget, setChatThread } from '../utils/navTarget';
import { setStorageIntent } from '../utils/storageNav';
import { beepIfEnabled } from '../utils/notifSound';
import { readCompany } from '../utils/companyRules';
import { menuFor, placeOf } from '../utils/menuGroups';
import { mergedFor, useMenuMode } from '../utils/menuMode';
import { goToTab } from '../utils/menuNav';
import { NOTIF_FILTERS, filterNotifs, notifWhen, type NotifFilter } from '../utils/notifView';
import { ConnectionChip } from './ConnectionBanner';
import { Avatar } from './Avatar';

interface TopBarProps {
  currentUser: User;
  onOpenMenu: () => void;
  onNavigate: (view: string) => void;
  onOpenOperator: (userId: string) => void;
  /** Ouvre le formulaire de profil de la personne connectée (tous les rôles). */
  onOpenProfile: () => void;
  /** Le responsable est en vue opérateur : la pastille le rappelle. */
  operatorMode?: boolean;
  /** La page ouverte : le raccourci correspondant (Actualités, Messages) est mis en valeur. */
  activeView?: string;
}

interface Hit {
  id: string;
  title: string;
  sub: string;
  kind: 'page' | 'mission' | 'operator' | 'compte' | 'date';
  go: () => void;
}

const KIND_LABEL: Record<Hit['kind'], string> = { page: 'Page', mission: 'Mission', operator: 'Opérateur', compte: 'Compte', date: 'Date' };

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Barre du haut fixe (clair) : recherche globale + cloche
export const TopBar: React.FC<TopBarProps> = ({ currentUser, onOpenMenu, onNavigate, onOpenOperator, onOpenProfile, operatorMode = false, activeView }) => {
  const isAdmin = currentUser.role === 'admin';
  const L = useApp().theme === 'light';
  const [, force] = useState(0);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [nFilter, setNFilter] = useState<NotifFilter>('all');
  const box = useRef<HTMLDivElement>(null);
  const bellBox = useRef<HTMLDivElement>(null);
  const mbox = useRef<HTMLDivElement>(null);
  const [mSearch, setMSearch] = useState(false); // téléphone : la recherche s'étire sur toute la barre

  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => subscribeHealth(() => force(n => n + 1)), []); // cloche : la Santé se calcule au repos, on se réaffiche quand elle est prête
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const on = () => force(n => n + 1);
    window.addEventListener(SEEN_EVENT, on);
    return () => window.removeEventListener(SEEN_EVENT, on);
  }, []);
  useEffect(() => {
    // Clic OU toucher à l'extérieur : ferme la liste de résultats et, sur téléphone, le champ de recherche plein écran. Seul le champ réellement affiché compte (l'autre est caché).
    const shown = (r: React.RefObject<HTMLDivElement | null>) => !!r.current && r.current.getClientRects().length > 0;
    const away = (e: Event) => {
      const t = e.target as Node;
      const inSearch = (shown(box) && box.current!.contains(t)) || (shown(mbox) && mbox.current!.contains(t));
      if (!inSearch) { setOpen(false); setMSearch(false); }
      if (bellBox.current && !bellBox.current.contains(t)) setBellOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away, { passive: true });
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, []);

  const mergedMenu = mergedFor(currentUser.role, useMenuMode());
  const home = isAdmin ? 'dashboard' : 'grid';
  const pages = useMemo(
    () =>
      isAdmin
        ? [
            ['dashboard', 'Tableau de bord'], ['validations', 'Validations'], ['history', 'Historique'], ['security', 'Surveillance'], ['employees', 'Opérateurs'],
            ['active-post', 'Suivi des sessions'], ['chat', 'Messagerie'],
            ['calendar', 'Calendrier'], ['settings', 'Réglages'],
          ]
        : [['grid', 'Missions'], ['active-post', 'Ma mission'], ['chat', 'Messagerie'], ['calendar', 'Calendrier']],
    [isAdmin]
  );

  const hits: Hit[] = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return [];
    const out: Hit[] = [];
    if (mergedMenu) {
      // Menu simplifié : toutes les pages de MON menu, avec leur place (« Argent › Finances »)
      menuFor(currentUser.role, readCompany(db.getSettings().company).modules.hidden).forEach(g => g.tabs.forEach(tb => {
        if (norm(tb.fr).includes(s) || norm(tb.en).includes(s) || norm(g.fr).includes(s)) out.push({ id: `p-${g.id}-${tb.id}`, title: tb.fr, sub: placeOf(g, tb, 'fr'), kind: 'page', go: () => goToTab(tb, view => onNavigate(view)) });
      }));
    } else pages.forEach(([id, label]) => {
      if (norm(label).includes(s)) out.push({ id: `p-${id}`, title: label, sub: 'Ouvrir la page', kind: 'page', go: () => onNavigate(id) });
    });
    if (isAdmin) {
      db.getUsers().filter(u => u.role === 'employee').forEach(u => {
        if (norm(u.name).includes(s) || norm(u.username).includes(s))
          out.push({ id: `b-${u.id}`, title: u.name, sub: `@${u.username} · ${u.status === 'blocked' ? 'bloqué' : 'actif'}`, kind: 'operator', go: () => onOpenOperator(u.id) });
      });
    }
    const seenAcc = new Set<string>();
    // « p1 », « p01 », « mission 1 », « mission 01 », « #1 » : on va exactement à cette mission (pas aux missions 10 à 19)
    const pm = s.match(/^(?:mission|poste|p|#)\s*0*(\d{1,3})$/);
    const exactNum = pm ? Number(pm[1]) : null;
    const goMission = (n: number) => () => { setNavTarget(`mission-${n}`); onNavigate(home); };
    db.getContracts().forEach(c => {
      const byNumber = exactNum !== null ? c.post_number === exactNum : norm(`mission ${c.post_number}`).includes(s) || norm(`#${c.post_number}`).includes(s);
      if (norm(c.client_name).includes(s) || byNumber) {
        const hit: Hit = { id: `c-${c.id}`, title: `${c.client_name}`, sub: `Mission ${c.post_number}`, kind: 'mission', go: goMission(c.post_number) };
        if (exactNum !== null && c.post_number === exactNum) out.unshift(hit);
        else out.push(hit);
      }
      if (c.account_tag && norm(c.account_tag).includes(s) && !seenAcc.has(c.account_tag)) {
        seenAcc.add(c.account_tag);
        out.push({ id: `a-${c.id}`, title: c.account_tag, sub: `Mission de ${c.client_name}`, kind: 'compte', go: goMission(c.post_number) });
      }
    });
    const dates = Array.from(new Set(db.getPosts().map(p => p.date)));
    dates.forEach(d => {
      const [y, m, day] = d.split('-');
      if (`${day}/${m}`.includes(s) || d.includes(s)) out.push({ id: `d-${d}`, title: `${day}/${m}/${y}`, sub: 'Voir au calendrier', kind: 'date', go: () => { setNavTarget(`day-${d}`); onNavigate('calendar'); } });
    });
    return out.slice(0, 8);
  }, [q, isAdmin, mergedMenu, pages, home, onNavigate, onOpenOperator, db.getContracts().length, db.getUsers().length]);

  const pick = (h: Hit) => { setOpen(false); setQ(''); h.go(); };
  // Rappels (M25) : on recharge la liste au démarrage, toutes les 3 minutes et au retour sur l'appli ; la cloche montre ceux des dernières 24 h
  const [, setRemTick] = useState(0);
  useEffect(() => {
    void remReload();
    const un = remSubscribe(() => setRemTick(x => x + 1));
    const iv = window.setInterval(() => { void remReload(); setRemTick(x => x + 1); }, 180000);
    const vis = () => { if (document.visibilityState === 'visible') void remReload(); };
    document.addEventListener('visibilitychange', vis);
    return () => { un(); window.clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const chatUnread = useChatUnread(currentUser);
  const notifs = buildNotifications(currentUser);
  const count = unreadCount(currentUser, notifs);
  const seen = getSeen(currentUser);
  const shown = filterNotifs(notifs, nFilter, seen);
  // Bip court quand une NOUVELLE notification arrive (jamais au chargement de la page)
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(notifs.map(n => n.id));
    if (knownIds.current) { const fresh = notifs.filter(n => !knownIds.current!.has(n.id)).length; if (fresh > 0) beepIfEnabled(fresh); } // un son par nouvelle notification
    knownIds.current = ids;
  }, [notifs.map(n => n.id).join('|')]);

  const toggleBell = () => setBellOpen(v => !v);
  // Opérateur : les notifications passent en « vu » à la fermeture de la fenêtre
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !bellOpen && !isAdmin) {
      markSeen(currentUser, buildNotifications(currentUser).map(n => n.id));
      force(n => n + 1);
    }
    wasOpen.current = bellOpen;
  }, [bellOpen]);
  const icon = (k: Hit['kind']) => (k === 'operator' ? Users : k === 'mission' || k === 'compte' ? ClipboardList : k === 'date' ? Calendar : FileText);

  return (
    <>
    {/* Place réservée : la barre est en position fixe, le contenu ne passe pas dessous */}
    <div className="h-[57px] shrink-0" aria-hidden="true" />
    <header style={{ top: 'var(--vvt, 0px)', left: 'var(--sbw, 0px)' }} className={`fixed left-0 right-0 z-30 df-topbar border-b rounded-b-2xl ${L ? 'border-slate-200' : 'border-slate-800'} ${L ? 'text-slate-800' : 'text-slate-100'} shadow-[0_2px_12px_rgba(15,30,58,0.10)]`}>
      <div className="relative h-14 px-2.5 sm:px-4 flex items-center justify-between md:justify-start gap-1.5 sm:gap-2.5 md:gap-3">
        <button type="button" data-header-dashboard data-app-logo onClick={() => onNavigate(home)} title="Tableau de bord" aria-label="Tableau de bord" className={`md:hidden shrink-0 w-10 h-10 rounded-xl overflow-hidden border cursor-pointer ${L ? 'border-slate-200' : 'border-slate-700'}`}>
          <img src="/icon-192.png" alt="" width={40} height={40} className="w-full h-full object-cover" draggable={false} />
        </button>
        <button type="button" data-header-search onClick={() => { setMSearch(true); setOpen(true); }} title="Rechercher" aria-label="Rechercher" className={`md:hidden relative shrink-0 w-10 h-10 flex items-center justify-center rounded-full border cursor-pointer ${L ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
          <Search className="w-5 h-5" />
        </button>
        <div ref={box} className="hidden md:block relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); if (e.key === 'Escape') setOpen(false); }}
            placeholder="Rechercher…"
            className={`w-full h-9 pl-9 pr-9 rounded-full ${L ? 'bg-slate-100' : 'bg-slate-800'} border ${L ? 'border-slate-200' : 'border-slate-700'} text-sm ${L ? 'text-slate-800' : 'text-slate-100'} placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 ${L ? 'focus:bg-white' : 'focus:bg-slate-900'}`}
          style={{ borderRadius: 9999 }}
          />
          {q && (
            <button type="button" data-search-clear onClick={() => { setQ(''); setOpen(false); }} title="Effacer" aria-label="Effacer la recherche" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
          {open && q.trim() && (
            <div className={`absolute left-0 right-0 top-full mt-1 df-popover ${L ? 'bg-white' : 'bg-slate-900'} border ${L ? 'border-slate-200' : 'border-slate-700'} rounded-lg shadow-xl overflow-hidden z-40`}>
              {hits.length === 0 ? (
                <div className={`px-3 py-2.5 text-sm ${L ? 'text-slate-500' : 'text-slate-400'}`}>Aucun résultat.</div>
              ) : (
                hits.map(h => {
                  const I = icon(h.kind);
                  return (
                    <button key={h.id} onClick={() => pick(h)} className={`w-full text-left px-3 py-2 flex items-center gap-2.5 ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} cursor-pointer`}>
                      <I className={`w-4 h-4 ${L ? 'text-emerald-600' : 'text-emerald-500'} shrink-0`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${L ? 'text-slate-800' : 'text-slate-100'} truncate`}>{h.title}</span>
                        <span className={`block text-xs ${L ? 'text-slate-500' : 'text-slate-400'} truncate`}>{h.sub}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">{KIND_LABEL[h.kind]}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Actualités et Messages : toujours dans l'en-tête (plus de barre du bas, plus dans le menu latéral) */}
        <div className="contents md:flex md:items-center md:gap-3 md:shrink-0" data-header-shortcuts>
          {([['feed', 'Actualités', Newspaper, 0], ['chat', 'Messages', MessageSquare, chatUnread]] as const).map(([view, label, Icon, n]) => (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              title={label}
              aria-label={label}
              data-header-shortcut={view}
              aria-current={activeView === view ? 'page' : undefined}
              className={`relative shrink-0 w-10 h-10 flex items-center justify-center rounded-full border cursor-pointer ${activeView === view ? (L ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-emerald-500 bg-emerald-950/50 text-emerald-300') : L ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <Icon className="w-5 h-5" />
              {n > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{n > 99 ? '99+' : n}</span>}
            </button>
          ))}
        </div>

        <div className="hidden md:block" data-header-conn><ConnectionChip /></div>

        <div ref={bellBox} className="sm:relative shrink-0">
          <button
            onClick={toggleBell}
            title="Notifications"
            className={`relative shrink-0 w-10 h-10 flex items-center justify-center rounded-full border ${L ? 'border-slate-200' : 'border-slate-700'} ${L ? 'bg-slate-50' : 'bg-slate-800'} ${L ? 'text-slate-700' : 'text-slate-300'} ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} cursor-pointer`}
          >
            <Bell className="w-5 h-5" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className={`absolute max-sm:left-2 max-sm:right-2 sm:right-0 top-full mt-2 sm:w-[23rem] df-notif rounded-2xl overflow-hidden z-50 border-2 ${L ? 'bg-white border-[#0b2a4a]/20' : 'bg-[#0f1e3a] border-blue-400/40'} shadow-[0_18px_50px_-8px_rgba(2,12,40,0.55)]`}>
              <div className={`px-4 py-3 flex items-center justify-between ${L ? 'bg-[#0b2a4a] text-white' : 'bg-[#1d4ed8] text-white'}`}>
                <span className="text-sm font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</span>
                {count > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{count > 99 ? '99+' : count}</span>}
              </div>
              {notifs.length > 0 && (
                <div className={`px-4 py-2 flex items-center justify-between text-xs ${L ? 'bg-slate-50 text-slate-600' : 'bg-white/5 text-slate-300'}`} data-notif-bar>
                  <span>{count > 0 ? `${count} non lue${count > 1 ? 's' : ''}` : 'Tout est lu'}</span>
                  {count > 0 && <button type="button" onClick={() => { markAllRead(currentUser, notifs); force(n => n + 1); }} className="min-h-[32px] px-3 rounded-lg border border-current font-semibold cursor-pointer" data-notif-readall>Tout marquer comme lu</button>}
                </div>
              )}
              {notifs.length > 0 && (
                <div className={`px-2 py-2 flex gap-1.5 overflow-x-auto ${L ? 'bg-white' : 'bg-transparent'}`} data-notif-filters>
                  {NOTIF_FILTERS.map(f => (
                    <button key={f.id} type="button" onClick={() => setNFilter(f.id)} aria-pressed={nFilter === f.id} data-notif-filter={f.id}
                      className={`shrink-0 min-h-[32px] px-3 rounded-lg text-xs font-semibold border cursor-pointer ${nFilter === f.id ? 'bg-[#1d4ed8] text-white border-[#1d4ed8]' : L ? 'bg-white text-slate-700 border-slate-300' : 'bg-white/5 text-slate-200 border-white/20'}`}>{f.label}</button>
                  ))}
                </div>
              )}
              <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1.5">
                {notifs.length > 0 && shown.length === 0 && <div className={`px-3 py-6 text-sm text-center ${L ? 'text-slate-500' : 'text-slate-300'}`}>Aucune notification dans ce filtre.</div>}
                {notifs.length === 0 ? (
                  <div className={`px-3 py-6 text-sm text-center ${L ? 'text-slate-500' : 'text-slate-300'}`}>Rien de nouveau.</div>
                ) : (
                  shown.slice(0, 30).map(n => {
                    const tone = n.tone === 'urgent' ? 'bg-red-100 text-red-700' : n.tone === 'bad' ? 'bg-orange-100 text-orange-700' : n.tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
                    const fresh = !seen.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setBellOpen(false); markSeen(currentUser, [n.id]); if (n.filter) setValFilterIntent(n.filter); if (n.thread) setChatThread(n.thread); if (n.nav) setNavTarget(n.nav); if (n.storage) setStorageIntent(n.storage); onNavigate(n.view); }}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-3 rounded-xl border cursor-pointer ${fresh ? (L ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/15 border-blue-400/40') : (L ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-white/5 border-white/10 hover:bg-white/10')}`}
                      >
                        <span className={`mt-0.5 w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${tone}`}>
                          <Bell className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`block text-sm font-bold ${L ? 'text-slate-900' : 'text-white'}`}>{n.title}</span>
                            <span className={`shrink-0 text-[11px] tabular-nums ${L ? 'text-slate-500' : 'text-slate-400'}`} data-notif-time>{notifWhen(n.at)}</span>
                          </span>
                          {n.sub && <span className={`block text-xs mt-0.5 ${L ? 'text-slate-600' : 'text-slate-300'} break-words`}>{n.sub}</span>}
                        </span>
                        {fresh ? <span className="mt-1 w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" aria-label="Non lue" data-notif-unread /> : <span className={`mt-0.5 text-[10px] shrink-0 ${L ? 'text-slate-400' : 'text-slate-400'}`} data-notif-read>Lue</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button type="button" data-header-menu onClick={onOpenMenu} title="Ouvrir le menu" aria-label="Ouvrir le menu" className={`md:hidden shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border cursor-pointer ${L ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800'}`}>
          <Menu className={`w-5 h-5 ${L ? 'text-emerald-600' : 'text-emerald-500'}`} />
        </button>

        <button
          type="button"
          data-profile-pill
          onClick={onOpenProfile}
          title="Mon profil · En ligne"
          aria-label="Mon profil"
          className={`hidden md:block relative shrink-0 rounded-full p-0.5 border-2 cursor-pointer ${operatorMode ? 'border-amber-500' : L ? 'border-slate-200 hover:border-emerald-400' : 'border-slate-700 hover:border-emerald-500'}`}
        >
          <Avatar src={currentUser.avatar_url} name={currentUser.name} className="w-8 h-8 rounded-full" />
          <span data-presence-dot className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${L ? 'border-white' : 'border-slate-900'} bg-emerald-500`} />
        </button>

        {/* Téléphone : la recherche s'étire sur toute la largeur de l'en-tête (X = effacer, puis fermer) */}
        {mSearch && (
          <div ref={mbox} data-mobile-search className={`md:hidden absolute inset-0 z-40 flex items-center gap-2 px-2.5 rounded-b-2xl ${L ? 'bg-white' : 'bg-slate-900'}`}>
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                autoFocus
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true); }}
                onKeyDown={e => { if (e.key === 'Enter' && hits[0]) { pick(hits[0]); setMSearch(false); } if (e.key === 'Escape') { setQ(''); setMSearch(false); } }}
                placeholder="Rechercher…"
                className={`w-full h-10 pl-9 pr-3 rounded-xl ${L ? 'bg-slate-100 text-slate-800 border-slate-200 focus:bg-white' : 'bg-slate-800 text-slate-100 border-slate-700'} border text-sm placeholder:text-slate-400 focus:outline-none focus:border-emerald-500`}
              />
            </div>
            <button type="button" data-mobile-search-go onClick={() => { if (hits[0]) { pick(hits[0]); setMSearch(false); } }} title="Chercher" aria-label="Chercher" className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center cursor-pointer"><Search className="w-5 h-5" /></button>
            <button type="button" data-mobile-search-close onClick={() => { if (q) { setQ(''); } else { setMSearch(false); setOpen(false); } }} title={q ? 'Effacer' : 'Fermer'} aria-label={q ? 'Effacer' : 'Fermer'} className={`h-10 w-10 rounded-xl border flex items-center justify-center cursor-pointer ${L ? 'border-slate-200 text-slate-600' : 'border-slate-700 text-slate-300'}`}><X className="w-5 h-5" /></button>
            {open && q.trim() && (
              <div className={`absolute left-2 right-2 top-full mt-1 df-popover ${L ? 'bg-white' : 'bg-slate-900'} border ${L ? 'border-slate-200' : 'border-slate-700'} rounded-lg shadow-xl overflow-hidden`}>
                {hits.length === 0 ? (
                  <div className={`px-3 py-2.5 text-sm ${L ? 'text-slate-500' : 'text-slate-400'}`}>Aucun résultat.</div>
                ) : hits.map(h => {
                  const I = icon(h.kind);
                  return (
                    <button key={h.id} onClick={() => { pick(h); setMSearch(false); }} className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} cursor-pointer`}>
                      <I className={`w-4 h-4 ${L ? 'text-emerald-600' : 'text-emerald-500'} shrink-0`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${L ? 'text-slate-800' : 'text-slate-100'} truncate`}>{h.title}</span>
                        <span className={`block text-xs ${L ? 'text-slate-500' : 'text-slate-400'} truncate`}>{h.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
    </>
  );
};
