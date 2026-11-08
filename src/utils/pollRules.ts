// Sondage dans les Actualités (BTK, 2026-11-08) : règles PURES (sans écran, sans réseau, sans importation).
// La copie du serveur (bloc POLL de df-api) est comparée par scripts/check-poll.ts : on ne modifie qu'ici, puis on recopie.
// Un vote par personne (on peut changer ou retirer son vote). Les résultats sont des comptes visibles par tous ; QUI a voté quoi n'est vu que par le responsable.
// ===== BEGIN POLL (copie dans supabase/functions/df-api/index.ts) =====
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 6;
const POLL_MAX_QUESTION = 200;
const POLL_MAX_OPTION = 100;
const POLL_MAX_VOTES = 2000;
interface PollOpt { id: string; text: string }
interface PollStored { question: string; options: PollOpt[]; closed: boolean; votes: Record<string, string> }
const pollText = (v: unknown, n: number): string => String(typeof v === 'object' && v && 'text' in (v as object) ? (v as { text: unknown }).text : v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/** Un sondage valable : une question, 2 à 6 choix différents. Les votes repartent toujours de zéro (le serveur ne reprend jamais les votes envoyés par un navigateur). */
function pollClean(input: unknown): PollStored | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const question = pollText(o.question, POLL_MAX_QUESTION);
  if (!question || !Array.isArray(o.options)) return null;
  const seen = new Set<string>();
  const options: PollOpt[] = [];
  for (const raw of o.options) {
    const text = pollText(raw, POLL_MAX_OPTION);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    options.push({ id: `o${options.length + 1}`, text });
    if (options.length >= POLL_MAX_OPTIONS) break;
  }
  return options.length >= POLL_MIN_OPTIONS ? { question, options, closed: false, votes: {} } : null;
}
/** Nombre de votes par choix (les votes pour un choix qui n'existe plus ne comptent pas). */
function pollCounts(poll: { options: PollOpt[]; votes?: Record<string, string> }): Record<string, number> {
  const c: Record<string, number> = {};
  for (const o of poll.options) c[o.id] = 0;
  for (const v of Object.values(poll.votes || {})) if (typeof v === 'string' && v in c) c[v]++;
  return c;
}
/** Voter : un autre choix remplace le vote, le même choix le retire. Refusé si le sondage est clos. */
function pollApplyVote(poll: PollStored, userId: string, optionId: string): { ok: true; poll: PollStored } | { ok: false; error: string } {
  if (poll.closed) return { ok: false, error: 'Ce sondage est clos.' };
  if (!poll.options.some(o => o.id === optionId)) return { ok: false, error: 'Choix inconnu.' };
  const votes = { ...(poll.votes || {}) };
  if (votes[userId] === optionId) delete votes[userId];
  else {
    if (!(userId in votes) && Object.keys(votes).length >= POLL_MAX_VOTES) return { ok: false, error: 'Trop de votes sur ce sondage.' };
    votes[userId] = optionId;
  }
  return { ok: true, poll: { ...poll, votes } };
}
/** Ce que voit chacun : le responsable reçoit aussi qui a voté quoi ; les autres, seulement les comptes et leur propre vote. */
function pollView(poll: PollStored, userId: string, isAdmin: boolean): Record<string, unknown> {
  const base = { question: poll.question, options: poll.options, closed: !!poll.closed, counts: pollCounts(poll) };
  return isAdmin ? { ...base, votes: { ...(poll.votes || {}) } } : { ...base, ...(poll.votes && typeof poll.votes[userId] === 'string' ? { my: poll.votes[userId] } : {}) };
}
// ===== END POLL =====

export {
  POLL_MIN_OPTIONS, POLL_MAX_OPTIONS, POLL_MAX_QUESTION, POLL_MAX_OPTION, POLL_MAX_VOTES,
  pollClean, pollCounts, pollApplyVote, pollView,
};
export type { PollOpt, PollStored };

/** Ce qu'un écran reçoit pour un sondage (le responsable : `votes` en plus). */
export interface PollView { question: string; options: PollOpt[]; closed: boolean; counts: Record<string, number>; my?: string; votes?: Record<string, string> }
