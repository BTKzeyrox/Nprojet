import React, { useRef, useState } from 'react';
import { X, UserCog, Ban, UserCheck, Trash2, FileText, CalendarDays, MessageSquare, ExternalLink, Sun, Moon, Clock3, ListChecks } from 'lucide-react';
import type { AppSettings, PostSession, User } from '../types';
import { Avatar } from './Avatar';
import { LiveLine } from './LiveStatus';
import { liveText, type LiveInfo } from '../utils/presenceStatus';
import { backdropDown, backdropShouldClose } from '../utils/modalGuard';
import { badgeLabel, formatScoreM, shiftHoursLabel } from '../utils/formatUtils';
import { formatDuration } from '../utils/presence';
import { todayMada } from '../utils/stats';
import { effShift, showShift } from '../utils/shiftMode';
import { madaClock } from '../utils/accessRequest';

/** Libellé d'une mission ouverte. */
const OPEN_LABEL: Record<string, { fr: string; en: string }> = {
  pending_start: { fr: 'Début à valider', en: 'Start to approve' },
  active: { fr: 'En cours', en: 'In progress' },
  pending_end: { fr: 'Fin à valider', en: 'End to approve' },
};
/** Minutes écoulées depuis le début d'une mission (heure de Madagascar, UTC+3). */
const minutesSince = (p: Pick<PostSession, 'date' | 'start_time'>, nowMs: number): number | null => {
  const t = Date.parse(`${p.date}T${(p.start_time || '').slice(0, 8)}+03:00`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 60000)) : null;
};
const dur = (min: number, lang: 'fr' | 'en'): string => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`) + (lang === 'en' ? '' : '');

export interface OperatorSheetProps {
  user: User; cfg: AppSettings; lang: 'fr' | 'en'; nowMs: number; live: LiveInfo; posts: PostSession[]; onlineSec?: number;
  /** Pastilles « à valider » (déjà prêtes) : affichées si présentes. */
  chips?: React.ReactNode;
  onClose: () => void;
  onProfile: () => void; onEdit: () => void; onToggleBlock: () => void; onDelete: () => void;
  onSetAccess: (mode: 'auto' | 'allow' | 'block') => void;
  /** Déconnexion forcée dans X minutes (0 = tout de suite) et annulation. */
  onForceLogout: (minutes: number) => Promise<{ success: boolean; error?: string; openMission?: boolean }>;
  onCancelForce: () => Promise<{ success: boolean; error?: string }>;
  onOpen?: (view: 'operator' | 'calendar' | 'chat') => void;
}

/** Fiche d'un opérateur : son état, sa session et TOUTES les actions possibles (voir, gérer, supprimer). S'ouvre en touchant une ligne de la liste. */
export const OperatorSheet: React.FC<OperatorSheetProps> = ({ user, cfg, lang, nowMs, live, posts, onlineSec, chips, onClose, onProfile, onEdit, onToggleBlock, onDelete, onSetAccess, onForceLogout, onCancelForce, onOpen }) => {
  const [fMin, setFMin] = useState(10);
  const [fMsg, setFMsg] = useState<string | null>(null);
  const [fBusy, setFBusy] = useState(false);
  const forcedAt = user.force_logout_at && Date.parse(user.force_logout_at) > nowMs ? Date.parse(user.force_logout_at) : 0;
  const openMission = posts.some(p => p.employee_id === user.id && ['pending_start', 'active', 'pending_end'].includes(p.status));
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const down = useRef(false); // l'appui a commencé sur le fond : seul cas où un clic sur le fond ferme la fiche (voir modalGuard.ts)
  const blocked = user.status === 'blocked';
  const mine = posts.filter(p => p.employee_id === user.id);
  const open = mine.filter(p => ['pending_start', 'active', 'pending_end'].includes(p.status));
  const day = todayMada();
  const today = mine.filter(p => p.date === day);
  const doneToday = today.filter(p => p.status === 'completed').length;
  const act = 'w-full min-h-[48px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold text-left cursor-pointer border transition-colors';
  const neutral = `${act} bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-100`;
  const sec = 'text-[11px] font-mono font-bold uppercase tracking-wide text-slate-400';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label={user.name} data-testid="operator-sheet"
      onPointerDown={e => { down.current = backdropDown(e.target, e.currentTarget); }}
      onClick={e => { const close = backdropShouldClose(down.current, e.target, e.currentTarget); down.current = false; if (close) onClose(); }}>
      <div className="w-full max-w-lg max-h-[calc(var(--vvh,100dvh)-57px-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-[#0f1722] border border-slate-700 shadow-2xl">
        {/* En-tête */}
        <div className="sticky top-0 z-10 flex items-center gap-3 p-4 bg-[#0f1722] border-b border-slate-700">
          <Avatar src={user.avatar_url} name={user.name} className="w-14 h-14 rounded-full ring-2 ring-slate-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-lg text-white leading-tight break-words">{user.name}</div>
            <div className="text-xs text-slate-400 break-words">@{user.username}{user.phone ? ` · ${user.phone}` : ''}</div>
            <div className="mt-1 text-xs"><LiveLine info={live} lang={lang} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Fermer', 'Close')} data-testid="operator-sheet-close" className="shrink-0 w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Identité */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className={`px-2 py-1 rounded font-bold border inline-flex items-center gap-1 ${user.shift === 'day' ? 'bg-amber-950/70 border-amber-600/40 text-amber-300' : 'bg-indigo-950/70 border-indigo-600/40 text-indigo-300'}`}>
              {effShift(user.shift, cfg.shift_mode) === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}{showShift(cfg) ? (user.shift === 'day' ? t('Jour', 'Day') : t('Nuit', 'Night')) : t('Horaires', 'Hours')} ({shiftHoursLabel(effShift(user.shift, cfg.shift_mode), cfg)})
            </span>
            <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 font-bold">{badgeLabel(user.performance_badge)}</span>
            <span className="text-emerald-400 font-bold">{formatScoreM(user.total_score_boosted)} {t('unités', 'units')}</span>
            {blocked && <span className="px-2 py-1 rounded bg-red-950 border border-red-700 text-red-300 font-bold" data-testid="sheet-blocked">{t('Compte bloqué', 'Account blocked')}</span>}
          </div>

          {/* Session */}
          <section className="space-y-2" aria-label={t('Session', 'Session')}>
            <div className={`${sec} flex items-center gap-1.5`}><Clock3 className="w-3.5 h-3.5" /> {t('Session', 'Session')}</div>
            <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-2 text-sm text-slate-200">
              <div data-testid="sheet-live-text">{liveText(live, lang)}</div>
              {open.length === 0 && <div className="text-slate-400 text-xs">{t('Aucune mission ouverte.', 'No open mission.')}</div>}
              {open.map(p => {
                const m = minutesSince(p, nowMs);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" data-testid={`sheet-open-${p.id}`}>
                    <span className="font-bold text-white break-words min-w-0">{p.client_name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200">{OPEN_LABEL[p.status]?.[lang] || p.status}</span>
                    {m !== null && p.status === 'active' && <span className="text-slate-400">{t('depuis', 'for')} {dur(m, lang)}</span>}
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                <div><span className="text-slate-500">{t('Missions aujourd\'hui', 'Missions today')}</span><div className="font-bold text-white">{today.length} · {doneToday} {t('validées', 'approved')}</div></div>
                {cfg.show_activity_column !== false && <div><span className="text-slate-500">{t('Connecté aujourd\'hui', 'Connected today')}</span><div className="font-bold text-white">{onlineSec ? formatDuration(onlineSec) : '—'}</div></div>}
              </div>
            </div>
            {chips && <div data-testid="sheet-chips">{chips}</div>}
          </section>

          {/* Voir */}
          <section className="space-y-2">
            <div className={sec}>{t('Voir', 'See')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={onProfile} className={neutral} data-testid="act-profile"><FileText className="w-5 h-5 text-cyan-300 shrink-0" /> {t('Profil et CV', 'Profile and CV')}</button>
              {onOpen && <button type="button" onClick={() => onOpen('operator')} className={neutral} data-testid="act-operator"><ExternalLink className="w-5 h-5 text-sky-300 shrink-0" /> {t('Page de l\'opérateur', 'Operator page')}</button>}
              {onOpen && <button type="button" onClick={() => onOpen('calendar')} className={neutral} data-testid="act-calendar"><CalendarDays className="w-5 h-5 text-emerald-300 shrink-0" /> {t('Son calendrier', 'Calendar')}</button>}
              {onOpen && <button type="button" onClick={() => onOpen('chat')} className={neutral} data-testid="act-chat"><MessageSquare className="w-5 h-5 text-violet-300 shrink-0" /> {t('Lui écrire', 'Message')}</button>}
            </div>
          </section>

          {/* Gérer */}
          <section className="space-y-2">
            <div className={`${sec} flex items-center gap-1.5`}><ListChecks className="w-3.5 h-3.5" /> {t('Gérer', 'Manage')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={onEdit} className={neutral} data-testid="act-edit"><UserCog className="w-5 h-5 text-amber-300 shrink-0" /> {t('Modifier la fiche', 'Edit details')}</button>
              <button type="button" onClick={onToggleBlock} data-testid="act-block"
                className={`${act} ${blocked ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white' : 'bg-amber-950 hover:bg-amber-900 border-amber-700 text-amber-300'}`}>
                {blocked ? <UserCheck className="w-5 h-5 shrink-0" /> : <Ban className="w-5 h-5 shrink-0" />} {blocked ? t('Débloquer le compte', 'Unblock account') : t('Bloquer le compte', 'Block account')}
              </button>
            </div>
            <label className="block text-xs text-slate-400">{t('Accès à l\'application', 'App access')}
              <select value={user.access_mode || 'auto'} onChange={e => onSetAccess(e.target.value as 'auto' | 'allow' | 'block')} data-testid="act-access"
                className="mt-1 w-full min-h-[46px] px-3 text-sm font-mono rounded-xl border bg-slate-800 text-slate-100 border-slate-600 cursor-pointer">
                <option value="auto">{t('Pendant ses horaires de travail', 'During work hours')}</option>
                <option value="allow">{t('À toute heure', 'At any time')}</option>
                <option value="block">{t('Bloqué', 'Blocked')}</option>
              </select>
            </label>
            {user.role !== 'admin' && (
              <div data-force-logout className="space-y-1.5 pt-1">
                {forcedAt > 0 ? (
                  <>
                    <div className="text-xs text-amber-300 font-mono">{t(`Déconnexion prévue à ${madaClock(forcedAt)}`, `Disconnect planned at ${madaClock(forcedAt)}`)}</div>
                    <button type="button" disabled={fBusy} data-force-cancel onClick={async () => { setFBusy(true); const r = await onCancelForce(); setFBusy(false); setFMsg(r.success ? null : (r.error || null)); }} className={neutral}>{t('Annuler la déconnexion', 'Cancel the disconnect')}</button>
                  </>
                ) : (
                  <>
                    <label className="block text-xs text-slate-400">{t('Déconnecter la personne', 'Disconnect the person')}
                      <select value={fMin} onChange={e => setFMin(Number(e.target.value))} data-force-minutes className="mt-1 w-full min-h-[46px] px-3 text-sm font-mono rounded-xl border bg-slate-800 text-slate-100 border-slate-600 cursor-pointer">
                        {[0, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m === 0 ? t('Tout de suite', 'Right now') : t(`Dans ${m} minutes`, `In ${m} minutes`)}</option>)}
                      </select>
                    </label>
                    {openMission && <div className="text-[11px] text-amber-300">{t('Une mission est en cours : elle est gardée, rien n\'est perdu. La personne pourra la reprendre à sa reconnexion.', 'A mission is open: it is kept, nothing is lost. The person can resume it after logging in again.')}</div>}
                    <button type="button" disabled={fBusy} data-force-go onClick={async () => { setFBusy(true); setFMsg(null); const r = await onForceLogout(fMin); setFBusy(false); setFMsg(r.success ? null : (r.error || null)); }} className={`${act} bg-red-950 hover:bg-red-900 border-red-700 text-red-300`}>{t('Déconnecter', 'Disconnect')}</button>
                  </>
                )}
                {fMsg && <div className="text-[11px] text-red-300">{fMsg}</div>}
              </div>
            )}
          </section>

          {/* Danger */}
          <section className="pt-3 border-t border-slate-700">
            <button type="button" onClick={onDelete} data-testid="act-delete" className={`${act} bg-red-950/80 hover:bg-red-900 border-red-800 text-red-300`}>
              <Trash2 className="w-5 h-5 shrink-0" /> {t('Supprimer le compte et ses données', 'Delete account and its data')}
            </button>
            <p className="mt-1.5 text-[11px] text-slate-500">{t('Irréversible : missions, messages et fichiers sont effacés. Une confirmation est demandée.', 'Irreversible: missions, messages and files are erased. A confirmation is asked.')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};
