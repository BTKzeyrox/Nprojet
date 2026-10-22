// « Ignorer » / « Vérifié » : marques posées par l'admin sur une alerte. Pour l'instant gardées DANS CE NAVIGATEUR (une clé par admin) :
// aucune table, aucun serveur. Limite écrite : elles ne se retrouvent pas sur un autre appareil (le partage = champ dans `df_settings`, accord de BTK + sauvegarde avant).
import { cleanAck } from './registry';
import type { HealthAck, HealthAckStatus, HealthAlert } from './types';

const KEY = (adminId: string) => `df_health_acks_${String(adminId || 'admin').slice(0, 60)}`;
const MAX_ACKS = 300; // jamais plus : on garde les plus récentes

/** Lecture sûre d'un texte JSON : une liste de marques valides, sinon liste vide (jamais d'exception). */
export function parseAcks(raw: string | null | undefined): HealthAck[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: HealthAck[] = [];
    for (const x of v) { const c = cleanAck(x); if (c) out.push(c); }
    return out;
  } catch { return []; }
}

/** Ajoute (ou remplace) la marque d'une alerte ; garde au plus MAX_ACKS marques, les plus récentes. */
export function addAck(list: HealthAck[], alert: HealthAlert, status: HealthAckStatus, reason: string, nowIso: string, until?: string | null): HealthAck[] {
  const a = cleanAck({ id: alert.id, status, reason: String(reason || '').slice(0, 200), at: nowIso, until: until ?? null, severity_at: alert.severity, value_at: alert.value });
  if (!a) return list;
  return [...list.filter(x => x.id !== alert.id), a].sort((p, q) => p.at.localeCompare(q.at)).slice(-MAX_ACKS);
}
export const removeAck = (list: HealthAck[], id: string): HealthAck[] => list.filter(x => x.id !== id);

export function loadAcks(adminId: string): HealthAck[] {
  try { return parseAcks(localStorage.getItem(KEY(adminId))); } catch { return []; }
}
export function saveAcks(adminId: string, list: HealthAck[]): boolean {
  try { localStorage.setItem(KEY(adminId), JSON.stringify(list.slice(-MAX_ACKS))); return true; } catch { return false; }
}
