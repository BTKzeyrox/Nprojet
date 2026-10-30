// Assistant « Admin IA Pro », niveau A (module 11, M11.10) : AUCUNE IA externe, que des règles et des calculs faits dans le navigateur de l'admin.
// Il détecte, explique, résume, calcule et conseille ; il ne décide pas et n'agit pas (valider, payer, supprimer = boutons que l'admin confirme).
// Chaque réponse porte ses SOURCES (« d'après 42 missions du … ») ; s'il manque une donnée, il le dit. Pur : pas d'écran, pas de serveur. ADMIN SEULEMENT.
import type { HealthAlert, HealthGo } from './health/types';
import { severityRank } from './health/types';
import { explainFigure, FIGURE_IDS, type FigureId, type SnapshotInput, buildSnapshot } from './siteSnapshot';
import { findPage, SITE_MAP } from './siteKnowledge';
import { isLate } from './attendance';
import { normalizeName } from './clients';
import { periodRange } from './stats';
import { computeFinance } from './financeStats';
import { ADVICE, GENERIC_TIPS } from './advice';
import { isKnownView } from './health/menu';

export type Lang = 'fr' | 'en';
export interface Bi { fr: string; en: string }
export interface Reply {
  intent: string; // « morning », « todo », « page », « employee », « figure », « whatif », « help », « unknown »
  title: Bi; lines: Bi[]; // lignes de texte (une idée par ligne)
  actions: { label: Bi; go: HealthGo }[]; // boutons : ouvrent une page, ne font rien d'autre
  sources: Bi; // d'où viennent les chiffres
  empty?: boolean; // « rien à signaler »
}
const b = (fr: string, en: string): Bi => ({ fr, en });
const dmy = (d: string) => d.split('-').reverse().join('/');
const ar = (n: number, l: Lang) => `${Math.round(n).toLocaleString(l === 'en' ? 'en-US' : 'fr-FR').replace(/[  ]/g, ' ')} Ar`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ---------- Ce qui attend l'admin (sans les alertes) ----------
export interface Waiting { starts: number; ends: number; advances: number }
export const waiting = (i: SnapshotInput): Waiting => ({
  starts: i.posts.filter(p => p.status === 'pending_start').length,
  ends: i.posts.filter(p => p.status === 'pending_end').length,
  advances: i.advances.filter(a => a.status === 'pending').length,
});

export interface TodoItem { rank: number; text: Bi; go: HealthGo; why: Bi }
/** « Quoi faire maintenant ? » : les 3 actions les plus utiles. Urgent d'abord, puis ce qui attend une validation, puis « à voir ». Jamais plus de 3. */
export function nextActions(i: SnapshotInput, alerts: HealthAlert[], max = 3): TodoItem[] {
  const out: TodoItem[] = [];
  const w = waiting(i);
  for (const a of [...alerts].sort((x, y) => severityRank(x.severity) - severityRank(y.severity)).filter(x => x.severity === 'urgent')) out.push({ rank: 0, text: b(a.title_fr, a.title_en), go: a.go, why: b(a.why_fr, a.why_en) });
  const val = w.starts + w.ends;
  if (val > 0) out.push({ rank: 1, text: b(`Valider ${val} ${plural(val, 'étape de mission', 'étapes de mission')} en attente`, `Validate ${val} pending mission ${plural(val, 'step', 'steps')}`), go: { view: 'validations' }, why: b(`${w.starts} début(s) et ${w.ends} fin(s) attendent ta décision.`, `${w.starts} start(s) and ${w.ends} end(s) wait for your decision.`) });
  if (w.advances > 0) out.push({ rank: 1, text: b(`Répondre à ${w.advances} ${plural(w.advances, 'demande d\'avance', 'demandes d\'avance')}`, `Answer ${w.advances} advance ${plural(w.advances, 'request', 'requests')}`), go: { view: 'advances' }, why: b('Le salarié attend une réponse pour s\'organiser.', 'The employee is waiting for an answer to plan ahead.') });
  for (const a of alerts.filter(x => x.severity === 'watch')) out.push({ rank: 2, text: b(a.title_fr, a.title_en), go: a.go, why: b(a.why_fr, a.why_en) });
  const seen = new Set<string>(), uniq = out.filter(x => { const k = x.text.fr; if (seen.has(k)) return false; seen.add(k); return true; });
  return uniq.slice(0, Math.max(0, max));
}

/** Résumé du matin : classé par priorité. Rien à signaler = une seule ligne qui le dit (jamais de liste vide). */
export function morningSummary(i: SnapshotInput, alerts: HealthAlert[]): Reply {
  const snap = buildSnapshot({ ...i, alerts });
  const w = waiting(i), urgent = alerts.filter(a => a.severity === 'urgent'), watch = alerts.filter(a => a.severity === 'watch');
  const lines: Bi[] = [];
  for (const a of urgent) lines.push(b(`🔴 ${a.title_fr} : ${a.why_fr}`, `🔴 ${a.title_en}: ${a.why_en}`));
  if (w.starts + w.ends > 0) lines.push(b(`🟠 ${w.starts + w.ends} étape(s) de mission à valider (${w.starts} début, ${w.ends} fin).`, `🟠 ${w.starts + w.ends} mission step(s) to validate (${w.starts} start, ${w.ends} end).`));
  if (w.advances > 0) lines.push(b(`🟠 ${w.advances} demande(s) d'avance en attente.`, `🟠 ${w.advances} advance request(s) pending.`));
  for (const a of watch) lines.push(b(`🟡 ${a.title_fr}`, `🟡 ${a.title_en}`));
  const f = snap.finance;
  const figures = b(`Ce mois-ci : ${snap.missions.validated} mission(s) validée(s), ${ar(f.received, 'fr')} reçus, bénéfice ${ar(f.profit, 'fr')}.`, `This month: ${snap.missions.validated} validated mission(s), ${ar(f.received, 'en')} received, profit ${ar(f.profit, 'en')}.`);
  const empty = lines.length === 0;
  return {
    intent: 'morning', empty,
    title: b('Résumé du jour', 'Daily summary'),
    lines: empty ? [b('Rien à signaler : tout est dans les limites réglées.', 'Nothing to report: everything is within the set limits.'), figures] : [...lines, figures],
    actions: [...(urgent.length || watch.length ? [{ label: b('Voir la Santé du site', 'Open Site health'), go: { view: 'health' } }] : []), ...(w.starts + w.ends > 0 ? [{ label: b('Ouvrir Validations', 'Open Validations'), go: { view: 'validations' } }] : [])],
    sources: b(`d'après ${i.posts.length} missions, ${i.cash.length} lignes d'argent et ${alerts.length} alerte(s), au ${dmy(i.today)}`, `based on ${i.posts.length} missions, ${i.cash.length} money lines and ${alerts.length} alert(s), on ${i.today}`),
  };
}

export function todoReply(i: SnapshotInput, alerts: HealthAlert[]): Reply {
  const items = nextActions(i, alerts);
  return {
    intent: 'todo', empty: items.length === 0, title: b('Quoi faire maintenant ?', 'What to do now?'),
    lines: items.length ? items.map((x, k) => b(`${k + 1}. ${x.text.fr} (${x.why.fr})`, `${k + 1}. ${x.text.en} (${x.why.en})`)) : [b('Rien d\'urgent : tu peux souffler.', 'Nothing urgent: you can relax.')],
    actions: items.map(x => ({ label: b(x.text.fr, x.text.en), go: x.go })),
    sources: b(`d'après ${alerts.length} alerte(s) et les validations en attente, au ${dmy(i.today)}`, `based on ${alerts.length} alert(s) and pending validations, on ${i.today}`),
  };
}

/** « Explique-moi cette page » : la fiche de la carte du site. */
export function explainPage(pageId: string): Reply {
  const p = findPage(pageId);
  if (!p) return { intent: 'page', title: b('Page inconnue', 'Unknown page'), lines: [b('Je ne connais pas cette page.', 'I do not know this page.')], actions: [], sources: b('carte du site', 'site map') };
  return {
    intent: 'page', title: p.title,
    lines: [p.purpose, ...p.howto.map((h, k) => b(`${k + 1}. ${h.fr}`, `${k + 1}. ${h.en}`)), ...p.rules.map(r => b(`• ${r.fr}`, `• ${r.en}`)), ...p.figures.map(f => b(`${f.name.fr} = ${f.formula.fr}`, `${f.name.en} = ${f.formula.en}`))],
    actions: p.id === 'health' || p.audience === 'employee' ? [] : [{ label: b(`Ouvrir ${p.title.fr}`, `Open ${p.title.en}`), go: { view: p.id } }],
    sources: b('carte du site (fiche de la page)', 'site map (page card)'),
  };
}


// ---------- Liste de l'équipe (calculée ici, aucun nom ne sort du navigateur) ----------
export function teamReply(i: SnapshotInput): Reply {
  const r = periodRange('month', i.today), inR = (d: string) => d >= r.start && d <= r.end;
  const emps = i.users.filter(u => u.role === 'employee' && (u.status === undefined || u.status === 'active')).sort((a, c) => a.name.localeCompare(c.name));
  const sources = b(`d'après la liste des employés actifs et les missions validées du ${dmy(r.start)} au ${dmy(r.end)}`, `based on the active employees list and missions validated from ${dmy(r.start)} to ${dmy(r.end)}`);
  if (emps.length === 0) return { intent: 'team', empty: true, title: b('Équipe', 'Team'), lines: [b('Aucun employé actif pour le moment.', 'No active employee for now.')], actions: [{ label: b('Ouvrir Opérateurs et sessions', 'Open Operators and sessions'), go: { view: 'employees' } }], sources };
  const count = (id: string) => i.posts.filter(p => p.employee_id === id && p.status === 'completed' && inR(p.date)).length;
  return {
    intent: 'team', title: b(`Équipe : ${emps.length} employé${emps.length > 1 ? 's' : ''} actif${emps.length > 1 ? 's' : ''}`, `Team: ${emps.length} active employee${emps.length > 1 ? 's' : ''}`),
    lines: emps.map(u => { const n = count(u.id); return b(`• ${u.name} : ${n} mission${n > 1 ? 's' : ''} validée${n > 1 ? 's' : ''} ce mois`, `• ${u.name}: ${n} mission${n === 1 ? '' : 's'} validated this month`); }),
    actions: [{ label: b('Ouvrir Employés', 'Open Employees'), go: { view: 'employees' } }], sources,
  };
}


// ---------- Suggestions de solutions (une piste par type d'alerte, jamais d'accusation) ----------
export function suggestionsReply(i: SnapshotInput, alerts: HealthAlert[]): Reply {
  const sources = b(`d'après ${alerts.length} alerte(s) de la Santé du site au ${dmy(i.today)}`, `based on ${alerts.length} Site health alert(s) on ${dmy(i.today)}`);
  const groups = new Map<string, HealthAlert[]>();
  for (const a of [...alerts].sort((x, y) => severityRank(x.severity) - severityRank(y.severity))) { if (a.severity === 'info') continue; const k = ADVICE[a.rule] ? a.rule : `page:${a.page}`; groups.set(k, [...(groups.get(k) || []), a]); }
  const top = [...groups.entries()].slice(0, 4);
  if (top.length === 0) {
    return { intent: 'suggest', empty: true, title: b('Suggestions', 'Suggestions'), lines: [b('Rien d\'urgent à corriger pour le moment, bravo. Des idées pour garder le cap :', 'Nothing urgent to fix right now, well done. Ideas to keep on track:'), ...GENERIC_TIPS.map(g => b(`• ${g.fr}`, `• ${g.en}`))], actions: [], sources };
  }
  const lines: Bi[] = [], actions: Reply['actions'] = [];
  top.forEach(([k, list], n) => {
    const first = list[0], adv = ADVICE[k];
    const count = list.length > 1 ? ` (${list.length})` : '';
    lines.push(b(`${n + 1}. ${first.title_fr}${count}`, `${n + 1}. ${first.title_en}${count}`));
    lines.push(adv ? b(`→ ${adv.fr}`, `→ ${adv.en}`) : b('→ Ouvre la page concernée et regarde le détail de l\'alerte.', '→ Open the page concerned and look at the alert details.'));
    if (actions.length < 3 && isKnownView(first.go.view)) actions.push({ label: b(`Ouvrir : ${first.title_fr}`.slice(0, 48), `Open: ${first.title_en}`.slice(0, 48)), go: first.go });
  });
  return { intent: 'suggest', title: b('Mes suggestions', 'My suggestions'), lines, actions, sources };
}

// ---------- Liens vers les pages citées dans un texte (réponse de l'IA) ----------
/** Les pages du site citées entre guillemets « … » dans un texte : au plus 3, sans doublon. Seuls les noms exacts des pages de l'admin comptent. */
/** Anciens noms de pages que l'assistant ou un texte peut encore citer (une page renommée ne doit pas casser ses liens). */
const PAGE_ALIASES: Record<string, string[]> = { employees: ['Employés', 'Employees', 'Gestion des Opérateurs', 'Operator management'] }; // « Suivi des sessions » reste le nom de la page « Mission en cours / Suivi des sessions » (2e onglet de la page fusionnée)
export function pageLinks(text: string, lang: Lang): { label: Bi; go: HealthGo }[] {
  const out: { label: Bi; go: HealthGo }[] = [];
  const quoted = [...String(text || '').matchAll(/[«"“]\s*([^»"”\n]{2,40}?)\s*[»"”]/g)].map(m => normalizeName(m[1]));
  for (const q of quoted) {
    const page = SITE_MAP.find(p => p.audience !== 'employee' && isKnownView(p.id) && [p.title.fr, p.title.en, ...p.title.fr.split('/'), ...p.title.en.split('/'), ...(PAGE_ALIASES[p.id] || [])].some(x => normalizeName(x) === q));
    if (page && !out.some(o => o.go.view === page.id)) out.push({ label: b(`Ouvrir ${page.title.fr}`, `Open ${page.title.en}`), go: { view: page.id } });
    if (out.length >= 3) break;
  }
  return out;
}

// ---------- Récap d'un employé ----------
export interface EmployeeRecap {
  found: boolean; name: string; status: string; badge: string | null;
  first_date: string | null; last_date: string | null; tenure_days: number | null; tenure_text: Bi;
  validated: number; rejected: number; open: number; acceptance_pct: number | null;
  late_days: number; earned_ar: number; advances_approved_ar: number; advances_pending_ar: number; advances_pending: number;
  missions_30d: number;
}
const days = (a: string, b2: string) => Math.round((Date.parse(`${b2}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const tenure = (d: number | null): Bi => {
  if (d === null) return b('ancienneté inconnue (aucune mission)', 'tenure unknown (no mission)');
  if (d < 0) return b('date à vérifier', 'date to check');
  if (d === 0) return b('arrivé aujourd\'hui', 'joined today');
  if (d < 60) return b(`${d} jour(s)`, `${d} day(s)`);
  const m = Math.floor((d + 1) / 30.4375), y = Math.floor(m / 12), mm = m % 12;
  if (y === 0) return b(`${m} mois`, `${m} months`);
  return b(`${y} an(s)${mm ? ` et ${mm} mois` : ''}`, `${y} year(s)${mm ? ` and ${mm} months` : ''}`);
};
/** Récap d'un salarié : chiffres seulement, calculés ; jamais de jugement. `found:false` si l'identifiant n'existe pas. */
export function employeeRecap(i: SnapshotInput, userId: string): EmployeeRecap {
  const u = i.users.find(x => x.id === userId);
  if (!u) return { found: false, name: '', status: '', badge: null, first_date: null, last_date: null, tenure_days: null, tenure_text: tenure(null), validated: 0, rejected: 0, open: 0, acceptance_pct: null, late_days: 0, earned_ar: 0, advances_approved_ar: 0, advances_pending_ar: 0, advances_pending: 0, missions_30d: 0 };
  const mine = i.posts.filter(p => p.employee_id === userId && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') && p.date <= i.today);
  const dates = mine.map(p => p.date).sort();
  const joined = /^\d{4}-\d{2}-\d{2}$/.test(u.cv_data?.joinedDate || '') ? u.cv_data!.joinedDate : null;
  const first = joined && (!dates[0] || joined < dates[0]) ? joined : dates[0] || null;
  const done = mine.filter(p => p.status === 'completed'), rej = mine.filter(p => p.status === 'rejected');
  const cfg = { day_shift_start: i.settings?.day_shift_start || '08:00', night_shift_start: i.settings?.night_shift_start || '20:00', late_tolerance_min: typeof i.settings?.late_tolerance_min === 'number' ? i.settings.late_tolerance_min : 15 };
  const lateDays = new Set(mine.filter(p => p.status !== 'rejected' && p.status !== 'force_released' && isLate(p, cfg)).map(p => p.date)).size;
  const adv = i.advances.filter(a => a.employee_id === userId && Number.isFinite(a.amount_ar));
  const t = first ? days(first, i.today) : null;
  return {
    found: true, name: u.name, status: u.status, badge: u.performance_badge || null,
    first_date: first, last_date: dates.length ? dates[dates.length - 1] : null, tenure_days: t, tenure_text: tenure(t),
    validated: done.length, rejected: rej.length, open: mine.filter(p => ['pending_start', 'active', 'pending_end'].includes(p.status)).length,
    acceptance_pct: done.length + rej.length ? Math.round((done.length / (done.length + rej.length)) * 100) : null,
    late_days: lateDays, earned_ar: done.reduce((s, p) => s + Math.max(0, Math.round(typeof p.calculated_ar === 'number' ? p.calculated_ar : Number(i.settings?.price_per_mission) || 0)), 0),
    advances_approved_ar: adv.filter(a => a.status === 'approved').reduce((s, a) => s + a.amount_ar, 0), advances_pending_ar: adv.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount_ar, 0), advances_pending: adv.filter(a => a.status === 'pending').length,
    missions_30d: done.filter(p => days(p.date, i.today) <= 29).length,
  };
}
export const PRINT_PREFIX = '__print:';
const esc = (x: string) => x.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** Page imprimable du récap d'un salarié (HTML autonome, sans script) : mêmes chiffres que la réponse du chat. null si la personne n'existe pas. */
export function recapPrintHtml(i: SnapshotInput, userId: string, lang: Lang): string | null {
  const r = employeeRecap(i, userId);
  if (!r.found) return null;
  const fr = lang !== 'en', t = (a: string, c: string) => (fr ? a : c);
  const rows: [string, string][] = [
    [t('Ancienneté', 'Tenure'), (fr ? r.tenure_text.fr : r.tenure_text.en) + (r.first_date ? ` (${t('première trace le', 'first trace on')} ${fr ? dmy(r.first_date) : r.first_date})` : '')],
    [t('Missions validées', 'Validated missions'), String(r.validated)],
    [t('Missions refusées', 'Refused missions'), String(r.rejected)],
    [t('Acceptation', 'Acceptance'), r.acceptance_pct === null ? '—' : `${r.acceptance_pct} %`],
    [t('Validées sur 30 jours', 'Validated in 30 days'), String(r.missions_30d)],
    [t('Jours de retard', 'Late days'), String(r.late_days)],
    [t('Gagné (missions validées)', 'Earned (validated missions)'), ar(r.earned_ar, lang)],
    [t('Avances acceptées', 'Approved advances'), ar(r.advances_approved_ar, lang)],
    [t('Avances en attente', 'Pending advances'), `${r.advances_pending} (${ar(r.advances_pending_ar, lang)})`],
  ];
  if (r.badge) rows.push([t('Badge', 'Badge'), r.badge]);
  const date = fr ? dmy(i.today) : i.today;
  return `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t('Récap', 'Recap'))} ${esc(r.name)}</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px;margin:0 0 4px}p.s{color:#555;margin:0 0 16px;font-size:13px}table{width:100%;border-collapse:collapse}td{padding:8px 6px;border-bottom:1px solid #ccc;font-size:15px}td:last-child{text-align:right;font-weight:600}button{margin-top:16px;padding:10px 16px;font-size:15px}@media print{button{display:none}}</style></head><body><h1>${esc(t('Récap de', 'Recap of'))} ${esc(r.name)}</h1><p class="s">${esc(t('Au', 'On'))} ${esc(date)} · Gestion Pro</p><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p class="s">${esc(t('Chiffres calculés sur les missions et avances enregistrées.', 'Figures computed from recorded missions and advances.'))}</p><button onclick="window.print()">${esc(t('Imprimer', 'Print'))}</button></body></html>`;
}
export function employeeReply(i: SnapshotInput, userId: string): Reply {
  const r = employeeRecap(i, userId);
  if (!r.found) return { intent: 'employee', title: b('Employé introuvable', 'Employee not found'), lines: [b('Je ne trouve pas cette personne.', 'I cannot find this person.')], actions: [], sources: b('liste des employés', 'employee list'), empty: true };
  const L: Bi[] = [];
  L.push(b(`Ancienneté : ${r.tenure_text.fr}${r.first_date ? ` (première trace le ${dmy(r.first_date)})` : ''}.`, `Tenure: ${r.tenure_text.en}${r.first_date ? ` (first trace on ${r.first_date})` : ''}.`));
  L.push(r.validated + r.rejected === 0 ? b('Aucune mission jugée pour le moment.', 'No judged mission yet.') : b(`${r.validated} mission(s) validée(s), ${r.rejected} refusée(s) : acceptation ${r.acceptance_pct} %.`, `${r.validated} validated mission(s), ${r.rejected} refused: acceptance ${r.acceptance_pct}%.`));
  L.push(b(`${r.missions_30d} mission(s) validée(s) ces 30 derniers jours${r.last_date ? `, dernière activité le ${dmy(r.last_date)}` : ''}.`, `${r.missions_30d} validated mission(s) in the last 30 days${r.last_date ? `, last activity on ${r.last_date}` : ''}.`));
  L.push(b(`Retards : ${r.late_days} jour(s) en retard au total (tolérance comprise).`, `Lateness: ${r.late_days} day(s) late in total (tolerance included).`));
  L.push(b(`Gagné (missions validées) : ${ar(r.earned_ar, 'fr')}. Avances acceptées : ${ar(r.advances_approved_ar, 'fr')}${r.advances_pending ? `, ${r.advances_pending} en attente (${ar(r.advances_pending_ar, 'fr')})` : ''}.`, `Earned (validated missions): ${ar(r.earned_ar, 'en')}. Approved advances: ${ar(r.advances_approved_ar, 'en')}${r.advances_pending ? `, ${r.advances_pending} pending (${ar(r.advances_pending_ar, 'en')})` : ''}.`));
  if (r.badge) L.push(b(`Badge actuel : ${r.badge}.`, `Current badge: ${r.badge}.`));
  if (r.status !== 'active') L.push(b(`Compte : ${r.status}.`, `Account: ${r.status}.`));
  return {
    intent: 'employee', title: b(`Récap de ${r.name}`, `Recap of ${r.name}`), lines: L,
    actions: [{ label: b('Voir son calendrier', 'See their calendar'), go: { view: 'calendar' } }, { label: b('Voir la paie', 'See payroll'), go: { view: 'advances' } }, { label: b('Imprimer le récap', 'Print the recap'), go: { view: PRINT_PREFIX + userId } }],
    sources: b(`d'après ${r.validated + r.rejected + r.open} mission(s) et les avances de ${r.name}, au ${dmy(i.today)}`, `based on ${r.validated + r.rejected + r.open} mission(s) and ${r.name}'s advances, on ${i.today}`),
  };
}

// ---------- « Et si… ? » ----------
export interface WhatIfInput { clientPricePct?: number; salaryPct?: number; expensesPct?: number }
export interface WhatIfResult { base: { billed: number; salaries: number; spent: number; potentialProfit: number; potentialMarginPct: number | null }; next: { billed: number; salaries: number; spent: number; potentialProfit: number; potentialMarginPct: number | null }; period: { start: string; end: string }; missions: number }
/** Calcul simple sur le mois : on change un pourcentage et on regarde. « Bénéfice possible » = facturé − dépenses saisies − salaires (comme si tout le facturé était encaissé). */
export function whatIf(i: SnapshotInput, w: WhatIfInput): WhatIfResult {
  const r = periodRange('month', i.today);
  const f = computeFinance({ cash: i.cash, posts: i.posts, contracts: i.contracts, prices: { client_price_default_ar: i.settings?.client_price_default_ar, client_prices_by_type: i.settings?.client_prices_by_type } as any, pricePerMission: Number(i.settings?.price_per_mission) || 0, clients: i.clients as any }, 'month', r);
  const k = (p?: number) => 1 + (Number.isFinite(p as number) ? (p as number) : 0) / 100;
  const calc = (billed: number, salaries: number, spent: number) => { const profit = billed - spent - salaries; return { billed: Math.round(billed), salaries: Math.round(salaries), spent: Math.round(spent), potentialProfit: Math.round(profit), potentialMarginPct: billed > 0 ? Math.round((profit / billed) * 100) : null }; };
  return { base: calc(f.billed, f.salaries, f.spent), next: calc(f.billed * k(w.clientPricePct), f.salaries * k(w.salaryPct), f.spent * k(w.expensesPct)), period: { start: r.start, end: r.end }, missions: f.done };
}
export function whatIfReply(i: SnapshotInput, w: WhatIfInput): Reply {
  const r = whatIf(i, w), what: Bi[] = [];
  if (w.clientPricePct) what.push(b(`prix client ${w.clientPricePct > 0 ? '+' : ''}${w.clientPricePct} %`, `client price ${w.clientPricePct > 0 ? '+' : ''}${w.clientPricePct}%`));
  if (w.salaryPct) what.push(b(`salaires ${w.salaryPct > 0 ? '+' : ''}${w.salaryPct} %`, `salaries ${w.salaryPct > 0 ? '+' : ''}${w.salaryPct}%`));
  if (w.expensesPct) what.push(b(`dépenses ${w.expensesPct > 0 ? '+' : ''}${w.expensesPct} %`, `expenses ${w.expensesPct > 0 ? '+' : ''}${w.expensesPct}%`));
  if (!what.length) return { intent: 'whatif', title: b('Et si… ?', 'What if…?'), lines: [b('Dis-moi quoi changer, par exemple « et si je monte le prix client de 5 % ? ».', 'Tell me what to change, e.g. "what if I raise the client price by 5%?".')], actions: [], sources: b('calcul simple', 'simple calculation'), empty: true };
  if (r.missions === 0) return { intent: 'whatif', title: b('Et si… ?', 'What if…?'), lines: [b('Aucune mission validée ce mois-ci : je n\'ai rien à recalculer.', 'No validated mission this month: nothing to recalculate.')], actions: [], sources: b(`mois du ${dmy(r.period.start)} au ${dmy(r.period.end)}`, `month ${r.period.start} to ${r.period.end}`), empty: true };
  const m = (x: number | null) => (x === null ? '—' : `${x} %`);
  return {
    intent: 'whatif', title: b(`Et si… ${what.map(x => x.fr).join(' et ')} ?`, `What if… ${what.map(x => x.en).join(' and ')}?`),
    lines: [
      b(`Facturé : ${ar(r.base.billed, 'fr')} → ${ar(r.next.billed, 'fr')}.`, `Billed: ${ar(r.base.billed, 'en')} → ${ar(r.next.billed, 'en')}.`),
      b(`Bénéfice possible : ${ar(r.base.potentialProfit, 'fr')} → ${ar(r.next.potentialProfit, 'fr')} (marge ${m(r.base.potentialMarginPct)} → ${m(r.next.potentialMarginPct)}).`, `Possible profit: ${ar(r.base.potentialProfit, 'en')} → ${ar(r.next.potentialProfit, 'en')} (margin ${m(r.base.potentialMarginPct)} → ${m(r.next.potentialMarginPct)}).`),
      b('Bénéfice possible = facturé − dépenses saisies − salaires, comme si tout le facturé était encaissé. Ce n\'est pas une prévision : c\'est un calcul.', 'Possible profit = billed − recorded expenses − salaries, as if everything billed were collected. This is not a forecast: it is a calculation.'),
    ],
    actions: [], sources: b(`d'après ${r.missions} mission(s) validée(s) du ${dmy(r.period.start)} au ${dmy(r.period.end)}`, `based on ${r.missions} validated mission(s) from ${r.period.start} to ${r.period.end}`),
  };
}

// ---------- Comprendre une phrase tapée (règles simples, jamais de devinette) ----------
const PAGE_WORDS: [string, string[]][] = SITE_MAP.map(p => [p.id, [...p.title.fr.split('/'), ...p.title.en.split('/')].map(x => normalizeName(x)).concat(p.id.replace('-', ' '))]);
const FIGURE_WORDS: Record<FigureId, string[]> = {
  received: ['encaisse', 'argent recu', 'received', 'collected'], expenses: ['depenses', 'expenses'], salaries: ['salaires', 'salaries'], profit: ['benefice', 'profit'], margin: ['marge', 'margin'],
  billed: ['facture', 'billed'], toCollect: ['a encaisser', 'to collect'], treasury: ['tresorerie', 'cash on hand', 'treasury'], costPerMission: ['cout par mission', 'cost per mission'],
  gainPerMission: ['gain par mission', 'gain per mission'], stockValue: ['valeur du stock', 'stock value'], missionsDone: ['missions validees', 'validated missions'],
};
export type Intent =
  | { kind: 'morning' } | { kind: 'todo' } | { kind: 'help' }
  | { kind: 'page'; id: string } | { kind: 'suggest' } | { kind: 'team' } | { kind: 'employee'; id: string } | { kind: 'figure'; id: FigureId } | { kind: 'whatif'; w: WhatIfInput } | { kind: 'unknown' };

/** Cherche le pourcentage d'une phrase : « 5 % », « -10% », « de 5 pour cent ». Null si absent ou absurde (> 500). */
export function parsePct(t: string): number | null {
  const plain = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = /(-|\+|moins de |baisse de |baisser de |diminue de |reduce by |lower by |drop by )?\s*(\d{1,3}(?:[.,]\d+)?)\s*(%|pour ?cent|percent)/i.exec(plain);
  if (!m) return null;
  const v = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(v) || v > 500) return null;
  const neg = !!m[1] && /-|moins|baisse|baisser|diminue|reduce|lower|drop/i.test(m[1]);
  return neg ? -v : v;
}
export function detectIntent(text: string, i?: SnapshotInput): Intent {
  const raw = String(text || '').slice(0, 300), t = normalizeName(raw);
  if (!t) return { kind: 'unknown' };
  if (/\b(et si|what if)\b/.test(t)) {
    const pct = parsePct(raw);
    if (pct === null) return { kind: 'whatif', w: {} };
    const down = pct > 0 && !/\+\s*\d/.test(raw) && /baiss|diminu|reduc|moins|lower|drop|decreas|\bcut\b/.test(t), p = down ? -pct : pct; // « baissent de 10 % » = −10
    const w: WhatIfInput = /salaire|salary|salaries|paie/.test(t) ? { salaryPct: p } : /depense|expense|cout/.test(t) ? { expensesPct: p } : { clientPricePct: p };
    return { kind: 'whatif', w };
  }
  if (/\b(aide|help|que sais tu|que peux tu|what can you)\b/.test(t)) return { kind: 'help' };
  if (/\b(suggestion|suggestions|solution|solutions|conseil|conseils|conseille|conseilles|propose|proposes|idee|idees|suggest|advice|tips?|recommend)\b/.test(t) && !/\b(message|mail|rediger|ecris|write|draft)\b/.test(t)) return { kind: 'suggest' };
  if (/\b(quoi faire|que faire|what to do|todo|priorite|priority)\b/.test(t)) return { kind: 'todo' };
  if (/\b(resume|matin|morning|summary|recap du jour|point du jour)\b/.test(t)) return { kind: 'morning' };
  if (/\b(liste|lister|listez|montre|montrer|affiche|afficher|list|show|combien|how many|qui sont|who are)\b/.test(t) && /\b(employes?|operateurs?|equipe|operators?|team|employees|staff|personnel)\b/.test(t)) return { kind: 'team' };
  if (i) {
    const emps = i.users.filter(u => u.role === 'employee');
    const hits = emps.filter(u => { const n = normalizeName(u.name); return n.length >= 3 && (t.includes(n) || n.split(' ').some(part => part.length >= 3 && new RegExp(`\\b${part}\\b`).test(t))); });
    if (hits.length === 1) return { kind: 'employee', id: hits[0].id };
  }
  for (const id of FIGURE_IDS) { const words = FIGURE_WORDS[id]; if (/pourquoi|why|comment|how|calcul/.test(t) && words.some(w => t.includes(w))) return { kind: 'figure', id }; }
  if (/explique|expliquer|explain|page|a quoi sert|what is|how does/.test(t)) {
    const best = PAGE_WORDS.map(([id, ws]) => ({ id, score: Math.max(...ws.map(w => (w && t.includes(w) ? w.length : 0))) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0];
    if (best) return { kind: 'page', id: best.id };
  }
  return { kind: 'unknown' };
}

export function helpReply(): Reply {
  return {
    intent: 'help', title: b('Ce que je sais faire', 'What I can do'),
    lines: [
      b('• « Résumé du jour » : ce qui compte aujourd\'hui, par priorité.', '• "Daily summary": what matters today, by priority.'),
      b('• « Quoi faire maintenant ? » : les 3 actions les plus utiles.', '• "What to do now?": the 3 most useful actions.'),
      b('• « Explique la page Clients » : à quoi elle sert et comment l\'utiliser.', '• "Explain the Clients page": what it is for and how to use it.'),
      b('• « Suggestions » : des solutions simples pour chaque alerte en cours.', '• "Suggestions": simple solutions for each current alert.'),
      b('• « Liste les employés » : l\'équipe active et ses missions du mois.', '• "List the employees": the active team and their missions this month.'),
      b('• « Récap de Camille » : ses chiffres, sans jugement.', '• "Recap of Camille": their figures, without judgement.'),
      b('• « Pourquoi la marge ? » : la formule et les lignes du chiffre.', '• "Why the margin?": the formula and the lines behind the figure.'),
      b('• « Et si je monte le prix client de 5 % ? » : un calcul simple.', '• "What if I raise the client price by 5%?": a simple calculation.'),
      b('• Bouton « Rédiger un message » : un modèle à remplir (relance, remerciement…), que tu modifies avant de le copier.', '• "Write a message" button: a template to fill in (reminder, thanks…) that you edit before copying it.'),
      b('Je ne décide rien et je ne fais rien tout seul : tu valides, tu paies, tu supprimes toi-même. Je ne devine pas : s\'il manque une donnée, je le dis.', 'I decide nothing and do nothing by myself: you validate, pay and delete yourself. I do not guess: if data is missing, I say so.'),
    ],
    actions: [], sources: b('carte du site', 'site map'),
  };
}
export function unknownReply(): Reply {
  return { intent: 'unknown', empty: true, title: b('Je n\'ai pas compris', 'I did not understand'), lines: [b('Je ne devine pas. Essaie « résumé du jour », « quoi faire maintenant ? », « explique la page Clients », « récap de <prénom> » ou « pourquoi la marge ? ».', 'I do not guess. Try "daily summary", "what to do now?", "explain the Clients page", "recap of <name>" or "why the margin?".')], actions: [], sources: b('—', '—') };
}

/** Réponse complète à une phrase de l'admin. `alerts` = alertes visibles de la Santé du site. */
export function respond(text: string, i: SnapshotInput, alerts: HealthAlert[]): Reply {
  const it = detectIntent(text, i);
  switch (it.kind) {
    case 'morning': return morningSummary(i, alerts);
    case 'todo': return todoReply(i, alerts);
    case 'help': return helpReply();
    case 'page': return explainPage(it.id);
    case 'suggest': return suggestionsReply(i, alerts);
    case 'team': return teamReply(i);
    case 'employee': return employeeReply(i, it.id);
    case 'whatif': return whatIfReply(i, it.w);
    case 'figure': {
      const e = explainFigure(it.id, i);
      const val = e.value === null ? '—' : e.unit === 'Ar' ? ar(e.value, 'fr') : e.unit === '%' ? `${e.value} %` : String(e.value);
      const valEn = e.value === null ? '—' : e.unit === 'Ar' ? ar(e.value, 'en') : e.unit === '%' ? `${e.value}%` : String(e.value);
      return { intent: 'figure', title: b(`${e.name.fr} : ${val}`, `${e.name.en}: ${valEn}`), lines: [e.formula, ...e.parts.map(p => b(`${p.sign} ${p.label.fr} : ${p.value === null ? '—' : p.value}`, `${p.sign} ${p.label.en}: ${p.value === null ? '—' : p.value}`)), ...(e.missing ? [e.missing] : [])], actions: [{ label: b('Ouvrir Finances', 'Open Finance'), go: { view: 'stats', tab: 'finance' } }], sources: e.sources };
    }
    default: return unknownReply();
  }
}
