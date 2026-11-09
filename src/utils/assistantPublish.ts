// Assistant : publier une annonce (et plus tard un sondage) dans les Actualités depuis une phrase (BTK, 2026-11-08, étape C2).
// Aperçu d'abord, « Confirmer » ensuite : rien n'est publié avant. Le responsable publie comme d'habitude (db.publishNews).
import { b, type Reply } from './assistant';

export const ANN_OK_PREFIX = '__ann_ok:';
export const ANN_NO = '__ann_no';
export const ANN_MAX_TEXT = 2000; // comme le serveur (NEWS_MAX_TEXT)

export interface Announce { text: string }

const PRE = "(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\\s+|tu peux\\s+|could you\\s+|can you\\s+)?";
// « publie : … », « publie une annonce : … », « annonce : … », « poste dans les actualités : … » (les deux-points sont obligatoires : « annonce » seul reste une phrase ordinaire)
const ANN_RE = new RegExp(`^\\s*${PRE}(?:publie|publier|poste|poster|annonce|diffuse|publish|post|announce)(?:\\s+(?:une|un|cette|l')\\s*(?:annonce|publication|message|post))?(?:\\s+(?:dans|sur|aux?|in|on|to)\\s+(?:les |la |le |the )?(?:actualit[ée]s?|fil|news|feed))?\\s*[:：]\\s*([\\s\\S]+)$`, 'i');

export function parseAnnounceIntent(q: string): Announce | null {
  const raw = String(q ?? '').trim();
  if (!raw) return null;
  const m = ANN_RE.exec(raw);
  if (!m) return null;
  const text = m[1].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, ANN_MAX_TEXT);
  return text ? { text } : null;
}

const rep = (intent: string, title: ReturnType<typeof b>, lines: ReturnType<typeof b>[], actions: Reply['actions'] = []): Reply => ({ intent, title, lines, actions, sources: b('Actualités.', 'News feed.') });
const short = (t: string, n = 400) => { const s = t.trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export const encodeAnn = (a: Announce): string => ANN_OK_PREFIX + encodeURIComponent(JSON.stringify({ t: a.text }));
export function decodeAnn(view: string): Announce | null {
  if (!view.startsWith(ANN_OK_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(view.slice(ANN_OK_PREFIX.length)));
    const text = typeof o.t === 'string' ? o.t.trim().slice(0, ANN_MAX_TEXT) : '';
    return text ? { text } : null;
  } catch { return null; }
}

export function announcePreview(a: Announce): Reply {
  return rep('announce_preview', b('Je vais publier cette annonce', 'I will publish this announcement'), [
    b(`« ${short(a.text)} »`, `"${short(a.text)}"`),
    b('Où : dans les Actualités, visible par toute l\'équipe, pas épinglée.', 'Where: in the News feed, visible to the whole team, not pinned.'),
    b('Rien n\'est publié tant que tu n\'as pas confirmé.', 'Nothing is published until you confirm.'),
  ], [{ label: b('Confirmer', 'Confirm'), go: { view: encodeAnn(a) } }, { label: b('Annuler', 'Cancel'), go: { view: ANN_NO } }]);
}
export const announceDone = (ok: boolean, error?: string): Reply => ok
  ? rep('announce_done', b('C\'est publié', 'Published'), [b('L\'annonce est dans les Actualités.', 'The announcement is in the News feed.')], [{ label: b('Voir les Actualités', 'See the News feed'), go: { view: 'feed' } }])
  : rep('announce_error', b('Je n\'ai pas pu la publier', 'I could not publish it'), [b(error || 'Rien n\'a été publié. Réessaie dans un instant.', error || 'Nothing was published. Try again in a moment.')]);
export const announceCanceled = (): Reply => rep('announce_cancel', b('D\'accord, rien n\'est publié', 'OK, nothing was published'), []);

// ===== Sondage (étape C2) : « Sondage : Quel jour pour la réunion ? lundi, mardi, mercredi » =====
import { pollClean, POLL_MAX_OPTIONS, POLL_MAX_DATES, POLL_MAX_QUESTION } from './pollRules';

export const POLL_OK_PREFIX = '__poll_ok:';
export const POLL_NO = '__poll_no';
export interface PollIntent { question: string; options: string[]; yesNo: boolean; kind?: 'poll' | 'date' }

const POLL_RE = new RegExp(`^\\s*${PRE}(?:(?:cr[ée]e|cr[ée]er|lance|lancer|fais|fait|publie|publier|ajoute|make|create|start|launch|post)\\s+(?:un |une |a )?)?(?:sondage|poll|vote)\\s*(?:(?:dans|sur|aux?|in|on)\\s+(?:les |la |le |the )?(?:actualit[ée]s?|fil|news|feed)\\s*)?[:：]\\s*([\\s\\S]+)$`, 'i');

const splitOptions = (t: string): string[] => t.split(/\n|;|,|\s+\/\s+|\s+ou\s+|\s+or\s+/i).map(x => x.replace(/^\s*(?:[-•*·]|\d{1,2}[.)])\s+/, '').trim()).filter(Boolean);

const DATE_RE = new RegExp(`^\\s*${PRE}(?:(?:cr[ée]e|cr[ée]er|lance|lancer|fais|fait|publie|publier|ajoute|make|create|start|launch|post)\\s+(?:un |une |a )?)?(?:choix de dates?|sondage de dates?|sondage d'horaires?|doodle|disponibilit[ée]s?|date poll|availability poll|find a date)\\s*(?:(?:dans|sur|aux?|in|on)\\s+(?:les |la |le |the )?(?:actualit[ée]s?|fil|news|feed)\\s*)?[:：]\\s*([\\s\\S]+)$`, 'i');

/** « question ? choix, choix » ou « question : choix, choix » ; sans choix mais avec « ? » = Oui / Non (sondage simple seulement). 'incomplete' = il manque la question ou 2 choix. */
function parsePollBody(raw: string, kind: 'poll' | 'date'): PollIntent | 'incomplete' {
  const body = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
  let question = '', rest = '';
  const qm = body.indexOf('?');
  const cm = body.search(/[:：]/);
  if (qm >= 0) { question = body.slice(0, qm + 1).trim(); rest = body.slice(qm + 1); }
  else if (cm > 0) { question = body.slice(0, cm).trim(); rest = body.slice(cm + 1); }
  else { question = body; rest = ''; }
  let options = splitOptions(rest);
  let yesNo = false;
  // « Faut-il ouvrir samedi ? » = Oui / Non ; « Quel jour ? » ne se répond pas par oui ou non : il faut les choix
  if (kind === 'poll' && !options.length && question.endsWith('?') && !/^(?:quel(?:le)?s?|quand|combien|qui|quoi|comment|o[uù]|pourquoi|lequel|laquelle|lesquel(?:le)?s|which|what|when|where|who|whom|how|why)\b/i.test(question)) { options = ['Oui', 'Non']; yesNo = true; }
  const clean = pollClean({ question: question.slice(0, POLL_MAX_QUESTION), kind, options: options.slice(0, (kind === 'date' ? POLL_MAX_DATES : POLL_MAX_OPTIONS) + 3) });
  if (!clean) return 'incomplete';
  return { question: clean.question, options: clean.options.map(o => o.text), yesNo, ...(kind === 'date' ? { kind } : {}) };
}
export function parsePollIntent(q: string): PollIntent | 'incomplete' | null {
  const m = POLL_RE.exec(String(q ?? '').trim());
  return m ? parsePollBody(m[1], 'poll') : null;
}
/** « choix de date : réunion d'équipe ? lundi 10, mardi 11, jeudi 13 » : chacun coche ses disponibilités (plusieurs possibles). Les dates restent écrites comme tu les donnes. */
export function parseDateIntent(q: string): PollIntent | 'incomplete' | null {
  const m = DATE_RE.exec(String(q ?? '').trim());
  return m ? parsePollBody(m[1], 'date') : null;
}

export const encodePoll = (p: PollIntent): string => POLL_OK_PREFIX + encodeURIComponent(JSON.stringify({ q: p.question, o: p.options, ...(p.kind === 'date' ? { k: 'date' } : {}) }));
export function decodePoll(view: string): PollIntent | null {
  if (!view.startsWith(POLL_OK_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(view.slice(POLL_OK_PREFIX.length)));
    const kind = o.k === 'date' ? 'date' : 'poll';
    const clean = pollClean({ question: o.q, kind, options: Array.isArray(o.o) ? o.o : [] });
    return clean ? { question: clean.question, options: clean.options.map(x => x.text), yesNo: false, ...(kind === 'date' ? { kind } : {}) } : null;
  } catch { return null; }
}

export const dateIncomplete = (): Reply => rep('date_incomplete', b('Il me faut une question et au moins 2 dates', 'I need a question and at least 2 dates'), [
  b('Exemple : « choix de date : réunion d\'équipe ? lundi 10, mardi 11, jeudi 13 à 9 h ».', 'Example: "date poll: team meeting? Monday 10, Tuesday 11, Thursday 13 at 9am".'),
  b(`2 à ${POLL_MAX_DATES} dates différentes.`, `2 to ${POLL_MAX_DATES} different dates.`),
]);
export const pollIncomplete = (): Reply => rep('poll_incomplete', b('Il me faut une question et au moins 2 choix', 'I need a question and at least 2 choices'), [
  b('Exemple : « sondage : Quel jour pour la réunion ? lundi, mardi, mercredi ». Pour un simple oui / non : « sondage : Faut-il ouvrir samedi ? ».', 'Example: "poll: Which day for the meeting? Monday, Tuesday, Wednesday". For a simple yes / no: "poll: Should we open on Saturday?".'),
  b(`2 à ${POLL_MAX_OPTIONS} choix différents.`, `2 to ${POLL_MAX_OPTIONS} different choices.`),
]);
export function pollPreview(p: PollIntent): Reply {
  if (p.kind === 'date') return rep('date_preview', b('Je vais publier ce choix de date', 'I will publish this date poll'), [
    b(`Question : « ${p.question} »`, `Question: "${p.question}"`),
    ...p.options.map((o, i) => b(`${i + 1}. ${o}`, `${i + 1}. ${o}`)),
    b('Où : dans les Actualités, pour toute l\'équipe. Chacun coche toutes les dates où il est disponible (modifiable). La date la plus choisie est marquée. Les comptes sont visibles par tous ; toi seul vois qui est dispo quand. Tu peux le clore depuis le menu de la publication.', 'Where: in the News feed, for the whole team. Everyone ticks all the dates they are free (changeable). The most chosen date is marked. Counts are visible to everyone; only you see who is free when. You can close it from the post menu.'),
    b('Rien n\'est publié tant que tu n\'as pas confirmé.', 'Nothing is published until you confirm.'),
  ], [{ label: b('Confirmer', 'Confirm'), go: { view: encodePoll(p) } }, { label: b('Annuler', 'Cancel'), go: { view: POLL_NO } }]);
  return rep('poll_preview', b('Je vais publier ce sondage', 'I will publish this poll'), [
    b(`Question : « ${p.question} »`, `Question: "${p.question}"`),
    ...p.options.map((o, i) => b(`${i + 1}. ${o}`, `${i + 1}. ${o}`)),
    ...(p.yesNo ? [b('Pas de choix donnés : j\'ai mis Oui / Non.', 'No choices given: I used Yes / No.')] : []),
    b('Où : dans les Actualités, pour toute l\'équipe. Un vote par personne, modifiable. Les résultats sont visibles par tous ; toi seul vois qui a voté quoi. Tu peux le clore depuis le menu de la publication.', 'Where: in the News feed, for the whole team. One vote per person, changeable. Results are visible to everyone; only you see who voted what. You can close it from the post menu.'),
    b('Rien n\'est publié tant que tu n\'as pas confirmé.', 'Nothing is published until you confirm.'),
  ], [{ label: b('Confirmer', 'Confirm'), go: { view: encodePoll(p) } }, { label: b('Annuler', 'Cancel'), go: { view: POLL_NO } }]);
}
export const pollDone = (ok: boolean, error?: string): Reply => ok
  ? rep('poll_done', b('C\'est publié', 'Published'), [b('Les réponses arrivent dans les Actualités.', 'Answers will show up in the News feed.')], [{ label: b('Voir les Actualités', 'See the News feed'), go: { view: 'feed' } }])
  : rep('poll_error', b('Je n\'ai pas pu le publier', 'I could not publish it'), [b(error || 'Rien n\'a été publié. Réessaie dans un instant.', error || 'Nothing was published. Try again in a moment.')]);
export const pollCanceled = (): Reply => rep('poll_cancel', b('D\'accord, rien n\'est publié', 'OK, nothing was published'), []);

// ===== « J'ai lu » (étape C3, point 6) : « publie avec confirmation de lecture : nouvelle règle de justificatif » =====
export const ACK_OK_PREFIX = '__ack_ok:';
export const ACK_NO = '__ack_no';
export interface AckIntent { text: string }
const ACK_RE = new RegExp(`^\\s*${PRE}(?:publie|publier|poste|poster|annonce|diffuse|publish|post|announce)(?:\\s+(?:une|un|cette|l')\\s*(?:annonce|publication|message|post))?\\s+(?:avec|et demande|with|and ask for)\\s+(?:une |un |a )?(?:confirmation de lecture|accus[ée] de lecture|accus[ée] de r[ée]ception|lecture|read confirmation|read receipt)\\s*[:：]\\s*([\\s\\S]+)$`, 'i');
export function parseAckIntent(q: string): AckIntent | null {
  const m = ACK_RE.exec(String(q ?? '').trim());
  const text = m ? m[1].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, ANN_MAX_TEXT) : '';
  return text ? { text } : null;
}
export const ackQuestion = (text: string): string => text.split(/\n/)[0].trim().slice(0, POLL_MAX_QUESTION) || text.trim().slice(0, POLL_MAX_QUESTION);
export const encodeAck = (a: AckIntent): string => ACK_OK_PREFIX + encodeURIComponent(JSON.stringify({ t: a.text }));
export function decodeAck(view: string): AckIntent | null {
  if (!view.startsWith(ACK_OK_PREFIX)) return null;
  try { const o = JSON.parse(decodeURIComponent(view.slice(ACK_OK_PREFIX.length))); const text = typeof o.t === 'string' ? o.t.trim().slice(0, ANN_MAX_TEXT) : ''; return text ? { text } : null; } catch { return null; }
}
export function ackPreview(a: AckIntent): Reply {
  return rep('ack_preview', b('Je vais publier cette annonce avec « J\'ai lu »', 'I will publish this announcement with "I have read"'), [
    b(`« ${short(a.text)} »`, `"${short(a.text)}"`),
    b('Chaque personne touche « J\'ai lu ». Le nombre de lecteurs est visible par tous ; toi seul vois qui a lu et qui n\'a pas encore lu. Tu peux clore depuis le menu de la publication.', 'Each person taps "I have read". The number of readers is visible to everyone; only you see who has read and who has not yet. You can close it from the post menu.'),
    b('Rien n\'est publié tant que tu n\'as pas confirmé.', 'Nothing is published until you confirm.'),
  ], [{ label: b('Confirmer', 'Confirm'), go: { view: encodeAck(a) } }, { label: b('Annuler', 'Cancel'), go: { view: ACK_NO } }]);
}
