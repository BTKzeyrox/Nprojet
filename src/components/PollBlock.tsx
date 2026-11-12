// Sondage d'une publication des Actualités (étape C2) : un vote par personne (changer ou retirer son vote est possible),
// comptes visibles par tous, « qui a voté quoi » seulement pour le responsable.
import { tap } from '../utils/haptic';
import { useState } from 'react';
import { Check, Lock, Star } from 'lucide-react';
import type { NewsPost, User } from '../types';
import { pollCounts, pollPicks, pollMulti } from '../utils/pollRules';

export default function PollBlock({ post, meId, isAdmin, light, busy, users, onVote, fixed }: {
  post: NewsPost; meId: string; isAdmin: boolean; light: boolean; busy: boolean; users: User[]; onVote: (optionId: string) => void;
  fixed?: boolean; // messagerie : la carte garde exactement la même taille avant et après un vote (texte d'aide court et constant, pied de ligne réservé)
}) {
  const poll = post.poll;
  const [who, setWho] = useState(false);
  if (!poll || !Array.isArray(poll.options) || poll.options.length < (poll.kind === 'ack' ? 1 : 2)) return null;
  const kind = poll.kind || 'poll', multi = pollMulti(poll);
  const counts = poll.counts || pollCounts({ options: poll.options, votes: poll.votes });
  const total = poll.options.reduce((n, o) => n + (counts[o.id] || 0), 0);
  const myRaw = isAdmin ? poll.votes?.[meId] : poll.my;
  const mine = new Set(pollPicks(myRaw)); // un seul choix pour un sondage simple, plusieurs pour les dates
  const my = mine.size > 0;
  const max = Math.max(0, ...poll.options.map(o => counts[o.id] || 0));
  const readers = isAdmin ? Object.keys(poll.votes || {}).length : (counts[poll.options[0].id] || 0);
  const published = (post.status || 'published') === 'published';
  const canVote = published && !poll.closed;
  const nameOf = (id: string) => users.find(u => u.id === id)?.name || 'Ancien compte';
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  if (kind === 'ack') {
    const first = poll.options[0];
    const nonReaders = isAdmin ? users.filter(u => u.role !== 'admin' && u.status === 'active' && !(poll.votes && u.id in poll.votes)).map(u => u.name) : [];
    return (
      <div data-poll data-ack className={fixed ? 'space-y-2' : `rounded-xl border p-2.5 space-y-2 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#0b1118]'}`}>
        <button type="button" data-ack-button disabled={!canVote || busy} onClick={() => { tap('light'); onVote(first.id); }} aria-pressed={my}
          className={`w-full min-h-[44px] rounded-lg border px-3 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default ${my ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600' : light ? 'border-slate-300 bg-white' : 'border-slate-600 bg-[#0f1722]'}`}>
          {my && <Check className="w-4 h-4" />}{my ? (fixed ? 'Tu as lu' : 'Tu as lu (toucher pour retirer)') : 'J’ai lu'}
        </button>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${muted}`}>
          <span data-ack-count>{readers} personne{readers > 1 ? 's ont' : ' a'} lu</span>
          {poll.closed && <span data-poll-closed className="inline-flex items-center gap-1 font-semibold text-amber-600"><Lock className="w-3 h-3" /> Confirmation close</span>}
          {isAdmin && <button type="button" data-poll-who onClick={() => setWho(v => !v)} className="underline cursor-pointer min-h-[32px]">{who ? 'Masquer la liste' : 'Voir qui a lu'}</button>}
        </div>
        {isAdmin && who && (
          <div data-poll-voters className={`text-xs space-y-1 ${muted}`}>
            <div><span className="font-semibold">Ont lu</span> : {Object.keys(poll.votes || {}).map(nameOf).join(', ') || 'personne'}</div>
            <div><span className="font-semibold">Pas encore lu</span> : {nonReaders.join(', ') || 'personne'}</div>
            <div>Visible par toi seul.</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div data-poll className={fixed ? 'space-y-2' : `rounded-xl border p-2.5 space-y-2 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#0b1118]'}`}>
      <ul className="space-y-1.5" role="list">
        {poll.options.map(o => {
          const n = counts[o.id] || 0;
          const pct = multi ? (max ? Math.round((n / max) * 100) : 0) : (total ? Math.round((n / total) * 100) : 0); // dates : la barre se mesure à la date la plus choisie
          const mineChoice = mine.has(o.id);
          const best = kind === 'date' && max > 0 && n === max;
          return (
            <li key={o.id}>
              <button type="button" data-poll-option={o.id} disabled={!canVote || busy} onClick={() => { tap('light'); onVote(o.id); }} aria-pressed={mineChoice}
                className={`relative w-full min-h-[44px] overflow-hidden rounded-lg border text-left text-sm cursor-pointer disabled:cursor-default ${mineChoice ? 'border-emerald-500' : light ? 'border-slate-300' : 'border-slate-600'} ${light ? 'bg-white' : 'bg-[#0f1722]'}`}>
                <span aria-hidden className={`absolute inset-y-0 left-0 ${mineChoice ? 'bg-emerald-500/30' : light ? 'bg-slate-200' : 'bg-slate-700/60'}`} style={{ width: `${pct}%` }} />
                <span className="relative flex items-center gap-2 px-3 py-2">
                  {mineChoice && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                  <span className="flex-1 min-w-0 break-words">{o.text}</span>
                  {best && <span data-date-best className="shrink-0 text-[11px] font-bold text-emerald-600"><Star className="inline-block w-3 h-3 fill-current align-[-1px]" aria-hidden="true" />{fixed ? <span className="sr-only">la plus choisie</span> : ' la plus choisie'}</span>}
                  <span className={`shrink-0 text-xs tabular-nums ${muted}`}>{multi ? `${n} dispo${n > 1 ? 's' : ''}` : `${n} · ${pct} %`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={fixed ? `flex flex-nowrap items-center justify-between gap-2 min-h-[32px] text-xs overflow-hidden ${muted}` : `flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${muted}`}>
        <span className={fixed ? 'shrink-0' : ''}>{multi ? `${total} disponibilité${total > 1 ? 's' : ''} indiquée${total > 1 ? 's' : ''}` : `${total} vote${total > 1 ? 's' : ''}`}</span>
        {poll.closed && <span data-poll-closed className="inline-flex items-center gap-1 font-semibold text-amber-600 shrink-0"><Lock className="w-3 h-3" /> {fixed ? 'Clos' : 'Sondage clos'}</span>}
        {canVote && !fixed && <span>{multi ? 'Touche toutes les dates où tu es disponible (touche encore pour retirer).' : my ? 'Touche ton choix pour le retirer, ou un autre pour changer.' : 'Touche un choix pour voter.'}</span>}
        {isAdmin && (fixed || (multi ? readers > 0 : total > 0)) && <button type="button" data-poll-who disabled={fixed && !(multi ? readers > 0 : total > 0)} onClick={() => setWho(v => !v)} className={`underline cursor-pointer min-h-[32px] disabled:no-underline disabled:cursor-default ${fixed ? 'shrink-0' : ''} ${fixed && !(multi ? readers > 0 : total > 0) ? 'invisible' : ''}`}>{who ? 'Masquer qui a voté' : 'Voir qui a voté'}</button>}
      </div>
      {isAdmin && who && (
        <div data-poll-voters className={`text-xs space-y-1 ${muted}`}>
          {poll.options.map(o => {
            const names = Object.entries(poll.votes || {}).filter(([, v]) => pollPicks(v).includes(o.id)).map(([uid]) => nameOf(uid));
            return <div key={o.id}><span className="font-semibold">{o.text}</span> : {names.length ? names.join(', ') : 'personne'}</div>;
          })}
          <div>Visible par toi seul.</div>
        </div>
      )}
    </div>
  );
}
