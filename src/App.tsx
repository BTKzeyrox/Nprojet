import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { User, PostSession, AttendanceRow } from './types';
import { db } from './db/store';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ReportProblemModal } from './components/ReportProblemModal';
import { setCurrentPage } from './utils/errorReport';
import { hideSplash } from './utils/splash';
import { LoadingBar } from './components/LoadingBar';
import { PageSkeleton } from './components/PageSkeleton';
import { prefetchViews } from './utils/prefetch';
import { useLockBodyScroll } from './utils/useLockBodyScroll';
import { WelcomeAnimation } from './components/WelcomeAnimation';
import { LoginView } from './views/LoginView';
import { LightboxModal } from './components/LightboxModal';
import { ProfilePhotoGate } from './components/ProfilePhotoGate';
import { ConfirmHost, askConfirm } from './components/ConfirmModal';
import { ReasonHost } from './components/ReasonModal';
import { NAV_TARGET_EVENT, peekNavTarget, flashNav } from './utils/navTarget';
import { useApp } from './context/AppContext';
import { LogoutTransition } from './components/LogoutTransition';

let zhLoaded = false; // le module chinois a déjà été chargé (pour pouvoir revenir au français)

// Pages chargées seulement quand on les ouvre (le premier affichage télécharge moins de code)
const AdminDashboard = lazy(() => import('./views/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const EmployeesManagement = lazy(() => import('./views/admin/EmployeesManagement').then(m => ({ default: m.EmployeesManagement })));
const BoosterPage = lazy(() => import('./views/admin/BoosterPage').then(m => ({ default: m.BoosterPage })));
const HistoryPage = lazy(() => import('./views/admin/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ErrorsLog = lazy(() => import('./views/admin/ErrorsLog').then(m => ({ default: m.ErrorsLog })));
const SettingsView = lazy(() => import('./views/admin/SettingsView').then(m => ({ default: m.SettingsView })));
const EmployeeDashboard = lazy(() => import('./views/employee/EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })));
const CalendarView = lazy(() => import('./views/CalendarView').then(m => ({ default: m.CalendarView })));
const ChatView = lazy(() => import('./components/ChatView').then(m => ({ default: m.ChatView })));
const CVViewerModal = lazy(() => import('./components/CVViewerModal').then(m => ({ default: m.CVViewerModal })));
const DayDetailsModal = lazy(() => import('./components/DayDetailsModal').then(m => ({ default: m.DayDetailsModal })));

export default function App() {
  const { theme, t, startLogoutAnimation, lang } = useApp();
  const isLight = theme === 'light';

  const [isReady, setIsReady] = useState(false);

  // Langue chinoise : traduit tous les textes affichés (aucun mot français ne reste)
  // Le dictionnaire (34 Ko) n'est téléchargé que si la langue chinoise est choisie
  useEffect(() => {
    let off = false;
    if (lang === 'zh' || zhLoaded) {
      import('./utils/zhTranslate').then(m => { zhLoaded = true; if (!off) m.setChineseMode(lang === 'zh'); });
    } else {
      document.documentElement.lang = 'fr';
    }
    return () => { off = true; };
  }, [lang]);
  const [currentUser, setCurrentUser] = useState<User | null>(db.getCurrentUser());
  const [activeView, setActiveView] = useState<string>('grid');
  const [focusBoosterId, setFocusBoosterId] = useState<string | null>(null); // booster ouvert depuis la recherche
  const [showReport, setShowReport] = useState(false); // fenêtre « Signaler un problème »
  useEffect(() => { setCurrentPage(activeView); }, [activeView]); // la page est jointe aux rapports d'erreur
  useEffect(() => { if (isReady) hideSplash(); }, [isReady]); // retire l'écran de démarrage une fois les données prêtes
  useLockBodyScroll(activeView === 'chat'); // Messagerie : la page ne défile pas, seules les listes défilent
  // iPhone : le clavier déplace la vue ; on suit la vue visible pour garder la barre du haut et la messagerie en place
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      // On suit la vue visible seulement si le clavier est ouvert (la vue rétrécit de plus de 100 px).
      // Sans clavier (ou en zoom), la barre reste fixe en haut : l'effet élastique de l'iPhone ne la déplace plus.
      const keyboardOpen = window.innerHeight - vv.height > 100;
      if (vv.scale > 1.01 || !keyboardOpen) {
        root.style.removeProperty('--vvh');
        root.style.removeProperty('--vvt');
        return;
      }
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.style.setProperty('--vvt', `${vv.offsetTop}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vvt');
    };
  }, []);
  // Recherche ou notification : défiler jusqu'à l'élément exact et le faire clignoter
  useEffect(() => {
    const on = () => { const t = peekNavTarget(); if (t) flashNav(t); };
    window.addEventListener(NAV_TARGET_EVENT, on);
    return () => window.removeEventListener(NAV_TARGET_EVENT, on);
  }, []);
  const [isWelcomeAnimating, setIsWelcomeAnimating] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Menu de gauche : téléphone = tiroir ; tablette = bande d'icônes qui s'ouvre au clic ; grand écran = menu complet ou bande d'icônes (choix gardé)
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setWide(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const [sbCollapsed, setSbCollapsed] = useState(() => { try { return localStorage.getItem('df_sb_collapsed') === '1'; } catch { return false; } });
  const toggleSbCollapsed = () => setSbCollapsed(v => { const n = !v; try { localStorage.setItem('df_sb_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const sbPhone = wide < 768;
  const sbTablet = wide >= 768 && wide < 1024;
  const sbCompact = sbTablet ? !isMobileSidebarOpen : !sbPhone && sbCollapsed;
  const sbWidth = sbPhone ? '0px' : sbTablet || sbCollapsed ? '4.5rem' : '18rem';
  useEffect(() => {
    document.documentElement.style.setProperty('--sbw', sbWidth);
  }, [sbWidth]);
  // Admin : peut jouer son propre rôle de booster, puis revenir en admin
  const [boosterMode, setBoosterMode] = useState(false);

  // Modals state
  const [lightboxParams, setLightboxParams] = useState<{
    isOpen: boolean;
    imageUrl: string;
    gallery?: string[];
    title: string;
    subtitle?: string;
    score?: number;
    clientTag?: string;
    operatorName?: string;
    timestamp?: string;
  }>({
    isOpen: false,
    imageUrl: '',
    title: '',
  });

  const [cvModalUser, setCvModalUser] = useState<User | null>(null);

  const [dayDetailsState, setDayDetailsState] = useState<{
    isOpen: boolean;
    dateStr: string | null;
    shifts: PostSession[];
    attendance: AttendanceRow[];
  }>({
    isOpen: false,
    dateStr: null,
    shifts: [],
    attendance: [],
  });


  useEffect(() => {
    db.whenReady().then(() => {
      setCurrentUser(db.getCurrentUser());
      setIsReady(true);
    });
  }, []);

  // Sync state with db store
  // La base modifie l'utilisateur « sur place » : on compare avec la dernière version affichée (pas avec l'objet lui-même,
  // sinon un changement comme la photo de profil n'était jamais vu et la fenêtre restait affichée)
  // Préchargement des pages une fois connecté (au repos) : les clics s'ouvrent sans attente
  const roleForPrefetch = currentUser?.role;
  useEffect(() => {
    if (isReady && roleForPrefetch) prefetchViews(roleForPrefetch === 'admin' ? 'admin' : 'employee');
  }, [isReady, roleForPrefetch]);

  // Fondu à chaque changement de page (sans recréer la page : on alterne deux animations identiques)
  const viewSeq = useRef({ view: activeView, n: 0 });
  if (viewSeq.current.view !== activeView) viewSeq.current = { view: activeView, n: viewSeq.current.n + 1 };
  const fadeClass = viewSeq.current.n % 2 ? 'df-fade-a' : 'df-fade-b';

  const lastUserJson = useRef('');
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      const user = db.getCurrentUser();
      if (!user) { lastUserJson.current = ''; setCurrentUser(null); return; }
      const json = JSON.stringify(user);
      if (json !== lastUserJson.current) { lastUserJson.current = json; setCurrentUser({ ...user }); }
    });
    return unsubscribe;
  }, []);

  // Update view upon login with Welcome animation
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsWelcomeAnimating(true);
    // Accueil d'abord : admin = vue générale, booster = grille des postes. Menu fermé.
    setActiveView(user.role === 'admin' ? 'dashboard' : 'grid');
    setIsMobileSidebarOpen(false);
  };

  const handleLogout = () => {
    setBoosterMode(false);
    db.logout();
    setCurrentUser(null);
    setIsWelcomeAnimating(false);
    setActiveView('login');
  };

  // Déconnexion avec confirmation
  const requestLogout = () => {
    askConfirm({
      title: 'Se déconnecter ?',
      message: 'Vous devrez vous reconnecter avec votre pseudo et votre mot de passe.',
      confirmLabel: 'Se déconnecter',
      onConfirm: () => startLogoutAnimation(handleLogout),
    });
  };

  // Open Lightbox
  const handleOpenProofLightbox = (params: {
    imageUrl: string;
    gallery?: string[];
    title: string;
    subtitle?: string;
    score?: number;
    clientTag?: string;
    operatorName?: string;
    timestamp?: string;
  }) => {
    setLightboxParams({
      isOpen: true,
      imageUrl: params.imageUrl,
      gallery: params.gallery,
      title: params.title,
      subtitle: params.subtitle,
      score: params.score,
      clientTag: params.clientTag,
      operatorName: params.operatorName,
      timestamp: params.timestamp,
    });
  };

  // Open CV
  const handleOpenEmployeeCV = (employee: User) => {
    setCvModalUser(employee);
  };

  // Open Calendar Day Modal
  const handleSelectDay = (dateStr: string, shifts: PostSession[]) => {
    setDayDetailsState({
      isOpen: true,
      dateStr,
      shifts,
      attendance: [],
    });
    // Arrivées du jour : chargées après l'ouverture (la fenêtre ne attend pas)
    db.fetchAttendance(dateStr).then(rows => {
      setDayDetailsState(prev => (prev.dateStr === dateStr ? { ...prev, attendance: rows } : prev));
    });
  };

  // 1. NOT LOGGED IN -> SHOW ONLY LOGIN PAGE (SIMPLE, MODERN & INTUITIVE)
  if (!isReady) {
    return null; // l'écran de démarrage « BTK » (index.html) reste affiché
  }

  if (!currentUser) {
    return (
      <div className={`df-bg-login min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isLight
          ? 'text-slate-900 selection:bg-emerald-500/20 selection:text-emerald-800'
          : 'text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300'
      }`}>
        <LoginView
          onLoginSuccess={handleLoginSuccess}
        />
        <LightboxModal
          isOpen={lightboxParams.isOpen}
          onClose={() => setLightboxParams(prev => ({ ...prev, isOpen: false }))}
          imageUrl={lightboxParams.imageUrl}
          gallery={lightboxParams.gallery}
          title={lightboxParams.title}
          subtitle={lightboxParams.subtitle}
          score={lightboxParams.score}
          clientTag={lightboxParams.clientTag}
          operatorName={lightboxParams.operatorName}
          timestamp={lightboxParams.timestamp}
        />
        <LogoutTransition />
      </div>
    );
  }

  // 2. WELCOME ANIMATION (UPON LOGIN)
  if (isWelcomeAnimating) {
    return (
      <WelcomeAnimation
        user={currentUser}
        onComplete={() => setIsWelcomeAnimating(false)}
      />
    );
  }

  // Utilisateur « vu » par l'interface : en mode booster, l'admin est traité comme un booster
  const realIsAdmin = currentUser.role === 'admin';
  const viewUser: User = realIsAdmin && boosterMode ? { ...currentUser, role: 'employee' } : currentUser;
  const toggleBoosterMode = () => {
    setBoosterMode(v => !v);
    setActiveView(boosterMode ? 'dashboard' : 'grid');
  };

  // 3. LOGGED IN -> MODERN SIDEBAR LAYOUT
  return (
    <div className={`df-bg-app min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      isLight
        ? 'text-slate-900 selection:bg-emerald-500/20 selection:text-emerald-800'
        : 'text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300'
    }`}>
      
      {/* Modern Tactical Sidebar */}
      <Sidebar
        currentUser={viewUser}
        canSwitchMode={realIsAdmin}
        boosterMode={boosterMode}
        onToggleBoosterMode={toggleBoosterMode}
        activeView={activeView}
        onNavigate={view => {
          if (view === 'profile') {
            setCvModalUser(currentUser);
            return;
          }
          setFocusBoosterId(null);
          setActiveView(view);
        }}
        onLogout={requestLogout}
        onReportProblem={() => setShowReport(true)}
        onOpenEmployeeCV={handleOpenEmployeeCV}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        compact={sbCompact}
        onToggleCompact={() => (sbTablet ? setIsMobileSidebarOpen(v => !v) : toggleSbCollapsed())}
      />

      {/* Main Container with Sidebar offset */}
      <div style={{ paddingLeft: 'var(--sbw, 0px)' }} className="flex-1 flex flex-col min-h-screen">
        
        <LoadingBar />
        <ConnectionBanner />

        {/* Barre du haut fixe : recherche globale + cloche */}
        <TopBar
          currentUser={viewUser}
          onOpenMenu={() => setIsMobileSidebarOpen(true)}
          onNavigate={view => { setFocusBoosterId(null); setActiveView(view); }}
          onOpenBooster={id => { setFocusBoosterId(id); setActiveView('booster'); }}
        />

        {/* Dynamic Page Content Based on activeView */}
        <main style={activeView === 'chat' ? { top: 'calc(57px + var(--vvt, 0px))', height: 'calc(var(--vvh, 100dvh) - 57px)', left: 'var(--sbw, 0px)' } : undefined} className={activeView === 'chat' ? 'fixed left-0 right-0 z-20 min-h-0 overflow-hidden p-0 sm:p-2' : 'flex-1 p-2 sm:p-3 lg:p-4 max-w-none w-full mx-auto'}>
          <Suspense fallback={<PageSkeleton />}>
          <ErrorBoundary scope="page" key={activeView}>
          <div className={`h-full min-h-0 ${fadeClass}`}>
          {viewUser.role === 'admin' ? (
            /* ================= ADMIN SEPARATED PAGES ================= */
            <>
              {activeView === 'settings' ? (
                <SettingsView />
              ) : activeView === 'errors' ? (
                <ErrorsLog />
              ) : activeView === 'employees' ? (
                <EmployeesManagement onOpenEmployeeCV={handleOpenEmployeeCV} onNavigate={view => setActiveView(view)} />
              ) : activeView === 'advances' ? (
                <EmployeesManagement section="advances" onOpenEmployeeCV={handleOpenEmployeeCV} />
              ) : activeView === 'history' ? (
                <HistoryPage initialBoosterId={focusBoosterId || undefined} />
              ) : activeView === 'booster' && focusBoosterId ? (
                <BoosterPage
                  userId={focusBoosterId}
                  onBack={() => { setFocusBoosterId(null); setActiveView('dashboard'); }}
                  onGo={view => setActiveView(view)}
                  onOpenCV={handleOpenEmployeeCV}
                />
              ) : activeView === 'calendar' ? (
                <CalendarView
                  currentUser={viewUser}
                  onSelectDay={handleSelectDay}
                  initialUserId={focusBoosterId || undefined}
                />
              ) : activeView === 'chat' ? (
                <ChatView currentUser={viewUser} initialThreadId={focusBoosterId || undefined} />
              ) : (
                /* Default Admin Views: 'grid' (20 postes 2x10), 'active-post' (sessions), 'dashboard', 'security' */
                <AdminDashboard
                  currentUser={viewUser}
                  onOpenProofLightbox={handleOpenProofLightbox}
                  onOpenEmployeeCV={handleOpenEmployeeCV}
                  onNavigateToEmployees={() => setActiveView('employees')}
                  onNavigateToCalendar={() => setActiveView('calendar')}
                  activeSubTab={
                    activeView === 'grid'
                      ? 'dashboard'
                      : activeView === 'active-post' || activeView === 'sessions'
                      ? 'sessions'
                      : activeView === 'security'
                      ? 'security'
                      : activeView === 'validations'
                      ? 'validations'
                      : 'dashboard'
                  }
                  onNavigateTab={tab => setActiveView(tab)}
                />
              )}
            </>
          ) : (
            /* ================= EMPLOYEE SEPARATED PAGES ================= */
            <>
              {activeView === 'calendar' ? (
                <CalendarView
                  currentUser={viewUser}
                  onSelectDay={handleSelectDay}
                />
              ) : activeView === 'chat' ? (
                <ChatView currentUser={viewUser} />
              ) : (
                /* Employee Dashboard managing sub-pages: 'grid' (20 postes 2x10), 'active-post', 'advances', 'chat' */
                <EmployeeDashboard
                  currentUser={viewUser}
                  onOpenProofLightbox={handleOpenProofLightbox}
                  activeSubTab={
                    activeView === 'advances' || activeView === 'chat' || activeView === 'active-post'
                      ? (activeView as any)
                      : 'grid'
                  }
                  onNavigateTab={tab => setActiveView(tab)}
                />
              )}
            </>
          )}
          </div>
          </ErrorBoundary>
          </Suspense>
        </main>
      </div>

      {/* PHOTO DE PROFIL OBLIGATOIRE POUR LES EMPLOYÉS */}
      {currentUser && currentUser.role === 'employee' && !currentUser.avatar_url && (
        <ProfilePhotoGate
          user={currentUser}
          onDone={() => {
            const u = db.getCurrentUser();
            if (u) setCurrentUser({ ...u });
            setFocusBoosterId(null);
            setActiveView('grid'); // photo enregistrée : on arrive sur l'accueil du booster
          }}
          onLogout={handleLogout}
        />
      )}

      {/* CONFIRMATIONS */}
      <ConfirmHost />
      <ReasonHost />
      {showReport && <ReportProblemModal onClose={() => setShowReport(false)} />}

      {/* PROFILE MODAL */}
      {cvModalUser !== null && (
        <Suspense fallback={null}>
          <CVViewerModal
            isOpen={cvModalUser !== null}
            onClose={() => setCvModalUser(null)}
            user={cvModalUser}
          />
        </Suspense>
      )}

      {/* DETAILED DAY MODAL (Pop-up on Calendar Click) */}
      {dayDetailsState.isOpen && (
        <Suspense fallback={null}>
          <DayDetailsModal
            isOpen={dayDetailsState.isOpen}
            dateStr={dayDetailsState.dateStr}
            onClose={() => setDayDetailsState(prev => ({ ...prev, isOpen: false }))}
            onBack={() => setDayDetailsState(prev => ({ ...prev, isOpen: false }))}
            shifts={dayDetailsState.shifts}
            attendance={dayDetailsState.attendance}
            onOpenProofLightbox={handleOpenProofLightbox}
          />
        </Suspense>
      )}


      {/* LIGHTBOX MODAL - AT THE VERY BOTTOM SO IT OVERLAYS ALL OTHER MODALS WITHOUT CONFLICT */}
      <LightboxModal
        isOpen={lightboxParams.isOpen}
        onClose={() => setLightboxParams(prev => ({ ...prev, isOpen: false }))}
        imageUrl={lightboxParams.imageUrl}
          gallery={lightboxParams.gallery}
        title={lightboxParams.title}
        subtitle={lightboxParams.subtitle}
        score={lightboxParams.score}
        clientTag={lightboxParams.clientTag}
        operatorName={lightboxParams.operatorName}
        timestamp={lightboxParams.timestamp}
      />

      {/* SMOOTH ANIMATED LOGOUT TRANSITION */}
      <LogoutTransition />
    </div>
  );
}
