import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Pin, Trash2, Send, Newspaper, Paperclip, X, FileText, Clock, Ban, Loader2 } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import { Avatar } from '../components/Avatar';
import { LightboxModal } from '../components/LightboxModal';
import { FileViewerModal } from '../components/FileViewerModal';
import { ACCEPT_ATTR, fmtBytes, prepareAttachment, uploadAttachments, type DraftAttachment } from '../utils/attachments';
import type { NewsAttachment, NewsPost, User } from '../types';

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

const PostCard: React.FC<{ post: NewsPost; me: User; isAdmin: boolean; light: boolean; onAsk: ReturnType<typeof useConfirm>['ask'] }> = ({ post, me, isAdmin, light, onAsk }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [lb, setLb] = useState<{ url: string; gallery: string[] } | null>(null);
  const [fv, setFv] = useState<NewsAttachment | null>(null);
  const status = post.status || 'published';
  const published = status === 'published';
  const mine = post.author_id === me.id;
  const files = post.files || [];
  const images = files.filter(f => f.kind === 'image');
  const others = files.filter(f => f.kind !== 'image');
  const loved = post.loves.includes(me.id);
  const card = light ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1722] border-slate-700 text-slate-100';
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  const users = db.getUsers();

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    const r = await fn();
    if (!r.success) setMsg(r.error || 'Action impossible.');
    setBusy(false);
    return r;
  };

  const share = async () => {
    const url = `${window.location.origin}/`;
    const body = `${post.title ? post.title + ' — ' : ''}${post.text.slice(0, 140)}${post.text.length > 140 ? '…' : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title || 'Gestion Pro', text: body, url });
      else { await navigator.clipboard.writeText(`${body}\n${url}`); setMsg('Lien copié.'); }
    } catch { return; } // partage annulé
    void run(() => db.shareNews(post.id));
  };

  const send = async () => {
    const v = text.trim();
    if (!v) return;
    const r = await run(() => db.commentNews(post.id, v));
    if (r?.success) setText('');
  };

  const btn = `flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`;

  return (
    <article className={`border rounded-xl p-4 sm:p-5 space-y-3 ${card}`}>
      <header className="flex items-center gap-3">
        {post.author_role === 'employee'
          ? <Avatar src={users.find(x => x.id === post.author_id)?.avatar_url} name={post.author_name || '?'} className="w-10 h-10 rounded-full" />
          : <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">GP</div>}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">{post.author_name || 'Responsable'}</div>
          <div className={`text-xs ${muted}`}>{timeAgo(post.created_at)}</div>
        </div>
        {post.pinned && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Pin className="w-3.5 h-3.5" />Épinglée</span>}
        {isAdmin && (
          <div className="flex items-center gap-1">
            {published && <button type="button" title={post.pinned ? 'Retirer l’épingle' : 'Épingler'} onClick={() => db.togglePinNews(post.id)} className={`p-2 rounded-lg ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}><Pin className="w-4 h-4" /></button>}
            <button type="button" title="Supprimer" onClick={() => onAsk({ title: 'Supprimer cette publication ?', message: 'Les commentaires seront supprimés aussi.', confirmLabel: 'Supprimer', danger: true, onConfirm: () => db.deleteNews(post.id) })} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </header>

      {!published && (
        <div className={`rounded-lg px-3 py-2 text-xs space-y-1 ${status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {status === 'pending' ? <Clock className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
            {status === 'pending' ? 'En attente de validation' : 'Refusée par le responsable'}
          </div>
          {status === 'rejected' && post.reject_reason && <div>Motif : {post.reject_reason}</div>}
          {status === 'rejected' && !!post.files_removed && <div>Les fichiers joints ont été supprimés.</div>}
          {mine && (
            <button type="button" disabled={busy} onClick={() => void run(() => db.withdrawNews(post.id))} className="underline font-semibold disabled:opacity-50">
              Retirer cette publication
            </button>
          )}
        </div>
      )}

      {post.title && <h2 className="font-bold text-base sm:text-lg leading-snug break-words">{post.title}</h2>}
      {post.text && <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.text}</p>}

      {images.length > 0 && (
        <div className={images.length === 1 ? '' : 'grid grid-cols-2 sm:grid-cols-3 gap-1.5'}>
          {images.map(f => (
            <button key={f.url} type="button" onClick={() => setLb({ url: f.url, gallery: images.map(i => i.url) })} className="block w-full overflow-hidden rounded-lg" title={f.name}>
              <img src={f.url} alt={f.name} loading="lazy" className={images.length === 1 ? 'w-full max-h-96 object-cover' : 'w-full aspect-square object-cover'} />
            </button>
          ))}
        </div>
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

      <div className={`flex items-center gap-1 border-t pt-2 ${light ? 'border-slate-200' : 'border-slate-700'}`}>
        <button type="button" disabled={busy} onClick={() => void run(() => db.toggleLoveNews(post.id))} className={`${btn} ${loved ? 'text-red-500' : ''}`} aria-pressed={loved}>
          <Heart className="w-4 h-4" fill={loved ? 'currentColor' : 'none'} />J’adore
        </button>
        <button type="button" onClick={() => setOpen(v => !v)} className={btn}><MessageCircle className="w-4 h-4" />Commenter</button>
        <button type="button" onClick={() => void share()} className={btn}><Share2 className="w-4 h-4" />Partager</button>
      </div>
      </>)}

      {msg && <div className="text-xs text-amber-600">{msg}</div>}

      {published && open && (
        <div className="space-y-3 pt-1">
          {post.comments.length === 0 && <div className={`text-xs ${muted}`}>Aucun commentaire pour le moment.</div>}
          {post.comments.map(c => {
            const u = users.find(x => x.id === c.user_id);
            const mine = c.user_id === me.id;
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar src={u?.avatar_url} name={c.user_name || '?'} className="w-8 h-8 rounded-full" />
                <div className={`flex-1 min-w-0 rounded-xl px-3 py-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate">{c.role === 'admin' ? 'Responsable' : c.user_name}</span>
                    <span className={`text-[11px] ${muted}`}>{timeAgo(c.created_at)}</span>
                    {(isAdmin || mine) && (
                      <button type="button" title="Supprimer" onClick={() => void run(() => db.deleteCommentNews(post.id, c.id))} className="ml-auto text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{c.text}</p>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2">
            <input
              value={text}
              maxLength={500}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void send(); }}
              placeholder="Écrire un commentaire…"
              className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`}
            />
            <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="px-3 rounded-lg bg-emerald-600 text-white disabled:opacity-50" aria-label="Envoyer"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {lb && <LightboxModal isOpen onClose={() => setLb(null)} imageUrl={lb.url} gallery={lb.gallery} title={post.title || 'Publication'} />}
      {fv && <FileViewerModal url={fv.url} name={fv.name} onClose={() => setFv(null)} />}
    </article>
  );
};

// Zone de publication : le responsable publie tout de suite, l'opérateur envoie pour validation
const Composer: React.FC<{ isAdmin: boolean; light: boolean }> = ({ isAdmin, light }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [items, setItems] = useState<DraftAttachment[]>([]);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<{ d: number; t: number } | null>(null);
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
      ? db.publishNews({ title, text, pinned, files: up.files })
      : await db.submitNews({ title, text, files: up.files });
    if (!r.success) { setErr(r.error || 'Impossible de publier.'); setBusy(false); return; }
    setTitle(''); setText(''); setPinned(false); setItems([]);
    if (!isAdmin) setInfo('Envoyée au responsable. Elle sera visible par l’équipe après validation.');
    setBusy(false);
  };

  return (
    <section className={`border rounded-xl p-4 space-y-3 ${light ? 'bg-white border-slate-200' : 'bg-[#0f1722] border-slate-700'}`}>
      {!isAdmin && <div className={`text-xs ${muted}`}>Propose une publication à l’équipe. Le responsable doit la valider avant qu’elle soit visible.</div>}
      <input className={field} value={title} maxLength={120} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Titre (facultatif)" />
      <textarea className={`${field} min-h-[96px]`} value={text} maxLength={2000} disabled={busy} onChange={e => setText(e.target.value)} placeholder={isAdmin ? 'Écris une publication pour l’équipe…' : 'Écris ta publication…'} />

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
          {busy ? (progress ? `Envoi ${progress.d}/${progress.t}…` : 'Envoi…') : isAdmin ? 'Publier' : 'Envoyer pour validation'}
        </button>
      </div>
      {err && <div className="text-xs text-red-500">{err}</div>}
      {info && <div className="text-xs text-emerald-600">{info}</div>}
    </section>
  );
};

export const FeedView: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { theme } = useApp();
  const light = theme === 'light';
  const [, force] = useState(0);
  const { ask, node } = useConfirm();
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const isAdmin = currentUser.role === 'admin';
  const posts = db.getNews();

  return (
    <div className="max-w-2xl mx-auto w-full p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Newspaper className="w-6 h-6 text-emerald-600" />
        <div>
          <h1 className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>Actualités</h1>
          <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Annonces et publications de l’équipe</p>
        </div>
      </div>

      <Composer isAdmin={isAdmin} light={light} />

      {posts.length === 0 && (
        <div className={`text-center text-sm py-10 ${light ? 'text-slate-500' : 'text-slate-400'}`}>Aucune publication pour le moment.</div>
      )}
      {posts.map(p => <PostCard key={p.id} post={p} me={currentUser} isAdmin={isAdmin} light={light} onAsk={ask} />)}
      {node}
    </div>
  );
};
