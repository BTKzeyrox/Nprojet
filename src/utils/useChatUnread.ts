import { useEffect, useState } from 'react';
import { db } from '../db/store';
import { User } from '../types';
import { buildNotifications, SEEN_EVENT } from './notifications';

// Nombre de nouveaux messages non lus (pastille rouge sur l'icône Messages)
export const useChatUnread = (user?: User | null): number => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) { setN(0); return; }
    const calc = () => setN(buildNotifications(user).filter(x => x.id.startsWith('msg-')).length);
    calc();
    const off = db.subscribe(calc);
    window.addEventListener(SEEN_EVENT, calc);
    return () => { off(); window.removeEventListener(SEEN_EVENT, calc); };
  }, [user?.id]);
  return n;
};
