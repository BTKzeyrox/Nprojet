// Feuille du jour (module 26, M26.5a) : règles pures pour saisir présence, heures, quantité et refus d'employés qui n'ont pas de réseau. Pas d'écran ici.
// Le serveur (bloc WORKENTRY de df-api) a la même copie ; `npm run check:work-entry` les compare sur des milliers de feuilles.
import { postPayAr } from './postPay';
import { isOperator, sameTeam } from './roles';
const wePay = postPayAr;
// ===== BEGIN WORKENTRY =====
export const WE_MAX_LINES = 100;
export const WE_DAYS_BACK = 31;
const WE_PRESENCE = ["present", "late", "half", "absent"];
const weIsoDate = (s: unknown): boolean => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const weDayNo = (s: string): number => Math.round(new Date(s + "T00:00:00Z").getTime() / 86400000);
/** Aujourd'hui ou les 31 derniers jours ; jamais le futur, jamais un jour qui n'existe pas. */
export const weDateOk = (date: unknown, today: string): boolean => weIsoDate(date) && weIsoDate(today) && weDayNo(date as string) <= weDayNo(today) && weDayNo(today) - weDayNo(date as string) <= WE_DAYS_BACK;
/** Nombre tapé à la main : « 12 500 », « 12,5 ». Texte, négatif, « 1e3 », infini, trop grand : null. Vide : undefined (pas de valeur). */
const weNum = (v: unknown, max: number): number | null | undefined => {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return undefined;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") { const t = v.replace(/[\s  ]/g, "").replace(",", "."); if (!/^\d+(\.\d{1,2})?$/.test(t)) return null; n = Number(t); }
  else return null;
  if (!isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
};
/** Qui peut saisir pour qui : le responsable pour tout opérateur ; le Chef d'équipe pour les opérateurs de SON équipe (jamais lui-même) ; personne d'autre. */
export const weCanEnterFor = (me: any, emp: any): boolean => !!me && !!emp && isOperator(emp.role) && emp.id !== me.id && (me.role === "admin" || (me.role === "team_lead" && sameTeam(me, emp)));
const weSafe = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, "_");
/**
 * Une feuille du jour : { date, type_label?, lines: [{ employee_id, work_type, presence?, hours?, quantity?, rejected? }] }.
 * Renvoie { ok:false, error } si la feuille entière est refusée, sinon { ok:true, saved, failed, users, validated } : chaque ligne est enregistrée ou refusée avec son numéro et sa raison.
 * Un employé, un jour, un type de travail = UNE seule ligne (identifiant fixe) ; une ligne refusée avant peut être ressaisie.
 * Saisie du responsable : validée tout de suite (montant calculé maintenant). Saisie du Chef d'équipe : en attente du responsable (personne ne valide sa propre saisie : voir `weSelfEntered`).
 */
export function planWorkEntries(me: any, users: any[], existing: any[], sheet: any, settings: any, nowIso: string, today: string): any {
  if (!me || (me.role !== "admin" && me.role !== "team_lead")) return { ok: false, error: "role" };
  if (!sheet || typeof sheet !== "object") return { ok: false, error: "bad" };
  if (!weDateOk(sheet.date, today)) return { ok: false, error: "date" };
  const lines = sheet.lines;
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: "empty" };
  if (lines.length > WE_MAX_LINES) return { ok: false, error: "too_many" };
  const label = String(sheet.type_label ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const byId = new Map<string, any>();
  for (const u of users || []) if (u && typeof u.id === "string") byId.set(u.id, { ...u });
  const taken = new Set<string>();
  for (const p of existing || []) if (p && typeof p.id === "string" && p.status !== "rejected") taken.add(p.id);
  const admin = me.role === "admin";
  const saved: any[] = [];
  const failed: { line: number; error: string }[] = [];
  const touched = new Set<string>();
  lines.forEach((raw: any, i: number) => {
    const line = i + 1;
    const bad = (error: string) => { failed.push({ line, error }); };
    if (!raw || typeof raw !== "object") return bad("bad");
    const empId = typeof raw.employee_id === "string" ? raw.employee_id : "";
    const emp = byId.get(empId);
    if (!weCanEnterFor(me, emp)) return bad("employee");
    const type = typeof raw.work_type === "string" ? raw.work_type : "";
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(type)) return bad("type");
    let presence: string | undefined;
    if (raw.presence !== undefined && raw.presence !== null && raw.presence !== "") { if (typeof raw.presence !== "string" || !WE_PRESENCE.includes(raw.presence)) return bad("presence"); presence = raw.presence; }
    const hours = weNum(raw.hours, 24); if (hours === null) return bad("hours");
    const quantity = weNum(raw.quantity, 100000); if (quantity === null) return bad("quantity");
    const rejected = weNum(raw.rejected, 100000); if (rejected === null) return bad("rejected");
    if ((rejected || 0) > (quantity || 0)) return bad("rejected");
    if (presence === undefined && !(hours && hours > 0) && !(quantity && quantity > 0)) return bad("empty");
    const id = "we-" + sheet.date + "-" + weSafe(empId) + "-" + type;
    if (id.length > 80) return bad("bad");
    if (taken.has(id)) return bad("duplicate");
    taken.add(id);
    const e = byId.get(empId);
    const post: any = {
      id, employee_id: empId, employee_name: String(e.name ?? ""), client_name: label || type, account_tag: "", target_score: 0, initial_score: 0, current_score: 0, remaining_score: 0,
      status: admin ? "completed" : "pending_end", shift_type: "day", date: sheet.date, start_time: "00:00:00", start_proof_url: "", calculated_ar: 0, client_price_ar: 0,
      work_type: type, entered_by: me.id, entered_by_name: String(me.name ?? ""), created_at: nowIso, updated_at: nowIso,
    };
    if (presence !== undefined) post.presence = presence;
    if (hours !== undefined) post.hours = hours;
    if (quantity !== undefined) post.quantity = quantity;
    if (rejected !== undefined) post.rejected = rejected;
    if (admin) {
      const pay = wePay(post, e, settings);
      post.calculated_ar = pay; post.start_validated_at = nowIso; post.end_validated_at = nowIso;
      e.total_earnings_ar = Math.round((Number(e.total_earnings_ar) || 0) + pay);
      touched.add(empId);
    }
    saved.push(post);
  });
  return { ok: true, saved, failed, users: [...touched].map(id => byId.get(id)), validated: admin };
}
/** Annuler une ligne de la feuille du jour (point faible T2) : le responsable seulement. La paie ajoutée à la validation est retirée ; la ligne disparaît et peut être saisie à nouveau. Période de paie déjà clôturée (`closed`) : refusé. */
export function planWorkCancel(me: any, post: any, employee: any, closed: boolean): { ok: true; id: string; user: any } | { ok: false; error: "role" | "notline" | "closed" } {
  if (!me || me.role !== "admin") return { ok: false, error: "role" };
  if (!post || typeof post !== "object" || typeof post.id !== "string" || !post.id.startsWith("we-") || typeof post.work_type !== "string" || !post.work_type) return { ok: false, error: "notline" };
  if (post.status !== "completed" && post.status !== "pending_end") return { ok: false, error: "notline" };
  if (closed) return { ok: false, error: "closed" };
  let user: any = null;
  if (post.status === "completed" && employee && typeof employee === "object") {
    const pay = Math.max(0, Math.round(Number(post.calculated_ar) || 0));
    user = { ...employee, total_earnings_ar: Math.max(0, Math.round((Number(employee.total_earnings_ar) || 0) - pay)) };
  }
  return { ok: true, id: post.id, user };
}
/** Personne ne valide sa propre saisie. */
export const weSelfEntered = (me: any, post: any): boolean => !!me && !!post && typeof post.entered_by === "string" && post.entered_by === me.id;
// ===== END WORKENTRY =====
