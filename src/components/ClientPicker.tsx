import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { clientChoices, normalizeName } from '../utils/clients';

// Choix du client d'une mission (module 1, M1.5) : liste des clients actifs + création rapide « Nouveau client ».
// Réservé au responsable : un opérateur ne reçoit jamais la liste des clients (le serveur ne l'envoie pas) ; on n'affiche alors rien.
// `value` = identifiant de la fiche ('' = aucun). `onChange` reçoit aussi le nom du client, pour préremplir un titre vide.
interface Props {
  value: string;
  onChange: (id: string, name: string) => void;
  required?: boolean;
  error?: string | null; // message à afficher sous le champ (ex. « Choisis le client… »)
  inputClass?: string; // classes du champ, pour s'accorder au fond du formulaire (clair ou sombre)
  labelClass?: string;
  hintClass?: string;
}

const DARK_INPUT = 'w-full min-h-[44px] rounded-2xl border border-slate-600 bg-[#0a1424] px-4 py-2.5 text-sm text-white';
const QUICK_ERRORS: Record<string, [string, string]> = {
  name: ['Écris le nom du client.', 'Enter the client\'s name.'],
  duplicate: ['Un client porte déjà ce nom : choisis-le dans la liste.', 'A client already has this name: pick it from the list.'],
  admin: ['Réservé au responsable.', 'Admins only.'],
};

export const ClientPicker: React.FC<Props> = ({ value, onChange, required, error, inputClass = DARK_INPUT, labelClass = 'block text-xs font-semibold mb-1.5 opacity-70', hintClass = 'text-[11px] opacity-60 mt-1' }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [filter, setFilter] = useState('');
  const [quick, setQuick] = useState(false);
  const [qName, setQName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qErr, setQErr] = useState('');
  if (db.getCurrentUser()?.role !== 'admin') return null;

  const clients = db.getClients();
  const all = clientChoices(clients, value);
  const f = normalizeName(filter);
  // Le client déjà choisi reste toujours dans la liste, même si le filtre ne le montre pas
  const choices = f ? all.filter(c => normalizeName(c.name).includes(f) || c.id === value) : all;

  const create = () => {
    const name = qName.trim();
    const r = db.addClient({ name, phone: qPhone.trim() });
    if (!r.success) {
      if (r.error === 'duplicate') {
        const same = clients.find(c => normalizeName(c.name) === normalizeName(name));
        if (same && same.active !== false) { onChange(same.id, same.name); setQuick(false); setQName(''); setQPhone(''); setQErr(''); return; } // même nom : on prend la fiche qui existe
      }
      const m = QUICK_ERRORS[r.error || ''];
      setQErr(m ? t(m[0], m[1]) : t('Création impossible.', 'Could not create.'));
      return;
    }
    onChange(r.id as string, name);
    setQuick(false); setQName(''); setQPhone(''); setQErr('');
  };

  return (
    <div data-notranslate="">
      <label className={labelClass} htmlFor="client-picker-select">{t('Client', 'Client')}{required ? <span className="text-rose-400"> *</span> : <span className="opacity-70"> ({t('facultatif', 'optional')})</span>}</label>
      {all.length > 8 && (
        <input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('Chercher un client…', 'Search a client…')} aria-label={t('Chercher un client', 'Search a client')} className={`${inputClass} mb-2`} />
      )}
      <select id="client-picker-select" value={value} onChange={e => { const c = clients.find(x => x.id === e.target.value); onChange(e.target.value, c ? c.name : ''); }} aria-invalid={!!error} className={inputClass}>
        <option value="">{all.length === 0 ? t('Aucun client : crée le premier ci-dessous', 'No client: create the first one below') : t('— Choisir un client —', '— Choose a client —')}</option>
        {choices.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ` · ${t('archivé', 'archived')}` : ''}</option>)}
      </select>
      {error && <div role="alert" className="text-xs text-rose-500 font-semibold mt-1.5">{error}</div>}
      {!quick ? (
        <button type="button" onClick={() => { setQuick(true); setQErr(''); }} className="mt-2 min-h-[44px] px-3 rounded-xl border border-emerald-600/60 text-emerald-500 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-500/10">
          <Plus className="w-4 h-4" />{t('Nouveau client', 'New client')}
        </button>
      ) : (
        <div className="mt-2 rounded-2xl border border-emerald-600/40 p-3 space-y-2">
          <div className="text-xs font-semibold">{t('Nouveau client (tu pourras compléter sa fiche dans la page Clients)', 'New client (you can complete its record in the Clients page)')}</div>
          <input autoFocus value={qName} maxLength={80} onChange={e => setQName(e.target.value)} placeholder={t('Nom du client', 'Client name')} aria-label={t('Nom du client', 'Client name')} className={inputClass} />
          <input value={qPhone} maxLength={40} inputMode="tel" onChange={e => setQPhone(e.target.value)} placeholder={t('Téléphone (facultatif)', 'Phone (optional)')} aria-label={t('Téléphone', 'Phone')} className={inputClass} />
          {qErr && <div role="alert" className="text-xs text-rose-500 font-semibold">{qErr}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setQuick(false); setQErr(''); }} className="min-h-[44px] rounded-xl border border-slate-500/60 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
            <button type="button" onClick={create} className="min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Créer et choisir', 'Create and choose')}</button>
          </div>
        </div>
      )}
      <p className={hintClass}>{t('Le client sert aux factures et aux statistiques. Les anciennes missions se rattachent dans la page Clients.', 'The client is used for invoices and statistics. Old missions are linked in the Clients page.')}</p>
    </div>
  );
};
