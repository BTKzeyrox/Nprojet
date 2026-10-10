import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Menu, Search, Shield, Users, Gamepad2, Calendar, FileText } from 'lucide-react';
import { User } from '../types';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { buildNotifications, markSeen, unreadCount, getSeen, SEEN_EVENT } from '../utils/notifications';
import { setValFilterIntent } from '../utils/navIntent';
import { setNavTarget, setChatThread } from '../utils/navTarget';
import { beepIfEnabled } from '../utils/notifSound';

interface TopBarProps {
  currentUser: User;
  onOpenMenu: () => void;
  onNavigate: (view: string) => void;
  onOpenBooster: (userId: string) => void;
}

interface Hit {
  id: string;
  title: string;
  sub: string;
  kind: 'page' | 'poste' | 'booster' | 'compte' | 'date';
  go: () => void;
}

const KIND_LABEL: Record<Hit['kind'], string> = { page: 'Page', poste: 'Poste', booster: 'Booster', compte: 'Compte', date: 'Date' };

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Barre du haut fixe (clair) : recherche globale + cloche
export const TopBar: React.FC<TopBarProps> = ({ currentUser, onOpenMenu, onNavigate, onOpenBooster }) => {
  const isAdmin = currentUser.role === 'admin';
  const L = useApp().theme === 'light';
  const [, force] = useState(0);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bellBox = useRef<HTMLDivElement>(null);

  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
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
            ['dashboard', 'Accueil'], ['validations', 'Validations'], ['history', 'Historique'], ['security', 'Surveillance'], ['employees', 'Boosters'],
            ['advances', 'Avances sur salaire'], ['active-post', 'Suivi des sessions'], ['chat', 'Messagerie'],
            ['calendar', 'Calendrier'], ['settings', 'Réglages'],
          ]
        : [['grid', 'Postes'], ['active-post', 'Mon poste'], ['advances', 'Avances'], ['chat', 'Messagerie'], ['calendar', 'Calendrier']],
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
          out.push({ id: `b-${u.id}`, title: u.name, sub: `@${u.username} · ${u.status === 'blocked' ? 'bloqué' : 'actif'}`, kind: 'booster', go: () => onOpenBooster(u.id) });
      });
    }
    const seenAcc = new Set<string>();
    // « p1 », « p01 », « poste 1 », « poste 01 », « #1 » : on va exactement à ce poste (pas aux postes 10 à 19)
    const pm = s.match(/^(?:poste|p|#)\s*0*(\d{1,3})$/);
    const exactNum = pm ? Number(pm[1]) : null;
    const goPoste = (n: number) => () => { setNavTarget(`poste-${n}`); onNavigate(home); };
    db.getContracts().forEach(c => {
      const byNumber = exactNum !== null ? c.post_number === exactNum : norm(`poste ${c.post_number}`).includes(s) || norm(`#${c.post_number}`).includes(s);
      if (norm(c.client_name).includes(s) || byNumber) {
        const hit: Hit = { id: `c-${c.id}`, title: `${c.client_name}`, sub: `Poste ${c.post_number}`, kind: 'poste', go: goPoste(c.post_number) };
        if (exactNum !== null && c.post_number === exactNum) out.unshift(hit);
        else out.push(hit);
      }
      if (c.account_tag && norm(c.account_tag).includes(s) && !seenAcc.has(c.account_tag)) {
        seenAcc.add(c.account_tag);
        out.push({ id: `a-${c.id}`, title: c.account_tag, sub: `Compte de ${c.client_name}`, kind: 'compte', go: goPoste(c.post_number) });
      }
    });
    const dates = Array.from(new Set(db.getPosts().map(p => p.date)));
    dates.forEach(d => {
      const [y, m, day] = d.split('-');
      if (`${day}/${m}`.includes(s) || d.includes(s)) out.push({ id: `d-${d}`, title: `${day}/${m}/${y}`, sub: 'Voir au calendrier', kind: 'date', go: () => { setNavTarget(`day-${d}`); onNavigate('calendar'); } });
    });
    return out.slice(0, 8);
  }, [q, isAdmin, pages, home, onNavigate, onOpenBooster, db.getContracts().length, db.getUsers().length]);

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
  // Booster : les notifications passent en « vu » à la fermeture de la fenêtre
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !bellOpen && !isAdmin) {
      markSeen(currentUser, buildNotifications(currentUser).map(n => n.id));
      force(n => n + 1);
    }
    wasOpen.current = bellOpen;
  }, [bellOpen]);
  const icon = (k: Hit['kind']) => (k === 'booster' ? Users : k === 'poste' || k === 'compte' ? Gamepad2 : k === 'date' ? Calendar : FileText);

  return (
    <>
    {/* Place réservée : la barre est en position fixe, le contenu ne passe pas dessous */}
    <div className="h-[57px] shrink-0" aria-hidden="true" />
    <header style={{ top: 'var(--vvt, 0px)', left: 'var(--sbw, 0px)' }} className={`fixed left-0 right-0 z-30 df-topbar border-b ${L ? 'border-slate-200' : 'border-slate-800'} ${L ? 'text-slate-800' : 'text-slate-100'} shadow-sm`}>
      <div className="h-14 px-2.5 sm:px-4 flex items-center gap-2.5 sm:gap-4">
        <button onClick={onOpenMenu} title="Ouvrir le menu" className={`md:hidden p-2 rounded-xl border ${L ? 'border-slate-200' : 'border-slate-700'} ${L ? 'bg-slate-50' : 'bg-slate-800'} ${L ? 'text-slate-700' : 'text-slate-300'} cursor-pointer`}>
          <Menu className={`w-5 h-5 ${L ? 'text-emerald-600' : 'text-emerald-500'}`} />
        </button>
        <div className="flex items-center gap-1.5 shrink-0 md:hidden">
          <Shield className={`w-4 h-4 ${L ? 'text-emerald-600' : 'text-emerald-500'}`} />
          <span className={`font-tactical font-black text-sm tracking-wider ${L ? 'text-emerald-700' : 'text-emerald-400'} hidden min-[420px]:inline`}>DELTA FORCE</span>
        </div>

        <div ref={box} className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); if (e.key === 'Escape') setOpen(false); }}
            placeholder={isAdmin ? 'Rechercher un poste, booster, compte, page…' : 'Rechercher un poste, une page…'}
            className={`w-full h-9 pl-9 pr-3 rounded-lg ${L ? 'bg-slate-100' : 'bg-slate-800'} border ${L ? 'border-slate-200' : 'border-slate-700'} text-sm ${L ? 'text-slate-800' : 'text-slate-100'} placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 ${L ? 'focus:bg-white' : 'focus:bg-slate-900'}`}
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

        <div ref={bellBox} className="relative shrink-0">
          <button
            onClick={toggleBell}
            title="Notifications"
            className={`relative p-2 rounded-xl border ${L ? 'border-slate-200' : 'border-slate-700'} ${L ? 'bg-slate-50' : 'bg-slate-800'} ${L ? 'text-slate-700' : 'text-slate-300'} ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} cursor-pointer`}
          >
            <Bell className="w-5 h-5" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className={`absolute right-0 top-full mt-1.5 w-[min(92vw,22rem)] df-popover ${L ? 'bg-white' : 'bg-slate-900'} border ${L ? 'border-slate-200' : 'border-slate-700'} rounded-lg shadow-xl overflow-hidden z-40`}>
              <div className={`px-3 py-2 border-b ${L ? 'border-slate-100' : 'border-slate-800'} text-sm font-bold ${L ? 'text-slate-800' : 'text-slate-100'}`}>Notifications</div>
              <div className="max-h-[60vh] overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className={`px-3 py-4 text-sm ${L ? 'text-slate-500' : 'text-slate-400'}`}>Rien de nouveau.</div>
                ) : (
                  notifs.slice(0, 30).map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setBellOpen(false); if (n.filter) setValFilterIntent(n.filter); if (n.thread) setChatThread(n.thread); if (n.nav) setNavTarget(n.nav); onNavigate(n.view); }}
                      className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 ${L ? 'hover:bg-emerald-50' : 'hover:bg-emerald-950/40'} border-b ${L ? 'border-slate-50' : 'border-slate-800'} cursor-pointer`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.tone === 'urgent' ? 'bg-red-500' : n.tone === 'bad' ? 'bg-orange-500' : n.tone === 'ok' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${L ? 'text-slate-800' : 'text-slate-100'} truncate`}>{n.title}</span>
                        {n.sub && <span className={`block text-xs ${L ? 'text-slate-500' : 'text-slate-400'} break-words`}>{n.sub}</span>}
                      </span>
                      {!isAdmin && !seen.includes(n.id) && <span className="text-[10px] font-bold text-red-600 shrink-0">NEUF</span>}
                    </button>
                  ))
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
