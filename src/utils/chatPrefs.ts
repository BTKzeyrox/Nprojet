// Préférences de messagerie propres à chaque personne, gardées sur son appareil :
// « Supprimer pour moi » et « Cacher la conversation » (comme WhatsApp).
const key = (kind: string, uid: string) => `df_chat_${kind}_${uid}`;

const readJson = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou bloqué : on ignore */ }
};

export const getHiddenMessages = (uid: string): Set<string> => new Set(readJson<string[]>(key('hidden', uid), []));
export const hideMessageForMe = (uid: string, msgId: string): void => {
  const s = getHiddenMessages(uid);
  s.add(msgId);
  writeJson(key('hidden', uid), [...s].slice(-2000));
};

// Conversation cachée : on retient l'heure ; elle revient seule si un message plus récent arrive
export const getArchivedThreads = (uid: string): Record<string, number> => readJson<Record<string, number>>(key('archived', uid), {});
export const setThreadArchived = (uid: string, thread: string, archived: boolean): void => {
  const m = getArchivedThreads(uid);
  if (archived) m[thread] = Date.now();
  else delete m[thread];
  writeJson(key('archived', uid), m);
};
