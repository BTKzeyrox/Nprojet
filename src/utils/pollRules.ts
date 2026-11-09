// Sondage dans les Actualités (BTK, 2026-11-08) : règles PURES (sans écran, sans réseau, sans importation).
// La copie du serveur (bloc POLL de df-api) est comparée par scripts/check-poll.ts : on ne modifie qu'ici, puis on recopie.
// Sondage simple : un vote par personne (on peut changer ou retirer son vote). Choix de date et « J'ai lu » : plusieurs choix possibles par personne (étape C3). Les résultats sont des comptes visibles par tous ; QUI a voté quoi n'est vu que par le responsable.
// ===== BEGIN POLL (copie dans supabase/functions/df-api/index.ts) =====
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 6;
const POLL_MAX_DATES = 10; // choix de date : jusqu'à 10 dates proposées
const POLL_MAX_QUESTION = 200;
const POLL_MAX_OPTION = 100;
const POLL_MAX_VOTES = 2000;
const POLL_ACK_TEXT = 'J\u2019ai lu';
type PollKind = 'poll' | 'date' | 'ack'; // poll = un choix ; date = plusieurs dates possibles (disponibilités) ; ack = « J'ai lu » (confirmation de lecture)
interface PollOpt { id: string; text: string }
interface PollStored { question: string; kind?: PollKind; options: PollOpt[]; closed: boolean; votes: Record<string, string | string[]> }
const pollMulti = (poll: { kind?: string }): boolean => poll.kind === 'date' || poll.kind === 'ack';
const pollText = (v: unknown, n: number): string => String(typeof v === 'object' && v && 'text' in (v as object) ? (v as { text: unknown }).text : v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/** Un sondage valable : une question, 2 à 6 choix différents (10 dates pour un choix de date ; un seul bouton « J'ai lu » pour une confirmation de lecture). Les votes repartent toujours de zéro (le serveur ne reprend jamais les votes envoyés par un navigateur). */
function pollClean(input: unknown): PollStored | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const question = pollText(o.question, POLL_MAX_QUESTION);
  const kind: PollKind = o.kind === 'date' || o.kind === 'ack' ? o.kind : 'poll';
  if (!question) return null;
  if (kind === 'ack') return { question, kind, options: [{ id: 'o1', text: POLL_ACK_TEXT }], closed: false, votes: {} };
  if (!Array.isArray(o.options)) return null;
  const max = kind === 'date' ? POLL_MAX_DATES : POLL_MAX_OPTIONS;
  const seen = new Set<string>();
  const options: PollOpt[] = [];
  for (const raw of o.options) {
    const text = pollText(raw, POLL_MAX_OPTION);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    options.push({ id: `o${options.length + 1}`, text });
    if (options.length >= max) break;
  }
  return options.length >= POLL_MIN_OPTIONS ? { question, ...(kind === 'date' ? { kind } : {}), options, closed: false, votes: {} } : null;
}
const pollPicks = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** Nombre de votes par choix (les votes pour un choix qui n'existe plus ne comptent pas ; une personne compte une fois par choix). */
function pollCounts(poll: { options: PollOpt[]; votes?: Record<string, string | string[]> }): Record<string, number> {
  const c: Record<string, number> = {};
  for (const o of poll.options) c[o.id] = 0;
  for (const v of Object.values(poll.votes || {})) for (const id of new Set(pollPicks(v))) if (id in c) c[id]++;
  return c;
}
/** Voter : sondage simple = un autre choix remplace le vote, le même choix le retire. Choix de date et « J'ai lu » = chaque choix s'ajoute ou se retire. Refusé si le sondage est clos. */
function pollApplyVote(poll: PollStored, userId: string, optionId: string): { ok: true; poll: PollStored } | { ok: false; error: string } {
  if (poll.closed) return { ok: false, error: poll.kind === 'ack' ? 'Cette confirmation de lecture est close.' : 'Ce sondage est clos.' };
  if (!poll.options.some(o => o.id === optionId)) return { ok: false, error: 'Choix inconnu.' };
  const votes = { ...(poll.votes || {}) };
  if (!(userId in votes) && Object.keys(votes).length >= POLL_MAX_VOTES) return { ok: false, error: 'Trop de votes sur ce sondage.' };
  if (pollMulti(poll)) {
    const mine = new Set(pollPicks(votes[userId]));
    if (mine.has(optionId)) mine.delete(optionId); else mine.add(optionId);
    const list = poll.options.map(o => o.id).filter(id => mine.has(id));
    if (list.length) votes[userId] = list; else delete votes[userId];
  } else if (votes[userId] === optionId) delete votes[userId];
  else votes[userId] = optionId;
  return { ok: true, poll: { ...poll, votes } };
}
/** Ce que voit chacun : le responsable reçoit aussi qui a voté quoi ; les autres, seulement les comptes et leur propre vote. */
function pollView(poll: PollStored, userId: string, isAdmin: boolean): Record<string, unknown> {
  const base = { question: poll.question, ...(poll.kind === 'date' || poll.kind === 'ack' ? { kind: poll.kind } : {}), options: poll.options, closed: !!poll.closed, counts: pollCounts(poll) };
  if (isAdmin) return { ...base, votes: { ...(poll.votes || {}) } };
  const mine = poll.votes ? poll.votes[userId] : undefined;
  return { ...base, ...(typeof mine === 'string' || Array.isArray(mine) ? { my: mine } : {}) };
}
// ===== END POLL =====

export {
  POLL_MIN_OPTIONS, POLL_MAX_OPTIONS, POLL_MAX_DATES, POLL_MAX_QUESTION, POLL_MAX_OPTION, POLL_MAX_VOTES, POLL_ACK_TEXT,
  pollClean, pollCounts, pollApplyVote, pollView, pollMulti, pollPicks,
};
export type { PollOpt, PollStored, PollKind };

/** Ce qu'un écran reçoit pour un sondage (le responsable : `votes` en plus). */
export interface PollView { question: string; kind?: PollKind; options: PollOpt[]; closed: boolean; counts: Record<string, number>; my?: string | string[]; votes?: Record<string, string | string[]> }
