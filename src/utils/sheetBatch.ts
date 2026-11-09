// Valider toute une feuille d'un coup (M27.5) : regroupe les lignes de la Feuille du jour SAISIES PAR UN CHEF D'ÉQUIPE et encore « en attente », par chef et par jour. Règles pures, sans écran ni serveur.
// Utilisé par : AdminDashboard.tsx (bloc « Feuilles à valider » de la page Validations). Chaque ligne est validée par la route habituelle (`post-decide`) : aucune règle de paie nouvelle.
// Pour modifier : personne ne valide sa propre saisie (weSelfEntered) ; une feuille d'une seule ligne reste une carte normale (pas de bloc) ; le refus reste ligne par ligne (un motif par ligne).
import { isWorkLine } from './postPay';
import { weSelfEntered } from './workEntry';

export interface PendingSheet { key: string; date: string; byId: string; byName: string; ids: string[]; count: number; present: number; estimatedAr: number }
export const SHEET_BATCH_MIN = 2;

export function groupPendingSheets(posts: any[], me: any, estimate?: (p: any) => number): PendingSheet[] {
  const map = new Map<string, PendingSheet>();
  for (const p of Array.isArray(posts) ? posts : []) {
    if (!p || !isWorkLine(p) || p.status !== 'pending_end') continue;
    if (typeof p.entered_by !== 'string' || !p.entered_by || weSelfEntered(me, p)) continue;
    const date = String(p.date || '');
    const key = `${p.entered_by}|${date}`;
    let g = map.get(key);
    if (!g) { g = { key, date, byId: p.entered_by, byName: String(p.entered_by_name || ''), ids: [], count: 0, present: 0, estimatedAr: 0 }; map.set(key, g); }
    g.ids.push(String(p.id)); g.count++;
    if (p.presence === 'present' || p.presence === 'late' || p.presence === 'half') g.present++;
    if (estimate) { const v = Number(estimate(p)); if (Number.isFinite(v) && v > 0) g.estimatedAr += Math.round(v); }
  }
  return [...map.values()].filter(g => g.count >= SHEET_BATCH_MIN).sort((a, b) => b.date.localeCompare(a.date) || a.byName.localeCompare(b.byName));
}

export interface BatchResult { done: number; failed: { id: string; error: string }[] }
/** Valide une à une (jamais en parallèle : une même personne peut avoir plusieurs lignes, la paie s'ajoute à son total). Continue après une erreur ; renvoie ce qui a marché et ce qui a été refusé. */
export async function decideSheet(ids: string[], decide: (id: string) => Promise<{ ok: boolean; error?: string }>): Promise<BatchResult> {
  const out: BatchResult = { done: 0, failed: [] };
  for (const id of ids) {
    try {
      const r = await decide(id);
      if (r && r.ok) out.done++; else out.failed.push({ id, error: String((r && r.error) || 'erreur') });
    } catch (e) { out.failed.push({ id, error: String((e as any)?.message || e || 'erreur') }); }
  }
  return out;
}
