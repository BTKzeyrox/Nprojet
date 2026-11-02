// Messages prêts, DÉJÀ REMPLIS avec les vrais éléments du site : relancer un client en retard, répondre à une avance ou à une inscription, remercier un client, prévenir l'équipe.
// Pur : aucun envoi. L'admin relit et modifie le texte avant de le copier. Un champ qu'on ne peut pas deviner (le motif d'une réponse) reste vide : le message est alors refusé tant qu'il n'est pas rempli.
import type { Field } from './messageTemplates';
import type { Bi, SnapshotInput } from './siteSnapshot';
import { overdueRows } from './assistantShortcuts';
import { b, ar, dmy } from './assistant';

export const MSG_PREFIX = 'msg:'; // go.view = « msg:<id> » : ouvre l'éditeur de message déjà rempli
export const REMIND_DAYS = 7; // « merci de payer avant … » = aujourd'hui + 7 jours (modifiable)
export interface SuggestedMessage { id: string; label: Bi; template: string; values: Partial<Record<Field, string>> }

const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const name = (x: string | undefined) => String(x || '').trim();

/** `all` = tous (pour retrouver le message d'un bouton) ; sinon les plus utiles seulement (3 relances, 2 avances, 2 inscriptions) pour la ligne de boutons de l'éditeur. */
export function suggestedMessages(i: SnapshotInput, lang: 'fr' | 'en' = 'fr', all = false): SuggestedMessage[] {
  const out: SuggestedMessage[] = [], cap = (n: number) => (all ? Infinity : n);

  for (const { inv, info } of overdueRows(i).slice(0, cap(3))) {
    const who = name(inv.client?.name); if (!who) continue;
    out.push({ id: `overdue-${inv.id}`, label: b(`Relancer ${who}`, `Remind ${who}`), template: 'payment_reminder', values: { client: who, amount: String(Math.round(info.balance)), date: addDays(i.today, REMIND_DAYS) } });
  }
  for (const a of i.advances.filter(x => x.status === 'pending').slice(0, cap(2))) {
    const who = name(a.employee_name); if (!who || !Number.isFinite(a.amount_ar) || a.amount_ar <= 0) continue;
    out.push({ id: `advance-${a.id}`, label: b(`Répondre à l'avance de ${who}`, `Answer ${who}'s advance`), template: 'advance_answer', values: { employee: who, amount: String(Math.round(a.amount_ar)), reason: '' } });
  }
  for (const r of (i.pending?.signups || []).slice(0, cap(2))) {
    const who = name(r.name); if (!who) continue;
    out.push({ id: `signup-${r.id}`, label: b(`Répondre à l'inscription de ${who}`, `Answer ${who}'s sign-up`), template: 'signup_answer', values: { employee: who, reason: '' } });
  }
  const paid = i.cash.filter(c => c.kind === 'in' && c.category === 'Paiement client' && name(c.client_name) && Number.isFinite(c.amount_ar) && c.amount_ar > 0 && /^\d{4}-\d{2}-\d{2}$/.test(c.date || '') && c.date <= i.today)
    .sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id))[0];
  if (paid) {
    const who = name(paid.client_name);
    out.push({ id: `thanks-${paid.id}`, label: b(`Remercier ${who}`, `Thank ${who}`), template: 'client_thanks', values: { client: who, reason: lang === 'en' ? `your payment of ${ar(paid.amount_ar, 'en')} received on ${paid.date}` : `votre paiement de ${ar(paid.amount_ar, 'fr')} reçu le ${dmy(paid.date)}` } });
  }
  out.push({ id: 'team-notice', label: b('Prévenir l\'équipe', 'Tell the team'), template: 'team_notice', values: { date: i.today, reason: '' } });
  return out;
}
export const findSuggested = (i: SnapshotInput, id: string, lang: 'fr' | 'en' = 'fr') => suggestedMessages(i, lang, true).find(x => x.id === id);
