// Sondage d'une publication des Actualités (étape C2) : un vote par personne (changer ou retirer son vote est possible),
// comptes visibles par tous, « qui a voté quoi » seulement pour le responsable.
import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import type { NewsPost, User } from '../types';
import { pollCounts } from '../utils/pollRules';

export default function PollBlock({ post, meId, isAdmin, light, busy, users, onVote }: {
  post: NewsPost; meId: string; isAdmin: boolean; light: boolean; busy: boolean; users: User[]; onVote: (optionId: string) => void;
}) {
  const poll = post.poll;
  const [who, setWho] = useState(false);
  if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) return null;
  const counts = poll.counts || pollCounts({ options: poll.options, votes: poll.votes });
  const total = poll.options.reduce((n, o) => n + (counts[o.id] || 0), 0);
  const my = isAdmin ? poll.votes?.[meId] : poll.my;
  const published = (post.status || 'published') === 'published';
  const canVote = published && !poll.closed;
  const nameOf = (id: string) => users.find(u => u.id === id)?.name || 'Ancien compte';
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  return (
    <div data-poll className={`rounded-xl border p-2.5 space-y-2 ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#0b1118]'}`}>
      <ul className="space-y-1.5" role="list">
        {poll.options.map(o => {
          const n = counts[o.id] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mineChoice = my === o.id;
          return (
            <li key={o.id}>
              <button type="button" data-poll-option={o.id} disabled={!canVote || busy} onClick={() => onVote(o.id)} aria-pressed={mineChoice}
                className={`relative w-full min-h-[44px] overflow-hidden rounded-lg border text-left text-sm cursor-pointer disabled:cursor-default ${mineChoice ? 'border-emerald-500' : light ? 'border-slate-300' : 'border-slate-600'} ${light ? 'bg-white' : 'bg-[#0f1722]'}`}>
                <span aria-hidden className={`absolute inset-y-0 left-0 ${mineChoice ? 'bg-emerald-500/30' : light ? 'bg-slate-200' : 'bg-slate-700/60'}`} style={{ width: `${pct}%` }} />
                <span className="relative flex items-center gap-2 px-3 py-2">
                  {mineChoice && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                  <span className="flex-1 min-w-0 break-words">{o.text}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${muted}`}>{n} · {pct} %</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${muted}`}>
        <span>{total} vote{total > 1 ? 's' : ''}</span>
        {poll.closed && <span data-poll-closed className="inline-flex items-center gap-1 font-semibold text-amber-600"><Lock className="w-3 h-3" /> Sondage clos</span>}
        {canVote && <span>{my ? 'Touche ton choix pour le retirer, ou un autre pour changer.' : 'Touche un choix pour voter.'}</span>}
        {isAdmin && total > 0 && <button type="button" data-poll-who onClick={() => setWho(v => !v)} className="underline cursor-pointer min-h-[32px]">{who ? 'Masquer qui a voté' : 'Voir qui a voté'}</button>}
      </div>
      {isAdmin && who && (
        <div data-poll-voters className={`text-xs space-y-1 ${muted}`}>
          {poll.options.map(o => {
            const names = Object.entries(poll.votes || {}).filter(([, v]) => v === o.id).map(([uid]) => nameOf(uid));
            return <div key={o.id}><span className="font-semibold">{o.text}</span> : {names.length ? names.join(', ') : 'personne'}</div>;
          })}
          <div>Visible par toi seul.</div>
        </div>
      )}
    </div>
  );
}
