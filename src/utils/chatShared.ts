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
  if (me.role === "admin") return true;
  const to = typeof msg.recipient_id === "string" && msg.recipient_id ? msg.recipient_id : "all";
  if (to === "all" || msg.sender_id === me.id || to === me.id) return true;
  return !!group && Array.isArray(group.members) && group.members.includes(me.id);
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
export { canUseSharedTools, canSeeChatMessage, planSharedMark };
