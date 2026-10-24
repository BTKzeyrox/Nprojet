import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '../../db/store';
import { useApp } from '../../context/AppContext';
import { useLockBodyScroll } from '../../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../../utils/formatUtils';
import { todayMada } from '../../utils/stats';
import { readCompany } from '../../utils/companyRules';
import {
  CLIENT_LIMITS, CLIENT_STATUS_LABEL, clientMissionsFromPosts, clientReceived, clientThresholds, countByStatus, filterClients, summarizeClients,
  type ClientDraft, type ClientSort, type ClientStatus,
} from '../../utils/clients';
import type { Client } from '../../types';
import { MissionsToLink } from './MissionsToLink';
import { computeClientBadges } from '../../utils/clientBadges';
import { ClientBadgeChips, ClientRelationCard } from '../../components/ClientBadges';

// Page « Clients » (responsable seulement) : liste, fiche, création, modification, archivage.
// Le statut (Nouveau, Régulier, Stratégique, Inactif…) n'est JAMAIS saisi : il se calcule avec les missions validées (src/utils/clients.ts)
// et les seuils de Réglages > Conditions. Le serveur ne renvoie aucun client à un opérateur.

interface Editor { id?: string; name: string; contact: string; phone: string; email: string; address: string; note: string; terms: string; price: string; types: { type: string; price: string }[] }

const field = 'w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-white';
const card = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const TONE: Record<ClientStatus, string> = {
  prospect: 'bg-slate-700 text-slate-100', active: 'bg-slate-700 text-slate-100', new: 'bg-sky-800 text-sky-100',
  regular: 'bg-emerald-800 text-emerald-100', strategic: 'bg-amber-700 text-amber-50', inactive: 'bg-rose-800 text-rose-100',
};
const STATUS_ORDER: ClientStatus[] = ['strategic', 'regular', 'new', 'active', 'prospect', 'inactive'];

const emptyEditor = (): Editor => ({ name: '', contact: '', phone: '', email: '', address: '', note: '', terms: '', price: '', types: [] });
const toEditor = (c: Client): Editor => ({
  id: c.id, name: c.name, contact: c.contact_name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', note: c.note || '',
  terms: c.payment_terms_days !== undefined ? String(c.payment_terms_days) : '', price: c.price_default_ar !== undefined ? String(c.price_default_ar) : '',
  types: Object.entries(c.price_by_type || {}).map(([type, price]) => ({ type, price: String(price) })),
});

export const ClientsPage: React.FC<{ initialOpen?: string }> = ({ initialOpen }) => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [ver, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all' | 'archived' | 'attention'>('all');
  const [sort, setSort] = useState<ClientSort>('status');
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null); // `initialOpen` : seulement pour le contrôle automatique
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useLockBodyScroll(!!editor);

  const today = todayMada();
  const data = useMemo(() => {
    const clients = db.getClients();
    const settings = db.getSettings();
    const company = readCompany(settings.company);
    const prices = { client_price_default_ar: settings.client_price_default_ar, client_prices_by_type: settings.client_prices_by_type };
    const missions = clientMissionsFromPosts(db.getPosts(), db.getContracts(), clients, prices);
    const summaries = summarizeClients(clients, missions, today, clientThresholds(company));
    const perf = computeClientBadges({ clients, summaries, missions, invoices: db.getInvoices(), cash: db.getCash(), today }); // badges et score de relation (module 3)
    return { clients, summaries, perf, money: clientReceived(db.getCash(), clients), company, types: settings.post_types || [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, today]);
  const { clients, summaries, perf, money, company, types } = data;

  const counts = useMemo(() => countByStatus(clients, summaries), [clients, summaries]);
  const attentionCount = useMemo(() => clients.filter(c => c.active !== false && (perf.clients.get(c.id)?.attention.length || 0) > 0).length, [clients, perf]);
  const rows = useMemo(() => {
    if (status !== 'attention') return filterClients(clients, summaries, { q, status, sort });
    return filterClients(clients, summaries, { q, status: 'all', sort }).filter(c => (perf.clients.get(c.id)?.attention.length || 0) > 0);
  }, [clients, summaries, perf, q, status, sort]);
  const revenue12 = useMemo(() => clients.filter(c => c.active !== false).reduce((n, c) => n + (summaries.get(c.id)?.revenue_12m || 0), 0), [clients, summaries]);
  const ar = (n: number) => formatCurrencyAr(n);
  const lbl = (s: ClientStatus) => (lang === 'en' ? CLIENT_STATUS_LABEL[s].en : CLIENT_STATUS_LABEL[s].fr);

  const errors: Record<string, [string, string]> = {
    name: ['Écris le nom du client.', 'Enter the client name.'], email: ['E-mail invalide (exemple : nom@societe.mg).', 'Invalid e-mail (example: name@company.mg).'],
    terms: ['Échéance invalide : un nombre de jours entre 0 et 365.', 'Invalid deadline: a number of days between 0 and 365.'], price: ['Prix invalide.', 'Invalid price.'],
    price_by_type: ['Une exception de prix est incomplète ou invalide (type et prix à remplir).', 'A price exception is incomplete or invalid (fill in the type and the price).'],
    duplicate: ['Un client porte déjà ce nom.', 'A client already has this name.'], missing: ['Cette fiche n\'existe plus.', 'This record no longer exists.'],
    in_use: ['Ce client a des missions : désactive-le (bouton Archiver) au lieu de le supprimer.', 'This client has missions: deactivate it (Archive button) instead of deleting it.'],
    admin: ['Réservé au responsable.', 'Admins only.'],
  };
  const say = (code?: string) => { const m = errors[code || ''] || ['Impossible d\'enregistrer.', 'Could not save.']; return t(m[0], m[1]); };

  const newClient = () => { setError(''); setConfirmId(null); setEditor(emptyEditor()); };
  const editClient = (c: Client) => { setError(''); setConfirmId(null); setEditor(toEditor(c)); };
  const save = () => {
    if (!editor) return;
    const draft: ClientDraft = { name: editor.name, contact_name: editor.contact, phone: editor.phone, email: editor.email, address: editor.address, note: editor.note, payment_terms_days: editor.terms, price_default: editor.price, price_by_type: editor.types };
    const r = editor.id ? db.updateClient(editor.id, draft) : db.addClient(draft);
    if (!r.success) { setError(say(r.error)); return; }
    if (!editor.id) { const id = (r as { id?: string }).id; if (id) setOpenId(id); }
    setEditor(null); setError('');
  };
  const archive = (c: Client, active: boolean) => { const r = db.setClientActive(c.id, active); if (!r.success) setError(say(r.error)); else { setError(''); setOpenId(null); } };
  const remove = (id: string) => { const r = db.deleteClient(id); setConfirmId(null); if (!r.success) setError(say(r.error)); else { setError(''); setOpenId(null); } };

  const tile = (label: string, value: string, tone: string) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-base font-bold truncate ${tone}`}>{value}</div>
    </div>
  );
  const chip = (active: boolean) => `min-h-[40px] rounded-lg text-sm font-semibold border px-3 ${active ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300'}`;
  const since = (days: number | null) => (days === null ? '' : days === 0 ? t('dernière mission aujourd\'hui', 'last mission today') : t(`dernière mission il y a ${days} j`, `last mission ${days} d ago`));
  const termsOf = (c: Client) => (c.payment_terms_days !== undefined ? { v: c.payment_terms_days, own: true } : { v: company.billing.payment_days, own: false });

  return (
    <div className="space-y-3 max-w-3xl mx-auto" {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
      <div className={card}>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-white">{t('Clients', 'Clients')}</h1>
          <p className="text-[11px] text-slate-400">{t('Le statut de chaque client se calcule tout seul avec ses missions validées. Les seuils se règlent dans Réglages > Conditions.', 'Each client\'s status is calculated automatically from its validated missions. Thresholds are set in Settings > Conditions.')}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tile(t('Clients', 'Clients'), String(counts.all), 'text-white')}
          {tile(t('Stratégiques', 'Strategic'), String(counts.strategic), 'text-amber-300')}
          {tile(t('Inactifs', 'Inactive'), String(counts.inactive), counts.inactive > 0 ? 'text-rose-400' : 'text-emerald-400')}
          {tile(t('Chiffre d\'affaires (12 mois)', 'Revenue (12 months)'), ar(revenue12), 'text-sky-300')}
        </div>
        <button type="button" onClick={newClient} className="w-full min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />{t('Nouveau client', 'New client')}</button>
      </div>

      <MissionsToLink />

      <div className={card}>
        <label className="relative block">
          <span className="sr-only">{t('Rechercher un client', 'Search a client')}</span>
          <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Nom, contact, téléphone, e-mail…', 'Name, contact, phone, e-mail…')} className={`${field} pl-9`} />
        </label>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Filtrer par statut', 'Filter by status')}>
          <button type="button" role="tab" aria-selected={status === 'all'} onClick={() => setStatus('all')} className={chip(status === 'all')}>{t('Tous', 'All')} ({counts.all})</button>
          {attentionCount > 0 && <button type="button" role="tab" aria-selected={status === 'attention'} onClick={() => setStatus('attention')} className={chip(status === 'attention')}>{t('Points d\'attention', 'Needs attention')} ({attentionCount})</button>}
          {STATUS_ORDER.map(s => (
            <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={chip(status === s)}>{lbl(s)} ({counts[s]})</button>
          ))}
          {counts.archived > 0 && <button type="button" role="tab" aria-selected={status === 'archived'} onClick={() => setStatus('archived')} className={chip(status === 'archived')}>{t('Archivés', 'Archived')} ({counts.archived})</button>}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as ClientSort)} className={field} aria-label={t('Trier', 'Sort')}>
          <option value="status">{t('Tri : à surveiller d\'abord', 'Sort: needs attention first')}</option>
          <option value="revenue">{t('Tri : chiffre d\'affaires', 'Sort: revenue')}</option>
          <option value="recent">{t('Tri : dernière mission', 'Sort: last mission')}</option>
          <option value="name">{t('Tri : nom (A à Z)', 'Sort: name (A to Z)')}</option>
        </select>
        {error && !editor && <div role="alert" className="text-sm text-rose-300">{error}</div>}

        {clients.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun client pour l\'instant. Ajoute le premier avec « Nouveau client ».', 'No clients yet. Add the first one with “New client”.')}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 text-center">{t('Aucun client ne correspond à ta recherche.', 'No client matches your search.')}</div>
        ) : (
          <ul>
            {rows.map(c => {
              const s = summaries.get(c.id)!;
              const m = money.get(c.id)!;
              const open = openId === c.id;
              const terms = termsOf(c);
              const remaining = Math.max(0, s.revenue_total - m.received);
              return (
                <li key={c.id} className="border-t border-slate-800 first:border-t-0">
                  <button type="button" aria-expanded={open} onClick={() => { setOpenId(open ? null : c.id); setConfirmId(null); setError(''); }} className="w-full min-h-[56px] py-2 flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{c.name}{c.active === false && <span className="text-slate-500"> · {t('archivé', 'archived')}</span>}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {t(`${s.missions_total} mission${s.missions_total > 1 ? 's' : ''}`, `${s.missions_total} mission${s.missions_total > 1 ? 's' : ''}`)}
                        {s.revenue_12m > 0 ? ` · ${ar(s.revenue_12m)} ${t('sur 12 mois', 'over 12 months')}` : ''}
                        {s.days_since_last !== null ? ` · ${since(s.days_since_last)}` : ''}
                      </div>
                      {(perf.clients.get(c.id)?.badges.length || 0) > 0 && <div className="mt-1"><ClientBadgeChips badges={perf.clients.get(c.id)!.badges} lang={lang} /></div>}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 max-w-[45%]">
                      {s.statuses.map(st => <span key={st} className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[st]}`}>{lbl(st)}</span>)}
                    </div>
                  </button>
                  {open && (
                    <div className="pb-3 space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.phone && <a href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center gap-1.5"><Phone className="w-4 h-4" />{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center gap-1.5 break-all"><Mail className="w-4 h-4 shrink-0" />{c.email}</a>}
                      </div>
                      {(c.contact_name || c.address) && (
                        <div className="text-sm text-slate-200 space-y-0.5">
                          {c.contact_name && <div>{t('Contact', 'Contact')} : <b>{c.contact_name}</b></div>}
                          {c.address && <div className="flex items-start gap-1.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /><span className="break-words">{c.address}</span></div>}
                        </div>
                      )}
                      {c.note && <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{c.note}</p>}

                      <div className="grid grid-cols-2 gap-2">
                        {tile(t('Missions validées', 'Validated missions'), `${s.missions_total} (${s.missions_window} ${t(`sur ${company.clients.regular_months} mois`, `in ${company.clients.regular_months} mo`)})`, 'text-white')}
                        {tile(t('Facturé (total)', 'Billed (total)'), ar(s.revenue_total), 'text-sky-300')}
                        {tile(t('Reçu', 'Received'), ar(m.received), 'text-emerald-400')}
                        {tile(t('Reste à encaisser', 'Left to collect'), ar(remaining), remaining > 0 ? 'text-amber-300' : 'text-emerald-400')}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {t('Facturé = missions validées × prix du client. Reçu = paiements des Finances qui portent le même nom de client', 'Billed = validated missions × the client\'s price. Received = Finance payments with the same client name')}
                        {m.last_date ? ` (${t('dernier le', 'last on')} ${fmtDate(m.last_date)})` : ''}.
                      </p>

                      <div className="text-sm text-slate-200 space-y-0.5">
                        <div>{t('Délai de paiement', 'Payment deadline')} : <b>{terms.v > 0 ? t(`${terms.v} jours`, `${terms.v} days`) : t('comptant', 'immediate')}</b>{!terms.own && <span className="text-slate-500"> ({t('réglage de l\'entreprise', 'company setting')})</span>}</div>
                        <div>{t('Prix par défaut', 'Default price')} : <b>{c.price_default_ar !== undefined ? ar(c.price_default_ar) : t('celui des Réglages', 'the Settings price')}</b></div>
                        {Object.entries(c.price_by_type || {}).map(([k, v]) => <div key={k} className="text-slate-300">· {k} : <b>{ar(v)}</b></div>)}
                        {s.first_date && <div>{t('Première mission', 'First mission')} : <b>{fmtDate(s.first_date)}</b></div>}
                      </div>

                      {perf.clients.get(c.id) && <ClientRelationCard p={perf.clients.get(c.id)!} cfg={perf.cfg} lang={lang} />}

                      <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2 space-y-1">
                        {s.statuses.map(st => <div key={st} className="text-[12px] text-slate-300"><span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mr-1.5 ${TONE[st]}`}>{lbl(st)}</span>{lang === 'en' ? CLIENT_STATUS_LABEL[st].help_en : CLIENT_STATUS_LABEL[st].help_fr}</div>)}
                        {s.missions_total === 0 && <div className="text-[11px] text-slate-400">{t('Aucune mission validée n\'est liée à ce client pour l\'instant.', 'No validated mission is linked to this client yet.')}</div>}
                      </div>

                      {error && openId === c.id && <div role="alert" className="text-sm text-rose-300">{error}</div>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => editClient(c)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5"><Pencil className="w-4 h-4" />{t('Modifier', 'Edit')}</button>
                        {c.active === false
                          ? <button type="button" onClick={() => archive(c, true)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5"><ArchiveRestore className="w-4 h-4" />{t('Réactiver', 'Reactivate')}</button>
                          : <button type="button" onClick={() => archive(c, false)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5"><Archive className="w-4 h-4" />{t('Archiver', 'Archive')}</button>}
                        {confirmId === c.id ? (
                          <>
                            <button type="button" onClick={() => remove(c.id)} className="min-h-[44px] px-3 rounded-lg bg-rose-700 text-white text-sm font-semibold">{t('Supprimer la fiche', 'Delete the record')}</button>
                            <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm">{t('Non', 'No')}</button>
                          </>
                        ) : (
                          <button type="button" aria-label={t('Supprimer', 'Delete')} onClick={() => setConfirmId(c.id)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 hover:text-rose-300 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editor && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setEditor(null)} {...(lang === 'en' ? { 'data-notranslate': '' } : {})}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">{editor.id ? t('Modifier le client', 'Edit client') : t('Nouveau client', 'New client')}</h2>
              <button type="button" aria-label={t('Fermer', 'Close')} onClick={() => setEditor(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs text-slate-400">{t('Nom du client (raison sociale)', 'Client name (company name)')}
              <input autoFocus value={editor.name} maxLength={CLIENT_LIMITS.name} onChange={e => setEditor({ ...editor, name: e.target.value })} className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">{t('Contact', 'Contact')}
                <input value={editor.contact} maxLength={CLIENT_LIMITS.contact} onChange={e => setEditor({ ...editor, contact: e.target.value })} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs text-slate-400">{t('Téléphone', 'Phone')}
                <input type="tel" value={editor.phone} maxLength={CLIENT_LIMITS.phone} onChange={e => setEditor({ ...editor, phone: e.target.value })} className={`${field} mt-1`} />
              </label>
            </div>
            <label className="block text-xs text-slate-400">{t('E-mail', 'E-mail')}
              <input type="email" value={editor.email} maxLength={CLIENT_LIMITS.email} onChange={e => setEditor({ ...editor, email: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Adresse', 'Address')}
              <input value={editor.address} maxLength={CLIENT_LIMITS.address} onChange={e => setEditor({ ...editor, address: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-xs text-slate-400">{t('Note (facultatif)', 'Note (optional)')}
              <textarea value={editor.note} maxLength={CLIENT_LIMITS.note} rows={2} onChange={e => setEditor({ ...editor, note: e.target.value })} className={`${field} mt-1 py-2`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">{t('Délai de paiement (jours)', 'Payment deadline (days)')}
                <input inputMode="numeric" value={editor.terms} placeholder={String(company.billing.payment_days)} onChange={e => setEditor({ ...editor, terms: e.target.value })} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs text-slate-400">{t('Prix par mission (Ar)', 'Price per mission (Ar)')}
                <input inputMode="numeric" value={editor.price} placeholder={t('celui des Réglages', 'Settings price')} onChange={e => setEditor({ ...editor, price: e.target.value })} className={`${field} mt-1`} />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">{t('Délai vide = celui de Réglages > Conditions. Prix vide = celui des Réglages > Missions. 0 est un vrai prix (mission offerte).', 'Empty deadline = the one in Settings > Conditions. Empty price = the one in Settings > Missions. 0 is a real price (free mission).')}</p>

            <div className="space-y-2">
              <div className="text-xs text-slate-400">{t('Prix différent selon le type de mission (facultatif)', 'Different price by mission type (optional)')}</div>
              {editor.types.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={row.type} aria-label={t('Type de mission', 'Mission type')} onChange={e => setEditor({ ...editor, types: editor.types.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })} className={`${field} min-w-0 flex-1`}>
                    <option value="">{t('Type…', 'Type…')}</option>
                    {[...new Set([...types, ...(row.type ? [row.type] : [])])].filter(x => x === row.type || !editor.types.some(o => o.type === x)).map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <input inputMode="numeric" value={row.price} aria-label={t('Prix (Ar)', 'Price (Ar)')} placeholder="Ar" onChange={e => setEditor({ ...editor, types: editor.types.map((x, j) => j === i ? { ...x, price: e.target.value } : x) })} className={`${field} w-28`} />
                  <button type="button" aria-label={t('Retirer', 'Remove')} onClick={() => setEditor({ ...editor, types: editor.types.filter((_, j) => j !== i) })} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 text-slate-300 flex items-center justify-center"><X className="w-4 h-4" /></button>
                </div>
              ))}
              {editor.types.length < CLIENT_LIMITS.types_max && types.some(x => !editor.types.some(o => o.type === x)) && (
                <button type="button" onClick={() => setEditor({ ...editor, types: [...editor.types, { type: '', price: '' }] })} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />{t('Ajouter une exception', 'Add an exception')}</button>
              )}
            </div>

            {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditor(null)} className="min-h-[44px] rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
              <button type="button" onClick={save} className="min-h-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold">{t('Enregistrer', 'Save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
