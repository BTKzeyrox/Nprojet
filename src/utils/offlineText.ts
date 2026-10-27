// Textes et décisions d'affichage du mode hors ligne (module 13, M13.6) : règles pures, sans écran, sans réseau. Contrôlé par `npm run check:offline-ui`.
// Un seul endroit décide « quel bandeau, quel texte », pour que le téléphone, le bureau, le clair, le sombre, le français et l'anglais disent la même chose.
import type { Bilingual } from './offline';

export type Lang = 'fr' | 'en';
export const pick = (b: Bilingual, lang: Lang): string => (lang === 'en' ? b.en : b.fr);

/** Nom lisible d'une collection de données (pour la liste « En attente »). */
const COLLECTIONS: Record<string, Bilingual> = {
  posts: { fr: 'Mission', en: 'Mission' },
  contracts: { fr: 'Contrat', en: 'Contract' },
  messages: { fr: 'Message', en: 'Message' },
  groups: { fr: 'Groupe', en: 'Group' },
  news: { fr: 'Actualité', en: 'News item' },
  products: { fr: 'Produit', en: 'Product' },
  stock: { fr: 'Mouvement de stock', en: 'Stock movement' },
  clients: { fr: 'Client', en: 'Client' },
  sheets: { fr: 'Tableau', en: 'Sheet' },
  users: { fr: 'Compte', en: 'Account' },
  settings: { fr: 'Réglage', en: 'Setting' },
  invoices: { fr: 'Facture ou devis', en: 'Invoice or quote' },
  quotes: { fr: 'Devis', en: 'Quote' },
  cash: { fr: 'Argent (paiement, dépense)', en: 'Money (payment, expense)' },
  advances: { fr: 'Avance', en: 'Advance' },
  suppliers: { fr: 'Fournisseur', en: 'Supplier' },
  purchases: { fr: 'Achat', en: 'Purchase' },
  securityLogs: { fr: 'Journal', en: 'Log' },
};
export const collectionLabel = (col: string, lang: Lang): string => (COLLECTIONS[col] ? pick(COLLECTIONS[col], lang) : col);

export function actionLabel(action: 'upsert' | 'delete', created: boolean, lang: Lang): string {
  if (action === 'delete') return lang === 'en' ? 'Deleted' : 'Supprimé';
  return created ? (lang === 'en' ? 'Created' : 'Créé') : (lang === 'en' ? 'Changed' : 'Modifié');
}

/** « 1 action en attente » / « 3 actions en attente ». */
export function pendingWord(n: number, lang: Lang): string {
  if (lang === 'en') return `${n} ${n === 1 ? 'action' : 'actions'} waiting`;
  return `${n} ${n === 1 ? 'action en attente' : 'actions en attente'}`;
}

export type BannerKind = 'offline' | 'sending' | 'review' | 'locked' | 'done' | null;
export interface BannerInput {
  down: boolean; // pas de réseau (ou serveur en panne)
  unsent: number; // éléments modifiés ici et pas encore reçus par le serveur
  review: number; // éléments « À revoir »
  kept: boolean; // la copie locale est ouverte : ce qui est en attente est aussi sur le disque de l'appareil
  needsCode: boolean; // admin sans code : rien n'est gardé sur le disque
  locked: boolean; // une copie existe mais elle est verrouillée (code pas encore entré)
  canOffline: boolean; // ce rôle a le droit de travailler hors ligne
  pendingSecs: number; // depuis combien de secondes il y a des éléments non envoyés alors que le réseau est là
  justDone: boolean; // tout vient d'être envoyé
}
export interface BannerModel { kind: BannerKind; text: string; hint?: string }

/** Choisit le bandeau à montrer : hors ligne > tout est envoyé > envoi en cours (seulement si ça dure) > à revoir > copie verrouillée. */
export function bannerModel(i: BannerInput, lang: Lang): BannerModel {
  const T = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (i.down) {
    const text = i.unsent > 0 ? T(`Hors ligne : ${pendingWord(i.unsent, 'fr')}`, `Offline: ${pendingWord(i.unsent, 'en')}`) : T('Hors ligne', 'Offline');
    let hint: string;
    if (!i.canOffline) hint = T('Ton rôle n\'enregistre pas hors ligne : attends le retour du réseau.', 'Your role cannot save offline: wait for the network to come back.');
    else if (i.unsent === 0) hint = T('Tu peux continuer à travailler : tout partira au retour du réseau.', 'You can keep working: everything is sent when the network returns.');
    else if (i.kept) hint = T('Gardées sur cet appareil : elles partent toutes seules au retour du réseau.', 'Kept on this device: they are sent automatically when the network returns.');
    else if (i.needsCode) hint = T('Pas encore gardées sur l\'appareil : crée ton code dans Réglages pour ne rien perdre. Ne ferme pas l\'appli.', 'Not yet kept on the device: create your code in Settings so nothing is lost. Do not close the app.');
    else if (i.locked) hint = T('Copie verrouillée : déverrouille-la pour garder ton travail sur l\'appareil. Ne ferme pas l\'appli.', 'Copy is locked: unlock it to keep your work on the device. Do not close the app.');
    else hint = T('Pas gardées sur l\'appareil : ne ferme pas l\'appli avant le retour du réseau.', 'Not kept on the device: do not close the app before the network returns.');
    return { kind: 'offline', text, hint };
  }
  if (i.justDone) return { kind: 'done', text: T('Tout est envoyé', 'Everything is sent') };
  if (i.unsent > 0 && i.pendingSecs >= 3) return { kind: 'sending', text: T(`Envoi en cours : ${pendingWord(i.unsent, 'fr')}`, `Sending: ${pendingWord(i.unsent, 'en')}`) };
  if (i.review > 0) return { kind: 'review', text: i.review === 1 ? T('1 élément à revoir', '1 item to review') : T(`${i.review} éléments à revoir`, `${i.review} items to review`) };
  if (i.locked) return { kind: 'locked', text: T('Copie hors ligne verrouillée', 'Offline copy locked'), hint: T('Entre ton code pour garder ton travail sur cet appareil.', 'Enter your code to keep your work on this device.') };
  return { kind: null, text: '' };
}

/** Phrase courte sur l'état de la copie, pour la carte Réglages. */
export function copyLine(st: { enabled: boolean; locked: boolean; needs_code: boolean; can_offline: boolean; problem: string | null; encrypted: boolean }, lang: Lang): string {
  const T = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (!st.can_offline) return T('Ton rôle travaille en ligne seulement.', 'Your role works online only.');
  if (st.problem === 'other_tab') return T('Un autre onglet garde la copie : ferme-le pour l\'utiliser ici.', 'Another tab holds the copy: close it to use it here.');
  if (st.problem === 'storage' || st.problem === 'storage_error') return T('L\'appareil est plein ou refuse d\'écrire : rien n\'est gardé tant que ce n\'est pas réglé.', 'The device is full or refuses to write: nothing is kept until this is fixed.');
  if (st.problem === 'queue_corrupt' || st.problem === 'corrupt') return T('La copie de cet appareil est abîmée : efface-la pour recommencer.', 'The copy on this device is damaged: erase it to start again.');
  if (st.problem === 'newer_version') return T('La copie vient d\'une version plus récente du site : mets le site à jour.', 'The copy comes from a newer version of the site: update the site.');
  if (st.problem === 'wrong_user') return T('La copie de cet appareil appartient à un autre compte.', 'The copy on this device belongs to another account.');
  if (st.locked) return T('Copie verrouillée : entre ton code.', 'Copy locked: enter your code.');
  if (st.needs_code) return T('Pas encore activé : crée un code pour garder ton travail hors ligne.', 'Not turned on yet: create a code to keep your work offline.');
  if (st.enabled) return st.encrypted ? T('Activé : copie chiffrée avec ton code.', 'On: copy encrypted with your code.') : T('Activé : copie sur cet appareil (sans code).', 'On: copy on this device (no code).');
  return T('Pas de copie sur cet appareil.', 'No copy on this device.');
}

/** Pourquoi une action est grisée hors ligne : texte court (le serveur doit la valider, le numéro ou l'argent ne se donne pas hors ligne…). */
export const ONLINE_ONLY_WHY: Record<string, Bilingual> = {
  payment: { fr: 'Encaisser un paiement demande le réseau : le serveur doit le valider pour ne jamais compter l\'argent deux fois.', en: 'Recording a payment needs the network: the server must confirm it so money is never counted twice.' },
  account: { fr: 'Créer un compte ou changer un mot de passe demande le réseau : le serveur doit le vérifier.', en: 'Creating an account or changing a password needs the network: the server must check it.' },
  invoice: { fr: 'Le numéro d\'une facture est donné par le serveur quand on l\'émet : en ligne seulement. Tu peux garder un brouillon sans numéro.', en: 'An invoice number is given by the server when it is issued: online only. You can keep a draft without a number.' },
  money: { fr: 'L\'argent (paie, avances, achats) ne se saisit qu\'en ligne : rien de financier n\'est gardé sur le téléphone.', en: 'Money (payroll, advances, purchases) is entered online only: nothing financial is kept on the phone.' },
  settings: { fr: 'Les réglages de l\'entreprise se changent en ligne seulement.', en: 'Company settings can only be changed online.' },
};
