// Prépare la page vers laquelle mène le glissement « Retour » AVANT de la faire apparaître (pas de vide ni de chargement visible).
// Les pages sont chargées à la demande (lazy dans App.tsx) : on demande le même fichier en avance. Sans danger : un échec est ignoré et la page se charge alors normalement.
// Règles de choix pures (loaderKey) contrôlées par scripts/check-page-swipe.ts.
const COMMON: Record<string, string> = {
  feed: 'feed', notifications: 'notifications', chat: 'chat', settings: 'settings', calendar: 'calendar', worksheet: 'worksheet', hr: 'hr',
  clients: 'clients', accounting: 'accounting', treasury: 'treasury', purchasing: 'purchasing', health: 'health', charts: 'charts', errors: 'errors',
  employees: 'employees', advances: 'employees', sheets: 'sheets', direction: 'direction', performance: 'performance', storage: 'storage',
  invoices: 'invoices', stats: 'stats', history: 'history',
};
/** Quel fichier de page prépare-t-on pour cette page et ce rôle ? null = rien à préparer (page déjà là, ou inconnue). */
export function loaderKey(view: string, role: string): string | null {
  if (role === 'employee') {
    if (view === 'sheets') return 'mySheets';
    if (view === 'my-performance') return 'myPerformance';
    if (view === 'feed' || view === 'notifications' || view === 'chat' || view === 'settings' || view === 'calendar' || view === 'hr' || view === 'worksheet') return COMMON[view];
    return 'employeeDashboard';
  }
  if (role === 'team_lead') return ['feed', 'notifications', 'chat', 'settings', 'worksheet'].includes(view) ? COMMON[view] : null;
  if (role === 'accountant') return COMMON[view] || 'invoices';
  return COMMON[view] || 'adminDashboard';
}
const LOADERS: Record<string, () => Promise<unknown>> = {
  feed: () => import('../views/FeedView'), notifications: () => import('../views/NotificationsPage'), chat: () => import('../components/ChatView'),
  settings: () => import('../views/admin/SettingsView'), calendar: () => import('../views/CalendarView'), worksheet: () => import('../views/WorksheetView'),
  hr: () => import('../views/hr/HrPage'), clients: () => import('../views/admin/ClientsPage'), accounting: () => import('../views/admin/AccountingPage'),
  treasury: () => import('../views/admin/TreasuryPage'), purchasing: () => import('../views/admin/PurchasingPage'), health: () => import('../views/admin/HealthPage'),
  charts: () => import('../views/admin/GraphsPage'), errors: () => import('../views/admin/ErrorsLog'), employees: () => import('../views/admin/EmployeesManagement'),
  sheets: () => import('../components/MySheets'), direction: () => import('../views/admin/DirectionPage'), performance: () => import('../views/admin/PerformancePage'),
  storage: () => import('../views/admin/StoragePage'), invoices: () => import('../views/admin/InvoicesView'), stats: () => import('../views/admin/StatsPage'),
  history: () => import('../views/admin/HistoryPage'), mySheets: () => import('../components/MySheets'), myPerformance: () => import('../components/MyPerformance'),
  adminDashboard: () => import('../views/admin/AdminDashboard'), employeeDashboard: () => import('../views/employee/EmployeeDashboard'),
};
export const LOADER_KEYS = Object.keys(LOADERS);
/** Prépare la page. Ne rate jamais (une erreur est ignorée) et rend la main quand le fichier est là. */
export function preloadView(view: string, role: string): Promise<void> {
  const k = loaderKey(view, role);
  const f = k ? LOADERS[k] : undefined;
  if (!f) return Promise.resolve();
  try { return f().then(() => undefined, () => undefined); } catch { return Promise.resolve(); }
}
