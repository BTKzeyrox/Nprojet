// Horloge locale : fait redessiner l'écran toutes les `ms` pour que les statuts « en direct » changent d'eux-mêmes (En ligne → En pause → Hors ligne)
// même quand plus aucune donnée n'arrive du serveur. Minuteur LOCAL : il ne parle pas au serveur (voir la liste des minuteurs connus dans check-speed.ts).
import { useEffect, useState } from 'react';

export function useNow(ms = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
