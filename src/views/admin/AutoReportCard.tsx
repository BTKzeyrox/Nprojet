import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Printer, RefreshCw } from 'lucide-react';
import { db } from '../../db/store';
import { badgeAccess, performanceInput } from '../../utils/usePerformance';
import { computePerformance } from '../../utils/performanceScore';
import { clientBadgesFromDb } from '../../utils/clientBadgesDb';
import { downloadPdfFromHtml } from '../../utils/exportDoc';
import { buildReport, reportHtml } from '../../utils/report';
import { readCompany } from '../../utils/companyRules';
import { periodLabel, todayMada } from '../../utils/stats';
import { describeAutoReport, nextAutoReport, type AutoReportSetting, type ReportFrequency, type ReportRecord } from '../../utils/autoReport';

type Row = Omit<ReportRecord, 'html'>;

const DAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Le rapport d'une période (semaine du lundi `anchor`, ou mois de `anchor`), calculé avec les données du moment. */
function buildHtml(kind: 'week' | 'month', anchor: string, lang: 'fr' | 'en'): string {
  const settings = db.getSettings();
  const report = buildReport({
    today: todayMada(), anchor, lang, granularity: kind, settings, companyName: readCompany(settings.company).identity.name, posts: db.getPosts(), contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(),
    cash: db.getCash(), products: db.getProducts(), moves: db.getStockMoves(), clients: db.getClients(), invoices: db.getInvoices(),
    ...(badgeAccess().enabled ? { performance: computePerformance(performanceInput()), clientBadges: clientBadgesFromDb() } : {}),
  });
  return reportHtml(report);
}

// Rapport automatique (M15.5, responsable seulement) : réglage + liste des rapports déjà prêts. La copie d'un rapport est figée à sa première ouverture.
export const AutoReportCard: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const frame = useRef<HTMLIFrameElement>(null);
  const [draft, setDraft] = useState<AutoReportSetting>(() => db.getAutoReport());
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [open, setOpen] = useState<ReportRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const admin = db.getCurrentUser()?.role === 'admin';

  const load = useCallback(async () => {
    setListErr(null);
    const r = await db.listReports();
    if (r.ok) setRows(r.rows); else { setRows([]); setListErr(r.error || t('Liste indisponible.', 'List unavailable.')); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (admin) void load(); }, [admin, load]);
  if (!admin) return null;

  const set = (p: Partial<AutoReportSetting>) => { setSaved(false); setDraft(d => ({ ...d, ...p })); };
  const save = () => { setErr(null); const r = db.saveAutoReport(draft); if (!r.success) setErr(r.error || t('Enregistrement impossible.', 'Could not save.')); else setSaved(true); };
  const next = nextAutoReport(draft, Date.now());
  const nextTxt = next ? new Date(next).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Indian/Antananarivo', dateStyle: 'medium', timeStyle: 'short' }) : '';
  const label = (r: Row) => periodLabel(r.kind, r.start, lang);

  // Ouvrir : une copie figée s'affiche telle quelle ; une fiche « en attente » est calculée maintenant, puis figée (une seule fois).
  const openRow = async (r: Row) => {
    setErr(null); setBusy(r.id);
    try {
      const got = await db.openReport(r.id);
      if (!got.ok || !got.record) { setErr(got.error || t('Rapport illisible.', 'Unreadable report.')); return; }
      if (got.record.status === 'ready') { setOpen(got.record); return; }
      const frozen = await db.freezeReportCopy(r.id, buildHtml(r.kind, r.start, lang));
      if (!frozen.ok || !frozen.record) { setErr(frozen.error || t('Copie impossible.', 'Could not freeze the copy.')); return; }
      setOpen(frozen.record);
      void load();
    } finally { setBusy(null); }
  };
  const print = () => { setErr(null); const w = frame.current?.contentWindow; if (!w) { setErr(t('Le rapport n\'est pas prêt.', 'The report is not ready.')); return; } try { w.focus(); w.print(); } catch { setErr(t('Impression impossible ici.', 'Printing is not possible here.')); } };
  const pdf = async () => { if (!open?.html) return; setErr(null); setBusy('pdf'); try { await downloadPdfFromHtml(open.html, `rapport-${open.id}`); } catch { setErr(t('Export PDF impossible.', 'PDF export failed.')); } finally { setBusy(null); } };

  const btn = 'min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-100 text-sm font-semibold flex items-center justify-center gap-2 px-3 disabled:opacity-50';
  const field = 'min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 text-slate-100 text-sm px-2';
  const days = lang === 'en' ? DAYS_EN : DAYS_FR;

  return (
    <div className="space-y-3" data-notranslate="">
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Rapport automatique', 'Automatic report')}</h2>
        <p className="text-[11px] text-slate-400">{t('À l\'heure choisie (heure de Madagascar), le serveur prépare le rapport de la période FINIE (la semaine ou le mois d\'avant) et te prévient. La copie du rapport est figée à sa première ouverture et ne change plus. Pas d\'e-mail. Pour recevoir la notification, active les notifications de l\'appareil.', 'At the chosen time (Madagascar time), the server prepares the report for the period that just ENDED (last week or last month) and notifies you. The copy of the report is frozen the first time you open it and never changes. No e-mail. To get the notification, turn on device notifications.')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs text-slate-300 space-y-1">{t('Fréquence', 'Frequency')}
            <select className={field + ' w-full'} value={draft.frequency} onChange={e => set({ frequency: e.target.value as ReportFrequency })}>
              <option value="off">{t('Arrêté', 'Off')}</option>
              <option value="weekly">{t('Chaque semaine', 'Every week')}</option>
              <option value="monthly">{t('Chaque mois', 'Every month')}</option>
            </select>
          </label>
          {draft.frequency === 'weekly' && (
            <label className="text-xs text-slate-300 space-y-1">{t('Jour', 'Day')}
              <select className={field + ' w-full'} value={draft.weekday} onChange={e => set({ weekday: Number(e.target.value) })}>
                {days.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </label>
          )}
          {draft.frequency === 'monthly' && (
            <label className="text-xs text-slate-300 space-y-1">{t('Jour du mois (1 à 31)', 'Day of month (1–31)')}
              <input type="number" min={1} max={31} className={field + ' w-full'} value={draft.month_day} onChange={e => set({ month_day: Math.round(Number(e.target.value)) })} />
            </label>
          )}
          {draft.frequency !== 'off' && (
            <label className="text-xs text-slate-300 space-y-1">{t('Heure', 'Time')}
              <input type="time" className={field + ' w-full'} value={draft.time} onChange={e => set({ time: e.target.value })} />
            </label>
          )}
        </div>
        <p className="text-[11px] text-slate-400">{describeAutoReport(draft, lang)}{nextTxt ? ` · ${t('prochain', 'next')} : ${nextTxt}` : ''}</p>
        <button type="button" className={btn + ' w-full sm:w-auto'} onClick={save}>{t('Enregistrer', 'Save')}</button>
        {saved && <p className="text-xs text-emerald-400" role="status">{t('Enregistré.', 'Saved.')}</p>}
      </div>

      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">{t('Rapports automatiques', 'Automatic reports')}</h3>
          <button type="button" className={btn} onClick={() => void load()} aria-label={t('Actualiser la liste', 'Refresh the list')}><RefreshCw className="w-4 h-4" /></button>
        </div>
        {listErr && <p className="text-xs text-rose-400" role="alert">{listErr}</p>}
        {rows && !rows.length && !listErr && <p className="text-xs text-slate-400">{t('Aucun rapport pour le moment. Le premier apparaît à la prochaine heure prévue.', 'No report yet. The first one shows up at the next scheduled time.')}</p>}
        <ul className="space-y-2">
          {(rows || []).map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-100 truncate">{label(r)}</p>
                <p className="text-[11px] text-slate-400">{r.status === 'ready' ? t(`Copie figée le ${String(r.frozen_at || '').slice(0, 10)}`, `Copy frozen on ${String(r.frozen_at || '').slice(0, 10)}`) : t('En attente : la copie se fige à l\'ouverture', 'Waiting: the copy is frozen when opened')}</p>
              </div>
              <button type="button" className={btn} disabled={busy !== null} onClick={() => void openRow(r)}>{busy === r.id ? t('Ouverture…', 'Opening…') : t('Ouvrir', 'Open')}</button>
            </li>
          ))}
        </ul>
        {err && <p className="text-xs text-rose-400" role="alert">{err}</p>}
      </div>

      {open?.html && (
        <div className="space-y-2">
          <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">{periodLabel(open.kind, open.start, lang)}</h3>
            <p className="text-[11px] text-slate-400">{t(`Copie figée le ${String(open.frozen_at || '').slice(0, 10)}. Elle contient des chiffres d'argent : ne la partage qu'avec des personnes de confiance.`, `Copy frozen on ${String(open.frozen_at || '').slice(0, 10)}. It contains money figures: share it only with people you trust.`)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button type="button" className={btn} onClick={print}><Printer className="w-4 h-4" />{t('Imprimer', 'Print')}</button>
              <button type="button" className={btn} onClick={() => void pdf()} disabled={busy !== null}><FileText className="w-4 h-4" />{t('Télécharger PDF', 'Download PDF')}</button>
              <button type="button" className={btn} onClick={() => setOpen(null)}>{t('Fermer', 'Close')}</button>
            </div>
          </div>
          <iframe ref={frame} title={t('Rapport automatique', 'Automatic report')} srcDoc={open.html} sandbox="allow-same-origin allow-modals" className="w-full rounded-xl border border-slate-700 bg-white" style={{ height: 'min(1400px, 150vh)' }} />
        </div>
      )}
    </div>
  );
};
