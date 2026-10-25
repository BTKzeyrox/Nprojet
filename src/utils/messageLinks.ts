// Rappels par WhatsApp et SMS (module 16, M16.6) : règles pures. Aucun envoi automatique, aucun service payant, aucune clé :
// le site prépare le message, un lien ouvre WhatsApp (ou l'appli SMS du téléphone) avec le texte déjà écrit, la personne appuie sur « envoyer ».
// (Un envoi automatique demanderait un service payant : seulement si BTK le choisit, clé hors du dépôt.)

export const MESSAGE_MAX_CHARS = 1000; // au-delà, le lien deviendrait trop long pour certains téléphones

/** Numéro → chiffres au format international (sans +), ou null si ce n'est pas un numéro plausible.
 *  Madagascar : « 034 12 345 67 », « 0341234567 », « 34 12 345 67 », « +261 34 12 345 67 » → 261341234567. */
export function phoneForLink(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2); // 00261… = +261…
  if (d.startsWith('261')) { /* déjà international */ }
  else if (d.startsWith('0') && d.length === 10) d = '261' + d.slice(1); // 03x xx xxx xx
  else if (d.length === 9 && d.startsWith('3')) d = '261' + d; // 3x xx xxx xx sans le 0
  if (d.startsWith('261') && d.length !== 12) return null; // un numéro malgache complet fait 12 chiffres
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export interface MessageLink { url: string; truncated: boolean; hasPhone: boolean }
const cut = (text: unknown): { t: string; truncated: boolean } => {
  const s = String(text ?? '').replace(/\u0000/g, '').trim();
  return s.length > MESSAGE_MAX_CHARS ? { t: s.slice(0, MESSAGE_MAX_CHARS - 1) + '…', truncated: true } : { t: s, truncated: false };
};

/** Lien WhatsApp avec message prérempli. Sans numéro valide : WhatsApp laisse choisir le contact. */
export function whatsappLink(phone: unknown, text: unknown): MessageLink {
  const p = phoneForLink(phone); const c = cut(text);
  return { url: `https://wa.me/${p ?? ''}?text=${encodeURIComponent(c.t)}`, truncated: c.truncated, hasPhone: !!p };
}
/** Lien SMS (ouvre l'appli SMS du téléphone avec le texte prêt). */
export function smsLink(phone: unknown, text: unknown): MessageLink {
  const p = phoneForLink(phone); const c = cut(text);
  return { url: `sms:${p ? '+' + p : ''}?body=${encodeURIComponent(c.t)}`, truncated: c.truncated, hasPhone: !!p };
}
