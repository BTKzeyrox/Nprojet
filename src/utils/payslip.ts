import { formatCurrencyAr } from './formatUtils';

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

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const pidLabel = (pid: string) => {
  const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(pid);
  if (!m) return pid;
  const base = `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[3] === 'A' ? `${base} · 1 au 15` : m[3] === 'B' ? `${base} · 16 à la fin` : base;
};
export const fmtDay = (d: string) => {
  const t = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString('fr-FR');
};
export const fmtScore = (n: number) => `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Fiche imprimable (document simple, pas un bulletin de paie légal : les cotisations ne sont pas calculées)
export const slipHtml = (s: Slip) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de paie ${esc(s.name)} ${esc(pidLabel(s.pid))}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:13px}
h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px}
.m{color:#555} table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}
th{background:#eee} td.r,th.r{text-align:right} .tot td{font-weight:bold;background:#f6f6f6}
.net{font-size:16px;margin-top:12px} .note{margin-top:18px;font-size:11px;color:#666}
</style></head><body>
<h1>Fiche de paie — Delta Force Boosting</h1>
<div class="m">Période : ${esc(pidLabel(s.pid))} (${esc(fmtDay(s.period_start))} au ${esc(fmtDay(s.period_end))})</div>
<div><b>${esc(s.name)}</b> (@${esc(s.username)})${s.phone ? ' · ' + esc(s.phone) : ''}</div>
<h2>Sessions validées</h2>
<table><tr><th>Date</th><th>Poste</th><th class="r">Points</th><th class="r">Taux (Ar / 1M)</th><th class="r">Montant</th></tr>
${s.lines.map(l => `<tr><td>${esc(fmtDay(l.date))}</td><td>${l.post_number ? 'Poste ' + l.post_number + ' · ' : ''}${esc(l.client)}</td><td class="r">${esc(fmtScore(l.score))}</td><td class="r">${esc(l.rate.toLocaleString('fr-FR'))}</td><td class="r">${esc(formatCurrencyAr(l.amount))}</td></tr>`).join('') || '<tr><td colspan="5">Aucune session.</td></tr>'}
<tr class="tot"><td colspan="4">Total gagné</td><td class="r">${esc(formatCurrencyAr(s.gross))}</td></tr></table>
<h2>Primes, retenues et avances</h2>
<table>
${s.bonuses.map(b => `<tr><td>Prime : ${esc(b.reason)}</td><td class="r">+ ${esc(formatCurrencyAr(b.amount))}</td></tr>`).join('')}
${s.penalties.map(b => `<tr><td>Retenue : ${esc(b.reason)}</td><td class="r">− ${esc(formatCurrencyAr(b.amount))}</td></tr>`).join('')}
${s.advance_deducted > 0 ? `<tr><td>Avances remboursées</td><td class="r">− ${esc(formatCurrencyAr(s.advance_deducted))}</td></tr>` : ''}
${!s.bonuses.length && !s.penalties.length && !s.advance_deducted ? '<tr><td colspan="2">Aucune.</td></tr>' : ''}
</table>
${s.advance_carry > 0 ? `<div class="m">Avance restant à rembourser (reportée) : ${esc(formatCurrencyAr(s.advance_carry))}</div>` : ''}
<div class="net"><b>Net à payer : ${esc(formatCurrencyAr(s.net))}</b></div>
${s.paid ? `<div>Payé le ${esc(fmtDay(s.paid.at))} par ${esc(s.paid.method)}${s.paid.ref ? ' (réf. ' + esc(s.paid.ref) + ')' : ''}</div>` : '<div class="m">Pas encore payé.</div>'}
<div class="note">Ce document n'est pas un bulletin de paie légal : les cotisations sociales ne sont pas calculées.</div>
</body></html>`;

// Impression par un cadre caché : fonctionne aussi sur téléphone (pas de fenêtre à ouvrir)
export const printSlip = (s: Slip) => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentWindow!.document;
  d.open(); d.write(slipHtml(s)); d.close();
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
