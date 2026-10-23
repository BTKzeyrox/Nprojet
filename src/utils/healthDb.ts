// « Santé du site » : relie le moteur d'alertes (src/utils/health/) aux données du site. ADMIN SEULEMENT (liste vide pour un employé : il n'a ni argent ni stock).
// Calcul dans le navigateur, aucun appel serveur ici. Les listes « sauvegardes » et « erreurs » sont chargées UNE fois par la page Santé (elles existent déjà côté serveur).
import { db } from '../db/store';
import { todayMada } from './stats';
import { runHealth, applyAcks, type HealthContext } from './health/registry';
import { ALL_RULES } from './health/all';
import { healthThresholds, type HealthAck, type HealthAlert } from './health/types';
import { loadAcks, saveAcks, addAck, removeAck } from './health/acks';
import { menuBadges } from './health/menu';
import { loadWatchPrefs, saveWatchPrefs } from './health/watchPrefs';

export interface HealthView { alerts: HealthAlert[]; hidden: HealthAlert[]; errors: { rule: string; message: string }[]; acks: HealthAck[]; computedAt: number }

let external: { backups: HealthContext['backups']; errors: HealthContext['errors'] } = { backups: null, errors: null };
let cache: HealthView | null = null, dirty = true, acksCache: { id: string; list: HealthAck[] } | null = null;
const listeners = new Set<() => void>();
db.subscribe(() => { dirty = true; }); // abonné dès le chargement du fichier : passe avant les écrans qui se réaffichent
const emit = () => { dirty = true; listeners.forEach(l => { try { l(); } catch { /* un écran qui plante ne bloque pas les autres */ } }); };
export const subscribeHealth = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const adminId = (): string => db.getCurrentUser()?.id || 'admin';
const acks = (): HealthAck[] => { const id = adminId(); if (!acksCache || acksCache.id !== id) acksCache = { id, list: loadAcks(id) }; return acksCache.list; };

/** Alertes visibles (hors celles ignorées / vérifiées) + celles cachées. Recalculé quand les données changent ou après 60 s. */
export function getHealth(): HealthView {
  const me = db.getCurrentUser();
  if (me?.role !== 'admin') return { alerts: [], hidden: [], errors: [], acks: [], computedAt: Date.now() };
  if (cache && !dirty && Date.now() - cache.computedAt < 60_000) return cache;
  const st: any = db.getSettings(), thresholds = healthThresholds({ watch: { ...(st.company?.watch || {}), ...loadWatchPrefs(me.id) } }); // réglages Surveillance de cet appareil par-dessus ceux de l'entreprise
  const ctx: HealthContext = {
    today: todayMada(), now: Date.now(), users: db.getUsers(), posts: db.getPosts(), contracts: db.getContracts(), clients: db.getClients(),
    cash: db.getCash(), products: db.getProducts(), moves: db.getStockMoves(), advances: db.getAdvanceRequests(), purchases: db.getPurchases(), invoices: db.getInvoices(), settings: st, thresholds,
    backups: external.backups, errors: external.errors,
  };
  const run = runHealth(ctx, ALL_RULES);
  const split = applyAcks(run.alerts, acks(), ctx.today, thresholds.ignore_days);
  cache = { alerts: split.visible, hidden: split.hidden, errors: run.errors, acks: acks(), computedAt: Date.now() };
  dirty = false;
  return cache;
}

/** Pastilles du menu : { entrée du menu: { count, urgent } } et total (à voir + urgent). */
export function getMenuBadges(): { byItem: Record<string, { count: number; urgent: boolean }>; total: number; urgent: number } {
  const h = getHealth();
  const total = h.alerts.filter(a => a.severity !== 'info').length, urgent = h.alerts.filter(a => a.severity === 'urgent').length;
  return { byItem: menuBadges(h.alerts), total, urgent };
}

/** La page Santé charge les listes du serveur (sauvegardes, erreurs) puis recalcule. Une seule fois par ouverture. */
export async function loadHealthExternal(): Promise<void> {
  if (db.getCurrentUser()?.role !== 'admin') return;
  try {
    const [b, e] = await Promise.all([db.listBackups(), db.fetchErrors('open')]);
    external = { backups: b.ok ? b.rows : null, errors: Array.isArray(e) ? e : null };
  } catch { /* hors ligne : on garde les anciennes listes ; sans liste, les règles « système » se taisent */ }
  emit();
}

export function ackAlert(alert: HealthAlert, status: 'ignored' | 'checked', reason: string, until?: string | null): void {
  acksCache = { id: adminId(), list: addAck(acks(), alert, status, reason, new Date().toISOString(), until) };
  saveAcks(adminId(), acksCache.list);
  emit();
}
export function unack(id: string): void {
  acksCache = { id: adminId(), list: removeAck(acks(), id) };
  saveAcks(adminId(), acksCache.list);
  emit();
}

/** Réglages « Surveillance » de cet appareil : enregistre, puis recalcule les alertes. */
export function setWatchPrefs(p: Partial<import('./health/types').HealthThresholds>): void { saveWatchPrefs(adminId(), p); emit(); }
export const getWatchPrefs = () => loadWatchPrefs(adminId());
