// Assistant « Admin IA Pro » (niveau A) DANS la messagerie : conversation épinglée, ADMIN SEULEMENT.
// Les règles répondent (src/utils/assistant.ts) ; aucune donnée ne part vers un serveur ; l'historique reste sur cet appareil.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, ChevronRight, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getHealth, loadHealthExternal } from '../utils/healthDb';
import { getSnapshotInput } from '../utils/snapshotDb';
import { respond, helpReply, type Reply } from '../utils/assistant';
import { TEMPLATES, FIELDS, compose, type Field } from '../utils/messageTemplates';
import { setStatsTab, type StatsTab } from '../utils/statsNav';
import { isKnownView } from '../utils/health/menu';

interface Msg { id: string; who: 'me' | 'bot'; text?: string; reply?: Reply; at: number }
const KEY = (uid: string) => `df_assistant_chat_${uid}`;
const MAX = 120;
export const loadAssistantHistory = (uid: string): Msg[] => { try { const v = JSON.parse(localStorage.getItem(KEY(uid)) || '[]'); return Array.isArray(v) ? v.slice(-MAX) : []; } catch { return []; } };
const saveHistory = (uid: string, m: Msg[]) => { try { localStorage.setItem(KEY(uid), JSON.stringify(m.slice(-MAX))); } catch { /* appareil sans stockage : on garde en mémoire seulement */ } };
export const lastAssistantPreview = (uid: string, l: 'fr' | 'en'): string => { const m = loadAssistantHistory(uid).slice(-1)[0]; return m ? (m.text || (m.reply ? (l === 'en' ? m.reply.title.en : m.reply.title.fr) : '')) : ''; };

export const AssistantChat: React.FC<{ userId: string; onBack: () => void; onNavigate?: (view: string) => void; className?: string }> = ({ userId, onBack, onNavigate, className = '' }) => {
  const { lang, theme } = useApp();
  const l: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const L = theme === 'light';
  const [msgs, setMsgs] = useState<Msg[]>(() => loadAssistantHistory(userId));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // « Rédiger un message » : modèle + champs ; texte final modifiable avant de le copier (rien n'est envoyé)
  const [composing, setComposing] = useState(false);
  const [tplId, setTplId] = useState(TEMPLATES[0].id);
  const [vals, setVals] = useState<Partial<Record<Field, string>>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  const tpl = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
  useEffect(() => { void loadHealthExternal(); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs, busy]);

  const push = (add: Msg[]) => setMsgs(m => { const n = [...m, ...add].slice(-MAX); saveHistory(userId, n); return n; });
  const ask = (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setText('');
    const now = Date.now();
    push([{ id: `a${now}`, who: 'me', text: q, at: now }]);
    setBusy(true);
    window.setTimeout(() => { // petite pause : il « écrit » (le calcul, lui, est instantané)
      const i = getSnapshotInput();
      const reply = i ? respond(q, i, getHealth().alerts) : helpReply();
      push([{ id: `b${Date.now()}`, who: 'bot', reply, at: Date.now() }]);
      setBusy(false);
    }, 350);
  };
  const fill = () => {
    const r = compose(tplId, vals, l);
    if (r.ok) { setDraft(r.text); setProblem(''); setCopied(false); return; }
    setDraft(null);
    const names = (a: Field[]) => a.map(f => (l === 'en' ? FIELDS[f].label.en : FIELDS[f].label.fr)).join(', ');
    setProblem([r.missing.length ? t(`À remplir : ${names(r.missing)}.`, `To fill in: ${names(r.missing)}.`) : '', r.invalid.length ? t(`Valeur à corriger : ${names(r.invalid)}.`, `Value to fix: ${names(r.invalid)}.`) : ''].filter(Boolean).join(' '));
  };
  const copy = async () => { if (draft == null) return; try { await navigator.clipboard.writeText(draft); setCopied(true); } catch { setCopied(false); setProblem(t('Copie impossible ici : sélectionne le texte et copie-le à la main.', 'Copy not possible here: select the text and copy it by hand.')); } };
  const go = (g: { view: string; tab?: string }) => {
    if (g.view === 'stats' && g.tab) setStatsTab(g.tab as StatsTab);
    if (isKnownView(g.view)) onNavigate?.(g.view);
  };
  const quick = [t('Résumé du jour', 'Daily summary'), t('Quoi faire maintenant ?', 'What to do now?'), t('Et si le prix client +5 % ?', 'What if client price +5%?'), t('Aide', 'Help')];
  const bubbleBot = L ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#16243a] border-white/10 text-slate-100';

  return (
    <div className={`flex flex-col flex-1 min-w-0 min-h-0 ${className}`} data-assistant-chat>
      <div className="px-2.5 py-2.5 bg-[#0b2a4a] text-white flex items-center gap-2 shrink-0 shadow-md relative z-10">
        <button type="button" onClick={onBack} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title={t('Retour', 'Back')}><ArrowLeft className="w-5 h-5" /></button>
        <span className="w-11 h-11 rounded-full bg-sky-600 flex items-center justify-center shrink-0"><Bot className="w-6 h-6 text-white" /></span>
        <span className="min-w-0"><span className="block font-bold text-base leading-tight">{t('Assistant', 'Assistant')}</span><span className="block text-xs text-white/70">{t('Règles et calculs sur vos données · sans IA externe', 'Rules and calculations on your data · no external AI')}</span></span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2" aria-live="polite">
        {msgs.length === 0 && <p className={`text-sm text-center py-6 ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('Posez une question ou touchez un bouton. Je ne devine pas, je montre toujours d\'où viennent les chiffres, et je ne fais rien tout seul.', 'Ask a question or tap a button. I do not guess, I always show where figures come from, and I never act on my own.')}</p>}
        {msgs.map(m => m.who === 'me' ? (
          <div key={m.id} className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-sm bg-sky-700 text-white text-sm px-3 py-2">{m.text}</div>
        ) : m.reply && (
          <div key={m.id} className={`max-w-[92%] w-fit rounded-2xl rounded-bl-sm border px-3 py-2 space-y-1.5 text-sm ${bubbleBot}`}>
            <div className="font-bold">{l === 'en' ? m.reply.title.en : m.reply.title.fr}</div>
            {m.reply.lines.map((x, j) => <p key={j}>{l === 'en' ? x.en : x.fr}</p>)}
            {m.reply.actions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{m.reply.actions.map((a, j) => <button key={j} type="button" onClick={() => go(a.go)} className="min-h-[40px] px-3 rounded-lg border border-sky-500/60 bg-sky-600/20 hover:bg-sky-600/30 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">{l === 'en' ? a.label.en : a.label.fr}<ChevronRight className="w-4 h-4" /></button>)}</div>}
            <p className={`text-[11px] ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('Source : ', 'Source: ')}{l === 'en' ? m.reply.sources.en : m.reply.sources.fr}</p>
          </div>
        ))}
        {busy && <div className={`w-fit rounded-2xl border px-3 py-2 text-sm ${bubbleBot}`} aria-label={t('L\'assistant écrit', 'Assistant is typing')}>…</div>}
        <div ref={end} />
      </div>
      <div className={`px-3 pt-2 pb-3 border-t shrink-0 ${L ? 'bg-white border-slate-200' : 'bg-[#0f1b2d] border-white/10'}`}>
        {composing && (
          <div className={`mb-2 rounded-xl border p-2.5 space-y-2 text-sm ${L ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-white/15 bg-white/5 text-slate-100'}`} data-compose>
            <select aria-label={t('Modèle', 'Template')} value={tplId} onChange={e => { setTplId(e.target.value); setDraft(null); setProblem(''); }} className={`w-full min-h-[40px] rounded-lg border px-2 ${L ? 'bg-white border-slate-300' : 'bg-[#16243a] border-white/15'}`}>
              {TEMPLATES.map(x => <option key={x.id} value={x.id}>{l === 'en' ? x.name.en : x.name.fr}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              {tpl.fields.map(f => <label key={f} className="text-xs space-y-0.5"><span>{l === 'en' ? FIELDS[f].label.en : FIELDS[f].label.fr}</span>
                <input type={FIELDS[f].kind === 'date' ? 'date' : 'text'} inputMode={FIELDS[f].kind === 'amount' ? 'decimal' : undefined} value={vals[f] || ''} onChange={e => setVals(v => ({ ...v, [f]: e.target.value }))} className={`w-full min-h-[40px] rounded-lg border px-2 text-sm ${L ? 'bg-white border-slate-300' : 'bg-[#16243a] border-white/15'}`} /></label>)}
            </div>
            <div className="flex gap-2"><button type="button" onClick={fill} className="min-h-[40px] px-3 rounded-lg bg-sky-600 text-white text-xs font-semibold cursor-pointer">{t('Préparer le message', 'Prepare the message')}</button><button type="button" onClick={() => setComposing(false)} className="min-h-[40px] px-3 rounded-lg border border-slate-400/50 text-xs cursor-pointer">{t('Fermer', 'Close')}</button></div>
            {problem && <p className="text-xs text-rose-500" role="alert">{problem}</p>}
            {draft != null && <><textarea aria-label={t('Message à modifier', 'Message to edit')} value={draft} onChange={e => { setDraft(e.target.value); setCopied(false); }} rows={4} className={`w-full rounded-lg border p-2 text-sm ${L ? 'bg-white border-slate-300' : 'bg-[#16243a] border-white/15'}`} />
              <div className="flex items-center gap-2"><button type="button" onClick={copy} className="min-h-[40px] px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer">{t('Copier', 'Copy')}</button>{copied && <span className="text-xs text-emerald-500">{t('Copié. Rien n\'a été envoyé : collez-le où vous voulez.', 'Copied. Nothing was sent: paste it where you want.')}</span>}</div></>}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button type="button" onClick={() => setComposing(v => !v)} className={`shrink-0 min-h-[36px] px-3 rounded-full border text-xs font-semibold cursor-pointer ${L ? 'border-sky-500 text-sky-700 bg-sky-50' : 'border-sky-400/60 text-sky-200 bg-sky-500/10'}`}>{t('Rédiger un message', 'Write a message')}</button>{quick.map(q => <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className={`shrink-0 min-h-[36px] px-3 rounded-full border text-xs font-semibold cursor-pointer ${L ? 'border-slate-300 text-slate-700 bg-slate-50' : 'border-white/20 text-slate-100 bg-white/5'}`}>{q}</button>)}</div>
        <form onSubmit={e => { e.preventDefault(); ask(text); }} className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} aria-label={t('Question', 'Question')} placeholder={t('Posez une question…', 'Ask a question…')} className={`flex-1 min-h-[44px] rounded-full border px-4 text-sm focus:outline-none ${L ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#16243a] border-white/15 text-slate-100'}`} />
          <button type="submit" disabled={busy || !text.trim()} aria-label={t('Envoyer', 'Send')} className="w-11 h-11 rounded-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer"><Send className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
};
