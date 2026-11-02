// Réglages synchronisés par compte (BTK, 2026-11-02) : le même compte retrouve les mêmes réglages sur tous ses appareils et navigateurs.
// Règles pures (sans écran ni réseau) ; la copie serveur (bloc PREFS de df-api) est comparée par scripts/check-prefs-sync.ts.
// ===== BEGIN PREFS (copie dans supabase/functions/df-api/index.ts) =====
const PREF_NAMES = ['theme', 'lang', 'font', 'sound', 'sidebar', 'stats_gran', 'stock_space', 'health_notif', 'watch', 'chat_hidden', 'chat_archived', 'chat_pinthreads', 'chat_seen', 'availability', 'ai_optin'];
const PREF_MAX_LEN = 6000;
const PREF_BIG: Record<string, number> = { chat_hidden: 60000, chat_seen: 20000, chat_archived: 12000 }; // listes plus longues : messages supprimés pour moi, dernières lectures, conversations cachées
/** Ne garde que les réglages connus avec une valeur texte courte ; null = effacer. Tout le reste est ignoré. */
function cleanPrefs(input: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const name of PREF_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(input, name)) continue;
    const v = (input as Record<string, unknown>)[name];
    if (v === null) out[name] = null;
    else if (typeof v === 'string' && v.length <= (PREF_BIG[name] || PREF_MAX_LEN)) out[name] = v;
  }
  return out;
}
// ===== END PREFS =====

export { PREF_NAMES, cleanPrefs };

/** Clé du stockage de l'appareil pour un réglage (certains sont propres à chaque compte). */
export const localKeyOf = (name: string, uid: string): string | null => ({
  theme: 'delta_theme', lang: 'delta_lang', font: 'gp_font_size', sound: 'df_notif_sound', sidebar: 'df_sb_collapsed', stats_gran: 'stats_gran', stock_space: 'df_stock_space',
  health_notif: `df_notif_health_${uid}`, watch: `df_watch_${uid}`,
  chat_hidden: `df_chat_hidden_${uid}`, chat_archived: `df_chat_archived_${uid}`, chat_pinthreads: `df_chat_pinthreads_${uid}`, chat_seen: `df_chat_seen_${uid}`, availability: `df_presence_${uid}`, ai_optin: `df_ai_optin_${uid}`,
} as Record<string, string>)[name] || null;
export const nameOfLocalKey = (key: string, uid: string): string | null => PREF_NAMES.find(n => localKeyOf(n, uid) === key) || null;

/** Compare le serveur et l'appareil : ce qu'il faut écrire sur l'appareil (le serveur gagne) et ce qu'il faut envoyer (réglage seulement sur l'appareil). */
export function planPrefsSync(server: Record<string, string | null>, local: Record<string, string | null>): { toLocal: Record<string, string>; toServer: Record<string, string> } {
  const toLocal: Record<string, string> = {}, toServer: Record<string, string> = {};
  const s = cleanPrefs(server), l = cleanPrefs(local);
  for (const n of PREF_NAMES) {
    const sv = s[n], lv = l[n];
    if (typeof sv === 'string') { if (sv !== lv) toLocal[n] = sv; }
    else if (typeof lv === 'string') toServer[n] = lv;
  }
  return { toLocal, toServer };
}

