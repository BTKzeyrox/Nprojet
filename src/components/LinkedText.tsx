import React from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { splitLinks, linkLabel, newsIdFromNav } from '../utils/newsLink';
import type { DeepLink } from '../utils/deepLink';

/** Texte de message : les liens vers une page de CE site s'affichent comme un bouton au nom propre (« Voir la publication ») au lieu de l'adresse longue. L'adresse reste dans le message (copier/coller, autres applis). */
export const LinkedText: React.FC<{ text: string; lang?: 'fr' | 'en'; onOpen?: (link: DeepLink) => void }> = ({ text, lang = 'fr', onOpen }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <>
      {splitLinks(text, origin).map((part, i) => {
        if (part.kind === 'text') return <React.Fragment key={i}>{part.text}</React.Fragment>;
        const Icon = newsIdFromNav(part.link.nav) ? Newspaper : ExternalLink;
        return (
          <a key={i} href={part.text} data-msg-link title={linkLabel(part.link, lang)}
            onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); onOpen?.(part.link); }}
            onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 my-1 px-3 min-h-[38px] rounded-lg bg-white hover:bg-slate-100 text-slate-900 ring-1 ring-slate-300 shadow-sm text-[0.8125rem] font-bold no-underline cursor-pointer align-middle">
            <Icon className="w-4 h-4 shrink-0 text-emerald-600" />{linkLabel(part.link, lang)}
          </a>
        );
      })}
    </>
  );
};
