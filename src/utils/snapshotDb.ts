// Relie l'instantané et « Pourquoi ce chiffre ? » aux données du site. ADMIN SEULEMENT : sans admin, aucune donnée n'est lue.
import { db } from '../db/store';
import { todayMada } from './stats';
import { getHealth } from './healthDb';
import { buildSnapshot, explainFigure, type Explanation, type FigureId, type Snapshot, type SnapshotInput } from './siteSnapshot';

export function getSnapshotInput(): SnapshotInput | null {
  if (db.getCurrentUser()?.role !== 'admin') return null;
  return {
    today: todayMada(), settings: db.getSettings(), users: db.getUsers(), posts: db.getPosts(), contracts: db.getContracts(), clients: db.getClients(),
    cash: db.getCashNet(), products: db.getProducts(), moves: db.getStockMoves(), advances: db.getAdvanceRequests(), alerts: getHealth().alerts,
    nowMs: Date.now(), invoices: db.getInvoices(), spaces: db.getStockSpaces(),
    pending: { signups: db.getSignupRequests(), resets: db.getPasswordResets(), profiles: db.getProfileRequests().filter(x => x.status === 'pending'), access: db.getAccessRequests().filter(x => x.status === 'pending') },
  };
}
export const getSnapshot = (): Snapshot | null => { const i = getSnapshotInput(); return i ? buildSnapshot(i) : null; };
export const explain = (id: FigureId, range?: { start: string; end: string }): Explanation | null => { const i = getSnapshotInput(); return i ? explainFigure(id, i, range) : null; };
