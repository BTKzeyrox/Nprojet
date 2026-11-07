// Texte d'une ligne de travail (feuille du jour, M26.5) pour les listes de validation et l'historique : présence, heures, quantité et refusées, sans score ni preuve.
// Utilisé par : AdminDashboard.tsx (Validations), TeamValidations.tsx, HistoryPage.tsx. Pure : pas de store.
import { PRESENCE_LABEL } from './workTypes';

const num = (n: unknown): string => (Number.isFinite(Number(n)) ? String(Math.round(Number(n) * 100) / 100).replace('.', ',') : '0');

/** « Présent · 8 h », « 200 faites · 10 refusées (5 %) ». Vide si la ligne ne porte rien (ne devrait pas arriver). */
export function workLineDetail(post: any): string {
  if (!post || typeof post !== 'object') return '';
  const out: string[] = [];
  const pr = typeof post.presence === 'string' ? (PRESENCE_LABEL as any)[post.presence] : undefined;
  if (pr) out.push(pr.fr);
  if (post.hours !== undefined && post.hours !== null) out.push(`${num(post.hours)} h`);
  if (post.quantity !== undefined && post.quantity !== null) {
    const q = Number(post.quantity) || 0, r = Number(post.rejected) || 0;
    out.push(`${num(q)} faite${q > 1 ? 's' : ''}`);
    if (r > 0) out.push(`${num(r)} refusée${r > 1 ? 's' : ''}${q > 0 ? ` (${Math.round((r / q) * 100)} %)` : ''}`);
  }
  return out.join(' · ');
}

/** « Saisi par Chef Dupont » quand une autre personne a rempli la feuille. */
export const workLineBy = (post: any): string => (post && typeof post.entered_by_name === 'string' && post.entered_by_name ? `Saisi par ${post.entered_by_name}` : '');
