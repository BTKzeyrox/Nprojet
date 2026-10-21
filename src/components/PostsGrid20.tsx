import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MissionGuideButton } from './MissionGuide';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { NAV_TARGET_EVENT, peekNavTarget } from '../utils/navTarget';
import {
  Target,
  Search,
  AlertCircle,
  ArrowRight,
  ClipboardList,
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
import { ClientPicker } from './ClientPicker';
import { checkMissionClient, MISSION_CLIENT_MESSAGE, missionRequiresClient } from '../utils/clients';
import { readCompany } from '../utils/companyRules';
import { formatScoreM, formatCurrencyAr } from '../utils/formatUtils';
import { useApp } from '../context/AppContext';
import { askConfirm } from './ConfirmModal';
import { ScoreInput } from './ScoreInput';
import { clientPriceForType, parsePriceInput } from '../utils/clientPrice';
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
  const { t, theme, lang } = useApp();
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
  const [addProof, setAddProof] = useState<'type' | 'none' | 'photo' | 'note' | 'both'>('type');
  const [addPrice, setAddPrice] = useState('');
  const [addClientId, setAddClientId] = useState('');
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const needClient = missionRequiresClient(readCompany(db.getSettings().company)); // réglage « Une mission a toujours un client » (Conditions)
  const postTypes = db.getSettings().post_types || [];

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddClientError(null);
    const cv = checkMissionClient({ required: needClient, clientId: addClientId, clients: db.getClients() });
    if (!cv.ok) { setAddError(null); return setAddClientError(MISSION_CLIENT_MESSAGE[cv.error][lang === 'en' ? 'en' : 'fr']); }
    if (!addName.trim()) return setAddError('Écris le titre de la mission.');
    const price = parsePriceInput(addPrice);
    if (price === null) return setAddError('Le prix client doit être un nombre positif ou vide.');
    const r = db.addContract({ client_name: addName, initial_score: addInitial, objective: addObjective, description: addDesc, post_type: addType, proof_mode: addProof, client_price_ar: price, client_id: cv.client_id || undefined, requireClient: needClient });
    if (!r.success) return setAddError(r.error || 'Ajout impossible.');
    setShowAdd(false);
    setAddName(''); setAddInitial(0); setAddObjective(0); setAddDesc(''); setAddType(''); setAddProof('type'); setAddPrice(''); setAddClientId(''); setAddClientError(null); setAddError(null);
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
      `mission ${contract.post_number}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
              placeholder="Rechercher une mission, un type, un numéro..."
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
              <div className="text-[9px] font-mono text-slate-400 uppercase leading-none">Missions</div>
              <div className="text-sm font-tactical font-black text-emerald-500 mt-0.5">{contractsList.length}</div>
            </div>
            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => { setAddError(null); setShowAdd(true); }}
                disabled={contractsList.length >= 100}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shrink-0"
              >
                <Plus className="w-4 h-4" /> Ajouter une mission
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
              <option value="number">Numéro de la mission</option>
              <option value="rest_desc">À faire : plus → moins</option>
              <option value="obj_asc">Objectif : petit → grand</option>
              <option value="obj_desc">Objectif : grand → petit</option>
            </select>
          </div>

          {/* Shift Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase mr-1">Vacation:</span>
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

      {/* Tableau Kanban : À faire / En cours / À valider */}
      {(() => {
        const cols: { id: 'free' | 'active' | 'pending'; label: string; tone: string }[] = [
          { id: 'free', label: 'À faire', tone: 'border-t-slate-400' },
          { id: 'active', label: 'En cours', tone: 'border-t-cyan-500' },
          { id: 'pending', label: 'À valider', tone: 'border-t-amber-500' },
        ];
        const colOf = (c: ClientContract): 'free' | 'active' | 'pending' => {
          const sess = liveBy.get(c.client_name);
          if (!sess) return 'free';
          return sess.status === 'active' ? 'active' : 'pending';
        };
        return (
          <div className="grid gap-3 lg:grid-cols-3 items-start">
            {cols.map(col => {
              const items = sortedContracts.filter(c => colOf(c) === col.id);
              return (
                <section
                  key={col.id}
                  className={`rounded-2xl border border-t-4 ${col.tone} p-2.5 space-y-2.5 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0c1420] border-slate-800'
                  }`}
                >
                  <header className="flex items-center justify-between px-1">
                    <h3 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>{col.label}</h3>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'}`}>{items.length}</span>
                  </header>
                  {items.length === 0 && (
                    <p className="text-xs text-slate-400 px-1 py-4 text-center">Aucune mission</p>
                  )}
                  {items.map(contract => {
                    const sess = liveBy.get(contract.client_name);
                    const isMine = activePost?.client_name === contract.client_name;
                    const takenByOther = !!sess && sess.employee_id !== currentUser.id;
                    const objective = Math.max(1, contract.target_score - contract.initial_score);
                    const current = Number(sess ? sess.final_score ?? sess.current_score : contract.current_score ?? contract.initial_score) || 0;
                    const done = Math.max(0, current - contract.initial_score);
                    const pct = Math.min(100, Math.round((done / objective) * 100));
                    const noAccount = !!contract.no_account || !contract.client_name;
                    const photos = sess?.start_proof_urls?.length || (sess?.start_proof_url ? 1 : 0);
                    const label = isAdminView ? (noAccount ? 'Remplir' : 'Modifier') : noAccount ? 'En attente' : 'Prendre';
                    return (
                      <article
                        key={contract.id}
                        data-nav={`poste-${contract.post_number}`}
                        className={`rounded-xl border p-3 space-y-2 shadow-sm ${noAccount ? 'opacity-60 ' : ''}${
                          isLight ? 'bg-white border-slate-200' : 'bg-[#101b2b] border-slate-700/70'
                        } ${isMine ? 'ring-2 ring-emerald-500/50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-bold leading-snug break-words ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {contract.client_name || 'Mission sans titre'}
                          </h4>
                          {contract.account_tag && (
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">{contract.account_tag}</span>
                          )}
                        </div>
                        {isAdminView ? (
                          <select
                            value={contract.post_type || ''}
                            onChange={e => db.updateContract(contract.id, { post_type: e.target.value })}
                            className={`w-full px-2 py-1 text-[11px] rounded-lg border cursor-pointer ${isLight ? 'bg-slate-50 border-slate-300 text-slate-700' : 'bg-[#0a1017] border-slate-700 text-slate-200'}`}
                          >
                            <option value="">Type de mission : aucun</option>
                            {contract.post_type && !settings.post_types.includes(contract.post_type) && (
                              <option value={contract.post_type}>{contract.post_type}</option>
                            )}
                            {settings.post_types.map(t2 => (<option key={t2} value={t2}>{t2}</option>))}
                          </select>
                        ) : (
                          contract.post_type && (
                            <span className={`inline-block px-2 py-0.5 text-[11px] rounded-full font-semibold ${isLight ? 'bg-blue-50 text-blue-800' : 'bg-blue-950 text-blue-200'}`}>{contract.post_type}</span>
                          )
                        )}
                        <div><MissionGuideButton type={contract.post_type} /></div>
                        {contract.description && (
                          <p className="text-[11px] leading-snug text-slate-400 whitespace-pre-line break-words line-clamp-3">{contract.description}</p>
                        )}
                        {contract.target_score > contract.initial_score && (
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>Quantité {formatScoreM(done)} / {formatScoreM(objective)}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        )}
                        {sess && (
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-semibold">{sess.employee_name}</span>
                            {col.id === 'pending' && (
                              <span className="inline-flex items-center gap-1 text-amber-400"><Camera className="w-3 h-3" />{photos}</span>
                            )}
                          </div>
                        )}
                        {col.id === 'pending' ? (
                          isAdminView ? (
                            <button type="button" onClick={() => onSelectContract(contract)} className="w-full py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center justify-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />Valider
                            </button>
                          ) : (
                            <>
                              <div className="w-full py-2 text-center text-xs rounded-xl border border-amber-600/50 text-amber-300 inline-flex items-center justify-center gap-1.5"><Hourglass className="w-3.5 h-3.5" />En attente de validation</div>
                              {sess && sess.employee_id === currentUser.id && (
                                <PendingPostActions post={sess} onGoToPost={onNavigateToActivePost} />
                              )}
                            </>
                          )
                        ) : isMine ? (
                          <button type="button" onClick={onNavigateToActivePost} className="w-full py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center justify-center gap-1.5">
                            <ClipboardList className="w-3.5 h-3.5" />Ma mission<ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : takenByOther ? (
                          <button type="button" onClick={() => onSelectContract(contract)} className="w-full py-2 text-xs font-semibold rounded-xl border border-slate-600 text-slate-300 inline-flex items-center justify-center gap-1.5">
                            {isAdminView ? <Eye className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            {isAdminView ? 'Gérer' : 'Occupée'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={noAccount && !isAdminView}
                            onClick={() => { if (noAccount && !isAdminView) return; onSelectContract(contract); }}
                            className="w-full py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white inline-flex items-center justify-center gap-1.5"
                          >
                            <Target className="w-3.5 h-3.5" />{label}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        );
      })()}

      {showAdd && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/70 overflow-y-auto" onClick={() => setShowAdd(false)}>
          <form onSubmit={submitAdd} onClick={e => e.stopPropagation()} className={`w-full max-w-md my-auto rounded-3xl border p-5 space-y-4 text-sm ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#0f1b2d] border-slate-700 text-slate-100'}`}>
            <h3 className="font-bold text-lg">Nouvelle mission</h3>
            {addError && <div className="p-2.5 rounded-xl border border-red-500/60 bg-red-500/10 text-red-500 font-semibold text-xs">{addError}</div>}
            <ClientPicker value={addClientId} required={needClient} error={addClientError}
              inputClass={`w-full min-h-[44px] rounded-2xl border px-4 py-2.5 focus:outline-none focus:border-blue-500 ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0a1424] border-slate-600'}`}
              onChange={(id, name) => { setAddClientId(id); setAddClientError(null); if (id && name && !addName.trim()) setAddName(name); }} />
            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-70">Titre</label>
              <input type="text" autoFocus value={addName} onChange={e => setAddName(e.target.value)} placeholder="Ex. : fiches du lot 12" className={`w-full rounded-2xl border px-4 py-2.5 focus:outline-none focus:border-blue-500 ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0a1424] border-slate-600'}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-70">Type</label>
              <select value={addType} onChange={e => setAddType(e.target.value)} className={`w-full rounded-2xl border px-4 py-2.5 ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0a1424] border-slate-600'}`}>
                <option value="">Aucun</option>
                {postTypes.map(t2 => (<option key={t2} value={t2}>{t2}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-70">Consigne (facultatif)</label>
              <textarea value={addDesc} onChange={e => setAddDesc(e.target.value)} rows={3} placeholder="Ce qu'il faut faire, avec quel logiciel…" className={`w-full rounded-2xl border px-4 py-2.5 resize-y ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0a1424] border-slate-600'}`} />
            </div>

            <details className={`rounded-2xl border px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-white/[0.03]'}`}>
              <summary className="cursor-pointer font-semibold text-sm select-none">Options avancées (facultatif)</summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 opacity-70">Justificatif demandé à la fin</label>
                  <select value={addProof} onChange={e => setAddProof(e.target.value as typeof addProof)} className={`w-full rounded-2xl border px-4 py-2.5 ${isLight ? 'bg-white border-slate-300' : 'bg-[#0a1424] border-slate-600'}`}>
                    <option value="type">Selon le type de mission</option>
                    <option value="none">Aucun justificatif</option>
                    <option value="photo">Photo ou capture obligatoire</option>
                    <option value="note">Note obligatoire</option>
                    <option value="both">Photo et note obligatoires</option>
                  </select>
                  <p className="text-[11px] opacity-60 mt-1">Tu peux laisser « Selon le type » tant que tu ne sais pas quoi demander.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 opacity-70">Prix client de cette mission (Ar, facultatif)</label>
                  <input type="number" min={0} step={100} value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder={`Prix du type : ${clientPriceForType(addType, db.getSettings())} Ar`} className={`w-full rounded-2xl border px-4 py-2.5 ${isLight ? 'bg-white border-slate-300' : 'bg-[#0a1424] border-slate-600'}`} />
                  <p className="text-[11px] opacity-60 mt-1">Laisse vide pour utiliser le prix du type, ou le prix par défaut (Réglages, Missions).</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 opacity-70">Quantité à faire (si tu la connais)</label>
                  <ScoreInput value={addObjective} onChange={setAddObjective} />
                  <p className="text-[11px] opacity-60 mt-1">Laisse 0 si tu ne veux pas de quantité : aucun calcul n'est fait.</p>
                </div>
              </div>
            </details>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setShowAdd(false)} className={`px-3 py-2.5 rounded-full border font-semibold cursor-pointer ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/10'}`}>Annuler</button>
              <button type="submit" className="px-3 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer">Créer la mission</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
