// Télécharger un document (bulletin, facture, reçu, rapport) en PDF ou en Excel, en plus d'« Imprimer ».
// PDF : la page HTML claire du document est dessinée dans un cadre caché, photographiée (html2canvas) puis découpée en pages A4 (jsPDF).
// Le PDF est donc une image fidèle de la page imprimable (texte non sélectionnable). Les bibliothèques ne sont chargées qu'au clic.
import type { Slip } from './payslip';
import { slipTotals } from './payslip';
import type { Invoice } from '../types';

const A4_W_PX = 794; // 210 mm à 96 dpi

const saveBlob = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

/** Nom de fichier sûr (lettres, chiffres, tiret). */
export const safeFileName = (s: string): string => (s || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';

/** Page HTML complète → fichier PDF A4 téléchargé. */
export async function downloadPdfFromHtml(html: string, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;height:1200px;border:0;background:#fff`;
  document.body.appendChild(f);
  try {
    const d = f.contentWindow!.document;
    d.open(); d.write(html); d.close();
    await new Promise<void>(r => { setTimeout(r, 400); });
    const body = d.body;
    f.style.height = `${Math.max(body.scrollHeight, 400)}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: A4_W_PX, windowWidth: A4_W_PX });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pw = 210, ph = 297, margin = 8;
    const imgW = pw - margin * 2;
    const pageHpx = Math.floor(((ph - margin * 2) / imgW) * canvas.width); // hauteur d'une page, en pixels du canvas
    let y = 0, page = 0;
    while (y < canvas.height) {
      const h = Math.min(pageHpx, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, (h / canvas.width) * imgW);
      y += h; page++;
    }
    pdf.save(`${safeFileName(fileName)}.pdf`);
  } finally { f.remove(); }
}

type Rows = (string | number)[][];
async function saveXlsx(sheets: { name: string; rows: Rows }[], fileName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows.length ? sh.rows : [['']]), sh.name.slice(0, 31));
  XLSX.writeFile(wb, `${safeFileName(fileName.replace(/\.xlsx$/i, ''))}.xlsx`); // jamais « .xlsx.xlsx » même si l'appelant a déjà mis l'extension
}

/** Lignes du bulletin de paie pour Excel (pure : testable). */
export function slipRows(s: Slip, lang: 'fr' | 'en' = 'fr'): Rows {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const tot = slipTotals(s);
  return [
    [t('Bulletin de paie', 'Payslip'), s.name || s.username],
    [t('Période', 'Period'), `${s.period_start} → ${s.period_end}`],
    [],
    [t('Date', 'Date'), t('Client', 'Client'), t('Mission', 'Mission'), t('Points', 'Points'), t('Taux', 'Rate'), t('Montant (Ar)', 'Amount (Ar)')],
    ...s.lines.map(l => [l.date, l.client, l.post_number ?? '', l.score, l.rate, l.amount]),
    [],
    [t('Gagné', 'Earned'), '', '', '', '', s.gross],
    ...s.bonuses.map(b => [`+ ${t('Prime', 'Bonus')} : ${b.reason}`, '', '', '', '', b.amount]),
    [t('Total', 'Total'), '', '', '', '', tot.total],
    ...s.penalties.map(b => [`− ${t('Pénalité', 'Penalty')} : ${b.reason}`, '', '', '', '', -b.amount]),
    [t('Avances déduites', 'Advances deducted'), '', '', '', '', -s.advance_deducted],
    [t('Net à payer', 'Net pay'), '', '', '', '', s.net],
  ];
}
export const downloadSlipExcel = (s: Slip, lang: 'fr' | 'en' = 'fr') => saveXlsx([{ name: lang === 'en' ? 'Payslip' : 'Bulletin', rows: slipRows(s, lang) }], `bulletin-${s.username || s.user_id}-${s.period_end}`);

/** Lignes d'une facture pour Excel (pure : testable). */
export function invoiceRows(inv: Invoice, lang: 'fr' | 'en' = 'fr'): Rows {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return [
    [inv.type === 'credit_note' ? t('Avoir', 'Credit note') : t('Facture', 'Invoice'), inv.number || t('Brouillon', 'Draft')],
    [t('Client', 'Client'), inv.client?.name || ''],
    [t('Date', 'Date'), inv.issue_date],
    [t('Échéance', 'Due date'), inv.due_date],
    [],
    [t('Description', 'Description'), t('Quantité', 'Quantity'), t('Prix unitaire (Ar)', 'Unit price (Ar)'), t('Total (Ar)', 'Total (Ar)')],
    ...inv.lines.map(l => [l.description, l.qty, l.unit_price_ar, l.total_ar]),
    [],
    [t('Sous-total', 'Subtotal'), '', '', inv.subtotal_ar],
    [`${t('TVA', 'VAT')} ${inv.tax_rate} %`, '', '', inv.tax_ar],
    [t('Total', 'Total'), '', '', inv.total_ar],
  ];
}
export const downloadInvoiceExcel = (inv: Invoice, lang: 'fr' | 'en' = 'fr') => saveXlsx([{ name: lang === 'en' ? 'Invoice' : 'Facture', rows: invoiceRows(inv, lang) }], `${inv.type === 'credit_note' ? 'avoir' : 'facture'}-${inv.number || inv.id}`);

/** Brouillon de déclaration de TVA (Excel) : mois par mois puis total. À faire valider par un expert-comptable avant toute déclaration officielle. */
export function vatRows(rep: { months: { month: string; collected: number; deductible: number; due: number }[]; total: { collected: number; deductible: number; due: number } }, period: string, lang: 'fr' | 'en' = 'fr'): Rows {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return [
    [t('Brouillon de déclaration de TVA', 'VAT return draft'), period],
    [t('À valider par un expert-comptable avant toute déclaration officielle.', 'To be validated by an accountant before any official return.')],
    [],
    [t('Mois', 'Month'), t('TVA collectée (Ar)', 'Collected VAT (Ar)'), t('TVA déductible (Ar)', 'Deductible VAT (Ar)'), t('TVA à payer (Ar)', 'VAT due (Ar)')],
    ...rep.months.map(m => [m.month, m.collected, m.deductible, m.due]),
    [],
    [t('Total', 'Total'), rep.total.collected, rep.total.deductible, rep.total.due],
    [rep.total.due < 0 ? t('Crédit de TVA', 'VAT credit') : t('TVA à payer', 'VAT to pay'), '', '', Math.abs(rep.total.due)],
  ];
}
export const downloadVatExcel = (rep: Parameters<typeof vatRows>[0], period: string, lang: 'fr' | 'en' = 'fr') => saveXlsx([{ name: 'TVA', rows: vatRows(rep, period, lang) }], `tva-${safeFileName(period)}.xlsx`);

export { saveBlob };

/** Classeur « Comptabilité » pour le comptable : Infos, Journal, Grand livre, Balance (montants en nombres). */
export const downloadAccountingExcel = (sheets: { name: string; rows: (string | number)[][] }[], fileName: string) => saveXlsx(sheets, `${safeFileName(fileName)}.xlsx`);
