// Stories (24 h) en haut des Actualités : rangée de ronds, lecteur plein écran, création (photo ou texte sur fond de couleur).
// Utilisé par : views/FeedView.tsx. Pour modifier : données dans db/parts/stories.ts, règles dans utils/stories.ts ; qui peut publier = réglage « Qui peut publier une story » (utils/newsAccess.ts, canPostStory).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Eye, Trash2, Loader2, Image as ImageIcon, Type, Send } from 'lucide-react';
import { db } from '../db/store';
import { Avatar } from './Avatar';
import { SafeImage } from './SafeImage';
import { AudiencePicker, type Aud } from './AudiencePicker';
import { prepareAttachment, uploadAttachments, type DraftAttachment } from '../utils/attachments';
import { STORY_BG, STORY_MAX_TEXT, STORY_SECONDS, firstUnseen, groupStories, storyLeft, type StoryGroup, type StoryItem } from '../utils/stories';
import { fb } from '../utils/actionFeedback';
import type { User } from '../types';

const timeHM = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

// ---------- Lecteur plein écran ----------
const StoryViewer: React.FC<{ groups: StoryGroup[]; start: number; me: User; onClose: () => void; onSeen: (id: string) => void; onChanged: () => void }> = ({ groups, start, me, onClose, onSeen, onChanged }) => {
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => firstUnseen(groups[start]));
  const [held, setHeld] = useState(false);
  const [panel, setPanel] = useState(false);
  const g = groups[gi];
  const story: StoryItem | undefined = g?.stories[si];
  const paused = held || panel;
  const left = useRef(STORY_SECONDS * 1000), began = useRef(0), down = useRef<{ t: number; x: number; y: number } | null>(null);

  const next = useCallback(() => {
    if (si < g.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(firstUnseen(groups[gi + 1])); }
    else onClose();
  }, [si, gi, g, groups, onClose]);
  const prev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
    else left.current = STORY_SECONDS * 1000;
  }, [si, gi, groups]);

  useEffect(() => { left.current = STORY_SECONDS * 1000; }, [gi, si]);
  useEffect(() => {
    if (paused || !story) return;
    began.current = Date.now();
    const t = setTimeout(next, left.current);
    return () => { clearTimeout(t); left.current = Math.max(0, left.current - (Date.now() - began.current)); };
  }, [paused, story, next]);
  useEffect(() => { if (story && !story.seen && story.author_id !== me.id) { void db.storySeen(story.id); onSeen(story.id); } }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [next, prev, onClose]);
  useEffect(() => { const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prevOv; }; }, []);
  if (!story) return null;
  const mine = story.author_id === me.id, canSee = mine || me.role === 'admin', canDelete = mine || me.role === 'admin';
  const author = db.getUsers().find(u => u.id === story.author_id);
  const del = async () => { if (await db.storyDelete(story.id)) { onChanged(); if (g.stories.length > 1 && si > 0) setSi(si - 1); else if (g.stories.length === 1) { if (gi < groups.length - 1) setGi(gi + 1); else onClose(); } } };
  const onDown = (e: React.PointerEvent) => { down.current = { t: Date.now(), x: e.clientX, y: e.clientY }; setHeld(true); };
  const onUp = (e: React.PointerEvent) => {
    setHeld(false);
    const d = down.current; down.current = null;
    if (!d) return;
    if (e.clientY - d.y > 90 && Math.abs(e.clientX - d.x) < 80) { onClose(); return; } // glisser vers le bas = fermer
    if (Date.now() - d.t < 250 && Math.abs(e.clientX - d.x) < 12 && Math.abs(e.clientY - d.y) < 12) {
      const w = (e.currentTarget as HTMLElement).clientWidth;
      if (e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left < w * 0.3) prev(); else next();
    }
  };
  return createPortal( // dans <body> : sinon la barre du bas (téléphone) passe par-dessus (la page a son propre empilement)
    <div data-story-viewer className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: '#000', color: '#fff' }} role="dialog" aria-label="Story">
      <div className="relative w-full h-full max-w-[520px] lg:max-h-[94vh] lg:rounded-2xl overflow-hidden select-none" style={{ background: story.kind === 'text' ? story.bg : '#000', touchAction: 'pan-x' }}>
        <div className="absolute top-0 inset-x-0 z-20 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex gap-1" data-story-bars>
            {g.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                <div className="h-full bg-white" style={i < si ? { width: '100%' } : i === si ? { width: '100%', transformOrigin: 'left', animation: `df-story-bar ${STORY_SECONDS}s linear both`, animationPlayState: paused ? 'paused' : 'running' } : { width: 0 }} key={`${s.id}-${i === si ? story.id : ''}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Avatar src={author?.avatar_url} name={story.author_name} className="w-9 h-9 rounded-full" />
            <div className="min-w-0 flex-1 leading-tight"><div className="text-sm font-bold truncate">{story.author_name}</div><div className="text-[11px] text-white/70">{timeHM(story.created_at)} · encore {storyLeft(story)}</div></div>
            {canDelete && <button type="button" onClick={fb('delete', () => del())} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/15" aria-label="Supprimer la story" data-story-delete><Trash2 className="w-5 h-5" /></button>}
            <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/15" aria-label="Fermer" data-story-close><X className="w-6 h-6" /></button>
          </div>
        </div>
        <div className="absolute inset-0 z-10" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { setHeld(false); down.current = null; }} data-story-surface>
          {story.kind === 'photo' && story.file
            ? <SafeImage src={story.file.url} alt="Story" className="w-full h-full object-contain" />
            : null}
          {story.kind === 'text' && <div className="w-full h-full flex items-center justify-center p-8 text-center font-bold text-2xl leading-snug whitespace-pre-wrap break-words">{story.text}</div>}
          {story.kind === 'photo' && story.text && <div className="absolute bottom-0 inset-x-0 p-5 pb-20 bg-gradient-to-t from-black/70 to-transparent text-base whitespace-pre-wrap break-words">{story.text}</div>}
        </div>
        {canSee && (
          <button type="button" onClick={() => setPanel(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center gap-2 backdrop-blur" style={{ color: '#fff', background: 'rgba(0,0,0,.55)' }} data-story-views><Eye className="w-4 h-4" />{(story.viewers || []).length}</button>
        )}
        {panel && canSee && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[65%] overflow-y-auto rounded-t-2xl bg-[#0f1722] text-white p-4 space-y-2" data-story-viewers>
            <div className="flex items-center justify-between"><div className="font-bold text-sm">Vue par {(story.viewers || []).length} personne{(story.viewers || []).length > 1 ? 's' : ''}</div><button type="button" onClick={() => setPanel(false)} className="min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Fermer la liste"><X className="w-5 h-5" /></button></div>
            {(story.viewers || []).length === 0 && <div className="text-sm text-slate-400">Personne ne l’a encore vue.</div>}
            {(story.viewers || []).map(v => <div key={v.id} className="flex items-center justify-between text-sm border-b border-white/10 py-1.5"><span>{v.name || 'Quelqu’un'}</span><span className="text-slate-400 text-xs">{timeHM(v.at)}</span></div>)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

// ---------- Création ----------
const StoryComposer: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [text, setText] = useState('');
  const [bg, setBg] = useState(STORY_BG[0]);
  const [photo, setPhoto] = useState<DraftAttachment | null>(null);
  const [aud, setAud] = useState<Aud>({ roles: [], users: [] });
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    if (!f.type.startsWith('image/')) { setErr('Choisis une photo.'); return; }
    try { setPhoto(await prepareAttachment(f)); } catch (x) { setErr((x as Error).message); }
  };
  const ready = mode === 'photo' ? !!photo : !!text.trim();
  const publish = async () => {
    if (busy || !ready) return;
    setBusy(true); setErr('');
    let files: { url: string; name: string; kind: 'image' | 'file'; size?: number }[] = [];
    if (mode === 'photo' && photo) {
      const up = await uploadAttachments([photo]);
      if (!up.ok) { setErr(up.error); setBusy(false); return; }
      files = up.files;
    }
    const r = await db.storyCreate({ kind: mode, text, bg, files, audience: aud.roles, audience_users: aud.users });
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Impossible de publier.'); return; }
    onDone();
  };
  const tab = (on: boolean) => `flex-1 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer ${on ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-300'}`;
  return createPortal(
    <div data-story-composer className="fixed inset-0 z-[210] bg-[#0b1118] text-white overflow-y-auto" role="dialog" aria-label="Nouvelle story">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Nouvelle story</h3><button type="button" onClick={onClose} disabled={busy} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Fermer" data-story-composer-close><X className="w-6 h-6" /></button></div>
        <div className="flex gap-2"><button type="button" className={tab(mode === 'photo')} onClick={() => setMode('photo')} data-story-mode="photo"><ImageIcon className="w-4 h-4" />Photo</button><button type="button" className={tab(mode === 'text')} onClick={() => setMode('text')} data-story-mode="text"><Type className="w-4 h-4" />Texte</button></div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
          <div className="space-y-3">
            {mode === 'photo' ? (
              <div className="space-y-3">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => void pick(e)} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="w-full aspect-[9/12] max-h-[60vh] rounded-2xl border border-dashed border-white/25 bg-black/40 overflow-hidden flex items-center justify-center text-slate-300 cursor-pointer" data-story-pick>
                  {photo ? <SafeImage src={photo.dataUrl} alt="" className="w-full h-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-sm"><ImageIcon className="w-8 h-8" />Choisir une photo</span>}
                </button>
                <input value={text} maxLength={STORY_MAX_TEXT} onChange={e => setText(e.target.value)} disabled={busy} placeholder="Légende (facultatif)" className="w-full min-h-[44px] rounded-xl bg-[#141e2a] border border-slate-600 px-3 text-sm" data-story-caption />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl min-h-[40vh] flex items-center justify-center p-6" style={{ background: bg }}>
                  <textarea value={text} maxLength={STORY_MAX_TEXT} onChange={e => setText(e.target.value)} disabled={busy} placeholder="Écris ta story…" className="w-full min-h-[160px] bg-transparent text-center text-2xl font-bold placeholder-white/60 outline-none resize-none" style={{ color: '#fff' }} data-story-text />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Couleur de fond">
                  {STORY_BG.map(c => <button key={c} type="button" onClick={() => setBg(c)} aria-label={`Fond ${c}`} aria-pressed={bg === c} className={`w-9 h-9 rounded-full border-2 ${bg === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} data-story-bg={c} />)}
                </div>
                <div className="text-[11px] text-right text-slate-400">{text.length} / {STORY_MAX_TEXT}</div>
              </div>
            )}
          </div>
          <aside className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
            <AudiencePicker value={aud} onChange={setAud} disabled={busy} light={false} />
            <div className="text-[11px] text-slate-400">La story reste visible 24 h, puis disparaît. Toi et le responsable voyez qui l’a vue.</div>
          </aside>
        </div>
        {err && <div className="text-sm text-red-400" role="alert">{err}</div>}
        <div className="flex justify-end"><button type="button" onClick={fb('publish', () => publish())} disabled={busy || !ready} className="w-full sm:w-auto sm:min-w-[220px] justify-center px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold disabled:opacity-50 flex items-center gap-2" data-story-publish>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{busy ? 'Envoi…' : 'Publier la story'}</button></div>
      </div>
    </div>,
    document.body,
  );
};

// ---------- Rangée de ronds ----------
export const StoriesBar: React.FC<{ me: User; light: boolean }> = ({ me, light }) => {
  const [list, setList] = useState<StoryItem[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const [compose, setCompose] = useState(false);
  const alive = useRef(true);
  const load = useCallback(async () => {
    const r = await db.storiesFetch();
    if (alive.current && r) { setList(r.stories); setCanPost(r.can_post); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    const vis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  const groups = groupStories(list, me.id);
  if (!canPost && groups.length === 0) return null;
  const mineGroup = groups.find(g => g.mine);
  const ring = (g: StoryGroup) => (g.allSeen ? 'ring-2 ring-slate-400/50' : 'ring-2 ring-emerald-500');
  const label = light ? 'text-slate-600' : 'text-slate-300';
  return (
    <>
      <div data-stories-bar className="flex gap-3 overflow-x-auto df-noscroll py-1 -mx-1 px-1" aria-label="Stories">
        {canPost && (
          <button type="button" onClick={() => setCompose(true)} className="shrink-0 w-[68px] flex flex-col items-center gap-1 cursor-pointer" data-story-add aria-label="Ajouter une story">
            <span className={`w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center ${light ? 'border-slate-400 text-slate-600' : 'border-slate-500 text-slate-300'}`}><Plus className="w-6 h-6" /></span>
            <span className={`text-[11px] truncate w-full text-center ${label}`}>{mineGroup ? 'Ajouter' : 'Ma story'}</span>
          </button>
        )}
        {groups.map((g, i) => {
          const u = db.getUsers().find(x => x.id === g.author_id);
          return (
            <button key={g.author_id} type="button" onClick={() => setView(i)} className="shrink-0 w-[68px] flex flex-col items-center gap-1 cursor-pointer" data-story-circle={g.author_id}>
              <span className={`w-14 h-14 rounded-full p-[2px] ${ring(g)} flex items-center justify-center`}><Avatar src={u?.avatar_url} name={g.author_name} className="w-full h-full rounded-full" /></span>
              <span className={`text-[11px] truncate w-full text-center ${label}`}>{g.mine ? 'Ma story' : g.author_name}</span>
            </button>
          );
        })}
      </div>
      {view !== null && groups[view] && <StoryViewer groups={groups} start={view} me={me} onClose={() => { setView(null); void load(); }} onSeen={id => setList(l => l.map(s => (s.id === id ? { ...s, seen: true } : s)))} onChanged={() => void load()} />}
      {compose && <StoryComposer onClose={() => setCompose(false)} onDone={() => { setCompose(false); void load(); }} />}
    </>
  );
};
