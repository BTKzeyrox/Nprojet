import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Heart, MessageCircle, Share2, Pin, Trash2, Send, Newspaper, Paperclip, X, FileText, Clock, Ban, Loader2, Check, ChevronUp, Pencil, Eye, MoreVertical } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import { Avatar } from '../components/Avatar';
import { askReason } from '../components/ReasonModal';
import { LightboxModal } from '../components/LightboxModal';
import { FileViewerModal } from '../components/FileViewerModal';
import { ACCEPT_ATTR, fmtBytes, prepareAttachment, uploadAttachments, type DraftAttachment } from '../utils/attachments';
import type { NewsAttachment, NewsComment, NewsPost, User } from '../types';
import { NewsShareSheet } from '../components/NewsShareSheet';
import { NAV_TARGET_EVENT, peekNavTarget } from '../utils/navTarget';
import { newsIdFromNav, newsNavId } from '../utils/newsLink';
import { AUDIENCE_ROLES, audienceLabel, canEditNews, canSeeNews, cleanAudience, publishModeFor, roleLabel, type NewsRole } from '../utils/newsAccess';

// Images d'une publication : une seule = grande image ; plusieurs = défilement de côté avec des points « • • • »
const ImageCarousel: React.FC<{ images: { url: string; name: string }[]; onOpen: (url: string) => void; compact?: boolean }> = ({ images, onOpen, compact }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  if (images.length === 1) {
    const f = images[0];
    return (
      <button type="button" onClick={() => onOpen(f.url)} className="block w-full overflow-hidden rounded-2xl" title={f.name}>
        <img src={f.url} alt={f.name} loading="lazy" className={`w-full object-cover ${compact ? 'max-h-48' : 'max-h-[28rem]'}`} />
      </button>
    );
  }
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth) setCur(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => ref.current?.scrollTo({ left: i * (ref.current?.clientWidth || 0), behavior: 'smooth' });
  return (
    <div>
      <div ref={ref} onScroll={onScroll} className="df-noscroll flex overflow-x-auto snap-x snap-mandatory rounded-2xl" style={{ touchAction: 'pan-x pan-y' }}>
        {images.map(f => (
          <button key={f.url} type="button" onClick={() => onOpen(f.url)} className="snap-center shrink-0 w-full block" title={f.name}>
            <img src={f.url} alt={f.name} loading="lazy" className={`w-full object-cover ${compact ? 'h-48' : 'aspect-[4/3]'}`} />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 pt-2" aria-label={`${images.length} images`}>
        {images.map((f, i) => (
          <button key={f.url} type="button" onClick={() => goTo(i)} aria-label={`Image ${i + 1}`} className={`h-2 rounded-full transition-all ${i === cur ? 'w-5 bg-blue-600' : 'w-2 bg-slate-400/60'}`} />
        ))}
      </div>
    </div>
  );
};

const timeAgo = (iso: string) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
};

const PREVIEW_COMMENTS = 2; // commentaires montrés sous la publication sans rien ouvrir
// « Visible par » : Tous (par défaut) ou un mélange de rôles. Le responsable et l'auteur voient toujours la publication.
const AudiencePicker: React.FC<{ value: NewsRole[]; onChange: (v: NewsRole[]) => void; disabled?: boolean; light: boolean }> = ({ value, onChange, disabled, light }) => {
  const all = value.length === 0;
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border text-xs font-semibold cursor-pointer disabled:opacity-50 ${on ? 'bg-emerald-600 text-white border-emerald-600' : light ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50' : 'bg-white/5 text-slate-200 border-white/20 hover:bg-white/10'}`;
  const toggle = (r: NewsRole) => {
    const next = value.includes(r) ? value.filter(x => x !== r) : [...value, r];
    onChange(next.length === AUDIENCE_ROLES.length ? [] : next); // les trois rôles = tous
  };
  return (
    <div data-audience-picker className="space-y-1.5">
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${light ? 'text-slate-600' : 'text-slate-300'}`}><Eye className="w-3.5 h-3.5" />Visible par</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Visible par">
        <button type="button" disabled={disabled} aria-pressed={all} onClick={() => onChange([])} className={chip(all)} data-audience="all">Tous</button>
        {AUDIENCE_ROLES.map(r => <button key={r} type="button" disabled={disabled} aria-pressed={value.includes(r)} onClick={() => toggle(r)} className={chip(value.includes(r))} data-audience={r}>{roleLabel(r, 'fr')}</button>)}
      </div>
      <div className={`text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>{all ? 'Toute l’équipe la voit.' : `Seulement : ${audienceLabel(value, 'fr')}. Toi et le responsable la voyez toujours.`}</div>
    </div>
  );
};

// Modifier une publication déjà publiée (texte, titre, public) ; les fichiers, réactions et commentaires ne changent pas
const PostEditor: React.FC<{ post: NewsPost; light: boolean; onDone: () => void }> = ({ post, light, onDone }) => {
  const [title, setTitle] = useState(post.title || '');
  const [text, setText] = useState(post.text || '');
  const [aud, setAud] = useState<NewsRole[]>(cleanAudience(post.audience) || []);
  const [kept, setKept] = useState<NewsAttachment[]>(post.files || []); // fichiers déjà joints (la croix les retire)
  const [items, setItems] = useState<DraftAttachment[]>([]); // nouveaux fichiers à ajouter
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`;
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  const empty = !text.trim() && kept.length === 0 && items.length === 0;
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    setErr(''); setPreparing(true);
    const ok: DraftAttachment[] = [], errors: string[] = [];
    for (const f of list) { try { ok.push(await prepareAttachment(f)); } catch (x) { errors.push((x as Error).message); } }
    setItems(prev => [...prev, ...ok]);
    if (errors.length) setErr(errors.join(' '));
    setPreparing(false);
  };
  const save = async () => {
    if (busy || preparing || empty) return;
    setBusy(true); setErr('');
    const up = await uploadAttachments(items, () => undefined);
    if (!up.ok) { setErr(up.error); setBusy(false); return; }
    const r = await db.editNews(post.id, { title, text, audience: aud, files: [...kept, ...up.files] });
    setBusy(false);
    if (!r.success) { setErr(r.error || 'Impossible de modifier.'); return; }
    onDone();
  };
  const row = `flex items-center gap-2.5 rounded-lg p-1.5 pr-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`;
  return (
    <div data-post-editor className="space-y-2">
      <input className={field} value={title} maxLength={120} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Titre (facultatif)" />
      <textarea className={`${field} min-h-[96px]`} value={text} maxLength={2000} disabled={busy} onChange={e => setText(e.target.value)} />
      {(kept.length > 0 || items.length > 0) && (
        <ul className="space-y-1.5" data-editor-files>
          {kept.map(f => (
            <li key={f.url} className={row}>
              {f.kind === 'image' ? <img src={f.url} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" /> : <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0 bg-emerald-600/15"><FileText className="w-5 h-5 text-emerald-600" /></div>}
              <div className="min-w-0 flex-1"><div className="text-sm truncate">{f.name}</div><div className={`text-xs ${muted}`}>{f.size ? fmtBytes(f.size) : ''}</div></div>
              <button type="button" disabled={busy} onClick={() => setKept(prev => prev.filter(x => x.url !== f.url))} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-40" aria-label="Retirer ce fichier" data-remove-file><X className="w-4 h-4" /></button>
            </li>
          ))}
          {items.map(it => (
            <li key={it.key} className={row}>
              {it.kind === 'image' ? <img src={it.dataUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" /> : <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0 bg-emerald-600/15"><FileText className="w-5 h-5 text-emerald-600" /></div>}
              <div className="min-w-0 flex-1"><div className="text-sm truncate">{it.name}</div><div className={`text-xs ${muted}`}>{fmtBytes(it.after)} · nouveau</div></div>
              <button type="button" disabled={busy} onClick={() => setItems(prev => prev.filter(x => x.key !== it.key))} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-40" aria-label="Retirer ce fichier"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={e => void onPick(e)} />
        <button type="button" disabled={busy || preparing} onClick={() => fileRef.current?.click()} data-add-file className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 ${light ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-200'}`}>
          {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}{preparing ? 'Préparation…' : 'Ajouter une photo / un fichier'}
        </button>
      </div>
      <AudiencePicker value={aud} onChange={setAud} disabled={busy} light={light} />
      {err && <div className="text-xs text-red-500" role="alert">{err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || preparing || empty} onClick={() => void save()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Enregistrer</button>
        <button type="button" disabled={busy} onClick={onDone} className={`px-4 py-2 rounded-lg text-sm font-semibold ${light ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-200'}`}>Annuler</button>
      </div>
    </div>
  );
};

// Menu « ⋮ » d'une publication : Modifier, Supprimer, Épingler (seulement les actions permises à la personne)
const PostMenu: React.FC<{ light: boolean; busy?: boolean; items: { key: string; label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }[] }> = ({ light, items, busy }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('touchstart', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative shrink-0" data-post-menu>
      <button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={open} aria-label="Actions de la publication" title="Actions" onClick={() => setOpen(v => !v)} className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg cursor-pointer disabled:opacity-50 ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}><MoreVertical className="w-5 h-5" /></button>
      {open && (
        <div role="menu" className={`absolute right-0 top-full mt-1 z-30 min-w-[190px] rounded-xl border shadow-xl py-1 ${light ? 'bg-white border-slate-200' : 'bg-[#16212e] border-slate-700'}`}>
          {items.map(it => (
            <button key={it.key} type="button" role="menuitem" data-menu-item={it.key} onClick={() => { setOpen(false); it.onClick(); }} className={`w-full min-h-[44px] px-3 flex items-center gap-2.5 text-sm text-left cursor-pointer ${it.danger ? 'text-red-500' : ''} ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>{it.icon}{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const PostCard: React.FC<{ post: NewsPost; me: User; isAdmin: boolean; light: boolean; onAsk: ReturnType<typeof useConfirm>['ask']; onOpenProfile?: (u: User) => void }> = ({ post, me, isAdmin, light, onAsk, onOpenProfile }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [lb, setLb] = useState<{ url: string; gallery: string[]; names: string[] } | null>(null);
  const [fv, setFv] = useState<NewsAttachment | null>(null);
  const [cItems, setCItems] = useState<DraftAttachment[]>([]);
  const [cPrep, setCPrep] = useState(false);
  const [cProg, setCProg] = useState<{ d: number; t: number } | null>(null);
  const cFile = useRef<HTMLInputElement>(null);
  const cInput = useRef<HTMLInputElement>(null);
  const [reply, setReply] = useState<{ parentId: string; name: string; excerpt: string } | null>(null); // réponse en cours : à quel commentaire, à qui, et un extrait de ce qu'il dit
  const [shownReplies, setShownReplies] = useState<Set<string>>(new Set()); // fils de réponses dépliés : tout est replié par défaut
  const toggleReplies = (id: string) => setShownReplies(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const status = post.status || 'published';
  const published = status === 'published';
  const mine = post.author_id === me.id;
  const canEdit = published && canEditNews(post, me, db.getNewsPolicy());
  const personAuthor = !!post.author_role && post.author_role !== 'admin'; // opérateur, chef d'équipe ou comptable : photo et nom de la personne
  const restricted = !!cleanAudience(post.audience);
  const files = post.files || [];
  const images = files.filter(f => f.kind === 'image');
  const others = files.filter(f => f.kind !== 'image');
  const loved = post.loves.includes(me.id);
  const card = light ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100';
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  const users = db.getUsers();
  const tops = post.comments.filter(c => !c.parent_id || !post.comments.some(x => x.id === c.parent_id)); // commentaires de premier niveau (une réponse orpheline remonte)
  // « Répondre » : la zone d'écriture s'ouvre et prend le curseur TOUT DE SUITE (dans le geste du doigt, sinon le téléphone n'ouvre pas le clavier)
  const startReply = (c: NewsComment) => {
    const excerpt = (c.text || (c.files?.length ? 'Pièce jointe' : '')).replace(/\s+/g, ' ').trim().slice(0, 90);
    flushSync(() => { setReply({ parentId: c.parent_id || c.id, name: c.role === 'admin' ? 'Responsable' : c.user_name, excerpt }); setOpen(true); });
    const el = cInput.current;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };
  const openProfile = (id: string) => { const u = users.find(x => x.id === id); if (u && onOpenProfile) onOpenProfile(u); };

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    const r = await fn();
    if (!r.success) setMsg(r.error || 'Action impossible.');
    setBusy(false);
    return r;
  };

  const share = () => setShareOpen(true); // feuille de partage : message, copier le lien, partage du téléphone

  const pickComment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    setMsg(''); setCPrep(true);
    const ok: DraftAttachment[] = [];
    const errors: string[] = [];
    for (const f of list) {
      try { ok.push(await prepareAttachment(f)); } catch (x) { errors.push((x as Error).message); }
    }
    setCItems(prev => [...prev, ...ok]);
    if (errors.length) setMsg(errors.join(' '));
    setCPrep(false);
  };

  const send = async () => {
    const v = text.trim();
    if (busy || cPrep || (!v && cItems.length === 0)) return;
    setBusy(true); setMsg('');
    const up = await uploadAttachments(cItems, (d, t) => setCProg({ d, t }));
    setCProg(null);
    if (!up.ok) { setMsg(up.error); setBusy(false); return; }
    const r = await db.commentNews(post.id, v, up.files, reply ? { parentId: reply.parentId, replyToName: reply.name } : undefined);
    if (!r.success) { setMsg(r.error || 'Action impossible.'); setBusy(false); return; }
    if (reply) setShownReplies(prev => new Set(prev).add(reply.parentId)); // sa réponse est visible tout de suite
    setText(''); setCItems([]); setReply(null);
    setBusy(false);
  };

  const btn = `flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 text-xs font-semibold whitespace-nowrap rounded-lg transition-colors disabled:opacity-50 ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`;

  // Un commentaire (ou une réponse) : « Répondre » ouvre la zone d'écriture avec le nom de la personne
  const renderComment = (c: NewsComment, isReply: boolean) => {
            const u = users.find(x => x.id === c.user_id);
            const mine = c.user_id === me.id;
            return (
              <div key={c.id} className={`flex gap-2.5 ${isReply ? 'ml-10' : ''}`}>
                <button type="button" onClick={() => openProfile(c.user_id)} className="shrink-0 cursor-pointer self-start" title="Voir le profil"><Avatar src={u?.avatar_url} name={c.user_name || '?'} className={`${isReply ? 'w-6 h-6' : 'w-8 h-8'} rounded-full`} /></button>
                <div className={`flex-1 min-w-0 rounded-xl px-3 py-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openProfile(c.user_id)} className="text-xs font-bold truncate cursor-pointer" title="Voir le profil">{c.role === 'admin' ? 'Responsable' : c.user_name}</button>
                    <span className={`text-[11px] ${muted}`}>{timeAgo(c.created_at)}</span>
                    {(isAdmin || mine) && (
                      <button type="button" title="Supprimer" onClick={() => void run(() => db.deleteCommentNews(post.id, c.id))} className="ml-auto text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{c.reply_to_name && <span className="font-semibold text-emerald-600">@{c.reply_to_name} </span>}{c.text}</p>
                  {(c.files || []).length > 0 && (() => {
                    const cImgs = (c.files || []).filter(f => f.kind === 'image');
                    const cOthers = (c.files || []).filter(f => f.kind !== 'image');
                    return (
                      <div className="mt-1.5 space-y-1.5">
                        {cImgs.length > 0 && (
                          <ImageCarousel compact images={cImgs} onOpen={url => setLb({ url, gallery: cImgs.map(i => i.url), names: cImgs.map(i => i.name) })} />
                        )}
                        {cOthers.map(f => (
                          <button key={f.url} type="button" onClick={() => setFv(f)} className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs ${light ? 'bg-white hover:bg-slate-50' : 'bg-white/5 hover:bg-white/10'}`}>
                            <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span className="truncate flex-1 min-w-0">{f.name}</span>
                            {f.size ? <span className={`shrink-0 ${muted}`}>{fmtBytes(f.size)}</span> : null}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  <button type="button" onClick={() => startReply(c)} className={`mt-1 text-[11px] font-semibold cursor-pointer ${muted}`}>Répondre</button>
                </div>
              </div>
            );
  };

  return (
    <article data-nav={newsNavId(post.id)} className={`border rounded-xl p-4 sm:p-5 space-y-3 ${card}`}>
      <header className="flex items-center gap-3">
        {personAuthor
          ? <button type="button" onClick={() => openProfile(post.author_id)} className="shrink-0 cursor-pointer" title="Voir le profil"><Avatar src={users.find(x => x.id === post.author_id)?.avatar_url} name={post.author_name || '?'} className="w-10 h-10 rounded-full" /></button>
          : <button type="button" onClick={() => openProfile(post.author_id)} className="shrink-0 cursor-pointer" title="Voir le profil"><div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">GP</div></button>}
        <div className="min-w-0 flex-1">
          {personAuthor
            ? <button type="button" onClick={() => openProfile(post.author_id)} className="block max-w-full text-left font-bold text-sm truncate cursor-pointer" title="Voir le profil">{post.author_name || 'Opérateur'}</button>
            : <button type="button" onClick={() => openProfile(post.author_id)} className="block max-w-full text-left font-bold text-sm truncate cursor-pointer" title="Voir le profil">{post.author_name || 'Responsable'}</button>}
          <div className={`text-xs ${muted}`}>{timeAgo(post.created_at)}{post.edited_at ? ' · modifiée' : ''}{restricted && (isAdmin || mine) ? <span data-audience-badge className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-600 font-semibold"><Eye className="w-3 h-3" />{audienceLabel(post.audience, 'fr')}</span> : null}</div>
        </div>
        {post.pinned && <span className="flex flex-col items-center text-amber-500 px-1"><Pin className="w-4 h-4" fill="currentColor" /><span className="text-[9px] leading-none font-bold">Épinglée</span></span>}
        <PostMenu light={light} busy={busy} items={[
          ...(canEdit && !editing ? [{ key: 'edit', label: 'Modifier', icon: <Pencil className="w-4 h-4" />, onClick: () => setEditing(true) }] : []),
          ...(isAdmin && published ? [{ key: 'pin', label: post.pinned ? 'Retirer l’épingle' : 'Épingler', icon: <Pin className="w-4 h-4" fill={post.pinned ? 'currentColor' : 'none'} />, onClick: () => db.togglePinNews(post.id) }] : []),
          ...(isAdmin || canEdit ? [{ key: 'delete', label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => onAsk({ title: 'Supprimer cette publication ?', message: 'Les commentaires et les fichiers joints seront supprimés aussi.', confirmLabel: 'Supprimer', danger: true, onConfirm: () => void run(() => db.deleteNewsPost(post.id)) }) }] : []),
        ]} />
      </header>

      {!published && (
        <div className={`rounded-lg px-3 py-2 text-xs space-y-1 ${status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {status === 'pending' ? <Clock className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
            {status === 'pending' ? 'En attente de validation' : 'Refusée par le responsable'}
          </div>
          {status === 'rejected' && post.reject_reason && <div>Motif : {post.reject_reason}</div>}
          {status === 'rejected' && !!post.files_removed && <div>Les fichiers joints ont été supprimés.</div>}
          {isAdmin && status === 'pending' && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => db.decideNews(post.id, 'approve'))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
              >
                <Check className="w-4 h-4" />Valider
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => askReason({
                  title: 'Refuser cette publication ?',
                  message: 'Les fichiers joints seront supprimés. L’auteur verra ton motif.',
                  onSubmit: reason => { void run(() => db.decideNews(post.id, 'reject', reason)); },
                })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50"
              >
                <X className="w-4 h-4" />Refuser
              </button>
            </div>
          )}
          {mine && (
            <button type="button" disabled={busy} onClick={() => void run(() => db.withdrawNews(post.id))} className="underline font-semibold disabled:opacity-50">
              Retirer cette publication
            </button>
          )}
        </div>
      )}

      {editing ? <PostEditor post={post} light={light} onDone={() => setEditing(false)} /> : <>
      {post.title && <h2 className="font-bold text-base sm:text-lg leading-snug break-words">{post.title}</h2>}
      {post.text && <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.text}</p>}
      </>}

      {images.length > 0 && (
        <ImageCarousel images={images} onOpen={url => setLb({ url, gallery: images.map(i => i.url), names: images.map(i => i.name) })} />
      )}
      {others.length > 0 && (
        <div className="space-y-1.5">
          {others.map(f => (
            <button key={f.url} type="button" onClick={() => setFv(f)} className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${light ? 'bg-slate-100 hover:bg-slate-200' : 'bg-white/5 hover:bg-white/10'}`}>
              <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="truncate flex-1 min-w-0">{f.name}</span>
              {f.size ? <span className={`text-xs shrink-0 ${muted}`}>{fmtBytes(f.size)}</span> : null}
            </button>
          ))}
        </div>
      )}

      {published && (<>
      <div className={`flex items-center justify-between text-xs pt-1 ${muted}`}>
        <span>{post.loves.length > 0 ? `${post.loves.length} J’adore` : ''}</span>
        <span>{[post.comments.length ? `${post.comments.length} commentaire${post.comments.length > 1 ? 's' : ''}` : '', post.shares ? `${post.shares} partage${post.shares > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span>
      </div>

      <div className={`flex flex-nowrap items-center gap-0.5 border-t pt-2 ${light ? 'border-slate-200' : 'border-slate-700'}`}>
        <button type="button" disabled={busy} onClick={() => void run(() => db.toggleLoveNews(post.id))} className={`${btn} ${loved ? 'text-red-500' : ''}`} aria-pressed={loved}>
          <Heart className="w-3.5 h-3.5 shrink-0" fill={loved ? 'currentColor' : 'none'} />J’adore
        </button>
        <button type="button" onClick={() => setOpen(v => !v)} className={btn}><MessageCircle className="w-3.5 h-3.5 shrink-0" />Commenter</button>
        <button type="button" onClick={share} data-share-open className={btn}><Share2 className="w-3.5 h-3.5 shrink-0" />Partager</button>
      </div>
      </>)}

      {msg && <div className="text-xs text-amber-600">{msg}</div>}
      {shareOpen && <NewsShareSheet post={post} me={me} light={light} onClose={() => setShareOpen(false)} onShared={() => { void run(() => db.shareNews(post.id)); }} />}

      {published && (open || post.comments.length > 0) && (
        <div className="space-y-3 pt-1">
          {open && post.comments.length === 0 && <div className={`text-xs ${muted}`}>Aucun commentaire pour le moment.</div>}
          {!open && post.comments.length > PREVIEW_COMMENTS && <button type="button" onClick={() => setOpen(true)} className={`text-xs font-semibold cursor-pointer ${light ? 'text-slate-600' : 'text-slate-300'}`}>Voir les {post.comments.length} commentaires</button>}
          {(open ? tops : tops.slice(-PREVIEW_COMMENTS)).map(c => {
            const replies = post.comments.filter(r => r.parent_id === c.id);
            return (
              <div key={c.id} className="space-y-2">
                {renderComment(c, false)}
                {replies.length > 0 && (
                  <button type="button" onClick={() => toggleReplies(c.id)} aria-expanded={shownReplies.has(c.id)} className={`ml-10 text-xs font-semibold cursor-pointer ${light ? 'text-slate-600' : 'text-slate-300'}`}>
                    {shownReplies.has(c.id) ? 'Masquer les réponses' : `Afficher ${replies.length} ${replies.length > 1 ? 'réponses' : 'réponse'}`}
                  </button>
                )}
                {shownReplies.has(c.id) && replies.map(r => renderComment(r, true))}
              </div>
            );
          })}
          {open && cItems.length > 0 && (
            <ul className="space-y-1.5">
              {cItems.map(it => (
                <li key={it.key} className={`flex items-center gap-2.5 rounded-lg p-1.5 pr-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`}>
                  {it.kind === 'image'
                    ? <img src={it.dataUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-emerald-600/15"><FileText className="w-4 h-4 text-emerald-600" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">{it.name}</div>
                    <div className={`text-[11px] ${muted}`}>{it.kind === 'image' && it.after < it.before ? `${fmtBytes(it.before)} → ${fmtBytes(it.after)}` : fmtBytes(it.after)}{it.url ? ' · envoyé' : ''}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => setCItems(prev => prev.filter(x => x.key !== it.key))} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-40" aria-label="Retirer ce fichier"><X className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {open && reply && (
            <div className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 ${light ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-200'}`}>
              <span className="min-w-0 truncate">Réponse à <b>{reply.name}</b>{reply.excerpt ? <span className="opacity-70"> : « {reply.excerpt} »</span> : null}</span>
              <button type="button" onClick={() => setReply(null)} className="shrink-0 p-1 cursor-pointer" aria-label="Annuler la réponse"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {open && <div className="flex gap-2">
            <input ref={cFile} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={e => void pickComment(e)} />
            <button type="button" disabled={busy || cPrep} onClick={() => cFile.current?.click()} className={`px-2.5 rounded-lg disabled:opacity-50 ${light ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-200'}`} aria-label="Joindre une photo ou un fichier">
              {cPrep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <input
              ref={cInput}
              enterKeyHint="send"
              value={text}
              maxLength={500}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder={reply ? `Répondre à ${reply.name}…` : 'Écrire un commentaire…'}
              className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`}
            />
            <button type="button" disabled={busy || cPrep || (!text.trim() && cItems.length === 0)} onClick={() => void send()} className="px-3 rounded-lg bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold" aria-label="Envoyer">
              {cProg ? `${cProg.d}/${cProg.t}` : <Send className="w-4 h-4" />}
            </button>
          </div>}
        </div>
      )}
      {lb && <LightboxModal isOpen onClose={() => setLb(null)} imageUrl={lb.url} gallery={lb.gallery} names={lb.names} title={post.title || 'Publication'} />}
      {fv && <FileViewerModal url={fv.url} name={fv.name} onClose={() => setFv(null)} />}
    </article>
  );
};

// Zone de publication : le responsable publie tout de suite, l'opérateur envoie pour validation
const Composer: React.FC<{ isAdmin: boolean; mode: 'direct' | 'review'; light: boolean }> = ({ isAdmin, mode, light }) => {
  const direct = mode === 'direct'; // le responsable, ou un rôle que le responsable a autorisé à publier sans validation
  const [aud, setAud] = useState<NewsRole[]>([]); // vide = visible par tous
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [items, setItems] = useState<DraftAttachment[]>([]);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<{ d: number; t: number } | null>(null);
  const [open, setOpen] = useState(false); // formulaire réduit tant que personne ne veut publier
  const fileRef = useRef<HTMLInputElement>(null);

  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`;
  const muted = light ? 'text-slate-500' : 'text-slate-400';

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    setErr(''); setInfo(''); setPreparing(true);
    const ok: DraftAttachment[] = [];
    const errors: string[] = [];
    for (const f of list) {
      try { ok.push(await prepareAttachment(f)); } catch (x) { errors.push((x as Error).message); }
    }
    setItems(prev => [...prev, ...ok]);
    if (errors.length) setErr(errors.join(' '));
    setPreparing(false);
  };

  const submit = async () => {
    if (busy || preparing || (!text.trim() && items.length === 0)) return;
    setBusy(true); setErr(''); setInfo('');
    const up = await uploadAttachments(items, (d, t) => setProgress({ d, t }));
    setProgress(null);
    if (!up.ok) { setErr(up.error); setBusy(false); return; }
    const r = isAdmin
      ? db.publishNews({ title, text, pinned, files: up.files, audience: aud })
      : await db.submitNews({ title, text, files: up.files, audience: aud });
    if (!r.success) { setErr(r.error || 'Impossible de publier.'); setBusy(false); return; }
    setTitle(''); setText(''); setPinned(false); setItems([]); setAud([]);
    if (!direct) setInfo('Envoyée au responsable. Elle sera visible par l’équipe après validation.');
    else if (!isAdmin) setInfo('Publiée.');
    setBusy(false);
    setOpen(false);
  };

  if (!open) {
    const hasDraft = !!(title.trim() || text.trim() || items.length);
    return (
      <section data-composer-closed className={`border rounded-xl p-3 space-y-2 ${light ? 'bg-white border-slate-200' : 'bg-[#0f1722] border-slate-700'}`}>
        <button type="button" data-composer-open onClick={() => { setOpen(true); setInfo(''); }} className={`w-full min-h-[44px] flex items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm cursor-pointer ${light ? 'bg-slate-50 border-slate-300 text-slate-500 hover:border-emerald-500' : 'bg-[#0b1118] border-slate-600 text-slate-400 hover:border-emerald-500'}`}>
          <span className="truncate">{hasDraft ? 'Continuer ma publication…' : direct ? 'Écrire une publication…' : 'Proposer une publication…'}</span>
          <span className="shrink-0 px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">{direct ? 'Publier' : 'Proposer'}</span>
        </button>
        {info && <div className="text-xs text-emerald-600">{info}</div>}
      </section>
    );
  }

  return (
    <section data-composer-open-form className={`border rounded-xl p-4 space-y-3 ${light ? 'bg-white border-slate-200' : 'bg-[#0f1722] border-slate-700'}`}>
      <div className="flex justify-end -mb-1">
        <button type="button" data-composer-minimize disabled={busy} onClick={() => setOpen(false)} className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-40 cursor-pointer ${light ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-white/10'}`} aria-label="Réduire le formulaire">
          <ChevronUp className="w-4 h-4" /> Réduire
        </button>
      </div>
      {!direct && <div className={`text-xs ${muted}`}>Propose une publication à l’équipe. Le responsable doit la valider avant qu’elle soit visible.</div>}
      <input className={field} value={title} maxLength={120} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Titre (facultatif)" />
      <textarea className={`${field} min-h-[96px]`} value={text} maxLength={2000} disabled={busy} onChange={e => setText(e.target.value)} placeholder={direct ? 'Écris une publication pour l’équipe…' : 'Écris ta publication…'} />
      <AudiencePicker value={aud} onChange={setAud} disabled={busy} light={light} />

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map(it => (
            <li key={it.key} className={`flex items-center gap-2.5 rounded-lg p-1.5 pr-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`}>
              {it.kind === 'image'
                ? <img src={it.dataUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0 bg-emerald-600/15"><FileText className="w-5 h-5 text-emerald-600" /></div>}
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{it.name}</div>
                <div className={`text-xs ${muted}`}>
                  {it.kind === 'image' && it.after < it.before ? `${fmtBytes(it.before)} → ${fmtBytes(it.after)}` : fmtBytes(it.after)}
                  {it.url ? ' · envoyé' : ''}
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => setItems(prev => prev.filter(x => x.key !== it.key))} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 disabled:opacity-40" aria-label="Retirer ce fichier"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={e => void onPick(e)} />
          <button type="button" disabled={busy || preparing} onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 ${light ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/5 text-slate-200'}`}>
            {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            {preparing ? 'Préparation…' : 'Photo / fichier'}
          </button>
          {isAdmin && (
            <label className={`flex items-center gap-2 text-sm ${light ? 'text-slate-700' : 'text-slate-300'}`}>
              <input type="checkbox" checked={pinned} disabled={busy} onChange={e => setPinned(e.target.checked)} />Épingler en haut
            </label>
          )}
        </div>
        <button type="button" onClick={() => void submit()} disabled={busy || preparing || (!text.trim() && items.length === 0)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? (progress ? `Envoi ${progress.d}/${progress.t}…` : 'Envoi…') : direct ? 'Publier' : 'Envoyer pour validation'}
        </button>
      </div>
      {err && <div className="text-xs text-red-500">{err}</div>}
      {info && <div className="text-xs text-emerald-600">{info}</div>}
    </section>
  );
};

export const FeedView: React.FC<{ currentUser: User; onOpenProfile?: (u: User) => void }> = ({ currentUser, onOpenProfile }) => {
  const { theme } = useApp();
  const light = theme === 'light';
  const [, force] = useState(0);
  const { ask, node } = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  const knownRef = useRef<Set<string> | null>(null);

  const isAdmin = currentUser.role === 'admin';
  const pubMode = publishModeFor(currentUser.role, db.getNewsPolicy()); // direct (responsable ou réglage), review (validation) ou off (ne peut pas publier)
  const listOf = () => {
    const a = db.getNews();
    // Aperçu du responsable (bascule opérateur / chef d'équipe / comptable) : on simule ce rôle, avec un autre compte, pour ne voir que ce que ce rôle verrait vraiment
    const preview = db.getCurrentUser()?.role === 'admin' && currentUser.role !== 'admin';
    const seen = preview ? a.filter(p => canSeeNews(p, { id: '__apercu__', role: currentUser.role })) : a;
    return isAdmin ? seen.filter(p => p.status !== 'pending') : seen;
  };
  if (knownRef.current === null) knownRef.current = new Set(listOf().map(p => p.id));

  // Le fil défile dans un conteneur de la page : on le retrouve pour savoir si on est tout en haut
  const getScroller = (): HTMLElement | null => {
    let el = rootRef.current?.parentElement || null;
    while (el) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  };
  const atTop = () => { const sc = getScroller(); return (sc ? sc.scrollTop : window.scrollY) < 120; };

  // Actualités ouvertes : rechargement toutes les 8 s
  useEffect(() => {
    db.setFastPoll(true);
    return () => db.setFastPoll(false);
  }, []);

  // Nouvelles publications des autres : affichées tout de suite si on est en haut, sinon retenues derrière la pastille
  useEffect(() => db.subscribe(() => {
    const k = knownRef.current!;
    const top = atTop();
    for (const p of listOf()) if (!k.has(p.id) && (top || p.author_id === currentUser.id)) k.add(p.id);
    force(n => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isAdmin, currentUser.id]);

  // Lien direct vers une publication (message, partage) : on la montre même si elle était « retenue » derrière la pastille ; si elle n'existe pas ou n'est pas pour toi, on le dit
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const id = newsIdFromNav(peekNavTarget());
      if (!id) return;
      setMissing(false);
      knownRef.current?.add(id);
      force(n => n + 1);
      clearTimeout(timer);
      timer = setTimeout(() => { if (!listOf().some(p => p.id === id)) setMissing(true); }, 3500);
    };
    apply();
    window.addEventListener(NAV_TARGET_EVENT, apply);
    return () => { window.removeEventListener(NAV_TARGET_EVENT, apply); clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const known = knownRef.current;
  const all = db.getNews();
  const queue = isAdmin ? all.filter(p => p.status === 'pending').sort((a, b) => String(a.submitted_at || a.created_at).localeCompare(String(b.submitted_at || b.created_at))) : [];
  const visible = listOf();
  const posts = visible.filter(p => known.has(p.id));
  const held = visible.length - posts.length;

  const showHeld = () => {
    visible.forEach(p => known.add(p.id));
    const sc = getScroller();
    if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
    force(n => n + 1);
  };

  return (
    <div ref={rootRef} className="max-w-2xl mx-auto w-full p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Newspaper className="w-6 h-6 text-emerald-600" />
        <div>
          <h1 className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>Actualités</h1>
          <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Annonces et publications de l’équipe</p>
        </div>
      </div>

      {missing && (
        <div role="status" data-news-missing className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${light ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
          <span className="flex-1">Publication introuvable : elle a été supprimée, ou elle n’est pas visible pour toi.</span>
          <button type="button" onClick={() => setMissing(false)} aria-label="Fermer" className="shrink-0 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {held > 0 && (
        <div className="sticky top-2 z-20 flex justify-center">
          <button type="button" onClick={showHeld} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg">
            ↑ {held} nouvelle{held > 1 ? 's' : ''} publication{held > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {pubMode !== 'off' && <Composer isAdmin={isAdmin} mode={pubMode === 'direct' ? 'direct' : 'review'} light={light} />}

      {queue.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            <Clock className="w-4 h-4" />À valider ({queue.length})
          </div>
          {queue.map(p => <PostCard key={p.id} post={p} me={currentUser} isAdmin={isAdmin} light={light} onAsk={ask} onOpenProfile={onOpenProfile} />)}
        </section>
      )}

      {posts.length === 0 && queue.length === 0 && held === 0 && (
        <div className={`text-center text-sm py-10 ${light ? 'text-slate-500' : 'text-slate-400'}`}>Aucune publication pour le moment.</div>
      )}
      {posts.map(p => <PostCard key={p.id} post={p} me={currentUser} isAdmin={isAdmin} light={light} onAsk={ask} onOpenProfile={onOpenProfile} />)}
      {node}
    </div>
  );
};
