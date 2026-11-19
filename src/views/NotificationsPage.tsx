// Centre de notifications : liste filtrable (non lues, archivées), recherche, « tout marquer comme lu » et ouverture de l'écran concerné.
// Utilisé par : App.tsx (vue « notifications »). Les règles viennent de utils/notifications.ts et utils/notifView.ts ; pour modifier le contenu des notifications, voir ces deux fichiers.
import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Bell, CheckCheck, ChevronRight, Inbox, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { User } from '../types';
import { buildNotifications, getSeen, isUnread, markAllRead, markSeen, SEEN_EVENT, type Notif } from '../utils/notifications';
import { NOTIF_FILTERS, filterNotifs, notifWhen, type NotifFilter } from '../utils/notifView';
import { setValFilterIntent } from '../utils/navIntent';
import { setNavTarget, setChatThread } from '../utils/navTarget';
import { setStorageIntent } from '../utils/storageNav';

const ARCHIVE_KEY = (uid: string) => `df_notif_archived_${uid}`;
const readArchived = (uid: string): string[] => { try { const x = JSON.parse(localStorage.getItem(ARCHIVE_KEY(uid)) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const saveArchived = (uid: string, ids: string[]) => { try { localStorage.setItem(ARCHIVE_KEY(uid), JSON.stringify(Array.from(new Set(ids)).slice(-500))); } catch { /* stockage indisponible */ } };

export const NotificationsPage: React.FC<{ currentUser: User; onNavigate: (view: string) => void }> = ({ currentUser, onNavigate }) => {
  const { lang, theme } = useApp();
  const L = theme === 'light';
  const t = (fr: string, en: string) => lang === 'en' ? en : fr;
  const [, refresh] = useState(0);
  const [filter, setFilter] = useState<NotifFilter>('all');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState<string[]>(() => readArchived(currentUser.id));
  const all = useMemo(() => buildNotifications(currentUser), [currentUser, refresh]);
  const active = useMemo(() => all.filter(n => !archived.includes(n.id)), [all, archived]);
  const seen = getSeen(currentUser);
  const unread = active.filter(n => !seen.includes(n.id)).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return filterNotifs(active, filter, seen).filter(n => !q || `${n.title} ${n.sub}`.toLocaleLowerCase().includes(q));
  }, [active, filter, seen, query]);

  useEffect(() => {
    const on = () => refresh(x => x + 1);
    window.addEventListener(SEEN_EVENT, on);
    return () => window.removeEventListener(SEEN_EVENT, on);
  }, []);

  const open = (n: Notif) => {
    markSeen(currentUser, [n.id]);
    if (n.filter) setValFilterIntent(n.filter);
    if (n.thread) setChatThread(n.thread);
    if (n.nav) setNavTarget(n.nav);
    if (n.storage) setStorageIntent(n.storage);
    refresh(x => x + 1);
    onNavigate(n.view);
  };
  const archive = (n: Notif) => { const next = [...archived, n.id]; setArchived(next); saveArchived(currentUser.id, next); };
  const clearArchive = () => { setArchived([]); saveArchived(currentUser.id, []); };
  const tone = (n: Notif) => n.tone === 'urgent' ? 'bg-red-100 text-red-700 border-red-200' : n.tone === 'bad' ? 'bg-orange-100 text-orange-700 border-orange-200' : n.tone === 'ok' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200';
  const card = L ? 'bg-white border-slate-200' : 'bg-[#101d30] border-white/10';
  const text = L ? 'text-slate-900' : 'text-white';
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  return (
    <section className="max-w-5xl mx-auto space-y-4" data-testid="notifications-page">
      <div className={`${card} rounded-2xl border p-4 sm:p-6 shadow-sm`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><span className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0"><Bell className="w-6 h-6" /></span><div><h1 className={`text-xl sm:text-2xl font-bold ${text}`}>{t('Centre de notifications', 'Notification center')}</h1><p className={`text-sm mt-1 ${sub}`}>{t('Toutes les alertes importantes au même endroit, synchronisées avec la cloche et l’Assistant.', 'All important alerts in one place, synchronized with the bell and Assistant.')}</p></div></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { markAllRead(currentUser, active); refresh(x => x + 1); }} disabled={!unread} className={`min-h-[40px] px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 ${L ? 'border-slate-300 bg-white hover:bg-slate-50' : 'border-white/20 bg-white/5 hover:bg-white/10'}`}><CheckCheck className="w-4 h-4" />{t('Tout lire', 'Mark all read')}</button>{archived.length > 0 && <button type="button" onClick={clearArchive} className={`min-h-[40px] px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 cursor-pointer ${L ? 'border-slate-300 bg-white hover:bg-slate-50' : 'border-white/20 bg-white/5 hover:bg-white/10'}`}><Archive className="w-4 h-4" />{t('Réafficher les archivées', 'Restore archived')}</button>}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2"><div className={`${L ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/10 border-blue-400/20'} rounded-xl border p-3`}><div className="text-2xl font-bold text-blue-600">{active.length}</div><div className={`text-xs ${sub}`}>{t('Total actif', 'Active total')}</div></div><div className={`${L ? 'bg-red-50 border-red-100' : 'bg-red-500/10 border-red-400/20'} rounded-xl border p-3`}><div className="text-2xl font-bold text-red-600">{unread}</div><div className={`text-xs ${sub}`}>{t('Non lues', 'Unread')}</div></div><div className={`${L ? 'bg-amber-50 border-amber-100' : 'bg-amber-500/10 border-amber-400/20'} rounded-xl border p-3`}><div className="text-2xl font-bold text-amber-600">{active.filter(n => n.tone === 'urgent').length}</div><div className={`text-xs ${sub}`}>{t('Urgentes', 'Urgent')}</div></div><div className={`${L ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'} rounded-xl border p-3`}><div className="text-2xl font-bold text-slate-500">{archived.length}</div><div className={`text-xs ${sub}`}>{t('Archivées', 'Archived')}</div></div></div>
      </div>
      <div className={`${card} rounded-2xl border p-3 sm:p-4 space-y-3`}>
        <div className="flex flex-col sm:flex-row gap-2"><label className={`relative flex-1 ${text}`}><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Rechercher dans les notifications…', 'Search notifications…')} className={`w-full h-11 rounded-xl border pl-9 pr-3 text-sm ${L ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/15'}`} /></label><div className="flex gap-1.5 overflow-x-auto">{NOTIF_FILTERS.map(f => <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={`shrink-0 min-h-[40px] px-3 rounded-xl text-xs font-semibold border cursor-pointer ${filter === f.id ? 'bg-blue-600 text-white border-blue-600' : L ? 'bg-white border-slate-300 text-slate-700' : 'bg-white/5 border-white/20 text-slate-200'}`}>{f.label}</button>)}</div></div>
        <div className="space-y-2">{filtered.length === 0 ? <div className={`py-12 text-center ${sub}`}><Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" /><p className="font-semibold">{t('Aucune notification à afficher.', 'No notifications to display.')}</p><p className="text-xs mt-1">{t('Les nouvelles alertes apparaîtront ici automatiquement.', 'New alerts will appear here automatically.')}</p></div> : filtered.map(n => { const fresh = isUnread(currentUser, n); return <div key={n.id} className={`rounded-xl border p-3 flex items-start gap-3 ${fresh ? (L ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-400/30') : (L ? 'bg-slate-50' : 'bg-white/5')}`}><span className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${tone(n)}`}><Bell className="w-4 h-4" /></span><button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left cursor-pointer"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`font-bold text-sm ${text}`}>{n.title}</span>{fresh && <span className="w-2 h-2 rounded-full bg-red-500" title={t('Non lue', 'Unread')} />}</div>{n.sub && <p className={`text-sm mt-0.5 ${sub}`}>{n.sub}</p>}<p className={`text-[11px] mt-1 ${sub}`}>{notifWhen(n.at)} · {fresh ? t('Non lue', 'Unread') : t('Lue', 'Read')}</p></button><div className="flex items-center gap-1 shrink-0"><button type="button" onClick={() => archive(n)} title={t('Archiver', 'Archive')} aria-label={t('Archiver', 'Archive')} className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer ${L ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'}`}><Archive className="w-4 h-4" /></button><button type="button" onClick={() => open(n)} title={t('Ouvrir', 'Open')} aria-label={t('Ouvrir', 'Open')} className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center cursor-pointer"><ChevronRight className="w-4 h-4" /></button></div></div>; })}</div>
      </div>
      <p className={`text-xs px-1 ${sub}`}>{t('La page utilise la même liste que la cloche. L’archivage est conservé sur cet appareil ; les notifications métier restent générées à partir des données du compte.', 'This page uses the same list as the bell. Archiving is kept on this device; business notifications are generated from the account data.')}</p>
    </section>
  );
};
