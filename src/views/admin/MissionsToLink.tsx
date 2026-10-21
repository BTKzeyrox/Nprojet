import React, { useEffect, useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { clientChoices, missionsToLink, type MissionToLink } from '../../utils/clients';

// Outil « Rattacher les anciennes missions » (module 1, M1.5), dans la page Clients.
// Les anciennes missions n'ont qu'un titre en texte libre. Pour chaque titre, on propose le client de même nom (sans accents ni majuscules) ;
// l'admin confirme UNE ligne à la fois (aucun bouton « tout rattacher »). Les ventes passées restent au client choisi : l'histoire est figée.
const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const PAGE = 5;

export const MissionsToLink: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (db.getCurrentUser()?.role !== 'admin') return null; // réservé au responsable : un opérateur voit les missions mais jamais les clients
  const clients = db.getClients();
  const rows = missionsToLink(db.getContracts(), clients);
  const choices = clientChoices(clients);
  const byId = new Map(clients.map(c => [c.id, c.name]));
  if (rows.length === 0 && !notice) return null;

  const shown = showAll ? rows : rows.slice(0, PAGE);
  const nm = (n: number) => t(`${n} mission${n > 1 ? 's' : ''}`, `${n} mission${n > 1 ? 's' : ''}`);

  const attach = (row: MissionToLink, clientId: string) => {
    setError(''); setNotice('');
    const r = db.attachMissionsByName(row.text, clientId);
    if (!r.success) { setError(r.error || t('Rattachement impossible.', 'Could not link.')); return; }
    setNotice(t(`${nm(r.linked || 0)} rattachée${(r.linked || 0) > 1 ? 's' : ''} à « ${byId.get(clientId) || ''} ».`, `${nm(r.linked || 0)} linked to “${byId.get(clientId) || ''}”.`));
  };
  const createAndAttach = (row: MissionToLink) => {
    setError(''); setNotice('');
    const c = db.addClient({ name: row.text });
    if (!c.success) { setError(c.error === 'duplicate' ? t('Un client porte déjà ce nom (peut-être archivé) : choisis-le dans la liste.', 'A client already has this name (maybe archived): choose it in the list.') : t('Création impossible.', 'Could not create.')); return; }
    attach(row, c.id as string);
  };

  return (
    <div className={card} data-notranslate="">
      <div className="flex items-start gap-2">
        <Link2 aria-hidden="true" className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-white">{t('Missions à rattacher', 'Missions to link')}{rows.length > 0 ? ` (${rows.length})` : ''}</h2>
          <p className="text-[11px] text-slate-400">{t('Ces anciennes missions n\'ont pas encore de client. Confirme une ligne à la fois : les ventes passées resteront à ce client.', 'These old missions have no client yet. Confirm one line at a time: past sales will stay with that client.')}</p>
        </div>
      </div>
      {notice && <div role="status" className="text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
      {rows.length > 0 && (
        <ul>
          {shown.map(row => {
            const sug = row.suggestion.client_id;
            const chosen = pick[row.key] || '';
            return (
              <li key={row.key} className="border-t border-slate-800 first:border-t-0 py-2.5 space-y-2">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{row.text}</div>
                  <div className="text-[11px] text-slate-400">{nm(row.count)}{sug ? ` · ${t('même nom que', 'same name as')} « ${byId.get(sug) || ''} »` : row.suggestion.ambiguous ? ` · ${t('plusieurs clients portent ce nom', 'several clients have this name')}` : ` · ${t('aucun client de ce nom', 'no client with this name')}`}</div>
                </div>
                {sug && (
                  <button type="button" onClick={() => attach(row, sug)} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-3">
                    {t(`Rattacher à « ${byId.get(sug) || ''} »`, `Link to “${byId.get(sug) || ''}”`)}
                  </button>
                )}
                {!sug && !row.suggestion.ambiguous && (
                  <button type="button" onClick={() => createAndAttach(row)} className="w-full min-h-[44px] rounded-lg border border-emerald-600/60 text-emerald-300 text-sm font-semibold px-3 inline-flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" />{t(`Créer le client « ${row.text} » et rattacher`, `Create client “${row.text}” and link`)}
                  </button>
                )}
                <div className="flex gap-2">
                  <select value={chosen} onChange={e => setPick({ ...pick, [row.key]: e.target.value })} aria-label={t(`Choisir un autre client pour « ${row.text} »`, `Choose another client for “${row.text}”`)} className={field}>
                    <option value="">{sug ? t('Ou un autre client…', 'Or another client…') : t('Choisir un client…', 'Choose a client…')}</option>
                    {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" disabled={!chosen} onClick={() => attach(row, chosen)} className="min-h-[44px] shrink-0 rounded-lg border border-slate-600 text-slate-100 text-sm font-semibold px-3 disabled:opacity-40">{t('Rattacher', 'Link')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > PAGE && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm">
          {showAll ? t('Voir moins', 'Show less') : t(`Tout voir (${rows.length})`, `Show all (${rows.length})`)}
        </button>
      )}
    </div>
  );
};
