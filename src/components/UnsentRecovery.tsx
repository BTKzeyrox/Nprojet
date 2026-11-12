// « À récupérer » + avertissement « pas de code » (BTK, 2026-11-12). Deux bandeaux, en haut de l'écran :
//  1. Textes envoyés sans réseau que la page rechargée n'a pas pu garder (responsable sans code de coffre) : on les rend, avec « Copier » et « Ignorer ». Rien n'est renvoyé tout seul (pas de doublon).
//  2. Hors ligne sans code de coffre : explication claire que les envois ne sont gardés qu'en mémoire, avec le chemin pour créer le code.
// Utilisé par : App.tsx. Règles et stockage : utils/unsentCopy.ts. Contrôlé par `npm run check:unsent-copy`.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { bootRecover, dismissLeft, type Copy } from '../utils/unsentCopy';
import { openView } from './WorksheetShortcut';

const COL: Record<string, [string, string]> = { messages: ['Message', 'Message'], news: ['Publication', 'Post'], posts: ['Saisie', 'Entry'], sheets: ['Feuille', 'Sheet'], contracts: ['Mission', 'Mission'], clients: ['Client', 'Client'], stock: ['Stock', 'Stock'], products: ['Produit', 'Product'] };
export const UnsentRecovery: React.FC<{ uid: string }> = ({ uid }) => {
  const app = useApp(); const en = app.lang === 'en'; const L = app.theme === 'light'; const t = (fr: string, e: string) => (en ? e : fr);
  const [list, setList] = useState<Copy[]>([]);
  const [, force] = useState(0);
  useEffect(() => { setList(bootRecover(uid)); }, [uid]);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const st = db.getOfflineStatus();
  const noCodeWarning = (db.isDemoCut() || !navigator.onLine) && st.can_offline && st.needs_code;
  if (!list.length && !noCodeWarning) return null;
  const box = `rounded-2xl border p-3 text-sm shadow-lg ${L ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950 border-amber-700 text-amber-50'}`;
  const btn = `min-h-[40px] px-3 rounded-xl border text-sm font-semibold cursor-pointer ${L ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-600 text-slate-200'}`;
  const copy = async (c: Copy) => { try { await navigator.clipboard.writeText(c.text); } catch { /* le texte reste affiché : on peut le sélectionner */ } };
  return (
    <div className="fixed left-0 right-0 z-[55] px-3 space-y-2 pointer-events-none" style={{ top: 'calc(70px + env(safe-area-inset-top, 0px))' }} data-unsent-recovery>
      {noCodeWarning && (
        <div role="alert" className={`${box} pointer-events-auto max-w-xl mx-auto`} data-no-code-warning>
          <div className="flex items-start gap-2 font-semibold"><WifiOff className="w-5 h-5 shrink-0" /><span>{t('Pas de réseau et pas de code : ce que tu envoies n\'est gardé qu\'en mémoire.', 'No network and no code: what you send is only kept in memory.')}</span></div>
          <p className="mt-1 ml-7">{t('Si le téléphone recharge la page, ces envois peuvent être perdus. Crée ton code dans Réglages > Hors ligne pour les garder en sécurité.', 'If the phone reloads the page, these may be lost. Create your code in Settings > Offline to keep them safe.')}</p>
          <button type="button" className={`${btn} mt-2 ml-7`} onClick={() => openView('settings')}>{t('Ouvrir les Réglages', 'Open Settings')}</button>
        </div>
      )}
      {list.length > 0 && (
        <div role="status" className={`${box} pointer-events-auto max-w-xl mx-auto max-h-[50vh] overflow-y-auto`} data-recovered>
          <div className="flex items-start gap-2 font-semibold"><AlertTriangle className="w-5 h-5 shrink-0" /><span>{list.length > 1 ? t(`${list.length} textes non envoyés à récupérer`, `${list.length} unsent texts to recover`) : t('1 texte non envoyé à récupérer', '1 unsent text to recover')}</span></div>
          <p className="mt-1 ml-7">{t('La page s\'est rechargée avant l\'envoi. Copie le texte et renvoie-le : rien n\'est renvoyé tout seul.', 'The page reloaded before sending. Copy the text and send it again: nothing is sent automatically.')}</p>
          <ul className="mt-2 ml-7 space-y-2">
            {list.map(c => (
              <li key={c.key + c.at} className={`rounded-xl border p-2 ${L ? 'bg-white border-amber-200' : 'bg-black/30 border-amber-800'}`} data-recovered-item>
                <div className="text-[11px] opacity-70">{(COL[c.col] || [c.col, c.col])[en ? 1 : 0]} · {new Date(c.at).toLocaleString(en ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                <p className="whitespace-pre-wrap break-words select-text">{c.text}</p>
                <div className="mt-1 flex gap-2"><button type="button" className={btn} onClick={() => void copy(c)}>{t('Copier', 'Copy')}</button><button type="button" data-recovered-dismiss className={btn} onClick={() => setList(dismissLeft(uid, c))}>{t('Ignorer', 'Dismiss')}</button></div>
              </li>
            ))}
          </ul>
          {list.length > 1 && <button type="button" className={`${btn} mt-2 ml-7`} onClick={() => setList(dismissLeft(uid, 'all'))}>{t('Tout ignorer', 'Dismiss all')}</button>}
        </div>
      )}
    </div>
  );
};
