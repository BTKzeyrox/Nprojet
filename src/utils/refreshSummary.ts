// Résumé après « tirer pour actualiser » : ce qui est arrivé (publications, messages, autres notifications), « À jour », ou « Pas de réseau ». Règles pures, sans écran.
// Utilisé par : components/PullToRefresh.tsx. Contrôlé par `npm run check:refresh-summary`. Les identifiants viennent de buildNotifications (utils/notifications.ts) : `news-`/`newsp-` = publications, `msg-` = messages, le reste = notifications.
export type RefreshKind = 'new' | 'uptodate' | 'offline' | 'update';
export interface RefreshResult { kind: RefreshKind; text: string; news: number; messages: number; other: number }

const isNews = (id: string) => id.startsWith('news-') || id.startsWith('newsp-');
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** `before` / `after` : identifiants des notifications avant et après le rechargement ; `ok` : le serveur a répondu ; `newVersion` : une nouvelle version du site est annoncée. */
export function summarizeRefresh(before: string[], after: string[], ok: boolean, newVersion: boolean, en = false): RefreshResult {
  if (!ok) return { kind: 'offline', text: en ? 'No network: try again in a moment.' : 'Pas de réseau : réessaie dans un instant.', news: 0, messages: 0, other: 0 };
  const had = new Set(before);
  const fresh = Array.from(new Set(after)).filter(id => !had.has(id));
  const news = fresh.filter(isNews).length, messages = fresh.filter(id => id.startsWith('msg-')).length, other = fresh.length - news - messages;
  const parts: string[] = [];
  if (news) parts.push(en ? plural(news, 'new post', 'new posts') : plural(news, 'nouvelle publication', 'nouvelles publications'));
  if (messages) parts.push(en ? plural(messages, 'new message', 'new messages') : plural(messages, 'nouveau message', 'nouveaux messages'));
  if (other) parts.push(en ? plural(other, 'notification', 'notifications') : plural(other, 'notification', 'notifications'));
  if (newVersion) parts.push(en ? 'new site version: updating' : 'nouvelle version du site : mise à jour');
  if (parts.length) return { kind: newVersion && !fresh.length ? 'update' : 'new', text: parts.join(' · '), news, messages, other };
  return { kind: 'uptodate', text: en ? 'Up to date' : 'À jour', news: 0, messages: 0, other: 0 };
}
