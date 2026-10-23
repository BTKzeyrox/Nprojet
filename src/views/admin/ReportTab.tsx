import React, { useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { db } from '../../db/store';
import { buildReport, downloadReportExcel, reportHtml } from '../../utils/report';
import { readCompany } from '../../utils/companyRules';
import { todayMada } from '../../utils/stats';

// Rapport du mois : résumé, 3 points forts, 3 points d'attention, objectifs, prévision. Excel et PDF (impression) réservés à l'admin.
export const ReportTab: React.FC<{ anchor: string; lang: 'fr' | 'en' }> = ({ anchor, lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const frame = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const admin = db.getCurrentUser()?.role === 'admin';
  const posts = db.getPosts(), cash = db.getCash();
  const settings = db.getSettings();
  const sig = posts.length + ':' + cash.length + ':' + db.getProducts().length + ':' + db.getStockMoves().length + ':' + db.getAdvanceRequests().length + ':' + db.getClients().map(c => c.name + (c.active === false ? 0 : 1)).join(',') + ':' + db.getInvoices().map(v => v.id + v.status + v.total_ar).join(',') + cash.reduce((n, e) => n + (e.invoice_id ? e.amount_ar : 0), 0);
  const report = useMemo(() => admin ? buildReport({
    today: todayMada(), anchor, lang, settings, companyName: readCompany(settings.company).identity.name, posts, contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(),
    cash, products: db.getProducts(), moves: db.getStockMoves(), clients: db.getClients(), invoices: db.getInvoices(),
  }) : null, [admin, anchor, lang, settings, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!report) return null;
  const html = reportHtml(report);

  const print = () => { setErr(null); const w = frame.current?.contentWindow; if (!w) { setErr(t('Le rapport n\'est pas prêt.', 'The report is not ready.')); return; } try { w.focus(); w.print(); } catch { setErr(t('Impression impossible ici. Essaie depuis un autre navigateur.', 'Printing is not possible here. Try another browser.')); } };
  const excel = async () => { setErr(null); setBusy(true); try { await downloadReportExcel(report, anchor); } catch { setErr(t('Export Excel impossible.', 'Excel export failed.')); } finally { setBusy(false); } };
  const btn = 'min-h-[44px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-100 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50';

  return (
    <div className="space-y-3" data-notranslate="">
      <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3">
        <h2 className="text-sm sm:text-base font-bold text-white">{t('Rapport du mois', 'Monthly report')} · {report.month}</h2>
        <p className="text-[11px] text-slate-400">{t('Le mois choisi en haut de la page. Il contient des chiffres d\'argent : ne le partage qu\'avec des personnes de confiance.', 'The month chosen at the top of the page. It contains money figures: share it only with people you trust.')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btn} onClick={print}><Printer className="w-4 h-4" />{t('Imprimer / PDF', 'Print / PDF')}</button>
          <button type="button" className={btn} onClick={() => void excel()} disabled={busy}><Download className="w-4 h-4" />{busy ? t('Export…', 'Exporting…') : 'Excel (.xlsx)'}</button>
        </div>
        <p className="text-[11px] text-slate-500">{t('Pour un PDF : « Imprimer », puis choisis « Enregistrer au format PDF » comme imprimante.', 'For a PDF: “Print”, then choose “Save as PDF” as the printer.')}</p>
        {err && <p className="text-xs text-rose-400" role="alert">{err}</p>}
      </div>
      <iframe ref={frame} title={t('Rapport mensuel', 'Monthly report')} srcDoc={html} sandbox="allow-same-origin allow-modals" className="w-full rounded-xl border border-slate-700 bg-white" style={{ height: 'min(1400px, 150vh)' }} />
    </div>
  );
};
