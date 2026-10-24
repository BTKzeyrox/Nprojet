import React, { useState, useEffect, useMemo } from 'react';
import { isLate } from '../utils/attendance';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Circle,
  FlaskConical,
  Hourglass,
  Clock,
  Search,
  Sun,
  Moon,
  Users,
  Wallet,
  TrendingUp,
  Target,
  CalendarX,
  ListChecks,
  HandCoins,
  X, CalendarOff } from 'lucide-react';
import { leaveOn } from '../utils/leaves';
import { User, PostSession, DayStatus, SalaryAdvanceRequest, AppSettings } from '../types';
import { db } from '../db/store';
import { formatScoreM, formatCurrencyAr } from '../utils/formatUtils';
import { Avatar } from '../components/Avatar';
import { NAV_TARGET_EVENT, peekNavTarget } from '../utils/navTarget';
import { useApp } from '../context/AppContext';

interface CalendarViewProps {
  currentUser: User | null;
  onSelectDay: (dateStr: string, shifts: PostSession[]) => void;
  initialUserId?: string;
}

type StatusFilter = 'all' | DayStatus;
type ShiftFilter = 'all' | 'day' | 'night';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toDateStr = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
};

const STATUS_META: Record<DayStatus, { label: string; color: string }> = {
  objective_reached: { label: 'Objectif atteint', color: 'text-emerald-400' },
  late: { label: 'En retard', color: 'text-amber-400' },
  in_progress: { label: 'En cours', color: 'text-cyan-400' },
  test: { label: 'Test / QA', color: 'text-purple-400' },
  absent: { label: 'Absent', color: 'text-red-400' },
  leave: { label: 'En congé', color: 'text-sky-400' },
  no_post: { label: 'Pas de mission', color: 'text-slate-400' },
};

const StatusIcon: React.FC<{ status: DayStatus; className?: string }> = ({ status, className = 'w-4 h-4' }) => {
  const c = `${className} shrink-0`;
  if (status === 'objective_reached') return <CheckCircle2 className={c} />;
  if (status === 'in_progress') return <Hourglass className={c} />;
  if (status === 'late') return <Clock className={c} />;
  if (status === 'test') return <FlaskConical className={c} />;
  if (status === 'absent') return <XCircle className={c} />;
  if (status === 'leave') return <CalendarOff className={c} />;
  return <Circle className={c} />;
};

// Statut d'un jour pour un opérateur
function dayStatus(shifts: PostSession[], dateStr: string, firstActivity: string | null, today: string, cfg: AppSettings, onLeave = false): DayStatus {
  // Congé ACCEPTÉ (M5.2) : le jour n'est ni une absence ni un retard, sauf si une mission a vraiment été travaillée ce jour-là
  if (onLeave && !shifts.some(s => s.status !== 'rejected' && s.status !== 'force_released')) return 'leave';
  if (shifts.length > 0) {
    const hasInProgress = shifts.some(s => s.status === 'active' || s.status === 'pending_start' || s.status === 'pending_end');
    const isTest = shifts.some(s => s.client_name.toLowerCase().includes('test') || s.account_tag.toLowerCase().includes('qa'));
    const allCompleted = shifts.every(s => s.status === 'completed');
    const reached = shifts.some(s => s.status === 'completed' && (s.final_score ?? s.current_score) >= s.target_score);
    const worked = shifts.filter(s => s.status !== 'rejected' && s.status !== 'force_released');
    if (isTest) return 'test';
    if (hasInProgress) return 'in_progress';
    if (worked.length > 0 && worked.some(s => isLate(s, cfg))) return 'late';
    if (reached || allCompleted) return 'objective_reached';
    return 'absent';
  }
  // Jour passé (lundi à samedi, dimanche = repos) depuis la première activité, sans aucune session = absence
  if (firstActivity && dateStr >= firstActivity && dateStr < today) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (new Date(y, m - 1, d).getDay() !== 0) return 'absent';
  }
  return 'no_post';
}

export const CalendarView: React.FC<CalendarViewProps> = ({ currentUser, onSelectDay, initialUserId }) => {
  const L = useApp().theme === 'light';
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth());
  const isAdmin = currentUser?.role === 'admin';

  const [posts, setPosts] = useState<PostSession[]>(db.getPosts());
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [advances, setAdvances] = useState<SalaryAdvanceRequest[]>(db.getAdvanceRequests());
  const [leaves, setLeaves] = useState(db.getLeaves());

  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(currentUser?.role === 'employee' ? currentUser.id : initialUserId || '');

  useEffect(() => {
    return db.subscribe(() => {
      setPosts(db.getPosts());
      setUsers(db.getUsers());
      setAdvances(db.getAdvanceRequests());
      setLeaves(db.getLeaves());
    });
  }, []);

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const daysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const today = todayStr();
  // Échéances (M6.1) : nombre de missions non terminées qui ont une date limite ce jour-là
  const appLang = useApp().lang;
  const dueByDay = new Map<string, number>();
  for (const c of db.getContracts()) {
    if (!c.due_date || (c.target_score > c.initial_score && (c.current_score ?? c.initial_score) >= c.target_score)) continue;
    dueByDay.set(c.due_date, (dueByDay.get(c.due_date) || 0) + 1);
  }
  const cfg = db.getSettings();
  const monthPrefix = `${year}-${pad(month + 1)}-`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;

  const goPrev = () => (month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1));
  const goNext = () => (month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1));
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
  };

  // Arrivée depuis la recherche (une date) : on affiche le bon mois, le jour clignote ensuite
  useEffect(() => {
    const apply = () => {
      const t = peekNavTarget();
      if (t && t.startsWith('day-')) {
        const [y, m] = t.slice(4).split('-').map(Number);
        if (y && m) { setYear(y); setMonth(m - 1); }
      }
    };
    apply();
    window.addEventListener(NAV_TARGET_EVENT, apply);
    return () => window.removeEventListener(NAV_TARGET_EVENT, apply);
  }, []);

  const operators = useMemo(() => users.filter(u => u.role === 'employee'), [users]);
  const clientNames = useMemo(
    () => Array.from(new Set(posts.map(p => p.client_name))).sort((a, b) => a.localeCompare(b)),
    [posts]
  );

  // Première activité de chaque opérateur (début du suivi des absences)
  const firstActivity = useMemo(() => {
    const map: Record<string, string> = {};
    posts.forEach(p => {
      if (!map[p.employee_id] || p.date < map[p.employee_id]) map[p.employee_id] = p.date;
    });
    return map;
  }, [posts]);

  // Jours du mois pour un opérateur (avec filtre de compte client)
  const buildDays = (operatorId: string) => {
    const mine = posts.filter(p => p.employee_id === operatorId);
    return Array.from({ length: daysInMonth }).map((_, i) => {
      const dateStr = toDateStr(year, month, i + 1);
      const allShifts = mine.filter(p => p.date === dateStr);
      const shifts = clientFilter === 'all' ? allShifts : allShifts.filter(p => p.client_name === clientFilter);
      const status = dayStatus(allShifts, dateStr, firstActivity[operatorId] || null, today, cfg, leaveOn(leaves, operatorId, dateStr) !== null);
      const gained = shifts.reduce((acc, s) => acc + Math.max(0, (s.final_score ?? s.current_score) - s.initial_score), 0);
      return { day: i + 1, dateStr, shifts, status, gained };
    });
  };

  // Liste filtrée des opérateurs (admin)
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return operators.filter(u => {
      if (q && !(u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))) return false;
      if (shiftFilter !== 'all' && u.shift !== shiftFilter) return false;
      if (clientFilter !== 'all') {
        const worked = posts.some(p => p.employee_id === u.id && p.date.startsWith(monthPrefix) && p.client_name === clientFilter);
        if (!worked) return false;
      }
      if (statusFilter !== 'all') {
        const days = buildDays(u.id);
        if (!days.some(d => d.status === statusFilter)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, posts, search, shiftFilter, statusFilter, clientFilter, year, month]);

  // Opérateur affiché : choix, sinon premier de la liste
  const activeId = isAdmin ? (list.some(u => u.id === selectedId) ? selectedId : list[0]?.id || '') : currentUser?.id || '';
  const activeUser = users.find(u => u.id === activeId) || null;
  const days = activeId ? buildDays(activeId) : [];

  // Résumé du mois
  const summary = useMemo(() => {
    if (!activeId) return null;
    const monthPosts = posts.filter(p => p.employee_id === activeId && p.date.startsWith(monthPrefix) && (clientFilter === 'all' || p.client_name === clientFilter));
    const completed = monthPosts.filter(p => p.status === 'completed');
    const inProgress = monthPosts.filter(p => p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end');
    const reached = completed.filter(p => (p.final_score ?? p.current_score) >= p.target_score).length;
    const gained = completed.reduce((a, p) => a + Math.max(0, (p.final_score ?? p.current_score) - p.initial_score), 0);
    const pay = completed.reduce((a, p) => a + (p.calculated_ar || 0), 0);
    const myAdv = advances.filter(a => a.employee_id === activeId && a.request_date.startsWith(monthPrefix));
    const advApproved = myAdv.filter(a => a.status === 'approved').reduce((s, a) => s + a.amount_ar, 0);
    const advPending = myAdv.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount_ar, 0);
    const monthDays = buildDays(activeId);
    const absences = monthDays.filter(d => d.status === 'absent').length;
    const lateDays = monthDays.filter(d => d.status === 'late').length;
    const workedDays = monthDays.filter(d => ['objective_reached', 'late', 'in_progress', 'test'].includes(d.status)).length;
    const expectedDays = workedDays + absences;
    return {
      absences,
      lateDays,
      workedDays,
      expectedDays,
      sessions: monthPosts.length,
      validated: completed.length,
      inProgress: inProgress.length,
      reached,
      gained,
      pay,
      advApproved,
      advPending,
      net: pay - advApproved,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, posts, advances, year, month, clientFilter, cfg]);

  const ar = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;

  // ---- Style : cartes arrondies, pastilles, jours en tuiles
  const card = `rounded-3xl border ${L ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f1b2d] border-slate-700/60'}`;
  const txt = L ? 'text-slate-900' : 'text-white';
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  const field = `w-full rounded-full border px-4 py-2 text-sm focus:outline-none focus:border-blue-500 ${L ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0a1424] border-slate-600 text-white'}`;
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1 ${
      active ? 'bg-blue-600 border-blue-600 text-white' : L ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-transparent border-slate-600 text-slate-300 hover:bg-white/10'
    }`;
  const roundBtn = `w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${L ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-slate-200'}`;
  // teinte douce de chaque jour selon son statut
  const TINT: Record<DayStatus, string> = {
    objective_reached: L ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/25',
    late: L ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/25',
    in_progress: L ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-500/10 border-cyan-500/25',
    test: L ? 'bg-purple-50 border-purple-200' : 'bg-purple-500/10 border-purple-500/25',
    absent: L ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/25',
    leave: L ? 'bg-sky-50 border-sky-200' : 'bg-sky-500/10 border-sky-500/25',
    no_post: L ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-slate-700/50',
  };

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: string }> = ({ icon, label, value, tone }) => (
    <div className={`${card} p-3 min-w-0 flex items-center gap-3`}>
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${L ? 'bg-slate-100' : 'bg-white/10'}`}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-[11px] leading-tight ${sub}`}>{label}</div>
        <div className={`font-bold text-base leading-tight break-words ${tone || txt}`}>{value}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-2 sm:py-3">
      <div className={`grid gap-3 ${isAdmin ? 'lg:grid-cols-[18rem_1fr]' : ''}`}>
        {/* ===== Opérateurs + filtres (responsable) ===== */}
        {isAdmin && (
          <aside className={`${card} p-4 space-y-3 lg:self-start lg:sticky lg:top-2`}>
            <div className={`flex items-center gap-2 font-bold text-sm ${txt}`}>
              <Users className="w-4 h-4 text-blue-500" /> Opérateurs
              <span className={`ml-auto text-xs font-semibold ${sub}`}>{list.length}/{operators.length}</span>
            </div>

            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${sub}`} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={`${field} pl-10 pr-9`} />
              {search && (
                <button onClick={() => setSearch('')} className={`absolute right-3 top-1/2 -translate-y-1/2 ${sub}`} aria-label="Effacer"><X className="w-4 h-4" /></button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className={`text-[11px] font-semibold mb-1.5 ${sub}`}>Vacation</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setShiftFilter('all')} className={pill(shiftFilter === 'all')}>Tous</button>
                  <button onClick={() => setShiftFilter('day')} className={pill(shiftFilter === 'day')}><Sun className="w-3.5 h-3.5" /> Jour</button>
                  <button onClick={() => setShiftFilter('night')} className={pill(shiftFilter === 'night')}><Moon className="w-3.5 h-3.5" /> Nuit</button>
                </div>
              </div>
              <div>
                <div className={`text-[11px] font-semibold mb-1.5 ${sub}`}>Statut du mois</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setStatusFilter('all')} className={pill(statusFilter === 'all')}>Tous</button>
                  {(['objective_reached', 'late', 'absent', 'leave', 'in_progress', 'test'] as DayStatus[]).map(st => (
                    <button key={st} onClick={() => setStatusFilter(st)} className={pill(statusFilter === st)}><StatusIcon status={st} className="w-3.5 h-3.5" /> {STATUS_META[st].label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className={`text-[11px] font-semibold mb-1.5 ${sub}`}>Mission</div>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={field}>
                  <option value="all">Toutes les missions</option>
                  {clientNames.map(c => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              {(search || shiftFilter !== 'all' || statusFilter !== 'all' || clientFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setShiftFilter('all'); setStatusFilter('all'); setClientFilter('all'); }} className={`w-full rounded-full border py-2 text-xs font-semibold cursor-pointer ${L ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-white/10'}`}>
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="max-h-64 lg:max-h-[50vh] overflow-y-auto space-y-1 -mx-1 px-1">
              {list.length === 0 && <div className={`p-3 text-sm ${sub}`}>Aucun opérateur trouvé.</div>}
              {list.map(u => (
                <button key={u.id} onClick={() => setSelectedId(u.id)} className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-left transition-colors cursor-pointer ${u.id === activeId ? (L ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-blue-500/15 ring-1 ring-blue-500/40') : (L ? 'hover:bg-slate-100' : 'hover:bg-white/5')}`}>
                  <Avatar src={u.avatar_url} name={u.name} className="w-9 h-9" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold leading-tight break-words ${txt}`}>{u.name}</div>
                    <div className={`text-[11px] flex items-center gap-1 ${sub}`}>{u.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}@{u.username}</div>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* ===== Calendrier + résumé ===== */}
        <div className="space-y-3 min-w-0">
          <div className={`${card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${L ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/15 text-blue-400'}`}><CalendarIcon className="w-5 h-5" /></span>
                <div className="min-w-0">
                  <h2 className={`text-base sm:text-lg font-bold leading-tight break-words ${txt}`}>{isAdmin ? 'Calendrier' : 'Mon calendrier'}</h2>
                  {activeUser && (
                    <div className={`text-xs break-words ${sub}`}>{activeUser.name}{clientFilter !== 'all' && <> · {clientFilter}</>}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-between sm:justify-end">
              <button onClick={goPrev} className={roundBtn} title="Mois précédent" aria-label="Mois précédent"><ChevronLeft className="w-5 h-5" /></button>
              <span className={`font-bold text-base min-w-[9rem] text-center ${txt}`}>{monthNames[month]} {year}</span>
              <button onClick={goNext} className={roundBtn} title="Mois suivant" aria-label="Mois suivant"><ChevronRight className="w-5 h-5" /></button>
              <button onClick={goToday} className="ml-1 px-4 h-10 rounded-full text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">Aujourd'hui</button>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
              <Stat icon={<CalendarX className="w-5 h-5 text-red-500" />} label="Jours d'absence" value={`${summary.absences}`} tone={summary.absences > 0 ? 'text-red-500' : undefined} />
              <Stat icon={<Clock className="w-5 h-5 text-amber-500" />} label="Retards" value={`${summary.lateDays}`} tone={summary.lateDays > 0 ? 'text-amber-500' : undefined} />
              <Stat icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} label="Jours travaillés" value={`${summary.workedDays} / ${summary.expectedDays}`} />
              <Stat icon={<ListChecks className="w-5 h-5 text-cyan-500" />} label="Missions" value={`${summary.sessions} · ${summary.validated} validées`} />
            </div>
          )}

          {/* Paie du mois (responsable) */}
          {isAdmin && summary && (
            <div className={`${card} p-4`}>
              <div className={`flex items-center gap-2 font-bold text-sm mb-3 ${txt}`}>
                <Wallet className="w-4 h-4 text-emerald-500" /> Paie du mois
                <span className={`ml-auto text-xs font-semibold ${sub}`}>{monthNames[month]} {year}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className={`rounded-2xl p-3 ${L ? 'bg-slate-50' : 'bg-white/5'}`}>
                  <div className={`text-[11px] ${sub}`}>Gagné</div>
                  <div className={`font-bold text-lg ${txt}`}>{formatCurrencyAr(summary.pay)}</div>
                </div>
                <div className={`rounded-2xl p-3 ${L ? 'bg-slate-50' : 'bg-white/5'}`}>
                  <div className={`text-[11px] ${sub}`}>Avances accordées</div>
                  <div className="font-bold text-lg text-amber-500">− {formatCurrencyAr(summary.advApproved)}</div>
                  {summary.advPending > 0 && <div className={`text-[11px] ${sub}`}>{formatCurrencyAr(summary.advPending)} en attente</div>}
                </div>
                <div className={`rounded-2xl p-3 ${L ? 'bg-emerald-50 border border-emerald-200' : 'bg-emerald-500/10 border border-emerald-500/25'}`}>
                  <div className={`text-[11px] ${sub}`}>Net à payer</div>
                  <div className="font-bold text-lg text-emerald-600">{formatCurrencyAr(summary.net)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Légende */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_META) as DayStatus[]).map(st => (
              <span key={st} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${TINT[st]} ${STATUS_META[st].color}`}>
                <StatusIcon status={st} className="w-3 h-3" /> {STATUS_META[st].label}
              </span>
            ))}
          </div>

          {/* Grille du mois : une tuile arrondie par jour */}
          {!activeUser ? (
            <div className={`${card} p-6 text-center text-sm ${sub}`}>Choisissez un opérateur dans la liste pour afficher son calendrier.</div>
          ) : (
            <div className={`${card} p-2 sm:p-3`}>
              <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] sm:text-xs font-semibold pb-1.5 ${sub}`}>
                {daysShort.map(d => (<div key={d}>{d}</div>))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {Array.from({ length: startDow }).map((_, i) => (<div key={`e${i}`} />))}
                {days.map(d => {
                  const isToday = d.dateStr === today;
                  const dim = statusFilter !== 'all' && d.status !== statusFilter;
                  return (
                    <div
                      key={d.dateStr}
                      data-nav={`day-${d.dateStr}`}
                      onClick={() => onSelectDay(d.dateStr, d.shifts)}
                      className={`min-h-[56px] sm:min-h-[92px] p-1 sm:p-2 rounded-xl sm:rounded-2xl border cursor-pointer flex flex-col gap-1 transition-all hover:shadow-md ${TINT[d.status]} ${isToday ? 'ring-2 ring-blue-500' : ''} ${dim ? 'opacity-30' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] sm:text-xs font-bold min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center ${isToday ? 'bg-blue-600 text-white' : txt}`}>{d.day}</span>
                        <span className={`${STATUS_META[d.status].color} ${d.status === 'in_progress' ? 'animate-pulse' : ''} ${d.status === 'no_post' ? 'opacity-30' : ''}`} title={STATUS_META[d.status].label}>
                          <StatusIcon status={d.status} className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      {dueByDay.get(d.dateStr) ? (
                        <div data-notranslate="" className={`self-start text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${d.dateStr < today ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'bg-amber-500/15 text-amber-500 border-amber-500/40'}`} title={appLang === 'en' ? 'Missions due this day' : 'Missions à rendre ce jour'}>
                          ⏰ {dueByDay.get(d.dateStr)} {appLang === 'en' ? 'due' : 'à rendre'}
                        </div>
                      ) : null}
                      {d.shifts.length > 0 && (
                        <>
                          <div className={`self-start text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${L ? 'bg-white text-slate-700' : 'bg-white/10 text-slate-200'}`}>
                            {d.shifts.length} mission{d.shifts.length > 1 ? 's' : ''}
                          </div>
                          {d.gained > 0 && <div className="hidden sm:block text-[11px] text-cyan-600 font-bold">+{formatScoreM(d.gained)}</div>}
                          {isAdmin && (() => { const ar = d.shifts.filter(x => x.status === 'completed').reduce((a, x) => a + (x.calculated_ar || 0), 0); return ar > 0 ? <div className="text-[10px] sm:text-[11px] text-emerald-600 font-bold">{formatCurrencyAr(ar)}</div> : null; })()}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
