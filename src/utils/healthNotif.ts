// Notifications de la cloche pour l'admin (M11.7 / M9.4) : règles PURES (aucun écran, aucun serveur).
// Limite écrite : la cloche ne se met à jour que lorsque l'application est ouverte ; pas de message envoyé téléphone fermé (il faudrait le serveur).
import type { HealthAlert } from './health/types';

export const MAX_URGENT_NOTIFS = 5;
export const SUMMARY_HOUR = 8; // heure de Madagascar
export interface HealthNotif { id: string; title: string; sub: string; view: string; at: string; tone: 'urgent' | 'info'; thread?: string; storage?: import('./storageNav').StorageIntent }

/** Heure de Madagascar (UTC+3), entière, pour un instant donné. */
export const madaHour = (ms: number): number => new Date(ms + 3 * 3600_000).getUTCHours();
const isSunday = (day: string): boolean => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;

/** Les urgentes (5 au plus, une ligne chacune) puis le résumé du jour : seulement après 08:00, jamais le dimanche, une seule fois par jour (une fois vu, il ne revient pas). */
export function planHealthNotifs(alerts: HealthAlert[], today: string, nowMs: number, seen: string[]): HealthNotif[] {
  const at = new Date(nowMs).toISOString();
  const out: HealthNotif[] = alerts.filter(a => a.severity === 'urgent').slice(0, MAX_URGENT_NOTIFS)
    .map(a => ({ id: `health-${a.id}`, title: a.title_fr, sub: 'Santé du site : urgent', view: a.go?.storage ? 'storage' : 'health', ...(a.go?.storage ? { storage: a.go.storage } : {}), at, tone: 'urgent' as const })); // une alerte du Stockage ouvre directement le bon produit
  const id = `summary-${today}`;
  if (madaHour(nowMs) >= SUMMARY_HOUR && !isSunday(today) && !seen.includes(id)) {
    const n = alerts.filter(a => a.severity !== 'info').length;
    out.push({ id, title: 'Résumé du jour', sub: n ? `${n} point(s) à voir : ouvrir l'assistant` : "Tout est calme : ouvrir l'assistant", view: 'chat', thread: 'assistant', at, tone: 'info' });
  }
  return out;
}
