// Employé « suivi par saisie seulement » (module 26, M26.7) : règles pures, sans écran, sans serveur.
// Le serveur (bloc ENTRYONLY de df-api) a la même copie ; `npm run check:entry-only` les compare.
// ===== BEGIN ENTRYONLY =====
/** Employé « suivi par saisie seulement » : sans compte, sans mot de passe, sans téléphone. Il ne se connecte jamais, n'est jamais « en ligne » ; le responsable ou le Chef d'équipe saisit son travail. */
export const isEntryOnly = (u: any): boolean => !!u && u.entry_only === true;
/** Le dossier créé par le responsable : toujours un opérateur actif, jamais en ligne, un pseudo interne qui ne sert à rien (aucun mot de passe n'existe). Refus : nom de moins de 2 lettres. */
export function entryOnlyRecord(user: any, nowMs: number): { ok: true; rec: any } | { ok: false; error: string } {
  const name = String((user && user.name) ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "name" };
  const team = String((user && user.team) ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  const shift = user && user.shift === "night" ? "night" : "day";
  const id = "user-emp-" + nowMs;
  return { ok: true, rec: { id, username: "saisie-" + nowMs, name, phone: "", shift, role: "employee", team, status: "active", is_online: false, avatar_url: "", performance_badge: "Standard", entry_only: true, total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0 } };
}
// ===== END ENTRYONLY =====
