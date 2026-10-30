// Notifications externes (push), partie 2a : les événements de la cloche, envoyés aussi hors de l'appli. Règles pures, sans réseau.
// Le serveur (bloc NOTIFY de df-api) contient la même logique ; `check:push-events` compare les deux.
// Confidentialité : un push s'affiche sur l'écran verrouillé. On n'y écrit jamais un montant, un motif de refus de paie ni le texte d'un message.
import type { PushText } from './pushRules';

export type NotifyKind = 'val_start' | 'val_end' | 'advance_new' | 'advance_ok' | 'advance_no' | 'signup' | 'reset' | 'profile' | 'security' | 'message';
/** Les catégories qu'on peut couper (appareil par appareil). */
export const PUSH_CATS = ['missions', 'validations', 'advances', 'security', 'messages'] as const;
export type PushCat = typeof PUSH_CATS[number];

const ncut = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function notifyCat(kind: NotifyKind): PushCat {
  if (kind === 'advance_ok' || kind === 'advance_no') return 'advances';
  if (kind === 'security') return 'security';
  if (kind === 'message') return 'messages';
  return 'validations';
}

/** Texte d'un push (les deux langues). `m.name` = la personne concernée, `m.client` = le client de la mission. Jamais de montant ni de contenu de message. */
export function notifyText(kind: NotifyKind, m: { name?: string; client?: string; reason?: string; group?: boolean }): PushText {
  const name = ncut(m.name, 60) || '—';
  const client = ncut(m.client, 60);
  const who = client ? `${name} · ${client}` : name;
  switch (kind) {
    case 'val_start': return { fr: { title: 'Début à valider', body: who }, en: { title: 'Start to approve', body: who } };
    case 'val_end': return { fr: { title: 'Fin à valider', body: who }, en: { title: 'End to approve', body: who } };
    case 'advance_new': return { fr: { title: 'Avance à valider', body: name }, en: { title: 'Advance to approve', body: name } };
    case 'advance_ok': return { fr: { title: 'Avance acceptée', body: 'Ta demande d\'avance a été acceptée.' }, en: { title: 'Advance approved', body: 'Your advance request was approved.' } };
    case 'advance_no': { const r = ncut(m.reason, 100); return { fr: { title: 'Avance refusée', body: r ? `Motif : ${r}` : 'Ta demande d\'avance a été refusée.' }, en: { title: 'Advance refused', body: r ? `Reason: ${r}` : 'Your advance request was refused.' } }; }
    case 'signup': return { fr: { title: 'Inscription à valider', body: name }, en: { title: 'Sign-up to approve', body: name } };
    case 'reset': return { fr: { title: 'Mot de passe oublié (urgent)', body: name }, en: { title: 'Forgotten password (urgent)', body: name } };
    case 'profile': return { fr: { title: 'Changement de profil à valider', body: name }, en: { title: 'Profile change to approve', body: name } };
    case 'security': return { fr: { title: 'Alerte de sécurité', body: name }, en: { title: 'Security alert', body: name } };
    case 'message': { const t = m.group ? `${name} · groupe` : name; const te = m.group ? `${name} · group` : name; return { fr: { title: t, body: 'Nouveau message' }, en: { title: te, body: 'New message' } }; }
  }
}

/** Les catégories coupées sur un appareil : seulement des catégories connues, sans doublon. */
export function cleanPushOff(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = PUSH_CATS as readonly string[];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && known.includes(x)))];
}
