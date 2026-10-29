import React from 'react';

// Les 6 réactions autorisées (le serveur refuse les autres)
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/** Rangée d'emoji à choisir (apparition en cascade). `mine` = ma réaction actuelle. */
export const EmojiPicker: React.FC<{ mine?: string; onPick: (emoji: string) => void; dark?: boolean }> = ({ mine, onPick, dark }) => (
  <div className={`df-pop inline-flex items-center gap-0.5 rounded-full px-1.5 py-1 shadow-xl border ${dark ? 'bg-[#0f1b2d] border-slate-700' : 'bg-white border-slate-200'}`}>
    {REACTION_EMOJIS.map((e, i) => (
      <button
        key={e}
        type="button"
        onClick={ev => { ev.stopPropagation(); onPick(e); }}
        style={{ animationDelay: `${i * 30}ms` }}
        className={`df-emoji-in w-10 h-10 rounded-full text-[22px] leading-none flex items-center justify-center cursor-pointer transition-transform hover:scale-125 active:scale-95 ${mine === e ? (dark ? 'bg-blue-500/30' : 'bg-blue-100') : ''}`}
        aria-label={`Réagir ${e}`}
      >
        {e}
      </button>
    ))}
  </div>
);

/** Pastilles « 👍 3 » sous un message ou un commentaire. Toucher une pastille ajoute ou retire ma réaction. */
export const ReactionChips: React.FC<{ reactions?: Record<string, string[]>; meId: string; onToggle: (emoji: string) => void; dark?: boolean; align?: 'start' | 'end' }> = ({ reactions, meId, onToggle, dark, align = 'start' }) => {
  const entries = Object.entries(reactions || {}).filter(([, ids]) => ids.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {entries.map(([e, ids]) => {
        const mine = ids.includes(meId);
        return (
          <button
            key={`${e}-${ids.length}-${mine}`}
            type="button"
            onClick={ev => { ev.stopPropagation(); onToggle(e); }}
            className={`df-chip-pop inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              mine
                ? 'bg-blue-600/15 border-blue-500 text-blue-600'
                : dark ? 'bg-white/5 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <span className="text-sm leading-none">{e}</span>
            {ids.length > 1 && <span>{ids.length}</span>}
          </button>
        );
      })}
    </div>
  );
};

/** Trois points qui rebondissent : « est en train d'écrire… » */
export const TypingDots: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
    <span className="df-dot" style={{ animationDelay: '0ms' }} />
    <span className="df-dot" style={{ animationDelay: '150ms' }} />
    <span className="df-dot" style={{ animationDelay: '300ms' }} />
  </span>
);
