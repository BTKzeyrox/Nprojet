import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Menu, Search, Shield, Users, ClipboardList, Calendar, FileText } from 'lucide-react';
import { User } from '../types';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { subscribeHealth } from '../utils/healthDb';
import { buildNotifications, markSeen, markAllRead, unreadCount, getSeen, SEEN_EVENT } from '../utils/notifications';
import { setValFilterIntent } from '../utils/navIntent';
import { setNavTarget, setChatThread } from '../utils/navTarget';
import { beepIfEnabled } from '../utils/notifSound';
import { ConnectionChip } from './ConnectionBanner';

interface TopBarProps {
  currentUser: User;
  onOpenMenu: () => void;
  onNavigate: (view: string) => void;
  onOpenOperator: (userId: string) => void;
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
export const TopBar: React.FC<TopBarProps> = ({ currentUser, onOpenMenu, onNavigate, onOpenOperator }) => {
  const isAdmin = currentUser.role === 'admin';
  const L = useApp().theme === 'light';
  const [, force] = useState(0);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bellBox = useRef<HTMLDivElement>(null);

  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => subscribeHealth(() => force(n => n + 1)), []); // cloche : la Santé se calcule au repos, on se réaffiche quand elle est prête
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const on = () => force(n => n + 1);
    window.addEventListener(SEEN_EVENT, on);
    return () => window.removeEventListener(SEEN_EVENT, on);
  }, []);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
      if (bellBox.current && !bellBox.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const home = isAdmin ? 'dashboard' : 'grid';
  const pages = useMemo(
    () =>
      isAdmin
        ? [
            ['dashboard', 'Accueil'], ['validations', 'Validations'], ['history', 'Historique'], ['security', 'Surveillance'], ['employees', 'Opérateurs'],
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
    pages.forEach(([id, label]) => {
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
  }, [q, isAdmin, pages, home, onNavigate, onOpenOperator, db.getContracts().length, db.getUsers().length]);

  const pick = (h: Hit) => { setOpen(false); setQ(''); h.go(); };
  const notifs = buildNotifications(currentUser);
  const count = unreadCount(currentUser, notifs);
  const seen = getSeen(currentUser);
  // Bip court quand une NOUVELLE notification arrive (jamais au chargement de la page)
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(notifs.map(n => n.id));
    if (knownIds.current && notifs.some(n => !knownIds.current!.has(n.id))) beepIfEnabled();
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
    <header style={{ top: 'var(--vvt, 0px)', left: 'var(--sbw, 0px)' }} className={`fixed left-0 right-0 z-30 df-topbar border-b rounded-b-2xl ${L ? 'border-slate-200' : 'border-slate-800'} ${L ? 'text-slate-800' : 'text-slate-100'} shadow-sm`}>
      <div className="h-14 px-2.5 sm:px-4 flex items-center gap-2.5 sm:gap-4">
        <button onClick={onOpenMenu} title="Ouvrir le menu" className={`md:hidden p-2 rounded-xl border ${L ? 'border-slate-200' : 'border-slate-700'} ${L ? 'bg-slate-50' : 'bg-slate-800'} ${L ? 'text-slate-700' : 'text-slate-300'} cursor-pointer`}>
          <Menu className={`w-5 h-5 ${L ? 'text-emerald-600' : 'text-emerald-500'}`} />
        </button>
        <div className="flex items-center gap-1.5 shrink-0 md:hidden">
          <Shield className={`w-4 h-4 ${L ? 'text-emerald-600' : 'text-emerald-500'}`} />
          <span className={`font-tactical font-black text-sm tracking-wider ${L ? 'text-emerald-700' : 'text-emerald-400'} hidden min-[420px]:inline`}>GESTION PRO</span>
        </div>

        <div ref={box} className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); if (e.key === 'Escape') setOpen(false); }}
            placeholder={isAdmin ? 'Rechercher une mission, un opérateur, une page…' : 'Rechercher une mission, une page…'}
            className={`w-full h-9 pl-9 pr-3 rounded-full ${L ? 'bg-slate-100' : 'bg-slate-800'} border ${L ? 'border-slate-200' : 'border-slate-700'} text-sm ${L ? 'text-slate-800' : 'text-slate-100'} placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 ${L ? 'focus:bg-white' : 'focus:bg-slate-900'}`}
          style={{ borderRadius: 9999 }}
          />
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

        <ConnectionChip />

        <div ref={bellBox} className="relative shrink-0">
          <button
            onClick={toggleBell}
            title="Notifications"
            className={`relative p-2 rounded-full border ${L ? 'border-slate-200' : 'border-slate-700'} ${L ? 'bg-slate-50' : 'bg-slate-800'} ${L ? 'text-slate-700' : 'text-slate-300'} ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} cursor-pointer`}
          >
            <Bell className="w-5 h-5" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className={`absolute right-0 top-full mt-2 w-[min(94vw,23rem)] df-notif rounded-2xl overflow-hidden z-50 border-2 ${L ? 'bg-white border-[#0b2a4a]/20' : 'bg-[#0f1e3a] border-blue-400/40'} shadow-[0_18px_50px_-8px_rgba(2,12,40,0.55)]`}>
              <div className={`px-4 py-3 flex items-center justify-between ${L ? 'bg-[#0b2a4a] text-white' : 'bg-[#1d4ed8] text-white'}`}>
                <span className="text-sm font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</span>
                {count > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{count > 99 ? '99+' : count}</span>}
              </div>
              {notifs.length > 0 && (
                <div className={`px-4 py-2 flex items-center justify-between text-xs ${L ? 'bg-slate-50 text-slate-600' : 'bg-white/5 text-slate-300'}`} data-notif-bar>
                  <span>{count > 0 ? `${count} non lue${count > 1 ? 's' : ''}` : 'Tout est lu'}</span>
                  {count > 0 && <button type="button" onClick={() => { markAllRead(currentUser, notifs); force(n => n + 1); }} className="min-h-[32px] px-3 rounded-full border border-current font-semibold cursor-pointer" data-notif-readall>Tout marquer comme lu</button>}
                </div>
              )}
              <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1.5">
                {notifs.length === 0 ? (
                  <div className={`px-3 py-6 text-sm text-center ${L ? 'text-slate-500' : 'text-slate-300'}`}>Rien de nouveau.</div>
                ) : (
                  notifs.slice(0, 30).map(n => {
                    const tone = n.tone === 'urgent' ? 'bg-red-100 text-red-700' : n.tone === 'bad' ? 'bg-orange-100 text-orange-700' : n.tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
                    const fresh = !seen.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setBellOpen(false); markSeen(currentUser, [n.id]); if (n.filter) setValFilterIntent(n.filter); if (n.thread) setChatThread(n.thread); if (n.nav) setNavTarget(n.nav); onNavigate(n.view); }}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-3 rounded-xl border cursor-pointer ${fresh ? (L ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/15 border-blue-400/40') : (L ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-white/5 border-white/10 hover:bg-white/10')}`}
                      >
                        <span className={`mt-0.5 w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${tone}`}>
                          <Bell className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-bold ${L ? 'text-slate-900' : 'text-white'}`}>{n.title}</span>
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
      </div>
    </header>
    </>
  );
};
