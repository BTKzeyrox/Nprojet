import { PRINT_FONT, PRINT_FONT_FACE, PRINT_MARGIN_MM, PRINT_PT } from './printFormat';
export interface SlipLine { post_id: string; date: string; client: string; post_number: number | null; score: number; rate: number; amount: number }
export interface SlipEntry { id: string; amount: number; reason: string; at: string }
export interface Slip {
  id: string; pid: string; period_start: string; period_end: string;
  user_id: string; name: string; username: string; phone: string;
  lines: SlipLine[]; gross: number; bonuses: SlipEntry[]; penalties: SlipEntry[]; penalty_applied: number;
  advance_due_before: number; advance_deducted: number; advance_carry: number; net: number;
  paid: { at: string; method: string; ref: string; by_name?: string } | null;
  closed_at?: string;
}

export type SlipLang = 'fr' | 'en';
/** Identité de l'entreprise pour l'en-tête du bulletin (Conditions, module 0). Un employé n'en reçoit pas : l'en-tête est alors simplement absent. */
export interface SlipCompany { name: string; address: string; phone: string; email: string; logo_url: string; currency: string; tax_id: string; register_id: string; notes: string[] }
export interface SlipOptions { lang?: SlipLang; company?: Partial<SlipCompany> | null; printedAt?: string }

const MONTHS = {
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const locOf = (lang: SlipLang) => (lang === 'en' ? 'en-GB' : 'fr-FR');
const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export const pidLabel = (pid: string, lang: SlipLang = 'fr') => {
  const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(pid);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return pid;
  const base = `${MONTHS[lang][Number(m[2]) - 1]} ${m[1]}`;
  if (m[3] === 'A') return lang === 'en' ? `${base} · 1st to 15th` : `${base} · 1 au 15`;
  if (m[3] === 'B') return lang === 'en' ? `${base} · 16th to end` : `${base} · 16 à la fin`;
  return base;
};
export const fmtDay = (d: string, lang: SlipLang = 'fr') => {
  const t = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString(locOf(lang));
};
export const fmtScore = (n: number, lang: SlipLang = 'fr') => `${(n / 1_000_000).toLocaleString(locOf(lang), { maximumFractionDigits: 2 })} M`;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Montant dans la monnaie de l'entreprise (« Ar » par défaut). */
export const slipMoney = (n: number, currency = 'Ar', lang: SlipLang = 'fr') => `${Math.round(num(n)).toLocaleString(locOf(lang))} ${currency || 'Ar'}`;

/** Ce que les lignes du bulletin donnent, et si cela correspond au net calculé par le serveur (le serveur fait foi ; un écart est signalé sur le papier). */
export function slipTotals(s: Slip) {
  const bonusSum = s.bonuses.reduce((t, b) => t + num(b.amount), 0);
  const penaltySum = s.penalties.reduce((t, b) => t + num(b.amount), 0);
  const total = num(s.gross) + bonusSum;
  const penApplied = num(s.penalty_applied);
  const afterPenalties = total - penApplied;
  const expectedNet = afterPenalties - num(s.advance_deducted);
  return { bonusSum, penaltySum, total, penApplied, afterPenalties, expectedNet, consistent: Math.abs(expectedNet - num(s.net)) < 1, capped: penaltySum > penApplied };
}

/** Réglages de l'entreprise → en-tête du bulletin (accepte l'objet d'un employé, qui n'a pas l'identité). */
export function companyForSlip(c: { identity?: Partial<SlipCompany>; legal?: { tax_id?: string; register_id?: string; notes?: string[] } } | null | undefined): SlipCompany {
  return {
    name: c?.identity?.name || '', address: c?.identity?.address || '', phone: c?.identity?.phone || '', email: c?.identity?.email || '',
    logo_url: c?.identity?.logo_url || '', currency: c?.identity?.currency || 'Ar',
    tax_id: c?.legal?.tax_id || '', register_id: c?.legal?.register_id || '', notes: (c?.legal?.notes || []).filter(Boolean),
  };
}

/** Option `company` du bulletin (déjà à plat : sortie de `companyForSlip`) → valeurs sûres, jamais « undefined ». */
const flatCompany = (c: Partial<SlipCompany> | null | undefined): SlipCompany => ({
  name: String(c?.name ?? ''), address: String(c?.address ?? ''), phone: String(c?.phone ?? ''), email: String(c?.email ?? ''), logo_url: String(c?.logo_url ?? ''),
  currency: String(c?.currency || 'Ar'), tax_id: String(c?.tax_id ?? ''), register_id: String(c?.register_id ?? ''), notes: Array.isArray(c?.notes) ? c!.notes!.map(String).filter(Boolean) : [],
});

const L = {
  fr: {
    title: 'Bulletin de paie', preview: 'APERÇU : période non clôturée, les montants peuvent encore changer', employee: 'Salarié', period: 'Période', ref: 'Référence', printed: 'Édité le',
    sessions: 'Missions validées', date: 'Date', mission: 'Mission', points: 'Points', rate: 'Taux (par 1 M)', amount: 'Montant', none: 'Aucune mission validée sur la période.',
    summary: 'Calcul', earned: 'Total gagné (missions)', bonus: 'Prime', total: 'Total avant retenues', penalty: 'Retenue', capped: 'Retenues limitées au total : appliqué', of: 'sur', advances: 'Avances remboursées',
    net: 'NET À PAYER', advBefore: 'Avance due avant la période', advCarry: 'Avance restant à rembourser (reportée)', paid: 'Payé le', by: 'par', refShort: 'réf.', notPaid: 'Pas encore payé.',
    mismatch: 'ÉCART DE CALCUL : le net imprimé ne correspond pas au détail. Ne pas utiliser ce document avant vérification.', employer: 'Signature de l\'employeur', employeeSig: 'Signature du salarié',
    tax: 'N° fiscal', reg: 'N° d\'immatriculation', disclaimer: 'Document interne : ce n\'est pas un bulletin de paie légal, les cotisations sociales ne sont pas calculées.', lang: 'fr', file: 'Bulletin de paie',
  },
  en: {
    title: 'Payslip', preview: 'PREVIEW: period not closed, amounts may still change', employee: 'Employee', period: 'Period', ref: 'Reference', printed: 'Issued on',
    sessions: 'Validated missions', date: 'Date', mission: 'Mission', points: 'Points', rate: 'Rate (per 1 M)', amount: 'Amount', none: 'No validated mission in the period.',
    summary: 'Calculation', earned: 'Total earned (missions)', bonus: 'Bonus', total: 'Total before deductions', penalty: 'Deduction', capped: 'Deductions limited to the total: applied', of: 'of', advances: 'Advances repaid',
    net: 'NET PAY', advBefore: 'Advance owed before the period', advCarry: 'Advance still to repay (carried over)', paid: 'Paid on', by: 'by', refShort: 'ref.', notPaid: 'Not paid yet.',
    mismatch: 'CALCULATION MISMATCH: the printed net does not match the detail. Do not use this document before checking.', employer: 'Employer signature', employeeSig: 'Employee signature',
    tax: 'Tax ID', reg: 'Registration no.', disclaimer: 'Internal document: this is not a legal payslip, social contributions are not calculated.', lang: 'en', file: 'Payslip',
  },
} as const;

const safeLogo = (u: string) => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '');

// Bulletin imprimable (A4). Le serveur calcule les montants ; ici on les met en page et on vérifie que le détail retombe sur le net.
export const slipHtml = (s: Slip, opts: SlipOptions = {}) => {
  const lang: SlipLang = opts.lang === 'en' ? 'en' : 'fr';
  const t = L[lang];
  const co = flatCompany(opts.company);
  const m = (n: number) => esc(slipMoney(n, co.currency, lang));
  const tot = slipTotals(s);
  const logo = safeLogo(co.logo_url);
  const header = [co.name, co.address, [co.phone, co.email].filter(Boolean).join(' · '), co.tax_id ? `${t.tax} : ${co.tax_id}` : '', co.register_id ? `${t.reg} : ${co.register_id}` : ''].filter(Boolean);
  const printed = fmtDay((opts.printedAt || new Date().toISOString()).slice(0, 10), lang);
  const rows = s.lines.map(l => `<tr><td>${esc(fmtDay(l.date, lang))}</td><td>${l.post_number ? 'Mission ' + esc(l.post_number) + ' · ' : ''}${esc(l.client)}</td><td class="r">${esc(fmtScore(num(l.score), lang))}</td><td class="r">${esc(Math.round(num(l.rate)).toLocaleString(locOf(lang)))}</td><td class="r">${m(l.amount)}</td></tr>`).join('');
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><title>${esc(t.file)} ${esc(s.name)} ${esc(pidLabel(s.pid, lang))}</title>
<style>${PRINT_FONT_FACE}
@page{size:A4;margin:${PRINT_MARGIN_MM}mm}
body{font-family:${PRINT_FONT};color:#111;margin:0;font-size:${PRINT_PT}pt;line-height:1.35}
.head{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
.head img{max-height:56px;max-width:140px}.head .co b{font-size:15px}.head .co div{color:#333}
h1{font-size:19px;margin:0 0 8px;letter-spacing:.5px;text-transform:uppercase}h2{font-size:13px;margin:16px 0 6px}
.banner{border:2px dashed #b45309;color:#92400e;background:#fffbeb;padding:6px 8px;margin:0 0 10px;font-weight:bold}
.bad{border:2px solid #b91c1c;color:#7f1d1d;background:#fef2f2;padding:6px 8px;margin:10px 0;font-weight:bold}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-bottom:6px}.meta span{color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee}td.r,th.r{text-align:right;white-space:nowrap}tr{break-inside:avoid}
.sum td{border-color:#ccc}.sub td{background:#f4f4f4;font-weight:bold}
.net td{font-size:15px;font-weight:bold;background:#e8f5e9;border:2px solid #111}
.note{font-size:11px;color:#555;margin-top:6px}.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:34px}
.sig div{border-top:1px solid #111;padding-top:4px;font-size:11px;color:#333;min-height:46px}
</style></head><body>
<div class="head">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div class="co">${header.map((h, i) => (i === 0 ? `<b>${esc(h)}</b>` : `<div>${esc(h)}</div>`)).join('')}</div></div>
<h1>${esc(t.title)}</h1>
${s.closed_at ? '' : `<div class="banner">${esc(t.preview)}</div>`}
<div class="meta"><div><span>${esc(t.employee)} :</span> <b>${esc(s.name || '—')}</b> (@${esc(s.username)})${s.phone ? ' · ' + esc(s.phone) : ''}</div><div><span>${esc(t.period)} :</span> <b>${esc(pidLabel(s.pid, lang))}</b> (${esc(fmtDay(s.period_start, lang))} – ${esc(fmtDay(s.period_end, lang))})</div>
<div><span>${esc(t.ref)} :</span> ${esc(s.id)}</div><div><span>${esc(t.printed)} :</span> ${esc(printed)}</div></div>
<h2>${esc(t.sessions)}</h2>
<table><tr><th>${esc(t.date)}</th><th>${esc(t.mission)}</th><th class="r">${esc(t.points)}</th><th class="r">${esc(t.rate)}</th><th class="r">${esc(t.amount)}</th></tr>
${rows || `<tr><td colspan="5">${esc(t.none)}</td></tr>`}
<tr class="sub"><td colspan="4">${esc(t.earned)}</td><td class="r">${m(s.gross)}</td></tr></table>
<h2>${esc(t.summary)}</h2>
<table class="sum">
<tr><td>${esc(t.earned)}</td><td class="r">${m(s.gross)}</td></tr>
${s.bonuses.map(b => `<tr><td>+ ${esc(t.bonus)} : ${esc(b.reason)}</td><td class="r">+ ${m(b.amount)}</td></tr>`).join('')}
<tr class="sub"><td>${esc(t.total)}</td><td class="r">${m(tot.total)}</td></tr>
${s.penalties.map(b => `<tr><td>− ${esc(t.penalty)} : ${esc(b.reason)}</td><td class="r">− ${m(b.amount)}</td></tr>`).join('')}
${tot.capped ? `<tr><td colspan="2" class="note">${esc(t.capped)} ${m(tot.penApplied)} ${esc(t.of)} ${m(tot.penaltySum)}</td></tr>` : ''}
${num(s.advance_deducted) > 0 ? `<tr><td>− ${esc(t.advances)}</td><td class="r">− ${m(s.advance_deducted)}</td></tr>` : ''}
<tr class="net"><td>${esc(t.net)}</td><td class="r">${m(s.net)}</td></tr></table>
${tot.consistent ? '' : `<div class="bad">${esc(t.mismatch)}</div>`}
${num(s.advance_due_before) > 0 || num(s.advance_carry) > 0 ? `<div class="note">${esc(t.advBefore)} : ${m(s.advance_due_before)}${num(s.advance_carry) > 0 ? ` · ${esc(t.advCarry)} : ${m(s.advance_carry)}` : ''}</div>` : ''}
<div style="margin-top:8px">${s.paid ? `<b>${esc(t.paid)} ${esc(fmtDay(s.paid.at, lang))}</b> ${esc(t.by)} ${esc(s.paid.method)}${s.paid.ref ? ` (${esc(t.refShort)} ${esc(s.paid.ref)})` : ''}${s.paid.by_name ? ' · ' + esc(s.paid.by_name) : ''}` : `<span class="note">${esc(t.notPaid)}</span>`}</div>
<div class="sig"><div>${esc(t.employer)}</div><div>${esc(t.employeeSig)}</div></div>
${co.notes.length ? `<div class="note" style="margin-top:14px">${co.notes.map(n => esc(n)).join('<br>')}</div>` : ''}
<div class="note" style="margin-top:10px">${esc(t.disclaimer)}</div>
</body></html>`;
};

// Impression par un cadre caché : fonctionne aussi sur téléphone (pas de fenêtre à ouvrir)
export const printSlip = (s: Slip, opts: SlipOptions = {}) => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentWindow!.document;
  d.open(); d.write(slipHtml(s, opts)); d.close();
  setTimeout(() => { try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { /* ignore */ } setTimeout(() => f.remove(), 2000); }, 300);
};

// CSV pour Excel (séparateur « ; », accents conservés)
export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};
