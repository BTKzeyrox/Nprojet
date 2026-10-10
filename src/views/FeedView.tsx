import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, Share2, Pin, Trash2, Send, Newspaper } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import { Avatar } from '../components/Avatar';
import type { NewsPost, User } from '../types';

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
        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">GP</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm">{post.author_name || 'Responsable'}</div>
          <div className={`text-xs ${muted}`}>{timeAgo(post.created_at)}</div>
        </div>
        {post.pinned && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><Pin className="w-3.5 h-3.5" />Épinglée</span>}
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button type="button" title={post.pinned ? 'Retirer l’épingle' : 'Épingler'} onClick={() => db.togglePinNews(post.id)} className={`p-2 rounded-lg ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}><Pin className="w-4 h-4" /></button>
            <button type="button" title="Supprimer" onClick={() => onAsk({ title: 'Supprimer cette publication ?', message: 'Les commentaires seront supprimés aussi.', confirmLabel: 'Supprimer', danger: true, onConfirm: () => db.deleteNews(post.id) })} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </header>

      {post.title && <h2 className="font-bold text-base sm:text-lg leading-snug">{post.title}</h2>}
      <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.text}</p>

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

      {msg && <div className="text-xs text-amber-600">{msg}</div>}

      {open && (
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
    </article>
  );
};

export const FeedView: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { theme } = useApp();
  const light = theme === 'light';
  const [, force] = useState(0);
  const { ask, node } = useConfirm();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const isAdmin = currentUser.role === 'admin';
  const posts = db.getNews();

  const publish = () => {
    const r = db.publishNews({ title, text, pinned });
    if (!r.success) { setErr(r.error || 'Impossible de publier.'); return; }
    setErr(''); setTitle(''); setText(''); setPinned(false);
  };

  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`;

  return (
    <div className="max-w-2xl mx-auto w-full p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Newspaper className="w-6 h-6 text-emerald-600" />
        <div>
          <h1 className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>Actualités</h1>
          <p className={`text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>Annonces et publications du responsable</p>
        </div>
      </div>

      {isAdmin && (
        <section className={`border rounded-xl p-4 space-y-3 ${light ? 'bg-white border-slate-200' : 'bg-[#0f1722] border-slate-700'}`}>
          <input className={field} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Titre (facultatif)" />
          <textarea className={`${field} min-h-[96px]`} value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Écris une publication pour l’équipe…" />
          <div className="flex items-center justify-between gap-3">
            <label className={`flex items-center gap-2 text-sm ${light ? 'text-slate-700' : 'text-slate-300'}`}>
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />Épingler en haut
            </label>
            <button type="button" onClick={publish} disabled={!text.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">Publier</button>
          </div>
          {err && <div className="text-xs text-red-500">{err}</div>}
        </section>
      )}

      {posts.length === 0 && (
        <div className={`text-center text-sm py-10 ${light ? 'text-slate-500' : 'text-slate-400'}`}>Aucune publication pour le moment.</div>
      )}
      {posts.map(p => <PostCard key={p.id} post={p} me={currentUser} isAdmin={isAdmin} light={light} onAsk={ask} />)}
      {node}
    </div>
  );
};
