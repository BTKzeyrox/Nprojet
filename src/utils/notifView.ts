// Affichage de la cloche : heure de Madagascar + filtres (règles pures, testées dans scripts/check-notif-view.ts)
import type { Notif } from './notifications';

export type NotifFilter = 'all' | 'unread' | 'messages' | 'missions' | 'alerts';
export const NOTIF_FILTERS: { id: NotifFilter; label: string }[] = [
  { id: 'all', label: 'Toutes' }, { id: 'unread', label: 'Non lues' }, { id: 'messages', label: 'Messages' },
  { id: 'missions', label: 'Missions' }, { id: 'alerts', label: 'Alertes' },
];

const madaDate = (iso: string): string => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString();

/** « 14:32 » aujourd'hui, « Hier 14:32 », « 28/10 14:32 » ; date seule (sans heure connue) : « 28/10 » */
export function notifWhen(at: string, now: number = Date.now()): string {
  if (!at || isNaN(new Date(at).getTime())) return '';
  const hasTime = at.includes('T');
  const d = madaDate(at), n = madaDate(new Date(now).toISOString());
  const day = d.slice(0, 10), today = n.slice(0, 10);
  const yest = new Date(new Date(today + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const hm = d.slice(11, 16);
  const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  if (day === today) return hasTime ? hm : "Aujourd'hui";
  if (day === yest) return hasTime ? `Hier ${hm}` : 'Hier';
  return hasTime ? `${dm} ${hm}` : dm;
}

export const notifCategory = (n: Pick<Notif, 'id' | 'tone'>): 'messages' | 'missions' | 'alerts' => {
  if (n.id.startsWith('msg-')) return 'messages';
  if (n.tone === 'urgent' || n.id.startsWith('sec-') || n.id.startsWith('health')) return 'alerts';
  return 'missions';
};

export function filterNotifs<T extends Pick<Notif, 'id' | 'tone'>>(list: T[], f: NotifFilter, seen: string[]): T[] {
  if (f === 'all') return list;
  if (f === 'unread') return list.filter(n => !seen.includes(n.id));
  return list.filter(n => notifCategory(n) === f);
}
