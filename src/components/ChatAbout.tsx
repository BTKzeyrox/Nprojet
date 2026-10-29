import React from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, Info, MessageSquare, Pin, PinOff, UserRound, Users, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { useApp } from '../context/AppContext';
import type { About, AboutAction, AboutThread } from '../utils/chatAbout';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';

// Fiche « À propos » (messagerie) : on touche le petit rond de profil, on voit qui c'est et ce qu'on peut faire. Règles dans utils/chatAbout.ts.
const LABEL: Record<AboutAction, { fr: string; en: string }> = {
  write: { fr: 'Écrire', en: 'Write' },
  pin: { fr: 'Épingler la discussion', en: 'Pin the chat' },
  unpin: { fr: 'Désépingler la discussion', en: 'Unpin the chat' },
  hide: { fr: 'Cacher la discussion', en: 'Hide the chat' },
  show: { fr: 'Afficher de nouveau la discussion', en: 'Show the chat again' },
  full_profile: { fr: 'Voir le profil complet', en: 'See the full profile' },
  group_info: { fr: 'Infos du groupe', en: 'Group info' },
};
const ICON: Record<AboutAction, React.ComponentType<{ className?: string }>> = { write: MessageSquare, pin: Pin, unpin: PinOff, hide: Archive, show: ArchiveRestore, full_profile: UserRound, group_info: Info };

export const ChatAbout: React.FC<{ thread: AboutThread; about: About; onAction: (a: AboutAction) => void; onClose: () => void }> = ({ thread, about, onAction, onClose }) => {
  const { lang } = useApp();
  const en = lang === 'en';
  useLockBodyScroll(true);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose} data-chat-about>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-slate-700 bg-[#0f1722] text-white shadow-2xl" role="dialog" aria-modal="true" aria-label={en ? 'About' : 'À propos'} onClick={e => e.stopPropagation()}>
        <div className="p-4 flex items-center gap-3 border-b border-slate-700">
          {thread.kind === 'user' && thread.user
            ? <Avatar src={thread.user.avatar_url} name={thread.title} className="w-16 h-16 rounded-full" />
            : <span className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center shrink-0"><Users className="w-7 h-7 text-white" /></span>}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-emerald-300 font-semibold">{en ? 'About' : 'À propos'}</div>
            <div className="font-bold text-lg leading-tight break-words">{about.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={en ? 'Close' : 'Fermer'} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <dl className="px-4 py-3 space-y-1.5 text-sm" data-about-facts>
          {about.facts.map(f => (
            <div key={f.label} className="flex justify-between gap-3"><dt className="text-slate-400">{f.label}</dt><dd className="font-medium text-right break-words">{f.value}</dd></div>
          ))}
        </dl>
        <div className="border-t border-slate-700">
          {about.actions.map(a => {
            const Icon = ICON[a];
            return (
              <button key={a} type="button" data-about-action={a} onClick={() => onAction(a)} className="w-full min-h-[48px] px-4 flex items-center gap-2.5 text-sm text-left cursor-pointer hover:bg-white/5">
                <Icon className="w-4 h-4 text-emerald-400" /> {en ? LABEL[a].en : LABEL[a].fr}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};
