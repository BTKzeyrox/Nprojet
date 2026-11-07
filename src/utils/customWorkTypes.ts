// Types de travail créés par le responsable (module 26, M26.6b) : « Créer mon type de travail ». Règles pures, sans écran, sans serveur.
// Rangés dans les réglages (`work_types`), comme les modèles de mission. Le serveur (bloc CUSTOMWORK de df-api) a la même copie ; `npm run check:custom-work-types` les compare.
// ===== BEGIN CUSTOMWORK =====
export const CW_MAX_TYPES = 12;
const cwMeasures = ["proof", "presence", "quantity", "tasks", "none"];
const cwPays = ["mission", "day", "hour", "piece", "fixed"];
const cwEntries = ["employee", "team_lead", "admin", "paper"];
const cwText = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
/** Ce qui va ensemble : une quantité se paie à la pièce ; la présence au jour ou à l'heure ; des preuves ou des tâches à la mission ; un salaire fixe va avec tout. */
const cwCompatible = (measure: string, pay: string): boolean => pay === "fixed" ? true : pay === "piece" ? measure === "quantity" : pay === "day" || pay === "hour" ? measure === "presence" : measure === "proof" || measure === "tasks";
/** Un type de travail créé à la main : identifiant « c-… » (jamais celui d'un type du modèle), nom en français et en anglais, mesure, paie compatible, qui saisit, unité si on compte des pièces. */
export function cwValidate(x: any): { ok: true; value: any } | { ok: false; error: string } {
  if (!x || typeof x !== "object") return { ok: false, error: "id" };
  const id = typeof x.id === "string" ? x.id.trim() : "";
  if (!/^c-[a-z0-9][a-z0-9-]{1,28}$/.test(id)) return { ok: false, error: "id" };
  const fr = cwText(x.name && x.name.fr, 60), en = cwText(x.name && x.name.en, 60);
  if (!fr || !en) return { ok: false, error: "name" };
  if (typeof x.measure !== "string" || !cwMeasures.includes(x.measure)) return { ok: false, error: "measure" };
  if (typeof x.pay !== "string" || !cwPays.includes(x.pay)) return { ok: false, error: "pay" };
  const entry = Array.isArray(x.entry) ? cwEntries.filter(e => x.entry.includes(e)) : [];
  if (entry.length === 0) return { ok: false, error: "entry" };
  if (!cwCompatible(x.measure, x.pay)) return { ok: false, error: "incompatible" };
  const needsUnit = x.measure === "quantity" || x.pay === "piece";
  const ufr = cwText(x.unit && x.unit.fr, 20), uen = cwText(x.unit && x.unit.en, 20);
  if (needsUnit && (!ufr || !uen)) return { ok: false, error: "unit" };
  return { ok: true, value: { id, name: { fr, en }, measure: x.measure, pay: x.pay, entry, ...(needsUnit ? { unit: { fr: ufr, en: uen } } : {}) } };
}
/** La liste enregistrée : seuls les types valides, sans doublon d'identifiant, 12 au plus. Jamais d'erreur : ce qui est faux est ignoré. */
export function cleanCustomTypes(list: unknown): any[] {
  if (!Array.isArray(list)) return [];
  const out: any[] = [];
  for (const x of list) {
    const v = cwValidate(x);
    if (v.ok && !out.some(o => o.id === v.value.id)) out.push(v.value);
    if (out.length >= CW_MAX_TYPES) break;
  }
  return out;
}
// ===== END CUSTOMWORK =====
