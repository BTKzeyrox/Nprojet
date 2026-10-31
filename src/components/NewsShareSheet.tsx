import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, Loader2, Search, Send, Share2, Users, X } from 'lucide-react';
import { db } from '../db/store';
import { Avatar } from './Avatar';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { audienceLabel, cleanAudience } from '../utils/newsAccess';
import { newsLink, newsShareText } from '../utils/newsLink';
import { LinkedText } from './LinkedText';
import type { NewsPost, User } from '../types';

/** Partager une publication : l'envoyer dans un message (le lien ouvre directement la publication), copier le lien, ou le partage du téléphone. */
export const NewsShareSheet: React.FC<{ post: NewsPost; me: User; light: boolean; onClose: () => void; onShared: () => void }> = ({ post, me, light, onClose, onShared }) => {
  useLockBodyScroll(true);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]); // personnes et groupes choisis : rien ne part avant « Envoyer »
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const text = useMemo(() => newsShareText(post, origin), [post, origin]);
  const url = newsLink(origin, post.id);
  const restricted = !!cleanAudience(post.audience);

  const targets = useMemo(() => {
    const list: { id: string; title: string; sub: string; user?: User }[] = [{ id: 'all', title: 'Groupe général', sub: 'Tous les opérateurs + responsable' }];
    db.getGroups().forEach(g => list.push({ id: g.id, title: g.name, sub: `${g.members.length} membres` }));
    db.getUsers().filter(u => u.id !== me.id && u.status !== 'blocked').forEach(u => list.push({ id: u.id, title: u.name, sub: u.role === 'admin' ? 'Responsable' : `@${u.username}`, user: u }));
    return list;
  }, [me.id]);
  const shown = targets.filter(t => !q.trim() || `${t.title} ${t.sub}`.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const send = () => {
    if (sending || picked.length === 0) return;
    setErr(''); setSending(true);
    const chosen = targets.filter(t => picked.includes(t.id));
    const okOnes = chosen.filter(t => db.sendMessage({ senderId: me.id, message: text, recipientId: t.id }).success);
    if (okOnes.length === 0) { setErr('Envoi impossible. Réessaie.'); setSending(false); return; }
    setDone(`Envoyé à ${okOnes.map(t => t.title).join(', ')}.`);
    if (okOnes.length < chosen.length) setErr(`${chosen.length - okOnes.length} envoi(s) impossible(s).`);
    onShared();
    setTimeout(onClose, 1100);
  };
  const copy = async () => {
    setErr('');
    try { await navigator.clipboard.writeText(url); setDone('Lien copié.'); onShared(); } catch { setErr('Copie impossible ici : sélectionne le lien et copie-le.'); }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: post.title || 'Gestion Pro', text: restricted ? '' : text.split('\n')[0], url }); onShared(); onClose(); } catch { /* partage annulé */ }
  };

  const card = light ? 'bg-white text-slate-900' : 'bg-[#0f1b2d] text-slate-100';
  const sub = light ? 'text-slate-500' : 'text-slate-400';
  const btn = `w-full min-h-[44px] px-3 rounded-lg flex items-center gap-2.5 text-sm font-semibold cursor-pointer ${light ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose} data-share-sheet-backdrop>
      <div role="dialog" aria-modal="true" aria-label="Partager la publication" onClick={e => e.stopPropagation()} className={`w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl border ${light ? 'border-slate-200' : 'border-white/10'} ${card}`} data-share-sheet>
        <div className="flex items-center gap-2 p-3 border-b border-slate-500/20">
          <Share2 className="w-5 h-5 text-emerald-600" /><h2 className="font-bold flex-1">Partager la publication</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg cursor-pointer hover:bg-slate-500/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 space-y-2 overflow-y-auto">
          {restricted && <div className="rounded-lg px-3 py-2 text-xs bg-sky-500/10 text-sky-600" data-share-restricted>Cette publication est réservée à : {audienceLabel(post.audience, 'fr')}. Le message ne contient que le lien : les autres personnes verront « publication introuvable ».</div>}
          <div className={`whitespace-pre-line break-words text-xs rounded-lg p-2 ${light ? 'bg-slate-100' : 'bg-white/5'}`} data-share-preview><LinkedText text={text} /></div>
          <div className="flex flex-col">
            <button type="button" onClick={() => void copy()} className={btn} data-share-copy><Copy className="w-4 h-4" />Copier le lien</button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <button type="button" onClick={() => void nativeShare()} className={btn} data-share-native><Link2 className="w-4 h-4" />Partager avec une autre appli</button>}
          </div>
          <div className={`text-xs font-semibold pt-1 flex items-center gap-1.5 ${sub}`}><Send className="w-3.5 h-3.5" />Envoyer dans un message</div>
          <div className="relative">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${sub}`} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une personne ou un groupe" aria-label="Chercher" className={`w-full h-10 pl-9 pr-3 rounded-lg border text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300' : 'bg-[#0b1118] border-slate-600'}`} />
          </div>
          <ul className="space-y-0.5" data-share-targets>
            {shown.length === 0 && <li className={`text-xs py-3 text-center ${sub}`}>Personne ne correspond.</li>}
            {shown.map(t => (
              <li key={t.id}>
                <button type="button" onClick={() => toggle(t.id)} aria-pressed={picked.includes(t.id)} disabled={sending || !!done} data-share-target={t.id} className={`${btn} ${picked.includes(t.id) ? (light ? 'bg-emerald-50 ring-1 ring-emerald-400' : 'bg-emerald-500/15 ring-1 ring-emerald-500/50') : ''}`}>
                  {t.user ? <Avatar src={t.user.avatar_url} name={t.title} className="w-8 h-8 rounded-full" /> : <span className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-600 flex items-center justify-center"><Users className="w-4 h-4" /></span>}
                  <span className="min-w-0 flex-1 text-left"><span className="block truncate">{t.title}</span><span className={`block text-[11px] font-normal truncate ${sub}`}>{t.sub}</span></span>
                  <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${picked.includes(t.id) ? 'bg-emerald-600 border-emerald-600 text-white' : light ? 'border-slate-300' : 'border-slate-500'}`} aria-hidden="true">{picked.includes(t.id) && <Check className="w-3.5 h-3.5" />}</span>
                </button>
              </li>
            ))}
          </ul>
          {done && <div className="text-xs text-emerald-600 flex items-center gap-1" role="status"><Check className="w-3.5 h-3.5" />{done}</div>}
          {err && <div className="text-xs text-red-500" role="alert">{err}</div>}
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-slate-500/20" data-share-footer>
          <span className={`text-xs flex-1 ${sub}`}>{picked.length === 0 ? 'Choisis une ou plusieurs personnes.' : `${picked.length} sélectionné${picked.length > 1 ? 's' : ''}`}</span>
          <button type="button" onClick={onClose} disabled={sending} data-share-cancel className={`min-h-[44px] px-4 rounded-lg text-sm font-semibold cursor-pointer ${light ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-200'}`}>Annuler</button>
          <button type="button" onClick={send} disabled={sending || picked.length === 0 || !!done} data-share-send className="min-h-[44px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2 cursor-pointer">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Envoyer{picked.length > 1 ? ` (${picked.length})` : ''}</button>
        </div>
      </div>
    </div>, document.body);
};
