// Fonction séparée : Restauration du site (remise à zéro) avec Gmail de l'admin + code par mail.
// Elle partage la même base et la même clé de session que df-api. Seul l'admin peut l'appeler.
import { createClient } from "npm:@supabase/supabase-js@2";
import { randomInt, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const SECRET = createHash("sha256").update("df-session:" + SB_KEY).digest("hex"); // même clé que df-api

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ---------- session (même format que df-api) ----------
const verify = (tok: string): { uid: string; exp: number } | null => {
  const [body, sig] = (tok || "").split(".");
  if (!body || !sig || !SECRET) return null;
  const good = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
};
const authenticate = async (request: Request) => {
  const h = request.headers.get("authorization") || "";
  const p = verify(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!p) return null;
  const { data } = await sb.from("df_users").select("data").eq("id", p.uid).maybeSingle();
  const user = data?.data as any;
  if (!user || user.status === "blocked") return null;
  return user;
};

// ---------- codes et mail ----------
const RESTORE = "df_restore";
const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_TRIES = 5;
const CODE_MIN_GAP_MS = 60 * 1000;
const codeHash = (code: string, purpose: string) =>
  createHash("sha256").update(`df-restore:${purpose}:${code}:${SECRET}`).digest("hex");

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const k = await sb.rpc("df_get_secret", { secret_name: "resend_api_key" });
    if (k.error || !k.data) { console.error("resend key error:", k.error); return false; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${k.data}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Delta Force <onboarding@resend.dev>", to: [to], subject, html }),
    });
    if (!r.ok) { console.error("resend error:", r.status, await r.text().catch(() => "")); return false; }
    return true;
  } catch (e) { console.error("resend exception:", e); return false; }
}

const getRow = async (id: string): Promise<any | null> => {
  const { data } = await sb.from(RESTORE).select("data").eq("id", id).maybeSingle();
  return data?.data || null;
};
const putRow = (id: string, data: any) => sb.from(RESTORE).upsert({ id, data, updated_at: new Date().toISOString() });

async function issueCode(purpose: "verify" | "reset", email: string): Promise<Response> {
  const prev = await getRow(`code-${purpose}`);
  if (prev?.sent_at && Date.now() - prev.sent_at < CODE_MIN_GAP_MS) {
    return json(429, { error: "Un code vient d'être envoyé. Attendez 1 minute avant d'en demander un autre." });
  }
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const title = purpose === "verify" ? "Vérification de votre adresse" : "Code de restauration du site";
  const why = purpose === "verify"
    ? "Voici le code pour confirmer cette adresse comme adresse administrateur."
    : "Voici le code pour confirmer la <b>remise à zéro</b> du site. Si ce n'est pas vous, ne le donnez à personne.";
  const ok = await sendMail(email, `${title} : ${code}`,
    `<div style="font-family:Arial,sans-serif;max-width:420px"><h2>${title}</h2><p>${why}</p>` +
    `<p style="font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p><p>Ce code est valable 10 minutes.</p></div>`);
  if (!ok) return json(502, { error: "Le mail n'a pas pu être envoyé. Réessayez dans un moment." });
  await putRow(`code-${purpose}`, { hash: codeHash(code, purpose), expires_at: Date.now() + CODE_TTL_MS, tries: 0, sent_at: Date.now() });
  return json(200, { ok: true });
}

// 5 essais, 10 minutes, usage unique
async function checkCode(purpose: "verify" | "reset", code: unknown): Promise<{ ok: boolean; error?: string }> {
  const id = `code-${purpose}`;
  const row = await getRow(id);
  if (!row) return { ok: false, error: "Aucun code en attente. Demandez un nouveau code." };
  if (Date.now() > row.expires_at) { await sb.from(RESTORE).delete().eq("id", id); return { ok: false, error: "Code expiré. Demandez un nouveau code." }; }
  if ((row.tries || 0) >= CODE_MAX_TRIES) { await sb.from(RESTORE).delete().eq("id", id); return { ok: false, error: "Trop d'essais. Demandez un nouveau code." }; }
  const good = codeHash(String(code || "").replace(/\D/g, ""), purpose);
  if (good.length !== row.hash.length || !timingSafeEqual(Buffer.from(good), Buffer.from(row.hash))) {
    await putRow(id, { ...row, tries: (row.tries || 0) + 1 });
    return { ok: false, error: `Code incorrect. Essais restants : ${Math.max(0, CODE_MAX_TRIES - (row.tries || 0) - 1)}.` };
  }
  await sb.from(RESTORE).delete().eq("id", id);
  return { ok: true };
}

// ---------- routes ----------
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const action = new URL(request.url).pathname.split("/").filter(Boolean).pop() || "";
  if (request.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  let body: any = {};
  try { body = await request.json(); } catch { body = {}; }

  try {
    const me = await authenticate(request);
    if (!me) return json(401, { error: "Session expirée. Reconnectez-vous." });
    if (me.role !== "admin") return json(403, { error: "Réservé à l'administrateur." });

    if (action === "restore-status") {
      const adm = await getRow("admin-email");
      return json(200, { email: adm?.email || "", verified: !!adm?.verified });
    }

    if (action === "restore-email") {
      const email = String(body?.email || "").trim().toLowerCase();
      if (!GMAIL_RE.test(email) || email.length > 100) return json(400, { error: "Entrez une adresse Gmail valide (nom@gmail.com)." });
      const prev = await getRow("admin-email");
      await putRow("admin-email", { email, verified: prev?.email === email ? !!prev.verified : false, set_by: me.id });
      if (prev?.email === email && prev.verified) return json(200, { ok: true, already: true });
      return await issueCode("verify", email);
    }

    if (action === "restore-email-verify") {
      const adm = await getRow("admin-email");
      if (!adm?.email) return json(400, { error: "Enregistrez d'abord votre adresse Gmail." });
      const c = await checkCode("verify", body?.code);
      if (!c.ok) return json(400, { error: c.error });
      await putRow("admin-email", { ...adm, verified: true });
      return json(200, { ok: true });
    }

    if (action === "restore-send-code") {
      const adm = await getRow("admin-email");
      if (!adm?.email || !adm.verified) return json(400, { error: "Votre adresse Gmail doit être enregistrée et vérifiée." });
      return await issueCode("reset", adm.email);
    }

    // Remise à zéro : efface boosters, sessions, historiques, avances, paies, messages.
    // Garde l'admin, les Réglages et les postes (scores remis au Début, preuves du compte retirées).
    if (action === "restore-execute") {
      if (String(body?.confirm || "") !== "RESTAURER") return json(400, { error: "Confirmation manquante." });
      const adm = await getRow("admin-email");
      if (!adm?.email || !adm.verified) return json(400, { error: "Votre adresse Gmail doit être enregistrée et vérifiée." });
      const c = await checkCode("reset", body?.code);
      if (!c.ok) return json(400, { error: c.error });

      const none = "__none__";
      const wipe = async (table: string, col = "id") => {
        const { error } = await sb.from(table).delete().neq(col, none);
        if (error) throw error;
      };
      await wipe("df_posts");
      await wipe("df_advances");
      await wipe("df_messages");
      await wipe("df_security_logs");
      await wipe("df_payroll");
      await wipe("df_signups");
      await wipe("df_resets");
      await wipe("df_profile_requests");
      await wipe("df_attendance", "user_id");
      await wipe("df_presence", "user_id");
      { const { error } = await sb.from("df_credentials").delete().neq("user_id", me.id); if (error) throw error; }
      { const { error } = await sb.from("df_users").delete().neq("id", me.id); if (error) throw error; }
      const { data: cons } = await sb.from("df_contracts").select("id, data");
      for (const r of cons || []) {
        const d = { ...r.data, current_score: r.data.initial_score, account_proof_urls: [] };
        await sb.from("df_contracts").upsert({ id: r.id, data: d, updated_at: new Date().toISOString() });
      }
      return json(200, { ok: true });
    }

    return json(404, { error: "Route inconnue." });
  } catch (e) {
    console.error("restore error:", e);
    return json(500, { error: "Erreur serveur." });
  }
});
