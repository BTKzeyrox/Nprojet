// Rapport automatique (module 15, M15.5). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:auto-report`.
// Le responsable choisit : arrêté, chaque semaine (un jour) ou chaque mois (un jour), à une heure de Madagascar (UTC+3).
// À l'heure prévue, le serveur (tâche planifiée toutes les 15 min) crée UNE fiche « rapport » pour la période FINIE (semaine passée ou mois passé)
// et prévient le responsable. L'identifiant vient de la période : jamais de doublon, même si le serveur tourne deux fois.
// La copie figée (le texte du rapport) est posée UNE SEULE FOIS, à la première ouverture par le responsable, puis ne change plus.
// Une période manquée (serveur arrêté plus de 2 h) n'est PAS rattrapée. Aucun e-mail.
// Le serveur utilise le même code, copié mot pour mot dans le bloc AUTOREPORT de df-api ; `check:auto-report` compare les deux textes.

export type ReportFrequency = 'off' | 'weekly' | 'monthly';
export interface AutoReportSetting { frequency: ReportFrequency; weekday: number; month_day: number; time: string }
export type ReportKind = 'week' | 'month';
export interface ReportPeriod { id: string; kind: ReportKind; start: string; end: string }
export interface ReportRecord { id: string; kind: ReportKind; start: string; end: string; status: 'pending' | 'ready'; created_at: string; frozen_at?: string; html?: string }

export const AUTO_REPORT_DEFAULT: AutoReportSetting = { frequency: 'off', weekday: 1, month_day: 1, time: '08:00' };
export const AUTO_REPORT_LIMITS = { keep: 24, html: 400000 };
export const AUTO_REPORT_GRACE_MS = 2 * 60 * 60 * 1000; // la fiche se crée dans les 2 h qui suivent l'heure prévue
const ARP_OFFSET_H = 3;
const ARP_FREQUENCIES = ['off', 'weekly', 'monthly'];

const arpIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const arpIsTime = (s: unknown): boolean => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const arpDaysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const arpWeekday = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };
const arpAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const arpScheduledMs = (ymd: string, time: string): number => { const [y, m, d] = ymd.split('-').map(Number); const [hh, mm] = time.split(':').map(Number); return Date.UTC(y, m - 1, d, hh - ARP_OFFSET_H, mm); };
const arpMadagascarDate = (nowMs: number): string => new Date(nowMs + ARP_OFFSET_H * 3600000).toISOString().slice(0, 10);

/** Nettoie le réglage reçu : une valeur fausse devient la valeur de départ, jamais d'erreur. Rien reçu = arrêté. */
export function cleanAutoReport(raw: unknown): AutoReportSetting {
  const out: AutoReportSetting = { ...AUTO_REPORT_DEFAULT };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.frequency === 'string' && ARP_FREQUENCIES.includes(r.frequency)) out.frequency = r.frequency as ReportFrequency;
  if (typeof r.weekday === 'number' && Number.isInteger(r.weekday) && r.weekday >= 1 && r.weekday <= 7) out.weekday = r.weekday;
  if (typeof r.month_day === 'number' && Number.isInteger(r.month_day) && r.month_day >= 1 && r.month_day <= 31) out.month_day = r.month_day;
  if (arpIsTime(r.time)) out.time = r.time as string;
  return out;
}

/** La période de l'identifiant (« w-2026-10-12 » = semaine du lundi 12 au dimanche 18 ; « m-2026-09 » = septembre 2026), ou null si l'identifiant est faux. */
export function periodFromId(id: unknown): ReportPeriod | null {
  if (typeof id !== 'string') return null;
  let m = /^w-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (m) {
    if (!arpIsDate(m[1]) || arpWeekday(m[1]) !== 1) return null; // une semaine commence toujours un lundi
    return { id, kind: 'week', start: m[1], end: arpAddDays(m[1], 6) };
  }
  m = /^m-(\d{4})-(\d{2})$/.exec(id);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null;
    return { id, kind: 'month', start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(arpDaysIn(y, mo)).padStart(2, '0')}` };
  }
  return null;
}

/** Vrai si le réglage tombe ce jour-là (date AAAA-MM-JJ). « Arrêté » ne tombe jamais. Le 31 tombe le dernier jour des mois plus courts. */
export function reportRunsOn(s: AutoReportSetting, ymd: string): boolean {
  if (!arpIsDate(ymd) || s.frequency === 'off') return false;
  if (s.frequency === 'weekly') return arpWeekday(ymd) === s.weekday;
  const [y, m, d] = ymd.split('-').map(Number);
  return d === Math.min(s.month_day, arpDaysIn(y, m));
}

/** La période FINIE que couvre un rapport lancé ce jour-là : la semaine d'avant (lundi à dimanche) ou le mois d'avant. */
export function periodForRun(s: AutoReportSetting, ymd: string): ReportPeriod | null {
  if (!arpIsDate(ymd) || s.frequency === 'off') return null;
  if (s.frequency === 'weekly') {
    const thisMonday = arpAddDays(ymd, -(arpWeekday(ymd) - 1));
    return periodFromId(`w-${arpAddDays(thisMonday, -7)}`);
  }
  const [y, m] = ymd.split('-').map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return periodFromId(`m-${py}-${String(pm).padStart(2, '0')}`);
}

/** Le rapport à créer maintenant : réglage actif, jour concerné, heure prévue passée depuis moins de 2 h. Sinon null. */
export function dueReport(s: AutoReportSetting, nowMs: number, graceMs: number = AUTO_REPORT_GRACE_MS): (ReportPeriod & { run_date: string; at: number }) | null {
  if (s.frequency === 'off') return null;
  const today = arpMadagascarDate(nowMs);
  for (const date of [arpAddDays(today, -1), today]) {
    if (!reportRunsOn(s, date)) continue;
    const at = arpScheduledMs(date, s.time);
    if (nowMs >= at && nowMs < at + graceMs) { const p = periodForRun(s, date); if (p) return { ...p, run_date: date, at }; }
  }
  return null;
}

/** Prochaine exécution après `nowMs` (millisecondes UTC), ou null (arrêté). */
export function nextAutoReport(s: AutoReportSetting, nowMs: number): number | null {
  if (s.frequency === 'off') return null;
  let day = arpMadagascarDate(nowMs);
  for (let i = 0; i < 400; i++, day = arpAddDays(day, 1)) {
    if (!reportRunsOn(s, day)) continue;
    const at = arpScheduledMs(day, s.time);
    if (at > nowMs) return at;
  }
  return null;
}

export type ReportRecordError = 'format' | 'id' | 'status' | 'date' | 'html';

/** Vérifie une fiche de rapport. L'identifiant décide de tout : type, début et fin sont recalculés, jamais crus. Une fiche prête demande un texte (400 000 signes au plus). */
export function checkReportRecord(d: unknown): { ok: true; value: ReportRecord } | { ok: false; error: ReportRecordError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  const r = d as Record<string, unknown>;
  if (['__proto__', 'constructor', 'prototype'].some((k) => Object.prototype.hasOwnProperty.call(r, k))) return { ok: false, error: 'format' };
  const p = periodFromId(r.id);
  if (!p) return { ok: false, error: 'id' };
  if (r.status !== 'pending' && r.status !== 'ready') return { ok: false, error: 'status' };
  if (typeof r.created_at !== 'string' || Number.isNaN(Date.parse(r.created_at))) return { ok: false, error: 'date' };
  const value: ReportRecord = { id: p.id, kind: p.kind, start: p.start, end: p.end, status: r.status, created_at: new Date(r.created_at).toISOString() };
  if (r.status === 'ready') {
    if (typeof r.frozen_at !== 'string' || Number.isNaN(Date.parse(r.frozen_at))) return { ok: false, error: 'date' };
    if (typeof r.html !== 'string' || !r.html.trim() || r.html.length > AUTO_REPORT_LIMITS.html) return { ok: false, error: 'html' };
    value.frozen_at = new Date(r.frozen_at).toISOString();
    value.html = r.html;
  } else if (r.html !== undefined || r.frozen_at !== undefined) return { ok: false, error: 'status' };
  return { ok: true, value };
}

/** Fige la copie : une fiche « en attente » devient « prête » avec son texte. Une fiche déjà prête ne change JAMAIS (null). */
export function freezeReport(existing: ReportRecord | null | undefined, html: unknown, nowIso: string): ReportRecord | null {
  if (!existing || existing.status === 'ready') return null;
  if (typeof html !== 'string' || !html.trim() || html.length > AUTO_REPORT_LIMITS.html) return null;
  return { ...existing, status: 'ready', frozen_at: nowIso, html };
}

/** Les fiches à garder : les 24 plus récentes (par fin de période, puis identifiant). Rend les identifiants à supprimer. */
export function reportsToPrune(list: { id: string; end?: string }[], keep: number = AUTO_REPORT_LIMITS.keep): string[] {
  const rows = list.map((r) => ({ id: r.id, end: periodFromId(r.id)?.end || '' })).sort((a, b) => b.end.localeCompare(a.end) || b.id.localeCompare(a.id));
  return rows.slice(keep).map((r) => r.id);
}

/** Texte de la notification (FR et EN) pour une période. */
export function reportNotice(p: ReportPeriod): { fr: { title: string; body: string }; en: { title: string; body: string } } {
  const week = p.kind === 'week';
  return {
    fr: { title: week ? 'Rapport de la semaine prêt' : 'Rapport du mois prêt', body: `Période du ${p.start} au ${p.end}. Ouvre Statistiques > Rapport.` },
    en: { title: week ? 'Weekly report ready' : 'Monthly report ready', body: `Period ${p.start} to ${p.end}. Open Statistics > Report.` },
  };
}

const ARP_DAYS_FR = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const ARP_DAYS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Phrase courte : « Arrêté », « Chaque lundi à 08:00 », « Le 1er de chaque mois à 08:00 ». */
export function describeAutoReport(s: AutoReportSetting, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  if (s.frequency === 'off') return fr ? 'Arrêté' : 'Off';
  if (s.frequency === 'weekly') return fr ? `Chaque ${ARP_DAYS_FR[s.weekday]} à ${s.time}` : `Every ${ARP_DAYS_EN[s.weekday]} at ${s.time}`;
  return fr ? `Le ${s.month_day}${s.month_day === 1 ? 'er' : ''} de chaque mois à ${s.time}` : `On day ${s.month_day} of each month at ${s.time}`;
}
