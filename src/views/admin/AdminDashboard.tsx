import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Trash2,
  Shield,
  Camera,
  CheckCircle2,
  XCircle,
  Unlock,
  Ban,
  Eye,
  Radio,
  Clock,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  UserX,
  UserCheck,
  Send,
  Zap,
  Filter,
  Check,
  MessageSquare,
  Layers,
  Target,
  Info,
  Hourglass,
  CircleDot,
  X,
  KeyRound,
  UserPlus,
} from 'lucide-react';
import { User, PostSession, SecurityViolation, ClientContract, ShiftType, PasswordResetRequest, ProfileChangeRequest, SignupRequest } from '../../types';
import { Avatar } from '../../components/Avatar';
import { db } from '../../db/store';
import { proofsOf } from '../../utils/proofs';
import { askConfirm } from '../../components/ConfirmModal';
import { askReason } from '../../components/ReasonModal';
import { countPending } from '../../utils/pendingCount';
import { getPresenceStatus, getQueue, STATUS_LABEL, STATUS_DOT } from '../../utils/presence';
import { PostsGrid20 } from '../../components/PostsGrid20';
import { formatScoreM, formatCurrencyAr, plural } from '../../utils/formatUtils';
import { takeValFilterIntent, VAL_INTENT_EVENT } from '../../utils/navIntent';
import { generateDeltaForceScreenshot, compressProofImage } from '../../utils/imageUtils';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { ScoreInput } from '../../components/ScoreInput';

interface AdminDashboardProps {
  currentUser?: User;
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
  onOpenEmployeeCV?: (employee: User) => void;
  onNavigateToEmployees?: () => void;
  onNavigateToCalendar?: () => void;
  activeSubTab?: 'grid' | 'dashboard' | 'sessions' | 'security' | 'advances' | 'chat' | 'validations';
  onNavigateTab?: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onOpenProofLightbox,
  onOpenEmployeeCV,
  onNavigateToEmployees,
  onNavigateToCalendar,
  activeSubTab = 'dashboard',
  onNavigateTab,
}) => {
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [posts, setPosts] = useState<PostSession[]>(db.getPosts());
  const [securityLogs, setSecurityLogs] = useState<SecurityViolation[]>(db.getSecurityLogs());
  const [resets, setResets] = useState<PasswordResetRequest[]>(db.getPasswordResets());
  const [signups, setSignups] = useState<SignupRequest[]>(db.getSignupRequests());
  const [profileReqs, setProfileReqs] = useState<ProfileChangeRequest[]>(db.getProfileRequests().filter(x => x.status === 'pending'));
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [advances, setAdvances] = useState(db.getAdvanceRequests());
  const [valFilter, setValFilter] = useState<'all' | 'starts' | 'ends' | 'advances' | 'signups' | 'resets' | 'profiles'>('all');
  // Clic sur une notification : ouvre Validations avec le bon filtre
  useEffect(() => {
    const apply = () => {
      const f = takeValFilterIntent();
      if (f) setValFilter(f);
    };
    apply();
    window.addEventListener(VAL_INTENT_EVENT, apply);
    return () => window.removeEventListener(VAL_INTENT_EVENT, apply);
  }, []);

  // Rejection modal state
  const [rejectingPostId, setRejectingPostId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Force release modal state
  const [forceReleasePostId, setForceReleasePostId] = useState<string | null>(null);
  const [forceReleaseReason, setForceReleaseReason] = useState('Déblocage d\'urgence par le superviseur');

  // Filter for submissions
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'pending_start' | 'pending_end'>('all');

  // Admin Comprehensive Post Modal State (view, manage, validate, edit all fields)
  const [selectedAdminContract, setSelectedAdminContract] = useState<ClientContract | null>(null);
  const [activeSessionForModal, setActiveSessionForModal] = useState<PostSession | null>(null);
  const [assignedBoosterId, setAssignedBoosterId] = useState<string>('');
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);
  const [assignErrorMsg, setAssignErrorMsg] = useState<string | null>(null);

  // Full editable fields by Admin for any post
  const [editClientName, setEditClientName] = useState('');
  const [editAccountTag, setEditAccountTag] = useState('');
  const [editInitialScore, setEditInitialScore] = useState<number>(0);
  // Champs liés : Cible = Début + Objectif ; Reste = Cible − Actuel
  const [editTargetScore, setEditTargetScore] = useState<number>(0);
  const [editCurrentScore, setEditCurrentScore] = useState<number>(0);
  const editObjective = Math.max(0, editTargetScore - editInitialScore);
  const editReste = Math.max(0, editTargetScore - editCurrentScore);
  const [editAccountProofs, setEditAccountProofs] = useState<string[]>([]); // preuves du compte client (5 max)
  const [accountProofBusy, setAccountProofBusy] = useState(false);
  // Début modifié : la Cible suit (l'Objectif reste le même), l'Actuel ne peut pas passer sous le Début
  const changeInitial = (n: number) => {
    setEditTargetScore(t => t + (n - editInitialScore));
    setEditCurrentScore(c => (c < n ? n : c));
    setEditInitialScore(n);
  };
  const changeObjective = (n: number) => setEditTargetScore(editInitialScore + n);
  const changeReste = (n: number) => setEditCurrentScore(editTargetScore - n);
  const handleAddAccountProofs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const slots = 5 - editAccountProofs.length;
    if (files.length === 0) return;
    if (slots <= 0) {
      setAssignErrorMsg('Maximum 5 photos de preuve du compte client.');
      return;
    }
    setAccountProofBusy(true);
    try {
      for (const f of files.slice(0, slots)) {
        const small = await compressProofImage(f);
        const url = (await db.uploadFile(small)) || small;
        setEditAccountProofs(prev => (prev.length >= 5 ? prev : [...prev, url]));
      }
    } catch {
      setAssignErrorMsg("Une photo n'a pas pu être envoyée. Réessayez.");
    } finally {
      setAccountProofBusy(false);
    }
  };
  const [editGameMode, setEditGameMode] = useState('');
  const [editShift, setEditShift] = useState<ShiftType | 'any'>('any');
  const [editNotes, setEditNotes] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // In-app Toast Notice (no window.alert in iframe)
  const [toastNotice, setToastNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Prevent background scroll when modals are active
  useLockBodyScroll(!!selectedAdminContract || !!rejectingPostId || !!forceReleasePostId);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastNotice({ message, type });
    setTimeout(() => {
      setToastNotice(null);
    }, 4000);
  };

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setUsers(db.getUsers());
      setPosts(db.getPosts());
      setSecurityLogs(db.getSecurityLogs());
      setResets(db.getPasswordResets());
      setSignups(db.getSignupRequests());
      setProfileReqs(db.getProfileRequests().filter(x => x.status === 'pending'));
      setAdvances(db.getAdvanceRequests());
    });
    return unsubscribe;
  }, []);

  // Handlers for post actions
  const handleValidate = (postId: string, confirmed = false, note = '') => {
    if (!confirmed) {
      askReason({
        title: 'Valider cette session ?',
        message: "La paie sera créditée à l'employé. Cette action ne peut pas être annulée.",
        confirmLabel: 'Valider',
        optional: true,
        onSubmit: note => handleValidate(postId, true, note),
      });
      return;
    }
    const res = db.validatePost(postId, note);
    if (!res.success) {
      showToast(res.error || 'Erreur lors de la validation', 'error');
    } else {
      showToast('Session validée et paie créditée avec succès !', 'success');
      // If modal was open for this post, refresh or close
      if (activeSessionForModal && activeSessionForModal.id === postId) {
        setAssignSuccessMsg('Session validée avec succès !');
        setTimeout(() => setSelectedAdminContract(null), 1200);
      }
    }
  };

  // Admin Saves All Modifications to a Post / Contract
  const handleSaveAdminModifications = () => {
    if (!selectedAdminContract) return;

    if (!editClientName.trim()) {
      setAssignErrorMsg('Le nom du compte client ne peut pas être vide.');
      return;
    }
    if (editTargetScore <= editInitialScore) {
      setAssignErrorMsg('La cible doit être supérieure au début.');
      return;
    }
    if (editCurrentScore < editInitialScore) {
      setAssignErrorMsg('L\'actuel ne peut pas être inférieur au début.');
      return;
    }
    if (editCurrentScore > editTargetScore) {
      setAssignErrorMsg('Le reste ne peut pas être négatif : l\'actuel dépasse la cible.');
      return;
    }

    // 1. Update Contract
    const contractRes = db.updateContract(selectedAdminContract.id, {
      client_name: editClientName.trim(),
      account_tag: editAccountTag.trim(),
      initial_score: editInitialScore,
      target_score: editTargetScore,
      current_score: editCurrentScore,
      account_proof_urls: editAccountProofs,
      game_mode: editGameMode.trim(),
      description: editDescription.trim(),
      no_account: false,
      recommended_shift: editShift,
    });

    // 2. If an active or pending session exists, update it too
    if (activeSessionForModal) {
      db.updatePostAdmin(activeSessionForModal.id, {
        client_name: editClientName.trim(),
        account_tag: editAccountTag.trim(),
        target_score: editTargetScore,
        current_score: editCurrentScore,
        employee_id: assignedBoosterId,
        shift_type: editShift === 'night' ? 'night' : 'day',
        notes: editNotes.trim(),
      });
    }

    if (contractRes.success) {
      setAssignSuccessMsg('Toutes les modifications du poste ont été enregistrées avec succès !');
      showToast('Poste mis à jour avec succès !', 'success');
      setTimeout(() => setAssignSuccessMsg(null), 3000);
    } else {
      setAssignErrorMsg(contractRes.error || 'Erreur lors de l\'enregistrement des modifications.');
    }
  };

  const handleOpenReject = (postId: string) => {
    setRejectingPostId(postId);
    setRejectReason('Capture illisible / Incohérence constatée');
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingPostId) return;
    if (!rejectReason.trim()) {
      showToast('Un motif de rejet est obligatoire.', 'error');
      return;
    }
    const res = db.rejectPost(rejectingPostId, rejectReason);
    if (!res.success) {
      showToast(res.error || 'Erreur de rejet', 'error');
    } else {
      showToast('Soumission rejetée avec notification à l\'opérateur.', 'info');
    }
    setRejectingPostId(null);
  };

  const handleOpenForceRelease = (postId: string) => {
    setForceReleasePostId(postId);
  };

  const handleConfirmForceRelease = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceReleasePostId) return;
    const res = db.forceReleasePost(forceReleasePostId, forceReleaseReason);
    if (!res.success) {
      showToast(res.error || 'Erreur de déblocage', 'error');
    } else {
      showToast('Poste débloqué et réinitialisé avec succès.', 'success');
    }
    setForceReleasePostId(null);
  };

  // Toggle user block status
  const handleToggleBlock = (userId: string) => {
    db.toggleUserBlock(userId);
  };

  // Dismiss violation
  const handleDismissViolation = (logId: string) => {
    db.dismissViolation(logId);
  };

  // Computations
  const presence = db.getPresence();
  const onlineEmployees = users.filter(u => u.role === 'employee' && getPresenceStatus(u, posts, presence).status !== 'offline');
  const waitingQueue = getQueue(users, posts, presence);
  const pendingSubmissions = posts.filter(
    p => p.status === 'pending_start' || p.status === 'pending_end'
  );
  const isValidations = activeSubTab === 'validations';
  const isSecurity = activeSubTab === 'security';
  const isSessions = activeSubTab === 'sessions';
  const pend = countPending();
  const pendingAdvances = advances.filter(a => a.status === 'pending');
  const showSubs = valFilter === 'all' || valFilter === 'starts' || valFilter === 'ends';
  const filteredSubmissions = pendingSubmissions.filter(p => {
    if (isValidations) {
      if (valFilter === 'starts') return p.status === 'pending_start';
      if (valFilter === 'ends') return p.status === 'pending_end';
      return true;
    }
    if (submissionFilter === 'all') return true;
    return p.status === submissionFilter;
  });

  const activeViolations = securityLogs.filter(l => !l.resolved);

  const totalScoreBoosted = users.reduce((acc, u) => acc + (u.total_score_boosted || 0), 0);
  const totalPayrollDistributedAr = users.reduce((acc, u) => acc + (u.total_earnings_ar || 0), 0);

  const homeCards = (() => {
        const today = new Date().toISOString().split('T')[0];
        const doneToday = posts.filter(p => p.status === 'completed' && p.date === today);
        const scoreToday = doneToday.reduce(
          (acc, p) => acc + Math.max(0, (p.final_score ?? p.current_score ?? 0) - (p.initial_score || 0)),
          0
        );
        const price = db.getSettings().price_per_million;
        const cardCls =
          'text-left bg-[#0f1722] border border-slate-800 hover:border-emerald-500/60 rounded-xl p-4 shadow-xl transition-colors cursor-pointer w-full';
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <button type="button" onClick={() => onNavigateToEmployees && onNavigateToEmployees()} className={cardCls}>
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                <span>Boosters en ligne</span>
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              </div>
              <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
                {onlineEmployees.length}{' '}
                <span className="text-sm font-normal text-slate-400">/ {users.filter(u => u.role === 'employee').length}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-1">Voir les boosters</div>
            </button>

            <button type="button" onClick={() => onNavigateTab && onNavigateTab('validations')} className={cardCls}>
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                <span>Validations en attente</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className={`text-2xl font-black font-mono mt-1 ${pend.total > 0 ? 'text-amber-400' : 'text-white'}`}>
                {pend.total}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-1">
                {plural(pend.starts, 'début')} · {plural(pend.ends, 'fin')} · {plural(pend.advances, 'avance')}
              </div>
            </button>

            <button type="button" onClick={() => onNavigateToCalendar && onNavigateToCalendar()} className={cardCls}>
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                <span>Score du jour</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-1">{formatScoreM(scoreToday)}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-1">
                {formatCurrencyAr(Math.round((scoreToday / 1000000) * price))} · 1M = {price.toLocaleString('fr-FR')} Ar
              </div>
            </button>

            <button type="button" onClick={() => onNavigateToCalendar && onNavigateToCalendar()} className={cardCls}>
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase">
                <span>Shifts complets</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black font-mono text-white mt-1">{doneToday.length}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-1">Sessions finies aujourd'hui</div>
            </button>
          </div>
        );
      })();

  if (activeSubTab === 'grid' || activeSubTab === 'dashboard') {
    const adminUser = currentUser || users.find(u => u.role === 'admin') || users[0];
    const availableBoosters = users.filter(u => u.role === 'employee' && u.status === 'active');

    return (
      <div className="space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-3">
        {activeSubTab === 'dashboard' && homeCards}
        <PostsGrid20
          currentUser={adminUser}
          allPosts={posts}
          onSelectContract={(contract) => {
            const session = posts.find(
              p =>
                p.client_name === contract.client_name &&
                (p.status === 'active' || p.status === 'pending_start' || p.status === 'pending_end')
            );
            setSelectedAdminContract(contract);
            setActiveSessionForModal(session || null);
            setEditClientName(contract.client_name);
            setEditAccountTag(contract.account_tag);
            setEditInitialScore(contract.initial_score);
            setEditTargetScore(contract.target_score);
            setEditCurrentScore(Math.max(contract.initial_score, contract.current_score ?? contract.initial_score));
            setEditAccountProofs(contract.account_proof_urls || []);
            setEditGameMode(contract.game_mode);
            setEditShift(contract.recommended_shift);
            setAssignedBoosterId(session ? session.employee_id : (availableBoosters[0]?.id || ''));
            setEditNotes(session?.notes || '');
            setEditDescription(contract.description || '');
            setAssignSuccessMsg(null);
            setAssignErrorMsg(null);
          }}
          onOpenProofLightbox={onOpenProofLightbox}
          onNavigateToActivePost={() => onNavigateTab && onNavigateTab('sessions')}
        />

        {/* MODAL GESTION DU POSTE CLIENT POUR L'ADMIN (MODIFICATION COMPLETE & VALIDATION) */}
        {selectedAdminContract && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain animate-in fade-in">
            <div className="bg-[#0f1722] border border-emerald-500/50 w-full max-w-2xl rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[calc(100dvh-57px-2.5rem-env(safe-area-inset-bottom))] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 font-tactical font-black text-sm border border-emerald-500/40">
                    POSTE #{String(selectedAdminContract.post_number).padStart(2, '0')}
                  </div>
                  <div>
                    <h3 className="font-tactical font-black text-white text-base">
                      {selectedAdminContract.client_name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeSessionForModal && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        activeSessionForModal.status === 'pending_start'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500 animate-pulse'
                          : activeSessionForModal.status === 'pending_end'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500 animate-pulse'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {activeSessionForModal.status === 'pending_start' || activeSessionForModal.status === 'pending_end' ? (
                          <Hourglass className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <CircleDot className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {activeSessionForModal.status === 'pending_start'
                          ? 'En attente validation (Début)'
                          : activeSessionForModal.status === 'pending_end'
                          ? 'En attente validation (Fin)'
                          : 'En cours'}
                      </span>
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedAdminContract(null)}
                    className="text-slate-400 hover:text-white p-1 cursor-pointer rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notifications */}
              {assignSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-300 text-xs font-mono flex items-center gap-2 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{assignSuccessMsg}</span>
                </div>
              )}
              {assignErrorMsg && (
                <div className="p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-300 text-xs font-mono flex items-center gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{assignErrorMsg}</span>
                </div>
              )}

              <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs font-mono">
                {/* 1. SECTION VALIDATION SI POSTE EN ATTENTE (PENDING_START OU PENDING_END) */}
                {activeSessionForModal &&
                  (activeSessionForModal.status === 'pending_start' || activeSessionForModal.status === 'pending_end') && (
                    <div className="bg-[#181108] border-2 border-amber-500/70 rounded-xl p-4 space-y-3 shadow-lg shadow-amber-950/30">
                      <div className="flex items-center justify-between border-b border-amber-700/50 pb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                          <span className="font-tactical font-black text-amber-300 text-xs sm:text-sm uppercase tracking-wide">
                            Demande de Validation Soumise par l'Opérateur
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-400 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-600/40">
                          {activeSessionForModal.status === 'pending_start' ? 'DÉBUT DE SESSION' : 'CLÔTURE / FIN'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="bg-black/40 p-2 rounded border border-amber-800/40">
                          <span className="text-slate-400 text-[10px] block uppercase">Booster</span>
                          <strong className="text-white text-xs truncate block">{activeSessionForModal.employee_name}</strong>
                        </div>
                        <div className="bg-black/40 p-2 rounded border border-amber-800/40">
                          <span className="text-slate-400 text-[10px] block uppercase">Score Début</span>
                          <strong className="text-emerald-400 text-xs block">{formatScoreM(activeSessionForModal.initial_score)}</strong>
                        </div>
                        <div className="bg-black/40 p-2 rounded border border-amber-800/40">
                          <span className="text-slate-400 text-[10px] block uppercase">Score Actuel / Fin</span>
                          <strong className="text-cyan-400 text-xs block">
                            {formatScoreM(activeSessionForModal.final_score ?? activeSessionForModal.current_score)}
                          </strong>
                        </div>
                        <div className="bg-black/40 p-2 rounded border border-amber-800/40">
                          <span className="text-slate-400 text-[10px] block uppercase">Horaire</span>
                          <strong className="text-amber-300 text-xs block">{activeSessionForModal.start_time}</strong>
                        </div>
                      </div>

                      {/* Display All Submitted Photos (1 to 4 photos) */}
                      <div>
                        <span className="text-[10px] text-amber-300 uppercase font-bold block mb-1.5 flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            Preuves photographiques fournies (
                            {activeSessionForModal.start_proof_urls?.length || 1} photo(s) - Cliquer pour inspecter) :
                          </span>
                        </span>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(activeSessionForModal.start_proof_urls && activeSessionForModal.start_proof_urls.length > 0
                            ? activeSessionForModal.start_proof_urls
                            : [activeSessionForModal.start_proof_url]
                          ).map((photoUrl, pIdx) => (
                            <div
                              key={pIdx}
                              onClick={() =>
                                onOpenProofLightbox({
                                  imageUrl: photoUrl,
                                  gallery: proofsOf(activeSessionForModal),
                                  title: `Photo ${pIdx + 1} - Preuve Début - ${activeSessionForModal.client_name}`,
                                  score: activeSessionForModal.initial_score,
                                  clientTag: activeSessionForModal.client_name,
                                  operatorName: activeSessionForModal.employee_name,
                                  timestamp: `${activeSessionForModal.date} ${activeSessionForModal.start_time}`,
                                })
                              }
                              className="relative aspect-video rounded-lg overflow-hidden border border-amber-500/70 bg-black/60 group cursor-pointer shadow hover:border-amber-400 transition-colors"
                            >
                              <img src={photoUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-mono transition-opacity">
                                <Eye className="w-4 h-4 text-amber-400" />
                              </div>
                              <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono text-amber-400 px-1 font-bold">
                                #{pIdx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Validation / Rejection Action Buttons */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-amber-800/40">
                        <button
                          type="button"
                          onClick={() => handleOpenReject(activeSessionForModal.id)}
                          className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 border border-red-600/60 text-red-300 font-mono text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Rejeter la Soumission</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValidate(activeSessionForModal.id)}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/60 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Valider la Session &amp; Démarrer</span>
                        </button>
                      </div>
                    </div>
                  )}

                {/* 2. SECTION MODIFICATION COMPLETE DU POSTE (ADMIN EXCLUSIF) */}
                <div className="bg-[#141e2a] border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-cyan-400" />
                      <h4 className="font-tactical font-black text-white text-xs sm:text-sm uppercase tracking-wide">
                        Modifier Tout Dans ce Poste (Superviseur Admin)
                      </h4>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono">Contrôle Total Administrateur</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Nom Compte Client</label>
                      <input
                        type="text"
                        value={editClientName}
                        onChange={e => setEditClientName(e.target.value)}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-white font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Début (Départ Relevé)</label>
                      <ScoreInput
                        value={editInitialScore}
                        onChange={changeInitial}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-emerald-400 font-bold"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{formatScoreM(editInitialScore)}</span>
                    </div>
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Objectif (points à gagner)</label>
                      <ScoreInput
                        value={editObjective}
                        onChange={changeObjective}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-amber-400 font-bold"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{formatScoreM(editObjective)}</span>
                    </div>
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Cible (score final)</label>
                      <ScoreInput
                        value={editTargetScore}
                        onChange={setEditTargetScore}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-cyan-400 font-bold"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{formatScoreM(editTargetScore)}</span>
                    </div>
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Actuel (score du compte)</label>
                      <ScoreInput
                        value={editCurrentScore}
                        onChange={setEditCurrentScore}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-white font-bold"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{formatScoreM(editCurrentScore)}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 uppercase mb-1">Reste (Cible − Actuel)</label>
                      <ScoreInput
                        value={editReste}
                        onChange={changeReste}
                        className={`w-full bg-[#0d1622] border rounded-lg p-2 font-bold ${editCurrentScore > editTargetScore ? 'border-red-500 text-red-400' : 'border-slate-600 text-orange-400'}`}
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        {formatScoreM(editReste)} · liés automatiquement : Cible = Début + Objectif, Reste = Cible − Actuel
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-slate-300 uppercase mb-1">Booster Assigné</label>
                      <select
                        value={assignedBoosterId}
                        onChange={e => setAssignedBoosterId(e.target.value)}
                        className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-white"
                      >
                        <option value="">-- Aucun / Libre --</option>
                        {availableBoosters.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.shift === 'day' ? 'Jour' : 'Nuit'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Preuves du compte client : 5 photos max, visibles par les boosters */}
                  <div className="bg-[#0d1622] border border-slate-700 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 uppercase font-bold flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-amber-400" />
                        <span>Preuves du compte client</span>
                      </span>
                      <span className="text-[11px] font-mono text-amber-300 font-bold bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded">
                        {editAccountProofs.length} / 5 photos
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {editAccountProofs.map((url, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-600">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenProofLightbox({
                                imageUrl: url,
                                gallery: editAccountProofs,
                                title: `Preuve du compte - ${editClientName}`,
                                clientTag: editClientName,
                              })
                            }
                            className="w-full h-full cursor-pointer"
                            title="Agrandir la photo"
                          >
                            <img src={url} alt={`Preuve du compte ${i + 1}`} className="w-full h-full object-cover" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditAccountProofs(prev => prev.filter((_, k) => k !== i))}
                            className="absolute top-1 right-1 min-w-[32px] min-h-[32px] flex items-center justify-center bg-black/80 border border-red-600 text-red-400 rounded cursor-pointer"
                            title="Retirer cette photo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {editAccountProofs.length < 5 && (
                        <label className="aspect-square border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-lg flex flex-col items-center justify-center text-[11px] text-slate-400 cursor-pointer text-center p-1">
                          <Camera className="w-5 h-5 mb-1" />
                          <span>{accountProofBusy ? 'Envoi…' : 'Ajouter'}</span>
                          <input type="file" accept="image/*" multiple onChange={handleAddAccountProofs} className="hidden" disabled={accountProofBusy} />
                        </label>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Le lien des photos est public : évitez les mots de passe sur les captures. Enregistrez le poste pour valider les changements.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 uppercase mb-1">Description du poste</label>
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={3}
                      placeholder="ex: no read, no card, pas de mode normal ni difficile"
                      className="w-full bg-[#0d1622] border border-slate-600 p-2 text-white resize-y"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 uppercase mb-1">Notes Administrateur</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notes de mission, directives spéciales..."
                      className="w-full bg-[#0d1622] border border-slate-600 rounded-lg p-2 text-white"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveAdminModifications}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Enregistrer les Modifications du Poste</span>
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => {
                        const c = selectedAdminContract;
                        const label = `P${String(c.post_number).padStart(2, '0')}`;
                        askConfirm({
                          title: `Supprimer le poste ${label} ?`,
                          message: activeSessionForModal
                            ? 'Une session est en cours sur ce poste : impossible de le supprimer.'
                            : 'Le poste sera supprimé de la grille. Cette action est définitive.',
                          confirmLabel: 'Supprimer',
                          danger: true,
                          onConfirm: () => {
                            const r = db.removeContract(c.id);
                            if (!r.success) {
                              setAssignErrorMsg(r.error || 'Impossible de supprimer ce poste.');
                              return;
                            }
                            showToast('Poste supprimé.', 'success');
                            setSelectedAdminContract(null);
                          },
                        });
                      }}
                      className="w-full min-h-[46px] flex items-center justify-center gap-2 bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-300 font-tactical font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>Supprimer ce poste</span>
                    </button>
                  </div>
                </div>

                {/* 3. QUICK ASSIGNMENT IF IDLE */}
                {!activeSessionForModal && (
                  <div className="bg-[#121c27] border border-slate-700 rounded-xl p-4 space-y-3">
                    <span className="font-tactical font-black text-white text-xs uppercase block">
                      Assignation Directe &amp; Lancement
                    </span>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAssignErrorMsg(null);
                          const booster = users.find(u => u.id === assignedBoosterId) || availableBoosters[0];
                          if (!booster) {
                            setAssignErrorMsg('Veuillez sélectionner un booster.');
                            return;
                          }
                          const res = db.startPost({
                            employeeId: booster.id,
                            clientName: editClientName,
                            accountTag: editAccountTag,
                            targetScore: editTargetScore,
                            initialScore: editInitialScore,
                            proofUrl: generateDeltaForceScreenshot({
                              operatorName: booster.name,
                              score: editInitialScore,
                              clientTag: `${editClientName} #${editAccountTag}`,
                            }),
                            shiftType: editShift === 'night' ? 'night' : 'day',
                            notes: `Assigné directement par l'administrateur à ${booster.name}`,
                            status: 'active',
                            autoReplaceExisting: true,
                          });
                          if (res.success) {
                            setAssignSuccessMsg(`Poste activé avec succès pour ${booster.name} !`);
                            setTimeout(() => setSelectedAdminContract(null), 1200);
                          } else {
                            setAssignErrorMsg(res.error || 'Erreur lors de l\'activation.');
                          }
                        }}
                        className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Confirmer l'Assignation au Booster</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAssignErrorMsg(null);
                          const res = db.startPost({
                            employeeId: adminUser.id,
                            clientName: editClientName,
                            accountTag: editAccountTag,
                            targetScore: editTargetScore,
                            initialScore: editInitialScore,
                            proofUrl: generateDeltaForceScreenshot({
                              operatorName: adminUser.name,
                              score: editInitialScore,
                              clientTag: `${editClientName} #${editAccountTag}`,
                            }),
                            shiftType: 'day',
                            notes: `Session de test ouverte par ${adminUser.name}`,
                            status: 'active',
                            autoReplaceExisting: true,
                          });
                          if (res.success) {
                            setAssignSuccessMsg(`Session de test ouverte et activée !`);
                            setTimeout(() => setSelectedAdminContract(null), 1200);
                          } else {
                            setAssignErrorMsg(res.error || 'Erreur d\'ouverture.');
                          }
                        }}
                        className="py-2.5 px-4 bg-[#142333] hover:bg-[#1a2d42] border border-cyan-800/60 text-cyan-300 font-mono text-xs rounded-xl transition-colors cursor-pointer text-center"
                      >
                        <Zap className="w-4 h-4 inline mr-1.5 -mt-0.5" />Ouvrir en Test Admin
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. EMERGENCY FORCE RELEASE IF ACTIVE */}
                {activeSessionForModal && activeSessionForModal.status === 'active' && (
                  <div className="bg-[#19100d] border border-amber-800/50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-amber-300 block">Session En Cours Active</span>
                      <span className="text-[11px] text-slate-400">
                        Opérateur: {activeSessionForModal.employee_name} · Score actuel: {formatScoreM(activeSessionForModal.current_score)} pts
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenForceRelease(activeSessionForModal.id)}
                      className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 rounded-lg text-xs font-mono transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 inline mr-1" />
                      Force Release
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedAdminContract(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-3">
      
      {isValidations && (
        <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-tactical font-black text-white text-base sm:text-lg">Validations</h2>
            <span className={`text-xs font-mono font-bold ${pend.total > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{pend.total} en attente</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-mono">
            {([
              ['all', 'Tout', pend.total],
              ['starts', 'Débuts', pend.starts],
              ['ends', 'Fins', pend.ends],
              ['advances', 'Avances', pend.advances],
              ['signups', 'Inscriptions', pend.signups],
              ['resets', 'Mots de passe', pend.resets],
              ['profiles', 'Profils', pend.profiles],
            ] as const).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setValFilter(key)}
                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  valFilter === key
                    ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                    : 'bg-[#141e2a] border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {label} {n > 0 ? `(${n})` : ''}
              </button>
            ))}
          </div>
          {pend.total === 0 && <div className="text-sm text-slate-400 font-mono">Rien à valider.</div>}
        </div>
      )}

      {isValidations && (
        <>
      {/* Inscriptions de nouveaux boosters en attente */}
      {(valFilter === 'all' || valFilter === 'signups') && signups.length > 0 && (
        <div className="bg-[#0d1a14] border-2 border-emerald-500 p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400 shrink-0" />
            <h3 className="font-tactical font-black text-white text-sm sm:text-base">
              {signups.length} inscription{signups.length > 1 ? 's' : ''} en attente
            </h3>
          </div>
          {signups.map(r => (
            <div key={r.id} data-nav={`val-sig-${r.id}`} className="bg-[#0f1722] border border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1 text-xs font-mono space-y-0.5">
                <div className="text-white font-bold text-sm break-words">{r.name} <span className="text-slate-400 font-normal">(@{r.username})</span></div>
                <div className="text-emerald-300 break-words">Téléphone : {r.phone || 'non renseigné'}</div>
                <div className="text-slate-300">Shift souhaité : {r.shift === 'night' ? 'Nuit' : 'Jour'}</div>
                {r.note && <div className="text-cyan-300 break-words">Description : {r.note}</div>}
                <div className="text-slate-400">Demandé le {new Date(r.created_at).toLocaleString('fr-FR')}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-64 shrink-0">
                <button
                  type="button"
                  onClick={() => askReason({
                    title: "Refuser l'inscription ?",
                    message: `${r.name} verra ce motif quand il essaiera de se connecter.`,
                    onSubmit: reason => void db.decideSignup(r.id, false, reason),
                  })}
                  className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/60 text-red-300 text-xs font-bold cursor-pointer"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={() => askConfirm({
                    title: "Accepter l'inscription ?",
                    message: `${r.name} pourra se connecter avec le pseudo et le mot de passe qu'il a choisis.`,
                    confirmLabel: 'Accepter',
                    onConfirm: () => void db.decideSignup(r.id, true).then(res => { if (!res.success) alert(res.error); }),
                  })}
                  className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Accepter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* URGENT : demandes de nouveau mot de passe */}
      {(valFilter === 'all' || valFilter === 'resets') && resets.length > 0 && (
        <div className="bg-[#1a0d0d] border-2 border-red-500 p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-red-400 shrink-0" />
            <h3 className="font-tactical font-black text-white text-sm sm:text-base">
              URGENT · {resets.length} demande{resets.length > 1 ? 's' : ''} de mot de passe
            </h3>
          </div>
          {resets.map(r => (
            <div key={r.id} data-nav={`val-rst-${r.id}`} className="bg-[#0f1722] border border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1 text-xs font-mono space-y-0.5">
                <div className="text-white font-bold text-sm break-words">{r.name} <span className="text-slate-400 font-normal">(@{r.username})</span></div>
                <div className="text-amber-300 break-words">Téléphone : {r.phone || 'non renseigné'}</div>
                {r.note && <div className="text-cyan-300 break-words">Description : {r.note}</div>}
                <div className="text-slate-400">Demandé le {new Date(r.created_at).toLocaleString('fr-FR')}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-64 shrink-0">
                <button
                  type="button"
                  onClick={() => askReason({
                    title: 'Refuser la demande ?',
                    message: `Le mot de passe de ${r.name} ne changera pas. Il verra ce motif quand il essaiera de se connecter.`,
                    onSubmit: reason => void db.decidePasswordReset(r.id, false, reason),
                  })}
                  className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/60 text-red-300 text-xs font-bold cursor-pointer"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={() => askConfirm({
                    title: 'Valider la demande ?',
                    message: `${r.name} pourra se connecter avec le nouveau mot de passe qu'il a choisi.`,
                    confirmLabel: 'Valider',
                    onConfirm: () => void db.decidePasswordReset(r.id, true),
                  })}
                  className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modifications de profil à valider */}
      {(valFilter === 'all' || valFilter === 'profiles') && profileReqs.length > 0 && (
        <div className="bg-[#1a150a] border-2 border-amber-500 p-3 sm:p-4 space-y-3">
          <h3 className="font-tactical font-black text-white text-sm sm:text-base">
            {profileReqs.length} modification{profileReqs.length > 1 ? 's' : ''} de profil à valider
          </h3>
          {profileErr && <div className="p-2 bg-red-950 border border-red-500/60 text-red-200 text-xs font-semibold">{profileErr}</div>}
          {profileReqs.map(r => {
            const rows: { label: string; from: string; to: string }[] = [];
            if (r.name !== r.old.name) rows.push({ label: 'Nom', from: r.old.name, to: r.name });
            if (r.username !== r.old.username) rows.push({ label: 'Pseudo', from: `@${r.old.username}`, to: `@${r.username}` });
            if (r.phone !== r.old.phone) rows.push({ label: 'Téléphone', from: r.old.phone || 'vide', to: r.phone || 'vide' });
            const photoChanged = r.avatar_url !== r.old.avatar_url;
            return (
              <div key={r.id} data-nav={`val-prf-${r.id}`} className="bg-[#0f1722] border border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1 text-xs font-mono space-y-1">
                  <div className="text-white font-bold text-sm break-words">{r.old.name} <span className="text-slate-400 font-normal">(@{r.old.username})</span></div>
                  {r.note && <div className="text-cyan-300 break-words">Description : {r.note}</div>}
                  {rows.map(x => (
                    <div key={x.label} className="break-words">
                      <span className="text-slate-400">{x.label} : </span>
                      <span className="text-red-300 line-through">{x.from}</span>
                      <span className="text-slate-400"> → </span>
                      <span className="text-emerald-300 font-bold">{x.to}</span>
                    </div>
                  ))}
                  {photoChanged && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <span>Photo :</span>
                      {r.old.avatar_url && <Avatar src={r.old.avatar_url} name={r.old.name} className="w-10 h-10" />}
                      <span className="text-slate-400">→</span>
                      <Avatar src={r.avatar_url} name={r.name} className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:w-64 shrink-0">
                  <button
                    type="button"
                    onClick={() => askReason({
                      title: 'Refuser la modification ?',
                      message: `Le profil de ${r.old.name} ne changera pas. Il verra ce motif dans son profil.`,
                      onSubmit: reason => { setProfileErr(null); void db.decideProfileRequest(r.id, false, reason); },
                    })}
                    className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/60 text-red-300 text-xs font-bold cursor-pointer"
                  >
                    Refuser
                  </button>
                  <button
                    type="button"
                    onClick={() => askConfirm({
                      title: 'Valider la modification ?',
                      message: `Le profil de ${r.old.name} sera mis à jour.`,
                      confirmLabel: 'Valider',
                      onConfirm: async () => {
                        setProfileErr(null);
                        const res = await db.decideProfileRequest(r.id, true);
                        if (!res.success) setProfileErr(res.error || 'Erreur.');
                      },
                    })}
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Valider
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

        </>
      )}

      {isValidations && (valFilter === 'all' || valFilter === 'advances') && pendingAdvances.length > 0 && (
        <div className="bg-[#1a150a] border-2 border-amber-500 p-3 sm:p-4 space-y-3">
          <h3 className="font-tactical font-black text-white text-sm sm:text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400 shrink-0" />
            {pendingAdvances.length} avance{pendingAdvances.length > 1 ? 's' : ''} en attente
          </h3>
          {pendingAdvances.map(a => (
            <div key={a.id} data-nav={`val-adv-${a.id}`} className="bg-[#0f1722] border border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1 text-xs font-mono space-y-0.5">
                <div className="text-white font-bold text-sm break-words">{a.employee_name}</div>
                <div className="text-amber-300 font-bold">{formatCurrencyAr(a.amount_ar)}</div>
                <div className="text-slate-300 break-words">{a.reason}</div>
                <div className="text-slate-400">Demandé le {a.request_date}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-64 shrink-0">
                <button
                  type="button"
                  onClick={() => askReason({
                    title: "Refuser l'avance ?",
                    message: `${a.employee_name} verra ce motif.`,
                    onSubmit: reason => { db.reviewAdvanceRequest(a.id, false, reason); },
                  })}
                  className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-red-500/60 text-red-300 text-xs font-bold cursor-pointer"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={() => askReason({
                    title: "Accepter l'avance ?",
                    message: `${formatCurrencyAr(a.amount_ar)} pour ${a.employee_name}.`,
                    confirmLabel: 'Accepter',
                    optional: true,
                    onSubmit: note => { db.reviewAdvanceRequest(a.id, true, note || "Validé par l'administrateur"); },
                  })}
                  className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Accepter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isSecurity && (
        <>
      {/* SECTION 1: ADMIN ALERT BOX ("Petit Malin" Security Log) */}
      <div className={`rounded-xl border shadow-2xl overflow-hidden transition-all duration-300 ${
        activeViolations.length > 0
          ? 'bg-[#180a0d] border-red-500/80 animate-radar-alert'
          : 'bg-[#0f1722] border-slate-800'
      }`}>
        <div className="bg-red-950/70 px-6 py-3.5 border-b border-red-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-tactical font-black text-white text-base tracking-wide flex items-center gap-2">
                <span>RADAR SÉCURITÉ ("PETIT MALIN")</span>
                <span className="text-xs font-mono bg-red-600 text-white px-2 py-0.5 rounded font-bold">
                  {activeViolations.length} ALERTE(S) ACTIVE(S)
                </span>
              </h3>
              <p className="text-xs text-red-200/80 font-mono">
                Surveillance automatique des inversions de score, tentatives multi-poste et anomalies.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {securityLogs.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs font-mono">
              Aucune violation de sécurité détectée. Tous les opérateurs respectent les protocoles.
            </div>
          ) : (
            <div className="space-y-3">
              {securityLogs.slice(0, 6).map(log => {
                const user = users.find(u => u.id === log.employee_id);
                const isBlocked = user?.status === 'blocked';

                return (
                  <div
                    key={log.id}
                    data-nav={`sec-${log.id}`}
                    className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 transition-colors ${
                      log.resolved
                        ? 'bg-slate-900/50 border-slate-800/80 opacity-70'
                        : 'bg-red-950/40 border-red-800/60 shadow-lg'
                    }`}
                  >
                    <div className="w-full sm:flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] sm:text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700">
                          {log.violation_type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-white font-mono">
                          Opérateur: {log.employee_name}
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                          ({log.timestamp})
                        </span>
                      </div>

                      <p className="text-xs text-slate-200 mt-2 font-mono leading-relaxed">
                        {log.description}
                      </p>

                      {log.details && (
                        <div className="mt-2 text-[10px] sm:text-[11px] font-mono text-slate-400 flex flex-wrap gap-2.5 sm:gap-3">
                          {log.details.initial_score !== undefined && (
                            <span>Score Initial: <strong className="text-white">{formatScoreM(log.details.initial_score)} pts</strong></span>
                          )}
                          {log.details.attempted_score !== undefined && (
                            <span>Score Tenté: <strong className="text-red-400">{formatScoreM(log.details.attempted_score)} pts</strong></span>
                          )}
                          {log.details.client_name && (
                            <span>Client: <strong className="text-cyan-400">{log.details.client_name}</strong></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Direct Action Buttons: [ Block User ] / [ Unblock User ] */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                      <button
                        onClick={() => handleToggleBlock(log.employee_id)}
                        className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow ${
                          isBlocked
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                        title={isBlocked ? 'Débloquer l\'utilisateur' : 'Bloquer immédiatement l\'utilisateur'}
                      >
                        {isBlocked ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        <span>{isBlocked ? 'Débloquer Compte' : 'Bloquer Utilisateur'}</span>
                      </button>

                      {!log.resolved && (
                        <button
                          onClick={() => handleDismissViolation(log.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-colors"
                          title="Classer l'incident"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

        </>
      )}

      {isValidations && showSubs && (
        <>
      {/* SECTION 2: SUBMISSIONS REVIEW PANEL */}
      <div className="bg-[#0f1722] border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="bg-[#121c27] px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-tactical font-bold text-white text-base tracking-wide flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Panneau de Validation des Soumissions (Start &amp; End Forms)
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Vérification des preuves de captures de jeu et calcul automatisé du payroll (prix du 1M dans Réglages).
            </p>
          </div>

          {/* Submissions Filter */}
          <div className="flex items-center gap-1 bg-[#141e2a] p-1 rounded-lg border border-slate-700 text-xs font-mono">
            <button
              onClick={() => setSubmissionFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                submissionFilter === 'all'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tous ({pendingSubmissions.length})
            </button>
            <button
              onClick={() => setSubmissionFilter('pending_start')}
              className={`px-2.5 py-1 rounded transition-colors ${
                submissionFilter === 'pending_start'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Départs ({pendingSubmissions.filter(p => p.status === 'pending_start').length})
            </button>
            <button
              onClick={() => setSubmissionFilter('pending_end')}
              className={`px-2.5 py-1 rounded transition-colors ${
                submissionFilter === 'pending_end'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Fins ({pendingSubmissions.filter(p => p.status === 'pending_end').length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-lg">
              Aucune soumission en attente de révision pour le moment.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map(post => {
                const isStart = post.status === 'pending_start';
                const finalScore = post.final_score ?? post.current_score;
                const scoreDiff = isStart ? 0 : Math.max(0, finalScore - post.initial_score);
                const estimatedAr = Math.round((scoreDiff / 1000000) * db.getSettings().price_per_million);

                return (
                  <div
                    key={post.id}
                    data-nav={`val-post-${post.id}`}
                    className="bg-[#131d2a] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors space-y-4"
                  >
                    {/* Header line */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              isStart
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            }`}
                          >
                            {isStart ? 'Demande de Début (pending_start)' : 'Demande de Clôture (pending_end)'}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Shift {post.shift_type.toUpperCase()} · Reçu à {post.start_time}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white mt-1">
                          Client: {post.client_name} ({post.account_tag})
                        </h4>
                        <p className="text-xs text-slate-300 font-mono">
                          Opérateur Booster: <strong className="text-emerald-400">{post.employee_name}</strong>
                        </p>
                      </div>

                      {/* Estimated Payroll readout */}
                      {!isStart && (
                        <div className="bg-emerald-950/60 border border-emerald-500/40 p-3 rounded-lg text-right font-mono">
                          <div className="text-[10px] uppercase text-emerald-400">Payroll Automatisé Calculé</div>
                          <div className="text-lg font-bold text-emerald-300">
                            +{estimatedAr.toLocaleString()} Ar
                          </div>
                          <div className="text-[10px] text-slate-400">
                            (+{formatScoreM(scoreDiff)} pts de gain)
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Scores Comparison */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="bg-[#0b1118] p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 text-[10px] block uppercase">Score Départ</span>
                        <span className="text-white font-bold">{formatScoreM(post.initial_score)} pts</span>
                      </div>
                      <div className="bg-[#0b1118] p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 text-[10px] block uppercase">Score Soumis</span>
                        <span className="text-cyan-400 font-bold">{formatScoreM(finalScore)} pts</span>
                      </div>
                      <div className="bg-[#0b1118] p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 text-[10px] block uppercase">Objectif</span>
                        <span className="text-amber-400 font-bold">{formatScoreM(post.target_score - post.initial_score)}</span>
                      </div>
                      <div className="bg-[#0b1118] p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 text-[10px] block uppercase">Progression</span>
                        <span className="text-emerald-400 font-bold">
                          {Math.round(((finalScore - post.initial_score) / (post.target_score - post.initial_score || 1)) * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Clickable Thumbnail Previews for Lightbox */}
                    <div className="pt-2">
                      <span className="text-xs uppercase font-mono font-semibold text-slate-400 block mb-2">
                        Preuves Captures d'Écran (Cliquez pour agrandir dans la Lightbox)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        {/* Start Proof Thumbnail */}
                        <div
                          onClick={() =>
                            onOpenProofLightbox({
                              imageUrl: post.start_proof_url,
                              gallery: proofsOf(post),
                              title: `Preuve de Début - ${post.client_name}`,
                              score: post.initial_score,
                              clientTag: post.client_name,
                              operatorName: post.employee_name,
                              timestamp: `${post.date} ${post.start_time}`,
                            })
                          }
                          className="group relative cursor-pointer bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden p-1.5 hover:border-emerald-500 transition-all hover:shadow-lg"
                        >
                          <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between px-1">
                            <span className="text-emerald-400 font-bold">CAPTURE DÉPART</span>
                            <span className="text-slate-500">{post.start_time}</span>
                          </div>
                          <div className="relative aspect-video rounded overflow-hidden bg-black/60">
                            <img
                              src={post.start_proof_url}
                              alt="Preuve Début"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-mono">
                              <Eye className="w-4 h-4 text-emerald-400" />
                              <span>Inspecter Plein Écran</span>
                            </div>
                          </div>
                        </div>

                        {/* End Proof Thumbnail (if pending_end) */}
                        {post.end_proof_url && (
                          <div
                            onClick={() =>
                              onOpenProofLightbox({
                                imageUrl: post.end_proof_url!,
                                gallery: proofsOf(post),
                                title: `Preuve de Fin - ${post.client_name}`,
                                score: finalScore,
                                clientTag: post.client_name,
                                operatorName: post.employee_name,
                                timestamp: `${post.date} ${post.end_time || ''}`,
                              })
                            }
                            className="group relative cursor-pointer bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden p-1.5 hover:border-emerald-500 transition-all hover:shadow-lg"
                          >
                            <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between px-1">
                              <span className="text-cyan-400 font-bold">CAPTURE FIN</span>
                              <span className="text-slate-500">{post.end_time || 'Clôture'}</span>
                            </div>
                            <div className="relative aspect-video rounded overflow-hidden bg-black/60">
                              <img
                                src={post.end_proof_url}
                                alt="Preuve Fin"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-mono">
                                <Eye className="w-4 h-4 text-cyan-400" />
                                <span>Inspecter Plein Écran</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes if any */}
                    {post.notes && (
                      <div className="text-xs text-slate-400 font-mono bg-[#090d12] p-2.5 rounded border border-slate-800">
                        <span className="text-slate-500 uppercase">Notes Opérateur: </span>
                        {post.notes}
                      </div>
                    )}

                    {/* Action Buttons: [ Validate ], [ Reject ], [ Force Release Post ] */}
                    <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                      <div>
                        {/* Emergency Force Release button to unstick bugged shifts */}
                        <button
                          onClick={() => handleOpenForceRelease(post.id)}
                          className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-700/60 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5"
                          title="Débloquer d'urgence l'opérateur en cas de bug de session"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Force Release Post</span>
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        {/* Reject button */}
                        <button
                          onClick={() => handleOpenReject(post.id)}
                          className="w-full sm:w-auto px-4 py-2 sm:py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/60 rounded text-xs font-mono font-bold transition-colors flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Rejeter Soumission</span>
                        </button>

                        {/* Validate button */}
                        <button
                          onClick={() => handleValidate(post.id)}
                          className="w-full sm:w-auto px-5 py-2.5 sm:py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-tactical font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/60"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Valider &amp; Calculer Paie</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

        </>
      )}

      {isSessions && (
        <>
      {/* SECTION 3: CONNECTED EMPLOYEES & LIVE FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connected Boosters List */}
        <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-6 shadow-xl lg:col-span-1">
          {waitingQueue.length > 0 && (
            <div className="mb-4 bg-[#1a150a] border-2 border-amber-500 p-3 space-y-2">
              <h3 className="font-tactical font-black text-white text-sm">File d'attente « sans poste » ({waitingQueue.length})</h3>
              {waitingQueue.map(w => (
                <div key={w.user.id} className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-white break-words min-w-0">#{w.position} · {w.user.name}</span>
                  <span className={`shrink-0 font-bold ${w.minutes >= 30 ? 'text-red-400' : w.minutes >= 15 ? 'text-amber-300' : 'text-slate-300'}`}>
                    attend depuis {w.minutes} min
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-tactical font-bold text-white text-base flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              Opérateurs Connectés
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
              {onlineEmployees.length} En Ligne
            </span>
          </div>

          <div className="space-y-3">
            {users
              .filter(u => u.role === 'employee')
              .map(emp => {
                const active = posts.find(
                  p => p.employee_id === emp.id && (p.status === 'active' || p.status === 'pending_start')
                );
                const ps = getPresenceStatus(emp, posts, presence);

                return (
                  <div
                    key={emp.id}
                    className="bg-[#121a24] p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <Avatar src={emp.avatar_url} name={emp.name} className="w-8 h-8" />
                        <span
                          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-slate-900 ${STATUS_DOT[ps.status]}`}
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          <span>{emp.name}</span>
                          {emp.status === 'blocked' && (
                            <span className="text-[9px] bg-red-950 text-red-400 px-1 rounded">Banni</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Shift {emp.shift.toUpperCase()} · {active ? `En jeu: ${active.client_name}` : STATUS_LABEL[ps.status]}
                        </div>
                      </div>
                    </div>

                    {onOpenEmployeeCV && (
                      <button
                        onClick={() => onOpenEmployeeCV(emp)}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                        title="Voir le profil"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Quick Links & Shortcuts */}
        <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-6 shadow-xl lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="font-tactical font-bold text-white text-base flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Gestion &amp; Accès Rapides
            </h3>
            <p className="text-xs text-slate-400 font-mono mb-6">
              Raccourcis vers la gestion d'équipe, consultations des profils et calendriers de performances mensuelles.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={onNavigateToEmployees}
                className="p-4 bg-[#131c28] hover:bg-[#182333] border border-slate-700 rounded-xl text-left transition-colors group"
              >
                <div className="font-tactical font-bold text-white text-sm group-hover:text-emerald-400 flex items-center justify-between">
                  <span>Gestion des Opérateurs</span>
                  <span className="text-xs font-mono text-emerald-400">→</span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Tri par Shift Jour/Nuit, badges de performance, blocages et suppression de profils.
                </p>
              </button>

              <button
                onClick={onNavigateToCalendar}
                className="p-4 bg-[#131c28] hover:bg-[#182333] border border-slate-700 rounded-xl text-left transition-colors group"
              >
                <div className="font-tactical font-bold text-white text-sm group-hover:text-cyan-400 flex items-center justify-between">
                  <span>Calendrier Mensuel Interactif</span>
                  <span className="text-xs font-mono text-cyan-400">→</span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Grille des statuts (Objectif Atteint, Absent, etc.) et modales détaillées au clic.
                </p>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-500 flex items-center justify-between">
            <span>Terminal d'administration Delta Force - Version Opérationnelle 1.0</span>
            <span className="text-emerald-400">BDD Locale Active</span>
          </div>
        </div>
      </div>

        </>
      )}

      {/* REJECT MODAL */}
      {rejectingPostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-6 space-y-4 text-xs font-mono shadow-2xl">
            <h3 className="font-tactical font-bold text-white text-base text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Motif de Rejet de la Soumission
            </h3>
            <p className="text-slate-400">
              Veuillez préciser la raison du rejet qui sera notifiée à l'opérateur booster.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label className="block text-slate-300 uppercase mb-1">Raison du Rejet</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  required
                  placeholder="ex: Capture illisible, score ne correspondant pas aux métadonnées..."
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingPostId(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
                >
                  Confirmer le Rejet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORCE RELEASE MODAL */}
      {forceReleasePostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-6 space-y-4 text-xs font-mono shadow-2xl">
            <h3 className="font-tactical font-bold text-white text-base text-amber-400 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Force Release Post (Libération d'Urgence)
            </h3>
            <p className="text-slate-400">
              Cette action déverrouille immédiatement la session et libère l'employé bloqué par la contrainte Anti-Multi-Poste.
            </p>

            <form onSubmit={handleConfirmForceRelease} className="space-y-4">
              <div>
                <label className="block text-slate-300 uppercase mb-1">Motif de Déblocage</label>
                <input
                  type="text"
                  value={forceReleaseReason}
                  onChange={e => setForceReleaseReason(e.target.value)}
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setForceReleasePostId(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded"
                >
                  Exécuter Force Release
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP TOAST NOTICE */}
      {toastNotice && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-300">
          <div className={`px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 text-xs font-mono backdrop-blur-md ${
            toastNotice.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500 text-emerald-200'
              : toastNotice.type === 'error'
              ? 'bg-red-950/95 border-red-500 text-red-200'
              : 'bg-cyan-950/95 border-cyan-500 text-cyan-200'
          }`}>
            {toastNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : toastNotice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span>{toastNotice.message}</span>
            <button
              onClick={() => setToastNotice(null)}
              className="text-slate-400 hover:text-white ml-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
