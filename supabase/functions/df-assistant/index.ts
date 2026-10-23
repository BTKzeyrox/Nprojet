// Fonction séparée : assistant IA externe (niveau B, M11.13). ADMIN SEULEMENT. Désactivée tant que le secret GEMINI_API_KEY n'existe pas (interrupteur côté serveur).
// Elle partage la base et la clé de session de df-api (même format de jeton). Elle n'écrit RIEN en base et ne lit que la ligne de l'utilisateur pour vérifier qu'il est admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual, createHmac, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { cleanQuestion, cleanSnapshot, cleanGuide, cleanHistory, buildPrompt, askGemini, makeLimiter, dayMada, DAILY_MAX } from "./guard.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const SECRET = createHash("sha256").update("df-session:" + SB_KEY).digest("hex");
const MODELS = (Deno.env.get("GEMINI_MODELS") || "gemini-2.5-flash,gemini-2.0-flash").split(",").map(s => s.trim()).filter(Boolean);
const limiter = makeLimiter(DAILY_MAX);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const verify = (tok: string): { uid: string; exp: number } | null => {
  const [body, sig] = (tok || "").split(".");
  if (!body || !sig || !SECRET) return null;
  const good = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
};
const authenticate = async (request: Request) => {
  const h = request.headers.get("authorization") || "";
  const p = verify(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!p) return null;
  const { data } = await sb.from("df_users").select("data").eq("id", p.uid).maybeSingle();
  const user = data?.data as any;
  if (!user || user.status === "blocked") return null;
  return { user, uid: p.uid };
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (request.method !== "POST") return json(405, { error: "Méthode refusée." });
    const me = await authenticate(request);
    if (!me) return json(401, { error: "Connexion requise." });
    if (me.user.role !== "admin") return json(403, { error: "Réservé à l'administrateur." });
    const key = Deno.env.get("GEMINI_API_KEY") || "";
    const url = new URL(request.url);
    const route = url.pathname.split("/").filter(Boolean).pop();
    const day = dayMada(Date.now());
    if (route === "status") return json(200, { ok: true, configured: !!key, left: limiter.left(me.uid, day), max: DAILY_MAX });
    if (route !== "ask") return json(404, { error: "Route inconnue." });
    if (!key) return json(503, { error: "not_configured" });
    const body = await request.json().catch(() => ({}));
    const q = cleanQuestion(body?.question);
    if (!q) return json(400, { error: "bad_question" });
    const snap = cleanSnapshot(body?.summary);
    if (!snap.ok) return json(400, { error: snap.why });
    const guide = cleanGuide(body?.guide);
    if (!guide.ok) return json(400, { error: "guide_size" });
    const lang = body?.lang === "en" ? "en" : "fr";
    if (!limiter.take(me.uid, day)) return json(429, { error: "daily_limit", max: DAILY_MAX });
    const r = await askGemini((u, init) => fetch(u, init as any) as any, key, MODELS, buildPrompt(q, snap.json, lang, { guide: guide.text, history: cleanHistory(body?.history), now: Date.now() }));
    if (!r.ok) return json(r.error === "quota" ? 429 : r.error === "key" ? 502 : 503, { error: r.error });
    return json(200, { ok: true, text: r.text, model: r.model, left: limiter.left(me.uid, day) });
  } catch (e) {
    console.error("assistant error:", (e as Error)?.message || "?"); // jamais la question, le résumé ni la clé
    return json(500, { error: "Erreur serveur." });
  }
});
