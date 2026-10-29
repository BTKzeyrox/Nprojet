import React from 'react';
import { LIVE_META, liveText, type LiveInfo } from '../utils/presenceStatus';

/** Petit point de statut posé en bas à droite d'une photo (pastille ronde). */
export const LiveDot: React.FC<{ info: LiveInfo; lang?: 'fr' | 'en'; ring?: string; className?: string }> = ({ info, lang = 'fr', ring = 'border-slate-900', className = '' }) => (
  <span title={liveText(info, lang)} aria-label={liveText(info, lang)} data-testid={`live-dot-${info.status}`}
    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${ring} ${LIVE_META[info.status].dot} ${info.status === 'working' ? 'animate-pulse' : ''} ${className}`} />
);

/** Ligne de statut : point + texte (« En ligne », « En pause · appli silencieuse depuis 12 min »…). */
export const LiveLine: React.FC<{ info: LiveInfo; lang?: 'fr' | 'en'; className?: string; short?: boolean }> = ({ info, lang = 'fr', className = '', short = false }) => (
  <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`} data-testid={`live-line-${info.status}`}>
    <span className={`w-2 h-2 rounded-full shrink-0 ${LIVE_META[info.status].dot} ${info.status === 'working' ? 'animate-pulse' : ''}`} aria-hidden="true" />
    <span className={`font-semibold ${LIVE_META[info.status].text}`}>{short ? LIVE_META[info.status][lang] : liveText(info, lang)}</span>
  </span>
);
