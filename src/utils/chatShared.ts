// Droits « pour tous » du chat (M28.2) : qui peut poser « Important pour tous » ou épingler le message d'un autre. Règles pures, sans écran ni serveur.
// Utilisé par : store.ts (démo), ChatView.tsx (menu du message). Le serveur (df-api) a la MÊME copie du bloc ci-dessous : `npm run check:chat-shared` compare les deux et les fait tourner sur les mêmes cas.
// Pour modifier : modifier le bloc ICI et dans df-api en même temps (texte identique) ; sur le serveur c'est la route `chat-mark` qui applique ces règles : l'écran ne fait que cacher les boutons.
// ===== BEGIN CHATSHARED (droits « pour tous » du chat : copie exacte dans supabase/functions/df-api/index.ts ; contrôlée par scripts/check-chat-shared.ts) =====
function canUseSharedTools(me: any, group: any): boolean {
  // Responsable, chef d'équipe, ou créateur du groupe (dans son groupe) : les seuls à poser « Important pour tous » ; l'auteur peut toujours épingler son message
  if (!me || typeof me.id !== "string") return false;
  if (me.role === "admin" || me.role === "team_lead") return true;
  return !!group && typeof group.owner_id === "string" && group.owner_id === me.id;
}
function canSeeChatMessage(me: any, msg: any, group: any): boolean {
  if (!me || typeof me.id !== "string" || !msg) return false;
  if (isHiddenFrom(me, msg)) return false;
  if (me.role === "admin") return true;
  const to = typeof msg.recipient_id === "string" && msg.recipient_id ? msg.recipient_id : "all";
  if (to === "all" || msg.sender_id === me.id || to === me.id) return true;
  return !!group && Array.isArray(group.members) && group.members.includes(me.id);
}
function isHiddenFrom(me: any, msg: any): boolean {
  // Message « visible seulement par X » (M28.3) : caché à toute personne qui n'est ni l'auteur, ni le responsable, ni dans la liste. Le serveur ne l'envoie même pas.
  if (!me || typeof me.id !== "string" || !msg) return true;
  if (me.role === "admin" || msg.sender_id === me.id) return false;
  return Array.isArray(msg.visible_to) && msg.visible_to.length > 0 && !msg.visible_to.includes(me.id);
}
function planVisibleTo(me: any, group: any, thread: string, list: any, eligible: string[]): any {
  // Qui peut restreindre un message et à qui : responsable, chef d'équipe, créateur du groupe (dans son groupe) ; jamais dans une discussion à deux ; 1 à 20 personnes de la discussion
  if (!me || typeof me.id !== "string" || !Array.isArray(list) || !Array.isArray(eligible)) return { ok: false, error: "args" };
  if (thread !== "all" && !group) return { ok: false, error: "direct" };
  if (!canUseSharedTools(me, thread === "all" ? null : group)) return { ok: false, error: "role" };
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== "string" || x === me.id || out.includes(x)) continue;
    if (!eligible.includes(x)) return { ok: false, error: "member" };
    out.push(x);
  }
  if (out.length < 1 || out.length > 20) return { ok: false, error: "count" };
  return { ok: true, list: out };
}
const EPHEMERAL_CHOICES = [3600000, 86400000, 604800000];
function planEphemeral(me: any, group: any, thread: string, ms: any): any {
  // Messages éphémères (M28.4) : mode par discussion (générale ou groupe), 1 h / 24 h / 7 jours, 0 = désactivé ; responsable, chef d'équipe, créateur du groupe (membre de son groupe)
  if (!me || typeof me.id !== "string" || typeof ms !== "number" || !Number.isFinite(ms)) return { ok: false, error: "args" };
  if (thread !== "all" && !group) return { ok: false, error: "direct" };
  if (!canUseSharedTools(me, thread === "all" ? null : group)) return { ok: false, error: "role" };
  if (group && me.role !== "admin" && !(Array.isArray(group.members) && group.members.includes(me.id))) return { ok: false, error: "role" };
  if (ms !== 0 && !EPHEMERAL_CHOICES.includes(ms)) return { ok: false, error: "ms" };
  return { ok: true, ms };
}
function isExpired(msg: any, nowMs: number): boolean {
  return !!msg && Number(msg.expires_ms) > 0 && Number(msg.expires_ms) <= nowMs;
}
function planSharedMark(me: any, msg: any, group: any, mark: string, on: boolean, nowIso: string): any {
  if (!me || typeof me.id !== "string" || !msg || typeof msg.id !== "string" || (mark !== "important" && mark !== "pinned")) return { ok: false, error: "args" };
  if (msg.deleted_at) return { ok: false, error: "deleted" };
  if (!canSeeChatMessage(me, msg, group)) return { ok: false, error: "gone" };
  const tools = canUseSharedTools(me, group);
  const by_name = String(me.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const save: any = { ...msg };
  if (mark === "important") {
    if (on) {
      if (!tools) return { ok: false, error: "role" };
      if (!save.important_all) save.important_all = { by: me.id, by_name, at: nowIso };
    } else {
      const cur = save.important_all;
      if (!cur) return { ok: true, save, same: true };
      if (cur.by !== me.id && me.role !== "admin") return { ok: false, error: "remove" };
      delete save.important_all;
    }
    return { ok: true, save };
  }
  if (!(msg.sender_id === me.id || tools)) return { ok: false, error: "role" };
  if (on) { if (!save.pinned) { save.pinned = true; save.pinned_at = nowIso; save.pinned_by = me.id; save.pinned_by_name = by_name; } }
  else { delete save.pinned; delete save.pinned_at; delete save.pinned_by; delete save.pinned_by_name; }
  return { ok: true, save };
}
// ===== END CHATSHARED =====
/** « Visible seulement par X » : le serveur déployé doit connaître M28.3, sinon l'ancien serveur livrerait le message à tous. Passe à true APRÈS le déploiement de df-api (démo : toujours ouvert). */
export const VISIBLE_TO_SERVER_LIVE = true; // df-api v87 déployé (2026-11-13)
/** Messages éphémères : le serveur déployé doit connaître M28.4 (route chat-ephemeral). Passe à true APRÈS le déploiement de df-api (démo : toujours ouvert). */
export const EPHEMERAL_SERVER_LIVE = true; // df-api v87 déployé (2026-11-13)
export { EPHEMERAL_CHOICES, planEphemeral, isExpired };
export { canUseSharedTools, canSeeChatMessage, planSharedMark, isHiddenFrom, planVisibleTo };
