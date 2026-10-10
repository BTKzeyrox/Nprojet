import { db } from '../db/store';
import { User } from '../types';
import { formatCurrencyAr } from './formatUtils';
import { getQueue, getFreePosts } from './presence';
import type { ValFilter } from './navIntent';

export interface Notif {
  id: string;
  title: string;
  sub: string;
  view: string; // page qui s'ouvre au clic
  at: string; // date ISO (pour le tri)
  tone: 'urgent' | 'info' | 'ok' | 'bad';
  filter?: ValFilter; // filtre de la page Validations à activer au clic
  nav?: string; // élément exact à atteindre (data-nav) : défilement + clignotement
  thread?: string; // messagerie : discussion à ouvrir ('all' = groupe)
}

// « 2026-10-06 12:00:00 » : on met un T pour que Safari (iPhone) le lise aussi
const ts = (s?: string) => (s ? new Date(s.replace(' ', 'T')).getTime() || 0 : 0);

// Admin : tout ce qui attend une décision. Booster : réponses de l'admin (refus, avances).
export const buildNotifications = (user: User): Notif[] => {
  const out: Notif[] = [];
  if (user.role === 'admin') {
    db.getPosts().forEach(p => {
      if (p.status === 'pending_start' || p.status === 'pending_end')
        out.push({ id: `post-${p.id}-${p.status}`, title: `${p.employee_name} · ${p.client_name}`, sub: p.status === 'pending_start' ? 'Début à valider' : 'Fin à valider', view: 'validations', filter: p.status === 'pending_start' ? 'starts' : 'ends', nav: `val-post-${p.id}`, at: p.updated_at || p.date, tone: 'info' });
    });
    db.getAdvanceRequests().filter(a => a.status === 'pending').forEach(a =>
      out.push({ id: `adv-${a.id}`, title: `${a.employee_name} · avance ${formatCurrencyAr(a.amount_ar)}`, sub: 'Avance à valider', view: 'validations', filter: 'advances', nav: `val-adv-${a.id}`, at: a.request_date, tone: 'info' }));
    db.getSignupRequests().forEach(r =>
      out.push({ id: `sig-${r.id}`, title: r.name, sub: 'Inscription à valider', view: 'validations', filter: 'signups', nav: `val-sig-${r.id}`, at: r.created_at, tone: 'info' }));
    db.getPasswordResets().forEach(r =>
      out.push({ id: `rst-${r.id}`, title: r.name, sub: 'Mot de passe oublié (urgent)', view: 'validations', filter: 'resets', nav: `val-rst-${r.id}`, at: r.created_at, tone: 'urgent' }));
    db.getProfileRequests().filter(r => r.status === 'pending').forEach(r =>
      out.push({ id: `prf-${r.id}`, title: r.old.name, sub: 'Changement de profil à valider', view: 'validations', filter: 'profiles', nav: `val-prf-${r.id}`, at: r.created_at, tone: 'info' }));
    // Boosters sans poste : 1re puis 2e alerte (minutes réglables dans Réglages)
    const cfg = db.getSettings();
    const a1 = Math.max(1, Math.round(cfg.alert_idle_1_min || 15));
    const a2 = Math.max(a1 + 1, Math.round(cfg.alert_idle_2_min || 30));
    getQueue(db.getUsers(), db.getPosts(), db.getPresence()).forEach(w => {
      const lvl = w.minutes >= a2 ? a2 : w.minutes >= a1 ? a1 : 0;
      if (lvl) out.push({ id: `wait-${w.user.id}-${lvl}-${w.waitingSince}`, title: w.user.name, sub: `Sans poste depuis ${lvl} min`, view: 'active-post', at: w.waitingSince as string, tone: lvl === a2 ? 'urgent' : 'info' });
    });
    db.getSecurityLogs().filter(l => !l.resolved).forEach(l =>
      out.push({ id: `sec-${l.id}`, title: l.employee_name, sub: 'Alerte de sécurité', view: 'security', nav: `sec-${l.id}`, at: l.timestamp, tone: 'urgent' }));
  } else {
    // Premier de la file et un poste vient de se libérer
    const q = db.getMyQueue();
    const free = q && q.position === 1 ? getFreePosts(db.getContracts(), db.getPosts()) : [];
    if (q && free.length > 0)
      out.push({ id: `free-${q.waiting_since}-${free[0].id}`, title: 'Un poste est libre', sub: `${free[0].client_name} (poste ${free[0].post_number}) : à toi en premier`, view: 'grid', nav: `poste-${free[0].post_number}`, at: new Date().toISOString(), tone: 'ok' });
    db.getPosts().filter(p => p.employee_id === user.id && p.status === 'rejected').forEach(p =>
      out.push({ id: `rej-${p.id}-${p.updated_at}`, title: `${p.client_name} refusé`, sub: p.rejection_reason ? `Motif : ${p.rejection_reason}` : 'Soumission refusée', view: 'active-post', at: p.updated_at || p.date, tone: 'bad' }));
    db.getAdvanceRequests().filter(a => a.employee_id === user.id && a.status !== 'pending').forEach(a =>
      out.push({ id: `advr-${a.id}-${a.status}`, title: `Avance ${formatCurrencyAr(a.amount_ar)} ${a.status === 'approved' ? 'acceptée' : 'refusée'}`, sub: a.admin_notes ? `Motif : ${a.admin_notes}` : '', view: 'advances', nav: `adv-${a.id}`, at: a.request_date, tone: a.status === 'approved' ? 'ok' : 'bad' }));
  }
  // Messagerie : messages reçus (privés ou groupe) des 3 derniers jours, pas encore lus
  const seen = getSeen(user);
  const since = Date.now() - 3 * 24 * 3600 * 1000;
  db.getMessages()
    .filter(m => m.sender_id !== user.id && ts(m.timestamp) > since && ((m.recipient_id || 'all') === 'all' || m.recipient_id === user.id))
    .filter(m => !seen.includes(`msg-${m.id}`))
    .slice(-20)
    .forEach(m => {
      const group = (m.recipient_id || 'all') === 'all';
      out.push({ id: `msg-${m.id}`, title: group ? `${m.sender_name} · groupe` : m.sender_name, sub: m.message ? m.message.slice(0, 80) : 'Pièce jointe', view: 'chat', thread: group ? 'all' : m.sender_id, at: m.timestamp, tone: 'info' });
    });
  return out.sort((a, b) => ts(b.at) - ts(a.at));
};

// Ouvrir la messagerie = messages lus
export const SEEN_EVENT = 'df-seen';
export const markChatSeen = (user: User) => {
  const ids = db.getMessages().map(m => `msg-${m.id}`);
  if (ids.length === 0) return;
  const seen = getSeen(user);
  if (ids.every(id => seen.includes(id))) return;
  markSeen(user, ids);
  window.dispatchEvent(new Event(SEEN_EVENT));
};

// « Vu » : gardé par utilisateur dans ce navigateur (le booster voit un compteur seulement pour du nouveau)
const key = (u: User) => `df_notif_seen_${u.id}`;
export const getSeen = (u: User): string[] => {
  try { return JSON.parse(localStorage.getItem(key(u)) || '[]'); } catch { return []; }
};
export const markSeen = (u: User, ids: string[]) => {
  try { localStorage.setItem(key(u), JSON.stringify(Array.from(new Set([...getSeen(u), ...ids])).slice(-400))); } catch { /* stockage indisponible */ }
};
export const unreadCount = (u: User, list: Notif[]): number =>
  u.role === 'admin' ? list.length : list.filter(n => !getSeen(u).includes(n.id)).length;
