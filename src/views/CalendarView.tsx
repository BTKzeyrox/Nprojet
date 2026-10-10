import React, { useState, useEffect, useMemo } from 'react';
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
  X,
} from 'lucide-react';
import { User, PostSession, DayStatus, SalaryAdvanceRequest, AppSettings } from '../types';
import { db } from '../db/store';
import { formatScoreM } from '../utils/formatUtils';
import { Avatar } from '../components/Avatar';
import { NAV_TARGET_EVENT, peekNavTarget } from '../utils/navTarget';

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
  no_post: { label: 'Pas de poste', color: 'text-slate-400' },
};

const StatusIcon: React.FC<{ status: DayStatus; className?: string }> = ({ status, className = 'w-4 h-4' }) => {
  const c = `${className} shrink-0`;
  if (status === 'objective_reached') return <CheckCircle2 className={c} />;
  if (status === 'in_progress') return <Hourglass className={c} />;
  if (status === 'late') return <Clock className={c} />;
  if (status === 'test') return <FlaskConical className={c} />;
  if (status === 'absent') return <XCircle className={c} />;
  return <Circle className={c} />;
};

const toMin = (hhmm: string) => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Une session est en retard si elle démarre plus tard que l'heure du shift + la tolérance (Réglages)
function isLate(s: PostSession, cfg: AppSettings): boolean {
  const base = s.shift_type === 'night' ? cfg.night_shift_start : cfg.day_shift_start;
  const diff = toMin(s.start_time) - toMin(base);
  return diff > cfg.late_tolerance_min && diff < 12 * 60;
}

// Statut d'un jour pour un booster
function dayStatus(shifts: PostSession[], dateStr: string, firstActivity: string | null, today: string, cfg: AppSettings): DayStatus {
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
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth());
  const isAdmin = currentUser?.role === 'admin';

  const [posts, setPosts] = useState<PostSession[]>(db.getPosts());
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [advances, setAdvances] = useState<SalaryAdvanceRequest[]>(db.getAdvanceRequests());

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
    });
  }, []);

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const daysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const today = todayStr();
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

  const boosters = useMemo(() => users.filter(u => u.role === 'employee'), [users]);
  const clientNames = useMemo(
    () => Array.from(new Set(posts.map(p => p.client_name))).sort((a, b) => a.localeCompare(b)),
    [posts]
  );

  // Première activité de chaque booster (début du suivi des absences)
  const firstActivity = useMemo(() => {
    const map: Record<string, string> = {};
    posts.forEach(p => {
      if (!map[p.employee_id] || p.date < map[p.employee_id]) map[p.employee_id] = p.date;
    });
    return map;
  }, [posts]);

  // Jours du mois pour un booster (avec filtre de compte client)
  const buildDays = (boosterId: string) => {
    const mine = posts.filter(p => p.employee_id === boosterId);
    return Array.from({ length: daysInMonth }).map((_, i) => {
      const dateStr = toDateStr(year, month, i + 1);
      const allShifts = mine.filter(p => p.date === dateStr);
      const shifts = clientFilter === 'all' ? allShifts : allShifts.filter(p => p.client_name === clientFilter);
      const status = dayStatus(allShifts, dateStr, firstActivity[boosterId] || null, today, cfg);
      const gained = shifts.reduce((acc, s) => acc + Math.max(0, (s.final_score ?? s.current_score) - s.initial_score), 0);
      return { day: i + 1, dateStr, shifts, status, gained };
    });
  };

  // Liste filtrée des boosters (admin)
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boosters.filter(u => {
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
  }, [boosters, posts, search, shiftFilter, statusFilter, clientFilter, year, month]);

  // Booster affiché : choix, sinon premier de la liste
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

  const pill = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold border transition-colors ${
      active ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-[#141e2a] border-slate-700 text-slate-300 hover:text-white'
    }`;

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: string }> = ({ icon, label, value, tone = 'text-white' }) => (
    <div className="bg-[#0f1722] border border-slate-800 p-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400 font-semibold leading-tight">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-bold text-sm sm:text-base break-words ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-2 sm:py-3">
      <div className={`grid gap-3 ${isAdmin ? 'lg:grid-cols-[18rem_1fr]' : ''}`}>
        {/* ===== Liste des boosters + recherche + filtres (admin) ===== */}
        {isAdmin && (
          <aside className="bg-[#0f1722] border border-slate-800 p-3 space-y-3 lg:self-start lg:sticky lg:top-2">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Users className="w-4 h-4 text-emerald-400" /> Boosters
              <span className="ml-auto text-xs text-slate-400 font-semibold">{list.length}/{boosters.length}</span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un booster…"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-[#141e2a] border border-slate-700 pl-8 pr-8 py-2 text-sm text-white focus:border-emerald-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label="Effacer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Shift</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setShiftFilter('all')} className={pill(shiftFilter === 'all')}>Tous</button>
                  <button onClick={() => setShiftFilter('day')} className={`${pill(shiftFilter === 'day')} inline-flex items-center gap-1`}>
                    <Sun className="w-3.5 h-3.5" /> Jour
                  </button>
                  <button onClick={() => setShiftFilter('night')} className={`${pill(shiftFilter === 'night')} inline-flex items-center gap-1`}>
                    <Moon className="w-3.5 h-3.5" /> Nuit
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Statut du mois</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setStatusFilter('all')} className={pill(statusFilter === 'all')}>Tous</button>
                  {(['objective_reached', 'late', 'absent', 'in_progress', 'test'] as DayStatus[]).map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)} className={`${pill(statusFilter === s)} inline-flex items-center gap-1`}>
                      <StatusIcon status={s} className="w-3.5 h-3.5" /> {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Compte client</div>
                <select
                  value={clientFilter}
                  onChange={e => setClientFilter(e.target.value)}
                  className="w-full bg-[#141e2a] border border-slate-700 px-2 py-2 text-sm text-white"
                >
                  <option value="all">Tous les comptes</option>
                  {clientNames.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {(search || shiftFilter !== 'all' || statusFilter !== 'all' || clientFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setShiftFilter('all');
                    setStatusFilter('all');
                    setClientFilter('all');
                  }}
                  className="w-full text-xs text-slate-300 hover:text-white border border-slate-700 py-1.5"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="max-h-64 lg:max-h-[55vh] overflow-y-auto divide-y divide-slate-800 border border-slate-800">
              {list.length === 0 && <div className="p-3 text-sm text-slate-400">Aucun booster trouvé.</div>}
              {list.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`w-full flex items-center gap-2.5 p-2 text-left transition-colors ${
                    u.id === activeId ? 'bg-emerald-900/40' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <Avatar src={u.avatar_url} name={u.name} className="w-8 h-8" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white leading-tight break-words">{u.name}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      {u.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                      @{u.username}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* ===== Calendrier + résumé ===== */}
        <div className="space-y-3 min-w-0">
          <div className="bg-[#0f1722] border border-slate-800 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-emerald-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold font-tactical text-white break-words">
                  {isAdmin ? 'Calendrier mensuel' : 'Mon calendrier de missions'}
                </h2>
              </div>
              {activeUser && (
                <div className="text-sm text-slate-300 mt-1 break-words">
                  {activeUser.name}
                  {clientFilter !== 'all' && <span className="text-slate-400"> · {clientFilter}</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#141e2a] border border-slate-700 p-1 text-sm">
                <button onClick={goPrev} className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white" title="Mois précédent">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 font-bold text-white min-w-[130px] text-center">{monthNames[month]} {year}</span>
                <button onClick={goNext} className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white" title="Mois suivant">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={goToday} className="px-3 py-2 text-sm font-semibold bg-[#141e2a] border border-slate-700 text-slate-200 hover:text-white">
                Aujourd'hui
              </button>
            </div>
          </div>

          {/* Résumé du mois */}
          {summary && (
            <div>
              <div className="text-[11px] uppercase text-slate-400 font-bold mb-1.5">Résumé de {monthNames[month].toLowerCase()} {year}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                <Stat icon={<CalendarX className="w-3.5 h-3.5 text-red-400" />} label="Jours d'absence" value={`${summary.absences}`} tone={summary.absences > 0 ? 'text-red-300' : 'text-white'} />
                <Stat icon={<Clock className="w-3.5 h-3.5 text-amber-400" />} label="Retards" value={`${summary.lateDays}`} tone={summary.lateDays > 0 ? 'text-amber-300' : 'text-white'} />
                <Stat icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />} label="Jours travaillés" value={`${summary.workedDays} / ${summary.expectedDays}`} />
                <Stat icon={<ListChecks className="w-3.5 h-3.5 text-cyan-400" />} label="Sessions" value={`${summary.sessions} (${summary.validated} validées${summary.inProgress ? `, ${summary.inProgress} en cours` : ''})`} />
                <Stat icon={<Target className="w-3.5 h-3.5 text-emerald-400" />} label="Objectifs atteints" value={`${summary.reached}`} tone="text-emerald-300" />
                <Stat icon={<TrendingUp className="w-3.5 h-3.5 text-cyan-400" />} label="Score gagné" value={formatScoreM(summary.gained)} tone="text-cyan-300" />
                <Stat icon={<Wallet className="w-3.5 h-3.5 text-emerald-400" />} label="Paie totale" value={ar(summary.pay)} tone="text-emerald-300" />
                <Stat icon={<HandCoins className="w-3.5 h-3.5 text-amber-400" />} label="Avances validées" value={ar(summary.advApproved)} tone="text-amber-300" />
                <Stat icon={<HandCoins className="w-3.5 h-3.5 text-slate-400" />} label="Avances en attente" value={ar(summary.advPending)} />
                <Stat icon={<Wallet className="w-3.5 h-3.5 text-white" />} label="Net à payer" value={ar(summary.net)} tone={summary.net < 0 ? 'text-red-300' : 'text-white'} />
              </div>
            </div>
          )}

          {/* Légende */}
          <div className="bg-[#121a24] border border-slate-800 p-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {(Object.keys(STATUS_META) as DayStatus[]).map(s => (
              <div key={s} className={`flex items-center gap-1.5 ${STATUS_META[s].color}`}>
                <StatusIcon status={s} /> <span>{STATUS_META[s].label}</span>
              </div>
            ))}
          </div>

          {/* Grille du mois */}
          {!activeUser ? (
            <div className="bg-[#0f1722] border border-slate-800 p-6 text-center text-slate-400 text-sm">
              Choisissez un booster dans la liste pour afficher son calendrier.
            </div>
          ) : (
            <div className="bg-[#0f1722] border border-slate-800 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-800 bg-[#121c27] text-center text-[11px] sm:text-xs uppercase text-slate-400 py-1.5">
                {daysShort.map(d => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-800/80 bg-[#0d141d]">
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`e${i}`} className="min-h-[60px] sm:min-h-[96px] bg-slate-950/40 opacity-30" />
                ))}
                {days.map(d => {
                  const isToday = d.dateStr === today;
                  const dim = statusFilter !== 'all' && d.status !== statusFilter;
                  return (
                    <div
                      key={d.dateStr}
                      data-nav={`day-${d.dateStr}`}
                      onClick={() => onSelectDay(d.dateStr, d.shifts)}
                      className={`min-h-[60px] sm:min-h-[96px] p-1 sm:p-2 cursor-pointer hover:bg-[#15202d] flex flex-col gap-1 transition-opacity ${
                        isToday ? 'ring-1 ring-emerald-500/70 bg-[#121c27]' : ''
                      } ${dim ? 'opacity-30' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] sm:text-xs font-bold px-1 ${isToday ? 'bg-emerald-500 text-black' : 'text-slate-300'}`}>{d.day}</span>
                        <span className={`${STATUS_META[d.status].color} ${d.status === 'in_progress' ? 'animate-pulse' : ''} ${d.status === 'no_post' ? 'opacity-30' : ''}`} title={STATUS_META[d.status].label}>
                          <StatusIcon status={d.status} className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      {d.shifts.length > 0 && (
                        <>
                          <div className="text-[10px] sm:text-[11px] px-1 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 break-words">
                            {d.shifts.length} shift{d.shifts.length > 1 ? 's' : ''}
                          </div>
                          {d.gained > 0 && <div className="text-[10px] sm:text-[11px] text-cyan-300 font-bold">+{formatScoreM(d.gained)}</div>}
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
