// Salaire fixe dans la fiche de paie (module 26, point faible T1, 2026-11-09). Règle pure, sans écran ni serveur.
// Le serveur (bloc FIXEDSALARY de df-api, fiches de paie) a la même copie ; `npm run check:fixed-salary` compare les deux sur les mêmes cas.
// Un employé en mode « salaire fixe » (le sien, sinon celui de l'entreprise) reçoit UNE ligne « Salaire fixe » par fiche : le mois entier, ou la moitié pour une quinzaine (A ou B). Tarif propre de l'employé (pay_rate_ar > 0), sinon « Salaire fixe par mois » de l'entreprise.
// Tout ce qui est faux (employé absent, pas « fixe », suspendu, tarif absent, négatif, NaN, trop grand, période illisible) = 0 : jamais deviné.
// ===== BEGIN FIXEDSALARY =====
function fixedSalaryAr(employee: any, settings: any, pid: unknown): number {
  if (!employee || typeof employee !== "object" || employee.role !== "employee") return 0;
  if (employee.status !== undefined && employee.status !== "active") return 0;
  const work = (settings && settings.company && settings.company.work) || {};
  const okMode = (v: unknown) => typeof v === "string" && ["mission", "day", "hour", "piece", "fixed"].includes(v);
  const mode = okMode(employee.pay_mode) ? employee.pay_mode : okMode(work.pay_default) ? work.pay_default : "mission";
  if (mode !== "fixed") return 0;
  const rate = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 && v <= 100000000 ? v : 0);
  const own = rate(employee.pay_rate_ar);
  const monthly = own > 0 ? own : rate(work.rate_fixed_ar);
  const m = /^\d{4}-(0[1-9]|1[0-2])(?:-([AB]))?$/.exec(String(pid ?? ""));
  if (!m || monthly <= 0) return 0;
  return Math.round(monthly * (m[2] ? 0.5 : 1));
}
// ===== END FIXEDSALARY =====
export { fixedSalaryAr };
