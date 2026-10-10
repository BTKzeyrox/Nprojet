// Précharge les pages en arrière-plan (quand le navigateur est au repos) : l'ouverture devient instantanée
type Loader = () => Promise<unknown>;

export const ADMIN_LOADERS: Loader[] = [
  () => import('../views/admin/AdminDashboard'),
  () => import('../views/admin/EmployeesManagement'),
  () => import('../views/admin/HistoryPage'),
  () => import('../views/admin/BoosterPage'),
  () => import('../views/CalendarView'),
  () => import('../components/ChatView'),
  () => import('../views/admin/SettingsView'),
  () => import('../components/CVViewerModal'),
  () => import('../components/DayDetailsModal'),
];
export const EMPLOYEE_LOADERS: Loader[] = [
  () => import('../views/employee/EmployeeDashboard'),
  () => import('../views/CalendarView'),
  () => import('../components/ChatView'),
  () => import('../components/CVViewerModal'),
  () => import('../components/DayDetailsModal'),
];

export const runPrefetch = (loaders: Loader[]) => {
  const conn: any = (navigator as any).connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return; // connexion économe ou très lente : on ne précharge pas
  loaders.forEach((load, i) => setTimeout(() => { load().catch(() => {}); }, i * 150)); // un par un, sans bloquer
};

export const prefetchViews = (role: 'admin' | 'employee') => {
  const go = () => runPrefetch(role === 'admin' ? ADMIN_LOADERS : EMPLOYEE_LOADERS);
  if (typeof (window as any).requestIdleCallback === 'function') (window as any).requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
};
