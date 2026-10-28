import React, { useEffect, useState } from 'react';
import { X, WifiOff, Wifi, Clock, AlertTriangle, Copy, RotateCcw, Trash2, Undo2, Lock } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { REVIEW_TEXT, type OfflineOp, type ReviewCode } from '../utils/offline';
import { actionLabel, collectionLabel, copyLine, pick } from '../utils/offlineText';
import { askConfirm } from './ConfirmModal';
import { showToast } from './ToastHost';
import { PinForm } from './OfflinePin';

const EVENT = 'df:offline-center';
/** Ouvre la fenêtre « Hors ligne » (actions en attente et à revoir). */
export const openOfflineCenter = (tab: 'pending' | 'review' = 'pending') => window.dispatchEvent(new CustomEvent(EVENT, { detail: { tab } }));

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* repli ci-dessous */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

const when = (iso: string | undefined, lang: string): string => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export const OfflineCenter: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'pending' | 'review'>('pending');
  const [, force] = useState(0);
  const [connDown, setConnDown] = useState(false);
  useEffect(() => db.onConnection(setConnDown), []);
  useEffect(() => {
    const on = (e: Event) => { setTab(((e as CustomEvent).detail?.tab as 'pending' | 'review') || 'pending'); setOpen(true); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const off = db.subscribe(() => force(n => n + 1));
    const id = setInterval(() => force(n => n + 1), 1000);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => { off(); clearInterval(id); window.removeEventListener('keydown', key); };
  }, [open]);
  if (!open) return null;
  const down = connDown || db.isDemoCut() || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return <OfflineCenterView tab={tab} onTab={setTab} onClose={() => setOpen(false)} down={down} refresh={() => force(n => n + 1)} />;
};

/** Le contenu de la fenêtre (séparé pour pouvoir l'essayer sans écran réel). */
export const OfflineCenterView: React.FC<{ tab: 'pending' | 'review'; onTab: (t: 'pending' | 'review') => void; onClose: () => void; down: boolean; refresh: () => void }> = ({ tab, onTab, onClose, down, refresh }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  useLockBodyScroll(true);
  const st = db.getOfflineStatus();
  const un = db.getUnsent();
  const review = st.review;
  const cancel = (col: string, id: string) => askConfirm({
    title: t('Annuler cette modification ?', 'Cancel this change?'),
    message: t('L\'élément revient à la dernière version connue du serveur. Ce que tu as fait ici sera perdu.', 'The item goes back to the last version known by the server. What you did here will be lost.'),
    confirmLabel: t('Annuler la modification', 'Cancel the change'), cancelLabel: t('Garder', 'Keep'), danger: true,
    onConfirm: () => { db.offlineCancelUnsent(col, id); refresh(); },
  });
  const resend = (op: OfflineOp) => askConfirm({
    title: t('Renvoyer ta version ?', 'Send your version again?'),
    message: t('Ta version remplacera celle qui est sur le serveur.', 'Your version will replace the one on the server.'),
    confirmLabel: t('Renvoyer', 'Send again'), cancelLabel: t('Annuler', 'Cancel'),
    onConfirm: () => { if (!db.offlineRequeue(op.id)) showToast(t('Impossible de renvoyer cet élément.', 'Cannot send this item again.'), 'error'); refresh(); },
  });
  const drop = (op: OfflineOp) => askConfirm({
    title: t('Supprimer cet élément ?', 'Delete this item?'),
    message: t('Il ne sera plus gardé nulle part. Copie son texte avant si tu veux le garder.', 'It will no longer be kept anywhere. Copy its text first if you want to keep it.'),
    confirmLabel: t('Supprimer', 'Delete'), cancelLabel: t('Garder', 'Keep'), danger: true,
    onConfirm: () => { db.offlineDiscard(op.id); refresh(); },
  });
  const copy = async (op: OfflineOp) => { const text = db.offlineCopyText(op.id, lang) || ''; showToast((await copyToClipboard(text)) ? t('Texte copié.', 'Text copied.') : t('Copie impossible : sélectionne le texte à la main.', 'Copy failed: select the text by hand.'), 'info'); };

  const tabBtn = (id: 'pending' | 'review', label: string, n: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)} className={`flex-1 px-3 py-2 rounded-full border text-sm font-semibold cursor-pointer ${tab === id ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-200'}`}>{label} ({n})</button>
  );
  const btn = 'px-3 py-2 rounded-full border text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5';

  return (
    <div className="fixed inset-0 z-[105] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-3" onClick={() => onClose()} role="dialog" aria-modal="true" aria-label={t('Hors ligne', 'Offline')} data-testid="offline-center">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0d1624] border border-slate-600 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-slate-100" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          {down ? <WifiOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" /> : <Wifi className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <h3 className="font-tactical font-bold text-base leading-snug">{t('Travail hors ligne', 'Offline work')}</h3>
            <p className="text-[11px] text-slate-400">{down ? t('Pas de réseau pour l\'instant.', 'No network right now.') : t('Le réseau est là.', 'The network is available.')} {copyLine(st, lang)}</p>
          </div>
          <button type="button" onClick={() => onClose()} aria-label={t('Fermer', 'Close')} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {st.locked && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3 space-y-2">
            <p className="text-sm text-amber-100 flex items-center gap-2"><Lock className="w-4 h-4 shrink-0" />{t('Copie verrouillée. Entre ton code pour garder ton travail sur cet appareil.', 'Copy locked. Enter your code to keep your work on this device.')}</p>
            <PinForm mode="unlock" />
          </div>
        )}

        <div role="tablist" className="flex gap-2">{tabBtn('pending', t('En attente', 'Waiting'), un.count)}{tabBtn('review', t('À revoir', 'To review'), review.length)}</div>

        {tab === 'pending' && (
          <div className="space-y-2" role="tabpanel">
            {un.count === 0 && <p className="text-sm text-slate-300">{t('Rien n\'attend : tout est envoyé.', 'Nothing is waiting: everything is sent.')}</p>}
            {un.items.map(i => (
              <div key={i.key} className="rounded-xl border border-slate-700 bg-[#0f1722] p-3 space-y-1.5" data-testid="unsent-item">
                <div className="flex items-center gap-2 text-xs text-slate-300"><Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" /><span className="font-semibold">{collectionLabel(i.col, lang)}</span><span>· {actionLabel(i.action, i.created, lang)}</span></div>
                {i.text && <p className="text-sm text-slate-100 break-words line-clamp-3">{i.text}</p>}
                {!i.kept && <p className="text-[11px] text-amber-300">{st.can_offline && st.needs_code ? t('Seulement en mémoire : crée ton code dans Réglages pour le garder sur l\'appareil.', 'In memory only: create your code in Settings to keep it on the device.') : t('Seulement en mémoire : ne ferme pas l\'appli avant l\'envoi.', 'In memory only: do not close the app before it is sent.')}</p>}
                <button type="button" onClick={() => cancel(i.col, i.id)} className={`${btn} border-slate-600 text-slate-200`}><Undo2 className="w-3.5 h-3.5" />{t('Annuler la modification', 'Cancel the change')}</button>
              </div>
            ))}
            {un.count > 0 && <button type="button" onClick={() => db.retryNow()} className={`${btn} bg-blue-600 border-blue-500 text-white`}><RotateCcw className="w-3.5 h-3.5" />{t('Réessayer maintenant', 'Try now')}</button>}
          </div>
        )}

        {tab === 'review' && (
          <div className="space-y-2" role="tabpanel">
            {review.length === 0 && <p className="text-sm text-slate-300">{t('Rien à revoir.', 'Nothing to review.')}</p>}
            {review.length > 0 && <p className="text-[11px] text-slate-400">{t('Le serveur a gardé sa version. Ton travail est ici : copie-le, renvoie-le ou supprime-le.', 'The server kept its version. Your work is here: copy it, send it again or delete it.')}</p>}
            {review.map(op => {
              const code = (op.review_code || 'refused') as ReviewCode;
              return (
                <div key={op.id} className="rounded-xl border border-amber-500/40 bg-[#0f1722] p-3 space-y-1.5" data-testid="review-item">
                  <div className="flex items-center gap-2 text-xs text-amber-200"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span className="font-semibold">{op.collection ? collectionLabel(op.collection, lang) : op.route || ''}</span><span className="text-slate-400">· {when(op.created_at, lang)}</span></div>
                  <p className="text-sm text-slate-200">{pick(REVIEW_TEXT[code] || REVIEW_TEXT.refused, lang)}</p>
                  {op.review_note && <p className="text-[11px] text-slate-400">{t('Raison du serveur : ', 'Server reason: ')}{op.review_note}</p>}
                  {op.text && <p className="text-sm text-slate-100 bg-black/20 rounded-lg p-2 break-words whitespace-pre-wrap line-clamp-6">{op.text}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copy(op)} className={`${btn} border-slate-600 text-slate-200`}><Copy className="w-3.5 h-3.5" />{t('Copier', 'Copy')}</button>
                    {op.kind === 'record' && <button type="button" onClick={() => resend(op)} className={`${btn} bg-blue-600 border-blue-500 text-white`}><RotateCcw className="w-3.5 h-3.5" />{t('Renvoyer', 'Send again')}</button>}
                    <button type="button" onClick={() => drop(op)} className={`${btn} border-red-500/60 text-red-300`}><Trash2 className="w-3.5 h-3.5" />{t('Supprimer', 'Delete')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
