// Messagerie complète : liste des discussions (général, privées, groupes), conversation, pièces jointes, réponses, épinglage, archivage et assistant.
// Utilisé par : App.tsx et prefetch.ts.
// Pour modifier : props currentUser, initialThreadId, onOpenProfile et onNavigate. Fichier très long. Pour une ligne avec « … », utiliser le style ONE_LINE, car la classe truncate est neutralisée.
import { useDraft } from '../utils/useDraft';
import { useKeepBottom } from '../utils/useKeepBottom';
import { ChatSearch } from './ChatSearch';
import { ChatMarksList } from './ChatMarksList';
import { markedCount } from '../utils/chatMarksList';
import { canUseSharedTools } from '../utils/chatShared';
import { ChatForward } from './ChatForward';
import { LONG_PRESS_MS, movedTooFar, isGhostClick, stripIds } from '../utils/longPress';
import { MARK_STYLE, markBackground, MARK_SHADOW, markOf, marksOf, toggleImportant, canForward, forwardFrom } from '../utils/chatMarks';
import { stepNav } from '../utils/chatSearch';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { composerEnter, isDesktopPointer, useAutoGrow } from '../utils/composerKeys';
import { Bot } from 'lucide-react';
import { ChatVisibleTo } from './ChatVisibleTo';
import { ChatEphemeral, ephemeralText } from './ChatEphemeral';
import { isComposerSwipe } from '../utils/chatSwipe';
import { isHiddenFrom, isExpired, planEphemeral, VISIBLE_TO_SERVER_LIVE, EPHEMERAL_SERVER_LIVE } from '../utils/chatShared';
import { AssistantChat, lastAssistantPreview } from './AssistantChat';
import {
  Send, Paperclip, FileText, Users, MessageSquare, BarChart3, CalendarDays, Clock, Eye, Lock, Timer, ArrowLeft, MoreVertical, Pin, PinOff, Pencil, Trash2, Copy, X,
  Reply, Check, CheckCheck, Plus, Archive, ArchiveRestore, EyeOff, Ban, Info, Search, ChevronDown, Flag, Forward,
} from 'lucide-react';
import { db } from '../db/store';
import { ChatGroup, ChatMessage, User } from '../types';
import { compressProofImage } from '../utils/imageUtils';
import { Avatar } from './Avatar';
import { PendingMark } from './PendingMark';
import { markChatSeen } from '../utils/notifications';
import { LightboxModal } from './LightboxModal';
import { FileViewerModal } from './FileViewerModal';
import { createPortal } from 'react-dom';
import { askConfirm } from './ConfirmModal';
import { NewChatModal, GroupInfoModal } from './ChatDialogs';
import { takeChatThread, CHAT_THREAD_EVENT } from '../utils/navTarget';
import { getPinnedThreads, getImportantMessages, setImportantMessages, togglePinnedThread, pinFirst } from '../utils/chatPrefs';
import { ChatAbout } from './ChatAbout';
import { aboutThread, type AboutAction } from '../utils/chatAbout';
import { getArchivedThreads, getHiddenMessages, hideMessageForMe, setThreadArchived, getThreadSeen, setThreadSeen, hasThreadSeen, initThreadSeen } from '../utils/chatPrefs';
import { useApp } from '../context/AppContext';
import { LinkedText } from './LinkedText';
import { previewText } from '../utils/newsLink';
import { playUiSound } from '../utils/notifSound';
import { applyDeepLink, deepLinkAllowed } from '../utils/deepLink';
import { TypingDots } from './Reactions';
import { liveStatus, type LiveInfo } from '../utils/presenceStatus';
import { useNow } from '../utils/useNow';
import { LiveDot, LiveLine } from './LiveStatus';
import { useViewportWidth } from '../utils/viewportWidth';
import { onlineBadge, isTracked } from '../utils/attendanceView';
import { guardScroller } from '../utils/chatScrollGuard';
import { tap } from '../utils/haptic';
import { noteResume, takeBootChat } from '../utils/resumeState';
import { ChatPoll, PollComposer, PollKindIcon } from './ChatPoll';
import { MessageToItem } from './MessageToItem';
import { ScheduleDialog, TemplatesDialog } from './MessageTools';
import { scheduleLabel } from '../utils/chatTemplates';
import { ACCEPT_ATTR, OK_TYPES, typeOfFile } from '../utils/attachments';
import { accentOf, accentStyles, useAccentVersion } from '../utils/avatarColor';

/** Une seule ligne avec « … » : la règle globale « Mots jamais coupés » (index.css) neutralise la classe `truncate` (avec !important), il faut donc ce style en ligne, sans cette classe. Pour les aperçus, qu'un long message ne doit jamais gonfler. */
const ONE_LINE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

const MAX_BYTES = 10 * 1024 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });

// Un « fil » : groupe général, groupe créé par quelqu'un, discussion 1 à 1, ou (vue admin) discussion entre deux opérateurs
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

export const ChatView: React.FC<{ currentUser: User; initialThreadId?: string; onOpenProfile?: (u: User) => void; onNavigate?: (view: string) => void }> = ({ currentUser, initialThreadId, onOpenProfile, onNavigate }) => {
  const isAdmin = currentUser.role === 'admin';
  const app = useApp();
  const L = app.theme === 'light';
  const lang = app.lang;
  const chatLang: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const nowMs = useNow(15000); // les statuts changent d'eux-mêmes (En ligne → En pause → Hors ligne)
  // Statut EN DIRECT d'un opérateur : seul le responsable reçoit les signes de vie ; pour les autres on n'affiche rien plutôt qu'un faux « Hors ligne »
  const liveOf = (u?: User | null): LiveInfo | null => (isAdmin && u && isTracked(u.role) ? liveStatus(u, db.getPosts(), db.getPresence(), nowMs) : null);
  // Couleurs de la messagerie (clair par défaut, sombre en option)
  const P = {
    root: L ? 'bg-white border-slate-300' : 'bg-[#0f1722] border-slate-800',
    side: L ? 'bg-white border-slate-200' : 'bg-[#0c131c] border-slate-800',
    head: L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-[#131d2a] border-slate-800',
    area: L ? 'chat-wallpaper chat-wallpaper-light' : 'chat-wallpaper chat-wallpaper-dark',
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
  const [messages, setMessages] = useState<ChatMessage[]>(db.getMessages().filter(m => !isHiddenFrom(currentUser, m) && !isExpired(m, Date.now())));
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [groups, setGroups] = useState<ChatGroup[]>(db.getGroups());
  const [reads, setReads] = useState(db.getChatReads());
  const [bootChat] = useState(() => takeBootChat()); // reprise après rechargement : la discussion qui était ouverte
  const [threadId, setThreadId] = useState<string>(initialThreadId || bootChat || 'all');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(() => !(bootChat && !initialThreadId && window.innerWidth < 768)); // mobile : liste ou conversation (rouverte après un rechargement si elle était ouverte)
  useEffect(() => { noteResume(currentUser.id, { chat: window.innerWidth < 768 && showList ? '' : threadId }); }, [threadId, showList, currentUser.id]); // reprise : discussion ouverte ('' = la liste)
  const [hidden, setHidden] = useState<Set<string>>(() => getHiddenMessages(currentUser.id)); // « supprimés pour moi »
  const [archived, setArchived] = useState<Record<string, number>>(() => getArchivedThreads(currentUser.id));
  const [showArchived, setShowArchived] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [groupInfo, setGroupInfo] = useState(false);
  const [threadMenu, setThreadMenu] = useState(false);
  const [pinnedThreads, setPinnedThreads] = useState<string[]>(() => getPinnedThreads(currentUser.id));
  const [aboutOf, setAboutOf] = useState<{ id: string; menuOnly: boolean } | null>(null); // fiche « À propos » (clic sur le rond) ou menu d'appui long (menuOnly)
  const rowPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowLong = useRef(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [q, setQ] = useState('');
  const [importantIds, setImportantIds] = useState<string[]>(() => getImportantMessages(currentUser.id)); // messages « Important » (privé, sur cet appareil)
  const [marksOpen, setMarksOpen] = useState<null | 'this' | 'all'>(null); // fenêtre « Importants et épinglés »
  const [jumpAfter, setJumpAfter] = useState<{ thread: string; id: string } | null>(null); // message à rejoindre une fois la bonne discussion ouverte
  const [fwdMsg, setFwdMsg] = useState<ChatMessage | null>(null); // message en cours de transfert
  const [nav, setNav] = useState<{ ids: string[]; i: number } | null>(null); // « précédent / suivant » parmi les résultats de la recherche (comme Telegram)
  const [search, setSearch] = useState<{ day: string | null } | null>(null); // recherche de messages (loupe, ou clic sur une date du fil)
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [menuHtml, setMenuHtml] = useState('');
  const [seenFor, setSeenFor] = useState<ChatMessage | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [seenMap, setSeenMap] = useState<Record<string, number>>(() => getThreadSeen(currentUser.id));
  const [pickedUsers, setPickedUsers] = useState<string[]>([]); // discussions ouvertes via « + » avant le premier message

  // Arrivée depuis une notification : on ouvre directement la discussion concernée
  useEffect(() => {
    const open = () => { const t = takeChatThread(); if (t) { if (t !== 'all' && !t.startsWith('grp_') && !t.startsWith('pair:')) setPickedUsers(p => (p.includes(t) ? p : [...p, t])); setThreadId(t); setShowList(false); } }; // « Message » depuis un profil : la discussion s'ouvre même sans message avant
    open();
    window.addEventListener(CHAT_THREAD_EVENT, open);
    return () => window.removeEventListener(CHAT_THREAD_EVENT, open);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevThreadRef = useRef('');
  const prevLenRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Le champ grandit avec le texte (jusqu'à ~6 lignes) puis défile
  useAutoGrow(composerRef, `${threadId}|${text}`, 40);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  useDraft(currentUser.id, `chat:${threadId}`, text, setText, !!editingId); // brouillon par discussion (pas pendant la modification d'un message envoyé)
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
      setMessages(db.getMessages().filter(m => !isHiddenFrom(currentUser, m) && !isExpired(m, Date.now())));
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
    if (isAdmin) users.filter(u => u.role === 'employee' && !u.entry_only).forEach(u => withMsgs.add(u.id)); // M26.7 : un employé « saisie » n'a pas de compte : pas de discussion
    else withMsgs.add(adminId);
    pickedUsers.forEach(id => withMsgs.add(id));
    withMsgs.forEach(id => {
      const u = users.find(x => x.id === id);
      if (u && !u.entry_only && id !== currentUser.id) list.push({ id, kind: 'user', title: u.name, subtitle: u.role === 'admin' ? 'Conversation privée' : `@${u.username}`, user: u });
    });
    // Vue admin : discussions entre deux opérateurs (l'admin voit tout)
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
    const l = messages.filter(m => inThread(m, t) && !hidden.has(m.id) && !m.deleted_at);
    return l[l.length - 1];
  };
  const sorted = useMemo(() => {
    const withTs = threads.map(t => ({ t, ts: lastTs(t) }));
    withTs.sort((a, b) => (a.t.id === 'all' ? -1 : b.t.id === 'all' ? 1 : b.ts - a.ts));
    return pinFirst(withTs.map(x => ({ ...x, id: x.t.id })), pinnedThreads).map(({ t, ts }) => ({ t, ts }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, messages, pinnedThreads]);
  // Cachée = l'heure de masquage est plus récente que le dernier message
  const isArchived = (t: Thread, ts: number) => !!archived[t.id] && archived[t.id] >= ts;
  const shownList = sorted.filter(x => !isArchived(x.t, x.ts)).map(x => x.t);
  const archivedList = sorted.filter(x => isArchived(x.t, x.ts)).map(x => x.t);

  const onAssistant = isAdmin && threadId === 'assistant';
  const current = threads.find(t => t.id === threadId) || threads[0];
  // « Visible seulement par… » : responsable, chef d'équipe, créateur du groupe (dans son groupe) ; jamais dans une discussion à deux (le serveur applique la même règle)
  const canOnly = (VISIBLE_TO_SERVER_LIVE || db.isDemo()) && !!current && !current.readOnly && current.kind !== 'pair' && canUseSharedTools(currentUser, current.kind === 'group' ? current.group : null);
  const ephMs = current ? db.getEphemeralMs(current.id) : 0;
  const canEph = (EPHEMERAL_SERVER_LIVE || db.isDemo()) && !!current && !current.readOnly && (current.kind === 'all' || current.kind === 'group') && planEphemeral(currentUser, current.kind === 'group' ? current.group : null, current.id, 0).ok;
  const pickEph = async (ms: number) => { if (!current) return; setEphBusy(true); setEphErr(''); const r = await db.setChatEphemeral(current.id, ms); setEphBusy(false); if (r.success) setEphOpen(false); else setEphErr(r.error || 'Refusé.'); };
  const onlyPeople = current ? (current.kind === 'group' && current.group ? current.group.members.map(id => ({ id, name: db.getUsers().find(u => u.id === id)?.name || '?' })) : db.getUsers().filter(u => u.status !== 'blocked').map(u => ({ id: u.id, name: u.name }))).filter(p => p.id !== currentUser.id) : [];
  useEffect(() => { const el = scrollRef.current; return el ? guardScroller(el) : undefined; }, [current?.id]); // fin de liste : la page ne bouge pas
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = listRef.current; return el ? guardScroller(el) : undefined; }, []);
  const keep = useKeepBottom(() => scrollRef.current, () => atBottomRef.current, current?.id); // le clavier ne doit jamais couper le dernier message
  // Ordinateur : la liste et la conversation sont côte à côte ; téléphone : l'une ou l'autre
  const vwNow = useViewportWidth(); // se met à jour à la rotation
  const convVisible = !showList || vwNow >= 768;
  const visible = messages.filter(m => inThread(m, current) && !hidden.has(m.id) && !m.deleted_at); // un message supprimé disparaît sans trace
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
      if (last?.sender_id === currentUser.id) {
        // Mon message : descente immédiate (pas animée), répétée : la zone de saisie, la bulle qui apparaît et les photos changent la hauteur juste après (sinon la liste restait en haut)
        atBottomRef.current = true;
        const down = () => { const e = scrollRef.current; if (e) e.scrollTop = e.scrollHeight; };
        down(); requestAnimationFrame(down);
        [60, 150, 300, 600].forEach(ms => setTimeout(() => { if (atBottomRef.current) down(); }, ms));
        setNewBelow(0);
      } else if (atBottomRef.current) {
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
    if (!keep.pinned()) atBottomRef.current = gap < 120; // pendant que le clavier monte, le redimensionnement n'est pas « j'ai remonté »
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
  const [plusOpen, setPlusOpen] = useState(false);
  useEffect(() => { if (!plusOpen) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlusOpen(false); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [plusOpen]);
  const [itemMsg, setItemMsg] = useState<ChatMessage | null>(null); // message à transformer en rappel / tâche / événement
  const [tool, setTool] = useState<'schedule' | 'templates' | null>(null);
  const [onlyTo, setOnlyTo] = useState<string[]>([]); // « visible seulement par… » pour le prochain message
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [ephOpen, setEphOpen] = useState(false);
  const [ephBusy, setEphBusy] = useState(false);
  const [ephErr, setEphErr] = useState('');
  const swipe0 = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { setMessages(db.getMessages().filter(m => !isHiddenFrom(currentUser, m) && !isExpired(m, nowMs))); }, [nowMs, currentUser]); // un message éphémère disparaît à l'écran à son heure (horloge du serveur, toutes les 15 s ; le serveur l'efface ensuite pour de bon)
  const [pollKind, setPollKind] = useState<'poll' | 'date' | 'ack' | null>(null);
  const sendPoll = (poll: { question: string; options: string[]; kind: 'poll' | 'date' | 'ack' }) => {
    if (current.readOnly) return;
    playUiSound('send');
    db.sendMessage({ senderId: currentUser.id, message: '', recipientId: current.id === 'all' ? 'all' : current.id, poll });
    setPollKind(null);
  };
  const send = (extra?: { url: string; name: string; kind: 'image' | 'file'; albumId?: string; noText?: boolean; noReply?: boolean }) => {
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
    playUiSound('send');
    db.sendMessage({
      senderId: currentUser.id,
      message: extra?.noText ? '' : text,
      recipientId: current.id === 'all' ? 'all' : current.id,
      attachmentUrl: extra?.url,
      attachmentName: extra?.name,
      attachmentKind: extra?.kind,
      replyTo: extra?.noReply ? undefined : (replyTo || undefined),
      albumId: extra?.albumId,
      ...(onlyTo.length && !extra?.noText ? { visibleTo: onlyTo } : {}),
    });
    if (!extra?.noText) { setText(''); setOnlyTo([]); }
    setReplyTo(null);
    setSendPulse(true);
    window.setTimeout(() => setSendPulse(false), 320);
  };

  // Fichier choisi : on l'affiche d'abord avec l'option « Compresser » (activée par défaut), puis on l'envoie
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [compress, setCompress] = useState(true);
  const pendingFile = pendingFiles[0] || null;
  const pendingUrls = useMemo(() => pendingFiles.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')), [pendingFiles]);
  useEffect(() => () => { pendingUrls.forEach(u => { if (u) URL.revokeObjectURL(u); }); }, [pendingUrls]);
  const MAX_PHOTOS = 30;
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (list.length === 0) return;
    setError(null);
    let picked = list;
    if (list.length > 1) {
      // Plusieurs fichiers : seulement des photos (comme WhatsApp)
      picked = list.filter(f => f.type.startsWith('image/'));
      if (picked.length < list.length) setError('Plusieurs fichiers : seules les photos sont gardées.');
      if (picked.length > MAX_PHOTOS) { picked = picked.slice(0, MAX_PHOTOS); setError(`${MAX_PHOTOS} photos maximum à la fois.`); }
    }
    const good = picked.filter(f => f.size <= MAX_BYTES && OK_TYPES.includes(typeOfFile(f)));
    if (good.length < picked.length) setError(good.length === 0 ? (picked[0].size > MAX_BYTES ? 'Fichier trop gros (10 Mo maximum).' : 'Type non accepté : photo, PDF, Word, Excel ou texte seulement.') : 'Certains fichiers trop gros ou non acceptés ont été ignorés.');
    if (good.length === 0) return;
    setCompress(true);
    setPendingFiles(good);
  };
  const sendPendingFile = async () => {
    const files = pendingFiles;
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    const albumId = files.length > 1 ? `alb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : undefined;
    let done = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type.startsWith('image/') && file.type !== 'image/gif';
        let dataUrl = isImage && compress ? await compressProofImage(file, 1600, 300 * 1024) : await readAsDataUrl(file);
        if (!file.type) dataUrl = dataUrl.replace(/^data:[^;,]*/, `data:${typeOfFile(file)}`);
        const url = await db.uploadFile(dataUrl);
        if (!url) { setError('Envoi impossible. Réessaie.'); break; }
        // La citation part avec la première photo, le texte avec la dernière
        send({ url, name: file.name, kind: file.type.startsWith('image/') ? 'image' : 'file', albumId, noText: i < files.length - 1, noReply: i > 0 });
        done++;
      }
    } catch {
      setError('Envoi impossible. Réessaie.');
    } finally {
      setPendingFiles(done >= files.length ? [] : files.slice(done));
      setBusy(false);
    }
  };
  const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

  const menuOpenedAt = useRef(0); // heure d'ouverture du menu : le relâchement du doigt ne doit pas le refermer
  const pressXY = useRef<{ x: number; y: number } | null>(null);
  const rowXY = useRef<{ x: number; y: number } | null>(null);
  // Le clic « fantôme » arrive au RELÂCHEMENT du doigt, parfois bien après l'ouverture du menu (appui long de 1 s) : on repart donc de l'heure du relâchement.
  const markRelease = () => {
    const off = () => { menuOpenedAt.current = Date.now(); for (const t of ['touchend', 'touchcancel', 'mouseup']) window.removeEventListener(t, off, true); };
    for (const t of ['touchend', 'touchcancel', 'mouseup']) window.addEventListener(t, off, true);
  };
  const openMenu = (m: ChatMessage, el: HTMLElement) => {
    if (menuOpenedAt.current && isGhostClick(menuOpenedAt.current, Date.now(), 150)) return; // appui long + clic droit synchronisés : un seul menu
    window.getSelection()?.removeAllRanges(); // l'appui long ouvre le menu : jamais de sélection de texte
    menuOpenedAt.current = Date.now(); markRelease();
    setMenuRect(el.getBoundingClientRect());
    setMenuHtml(stripIds(el.outerHTML)); // copie nette du message, posée AU-DESSUS du fond (jamais floue), sans identifiants
    setMenuMsg(m);
  };
  const startPress = (m: ChatMessage, el: HTMLElement, x?: number, y?: number) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressXY.current = x !== undefined && y !== undefined ? { x, y } : null;
    pressTimer.current = setTimeout(() => { pressTimer.current = null; tap('select'); openMenu(m, el); }, LONG_PRESS_MS);
  };
  const stopPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const movePress = (x: number, y: number) => { // le doigt bouge : on n'annule que si c'est un vrai défilement
    const s0 = pressXY.current;
    if (!s0 || movedTooFar(s0.x, s0.y, x, y)) stopPress();
  };
  const startRowPress = (id: string, x?: number, y?: number) => {
    if (rowPress.current) clearTimeout(rowPress.current);
    rowLong.current = false;
    rowXY.current = x !== undefined && y !== undefined ? { x, y } : null;
    rowPress.current = setTimeout(() => { rowPress.current = null; rowLong.current = true; tap('select'); window.getSelection()?.removeAllRanges(); menuOpenedAt.current = Date.now(); markRelease(); setAboutOf({ id, menuOnly: true }); }, LONG_PRESS_MS);
  };
  const stopRowPress = () => { if (rowPress.current) clearTimeout(rowPress.current); rowPress.current = null; };
  const moveRowPress = (x: number, y: number) => {
    const s0 = rowXY.current;
    if (!s0 || movedTooFar(s0.x, s0.y, x, y)) stopRowPress();
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
      message: 'Il disparaîtra pour tous les membres de la conversation, sans laisser de trace.',
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
  const forwardTo = (threadId: string) => {
    const m = fwdMsg; if (!m) return;
    const t = threads.find(x => x.id === threadId);
    if (!t || t.readOnly || !canForward(m)) { setFwdMsg(null); return; }
    playUiSound('send');
    db.sendMessage({ senderId: currentUser.id, message: m.message || '', recipientId: t.id === 'all' ? 'all' : t.id, forwardedFrom: forwardFrom(m), ...(m.attachment_url ? { attachmentUrl: m.attachment_url, attachmentName: m.attachment_name, attachmentKind: m.attachment_kind } : {}) });
    setFwdMsg(null);
    if (t.id !== current.id) { setThreadId(t.id); setShowList(false); }
  };
  useEffect(() => { setNav(null); }, [current.id]);
  const jumpTo = (id: string) => {
    // Amène EXACTEMENT au message (au milieu de l'écran), sans animation : une animation s'arrête trop tôt quand la hauteur change (photos, bulles qui apparaissent). On réapplique tant que la personne ne touche pas l'écran, sans que « rester en bas » ne reprenne la main.
    atBottomRef.current = false;
    let touched = false;
    const mark = () => { touched = true; };
    window.addEventListener('wheel', mark, { passive: true }); window.addEventListener('touchstart', mark, { passive: true });
    const go = () => { const el = document.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null; if (el && !touched) el.scrollIntoView({ block: 'center', behavior: 'auto' }); return el; };
    const el0 = go();
    if (el0) { el0.classList.add('df-msg-found'); setTimeout(() => el0.classList.remove('df-msg-found'), 1800); }
    requestAnimationFrame(go);
    [80, 250, 600].forEach(ms => setTimeout(go, ms));
    setTimeout(() => { window.removeEventListener('wheel', mark); window.removeEventListener('touchstart', mark); }, 700);
  };
  useEffect(() => { // « Importants et épinglés » → « Toutes » : on ouvre d'abord la bonne discussion, puis on amène exactement au message
    if (jumpAfter && current.id === jumpAfter.thread) { const id = jumpAfter.id; setJumpAfter(null); setTimeout(() => jumpTo(id), 150); }
  }, [jumpAfter, current.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const marksHere = useMemo(() => markedCount(messages, importantIds, { hidden, inScope: (m: ChatMessage) => inThread(m, current) }), [messages, importantIds, hidden, current.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const preview = last ? (last.deleted_at ? 'Message supprimé' : who + (previewText(last.message || '', window.location.origin) || (last.attachment_kind === 'image' ? (last.album_id ? 'Photos' : 'Photo') : last.attachment_name ? `Fichier : ${last.attachment_name}` : ''))) : t.subtitle;
    const previewNode: React.ReactNode = last && !last.deleted_at && last.poll ? <>{who}<PollKindIcon kind={last.poll.kind} size="w-3.5 h-3.5" />{last.poll.question}</> : preview; // sondage : icône au lieu de l'emoji du texte enregistré
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
        onClick={() => { if (rowLong.current) { rowLong.current = false; return; } setThreadId(t.id); setShowList(false); setReplyTo(null); cancelEdit(); }}
        onTouchStart={e => startRowPress(t.id, e.touches[0]?.clientX, e.touches[0]?.clientY)} onTouchEnd={stopRowPress} onTouchMove={e => moveRowPress(e.touches[0]?.clientX, e.touches[0]?.clientY)} onTouchCancel={stopRowPress}
        onMouseDown={e => { if (e.button === 0) startRowPress(t.id, e.clientX, e.clientY); }} onMouseUp={stopRowPress} onMouseLeave={stopRowPress}
        onContextMenu={e => { e.preventDefault(); stopRowPress(); if (isGhostClick(menuOpenedAt.current, Date.now(), 150)) return; rowLong.current = true; menuOpenedAt.current = Date.now(); markRelease(); setAboutOf({ id: t.id, menuOnly: true }); }}
        data-thread-row={t.id}
        className={`w-full text-left pl-3 pr-3 py-2.5 flex items-center gap-3 rounded-2xl border-l-4 border cursor-pointer shadow-sm transition-colors select-none ${accent.bar} ${t.id === current.id && !onAssistant ? (L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-blue-500/20 border-blue-400/40') : (L ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/5 border-white/10 hover:bg-white/10')} ${archivedRow ? 'opacity-70' : ''}`}
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
          <span role="button" tabIndex={0} aria-label={`À propos de ${t.title}`} data-row-avatar onClick={e => { e.stopPropagation(); setAboutOf({ id: t.id, menuOnly: false }); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setAboutOf({ id: t.id, menuOnly: false }); } }} onTouchStart={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} className="relative shrink-0 rounded-full inline-flex">
            <Avatar src={t.user?.avatar_url} name={t.title} className="w-12 h-12 rounded-full ring-2 ring-offset-2 ring-slate-200" />
            {(() => { const lv = liveOf(t.user); return lv ? <LiveDot info={lv} lang={chatLang} ring={L ? 'border-white' : 'border-[#0e1622]'} /> : null; })()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {pinnedThreads.includes(t.id) && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Épinglée" />}<span className={`flex-1 min-w-0 text-[13px] font-semibold ${P.title}`} style={ONE_LINE}>{t.title}</span>
            {accent.label && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${accent.labelCls}`}>{accent.label}</span>}
            {last && <span className={`text-[11px] shrink-0 ${unread > 0 ? 'text-red-600 font-bold' : P.sub}`}>{shortTime(sentMs(last))}</span>}
          </span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className={`flex-1 min-w-0 text-[12px] ${P.sub}`} style={ONE_LINE}>{previewNode}</span>
            {unread > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white shadow text-[11px] font-bold flex items-center justify-center shrink-0">{unread > 99 ? '99+' : unread}</span>}
          </span>
        </span>
      </button>
    );
  };

  const canWrite = !current.readOnly;

  // Actions du message (menu sous le message)
  const sharedTools = canUseSharedTools(currentUser, current.kind === 'group' ? groups.find(g => g.id === current.id) || null : null); // responsable, chef d'équipe, créateur du groupe
  const menuActions = menuMsg
    ? [
        ...(canWrite ? [{ k: 'reply', label: 'Répondre', icon: Reply, color: 'text-emerald-600', run: () => startReply(menuMsg) }] : []),
        ...(menuMsg.message ? [{ k: 'copy', label: 'Copier', icon: Copy, color: 'text-slate-500', run: () => copyText(menuMsg) }] : []),
        ...(db.canEditMessage(menuMsg, currentUser.id) && menuMsg.message ? [{ k: 'edit', label: 'Modifier', icon: Pencil, color: 'text-emerald-600', run: () => startEdit(menuMsg) }] : []),
        // Épingler : l'auteur (comme avant, aussi sans réseau) ; le responsable, un chef d'équipe ou le créateur du groupe peuvent aussi épingler le message d'un autre (le serveur vérifie)
        ...(!menuMsg.deleted_at && (menuMsg.sender_id === currentUser.id || sharedTools)
          ? [{ k: 'pin', label: menuMsg.pinned ? 'Désépingler' : 'Épingler', icon: menuMsg.pinned ? PinOff : Pin, color: 'text-amber-500', run: () => { setMenuMsg(null); if (menuMsg.sender_id === currentUser.id) db.togglePinMessage(menuMsg.id, currentUser.id); else void db.setChatMark(menuMsg.id, 'pinned', !menuMsg.pinned).then(r => { if (!r.success) setError(r.error || 'Action impossible.'); }); } }]
          : []),
        ...(!menuMsg.deleted_at ? [{ k: 'important', label: importantIds.includes(menuMsg.id) ? 'Retirer des importants (pour moi)' : 'Important pour moi', icon: Flag, color: 'text-rose-500', run: () => { const next = toggleImportant(importantIds, menuMsg.id); setImportantIds(next); setImportantMessages(currentUser.id, next); setMenuMsg(null); } }] : []),
        // « Important pour tous » : posé par le responsable, un chef d'équipe ou le créateur du groupe ; retiré par celui qui l'a posé ou le responsable (le serveur vérifie)
        ...(!menuMsg.deleted_at && (menuMsg.important_all ? (menuMsg.important_all.by === currentUser.id || currentUser.role === 'admin') : sharedTools)
          ? [{ k: 'important_all', label: menuMsg.important_all ? 'Retirer « Important pour tous »' : 'Important pour tous', icon: Flag, color: 'text-rose-600', run: () => { const id = menuMsg.id, on = !menuMsg.important_all; setMenuMsg(null); void db.setChatMark(id, 'important', on).then(r => { if (!r.success) setError(r.error || 'Action impossible.'); }); } }]
          : []),
        ...(canForward(menuMsg) ? [{ k: 'forward', label: 'Transférer', icon: Forward, color: 'text-violet-500', run: () => { setFwdMsg(menuMsg); setMenuMsg(null); } }] : []),
        ...((menuMsg.message || menuMsg.poll) && !menuMsg.deleted_at ? [{ k: 'item', label: 'Rappel, tâche, événement', icon: CalendarDays, color: 'text-blue-500', run: () => { setItemMsg(menuMsg); setMenuMsg(null); } }] : []),
        { k: 'hide', label: 'Supprimer pour moi', icon: EyeOff, color: 'text-slate-500', run: () => deleteForMe(menuMsg) },
        ...(db.canDeleteForAll(menuMsg, currentUser.id) ? [{ k: 'del', label: 'Supprimer pour tous', icon: Trash2, color: 'text-red-500', run: () => confirmDelete(menuMsg) }] : []),
      ]
    : [];
  const popStyle = (): React.CSSProperties => {
    if (!menuRect) return { top: 80, left: 8 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = 256;
    const H = menuActions.length * 44 + 10;
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
          <button type="button" data-chat-marks-open-all onClick={() => setMarksOpen('all')} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Importants et épinglés" aria-label="Importants et épinglés"><Flag className="w-5 h-5" /></button>
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
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2">
          {isAdmin && (
            <button type="button" data-assistant-row onClick={() => { setThreadId('assistant'); setShowList(false); setReplyTo(null); cancelEdit(); }}
              className={`w-full text-left pl-3 pr-3 py-2.5 flex items-center gap-3 rounded-2xl border-l-4 border border-l-sky-500 cursor-pointer shadow-sm ${onAssistant ? (L ? 'bg-[#dbeafe] border-[#93c5fd]' : 'bg-blue-500/20 border-blue-400/40') : (L ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10')}`}>
              <span className="w-12 h-12 rounded-full bg-sky-600 flex items-center justify-center shrink-0"><Bot className="w-6 h-6 text-white" /></span>
              <span className="min-w-0 flex-1"><span className={`block font-bold text-sm ${P.title}`}>Assistant <span className="ml-1 text-[11px] font-semibold rounded-full px-1.5 py-0.5 bg-sky-100 text-sky-700">IA</span></span><span className={`block text-xs truncate ${P.sub}`}>{lastAssistantPreview(currentUser.id, 'fr') || 'Résumé, quoi faire, « et si… »'}</span></span>
            </button>
          )}
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
      {onAssistant && <AssistantChat userId={currentUser.id} onBack={() => setShowList(true)} onNavigate={onNavigate} className={showList ? 'hidden md:flex' : 'flex'} />}
      <div className={`${onAssistant ? 'hidden' : `${showList ? 'hidden' : 'flex'} md:flex`} flex-col flex-1 min-w-0 min-h-0`}>
        <div className="px-2.5 py-2.5 bg-[#0b2a4a] text-white flex items-center gap-2 shrink-0 shadow-md relative z-10">
          <button type="button" onClick={() => setShowList(true)} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Retour">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => { if (current.kind === 'user' && current.user) openProfile(current.user.id); else if (current.kind === 'group') setGroupInfo(true); }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
            aria-label={current.kind === 'user' ? 'Voir le profil' : 'Infos du groupe'} title={current.kind === 'user' ? 'Voir le profil' : current.kind === 'group' ? 'Infos du groupe' : undefined}
          >
            {current.kind === 'user' ? (
              <span className="relative shrink-0 inline-flex">
                <Avatar src={current.user?.avatar_url} name={current.title} className="w-11 h-11 rounded-full ring-2 ring-white/40" />
                {(() => { const lv = liveOf(current.user); return lv ? <LiveDot info={lv} lang={chatLang} ring="border-blue-600" /> : null; })()}
              </span>
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
                  : (() => { const lv = current.kind === 'user' ? liveOf(current.user) : null; return lv ? <LiveLine info={lv} lang={chatLang} className="text-blue-100" /> : current.subtitle; })()}
              </span>
            </span>
          </button>
          {canEph && <button type="button" data-ephemeral-open onClick={() => { setEphErr(''); setEphOpen(true); }} className="relative w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Messages éphémères" aria-label="Messages éphémères"><Timer className="w-5 h-5" />{ephMs > 0 && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400" aria-hidden />}</button>}
          <button type="button" data-chat-marks-open onClick={() => setMarksOpen('this')} className="relative w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Importants et épinglés" aria-label="Importants et épinglés">
            <Flag className="w-5 h-5" />
            {marksHere > 0 && <span data-chat-marks-count className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[11px] font-bold text-white flex items-center justify-center">{marksHere > 99 ? '99+' : marksHere}</span>}
          </button>
          <button type="button" data-chat-search-open onClick={() => setSearch({ day: null })} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Rechercher dans la conversation" aria-label="Rechercher dans la conversation">
            <Search className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setThreadMenu(true)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Options de la conversation">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {nav && (
          <div data-chat-search-nav className={`shrink-0 flex items-center gap-1 px-2 py-1 border-b ${P.div} ${L ? 'bg-white' : 'bg-slate-900'}`}>
            <button type="button" onClick={() => setSearch({ day: null })} data-chat-search-nav-open className={`flex-1 min-w-0 text-left text-xs px-2 py-1.5 cursor-pointer ${P.sub}`}><b className="text-emerald-600">{nav.i + 1}</b> sur {nav.ids.length} · liste</button>
            <button type="button" data-chat-search-prev disabled={stepNav(nav.i, nav.ids.length, -1) === null} onClick={() => { const n = stepNav(nav.i, nav.ids.length, -1); if (n !== null) { setNav({ ...nav, i: n }); jumpTo(nav.ids[n]); } }} title="Précédent (plus ancien)" aria-label="Résultat précédent" className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${L ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><ChevronDown className="w-5 h-5 rotate-180" /></button>
            <button type="button" data-chat-search-next disabled={stepNav(nav.i, nav.ids.length, 1) === null} onClick={() => { const n = stepNav(nav.i, nav.ids.length, 1); if (n !== null) { setNav({ ...nav, i: n }); jumpTo(nav.ids[n]); } }} title="Suivant (plus récent)" aria-label="Résultat suivant" className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${L ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><ChevronDown className="w-5 h-5" /></button>
            <button type="button" data-chat-search-nav-close onClick={() => setNav(null)} title="Fermer" aria-label="Fermer la recherche" className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${L ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}><X className="w-4 h-4" /></button>
          </div>
        )}

        {ephMs > 0 && <div data-ephemeral-banner className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border-b ${L ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-amber-900/30 text-amber-100 border-amber-700/40'}`}><Timer className="w-4 h-4 shrink-0" aria-hidden />Messages éphémères : ils disparaissent après {ephemeralText(ephMs)}.</div>}
        {pinShown && (
          <button
            type="button"
            onClick={() => { jumpTo(pinShown.id); if (pinned.length > 1) setPinIdx(i => i + 1); }}
            className={`w-full px-3 py-1 flex items-center gap-2 text-left cursor-pointer shrink-0 border-b ${P.div} ${L ? 'bg-blue-50' : 'bg-blue-500/10'}`}
            title="Aller au message épinglé"
          >
            <Pin className="w-3 h-3 text-blue-600 shrink-0" />
            <span className={`flex-1 min-w-0 text-[11px] ${P.sub}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pinned.length > 1 ? `${(pinIdx % pinned.length) + 1}/${pinned.length} · ` : ''}<b className="text-blue-600">{pinShown.sender_name.split(' ')[0]}</b> : {pinShown.poll ? <><PollKindIcon kind={pinShown.poll.kind} size="w-3.5 h-3.5" />{pinShown.poll.question}</> : previewText(pinShown.message || '', window.location.origin) || pinShown.attachment_name || 'Pièce jointe'}
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
            const mk = markOf(msg, importantIds); // repère qui colore la bulle (Important > Épinglé > Transféré)
            const tinted = !!mk && !gone && !((!msg.message && !msg.reply_to && msg.attachment_url) || (msg.poll && !msg.reply_to));
            const sameSender = i > 0 && !newDay && visible[i - 1].sender_id === msg.sender_id && !visible[i - 1].deleted_at;
            const readers = isMe && !gone ? readersOf(msg) : [];
            const prevM = i > 0 ? visible[i - 1] : null;
            const isAlbumImg = (m: ChatMessage) => !!m.album_id && m.attachment_kind === 'image' && !!m.attachment_url && !m.deleted_at;
            if (isAlbumImg(msg) && prevM && isAlbumImg(prevM) && prevM.album_id === msg.album_id && prevM.sender_id === msg.sender_id) return null;
            const album: ChatMessage[] = [];
            if (isAlbumImg(msg)) { for (let k = i; k < visible.length && isAlbumImg(visible[k]) && visible[k].album_id === msg.album_id && visible[k].sender_id === msg.sender_id; k++) album.push(visible[k]); }
            const isAlbum = album.length > 1;
            const albumCaption = isAlbum ? (album.find(m => m.message)?.message || '') : '';
            const totalOthers = current.kind === 'group' && current.group ? current.group.members.filter(id => id !== currentUser.id).length : 0;
            return (
              <React.Fragment key={msg.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <button type="button" data-day-pill={day} onClick={() => setSearch({ day })} title="Voir les messages de ce jour" aria-label={`Messages du ${dayLabel(day)}`} className={`px-3 py-1 text-[11px] rounded-lg cursor-pointer ${P.pill}`}>{dayLabel(day)}</button>
                  </div>
                )}
                <div data-msg-id={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} ${sameSender ? '' : 'pt-1'} ${!knownRef.current.ids.has(msg.id) ? (isMe ? 'df-msg-in-right' : 'df-msg-in-left') : ''}`}>
                  {!isMe && showNames && (
                    sameSender
                      ? <span className="w-8 shrink-0" />
                      : <button type="button" onClick={() => setAboutOf({ id: msg.sender_id, menuOnly: false })} className="shrink-0 cursor-pointer" title="À propos" data-msg-avatar><Avatar src={users.find(u => u.id === msg.sender_id)?.avatar_url} name={msg.sender_name} className="w-8 h-8 rounded-full" /></button>
                  )}
                  <div className={`flex flex-col min-w-0 max-w-[82%] sm:max-w-md ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      onTouchStart={e => !gone && startPress(msg, e.currentTarget, e.touches[0]?.clientX, e.touches[0]?.clientY)}
                      onTouchEnd={stopPress}
                      onTouchMove={e => movePress(e.touches[0]?.clientX, e.touches[0]?.clientY)}
                      onTouchCancel={stopPress}
                      onDragStart={e => e.preventDefault()}
                      onMouseDown={e => { if (!gone && e.button === 0) startPress(msg, e.currentTarget, e.clientX, e.clientY); }}
                      onMouseUp={stopPress}
                      onMouseLeave={stopPress}
                      onContextMenu={e => { e.preventDefault(); stopPress(); if (!gone) openMenu(msg, e.currentTarget); }}
                      style={(() => {
                        if (tinted && mk) return { WebkitTouchCallout: 'none', backgroundColor: MARK_STYLE[mk].bg, backgroundImage: markBackground(mk), borderColor: MARK_STYLE[mk].border, boxShadow: MARK_SHADOW } as React.CSSProperties;
                        if (gone || isMe || (!msg.message && !msg.reply_to && msg.attachment_url) || (msg.poll && !msg.reply_to)) return { WebkitTouchCallout: 'none' } as React.CSSProperties;
                        const sd = users.find(u => u.id === msg.sender_id);
                        const ac = accentStyles(accentOf(sd || { name: msg.sender_name }), L);
                        return { WebkitTouchCallout: 'none', backgroundColor: ac.bubbleBg, borderColor: ac.bubbleBorder } as React.CSSProperties;
                      })()}
                      className={`${msg.reply_to ? 'w-full min-w-[13.5rem]' : 'min-w-0'} text-[0.9375rem] leading-relaxed break-words select-none md:select-text rounded-2xl ${
                        !gone && ((!msg.message && !msg.reply_to && msg.attachment_url) || (msg.poll && !msg.reply_to))
                          ? `${L ? 'text-slate-800' : 'text-slate-100'}`
                          : `px-3 py-1.5 shadow-sm ${isMe ? 'rounded-br-md' : 'rounded-bl-md'} ${gone ? `${L ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-[#101822] text-slate-500 border border-slate-800'}` : isMe ? P.outBub : P.inBub}${tinted ? ' !text-white border' : ''}`
                      } ${menuMsg?.id === msg.id ? 'ring-2 ring-emerald-400' : ''} ${editingId === msg.id ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {!gone && msg.expires_ms && msg.expires_ms > 0 && <div data-ephemeral-msg className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 opacity-90"><Timer className="w-3 h-3 shrink-0" aria-hidden />Disparaît {new Date(msg.expires_ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                      {!gone && msg.visible_to && msg.visible_to.length > 0 && <div data-visible-only className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 opacity-90"><Lock className="w-3 h-3 shrink-0" aria-hidden />Visible seulement par {(msg.visible_names && msg.visible_names.length ? msg.visible_names : msg.visible_to).join(', ')}</div>}
                      {!gone && msg.forwarded && <div data-forwarded-from className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 opacity-90"><Forward className="w-3 h-3" />Transféré de {msg.forwarded.from}</div>}
                      {!gone && !isMe && showNames && !sameSender && (
                        <button type="button" onClick={() => openProfile(msg.sender_id)} className="block text-left text-[12px] font-bold mb-0.5 cursor-pointer" style={{ color: accentStyles(accentOf(users.find(u => u.id === msg.sender_id) || { name: msg.sender_name }), L).name }} title="Voir le profil">
                          {msg.sender_name}
                          {msg.sender_role === 'admin' && <span className="ml-1 px-1 rounded bg-amber-500/20 text-amber-600 text-[11px]">RESPONSABLE</span>}
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
                              <button type="button" onClick={() => jumpTo(msg.reply_to!.id)} data-reply-quote className={`relative block text-left mb-2 mt-0.5 overflow-hidden cursor-pointer pl-4 pr-3 py-2 -mx-1.5 w-[calc(100%+0.75rem)] rounded-xl`} style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.92)' : ac.quoteBg, color: L ? '#1e293b' : isMe ? '#1e293b' : '#e2e8f0' }}>
                                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: ac.bar }} />
                                <span className="block text-[12px] font-bold leading-tight" style={{ color: isMe ? ac.name : ac.name }}>{msg.reply_to!.sender_name}</span>
                                <span className="block text-[0.8125rem] leading-snug break-words" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.88 }}>{previewText(msg.reply_to!.text || '', window.location.origin) || (msg.reply_to!.has_attachment ? 'Pièce jointe' : '')}</span>
                              </button>
                            );
                          })()}
                          {isAlbum && (
                            <div className={`grid gap-0.5 w-60 sm:w-64 ${msg.reply_to ? 'mt-1' : ''} ${album.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                              {album.slice(0, 4).map((m, k) => (
                                <button key={m.id} type="button" onClick={() => setViewer({ url: m.attachment_url!, msg: m })} className={`relative block overflow-hidden cursor-zoom-in bg-slate-200 ${album.length === 3 && k === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-square'} ${k === 0 ? 'rounded-tl-xl' : ''} ${k === 1 || (album.length === 3 && k === 0) ? 'rounded-tr-xl' : ''} ${k === 2 && album.length > 2 ? 'rounded-bl-xl' : ''} ${k === Math.min(album.length, 4) - 1 ? 'rounded-br-xl' : ''}`} title="Agrandir">
                                  <img src={m.attachment_url} alt={m.attachment_name || 'photo'} className={`w-full h-full object-cover ${k === 3 && album.length > 4 ? 'blur-[3px] scale-110' : ''}`} loading="lazy" />
                                  {k === 3 && album.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-2xl font-bold">+{album.length - 4}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                          {isAlbum && albumCaption && <span className="block whitespace-pre-line mt-1 px-1">{albumCaption}</span>}
                          {!isAlbum && msg.attachment_url && msg.attachment_kind === 'image' && (
                            <button type="button" onClick={() => setViewer({ url: msg.attachment_url!, msg })} className={`block cursor-zoom-in ${msg.message || msg.reply_to ? 'mb-1' : ''}`} title="Agrandir">
                              <img src={msg.attachment_url} alt={msg.attachment_name || 'photo'} className="max-h-56 w-auto max-w-full rounded-xl" loading="lazy" />
                            </button>
                          )}
                          {!isAlbum && msg.attachment_url && msg.attachment_kind !== 'image' && (
                            <button type="button" onClick={() => setFileViewer(msg)} className={`flex items-center gap-1.5 min-h-[40px] font-semibold text-left cursor-pointer ${!msg.message && !msg.reply_to ? `px-3 py-2 rounded-2xl border ${L ? 'border-slate-300' : 'border-slate-600'}` : 'mb-1 underline'}`}>
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="break-all">{msg.attachment_name || 'fichier'}</span>
                            </button>
                          )}
                          {msg.send_at && msg.sender_id === currentUser.id && <div data-scheduled-badge className="text-xs font-semibold mb-1 opacity-90">⏰ Part le {scheduleLabel(msg.send_at)} (visible par toi seul)</div>}
                          {msg.poll && <ChatPoll msg={msg} meId={currentUser.id} isAdmin={currentUser.role === 'admin'} light={L} users={users} />}
                          {!isAlbum && !msg.poll && msg.message && <span className="whitespace-pre-line"><LinkedText text={msg.message} onOpen={link => { if (deepLinkAllowed(currentUser.role, link.go)) applyDeepLink(link, v => onNavigate?.(v)); }} /></span>}
                        </>
                      )}
                    </div>
                    {/* Petits détails sous la bulle (pas dans la bulle) */}
                    {!gone && (
                      <div className={`flex items-center gap-1 mt-0.5 px-1 text-[11px] ${P.sub}`}>
                        {marksOf(msg, importantIds).map(k => k === 'important' ? <Flag key={k} data-mark="important" className="w-3 h-3 text-rose-500" aria-label="Important" /> : k === 'pinned' ? <Pin key={k} data-mark="pinned" className="w-3 h-3 text-amber-500" aria-label="Épinglé" /> : <Forward key={k} data-mark="forwarded" className="w-3 h-3 text-violet-500" aria-label="Transféré" />)}
                        {msg.important_all && <span data-important-all className="font-semibold text-rose-500">Important pour tous{msg.important_all.by_name ? ` · ${String(msg.important_all.by_name).split(' ')[0]}` : ''} ·</span>}
                        {msg.pinned && msg.pinned_by && msg.pinned_by !== msg.sender_id && msg.pinned_by_name && <span data-pinned-by className="text-amber-600">épinglé par {String(msg.pinned_by_name).split(' ')[0]} ·</span>}
                        {msg.edited_at && <span className="italic">modifié ·</span>}
                        <span>{time}</span>
                        {isMe && <PendingMark col="messages" id={msg.id} />}
                        {isMe && (current.kind === 'user' || current.kind === 'group') && (
                          // « Vu » : seulement l'icône (les mots restent pour les lecteurs d'écran : aria-label et infobulle). ✓ gris = envoyé ; ✓✓ gris = vu par certains (groupe) ; ✓✓ bleu = vu (par tous)
                          current.kind === 'user' ? (
                            isRead(msg)
                              ? <span data-seen="all" role="img" aria-label="Vu" title="Vu" className="flex items-center text-sky-500"><CheckCheck className="w-3.5 h-3.5" /></span>
                              : <span data-seen="none" role="img" aria-label="Pas encore vu" title="Pas encore vu" className="flex items-center"><Check className="w-3.5 h-3.5" /></span>
                          ) : readers.length === 0 ? (
                            <button type="button" data-seen="none" aria-label="Pas encore vu" title="Pas encore vu" onClick={() => setSeenFor(msg)} className="flex items-center p-1 -m-1 cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                          ) : (
                            <button type="button" data-seen={readers.length === totalOthers ? 'all' : 'some'} aria-label={readers.length === totalOthers ? 'Vu par tous' : `Vu par ${readers.length} sur ${totalOthers}`} title={readers.length === totalOthers ? 'Vu par tous' : `Vu par ${readers.length} sur ${totalOthers}`} onClick={() => setSeenFor(msg)} className={`flex items-center p-1 -m-1 cursor-pointer ${readers.length === totalOthers ? 'text-sky-500' : ''}`}>
                              <CheckCheck className="w-3.5 h-3.5" />
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
          <button type="button" onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setNewBelow(0); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 cursor-pointer">
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
        {onlyTo.length > 0 && !editingId && (
          <div data-only-chip className={`mx-2 mb-1 px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold ${L ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-amber-900/30 text-amber-100 border border-amber-700/50'}`}>
            <Lock className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0 truncate">Visible seulement par {onlyTo.map(id => onlyPeople.find(p => p.id === id)?.name || '?').join(', ')}</span>
            <button type="button" aria-label="Retirer la restriction" onClick={() => setOnlyTo([])} className="w-8 h-8 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        )}
        {replyTo && !editingId && (
          <div className={`px-3 pt-2 border-t ${P.div} ${P.head}`}>
            <div className="relative flex items-center gap-2 rounded-xl overflow-hidden pl-3 pr-1 py-1" style={{ backgroundColor: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).quoteBg }}>
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).bar }} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold" style={{ color: accentStyles(accentOf(users.find(u => u.id === replyTo.sender_id) || { name: replyTo.sender_name }), L).name }}>{replyTo.sender_id === currentUser.id ? 'Toi' : replyTo.sender_name}</span>
                <span className={`block text-[13px] ${P.sub}`} style={ONE_LINE}>{replyTo.message || replyTo.attachment_name || 'Pièce jointe'}</span>
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
                {pendingFiles.length > 1 ? (
                  <div className="flex -space-x-3 shrink-0">
                    {pendingFiles.slice(0, 3).map((f, i) => <img key={i} src={pendingUrls[i] || undefined} alt="" className="w-12 h-12 rounded-lg object-cover border-2 border-white" />)}
                  </div>
                ) : pendingFile.type.startsWith('image/') ? (
                  <img src={pendingUrls[0] || undefined} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="w-14 h-14 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0"><Paperclip className="w-5 h-5" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${P.title}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingFiles.length > 1 ? `${pendingFiles.length} photos` : pendingFile.name}</p>
                  <p className={`text-xs ${P.sub}`}>{sizeLabel(pendingFiles.reduce((n, f) => n + f.size, 0))}</p>
                  {pendingFile.type.startsWith('image/') && pendingFile.type !== 'image/gif' && (
                    <label className="mt-1 flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      <span className={P.title}>Compresser {pendingFiles.length > 1 ? 'les photos' : 'la photo'} <span className={P.sub}>{compress ? '(plus léger, recommandé)' : '(taille originale)'}</span></span>
                    </label>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button type="button" disabled={busy} onClick={sendPendingFile} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{busy ? 'Envoi…' : 'Envoyer'}</button>
                  <button type="button" disabled={busy} onClick={() => setPendingFiles([])} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${L ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-200'}`}>Annuler</button>
                </div>
              </div>
            </div>
          )}
          <form data-composer-bar onTouchStart={e => { const t = e.touches[0]; swipe0.current = t ? { x: t.clientX, y: t.clientY } : null; }} onTouchEnd={e => { const t = e.changedTouches[0], a = swipe0.current; swipe0.current = null; if (canEph && a && t && isComposerSwipe(a, { x: t.clientX, y: t.clientY }, window.innerWidth, document.activeElement === composerRef.current)) { setEphErr(''); setEphOpen(true); } }} onSubmit={e => { e.preventDefault(); send(); }} className={`px-3 pt-2 pb-2 ${L ? 'bg-white border-slate-200' : 'bg-[#0f1b2d] border-white/10'} border-t shadow-[0_-6px_18px_-12px_rgba(15,30,58,0.35)] shrink-0`}>
            <div className={`flex items-end gap-1.5 rounded-3xl border pl-1.5 pr-1.5 py-1.5 ${L ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/15'}`}>
              <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} onChange={onFile} className="hidden" />
              <div className="relative shrink-0">
                <button type="button" data-chat-plus disabled={busy || !!editingId} aria-haspopup="menu" aria-expanded={plusOpen} onClick={() => setPlusOpen(o => !o)} className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-50 ${L ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-300 hover:bg-white/10'}`} title="Ajouter : fichier, sondage…" aria-label="Ajouter : fichier, sondage…"><Plus className="w-5 h-5" /></button>
                {plusOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPlusOpen(false)} aria-hidden />
                    <div role="menu" data-chat-plus-menu className={`absolute bottom-12 left-0 z-50 w-60 rounded-xl border shadow-xl p-1 ${L ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100'}`}>
                      {([['file', 'Importer (photo, fichier)', Paperclip], ['poll', 'Sondage', BarChart3], ['date', 'Choix de date', CalendarDays], ['ack', "« J'ai lu »", Eye], ['schedule', 'Programmer un message', Clock], ...(canOnly ? [['only', 'Visible seulement par…', Lock] as const] : []), ['templates', 'Mes modèles', FileText]] as const).map(([k, label, Icon]) => (
                        <button key={k} type="button" role="menuitem" data-chat-plus-item={k} onClick={() => { setPlusOpen(false); if (k === 'file') fileRef.current?.click(); else if (k === 'only') setOnlyOpen(true); else if (k === 'schedule' || k === 'templates') setTool(k); else setPollKind(k); }} className="w-full min-h-[48px] px-3 flex items-center gap-3 rounded-lg text-sm text-left cursor-pointer hover:bg-black/5"><Icon className="w-5 h-5 shrink-0" />{label}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={composerRef}
                rows={1}
                value={text}
                onFocus={keep.pin}
                onChange={e => { setText(e.target.value); if (e.target.value.trim() && !editingId && !current.readOnly) db.pingTyping(current.id); }}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return; // saisie en cours (clavier asiatique, accents) : on ne touche à rien
                  if (e.key === 'Escape') { if (editingId) { e.preventDefault(); cancelEdit(); } else if (replyTo) { e.preventDefault(); setReplyTo(null); } }
                  else if (e.key === 'ArrowUp' && !e.shiftKey && !text && !editingId) { // champ vide : modifier mon dernier message (si le délai de 15 min le permet)
                    const mine = [...visible].reverse().find(m => m.sender_id === currentUser.id && m.message && db.canEditMessage(m, currentUser.id));
                    if (mine) { e.preventDefault(); startEdit(mine); }
                  } else if (composerEnter(e, isDesktopPointer()) === 'send') { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } // ordinateur : Entrée envoie, Maj+Entrée = ligne ; téléphone : Entrée = ligne
                }}
                enterKeyHint="enter"
                placeholder={busy ? 'Envoi du fichier…' : 'Écrire un message…'}
                className={`flex-1 min-w-0 resize-none bg-transparent border-0 px-2 py-2 text-base leading-6 max-h-36 focus:outline-none focus:ring-0 ${L ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'}`}
                style={{ boxShadow: 'none', border: 'none', height: 40 }}
              />
              <button type="submit" disabled={busy} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} className={`${sendPulse ? 'df-send-pulse ' : ''}w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50 shrink-0 shadow-md`} title="Envoyer">
                <Send className="w-[18px] h-[18px]" />
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

      {itemMsg && <MessageToItem msg={itemMsg} light={L} onClose={() => setItemMsg(null)} />}
      {ephOpen && current && <ChatEphemeral light={L} title={current.title} current={ephMs} busy={ephBusy} error={ephErr} onClose={() => setEphOpen(false)} onPick={pickEph} />}
      {onlyOpen && <ChatVisibleTo light={L} people={onlyPeople} initial={onlyTo} onClose={() => setOnlyOpen(false)} onPick={ids => { setOnlyTo(ids); setOnlyOpen(false); }} />}
      {tool === 'schedule' && <ScheduleDialog light={L} initial={text} onClose={() => setTool(null)} onSend={(t, ms) => { if (current.readOnly) return; db.sendMessage({ senderId: currentUser.id, message: t, recipientId: current.id === 'all' ? 'all' : current.id, sendAt: ms }); setText(''); setTool(null); }} />}
      {tool === 'templates' && <TemplatesDialog light={L} uid={currentUser.id} draft={text} onClose={() => setTool(null)} onPick={t => { setText(t); setTool(null); }} />}
      {pollKind && <PollComposer kind={pollKind} light={L} onClose={() => setPollKind(null)} onSend={sendPoll} />}

      {marksOpen && <ChatMarksList msgs={messages} important={importantIds} hidden={hidden} light={L} startScope={marksOpen} inThisThread={m => inThread(m, current)} threadOf={m => { const t = threads.find(x => x.kind !== 'pair' && inThread(m, x)); return t ? { id: t.id, title: t.title } : null; }} onPick={(id, thread) => { if (thread && thread !== current.id) { setThreadId(thread); setShowList(false); setReplyTo(null); cancelEdit(); setJumpAfter({ thread, id }); } else { jumpTo(id); } }} onClose={() => setMarksOpen(null)} />}
      {fwdMsg && <ChatForward threads={threads.filter(t => !t.readOnly && t.kind !== 'pair').map(t => ({ id: t.id, title: t.title, subtitle: t.subtitle }))} light={L} onPick={forwardTo} onClose={() => setFwdMsg(null)} />}
      {search && <ChatSearch msgs={visible} initialDay={search.day} light={L} onPick={(id, all) => { jumpTo(id); const i = all.indexOf(id); setNav(all.length > 1 && i >= 0 ? { ids: all, i } : null); }} onClose={() => setSearch(null)} />}
      {/* Menu des options de la conversation */}
      {threadMenu && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={() => setThreadMenu(false)}>
          <div className={`w-full max-w-xs rounded-2xl overflow-hidden border shadow-2xl ${P.pop}`} onClick={e => e.stopPropagation()}>
            <div className={`px-4 py-2.5 border-b ${P.div} text-xs ${P.sub}`} style={ONE_LINE}>{current.title}</div>
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

      {aboutOf && (() => {
        const t: Thread | undefined = threads.find(x => x.id === aboutOf.id) || (() => { const u = users.find(x => x.id === aboutOf.id); return u ? { id: u.id, kind: 'user' as const, title: u.name, subtitle: u.role === 'admin' ? 'Conversation privée' : `@${u.username}`, user: u } : undefined; })();
        if (!t) return null;
        const full = aboutThread(t, { viewer: currentUser, pinned: pinnedThreads.includes(t.id), hidden: !!archived[t.id] && archived[t.id] >= lastTs(t), lang: lang === 'en' ? 'en' : 'fr', canOpenFullProfile: !!onOpenProfile, online: isAdmin && t.kind === 'user' && t.user ? onlineBadge(db.getPresence().find(r => r.user_id === t.user!.id)?.last_seen, Date.now()).online : null });
        const view = aboutOf.menuOnly ? { ...full, facts: [], actions: full.actions.filter(a => a === 'pin' || a === 'unpin' || a === 'hide' || a === 'show') } : full;
        const run = (a: AboutAction) => {
          setAboutOf(null);
          if (a === 'pin' || a === 'unpin') setPinnedThreads(togglePinnedThread(currentUser.id, t.id));
          else if (a === 'hide' || a === 'show') toggleArchive(t, a === 'hide');
          else if (a === 'write') { if (t.kind === 'user' && !threads.some(x => x.id === t.id)) setPickedUsers(p => (p.includes(t.id) ? p : [...p, t.id])); setThreadId(t.id); setShowList(false); setReplyTo(null); cancelEdit(); }
          else if (a === 'full_profile' && t.user) openProfile(t.user.id);
          else if (a === 'group_info') { setThreadId(t.id); setShowList(false); setGroupInfo(true); }
        };
        return <ChatAbout thread={t} about={view} onAction={a => { if (!isGhostClick(menuOpenedAt.current, Date.now())) run(a); }} onClose={() => { if (!isGhostClick(menuOpenedAt.current, Date.now())) setAboutOf(null); }} />; // le relâchement du doigt après l'appui long ne referme pas le menu
      })()}

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
        <div className="fixed inset-0 z-[80] bg-black/25" onClick={() => { if (!isGhostClick(menuOpenedAt.current, Date.now())) setMenuMsg(null); }} onContextMenu={e => { e.preventDefault(); if (!isGhostClick(menuOpenedAt.current, Date.now())) setMenuMsg(null); }}>
          {menuRect && menuHtml && (
            <div
              data-press-clone
              className="fixed pointer-events-none rounded-2xl ring-2 ring-emerald-400 shadow-xl [&_*]:!blur-none [&_*]:![filter:none] [&_*]:![backdrop-filter:none]"
              style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width, height: menuRect.height, filter: 'none' }}
              dangerouslySetInnerHTML={{ __html: menuHtml }}
            />
          )}
          <div className="fixed" style={popStyle()} onClick={e => e.stopPropagation()}>
          <div className={`rounded-2xl overflow-hidden border shadow-2xl ${P.pop}`}>
            {menuActions.map(a => {
              const I = a.icon;
              return (
                <button key={a.k} type="button" onClick={() => { if (!isGhostClick(menuOpenedAt.current, Date.now())) a.run(); }} className={`w-full h-11 px-4 flex items-center gap-3 text-sm cursor-pointer ${P.popHover} ${a.k === 'del' ? 'text-red-500' : ''}`}>
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
