// Mémoire de l'assistant (BTK, 2026-11-08) : « mémorise : … » enregistre la phrase telle quelle, « qu'est-ce que tu as retenu ? » la relit,
// « oublie la 2 » la supprime (avec confirmation). ADMIN seulement, notes stockées sur le serveur (ligne `mem:<compte>` de df_reminders).
// Règles pures et testables sans réseau : l'accès au serveur est injecté (MemApi).
import { b, type Reply } from './assistant';
import type { Bi } from './assistant';

export interface MemNote { id: string; text: string; at: number }
export const MEM_MAX_NOTES = 100;
export const MEM_MAX_CHARS = 500;
export const MEM_FORGET_PREFIX = '__mem_forget:';
export const MEM_EDIT_PREFIX = '__mem_edit:';
export const AI_NOTES_MAX = 380; // le serveur d'IA garde 400 caractères par message : seules les notes liées à la question partent, dans cette limite

export type MemIntent =
  | { kind: 'save'; text: string }
  | { kind: 'save-ask' } // « mémorise » tout seul : la phrase vient au message suivant
  | { kind: 'list' }
  | { kind: 'forget-n'; n: number }
  | { kind: 'forget-text'; text: string }
  | { kind: 'edit'; n: number; text: string };

export interface MemApi {
  fetch(): Promise<MemNote[] | null>;
  save(note: { id?: string; text: string }): Promise<{ ok: boolean; note?: MemNote; error?: string }>;
  remove(id: string): Promise<boolean>;
}

export const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

export const cleanNote = (s: string): string | null => {
  const t = String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t ? t.slice(0, MEM_MAX_CHARS) : null;
};

const LIST_RE = /^(?:(?:montre|affiche|donne|liste|voir|ouvre)(?:-moi)?\s+)?(?:ma memoire|mes notes|mes souvenirs|(?:la )?liste de (?:ma memoire|mes notes)|ce que (?:tu as|j'ai) (?:retenu|memorise|note)|(?:qu'?est[- ]ce que|que|quoi) (?:tu as|as[- ]tu|tu a|a[- ]tu) (?:retenu|memorise|note|en memoire)|what do you remember|what have you (?:remembered|noted)|my notes|my memory|show (?:my )?(?:notes|memory))\s*[?!.]*$/;
const FORGET_N_RE = /^(?:oublie|efface|supprime|retire|forget|delete|remove)(?:-moi)?\s+(?:la |le |ma |mon |the )?(?:note |memoire |souvenir |n°\s*|numero |no |#\s*)?(\d{1,3})\s*[.!]*$/;
const FORGET_NOTE_N_RE = /^(?:efface|supprime|retire)\s+(?:la |ma |mon )?(?:note|memoire|souvenir)\s*(?:n°|numero|no|#)?\s*(\d{1,3})\s*[.!]*$/;
const FORGET_TEXT_RE = /^(?:oublie|forget)(?:-moi)?\s*(?:que |qu'|ceci|ca|:|that)?\s*[:：,-]?\s*(.+)$/;
const EDIT_RE = /^\s*(?:modifie|corrige|change|edit|update)\s+(?:la |ma |mon |the )?(?:note |m[ée]moire |souvenir )?(?:n°\s*|num[ée]ro |no |#\s*)?(\d{1,3})\s*[:：-]\s*([\s\S]+)$/i;
// Verbe de mémoire. « note » et « enregistre » demandent « que » ou « : » derrière (sinon « note de frais » serait pris pour une note à retenir).
const SAVE_STRONG = /^\s*(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\s+|tu peux\s+|could you\s+|can you\s+)?(?:m[ée]morise(?:-moi)?|retiens(?:-moi)?|souviens[- ]toi|n'oublie pas|garde en m[ée]moire|remember)\b\s*(?:que\b|qu'|ceci\b|[çc]a\b|this\b|that\b)?\s*[:：,-]?\s*([\s\S]*)$/i;
const SAVE_WEAK = /^\s*(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\s+|tu peux\s+)?(?:note(?: bien)?|enregistre|ajoute en m[ée]moire|save)\s*(?:(?:que\b|qu'|ceci\b|[çc]a\b|this\b|that\b)\s*[:：,-]?|[:：])\s*([\s\S]+)$/i;

export function parseMemoryIntent(q: string): MemIntent | null {
  const raw = String(q ?? '').trim();
  if (!raw) return null;
  const n = norm(raw);
  if (LIST_RE.test(n)) return { kind: 'list' };
  let m = FORGET_N_RE.exec(n) || FORGET_NOTE_N_RE.exec(n);
  if (m) return { kind: 'forget-n', n: Number(m[1]) };
  const e = EDIT_RE.exec(raw);
  if (e) return { kind: 'edit', n: Number(e[1]), text: e[2].trim() };
  m = FORGET_TEXT_RE.exec(n);
  if (m && m[1].trim().length >= 2) return { kind: 'forget-text', text: m[1].trim() };
  let s = SAVE_STRONG.exec(raw);
  if (s) { const t = s[1].trim(); return t ? { kind: 'save', text: t } : { kind: 'save-ask' }; }
  s = SAVE_WEAK.exec(raw);
  if (s && s[1].trim()) return { kind: 'save', text: s[1].trim() };
  return null;
}

const STOP = new Set(['les', 'des', 'une', 'dans', 'pour', 'avec', 'que', 'qui', 'est', 'sont', 'pas', 'sur', 'par', 'mon', 'mes', 'ton', 'tes', 'son', 'ses', 'the', 'and', 'for', 'with', 'that', 'this', 'what', 'quel', 'quelle', 'quels', 'quand', 'comment', 'combien', 'est-ce', 'tu', 'vous', 'nous', 'moi', 'toi', 'ils', 'elle', 'elles', 'cette', 'ces', 'aux', 'du', 'de', 'la', 'le', 'un', 'en', 'et', 'ou', 'au', 'ce', 'se', 'sa', 'ne']);
const tokens = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
// Mots-clés, pas de sens : une note ressort si elle partage au moins un mot (même début de 4 lettres) avec la question.
export function searchNotes(q: string, notes: MemNote[], max = 3): MemNote[] {
  const qt = tokens(q);
  if (!qt.length) return [];
  const scored = notes.map(n => {
    const nt = tokens(n.text);
    let sc = 0;
    for (const w of qt) if (nt.some(x => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w.slice(0, 4)) && w.startsWith(x.slice(0, 4)))))) sc++;
    return { n, sc };
  }).filter(x => x.sc > 0);
  scored.sort((a, c) => c.sc - a.sc || c.n.at - a.n.at);
  return scored.slice(0, max).map(x => x.n);
}

// Notes liées à la question, collées en un seul message pour l'IA (400 caractères au plus côté serveur).
export function notesForAi(hits: MemNote[], l: 'fr' | 'en'): string {
  let out = l === 'en' ? 'My notes: ' : 'Mes notes : ';
  const parts: string[] = [];
  for (const h of hits) {
    const one = h.text.replace(/\s+/g, ' ').trim();
    const next = [...parts, one].join(' | ');
    if ((out + next).length > AI_NOTES_MAX) { if (!parts.length) parts.push(one.slice(0, AI_NOTES_MAX - out.length)); break; }
    parts.push(one);
  }
  return parts.length ? out + parts.join(' | ') : '';
}

const rep = (intent: string, title: Bi, lines: Bi[], actions: Reply['actions'] = []): Reply => ({ intent, title, lines, actions, sources: b('Tes notes enregistrées sur le serveur.', 'Your notes saved on the server.') });
const one = (fr: string, en: string): Bi => b(fr, en);
const short = (t: string, n = 120) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const NO_NET = rep('memory_error', b('Je n\'ai pas pu joindre le serveur', 'I could not reach the server'), [one('Rien n\'a été modifié dans ta mémoire. Réessaie dans un instant.', 'Nothing was changed in your memory. Try again in a moment.')]);

export function listReply(notes: MemNote[]): Reply {
  if (!notes.length) return rep('memory_list', b('Ma mémoire est vide', 'My memory is empty'), [one('Écris « mémorise : ta phrase » pour que je la retienne.', 'Write "remember: your sentence" and I will keep it.')]);
  const lines = notes.map((n, i) => one(`${i + 1}. ${n.text}`, `${i + 1}. ${n.text}`));
  const actions: Reply['actions'] = [];
  notes.slice(0, 12).forEach((n, i) => {
    actions.push({ label: b(`Modifier n° ${i + 1}`, `Edit no. ${i + 1}`), go: { view: MEM_EDIT_PREFIX + n.id } });
    actions.push({ label: b(`Oublier n° ${i + 1}`, `Forget no. ${i + 1}`), go: { view: MEM_FORGET_PREFIX + n.id } });
  });
  return rep('memory_list', b(`Ce que j'ai retenu (${notes.length})`, `What I remember (${notes.length})`), lines, actions);
}

function confirmForget(n: MemNote, pos: number): Reply {
  return rep('memory_confirm', b(`Oublier la note ${pos} ?`, `Forget note ${pos}?`), [one(`« ${short(n.text, 200)} »`, `"${short(n.text, 200)}"`)], [{ label: b('Oui, oublier', 'Yes, forget'), go: { view: MEM_FORGET_PREFIX + n.id } }]);
}

export const forgetDone = (ok: boolean): Reply => ok
  ? rep('memory_forgot', b('C\'est oublié', 'Forgotten'), [one('La note est supprimée de ma mémoire.', 'The note is removed from my memory.')])
  : NO_NET;

/** Exécute une demande de mémoire. Ne dit « C'est noté » que si le serveur a bien enregistré. */
export async function runMemory(intent: MemIntent, api: MemApi): Promise<Reply> {
  if (intent.kind === 'save-ask') return rep('memory_ask', b('Quelle phrase dois-je retenir ?', 'Which sentence should I remember?'), [one('Écris-la dans ton prochain message, je la garde telle quelle. (Écris « annule » pour laisser tomber.)', 'Write it in your next message and I will keep it as is. (Write "cancel" to drop it.)')]);
  const notes = await api.fetch();
  if (notes == null) return NO_NET;
  if (intent.kind === 'list') return listReply(notes);
  if (intent.kind === 'save') {
    const text = cleanNote(intent.text);
    if (!text) return rep('memory_ask', b('Quelle phrase dois-je retenir ?', 'Which sentence should I remember?'), []);
    if (notes.some(x => norm(x.text) === norm(text))) return rep('memory_saved', b('Déjà noté', 'Already noted'), [one(`« ${short(text, 200)} » est déjà dans ma mémoire.`, `"${short(text, 200)}" is already in my memory.`)]);
    if (notes.length >= MEM_MAX_NOTES) return rep('memory_error', b('Ma mémoire est pleine', 'My memory is full'), [one(`${MEM_MAX_NOTES} notes au plus. Dis « oublie la 1 » pour faire de la place.`, `${MEM_MAX_NOTES} notes at most. Say "forget 1" to make room.`)]);
    const r = await api.save({ text });
    if (!r.ok) return rep('memory_error', b('Je n\'ai pas pu l\'enregistrer', 'I could not save it'), [one(r.error || 'Rien n\'a été noté. Réessaie dans un instant.', r.error || 'Nothing was noted. Try again in a moment.')]);
    return rep('memory_saved', b('C\'est noté', 'Noted'), [one(`« ${short(text, 300)} »`, `"${short(text, 300)}"`), one(`Note n° ${notes.length + 1}. Écris « ma mémoire » pour tout relire.`, `Note no. ${notes.length + 1}. Write "my notes" to read everything.`)]);
  }
  if (intent.kind === 'edit') {
    const target = notes[intent.n - 1];
    const text = cleanNote(intent.text);
    if (!target) return rep('memory_error', b('Cette note n\'existe pas', 'That note does not exist'), [one(`Je n'ai que ${notes.length} note(s). Écris « ma mémoire » pour voir la liste.`, `I only have ${notes.length} note(s). Write "my notes" to see the list.`)]);
    if (!text) return rep('memory_error', b('Le nouveau texte est vide', 'The new text is empty'), []);
    const r = await api.save({ id: target.id, text });
    return r.ok ? rep('memory_saved', b(`Note ${intent.n} modifiée`, `Note ${intent.n} updated`), [one(`« ${short(text, 300)} »`, `"${short(text, 300)}"`)]) : rep('memory_error', b('Je n\'ai pas pu la modifier', 'I could not edit it'), [one(r.error || 'Rien n\'a été changé.', r.error || 'Nothing was changed.')]);
  }
  if (intent.kind === 'forget-n') {
    const target = notes[intent.n - 1];
    if (!target) return rep('memory_error', b('Cette note n\'existe pas', 'That note does not exist'), [one(`Je n'ai que ${notes.length} note(s). Écris « ma mémoire » pour voir la liste.`, `I only have ${notes.length} note(s). Write "my notes" to see the list.`)]);
    return confirmForget(target, intent.n);
  }
  // forget-text : on cherche la note ; une seule trouvée = confirmation, plusieurs = je montre la liste, aucune = rien n'est supprimé
  const hits = searchNotes(intent.text, notes, 5);
  if (!hits.length) return rep('memory_error', b('Je n\'ai rien trouvé', 'I found nothing'), [one('Aucune note ne ressemble à ça. Écris « ma mémoire » pour voir la liste.', 'No note looks like that. Write "my notes" to see the list.')]);
  if (hits.length === 1) return confirmForget(hits[0], notes.indexOf(hits[0]) + 1);
  return rep('memory_list', b('Plusieurs notes correspondent', 'Several notes match'), [...hits.map(h => one(`${notes.indexOf(h) + 1}. ${short(h.text, 160)}`, `${notes.indexOf(h) + 1}. ${short(h.text, 160)}`)), one('Dis laquelle : « oublie la 2 ».', 'Tell me which one: "forget 2".')], hits.map(h => ({ label: b(`Oublier n° ${notes.indexOf(h) + 1}`, `Forget no. ${notes.indexOf(h) + 1}`), go: { view: MEM_FORGET_PREFIX + h.id } })));
}

/** Réponse « dans tes notes » quand la question ressemble à une note (sans IA). */
export function notesAnswer(hits: MemNote[]): Reply {
  return rep('memory_hit', b('Dans tes notes', 'In your notes'), hits.map(h => one(h.text, h.text)));
}
