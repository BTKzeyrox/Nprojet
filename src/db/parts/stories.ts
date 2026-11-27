// Magasin de données : stories (24 h). Passe par le serveur (routes story-*), jamais par la synchro habituelle.
// Utilisé par : db/store.ts, components/Stories.tsx. Pour modifier : changer ici ; en démonstration tout reste en mémoire.
import { defineMethods } from './define';
import { canPostStory, canSeeNews, pickAudience, type NewsRole } from '../../utils/newsAccess';
import { STORY_BG, STORY_MAX_TEXT, type StoryItem } from '../../utils/stories';
import type { NewsAttachment } from '../../types';

let demoStories: StoryItem[] = []; // démonstration : en mémoire seulement

export interface StoryDraft { kind: 'photo' | 'text'; text: string; bg: string; files?: NewsAttachment[]; audience?: NewsRole[]; audience_users?: string[] }

export const storiesMethods = defineMethods({
  async storiesFetch(): Promise<{ stories: StoryItem[]; can_post: boolean } | null> {
    const me = this.getCurrentUser();
    if (!me) return null;
    if (this.demo) {
      const now = Date.now();
      demoStories = demoStories.filter(s => new Date(s.expires_at).getTime() > now);
      return { stories: demoStories.filter(s => canSeeNews({ author_id: s.author_id, audience: s.audience, audience_users: s.audience_users }, me)), can_post: canPostStory(me, this.getSettings().news_publish) };
    }
    if (!this.token) return null;
    const r = await this.api('story-list');
    return r.ok && r.data && Array.isArray(r.data.stories) ? { stories: r.data.stories, can_post: !!r.data.can_post } : null;
  },
  async storyCreate(p: StoryDraft): Promise<{ ok: boolean; error?: string }> {
    const me = this.getCurrentUser();
    if (!me) return { ok: false, error: 'Connecte-toi d’abord.' };
    const text = p.text.trim().slice(0, STORY_MAX_TEXT);
    if (p.kind === 'text' && !text) return { ok: false, error: 'Écris un texte.' };
    if (p.kind === 'photo' && !(p.files || []).some(f => f.kind === 'image')) return { ok: false, error: 'Ajoute une photo.' };
    if (this.demo) {
      if (!canPostStory(me, this.getSettings().news_publish)) return { ok: false, error: 'Le responsable ne t’a pas autorisé à publier une story.' };
      const now = Date.now(), f = (p.files || []).find(x => x.kind === 'image');
      demoStories = [...demoStories, {
        id: `story-${now}`, author_id: me.id, author_name: me.name, author_role: me.role, kind: p.kind, text, bg: STORY_BG.includes(p.bg) ? p.bg : STORY_BG[0],
        file: p.kind === 'photo' && f ? { url: f.url, name: f.name } : null, created_at: new Date(now).toISOString(), expires_at: new Date(now + 24 * 3600 * 1000).toISOString(), seen: true, viewers: [], ...pickAudience(p.audience, p.audience_users),
      }];
      return { ok: true };
    }
    const r = await this.api('story-create', { method: 'POST', body: JSON.stringify({ kind: p.kind, text, bg: p.bg, files: p.files || [], audience: p.audience || [], audience_users: p.audience_users || [] }) });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Impossible de publier la story. Réessaie.' };
  },
  async storySeen(id: string): Promise<void> {
    const me = this.getCurrentUser();
    if (!me) return;
    if (this.demo) {
      demoStories = demoStories.map(s => s.id === id && s.author_id !== me.id && !(s.viewers || []).some(v => v.id === me.id) ? { ...s, viewers: [...(s.viewers || []), { id: me.id, name: me.name, at: new Date().toISOString() }] } : s);
      return;
    }
    await this.api('story-seen', { method: 'POST', body: JSON.stringify({ id }) });
  },
  async storyDelete(id: string): Promise<boolean> {
    if (this.demo) { demoStories = demoStories.filter(s => s.id !== id); return true; }
    return (await this.api('story-delete', { method: 'POST', body: JSON.stringify({ id }) })).ok;
  },
});
export type StoriesMethods = typeof storiesMethods;
