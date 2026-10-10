import { createClient } from "npm:@supabase/supabase-js@2";
import { randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const T = {
  users: "df_users",
  posts: "df_posts",
  contracts: "df_contracts",
  securityLogs: "df_security_logs",
  advances: "df_advances",
  messages: "df_messages",
  groups: "df_groups",
  settings: "df_settings",
} as const;
type Col = keyof typeof T;
const COLS = Object.keys(T) as Col[];

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const SECRET = createHash("sha256").update("df-session:" + SB_KEY).digest("hex");
const RESETS = "df_resets";
const SIGNUPS = "df_signups";
const PROFILE_REQ = "df_profile_requests";
const PRESENCE = "df_presence";
const ATTENDANCE = "df_attendance";
const BUCKET = "df-files";
const CHAT_READS = "df_chat_reads";
const GROUP_PREFIX = "grp_";
const EDIT_WINDOW_MS = 15 * 60 * 1000; // comme WhatsApp : on peut modifier son message pendant 15 minutes
// Cloudinary : le nom du cloud n'est pas secret ; la clé API et le secret sont lus dans le coffre-fort (Vault)
const CLD_CLOUD = "dirnrsy5v";
const CLD_PREFIX = `https://res.cloudinary.com/${CLD_CLOUD}/image/upload/`;
const OPEN_STATUS = ["pending_start", "active", "pending_end"];
const EMP_POST_TARGET = [...OPEN_STATUS, "force_released"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---------- crypto ----------
const hashPw = (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPw = (pw: string, stored: string) => {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const a = Buffer.from(scryptSync(pw, salt, 64).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
};
const sign = (payload: object) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};
const verify = (tok: string): { uid: string; exp: number } | null => {
  const [body, sig] = (tok || '').split('.');
  if (!body || !sig || !SECRET) return null;
  const good = createHmac('sha256', SECRET).update(body).digest('base64url');
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
};

// ---------- helpers ----------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Motif de refus : obligatoire (3 à 300 caractères), montré ensuite à la personne concernée
const reasonOf = (b: any) => String(b?.reason || '').trim().slice(0, 300);
const REASON_ERR = 'Écris un motif de refus (3 caractères minimum).';
const getUserRow = async (id: string) => {
  const { data } = await sb.from(T.users).select('data').eq('id', id).maybeSingle();
  return data?.data as any | null;
};
const authenticate = async (req: any) => {
  const h = String(req.headers.authorization || '');
  const p = verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p) return null;
  const user = await getUserRow(p.uid);
  if (!user || user.status === 'blocked') return null;
  return user as any;
};

// ---------- accès selon l'heure du shift (heure de Madagascar, UTC+3) ----------
let stCache: { at: number; data: any } | null = null;
const getSettings = async () => {
  if (stCache && Date.now() - stCache.at < 60_000) return stCache.data;
  const { data } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  stCache = { at: Date.now(), data: data?.data || {} };
  return stCache.data;
};
const toMin = (s: unknown, dflt: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : dflt;
};
// Vrai si l'heure `now` est dans le shift, élargi de `access_before_min` avant le début et de
// `access_after_min` après la fin (60 min par défaut). Le shift de nuit passe minuit.
const accessMargins = (st: any) => {
  const n = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? 60 : Math.max(0, Number(v)));
  return { before: n(st.access_before_min), after: n(st.access_after_min) };
};
const fmtMin = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const inShiftWindow = (shift: 'day' | 'night', st: any, now: Date): boolean => {
  const s = shift === 'night' ? toMin(st.night_shift_start, 20 * 60) : toMin(st.day_shift_start, 8 * 60);
  const e = shift === 'night' ? toMin(st.night_shift_end, 6 * 60) : toMin(st.day_shift_end, 18 * 60);
  const { before, after } = accessMargins(st);
  const len = ((e - s + 1440) % 1440) || 1440;
  if (len + before + after >= 1440) return true;
  const from = (s - before + 1440) % 1440;
  const to = (e + after) % 1440;
  const m = (now.getUTCHours() * 60 + now.getUTCMinutes() + 180) % 1440;
  return from <= to ? m >= from && m < to : m >= from || m < to;
};
// Booster : « auto » = seulement pendant son shift ; « allow » = toute heure ; « block » = jamais.
// Une session en cours (début ou fin à valider) garde l'accès jusqu'à sa fin.
async function shiftAccess(user: any): Promise<{ ok: boolean; message?: string }> {
  if (user.role !== 'employee') return { ok: true };
  if (user.access_mode === 'block') return { ok: false, message: "Ton accès est bloqué par l'administrateur." };
  if (user.access_mode === 'allow') return { ok: true };
  const st = await getSettings();
  const shift: 'day' | 'night' = user.shift === 'night' ? 'night' : 'day';
  if (inShiftWindow(shift, st, new Date())) return { ok: true };
  const { data: open } = await sb.from(T.posts).select('id').eq('data->>employee_id', user.id).in('data->>status', OPEN_STATUS).limit(1);
  if (open && open.length) return { ok: true };
  const from = shift === 'night' ? st.night_shift_start || '20:00' : st.day_shift_start || '08:00';
  const to = shift === 'night' ? st.night_shift_end || '06:00' : st.day_shift_end || '18:00';
  const startMin = toMin(shift === 'night' ? st.night_shift_start : st.day_shift_start, shift === 'night' ? 20 * 60 : 8 * 60);
  const opens = fmtMin(startMin - accessMargins(st).before);
  return { ok: false, message: `Ton shift ${shift === 'night' ? 'de nuit' : 'de jour'} est de ${from} à ${to}. Tu peux te connecter à partir de ${opens}.` };
}

// Mode maintenance (Réglages) : les boosters sont refusés avec le message de l'admin ; l'admin entre toujours.
async function maintenanceMessage(user: any): Promise<string | null> {
  if (user.role === 'admin') return null;
  const st = await getSettings();
  if (!st.maintenance_on) return null;
  return String(st.maintenance_message || '').trim().slice(0, 300) || 'Le site est en maintenance. Réessaie un peu plus tard.';
}

// ---------- présence (en ligne, temps de connexion, file d'attente « sans poste ») ----------
const dayOf = (d: Date) => new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10); // jour à Madagascar (UTC+3)
const ALIVE_MS = 5 * 60 * 1000;
async function touchPresence(me: any) {
  const now = new Date();
  const day = dayOf(now);
  const { data: row } = await sb.from(PRESENCE).select('*').eq('user_id', me.id).maybeSingle();
  let sec = row && row.day === day ? row.online_sec : 0;
  if (row && row.day === day) {
    const gap = (now.getTime() - new Date(row.last_seen).getTime()) / 1000;
    if (gap > 0 && gap <= 120) sec += Math.round(gap); // on compte le temps entre deux signes de vie rapprochés
  }
  await sb.from(PRESENCE).upsert({ user_id: me.id, last_seen: now.toISOString(), day, online_sec: sec, waiting_since: row?.waiting_since ?? null });
  try { await touchAttendance(me, now); } catch (e) { console.error('attendance error:', e); }
}

// ---------- historique d'arrivée par jour (première connexion, temps connecté) ----------
// Jour de travail du booster : le shift de nuit commence la veille au soir, donc avant midi (heure de Madagascar) = jour précédent.
const attendanceDay = (me: any, now: Date): string => {
  const mada = new Date(now.getTime() + 3 * 3600 * 1000);
  if (me.shift === 'night' && mada.getUTCHours() < 12) mada.setUTCDate(mada.getUTCDate() - 1);
  return mada.toISOString().slice(0, 10);
};
const attMem = new Map<string, { day: string; at: number }>(); // limite les écritures : 1 par minute et par booster
async function touchAttendance(me: any, now: Date) {
  const day = attendanceDay(me, now);
  const mem = attMem.get(me.id);
  if (mem && mem.day === day && now.getTime() - mem.at < 60_000) return;
  const { data: row } = await sb.from(ATTENDANCE).select('*').eq('user_id', me.id).eq('day', day).maybeSingle();
  let sec = row?.online_sec ?? 0;
  if (row) {
    const gap = (now.getTime() - new Date(row.last_seen).getTime()) / 1000;
    if (gap > 0 && gap <= 150) sec += Math.round(gap);
  }
  await sb.from(ATTENDANCE).upsert({ user_id: me.id, day, first_seen: row?.first_seen ?? now.toISOString(), last_seen: now.toISOString(), online_sec: sec });
  attMem.set(me.id, { day, at: now.getTime() });
}
// L'admin voit tous les boosters du jour demandé ; un booster ne voit que le sien.
async function attendanceRoute(req: any, res: any, me: any) {
  const day = String(req.query.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Jour invalide.' });
  let q = sb.from(ATTENDANCE).select('user_id,day,first_seen,last_seen,online_sec').eq('day', day);
  if (me.role !== 'admin') q = q.eq('user_id', me.id);
  const { data } = await q;
  return res.json({ rows: data || [] });
}
const queueOf = (rows: any[], meId: string) => {
  const now = Date.now();
  const waiting = rows
    .filter((r: any) => r.waiting_since && now - new Date(r.last_seen).getTime() < ALIVE_MS)
    .sort((a: any, b: any) => String(a.waiting_since).localeCompare(String(b.waiting_since)));
  const i = waiting.findIndex((r: any) => r.user_id === meId);
  return i < 0 ? null : { waiting_since: waiting[i].waiting_since, position: i + 1, total: waiting.length };
};
async function queueRoute(req: any, res: any, me: any) {
  if (me.role !== 'employee') return res.status(403).json({ error: 'Réservé aux boosters.' });
  const join = req.body?.join === true;
  if (join) {
    const { data: open } = await sb.from(T.posts).select('id').eq('data->>employee_id', me.id).in('data->>status', OPEN_STATUS).limit(1);
    if (open && open.length) return res.status(409).json({ error: 'Tu as déjà un poste en cours.' });
  }
  await touchPresence(me);
  const { data: row } = await sb.from(PRESENCE).select('waiting_since').eq('user_id', me.id).maybeSingle();
  const next = join ? row?.waiting_since || new Date().toISOString() : null;
  await sb.from(PRESENCE).update({ waiting_since: next }).eq('user_id', me.id);
  return res.json({ ok: true });
}

// ---------- login ----------
// Si le pseudo + mot de passe correspondent à une demande d'inscription ou de nouveau mot de passe,
// on explique l'état de la demande (seulement si le mot de passe saisi est bien celui de la demande).
const authNotice = async (uname: string, password: string): Promise<string | null> => {
  try {
    const { data: su } = await sb.from(SIGNUPS).select('data').eq('id', `signup-${uname}`).maybeSingle();
    const sg = su?.data;
    if (sg && sg.password_hash && checkPw(password, sg.password_hash)) {
      if (sg.status === 'pending') return "Ton inscription est en attente de validation par l'administrateur.";
      if (sg.status === 'rejected') return `Inscription refusée : ${sg.reason || 'sans motif'}`;
    }
    const { data: c } = await sb.from('df_credentials').select('user_id').eq('username', uname).maybeSingle();
    if (c) {
      const { data: rs } = await sb.from(RESETS).select('data').eq('id', `reset-${c.user_id}`).maybeSingle();
      const r = rs?.data;
      if (r && r.password_hash && checkPw(password, r.password_hash)) {
        if (r.status === 'pending') return 'Ton changement de mot de passe est en attente de validation. En attendant, utilise ton ancien mot de passe.';
        if (r.status === 'rejected') return `Changement de mot de passe refusé : ${r.reason || 'sans motif'}. Utilise ton ancien mot de passe.`;
      }
    }
  } catch (e) { console.error('notice error:', e); }
  return null;
};

async function login(req: any, res: any) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
  }
  if (!SECRET) return res.status(500).json({ error: 'Serveur mal configuré (SESSION_SECRET manquant).' });
  const uname = username.trim().toLowerCase();

  const { data: cred } = await sb.from('df_credentials').select('*').eq('username', uname).maybeSingle();
  if (!cred || !checkPw(password, cred.password_hash)) {
    await sleep(500);
    const notice = await authNotice(uname, password);
    return res.status(401).json({ error: notice || 'Pseudo ou mot de passe incorrect.' });
  }
  const user = await getUserRow(cred.user_id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Compte bloqué par l\'administrateur.' });
  const mm = await maintenanceMessage(user);
  if (mm) return res.status(503).json({ error: mm, code: 'maintenance' });
  const acc = await shiftAccess(user);
  if (!acc.ok) return res.status(403).json({ error: acc.message, code: 'shift' });

  user.is_online = true;
  await sb.from(T.users).upsert({ id: user.id, data: user, updated_at: new Date().toISOString() });
  if (user.role === 'employee') await touchPresence(user);
  const token = sign({ uid: user.id, exp: Date.now() + 30 * 24 * 3600 * 1000 });
  return res.json({ token, user });
}

// ---------- messagerie : groupes, discussions 1 à 1, règles comme WhatsApp ----------
const getGroup = async (id: string) => {
  const { data } = await sb.from(T.groups).select('data').eq('id', id).maybeSingle();
  return (data?.data as any) || null;
};
const clipReply = (r: any) =>
  r && typeof r.id === 'string'
    ? { id: r.id.slice(0, 80), sender_name: String(r.sender_name || '').slice(0, 60), text: String(r.text || '').slice(0, 140), has_attachment: !!r.has_attachment }
    : undefined;

async function checkMessage(rec: any, existing: any, me: any, admin: boolean, now: string): Promise<{ ok: boolean; save?: any; reason?: string }> {
  if (existing) {
    // Supprimer pour tous : l'auteur, ou l'admin (modération). Une trace reste dans la conversation.
    if (rec.deleted_at) {
      if (existing.sender_id !== me.id && !admin) return { ok: false };
      if (existing.deleted_at) return { ok: true, save: existing };
      const save = { ...existing, message: '', deleted_at: now, deleted_by: existing.sender_id === me.id ? 'sender' : 'admin' };
      for (const k of ['attachment_url', 'attachment_name', 'attachment_kind', 'pinned', 'pinned_at', 'reply_to', 'edited_at']) delete save[k];
      return { ok: true, save };
    }
    // Modifier ou épingler : seulement l'auteur (même l'admin ne modifie jamais le message d'un autre)
    if (existing.sender_id !== me.id || existing.deleted_at) return { ok: false };
    if (typeof rec.message !== 'string' || rec.message.length > 4000) return { ok: false };
    const text = rec.message.trim();
    if (!text && !existing.attachment_url) return { ok: false };
    const save = { ...existing, message: text };
    if (text !== existing.message) {
      if (existing.sent_ms && Date.now() - existing.sent_ms > EDIT_WINDOW_MS) return { ok: false, reason: 'edit_window' };
      save.edited_at = now;
    }
    if (rec.pinned) { save.pinned = true; save.pinned_at = existing.pinned_at || now; }
    else { delete save.pinned; delete save.pinned_at; }
    return { ok: true, save };
  }
  // Nouveau message
  if (rec.sender_id !== me.id || typeof rec.message !== 'string' || rec.message.length > 4000) return { ok: false };
  const rid = typeof rec.recipient_id === 'string' && rec.recipient_id ? rec.recipient_id : 'all';
  if (rid !== 'all') {
    if (rid.startsWith(GROUP_PREFIX)) {
      const g = await getGroup(rid);
      if (!g || (!admin && !(g.members || []).includes(me.id))) return { ok: false };
    } else {
      if (rid === me.id) return { ok: false };
      const t = await getUserRow(rid);
      if (!t || t.status === 'blocked') return { ok: false };
    }
  }
  if (!admin && rec.attachment_url && !isBucketUrl(rec.attachment_url)) return { ok: false };
  const save: any = { ...rec, recipient_id: rid, sent_ms: Date.now() };
  for (const k of ['deleted_at', 'deleted_by', 'edited_at', 'pinned', 'pinned_at']) delete save[k];
  const rt = clipReply(rec.reply_to);
  if (rt) save.reply_to = rt; else delete save.reply_to;
  return { ok: true, save };
}

async function checkGroup(rec: any, existing: any, me: any, admin: boolean, now: string): Promise<{ ok: boolean; save?: any }> {
  const name = String(rec.name || '').trim();
  const members: string[] = Array.isArray(rec.members) ? [...new Set<string>(rec.members.filter((x: any) => typeof x === 'string'))].slice(0, 100) : [];
  const allExist = async () => {
    if (members.length === 0) return false;
    const { data: found } = await sb.from(T.users).select('id').in('id', members);
    return (found || []).length === members.length;
  };
  if (!existing) {
    if (!rec.id.startsWith(GROUP_PREFIX) || rec.id.length > 40 || !/^[A-Za-z0-9_]+$/.test(rec.id)) return { ok: false };
    if (name.length < 1 || name.length > 40) return { ok: false };
    if (rec.owner_id !== me.id || !members.includes(me.id) || !(await allExist())) return { ok: false };
    return { ok: true, save: { id: rec.id, name, owner_id: me.id, members, created_at: now } };
  }
  if (existing.owner_id === me.id || admin) {
    if (name.length < 1 || name.length > 40 || !(await allExist())) return { ok: false };
    const save = { ...existing, name, members };
    if (!members.includes(existing.owner_id)) save.owner_id = members[0]; // le créateur est parti : le premier membre devient responsable
    return { ok: true, save };
  }
  // Simple membre : il peut seulement quitter le groupe
  if ((existing.members || []).includes(me.id)) {
    const expected = existing.members.filter((x: string) => x !== me.id);
    if (members.length === expected.length && expected.every((x: string) => members.includes(x))) return { ok: true, save: { ...existing, members: expected } };
  }
  return { ok: false };
}

// « Lu » : chaque personne enregistre jusqu'où elle a lu chaque conversation
async function chatRead(req: any, res: any, me: any) {
  const thread = String(req.body?.thread || '');
  const ms = Number(req.body?.ms);
  if (!thread || thread.length > 60 || !Number.isFinite(ms) || ms <= 0 || ms > Date.now() + 60_000) return res.status(400).json({ error: 'Requête invalide.' });
  if (thread.startsWith(GROUP_PREFIX)) {
    const g = await getGroup(thread);
    if (!g || (me.role !== 'admin' && !(g.members || []).includes(me.id))) return res.status(403).json({ error: 'Interdit.' });
  }
  const { data: cur } = await sb.from(CHAT_READS).select('ms').eq('user_id', me.id).eq('thread', thread).maybeSingle();
  if (!cur || Number(cur.ms) < ms) await sb.from(CHAT_READS).upsert({ user_id: me.id, thread, ms, updated_at: new Date().toISOString() });
  return res.json({ ok: true });
}

// ---------- state (lecture) ----------
const stripUser = (u: any, me: any) => (me.role === 'admin' || u.id === me.id ? u : { ...u, phone: undefined, cv_url: undefined, cv_data: undefined });
const stripPost = (p: any, me: any) =>
  me.role === 'admin' || p.employee_id === me.id
    ? p
    : { ...p, start_proof_url: '', start_proof_urls: [], end_proof_url: '', end_proof_urls: [] };

async function state(req: any, res: any, me: any) {
  const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : '1970-01-01T00:00:00.000Z';
  const serverTime = new Date(Date.now() - 3000).toISOString();
  const out: Record<string, { changed: any[]; ids: string[] }> = {};
  const admin = me.role === 'admin';
  if (!admin) await touchPresence(me);

  // Groupes : chacun ne reçoit que les groupes dont il est membre (l'admin voit tout)
  const { data: groupRows } = await sb.from(T.groups).select('id, data, updated_at');
  const myGroups = (groupRows || []).filter((r: any) => admin || (r.data.members || []).includes(me.id));
  const myGroupIds = myGroups.map((r: any) => r.id).filter((id: string) => /^[A-Za-z0-9_]+$/.test(id));

  for (const col of COLS) {
    if (col === 'securityLogs' && !admin) { out[col] = { changed: [], ids: [] }; continue; }
    if (col === 'groups') {
      const sinceMs = new Date(since).getTime();
      out[col] = { changed: myGroups.filter((r: any) => new Date(r.updated_at).getTime() >= sinceMs).map((r: any) => r.data), ids: myGroups.map((r: any) => r.id) };
      continue;
    }
    const scope = (q: any) => {
      if (admin) return q;
      if (col === 'advances') return q.eq('data->>employee_id', me.id);
      if (col === 'messages') {
        const grp = myGroupIds.length ? `,data->>recipient_id.in.(${myGroupIds.join(',')})` : '';
        return q.or(`data->>recipient_id.eq.all,data->>recipient_id.eq.${me.id},data->>sender_id.eq.${me.id}${grp}`);
      }
      return q;
    };
    const [{ data: changed }, { data: ids }] = await Promise.all([
      scope(sb.from(T[col]).select('data').gte('updated_at', since)),
      scope(sb.from(T[col]).select('id')),
    ]);
    let recs = (changed || []).map((r: any) => r.data);
    if (col === 'users') recs = recs.map((u: any) => stripUser(u, me));
    if (col === 'posts') recs = recs.map((p: any) => stripPost(p, me));
    out[col] = { changed: recs, ids: (ids || []).map((r: any) => r.id) };
  }
  let resets: any[] = [];
  if (admin) {
    const { data: rs } = await sb.from(RESETS).select('data').order('updated_at', { ascending: true });
    resets = (rs || []).map((r: any) => ({ ...r.data, password_hash: undefined })).filter((r: any) => r.status === 'pending');
  }
  void maybePurge();
  let signups: any[] = [];
  if (admin) {
    const { data: sg } = await sb.from(SIGNUPS).select('data').order('updated_at', { ascending: true });
    signups = (sg || []).map((r: any) => ({ ...r.data, password_hash: undefined, ip_hash: undefined })).filter((r: any) => r.status === 'pending');
  }
  const { data: prs } = await sb.from(PROFILE_REQ).select('data').order('updated_at', { ascending: true });
  const profileRequests = (prs || []).map((r: any) => r.data).filter((r: any) => (admin ? r.status === 'pending' : r.user_id === me.id && (r.status === 'pending' || r.status === 'rejected')));
  const { data: presRows } = await sb.from(PRESENCE).select('*');
  const pres = presRows || [];
  // Coches « lu » : jusqu'où les autres ont lu mes conversations (l'admin voit tout)
  let readsQ = sb.from(CHAT_READS).select('user_id, thread, ms');
  if (!admin) readsQ = readsQ.in('thread', [me.id, ...myGroupIds]);
  const { data: readRows } = await readsQ;
  const reads = (readRows || []).map((r: any) => ({ user_id: r.user_id, thread: r.thread, ms: Number(r.ms) }));
  return res.json({ serverTime, me, collections: out, reads, resets, signups, profileRequests, presence: admin ? pres : undefined, queue: admin ? undefined : queueOf(pres, me.id) });
}

// ---------- sync (écriture) ----------
async function sync(req: any, res: any, me: any) {
  const changes = (req.body && req.body.changes) || {};
  const admin = me.role === 'admin';
  const rejected: { col: string; id: string; reason: string }[] = [];
  const now = new Date().toISOString();
  let tookPost = false;

  for (const col of COLS) {
    const ch = changes[col];
    if (!ch) continue;
    const upserts: any[] = Array.isArray(ch.upserts) ? ch.upserts : [];
    const deletes: string[] = Array.isArray(ch.deletes) ? ch.deletes : [];

    for (const rec of upserts) {
      if (!rec || typeof rec.id !== 'string') continue;
      const { data: row } = await sb.from(T[col]).select('data').eq('id', rec.id).maybeSingle();
      const existing = row?.data as any | undefined;
      let toSave: any = rec;

      if (col === 'messages' || col === 'groups') {
        const v = col === 'messages' ? await checkMessage(rec, existing, me, admin, now) : await checkGroup(rec, existing, me, admin, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: (v as any).reason || 'forbidden' }); continue; }
        toSave = v.save;
      } else if (!admin) {
        let ok = false;
        if (col === 'users') {
          ok = rec.id === me.id && !!existing;
          if (ok) {
            toSave = { ...existing };
            for (const k of ['is_online', 'pending_advance_ar']) if (k in rec) toSave[k] = rec[k];
            // Première photo (obligatoire à l'arrivée) : directe. Ensuite : demande validée par l'admin.
            if ('avatar_url' in rec && !existing.avatar_url) toSave.avatar_url = rec.avatar_url;
          }
        } else if (col === 'posts') {
          ok = rec.employee_id === me.id && EMP_POST_TARGET.includes(rec.status) &&
            (!existing || (existing.employee_id === me.id && OPEN_STATUS.includes(existing.status)));
          if (ok) toSave = { ...rec, calculated_ar: existing?.calculated_ar, admin_notes: existing?.admin_notes };
        } else if (col === 'advances') {
          ok = !existing && rec.employee_id === me.id && rec.status === 'pending' &&
            Number.isFinite(rec.amount_ar) && rec.amount_ar > 0 && rec.amount_ar <= 100_000_000;
          if (ok) {
            const cfg = await payCfg();
            if (cfg.capPct > 0) {
              const room = await advanceRoom(me.id, cfg);
              if (room.available !== null && rec.amount_ar > room.available) ok = false; // au-dessus du plafond
            }
          }
        } else if (col === 'securityLogs') {
          ok = !existing && rec.employee_id === me.id;
        }
        if (!ok) { rejected.push({ col, id: rec.id, reason: 'forbidden' }); continue; }
      }
      await sb.from(T[col]).upsert({ id: rec.id, data: toSave, updated_at: now });
      if (!admin && col === 'posts' && OPEN_STATUS.includes(rec.status)) tookPost = true;
    }

    for (const id of deletes) {
      if (!admin) {
        let ok = false;
        if (col === 'posts') {
          const { data: row } = await sb.from(T.posts).select('data').eq('id', id).maybeSingle();
          ok = !!row && row.data.employee_id === me.id && row.data.status === 'pending_start';
        } else if (col === 'messages') {
          const { data: row } = await sb.from(T.messages).select('data').eq('id', id).maybeSingle();
          ok = !!row && row.data.sender_id === me.id;
        } else if (col === 'groups') {
          const g = await getGroup(id);
          ok = !!g && g.owner_id === me.id;
        }
        if (!ok) { rejected.push({ col, id, reason: 'forbidden' }); continue; }
      }
      if (col === 'users') {
        const u = await getUserRow(id);
        if (u?.role === 'admin') { rejected.push({ col, id, reason: 'admin' }); continue; }
        await sb.from('df_credentials').delete().eq('user_id', id);
        await sb.from(PRESENCE).delete().eq('user_id', id);
      }
      await sb.from(T[col]).delete().eq('id', id);
      if (col === 'groups') {
        await sb.from(T.messages).delete().eq('data->>recipient_id', id);
        await sb.from(CHAT_READS).delete().eq('thread', id);
      }
    }
  }
  if (tookPost) await sb.from(PRESENCE).update({ waiting_since: null }).eq('user_id', me.id);
  return res.json({ ok: true, rejected });
}

// ---------- comptes ----------
async function createUser(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { user, password } = req.body || {};
  const uname = String(user?.username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Pseudo invalide (3 à 30 lettres/chiffres).' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const { data: dup } = await sb.from('df_credentials').select('user_id').eq('username', uname).maybeSingle();
  if (dup) return res.status(409).json({ error: 'Ce pseudo existe déjà.' });

  const id = `user-emp-${Date.now()}`;
  const rec = {
    ...user, id, username: uname, role: 'employee', status: 'active', is_online: false,
    total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
  };
  await sb.from(T.users).upsert({ id, data: rec, updated_at: new Date().toISOString() });
  await sb.from('df_credentials').insert({ user_id: id, username: uname, password_hash: hashPw(password) });
  return res.json({ user: rec });
}

async function setPassword(req: any, res: any, me: any) {
  const { userId, password, currentPassword } = req.body || {};
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const target = me.role === 'admin' && userId ? userId : me.id;
  if (me.role !== 'admin') {
    const { data: c } = await sb.from('df_credentials').select('password_hash').eq('user_id', me.id).maybeSingle();
    if (!c || !checkPw(String(currentPassword || ''), c.password_hash)) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  await sb.from('df_credentials').update({ password_hash: hashPw(password), updated_at: new Date().toISOString() }).eq('user_id', target);
  return res.json({ ok: true });
}

async function logout(_req: any, res: any, me: any) {
  me.is_online = false;
  await sb.from(T.users).upsert({ id: me.id, data: me, updated_at: new Date().toISOString() });
  await sb.from(PRESENCE).update({ last_seen: new Date(0).toISOString(), waiting_since: null }).eq('user_id', me.id);
  return res.json({ ok: true });
}


const isBucketUrl = (u: unknown) =>
  typeof u === 'string' && (u.startsWith(`${SB_URL}/storage/v1/object/public/${BUCKET}/`) || u.startsWith(CLD_PREFIX));

// ---------- modification de profil (validée par l'admin) ----------
// Description facultative jointe à une demande (300 caractères max)
const noteOf = (body: any): string => String(body?.note || '').trim().slice(0, 300);

async function profileRequest(req: any, res: any, me: any) {
  if (me.role === 'admin') return res.status(403).json({ error: 'Réservé aux boosters.' });
  const { name, username, phone, avatar_url } = req.body || {};
  const nm = String(name || '').trim();
  const un = String(username || '').trim().toLowerCase();
  const ph = String(phone || '').trim();
  if (nm.length < 2 || nm.length > 60) return res.status(400).json({ error: 'Nom : 2 à 60 caractères.' });
  if (!/^[a-z0-9_.-]{3,30}$/.test(un)) return res.status(400).json({ error: 'Pseudo invalide (3 à 30 lettres/chiffres).' });
  if (ph.length > 30) return res.status(400).json({ error: 'Téléphone trop long.' });
  if (avatar_url && !isBucketUrl(avatar_url)) return res.status(400).json({ error: 'Photo invalide.' });
  const newAvatar = avatar_url || me.avatar_url || '';
  if (nm === me.name && un === me.username && ph === (me.phone || '') && newAvatar === (me.avatar_url || '')) {
    return res.status(400).json({ error: 'Aucun changement.' });
  }
  if (un !== me.username) {
    const { data: dup } = await sb.from('df_credentials').select('user_id').eq('username', un).maybeSingle();
    if (dup && dup.user_id !== me.id) return res.status(409).json({ error: 'Ce pseudo existe déjà.' });
    const { data: pend } = await sb.from(PROFILE_REQ).select('id').eq('data->>username', un).eq('data->>status', 'pending').neq('id', `pr-${me.id}`).limit(1);
    if (pend && pend.length) return res.status(409).json({ error: 'Ce pseudo existe déjà.' });
  }
  const id = `pr-${me.id}`;
  await sb.from(PROFILE_REQ).upsert({
    id,
    data: {
      id, user_id: me.id, status: 'pending', created_at: new Date().toISOString(),
      old: { name: me.name, username: me.username, phone: me.phone || '', avatar_url: me.avatar_url || '' },
      name: nm, username: un, phone: ph, avatar_url: newAvatar, note: noteOf(req.body),
    },
    updated_at: new Date().toISOString(),
  });
  return res.json({ ok: true });
}

async function profileDecision(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { id, approve } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Demande invalide.' });
  if (approve !== true && reasonOf(req.body).length < 3) return res.status(400).json({ error: REASON_ERR });
  const { data: row } = await sb.from(PROFILE_REQ).select('data').eq('id', id).maybeSingle();
  if (!row || row.data.status !== 'pending') return res.status(404).json({ error: 'Demande introuvable.' });
  const r = row.data;
  if (approve === true) {
    const user = await getUserRow(r.user_id);
    if (!user) { await sb.from(PROFILE_REQ).delete().eq('id', id); return res.status(404).json({ error: 'Compte introuvable.' }); }
    if (r.username !== user.username) {
      const { data: dup } = await sb.from('df_credentials').select('user_id').eq('username', r.username).maybeSingle();
      if (dup && dup.user_id !== user.id) return res.status(409).json({ error: 'Ce pseudo est déjà pris par un autre compte.' });
      await sb.from('df_credentials').update({ username: r.username, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    }
    const nameChanged = r.name !== user.name;
    const next = { ...user, name: r.name, username: r.username, phone: r.phone, avatar_url: r.avatar_url };
    await sb.from(T.users).upsert({ id: user.id, data: next, updated_at: new Date().toISOString() });
    if (nameChanged) await sb.rpc('df_rename_employee', { uid: user.id, new_name: r.name });
  }
  if (approve === true) await sb.from(PROFILE_REQ).delete().eq('id', id);
  else {
    const now = new Date().toISOString();
    await sb.from(PROFILE_REQ).upsert({ id, data: { ...r, status: 'rejected', reason: reasonOf(req.body), decided_at: now }, updated_at: now });
  }
  return res.json({ ok: true });
}

// ---------- mot de passe oublié ----------
async function forgot(req: any, res: any) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Pseudo et nouveau mot de passe requis.' });
  }
  if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const uname = username.trim().toLowerCase();
  await sleep(400);
  const { data: cred } = await sb.from('df_credentials').select('user_id').eq('username', uname).maybeSingle();
  const user = cred ? await getUserRow(cred.user_id) : null;
  if (user && user.role === 'employee' && user.status !== 'blocked') {
    const id = `reset-${user.id}`;
    const { data: ex } = await sb.from(RESETS).select('data').eq('id', id).maybeSingle();
    if (!ex || ex.data.status !== 'pending') {
      await sb.from(RESETS).upsert({
        id,
        data: {
          id, user_id: user.id, username: uname, name: user.name, phone: user.phone || '',
          password_hash: hashPw(password), status: 'pending', created_at: new Date().toISOString(), note: noteOf(req.body),
        },
        updated_at: new Date().toISOString(),
      });
    }
  }
  // Même réponse dans tous les cas : on ne révèle pas quels pseudos existent
  return res.json({ ok: true });
}

async function resetDecision(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { id, approve } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Demande invalide.' });
  if (approve !== true && reasonOf(req.body).length < 3) return res.status(400).json({ error: REASON_ERR });
  const { data: row } = await sb.from(RESETS).select('data').eq('id', id).maybeSingle();
  if (!row || row.data.status !== 'pending') return res.status(404).json({ error: 'Demande introuvable.' });
  if (approve === true) {
    await sb.from('df_credentials').update({ password_hash: row.data.password_hash, updated_at: new Date().toISOString() }).eq('user_id', row.data.user_id);
  }
  if (approve === true) await sb.from(RESETS).delete().eq('id', id);
  else {
    const now = new Date().toISOString();
    await sb.from(RESETS).upsert({ id, data: { ...row.data, status: 'rejected', reason: reasonOf(req.body), decided_at: now }, updated_at: now });
  }
  return res.json({ ok: true });
}

// ---------- inscription (validation par l'admin) ----------
async function signup(req: any, res: any) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const uname = String(b.username || '').trim().toLowerCase();
  const password = String(b.password || '');
  const phone = String(b.phone || '').trim();
  const shift = b.shift === 'night' ? 'night' : 'day';
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Nom complet invalide (2 à 60 caractères).' });
  if (!/^[a-z0-9_.-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'Pseudo invalide (3 à 30 lettres ou chiffres, sans espace).' });
  if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const digits = phone.replace(/\D/g, '');
  if (digits.length > 3 && digits.length !== 12) return res.status(400).json({ error: 'Téléphone incomplet. Format : 261 34 12 345 67' });
  const phoneClean = digits.length === 12 ? `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 10)} ${digits.slice(10, 12)}` : '';
  await sleep(400);
  const { data: cred } = await sb.from('df_credentials').select('user_id').eq('username', uname).maybeSingle();
  if (cred) return res.status(409).json({ error: "Ce pseudo n'est pas disponible. Choisissez-en un autre." });
  const { data: pend } = await sb.from(SIGNUPS).select('data');
  const pending = (pend || []).map((r: any) => r.data).filter((r: any) => r.status === 'pending');
  if (pending.length >= 50) return res.status(429).json({ error: 'Trop de demandes en attente. Réessayez plus tard.' });
  // Anti-spam : limites sur les dernières 24 h (demandes en attente ou refusées)
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const recent = (pend || []).map((r: any) => r.data).filter((r: any) => Date.parse(r.created_at || '') > dayAgo);
  const ipHash = req.headers.ip ? createHash('sha256').update('df-ip:' + req.headers.ip).digest('hex').slice(0, 16) : '';
  if (recent.length >= 40) return res.status(429).json({ error: "Trop de demandes aujourd'hui. Réessayez demain." });
  if (phoneClean && recent.filter((r: any) => r.phone === phoneClean).length >= 3) return res.status(429).json({ error: 'Trop de demandes avec ce numéro. Réessayez demain.' });
  if (ipHash && recent.filter((r: any) => r.ip_hash === ipHash).length >= 8) return res.status(429).json({ error: 'Trop de demandes depuis cet appareil. Réessayez demain.' });
  if (pending.some((r: any) => r.username === uname)) return res.status(409).json({ error: "Ce pseudo n'est pas disponible. Choisissez-en un autre." });
  if (phoneClean && pending.some((r: any) => r.phone === phoneClean)) return res.status(409).json({ error: 'Une demande avec ce numéro est déjà en attente.' });
  const id = `signup-${uname}`;
  await sb.from(SIGNUPS).upsert({
    id,
    data: { id, name, username: uname, phone: phoneClean, shift, password_hash: hashPw(password), status: 'pending', created_at: new Date().toISOString(), ip_hash: ipHash, note: noteOf(req.body) },
    updated_at: new Date().toISOString(),
  });
  return res.json({ ok: true });
}

async function signupDecision(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { id, approve } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Demande invalide.' });
  if (approve !== true && reasonOf(req.body).length < 3) return res.status(400).json({ error: REASON_ERR });
  const { data: row } = await sb.from(SIGNUPS).select('data').eq('id', id).maybeSingle();
  if (!row || row.data.status !== 'pending') return res.status(404).json({ error: 'Demande introuvable.' });
  const r = row.data;
  if (approve === true) {
    const { data: dup } = await sb.from('df_credentials').select('user_id').eq('username', r.username).maybeSingle();
    if (dup) {
      await sb.from(SIGNUPS).delete().eq('id', id);
      return res.status(409).json({ error: 'Ce pseudo existe déjà. La demande a été supprimée.' });
    }
    const uid = `user-emp-${Date.now()}`;
    const rec = {
      id: uid, name: r.name, username: r.username, phone: r.phone || '', role: 'employee', status: 'active',
      shift: r.shift === 'night' ? 'night' : 'day', is_online: false, avatar_url: '', performance_badge: 'Standard',
      total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
      cv_data: { joinedDate: new Date().toISOString().slice(0, 10) },
    };
    await sb.from(T.users).upsert({ id: uid, data: rec, updated_at: new Date().toISOString() });
    await sb.from('df_credentials').insert({ user_id: uid, username: r.username, password_hash: r.password_hash });
  }
  if (approve === true) await sb.from(SIGNUPS).delete().eq('id', id);
  else {
    const now = new Date().toISOString();
    await sb.from(SIGNUPS).upsert({ id, data: { ...r, status: 'rejected', reason: reasonOf(req.body), decided_at: now }, updated_at: now });
  }
  return res.json({ ok: true });
}

// ---------- paie : périodes, fiches figées, primes, retenues, paiement (table df_payroll) ----------
const PAYROLL = "df_payroll";
type AutoPen = { on: boolean; late1Min: number; late1M: number; late2Min: number; late2M: number; absentM: number };
type PayCfg = { mode: 'month' | 'half'; capPct: number; repayPct: number; methods: string[]; penalties: boolean; auto: AutoPen; price: number; dayStart: string; nightStart: string };
const num = (v: any, def: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
async function payCfg(): Promise<PayCfg> {
  const { data: st } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  const d: any = st?.data || {};
  const methods = Array.isArray(d.pay_methods) ? d.pay_methods.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 10) : [];
  return {
    mode: d.pay_period === 'half' ? 'half' : 'month',
    capPct: num(d.advance_cap_pct, 0, 0, 100), // 0 = pas de plafond
    repayPct: num(d.advance_repay_pct, 100, 0, 100),
    methods: methods.length ? methods : ['MVola', 'Orange Money', 'Airtel Money', 'Espèces'],
    penalties: d.penalties_enabled === true,
    // Pénalités automatiques en score (1M de score = prix du 1M) : retards par paliers, absence non annoncée
    auto: {
      on: d.auto_pen_enabled !== false,
      late1Min: num(d.auto_pen_late1_min, 15, 1, 600), late1M: num(d.auto_pen_late1_m, 1, 0, 1000),
      late2Min: num(d.auto_pen_late2_min, 30, 1, 600), late2M: num(d.auto_pen_late2_m, 2, 0, 1000),
      absentM: num(d.auto_pen_absent_m, 5, 0, 1000),
    },
    price: num(d.price_per_million, 1000, 0, 100000000),
    dayStart: String(d.day_shift_start || '08:00'), nightStart: String(d.night_shift_start || '20:00'),
  };
}

// Pénalités automatiques d'une période : retard (palier 1 / palier 2) et absence, chacune en millions de score × prix du 1M.
// Mêmes règles que le calendrier : retard = première session du jour plus tard que le début du shift ; absence = jour passé (lundi à samedi)
// sans aucune session, depuis la première activité du booster. Les absences « annoncées » n'existent pas encore sur le site : toute absence compte.
const hmMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
async function autoPenalties(info: { start: string; end: string }, cfg: PayCfg, onlyUser: string | undefined, users: Map<string, any>) {
  const out = new Map<string, any[]>();
  if (!cfg.auto.on) return out;
  const rows = await fetchAll((a, b) => {
    let q = sb.from(T.posts).select('data').gte('data->>date', info.start).lte('data->>date', info.end);
    if (onlyUser) q = q.eq('data->>employee_id', onlyUser);
    return q.order('id').range(a, b);
  });
  const WORKED = new Set(['completed', 'active', 'pending_start', 'pending_end']);
  const byUser = new Map<string, Map<string, any[]>>();
  for (const r of rows) {
    const p = r.data;
    if (!WORKED.has(p.status)) continue;
    if (!byUser.has(p.employee_id)) byUser.set(p.employee_id, new Map());
    const days = byUser.get(p.employee_id)!;
    if (!days.has(p.date)) days.set(p.date, []);
    days.get(p.date)!.push(p);
  }
  const yesterday = new Date(new Date(todayMada() + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const lastAbs = info.end < yesterday ? info.end : yesterday;
  const emps = [...users.values()].filter(u => u.role === 'employee' && u.status !== 'blocked' && (!onlyUser || u.id === onlyUser));
  const first = new Map<string, string>(); // première activité (première session ou première connexion)
  for (let i = 0; i < emps.length; i += 20) {
    await Promise.all(emps.slice(i, i + 20).map(async u => {
      const [{ data: a }, { data: b }] = await Promise.all([
        sb.from(T.posts).select('d:data->>date').eq('data->>employee_id', u.id).order('data->>date', { ascending: true }).limit(1),
        sb.from(ATTENDANCE).select('day').eq('user_id', u.id).order('day', { ascending: true }).limit(1),
      ]);
      const c = [a?.[0]?.d, b?.[0]?.day].filter(Boolean).sort();
      if (c.length) first.set(u.id, c[0] as string);
    }));
  }
  const addM = (uid: string, id: string, m: number, reason: string, date: string) => {
    if (m <= 0) return;
    if (!out.has(uid)) out.set(uid, []);
    out.get(uid)!.push({ id, amount: Math.round(m * cfg.price), reason, at: date + 'T12:00:00.000Z', auto: true });
  };
  for (const u of emps) {
    const days = byUser.get(u.id) || new Map<string, any[]>();
    for (const [date, list] of days) {
      const first1 = [...list].sort((x, y) => String(x.start_time).localeCompare(String(y.start_time)))[0];
      const base = first1.shift_type === 'night' ? cfg.nightStart : cfg.dayStart;
      const diff = hmMin(first1.start_time) - hmMin(base);
      if (diff < 0 || diff >= 12 * 60) continue;
      if (diff >= cfg.auto.late2Min) addM(u.id, `auto-late-${date}`, cfg.auto.late2M, `Retard de ${diff} min le ${date} (−${cfg.auto.late2M}M de score)`, date);
      else if (diff >= cfg.auto.late1Min) addM(u.id, `auto-late-${date}`, cfg.auto.late1M, `Retard de ${diff} min le ${date} (−${cfg.auto.late1M}M de score)`, date);
    }
    const f = first.get(u.id);
    if (!f) continue;
    for (let d = info.start; d <= lastAbs; d = new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)) {
      if (d < f || days.has(d)) continue;
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) continue; // dimanche = repos
      addM(u.id, `auto-abs-${d}`, cfg.auto.absentM, `Absence non annoncée le ${d} (−${cfg.auto.absentM}M de score)`, d);
    }
  }
  return out;
}
const todayMada = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function pidInfo(pid: string) {
  const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(String(pid));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const ym = `${m[1]}-${m[2]}`;
  if (m[3] === 'A') return { pid, start: `${ym}-01`, end: `${ym}-15` };
  if (m[3] === 'B') return { pid, start: `${ym}-16`, end: `${ym}-${p2(lastDay(y, mo))}` };
  return { pid, start: `${ym}-01`, end: `${ym}-${p2(lastDay(y, mo))}` };
}
const periodOfDate = (date: string, mode: 'month' | 'half') =>
  pidInfo(mode === 'half' ? `${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? 'A' : 'B'}` : date.slice(0, 7))!;
function prevPid(pid: string): string {
  const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(pid)!;
  if (m[3] === 'B') return `${m[1]}-${m[2]}-A`;
  let y = Number(m[1]), mo = Number(m[2]) - 1;
  if (mo === 0) { mo = 12; y -= 1; }
  return m[3] === 'A' ? `${y}-${p2(mo)}-B` : `${y}-${p2(mo)}`;
}
async function fetchAll(build: (a: number, b: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const sumOf = (a: any[]) => a.reduce((t, x) => t + (Number(x.amount) || 0), 0);
const audit = (pid: string, action: string, me: any, detail: string) =>
  sb.from(PAYROLL).upsert({
    id: `audit-${Date.now()}-${randomBytes(3).toString('hex')}`,
    data: { kind: 'audit', pid, action, by: me.id, by_name: me.name || me.username || '', at: new Date().toISOString(), detail: String(detail).slice(0, 300) },
    updated_at: new Date().toISOString(),
  });

// Calcule les fiches d'une période (aperçu, ou base de la clôture). Les montants par session viennent de calculated_ar (figé à la validation).
async function computeSlips(info: { pid: string; start: string; end: string }, cfg: PayCfg, onlyUser?: string) {
  const posts = await fetchAll((a, b) => {
    let q = sb.from(T.posts).select('data').gte('data->>date', info.start).lte('data->>date', info.end).eq('data->>status', 'completed');
    if (onlyUser) q = q.eq('data->>employee_id', onlyUser);
    return q.order('id').range(a, b);
  });
  const bonusRows = await fetchAll((a, b) => {
    let q = sb.from(PAYROLL).select('data').eq('data->>kind', 'bonus').eq('data->>pid', info.pid);
    if (onlyUser) q = q.eq('data->>user_id', onlyUser);
    return q.order('id').range(a, b);
  });
  const advRows = await fetchAll((a, b) => {
    let q = sb.from(T.advances).select('data').eq('data->>status', 'approved').lte('data->>request_date', info.end + '~');
    if (onlyUser) q = q.eq('data->>employee_id', onlyUser);
    return q.order('id').range(a, b);
  });
  const slipRows = await fetchAll((a, b) => {
    let q = sb.from(PAYROLL).select('data').eq('data->>kind', 'slip').lt('data->>period_end', info.start);
    if (onlyUser) q = q.eq('data->>user_id', onlyUser);
    return q.order('id').range(a, b);
  });
  const { data: urows } = await sb.from(T.users).select('data');
  const users = new Map<string, any>((urows || []).map((r: any) => [r.data.id, r.data]));

  const acc = new Map<string, any>();
  const get = (uid: string) => {
    if (!acc.has(uid)) acc.set(uid, { lines: [], bonuses: [], penalties: [], approved: 0, deducted: 0 });
    return acc.get(uid);
  };
  for (const r of posts) {
    const p = r.data;
    const amount = Math.max(0, Math.round(Number(p.calculated_ar) || 0));
    const score = Math.max(0, (Number(p.final_score ?? p.current_score) || 0) - (Number(p.initial_score) || 0));
    get(p.employee_id).lines.push({ post_id: p.id, date: p.date, client: p.client_name, post_number: p.post_number ?? null, score, rate: score > 0 ? Math.round((amount / score) * 1_000_000) : 0, amount });
  }
  for (const r of bonusRows) {
    const b = r.data;
    const e = { id: b.id, amount: Number(b.amount) || 0, reason: b.reason, at: b.at };
    (b.type === 'penalty' ? get(b.user_id).penalties : get(b.user_id).bonuses).push(e);
  }
  for (const [uid, list] of await autoPenalties(info, cfg, onlyUser, users)) get(uid).penalties.push(...list);
  for (const r of advRows) get(r.data.employee_id).approved += Math.max(0, Math.round(Number(r.data.amount_ar) || 0));
  for (const r of slipRows) get(r.data.user_id).deducted += Math.round(Number(r.data.advance_deducted) || 0);

  const slips: any[] = [];
  for (const [uid, a] of acc) {
    const u = users.get(uid);
    if (!u || u.role === 'admin') continue;
    const gross = a.lines.reduce((t: number, l: any) => t + l.amount, 0);
    const bon = sumOf(a.bonuses), pen = sumOf(a.penalties);
    const due = Math.max(0, a.approved - a.deducted);
    if (gross === 0 && bon === 0 && pen === 0 && due === 0) continue;
    const total = gross + bon;
    const penApplied = Math.min(pen, total);
    const afterPen = total - penApplied;
    const advDeducted = Math.min(due, Math.floor((afterPen * cfg.repayPct) / 100)); // jamais plus que le dû, jamais de net négatif
    slips.push({
      id: `slip-${info.pid}-${uid}`, kind: 'slip', pid: info.pid, period_start: info.start, period_end: info.end,
      user_id: uid, name: u.name, username: u.username, phone: u.phone || '',
      lines: a.lines.sort((x: any, y: any) => String(x.date).localeCompare(String(y.date))),
      gross, bonuses: a.bonuses, penalties: a.penalties, penalty_applied: penApplied,
      advance_due_before: due, advance_deducted: advDeducted, advance_carry: due - advDeducted,
      net: afterPen - advDeducted, paid: null,
    });
  }
  return slips.sort((x, y) => String(x.name).localeCompare(String(y.name)));
}

// Avance possible : plafond = % de ce que le booster a gagné dans la période en cours (0 = pas de plafond)
async function advanceRoom(uid: string, cfg: PayCfg) {
  const info = periodOfDate(todayMada(), cfg.mode);
  const mine = (await computeSlips(info, cfg, uid)).find(x => x.user_id === uid);
  const base = (mine?.gross || 0) + sumOf(mine?.bonuses || []);
  const advs = await fetchAll((a, b) =>
    sb.from(T.advances).select('data').eq('data->>employee_id', uid).in('data->>status', ['approved', 'pending'])
      .gte('data->>request_date', info.start).lte('data->>request_date', info.end + '~').order('id').range(a, b));
  const used = advs.reduce((t, r) => t + (Number(r.data.amount_ar) || 0), 0);
  const max = cfg.capPct > 0 ? Math.floor((base * cfg.capPct) / 100) : null;
  return {
    pid: info.pid, start: info.start, end: info.end, gross: mine?.gross || 0, bonuses: sumOf(mine?.bonuses || []),
    due: mine?.advance_due_before || 0, cap_pct: cfg.capPct, max, used, available: max === null ? null : Math.max(0, max - used),
  };
}

const adminOnly = (res: any, me: any) => (me.role !== 'admin' ? res.status(403).json({ error: "Réservé à l'administrateur." }) : null);
const reasonText = (b: any) => String(b?.reason || '').trim().slice(0, 200);

async function payrollPeriod(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const info = pidInfo(req.body?.pid);
  if (!info) return res.status(400).json({ error: 'Période invalide.' });
  const cfg = await payCfg();
  const { data: pd } = await sb.from(PAYROLL).select('data').eq('id', `period-${info.pid}`).maybeSingle();
  const slips = pd
    ? (await fetchAll((a, b) => sb.from(PAYROLL).select('data').eq('data->>kind', 'slip').eq('data->>pid', info.pid).order('id').range(a, b))).map(r => r.data)
        .sort((x: any, y: any) => String(x.name).localeCompare(String(y.name)))
    : await computeSlips(info, cfg);
  const status = pd ? pd.data.status : info.end < todayMada() ? 'to_check' : 'open';
  const { count } = await sb.from(T.posts).select('id', { count: 'exact', head: true })
    .gte('data->>date', info.start).lte('data->>date', info.end).in('data->>status', ['pending_start', 'pending_end', 'active']);
  const { data: au } = await sb.from(PAYROLL).select('data').eq('data->>kind', 'audit').eq('data->>pid', info.pid).order('updated_at', { ascending: false }).limit(30);
  const { data: idx } = await sb.from(PAYROLL).select('data').eq('data->>kind', 'period').order('id', { ascending: false }).limit(60);
  return res.json({
    pid: info.pid, start: info.start, end: info.end, status, closed_at: pd?.data.closed_at || null, closed_by_name: pd?.data.closed_by_name || '',
    slips, pending_validation: count || 0, audit: (au || []).map((r: any) => r.data),
    index: (idx || []).map((r: any) => ({ pid: r.data.pid, status: r.data.status })),
    cfg: { methods: cfg.methods, penalties: cfg.penalties, cap_pct: cfg.capPct, repay_pct: cfg.repayPct, mode: cfg.mode },
  });
}

async function payrollClose(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const info = pidInfo(req.body?.pid);
  if (!info) return res.status(400).json({ error: 'Période invalide.' });
  const cfg = await payCfg();
  const { data: ex } = await sb.from(PAYROLL).select('id').eq('id', `period-${info.pid}`).maybeSingle();
  if (ex) return res.status(409).json({ error: 'Cette période est déjà clôturée.' });
  if (info.end >= todayMada()) return res.status(400).json({ error: "Cette période n'est pas terminée. Clôture-la après son dernier jour." });
  const { count: pend } = await sb.from(T.posts).select('id', { count: 'exact', head: true })
    .gte('data->>date', info.start).lte('data->>date', info.end).in('data->>status', ['pending_start', 'pending_end', 'active']);
  if ((pend || 0) > 0) return res.status(409).json({ error: `${pend} session(s) de cette période sont encore à valider ou en cours. Valide-les d'abord.` });
  const prev = pidInfo(prevPid(info.pid))!;
  const { count: prevDone } = await sb.from(T.posts).select('id', { count: 'exact', head: true })
    .gte('data->>date', prev.start).lte('data->>date', prev.end).eq('data->>status', 'completed');
  if ((prevDone || 0) > 0) {
    const { data: pp } = await sb.from(PAYROLL).select('id').eq('id', `period-${prev.pid}`).maybeSingle();
    if (!pp) return res.status(409).json({ error: `Clôture d'abord la période précédente (${prev.pid}).` });
  }
  const slips = await computeSlips(info, cfg);
  const now = new Date().toISOString();
  for (const sl of slips) await sb.from(PAYROLL).upsert({ id: sl.id, data: { ...sl, closed_at: now }, updated_at: now });
  await sb.from(PAYROLL).upsert({
    id: `period-${info.pid}`,
    data: { kind: 'period', pid: info.pid, period_start: info.start, period_end: info.end, status: 'closed', closed_at: now, closed_by: me.id, closed_by_name: me.name || '', gross: slips.reduce((t, x) => t + x.gross, 0), net: slips.reduce((t, x) => t + x.net, 0), count: slips.length },
    updated_at: now,
  });
  await audit(info.pid, 'close', me, `Clôture : ${slips.length} fiche(s), net total ${slips.reduce((t, x) => t + x.net, 0)} Ar`);
  return res.json({ ok: true });
}

async function payrollReopen(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const info = pidInfo(req.body?.pid);
  if (!info) return res.status(400).json({ error: 'Période invalide.' });
  const reason = reasonText(req.body);
  if (reason.length < 3) return res.status(400).json({ error: 'Écris un motif (3 caractères minimum).' });
  const { data: pd } = await sb.from(PAYROLL).select('data').eq('id', `period-${info.pid}`).maybeSingle();
  if (!pd) return res.status(404).json({ error: "Cette période n'est pas clôturée." });
  const slips = await fetchAll((a, b) => sb.from(PAYROLL).select('data').eq('data->>kind', 'slip').eq('data->>pid', info.pid).order('id').range(a, b));
  if (slips.some(r => r.data.paid)) return res.status(409).json({ error: 'Une fiche est déjà payée. Annule le paiement avant de rouvrir.' });
  await sb.from(PAYROLL).delete().eq('data->>kind', 'slip').eq('data->>pid', info.pid);
  await sb.from(PAYROLL).delete().eq('id', `period-${info.pid}`);
  await audit(info.pid, 'reopen', me, `Réouverture. Motif : ${reason}`);
  return res.json({ ok: true });
}

async function payrollPay(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const info = pidInfo(req.body?.pid);
  const uid = String(req.body?.user_id || '');
  if (!info || !uid) return res.status(400).json({ error: 'Demande invalide.' });
  const cfg = await payCfg();
  const { data: row } = await sb.from(PAYROLL).select('data').eq('id', `slip-${info.pid}-${uid}`).maybeSingle();
  const { data: pd } = await sb.from(PAYROLL).select('data').eq('id', `period-${info.pid}`).maybeSingle();
  if (!row || !pd) return res.status(404).json({ error: 'Fiche introuvable. La période doit être clôturée.' });
  const slip = row.data;
  const now = new Date().toISOString();
  if (req.body?.undo === true) {
    const reason = reasonText(req.body);
    if (reason.length < 3) return res.status(400).json({ error: 'Écris un motif (3 caractères minimum).' });
    if (!slip.paid) return res.status(409).json({ error: "Cette fiche n'est pas marquée payée." });
    await sb.from(PAYROLL).upsert({ id: slip.id, data: { ...slip, paid: null }, updated_at: now });
    await sb.from(PAYROLL).upsert({ id: `period-${info.pid}`, data: { ...pd.data, status: 'closed' }, updated_at: now });
    await audit(info.pid, 'unpay', me, `Paiement annulé pour ${slip.name}. Motif : ${reason}`);
    return res.json({ ok: true });
  }
  const method = String(req.body?.method || '');
  if (!cfg.methods.includes(method)) return res.status(400).json({ error: 'Mode de paiement invalide.' });
  const date = String(req.body?.date || todayMada());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayMada()) return res.status(400).json({ error: 'Date de paiement invalide.' });
  if (slip.net <= 0) return res.status(400).json({ error: 'Rien à payer sur cette fiche (net à 0).' });
  if (slip.paid) return res.status(409).json({ error: 'Cette fiche est déjà payée.' });
  const ref = String(req.body?.ref || '').trim().slice(0, 60);
  await sb.from(PAYROLL).upsert({ id: slip.id, data: { ...slip, paid: { at: date, method, ref, by: me.id, by_name: me.name || '' } }, updated_at: now });
  const all = await fetchAll((a, b) => sb.from(PAYROLL).select('data').eq('data->>kind', 'slip').eq('data->>pid', info.pid).order('id').range(a, b));
  const allPaid = all.every(r => (r.data.id === slip.id ? true : r.data.net <= 0 || !!r.data.paid));
  if (allPaid) await sb.from(PAYROLL).upsert({ id: `period-${info.pid}`, data: { ...pd.data, status: 'paid' }, updated_at: now });
  await audit(info.pid, 'pay', me, `${slip.name} : ${slip.net} Ar payé par ${method}${ref ? ` (réf. ${ref})` : ''}`);
  return res.json({ ok: true });
}

async function payrollBonus(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const info = pidInfo(req.body?.pid);
  const uid = String(req.body?.user_id || '');
  const type = req.body?.type === 'penalty' ? 'penalty' : 'bonus';
  const amount = Math.round(Number(req.body?.amount));
  const reason = reasonText(req.body);
  if (!info || !uid) return res.status(400).json({ error: 'Demande invalide.' });
  if (!Number.isFinite(amount) || amount < 1 || amount > 10_000_000) return res.status(400).json({ error: 'Montant invalide (1 à 10 000 000 Ar).' });
  if (reason.length < 3) return res.status(400).json({ error: 'Écris un motif (3 caractères minimum).' });
  const cfg = await payCfg();
  if (type === 'penalty' && !cfg.penalties) return res.status(403).json({ error: 'Les pénalités sont désactivées dans les Réglages.' });
  const { data: pd } = await sb.from(PAYROLL).select('id').eq('id', `period-${info.pid}`).maybeSingle();
  if (pd) return res.status(409).json({ error: 'Cette période est clôturée. Rouvre-la pour la modifier.' });
  const u = await getUserRow(uid);
  if (!u || u.role === 'admin') return res.status(404).json({ error: 'Booster introuvable.' });
  const now = new Date().toISOString();
  const id = `bonus-${info.pid}-${uid}-${Date.now()}`;
  await sb.from(PAYROLL).upsert({ id, data: { kind: 'bonus', type, id, pid: info.pid, user_id: uid, user_name: u.name, amount, reason, by: me.id, by_name: me.name || '', at: now }, updated_at: now });
  await audit(info.pid, type === 'penalty' ? 'penalty' : 'bonus', me, `${type === 'penalty' ? 'Retenue' : 'Prime'} de ${amount} Ar pour ${u.name}. Motif : ${reason}`);
  return res.json({ ok: true });
}

async function payrollBonusDelete(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const id = String(req.body?.id || '');
  const reason = reasonText(req.body);
  if (reason.length < 3) return res.status(400).json({ error: 'Écris un motif (3 caractères minimum).' });
  const { data: row } = await sb.from(PAYROLL).select('data').eq('id', id).maybeSingle();
  if (!row || row.data.kind !== 'bonus') return res.status(404).json({ error: 'Introuvable.' });
  const { data: pd } = await sb.from(PAYROLL).select('id').eq('id', `period-${row.data.pid}`).maybeSingle();
  if (pd) return res.status(409).json({ error: 'Cette période est clôturée. Rouvre-la pour la modifier.' });
  await sb.from(PAYROLL).delete().eq('id', id);
  await audit(row.data.pid, 'bonus-delete', me, `${row.data.type === 'penalty' ? 'Retenue' : 'Prime'} de ${row.data.amount} Ar supprimée (${row.data.user_name}). Motif : ${reason}`);
  return res.json({ ok: true });
}

// Pour le booster : ses fiches clôturées + sa période en cours (avec le plafond d'avance possible)
async function payrollMine(_req: any, res: any, me: any) {
  const cfg = await payCfg();
  const rows = await fetchAll((a, b) => sb.from(PAYROLL).select('data').eq('data->>kind', 'slip').eq('data->>user_id', me.id).order('id', { ascending: false }).range(a, b));
  const slips = rows.map(r => r.data).sort((x: any, y: any) => String(y.pid).localeCompare(String(x.pid))).slice(0, 24);
  const current = await advanceRoom(me.id, cfg);
  return res.json({ slips, current, cfg: { methods: cfg.methods, mode: cfg.mode } });
}

// ---------- fichiers (photos, pièces jointes) ----------
// ---------- Cloudinary (photos) ----------
let cldCache: { key: string; secret: string; at: number } | null = null;
async function cldCreds() {
  if (cldCache && Date.now() - cldCache.at < 10 * 60 * 1000) return cldCache;
  const [k, sc] = await Promise.all([
    sb.rpc('df_get_secret', { secret_name: 'cloudinary_api_key' }),
    sb.rpc('df_get_secret', { secret_name: 'cloudinary_api_secret' }),
  ]);
  if (k.error || sc.error || !k.data || !sc.data) { console.error('cloudinary vault error:', k.error || sc.error); return null; }
  cldCache = { key: String(k.data), secret: String(sc.data), at: Date.now() };
  return cldCache;
}
const sha1 = (t: string) => createHash('sha1').update(t).digest('hex');

// Envoie une image ; renvoie l'URL https ou null si échec
async function cldUpload(dataUrl: string, id: string): Promise<string | null> {
  try {
    const c = await cldCreds();
    if (!c) return null;
    const publicId = `df-proofs/${id}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const form = new FormData();
    form.set('file', dataUrl);
    form.set('api_key', c.key);
    form.set('timestamp', ts);
    form.set('public_id', publicId);
    form.set('signature', sha1(`public_id=${publicId}&timestamp=${ts}${c.secret}`));
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, { method: 'POST', body: form });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.secure_url !== 'string' || !j.secure_url.startsWith(CLD_PREFIX)) {
      console.error('cloudinary upload error:', r.status, j?.error?.message);
      return null;
    }
    return j.secure_url;
  } catch (e) { console.error('cloudinary upload exception:', e); return null; }
}

// Supprime une image (identifiant lu dans l'URL) ; true si supprimée ou déjà absente
async function cldDestroy(publicId: string): Promise<boolean> {
  try {
    const c = await cldCreds();
    if (!c) return false;
    const ts = String(Math.floor(Date.now() / 1000));
    const body = new URLSearchParams({
      public_id: publicId, timestamp: ts, api_key: c.key, invalidate: 'true',
      signature: sha1(`invalidate=true&public_id=${publicId}&timestamp=${ts}${c.secret}`),
    });
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/destroy`, { method: 'POST', body });
    const j: any = await r.json().catch(() => ({}));
    return r.ok && (j.result === 'ok' || j.result === 'not found');
  } catch (e) { console.error('cloudinary destroy exception:', e); return false; }
}
const cldIdOf = (u: string) => {
  if (!u.startsWith(CLD_PREFIX)) return '';
  const m = u.slice(CLD_PREFIX.length).match(/^(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return m ? decodeURIComponent(m[1]) : '';
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf', 'text/plain': 'txt',
};
async function upload(req: any, res: any, me: any) {
  const { dataUrl } = req.body || {};
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:([a-z0-9.+\/-]+);base64,(.+)$/i) : null;
  if (!m) return res.status(400).json({ error: 'Fichier invalide.' });
  const mime = m[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return res.status(400).json({ error: 'Type de fichier non accepté.' });
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Fichier trop gros (10 Mo max).' });
  // Images : Cloudinary (plus de place gratuite). En cas d'échec ou de PDF/texte : Supabase Storage.
  if (mime.startsWith('image/')) {
    const url = await cldUpload(dataUrl, `${me.id}-${Date.now()}-${randomBytes(6).toString('hex')}`);
    if (url) return res.json({ url, path: '' });
  }
  const path = `${me.id}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) { console.error('upload error:', error); return res.status(500).json({ error: 'Envoi impossible.' }); }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return res.json({ url: data.publicUrl, path });
}

// ---------- nettoyage automatique des anciennes preuves ----------
let lastPurge = 0;
const pathOf = (u: string) => {
  const i = u.indexOf(`/object/public/${BUCKET}/`);
  return i >= 0 ? decodeURIComponent(u.slice(i + `/object/public/${BUCKET}/`.length)) : '';
};
async function maybePurge() {
  if (Date.now() - lastPurge < 2 * 3600 * 1000) return;
  lastPurge = Date.now();
  try {
    const { data: st } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
    const days = Math.max(1, Number(st?.data?.retention_days) || 7);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    // Journal des erreurs : résolues gardées 30 jours, tout le reste 90 jours (la base gratuite est limitée à 500 Mo)
    await sb.from(ERRORS).delete().eq('status', 'resolved').lt('last_seen', new Date(Date.now() - 30 * 86400_000).toISOString());
    await sb.from(ERRORS).delete().lt('last_seen', new Date(Date.now() - 90 * 86400_000).toISOString());
    const { data: rows } = await sb.from(T.posts).select('id,data')
      .lt('updated_at', cutoff).in('data->>status', ['completed', 'rejected', 'force_released']).order('updated_at', { ascending: true }).limit(60);
    for (const r of rows || []) {
      const p = r.data;
      if (p.proofs_purged) continue;
      const urls: string[] = [p.start_proof_url, p.end_proof_url, ...(p.start_proof_urls || []), ...(p.end_proof_urls || [])].filter(Boolean);
      const paths = urls.map(pathOf).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      // Photos Cloudinary : si une suppression échoue, on réessaie au prochain passage (la session n'est pas marquée)
      const ids = urls.map(cldIdOf).filter(Boolean);
      const results = await Promise.all(ids.map(cldDestroy));
      if (results.some(ok => !ok)) continue;
      const next = { ...p, start_proof_url: '', end_proof_url: '', start_proof_urls: [], end_proof_urls: [], proofs_purged: true };
      await sb.from(T.posts).upsert({ id: r.id, data: next, updated_at: new Date().toISOString() });
    }
  } catch (e) { console.error('purge error:', e); }
}

// ---------- erreurs du site : rapports automatiques, signalements, journal (table df_errors) ----------
const ERRORS = "df_errors";
const errRate = new Map<string, number[]>(); // 30 rapports par heure et par adresse (compteur propre à chaque instance)
const cutTxt = (v: unknown, n: number) => String(v ?? '').slice(0, n);
async function reportError(req: any, res: any) {
  const b = req.body || {};
  const kind = ['crash', 'error', 'server', 'report'].includes(b.kind) ? String(b.kind) : 'error';
  const me = await authenticate(req); // facultatif : la page de connexion peut planter aussi
  const ipKey = req.headers.ip || 'inconnue';
  const nowMs = Date.now();
  const hits = (errRate.get(ipKey) || []).filter(t => nowMs - t < 3600_000);
  if (hits.length >= 30) return res.status(429).json({ error: 'Trop de rapports.' });
  hits.push(nowMs);
  errRate.set(ipKey, hits);
  if (errRate.size > 2000) errRate.clear();
  const nowIso = new Date().toISOString();
  const common = {
    kind,
    message: cutTxt(b.message, 300),
    stack: cutTxt(b.stack, 1500),
    page: cutTxt(b.page, 60),
    role: me ? me.role : cutTxt(b.role, 20),
    device: cutTxt(b.device, 140),
    version: cutTxt(b.version, 40),
  };
  if (kind === 'report') {
    if (!me) return res.status(401).json({ error: 'Connecte-toi pour signaler un problème.' });
    const detail = cutTxt(b.detail, 1000).trim();
    if (detail.length < 3) return res.status(400).json({ error: 'Décris le problème en quelques mots.' });
    const shot = typeof b.screenshot_url === 'string' && b.screenshot_url.startsWith(CLD_PREFIX) ? b.screenshot_url.slice(0, 400) : null;
    const id = `rp-${Date.now()}-${randomBytes(3).toString('hex')}`;
    await sb.from(ERRORS).insert({ id, ...common, message: common.message || 'Signalement', detail, screenshot_url: shot, users: [me.id], first_seen: nowIso, last_seen: nowIso, status: 'open' });
    return res.json({ ok: true, id });
  }
  const fp = /^[a-f0-9]{6,16}$/.test(String(b.fingerprint || '')) ? String(b.fingerprint) : '';
  if (!fp) return res.status(400).json({ error: 'Empreinte invalide.' });
  const { data: ex } = await sb.from(ERRORS).select('*').eq('fingerprint', fp).maybeSingle();
  if (ex) {
    const users: string[] = Array.isArray(ex.users) ? ex.users : [];
    if (me && !users.includes(me.id) && users.length < 20) users.push(me.id);
    // Une erreur déjà « résolue » qui revient est rouverte
    await sb.from(ERRORS).update({ count: (ex.count || 1) + 1, last_seen: nowIso, users, status: 'open', version: common.version || ex.version }).eq('id', ex.id);
  } else {
    const { error } = await sb.from(ERRORS).insert({ id: `er-${fp}`, fingerprint: fp, ...common, users: me ? [me.id] : [], first_seen: nowIso, last_seen: nowIso, count: 1, status: 'open' });
    if (error) console.error('error insert:', error.message); // deux rapports identiques en même temps : le 2e est ignoré
  }
  return res.json({ ok: true });
}
async function errorsList(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const st = String(req.query.status || 'open');
  let q = sb.from(ERRORS).select('*').order('last_seen', { ascending: false }).limit(300);
  if (st === 'open' || st === 'resolved') q = q.eq('status', st);
  const { data } = await q;
  return res.json({ rows: data || [] });
}
async function errorUpdate(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { id, status, remove } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'Rapport invalide.' });
  if (remove === true) await sb.from(ERRORS).delete().eq('id', id);
  else if (status === 'open' || status === 'resolved') await sb.from(ERRORS).update({ status }).eq('id', id);
  else return res.status(400).json({ error: 'Statut invalide.' });
  return res.json({ ok: true });
}

// ---------- routeur ----------
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(request.url);
  const action = url.pathname.split("/").filter(Boolean).pop() || "";
  const res: any = {
    _s: 200,
    status(n: number) { this._s = n; return this; },
    json(b: unknown) {
      return new Response(JSON.stringify(b), {
        status: this._s,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    },
  };
  let body: any = {};
  if (request.method === "POST") { try { body = await request.json(); } catch { body = {}; } }
  const req: any = {
    method: request.method,
    body,
    query: { since: url.searchParams.get("since") || "", day: url.searchParams.get("day") || "", status: url.searchParams.get("status") || "" },
    headers: {
      authorization: request.headers.get("authorization") || "",
      ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
    },
  };
  try {
    if (action === "login" && req.method === "POST") return await login(req, res);
    if (action === "forgot" && req.method === "POST") return await forgot(req, res);
    if (action === "signup" && req.method === "POST") return await signup(req, res);
    if (action === "report-error" && req.method === "POST") return await reportError(req, res);
    const me = await authenticate(req);
    if (!me) return res.status(401).json({ error: "Session expirée. Reconnectez-vous." });
    if (action !== "logout") {
      const mm = await maintenanceMessage(me);
      if (mm) return res.status(503).json({ error: mm, code: 'maintenance' });
      const acc = await shiftAccess(me);
      if (!acc.ok) return res.status(401).json({ error: acc.message, code: 'shift' });
    }
    if (action === "state" && req.method === "GET") return await state(req, res, me);
    if (action === "attendance" && req.method === "GET") return await attendanceRoute(req, res, me);
    if (action === "errors" && req.method === "GET") return await errorsList(req, res, me);
    if (action === "error-update" && req.method === "POST") return await errorUpdate(req, res, me);
    if (action === "sync" && req.method === "POST") return await sync(req, res, me);
    if (action === "create-user" && req.method === "POST") return await createUser(req, res, me);
    if (action === "set-password" && req.method === "POST") return await setPassword(req, res, me);
    if (action === "logout" && req.method === "POST") return await logout(req, res, me);
    if (action === "reset-decision" && req.method === "POST") return await resetDecision(req, res, me);
    if (action === "signup-decision" && req.method === "POST") return await signupDecision(req, res, me);
    if (action === "payroll-period" && req.method === "POST") return await payrollPeriod(req, res, me);
    if (action === "payroll-close" && req.method === "POST") return await payrollClose(req, res, me);
    if (action === "payroll-reopen" && req.method === "POST") return await payrollReopen(req, res, me);
    if (action === "payroll-pay" && req.method === "POST") return await payrollPay(req, res, me);
    if (action === "payroll-bonus" && req.method === "POST") return await payrollBonus(req, res, me);
    if (action === "payroll-bonus-delete" && req.method === "POST") return await payrollBonusDelete(req, res, me);
    if (action === "payroll-mine" && req.method === "POST") return await payrollMine(req, res, me);
    if (action === "chat-read" && req.method === "POST") return await chatRead(req, res, me);
    if (action === "queue" && req.method === "POST") return await queueRoute(req, res, me);
    if (action === "upload" && req.method === "POST") return await upload(req, res, me);
    if (action === "profile-request" && req.method === "POST") return await profileRequest(req, res, me);
    if (action === "profile-decision" && req.method === "POST") return await profileDecision(req, res, me);
    return res.status(404).json({ error: "Route inconnue." });
  } catch (e) {
    console.error("API error:", e);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});
