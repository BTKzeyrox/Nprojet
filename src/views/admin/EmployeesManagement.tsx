import { CREATABLE_ROLES, ROLE_NAMES, roleOf, cleanTeam } from '../../utils/roles';
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { badgeAccess, usePerformance } from '../../utils/usePerformance';
import { BadgeChips } from '../../components/PerformanceBadges';
import { ImportDialog } from '../../components/ImportDialog';
import {
  Users,
  UserCheck,
  UserX,
  FileText,
  Edit,
  Trash2,
  Ban,
  Plus,
  Shield,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  ChevronRight,
  Sun,
  Moon,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { User, ShiftType, SalaryAdvanceRequest, PostSession, PresenceRow, ProfileChangeRequest, AppSettings } from '../../types';
import { Avatar } from '../../components/Avatar';
import { db } from '../../db/store';
import { askConfirm } from '../../components/ConfirmModal';
import { AdvanceHistory } from '../../components/AdvanceHistory';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { badgeLabel, formatScoreM, shiftHoursLabel } from '../../utils/formatUtils';
import { getPresenceStatus, formatDuration } from '../../utils/presence';
import { liveStatus, LIVE_META } from '../../utils/presenceStatus';
import { filterOperators, liveCounts, activeFilterCount, OP_FILTERS_DEFAULT, type OpFilters, type OpItem, type OpSort } from '../../utils/operatorList';
import { OperatorSheet } from '../../components/OperatorSheet';
import { useNow } from '../../utils/useNow';
import { LiveDot, LiveLine } from '../../components/LiveStatus';
import { setValFilterIntent, ValFilter } from '../../utils/navIntent';
import { PayrollAdmin } from '../../components/PayrollAdmin';
import { AdvPayTabs } from '../../components/AdvPayTabs';
import { OnlineOnlyNote, useOnlineOnly } from '../../components/PendingMark';
import { effShift, showShift } from '../../utils/shiftMode';

interface EmployeesManagementProps {
  onOpenEmployeeCV: (employee: User) => void;
  onNavigate?: (view: string) => void; // pastilles « à valider » cliquables
  onOpenOperator?: (id: string, view: 'operator' | 'calendar' | 'chat') => void; // fiche : page de l'opérateur, son calendrier, lui écrire
  section?: 'employees' | 'advances';
}

// Téléphone : chiffres uniquement, format fixe « 261 34 12 345 67 »
const PHONE_PREFIX = '261';
const formatPhone = (raw: string): string => {
  let d = (raw || '').replace(/\D/g, '');
  if (!d.startsWith(PHONE_PREFIX)) d = PHONE_PREFIX + d.replace(/^0+/, '');
  d = d.slice(0, 12);
  const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 10), d.slice(10, 12)].filter(Boolean);
  const out = parts.join(' ');
  return d.length === 3 ? out + ' ' : out;
};
const phoneDigits = (v: string) => v.replace(/\D/g, '');
const phoneIsEmpty = (v: string) => phoneDigits(v) === PHONE_PREFIX || phoneDigits(v) === '';
const phoneIsComplete = (v: string) => phoneDigits(v).length === 12;

export const EmployeesManagement: React.FC<EmployeesManagementProps> = ({
  onOpenEmployeeCV,
  onNavigate,
  onOpenOperator,
  section = 'employees',
}) => {
  const { lang } = useApp();
  const nowMs = useNow(15000); // les statuts en direct changent d'eux-mêmes (En ligne → En pause → Hors ligne)
  const perf = usePerformance();
  const badgesOn = badgeAccess().enabled;
  /** Badges calculés du salarié (module 3) : rien si le module est désactivé ou s'il n'a aucun badge. */
  const chipsFor = (id: string, cls: string) => {
    const b = badgesOn ? perf.res.employees.get(id)?.badges : undefined;
    return b && b.length ? <div className={cls}><BadgeChips badges={b} lang={lang} max={3} /></div> : null;
  };
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [advTab, setAdvTab] = useState<'advances' | 'payroll'>('payroll');
  const [advances, setAdvances] = useState<SalaryAdvanceRequest[]>(db.getAdvanceRequests());
  const [posts, setPosts] = useState<PostSession[]>(db.getPosts());
  const [presence, setPresence] = useState<PresenceRow[]>(db.getPresence());
  const [profileReqs, setProfileReqs] = useState<ProfileChangeRequest[]>(db.getProfileRequests());
  const [cfg, setCfg] = useState<AppSettings>(db.getSettings());
  const [, setTick] = useState(0); // rafraîchit les statuts même sans nouvelle donnée
  const [filters, setFilters] = useState<OpFilters>(OP_FILTERS_DEFAULT);
  const [sheetId, setSheetId] = useState<string | null>(null); // opérateur dont la fiche est ouverte

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const accountGate = useOnlineOnly('account'); // comptes et mots de passe : en ligne seulement
  const [editShift, setEditShift] = useState<ShiftType>('day');
  const [editBadge, setEditBadge] = useState<User['performance_badge']>('Standard');

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('261 ');
  const [newShift, setNewShift] = useState<ShiftType>('day');
  const [newTeam, setNewTeam] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [newRole, setNewRole] = useState<(typeof CREATABLE_ROLES)[number]>('employee');

  // Delete User Confirmation State
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Review Advance Modal State (No prompt() for iframe compatibility)
  const [reviewAdvanceModal, setReviewAdvanceModal] = useState<{
    advanceId: string;
    approve: boolean;
    amount: number;
    employeeName: string;
  } | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState('');

  // Lock background scroll during employee modals
  useLockBodyScroll(showAddModal || !!editingUser || !!reviewAdvanceModal);

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setUsers(db.getUsers());
      setAdvances(db.getAdvanceRequests());
      setPosts(db.getPosts());
      setPresence(db.getPresence());
      setProfileReqs(db.getProfileRequests());
      setCfg(db.getSettings());
    });
    const timer = setInterval(() => setTick(t => t + 1), 20000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  // Ce qui attend la décision de l'admin pour un opérateur
  const pendingOf = (empId: string) => {
    const items: { key: string; label: string; filter: ValFilter; n: number }[] = [];
    if (cfg.badge_start) items.push({ key: 'start', label: 'Début de mission à valider', filter: 'starts', n: posts.filter(p => p.employee_id === empId && p.status === 'pending_start').length });
    if (cfg.badge_end) items.push({ key: 'end', label: 'Fin de mission à valider', filter: 'ends', n: posts.filter(p => p.employee_id === empId && p.status === 'pending_end').length });
    // Les avances n'existent plus dans Gestion Pro : plus de pastille « Avance »
    if (cfg.badge_profile) items.push({ key: 'prf', label: 'Profil à valider', filter: 'profiles', n: profileReqs.filter(r => r.user_id === empId && r.status === 'pending').length });
    return items.filter(i => i.n > 0);
  };

  const handleToggleBlock = (userId: string) => {
    db.toggleUserBlock(userId);
  };

  const handleDeleteUser = (user: User) => {
    askConfirm({
      title: `Supprimer ${user.name} ?`,
      message: 'Son compte et TOUTES ses données seront effacés définitivement : missions, messages, publications, commentaires, avances et fichiers. Cette action est irréversible.',
      confirmLabel: 'Tout supprimer',
      danger: true,
      onConfirm: () => {
        const r = db.deleteUser(user.id);
        if (!r.success) alert(r.error || 'Suppression impossible.');
      },
    });
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditPhone(formatPhone(user.phone || ''));
    setEditShift(user.shift);
    setEditTeam(user.team || '');
    setEditBadge(user.performance_badge);
    setEditPassword('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!phoneIsEmpty(editPhone) && !phoneIsComplete(editPhone)) {
      alert('Téléphone incomplet. Format : 261 34 12 345 67');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      alert('Le mot de passe doit avoir au moins 6 caractères.');
      return;
    }

    if (editPassword) {
      const pw = await db.setPassword(editingUser.id, editPassword);
      if (!pw.success) {
        alert(pw.error || 'Mot de passe non modifié.');
        return;
      }
    }

    db.updateUser(editingUser.id, {
      name: editName,
      phone: phoneIsEmpty(editPhone) ? '' : editPhone,
      shift: editShift,
      team: cleanTeam(editTeam),
      performance_badge: editBadge,
    });

    setEditingUser(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    if (!newUsername.trim()) {
      setAddUserError('Identifiant manquant.');
      return;
    }
    if (!newPassword) {
      setAddUserError('Mot de passe manquant.');
      return;
    }
    if (newPassword.length < 6) {
      setAddUserError('Le mot de passe doit avoir au moins 6 caractères.');
      return;
    }
    if (!newName.trim()) {
      setAddUserError('Nom complet manquant.');
      return;
    }
    if (!phoneIsEmpty(newPhone) && !phoneIsComplete(newPhone)) {
      setAddUserError('Téléphone incomplet. Format : 261 34 12 345 67');
      return;
    }

    const created = await db.addUser({
      username: newUsername.toLowerCase().trim(),
      name: newName.trim(),
      phone: phoneIsEmpty(newPhone) ? '' : newPhone.trim(),
      shift: newShift,
      role: newRole,
      team: cleanTeam(newTeam),
      status: 'active',
      avatar_url: '',
      performance_badge: 'Standard',
    }, newPassword);

    if (!created.success) {
      setAddUserError(created.error || 'Création impossible.');
      return;
    }

    setShowAddModal(false);
    setNewUsername('');
    setNewPassword('');
    setNewName('');
    setNewPhone('261 ');
    setNewRole('employee');
    setNewTeam('');
  };

  const handleOpenReviewAdvance = (adv: SalaryAdvanceRequest, approve: boolean) => {
    setReviewAdvanceModal({
      advanceId: adv.id,
      approve,
      amount: adv.amount_ar,
      employeeName: adv.employee_name,
    });
    setAdvanceNotes(approve ? 'Validé par l\'administrateur' : '');
  };

  const handleConfirmReviewAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewAdvanceModal) return;
    if (!reviewAdvanceModal.approve && advanceNotes.trim().length < 3) return;
    db.reviewAdvanceRequest(reviewAdvanceModal.advanceId, reviewAdvanceModal.approve, advanceNotes.trim() || undefined);
    setReviewAdvanceModal(null);
  };

  // Comptables et chefs d'équipe : ils ne sont ni dans les vacations ni dans la paie, on les gère ici
  const staff = users.filter(u => u.role !== 'employee' && u.role !== 'admin');

  // Opérateurs : recherche + filtres + tri (règles pures dans utils/operatorList.ts) ; chacun avec son statut en direct
  const en = lang === 'en';
  const allEmployees = users.filter(u => u.role === 'employee');
  const items: OpItem[] = allEmployees.map(u => ({ user: u, live: liveStatus(u, posts, presence, nowMs) }));
  const shown = filterOperators(items, filters);
  const counts = liveCounts(items);
  const sheetUser = sheetId ? users.find(u => u.id === sheetId) || null : null;

  const pendingAdvances = advances.filter(a => a.status === 'pending');

  return (
    <div className="space-y-4 sm:space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-4 sm:py-6">
      
      {section === 'employees' && (
        <>
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0f1722] p-4 sm:p-6 rounded-xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-tactical text-white">
              Opérateurs de l'équipe
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Touchez un opérateur pour ouvrir sa fiche : session, profil, modification, accès, blocage.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un Opérateur</span>
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="w-full sm:w-auto px-4 py-2 min-h-[44px] border border-slate-700 text-slate-200 text-xs font-bold rounded-lg flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{lang === 'en' ? 'Import (Excel, CSV)' : 'Importer (Excel, CSV)'}</span>
          </button>
        </div>
        {importing && <ImportDialog kind="employees" onClose={() => setImporting(false)} />}
      </div>

      {/* ===== LISTE DES OPÉRATEURS : compacte, sans boutons de gestion sur chaque ligne. Toucher une ligne ouvre la fiche (OperatorSheet) avec toutes les actions. ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="live-counters">
        {(['working', 'online', 'pause', 'offline'] as const).map(s => (
          <button key={s} type="button" onClick={() => setFilters(f => ({ ...f, live: f.live === s ? 'all' : s }))} data-testid={`live-counter-${s}`}
            className={`min-h-[52px] px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${filters.live === s ? 'bg-slate-700 border-slate-400' : 'bg-[#131c28] border-slate-800 hover:border-slate-600'}`}>
            <span className={`w-3 h-3 rounded-full shrink-0 ${LIVE_META[s].dot}`} aria-hidden="true" />
            <span className="min-w-0"><span className={`block text-lg font-bold leading-none ${LIVE_META[s].text}`}>{counts[s]}</span><span className="block text-[11px] text-slate-400 leading-tight">{LIVE_META[s][en ? 'en' : 'fr']}</span></span>
          </button>
        ))}
      </div>

      <div className="bg-[#131c28] p-3 rounded-xl border border-slate-800 space-y-3">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input type="search" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} data-testid="op-search"
            placeholder={en ? 'Search an operator: name, username, phone, day or night…' : 'Rechercher un opérateur : nom, identifiant, téléphone, jour ou nuit…'}
            aria-label={en ? 'Search an operator' : 'Rechercher un opérateur'}
            className="w-full min-h-[48px] pl-10 pr-11 rounded-xl bg-slate-900 border border-slate-600 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500" />
          {filters.search && <button type="button" onClick={() => setFilters(f => ({ ...f, search: '' }))} aria-label={en ? 'Clear search' : 'Effacer la recherche'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-slate-300 hover:bg-slate-700 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-xs">
          {([
            [en ? 'Shift' : 'Vacation', 'shift', [['all', en ? 'All' : 'Toutes'], ['day', en ? 'Day' : 'Jour'], ['night', en ? 'Night' : 'Nuit']]],
            [en ? 'Account' : 'Compte', 'account', [['all', en ? 'All' : 'Tous'], ['active', en ? 'Active' : 'Actifs'], ['blocked', en ? 'Blocked' : 'Bloqués']]],
            [en ? 'Level' : 'Performance', 'level', [['all', en ? 'All' : 'Tous'], ['Top Booster', badgeLabel('Top Booster')], ['Elite', badgeLabel('Elite')], ['Standard', badgeLabel('Standard')], ['Under Watch', badgeLabel('Under Watch')]]],
          ] as [string, 'shift' | 'account' | 'level', [string, string][]][]).filter(([, k]) => k !== 'shift' || showShift(cfg)).map(([title, key, opts]) => (
            <div key={key} className="min-w-0">
              <div className="text-[10px] font-mono uppercase text-slate-500 mb-1">{title}</div>
              <div className="flex flex-wrap gap-1">
                {opts.map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setFilters(f => ({ ...f, [key]: val }))} data-testid={`op-filter-${key}-${val}`} aria-pressed={filters[key] === val}
                    className={`min-h-[36px] px-3 rounded-lg border font-semibold cursor-pointer whitespace-nowrap ${filters[key] === val ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          <label className="min-w-0 text-[10px] font-mono uppercase text-slate-500">{en ? 'Sort by' : 'Trier par'}
            <select value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value as OpSort }))} data-testid="op-sort"
              className="mt-1 block min-h-[36px] px-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-xs normal-case cursor-pointer">
              <option value="name">{en ? 'Name' : 'Nom'}</option>
              <option value="live">{en ? 'Live status' : 'Statut en direct'}</option>
              <option value="level">{en ? 'Level' : 'Niveau'}</option>
              <option value="score">{en ? 'Units' : 'Unités'}</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span data-testid="op-count">{shown.length} {en ? 'of' : 'sur'} {allEmployees.length} {en ? 'operators' : 'opérateurs'}</span>
          {activeFilterCount(filters) > 0 && <button type="button" onClick={() => setFilters(OP_FILTERS_DEFAULT)} data-testid="op-reset" className="min-h-[36px] px-3 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700 cursor-pointer">{en ? 'Reset filters' : 'Réinitialiser les filtres'}</button>}
        </div>
      </div>

      <ul className="space-y-2" data-testid="op-list">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-slate-400 bg-[#0f1722] rounded-xl border border-slate-800">{allEmployees.length === 0 ? (en ? 'No operator yet.' : 'Aucun opérateur pour le moment.') : (en ? 'No operator matches the filters.' : 'Aucun opérateur ne correspond à la recherche ou aux filtres.')}</li>}
        {shown.map(({ user: emp, live }) => {
          const blocked = emp.status === 'blocked';
          const pend = pendingOf(emp.id);
          const mission = live.openMission ? posts.find(p => p.employee_id === emp.id && ['active', 'pending_start', 'pending_end'].includes(p.status)) : undefined;
          return (
            <li key={emp.id} data-nav={`emp-${emp.id}`}>
              <div role="button" tabIndex={0} aria-label={`${emp.name} : ${en ? 'open the sheet' : 'ouvrir la fiche'}`} data-testid={`op-row-${emp.id}`}
                onClick={() => setSheetId(emp.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetId(emp.id); } }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${blocked ? 'bg-red-950/20 border-red-900/60 hover:border-red-700' : 'bg-[#0f1722] border-slate-800 hover:border-slate-500'}`}>
                <span className="relative shrink-0 inline-flex">
                  <Avatar src={emp.avatar_url} name={emp.name} className="w-12 h-12 rounded-full ring-2 ring-slate-700" />
                  <LiveDot info={live} lang={en ? 'en' : 'fr'} ring="border-[#0f1722]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-white break-words">{emp.name}</span>
                    {blocked && <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-700 text-red-300 text-[10px] font-bold uppercase">{en ? 'Blocked' : 'Bloqué'}</span>}
                    {!blocked && emp.access_mode === 'block' && <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 text-[10px] font-bold uppercase">{en ? 'Access off' : 'Accès coupé'}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 break-words">@{emp.username} · {showShift(cfg) ? (emp.shift === 'day' ? (en ? 'Day' : 'Jour') : (en ? 'Night' : 'Nuit')) : (en ? 'Hours' : 'Horaires')} ({shiftHoursLabel(effShift(emp.shift, cfg.shift_mode), cfg)})</div>
                  <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2"><LiveLine info={live} lang={en ? 'en' : 'fr'} />{mission && <span className="text-slate-400 break-words">· {mission.client_name}</span>}</div>
                  {pend.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                      {pend.map(b => {
                        const cls = 'px-1.5 py-0.5 text-[10px] font-bold uppercase border bg-amber-950/70 border-amber-500/60 text-amber-300 whitespace-nowrap';
                        const text = `${b.label}${b.n > 1 ? ` (${b.n})` : ''}`;
                        return cfg.badges_clickable && onNavigate
                          ? <button key={b.key} type="button" onClick={() => { setValFilterIntent(b.filter); onNavigate('validations'); }} className={`${cls} cursor-pointer hover:bg-amber-900`} title="Ouvrir la page Validations">{text}</button>
                          : <span key={b.key} className={cls}>{text}</span>;
                      })}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 hidden min-[420px]:block">
                  <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-bold whitespace-nowrap">{badgeLabel(emp.performance_badge)}</div>
                  <div className="text-emerald-400 text-xs font-bold mt-1 whitespace-nowrap">{formatScoreM(emp.total_score_boosted)} {en ? 'units' : 'unités'}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>

      {staff.length > 0 && (
        <div className="bg-[#131c28] p-3 rounded-xl border border-slate-800 space-y-2" data-testid="staff-list">
          <div className="text-xs font-mono font-bold text-slate-300 uppercase">{en ? 'Accountants and team leads' : 'Comptables et chefs d\'équipe'} ({staff.length})</div>
          <ul className="space-y-1.5">
            {staff.map(u => (
              <li key={u.id} data-nav={`emp-${u.id}`}>
                <div role="button" tabIndex={0} data-testid={`staff-row-${u.id}`} onClick={() => setSheetId(u.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetId(u.id); } }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-[#0f1722] border border-slate-800 hover:border-slate-500 cursor-pointer">
                  <Avatar src={u.avatar_url} name={u.name} className="w-10 h-10 rounded-full ring-2 ring-slate-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-semibold break-words">{u.name}</div>
                    <div className="text-[11px] text-slate-400 break-words">{ROLE_NAMES[roleOf(u.role)][0]}{u.team ? ` · équipe ${u.team}` : ''} · @{u.username}{u.status === 'blocked' ? ` · ${en ? 'blocked' : 'bloqué'}` : ''}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheetUser && (
        <OperatorSheet user={sheetUser} cfg={cfg} lang={en ? 'en' : 'fr'} nowMs={nowMs} live={liveStatus(sheetUser, posts, presence, nowMs)} posts={posts}
          onlineSec={getPresenceStatus(sheetUser, posts, presence).onlineSec}
          chips={(() => { const pend = pendingOf(sheetUser.id); return pend.length ? (
            <div className="flex flex-wrap gap-1">{pend.map(b => {
              const cls = 'px-2 py-1 text-[11px] font-bold uppercase border bg-amber-950/70 border-amber-500/60 text-amber-300 rounded';
              const text = `${b.label}${b.n > 1 ? ` (${b.n})` : ''}`;
              return onNavigate ? <button key={b.key} type="button" onClick={() => { setValFilterIntent(b.filter); setSheetId(null); onNavigate('validations'); }} className={`${cls} cursor-pointer hover:bg-amber-900`}>{text}</button> : <span key={b.key} className={cls}>{text}</span>;
            })}</div>) : null; })()}
          onClose={() => setSheetId(null)}
          onProfile={() => { setSheetId(null); onOpenEmployeeCV(sheetUser); }}
          onEdit={() => { const u = sheetUser; setSheetId(null); handleOpenEdit(u); }}
          onToggleBlock={() => { const u = sheetUser, b = u.status === 'blocked'; askConfirm({ title: b ? `Débloquer ${u.name} ?` : `Bloquer ${u.name} ?`, message: b ? 'Le compte pourra de nouveau se connecter.' : 'Le compte ne pourra plus se connecter tant qu\'il est bloqué.', confirmLabel: b ? 'Débloquer' : 'Bloquer', danger: !b, onConfirm: () => handleToggleBlock(u.id) }); }}
          onDelete={() => { const u = sheetUser; setSheetId(null); handleDeleteUser(u); }}
          onSetAccess={mode => db.setAccessMode(sheetUser.id, mode)}
          onForceLogout={minutes => db.forceLogout(sheetUser.id, { minutes })}
          onCancelForce={() => db.forceLogout(sheetUser.id, { cancel: true })}
          onOpen={onOpenOperator && sheetUser.role === 'employee' ? view => { const id = sheetUser.id; setSheetId(null); onOpenOperator(id, view); } : undefined} />
      )}

        </>
      )}

      {section === 'advances' && (
        <>
      <AdvPayTabs value={advTab} onChange={setAdvTab} payLabel="Paie" />
      {advTab === 'payroll' ? <PayrollAdmin /> : (
        <>
      {/* SECTION: SALARY ADVANCE APPROVALS (DMD d'avance) */}
      <div id="advances-section" className="bg-[#0f1722] border border-slate-800 rounded-xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-tactical font-bold text-white text-base flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-amber-400" />
          Demandes d'Avances sur Salaire en Attente ({pendingAdvances.length})
        </h3>
        <p className="text-xs text-slate-400 font-mono mb-4">
          Validation des avances demandées par les opérateurs ("DMD d'avance").
        </p>

        {pendingAdvances.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
            Aucune demande d'avance en attente d'approbation.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingAdvances.map(adv => (
              <div
                key={adv.id}
                className="bg-[#121c27] p-4 rounded-xl border border-slate-700/80 flex flex-col justify-between space-y-3 text-xs font-mono"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{adv.employee_name}</span>
                    <span className="text-base font-bold text-amber-400">{adv.amount_ar.toLocaleString()} Ar</span>
                  </div>
                  <p className="text-slate-300 mt-1 leading-relaxed">
                    Motif: {adv.reason}
                  </p>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Date demande: {adv.request_date}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handleOpenReviewAdvance(adv, false)}
                    className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Refuser</span>
                  </button>
                  <button
                    onClick={() => handleOpenReviewAdvance(adv, true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approuver l'Avance</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTORIQUE DES AVANCES : recherche + filtres */}
      <div className="bg-[#0f1722] border rounded-2xl border-slate-800 p-4 sm:p-6 shadow-xl">
        <AdvanceHistory advances={advances} showOperator />
      </div>

        </>
      )}
        </>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-5 sm:p-6 space-y-4 text-xs font-mono shadow-2xl my-6">
            <h3 className="font-tactical font-bold text-white text-base">
              Modifier Opérateur: {editingUser.name}
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-slate-300 uppercase mb-1">Nom Complet</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">Téléphone</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={16}
                  placeholder="261 34 12 345 67"
                  value={editPhone}
                  onChange={e => setEditPhone(formatPhone(e.target.value))}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              {<div>
                <label className="block text-slate-300 uppercase mb-1">Nouveau mot de passe (optionnel)</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  minLength={6}
                  autoComplete="off"
                  placeholder="laisser vide = inchangé"
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>}

              {editingUser && editingUser.role === 'accountant' && (
                <div className="rounded-lg border border-slate-700 p-2 space-y-1">
                  <p className="text-slate-300 uppercase">Sécurité en deux étapes</p>
                  <p className="text-[11px] text-slate-400">Téléphone perdu et plus de code de secours : remets la double étape à zéro. Il pourra la réactiver ensuite.</p>
                  <button type="button" className="min-h-[44px] px-3 rounded-lg border border-slate-600 text-slate-100 text-sm font-semibold cursor-pointer" onClick={async () => {
                    if (!window.confirm('Remettre à zéro la double étape de ce compte ?')) return;
                    const r = await db.totpReset(editingUser.id);
                    alert(r.ok ? 'Double étape remise à zéro.' : (r.error || 'Non modifié.'));
                  }}>Remettre la double étape à zéro</button>
                </div>
              )}

              {editingUser && (editingUser.role === 'employee' || editingUser.role === 'team_lead') && (
              <div>
                <label className="block text-slate-300 uppercase mb-1">Équipe</label>
                <input list="df-teams" value={editTeam} onChange={e => setEditTeam(e.target.value)} maxLength={40} placeholder="ex: Équipe Nord (vide = aucune)" className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white" />
                <datalist id="df-teams">{[...new Set(users.map(u => (u.team || '').trim()).filter(Boolean))].map(t => <option key={t} value={t} />)}</datalist>
              </div>
              )}

              {showShift(cfg) && (
              <div>
                <label className="block text-slate-300 uppercase mb-1">Vacation</label>
                <select
                  value={editShift}
                  onChange={e => setEditShift(e.target.value as ShiftType)}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="day">{` Vacation Jour (${shiftHoursLabel('day', cfg)})`}</option>
                  <option value="night">{` Vacation Nuit (${shiftHoursLabel('night', cfg)})`}</option>
                </select>
              </div>
              )}

              <div>
                <label className="block text-slate-300 uppercase mb-1">Niveau</label>
                <select
                  value={editBadge}
                  onChange={e => setEditBadge(e.target.value as any)}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="Top Booster">{badgeLabel('Top Booster')}</option>
                  <option value="Elite">{badgeLabel('Elite')}</option>
                  <option value="Standard">{badgeLabel('Standard')}</option>
                  <option value="Under Watch">{badgeLabel('Under Watch')}</option>
                </select>
              </div>

              <OnlineOnlyNote kind="account" />
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={accountGate.blocked}
                  title={accountGate.blocked ? accountGate.why : undefined}
                  className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-5 sm:p-6 space-y-4 text-xs font-mono shadow-2xl my-6">
            <h3 className="font-tactical font-bold text-white text-base">
              Enregistrer un Nouvel Opérateur
            </h3>

            {addUserError && (
              <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 rounded-lg text-xs font-mono">
                {addUserError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-slate-300 uppercase mb-1">Identifiant Unique (Username)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  required
                  placeholder="ex: faniry_df"
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              {<div>
                <label className="block text-slate-300 uppercase mb-1">Mot de passe (6 caractères min.)</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  autoComplete="off"
                  placeholder="à communiquer à l'employé"
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>}

              <div>
                <label className="block text-slate-300 uppercase mb-1">Nom Complet</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                  placeholder="ex: Faniry Rakoto"
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">Téléphone de Contact</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={16}
                  placeholder="261 34 12 345 67"
                  value={newPhone}
                  onChange={e => setNewPhone(formatPhone(e.target.value))}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">Rôle</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as (typeof CREATABLE_ROLES)[number])}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                >
                  {CREATABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_NAMES[r][0]}</option>)}
                </select>
              </div>

              {(newRole === 'employee' || newRole === 'team_lead') && (
              <div>
                <label className="block text-slate-300 uppercase mb-1">Équipe (facultatif)</label>
                <input list="df-teams" value={newTeam} onChange={e => setNewTeam(e.target.value)} maxLength={40} placeholder="ex: Équipe Nord" className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white" />
                <datalist id="df-teams">{[...new Set(users.map(u => (u.team || '').trim()).filter(Boolean))].map(t => <option key={t} value={t} />)}</datalist>
                <p className="text-[11px] text-slate-400 mt-1">Un Chef d'équipe valide les sessions des opérateurs qui ont le même nom d'équipe.</p>
              </div>
              )}

              {newRole === 'employee' && showShift(cfg) && (
              <div>
                <label className="block text-slate-300 uppercase mb-1">Vacation Initial</label>
                <select
                  value={newShift}
                  onChange={e => setNewShift(e.target.value as ShiftType)}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="day">{` Day Vacation (${shiftHoursLabel('day', cfg)})`}</option>
                  <option value="night">{` Night Vacation (${shiftHoursLabel('night', cfg)})`}</option>
                </select>
              </div>
              )}

              <OnlineOnlyNote kind="account" />
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={accountGate.blocked}
                  title={accountGate.blocked ? accountGate.why : undefined}
                  className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded disabled:opacity-50"
                >
                  Créer le Profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW ADVANCE MODAL (No prompt() for iframe compatibility) */}
      {reviewAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {reviewAdvanceModal.approve ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <h3 className="font-tactical font-black text-white text-base">
                  {reviewAdvanceModal.approve ? 'Approuver l\'Avance' : 'Refuser la Demande'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewAdvanceModal(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#141e2a] p-3 rounded-xl border border-slate-800 text-xs font-mono">
              <div className="text-slate-400">Opérateur : <strong className="text-white">{reviewAdvanceModal.employeeName}</strong></div>
              <div className="text-slate-400 mt-1">Montant : <strong className="text-amber-400">{reviewAdvanceModal.amount.toLocaleString()} Ar</strong></div>
            </div>

            <form onSubmit={handleConfirmReviewAdvance} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-300 uppercase mb-1 font-semibold">
                  {reviewAdvanceModal.approve ? 'Note de validation (optionnel)' : 'Motif de refus (obligatoire)'}
                </label>
                <textarea
                  rows={3}
                  value={advanceNotes}
                  onChange={e => setAdvanceNotes(e.target.value)}
                  required={!reviewAdvanceModal.approve}
                  placeholder={reviewAdvanceModal.approve ? 'Ajouter une note...' : 'Écris la raison du refus'}
                  minLength={reviewAdvanceModal.approve ? undefined : 3}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewAdvanceModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 font-tactical font-bold text-xs uppercase tracking-wider rounded-xl text-white cursor-pointer shadow ${
                    reviewAdvanceModal.approve
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {reviewAdvanceModal.approve ? 'Confirmer l\'Approbation' : 'Confirmer le Refus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
