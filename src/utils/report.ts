// Rapport du mois (S4.5) et données d'export Excel / PDF (S4.4). Sans écran, sans serveur : contrôlé par `npm run check:phase4`.
// Contient des chiffres d'argent : à construire seulement pour l'admin.
import type { CashEntry, ClientContract, PostSession, Product, SalaryAdvanceRequest, StockMove, User } from '../types';
import { comparableRanges, computeStats, periodLabel, variation, type StatsResult } from './stats';
import { computeFinance, type FinanceStats } from './financeStats';
import { forecastMonth, goalRows, monthFigures, type Forecast, type GoalRow } from './goals';
import type { ClientRecord } from './clients';
import { computeAlerts, type AlertItem, type AlertSettings } from './alerts';
import { stockRows, stockValue, type StockRow } from './stock';

export interface ReportInput {
  today: string; anchor: string; lang: 'fr' | 'en';
  settings: AlertSettings;
  companyName?: string; // nom de l'entreprise (Conditions, module 0) : affiché seulement s'il est rempli
  posts: PostSession[]; contracts: ClientContract[]; users: User[]; advances: SalaryAdvanceRequest[];
  cash: CashEntry[]; products: Product[]; moves: StockMove[];
  clients?: ClientRecord[]; // fiches clients (admin)
}

export interface Report {
  lang: 'fr' | 'en'; title: string; month: string; inProgress: boolean; company: string;
  stats: StatsResult; fin: FinanceStats; finPrev: FinanceStats;
  goals: GoalRow[]; forecast: Forecast | null; alerts: AlertItem[];
  stock: { rows: StockRow[]; value: number };
  cashLines: CashEntry[];
  strengths: string[]; attention: string[];
}

const ar = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} Ar`;
const pctTxt = (n: number) => `${n > 0 ? '+' : ''}${n} %`;

export function buildReport(i: ReportInput): Report {
  const t = (fr: string, en: string) => (i.lang === 'en' ? en : fr);
  const s = i.settings;
  const price = s.price_per_mission || 0;
  const stats = computeStats({ posts: i.posts, contracts: i.contracts, users: i.users, advances: i.advances, pricePerMission: price }, 'month', i.anchor, i.today, i.lang);
  const rg = stats.ranges;
  const fin0 = { cash: i.cash, posts: i.posts, contracts: i.contracts, prices: s, pricePerMission: price, clients: i.clients };
  const empty = rg.isFuture;
  const fin = computeFinance(fin0, 'month', empty ? { start: rg.cur.start, end: rg.cur.start, days: 1 } : rg.curEff, i.lang, t('Salaires', 'Salaries'));
  const finPrev = computeFinance(fin0, 'month', rg.prev, i.lang, t('Salaires', 'Salaries'));
  const sameMonthAsToday = i.today >= rg.cur.start && i.today <= rg.cur.end;
  const monthNow = monthFigures(fin0, i.today);
  // Objectifs et prévision : seulement pour le mois en cours (un mois passé n'a plus de « rythme »)
  const goals = sameMonthAsToday ? goalRows(s, monthNow) : [];
  const forecast = sameMonthAsToday ? forecastMonth(monthNow) : null;
  const alerts = sameMonthAsToday ? computeAlerts({ today: i.today, settings: s, cash: i.cash, posts: i.posts, contracts: i.contracts, advances: i.advances, products: i.products, moves: i.moves, clients: i.clients }) : [];
  const rows = stockRows(i.products, i.moves);
  const cashLines = i.cash.filter(e => e.date >= rg.cur.start && e.date <= (empty ? '0000' : rg.curEff.end)).sort((a, b) => a.date.localeCompare(b.date));

  // --- 3 points forts et 3 points d'attention (règles simples, toujours expliquées par un chiffre) ---
  const strengths: string[] = [];
  const attention: string[] = [];
  const vMiss = variation(stats.cur.done, stats.prev.done);
  if (!empty) {
    if (vMiss.dir === 'up' && vMiss.pct !== null && stats.cur.done > 0) strengths.push(t(`Missions validées en hausse de ${vMiss.pct} % (${stats.cur.done} contre ${stats.prev.done}).`, `Validated missions up ${vMiss.pct}% (${stats.cur.done} vs ${stats.prev.done}).`));
    if (fin.profit > 0) strengths.push(t(`Bénéfice net positif : ${ar(fin.profit)}${fin.marginPct !== null ? ` (marge ${fin.marginPct} %)` : ''}.`, `Positive net profit: ${ar(fin.profit)}${fin.marginPct !== null ? ` (margin ${fin.marginPct}%)` : ''}.`));
    if (stats.cur.rate !== null && stats.cur.rate >= 90 && stats.cur.done >= 5) strengths.push(t(`Taux de validation élevé : ${stats.cur.rate} %.`, `High validation rate: ${stats.cur.rate}%.`));
    for (const g of goals) if (g.state === 'good' || (g.kind === 'limit' && g.state === 'ok' && g.pct <= 80 && monthNow.day === monthNow.daysInMonth)) strengths.push(g.key === 'missions' ? t(`Objectif de missions atteint (${g.value} sur ${g.goal}).`, `Mission goal reached (${g.value} of ${g.goal}).`) : g.key === 'profit' ? t(`Objectif de bénéfice atteint (${ar(g.value)}).`, `Profit goal reached (${ar(g.value)}).`) : t('Dépenses sous le plafond du mois.', 'Expenses under the monthly limit.'));
    if (fin.billed > 0 && fin.toCollect === 0) strengths.push(t('Tout ce qui est facturé a été encaissé.', 'Everything billed has been collected.'));
    if (fin.bestClient) strengths.push(t(`Meilleur client : ${fin.bestClient.name} (${ar(fin.bestClient.amount)}).`, `Best client: ${fin.bestClient.name} (${ar(fin.bestClient.amount)}).`));
    const top = stats.team.ranking[0];
    if (top && top.done > 0) strengths.push(t(`Meilleur de l'équipe : ${top.name} (${top.done} mission${top.done > 1 ? 's' : ''}).`, `Top of the team: ${top.name} (${top.done} mission${top.done > 1 ? 's' : ''}).`));
    const bt = fin.byType.find(r => r.margin > 0);
    if (bt) strengths.push(t(`Type de mission le plus rentable : ${bt.type} (marge ${ar(bt.margin)}).`, `Most profitable mission type: ${bt.type} (margin ${ar(bt.margin)}).`));

    if (fin.profit < 0) attention.push(t(`Bénéfice négatif : ${ar(fin.profit)}. Dépenses et salaires dépassent l'argent reçu.`, `Negative profit: ${ar(fin.profit)}. Expenses and salaries exceed money received.`));
    if (vMiss.dir === 'down' && vMiss.pct !== null && vMiss.pct <= -20) attention.push(t(`Missions validées en baisse de ${Math.abs(vMiss.pct)} % (${stats.cur.done} contre ${stats.prev.done}).`, `Validated missions down ${Math.abs(vMiss.pct)}% (${stats.cur.done} vs ${stats.prev.done}).`));
    if (stats.cur.rate !== null && stats.cur.rate < 70 && stats.cur.done + stats.cur.rejected >= 5) attention.push(t(`Taux de validation bas : ${stats.cur.rate} % (${stats.cur.rejected} refusée${stats.cur.rejected > 1 ? 's' : ''}).`, `Low validation rate: ${stats.cur.rate}% (${stats.cur.rejected} rejected).`));
    for (const g of goals) if (g.state === 'over' || g.state === 'warn') attention.push(g.key === 'expenses' ? t(`Dépenses à ${g.pct} % du plafond du mois.`, `Expenses at ${g.pct}% of the monthly limit.`) : g.key === 'missions' ? t(`Objectif de missions en retard : ${g.value} sur ${g.goal}.`, `Mission goal behind: ${g.value} of ${g.goal}.`) : t(`Objectif de bénéfice en retard : ${ar(g.value)} sur ${ar(g.goal)}.`, `Profit goal behind: ${ar(g.value)} of ${ar(g.goal)}.`));
    if (fin.toCollect > 0) attention.push(t(`Reste à encaisser : ${ar(fin.toCollect)} (facturé ${ar(fin.billed)}, reçu ${ar(fin.received)}).`, `Left to collect: ${ar(fin.toCollect)} (billed ${ar(fin.billed)}, received ${ar(fin.received)}).`));
    if (fin.treasury < 0) attention.push(t(`Trésorerie négative : ${ar(fin.treasury)}.`, `Negative cash: ${ar(fin.treasury)}.`));
    const lowN = rows.filter(r => r.low).length;
    if (lowN) attention.push(t(`Stock bas : ${lowN} produit${lowN > 1 ? 's' : ''} sous le seuil.`, `Low stock: ${lowN} product${lowN > 1 ? 's' : ''} under the threshold.`));
    if (stats.cur.workers > 0 && stats.team.idle.length) attention.push(t(`${stats.team.idle.length} personne${stats.team.idle.length > 1 ? 's' : ''} sans mission ce mois-ci.`, `${stats.team.idle.length} ${stats.team.idle.length > 1 ? 'people' : 'person'} with no mission this month.`));
    if (stats.salary.pendingAdvanceCount > 0) attention.push(t(`${stats.salary.pendingAdvanceCount} avance${stats.salary.pendingAdvanceCount > 1 ? 's' : ''} en attente (${ar(stats.salary.pendingAdvanceAr)}).`, `${stats.salary.pendingAdvanceCount} pending advance${stats.salary.pendingAdvanceCount > 1 ? 's' : ''} (${ar(stats.salary.pendingAdvanceAr)}).`));
    if (fin.done > 0 && fin.billed === 0) attention.push(t('Le prix client vaut 0 : le facturé et les marges ne peuvent pas être calculés (Réglages > Missions).', 'Client price is 0: billed amount and margins cannot be computed (Settings > Missions).'));
  }
  if (!strengths.length) strengths.push(empty ? t('Mois à venir : rien à analyser.', 'Upcoming month: nothing to analyse.') : t('Aucun point fort net ce mois-ci (pas assez de données).', 'No clear strength this month (not enough data).'));
  if (!attention.length) attention.push(empty ? t('Mois à venir : rien à analyser.', 'Upcoming month: nothing to analyse.') : t('Aucun point d\'attention ce mois-ci.', 'No point of attention this month.'));

  return {
    lang: i.lang, title: t('Rapport mensuel', 'Monthly report'), month: periodLabel('month', i.anchor, i.lang), inProgress: rg.inProgress,
    company: String(i.companyName || '').trim().slice(0, 80),
    stats, fin, finPrev, goals, forecast, alerts,
    stock: { rows, value: stockValue(rows) }, cashLines,
    strengths: strengths.slice(0, 3), attention: attention.slice(0, 3),
  };
}

// ---------- Export Excel : un onglet par section ----------

export interface SheetData { name: string; rows: (string | number)[][] }

export function exportSheets(r: Report): SheetData[] {
  const t = (fr: string, en: string) => (r.lang === 'en' ? en : fr);
  const { stats: st, fin, finPrev } = r;
  const sheets: SheetData[] = [];
  sheets.push({ name: t('Résumé', 'Summary'), rows: [
    [r.title, r.month],
    ...(r.company ? [[r.company]] : []),
    [],
    [t('Chiffre', 'Figure'), t('Ce mois', 'This month'), t('Mois d\'avant', 'Previous month')],
    [t('Missions validées', 'Validated missions'), st.cur.done, st.prev.done],
    [t('Missions refusées', 'Rejected missions'), st.cur.rejected, st.prev.rejected],
    [t('Taux de validation (%)', 'Validation rate (%)'), st.cur.rate ?? '', st.prev.rate ?? ''],
    [t('Argent reçu (Ar)', 'Money received (Ar)'), fin.received, finPrev.received],
    [t('Dépenses saisies (Ar)', 'Recorded expenses (Ar)'), fin.spent, finPrev.spent],
    [t('Salaires (Ar)', 'Salaries (Ar)'), fin.salaries, finPrev.salaries],
    [t('Bénéfice net (Ar)', 'Net profit (Ar)'), fin.profit, finPrev.profit],
    [t('Marge (%)', 'Margin (%)'), fin.marginPct ?? '', finPrev.marginPct ?? ''],
    [t('Facturé (Ar)', 'Billed (Ar)'), fin.billed, finPrev.billed],
    [t('À encaisser (Ar)', 'To collect (Ar)'), fin.toCollect, finPrev.toCollect],
    [t('Trésorerie (Ar)', 'Cash on hand (Ar)'), fin.treasury, ''],
    [],
    [t('Points forts', 'Strengths'), ...r.strengths],
    [t('Points d\'attention', 'Points of attention'), ...r.attention],
  ] });
  sheets.push({ name: t('Missions', 'Missions'), rows: [
    [t('Repère', 'Slot'), t('Missions faites', 'Missions done'), t('Gagné (Ar)', 'Earned (Ar)'), t('Période d\'avant', 'Previous period')],
    ...st.labels.map((l, k) => [l, st.series.done[k] ?? 0, st.series.earned[k] ?? 0, st.series.prevDone[k] ?? 0]),
    [],
    [t('Type de mission', 'Mission type'), t('Missions', 'Missions')],
    ...st.byType.map(x => [x.label, x.count]),
  ] });
  sheets.push({ name: t('Équipe', 'Team'), rows: [
    [t('Nom', 'Name'), t('Missions', 'Missions'), t('Gagné (Ar)', 'Earned (Ar)'), t('Minutes sur missions', 'Minutes on missions')],
    ...st.team.ranking.map(x => [x.name, x.done, x.earned, x.workMin]),
  ] });
  sheets.push({ name: t('Salaires', 'Salaries'), rows: [
    [t('Chiffre', 'Figure'), t('Valeur (Ar)', 'Value (Ar)')],
    [t('Salaires gagnés', 'Salaries earned'), st.cur.earned],
    [t('Avances accordées', 'Advances granted'), st.cur.advances],
    [t('Avances en attente', 'Pending advances'), st.salary.pendingAdvanceAr],
  ] });
  sheets.push({ name: 'Finances', rows: [
    [t('Date', 'Date'), t('Sens', 'Direction'), t('Catégorie', 'Category'), t('Montant (Ar)', 'Amount (Ar)'), t('Client', 'Client'), t('Note', 'Note')],
    ...r.cashLines.map(e => [e.date, e.kind === 'in' ? t('Entrée', 'In') : t('Sortie', 'Out'), e.category, e.amount_ar, e.client_name || '', e.note || '']),
    [],
    [t('Dépenses par catégorie', 'Expenses by category'), t('Montant (Ar)', 'Amount (Ar)')],
    ...fin.expensesByCategory.map(x => [x.label, x.value]),
    [],
    [t('Marge par type', 'Margin by type'), t('Missions', 'Missions'), t('Facturé (Ar)', 'Billed (Ar)'), t('Salaires (Ar)', 'Salaries (Ar)'), t('Marge (Ar)', 'Margin (Ar)')],
    ...fin.byType.map(x => [x.type, x.done, x.billed, x.salaries, x.margin]),
  ] });
  sheets.push({ name: 'Stock', rows: [
    [t('Produit', 'Product'), t('Quantité', 'Quantity'), t('Unité', 'Unit'), t('Valeur (Ar)', 'Value (Ar)'), t('Seuil', 'Threshold'), t('Bas', 'Low')],
    ...r.stock.rows.map(x => [x.product.name, x.qty, x.product.unit, x.value, x.product.alert_threshold, x.low ? t('oui', 'yes') : t('non', 'no')]),
    [],
    [t('Valeur totale (Ar)', 'Total value (Ar)'), r.stock.value],
  ] });
  sheets.push({ name: t('Objectifs', 'Goals'), rows: [
    [t('Objectif', 'Goal'), t('Cible', 'Target'), t('Réalisé', 'Actual'), t('Avancement (%)', 'Progress (%)')],
    ...r.goals.map(g => [g.key === 'missions' ? t('Missions', 'Missions') : g.key === 'profit' ? t('Bénéfice (Ar)', 'Profit (Ar)') : t('Dépenses max (Ar)', 'Max expenses (Ar)'), g.goal, g.value, g.pct]),
    [],
    r.forecast ? [t('Prévision fin de mois (linéaire)', 'End-of-month forecast (linear)'), t('Missions', 'Missions'), r.forecast.missions, t('Bénéfice (Ar)', 'Profit (Ar)'), r.forecast.profit] : [t('Prévision fin de mois', 'End-of-month forecast'), t('pas assez de jours écoulés', 'not enough days elapsed')],
  ] });
  sheets.push({ name: t('Alertes', 'Alerts'), rows: [[t('Alerte', 'Alert')], ...(r.alerts.length ? r.alerts.map(a => [r.lang === 'en' ? a.en : a.fr]) : [[t('Aucune alerte', 'No alert')]])] });
  return sheets;
}

/** Fichier Excel (bibliothèque xlsx chargée seulement au clic). */
export async function downloadReportExcel(r: Report, anchor: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of exportSheets(r)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows.length ? sh.rows : [['']]), sh.name.slice(0, 31));
  XLSX.writeFile(wb, `rapport-${anchor.slice(0, 7)}.xlsx`);
}

// ---------- Page imprimable (PDF : « Imprimer » puis « Enregistrer en PDF ») ----------

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Page HTML complète, claire, faite pour l'impression (aucun script, tout est échappé). */
export function reportHtml(r: Report): string {
  const t = (fr: string, en: string) => (r.lang === 'en' ? en : fr);
  const { stats: st, fin, finPrev } = r;
  const delta = (cur: number, prev: number) => { const v = variation(cur, prev); return v.pct === null ? '–' : pctTxt(v.pct); };
  const row = (label: string, cur: string, prev: string, d: string) => `<tr><td>${esc(label)}</td><td class="n">${esc(cur)}</td><td class="n">${esc(prev)}</td><td class="n">${esc(d)}</td></tr>`;
  const bars = (vals: number[], labels: string[], color: string) => {
    const max = Math.max(1, ...vals);
    return `<div class="bars">${vals.map((v, k) => `<div class="b" title="${esc(labels[k])}: ${v}"><i style="height:${Math.round((v / max) * 100)}%;background:${color}"></i></div>`).join('')}</div><div class="ax"><span>${esc(labels[0] ?? '')}</span><span>${esc(labels[labels.length - 1] ?? '')}</span></div>`;
  };
  const goalLine = (g: GoalRow) => {
    const name = g.key === 'missions' ? t('Missions', 'Missions') : g.key === 'profit' ? t('Bénéfice', 'Profit') : t('Dépenses maximum', 'Maximum expenses');
    const money = g.key !== 'missions';
    const col = g.state === 'over' ? '#b91c1c' : g.state === 'warn' ? '#b45309' : '#047857';
    return `<div class="g"><div class="gl"><b>${esc(name)}</b><span>${esc(money ? ar(g.value) : g.value)} / ${esc(money ? ar(g.goal) : g.goal)} (${g.pct} %)</span></div><div class="gb"><i style="width:${Math.min(100, g.pct)}%;background:${col}"></i></div></div>`;
  };
  return `<!doctype html><html lang="${r.lang}"><head><meta charset="utf-8"><title>${esc(r.title)} — ${esc(r.month)}</title><style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;margin:0;padding:24px;font-size:13px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px}.sub{color:#475569;margin-bottom:8px}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:left}th{background:#f1f5f9;font-size:12px}.n{text-align:right;white-space:nowrap}
ul{margin:4px 0 0 18px;padding:0}li{margin:2px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ok h2{color:#047857}.warn h2{color:#b45309}
.bars{display:flex;align-items:flex-end;gap:2px;height:90px;border-bottom:1px solid #94a3b8}.b{flex:1;height:100%;display:flex;align-items:flex-end}.b i{display:block;width:100%;min-height:1px}.ax{display:flex;justify-content:space-between;font-size:10px;color:#64748b}
.g{margin:6px 0}.gl{display:flex;justify-content:space-between;gap:8px}.gb{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden}.gb i{display:block;height:100%}
.note{color:#64748b;font-size:11px;margin-top:14px}@media print{body{padding:0}h2,table,.two{break-inside:avoid}}@page{margin:14mm}
</style></head><body>
${r.company ? `<div class="sub"><b>${esc(r.company)}</b></div>` : ''}<h1>${esc(r.title)}</h1><div class="sub">${esc(r.month)}${r.inProgress ? ' — ' + esc(t('mois en cours', 'month in progress')) : ''}</div>
<h2>${esc(t('Résumé', 'Summary'))}</h2>
<table><tr><th></th><th class="n">${esc(t('Ce mois', 'This month'))}</th><th class="n">${esc(t('Mois d\'avant', 'Previous month'))}</th><th class="n">${esc(t('Écart', 'Change'))}</th></tr>
${row(t('Missions validées', 'Validated missions'), String(st.cur.done), String(st.prev.done), delta(st.cur.done, st.prev.done))}
${row(t('Taux de validation', 'Validation rate'), st.cur.rate === null ? '–' : `${st.cur.rate} %`, st.prev.rate === null ? '–' : `${st.prev.rate} %`, st.cur.rate !== null && st.prev.rate !== null ? `${st.cur.rate - st.prev.rate > 0 ? '+' : ''}${st.cur.rate - st.prev.rate} pts` : '–')}
${row(t('Argent reçu', 'Money received'), ar(fin.received), ar(finPrev.received), delta(fin.received, finPrev.received))}
${row(t('Dépenses et salaires', 'Expenses and salaries'), ar(fin.totalOut), ar(finPrev.totalOut), delta(fin.totalOut, finPrev.totalOut))}
${row(t('Bénéfice net', 'Net profit'), ar(fin.profit), ar(finPrev.profit), delta(fin.profit, finPrev.profit))}
${row(t('Marge', 'Margin'), fin.marginPct === null ? '–' : `${fin.marginPct} %`, finPrev.marginPct === null ? '–' : `${finPrev.marginPct} %`, '')}
${row(t('À encaisser', 'To collect'), ar(fin.toCollect), ar(finPrev.toCollect), '')}
${row(t('Trésorerie', 'Cash on hand'), ar(fin.treasury), '', '')}</table>
<div class="two"><div class="ok"><h2>${esc(t('3 points forts', '3 strengths'))}</h2><ul>${r.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="warn"><h2>${esc(t('3 points d\'attention', '3 points of attention'))}</h2><ul>${r.attention.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
${r.goals.length ? `<h2>${esc(t('Objectifs du mois', 'Monthly goals'))}</h2>${r.goals.map(goalLine).join('')}` : ''}
${r.forecast ? `<h2>${esc(t('Prévision de fin de mois', 'End-of-month forecast'))}</h2><p>${esc(t(`À ce rythme (${r.forecast.day} jours sur ${r.forecast.daysInMonth}) : environ ${r.forecast.missions} missions et ${ar(r.forecast.profit)} de bénéfice. Calcul simple (règle de trois) : ce n'est pas une certitude.`, `At this pace (${r.forecast.day} days of ${r.forecast.daysInMonth}): about ${r.forecast.missions} missions and ${ar(r.forecast.profit)} profit. Simple linear estimate: not a certainty.`))}</p>` : ''}
<h2>${esc(t('Missions validées par jour', 'Validated missions per day'))}</h2>${bars(st.series.done, st.labels, '#2563eb')}
<h2>${esc(t('Bénéfice cumulé', 'Cumulative profit'))}</h2>${bars(fin.series.cumulative.map(v => Math.max(0, v)), fin.labels, '#059669')}
<h2>${esc(t('Équipe (5 premiers)', 'Team (top 5)'))}</h2>
<table><tr><th>${esc(t('Nom', 'Name'))}</th><th class="n">${esc(t('Missions', 'Missions'))}</th><th class="n">${esc(t('Gagné', 'Earned'))}</th></tr>${st.team.ranking.slice(0, 5).map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.done}</td><td class="n">${esc(ar(x.earned))}</td></tr>`).join('') || `<tr><td colspan="3">–</td></tr>`}</table>
<h2>${esc(t('Marge par type de mission', 'Margin by mission type'))}</h2>
<table><tr><th>${esc(t('Type', 'Type'))}</th><th class="n">${esc(t('Missions', 'Missions'))}</th><th class="n">${esc(t('Marge', 'Margin'))}</th></tr>${fin.byType.map(x => `<tr><td>${esc(x.type)}</td><td class="n">${x.done}</td><td class="n">${esc(ar(x.margin))}${x.marginPct !== null ? ` (${x.marginPct} %)` : ''}</td></tr>`).join('') || `<tr><td colspan="3">–</td></tr>`}</table>
${r.alerts.length ? `<h2>${esc(t('Alertes', 'Alerts'))}</h2><ul>${r.alerts.map(a => `<li>${esc(r.lang === 'en' ? a.en : a.fr)}</li>`).join('')}</ul>` : ''}
<p class="note">${esc(t('Document confidentiel : il contient des chiffres d\'argent. Généré par Gestion Pro.', 'Confidential: contains money figures. Generated by Gestion Pro.'))}</p>
</body></html>`;
}
