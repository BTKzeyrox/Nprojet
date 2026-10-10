import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { NAV_TARGET_EVENT, peekNavTarget } from '../utils/navTarget';
import {
  Target,
  Search,
  AlertCircle,
  ArrowRight,
  Gamepad2,
  Eye,
  CheckCircle2,
  Sun,
  Moon,
  Clock,
  Camera,
  Filter,
  Check,
  Zap,
  Hourglass,
  CircleDot,
  Circle,
  Plus,
} from 'lucide-react';
import { ClientContract, PostSession, User } from '../types';
import { db } from '../db/store';
import { formatScoreM, formatCurrencyAr } from '../utils/formatUtils';
import { useApp } from '../context/AppContext';
import { askConfirm } from './ConfirmModal';
import { ScoreInput } from './ScoreInput';
import { getRemainingBand } from '../utils/postBand';
import { PendingPostActions } from './PendingPostActions';

interface PostsGrid20Props {
  currentUser: User;
  activePost?: PostSession;
  allPosts: PostSession[];
  onSelectContract: (contract: ClientContract) => void;
  onOpenProofLightbox: (params: {
    imageUrl: string;
    gallery?: string[];
    title: string;
    subtitle?: string;
    score?: number;
    clientTag?: string;
    operatorName?: string;
    timestamp?: string;
  }) => void;
  onNavigateToActivePost: () => void;
}

export const PostsGrid20: React.FC<PostsGrid20Props> = ({
  currentUser,
  activePost,
  allPosts,
  onSelectContract,
  onOpenProofLightbox,
  onNavigateToActivePost,
}) => {
  const { t, theme } = useApp();
  const [contractsList, setContractsList] = useState<ClientContract[]>(() => db.getContracts());
  const [filterShift, setFilterShift] = useState<'all' | 'day' | 'night' | 'urgent'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'active' | 'free'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Arrivée depuis la recherche ou une notification : on enlève les filtres pour que le poste soit visible
  useEffect(() => {
    const apply = () => {
      const t = peekNavTarget();
      if (t && t.startsWith('poste-')) { setFilterShift('all'); setFilterStatus('all'); setSearchQuery(''); }
    };
    apply();
    window.addEventListener(NAV_TARGET_EVENT, apply);
    return () => window.removeEventListener(NAV_TARGET_EVENT, apply);
  }, []);
  const [sortBy, setSortBy] = useState<'number' | 'rest_desc' | 'obj_asc' | 'obj_desc'>('number');

  const isLight = theme === 'light';

  // Admin : ajout d'un poste
  const [showAdd, setShowAdd] = useState(false);
  useLockBodyScroll(showAdd);
  const [addName, setAddName] = useState('');
  const [addInitial, setAddInitial] = useState(0);
  const [addObjective, setAddObjective] = useState(0);
  const [addDesc, setAddDesc] = useState('');
  const [addType, setAddType] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const postTypes = db.getSettings().post_types || [];

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const r = db.addContract({ client_name: addName, initial_score: addInitial, objective: addObjective, description: addDesc, post_type: addType });
    if (!r.success) return setAddError(r.error || 'Ajout impossible.');
    setShowAdd(false);
    setAddName(''); setAddInitial(0); setAddObjective(0); setAddDesc(''); setAddType(''); setAddError(null);
  };

  // Keep contracts synchronized with store
  useEffect(() => {
    const unsub = db.subscribe(() => {
      setContractsList(db.getContracts());
    });
    return unsub;
  }, []);

  // Une seule passe sur les sessions (au lieu d'une recherche dans toute la liste pour chaque carte)
  const { pendingBy, activeBy, liveBy } = useMemo(() => {
    const pendingBy = new Map<string, (typeof allPosts)[number]>();
    const activeBy = new Map<string, (typeof allPosts)[number]>();
    const liveBy = new Map<string, (typeof allPosts)[number]>();
    for (const p of allPosts) {
      if (p.status !== 'active' && p.status !== 'pending_start' && p.status !== 'pending_end') continue;
      if (!liveBy.has(p.client_name)) liveBy.set(p.client_name, p);
      if (p.status === 'active') {
        if (!activeBy.has(p.client_name)) activeBy.set(p.client_name, p);
      } else if (!pendingBy.has(p.client_name)) pendingBy.set(p.client_name, p);
    }
    return { pendingBy, activeBy, liveBy };
  }, [allPosts]);

  // Calculate live stats for the header and filters
  const pendingContracts = contractsList.filter(c => {
    return !!pendingBy.get(c.client_name);
  });

  const activeContracts = contractsList.filter(c => {
    return !!activeBy.get(c.client_name);
  });

  const freeContracts = contractsList.filter(c => {
    return !liveBy.get(c.client_name);
  });

  const filteredContracts = contractsList.filter(contract => {
    const matchesSearch =
      contract.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.account_tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.game_mode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `poste ${contract.post_number}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#${contract.post_number}`.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Shift Filter
    if (filterShift === 'day' && contract.recommended_shift !== 'day') return false;
    if (filterShift === 'night' && contract.recommended_shift !== 'night') return false;
    if (filterShift === 'urgent' && contract.priority !== 'Urgente') return false;

    // Status Filter
    const session = liveBy.get(contract.client_name);

    if (filterStatus === 'pending') {
      if (!session || (session.status !== 'pending_start' && session.status !== 'pending_end')) return false;
    } else if (filterStatus === 'active') {
      if (!session || session.status !== 'active') return false;
    } else if (filterStatus === 'free') {
      if (session) return false;
    }

    return true;
  });

  // Reste et Objectif d'un poste (mêmes formules que sur la carte)
  const restOf = (c: ClientContract) => {
    const session = liveBy.get(c.client_name);
    const objective = Math.max(1, c.target_score - c.initial_score);
    const current = Number(session ? session.final_score ?? session.current_score : c.current_score ?? c.initial_score) || 0;
    return Math.max(0, objective - Math.max(0, current - c.initial_score));
  };
  const objectiveOf = (c: ClientContract) => Math.max(1, c.target_score - c.initial_score);
  const sortedContracts = [...filteredContracts].sort((a, b) => {
    if (sortBy === 'rest_desc') return restOf(b) - restOf(a) || a.post_number - b.post_number;
    if (sortBy === 'obj_asc') return objectiveOf(a) - objectiveOf(b) || a.post_number - b.post_number;
    if (sortBy === 'obj_desc') return objectiveOf(b) - objectiveOf(a) || a.post_number - b.post_number;
    return a.post_number - b.post_number;
  });
  const settings = db.getSettings();
  const gridCols = Math.min(10, Math.max(1, Math.round(settings.grid_columns || 2)));
  // Densité des cartes : selon la largeur réelle d'une carte (colonnes choisies + taille de l'écran), le texte et les blocs s'adaptent
  const gridRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState('xl');
  const [effCols, setCols] = useState(gridCols);
  const hasCards = sortedContracts.length > 0;
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth;
      const gap = window.innerWidth >= 640 ? 10 : 6;
      // Une carte ne descend jamais sous 110 px (66 px sur téléphone) : trop de colonnes pour l'écran = moins de colonnes
      const minW = window.innerWidth >= 640 ? 110 : 66; // téléphone : on respecte le choix de BTK jusqu'à 66 px par carte
      const eff = Math.max(1, Math.min(gridCols, Math.floor((w + gap) / (minW + gap))));
      setCols(eff);
      const cw = (w - gap * (eff - 1)) / eff;
      setDensity(cw >= 340 ? 'xl' : cw >= 260 ? 'l' : cw >= 190 ? 'm' : cw >= 140 ? 's' : 'xs');
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridCols, hasCards]);
  const isAdminView = currentUser.role === 'admin';

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {!isAdminView && settings.rules.trim() && (
        <div className="border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed whitespace-pre-line break-words text-slate-200">
          <strong className="block text-amber-400 font-mono uppercase mb-0.5">Règles</strong>
          {settings.rules}
        </div>
      )}
      {/* Control Bar: Search, Shift Filter, Status Filter & View Mode Switcher */}
      <div
        className={`border rounded-xl p-3 sm:p-4 shadow-lg transition-colors ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0d1624] border-slate-800 text-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher client, tag, poste #..."
              className={`w-full border rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-colors ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  : 'bg-[#0a1017] border-slate-800 text-white placeholder-slate-500'
              }`}
            />
          </div>

          {/* Right Controls: View Mode Switcher & Quick Counts */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            {/* Total Posts Count */}
            <div
              className={`px-3 py-1.5 rounded-xl border text-center shrink-0 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#090f18] border-slate-800'
              }`}
            >
              <div className="text-[9px] font-mono text-slate-400 uppercase leading-none">Postes</div>
              <div className="text-sm font-tactical font-black text-emerald-500 mt-0.5">{contractsList.length}</div>
            </div>
            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => { setAddError(null); setShowAdd(true); }}
                disabled={contractsList.length >= 100}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shrink-0"
              >
                <Plus className="w-4 h-4" /> Ajouter un poste
              </button>
            )}
          </div>
        </div>

        {/* Filtrages complets visibles pour Employés & Admin */}
        <div
          className={`mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
            isLight ? 'border-slate-200' : 'border-slate-800/80'
          }`}
        >
          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3 text-cyan-400" />
              <span>Statut:</span>
            </span>
            {[
              { id: 'all', label: 'Tous', icon: null as any, count: contractsList.length, color: 'emerald' },
              { id: 'pending', label: 'En attente', icon: Hourglass, count: pendingContracts.length, color: 'amber' },
              { id: 'active', label: 'En cours', icon: CircleDot, count: activeContracts.length, color: 'cyan' },
              { id: 'free', label: 'Libres', icon: Circle, count: freeContracts.length, color: 'slate' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterStatus(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  filterStatus === f.id
                    ? f.id === 'pending'
                      ? 'bg-amber-600 text-white shadow-md'
                      : f.id === 'active'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-emerald-600 text-white shadow-md'
                    : isLight
                    ? 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                    : 'bg-[#121c28] text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {f.icon && <f.icon className="w-3.5 h-3.5 shrink-0" />}
                  {f.label}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    filterStatus === f.id
                      ? 'bg-black/30 text-white'
                      : f.id === 'pending' && f.count > 0
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tri */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase mr-1">Tri:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className={`px-2 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer border focus:outline-none focus:border-emerald-500 ${
                isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-[#121c28] text-slate-200 border-slate-700'
              }`}
            >
              <option value="number">Numéro du poste</option>
              <option value="rest_desc">Reste : plus → moins</option>
              <option value="obj_asc">Objectif : petit → grand</option>
              <option value="obj_desc">Objectif : grand → petit</option>
            </select>
          </div>

          {/* Shift Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase mr-1">Shift:</span>
            {[
              { id: 'all', label: 'Tous', icon: null as any },
              { id: 'day', label: 'Jour', icon: Sun },
              { id: 'night', label: 'Nuit', icon: Moon },
              { id: 'urgent', label: 'Urgent', icon: Zap },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterShift(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer inline-flex items-center gap-1 ${
                  filterShift === f.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : isLight
                    ? 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                    : 'bg-[#121c28] text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {f.icon && <f.icon className="w-3.5 h-3.5 shrink-0" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cartes des postes (2 colonnes) */}
        <div ref={gridRef} data-d={density} className="pc-grid grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(gridCols, effCols)}, minmax(0, 1fr))` }}>
          {sortedContracts.map(contract => {
            const isMyActive = activePost?.client_name === contract.client_name;
            const activeSessionOnThis = liveBy.get(contract.client_name);
            const isTakenByOther = activeSessionOnThis && activeSessionOnThis.employee_id !== currentUser.id;
            const isPending =
              activeSessionOnThis?.status === 'pending_start' || activeSessionOnThis?.status === 'pending_end';

            // Début = fixé par l'admin ; Actuel = score réel du compte
            const initialScore = contract.initial_score;
            // Objectif = nombre de points à gagner (cible - départ du poste)
            const objectiveScore = Math.max(1, contract.target_score - contract.initial_score);
            const currentScore = Number(
              activeSessionOnThis
                ? activeSessionOnThis.final_score ?? activeSessionOnThis.current_score
                : contract.current_score ?? contract.initial_score
            ) || 0;
            const boostedDiff = Math.max(0, currentScore - initialScore);
            const remainingScore = Math.max(0, objectiveScore - boostedDiff);
            const progressPercent = Math.min(100, Math.max(0, Math.round((boostedDiff / objectiveScore) * 100)));

            const postLabel = `P${String(contract.post_number).padStart(2, '0')}`;
            const noAccount = !!contract.no_account || !contract.client_name;
            // Couleur selon le Reste : moins de 20M rouge, moins de 50M orange, au-dessus aucune couleur
            const band = getRemainingBand(remainingScore, noAccount);
            // Bordure fine et douce (rouge ou orange) + fond en léger dégradé de la même couleur
            const bandStyle: React.CSSProperties | undefined =
              isPending || isMyActive || isTakenByOther || band === 'normal'
                ? undefined
                : band === 'red'
                ? { borderColor: 'rgba(248,113,113,.7)', borderWidth: 2, backgroundImage: 'linear-gradient(135deg, rgba(248,113,113,.14) 0%, rgba(248,113,113,.04) 55%, transparent 100%)' }
                : { borderColor: 'rgba(251,191,36,.7)', borderWidth: 2, backgroundImage: 'linear-gradient(135deg, rgba(251,191,36,.13) 0%, rgba(251,191,36,.04) 55%, transparent 100%)' };
            const photoCount =
              activeSessionOnThis?.start_proof_urls?.length || (activeSessionOnThis?.start_proof_url ? 1 : 0);

            return (
              <div
                key={contract.id}
                data-nav={`poste-${contract.post_number}`}
                style={bandStyle}
                className={`pc ${noAccount ? 'opacity-60 grayscale ' : ''}border rounded-2xl p-3 sm:p-5 flex flex-col justify-between space-y-3 sm:space-y-4 transition-shadow duration-200 hover:shadow-xl relative overflow-hidden ${
                  isPending
                    ? isLight
                      ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/40'
                      : 'border-amber-500 ring-1 ring-amber-500/50 shadow-amber-950/40 bg-gradient-to-br from-[#241709] to-[#120c04]'
                    : isMyActive
                    ? isLight
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40'
                      : 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-emerald-950/40 bg-gradient-to-br from-[#0e1d2c] to-[#0c1622]'
                    : isTakenByOther
                    ? isLight
                      ? 'border-slate-200 opacity-80 bg-slate-100'
                      : 'border-slate-800/80 opacity-85 bg-[#090e16]'
                    : isLight
                    ? 'border-slate-200 hover:border-slate-300 bg-white'
                    : 'border-slate-800 hover:border-slate-600 bg-[#0c1420]'
                }`}
              >
                {/* Card Header: Post Number & Status */}
                <div>
                  {noAccount && (
                    <div className="mb-2 px-2 py-1 text-[11px] font-bold border border-slate-500/60 bg-slate-500/15 text-slate-300">
                      Sans compte : en attente du compte client
                    </div>
                  )}
                  {/* Type de poste : l'admin le change ici, le booster le voit */}
                  {isAdminView ? (
                    <select
                      value={contract.post_type || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => db.updateContract(contract.id, { post_type: e.target.value })}
                      className={`mb-2 w-full px-2 py-1 text-[11px] font-mono font-bold border cursor-pointer focus:outline-none focus:border-emerald-500 ${
                        isLight ? 'bg-slate-100 text-emerald-700 border-slate-300' : 'bg-[#0a1017] text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      <option value="">Type de poste : aucun</option>
                      {contract.post_type && !settings.post_types.includes(contract.post_type) && (
                        <option value={contract.post_type}>{contract.post_type}</option>
                      )}
                      {settings.post_types.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    contract.post_type && (
                      <span className="inline-block mb-2 px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                        {contract.post_type}
                      </span>
                    )
                  )}
                  <div
                    className={`pc-head flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b ${
                      isLight ? 'border-slate-100' : 'border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                      {/* Post Number Badge */}
                      <div
                        className={`pc-badge px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-tactical font-black text-xl sm:text-3xl leading-none tracking-wider shadow-sm shrink-0 ${
                          isPending
                            ? 'bg-amber-500 text-black'
                            : isLight
                            ? 'bg-slate-100 border border-slate-300 text-emerald-700'
                            : 'bg-slate-900 border border-emerald-500/40 text-emerald-400'
                        }`}
                      >
                        {postLabel}
                      </div>

                      <div className="pc-name min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <h3
                            className={`font-tactical font-bold text-xs sm:text-base tracking-wide break-words leading-tight ${
                              isLight ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {contract.client_name || 'Poste sans compte'}
                          </h3>
                          <span
                            className={`pc-tag hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                              isLight
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
                            }`}
                          >
                            {contract.account_tag}
                          </span>
                        </div>
                        {activeSessionOnThis && (
                          <div className={`text-[11px] sm:text-sm font-bold truncate ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
                            {activeSessionOnThis.employee_name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="pc-status shrink-0">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/60 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>En attente Admin</span>
                        </span>
                      ) : isMyActive ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-mono font-bold animate-pulse ${
                            isLight
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-500/60'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Session</span>
                        </span>
                      ) : isTakenByOther ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-mono font-bold ${
                            isLight
                              ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                              : 'bg-slate-900 text-cyan-300 border border-cyan-800/40'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          <span className="break-words text-left leading-tight">{activeSessionOnThis.employee_name}</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-mono ${
                            isLight
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Libre</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pending Alert in Cards View */}
                  {isPending && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-950/80 border border-amber-500/50 text-xs font-mono text-amber-200 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          Validation requise : <strong>{activeSessionOnThis.employee_name}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <Camera className="w-3.5 h-3.5" />
                        <span>{photoCount} photo{photoCount > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  )}

                  {contract.description && (
                    <p className="mb-2 px-2 py-1.5 border-l-2 border-amber-500/70 bg-amber-500/10 text-[11px] leading-snug text-slate-200 whitespace-pre-line break-words">
                      {contract.description}
                    </p>
                  )}
                  {/* 4 métriques : Départ, Actuel, Reste, Objectif */}
                  <div className="pc-metrics grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 mt-2.5 sm:mt-3.5 text-xs font-mono">
                    {/* 1. Score Départ */}
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080d14] border-slate-800/80'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 uppercase block">Départ</span>
                      <span
                        className={`font-mono-numbers font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}
                      >
                        {formatScoreM(initialScore)}
                      </span>
                    </div>

                    {/* 2. Score Actuel */}
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isLight ? 'bg-cyan-50/60 border-cyan-200' : 'bg-[#07111a] border-cyan-900/50'
                      }`}
                    >
                      <span className="text-[10px] text-cyan-400 uppercase block font-semibold">Actuel</span>
                      <span className="font-mono-numbers font-bold text-xs text-cyan-400">
                        {formatScoreM(currentScore)}
                      </span>
                    </div>

                    {/* 3. Score Restant */}
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isLight ? 'bg-amber-50/60 border-amber-200' : 'bg-[#120f09] border-amber-900/50'
                      }`}
                    >
                      <span className="text-[10px] text-amber-400 uppercase block font-semibold">Reste</span>
                      <span className="font-mono-numbers font-bold text-xs text-amber-400">
                        {formatScoreM(remainingScore)}
                      </span>
                    </div>

                    {/* 4. Cible = objectif + début */}
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isLight ? 'bg-emerald-50/60 border-emerald-200' : 'bg-[#06140f] border-emerald-900/50'
                      }`}
                    >
                      <span className="text-[10px] text-emerald-400 uppercase block font-semibold">Cible</span>
                      <span className="font-mono-numbers font-bold text-xs text-emerald-400">
                        {formatScoreM(initialScore + objectiveScore)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pc-act pt-2">
                  {isPending ? (
                    currentUser.role === 'admin' ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectContract(contract);
                        }}
                        className="w-full py-2.5 px-2 sm:px-4 text-center leading-tight bg-amber-600 hover:bg-amber-500 text-black font-tactical font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer animate-pulse"
                      >
                        <Clock className="w-4 h-4" />
                        <span>Valider ({activeSessionOnThis?.employee_name})</span>
                      </button>
                    ) : (
                      <>
                      <div className="w-full py-2.5 px-2 sm:px-4 text-center leading-tight bg-amber-950/60 border border-amber-600/50 text-amber-300 text-xs font-mono rounded-xl text-center">
                        <span className="inline-flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5 shrink-0" />En attente de validation</span>
                      </div>
                      {activeSessionOnThis && activeSessionOnThis.employee_id === currentUser.id && (
                        <PendingPostActions post={activeSessionOnThis} onGoToPost={onNavigateToActivePost} />
                      )}
                      </>
                    )
                  ) : isMyActive ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onNavigateToActivePost();
                      }}
                      className="w-full py-2.5 px-2 sm:px-4 text-center leading-tight bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Gamepad2 className="w-4 h-4" />
                      <span>Ma session</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : isTakenByOther ? (
                    currentUser.role === 'admin' ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectContract(contract);
                        }}
                        className="w-full py-2.5 px-2 sm:px-4 text-center leading-tight bg-[#142333] hover:bg-[#1b2f44] border border-cyan-700/60 text-cyan-300 font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow cursor-pointer"
                      >
                        <Eye className="w-4 h-4 text-cyan-400" />
                        <span>Gérer ({activeSessionOnThis?.employee_name})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectContract(contract);
                        }}
                        className={`w-full py-2.5 px-2 sm:px-4 text-center leading-tight font-mono text-xs rounded-xl border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-800/40'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Occupé ({activeSessionOnThis?.employee_name})</span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={noAccount && !isAdminView}
                      onClick={e => {
                        e.stopPropagation();
                        if (noAccount && !isAdminView) return;
                        onSelectContract(contract);
                      }}
                      className="disabled:opacity-50 disabled:cursor-not-allowed w-full py-2.5 px-2 sm:px-4 text-center leading-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Target className="w-4 h-4" />
                      <span>{currentUser.role === 'admin' ? (noAccount ? 'Remplir le poste' : 'Modifier le poste') : noAccount ? 'En attente du compte' : 'Prendre ce poste'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      {showAdd && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/80 overflow-y-auto" onClick={() => setShowAdd(false)}>
          <form onSubmit={submitAdd} onClick={e => e.stopPropagation()} className="w-full max-w-sm my-auto bg-[#0d1624] border border-slate-700 p-5 space-y-3 text-slate-100 text-xs font-mono">
            <h3 className="font-tactical font-bold text-base text-white">Ajouter un poste</h3>
            <p className="text-slate-400 leading-relaxed">Laisse le nom vide pour créer un poste « sans compte » : il reste grisé jusqu'à l'arrivée du compte client.</p>
            {addError && <div className="p-2 border border-red-500/60 bg-red-950/60 text-red-200 font-semibold">{addError}</div>}
            <div>
              <label className="block text-slate-300 uppercase mb-1">Nom du compte client (facultatif)</label>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500" />
            </div>
            <>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Score de début</label>
                  <ScoreInput value={addInitial} onChange={setAddInitial} />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Objectif (points à gagner)</label>
                  <ScoreInput value={addObjective} onChange={setAddObjective} />
                </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Cible = début + objectif = <strong className="text-emerald-400">{formatScoreM(addInitial + addObjective)}</strong>
              </p>
            </>
            <div>
              <label className="block text-slate-300 uppercase mb-1">Type de poste</label>
              <select value={addType} onChange={e => setAddType(e.target.value)} className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white">
                <option value="">Aucun</option>
                {postTypes.map(t2 => (<option key={t2} value={t2}>{t2}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
              <textarea value={addDesc} onChange={e => setAddDesc(e.target.value)} rows={2} className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white resize-y" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold text-sm">Annuler</button>
              <button type="submit" className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Ajouter</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
