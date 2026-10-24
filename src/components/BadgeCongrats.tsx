import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { badgeAccess, usePerformance } from '../utils/usePerformance';
import { badgesToCelebrate, congratsText, readSeen } from '../utils/recognition';
import { showToast } from './ToastHost';

// Félicitations d'un salarié pour un nouveau badge (module 3, M3.7). N'affiche rien : un petit message « Bravo ! » en bas de l'écran.
// La mémoire des badges déjà vus reste sur l'appareil (règles dans src/utils/recognition.ts). Rien n'est envoyé au serveur.
// On n'agit qu'une fois les missions du salarié arrivées : avant, on ne mémorise rien (sinon de faux messages à la fin du chargement).
export const BadgeCongrats: React.FC = () => {
  const { lang } = useApp();
  const { res } = usePerformance();
  const me = db.getCurrentUser();
  const meId = me && me.role === 'employee' ? me.id : null;

  useEffect(() => {
    if (!meId) return;
    const access = badgeAccess();
    if (!access.enabled || !access.seesBadges) return;
    const mine = res.employees.get(meId);
    if (!mine || !db.getPosts().some(p => p.employee_id === meId)) return;
    const key = `df_badges_seen:${meId}`;
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* stockage indisponible : on ne félicite pas */ return; }
    const { celebrate, next } = badgesToCelebrate(readSeen(raw), mine.badges);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { return; }
    const timers = celebrate.map((b, i) => window.setTimeout(() => showToast(congratsText(b, lang), 'success'), i * 4200));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [res, meId, lang]);

  return null;
};
