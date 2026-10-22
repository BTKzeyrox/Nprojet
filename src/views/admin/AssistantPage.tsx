import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getHealth, loadHealthExternal } from '../../utils/healthDb';
import { getSnapshotInput } from '../../utils/snapshotDb';
import { respond, morningSummary, todoReply, explainPage, employeeReply, whatIfReply, type Reply } from '../../utils/assistant';
import { SITE_MAP } from '../../utils/siteKnowledge';
import { setStatsTab, type StatsTab } from '../../utils/statsNav';
import { isKnownView } from '../../utils/health/menu';

interface Msg { who: 'me' | 'bot'; text?: string; reply?: Reply }
const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-600 bg-slate-800/70 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5';

export const AssistantPage: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { lang } = useApp();
  const l: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [pageId, setPageId] = useState('dashboard');
  const [empId, setEmpId] = useState('');
  const [pct, setPct] = useState('5');
  const [what, setWhat] = useState<'clientPricePct' | 'salaryPct' | 'expensesPct'>('clientPricePct');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { void loadHealthExternal(); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [msgs]);

  const input = getSnapshotInput();
  if (!input) return <div className="p-4 text-slate-300 text-sm">{t('Réservé à l\'administrateur.', 'Admin only.')}</div>;
  const employees = input.users.filter(u => u.role === 'employee');
  const alerts = () => getHealth().alerts;
  const ask = (label: string, make: (i: NonNullable<ReturnType<typeof getSnapshotInput>>) => Reply) => {
    const i = getSnapshotInput();
    if (!i) return;
    setMsgs(m => [...m, { who: 'me', text: label }, { who: 'bot', reply: make(i) }]);
  };
  const send = () => {
    const q = text.trim();
    if (!q) return;
    setText('');
    ask(q, i => respond(q, i, alerts()));
  };
  const go = (g: { view: string; tab?: string }) => {
    if (g.view === 'stats' && g.tab) setStatsTab(g.tab as StatsTab);
    if (isKnownView(g.view)) onNavigate?.(g.view);
  };
  const n = Number(pct.replace(',', '.'));
  const emp = employees.find(u => u.id === empId) || employees[0];

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center gap-2 text-slate-100"><Bot className="w-6 h-6 text-sky-400" /><h1 className="text-lg sm:text-xl font-bold">{t('Assistant', 'Assistant')}</h1></div>
      <p className="text-xs text-slate-400">{t('Il lit vos données dans votre navigateur, ne devine pas, ne fait rien tout seul. Chaque réponse montre d\'où viennent les chiffres.', 'It reads your data in your browser, never guesses and never acts on its own. Every answer shows where the figures come from.')}</p>

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => ask(t('Résumé du jour', 'Daily summary'), i => morningSummary(i, alerts()))}>{t('Résumé du jour', 'Daily summary')}</button>
        <button className={btn} onClick={() => ask(t('Quoi faire maintenant ?', 'What to do now?'), i => todoReply(i, alerts()))}>{t('Quoi faire maintenant ?', 'What to do now?')}</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label={t('Page', 'Page')} className="min-h-[44px] rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm px-2" value={pageId} onChange={e => setPageId(e.target.value)}>
          {SITE_MAP.filter(p => p.audience !== 'employee').map(p => <option key={p.id} value={p.id}>{l === 'en' ? p.title.en : p.title.fr}</option>)}
        </select>
        <button className={btn} onClick={() => ask(t('Explique cette page', 'Explain this page'), () => explainPage(pageId))}>{t('Explique cette page', 'Explain this page')}</button>
      </div>
      {employees.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <select aria-label={t('Employé', 'Employee')} className="min-h-[44px] rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm px-2" value={emp?.id || ''} onChange={e => setEmpId(e.target.value)}>
            {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className={btn} onClick={() => emp && ask(t(`Récap de ${emp.name}`, `Recap of ${emp.name}`), i => employeeReply(i, emp.id))}>{t('Récap d\'un employé', 'Employee recap')}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-slate-300">{t('Et si', 'What if')}</span>
        <select aria-label={t('Quoi', 'What')} className="min-h-[44px] rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm px-2" value={what} onChange={e => setWhat(e.target.value as typeof what)}>
          <option value="clientPricePct">{t('le prix client', 'the client price')}</option>
          <option value="salaryPct">{t('les salaires', 'salaries')}</option>
          <option value="expensesPct">{t('les dépenses', 'expenses')}</option>
        </select>
        <input aria-label="%" inputMode="decimal" className="w-20 min-h-[44px] rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm px-2" value={pct} onChange={e => setPct(e.target.value)} />
        <span className="text-sm text-slate-300">%</span>
        <button className={btn} disabled={!Number.isFinite(n) || Math.abs(n) > 500} onClick={() => ask(t(`Et si ${what === 'clientPricePct' ? 'le prix client' : what === 'salaryPct' ? 'les salaires' : 'les dépenses'} ${n >= 0 ? '+' : ''}${n} % ?`, `What if ${what === 'clientPricePct' ? 'client price' : what === 'salaryPct' ? 'salaries' : 'expenses'} ${n >= 0 ? '+' : ''}${n}% ?`), i => whatIfReply(i, { [what]: n }))}>{t('Calculer', 'Calculate')}</button>
      </div>

      <div className="space-y-2" aria-live="polite">
        {msgs.map((m, k) => m.who === 'me' ? (
          <div key={k} className="ml-auto max-w-[85%] rounded-xl bg-sky-700 text-white text-sm px-3 py-2">{m.text}</div>
        ) : m.reply && (
          <div key={k} className="rounded-xl border border-slate-700 bg-[#0f1722] p-3 space-y-2 text-sm text-slate-100">
            <div className="font-bold">{l === 'en' ? m.reply.title.en : m.reply.title.fr}</div>
            {m.reply.lines.map((x, j) => <p key={j} className="text-slate-200">{l === 'en' ? x.en : x.fr}</p>)}
            {m.reply.actions.length > 0 && <div className="flex flex-wrap gap-2">{m.reply.actions.map((a, j) => <button key={j} className={btn} onClick={() => go(a.go)}>{l === 'en' ? a.label.en : a.label.fr}<ChevronRight className="w-4 h-4" /></button>)}</div>}
            <p className="text-[11px] text-slate-400">{t('Source : ', 'Source: ')}{l === 'en' ? m.reply.sources.en : m.reply.sources.fr}</p>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={t('Posez une question…', 'Ask a question…')} aria-label={t('Question', 'Question')} className="flex-1 min-h-[44px] rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm px-3" />
        <button type="submit" className={btn} aria-label={t('Envoyer', 'Send')}><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
};
