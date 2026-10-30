import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { db } from '../db/store';
import type { User } from '../types';
import { madaClock, accessEndMs } from '../utils/accessRequest';

const WARN_MIN = 15;
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Compte à rebours avant la déconnexion : décidée par le responsable (rouge) ou automatique à la fin des horaires (orange, 15 dernières minutes). */
export const AccessBanner: React.FC<{ user: User }> = ({ user }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const forced = user.force_logout_at ? Date.parse(user.force_logout_at) : 0;
  const forcedLeft = forced - now;
  const end = forced > now ? null : accessEndMs(user, db.getSettings(), now);
  const left = end === null ? Infinity : end - now;
  const open = db.getPosts().some(p => p.employee_id === user.id && ['pending_start', 'active', 'pending_end'].includes(p.status));
  if (forcedLeft > 0) {
    return <div role="status" data-access-banner="forced" style={{ top: "calc(62px + var(--vvt, 0px))" }} className="fixed left-2 right-2 z-[60] shadow-lg px-3 py-2 rounded-xl border border-red-500/70 bg-red-950/80 text-red-100 text-xs font-bold flex items-center gap-2"><Clock className="w-4 h-4 shrink-0" />Le responsable va te déconnecter dans {mmss(forcedLeft)}.{open ? ' Ta mission en cours est gardée.' : ''}</div>;
  }
  if (left > 0 && left <= WARN_MIN * 60000) {
    return <div role="status" data-access-banner="auto" style={{ top: "calc(62px + var(--vvt, 0px))" }} className="fixed left-2 right-2 z-[60] shadow-lg px-3 py-2 rounded-xl border border-amber-500/70 bg-amber-950/80 text-amber-100 text-xs font-bold flex items-center gap-2"><Clock className="w-4 h-4 shrink-0" />{open ? `Fin de ton accès à ${madaClock(end as number)} (dans ${mmss(left)}). Ta mission en cours est gardée.` : `Déconnexion automatique à ${madaClock(end as number)} (dans ${mmss(left)}).`}</div>;
  }
  return null;
};
