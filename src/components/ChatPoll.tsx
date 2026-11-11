// Sondage dans une discussion ou un groupe (messagerie S1, 2026-11-09) : carte SANS bulle autour, avec contour et ombre (BTK 2026-11-09), de taille fixe : elle ne bouge pas quand on vote. + fenêtre de création.
// Règles : utils/pollRules.ts (2 à 6 choix, un vote par personne, changer ou retirer son vote). Ici les votes sont visibles de tous les participants (comme dans une messagerie).
// Utilisé par : ChatView.tsx. Le serveur (checkMessage de df-api) refait les mêmes vérifications. Aucun autre appel réseau.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, CalendarDays, Eye, Plus, X } from 'lucide-react';
import type { ChatMessage, NewsPost, User } from '../types';
import { db } from '../db/store';
import PollBlock from './PollBlock';
import { POLL_MAX_OPTIONS, POLL_MAX_DATES, POLL_MAX_OPTION, POLL_MAX_QUESTION } from '../utils/pollRules';

/** Icône du type de sondage (date, « J'ai lu », sondage) : titre de la carte, liste des discussions, message épinglé. */
export const PollKindIcon: React.FC<{ kind?: string; size?: string }> = ({ kind, size = 'w-4 h-4' }) => {
  const I = kind === 'date' ? CalendarDays : kind === 'ack' ? Eye : BarChart3;
  return <I data-poll-kind-icon className={`inline-block ${size} mr-1.5 -mt-0.5 align-middle opacity-80`} aria-hidden="true" />;
};

export const ChatPoll: React.FC<{ msg: ChatMessage; meId: string; isAdmin: boolean; light: boolean; users: User[] }> = ({ msg, meId, isAdmin, light, users }) => {
  const [err, setErr] = useState<string | null>(null);
  if (!msg.poll || msg.deleted_at) return null;
  const canClose = msg.sender_id === meId || isAdmin;
  const post = { id: msg.id, status: 'published', poll: { ...msg.poll } } as unknown as NewsPost;
  return (
    <div data-chat-poll={msg.id} className={`space-y-1.5 w-72 max-w-full rounded-2xl border p-3 ${light ? 'bg-white text-slate-900 border-slate-300 shadow-[0_4px_16px_rgba(15,23,42,0.3)]' : 'bg-[#0f1722] text-slate-100 border-slate-600 shadow-[0_4px_18px_rgba(0,0,0,0.75)]'}`}>
      <div className="font-semibold text-sm break-words"><PollKindIcon kind={msg.poll.kind} />{msg.poll.question}</div>
      <PollBlock post={post} meId={meId} isAdmin={msg.sender_id === meId} light={light} busy={false} fixed users={users} onVote={optionId => { const r = db.voteMessage(msg.id, meId, optionId); setErr(r.success ? null : r.error || 'Vote impossible.'); }} />
      {err && <div role="alert" className="text-xs text-red-500">{err}</div>}
      {canClose && <button type="button" data-chat-poll-close onClick={() => db.setMessagePollClosed(msg.id, meId, !msg.poll!.closed)} className="min-h-[36px] text-xs underline cursor-pointer">{msg.poll.closed ? 'Rouvrir' : 'Clore'}</button>}
    </div>
  );
};

type Kind = 'poll' | 'date' | 'ack';
const TITLE: Record<Kind, string> = { poll: 'Nouveau sondage', date: 'Choix de date', ack: 'Confirmation de lecture' };

/** Fenêtre de création : sondage (2 à 6 choix, raccourci Oui / Non), choix de date (2 à 10 dates) ou « J'ai lu » (juste un texte). */
export const PollComposer: React.FC<{ kind: Kind; light: boolean; onClose: () => void; onSend: (poll: { question: string; options: string[]; kind: Kind }) => void }> = ({ kind, light, onClose, onSend }) => {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<string[]>(['', '']);
  const max = kind === 'date' ? POLL_MAX_DATES : POLL_MAX_OPTIONS;
  const clean = opts.map(o => o.trim()).filter(Boolean);
  const unique = new Set(clean.map(o => o.toLowerCase())).size === clean.length;
  const valid = q.trim().length > 0 && (kind === 'ack' || (clean.length >= 2 && unique));
  const field = `w-full rounded-lg border px-3 py-2 text-base ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#141e2a] border-slate-700 text-white'}`;
  return createPortal(
    <div data-poll-composer={kind} className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-label={TITLE[kind]} onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-2xl border shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto ${light ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100'}`}>
        <div className="flex items-center justify-between"><h2 className="font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-500" />{TITLE[kind]}</h2><button type="button" aria-label="Fermer" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button></div>
        {kind === 'poll' && <button type="button" data-poll-yesno onClick={() => setOpts(['Oui', 'Non'])} className={`min-h-[44px] px-3 rounded-lg border text-sm font-semibold cursor-pointer ${light ? 'border-slate-300' : 'border-slate-600'}`}>Raccourci : Oui / Non</button>}
        <input data-poll-question value={q} maxLength={POLL_MAX_QUESTION} onChange={e => setQ(e.target.value)} placeholder={kind === 'ack' ? 'Message à lire (ex. : nouvelle consigne)' : kind === 'date' ? 'Ex. : Quel jour pour la réunion ?' : 'Ta question'} className={field} />
        {kind !== 'ack' && opts.map((o, i) => (
          <input key={i} data-poll-opt value={o} maxLength={POLL_MAX_OPTION} onChange={e => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={kind === 'date' ? `Date ${i + 1} (ex. : lundi 10)` : `Choix ${i + 1}`} className={field} />
        ))}
        {kind !== 'ack' && opts.length < max && <button type="button" data-poll-add onClick={() => setOpts([...opts, ''])} className="min-h-[44px] flex items-center gap-1 text-sm font-semibold cursor-pointer text-emerald-600"><Plus className="w-4 h-4" />{kind === 'date' ? 'Ajouter une date' : 'Ajouter un choix'}</button>}
        {kind !== 'ack' && !unique && <p className="text-xs text-red-500">Deux choix identiques : change l'un des deux.</p>}
        <p className="text-xs opacity-70">{kind === 'ack' ? "Chacun touche « J'ai lu » ; seul toi vois qui a lu." : 'Tous voient les résultats ; seul toi vois les noms.'}</p>
        <button type="button" data-poll-send disabled={!valid} onClick={() => onSend({ question: q.trim(), options: kind === 'ack' ? [] : clean, kind })} className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer">Envoyer</button>
      </div>
    </div>,
    document.body,
  );
};
