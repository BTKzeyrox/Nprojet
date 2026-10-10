import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, FileText, Users, MessageSquare, ArrowLeft, MoreVertical, Pin, PinOff, Pencil, Trash2, Copy, X,
  Reply, Check, CheckCheck, Plus, Archive, ArchiveRestore, EyeOff, Ban, Info,
} from 'lucide-react';
import { db } from '../db/store';
import { ChatGroup, ChatMessage, User } from '../types';
import { compressProofImage } from '../utils/imageUtils';
import { Avatar } from './Avatar';
import { markChatSeen } from '../utils/notifications';
import { LightboxModal } from './LightboxModal';
import { FileViewerModal } from './FileViewerModal';
import { createPortal } from 'react-dom';
import { askConfirm } from './ConfirmModal';
import { NewChatModal, GroupInfoModal } from './ChatDialogs';
import { takeChatThread, CHAT_THREAD_EVENT } from '../utils/navTarget';
import { getArchivedThreads, getHiddenMessages, hideMessageForMe, setThreadArchived } from '../utils/chatPrefs';

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });

// Un « fil » : groupe général, groupe créé par quelqu'un, discussion 1 à 1, ou (vue admin) discussion entre deux boosters
type Thread = {
  id: string;
  kind: 'all' | 'user' | 'group' | 'pair';
  title: string;
  subtitle: string;
  user?: User;
  group?: ChatGroup;
  readOnly?: boolean;
};

const sentMs = (m: ChatMessage): number => m.sent_ms || new Date(String(m.timestamp).replace(' ', 'T')).getTime() || 0;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayLabel = (day: string) => {
  const t = new Date(); const y = new Date(t.getTime() - 86400000);
  const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (day === todayStr()) return "Aujourd'hui";
  if (day === ys) return 'Hier';
  return day.split('-').reverse().join('/');
};

export const ChatView: React.FC<{ currentUser: User; initialThreadId?: string }> = ({ currentUser, initialThreadId }) => {
  const isAdmin = currentUser.role === 'admin';
  const [messages, setMessages] = useState<ChatMessage[]>(db.getMessages());
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [groups, setGroups] = useState<ChatGroup[]>(db.getGroups());
  const [reads, setReads] = useState(db.getChatReads());
  const [threadId, setThreadId] = useState<string>(initialThreadId || 'all');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(true); // mobile : liste ou conversation
  const [hidden, setHidden] = useState<Set<string>>(() => getHiddenMessages(currentUser.id)); // « supprimés pour moi »
  const [archived, setArchived] = useState<Record<string, number>>(() => getArchivedThreads(currentUser.id));
  const [showArchived, setShowArchived] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [groupInfo, setGroupInfo] = useState(false);
  const [threadMenu, setThreadMenu] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pickedUsers, setPickedUsers] = useState<string[]>([]); // discussions ouvertes via « + » avant le premier message

  // Arrivée depuis une notification : on ouvre directement la discussion concernée
  useEffect(() => {
    const open = () => { const t = takeChatThread(); if (t) { setThreadId(t); setShowList(false); } };
    open();
    window.addEventListener(CHAT_THREAD_EVENT, open);
    return () => window.removeEventListener(CHAT_THREAD_EVENT, open);
  }, []);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ url: string; msg: ChatMessage } | null>(null);
  const [fileViewer, setFileViewer] = useState<ChatMessage | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Messagerie ouverte : les nouveaux messages arrivent en 8 s au lieu de 20 s
  useEffect(() => {
    db.setFastPoll(true);
    return () => db.setFastPoll(false);
  }, []);

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setMessages(db.getMessages());
      setUsers(db.getUsers());
      setGroups(db.getGroups());
      setReads(db.getChatReads());
    });
    return unsub;
  }, []);

  const admin = users.find(u => u.role === 'admin');
  const adminId = admin?.id || 'user-admin-1';
  const nameOf = (id: string) => users.find(u => u.id === id)?.name || 'Utilisateur';

  // Ce message appartient-il à ce fil ?
  const inThread = (m: ChatMessage, t: Thread): boolean => {
    const rid = m.recipient_id || 'all';
    if (t.kind === 'all') return rid === 'all';
    if (t.kind === 'group') return rid === t.id;
    if (t.kind === 'user') return (m.sender_id === currentUser.id && rid === t.id) || (m.sender_id === t.id && rid === currentUser.id);
    const [, a, b] = t.id.split(':'); // pair:a:b
    return (m.sender_id === a && rid === b) || (m.sender_id === b && rid === a);
  };

  const threads: Thread[] = useMemo(() => {
    const list: Thread[] = [{ id: 'all', kind: 'all', title: 'Groupe général', subtitle: 'Tous les boosters + admin' }];
    groups.forEach(g => list.push({ id: g.id, kind: 'group', title: g.name, subtitle: `${g.members.length} membres`, group: g }));
    const withMsgs = new Set<string>();
    messages.forEach(m => {
      const rid = m.recipient_id || 'all';
      if (rid === 'all' || rid.startsWith('grp_')) return;
      if (m.sender_id === currentUser.id) withMsgs.add(rid);
      else if (rid === currentUser.id) withMsgs.add(m.sender_id);
    });
    if (isAdmin) users.filter(u => u.role === 'employee').forEach(u => withMsgs.add(u.id));
    else withMsgs.add(adminId);
    pickedUsers.forEach(id => withMsgs.add(id));
    withMsgs.forEach(id => {
      const u = users.find(x => x.id === id);
      if (u && id !== currentUser.id) list.push({ id, kind: 'user', title: u.name, subtitle: u.role === 'admin' ? 'Conversation privée' : `@${u.username}`, user: u });
    });
    // Vue admin : discussions entre deux boosters (l'admin voit tout)
    if (isAdmin) {
      const pairs = new Map<string, string>();
      messages.forEach(m => {
        const rid = m.recipient_id || 'all';
        if (rid === 'all' || rid.startsWith('grp_') || m.sender_id === currentUser.id || rid === currentUser.id) return;
        const [a, b] = [m.sender_id, rid].sort();
        pairs.set(`pair:${a}:${b}`, `${nameOf(a)} ↔ ${nameOf(b)}`);
      });
      pairs.forEach((title, id) => list.push({ id, kind: 'pair', title, subtitle: 'Entre boosters (lecture seule)', readOnly: true }));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, groups, messages, isAdmin, adminId, currentUser.id, pickedUsers]);

  const lastTs = (t: Thread) => {
    let best = 0;
    for (const m of messages) if (inThread(m, t)) best = Math.max(best, sentMs(m));
    return best;
  };
  const lastOf = (t: Thread) => {
    const l = messages.filter(m => inThread(m, t) && !hidden.has(m.id));
    return l[l.length - 1];
  };
  const sorted = useMemo(() => {
    const withTs = threads.map(t => ({ t, ts: lastTs(t) }));
    withTs.sort((a, b) => (a.t.id === 'all' ? -1 : b.t.id === 'all' ? 1 : b.ts - a.ts));
    return withTs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, messages]);
  // Cachée = l'heure de masquage est plus récente que le dernier message
  const isArchived = (t: Thread, ts: number) => !!archived[t.id] && archived[t.id] >= ts;
  const shownList = sorted.filter(x => !isArchived(x.t, x.ts)).map(x => x.t);
  const archivedList = sorted.filter(x => isArchived(x.t, x.ts)).map(x => x.t);

  const current = threads.find(t => t.id === threadId) || threads[0];
  const visible = messages.filter(m => inThread(m, current) && !hidden.has(m.id));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [visible.length, current.id]);

  // La messagerie est ouverte : tout est lu (notifications)
  useEffect(() => {
    markChatSeen(currentUser);
  }, [messages.length, currentUser.id]);

  // Coches « lu » : on prévient les autres jusqu'où on a lu (discussion 1 à 1 et groupes)
  const readKey = current.kind === 'user' ? current.id : current.kind === 'group' ? current.id : '';
  const lastIncoming = visible.filter(m => m.sender_id !== currentUser.id).reduce((mx, m) => Math.max(mx, sentMs(m)), 0);
  useEffect(() => {
    if (readKey && lastIncoming) db.markThreadRead(readKey, lastIncoming);
  }, [readKey, lastIncoming]);

  // Une seule coche = envoyé ; deux coches bleues = lu par tous les destinataires
  const isRead = (m: ChatMessage): boolean => {
    const ms = m.sent_ms || 0;
    if (!ms) return false;
    if (current.kind === 'user') return reads.some(r => r.user_id === current.id && r.thread === currentUser.id && r.ms >= ms);
    if (current.kind === 'group' && current.group) {
      const others = current.group.members.filter(id => id !== currentUser.id);
      return others.length > 0 && others.every(id => reads.some(r => r.user_id === id && r.thread === current.id && r.ms >= ms));
    }
    return false;
  };

  const send = (extra?: { url: string; name: string; kind: 'image' | 'file' }) => {
    if (current.readOnly) return;
    if (editingId) {
      const r = db.editMessage(editingId, currentUser.id, text);
      if (!r.success) return setError(r.error || 'Modification impossible.');
      setEditingId(null);
      setText('');
      setError(null);
      return;
    }
    if (!text.trim() && !extra) return;
    db.sendMessage({
      senderId: currentUser.id,
      message: text,
      recipientId: current.id === 'all' ? 'all' : current.id,
      attachmentUrl: extra?.url,
      attachmentName: extra?.name,
      attachmentKind: extra?.kind,
      replyTo: replyTo || undefined,
    });
    setText('');
    setReplyTo(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError('Fichier trop gros (10 Mo maximum).');
    if (!OK_TYPES.includes(file.type)) return setError('Type non accepté : photo, PDF ou texte seulement.');
    setBusy(true);
    try {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/gif';
      const dataUrl = isImage ? await compressProofImage(file, 1600, 300 * 1024) : await readAsDataUrl(file);
      const url = await db.uploadFile(dataUrl);
      if (!url) setError('Envoi impossible. Réessaie.');
      else send({ url, name: file.name, kind: file.type.startsWith('image/') ? 'image' : 'file' });
    } catch {
      setError('Envoi impossible. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const startPress = (m: ChatMessage) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setMenuMsg(m), 450);
  };
  const stopPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const startEdit = (m: ChatMessage) => {
    setMenuMsg(null);
    setReplyTo(null);
    setEditingId(m.id);
    setText(m.message);
    setError(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setText('');
  };
  const startReply = (m: ChatMessage) => {
    setMenuMsg(null);
    cancelEdit();
    setReplyTo(m);
  };
  const deleteForMe = (m: ChatMessage) => {
    setMenuMsg(null);
    hideMessageForMe(currentUser.id, m.id);
    setHidden(getHiddenMessages(currentUser.id));
  };
  const confirmDelete = (m: ChatMessage) => {
    setMenuMsg(null);
    askConfirm({
      title: 'Supprimer ce message pour tout le monde ?',
      message: 'Il sera remplacé par « Ce message a été supprimé » pour tous les membres de la conversation.',
      confirmLabel: 'Supprimer pour tous',
      danger: true,
      onConfirm: () => {
        if (editingId === m.id) cancelEdit();
        if (replyTo?.id === m.id) setReplyTo(null);
        db.deleteMessage(m.id, currentUser.id);
      },
    });
  };
  const copyText = async (m: ChatMessage) => {
    setMenuMsg(null);
    try {
      await navigator.clipboard.writeText(m.message);
    } catch {
      /* copie impossible : on ignore */
    }
  };
  const toggleArchive = (t: Thread, value: boolean) => {
    setThreadMenu(false);
    setThreadArchived(currentUser.id, t.id, value);
    setArchived(getArchivedThreads(currentUser.id));
    if (value) { setThreadId('all'); setShowList(true); }
  };

  const pinned = visible.filter(m => m.pinned && !m.deleted_at).sort((a, b) => String(b.pinned_at || '').localeCompare(String(a.pinned_at || '')));
  const pinShown = pinned.length > 0 ? pinned[pinIdx % pinned.length] : null;
  const jumpTo = (id: string) => {
    document.querySelector(`[data-msg-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const gallery = visible.filter(m => m.attachment_url && m.attachment_kind === 'image' && !m.deleted_at);
  const showNames = current.kind !== 'user';

  const renderThread = (t: Thread, archivedRow = false) => {
    const last = lastOf(t);
    const preview = last ? (last.deleted_at ? 'Message supprimé' : last.message || (last.attachment_name ? `Fichier : ${last.attachment_name}` : '')) : t.subtitle;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => { setThreadId(t.id); setShowList(false); setReplyTo(null); cancelEdit(); }}
        className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-slate-800/60 cursor-pointer ${t.id === current.id ? 'bg-emerald-950/60' : 'hover:bg-[#121c28]'} ${archivedRow ? 'opacity-70' : ''}`}
      >
        {t.kind === 'all' || t.kind === 'group' ? (
          <span className="w-9 h-9 bg-emerald-900 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-emerald-300" />
          </span>
        ) : t.kind === 'pair' ? (
          <span className="w-9 h-9 bg-slate-800 border border-slate-600 flex items-center justify-center shrink-0"><EyeOff className="w-4 h-4 text-slate-300" /></span>
        ) : (
          <Avatar src={t.user?.avatar_url} name={t.title} className="w-9 h-9" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white break-words leading-tight">{t.title}</span>
          <span className="block text-[11px] text-slate-400 truncate">{preview}</span>
        </span>
      </button>
    );
  };

  const canWrite = !current.readOnly;

  return (
    <div className="bg-[#0f1722] border border-slate-800 overflow-hidden shadow-xl flex h-full min-h-0 w-full">
      {/* Liste des conversations */}
      <div className={`${showList ? 'flex' : 'hidden'} md:flex flex-col min-h-0 w-full md:w-64 shrink-0 border-r border-slate-800 bg-[#0c131c]`}>
        <div className="px-3 py-2 border-b border-slate-800 font-tactical font-bold text-white text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" /> <span className="flex-1">Messagerie</span>
          <button type="button" onClick={() => setNewChat(true)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer" title="Nouvelle discussion ou nouveau groupe">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {shownList.map(t => renderThread(t))}
          {archivedList.length > 0 && (
            <>
              <button type="button" onClick={() => setShowArchived(v => !v)} className="w-full px-3 py-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white border-b border-slate-800/60 cursor-pointer">
                <Archive className="w-4 h-4" /> Conversations cachées ({archivedList.length}) {showArchived ? '▲' : '▼'}
              </button>
              {showArchived && archivedList.map(t => renderThread(t, true))}
            </>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`${showList ? 'hidden' : 'flex'} md:flex flex-col flex-1 min-w-0 min-h-0`}>
        <div className="px-3 py-2 bg-[#131d2a] border-b border-slate-800 flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setShowList(true)} className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 cursor-pointer" title="Retour">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-tactical font-bold text-white text-sm break-words leading-tight">{current.title}</div>
            <div className="text-[11px] text-slate-400">{current.subtitle}</div>
          </div>
          <button type="button" onClick={() => setThreadMenu(true)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer" title="Options de la conversation">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {pinShown && (
          <button
            type="button"
            onClick={() => { jumpTo(pinShown.id); if (pinned.length > 1) setPinIdx(i => i + 1); }}
            className="w-full px-3 py-2 bg-amber-950/40 border-b border-amber-500/30 flex items-center gap-2 text-left cursor-pointer"
            title="Voir le message épinglé"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-mono text-amber-300">
                Épinglé{pinned.length > 1 ? ` (${(pinIdx % pinned.length) + 1}/${pinned.length})` : ''} · {pinShown.sender_name}
              </span>
              <span className="block text-xs text-slate-200 truncate">{pinShown.message || pinShown.attachment_name || 'Pièce jointe'}</span>
            </span>
          </button>
        )}

        <div className="flex-1 min-h-0 p-3 overflow-y-auto overscroll-contain space-y-2 bg-[#0a0f16]">
          {visible.length === 0 && <div className="text-center text-xs text-slate-500 font-mono pt-8">Aucun message. Écris le premier.</div>}
          {visible.map((msg, i) => {
            const isMe = msg.sender_id === currentUser.id;
            const day = String(msg.timestamp).slice(0, 10);
            const newDay = i === 0 || String(visible[i - 1].timestamp).slice(0, 10) !== day;
            const time = String(msg.timestamp).slice(11, 16);
            const gone = !!msg.deleted_at;
            return (
              <React.Fragment key={msg.id}>
                {newDay && (
                  <div className="flex justify-center py-1">
                    <span className="px-3 py-1 bg-slate-800/80 text-[10px] font-mono text-slate-300 rounded">{dayLabel(day)}</span>
                  </div>
                )}
                <div data-msg-id={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-start gap-1 max-w-[92%] sm:max-w-md ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div
                      onTouchStart={() => !gone && startPress(msg)}
                      onTouchEnd={stopPress}
                      onTouchMove={stopPress}
                      onContextMenu={e => { if (!gone) { e.preventDefault(); setMenuMsg(msg); } }}
                      className={`min-w-0 p-2.5 text-xs leading-relaxed break-words select-text ${
                        gone ? 'bg-[#101822] text-slate-500 border border-slate-800' : isMe ? 'bg-emerald-600 text-white' : 'bg-[#16212e] text-slate-200 border border-slate-700/80'
                      } ${editingId === msg.id ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {!gone && !isMe && showNames && (
                        <div className="text-[11px] font-bold text-cyan-300 mb-0.5">
                          {msg.sender_name}
                          {msg.sender_role === 'admin' && <span className="ml-1 px-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px]">ADMIN</span>}
                        </div>
                      )}
                      {gone ? (
                        <span className="italic flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />
                          {msg.deleted_by === 'admin' ? "Ce message a été supprimé par l'administrateur" : 'Ce message a été supprimé'}
                        </span>
                      ) : (
                        <>
                          {msg.reply_to && (
                            <button type="button" onClick={() => jumpTo(msg.reply_to!.id)} className={`block w-full text-left mb-1.5 px-2 py-1 border-l-4 ${isMe ? 'bg-emerald-800/60 border-emerald-300' : 'bg-black/30 border-cyan-400'} cursor-pointer`}>
                              <span className="block text-[10px] font-bold opacity-90">{msg.reply_to.sender_name}</span>
                              <span className="block text-[11px] opacity-80 truncate">{msg.reply_to.text || (msg.reply_to.has_attachment ? 'Pièce jointe' : '')}</span>
                            </button>
                          )}
                          {msg.attachment_url && msg.attachment_kind === 'image' && (
                            <button type="button" onClick={() => setViewer({ url: msg.attachment_url!, msg })} className="block mb-1.5 cursor-zoom-in" title="Agrandir">
                              <img src={msg.attachment_url} alt={msg.attachment_name || 'photo'} className="max-h-56 w-auto max-w-full" loading="lazy" />
                            </button>
                          )}
                          {msg.attachment_url && msg.attachment_kind !== 'image' && (
                            <button type="button" onClick={() => setFileViewer(msg)} className="flex items-center gap-1.5 mb-1.5 min-h-[40px] underline font-semibold text-left cursor-pointer">
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="break-all">{msg.attachment_name || 'fichier'}</span>
                            </button>
                          )}
                          {msg.message && <span className="whitespace-pre-line">{msg.message}</span>}
                        </>
                      )}
                      <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isMe && !gone ? 'text-emerald-100/80' : 'text-slate-500'}`}>
                        {msg.pinned && !gone && <Pin className="w-3 h-3 text-amber-300" />}
                        {msg.edited_at && !gone && <span className="italic">modifié</span>}
                        <span>{time}</span>
                        {isMe && !gone && current.kind !== 'all' && current.kind !== 'pair' && (
                          isRead(msg) ? <CheckCheck className="w-3.5 h-3.5 text-cyan-300" /> : <Check className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                    {!gone && (
                      <button type="button" onClick={() => setMenuMsg(msg)} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0" title="Actions">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && <div className="px-3 py-2 bg-red-950 border-t border-red-500/60 text-red-200 text-xs font-semibold">{error}</div>}

        {editingId && (
          <div className="px-3 py-2 bg-amber-950/40 border-t border-amber-500/40 flex items-center gap-2 text-xs text-amber-200">
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 font-semibold">Modification du message</span>
            <button type="button" onClick={cancelEdit} className="min-w-[40px] min-h-[40px] flex items-center justify-center hover:text-white cursor-pointer" title="Annuler la modification">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {replyTo && !editingId && (
          <div className="px-3 py-2 bg-[#101a26] border-t border-cyan-500/40 flex items-center gap-2 text-xs">
            <Reply className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
            <span className="min-w-0 flex-1 border-l-4 border-cyan-400 pl-2">
              <span className="block text-[10px] font-bold text-cyan-300">Réponse à {replyTo.sender_name}</span>
              <span className="block text-slate-300 truncate">{replyTo.message || replyTo.attachment_name || 'Pièce jointe'}</span>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer" title="Annuler la réponse">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {canWrite ? (
          <form onSubmit={e => { e.preventDefault(); send(); }} className="p-2.5 bg-[#131d2a] border-t border-slate-800 flex items-center gap-2 shrink-0">
            <input ref={fileRef} type="file" accept="image/*,application/pdf,text/plain" onChange={onFile} className="hidden" />
            <button
              type="button"
              disabled={busy || !!editingId}
              onClick={() => fileRef.current?.click()}
              className="p-2.5 bg-[#0b1017] border border-slate-700 text-slate-300 hover:text-white cursor-pointer disabled:opacity-50 shrink-0"
              title="Joindre une photo ou un fichier (10 Mo max)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={busy ? 'Envoi du fichier…' : 'Écrire un message…'}
              className="flex-1 min-w-0 bg-[#0b1017] border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button type="submit" disabled={busy} className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50 shrink-0" title="Envoyer">
              <Send className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="p-3 bg-[#131d2a] border-t border-slate-800 text-center text-[11px] text-slate-400 shrink-0">
            Lecture seule : tu consultes une discussion entre deux boosters.
          </div>
        )}
      </div>

      {/* Menu des options de la conversation */}
      {threadMenu && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setThreadMenu(false)}>
          <div className="w-full max-w-xs bg-[#0f1722] border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate">{current.title}</div>
            {current.kind === 'group' && (
              <button type="button" onClick={() => { setThreadMenu(false); setGroupInfo(true); }} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <Info className="w-4 h-4 text-cyan-400" /> Infos du groupe
              </button>
            )}
            {archived[current.id] && archived[current.id] >= lastTs(current) ? (
              <button type="button" onClick={() => toggleArchive(current, false)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <ArchiveRestore className="w-4 h-4 text-emerald-400" /> Afficher de nouveau la conversation
              </button>
            ) : (
              <button type="button" onClick={() => toggleArchive(current, true)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <Archive className="w-4 h-4 text-amber-400" /> Cacher la conversation
              </button>
            )}
            <button type="button" onClick={() => setThreadMenu(false)} className="w-full px-3 py-2.5 text-xs text-slate-400 border-t border-slate-800 hover:text-white cursor-pointer">Fermer</button>
          </div>
        </div>,
        document.body
      )}

      {newChat && (
        <NewChatModal
          currentUser={currentUser}
          users={users}
          onClose={() => setNewChat(false)}
          onOpenThread={id => { if (!id.startsWith('grp_')) setPickedUsers(p => (p.includes(id) ? p : [...p, id])); setThreadId(id); setShowList(false); setThreadArchivedSafe(currentUser.id, id, setArchived); }}
        />
      )}
      {groupInfo && current.group && (
        <GroupInfoModal group={current.group} users={users} currentUser={currentUser} onClose={() => setGroupInfo(false)} onGone={() => { setThreadId('all'); setShowList(true); }} />
      )}

      {/* Menu d'actions du message */}
      {menuMsg && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setMenuMsg(null)}>
          <div className="w-full max-w-xs bg-[#0f1722] border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate">
              {menuMsg.sender_name} · {menuMsg.message || menuMsg.attachment_name || 'Pièce jointe'}
            </div>
            {canWrite && (
              <button type="button" onClick={() => startReply(menuMsg)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <Reply className="w-4 h-4 text-cyan-400" /> Répondre
              </button>
            )}
            {menuMsg.sender_id === currentUser.id && (
              <button type="button" onClick={() => { db.togglePinMessage(menuMsg.id, currentUser.id); setMenuMsg(null); }} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                {menuMsg.pinned ? <PinOff className="w-4 h-4 text-amber-400" /> : <Pin className="w-4 h-4 text-amber-400" />}
                {menuMsg.pinned ? 'Désépingler' : 'Épingler'}
              </button>
            )}
            {db.canEditMessage(menuMsg, currentUser.id) && menuMsg.message && (
              <button type="button" onClick={() => startEdit(menuMsg)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <Pencil className="w-4 h-4 text-cyan-400" /> Modifier
              </button>
            )}
            {menuMsg.message && (
              <button type="button" onClick={() => copyText(menuMsg)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-white hover:bg-[#162130] cursor-pointer">
                <Copy className="w-4 h-4 text-slate-400" /> Copier le texte
              </button>
            )}
            <button type="button" onClick={() => deleteForMe(menuMsg)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-slate-200 hover:bg-[#162130] cursor-pointer">
              <EyeOff className="w-4 h-4 text-slate-400" /> Supprimer pour moi
            </button>
            {db.canDeleteForAll(menuMsg, currentUser.id) && (
              <button type="button" onClick={() => confirmDelete(menuMsg)} className="w-full px-3 py-3 flex items-center gap-2.5 text-sm text-red-300 hover:bg-red-950/40 cursor-pointer">
                <Trash2 className="w-4 h-4" /> Supprimer pour tous
              </button>
            )}
            <button type="button" onClick={() => setMenuMsg(null)} className="w-full px-3 py-2.5 text-xs text-slate-400 border-t border-slate-800 hover:text-white cursor-pointer">Fermer</button>
          </div>
        </div>,
        document.body
      )}

      {/* Visionneuse d'image : zoom, retour, précédent / suivant */}
      {viewer && createPortal(
        <LightboxModal
          isOpen
          onClose={() => setViewer(null)}
          imageUrl={viewer.url}
          gallery={gallery.map(m => m.attachment_url!)}
          title={viewer.msg.attachment_name || 'Photo'}
          subtitle={viewer.msg.sender_name}
          timestamp={viewer.msg.timestamp}
          canDelete={u => { const m = gallery.find(g => g.attachment_url === u); return !!m && db.canDeleteForAll(m, currentUser.id); }}
          onDelete={u => { const m = gallery.find(g => g.attachment_url === u); if (m) { setViewer(null); confirmDelete(m); } }}
        />,
        document.body
      )}

      {/* Visionneuse de fiche : retour et suppression */}
      {fileViewer && fileViewer.attachment_url && createPortal(
        <FileViewerModal
          url={fileViewer.attachment_url}
          name={fileViewer.attachment_name || 'fichier'}
          subtitle={fileViewer.sender_name}
          onClose={() => setFileViewer(null)}
          onDelete={db.canDeleteForAll(fileViewer, currentUser.id) ? () => { const m = fileViewer; setFileViewer(null); confirmDelete(m); } : undefined}
        />,
        document.body
      )}
    </div>
  );
};

// Ouvrir une conversation cachée la fait réapparaître
function setThreadArchivedSafe(uid: string, id: string, setArchived: (v: Record<string, number>) => void) {
  const a = getArchivedThreads(uid);
  if (a[id]) {
    setThreadArchived(uid, id, false);
    setArchived(getArchivedThreads(uid));
  }
}
