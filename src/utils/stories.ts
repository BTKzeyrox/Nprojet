// Stories (24 h) des Actualités : type, couleurs de fond, durée d'une story et regroupement par auteur.
// Utilisé par : db/parts/stories.ts, components/Stories.tsx. Pour modifier : STORY_BG (palette, doit rester identique à celle du serveur), STORY_SECONDS (durée d'affichage).
export interface StoryItem {
  id: string; author_id: string; author_name: string; author_role: string; kind: 'photo' | 'text'; text: string; bg: string;
  file: { url: string; name: string } | null; created_at: string; expires_at: string; seen: boolean;
  audience?: string[]; audience_users?: string[]; viewers?: { id: string; name: string; at: string }[];
}
export const STORY_BG = ['#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#c2410c', '#15803d', '#334155', '#a16207'];
export const STORY_SECONDS = 5;
export const STORY_MAX_TEXT = 280;

export interface StoryGroup { author_id: string; author_name: string; stories: StoryItem[]; allSeen: boolean; mine: boolean }

/** Une rangée par auteur : mes stories d'abord, puis les auteurs avec du nouveau, puis ceux déjà vus. Dans chaque groupe, de la plus ancienne à la plus récente. */
export function groupStories(list: StoryItem[], myId: string): StoryGroup[] {
  const by = new Map<string, StoryItem[]>();
  for (const s of [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) by.set(s.author_id, [...(by.get(s.author_id) || []), s]);
  const groups = [...by.entries()].map(([author_id, stories]) => ({ author_id, author_name: stories[0].author_name, stories, allSeen: stories.every(s => s.seen), mine: author_id === myId }));
  const rank = (g: StoryGroup) => (g.mine ? 0 : g.allSeen ? 2 : 1);
  return groups.sort((a, b) => rank(a) - rank(b) || (a.stories[a.stories.length - 1].created_at < b.stories[b.stories.length - 1].created_at ? 1 : -1));
}
/** Dans un groupe, on commence à la première story pas encore vue (ou à la première si tout est vu). */
export const firstUnseen = (g: StoryGroup): number => { const i = g.stories.findIndex(s => !s.seen); return i < 0 ? 0 : i; };
export const storyLeft = (s: StoryItem, now = Date.now()): string => {
  const ms = new Date(s.expires_at).getTime() - now;
  if (!(ms > 0)) return '0 min';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h` : `${Math.max(1, m)} min`;
};
