import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { dayStatus } from '../utils/dayStatus';
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
  UserCheck,
  UserX,
  ClipboardList,
  X, CalendarOff } from 'lucide-react';
import { leaveOn, LEAVE_TYPE_LABELS, type Leave } from '../utils/leaves';
import { firstActivityOf, empMonth, globalMonth, globalSummary, dayView, hasLeaveInMonth, type LeaveFilter } from '../utils/calendarGlobal';
import { liveStatus } from '../utils/presenceStatus';
import { formatDuration } from '../utils/presence';
import { useNow } from '../utils/useNow';
import { LiveLine } from '../components/LiveStatus';
import { User, PostSession, DayStatus, SalaryAdvanceRequest, AppSettings, AttendanceRow } from '../types';
import { db } from '../db/store';
import { formatScoreM, formatCurrencyAr } from '../utils/formatUtils';
import { dayDetail, minutesText } from '../utils/dayDetail';
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

/** Dans une case de jour : seulement ces icônes colorées (celles de la légende) avec un chiffre, sans texte. Le reste est dans la fenêtre du jour. */
const CELL_STATUSES: DayStatus[] = ['objective_reached', 'late', 'in_progress', 'test', 'absent', 'leave'];
const CHIP_CLS: Record<string, string> = {
  objective_reached: 'bg-emerald-500/20 text-emerald-600', late: 'bg-amber-500/20 text-amber-600', in_progress: 'bg-cyan-500/20 text-cyan-600',
  test: 'bg-purple-500/20 text-purple-600', absent: 'bg-red-500/20 text-red-600', leave: 'bg-sky-500/20 text-sky-600',
};
const StatusChip: React.FC<{ status: DayStatus; n: number }> = ({ status, n }) => (
  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${CHIP_CLS[status] || ''}`} title={STATUS_META[status].label} aria-label={`${STATUS_META[status].label} : ${n}`}>
    <StatusIcon status={status} className="w-3 h-3" />{n}
  </span>
);

// ============================ CALENDRIER GLOBAL (tous les employés) : mois, résumé, jour ============================
type GView = 'month' | 'summary' | 'day';
interface GlobalCalProps {
  year: number; month: number; today: string; list: User[]; posts: PostSession[]; leaves: Leave[]; advances: SalaryAdvanceRequest[]; cfg: AppSettings;
  clientFilter: string; statusFilter: StatusFilter; leaveFilter: LeaveFilter; first: Record<string, string>;
  onSelectDay: (dateStr: string, shifts: PostSession[]) => void; onPickEmployee: (id: string) => void;
  st: { L: boolean; card: string; txt: string; sub: string; TINT: Record<DayStatus, string>; pill: (a: boolean) => string; roundBtn: string };
}
const GMONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const GDOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const addDay = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const hmMada = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(11, 16);

interface DayPanelProps {
  day: string; setDay: (d: string) => void; list: User[]; ctx: { posts: PostSession[]; leaves: Leave[]; today: string; cfg: AppSettings; clientFilter: string };
  first: Record<string, string>; today: string; posts: PostSession[]; lang: 'fr' | 'en'; nowMs: number; ar: (n: number) => string;
  onSelectDay: (dateStr: string, shifts: PostSession[]) => void; onPickEmployee: (id: string) => void;
  st: GlobalCalProps['st'];
}
// Détail d'un jour (même contenu dans l'onglet « Vue du jour » et dans la fenêtre ouverte au clic sur une case du mois)
const DayPanel: React.FC<DayPanelProps> = ({ day, setDay, list, ctx, first, today, posts, lang, nowMs, ar, onSelectDay, onPickEmployee, st }) => {
  const { card, txt, sub, TINT, pill } = st;
  const rows = useMemo(() => dayView(day, list, ctx, first), [day, list, ctx, first]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  useEffect(() => {
    let alive = true;
    setAtt([]);
    db.fetchAttendance(day).then(r => { if (alive) setAtt(Array.isArray(r) ? r : []); }).catch(() => { /* hors ligne : pas de ligne de connexion */ });
    return () => { alive = false; };
  }, [day]);
  const leaveLabel = (t: string | null) => (t ? (LEAVE_TYPE_LABELS as Record<string, [string, string]>)[t]?.[lang === 'en' ? 1 : 0] || t : '');
  const due = db.getContracts().filter(c => c.due_date === day && !(c.target_score > c.initial_score && (c.current_score ?? c.initial_score) >= c.target_score)).length; // missions à rendre ce jour (pas dans la case : trop de contenu)
  const nbPresent = rows.filter(r => ['objective_reached', 'late', 'in_progress', 'test'].includes(r.status)).length;
  return (
    <div className="space-y-2" data-testid="gcal-dayview">
      <div className={`${card} p-3 flex items-center justify-between gap-2`}>
        <button type="button" onClick={() => setDay(addDay(day, -1))} className={st.roundBtn} aria-label="Jour précédent"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-center min-w-0">
          <div className={`font-bold ${txt}`}>{day.split('-').reverse().join('/')}{day === today ? ' · aujourd\'hui' : ''}</div>
          <div className={`text-[11px] ${sub}`}>{GDOW[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]} · {nbPresent} présents · {rows.filter(r => r.status === 'absent').length} absents · {rows.filter(r => r.status === 'leave').length} en congé</div>
        </div>
        <button type="button" onClick={() => setDay(addDay(day, 1))} className={st.roundBtn} aria-label="Jour suivant"><ChevronRight className="w-5 h-5" /></button>
      </div>
      {due > 0 && <div className={`${card} px-3 py-2 text-xs ${sub}`} data-testid="day-due">Missions à rendre ce jour : <strong className={txt}>{due}</strong></div>}
      <div className="flex justify-end">
        <button type="button" onClick={() => onSelectDay(day, posts.filter(p => p.date === day))} className={pill(false)}>Détail des missions du jour</button>
      </div>
      {rows.map(r => {
        const a = att.find(x => x.user_id === r.id);
        const u = list.find(x => x.id === r.id);
        return (
          <div key={r.id} className={`${card} p-3 border ${TINT[r.status]}`} data-testid={`gcal-row-${r.id}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" onClick={() => onPickEmployee(r.id)} className={`font-bold text-sm cursor-pointer text-left ${txt}`}>{r.name}</button>
              <span className={`text-[11px] flex items-center gap-1 ${sub}`}>{r.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}{r.shift === 'day' ? 'Jour' : 'Nuit'}</span>
              <span className={`ml-auto inline-flex items-center gap-1 text-xs font-bold ${STATUS_META[r.status].color}`}><StatusIcon status={r.status} className="w-4 h-4" /> {STATUS_META[r.status].label}{r.status === 'leave' && r.leave ? ` · ${leaveLabel(r.leave)}` : ''}</span>
            </div>
            <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs ${sub}`}>
              {r.firstStart && <span>1re mission : <strong className={txt}>{r.firstStart}</strong>{r.lateMin > 0 && <span className="text-amber-500 font-bold"> (+{r.lateMin} min de retard)</span>}</span>}
              {r.firstStart && <span>Dernière fin : <strong className={txt}>{r.open ? 'en cours' : r.lastEnd || '—'}</strong></span>}
              {a && <span>1re connexion : <strong className={txt}>{hmMada(a.first_seen)}</strong> · connecté {formatDuration(a.online_sec)}</span>}
              {r.missions > 0 && <span>{r.missions} mission{r.missions > 1 ? 's' : ''} · {r.validated} validée{r.validated > 1 ? 's' : ''}{r.refused ? ` · ${r.refused} refusée${r.refused > 1 ? 's' : ''}` : ''}</span>}
              {r.pay > 0 && <span className="text-emerald-600 font-bold">{ar(r.pay)}</span>}
              {r.pendingLeave && <span className="text-sky-500 font-semibold">Demande de congé en attente</span>}
            </div>
            {(() => {
              const d = dayDetail(posts, a, r.id, day, nowMs, today, ctx.clientFilter);
              if (!d.firstSeen && d.missions.length === 0) return null;
              const box = `rounded-xl p-2.5 text-xs space-y-1 ${st.L ? 'bg-slate-50' : 'bg-white/5'}`;
              const h = `text-[11px] font-bold uppercase ${sub}`;
              const stateTxt = { validated: 'validée', refused: 'refusée', running: 'en cours', waiting: 'en attente de validation', released: 'libérée' } as const;
              return (
                <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid={`day-detail-${r.id}`}>
                  <div className={box}>
                    <div className={h}>Connexion</div>
                    {d.firstSeen ? (
                      <>
                        <div className={sub} data-testid="arrival-departure">Arrivée : <strong className={txt}>{d.arrival}</strong> · Départ : {d.departureKind === 'live' ? <strong className="text-emerald-600">en ligne maintenant</strong> : <strong className={txt}>{d.departure}</strong>}{d.departureKind === 'lost' && ' (dernier signe de vie)'}</div>
                        <div className={sub}>Temps en ligne : <strong className={txt}>{formatDuration(d.onlineSec)}</strong></div>
                        {d.hasConnectionLog ? d.connections.map((c, i) => (
                          <div key={i} className={sub}>Arrivée à <strong className={txt}>{c.from}</strong> · {c.state === 'live' ? <strong className="text-emerald-600">en ligne maintenant</strong> : <>{c.state === 'out' ? 'départ à' : 'dernier signe de vie à'} <strong className={txt}>{c.to}</strong></>} · {minutesText(c.minutes)}</div>
                        )) : <div className={sub}>Heures de déconnexion : pas enregistrées pour ce jour (avant la mise à jour).</div>}
                      </>
                    ) : <div className={sub}>Aucune connexion enregistrée ce jour-là.</div>}
                  </div>
                  <div className={box}>
                    <div className={h}>Missions du jour</div>
                    {d.missions.length === 0 ? <div className={sub}>Aucune mission.</div> : d.missions.map(m => (
                      <div key={m.id} className={sub}><strong className={txt}>{m.client}</strong> · {m.start}{m.end ? ` → ${m.end}` : ''}{m.minutes !== null ? ` (${minutesText(m.minutes)})` : ''} · score {formatScoreM(m.scoreFrom)} → {formatScoreM(m.scoreTo)} / {formatScoreM(m.target)} · {stateTxt[m.status]}{m.pay > 0 ? ` · ${ar(m.pay)}` : ''}</div>
                    ))}
                    {d.missions.length > 0 && <div className={`pt-1 border-t ${st.L ? 'border-slate-200' : 'border-white/10'} ${sub}`}>Total : <strong className={txt}>{d.totals.missions}</strong> mission{d.totals.missions > 1 ? 's' : ''} · {d.totals.validated} validée{d.totals.validated > 1 ? 's' : ''}{d.totals.refused ? ` · ${d.totals.refused} refusée${d.totals.refused > 1 ? 's' : ''}` : ''}{d.totals.running ? ` · ${d.totals.running} en cours` : ''} · gain {formatScoreM(d.totals.gain)}{d.totals.pay > 0 ? ` · paie ${ar(d.totals.pay)}` : ''}</div>}
                  </div>
                </div>
              );
            })()}
            {day === today && u && <div className="mt-1 text-xs"><LiveLine info={liveStatus(u, posts, db.getPresence(), nowMs)} lang={lang} /></div>}
          </div>
        );
      })}
    </div>
  );
};

const GlobalCalendar: React.FC<GlobalCalProps> = ({ year, month, today, list, posts, leaves, advances, cfg, clientFilter, statusFilter, leaveFilter, first, onSelectDay, onPickEmployee, st }) => {
  const { L, card, txt, sub, TINT, pill } = st;
  const lang: 'fr' | 'en' = useApp().lang === 'en' ? 'en' : 'fr';
  const nowMs = useNow(15000);
  const [view, setView] = useState<GView>('month');
  const prefix = `${year}-${pad(month + 1)}-`;
  const [selDay, setSelDay] = useState<string>(() => (today.startsWith(prefix) ? today : `${prefix}01`));
  const [popDay, setPopDay] = useState<string | null>(null);
  const ctx = useMemo(() => ({ posts, leaves, today, cfg, clientFilter }), [posts, leaves, today, cfg, clientFilter]);
  const gDays = useMemo(() => globalMonth(year, month, list, ctx, first), [year, month, list, ctx, first]);
  const summary = useMemo(() => globalSummary(year, month, list, ctx, first, advances), [year, month, list, ctx, first, advances]);
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const ar = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;

  useLockBodyScroll(popDay !== null);
  useEffect(() => {
    if (!popDay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopDay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popDay]);

  const tab = (v: GView, label: string) => <button key={v} type="button" onClick={() => setView(v)} className={pill(view === v)} data-testid={`gcal-tab-${v}`}>{label}</button>;
  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className={`${card} p-3 min-w-0`}><div className={`text-[11px] leading-tight ${sub}`}>{label}</div><div className={`font-bold text-base leading-tight break-words ${tone || txt}`}>{value}</div></div>
  );
  const dominant = (g: ReturnType<typeof globalMonth>[number]): DayStatus => g.absent > 0 ? 'absent' : g.late > 0 ? 'late' : g.present > 0 ? (g.counts.in_progress > 0 ? 'in_progress' : 'objective_reached') : g.onLeave > 0 ? 'leave' : 'no_post';
  const panelProps = { list, ctx, first, today, posts, lang, nowMs, st, ar, onSelectDay, onPickEmployee };

  return (
    <div className="space-y-3" data-testid="global-calendar">
      <div className="flex flex-wrap items-center gap-1.5">{tab('month', 'Mois')}{tab('summary', 'Résumé')}{tab('day', 'Vue du jour')}
        {leaveFilter !== 'all' && <span className={`ml-auto text-[11px] font-semibold ${sub}`}>{leaveFilter === 'approved' ? 'Congés acceptés' : 'Demandes de congé en attente'} · {list.length} employé{list.length > 1 ? 's' : ''}</span>}
      </div>

      {list.length === 0 && <div className={`${card} p-6 text-center text-sm ${sub}`}>Aucun employé ne correspond aux filtres.</div>}

      {list.length > 0 && view === 'month' && (
        <div className={`${card} p-2 sm:p-3`}>
          <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] sm:text-xs font-semibold pb-1.5 ${sub}`}>{GDOW.map(d => <div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
            {gDays.map(g => {
              const dom = dominant(g), isToday = g.dateStr === today;
              const leaveHit = leaveFilter === 'approved' ? g.onLeave > 0 : leaveFilter === 'pending' ? g.pendingLeave > 0 : true;
              const dim = (statusFilter !== 'all' && g.counts[statusFilter] === 0) || !leaveHit;
              const names = [...g.leaveNames.map(n => `${n} (congé)`), ...g.pendingNames.map(n => `${n} (demande en attente)`)].join(', ');
              return (
                <button type="button" key={g.dateStr} data-testid={`gcal-day-${g.dateStr}`} title={names || undefined}
                  onClick={() => setPopDay(g.dateStr)}
                  className={`min-h-[64px] sm:min-h-[100px] p-1 sm:p-2 rounded-xl sm:rounded-2xl border cursor-pointer flex flex-col gap-1 text-left transition-all hover:shadow-md ${TINT[dom]} ${isToday ? 'ring-2 ring-blue-500' : ''} ${dim ? 'opacity-30' : ''}`}>
                  <span className={`text-[11px] sm:text-xs font-bold min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center self-start ${isToday ? 'bg-blue-600 text-white' : txt}`}>{g.day}</span>
                  <span className="flex flex-wrap gap-0.5 sm:gap-1" data-cal-chips>
                    {CELL_STATUSES.filter(k => g.counts[k] > 0).map(k => <StatusChip key={k} status={k} n={g.counts[k]} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {list.length > 0 && view === 'summary' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2" data-testid="gcal-summary">
            <Stat label="Employés" value={`${summary.employees}`} />
            <Stat label="Jours travaillés" value={`${summary.workedDays}`} />
            <Stat label="Jours d'absence" value={`${summary.absences}`} tone={summary.absences > 0 ? 'text-red-500' : undefined} />
            <Stat label="Retards" value={`${summary.lateDays}`} tone={summary.lateDays > 0 ? 'text-amber-500' : undefined} />
            <Stat label="Jours de congé" value={`${summary.leaveDays}${summary.pendingLeaveDays ? ` (+${summary.pendingLeaveDays} en attente)` : ''}`} />
            <Stat label="Missions" value={`${summary.missions} · ${summary.validated} validées`} />
            <Stat label="Refusées" value={`${summary.refused}`} tone={summary.refused > 0 ? 'text-amber-500' : undefined} />
            <Stat label="En cours" value={`${summary.inProgress}`} />
          </div>
          <div className={`${card} p-4`}>
            <div className={`flex items-center gap-2 font-bold text-sm mb-3 ${txt}`}><Wallet className="w-4 h-4 text-emerald-500" /> Paie du mois, tous les employés<span className={`ml-auto text-xs font-semibold ${sub}`}>{GMONTHS[month]} {year}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className={`rounded-2xl p-3 ${L ? 'bg-slate-50' : 'bg-white/5'}`}><div className={`text-[11px] ${sub}`}>Gagné</div><div className={`font-bold text-lg ${txt}`}>{formatCurrencyAr(summary.pay)}</div></div>
              <div className={`rounded-2xl p-3 ${L ? 'bg-slate-50' : 'bg-white/5'}`}><div className={`text-[11px] ${sub}`}>Avances accordées</div><div className="font-bold text-lg text-amber-500">− {formatCurrencyAr(summary.advApproved)}</div>{summary.advPending > 0 && <div className={`text-[11px] ${sub}`}>{formatCurrencyAr(summary.advPending)} en attente</div>}</div>
              <div className={`rounded-2xl p-3 ${L ? 'bg-emerald-50 border border-emerald-200' : 'bg-emerald-500/10 border border-emerald-500/25'}`}><div className={`text-[11px] ${sub}`}>Net à payer</div><div className="font-bold text-lg text-emerald-600">{formatCurrencyAr(summary.net)}</div></div>
            </div>
          </div>
          <div className={`${card} p-3 overflow-x-auto`}>
            <table className={`w-full text-sm ${txt}`} data-testid="gcal-table">
              <thead><tr className={`text-left text-[11px] uppercase ${sub}`}><th className="p-2">Employé</th><th className="p-2">Travaillés</th><th className="p-2">Absences</th><th className="p-2">Retards</th><th className="p-2">Congés</th><th className="p-2">Missions</th><th className="p-2">Paie</th></tr></thead>
              <tbody>
                {summary.rows.map(r => (
                  <tr key={r.id} className={`border-t ${L ? 'border-slate-200' : 'border-slate-700/60'}`}>
                    <td className="p-2"><button type="button" onClick={() => onPickEmployee(r.id)} className="font-semibold text-blue-500 hover:underline cursor-pointer text-left" title="Voir son calendrier">{r.name}</button></td>
                    <td className="p-2">{r.workedDays}</td>
                    <td className={`p-2 ${r.absences ? 'text-red-500 font-bold' : ''}`}>{r.absences}</td>
                    <td className={`p-2 ${r.lateDays ? 'text-amber-500 font-bold' : ''}`}>{r.lateDays}</td>
                    <td className="p-2">{r.leaveDays}</td>
                    <td className="p-2">{r.missions} <span className={sub}>({r.validated} validées{r.refused ? `, ${r.refused} refusées` : ''})</span></td>
                    <td className="p-2 whitespace-nowrap">{ar(r.pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {list.length > 0 && view === 'day' && (
        <DayPanel day={selDay} setDay={setSelDay} {...panelProps} />
      )}

      {popDay && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setPopDay(null)} data-testid="gcal-popup-backdrop">
          <div role="dialog" aria-modal="true" aria-label={`Détail du ${popDay.split('-').reverse().join('/')}`} onClick={e => e.stopPropagation()}
            className={`w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border p-3 sm:p-4 space-y-2 ${L ? 'bg-slate-50 border-slate-200' : 'bg-[#0f1b2d] border-white/10'}`} data-testid="gcal-popup">
            <div className="flex justify-end"><button type="button" onClick={() => setPopDay(null)} className={st.roundBtn} aria-label="Fermer" data-testid="gcal-popup-close"><X className="w-5 h-5" /></button></div>
            <DayPanel day={popDay} setDay={setPopDay as (d: string) => void} {...panelProps} />
          </div>
        </div>, document.body)}
    </div>
  );
};

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
  const [selectedId, setSelectedId] = useState<string>(currentUser?.role === 'employee' ? currentUser.id : initialUserId || 'all'); // responsable : « all » = calendrier GLOBAL de tous les employés (vue par défaut)
  const [leaveFilter, setLeaveFilter] = useState<LeaveFilter>('all');

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
      if (!hasLeaveInMonth(leaves, u.id, year, month, leaveFilter)) return false;
      if (statusFilter !== 'all') {
        const days = buildDays(u.id);
        if (!days.some(d => d.status === statusFilter)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, posts, leaves, search, shiftFilter, statusFilter, leaveFilter, clientFilter, year, month]);

  // Opérateur affiché : choix, sinon premier de la liste
  const globalMode = isAdmin && selectedId === 'all';
  const activeId = globalMode ? '' : isAdmin ? (list.some(u => u.id === selectedId) ? selectedId : list[0]?.id || '') : currentUser?.id || '';
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

  // Calendrier d'UN employé : mêmes pastilles que le calendrier global ; un clic ouvre la fenêtre du jour (flèches jour précédent / suivant)
  const [popDay, setPopDay] = useState<string | null>(null);
  const nowMs = useNow(15000);
  const empCtx = useMemo(() => ({ posts, leaves: leaves as Leave[], today, cfg, clientFilter }), [posts, leaves, today, cfg, clientFilter]);
  const empDays = useMemo(() => (activeId ? empMonth(year, month, activeId, empCtx, firstActivity) : []), [activeId, year, month, empCtx, firstActivity]);
  useLockBodyScroll(popDay !== null);
  useEffect(() => {
    if (!popDay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopDay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popDay]);

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
                <div className={`text-[11px] font-semibold mb-1.5 ${sub}`}>Congés</div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setLeaveFilter('all')} className={pill(leaveFilter === 'all')}>Tous</button>
                  <button type="button" onClick={() => setLeaveFilter('approved')} className={pill(leaveFilter === 'approved')} data-testid="leave-filter-approved"><CalendarOff className="w-3.5 h-3.5" /> Acceptés</button>
                  <button type="button" onClick={() => setLeaveFilter('pending')} className={pill(leaveFilter === 'pending')} data-testid="leave-filter-pending"><Hourglass className="w-3.5 h-3.5" /> En attente</button>
                </div>
              </div>
              <div>
                <div className={`text-[11px] font-semibold mb-1.5 ${sub}`}>Mission</div>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={field}>
                  <option value="all">Toutes les missions</option>
                  {clientNames.map(c => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              {(search || shiftFilter !== 'all' || statusFilter !== 'all' || clientFilter !== 'all' || leaveFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setShiftFilter('all'); setStatusFilter('all'); setClientFilter('all'); setLeaveFilter('all'); }} className={`w-full rounded-lg border py-2 text-xs font-semibold cursor-pointer ${L ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-white/10'}`}>
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="max-h-64 lg:max-h-[50vh] overflow-y-auto space-y-1 -mx-1 px-1">
              <button type="button" onClick={() => setSelectedId('all')} data-testid="select-all-employees" className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-left transition-colors cursor-pointer ${globalMode ? (L ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-blue-500/15 ring-1 ring-blue-500/40') : (L ? 'hover:bg-slate-50' : 'hover:bg-white/5')}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${L ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400'}`}><Users className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1"><div className={`text-sm font-semibold leading-tight ${txt}`}>Tous les employés</div><div className={`text-[11px] ${sub}`}>Calendrier global · {list.length}</div></div>
              </button>
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
                  {globalMode && <div className={`text-xs break-words ${sub}`}>Tous les employés · {list.length}{clientFilter !== 'all' && <> · {clientFilter}</>}</div>}
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
              <button onClick={goToday} className="ml-1 px-4 h-10 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">Aujourd'hui</button>
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
          {globalMode ? (
            <GlobalCalendar year={year} month={month} today={today} list={list} posts={posts} leaves={leaves as Leave[]} advances={advances} cfg={cfg}
              clientFilter={clientFilter} statusFilter={statusFilter} leaveFilter={leaveFilter} first={firstActivity}
              onSelectDay={onSelectDay} onPickEmployee={id => setSelectedId(id)}
              st={{ L, card, txt, sub, TINT, pill, roundBtn }} />
          ) : !activeUser ? (
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
                      data-testid={`ecal-day-${d.dateStr}`}
                      onClick={() => setPopDay(d.dateStr)}
                      className={`min-h-[56px] sm:min-h-[92px] p-1 sm:p-2 rounded-xl sm:rounded-2xl border cursor-pointer flex flex-col gap-1 transition-all hover:shadow-md ${TINT[d.status]} ${isToday ? 'ring-2 ring-blue-500' : ''} ${dim ? 'opacity-30' : ''}`}
                    >
                      <span className={`text-[11px] sm:text-xs font-bold min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center self-start ${isToday ? 'bg-blue-600 text-white' : txt}`}>{d.day}</span>
                      {d.status !== 'no_post' && (
                        <span className="flex flex-wrap gap-0.5 sm:gap-1" data-cal-chips>
                          <StatusChip status={d.status} n={['objective_reached', 'in_progress', 'test'].includes(d.status) ? Math.max(1, d.shifts.length) : 1} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {popDay && activeUser && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setPopDay(null)} data-testid="ecal-popup-backdrop">
          <div role="dialog" aria-modal="true" aria-label={`Détail du ${popDay.split('-').reverse().join('/')}`} onClick={e => e.stopPropagation()}
            className={`w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border p-3 sm:p-4 space-y-2 ${L ? 'bg-slate-50 border-slate-200' : 'bg-[#0f1b2d] border-white/10'}`} data-testid="ecal-popup">
            <div className="flex justify-end"><button type="button" onClick={() => setPopDay(null)} className={roundBtn} aria-label="Fermer" data-testid="ecal-popup-close"><X className="w-5 h-5" /></button></div>
            <DayPanel day={popDay} setDay={setPopDay as (d: string) => void} list={[activeUser]} ctx={empCtx} first={firstActivity} today={today} posts={posts} lang={appLang === 'en' ? 'en' : 'fr'} nowMs={nowMs} ar={ar}
              onSelectDay={(d, sh) => { setPopDay(null); onSelectDay(d, sh); }} onPickEmployee={() => undefined} st={{ L, card, txt, sub, TINT, pill, roundBtn }} />
          </div>
        </div>, document.body)}
    </div>
  );
};
