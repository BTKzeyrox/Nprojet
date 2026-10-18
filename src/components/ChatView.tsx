import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, FileText, Users, MessageSquare, ArrowLeft, MoreVertical, Pin, PinOff, Pencil, Trash2, Copy, X,
  Reply, Check, CheckCheck, Plus, Archive, ArchiveRestore, EyeOff, Ban, Info, Search, ChevronDown,
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
import { getArchivedThreads, getHiddenMessages, hideMessageForMe, setThreadArchived, getThreadSeen, setThreadSeen, hasThreadSeen, initThreadSeen } from '../utils/chatPrefs';
import { useApp } from '../context/AppContext';
import { EmojiPicker, ReactionChips, TypingDots } from './Reactions';
import { accentOf, accentStyles, useAccentVersion } from '../utils/avatarColor';

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

export const ChatView: React.FC<{ currentUser: User; initialThreadId?: string; onOpenProfile?: (u: User) => void }> = ({ currentUser, initialThreadId, onOpenProfile }) => {
  const isAdmin = currentUser.role === 'admin';
  const L = useApp().theme === 'light';
  // Couleurs de la messagerie (clair par défaut, sombre en option)
  const P = {
    root: L ? 'bg-white border-slate-300' : 'bg-[#0f1722] border-slate-800',
    side: L ? 'bg-white border-slate-200' : 'bg-[#0c131c] border-slate-800',
    head: L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-[#131d2a] border-slate-800',
    area: L ? 'bg-[#e9eff8]' : 'bg-[#0a0f16]',
    title: L ? 'text-slate-900' : 'text-white',
    sub: L ? 'text-slate-500' : 'text-slate-400',
    inBub: L ? 'bg-white text-slate-800 border border-slate-200' : 'bg-[#16212e] text-slate-200 border border-slate-700/80',
    outBub: 'bg-emerald-700 text-white',
    input: L ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400' : 'bg-[#0b1017] border-slate-700 text-white placeholder-slate-500',
    rowHover: L ? 'hover:bg-slate-100' : 'hover:bg-[#121c28]',
    rowActive: L ? 'bg-[#dbeafe]' : 'bg-emerald-950/60',
    pop: L ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#0f1722] border-slate-700 text-white',
    popHover: L ? 'hover:bg-slate-100' : 'hover:bg-[#162130]',
    div: L ? 'border-slate-200' : 'border-slate-800',
    pill: L ? 'bg-white/90 text-slate-600 shadow-sm' : 'bg-slate-800/80 text-slate-300',
  };
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
  const [q, setQ] = useState('');
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [seenFor, setSeenFor] = useState<ChatMessage | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [seenMap, setSeenMap] = useState<Record<string, number>>(() => getThreadSeen(currentUser.id));
  const [pickedUsers, setPickedUsers] = useState<string[]>([]); // discussions ouvertes via « + » avant le premier message

  // Arrivée depuis une notification : on ouvre directement la discussion concernée
  useEffect(() => {
    const open = () => { const t = takeChatThread(); if (t) { setThreadId(t); setShowList(false); } };
    open();
    window.addEventListener(CHAT_THREAD_EVENT, open);
    return () => window.removeEventListener(CHAT_THREAD_EVENT, open);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevThreadRef = useRef('');
  const prevLenRef = useRef(0);
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
  useAccentVersion(); // se redessine quand la couleur d'une photo de profil vient d'être calculée

  // « est en train d'écrire… » : on lit qui écrit, seulement écran visible.
  // Économie de quota : 2,5 s si la personne est active, 6 s après 30 s sans action, 20 s après 2 min.
  const [typingRows, setTypingRows] = useState<{ user_id: string; to: string }[]>([]);
  const [sendPulse, setSendPulse] = useState(false);
  useEffect(() => {
    let off = false;
    let timer: number | undefined;
    const tick = async () => {
      if (!document.hidden) {
        const rows = await db.fetchTyping();
        if (!off) setTypingRows(prev => (JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows));
      }
      if (off) return;
      const idle = db.idleMs();
      timer = window.setTimeout(tick, idle > 120000 ? 20000 : idle > 30000 ? 6000 : 2500);
    };
    void tick();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, []);

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
    const list: Thread[] = [{ id: 'all', kind: 'all', title: 'Groupe général', subtitle: 'Tous les opérateurs + responsable' }];
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
      pairs.forEach((title, id) => list.push({ id, kind: 'pair', title, subtitle: 'Entre opérateurs (lecture seule)', readOnly: true }));
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
  // Ordinateur : la liste et la conversation sont côte à côte ; téléphone : l'une ou l'autre
  const convVisible = !showList || (typeof window !== 'undefined' && window.innerWidth >= 768);
  const visible = messages.filter(m => inThread(m, current) && !hidden.has(m.id));
  const typingNames = typingRows
    .filter(r => (current.kind === 'user' ? r.user_id === current.id && r.to === currentUser.id : current.kind === 'group' || current.kind === 'all' ? r.to === current.id : false))
    .map(r => nameOf(r.user_id).split(' ')[0]);
  // Seuls les messages arrivés APRÈS l'ouverture de la conversation s'animent
  const knownRef = useRef<{ thread: string; ids: Set<string> }>({ thread: '', ids: new Set() });
  if (knownRef.current.thread !== current.id) knownRef.current = { thread: current.id, ids: new Set(visible.map(m => m.id)) };
  useEffect(() => { visible.forEach(m => knownRef.current.ids.add(m.id)); });

  // Défilement : vers le bas à l'ouverture et à chaque nouveau message si on est déjà en bas (ou si c'est le mien), sinon bouton « nouveaux messages »
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = visible[visible.length - 1];
    if (prevThreadRef.current !== current.id) {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setNewBelow(0);
    } else if (visible.length > prevLenRef.current) {
      if (atBottomRef.current || last?.sender_id === currentUser.id) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        setNewBelow(0);
      } else {
        setNewBelow(n => n + (visible.length - prevLenRef.current));
      }
    }
    prevThreadRef.current = current.id;
    prevLenRef.current = visible.length;
  }, [visible.length, current.id]);
  // Sur téléphone, la conversation est cachée tant que la liste est affichée : on descend quand elle apparaît.
  // On le refait plusieurs fois : les photos et la mise en page changent la hauteur juste après l'ouverture.
  useEffect(() => {
    if (!convVisible) return;
    const down = () => { const el = scrollRef.current; if (el) { el.scrollTop = el.scrollHeight; atBottomRef.current = true; } };
    const raf = requestAnimationFrame(down);
    const timers = [60, 200, 450, 900, 1600].map(ms => setTimeout(() => { if (atBottomRef.current) down(); }, ms));
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [convVisible, current.id]);
  const [farFromBottom, setFarFromBottom] = useState(false);
  const onScrollArea = () => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = gap < 120;
    setFarFromBottom(gap > 300);
    if (atBottomRef.current) setNewBelow(0);
    if (menuMsg) setMenuMsg(null);
  };

  // Non lus : au premier lancement tout est considéré comme vu ; ensuite la conversation ouverte est vue au fil de l'eau
  useEffect(() => {
    if (hasThreadSeen(currentUser.id)) return;
    const map: Record<string, number> = {};
    threads.forEach(t => { map[t.id] = lastTs(t); });
    setSeenMap(initThreadSeen(currentUser.id, map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length]);

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
  useEffect(() => {
    if (!convVisible || !lastIncoming) return;
    if ((seenMap[current.id] || 0) < lastIncoming) setSeenMap(setThreadSeen(currentUser.id, current.id, lastIncoming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convVisible, current.id, lastIncoming]);

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

  const lastSent = useRef<{ key: string; at: number }>({ key: '', at: 0 });
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
    // Même message dans la même conversation en moins de 3 s : on ignore (double appui)
    const key = `${current.id}|${text.trim()}|${extra?.url || ''}`;
    if (lastSent.current.key === key && Date.now() - lastSent.current.at < 3000) { setText(''); return; }
    lastSent.current = { key, at: Date.now() };
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
    setSendPulse(true);
    window.setTimeout(() => setSendPulse(false), 320);
  };

  // Fichier choisi : on l'affiche d'abord avec l'option « Compresser » (activée par défaut), puis on l'envoie
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [compress, setCompress] = useState(true);
  const pendingUrl = useMemo(() => (pendingFile && pendingFile.type.startsWith('image/') ? URL.createObjectURL(pendingFile) : ''), [pendingFile]);
  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError('Fichier trop gros (10 Mo maximum).');
    if (!OK_TYPES.includes(file.type)) return setError('Type non accepté : photo, PDF ou texte seulement.');
    setCompress(true);
    setPendingFile(file);
  };
  const sendPendingFile = async () => {
    const file = pendingFile;
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/gif';
      const dataUrl = isImage && compress ? await compressProofImage(file, 1600, 300 * 1024) : await readAsDataUrl(file);
      const url = await db.uploadFile(dataUrl);
      if (!url) setError('Envoi impossible. Réessaie.');
      else { send({ url, name: file.name, kind: file.type.startsWith('image/') ? 'image' : 'file' }); setPendingFile(null); }
    } catch {
      setError('Envoi impossible. Réessaie.');
    } finally {
      setBusy(false);
    }
  };
  const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

  const openMenu = (m: ChatMessage, el: HTMLElement) => {
    window.getSelection()?.removeAllRanges(); // l'appui long ouvre le menu : jamais de sélection de texte
    setMenuRect(el.getBoundingClientRect());
    setMenuMsg(m);
  };
  const startPress = (m: ChatMessage, el: HTMLElement) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => openMenu(m, el), 450);
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
  const openProfile = (id: string) => {
    const u = users.find(x => x.id === id);
    if (u && onOpenProfile) onOpenProfile(u);
  };

  // Non lus par conversation : messages des autres reçus après la dernière fois qu'on l'a ouverte
  const unreadOf = (t: Thread): number =>
    t.readOnly ? 0 : messages.filter(m => inThread(m, t) && m.sender_id !== currentUser.id && !m.deleted_at && !hidden.has(m.id) && sentMs(m) > (seenMap[t.id] || 0)).length;
  const shortTime = (ms: number): string => {
    if (!ms) return '';
    const d = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const norm = (v: string) => (v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matches = (t: Thread) => !q.trim() || norm(t.title).includes(norm(q));

  const readersOf = (m: ChatMessage): string[] => {
    if (current.kind !== 'group' || !current.group) return [];
    const ms = m.sent_ms || 0;
    if (!ms) return [];
    return current.group.members.filter(id => id !== currentUser.id && reads.some(r => r.user_id === id && r.thread === current.id && r.ms >= ms));
  };

  const renderThread = (t: Thread, archivedRow = false) => {
    const last = lastOf(t);
    const who = last && !last.deleted_at && t.kind !== 'user' && t.kind !== 'pair' ? `${last.sender_id === currentUser.id ? 'Moi' : last.sender_name.split(' ')[0]} : ` : last && last.sender_id === currentUser.id && !last.deleted_at && t.kind === 'user' ? 'Moi : ' : '';
    const preview = last ? (last.deleted_at ? 'Message supprimé' : who + (last.message || (last.attachment_name ? `Fichier : ${last.attachment_name}` : ''))) : t.subtitle;
    const unread = t.id === current.id && convVisible ? 0 : unreadOf(t);
    const palette = ['border-l-rose-500', 'border-l-amber-500', 'border-l-emerald-500', 'border-l-sky-500', 'border-l-violet-500', 'border-l-pink-500', 'border-l-teal-500', 'border-l-orange-500'];
    const hash = Array.from(t.id).reduce((a, c) => a + c.charCodeAt(0), 0);
    const accent = {
      bar: t.kind === 'all' ? 'border-l-blue-600' : t.kind === 'group' ? 'border-l-violet-600' : t.kind === 'pair' ? 'border-l-slate-400' : palette[hash % palette.length],
      label: t.kind === 'all' ? 'Équipe' : t.kind === 'group' ? 'Groupe' : t.kind === 'pair' ? 'Entre opérateurs' : '',
      labelCls: t.kind === 'all' ? 'bg-blue-100 text-blue-700' : t.kind === 'group' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600',
    };
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => { setThreadId(t.id); setShowList(false); setReplyTo(null); cancelEdit(); }}
        className={`w-full text-left pl-3 pr-3 py-2.5 flex items-center gap-3 rounded-2xl border-l-4 border cursor-pointer shadow-sm transition-colors ${accent.bar} ${t.id === current.id ? (L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-blue-500/20 border-blue-400/40') : (L ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/5 border-white/10 hover:bg-white/10')} ${archivedRow ? 'opacity-70' : ''}`}
      >
        {t.kind === 'group' && t.group?.avatar_url ? (
          <img src={t.group.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : t.kind === 'all' || t.kind === 'group' ? (
          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${t.kind === 'all' ? 'bg-blue-600' : 'bg-violet-600'}`}>
            <Users className="w-5 h-5 text-white" />
          </span>
        ) : t.kind === 'pair' ? (
          <span className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${L ? 'bg-slate-200' : 'bg-slate-800'}`}><EyeOff className={`w-5 h-5 ${P.sub}`} /></span>
        ) : (
          <Avatar src={t.user?.avatar_url} name={t.title} className="w-12 h-12 rounded-full ring-2 ring-offset-2 ring-slate-200" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`flex-1 min-w-0 truncate text-[13px] font-semibold ${P.title}`}>{t.title}</span>
            {accent.label && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${accent.labelCls}`}>{accent.label}</span>}
            {last && <span className={`text-[11px] shrink-0 ${unread > 0 ? 'text-red-600 font-bold' : P.sub}`}>{shortTime(sentMs(last))}</span>}
          </span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className={`flex-1 min-w-0 truncate text-[12px] ${P.sub}`}>{preview}</span>
            {unread > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white shadow text-[11px] font-bold flex items-center justify-center shrink-0">{unread > 99 ? '99+' : unread}</span>}
          </span>
        </span>
      </button>
    );
  };

  const canWrite = !current.readOnly;

  // Actions du message (menu sous le message)
  const menuActions = menuMsg
    ? [
        ...(canWrite ? [{ k: 'reply', label: 'Répondre', icon: Reply, color: 'text-emerald-600', run: () => startReply(menuMsg) }] : []),
        ...(menuMsg.message ? [{ k: 'copy', label: 'Copier', icon: Copy, color: 'text-slate-500', run: () => copyText(menuMsg) }] : []),
        ...(db.canEditMessage(menuMsg, currentUser.id) && menuMsg.message ? [{ k: 'edit', label: 'Modifier', icon: Pencil, color: 'text-emerald-600', run: () => startEdit(menuMsg) }] : []),
        ...(menuMsg.sender_id === currentUser.id
          ? [{ k: 'pin', label: menuMsg.pinned ? 'Désépingler' : 'Épingler', icon: menuMsg.pinned ? PinOff : Pin, color: 'text-amber-500', run: () => { db.togglePinMessage(menuMsg.id, currentUser.id); setMenuMsg(null); } }]
          : []),
        { k: 'hide', label: 'Supprimer pour moi', icon: EyeOff, color: 'text-slate-500', run: () => deleteForMe(menuMsg) },
        ...(db.canDeleteForAll(menuMsg, currentUser.id) ? [{ k: 'del', label: 'Supprimer pour tous', icon: Trash2, color: 'text-red-500', run: () => confirmDelete(menuMsg) }] : []),
      ]
    : [];
  const popStyle = (): React.CSSProperties => {
    if (!menuRect) return { top: 80, left: 8 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = 256;
    const H = menuActions.length * 44 + 10 + 56; // + la rangée d'emoji
    const mine = menuMsg?.sender_id === currentUser.id;
    let left = mine ? menuRect.right - W : menuRect.left;
    left = Math.max(8, Math.min(left, vw - W - 8));
    let top = menuRect.bottom + 6;
    if (top + H > vh - 8) top = menuRect.top - H - 6;
    top = Math.max(8, Math.min(top, vh - H - 8));
    return { top, left, width: W };
  };

  return (
    <div className={`${P.root} border overflow-hidden shadow-xl flex h-full min-h-0 w-full md:rounded-2xl`}>
      {/* Liste des conversations */}
      <div className={`${showList ? 'flex' : 'hidden'} md:flex flex-col min-h-0 w-full md:w-80 shrink-0 border-r ${P.side}`}>
        <div className={`px-3 py-2.5 border-b ${P.div} flex items-center gap-2`}>
          <span className={`flex-1 text-lg font-bold ${P.title}`}>Messagerie</span>
          <button type="button" onClick={() => setNewChat(true)} className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer" title="Nouvelle discussion ou nouveau groupe">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${P.sub}`} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une discussion" className={`w-full h-10 pl-9 pr-3 rounded-full border text-sm focus:outline-none focus:border-emerald-500 ${P.input}`} style={{ borderRadius: 9999 }} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2">
          {shownList.filter(matches).map(t => renderThread(t))}
          {shownList.filter(matches).length === 0 && <div className={`px-4 py-6 text-center text-sm ${P.sub}`}>Aucune discussion trouvée.</div>}
          {archivedList.length > 0 && (
            <>
              <button type="button" onClick={() => setShowArchived(v => !v)} className={`w-full px-3 py-3 flex items-center gap-2 text-xs ${P.sub} border-b ${P.div} cursor-pointer`}>
                <Archive className="w-4 h-4" /> Conversations cachées ({archivedList.length}) {showArchived ? '▲' : '▼'}
              </button>
              {showArchived && archivedList.filter(matches).map(t => renderThread(t, true))}
            </>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`${showList ? 'hidden' : 'flex'} md:flex flex-col flex-1 min-w-0 min-h-0`}>
        <div className="px-2.5 py-2.5 bg-[#0b2a4a] text-white flex items-center gap-2 shrink-0 shadow-md relative z-10">
          <button type="button" onClick={() => setShowList(true)} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Retour">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => { if (current.kind === 'user' && current.user) openProfile(current.user.id); else if (current.kind === 'group') setGroupInfo(true); }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
            title={current.kind === 'user' ? 'Voir le profil' : current.kind === 'group' ? 'Infos du groupe' : undefined}
          >
            {current.kind === 'user' ? (
              <Avatar src={current.user?.avatar_url} name={current.title} className="w-11 h-11 rounded-full ring-2 ring-white/40" />
            ) : current.kind === 'group' && current.group?.avatar_url ? (
              <img src={current.group.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-white/40" />
            ) : (
              <span className="w-11 h-11 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0">
                {current.kind === 'pair' ? <EyeOff className="w-5 h-5 text-white" /> : <Users className="w-5 h-5 text-white" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-base leading-tight text-white" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.title}</span>
              <span className="block text-xs text-blue-200" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {typingNames.length > 0
                  ? <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">{typingNames.slice(0, 2).join(', ')}{typingNames.length > 2 ? ' et d’autres' : ''} écrit… <TypingDots /></span>
                  : current.subtitle}
              </span>
            </span>
          </button>
          <button type="button" onClick={() => setThreadMenu(true)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Options de la conversation">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {pinShown && (
          <button
            type="button"
            onClick={() => { jumpTo(pinShown.id); if (pinned.length > 1) setPinIdx(i => i + 1); }}
            className={`w-full px-3 py-1 flex items-center gap-2 text-left cursor-pointer shrink-0 border-b ${P.div} ${L ? 'bg-blue-50' : 'bg-blue-500/10'}`}
            title="Aller au message épinglé"
          >
            <Pin className="w-3 h-3 text-blue-600 shrink-0" />
            <span className={`flex-1 min-w-0 text-[11px] ${P.sub}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pinned.length > 1 ? `${(pinIdx % pinned.length) + 1}/${pinned.length} · ` : ''}<b className="text-blue-600">{pinShown.sender_name.split(' ')[0]}</b> : {pinShown.message || pinShown.attachment_name || 'Pièce jointe'}
            </span>
          </button>
        )}

        <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScrollArea} onLoadCapture={() => { const el = scrollRef.current; if (el && atBottomRef.current) el.scrollTop = el.scrollHeight; }} className={`h-full p-3 overflow-y-auto overscroll-contain space-y-1.5 ${P.area}`}>
          {visible.length === 0 && <div className={`text-center text-xs pt-8 ${P.sub}`}>Aucun message. Écris le premier.</div>}
          {visible.map((msg, i) => {
            const isMe = msg.sender_id === currentUser.id;
            const day = String(msg.timestamp).slice(0, 10);
            const newDay = i === 0 || String(visible[i - 1].timestamp).slice(0, 10) !== day;
            const time = String(msg.timestamp).slice(11, 16);
            const gone = !!msg.deleted_at;
            const sameSender = i > 0 && !newDay && visible[i - 1].sender_id === msg.sender_id && !visible[i - 1].deleted_at;
            const readers = isMe && !gone ? readersOf(msg) : [];
            const totalOthers = current.kind === 'group' && current.group ? current.group.members.filter(id => id !== currentUser.id).length : 0;
            return (
              <React.Fragment key={msg.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className={`px-3 py-1 text-[11px] rounded-full ${P.pill}`}>{dayLabel(day)}</span>
                  </div>
                )}
                <div data-msg-id={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} ${sameSender ? '' : 'pt-1'} ${!knownRef.current.ids.has(msg.id) ? (isMe ? 'df-msg-in-right' : 'df-msg-in-left') : ''}`}>
                  {!isMe && showNames && (
                    sameSender
                      ? <span className="w-8 shrink-0" />
                      : <button type="button" onClick={() => openProfile(msg.sender_id)} className="shrink-0 cursor-pointer" title="Voir le profil"><Avatar src={users.find(u => u.id === msg.sender_id)?.avatar_url} name={msg.sender_name} className="w-8 h-8 rounded-full" /></button>
                  )}
                  <div className={`flex flex-col min-w-0 max-w-[82%] sm:max-w-md ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      onTouchStart={e => !gone && startPress(msg, e.currentTarget)}
                      onTouchEnd={stopPress}
                      onTouchMove={stopPress}
                      onTouchCancel={stopPress}
                      onMouseDown={e => { if (!gone && e.button === 0) startPress(msg, e.currentTarget); }}
                      onMouseUp={stopPress}
                      onMouseLeave={stopPress}
                      onContextMenu={e => { e.preventDefault(); if (!gone) openMenu(msg, e.currentTarget); }}
                      style={(() => {
                        if (gone || isMe || (!msg.message && !msg.reply_to && msg.attachment_url)) return { WebkitTouchCallout: 'none' } as React.CSSProperties;
                        const sd = users.find(u => u.id === msg.sender_id);
                        const ac = accentStyles(accentOf(sd || { name: msg.sender_name }), L);
                        return { WebkitTouchCallout: 'none', backgroundColor: ac.bubbleBg, borderColor: ac.bubbleBorder } as React.CSSProperties;
                      })()}
                      className={`${msg.reply_to ? 'w-full min-w-[13.5rem]' : 'min-w-0'} text-sm leading-relaxed break-words select-none md:select-text rounded-2xl ${
                        !gone && !msg.message && !msg.reply_to && msg.attachment_url
                          ? `${L ? 'text-slate-800' : 'text-slate-100'}`
                          : `px-3 py-1.5 shadow-sm ${isMe ? 'rounded-br-md' : 'rounded-bl-md'} ${gone ? `${L ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-[#101822] text-slate-500 border border-slate-800'}` : isMe ? P.outBub : P.inBub}`
                      } ${menuMsg?.id === msg.id ? 'ring-2 ring-emerald-400' : ''} ${editingId === msg.id ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {!gone && !isMe && showNames && !sameSender && (
                        <button type="button" onClick={() => openProfile(msg.sender_id)} className="block text-left text-[12px] font-bold mb-0.5 cursor-pointer" style={{ color: accentStyles(accentOf(users.find(u => u.id === msg.sender_id) || { name: msg.sender_name }), L).name }} title="Voir le profil">
                          {msg.sender_name}
                          {msg.sender_role === 'admin' && <span className="ml-1 px-1 rounded bg-amber-500/20 text-amber-600 text-[9px]">RESPONSABLE</span>}
                        </button>
                      )}
                      {gone ? (
                        <span className="italic flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />
                          {msg.deleted_by === 'admin' ? "Ce message a été supprimé par l'administrateur" : 'Ce message a été supprimé'}
                        </span>
                      ) : (
                        <>
                          {msg.reply_to && (() => {
                            const quoted = messages.find(x => x.id === msg.reply_to!.id);
                            const qUser = users.find(u => u.id === quoted?.sender_id) || users.find(u => u.name === msg.reply_to!.sender_name);
                            const ac = accentStyles(accentOf(qUser || { name: msg.reply_to!.sender_name }), L);
                            return (
                              <button type="button" onClick={() => jumpTo(msg.reply_to!.id)} className="relative block w-full text-left mb-1 rounded-lg overflow-hidden cursor-pointer pl-3 pr-2.5 py-1" style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.92)' : ac.quoteBg, color: L ? '#1e293b' : isMe ? '#1e293b' : '#e2e8f0' }}>
                                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: ac.bar }} />
                                <span className="block text-[12px] font-bold leading-tight" style={{ color: isMe ? ac.name : ac.name }}>{msg.reply_to!.sender_name}</span>
                                <span className="block text-[13px] leading-snug break-words" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.88 }}>{msg.reply_to!.text || (msg.reply_to!.has_attachment ? 'Pièce jointe' : '')}</span>
                              </button>
                            );
                          })()}
                          {msg.attachment_url && msg.attachment_kind === 'image' && (
                            <button type="button" onClick={() => setViewer({ url: msg.attachment_url!, msg })} className={`block cursor-zoom-in ${msg.message || msg.reply_to ? 'mb-1' : ''}`} title="Agrandir">
                              <img src={msg.attachment_url} alt={msg.attachment_name || 'photo'} className="max-h-56 w-auto max-w-full rounded-xl" loading="lazy" />
                            </button>
                          )}
                          {msg.attachment_url && msg.attachment_kind !== 'image' && (
                            <button type="button" onClick={() => setFileViewer(msg)} className={`flex items-center gap-1.5 min-h-[40px] font-semibold text-left cursor-pointer ${!msg.message && !msg.reply_to ? `px-3 py-2 rounded-2xl border ${L ? 'border-slate-300' : 'border-slate-600'}` : 'mb-1 underline'}`}>
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="break-all">{msg.attachment_name || 'fichier'}</span>
                            </button>
                          )}
                          {msg.message && <span className="whitespace-pre-line">{msg.message}</span>}
                        </>
                      )}
                    </div>
                    {!gone && msg.reactions && (
                      <ReactionChips reactions={msg.reactions} meId={currentUser.id} onToggle={e => db.reactMessage(msg.id, currentUser.id, e)} dark={!L} align={isMe ? 'end' : 'start'} />
                    )}
                    {/* Petits détails sous la bulle (pas dans la bulle) */}
                    {!gone && (
                      <div className={`flex items-center gap-1 mt-0.5 px-1 text-[10px] ${P.sub}`}>
                        {msg.pinned && <Pin className="w-3 h-3 text-amber-500" />}
                        {msg.edited_at && <span className="italic">modifié ·</span>}
                        <span>{time}</span>
                        {isMe && (current.kind === 'user' || current.kind === 'group') && (
                          current.kind === 'user' ? (
                            isRead(msg)
                              ? <span className="flex items-center gap-0.5 text-sky-500 font-semibold"><CheckCheck className="w-3.5 h-3.5" />Vu</span>
                              : <span className="flex items-center gap-0.5"><Check className="w-3.5 h-3.5" />Pas encore vu</span>
                          ) : readers.length === 0 ? (
                            <button type="button" onClick={() => setSeenFor(msg)} className="flex items-center gap-0.5 cursor-pointer"><Check className="w-3.5 h-3.5" />Pas encore vu</button>
                          ) : (
                            <button type="button" onClick={() => setSeenFor(msg)} className={`flex items-center gap-0.5 font-semibold cursor-pointer ${readers.length === totalOthers ? 'text-sky-500' : ''}`}>
                              <CheckCheck className="w-3.5 h-3.5" />{readers.length === totalOthers ? 'Vu par tous' : `Vu par ${readers.length}/${totalOthers}`}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {typingNames.length > 0 && (
            <div className="df-msg-in-left flex items-end gap-1.5 pt-1">
              <div className={`px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm text-sm flex items-center gap-2 ${L ? 'bg-white text-slate-500 border border-slate-200' : 'bg-[#16243a] text-slate-300'}`}>
                <TypingDots />
                <span className="text-[11px]">{typingNames.slice(0, 2).join(', ')} écrit…</span>
              </div>
            </div>
          )}
        </div>
        {farFromBottom && newBelow === 0 && (
          <button type="button" aria-label="Aller au dernier message" title="Dernier message" onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }} className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center cursor-pointer">
            <ChevronDown className="w-6 h-6" />
          </button>
        )}
        {newBelow > 0 && (
          <button type="button" onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setNewBelow(0); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 cursor-pointer">
            <ChevronDown className="w-4 h-4" />{newBelow} nouveau{newBelow > 1 ? 'x' : ''} message{newBelow > 1 ? 's' : ''}
          </button>
        )}
        </div>

        {error && <div className="px-3 py-2 bg-red-100 border-t border-red-300 text-red-700 text-xs font-semibold">{error}</div>}

        {editingId && (
          <div className={`px-3 py-2 border-t flex items-center gap-2 text-xs ${L ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-950/40 border-amber-500/40 text-amber-200'}`}>
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 font-semibold">Modification du message</span>
            <button type="button" onClick={cancelEdit} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer" title="Annuler la modification">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {replyTo && !editingId && (
          <div className={`px-3 pt-2 border-t ${P.div} ${P.head}`}>
            <div className="relative flex items-center gap-2 rounded-xl overflow-hidden pl-3 pr-1 py-1" style={{ backgroundColor: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).quoteBg }}>
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).bar }} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold" style={{ color: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).name }}>{replyTo.sender_id === currentUser.id ? 'Toi' : replyTo.sender_name}</span>
                <span className={`block text-[13px] truncate ${P.sub}`}>{replyTo.message || replyTo.attachment_name || 'Pièce jointe'}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${P.sub}`} title="Annuler la réponse">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {canWrite ? (
          <>
          {pendingFile && (
            <div className={`px-3 pt-3 ${L ? 'bg-white' : 'bg-[#0f1b2d]'} border-t ${P.div}`}>
              <div className={`rounded-2xl border p-3 flex items-center gap-3 ${L ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/15'}`}>
                {pendingFile.type.startsWith('image/') ? (
                  <img src={pendingUrl || undefined} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="w-14 h-14 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0"><Paperclip className="w-6 h-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${P.title}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingFile.name}</p>
                  <p className={`text-xs ${P.sub}`}>{sizeLabel(pendingFile.size)}</p>
                  {pendingFile.type.startsWith('image/') && pendingFile.type !== 'image/gif' && (
                    <label className="mt-1 flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      <span className={P.title}>Compresser la photo <span className={P.sub}>{compress ? '(plus léger, recommandé)' : '(taille originale)'}</span></span>
                    </label>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button type="button" disabled={busy} onClick={sendPendingFile} className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{busy ? 'Envoi…' : 'Envoyer'}</button>
                  <button type="button" disabled={busy} onClick={() => setPendingFile(null)} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${L ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-200'}`}>Annuler</button>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); send(); }} className={`px-3 pt-3 pb-3 ${L ? 'bg-white border-slate-200' : 'bg-[#0f1b2d] border-white/10'} border-t shadow-[0_-6px_18px_-12px_rgba(15,30,58,0.35)] shrink-0`}>
            <div className={`flex items-center gap-1.5 rounded-3xl border pl-1.5 pr-1.5 py-1.5 ${L ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/15'}`}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf,text/plain" onChange={onFile} className="hidden" />
              <button
                type="button"
                disabled={busy || !!editingId}
                onClick={() => fileRef.current?.click()}
                className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0 ${L ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-300 hover:bg-white/10'}`}
                title="Joindre une photo ou un fichier (10 Mo max)"
              >
                <Paperclip className="w-6 h-6" />
              </button>
              <input
                type="text"
                value={text}
                onChange={e => { setText(e.target.value); if (e.target.value.trim() && !editingId && !current.readOnly) db.pingTyping(current.id); }}
                enterKeyHint="send"
                placeholder={busy ? 'Envoi du fichier…' : 'Écrire un message…'}
                className={`flex-1 min-w-0 h-12 bg-transparent border-0 px-2 text-base focus:outline-none focus:ring-0 ${L ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'}`}
                style={{ boxShadow: 'none', border: 'none' }}
              />
              <button type="submit" disabled={busy} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} className={`${sendPulse ? 'df-send-pulse ' : ''}w-12 h-12 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50 shrink-0 shadow-md`} title="Envoyer">
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
          </>
        ) : (
          <div className={`p-3 ${P.head} border-t text-center text-[11px] shrink-0 ${P.sub}`}>
            Lecture seule : tu consultes une discussion entre deux opérateurs.
          </div>
        )}
      </div>

      {/* Menu des options de la conversation */}
      {threadMenu && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={() => setThreadMenu(false)}>
          <div className={`w-full max-w-xs rounded-2xl overflow-hidden border shadow-2xl ${P.pop}`} onClick={e => e.stopPropagation()}>
            <div className={`px-4 py-2.5 border-b ${P.div} text-xs truncate ${P.sub}`}>{current.title}</div>
            {current.kind === 'user' && current.user && (
              <button type="button" onClick={() => { setThreadMenu(false); openProfile(current.user!.id); }} className={`w-full px-4 py-3 flex items-center gap-2.5 text-sm cursor-pointer ${P.popHover}`}>
                <Info className="w-4 h-4 text-emerald-600" /> Voir le profil
              </button>
            )}
            {current.kind === 'group' && (
              <button type="button" onClick={() => { setThreadMenu(false); setGroupInfo(true); }} className={`w-full px-4 py-3 flex items-center gap-2.5 text-sm cursor-pointer ${P.popHover}`}>
                <Info className="w-4 h-4 text-emerald-600" /> Infos du groupe
              </button>
            )}
            {archived[current.id] && archived[current.id] >= lastTs(current) ? (
              <button type="button" onClick={() => toggleArchive(current, false)} className={`w-full px-4 py-3 flex items-center gap-2.5 text-sm cursor-pointer ${P.popHover}`}>
                <ArchiveRestore className="w-4 h-4 text-emerald-600" /> Afficher de nouveau la conversation
              </button>
            ) : (
              <button type="button" onClick={() => toggleArchive(current, true)} className={`w-full px-4 py-3 flex items-center gap-2.5 text-sm cursor-pointer ${P.popHover}`}>
                <Archive className="w-4 h-4 text-amber-500" /> Cacher la conversation
              </button>
            )}
            <button type="button" onClick={() => setThreadMenu(false)} className={`w-full px-4 py-2.5 text-xs border-t cursor-pointer ${P.div} ${P.sub}`}>Fermer</button>
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

      {/* Menu d'actions : petit menu juste sous le message (appui long ou clic droit) */}
      {menuMsg && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/15" onClick={() => setMenuMsg(null)} onContextMenu={e => { e.preventDefault(); setMenuMsg(null); }}>
          <div className="fixed" style={popStyle()} onClick={e => e.stopPropagation()}>
          {!menuMsg.deleted_at && (
            <div className="mb-2 flex" style={{ justifyContent: menuMsg.sender_id === currentUser.id ? 'flex-end' : 'flex-start' }}>
              <EmojiPicker
                dark={!L}
                mine={Object.entries(menuMsg.reactions || {}).find(([, ids]) => ids.includes(currentUser.id))?.[0]}
                onPick={e => { db.reactMessage(menuMsg.id, currentUser.id, e); setMenuMsg(null); }}
              />
            </div>
          )}
          <div className={`rounded-2xl overflow-hidden border shadow-2xl ${P.pop}`}>
            {menuActions.map(a => {
              const I = a.icon;
              return (
                <button key={a.k} type="button" onClick={a.run} className={`w-full h-11 px-4 flex items-center gap-3 text-sm cursor-pointer ${P.popHover} ${a.k === 'del' ? 'text-red-500' : ''}`}>
                  <I className={`w-4 h-4 shrink-0 ${a.color}`} />{a.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>,
        document.body
      )}

      {/* Qui a vu le message (groupes) */}
      {seenFor && current.group && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={() => setSeenFor(null)}>
          <div className={`w-full max-w-xs rounded-2xl overflow-hidden border shadow-2xl ${P.pop}`} onClick={e => e.stopPropagation()}>
            <div className={`px-4 py-2.5 border-b ${P.div} text-sm font-bold`}>Vu par</div>
            <div className="max-h-72 overflow-y-auto">
              {current.group.members.filter(id => id !== currentUser.id).map(id => {
                const seen = readersOf(seenFor).includes(id);
                return (
                  <div key={id} className="px-4 py-2.5 flex items-center gap-2.5 text-sm">
                    <Avatar src={users.find(u => u.id === id)?.avatar_url} name={nameOf(id)} className="w-8 h-8 rounded-full" />
                    <span className="flex-1 min-w-0 truncate">{nameOf(id)}</span>
                    {seen ? <span className="flex items-center gap-1 text-xs font-semibold text-sky-500"><CheckCheck className="w-3.5 h-3.5" />Vu</span> : <span className={`text-xs ${P.sub}`}>Pas encore vu</span>}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setSeenFor(null)} className={`w-full px-4 py-2.5 text-xs border-t cursor-pointer ${P.div} ${P.sub}`}>Fermer</button>
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
          names={gallery.map(m => m.attachment_name || 'photo.png')}
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
