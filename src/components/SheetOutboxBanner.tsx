// Feuilles du jour gardées sur le téléphone (M27.9) : « N feuille(s) en attente » + « Envoyer maintenant », et les feuilles refusées au renvoi avec la raison écrite.
// Utilisé par : views/WorksheetView.tsx. Règles : utils/sheetOutbox.ts. Données : db.getSheetOutbox / sendSheets / sheetRequeue / sheetDiscard. Rien n'est retiré sans la demande de la personne.
import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';

const dmy = (d: string) => d.split('-').reverse().join('/');
export const SheetOutboxBanner: React.FC = () => {
  const app = useApp(); const L = app.theme === 'light'; const en = app.lang === 'en'; const t = (fr: string, e: string) => (en ? e : fr);
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const box = db.getSheetOutbox(en ? 'en' : 'fr');
  if (box.pending === 0 && box.review === 0) return null;
  const pending = box.items.filter(i => i.state === 'pending'), review = box.items.filter(i => i.state === 'review');
  const send = async () => { setBusy(true); await db.sendSheets(true); setBusy(false); };
  const btn = `min-h-[44px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`;
  return (
    <div className="space-y-2" data-sheet-outbox>
      {pending.length > 0 && (
        <div role="status" data-sheet-outbox-pending className={`rounded-2xl border p-3 text-sm ${L ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950 border-amber-800 text-amber-100'}`}>
          <div className="flex items-start gap-2 font-semibold"><Clock className="w-5 h-5 shrink-0" /><span>{pending.length} {pending.length > 1 ? t('feuilles en attente', 'sheets waiting') : t('feuille en attente', 'sheet waiting')} {t("d'envoi (", 'to send (')}{box.lines} {box.lines > 1 ? t('lignes', 'lines') : t('ligne', 'line')})</span></div>
          <ul className="mt-1 ml-7 list-disc">{pending.map(i => <li key={i.id}>{i.type || t('Feuille', 'Sheet')} · {dmy(i.date)} · {i.lines} {i.lines > 1 ? t('lignes', 'lines') : t('ligne', 'line')}</li>)}</ul>
          <p className="mt-1 ml-7">{t('Elles partent toutes seules au retour du réseau, une seule fois.', 'They are sent by themselves when the network is back, once only.')}</p>
          <button type="button" data-sheet-outbox-send disabled={busy} onClick={send} className={`${btn} mt-2 ml-7 disabled:opacity-60`}>{busy ? t('Envoi…', 'Sending…') : t('Envoyer maintenant', 'Send now')}</button>
        </div>
      )}
      {review.map(i => (
        <div key={i.id} role="alert" data-sheet-outbox-review className={`rounded-2xl border p-3 text-sm ${L ? 'bg-red-50 border-red-200 text-red-900' : 'bg-red-950 border-red-800 text-red-100'}`}>
          <div className="flex items-start gap-2 font-semibold"><AlertTriangle className="w-5 h-5 shrink-0" /><span>{t('À revoir', 'To review')} : {i.type || t('Feuille', 'Sheet')} · {dmy(i.date)} · {i.lines} {i.lines > 1 ? t('lignes', 'lines') : t('ligne', 'line')}</span></div>
          <p className="mt-1 ml-7" data-sheet-outbox-reason>{i.reason}</p>
          <p className="mt-1 ml-7">{t("Rien n'est perdu : la feuille reste ici tant que tu ne la retires pas.", 'Nothing is lost: the sheet stays here until you remove it.')}</p>
          <div className="mt-2 ml-7 flex flex-wrap gap-2">
            <button type="button" data-sheet-outbox-retry onClick={() => db.sheetRequeue(i.id)} className={btn}>{t('Renvoyer', 'Send again')}</button>
            <button type="button" data-sheet-outbox-discard onClick={() => { if (window.confirm(t('Retirer cette feuille de la liste ? Elle ne sera pas enregistrée.', 'Remove this sheet from the list? It will not be saved.'))) db.sheetDiscard(i.id); }} className={btn}>{t('Retirer', 'Remove')}</button>
          </div>
        </div>
      ))}
    </div>
  );
};
