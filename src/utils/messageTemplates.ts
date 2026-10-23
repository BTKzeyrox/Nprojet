// Modèles de messages FR/EN (M11.11). Pur : pas d'écran, pas de serveur, pas d'envoi. L'admin relit et modifie le texte avant de l'utiliser.
// Règle : un champ manquant = message REFUSÉ (jamais de « undefined » ni de « {champ} » dans le texte).
export type Field = 'client' | 'employee' | 'date' | 'amount' | 'reason';
export interface FieldInfo { label: { fr: string; en: string }; kind: 'text' | 'date' | 'amount' }
export const FIELDS: Record<Field, FieldInfo> = {
  client: { label: { fr: 'Client', en: 'Client' }, kind: 'text' },
  employee: { label: { fr: 'Employé', en: 'Employee' }, kind: 'text' },
  date: { label: { fr: 'Date', en: 'Date' }, kind: 'date' },
  amount: { label: { fr: 'Montant (Ar)', en: 'Amount (Ar)' }, kind: 'amount' },
  reason: { label: { fr: 'Motif', en: 'Reason' }, kind: 'text' },
};
export interface Template { id: string; name: { fr: string; en: string }; fields: Field[]; fr: string; en: string }
export const TEMPLATES: Template[] = [
  { id: 'payment_reminder', name: { fr: 'Relance de paiement (client)', en: 'Payment reminder (client)' }, fields: ['client', 'amount', 'date'],
    fr: 'Bonjour {client}, sauf erreur de notre part, il reste {amount} à régler pour nos prestations. Pourriez-vous nous confirmer le paiement avant le {date} ? Merci beaucoup.',
    en: 'Hello {client}, unless we are mistaken, {amount} is still due for our services. Could you confirm payment before {date}? Thank you very much.' },
  { id: 'client_thanks', name: { fr: 'Remerciement (client)', en: 'Thank you (client)' }, fields: ['client', 'reason'],
    fr: 'Bonjour {client}, merci pour votre confiance : {reason}. Nous restons à votre disposition.',
    en: 'Hello {client}, thank you for your trust: {reason}. We remain at your disposal.' },
  { id: 'mission_confirmation', name: { fr: 'Confirmation de mission (client)', en: 'Mission confirmation (client)' }, fields: ['client', 'date', 'reason'],
    fr: 'Bonjour {client}, nous confirmons notre intervention le {date}. Détail : {reason}. Dites-nous si quelque chose change.',
    en: 'Hello {client}, we confirm our visit on {date}. Details: {reason}. Let us know if anything changes.' },
  { id: 'advance_answer', name: { fr: 'Réponse à une demande d\'avance (employé)', en: 'Answer to an advance request (employee)' }, fields: ['employee', 'amount', 'reason'],
    fr: 'Bonjour {employee}, votre demande d\'avance de {amount} a été traitée : {reason}. Vous pouvez venir m\'en parler si besoin.',
    en: 'Hello {employee}, your advance request of {amount} has been handled: {reason}. Feel free to come and talk to me if needed.' },
  { id: 'team_notice', name: { fr: 'Annonce à l\'équipe', en: 'Team announcement' }, fields: ['date', 'reason'],
    fr: 'Bonjour à toute l\'équipe, information pour le {date} : {reason}. Merci de votre attention.',
    en: 'Hello team, information for {date}: {reason}. Thank you for your attention.' },
];
export const findTemplate = (id: string) => TEMPLATES.find(t => t.id === id);

const MAX_LEN = 200;
const dmy = (d: string) => d.split('-').reverse().join('/');
const fmtAr = (n: number, l: 'fr' | 'en') => `${Math.round(n).toLocaleString(l === 'en' ? 'en-US' : 'fr-FR').replace(/[  ]/g, ' ')} Ar`;

export type Compose = { ok: true; text: string } | { ok: false; missing: Field[]; invalid: Field[] };
/** Remplit un modèle. Champ vide ou invalide (date pas AAAA-MM-JJ, montant ≤ 0 ou pas un nombre) = refusé, on dit lesquels. */
export function compose(templateId: string, values: Partial<Record<Field, string>>, lang: 'fr' | 'en' = 'fr'): Compose {
  const tpl = findTemplate(templateId);
  if (!tpl) return { ok: false, missing: [], invalid: [] };
  const missing: Field[] = [], invalid: Field[] = [], out: Partial<Record<Field, string>> = {};
  for (const f of tpl.fields) {
    const raw = String(values[f] ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    if (!raw) { missing.push(f); continue; }
    const kind = FIELDS[f].kind;
    if (kind === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) { invalid.push(f); continue; } out[f] = dmy(raw); }
    else if (kind === 'amount') { const n = Number(raw.replace(/[   ]/g, '').replace(',', '.')); if (!Number.isFinite(n) || n <= 0 || n > 1e10) { invalid.push(f); continue; } out[f] = fmtAr(n, lang); }
    else out[f] = raw.slice(0, MAX_LEN);
  }
  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  // une seule passe : une valeur qui contient « {amount} » n'est jamais re-remplie
  const text = tpl[lang].replace(/\{(\w+)\}/g, (_m, k: string) => out[k as Field] ?? '');
  return { ok: true, text };
}
