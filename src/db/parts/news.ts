// Magasin de données : Fil d'actualité.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { pollClean, pollCounts } from '../../utils/pollRules';
import { canEditNews, canSeeNews, pickAudience, cleanNewsPolicy, type NewsPolicy, type NewsRole } from '../../utils/newsAccess';
import { NewsPost, NewsAttachment } from '../../types';
import { SORTERS } from '../storeShared';

export const newsMethods = defineMethods({

  getNews(): NewsPost[] {
    return this.news.filter(n => canSeeNews(n, this.currentUser)); // même tri que le serveur : seulement les publications de son public
  },

  /** Réglage « Publications des équipes » (qui peut publier et modifier). */
  getNewsPolicy(): NewsPolicy { return cleanNewsPolicy(this.getSettings().news_publish); },

  // Le responsable publie (envoyé au serveur avec la synchro habituelle)
  publishNews(p: { title: string; text: string; pinned?: boolean; files?: NewsAttachment[]; audience?: NewsRole[]; audience_users?: string[]; poll?: { question: string; options: string[]; kind?: 'poll' | 'date' | 'ack' } }): { success: boolean; error?: string } {
    const me = this.currentUser;
    if (!me || me.role !== 'admin') return { success: false, error: 'Réservé au responsable.' };
    const text = p.text.trim();
    const files = p.files || [];
    if (!text && files.length === 0) return { success: false, error: 'Écris un texte ou joins un fichier.' };
    const poll = p.poll ? pollClean(p.poll) : null; // sondage : question + 2 à 6 choix ; les votes partent de zéro
    if (p.poll && !poll) return { success: false, error: p.poll.kind === 'ack' ? 'Une confirmation de lecture demande un texte.' : p.poll.kind === 'date' ? 'Un choix de date demande une question et 2 à 10 dates différentes.' : 'Un sondage demande une question et 2 à 6 choix différents.' };
    const rec: NewsPost = {
      id: `news-${Date.now()}`, author_id: me.id, author_name: 'Responsable', author_role: 'admin', title: p.title.trim().slice(0, 120),
      text: text.slice(0, 2000), created_at: new Date().toISOString(), pinned: !!p.pinned, status: 'published', files,
      loves: [], comments: [], shares: 0, ...pickAudience(p.audience, p.audience_users),
      ...(poll ? { poll: { ...poll, counts: pollCounts(poll) } } : {}),
    };
    this.news = [rec, ...this.news].sort(SORTERS.news!);
    this.notify();
    return { success: true };
  },

  // L'employé propose une publication : le serveur la garde « en attente » jusqu'à la décision du responsable
  submitNews(p: { title: string; text: string; files?: NewsAttachment[]; audience?: NewsRole[]; audience_users?: string[] }) {
    return this.newsCall('news-submit', { title: p.title, text: p.text, files: p.files || [], audience: p.audience || [], audience_users: p.audience_users || [] });
  },

  // Modifier une publication déjà publiée (texte, titre, public, fichiers) : le responsable ou son auteur si le responsable l'a autorisé. Tout passe par le serveur, qui vérifie le droit et supprime les fichiers retirés.
  async editNews(id: string, p: { title: string; text: string; audience?: NewsRole[]; audience_users?: string[]; files?: NewsAttachment[] }): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    const n = this.news.find(x => x.id === id);
    if (!me || !n) return { success: false, error: 'Publication introuvable.' };
    if (!canEditNews(n, me, this.getNewsPolicy())) return { success: false, error: 'Tu ne peux pas modifier cette publication.' };
    const text = p.text.trim().slice(0, 2000), title = p.title.trim().slice(0, 120);
    const files = p.files ?? (n.files || []);
    if (!text && files.length === 0) return { success: false, error: 'Écris un texte ou garde un fichier.' };
    return this.newsCall('news-edit', { id, title, text, audience: p.audience || [], audience_users: p.audience_users || [], files });
  },

  // Supprimer une publication déjà publiée : le responsable (synchro habituelle) ou son auteur si le responsable l'a autorisé (route du serveur)
  async deleteNewsPost(id: string): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    const n = this.news.find(x => x.id === id);
    if (!me || !n) return { success: false, error: 'Publication introuvable.' };
    if (me.role === 'admin') { this.deleteNews(id); return { success: true }; }
    if (!canEditNews(n, me, this.getNewsPolicy())) return { success: false, error: 'Tu ne peux pas supprimer cette publication.' };
    const r = await this.api('news-delete', { method: 'POST', body: JSON.stringify({ id }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Action impossible. Réessaie.' };
    this.news = this.news.filter(x => x.id !== id);
    this.synced.news.delete(id);
    this.emit();
    return { success: true };
  },

  // Le responsable valide ou refuse une publication en attente (motif obligatoire au refus)
  decideNews(id: string, decision: 'approve' | 'reject', reason?: string) {
    return this.newsCall('news-decision', { id, decision, reason: reason || '' });
  },

  // L'auteur retire sa publication tant qu'elle n'est pas validée
  async withdrawNews(id: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.api('news-withdraw', { method: 'POST', body: JSON.stringify({ id }) });
    if (!r.ok) return { success: false, error: r.data?.error || 'Action impossible. Réessaie.' };
    this.news = this.news.filter(x => x.id !== id);
    this.synced.news.delete(id);
    this.emit();
    return { success: true };
  },

  togglePinNews(id: string) {
    const n = this.news.find(x => x.id === id);
    if (!n || this.currentUser?.role !== 'admin') return;
    this.news = this.news.map(x => (x.id === id ? { ...x, pinned: !x.pinned } : x)).sort(SORTERS.news!);
    this.notify();
  },

  deleteNews(id: string) {
    if (this.currentUser?.role !== 'admin') return;
    this.news = this.news.filter(x => x.id !== id);
    this.notify();
  },

  // Actions des lecteurs : le serveur renvoie la publication à jour, on la remplace tout de suite
  applyNews(doc: NewsPost) {
    const list = this.news.filter(x => x.id !== doc.id);
    list.push(doc);
    list.sort(SORTERS.news!);
    this.news = list;
    this.synced.news.set(doc.id, JSON.stringify(doc));
    this.emit();
  },

  // « J'adore » : l'écran change tout de suite, puis le serveur confirme. En cas d'erreur, on revient en arrière.
  async toggleLoveNews(id: string): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    const n = this.news.find(x => x.id === id);
    if (!me || !n) return this.newsCall('news-react', { id });
    const before = n.loves;
    const after = before.includes(me.id) ? before.filter(x => x !== me.id) : [...before, me.id];
    this.news = this.news.map(x => (x.id === id ? { ...x, loves: after } : x));
    this.emit();
    const r = await this.newsCall('news-react', { id });
    if (!r.success) {
      this.news = this.news.map(x => (x.id === id ? { ...x, loves: before } : x));
      this.emit();
    }
    return r;
  },
  // Sondage : voter (un autre choix remplace, le même choix retire) et clore / rouvrir (responsable). Le serveur répond avec la vue de la personne.
  voteNews(id: string, option: string) { return this.newsCall('news-vote', { id, option }); },
  closePollNews(id: string, closed: boolean) { return this.newsCall('news-poll-close', { id, closed }); },
  commentNews(id: string, text: string, files?: NewsAttachment[], reply?: { parentId: string; replyToName: string }) { return this.newsCall('news-comment', { id, text, files: files || [], ...(reply ? { parentId: reply.parentId, replyToName: reply.replyToName } : {}) }); },
  deleteCommentNews(id: string, commentId: string) { return this.newsCall('news-comment-delete', { id, commentId }); },
  shareNews(id: string) { return this.newsCall('news-share', { id }); },
});

export type NewsMethods = typeof newsMethods;
