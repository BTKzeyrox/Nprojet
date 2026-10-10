import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Camera,
  CheckCircle2,
  Send,
  XCircle,
  Edit2,
  Eye,
  DollarSign,
  MessageSquare,
  Calendar,
  AlertOctagon,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Info,
  Layers,
  ArrowLeft,
  ChevronRight,
  Server,
  Zap,
  Target,
  X,
  Shield,
  Check,
  AlertCircle,
  CircleDot,
} from 'lucide-react';
import { User, PostSession, ShiftType, ClientContract } from '../../types';
import { db } from '../../db/store';
import { proofsOf } from '../../utils/proofs';
import { askConfirm } from '../../components/ConfirmModal';
import { AdvanceHistory } from '../../components/AdvanceHistory';
import { MyPayroll, AdvanceRoomInfo, useAdvanceRoom } from '../../components/MyPayroll';
import { AdvPayTabs } from '../../components/AdvPayTabs';
import { compressProofImage } from '../../utils/imageUtils';
import { AVAILABLE_CLIENT_CONTRACTS } from '../../db/initialData';
import { PostsGrid20 } from '../../components/PostsGrid20';
import { formatScoreM, formatCurrencyAr } from '../../utils/formatUtils';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { ScoreInput } from '../../components/ScoreInput';
import { QueueButton } from '../../components/QueueButton';

interface EmployeeDashboardProps {
  currentUser: User;
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
  activeSubTab?: 'grid' | 'active-post' | 'advances' | 'chat';
  onNavigateTab?: (tab: 'grid' | 'active-post' | 'advances' | 'chat' | 'calendar') => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentUser,
  onOpenProofLightbox,
  activeSubTab = 'active-post',
  onNavigateTab,
}) => {
  const [currentShiftView, setCurrentShiftView] = useState<ShiftType>(currentUser.shift || 'day');
  const [allPosts, setAllPosts] = useState<PostSession[]>(db.getPosts());
  const [activePost, setActivePost] = useState<PostSession | undefined>(
    db.getActiveOrPendingPost(currentUser.id)
  );

  // Home View Mode: By default 'grid' (Postes en grille) as requested!
  const [homeViewMode, setHomeViewMode] = useState<'grid' | 'details'>(
    activeSubTab === 'active-post' ? 'details' : 'grid'
  );
  const [selectedContract, setSelectedContract] = useState<ClientContract | null>(null);

  // New Dedicated Choose Post Confirmation Modal State
  const [choosePostModalContract, setChoosePostModalContract] = useState<ClientContract | null>(null);
  const [toastNotice, setToastNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastNotice({ message, type });
    setTimeout(() => {
      setToastNotice(null);
    }, 4000);
  };

  // Multi-post resolution dialog state (no more broken window.alert!)
  const [multiPostTargetContract, setMultiPostTargetContract] = useState<ClientContract | null>(null);
  const [showMultiPostDialog, setShowMultiPostDialog] = useState(false);
  const [occupiedPostNotice, setOccupiedPostNotice] = useState<string | null>(null);
  const [advanceFormError, setAdvanceFormError] = useState<string | null>(null);

  // Keep homeViewMode in sync with activeSubTab prop
  useEffect(() => {
    if (activeSubTab === 'active-post') {
      setHomeViewMode('details');
    } else if (activeSubTab === 'grid') {
      setHomeViewMode('grid');
    }
  }, [activeSubTab]);

  // Start Form states
  const [showStartModal, setShowStartModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [accountTag, setAccountTag] = useState('');
  const [targetScore, setTargetScore] = useState<number>(25000000);
  // Objectif = points à gagner (cible - départ du poste)
  const [objective, setObjective] = useState<number>(0);
  // Début (admin) et Actuel du compte, affichés en lecture seule
  const [accountStart, setAccountStart] = useState<number>(0);
  const [accountCurrent, setAccountCurrent] = useState<number>(0);
  // La capture montre-t-elle le même score que l'Actuel affiché ?
  const [scoreMatches, setScoreMatches] = useState<boolean>(true);
  const [initialScore, setInitialScore] = useState<number>(14000000);
  const [startProofPhotos, setStartProofPhotos] = useState<string[]>([]);
  const [startProofPreview, setStartProofPreview] = useState<string | null>(null);
  const [startFormError, setStartFormError] = useState<string | null>(null);
  const [startNotes, setStartNotes] = useState(''); // description facultative envoyée à l'admin

  // Edit Pending Start Form states
  const [isEditingPendingStart, setIsEditingPendingStart] = useState(false);
  const [editScore, setEditScore] = useState<number>(0);
  const [editProofPreview, setEditProofPreview] = useState<string | null>(null);

  // End Form states
  const [showEndModal, setShowEndModal] = useState(false);
  const [finalScoreInput, setFinalScoreInput] = useState<number>(0);
  const [endProofPreview, setEndProofPreview] = useState<string | null>(null);
  const [endNotes, setEndNotes] = useState('');
  const [endFormError, setEndFormError] = useState<string | null>(null);

  // Salary Advance states
  const [advanceAmount, setAdvanceAmount] = useState<number>(10000);
  const [advTab, setAdvTab] = useState<'advances' | 'payroll'>('advances');
  const advanceRoom = useAdvanceRoom(activeSubTab === 'advances' && advTab === 'advances');
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceSuccess, setAdvanceSuccess] = useState(false);

  // Lock body scroll when any modal or drawer is active
  useLockBodyScroll(
    !!choosePostModalContract ||
    showStartModal ||
    showEndModal ||
    isEditingPendingStart ||
    showMultiPostDialog ||
    showCancelModal
  );

  // Messaging states
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState(db.getMessages());

  // Listen to DB updates
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setAllPosts(db.getPosts());
      setActivePost(db.getActiveOrPendingPost(currentUser.id));
      setMessages(db.getMessages());
    });
    return unsubscribe;
  }, [currentUser.id]);

  const openStartModalForContract = (contract: ClientContract) => {
    setSelectedContract(contract);
    setClientName(contract.client_name);
    setAccountTag(contract.account_tag);
    const startNow = contract.current_score ?? contract.initial_score;
    setAccountStart(contract.initial_score);
    setAccountCurrent(startNow);
    setScoreMatches(true);
    setInitialScore(startNow);
    setTargetScore(contract.target_score);
    setObjective(Math.max(0, contract.target_score - contract.initial_score));
    setStartProofPhotos([]);
    setStartProofPreview(null);
    setStartFormError(null);
    setShowStartModal(true);
  };

  // When an employee chooses a client account from the grid
  const handleSelectClientFromGrid = (contract: ClientContract) => {
    setSelectedContract(contract);

    // 1. If this contract is currently active by this employee
    if (activePost && activePost.client_name === contract.client_name) {
      setHomeViewMode('details');
      if (onNavigateTab) onNavigateTab('active-post');
      return;
    }

    // 2. If the employee already has an active post on another account:
    // Open in-app dialog instead of failing silently with alert!
    if (activePost) {
      db.logViolation({
        employee_id: currentUser.id,
        employee_name: currentUser.name,
        violation_type: 'multi_post_attempt',
        description: `Anti-Multi-Poste: Tentative de sélection du compte "${contract.client_name}" alors que "${activePost.client_name}" est en cours.`,
        details: {
          active_post_id: activePost.id,
          client_name: contract.client_name,
        }
      });
      setMultiPostTargetContract(contract);
      setShowMultiPostDialog(true);
      return;
    }

    // 3. Check if contract is currently taken by someone else
    const takenBy = allPosts.find(
      p => p.client_name === contract.client_name && (p.status === 'active' || p.status === 'pending_start') && p.employee_id !== currentUser.id
    );
    if (takenBy) {
      setOccupiedPostNotice(`Le poste #${contract.post_number} (${contract.client_name}) est actuellement pris par ${takenBy.employee_name}.`);
      setTimeout(() => setOccupiedPostNotice(null), 5000);
      return;
    }

    // 4. Free to start: Pre-fill Start Form with chosen client account details
    openStartModalForContract(contract);
  };

  const handleOpenEndModal = () => {
    if (!activePost) return;
    setEndFormError(null);
    const suggestedFinal = Math.max(activePost.initial_score, activePost.current_score);
    setFinalScoreInput(suggestedFinal);
    setEndProofPreview(null);
    setEndNotes('');
    setShowEndModal(true);
  };

  // Photo de preuve : compressée (~150 Ko) puis envoyée dans Supabase Storage.
  // Si l'envoi échoue, on garde la version compressée pour ne rien perdre.
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadStep, setUploadStep] = useState<{ pct: number; label: string } | null>(null);
  const prepareProof = async (file: File): Promise<string | null> => {
    setUploadingCount(c => c + 1);
    setUploadStep({ pct: 10, label: 'Compression de la photo…' });
    try {
      const small = await compressProofImage(file);
      setUploadStep({ pct: 55, label: 'Envoi de la photo…' });
      const url = await db.uploadFile(small);
      setUploadStep({ pct: 100, label: 'Photo envoyée' });
      return url || small;
    } catch {
      return null;
    } finally {
      setUploadingCount(c => {
        if (c - 1 <= 0) setTimeout(() => setUploadStep(null), 700);
        return c - 1;
      });
    }
  };
  const uploadBar = uploadStep ? (
    <div className="mt-2" role="status" aria-live="polite">
      <div className="flex justify-between text-[11px] font-mono text-cyan-300 mb-1">
        <span>{uploadStep.label}</span>
        <span>{uploadStep.pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${uploadStep.pct}%` }} />
      </div>
    </div>
  ) : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, target: 'start' | 'end' | 'edit') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await prepareProof(file);
    if (!result) return;
    if (target === 'start') {
      setStartProofPreview(result);
      setStartProofPhotos(prev => (prev.length >= 5 ? prev : [...prev, result]));
    }
    if (target === 'end') setEndProofPreview(result);
    if (target === 'edit') setEditProofPreview(result);
  };

  // Multi-photo handler for 1 to 5 photos
  const handleMultipleStartPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const availableSlots = 5 - startProofPhotos.length;
    if (availableSlots <= 0) {
      setStartFormError('Vous pouvez envoyer au maximum 5 photos pour ce poste.');
      return;
    }

    const filesToRead = Array.from(files).slice(0, availableSlots);
    e.target.value = '';
    for (const file of filesToRead) {
      const result = await prepareProof(file);
      if (result) setStartProofPhotos(prev => (prev.length >= 5 ? prev : [...prev, result]));
    }
  };

  const handleRemoveStartPhoto = (index: number) => {
    setStartProofPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Start Form (Employee can only enter début and upload 1-4 photos)
  const handleSubmitStartForm = (e: React.FormEvent, confirmed = false) => {
    e.preventDefault();
    setStartFormError(null);
    if (uploadingCount > 0) {
      setStartFormError('Photo en cours d\'envoi, patientez quelques secondes.');
      return;
    }

    if (initialScore <= 0) {
      setStartFormError('Veuillez entrer le score réel vu sur la capture.');
      return;
    }
    if (startProofPhotos.length === 0) {
      setStartFormError('Veuillez ajouter au moins 1 capture ou photo de début (1 à 5 photos autorisées).');
      return;
    }
    if (!confirmed) {
      askConfirm({
        title: 'Envoyer la demande de début ?',
        message: "Votre capture sera envoyée à l'administrateur pour validation.",
        confirmLabel: 'Envoyer',
        onConfirm: () => handleSubmitStartForm(e, true),
      });
      return;
    }

    const contract = selectedContract;
    const finalClientName = contract ? contract.client_name : clientName;
    const finalAccountTag = contract ? contract.account_tag : accountTag;
    const finalTargetScore = contract ? contract.target_score : targetScore;

    const res = db.startPost({
      employeeId: currentUser.id,
      clientName: finalClientName,
      accountTag: finalAccountTag,
      targetScore: finalTargetScore,
      initialScore,
      proofUrls: startProofPhotos,
      postNumber: contract?.post_number,
      shiftType: contract?.recommended_shift === 'night' ? 'night' : 'day',
      status: 'pending_start',
      notes: `Demande de début soumise par ${currentUser.name} avec ${startProofPhotos.length} photo(s)${startNotes.trim() ? ` | ${startNotes.trim()}` : ''}`
    });

    if (!res.success) {
      setStartFormError(res.error || 'Erreur lors de l\'enregistrement du poste.');
      return;
    }

    setShowStartModal(false);
    setStartNotes('');
    setHomeViewMode('details');
    if (onNavigateTab) {
      onNavigateTab('active-post');
    }
  };

  // Submit End Form with mandatory score consistency check
  const handleSubmitEndForm = (e: React.FormEvent, confirmed = false) => {
    e.preventDefault();
    if (!activePost) return;
    setEndFormError(null);
    if (uploadingCount > 0) {
      setEndFormError('Photo en cours d\'envoi, patientez quelques secondes.');
      return;
    }

    if (!endProofPreview) {
      setEndFormError('La capture d\'écran ou photo de fin de session est obligatoire.');
      return;
    }
    if (!confirmed) {
      askConfirm({
        title: 'Terminer la session ?',
        message: "Votre score final et votre capture seront envoyés à l'administrateur. Vous ne pourrez plus les modifier.",
        confirmLabel: 'Terminer',
        onConfirm: () => handleSubmitEndForm(e, true),
      });
      return;
    }

    // Front-end & Back-end Score Consistency Enforcement
    if (finalScoreInput < activePost.initial_score) {
      const err = 'Le score final ne peut pas être inférieur au score de départ.';
      setEndFormError(err);
      db.submitEndPost({
        postId: activePost.id,
        finalScore: finalScoreInput,
        endProofUrl: endProofPreview,
        notes: endNotes,
      });
      return;
    }

    const res = db.submitEndPost({
      postId: activePost.id,
      finalScore: finalScoreInput,
      endProofUrl: endProofPreview,
      notes: endNotes,
    });

    if (!res.success) {
      setEndFormError(res.error || 'Erreur lors de la validation finale.');
      return;
    }

    setShowEndModal(false);
  };

  // Cancel pending start post
  const handleCancelPendingStart = () => {
    if (!activePost) return;
    askConfirm({
      title: 'Annuler ce poste ?',
      message: "Le poste redeviendra libre. Votre demande de début sera supprimée.",
      confirmLabel: 'Annuler le poste',
      cancelLabel: 'Garder',
      danger: true,
      onConfirm: () => {
        const res = db.cancelPendingStartPost(activePost.id);
        if (!res.success) {
          alert(res.error);
        }
      },
    });
  };

  // Edit pending start post
  const handleOpenEditPending = () => {
    if (!activePost) return;
    setEditScore(activePost.initial_score);
    setEditProofPreview(activePost.start_proof_url);
    setIsEditingPendingStart(true);
  };

  const handleSaveEditPending = () => {
    if (!activePost) return;
    if (editScore <= 0) {
      alert('Score invalide');
      return;
    }
    const res = db.updatePendingStartPost(activePost.id, editScore, editProofPreview || undefined);
    if (!res.success) {
      alert(res.error);
      return;
    }
    setIsEditingPendingStart(false);
  };

  // Submit salary advance request
  const handleSubmitAdvance = (e: React.FormEvent, confirmed = false) => {
    e.preventDefault();
    if (advanceAmount <= 0) return;
    if (advanceRoom && advanceRoom.available !== null && advanceAmount > advanceRoom.available) {
      alert(`Le plafond d'avance est dépassé : tu peux demander au maximum ${advanceRoom.available.toLocaleString('fr-FR')} Ar pour l'instant.`);
      return;
    }
    if (!advanceReason.trim()) {
      alert('Veuillez indiquer le motif de l\'avance sur salaire.');
      return;
    }
    if (!confirmed) {
      askConfirm({
        title: "Envoyer la demande d'avance ?",
        message: 'Elle sera envoyée à l\'administrateur et déduite de votre paie si elle est acceptée.',
        confirmLabel: 'Envoyer',
        onConfirm: () => handleSubmitAdvance(e, true),
      });
      return;
    }

    db.submitAdvanceRequest({
      employeeId: currentUser.id,
      amountAr: advanceAmount,
      reason: advanceReason,
    });

    setAdvanceReason('');
    setAdvanceSuccess(true);
    setTimeout(() => setAdvanceSuccess(false), 3000);
  };

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    db.sendMessage({
      senderId: currentUser.id,
      message: chatMessage,
      recipientId: 'user-admin-1',
    });

    setChatMessage('');
  };

  // Shift confinement check
  const now = new Date();
  const currentHour = now.getHours();
  const isInsideAssignedShift =
    currentUser.shift === 'day'
      ? currentHour >= 8 && currentHour < 18
      : currentHour >= 20 || currentHour < 6;

  // Filter advances for current user
  const userAdvances = db.getAdvanceRequests().filter(a => a.employee_id === currentUser.id);

  return (
    <div className="space-y-4 sm:space-y-3 max-w-none mx-auto px-1.5 sm:px-3 lg:px-4 py-4 sm:py-6">
      {uploadingCount > 0 && (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2.5 bg-[#0f1722] border border-emerald-500 text-emerald-300 text-xs font-mono shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          Photo en cours d'envoi… ne ferme pas la page
        </div>
      )}

      <QueueButton userId={currentUser.id} />

      {/* Top Banner: Terminal Status */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0f1722] p-4 rounded-xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white font-tactical font-bold text-base">
                TERMINAL BOOSTER: {currentUser.name.toUpperCase()}
              </h2>
              <span className="text-[10px] font-mono uppercase bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/40 font-bold">
                {currentUser.performance_badge}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
              <span>Poste Opérateur</span>
              <span>·</span>
              <span className={isInsideAssignedShift ? 'text-emerald-400' : 'text-amber-400 font-semibold'}>
                {isInsideAssignedShift ? (
                  <span className="inline-flex items-center gap-1"><CircleDot className="w-3 h-3" />Fenêtre autorisée</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />En attente ou hors fenêtre</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ACCUEIL SUB-VIEW: POSTES EN GRILLE (PAR DÉFAUT) OU DÉTAILS DU POSTE */}
      {(activeSubTab === 'grid' || activeSubTab === 'active-post') && (
        <div className="space-y-4">
          
          {/* View Toggle Bar (Postes en Grille vs Mon Poste en Cours) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131c28] p-3 rounded-xl border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHomeViewMode('grid')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  homeViewMode === 'grid'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Grille des Postes Clients ({AVAILABLE_CLIENT_CONTRACTS.length})</span>
              </button>

              <button
                onClick={() => setHomeViewMode('details')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  homeViewMode === 'details'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>
                  {activePost ? `Poste en Cours (${activePost.client_name})` : 'Détails du Poste Sélectionné'}
                </span>
                {activePost && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
              </button>
            </div>

            {activePost && (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Session active: <strong>{activePost.client_name}</strong></span>
              </div>
            )}
          </div>

          {/* ================= MODE 1: GRILLE DES POSTES CLIENTS (PAR DÉFAUT) ================= */}
          {homeViewMode === 'grid' && (
            <div className="space-y-4">
              <PostsGrid20
                currentUser={currentUser}
                activePost={activePost}
                allPosts={allPosts}
                onSelectContract={(contract) => handleSelectClientFromGrid(contract)}
                onOpenProofLightbox={onOpenProofLightbox}
                onNavigateToActivePost={() => setHomeViewMode('details')}
              />
            </div>
          )}

          {/* ================= MODE 2: DÉTAILS DU COMPTE SÉLECTIONNÉ & SESSION ================= */}
          {homeViewMode === 'details' && (
            <div className="space-y-4">
              
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setHomeViewMode('grid')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour à la Grille des Postes</span>
                </button>

                {activePost && (
                  <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-500/40">
                    Statut: {activePost.status.toUpperCase()}
                  </span>
                )}
              </div>

              {activePost ? (
                /* Active Post Card */
                <div className="bg-[#0f1722] border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                  
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-mono uppercase text-emerald-400 font-bold tracking-wider">
                          SESSION DE BOOST ACTIVE · STATUT: {activePost.status.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold font-tactical text-white mt-1">
                        Client: {activePost.client_name}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        Tag: <span className="text-cyan-400 font-semibold">{activePost.account_tag}</span> · Date: {activePost.date} · Début: {activePost.start_time}
                      </p>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {activePost.status === 'pending_start' && (
                        <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-600/50 p-2 rounded-lg text-xs font-mono w-full sm:w-auto justify-between">
                          <span className="text-amber-300 font-semibold">En attente validation Admin</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={handleOpenEditPending}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Modifier</span>
                            </button>
                            <button
                              onClick={handleCancelPendingStart}
                              className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white rounded flex items-center gap-1 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Annuler</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {activePost.status === 'pending_end' && (
                        <div className="bg-cyan-950/80 border border-cyan-600/50 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Fin soumise · En attente de validation</span>
                        </div>
                      )}

                      {activePost.status === 'active' && (
                        <button
                          onClick={handleOpenEndModal}
                          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-lg shadow flex items-center justify-center gap-2 transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Terminer le Poste (End Form)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Score Readouts (Initial, Current, Target, Remaining) */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mt-6">
                    <div className="bg-[#131c28] p-3 sm:p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400">Score Initial Relevé</div>
                      <div className="text-base sm:text-xl lg:text-2xl font-black font-mono text-white mt-1 truncate">
                        {formatScoreM(activePost.initial_score)}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono mt-0.5">
                        Départ ({formatScoreM(activePost.initial_score)} pts)
                      </div>
                    </div>

                    <div className="bg-[#131c28] p-3 sm:p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400">Score Actuel</div>
                      <div className="text-base sm:text-xl lg:text-2xl font-black font-mono text-cyan-400 mt-1 truncate">
                        {formatScoreM(activePost.current_score)}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>+{formatScoreM(Math.max(0, activePost.current_score - activePost.initial_score))} pts</span>
                      </div>
                    </div>

                    <div className="bg-[#131c28] p-3 sm:p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400">Objectif</div>
                      <div className="text-base sm:text-xl lg:text-2xl font-black font-mono text-amber-400 mt-1 truncate">
                        {formatScoreM(Math.max(0, activePost.target_score - activePost.initial_score))}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono mt-0.5">
                        Points à gagner
                      </div>
                    </div>

                    <div className="bg-[#131c28] p-3 sm:p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400">Score Restant</div>
                      <div className="text-base sm:text-xl lg:text-2xl font-black font-mono text-emerald-400 mt-1 truncate">
                        {formatScoreM(Math.max(0, activePost.target_score - activePost.current_score))}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-slate-400 font-mono mt-0.5">
                        Restant pour fin
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-6 bg-[#131c28] p-4 rounded-xl border border-slate-800">
                    {(() => {
                      const totalDiff = Math.max(1, activePost.target_score - activePost.initial_score);
                      const currentDiff = Math.max(0, activePost.current_score - activePost.initial_score);
                      const progressPct = Math.min(100, Math.round((currentDiff / totalDiff) * 100));

                      return (
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-2">
                            <span className="text-slate-400 uppercase font-semibold">
                              Progression de l'Objectif de Boost
                            </span>
                            <span className="text-emerald-400 font-bold">{progressPct}% ACCOMPLI</span>
                          </div>
                          <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Thumbnails (1 to 5 photos) & Simulation */}
                  <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-slate-400 uppercase font-mono flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          {activePost.start_proof_urls && activePost.start_proof_urls.length > 1
                            ? `Preuves Début Soumises (${activePost.start_proof_urls.length} photos)`
                            : 'Capture de départ soumise'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(activePost.start_proof_urls && activePost.start_proof_urls.length > 0
                          ? activePost.start_proof_urls
                          : [activePost.start_proof_url]
                        ).map((url, idx) => (
                          <div
                            key={idx}
                            onClick={() =>
                              onOpenProofLightbox({
                                imageUrl: url,
                                gallery: proofsOf(activePost),
                                title: `Photo ${idx + 1} - Preuve Début - ${activePost.client_name}`,
                                score: activePost.initial_score,
                                clientTag: activePost.client_name,
                                operatorName: activePost.employee_name,
                              })
                            }
                            className="w-16 h-11 rounded-lg border border-slate-700 overflow-hidden cursor-pointer hover:border-emerald-400 transition-colors relative group shrink-0 shadow-sm"
                            title={`Cliquer pour agrandir la photo ${idx + 1}`}
                          >
                            <img
                              src={url}
                              alt={`Preuve ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                            <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono text-emerald-400 px-1 font-bold">
                              #{idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {activePost.status === 'active' && (
                      <div className="flex items-center gap-2 text-xs font-mono bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Simuler extraction :</span>
                        <button
                          onClick={() => {
                            db.updateCurrentScore(activePost.id, activePost.current_score + 1500000);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded font-bold transition-colors"
                        >
                          + 1.5M pts
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* No active post yet, prompt to pick from grid */
                <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-8 text-center space-y-3">
                  <Gamepad2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h4 className="text-base font-bold text-white font-tactical">
                    Aucune Session Active sur ce Compte
                  </h4>
                  <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
                    Consultez la grille des comptes clients disponibles et cliquez sur "Choisir ce Compte Client" pour démarrer votre session.
                  </p>
                  <button
                    onClick={() => setHomeViewMode('grid')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors"
                  >
                    Voir la Grille des Postes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Historical shifts executed by this employee */}
          <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-4 sm:p-5 mt-6">
            <h4 className="text-xs uppercase font-mono font-bold text-slate-400 tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Historique Récent de Vos Missions
            </h4>

            <div className="space-y-3">
              {allPosts
                .filter(p => p.employee_id === currentUser.id && p.status === 'completed')
                .slice(0, 5)
                .map(post => {
                  const gained = Math.max(0, (post.final_score ?? post.current_score) - post.initial_score);
                  return (
                    <div
                      key={post.id}
                      className="bg-[#121a24] p-3.5 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{post.client_name}</span>
                          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                            {post.account_tag}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Date: {post.date} · Durée: {post.start_time} - {post.end_time}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase block">Score Boosté</span>
                          <span className="text-emerald-400 font-bold">+{formatScoreM(gained)} pts</span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase block">Statut Mission</span>
                          <span className="text-emerald-400 font-bold font-mono">Validé</span>
                        </div>

                        <button
                          onClick={() =>
                            onOpenProofLightbox({
                              imageUrl: post.end_proof_url || post.start_proof_url,
                              gallery: proofsOf(post),
                              title: `Preuve - ${post.client_name}`,
                              score: post.final_score,
                              clientTag: post.client_name,
                              operatorName: post.employee_name,
                            })
                          }
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                          title="Voir la capture"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: SALARY ADVANCE REQUESTS ("DMD d'avance") */}
      {activeSubTab === 'advances' && (
        <div>
        <AdvPayTabs value={advTab} onChange={setAdvTab} payLabel="Ma paie" />
        {advTab === 'payroll' ? <MyPayroll /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submit New Advance */}
          <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-4 sm:p-6 shadow-xl lg:col-span-1">
            <h3 className="font-tactical font-bold text-white text-base flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-amber-400" />
              Nouvelle Demande d'Avance
            </h3>
            <p className="text-xs text-slate-400 font-mono mb-4">
              Demande d'avance sur salaire ("DMD d'avance") déductible du payroll.
            </p>

            {advanceSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500 text-emerald-300 rounded-lg text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Demande envoyée avec succès à l'administration !</span>
              </div>
            )}

            <AdvanceRoomInfo room={advanceRoom} />
            <form onSubmit={handleSubmitAdvance} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-300 uppercase mb-1">
                  Montant Souhaité (en Ariary - Ar)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(Number(e.target.value))}
                    className="w-full bg-[#141e2a] border border-slate-700 rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    Ar
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">
                  Justification / Motif Détaillé
                </label>
                <textarea
                  rows={3}
                  value={advanceReason}
                  onChange={e => setAdvanceReason(e.target.value)}
                  placeholder="ex: Réparation urgente carte réseau, facture fibre optique..."
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Soumettre la DMD d'Avance</span>
              </button>
            </form>
          </div>

          {/* List of Advances & Status Tracking */}
          <div className="bg-[#0f1722] border border-slate-800 rounded-xl p-4 sm:p-6 shadow-xl lg:col-span-2">
            <h3 className="font-tactical font-bold text-white text-base flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              Suivi de Vos Demandes d'Avances
            </h3>
            <p className="text-xs text-slate-400 font-mono mb-4">
              Historique et validation par le superviseur Delta Force.
            </p>

            <AdvanceHistory advances={userAdvances} />
          </div>
        </div>
        )}
        </div>
      )}

      {/* SUB-VIEW 3: DIRECT MESSAGING WITH ADMIN (CHAT ILLIMITÉ) */}
      {activeSubTab === 'chat' && (
        <div className="bg-[#0f1722] border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col h-[580px]">
          {/* Chat Header with clear Unlimited guarantee */}
          <div className="bg-[#131d2a] px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-tactical font-bold text-white uppercase tracking-wider">
                    Canal Direct · Superviseur Admin
                  </h4>
                  <span className="text-[9px] font-mono uppercase bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-bold">
                    Chat Illimité &amp; Local
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Messages illimités, persistance locale 100% autonome, zéro frais d'API externe.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-700/60 font-semibold">
                ● En ligne (Superviseur actif)
              </span>
            </div>
          </div>

          {/* Quick Reply Chips for Fast Booster Reporting */}
          <div className="px-4 py-2 bg-[#0c131c] border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px] font-mono shrink-0">
            <span className="text-slate-500 text-[10px] uppercase shrink-0">Réponses Rapides :</span>
            {[
              "Objectif de score client atteint !",
              "Début de session de boost sur le compte",
              "Capture d'écran téléversée dans le système",
              "Question sur la validation du shift"
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setChatMessage(chip)}
                className="px-2.5 py-1 bg-[#15202c] hover:bg-slate-700 text-slate-300 hover:text-white rounded-md whitespace-nowrap border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0a0f16]">
            {messages.map(msg => {
              const isMe = msg.sender_id === currentUser.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-slate-400">
                    <span className="font-semibold text-slate-300">{msg.sender_name}</span>
                    <span>·</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-md p-3 rounded-xl text-xs font-mono leading-relaxed ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-tr-none shadow-md shadow-emerald-950/40'
                        : 'bg-[#16212e] text-slate-200 border border-slate-700/80 rounded-tl-none shadow-md'
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Send Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-[#131d2a] border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              placeholder="Écrire un message au superviseur (sans limite de messages)..."
              className="flex-1 bg-[#0b1017] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow"
            >
              <span>Envoyer</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* OCCUPIED POST NOTICE BANNER */}
      {occupiedPostNotice && (
        <div className="fixed top-5 right-5 z-50 bg-amber-950/95 border border-amber-500 text-amber-200 px-4 py-3 rounded-xl shadow-2xl text-xs font-mono flex items-center gap-2.5 animate-in slide-in-from-top">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{occupiedPostNotice}</span>
          <button onClick={() => setOccupiedPostNotice(null)} className="ml-2 text-amber-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* MULTI-POST RESOLUTION DIALOG */}
      {showMultiPostDialog && activePost && multiPostTargetContract && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMultiPostDialog(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in overscroll-contain"
        >
          <div className="bg-[#0f1722] border border-amber-500/50 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-tactical font-black text-white text-base">
                  Poste Actif Déjà en Cours
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Vous avez déjà le poste <strong>{activePost.client_name}</strong> en cours.
                </p>
              </div>
            </div>

            <div className="bg-[#141e2a] p-3.5 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
              <p className="text-slate-300">
                La charte Delta Force autorise <strong>1 seul poste actif par opérateur</strong> pour éviter les fraudes et pénalités.
              </p>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800 text-slate-400">
                <span>Poste en cours : <strong className="text-emerald-400">{activePost.client_name}</strong></span>
                <span>Nouveau poste : <strong className="text-cyan-400">{multiPostTargetContract.client_name}</strong></span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMultiPostDialog(false);
                  setHomeViewMode('details');
                  if (onNavigateTab) onNavigateTab('active-post');
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Continuer Mon Poste Actuel ({activePost.client_name})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  // Release the old post cleanly and start the new one
                  db.forceReleasePost(activePost.id, 'Changement de poste par le booster');
                  setShowMultiPostDialog(false);
                  openStartModalForContract(multiPostTargetContract);
                }}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-tactical font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <span>Libérer l'Ancien &amp; Commencer {multiPostTargetContract.client_name}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMultiPostDialog(false)}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-xl transition-colors cursor-pointer text-center"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* START FORM MODAL */}
      {showStartModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowStartModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain"
        >
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-xl rounded-xl shadow-2xl overflow-hidden my-auto max-h-[calc(100dvh-57px-2.5rem-env(safe-area-inset-bottom))] flex flex-col animate-in fade-in zoom-in-95">
            <div className="bg-[#141f2d] px-4 sm:px-6 py-3.5 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-mono font-bold border border-slate-700 cursor-pointer transition-colors shadow-sm"
                  title="Retour (ESC)"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>RETOUR</span>
                </button>
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-tactical font-bold text-white text-sm sm:text-base">
                    POSTE #{String(selectedContract?.post_number || 1).padStart(2, '0')} · {clientName}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStartModal(false)}
                className="px-2.5 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-tactical font-bold uppercase transition-colors cursor-pointer flex items-center gap-1"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">FERMER</span>
              </button>
            </div>

            {startFormError && (
              <div className="m-4 sm:m-6 mb-0 p-3 bg-red-950/80 border border-red-500 text-red-200 rounded-lg text-xs font-mono flex items-center gap-2 shrink-0">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{startFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitStartForm} className="p-4 sm:p-6 space-y-4 text-xs font-mono overflow-y-auto flex-1">
              {/* READ-ONLY ACCOUNT INFORMATION (Managed exclusively by Admin) */}
              <div className="bg-[#141e2a] border border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-300 font-bold uppercase text-[11px]">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Informations Compte Client</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#0b1118] p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Nom Client</span>
                    <span className="text-white font-bold truncate block">{clientName}</span>
                  </div>
                  <div className="bg-[#0b1118] p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Objectif</span>
                    <span className="text-emerald-400 font-bold block">{formatScoreM(objective)}</span>
                  </div>
                  <div className="bg-[#0b1118] p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Début</span>
                    <span className="text-slate-200 font-bold block">{formatScoreM(accountStart)}</span>
                  </div>
                  <div className="bg-[#0b1118] p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Actuel</span>
                    <span className="text-cyan-300 font-bold block">{formatScoreM(accountCurrent)}</span>
                  </div>
                  {selectedContract?.description && (
                    <div className="col-span-2 bg-[#0b1118] p-2 rounded-lg border border-amber-700/40">
                      <span className="text-[10px] text-amber-400 uppercase block">Description</span>
                      <span className="text-slate-200 block whitespace-pre-line break-words text-xs leading-snug">
                        {selectedContract.description}
                      </span>
                    </div>
                  )}
                </div>

              </div>

              {/* PREUVES DU COMPTE CLIENT (ajoutées par l'admin, lecture seule) */}
              {selectedContract?.account_proof_urls && selectedContract.account_proof_urls.length > 0 && (
                <div className="bg-[#121c27] border border-amber-700/50 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-300 uppercase font-bold flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />
                      <span>Preuves du compte client</span>
                    </span>
                    <span className="text-[11px] font-mono text-amber-300 font-bold bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded">
                      {selectedContract.account_proof_urls.length} / 5
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {selectedContract.account_proof_urls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          onOpenProofLightbox({
                            imageUrl: url,
                            gallery: selectedContract.account_proof_urls,
                            title: `Preuve du compte - ${selectedContract.client_name}`,
                            clientTag: selectedContract.client_name,
                          })
                        }
                        className="relative aspect-square rounded-lg overflow-hidden border border-amber-700/50 cursor-pointer"
                        title="Agrandir la photo"
                      >
                        <img src={url} alt={`Preuve du compte ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 1 TO 4 PROOF PHOTOS UPLOAD (Camera or Screenshot Gallery) */}
              <div className="bg-[#121c27] border border-slate-700 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 uppercase font-bold flex items-center gap-1.5 text-emerald-400">
                    <Camera className="w-4 h-4" />
                    <span>1. Capture d'écran (1 à 5 photos) *</span>
                  </label>
                  <span className="text-[11px] font-mono text-amber-300 font-bold bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded">
                    {startProofPhotos.length} / 5 photos
                  </span>
                </div>

                {/* Upload action buttons */}
                {startProofPhotos.length < 5 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Camera Button */}
                    <label className="cursor-pointer bg-[#142333] hover:bg-[#1b2f44] border border-cyan-500/50 hover:border-cyan-400 p-2.5 rounded-xl flex items-center justify-center gap-2 text-cyan-300 text-xs font-mono font-bold transition-all shadow cursor-pointer">
                      <Camera className="w-4 h-4 text-cyan-400" />
                      <span>Prendre Photo (Caméra)</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleMultipleStartPhotos}
                        className="hidden"
                      />
                    </label>

                    {/* Gallery / Screenshot Button */}
                    <label className="cursor-pointer bg-[#16271c] hover:bg-[#1f3727] border border-emerald-500/50 hover:border-emerald-400 p-2.5 rounded-xl flex items-center justify-center gap-2 text-emerald-300 text-xs font-mono font-bold transition-all shadow cursor-pointer">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span>Importer Capture / Fichier</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultipleStartPhotos}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {uploadBar}

                {/* Photos Thumbnails Grid (1 to 4) */}
                {startProofPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    {startProofPhotos.map((photoUrl, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-video rounded-lg overflow-hidden border-2 border-emerald-500 bg-black/60 group shadow-md"
                      >
                        <img
                          src={photoUrl}
                          alt={`Preuve ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform"
                          onClick={() =>
                            onOpenProofLightbox({
                              imageUrl: photoUrl,
                              gallery: startProofPhotos,
                              title: `Photo ${idx + 1}/${startProofPhotos.length} - ${clientName}`,
                              score: initialScore,
                              clientTag: `${clientName} #${accountTag}`,
                              operatorName: currentUser.name,
                            })
                          }
                        />
                        {/* Overlay Zoom */}
                        <div
                          onClick={() =>
                            onOpenProofLightbox({
                              imageUrl: photoUrl,
                              gallery: startProofPhotos,
                              title: `Photo ${idx + 1}/${startProofPhotos.length} - ${clientName}`,
                              score: initialScore,
                              clientTag: `${clientName} #${accountTag}`,
                              operatorName: currentUser.name,
                            })
                          }
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-mono cursor-pointer transition-opacity"
                        >
                          <Eye className="w-4 h-4 text-emerald-400" />
                        </div>
                        {/* Photo Number Badge */}
                        <div className="absolute top-1 left-1 bg-black/80 text-emerald-400 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border border-emerald-500/40">
                          #{idx + 1}/4
                        </div>
                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveStartPhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow transition-colors cursor-pointer"
                          title="Supprimer cette photo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Placeholder slot if less than 5 */}
                    {startProofPhotos.length < 5 && (
                      <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 rounded-lg aspect-video flex flex-col items-center justify-center text-center p-2 cursor-pointer bg-[#0c1420] hover:bg-[#101b2a] transition-all">
                        <Upload className="w-4 h-4 text-slate-400 mb-1" />
                        <span className="text-[10px] text-slate-400 font-mono">+ Photo #{startProofPhotos.length + 1}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleMultipleStartPhotos}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-700 rounded-xl p-5 text-center text-slate-400 space-y-1 bg-[#0b121b]">
                    <Camera className="w-6 h-6 text-slate-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-300">Aucune photo ajoutée pour l'instant</p>
                    <p className="text-[11px] text-slate-500">
                      Vous devez importer ou prendre entre 1 et 5 photos de preuve avant d'envoyer pour validation.
                    </p>
                  </div>
                )}
              </div>

              {/* VÉRIFICATION DU SCORE SUR LA CAPTURE */}
              <div className="bg-[#121c27] border border-slate-700 rounded-xl p-3.5 space-y-3">
                <label className="block text-emerald-400 uppercase font-bold">
                  2. Le score sur la capture est-il le même que l'Actuel ({formatScoreM(accountCurrent)}) ? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScoreMatches(true);
                      setInitialScore(accountCurrent);
                    }}
                    className={`px-2 py-2.5 rounded-xl border font-bold text-center leading-tight transition-colors ${
                      scoreMatches
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-[#141e2a] border-slate-600 text-slate-300'
                    }`}
                  >
                    <Check className="w-4 h-4 inline mr-1 -mt-0.5" />Oui, identique
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoreMatches(false)}
                    className={`px-2 py-2.5 rounded-xl border font-bold text-center leading-tight transition-colors ${
                      !scoreMatches
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-[#141e2a] border-slate-600 text-slate-300'
                    }`}
                  >
                    <X className="w-4 h-4 inline mr-1 -mt-0.5" />Non, différent
                  </button>
                </div>

                {!scoreMatches && (
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 uppercase font-semibold flex items-center justify-between gap-2">
                      <span>Score réel sur la capture</span>
                      <span className="text-cyan-400 font-bold text-sm">{formatScoreM(initialScore)}</span>
                    </label>
                    <ScoreInput
                      value={initialScore}
                      onChange={n => setInitialScore(Math.max(0, n))}
                      className="w-full bg-[#141e2a] border border-slate-600 focus:border-emerald-500 rounded-lg p-2.5 text-white font-bold text-sm"
                      placeholder="ex: 30739000 (= 30.739M)"
                    />
                  </div>
                )}
              </div>

              <div className="text-xs font-mono">
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={startNotes}
                    onChange={e => setStartNotes(e.target.value)}
                    placeholder="Un mot pour l'admin (facultatif)"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-slate-400 font-mono">
                  {startProofPhotos.length > 0 ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                      <Check className="w-3.5 h-3.5" />
                      <span>{startProofPhotos.length} photo(s) prête(s) pour validation Admin</span>
                    </span>
                  ) : (
                    <span className="text-amber-400">Au moins 1 photo requise</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStartModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={startProofPhotos.length === 0}
                    className={`px-5 py-2.5 rounded-xl font-tactical font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg ${
                      startProofPhotos.length > 0
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95 shadow-emerald-950/60'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Envoyer en Attente de Validation Admin</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PENDING START MODAL */}
      {isEditingPendingStart && activePost && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditingPendingStart(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overscroll-contain"
        >
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-md rounded-xl p-6 space-y-4 text-xs font-mono">
            <h3 className="font-tactical font-bold text-white text-base">
              Modifier Poste en Attente
            </h3>
            <p className="text-slate-400">
              Autorisé uniquement avant la validation de l'administrateur.
            </p>

            <div>
              <label className="block text-slate-300 uppercase mb-1">Score de départ (sur la capture)</label>
              <ScoreInput
                value={editScore}
                onChange={setEditScore}
                className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 uppercase mb-1">Remplacer Capture (Optionnel)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleFileChange(e, 'edit')}
                className="text-slate-400"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingPendingStart(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleSaveEditPending}
                className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded"
              >
                Enregistrer Modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* END FORM MODAL WITH ANTI-CHEAT SCORE CONSISTENCY CONSTRAINT */}
      {showEndModal && activePost && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEndModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain"
        >
          <div className="bg-[#0f1722] border border-slate-700 w-full max-w-xl rounded-xl shadow-2xl overflow-hidden my-auto max-h-[calc(100dvh-57px-2.5rem-env(safe-area-inset-bottom))] flex flex-col animate-in fade-in zoom-in-95">
            <div className="bg-[#141f2d] px-4 sm:px-6 py-3.5 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-mono font-bold border border-slate-700 cursor-pointer transition-colors shadow-sm"
                  title="Retour (ESC)"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>RETOUR</span>
                </button>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-tactical font-bold text-white text-sm sm:text-base">
                    Clôture de Session (End Form) - {activePost.client_name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="px-2.5 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-tactical font-bold uppercase transition-colors cursor-pointer flex items-center gap-1"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">FERMER</span>
              </button>
            </div>

            {/* Score Consistency Error Display with exact required text */}
            {endFormError && (
              <div className="m-4 sm:m-6 mb-0 p-3 sm:p-3.5 bg-red-950/80 border border-red-500 text-red-200 rounded-lg text-xs font-mono flex items-start gap-2.5 shrink-0">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold uppercase tracking-wider text-red-300">
                    Violation de Cohérence Détectée
                  </div>
                  <div className="mt-0.5 font-bold">{endFormError}</div>
                  <div className="text-[11px] text-red-400/90 mt-1">
                    Score initial vérifié: {formatScoreM(activePost.initial_score)} pts. Cette anomalie est journalisée dans la console de sécurité ("Petit Malin").
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitEndForm} className="p-4 sm:p-6 space-y-4 text-xs font-mono overflow-y-auto flex-1">
              <div className="bg-[#121922] p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Score de départ</span>
                  <span className="text-white font-bold text-xs sm:text-sm">
                    {formatScoreM(activePost.initial_score)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase block">Objectif</span>
                  <span className="text-cyan-400 font-bold text-xs sm:text-sm">
                    {formatScoreM(Math.max(0, activePost.target_score - activePost.initial_score))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">
                  Score Final Atteint (Obligatoire)
                </label>
                <ScoreInput
                  value={finalScoreInput}
                  onChange={setFinalScoreInput}
                  required
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-emerald-400 font-bold text-base focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Le score final doit être impérativement supérieur ou égal au score de départ ({formatScoreM(activePost.initial_score)} pts).
                </span>
              </div>

              {/* Real File upload for End Proof Photo (Mandatory) */}
              <div>
                <label className="block text-slate-300 uppercase mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                    <Camera className="w-4 h-4" />
                    <span>Capture d'écran / Photo de Fin (Obligatoire)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Preuve pour calcul & validation Admin</span>
                </label>

                {!endProofPreview ? (
                  <label className="cursor-pointer border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center bg-[#101723] hover:bg-[#141f2f] transition-all group shadow-inner">
                    <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-white font-tactical font-bold text-sm">
                      Importer votre Capture de Fin de Session
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 max-w-xs">
                      Capture d'écran de l'écran de fin de match affichant le score final
                    </span>
                    <span className="mt-2.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Parcourir mes Fichiers / Galerie</span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange(e, 'end')}
                      className="hidden"
                      required
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <div
                      onClick={() =>
                        onOpenProofLightbox({
                          imageUrl: endProofPreview,
                          title: `Preuve Capture Fin - ${activePost.client_name}`,
                          score: finalScoreInput,
                          clientTag: activePost.client_name,
                          operatorName: currentUser.name,
                        })
                      }
                      className="mt-3 relative aspect-video rounded-xl overflow-hidden border-2 border-cyan-500 cursor-pointer group shadow-lg"
                      title="Cliquer pour afficher la capture en plein écran"
                    >
                      <img
                        src={endProofPreview}
                        alt="Preuve Fin"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white text-xs font-mono transition-opacity">
                        <Eye className="w-4 h-4 text-cyan-400" />
                        <span>Inspecter en Plein Écran</span>
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/80 border border-cyan-500/50 px-2 py-0.5 rounded text-[10px] text-cyan-400 font-mono font-bold">
                        <Check className="w-4 h-4 inline mr-1 -mt-0.5" />Capture de fin prête (Cliquer pour zoomer)
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="cursor-pointer text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Changer / Remplacer la photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleFileChange(e, 'end')}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setEndProofPreview(null)}
                        className="text-xs font-mono text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                            <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                )}
                {uploadBar}
              </div>

              <div>
                <label className="block text-slate-300 uppercase mb-1">Notes de session (Optionnel)</label>
                <textarea
                  rows={2}
                  value={endNotes}
                  onChange={e => setEndNotes(e.target.value)}
                  placeholder="ex: Mandelbricks extraits avec succès, loot sécurisé..."
                  className="w-full bg-[#141e2a] border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
                >
                  Soumettre pour Validation (pending_end)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
