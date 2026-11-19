// Magasin de données : Messagerie et groupes de discussion.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { pollClean, pollApplyVote, pollPicks, pollMulti } from '../../utils/pollRules';
import { ChatMessage, ChatGroup, ChatRead } from '../../types';
import { planSharedMark, planVisibleTo, planEphemeral, EPHEMERAL_CHOICES } from '../../utils/chatShared';

export const chatMethods = defineMethods({

  getMessages(): ChatMessage[] {
    return [...this.messages];
  },
  sendMessage(params: {
    senderId: string;
    message: string;
    recipientId?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentKind?: 'image' | 'file';
    replyTo?: ChatMessage; // message cité
    albumId?: string; // photos envoyées ensemble
    sendAt?: number; // message programmé (ms)
    forwardedFrom?: string; // message transféré : auteur d'origine
    poll?: { question: string; options: string[]; kind?: 'poll' | 'date' | 'ack' }; // sondage (messagerie S1) : 2 à 6 choix, ou dates, ou « J'ai lu »
    visibleTo?: string[]; // « visible seulement par X » (M28.3) : mêmes règles que le serveur (chatShared)
  }): { success: boolean; error?: string } {
    const sender = this.users.find(u => u.id === params.senderId);
    const poll = params.poll ? pollClean(params.poll) : null;
    if (params.poll && !poll) return { success: false };
    if (!sender || (!params.message.trim() && !params.attachmentUrl && !poll)) return { success: false };

    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    const q = params.replyTo;
    let visibleTo: string[] | undefined;
    if (params.visibleTo && params.visibleTo.length) {
      if (poll) return { success: false, error: 'visible_to' };
      const grp = (params.recipientId || 'all') === 'all' ? null : this.groups.find(g => g.id === params.recipientId) || null;
      const eligible = grp ? grp.members : this.users.filter(u => u.status !== 'blocked').map(u => u.id);
      const pv = planVisibleTo(sender, grp, params.recipientId || 'all', params.visibleTo, eligible);
      if (!pv.ok) return { success: false, error: pv.error };
      visibleTo = pv.list;
    }
    if (q && Array.isArray(q.visible_to) && q.visible_to.length) visibleTo = [...new Set([...q.visible_to, q.sender_id])].filter(x => x !== sender.id); // répondre à un message restreint : même public
    const eph = this.getEphemeralMs(params.recipientId || 'all'); // mode éphémère de la discussion (le serveur le calcule de son côté)
    const nameOf = (id: string) => this.users.find(u => u.id === id)?.name || '?';

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender_id: sender.id,
      sender_name: sender.name,
      sender_role: sender.role,
      recipient_id: params.recipientId || 'all',
      message: poll ? `${poll.kind === 'date' ? '📅' : poll.kind === 'ack' ? '👁' : '📊'} ${poll.question}` : params.message.trim(),
      timestamp: timeStr,
      sent_ms: params.sendAt && params.sendAt > now.getTime() ? params.sendAt : now.getTime(),
      ...(params.sendAt && params.sendAt > now.getTime() && !poll ? { send_at: params.sendAt } : {}),
      ...(poll ? { poll } : {}),
      ...(eph && !poll ? { ephemeral_ms: eph, ...(params.sendAt && params.sendAt > now.getTime() ? {} : { expires_ms: now.getTime() + eph }) } : {}),
      ...(visibleTo && visibleTo.length ? { visible_to: visibleTo, visible_names: visibleTo.map(nameOf) } : {}),
      ...(q && !q.deleted_at
        ? { reply_to: { id: q.id, sender_name: q.sender_name, text: (q.message || '').slice(0, 140), has_attachment: !!q.attachment_url } }
        : {}),
      ...(params.attachmentUrl
        ? { attachment_url: params.attachmentUrl, attachment_name: params.attachmentName || 'fichier', attachment_kind: params.attachmentKind || 'file' }
        : {}),
      ...(params.albumId && params.attachmentUrl ? { album_id: String(params.albumId).slice(0, 40) } : {}),
      ...(params.forwardedFrom ? { forwarded: { from: String(params.forwardedFrom).slice(0, 40) } } : {}),
    };

    this.messages.push(newMsg);
    this.notify();
    return { success: true };
  },

  // Comme WhatsApp : on modifie et on épingle SEULEMENT ses propres messages (même l'admin)
  isOwnMessage(msg: ChatMessage, userId: string): boolean {
    return msg.sender_id === userId && !msg.deleted_at;
  },
  canEditMessage(msg: ChatMessage, userId: string): boolean {
    if (!this.isOwnMessage(msg, userId)) return false;
    if (!msg.message && msg.attachment_url && msg.attachment_kind) return !!msg.message; // une photo sans texte : rien à modifier
    return !msg.sent_ms || Date.now() - msg.sent_ms <= (this.constructor as typeof AppStore).EDIT_WINDOW_MS;
  },

  /** Voter dans un sondage de la discussion (même règle que les Actualités : sondage simple = un autre choix remplace, le même retire ; dates et « J'ai lu » = on ajoute ou retire chaque choix). Le serveur cache les noms : un participant garde seulement les comptes et SON vote ; l'auteur garde tout. */
  voteMessage(id: string, userId: string, optionId: string): { success: boolean; error?: string } {
    const msg = this.messages.find(m => m.id === id);
    const poll = msg?.poll;
    if (!msg || msg.deleted_at || !poll) return { success: false, error: 'Sondage introuvable.' };
    const before = pollPicks(poll.votes ? poll.votes[userId] : poll.my);
    const r = pollApplyVote({ question: poll.question, kind: poll.kind, options: poll.options, closed: !!poll.closed, votes: before.length ? { [userId]: pollMulti(poll) ? before : before[0] } : {} }, userId, optionId);
    if (!r.ok) return { success: false, error: r.error };
    const after = pollPicks(r.poll.votes[userId]);
    const next = { ...poll, votes: { ...(poll.votes || {}), [userId]: after } }; // « [] » = je retire mon vote (le serveur le sait ainsi)
    if (poll.counts) {
      const counts = { ...poll.counts };
      for (const o of poll.options) counts[o.id] = Math.max(0, (counts[o.id] || 0) - (before.includes(o.id) ? 1 : 0) + (after.includes(o.id) ? 1 : 0));
      next.counts = counts;
      next.my = after.length ? (pollMulti(poll) ? after : after[0]) : undefined;
      if (next.my === undefined) delete next.my;
    }
    msg.poll = next;
    this.notify();
    return { success: true };
  },
  /** Clore ou rouvrir un sondage : son auteur ou le responsable. */
  setMessagePollClosed(id: string, userId: string, closed: boolean): { success: boolean } {
    const msg = this.messages.find(m => m.id === id);
    const u = this.users.find(x => x.id === userId);
    if (!msg || !msg.poll || msg.deleted_at || !u || (msg.sender_id !== userId && u.role !== 'admin')) return { success: false };
    msg.poll = { ...msg.poll, closed };
    this.notify();
    return { success: true };
  },

  // Réaction emoji sur un message : une seule par personne ; le même emoji une 2e fois la retire
  reactMessage(id: string, userId: string, emoji: string) {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || msg.deleted_at) return;
    const had = (msg.reactions?.[emoji] || []).includes(userId);
    const next: Record<string, string[]> = {};
    for (const [e, list] of Object.entries(msg.reactions || {})) {
      const rest = list.filter(x => x !== userId);
      if (rest.length) next[e] = rest;
    }
    if (!had) next[emoji] = [...(next[emoji] || []), userId];
    if (Object.keys(next).length) msg.reactions = next; else delete msg.reactions;
    this.notify();
  },
  pingTyping(to: string) {
    if (!this.token) return;
    const now = Date.now();
    if (now - this.typingSentAt < 2500) return;
    this.typingSentAt = now;
    void this.apiRaw('typing', { method: 'POST', body: JSON.stringify({ to }) }); // sans barre de chargement
  },

  async fetchTyping(): Promise<{ user_id: string; to: string }[]> {
    if (!this.token) return [];
    const r = await this.apiRaw('typing');
    return r.ok && Array.isArray(r.data?.typing) ? r.data.typing : [];
  },

  editMessage(id: string, userId: string, text: string): { success: boolean; error?: string } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.isOwnMessage(msg, userId)) return { success: false, error: 'Tu peux modifier seulement tes propres messages.' };
    if (!this.canEditMessage(msg, userId)) return { success: false, error: 'Tu peux modifier un message pendant 15 minutes après son envoi.' };
    const clean = text.trim();
    if (!clean && !msg.attachment_url) return { success: false, error: 'Le message ne peut pas être vide.' };
    if (clean === msg.message) return { success: true };
    const now = new Date();
    msg.message = clean;
    msg.edited_at = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    this.notify();
    return { success: true };
  },

  togglePinMessage(id: string, userId: string): { success: boolean } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.isOwnMessage(msg, userId)) return { success: false };
    if (msg.pinned) {
      msg.pinned = false;
      delete msg.pinned_at;
    } else {
      const now = new Date();
      msg.pinned = true;
      msg.pinned_at = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;
    }
    this.notify();
    return { success: true };
  },

  // Supprimer pour tous : une trace « message supprimé » reste dans la conversation
  deleteMessage(id: string, userId: string): { success: boolean } {
    const msg = this.messages.find(m => m.id === id);
    if (!msg || !this.canDeleteForAll(msg, userId)) return { success: false };
    msg.deleted_at = new Date().toISOString();
    msg.deleted_by = msg.sender_id === userId ? 'sender' : 'admin';
    msg.message = '';
    delete msg.attachment_url; delete msg.attachment_name; delete msg.attachment_kind;
    delete msg.pinned; delete msg.pinned_at; delete msg.reply_to; delete msg.edited_at;
    this.notify();
    return { success: true };
  },
  /** « Important pour tous » et épingler le message d'un autre (M28.2). Les droits sont ceux du bloc CHATSHARED : le serveur les applique (route `chat-mark`), la démo les applique ici. */
  async setChatMark(id: string, mark: 'important' | 'pinned', on: boolean): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    const msg = this.messages.find(m => m.id === id);
    if (!me || !msg) return { success: false, error: 'Message introuvable.' };
    const group = typeof msg.recipient_id === 'string' && msg.recipient_id.startsWith('grp_') ? (this.groups.find(g => g.id === msg.recipient_id) || null) : null;
    let saved: ChatMessage | null = null;
    if (this.demo) {
      const plan = planSharedMark(me, msg, group, mark, on, new Date().toISOString());
      if (!plan.ok) return { success: false, error: plan.error === 'role' ? (mark === 'important' ? 'Seuls le responsable, un chef d\'équipe ou le créateur du groupe peuvent poser « Important pour tous ».' : 'Seuls l\'auteur, le responsable, un chef d\'équipe ou le créateur du groupe peuvent épingler ce message.') : plan.error === 'remove' ? 'Seul celui qui l\'a posé ou le responsable peut le retirer.' : 'Action impossible.' };
      saved = plan.save as ChatMessage;
    } else {
      const r = await this.api('chat-mark', { method: 'POST', body: JSON.stringify({ id, mark, on }) });
      if (!r.ok) return { success: false, error: r.data?.error || (r.status === 0 ? 'Pas de réseau : réessaie quand la connexion revient.' : 'Erreur.') };
      saved = (r.data?.message || null) as ChatMessage | null;
    }
    if (saved) { const i = this.messages.findIndex(m => m.id === id); if (i >= 0) this.messages[i] = saved; this.notify(); }
    return { success: true };
  },

  /** Messages éphémères (M28.4) : durée réglée pour une discussion (0 = désactivé). Discussion générale : réglages ; groupe : sa fiche. */
  getEphemeralMs(threadId: string): number {
    const v = threadId === 'all' ? Number((this.getSettings() as any).chat_ephemeral_all_ms) : Number(this.groups.find(g => g.id === threadId)?.ephemeral_ms);
    return EPHEMERAL_CHOICES.includes(v) ? v : 0;
  },
  /** Règle les messages éphémères d'une discussion. Le serveur applique les droits (route `chat-ephemeral`) ; la démo applique les mêmes règles ici. */
  async setChatEphemeral(threadId: string, ms: number): Promise<{ success: boolean; error?: string }> {
    const me = this.currentUser;
    if (!me) return { success: false, error: 'Non connecté.' };
    const group = threadId === 'all' ? null : this.groups.find(g => g.id === threadId) || null;
    if (this.demo) {
      const plan = planEphemeral(me, group, threadId, ms);
      if (!plan.ok) return { success: false, error: plan.error === 'role' ? 'Seuls le responsable, un chef d\'équipe ou le créateur du groupe peuvent régler les messages éphémères.' : plan.error === 'direct' ? 'Les messages éphémères existent dans la discussion générale et dans les groupes.' : 'Durée non permise.' };
    } else {
      const r = await this.api('chat-ephemeral', { method: 'POST', body: JSON.stringify({ thread: threadId, ms }) });
      if (!r.ok) return { success: false, error: r.data?.error || (r.status === 0 ? 'Pas de réseau : réessaie quand la connexion revient.' : 'Erreur.') };
    }
    if (group) { const i = this.groups.findIndex(g => g.id === threadId); if (i >= 0) { const g: ChatGroup = { ...this.groups[i] }; if (ms) g.ephemeral_ms = ms; else delete g.ephemeral_ms; this.groups[i] = g; } }
    else { const cur: any = { ...(this.settings[0] || { id: 'general' }) }; if (ms) cur.chat_ephemeral_all_ms = ms; else delete cur.chat_ephemeral_all_ms; this.settings[0] = cur; }
    this.notify();
    return { success: true };
  },

  getGroups(): ChatGroup[] { return [...this.groups]; },
  getChatReads(): ChatRead[] { return [...this.reads]; },

  createGroup(ownerId: string, name: string, memberIds: string[]): { success: boolean; id?: string; error?: string } {
    const clean = name.trim();
    if (clean.length < 1 || clean.length > 40) return { success: false, error: 'Le nom du groupe doit avoir 1 à 40 caractères.' };
    const members = [...new Set([ownerId, ...memberIds])];
    if (members.length < 2) return { success: false, error: 'Choisis au moins un autre membre.' };
    const id = `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.groups.push({ id, name: clean, owner_id: ownerId, members, created_at: new Date().toISOString() });
    this.notify();
    return { success: true, id };
  },
  updateGroup(id: string, userId: string, patch: { name?: string; members?: string[]; avatar_url?: string; description?: string; admins?: string[] }): { success: boolean; error?: string } {
    const g = this.groups.find(x => x.id === id);
    const u = this.users.find(x => x.id === userId);
    const isOwner = !!g && !!u && (g.owner_id === userId || u.role === 'admin');
    const isGroupAdmin = !!g && (g.admins || []).includes(userId);
    if (!g || !u || (!isOwner && !isGroupAdmin)) return { success: false, error: 'Seul un administrateur du groupe peut le modifier.' };
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (clean.length < 1 || clean.length > 40) return { success: false, error: 'Le nom du groupe doit avoir 1 à 40 caractères.' };
      g.name = clean;
    }
    if (patch.members) {
      const members = [...new Set(patch.members)];
      if (members.length < 1) return { success: false, error: 'Un groupe doit garder au moins un membre.' };
      if (!isOwner && ![g.owner_id, ...(g.admins || [])].filter(x => x !== userId).every(x => members.includes(x))) {
        return { success: false, error: 'Tu ne peux pas retirer le responsable ni un autre administrateur.' };
      }
      g.members = members;
      if (!members.includes(g.owner_id)) g.owner_id = members[0];
      if (g.admins) g.admins = g.admins.filter(x => members.includes(x));
    }
    if (patch.avatar_url !== undefined) g.avatar_url = patch.avatar_url || undefined;
    if (patch.description !== undefined) g.description = patch.description.trim().slice(0, 200) || undefined;
    if (patch.admins && isOwner) g.admins = [...new Set(patch.admins)].filter(x => g.members.includes(x) && x !== g.owner_id);
    this.notify();
    return { success: true };
  },
  leaveGroup(id: string, userId: string): { success: boolean } {
    const g = this.groups.find(x => x.id === id);
    if (!g || !g.members.includes(userId)) return { success: false };
    const rest = g.members.filter(m => m !== userId);
    if (rest.length === 0) return this.deleteGroup(id, userId);
    g.members = rest;
    if (g.admins) g.admins = g.admins.filter(x => x !== userId);
    if (g.owner_id === userId) g.owner_id = rest[0];
    this.notify();
    return { success: true };
  },
  deleteGroup(id: string, userId: string): { success: boolean } {
    const g = this.groups.find(x => x.id === id);
    const u = this.users.find(x => x.id === userId);
    if (!g || !u || (g.owner_id !== userId && u.role !== 'admin')) return { success: false };
    this.groups = this.groups.filter(x => x.id !== id);
    this.messages = this.messages.filter(m => m.recipient_id !== id);
    this.notify();
    return { success: true };
  },
  markThreadRead(thread: string, ms: number): void {
    if (!this.token || !ms || (this.lastReadSent.get(thread) || 0) >= ms) return;
    this.lastReadSent.set(thread, ms);
    void this.apiRaw('chat-read', { method: 'POST', body: JSON.stringify({ thread, ms }) }).catch(() => {
      this.lastReadSent.delete(thread);
    });
  },
});

export type ChatMethods = typeof chatMethods;
