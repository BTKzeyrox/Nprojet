import React from 'react';
import { Clock, WifiOff } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useIsOffline, useUnsentTick } from '../utils/useOfflineStatus';
import { ONLINE_ONLY_WHY, pick } from '../utils/offlineText';

/** Petite marque « En attente » sur un élément modifié ici et pas encore reçu par le serveur (disparaît toute seule dès qu'il est envoyé). */
export const PendingMark: React.FC<{ col: string; id: string; className?: string }> = ({ col, id, className = '' }) => {
  const { lang } = useApp();
  useUnsentTick();
  if (!db.isUnsent(col, id)) return null;
  const label = lang === 'en' ? 'Waiting to be sent' : 'En attente d\'envoi';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-950/60 text-amber-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none ${className}`} title={label} data-testid="pending-mark">
      <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />{lang === 'en' ? 'Waiting' : 'En attente'}
    </span>
  );
};

/**
 * Pour une action qui demande le réseau (paiement, compte, numéro de facture…) : `blocked` pour griser le bouton, `why` pour dire pourquoi.
 * Jamais un bouton grisé sans explication.
 */
export function useOnlineOnly(kind: keyof typeof ONLINE_ONLY_WHY): { blocked: boolean; why: string } {
  const { lang } = useApp();
  const blocked = useIsOffline();
  return { blocked, why: pick(ONLINE_ONLY_WHY[kind], lang) };
}

/** Phrase sous un bouton grisé hors ligne : « pourquoi » (rien ne s'affiche en ligne). */
export const OnlineOnlyNote: React.FC<{ kind: keyof typeof ONLINE_ONLY_WHY; className?: string }> = ({ kind, className = '' }) => {
  const { blocked, why } = useOnlineOnly(kind);
  if (!blocked) return null;
  return <p className={`text-[11px] text-amber-300 flex items-start gap-1.5 ${className}`} role="note" data-testid="online-only-note"><WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /><span>{why}</span></p>;
};
