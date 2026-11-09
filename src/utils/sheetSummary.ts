// Résumé d'une feuille du jour AVANT de l'enregistrer : combien de lignes, de présents, de retards, d'absents, d'heures, de quantité, et le total à payer. Règle pure, sans écran ni serveur.
// Utilisé par : WorksheetView.tsx. Le montant utilise la même règle que le serveur (postPayAr) : c'est le montant qui sera inscrit à la validation.
// Pour modifier : seul le responsable valide tout de suite (donc seul lui voit un montant) ; la saisie d'un Chef d'équipe attend le responsable : `totalAr` vaut alors null. Un employé en salaire fixe n'a pas de montant par ligne (payé par période) : compté dans `fixed`.
import { payModeFor, postPayAr } from './postPay';

export type SummaryRow = { presence?: string; hours?: string; quantity?: string; rejected?: string };
export interface SheetSummary { lines: number; present: number; late: number; half: number; absent: number; hours: number; quantity: number; rejected: number; fixed: number; totalAr: number | null; }

/** Nombre tapé à la main (« 12 500 », « 12,5 »). Texte, négatif ou illisible : 0 (le serveur refusera la ligne avec la raison). */
const num = (v: unknown): number => {
  const t = String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const filled = (r?: SummaryRow): boolean => !!r && !!(r.presence || String(r.hours ?? '').trim() || String(r.quantity ?? '').trim());

export function summarizeSheet(rows: Record<string, SummaryRow>, people: { id: string }[], workType: string, me: { role?: string } | null, settings: any): SheetSummary {
  const s: SheetSummary = { lines: 0, present: 0, late: 0, half: 0, absent: 0, hours: 0, quantity: 0, rejected: 0, fixed: 0, totalAr: me && me.role === 'admin' ? 0 : null };
  for (const u of people) {
    const r = rows[u.id];
    if (!filled(r)) continue;
    s.lines++;
    if (r!.presence === 'present') s.present++; else if (r!.presence === 'late') s.late++; else if (r!.presence === 'half') s.half++; else if (r!.presence === 'absent') s.absent++;
    const hours = num(r!.hours), quantity = num(r!.quantity), rejected = num(r!.rejected);
    s.hours += hours; s.quantity += quantity; s.rejected += Math.min(rejected, quantity);
    if (s.totalAr !== null) {
      if (payModeFor(u, settings) === 'fixed') s.fixed++;
      s.totalAr += postPayAr({ work_type: workType, presence: r!.presence, ...(hours > 0 ? { hours } : {}), ...(quantity > 0 ? { quantity } : {}), ...(rejected > 0 ? { rejected } : {}) }, u, settings);
    }
  }
  s.hours = Math.round(s.hours * 100) / 100; s.quantity = Math.round(s.quantity * 100) / 100; s.rejected = Math.round(s.rejected * 100) / 100;
  return s;
}
