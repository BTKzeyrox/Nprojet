// Assistant « Admin IA Pro » (niveau A) DANS la messagerie : conversation épinglée, ADMIN SEULEMENT.
// Les règles répondent (src/utils/assistant.ts) ; aucune donnée ne part vers un serveur ; l'historique reste sur cet appareil.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, ChevronRight, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getHealth, loadHealthExternal } from '../utils/healthDb';
import { getSnapshotInput } from '../utils/snapshotDb';
import { respond, helpReply, pageLinks, entityLinks, recapPrintHtml, PRINT_PREFIX, b, type Reply } from '../utils/assistant';
import { shortcutList, shortcutReply, detectShortcut } from '../utils/assistantShortcuts';
import { suggestedMessages, findSuggested, MSG_PREFIX, type SuggestedMessage } from '../utils/assistantMessages';
import { useKeepBottom } from '../utils/useKeepBottom';
import { composerEnter, isDesktopPointer, useAutoGrow } from '../utils/composerKeys';
import { db } from '../db/store';
import { parsePollIntent, pollPreview, pollIncomplete, pollDone, pollCanceled, decodePoll, POLL_NO, parseAnnounceIntent, announcePreview, announceDone, announceCanceled, decodeAnn, ANN_NO } from '../utils/assistantPublish';
import { parseMissionIntent, missionPreview, missionIncomplete, missionDone, missionCanceled, decodeMis, MIS_NO } from '../utils/assistantMission';
import { missionRequiresClient } from '../utils/clients';
import { readCompany } from '../utils/companyRules';
import { parseExtraIntent, summaryReply, fileReply, fileDone, buildFile, templatesReply, isFileKind, TPL_PREFIX, FILE_PREFIX } from '../utils/assistantExtras';
import { getRemItems } from '../utils/remRegistry';
import { remSave as saveReminder } from '../utils/remindersState'; // met aussi à jour la liste partagée (Calendrier, « Mes rappels », cloche)
import { parseActionIntent, actionPreview, actionDone, actionCanceled, decodeAct, buildItem, ACT_NO } from '../utils/assistantActions';
import { parseMemoryIntent, runMemory, forgetDone, searchNotes, notesAnswer, notesForAi, norm, MEM_FORGET_PREFIX, MEM_EDIT_PREFIX, type MemIntent, type MemNote, type MemApi } from '../utils/assistantMemory';
import { assistantMenu, menuHeightFromKeyboard, menuLabel, MENU_FALLBACK_H, type MenuItem } from '../utils/assistantMenu';
import { aiOptIn, aiMemOptIn, askAi, setAiOptIn } from '../utils/aiAssist';
import { TypingDots } from './Reactions';
import { TEMPLATES, FIELDS, compose, type Field } from '../utils/messageTemplates';
import { setStatsTab, type StatsTab } from '../utils/statsNav';
import { setStorageIntent, type StorageIntent } from '../utils/storageNav';
import { setNavTarget } from '../utils/navTarget';
import { setValFilterIntent, type ValFilter } from '../utils/navIntent';
import { isKnownView } from '../utils/health/menu';

const ENABLE_AI = '__enable_ai';
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
  const listRef = useRef<HTMLDivElement>(null);
  const keep = useKeepBottom(() => listRef.current, () => true, 'assistant'); // le clavier ne coupe jamais le dernier message
  const mountedAt = useRef(Date.now()); // seuls les messages arrivés après l'ouverture jouent l'animation d'entrée
  const pendingMem = useRef(false); // « mémorise » est venu seul : le prochain message est la phrase à retenir
  const memApi: MemApi = useMemo(() => ({ fetch: () => db.memFetch(), save: n => db.memSave(n), remove: id => db.memDelete(id) }), []);
  const inflight = useRef(false); // garde synchrone : l'état `busy` arrive trop tard si on touche deux fois vite
  const lastQ = useRef<{ q: string; at: number }>({ q: '', at: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(inputRef, text, 48);
  // « Rédiger un message » : modèle + champs ; texte final modifiable avant de le copier (rien n'est envoyé)
  const [composing, setComposing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // menu « / » : 6 gros boutons, sous le champ, à la place du clavier
  const [menuH, setMenuH] = useState<number | null>(null); // hauteur du bloc = celle du clavier mesurée à l'ouverture (220–300 px), sinon hauteur de repli
  const [tplId, setTplId] = useState(TEMPLATES[0].id);
  const [vals, setVals] = useState<Partial<Record<Field, string>>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  const tpl = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
  useEffect(() => { void loadHealthExternal(); }, []);
  useEffect(() => { if (!menuOpen) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [menuOpen]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs, busy]);

  const push = (add: Msg[]) => setMsgs(m => { const n = [...m, ...add].slice(-MAX); saveHistory(userId, n); return n; });
  const ask = (q: string) => {
    q = q.trim();
    if (!q || inflight.current) return;
    if (lastQ.current.q === q && Date.now() - lastQ.current.at < 3000) { setText(''); return; } // même texte envoyé deux fois d'affilée = un seul envoi
    lastQ.current = { q, at: Date.now() };
    inflight.current = true;
    setText('');
    const now = Date.now();
    push([{ id: `a${now}`, who: 'me', text: q, at: now }]);
    setBusy(true);
    window.setTimeout(async () => { // petite pause : il « écrit » (le calcul des règles, lui, est instantané)
      const i = getSnapshotInput();
      const sid = detectShortcut(q); // un bouton du bas (ou son texte écrit à la main) : réponse avec les vrais chiffres et des boutons exacts
      // Mémoire : « mémorise : … », « ma mémoire », « oublie la 2 » ; « mémorise » seul = la phrase vient au message d'après
      let mi: MemIntent | 'cancel' | null = parseMemoryIntent(q);
      if (!mi && pendingMem.current && !sid) mi = /^(annule|annuler|laisse tomber|laisse|non|cancel|stop)\b/.test(norm(q)) ? 'cancel' : { kind: 'save', text: q };
      pendingMem.current = !!mi && mi !== 'cancel' && mi.kind === 'save-ask';
      const ann = mi ? null : parseAnnounceIntent(q); // « publie : fermé lundi » : aperçu d'abord
      const poll = mi || ann ? null : parsePollIntent(q); // « sondage : question ? choix, choix »
      const mis = mi || ann || poll ? null : parseMissionIntent(q, Date.now(), db.getClients().map(c => ({ id: c.id, name: c.name })), missionRequiresClient(readCompany(db.getSettings().company))); // « mission : titre, pour Acme, demain, urgente » : aperçu d'abord
      const ext = mi || ann || poll || mis ? null : parseExtraIntent(q); // « résume ma journée / ma semaine », « fichier de mes rappels », « modèle : relance »
      const act = mi || ann || poll || mis || ext ? null : parseActionIntent(q, Date.now()); // « rappelle-moi… », « ajoute au calendrier… », « ajoute une tâche… » : aperçu d'abord
      let reply: Reply = mi ? (mi === 'cancel' ? { intent: 'memory_cancel', title: b('D\'accord, je ne retiens rien', 'OK, I remember nothing'), lines: [], actions: [], sources: b('', '') } : await runMemory(mi, memApi)) : ann ? announcePreview(ann) : poll ? (poll === 'incomplete' ? pollIncomplete() : pollPreview(poll)) : mis ? (mis === 'incomplete' ? missionIncomplete() : missionPreview(mis)) : ext ? (ext.kind === 'summary' ? summaryReply(getRemItems(), db.getContracts(), Date.now(), ext.span) : ext.kind === 'file' ? fileReply(ext.what) : templatesReply(ext.id)) : act ? actionPreview(act) : i ? (sid ? shortcutReply(sid, i, getHealth().alerts) : respond(q, i, getHealth().alerts)) : helpReply();
      if (!mi && !ann && !poll && !mis && !ext && !act && reply.intent === 'unknown' && i) {
        let hits: MemNote[] = [];
        try { const ns = await db.memFetch(); hits = ns ? searchNotes(q, ns) : []; } catch { hits = []; } // une note qui ressemble à la question : on la montre (sans réseau externe)
        const useAi = aiOptIn(userId);
        if (hits.length && !(useAi && aiMemOptIn(userId))) reply = notesAnswer(hits);
        else if (useAi) { // question libre : seulement si l'admin a activé l'IA externe (Réglages), sinon rien ne sort du site
          const turns = msgs.slice(-6).map(m => ({ role: (m.who === 'me' ? 'user' : 'model') as 'user' | 'model', text: m.text || (m.reply ? [l === 'en' ? m.reply.title.en : m.reply.title.fr, ...m.reply.lines.slice(0, 3).map(x => (l === 'en' ? x.en : x.fr))].join(' ') : '') }));
          const noteTurn = hits.length ? notesForAi(hits, l) : ''; // seulement les notes liées à la question, 380 caractères au plus, et seulement si la case est cochée dans Réglages
          const r = await askAi(q, l, noteTurn ? [{ role: 'user', text: noteTurn }, { role: 'model', text: l === 'en' ? 'Understood.' : 'Compris.' }, ...turns.slice(-4)] : turns);
          reply = r.ok
            ? { intent: 'ai', title: { fr: '', en: '' }, lines: r.text.split(/\n+/).filter(Boolean).map(x => ({ fr: x, en: x })), actions: [...entityLinks(r.text, i), ...pageLinks(r.text, l)], sources: { fr: '', en: '' } }
            : { intent: 'ai_error', title: { fr: '', en: '' }, lines: [r.error], actions: [], sources: { fr: '', en: '' } };
        } else reply = { intent: 'ai_off', title: { fr: 'Je ne sais pas répondre à ça tout seul', en: 'I cannot answer that on my own' }, lines: [{ fr: 'Mes règles couvrent le résumé, les priorités, l\'équipe, les chiffres et les « et si ». Pour les questions libres, je peux demander à une IA externe : elle ne reçoit que ta question et un résumé sans noms.', en: 'My rules cover the summary, priorities, team, figures and "what if". For free-form questions I can ask an external AI: it only receives your question and a summary without names.' }, { fr: 'Elle est coupée sur cet appareil. Touche le bouton pour l\'activer (tu peux la couper dans Réglages > Général).', en: 'It is off on this device. Tap the button to turn it on (you can turn it off in Settings > General).' }], actions: [{ label: { fr: 'Activer l\'IA externe', en: 'Turn on the external AI' }, go: { view: ENABLE_AI } }], sources: { fr: 'règles du site', en: 'site rules' } };
      }
      push([{ id: `b${Date.now()}`, who: 'bot', reply, at: Date.now() }]);
      inflight.current = false;
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
  // Message prêt, déjà rempli avec les vrais éléments : l'éditeur s'ouvre avec le texte ; un champ à décider (le motif) reste à remplir. Rien n'est envoyé.
  const applySuggested = (sm: SuggestedMessage) => {
    setComposing(true); setTplId(sm.template); setVals(sm.values); setCopied(false);
    const r = compose(sm.template, sm.values, l);
    if (r.ok) { setDraft(r.text); setProblem(''); return; }
    setDraft(null);
    setProblem(t(`À remplir : ${r.missing.map(f => FIELDS[f].label.fr).join(', ')}.`, `To fill in: ${r.missing.map(f => FIELDS[f].label.en).join(', ')}.`));
  };
  const suggested = useMemo(() => { if (!composing) return []; try { const si = getSnapshotInput(); return si ? suggestedMessages(si, l) : []; } catch { return []; } }, [composing, l]);
  const go = (g: { view: string; tab?: string; storage?: StorageIntent; nav?: string; filter?: string }) => {
    if (g.view.startsWith(PRINT_PREFIX)) { const i = getSnapshotInput(), h = i && recapPrintHtml(i, g.view.slice(PRINT_PREFIX.length), l); if (h) { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(h); w.document.close(); } } return; }
    if (g.view.startsWith(MSG_PREFIX)) { const si = getSnapshotInput(), sm = si && findSuggested(si, g.view.slice(MSG_PREFIX.length), l); if (sm) applySuggested(sm); return; }
    if (g.view.startsWith(TPL_PREFIX)) { const id = g.view.slice(TPL_PREFIX.length); const t0 = TEMPLATES.find(x => x.id === id); if (!t0) { push([{ id: `b${Date.now()}`, who: 'bot', reply: templatesReply(null), at: Date.now() }]); return; } setComposing(true); setTplId(t0.id); setVals({}); setDraft(null); setProblem(''); setCopied(false); return; }
    if (g.view.startsWith(FILE_PREFIX)) {
      const kind = g.view.slice(FILE_PREFIX.length);
      let ok = false, name = '';
      if (isFileKind(kind)) { try { const f = buildFile(kind, getRemItems(), db.getContracts(), Date.now()); name = f.name; const url = URL.createObjectURL(new Blob([f.content], { type: f.mime })); const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 4000); ok = true; } catch { ok = false; } }
      push([{ id: `b${Date.now()}`, who: 'bot', reply: fileDone(name, ok), at: Date.now() }]); return;
    }
    if (g.view === MIS_NO) { push([{ id: `b${Date.now()}`, who: 'bot', reply: missionCanceled(), at: Date.now() }]); return; }
    const dm = decodeMis(g.view);
    if (dm) { const r = db.addContract({ client_name: dm.title, initial_score: 0, objective: 0, client_id: dm.clientId || undefined, due_date: dm.date || undefined, due_time: dm.time || undefined, priority: dm.priority, requireClient: missionRequiresClient(readCompany(db.getSettings().company)) }); push([{ id: `b${Date.now()}`, who: 'bot', reply: missionDone(r.success, r.error), at: Date.now() }]); return; }
    if (g.view === ANN_NO) { push([{ id: `b${Date.now()}`, who: 'bot', reply: announceCanceled(), at: Date.now() }]); return; }
    const dn = decodeAnn(g.view);
    if (dn) { const r = db.publishNews({ title: '', text: dn.text }); push([{ id: `b${Date.now()}`, who: 'bot', reply: announceDone(r.success, r.error), at: Date.now() }]); return; }
    if (g.view === POLL_NO) { push([{ id: `b${Date.now()}`, who: 'bot', reply: pollCanceled(), at: Date.now() }]); return; }
    const dp = decodePoll(g.view);
    if (dp) { const r = db.publishNews({ title: '', text: dp.question, poll: { question: dp.question, options: dp.options } }); push([{ id: `b${Date.now()}`, who: 'bot', reply: pollDone(r.success, r.error), at: Date.now() }]); return; }
    if (g.view === ACT_NO) { push([{ id: `b${Date.now()}`, who: 'bot', reply: actionCanceled(), at: Date.now() }]); return; }
    const da = decodeAct(g.view);
    if (da) { void saveReminder(buildItem(da)).then(r => push([{ id: `b${Date.now()}`, who: 'bot', reply: actionDone(da, r.ok, r.error), at: Date.now() }])); return; }
    if (g.view.startsWith(MEM_FORGET_PREFIX)) { void db.memDelete(g.view.slice(MEM_FORGET_PREFIX.length)).then(ok => push([{ id: `b${Date.now()}`, who: 'bot', reply: forgetDone(ok), at: Date.now() }])); return; }
    if (g.view.startsWith(MEM_EDIT_PREFIX)) { const id = g.view.slice(MEM_EDIT_PREFIX.length); void db.memFetch().then(ns => { const k = ns ? ns.findIndex(x => x.id === id) : -1; if (ns && k >= 0) { setText(`${l === 'en' ? 'edit' : 'modifie'} ${k + 1} : ${ns[k].text}`); inputRef.current?.focus(); } }); return; }
    if (g.view === ENABLE_AI) { setAiOptIn(userId, true); const q = lastQ.current.q; lastQ.current = { q: '', at: 0 }; if (q) ask(q); return; } // active l'IA sur cet appareil puis repose la dernière question
    if (g.view === 'stats' && g.tab) setStatsTab(g.tab as StatsTab);
    if (g.storage) setStorageIntent(g.storage);
    if (g.filter) setValFilterIntent(g.filter as ValFilter);
    if (g.nav) setNavTarget(g.nav);
    if (isKnownView(g.view) || g.view === 'feed' || g.view === 'grid') onNavigate?.(g.view);
  };
  // Boutons du bas : les vrais chiffres du jour (un bouton sans rien à montrer se cache) ; recalculés après chaque message, pas à chaque lettre tapée
  const shortcuts = useMemo(() => { try { const si = getSnapshotInput(); return si ? shortcutList(si) : []; } catch { return []; } }, [msgs.length, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const menu = useMemo(() => assistantMenu(shortcuts), [shortcuts]);
  // Un bouton du menu : les 5 premiers envoient tout de suite (même chemin que la saisie, le message reste dans l'historique) ; « Rédiger un message » ouvre l'éditeur sans rien envoyer.
  const pick = (m: MenuItem) => {
    setMenuOpen(false);
    if (m.kind === 'compose') { setComposing(true); return; }
    ask(l === 'en' ? m.send.en : m.send.fr);
  };
  // Ouvre ou ferme le bloc : on mesure le clavier AVANT de le fermer, puis le bloc prend sa place (le champ ne bouge pas).
  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return; }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    setMenuH(menuHeightFromKeyboard(typeof window !== 'undefined' ? window.innerHeight : NaN, vv?.height, vv?.offsetTop));
    inputRef.current?.blur();
    setMenuOpen(true);
  };
  const bubbleBot = L ? 'bg-white text-slate-800 border-slate-200' : 'bg-[#16212e] text-slate-200 border-slate-700/80'; // mêmes couleurs que les messages reçus de la messagerie
  const area = L ? 'chat-wallpaper chat-wallpaper-light' : 'chat-wallpaper chat-wallpaper-dark'; // même fond à deux couches que la messagerie

  return (
    <div className={`flex flex-col flex-1 min-w-0 min-h-0 ${className}`} data-assistant-chat>
      <div className="px-2.5 py-2.5 bg-[#0b2a4a] text-white flex items-center gap-2 shrink-0 shadow-md relative z-10">
        <button type="button" onClick={onBack} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white cursor-pointer" title={t('Retour', 'Back')}><ArrowLeft className="w-5 h-5" /></button>
        <span className="w-11 h-11 rounded-full bg-sky-600 flex items-center justify-center shrink-0"><Bot className="w-6 h-6 text-white" /></span>
        <span className="min-w-0"><span className="block font-bold text-base leading-tight">{t('Assistant', 'Assistant')}</span><span className="block text-xs text-white/70">{t('Règles et calculs sur vos données · IA externe facultative', 'Rules and calculations on your data · optional external AI')}</span></span>
      </div>
      <div ref={listRef} className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 ${area}`} aria-live="polite">
        {msgs.length === 0 && <p className={`text-sm text-center py-6 ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('Posez une question ou touchez un bouton. Je ne devine pas, je montre toujours d\'où viennent les chiffres, et je ne fais rien tout seul.', 'Ask a question or tap a button. I do not guess, I always show where figures come from, and I never act on my own.')}</p>}
        {msgs.map(m => m.who === 'me' ? (
          <div key={m.id} className={`ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-md bg-emerald-700 text-white text-[0.9375rem] leading-relaxed whitespace-pre-line break-words px-3 py-1.5 shadow-sm ${m.at >= mountedAt.current ? 'df-msg-in-right' : ''}`}>{m.text}</div>
        ) : m.reply && (
          <div key={m.id} className={`max-w-[92%] w-fit rounded-2xl rounded-bl-md border px-3 py-1.5 space-y-1.5 text-[0.9375rem] leading-relaxed shadow-sm ${bubbleBot} ${m.at >= mountedAt.current ? 'df-msg-in-left' : ''}`}>
            {(l === 'en' ? m.reply.title.en : m.reply.title.fr) && <div className="font-bold">{l === 'en' ? m.reply.title.en : m.reply.title.fr}</div>}
            {m.reply.lines.map((x, j) => <p key={j}>{l === 'en' ? x.en : x.fr}</p>)}
            {m.reply.actions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{m.reply.actions.map((a, j) => <button key={j} type="button" onClick={() => go(a.go)} className="min-h-[40px] px-3 rounded-lg border border-sky-500/60 bg-sky-600/20 hover:bg-sky-600/30 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">{l === 'en' ? a.label.en : a.label.fr}<ChevronRight className="w-4 h-4" /></button>)}</div>}
            {(l === 'en' ? m.reply.sources.en : m.reply.sources.fr) && <p className={`text-[11px] ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('Source : ', 'Source: ')}{l === 'en' ? m.reply.sources.en : m.reply.sources.fr}</p>}
          </div>
        ))}
        {busy && <div className={`df-msg-in-left w-fit rounded-2xl rounded-bl-md border px-3 py-2 text-[0.9375rem] flex items-center gap-2 shadow-sm ${bubbleBot}`} role="status" aria-label={t('L\'assistant écrit', 'Assistant is typing')}><TypingDots /><span className={`text-[11px] ${L ? 'text-slate-500' : 'text-slate-400'}`}>{t('L\'assistant écrit…', 'Assistant is typing…')}</span></div>}
        <div ref={end} />
      </div>
      <div className={`px-3 pt-2 pb-3 border-t shadow-[0_-6px_18px_-12px_rgba(15,30,58,0.35)] shrink-0 ${L ? 'bg-white border-slate-200' : 'bg-[#0f1b2d] border-white/10'}`}>
        {composing && (
          <div className={`mb-2 rounded-xl border p-2.5 space-y-2 text-sm ${L ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-white/15 bg-white/5 text-slate-100'}`} data-compose>
            <div className="flex justify-end"><button type="button" onClick={() => setComposing(false)} data-compose-close className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold cursor-pointer ${L ? 'border-slate-300 text-slate-700 bg-white' : 'border-white/20 text-slate-100 bg-white/5'}`}>{t('Fermer', 'Close')}</button></div>
            {suggested.length > 0 && <div className="flex flex-wrap gap-1.5" data-suggested-messages>{suggested.map(x => <button key={x.id} type="button" onClick={() => applySuggested(x)} className={`min-h-[36px] px-2.5 rounded-lg border text-xs font-semibold cursor-pointer ${L ? 'border-sky-500 text-sky-700 bg-sky-50' : 'border-sky-400/60 text-sky-200 bg-sky-500/10'}`}>{l === 'en' ? x.label.en : x.label.fr}</button>)}</div>}
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
        <form onSubmit={e => { e.preventDefault(); ask(text); inputRef.current?.focus(); }}>
          <div className={`flex items-end gap-1.5 rounded-3xl border pl-1.5 pr-1.5 py-1.5 ${L ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/15'}`}>
            <button type="button" onClick={toggleMenu} aria-label={t('Menu des messages prêts', 'Ready messages menu')} aria-expanded={menuOpen} aria-haspopup="menu" title={t('Menu des messages prêts', 'Ready messages menu')} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg font-bold cursor-pointer border ${menuOpen ? 'bg-sky-600 border-sky-500 text-white' : L ? 'bg-white border-slate-300 text-sky-700' : 'bg-white/10 border-white/20 text-sky-200'}`}>/</button>
            <textarea ref={inputRef} rows={1} value={text} onFocus={() => { setMenuOpen(false); keep.pin(); }} onChange={e => setText(e.target.value)} onKeyDown={e => { if (composerEnter(e.nativeEvent, isDesktopPointer()) === 'send') { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} enterKeyHint="enter" autoComplete="off" aria-label={t('Question', 'Question')} placeholder={busy ? t('L\'assistant écrit…', 'Assistant is typing…') : t('Écrire un message…', 'Write a message…')} className={`flex-1 min-w-0 resize-none bg-transparent border-0 px-1 py-3 text-base leading-6 max-h-36 focus:outline-none focus:ring-0 ${L ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'}`} style={{ boxShadow: 'none', border: 'none', height: 48 }} />
            <button type="submit" disabled={busy || !text.trim()} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} aria-label={t('Envoyer', 'Send')} className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50 shrink-0 shadow-md"><Send className="w-5 h-5" /></button>
          </div>
        </form>
        {menuOpen && (
          <div className={`grid grid-cols-2 grid-rows-3 gap-2 px-2.5 pt-2.5 box-border shrink-0 ${L ? 'bg-slate-100' : 'bg-white/5'}`} style={{ height: menuH ? `${menuH}px` : MENU_FALLBACK_H, paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }} role="menu" aria-label={t('Messages prêts', 'Ready messages')} data-assistant-menu>
            {menu.map(m => (
              <button key={m.id} type="button" role="menuitem" disabled={busy && m.kind === 'send'} onClick={() => pick(m)} data-menu-item={m.id} className={`min-h-[48px] px-2 rounded-xl border text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer disabled:opacity-50 ${m.kind === 'compose' ? (L ? 'border-sky-500 text-sky-700 bg-sky-50' : 'border-sky-400/60 text-sky-200 bg-sky-500/10') : (L ? 'border-slate-300 bg-white text-slate-800' : 'border-white/20 bg-white/5 text-slate-100')}`}>{menuLabel(m, l)}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
