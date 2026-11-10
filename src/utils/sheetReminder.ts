// Rappel « feuille du jour pas saisie » (M27.4, 2026-11-10). Règle pure : qui est prévenu, de combien de personnes sans ligne.
// Copiée dans df-api (bloc SHEETREMINDER) ; `npm run check:sheet-reminder` compare les deux. Le serveur ajoute seulement la lecture des données, l'envoi et « jamais deux fois ».
// ===== BEGIN SHEETREMINDER (M27.4 : copie exacte de src/utils/sheetReminder.ts ; contrôlée par scripts/check-sheet-reminder.ts) =====
const SR_MADA_OFFSET_MS = 3 * 3600 * 1000; // Madagascar : UTC+3, sans heure d'été
const SR_WINDOW_H = 3; // le rappel peut partir jusqu'à 3 heures après l'heure réglée (si la tâche planifiée a manqué un passage)
const SR_USE_DAYS = 14; // la feuille est « utilisée » si une ligne existe dans les 14 derniers jours
const srHour = (v: unknown): number => { const n = Number(v); return Number.isInteger(n) && n >= 12 && n <= 21 ? n : 18; };
export const srDayOffset = (date: string, delta: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
export const srLocal = (nowMs: number): { date: string; hour: number; weekday: number } => { const d = new Date(nowMs + SR_MADA_OFFSET_MS); return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay() }; };
/** Les identifiants à lire côté serveur : les lignes des 14 derniers jours. */
export const srDates = (today: string): string[] => Array.from({ length: SR_USE_DAYS }, (_, i) => srDayOffset(today, -i));
export interface SrUser { id: string; role?: string; status?: string; team?: string }
export interface SrLine { id?: unknown; status?: string }
/** `users` : tous les comptes ; `lines` : les lignes « we-… » des 14 derniers jours ; `settings` : réglages du site. Rend la liste des personnes à prévenir (vide : rien à envoyer). */
export function sheetReminderPlan(users: SrUser[], lines: SrLine[], settings: any, nowMs: number): { date: string; notices: { to: string; count: number }[] } {
  const loc = srLocal(nowMs);
  const none = { date: loc.date, notices: [] as { to: string; count: number }[] };
  const work = (settings && settings.company && settings.company.work) || {};
  if (work.sheet_reminder === "off") return none;
  const h = srHour(work.sheet_reminder_hour);
  if (loc.hour < h || loc.hour >= h + SR_WINDOW_H) return none;
  const wd = Array.isArray(settings && settings.work_days) ? [...new Set((settings.work_days as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))] : [];
  if (!(wd.length ? wd : [1, 2, 3, 4, 5, 6]).includes(loc.weekday)) return none; // jour de repos
  const counted = (p: SrLine) => (p.status === "completed" || p.status === "pending_end") && typeof p.id === "string" && p.id.startsWith("we-");
  const since = srDayOffset(loc.date, -(SR_USE_DAYS - 1));
  const inUse = lines.some(p => counted(p) && (p.id as string).slice(3, 13) >= since && (p.id as string).slice(3, 13) <= loc.date);
  if (!inUse) return none; // la feuille du jour n'est pas utilisée : jamais de rappel
  const cleanTeam = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
  const missing = users.filter(u => u && u.role === "employee" && u.status !== "blocked" && !lines.some(p => counted(p) && (p.id as string).startsWith(`we-${loc.date}-${u.id}-`)));
  if (missing.length === 0) return none;
  const notices: { to: string; count: number }[] = [];
  for (const u of users) {
    if (!u || u.status === "blocked") continue;
    if (u.role === "admin") notices.push({ to: u.id, count: missing.length });
    else if (u.role === "team_lead") { const t = cleanTeam(u.team); const n = t ? missing.filter(m => cleanTeam(m.team) === t).length : 0; if (n > 0) notices.push({ to: u.id, count: n }); }
  }
  return { date: loc.date, notices };
}
// ===== END SHEETREMINDER =====
