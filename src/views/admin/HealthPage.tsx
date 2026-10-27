import React, { useEffect, useMemo, useState } from 'react';
import { HeartPulse, RefreshCw, Eye, EyeOff, CheckCircle2, ChevronRight, Undo2 } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { getHealth, loadHealthExternal, ackAlert, unack, subscribeHealth } from '../../utils/healthDb';
import { HEALTH_PAGES, type HealthAlert, type HealthPage as Page, type HealthSeverity } from '../../utils/health/types';
import { pageStates } from '../../utils/health/registry';
import { setStatsTab, type StatsTab } from '../../utils/statsNav';
import { isKnownView } from '../../utils/health/menu';

const PAGE_LABEL: Record<Page, { fr: string; en: string }> = {
  missions: { fr: 'Missions', en: 'Missions' }, team: { fr: 'Équipe', en: 'Team' }, payroll: { fr: 'Paie et avances', en: 'Payroll and advances' },
  finance: { fr: 'Finances', en: 'Finance' }, clients: { fr: 'Clients', en: 'Clients' }, stock: { fr: 'Stock', en: 'Stock' },
  invoices: { fr: 'Facturation', en: 'Invoicing' }, suppliers: { fr: 'Fournisseurs', en: 'Suppliers' }, hr: { fr: 'RH', en: 'HR' },
  performance: { fr: 'Performance', en: 'Performance' }, conditions: { fr: 'Conditions', en: 'Conditions' }, data: { fr: 'Qualité des données', en: 'Data quality' },
  security: { fr: 'Sécurité', en: 'Security' }, system: { fr: 'Système', en: 'System' }, accounting: { fr: 'Comptabilité', en: 'Accounting' },
};
// Pages sans contrôleur tant que leur module n'existe pas : on ne les montre pas (rien à dire, ce serait trompeur de les montrer « OK »)
const LIVE_PAGES: Page[] = ['missions', 'team', 'payroll', 'finance', 'clients', 'stock', 'conditions', 'data', 'system', 'accounting'];
const SEV: Record<HealthSeverity, { fr: string; en: string; cls: string }> = {
  urgent: { fr: 'Urgent', en: 'Urgent', cls: 'bg-rose-600 text-white' },
  watch: { fr: 'À voir', en: 'To check', cls: 'bg-amber-500 text-black' },
  info: { fr: 'Info', en: 'Info', cls: 'bg-sky-600 text-white' },
};
const STATE_CLS = { ok: 'border-emerald-700/60 text-emerald-300', watch: 'border-amber-600/70 text-amber-300', urgent: 'border-rose-600/70 text-rose-300' } as const;
const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const btn = 'min-h-[44px] px-3 rounded-xl border border-slate-600 bg-[#141e2a] hover:border-slate-400 text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5';
// Liseré de couleur à gauche de chaque alerte selon la gravité
const SEV_EDGE: Record<HealthSeverity, string> = { urgent: 'df-edge-urgent', watch: 'df-edge-watch', info: 'df-edge-info' };
const sinceTxt = (d: string | null, l: 'fr' | 'en') => (d ? (l === 'en' ? `since ${d}` : `depuis le ${d.split('-').reverse().join('/')}`) : '');

export const HealthPage: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { lang } = useApp();
  const l: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [, tick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilter] = useState<Page | 'all'>('all');
  const [asking, setAsking] = useState<{ id: string; status: 'ignored' | 'checked' } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => { const a = subscribeHealth(() => tick(x => x + 1)), b = db.subscribe(() => tick(x => x + 1)); return () => { a(); if (typeof b === 'function') b(); }; }, []);
  const refresh = async () => { setLoading(true); await loadHealthExternal(); setLoading(false); };
  useEffect(() => { void refresh(); }, []);

  const h = getHealth();
  const states = useMemo(() => pageStates(h.alerts, HEALTH_PAGES), [h]);
  const shown = h.alerts.filter(a => filter === 'all' || a.page === filter);
  const urgent = h.alerts.filter(a => a.severity === 'urgent').length, watch = h.alerts.filter(a => a.severity === 'watch').length, info = h.alerts.filter(a => a.severity === 'info').length;

  const open = (a: HealthAlert) => {
    if (a.go.view === 'stats' && a.go.tab) setStatsTab(a.go.tab as StatsTab);
    if (isKnownView(a.go.view)) onNavigate?.(a.go.view);
  };
  const confirmAck = (a: HealthAlert) => {
    if (!asking) return;
    ackAlert(a, asking.status, reason.trim());
    setAsking(null); setReason('');
  };

  const card = (a: HealthAlert) => (
    <li key={a.id} className={`rounded-xl border border-slate-700 border-l-4 ${SEV_EDGE[a.severity]} bg-[#0f1722] p-3 sm:p-4 space-y-2`}>
      <div className="flex items-start gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${SEV[a.severity].cls}`}>{SEV[a.severity][l]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white break-words">{l === 'en' ? a.title_en : a.title_fr}</p>
          <p className="text-xs text-slate-300 mt-1 break-words">{l === 'en' ? a.why_en : a.why_fr}</p>
          {(l === 'en' ? a.todo_en : a.todo_fr) && <p className="text-xs text-emerald-300 mt-1 break-words">{t('À faire : ', 'To do: ')}{l === 'en' ? a.todo_en : a.todo_fr}</p>}
          <p className="text-[11px] text-slate-400 mt-1">{PAGE_LABEL[a.page][l]}{a.since ? ` · ${sinceTxt(a.since, l)}` : ''}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => open(a)}><ChevronRight className="w-4 h-4" />{t('Ouvrir', 'Open')}</button>
        <button type="button" className={btn} onClick={() => { setAsking({ id: a.id, status: 'checked' }); setReason(''); }}><CheckCircle2 className="w-4 h-4" />{t('Vérifié', 'Checked')}</button>
        <button type="button" className={btn} onClick={() => { setAsking({ id: a.id, status: 'ignored' }); setReason(''); }}><EyeOff className="w-4 h-4" />{t('Ignorer', 'Ignore')}</button>
      </div>
      {asking?.id === a.id && (
        <div className="rounded-xl border border-slate-600 bg-[#141e2a] p-3 space-y-2">
          <label className="text-xs text-slate-300 block" htmlFor={`why-${a.id}`}>{asking.status === 'ignored' ? t('Pourquoi ignorer ? (facultatif)', 'Why ignore? (optional)') : t('Qu\'as-tu vérifié ? (facultatif)', 'What did you check? (optional)')}</label>
          <input id={`why-${a.id}`} value={reason} maxLength={200} onChange={e => setReason(e.target.value)} className="w-full min-h-[44px] rounded-xl bg-[#141e2a] border border-slate-600 px-3 text-sm text-white" />
          <p className="text-[11px] text-slate-400">{asking.status === 'ignored' ? t('L\'alerte revient si le problème s\'aggrave, ou après 14 jours. Marque gardée sur cet appareil.', 'The alert returns if the problem gets worse, or after 14 days. Mark kept on this device.') : t('L\'alerte revient seulement si le problème s\'aggrave. Marque gardée sur cet appareil.', 'The alert returns only if the problem gets worse. Mark kept on this device.')}</p>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => confirmAck(a)}>{t('Confirmer', 'Confirm')}</button>
            <button type="button" className={btn} onClick={() => setAsking(null)}>{t('Annuler', 'Cancel')}</button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-3 sm:space-y-4 pb-6" data-notranslate="">
      <div className={box}>
        <div className="flex items-center gap-2 flex-wrap">
          <HeartPulse className="w-5 h-5 text-emerald-400" />
          <h1 className="text-base sm:text-lg font-bold text-white flex-1 min-w-0">{t('Santé du site', 'Site health')}</h1>
          <button type="button" className={btn} onClick={() => void refresh()} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{t('Actualiser', 'Refresh')}</button>
        </div>
        <p className="text-xs text-slate-300">{t('Le site contrôle chaque page tout seul. Ce sont des signaux à vérifier, jamais des accusations : tu décides.', 'The site checks each page by itself. These are signals to check, never accusations: you decide.')}</p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="px-2 py-1 rounded-full bg-rose-600/20 text-rose-300 border border-rose-600/50">{urgent} {t('urgent(s)', 'urgent')}</span>
          <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-600/50">{watch} {t('à voir', 'to check')}</span>
          <span className="px-2 py-1 rounded-full bg-sky-600/15 text-sky-300 border border-sky-600/50">{info} info</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5" role="tablist" aria-label={t('Pages', 'Pages')}>
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={`min-h-[44px] rounded-xl border text-xs font-semibold ${filter === 'all' ? 'bg-emerald-700 border-emerald-500 text-white' : 'border-slate-700 text-slate-300 bg-[#141e2a]'}`}>{t('Toutes', 'All')}</button>
          {LIVE_PAGES.map(p => (
            <button key={p} type="button" role="tab" aria-selected={filter === p} onClick={() => setFilter(p)} className={`min-h-[44px] rounded-xl border text-xs font-semibold px-1 ${filter === p ? 'bg-emerald-700 border-emerald-500 text-white' : `bg-[#141e2a] ${STATE_CLS[states[p]]}`}`}>
              {PAGE_LABEL[p][l]} · {states[p] === 'ok' ? 'OK' : states[p] === 'urgent' ? t('Urgent', 'Urgent') : t('À voir', 'To check')}
            </button>
          ))}
        </div>
      </div>

      {h.errors.length > 0 && <p className="text-xs text-amber-300 px-1">{t(`${h.errors.length} contrôle(s) n'ont pas pu tourner : le reste fonctionne.`, `${h.errors.length} check(s) could not run: the rest works.`)}</p>}

      {shown.length === 0 ? (
        <div className={box}><p className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{t('Rien à signaler pour le moment.', 'Nothing to report right now.')}</p></div>
      ) : (
        <ul className="space-y-2">{shown.map(card)}</ul>
      )}

      {h.hidden.length > 0 && (
        <div className={box}>
          <button type="button" className={btn} onClick={() => setShowHidden(v => !v)}><Eye className="w-4 h-4" />{showHidden ? t('Cacher les alertes ignorées', 'Hide ignored alerts') : t(`Voir les ${h.hidden.length} alerte(s) ignorée(s) ou vérifiée(s)`, `Show ${h.hidden.length} ignored or checked alert(s)`)}</button>
          {showHidden && (
            <ul className="space-y-2">
              {h.hidden.map(a => {
                const ack = h.acks.find(x => x.id === a.id);
                return (
                  <li key={a.id} className="rounded-xl border border-slate-700 bg-[#0f1722] p-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200 break-words">{l === 'en' ? a.title_en : a.title_fr}</p>
                      {ack && <p className="text-[11px] text-slate-400 break-words">{ack.status === 'ignored' ? t('Ignorée', 'Ignored') : t('Vérifiée', 'Checked')}{ack.reason ? ` : ${ack.reason}` : ''}</p>}
                    </div>
                    <button type="button" className={btn} onClick={() => unack(a.id)}><Undo2 className="w-4 h-4" />{t('Remettre', 'Restore')}</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
