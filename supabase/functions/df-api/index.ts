import { createClient } from "npm:@supabase/supabase-js@2";
import { randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const T = {
  users: "df_users",
  clients: "df_clients", // avant les missions et les sessions : une fiche créée dans le même envoi existe déjà quand on vérifie le lien
  suppliers: "df_suppliers", // avant les dépenses, le stock et les bons de commande : le fournisseur existe déjà quand on vérifie le lien
  posts: "df_posts",
  contracts: "df_contracts",
  securityLogs: "df_security_logs",
  advances: "df_advances",
  messages: "df_messages",
  groups: "df_groups",
  settings: "df_settings",
  news: "df_news",
  cash: "df_cash",
  products: "df_products",
  stock: "df_stock_moves",
  purchases: "df_purchase_orders", // après les produits et les fournisseurs : un bon ne se crée que si tout ce qu'il cite existe
  invoices: "df_invoices", // factures et avoirs (les compteurs de numéros ne sont JAMAIS une collection : uniquement des fonctions SQL)
  reviews: "df_reviews", // fiches d'évaluation (M5.4) : le salarié ne reçoit que SES fiches partagées, sans « points à améliorer »
  sheets: "df_sheets", // « Mes tableaux » (M12.4) : l'opérateur écrit et lit les siens, l'admin lit tous (lecture seule)
  leaves: "df_leaves", // demandes de congé (M5.2) : le salarié ne voit que les siennes, l'admin voit tout
  shifts: "df_shifts", // planning des équipes (M15.2) : le responsable écrit, le salarié ne voit que SON planning
  entries: "df_entries", // écritures comptables (M14.3) : JAMAIS écrites par la synchro, seulement par les routes accounting-* ; lecture responsable et Comptable
  quotes: "df_quotes", // devis (module 2, M2.9) : après les clients et les factures (un devis cite un client et, une fois facturé, une facture)
} as const;
type Col = keyof typeof T;
const COLS = Object.keys(T) as Col[];

// ===== BEGIN ROLES (rôles : admin, Comptable, Chef d'équipe, opérateur ; ce bloc est contrôlé par scripts/check-roles.ts) =====
const ROLES = ["admin", "accountant", "team_lead", "employee"];
const CREATABLE_ROLES = ["employee", "accountant", "team_lead"];
const MONEY_COLS: string[] = ["cash", "products", "stock", "clients", "suppliers", "purchases", "invoices", "quotes", "entries"];
const READ_ADMIN_COLS: string[] = ["securityLogs", ...MONEY_COLS];
const isRole = (v: unknown): boolean => typeof v === "string" && ROLES.includes(v);
const isCreatableRole = (v: unknown): boolean => typeof v === "string" && CREATABLE_ROLES.includes(v);
const roleOf = (v: unknown): string => (isRole(v) ? (v as string) : "employee");
const isMoneyRole = (role: unknown): boolean => role === "admin" || role === "accountant";
const isOperator = (role: unknown): boolean => roleOf(role) === "employee";
const canReadCol = (role: unknown, col: string): boolean => role === "admin" || (isMoneyRole(role) ? MONEY_COLS.includes(col) || !READ_ADMIN_COLS.includes(col) : !READ_ADMIN_COLS.includes(col));
const canWriteMoneyCol = (role: unknown, col: string): boolean => !MONEY_COLS.includes(col) || isMoneyRole(role);
const seesClientPrice = (role: unknown): boolean => isMoneyRole(role);
const MONEY_ROUTES = ["invoice-issue", "invoice-cancel", "invoice-pay", "accounting-sync", "accounting-post"];
const canRoute = (role: unknown, action: string): boolean => !MONEY_ROUTES.includes(action) || isMoneyRole(role);
const cleanTeam = (v: unknown): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
const sameTeam = (a: any, b: any): boolean => { const x = cleanTeam(a && a.team).toLowerCase(), y = cleanTeam(b && b.team).toLowerCase(); return !!x && x === y; };
const canDecidePost = (me: any, owner: any): boolean => !!me && !!owner && (me.role === "admin" || (me.role === "team_lead" && isOperator(owner.role) && owner.id !== me.id && sameTeam(me, owner)));
// ===== END ROLES =====

// ===== BEGIN DECIDE (décision sur une session : valider ou refuser ; ce bloc est contrôlé par scripts/check-team-lead.ts) =====
const decValidPrice = (n: unknown): boolean => typeof n === "number" && isFinite(n) && n >= 0;
const decNum = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
function decisionClientPrice(contract: any, settings: any): number {
  if (contract && decValidPrice(contract.client_price_ar)) return Math.round(contract.client_price_ar);
  const byType = (settings && settings.client_prices_by_type) || {};
  const t = contract && contract.post_type;
  if (t && decValidPrice(byType[t])) return Math.round(byType[t]);
  return settings && decValidPrice(settings.client_price_default_ar) ? Math.round(settings.client_price_default_ar) : 0;
}
function planPostDecision(post: any, contract: any, settings: any, employee: any, approve: boolean, reason: unknown, nowIso: string): any {
  if (!post || typeof post !== "object") return { ok: false, error: "missing" };
  if (post.status !== "pending_start" && post.status !== "pending_end") return { ok: false, error: "not_pending" };
  if (!approve) {
    const why = String(reason ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
    if (!why) return { ok: false, error: "reason" };
    return { ok: true, kind: "refused", post: { ...post, status: "rejected", rejection_reason: why, updated_at: nowIso } };
  }
  if (post.status === "pending_start") return { ok: true, kind: "start_ok", post: { ...post, status: "active", updated_at: nowIso } };
  const finalScore = decNum(post.final_score ?? post.current_score);
  const gained = Math.max(0, finalScore - decNum(post.initial_score));
  const pay = Math.max(0, Math.round(decNum(settings && settings.price_per_mission)));
  return {
    ok: true, kind: "end_ok", payAr: pay,
    post: { ...post, status: "completed", calculated_ar: pay, client_price_ar: decisionClientPrice(contract, settings), updated_at: nowIso },
    contract: contract ? { ...contract, current_score: finalScore } : undefined,
    employee: employee ? { ...employee, total_score_boosted: decNum(employee.total_score_boosted) + gained, total_earnings_ar: decNum(employee.total_earnings_ar) + pay } : undefined,
  };
}
// ===== END DECIDE =====
// ===== BEGIN NEWSACCESS (actualités : qui publie, modifie, voit ; copie de src/utils/newsAccess.ts, contrôlée par scripts/check-news-access.ts) =====
const NEWS_AUDIENCE_ROLES = ["employee", "team_lead", "accountant"];
const newsIsMode = (v: unknown): boolean => v === "off" || v === "review" || v === "direct";
const cleanNewsPolicy = (v: any): any => {
  if (!v || typeof v !== "object") return { employee: "review", team_lead: "review", accountant: "review", allow_edit: false }; // réglage jamais touché : comme avant (les trois rôles proposent, le responsable valide)
  const o = v;
  return { employee: newsIsMode(o.employee) ? o.employee : "off", team_lead: newsIsMode(o.team_lead) ? o.team_lead : "off", accountant: newsIsMode(o.accountant) ? o.accountant : "off", allow_edit: o.allow_edit === true };
};
const cleanAudience = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = NEWS_AUDIENCE_ROLES.filter((r) => v.includes(r));
  return out.length === 0 || out.length === NEWS_AUDIENCE_ROLES.length ? undefined : out;
};
const publishModeFor = (role: unknown, policy: unknown): string => {
  if (role === "admin") return "direct";
  if (role !== "employee" && role !== "team_lead" && role !== "accountant") return "off";
  return cleanNewsPolicy(policy)[role as string];
};
const canSeeNews = (post: any, me: any): boolean => {
  if (!post || !me) return false;
  if (me.role === "admin") return true;
  if (post.author_id && post.author_id === me.id) return true;
  if (post.status !== undefined && post.status !== "published") return false;
  const aud = cleanAudience(post.audience);
  return !aud || (me.role === "employee" || me.role === "team_lead" || me.role === "accountant" ? aud.includes(me.role) : false);
};
const canEditNews = (post: any, me: any, policy: unknown): boolean => {
  if (!post || !me) return false;
  if (me.role === "admin") return true;
  if (post.author_id !== me.id) return false;
  if (post.status !== undefined && post.status !== "published") return false;
  return cleanNewsPolicy(policy).allow_edit && publishModeFor(me.role, policy) !== "off";
};
// ===== END NEWSACCESS =====

// ===== BEGIN LEADLIMIT (plafond du Chef d'équipe, M15.6 : copie exacte de src/utils/approvalLimit.ts ; ce bloc est contrôlé par scripts/check-approval-limit.ts) =====
const TEAM_LEAD_LIMIT_MAX = 1000000000;

/** Le plafond du réglage : un nombre entier d'Ar. 0, absent ou valeur fausse = pas de plafond. */
function cleanTeamLeadLimit(v: unknown): number {
  return typeof v === 'number' && isFinite(v) && v >= 1 ? Math.min(Math.round(v), TEAM_LEAD_LIMIT_MAX) : 0;
}

/** Vrai si la décision doit venir du responsable : c'est un Chef d'équipe, un plafond est réglé et le prix de la mission est STRICTEMENT au-dessus. Le responsable n'est jamais bloqué. */
function decisionNeedsAdmin(role: unknown, price: unknown, limit: unknown): boolean {
  const l = cleanTeamLeadLimit(limit);
  return role === 'team_lead' && l > 0 && typeof price === 'number' && isFinite(price) && price > l;
}
// ===== END LEADLIMIT =====

// ===== BEGIN CASH (finances : réservé à l'administrateur ; ce bloc est contrôlé par scripts/check-cash.ts) =====
// Collections qu'un employé ne reçoit JAMAIS (lecture) : journal de sécurité des autres et finances.
const ADMIN_ONLY_READ: string[] = ["securityLogs", "cash", "products", "stock", "clients", "suppliers", "purchases", "invoices", "quotes", "entries"];
// Collections qu'un employé ne peut JAMAIS écrire ni supprimer (le journal de sécurité reste écrivable pour ses propres lignes).
const ADMIN_ONLY_WRITE: string[] = ["cash", "products", "stock", "clients", "suppliers", "purchases", "invoices", "quotes", "entries"];

/** Vérifie et nettoie une ligne d'argent envoyée par l'admin. Le serveur ne fait jamais confiance au navigateur. */
function cleanCash(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  const kind = rec && (rec.kind === "in" || rec.kind === "out") ? rec.kind : null;
  if (!kind) return { ok: false, reason: "kind" };
  const amount = Number(rec.amount_ar);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) return { ok: false, reason: "amount" };
  const date = String(rec.date || "");
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!parsed || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { ok: false, reason: "date" };
  const category = String(rec.category || "").trim().slice(0, 40);
  if (!category) return { ok: false, reason: "category" };
  return {
    ok: true,
    save: {
      id: rec.id, kind, category, amount_ar: Math.round(amount), date,
      note: String(rec.note || "").slice(0, 300), client_name: String(rec.client_name || "").slice(0, 80),
      ...(rec.mission_id ? { mission_id: String(rec.mission_id).slice(0, 80) } : {}),
      ...(typeof rec.supplier_id === "string" && rec.supplier_id ? { supplier_id: rec.supplier_id.slice(0, 80) } : {}), // fournisseur d'un achat (module 4) : l'existence est contrôlée dans sync
      ...(typeof rec.po_id === "string" && rec.po_id ? { po_id: rec.po_id.slice(0, 80) } : {}),
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}
// ===== END CASH =====

// ===== BEGIN STOCK (produits et mouvements de stock : réservé à l'administrateur ; ce bloc est contrôlé par scripts/check-stock.ts) =====
const STOCK_MAX_QTY = 1_000_000_000;
const STOCK_MAX_MONEY = 1_000_000_000_000;
const stockDate = (d: unknown): string | null => {
  const date = String(d || "");
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  return parsed && !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};
const round2s = (n: number) => Math.round(n * 100) / 100;

/** Vérifie et nettoie un produit envoyé par l'admin. */
function cleanProduct(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  const name = String(rec?.name || "").trim().slice(0, 80);
  if (!name) return { ok: false, reason: "name" };
  const buy = rec.buy_price_ar === undefined || rec.buy_price_ar === null || rec.buy_price_ar === "" ? 0 : Number(rec.buy_price_ar);
  if (!Number.isFinite(buy) || buy < 0 || buy > STOCK_MAX_MONEY) return { ok: false, reason: "buy" };
  const sell = rec.sell_price_ar === undefined || rec.sell_price_ar === null || rec.sell_price_ar === "" ? 0 : Number(rec.sell_price_ar);
  if (!Number.isFinite(sell) || sell < 0 || sell > STOCK_MAX_MONEY) return { ok: false, reason: "sell" };
  const thr = rec.alert_threshold === undefined || rec.alert_threshold === null || rec.alert_threshold === "" ? 0 : Number(rec.alert_threshold);
  if (!Number.isFinite(thr) || thr < 0 || thr > STOCK_MAX_QTY) return { ok: false, reason: "threshold" };
  // Photo : vide, ou une adresse envoyée par notre serveur (Cloudinary du site, ou à défaut le stockage Supabase du site)
  const photo = typeof rec.photo_url === "string" ? rec.photo_url.trim() : "";
  if (photo && (photo.length > 500 || !(photo.startsWith(CLD_PREFIX) || photo.includes(`/object/public/${BUCKET}/`)))) return { ok: false, reason: "photo" };
  const sid = typeof rec.storage_id === "string" && /^[a-z0-9_-]{1,32}$/.test(rec.storage_id) ? rec.storage_id : ""; // le stockage du produit (vide = le premier)
  return {
    ok: true,
    save: {
      id: rec.id, name, photo_url: photo, storage_id: sid, category: String(rec.category || "").trim().slice(0, 40), unit: String(rec.unit || "").trim().slice(0, 16) || "unité",
      buy_price_ar: Math.round(buy), sell_price_ar: Math.round(sell), alert_threshold: round2s(thr),
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}

/** Vérifie et nettoie un mouvement de stock (le produit doit exister : contrôlé dans sync). La quantité en stock n'est jamais envoyée : elle se calcule. */
function cleanStockMove(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  const type = rec && (rec.type === "in" || rec.type === "out" || rec.type === "adjust") ? rec.type : null;
  if (!type) return { ok: false, reason: "type" };
  const productId = String(rec.product_id || "").slice(0, 80);
  if (!productId) return { ok: false, reason: "product" };
  const qty = round2s(Number(rec.qty));
  if (!Number.isFinite(qty) || qty === 0 || Math.abs(qty) > STOCK_MAX_QTY || (type !== "adjust" && qty < 0)) return { ok: false, reason: "qty" };
  const date = stockDate(rec.date);
  if (!date) return { ok: false, reason: "date" };
  let cost: number | undefined;
  if (type === "in" && rec.unit_cost_ar !== undefined && rec.unit_cost_ar !== null && rec.unit_cost_ar !== "") {
    cost = Number(rec.unit_cost_ar);
    if (!Number.isFinite(cost) || cost < 0 || cost > STOCK_MAX_MONEY) return { ok: false, reason: "cost" };
    cost = Math.round(cost);
  }
  // Inventaire (module 4) : un ajustement peut porter la quantité comptée et celle que le stock indiquait.
  let inv: { reason: "inventory"; counted_qty: number; expected_qty: number } | undefined;
  if (rec.reason !== undefined && rec.reason !== null && rec.reason !== "") {
    if (rec.reason !== "inventory" || type !== "adjust") return { ok: false, reason: "reason" };
    const counted = Number(rec.counted_qty), expected = Number(rec.expected_qty);
    const bad = (n: number, v: unknown) => typeof v === "boolean" || Array.isArray(v) || v === null || v === "" || !Number.isFinite(n) || n < 0 || n > STOCK_MAX_QTY;
    if (bad(counted, rec.counted_qty) || bad(expected, rec.expected_qty)) return { ok: false, reason: "count" };
    inv = { reason: "inventory", counted_qty: round2s(counted), expected_qty: round2s(expected) };
  }
  return {
    ok: true,
    save: {
      id: rec.id, product_id: productId, type, qty, date, note: String(rec.note || "").slice(0, 300),
      ...(cost !== undefined ? { unit_cost_ar: cost } : {}),
      ...(rec.cash_id ? { cash_id: String(rec.cash_id).slice(0, 80) } : {}),
      ...(typeof rec.supplier_id === "string" && rec.supplier_id ? { supplier_id: rec.supplier_id.slice(0, 80) } : {}), // module 4 : l'existence est contrôlée dans sync
      ...(typeof rec.po_id === "string" && rec.po_id ? { po_id: rec.po_id.slice(0, 80) } : {}),
      ...(inv || {}),
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}
// ===== END STOCK =====

// ===== BEGIN INVOICES (factures : réservé à l'administrateur, numéros attribués par le serveur ; ce bloc est contrôlé par scripts/check-invoices-server.ts) =====
// Mêmes règles de calcul que src/utils/invoices.ts (un test compare les deux sur 300 factures au hasard).
const INV_MAX = 100_000_000_000; // plafond d'une facture : au-delà, les calculs ne seraient plus exacts
const INV_MAX_LINES = 200;
const INV_MAX_QTY = 1_000_000;
const INV_MAX_REFS = 2000;
const invRound2 = (n: number) => Math.round(n * 100) / 100;
const invNum = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[\s\u00a0]/g, "").replace(",", ".")) : NaN);
const invDate = (d: unknown): string | null => {
  const date = String(d || "");
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  return parsed && !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};
const invAddDays = (iso: string, days: number): string => new Date(new Date(iso + "T00:00:00Z").getTime() + Math.round(days) * 86400000).toISOString().slice(0, 10);
const invDaysBetween = (a: string, b: string): number => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
const invTodayMada = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Indian/Antananarivo" });

/** Sous-total, TVA (arrondie UNE fois, en entiers) et total. La TVA vient des Conditions de l'entreprise, jamais du navigateur. */
function invTotals(lines: { total_ar: number }[], vatEnabled: boolean, vatRate: number) {
  const subtotal = lines.reduce((t, l) => t + l.total_ar, 0);
  const rate = vatEnabled && Number.isFinite(vatRate) ? Math.min(100, Math.max(0, invRound2(vatRate))) : 0;
  const tax = rate > 0 ? Math.round((subtotal * Math.round(rate * 100)) / 10000) : 0;
  return { subtotal_ar: subtotal, tax_rate: rate, tax_ar: tax, total_ar: subtotal + tax };
}

/** Vérifie et nettoie un BROUILLON de facture envoyé par l'admin. Les totaux, la TVA, le statut, le numéro et les copies du client et de l'entreprise ne viennent jamais du navigateur. */
function cleanInvoice(rec: any, existing: any, meId: string, now: string, company: any): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== "object") return { ok: false, reason: "invoice" };
  const clientId = String(rec.client_id || "").trim().slice(0, 80);
  if (!clientId) return { ok: false, reason: "client" };
  const issue = invDate(rec.issue_date); if (!issue) return { ok: false, reason: "issue_date" };
  const due = invDate(rec.due_date); if (!due) return { ok: false, reason: "due_date" };
  if (due < issue) return { ok: false, reason: "due_before" };
  if (!Array.isArray(rec.lines) || rec.lines.length === 0) return { ok: false, reason: "lines" };
  if (rec.lines.length > INV_MAX_LINES) return { ok: false, reason: "too_many_lines" };
  const lines: any[] = [];
  for (let i = 0; i < rec.lines.length; i++) {
    const l = rec.lines[i];
    const description = String(l?.description ?? "").trim().slice(0, 200);
    if (!description) return { ok: false, reason: "description" };
    const qty = invRound2(invNum(l.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > INV_MAX_QTY) return { ok: false, reason: "qty" };
    const unitRaw = invNum(l.unit_price_ar);
    if (!Number.isFinite(unitRaw) || unitRaw < 0 || unitRaw > INV_MAX) return { ok: false, reason: "price" };
    const unit = Math.round(unitRaw);
    const total = Math.round(qty * unit); // jamais le total envoyé : toujours recalculé
    if (!Number.isFinite(total) || total > INV_MAX) return { ok: false, reason: "total" };
    const refs = Array.isArray(l.refs) ? [...new Set(l.refs.map((r: unknown) => String(r).slice(0, 80)).filter(Boolean))].slice(0, INV_MAX_REFS) : [];
    lines.push({ id: `l${i + 1}`, description, qty, unit_price_ar: unit, total_ar: total, ...(refs.length ? { refs } : {}) });
  }
  const t = invTotals(lines, company?.tax?.vat_enabled === true, Number(company?.tax?.vat_rate));
  if (t.total_ar <= 0 || t.total_ar > INV_MAX) return { ok: false, reason: "total" };
  return {
    ok: true,
    save: {
      id: rec.id, type: "invoice", status: "draft", client_id: clientId, issue_date: issue, due_date: due,
      lines, ...t, note: String(rec.note || "").slice(0, 500),
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}

/** Ce que l'émission écrit en plus : date du jour (heure de Madagascar), échéance de même durée, copies du client et de l'entreprise, totaux recalculés avec la TVA ACTUELLE. */
function invoiceIssuePatch(draft: any, client: any, company: any, today: string) {
  const term = Math.max(0, invDaysBetween(draft.issue_date, draft.due_date));
  const t = invTotals(draft.lines, company?.tax?.vat_enabled === true, Number(company?.tax?.vat_rate));
  const id = company?.identity || {}, lg = company?.legal || {}, bl = company?.billing || {}, tx = company?.tax || {};
  return {
    issue_date: today, due_date: invAddDays(today, term), ...t,
    client: {
      name: String(client?.name || "").slice(0, 80), address: String(client?.address || "").slice(0, 200), contact_name: String(client?.contact || "").slice(0, 80),
      email: String(client?.email || "").slice(0, 120), phone: String(client?.phone || "").slice(0, 40),
    },
    issuer: {
      name: String(id.name || ""), address: String(id.address || ""), phone: String(id.phone || ""), email: String(id.email || ""), logo_url: String(id.logo_url || ""), currency: String(id.currency || "Ar"),
      tax_id: String(lg.tax_id || ""), register_id: String(lg.register_id || ""), notes: Array.isArray(lg.notes) ? lg.notes.slice(0, 10) : [],
      vat_enabled: tx.vat_enabled === true, vat_exempt_text: String(tx.vat_exempt_text || ""),
      payment_days: Number(bl.payment_days) || 0, late_penalty_text: String(bl.late_penalty_text || ""), payment_methods_text: String(bl.payment_methods_text || ""), footer: String(bl.invoice_footer || ""),
      terms: String(company?.texts?.customer_terms || ""),
    },
  };
}

/** Messages des codes d'erreur renvoyés par les fonctions SQL df_issue_invoice, df_cancel_invoice et df_pay_invoice. */
const INVOICE_ERRORS: Record<string, [number, string]> = {
  invoice_missing: [404, "Facture introuvable."],
  changed: [409, "Cette facture vient d'être modifiée. Recharge la page et réessaie."],
  not_draft: [409, "Seul un brouillon peut être émis."],
  not_issued: [409, "Cette opération n'est possible que sur une facture émise."],
  no_lines: [422, "Une facture doit avoir au moins une ligne."],
  no_total: [422, "Le total de la facture doit être supérieur à 0."],
  refs_taken: [409, "Une mission de cette facture est déjà dans une autre facture."],
  refs_missing: [409, "Une mission de cette facture n'existe plus ou n'est pas validée."],
  has_payments: [409, "Cette facture a déjà reçu un paiement : elle ne peut pas être annulée par un avoir."],
  bad_amount: [400, "Montant invalide (un nombre entier d'Ar supérieur à 0)."],
};
function invoiceErrorOf(message: string): { status: number; error: string; max?: number } {
  const m = /too_much:(\d+)/.exec(message || "");
  if (m) return { status: 409, error: "Ce paiement dépasse ce qui reste à payer.", max: Number(m[1]) };
  const code = Object.keys(INVOICE_ERRORS).find(k => (message || "").includes(k));
  return code ? { status: INVOICE_ERRORS[code][0], error: INVOICE_ERRORS[code][1] } : { status: 500, error: "L'opération a échoué." };
}
// ===== END INVOICES =====

// ===== BEGIN QUOTES (devis, module 2 M2.9 : réservé à l'administrateur et au Comptable ; ce bloc est contrôlé par scripts/check-quotes.ts) =====
// Règles de src/utils/quotes.ts. Un devis réutilise cleanInvoice (client, lignes, totaux recalculés). Brouillon → Envoyé → Accepté ou Refusé ; ensuite le contenu est figé.
function cleanQuote(rec: any, existing: any, meId: string, now: string, company: any): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== "object" || typeof rec.id !== "string" || !rec.id || rec.id.length > 80) return { ok: false, reason: "id" };
  const ref = typeof rec.ref === "string" && /^DV-\d{1,9}$/.test(rec.ref) ? rec.ref : null;
  if (!ref || (existing && existing.ref !== ref)) return { ok: false, reason: "ref" };
  const status = ["draft", "sent", "accepted", "refused"].includes(rec.status) ? (rec.status as string) : null;
  if (!status) return { ok: false, reason: "status" };
  const untilRaw = rec.valid_until == null ? "" : String(rec.valid_until).trim();
  const v = cleanInvoice({ id: rec.id, client_id: rec.client_id, issue_date: rec.date, due_date: untilRaw || rec.date, lines: rec.lines, note: rec.note }, null, meId, now, company);
  if (!v.ok) return { ok: false, reason: v.reason === "issue_date" ? "date" : v.reason === "due_date" ? "valid_until" : v.reason === "due_before" ? "valid_before" : v.reason };
  const inv: any = v.save;
  let invoiceId: string | undefined;
  if (rec.invoice_id != null && rec.invoice_id !== "") {
    if (typeof rec.invoice_id !== "string" || rec.invoice_id.length > 80) return { ok: false, reason: "invoice" };
    invoiceId = rec.invoice_id;
  }
  const note = String(rec.note ?? "").slice(0, 500);
  let body: any = { client_id: inv.client_id, date: inv.issue_date, lines: inv.lines, subtotal_ar: inv.subtotal_ar, tax_rate: inv.tax_rate, tax_ar: inv.tax_ar, total_ar: inv.total_ar, ...(untilRaw ? { valid_until: inv.due_date } : {}) };
  if (!existing) {
    if (status !== "draft" && status !== "sent") return { ok: false, reason: "status" };
    if (invoiceId) return { ok: false, reason: "invoice" };
  } else if (existing.status === "draft") {
    if (status !== "draft" && status !== "sent") return { ok: false, reason: "status" };
    if (invoiceId) return { ok: false, reason: "invoice" };
  } else {
    // Envoyé, Accepté, Refusé : le contenu est figé (on garde les lignes et les totaux d'origine, même si la TVA a changé depuis).
    const keep = (l: any) => ({ d: l.description, q: l.qty, u: l.unit_price_ar });
    const same = inv.client_id === existing.client_id && inv.issue_date === existing.date && (untilRaw ? inv.due_date : "") === (existing.valid_until || "") &&
      JSON.stringify(inv.lines.map(keep)) === JSON.stringify((existing.lines || []).map(keep));
    if (!same) return { ok: false, reason: "frozen" };
    body = { client_id: existing.client_id, date: existing.date, lines: existing.lines, subtotal_ar: existing.subtotal_ar, tax_rate: existing.tax_rate, tax_ar: existing.tax_ar, total_ar: existing.total_ar, ...(existing.valid_until ? { valid_until: existing.valid_until } : {}) };
    if (existing.status === "sent") { if (status !== "sent" && status !== "accepted" && status !== "refused") return { ok: false, reason: "status" }; if (invoiceId) return { ok: false, reason: "invoice" }; }
    else if (status !== existing.status) return { ok: false, reason: "final" }; // Accepté et Refusé sont définitifs
    if (existing.status === "refused" && invoiceId) return { ok: false, reason: "invoice" };
  }
  const clientName = String(rec.client?.name ?? existing?.client?.name ?? "").slice(0, 80);
  return {
    ok: true,
    save: {
      id: rec.id, ref, status, ...body, ...(clientName ? { client: { name: clientName } } : {}), note, ...(invoiceId ? { invoice_id: invoiceId } : {}),
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}
// ===== END QUOTES =====

// ===== BEGIN CLIENTS (fiches clients : réservé à l'administrateur ; ce bloc est contrôlé par scripts/check-clients-server.ts) =====
const CLIENT_MAX_MONEY = 1_000_000_000_000;
const CLIENT_MAX_TERMS = 365;
const CLIENT_MAX_TYPES = 20;
const CLIENT_BAD_KEYS = ["__proto__", "constructor", "prototype"];
/** Vérifie et nettoie une fiche client envoyée par l'admin. Le statut n'est jamais stocké : il se calcule sur le site. */
function cleanClient(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== "object" || typeof rec.id !== "string" || !rec.id || rec.id.length > 80) return { ok: false, reason: "id" };
  const name = String(rec.name ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, reason: "name" };
  const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const email = text(rec.email, 120);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { ok: false, reason: "email" };
  const none = (v: unknown) => v === undefined || v === null || v === "";
  // Un nombre ou un texte non vide : jamais un tableau, un booléen ou un objet (Number([5]) vaudrait 5, Number(true) vaudrait 1).
  const numIn = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "");
  let terms: number | undefined;
  if (!none(rec.payment_terms_days)) {
    if (!numIn(rec.payment_terms_days)) return { ok: false, reason: "terms" };
    const t = Number(rec.payment_terms_days);
    if (!Number.isFinite(t) || t < 0 || t > CLIENT_MAX_TERMS) return { ok: false, reason: "terms" };
    terms = Math.round(t);
  }
  let price: number | undefined;
  if (!none(rec.price_default_ar)) {
    if (!numIn(rec.price_default_ar)) return { ok: false, reason: "price" };
    const p = Number(rec.price_default_ar);
    if (!Number.isFinite(p) || p < 0 || p > CLIENT_MAX_MONEY) return { ok: false, reason: "price" };
    price = Math.round(p);
  }
  let byType: Record<string, number> | undefined;
  if (!none(rec.price_by_type)) {
    const src = rec.price_by_type;
    if (typeof src !== "object" || Array.isArray(src)) return { ok: false, reason: "price_by_type" };
    const entries = Object.entries(src);
    if (entries.length > CLIENT_MAX_TYPES) return { ok: false, reason: "price_by_type" };
    byType = {};
    for (const [k, v] of entries) {
      const key = String(k).trim().slice(0, 40);
      const p = numIn(v) ? Number(v) : NaN; // un prix vide (« ») n'est pas 0 : il est refusé
      if (!key || CLIENT_BAD_KEYS.includes(key) || !Number.isFinite(p) || p < 0 || p > CLIENT_MAX_MONEY) return { ok: false, reason: "price_by_type" };
      byType[key] = Math.round(p);
    }
  }
  return {
    ok: true,
    save: {
      id: rec.id, name,
      contact_name: text(rec.contact_name, 80), phone: text(rec.phone, 40), email, address: text(rec.address, 200), note: text(rec.note, 500),
      ...(terms !== undefined ? { payment_terms_days: terms } : {}),
      ...(price !== undefined ? { price_default_ar: price } : {}),
      ...(byType !== undefined && Object.keys(byType).length ? { price_by_type: byType } : {}),
      active: rec.active === false ? false : true,
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}
/** Lien mission ou session → client : vide, ou un texte court. L'existence de la fiche est contrôlée dans sync. */
function cleanClientRef(v: unknown): { ok: true; id: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, id: null };
  if (typeof v !== "string" || v.length > 80) return { ok: false };
  return { ok: true, id: v };
}
// ===== END CLIENTS =====

// ===== BEGIN HR (dossier du salarié : visible par l'admin et le salarié concerné seulement ; ce bloc est contrôlé par scripts/check-hr.ts) =====
// BEGIN HRCLEAN
const HR_CONTRACTS = ['permanent', 'fixed', 'trial', 'intern', 'freelance', 'other'];
const HR_MAX_DOCS = 10;
const HR_MAX_RATES = 50;
const HR_MAX_MONEY = 1_000_000_000_000;
const hrDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '1990-01-01' && v <= '2100-12-31' ? v : null;
};
/** Vérifie et nettoie un dossier salarié. Vide ou absent = « pas de dossier » (hr: null). Un champ faux refuse tout le dossier. */
function cleanHrFile(raw: any): { ok: true; hr: any } | { ok: false; reason: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, hr: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'hr' };
  const text = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
  const none = (v: unknown) => v === undefined || v === null || v === '';
  const out: any = {};
  const position = text(raw.position, 80);
  if (position) out.position = position;
  if (!none(raw.hire_date)) { const d = hrDate(raw.hire_date); if (!d) return { ok: false, reason: 'hire_date' }; out.hire_date = d; }
  if (!none(raw.contract_type)) {
    if (typeof raw.contract_type !== 'string' || !HR_CONTRACTS.includes(raw.contract_type)) return { ok: false, reason: 'contract_type' };
    out.contract_type = raw.contract_type;
  }
  if (!none(raw.contract_end)) {
    const d = hrDate(raw.contract_end);
    if (!d || (out.hire_date && d < out.hire_date)) return { ok: false, reason: 'contract_end' };
    out.contract_end = d;
  }
  if (!none(raw.trial_end)) {
    const d = hrDate(raw.trial_end);
    if (!d || (out.hire_date && d < out.hire_date)) return { ok: false, reason: 'trial_end' };
    out.trial_end = d;
  }
  if (!none(raw.emergency)) {
    const e = raw.emergency;
    if (typeof e !== 'object' || Array.isArray(e)) return { ok: false, reason: 'emergency' };
    const em: any = {};
    const name = text(e.name, 80), phone = text(e.phone, 40), relation = text(e.relation, 40);
    if (phone && !/^[0-9 +().-]{3,40}$/.test(phone)) return { ok: false, reason: 'emergency' };
    if (phone && !name) return { ok: false, reason: 'emergency' }; // un numéro sans nom ne sert à rien en urgence
    if (name) em.name = name;
    if (phone) em.phone = phone;
    if (relation) em.relation = relation;
    if (Object.keys(em).length) out.emergency = em;
  }
  if (!none(raw.documents)) {
    if (!Array.isArray(raw.documents) || raw.documents.length > HR_MAX_DOCS) return { ok: false, reason: 'documents' };
    const seen = new Set<string>();
    const docs: any[] = [];
    for (const d of raw.documents) {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'documents' };
      const id = text(d.id, 80), name = text(d.name, 80), url = typeof d.url === 'string' ? d.url.trim() : '';
      if (!id || !name || seen.has(id) || url.length > 500 || !/^https:\/\/[^\s<>"']+$/.test(url)) return { ok: false, reason: 'documents' };
      seen.add(id);
      const doc: any = { id, name, url };
      if (typeof d.added_at === 'string' && !isNaN(Date.parse(d.added_at))) doc.added_at = new Date(d.added_at).toISOString();
      docs.push(doc);
    }
    if (docs.length) out.documents = docs;
  }
  if (!none(raw.rate_history)) {
    if (!Array.isArray(raw.rate_history) || raw.rate_history.length > HR_MAX_RATES) return { ok: false, reason: 'rate_history' };
    const seen = new Set<string>();
    const rows: any[] = [];
    const money = (v: unknown): number | null => {
      if (!(typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= HR_MAX_MONEY ? Math.round(n) : null;
    };
    for (const r of raw.rate_history) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, reason: 'rate_history' };
      const id = text(r.id, 80), date = hrDate(r.date), to = money(r.to_ar);
      if (!id || seen.has(id) || !date || to === null) return { ok: false, reason: 'rate_history' };
      seen.add(id);
      const row: any = { id, date, to_ar: to };
      if (!none(r.from_ar)) { const f = money(r.from_ar); if (f === null) return { ok: false, reason: 'rate_history' }; row.from_ar = f; }
      const reason = text(r.reason, 200);
      if (reason) row.reason = reason;
      rows.push(row);
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    if (rows.length) out.rate_history = rows;
  }
  return { ok: true, hr: Object.keys(out).length ? out : null };
}
// END HRCLEAN
// ===== END HR =====

// ===== BEGIN LEAVES (congés : le salarié ne crée et n'annule que SA demande, l'admin décide ; ce bloc est contrôlé par scripts/check-leaves.ts) =====
// BEGIN LEAVECLEAN
const LV_TYPES = ['paid', 'unpaid', 'sick', 'other'];
const LV_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];
const LV_MAX_SPAN = 90;
const lvDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '2000-01-01' && v <= '2100-12-31' ? v : null;
};
const lvShift = (v: string, n: number): string => { const d = new Date(v + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Jours ouvrés de `start` à `end` compris. perWeek = jours travaillés par semaine (Conditions) : 6 (défaut, dimanche = repos), 5 (samedi aussi), 7 (aucun repos) ; 0 ou faux = 6. Limité à l'année `year` si fourni. */
function leaveWorkingDays(start: string, end: string, perWeek: number, year?: number): number {
  const pw = perWeek === 5 || perWeek === 7 ? perWeek : 6;
  let n = 0, d = start, guard = 0;
  while (d <= end && guard++ < 400) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay(); // 0 = dimanche, 6 = samedi
    const off = pw === 7 ? false : pw === 6 ? dow === 0 : dow === 0 || dow === 6;
    if (!off && (year === undefined || Number(d.slice(0, 4)) === year)) n++;
    d = lvShift(d, 1);
  }
  return n;
}
/** Jours de congé PAYÉ déjà pris ou demandés (acceptés ou en attente) pendant l'année `year`, sans la demande `exceptId`. */
function leavePaidUsed(others: any[], year: number, perWeek: number, exceptId: string): number {
  let used = 0;
  for (const o of others || []) {
    if (!o || o.id === exceptId || o.type !== 'paid' || (o.status !== 'approved' && o.status !== 'pending')) continue;
    if (!lvDate(o.start_date) || !lvDate(o.end_date)) continue;
    used += leaveWorkingDays(o.start_date, o.end_date, perWeek, year);
  }
  return used;
}
/**
 * Vérifie une demande de congé et applique le changement demandé. Le serveur ne fait jamais confiance au navigateur.
 * actor : { id, name, admin } (admin = responsable). ctx : { today, allowance (jours par an, 0 = pas de solde), perWeek, others (les autres demandes du même salarié) }.
 * Création : le salarié ne crée que SA demande « en attente » ; l'admin peut créer pour un salarié (en attente ou déjà acceptée). Dates, type et motif ne changent plus après la création.
 * Changement d'état : en attente → acceptée / refusée (admin ; refus = motif de 3 caractères ou plus) ; en attente → annulée (le salarié ou l'admin) ;
 * acceptée → annulée (le salarié seulement si le congé n'a pas commencé ; l'admin avec un motif). Refusée et annulée ne changent plus.
 */
function cleanLeave(rec: any, existing: any, actor: { id: string; name: string; admin: boolean }, now: string, ctx: { today: string; allowance: number; perWeek: number; others: any[] }): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || typeof rec.id !== 'string' || !rec.id || rec.id.length > 80) return { ok: false, reason: 'id' };
  const text = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
  const status = typeof rec.status === 'string' && LV_STATUS.includes(rec.status) ? rec.status : null;
  if (!status) return { ok: false, reason: 'status' };
  if (!existing) {
    const empId = actor.admin ? (typeof rec.employee_id === 'string' ? rec.employee_id : '') : actor.id;
    if (!empId || empId.length > 80) return { ok: false, reason: 'employee' };
    if (!actor.admin && rec.employee_id !== actor.id) return { ok: false, reason: 'employee' };
    if (!actor.admin && status !== 'pending') return { ok: false, reason: 'status' };
    if (actor.admin && status !== 'pending' && status !== 'approved') return { ok: false, reason: 'status' };
    if (typeof rec.type !== 'string' || !LV_TYPES.includes(rec.type)) return { ok: false, reason: 'type' };
    const start = lvDate(rec.start_date), end = lvDate(rec.end_date);
    if (!start || !end || end < start) return { ok: false, reason: 'dates' };
    if (lvShift(start, LV_MAX_SPAN) < end) return { ok: false, reason: 'span' };
    if (start < lvShift(ctx.today, -30)) return { ok: false, reason: 'past' }; // au plus 30 jours en arrière (maladie déclarée en retard)
    if (start > lvShift(ctx.today, 365)) return { ok: false, reason: 'future' };
    const days = leaveWorkingDays(start, end, ctx.perWeek);
    if (days < 1) return { ok: false, reason: 'no_working_day' };
    for (const o of ctx.others || []) {
      if (o && o.id !== rec.id && (o.status === 'pending' || o.status === 'approved') && lvDate(o.start_date) && lvDate(o.end_date) && o.start_date <= end && start <= o.end_date) return { ok: false, reason: 'overlap' };
    }
    if (rec.type === 'paid' && ctx.allowance > 0) {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        const want = leaveWorkingDays(start, end, ctx.perWeek, y);
        if (want > 0 && leavePaidUsed(ctx.others, y, ctx.perWeek, rec.id) + want > ctx.allowance) return { ok: false, reason: 'balance' };
      }
    }
    const reason = text(rec.reason, 300);
    const save: any = { id: rec.id, employee_id: empId, employee_name: text(actor.admin ? (rec.employee_name || '') : actor.name, 80), type: rec.type, start_date: start, end_date: end, days, status, created_by: actor.id, created_at: now, updated_at: now };
    if (reason) save.reason = reason;
    if (status === 'approved') { save.decided_by = actor.id; save.decided_at = now; }
    return { ok: true, save };
  }
  // Modification d'une demande qui existe : seul l'état peut changer.
  if (!actor.admin && existing.employee_id !== actor.id) return { ok: false, reason: 'forbidden' };
  if (status === existing.status) return { ok: true, save: existing }; // rien ne change (les autres champs envoyés sont ignorés)
  const decision = text(rec.decision_reason, 300);
  const from = existing.status;
  const started = lvDate(existing.start_date) !== null && existing.start_date <= ctx.today;
  let allowed = false;
  if (from === 'pending' && status === 'approved') allowed = actor.admin;
  else if (from === 'pending' && status === 'rejected') { allowed = actor.admin; if (allowed && decision.length < 3) return { ok: false, reason: 'decision_reason' }; }
  else if (from === 'pending' && status === 'cancelled') allowed = true;
  else if (from === 'approved' && status === 'cancelled') {
    allowed = actor.admin || !started;
    if (actor.admin && decision.length < 3) return { ok: false, reason: 'decision_reason' };
  }
  if (!allowed) return { ok: false, reason: 'transition' };
  if (status === 'approved') {
    const start = existing.start_date, end = existing.end_date;
    for (const o of ctx.others || []) {
      if (o && o.id !== existing.id && o.status === 'approved' && lvDate(o.start_date) && lvDate(o.end_date) && o.start_date <= end && start <= o.end_date) return { ok: false, reason: 'overlap' };
    }
    if (existing.type === 'paid' && ctx.allowance > 0) {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        const want = leaveWorkingDays(start, end, ctx.perWeek, y);
        if (want > 0 && leavePaidUsed(ctx.others, y, ctx.perWeek, existing.id) + want > ctx.allowance) return { ok: false, reason: 'balance' };
      }
    }
  }
  const save: any = { ...existing, status, updated_at: now };
  if (actor.admin && (status === 'approved' || status === 'rejected' || status === 'cancelled')) {
    save.decided_by = actor.id; save.decided_at = now;
    if (decision) save.decision_reason = decision; else delete save.decision_reason;
  }
  if (!actor.admin && status === 'cancelled') { save.decided_by = actor.id; save.decided_at = now; delete save.decision_reason; }
  return { ok: true, save };
}
// END LEAVECLEAN
// ===== END LEAVES =====

// ===== BEGIN SHEETS (« Mes tableaux » : l'opérateur écrit et lit SES tableaux, l'admin lit tous ; ce bloc est contrôlé par scripts/check-sheets-shared.ts, copie de src/utils/sheets.ts) =====
const SHEET_MAX_CHARS = 1_500_000;
const SHEETS_MAX_RECORDS = 60;
const SHEET_LIMITS = { missionSheets: 400, sheetsPerPerson: 20, columns: 200, rows: 5000, cellLen: 500, title: 80, colName: 60, prefix: 12, digits: 8, rules: 20, options: 50 };
const SHEET_COLORS = ["red", "green", "amber", "blue"];
const SHEET_OPS = [">", "<", "=", "<>", "contains", "empty"];
const SHEET_TYPES = ["text", "number", "date", "list", "check", "code", "phone", "money", "time"];
const sheetClip = (v: unknown, n: number): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, n);
const sheetChars = (s: unknown): number => { try { return JSON.stringify(s).length; } catch { return Infinity; } };
function cleanSheet(raw: unknown, now: string): any | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || r.id.length > 60) return null;
  const columns: any[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.columns) ? r.columns.slice(0, SHEET_LIMITS.columns) : []) {
    if (!c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    const id = sheetClip(x.id, 60);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const type = SHEET_TYPES.includes(x.type as string) ? (x.type as string) : "text";
    const col: any = { id, name: sheetClip(x.name, SHEET_LIMITS.colName) || "Colonne", type };
    if (type === "list") col.options = (Array.isArray(x.options) ? x.options : []).map((o: unknown) => sheetClip(o, 60)).filter(Boolean).slice(0, SHEET_LIMITS.options);
    if (x.required === true) col.required = true;
    if (x.unique === true) col.unique = true;
    if (type === "code") { const pf = sheetClip(x.prefix, SHEET_LIMITS.prefix).trim(); if (pf) col.prefix = pf; const dg = Number(x.digits); if (Number.isInteger(dg) && dg >= 1 && dg <= SHEET_LIMITS.digits) col.digits = dg; }
    if (x.repeat === true) col.repeat = true;
    if (typeof x.deleted_at === "string") col.deleted_at = x.deleted_at.slice(0, 40);
    columns.push(col);
  }
  const rows: any[] = [];
  const rowIds = new Set<string>();
  for (const w of Array.isArray(r.rows) ? r.rows.slice(0, SHEET_LIMITS.rows) : []) {
    if (!w || typeof w !== "object") continue;
    const x = w as Record<string, unknown>;
    const id = sheetClip(x.id, 60);
    if (!id || rowIds.has(id)) continue;
    rowIds.add(id);
    const cells: Record<string, string> = {};
    if (x.cells && typeof x.cells === "object") for (const c of columns) { const v = (x.cells as Record<string, unknown>)[c.id]; const t = sheetClip(v, SHEET_LIMITS.cellLen); if (t !== "") cells[c.id] = t; }
    const row: any = { id, cells };
    if (typeof x.deleted_at === "string") row.deleted_at = x.deleted_at.slice(0, 40);
    rows.push(row);
  }
  const rules: any[] = [];
  for (const q of Array.isArray(r.rules) ? r.rules.slice(0, SHEET_LIMITS.rules) : []) {
    if (!q || typeof q !== "object") continue;
    const x = q as Record<string, unknown>;
    if (!seen.has(sheetClip(x.col, 60)) || !SHEET_OPS.includes(x.op as string) || !SHEET_COLORS.includes(x.color as string)) continue;
    rules.push({ id: sheetClip(x.id, 60) || `r${rules.length + 1}`, col: sheetClip(x.col, 60), op: x.op, value: sheetClip(x.value, 100), color: x.color });
  }
  const s: any = {
    id: r.id, title: sheetClip(r.title, SHEET_LIMITS.title) || "Sans titre", columns, rows, rules,
    created_at: sheetClip(r.created_at, 40) || now, updated_at: sheetClip(r.updated_at, 40) || now,
  };
  if (typeof r.deleted_at === "string") s.deleted_at = r.deleted_at.slice(0, 40);
  if (typeof r.owner_id === "string" && r.owner_id) s.owner_id = r.owner_id.slice(0, 60);
  if (typeof r.owner_name === "string" && r.owner_name) s.owner_name = r.owner_name.slice(0, 80);
  if (typeof r.post_id === "string" && r.post_id) s.post_id = r.post_id.slice(0, 60);
  return s;
}
/** Écriture d'un tableau : opérateur seulement, jamais celui d'un autre ; le propriétaire est celui qui écrit. `counts` = ses tableaux PERSONNELS déjà au serveur (hors celui-ci, hors tableaux de mission) ; `counts.mission` = ses tableaux de mission déjà au serveur.
 *  Tableau de mission (M18.6, `post_id`) : l'identifiant est imposé (`sp-` + id de la session, donc UN seul par session), la session doit être la SIENNE (`post`), le lien ne change jamais et ne s'ajoute jamais après coup ; ces tableaux ont leur propre limite (400) et ne comptent pas dans les 20 tableaux personnels. */
function cleanSheetWrite(rec: any, existing: any, me: { id: string; name: string; role: string }, now: string, counts: { active: number; total: number; mission?: number }, post?: { employee_id?: unknown } | null): { ok: true; save: any } | { ok: false; reason: string } {
  if (me.role !== "employee") return { ok: false, reason: "forbidden" };
  if (existing && existing.owner_id !== me.id) return { ok: false, reason: "forbidden" };
  const s = cleanSheet(rec, now);
  if (!s) return { ok: false, reason: "format" };
  if (existing && typeof existing.post_id === "string" && existing.post_id) s.post_id = existing.post_id;
  else if (existing) delete s.post_id;
  if (s.post_id) {
    if (s.id !== "sp-" + s.post_id) return { ok: false, reason: "post" };
    if (!existing && (!post || String(post.employee_id || "") !== me.id)) return { ok: false, reason: "post" };
  }
  s.owner_id = me.id;
  s.owner_name = String(me.name || "").slice(0, 80);
  if (existing && typeof existing.created_at === "string") s.created_at = existing.created_at;
  if (sheetChars(s) > SHEET_MAX_CHARS) return { ok: false, reason: "size" };
  if (s.post_id) {
    if (!existing && (counts.mission || 0) >= SHEET_LIMITS.missionSheets) return { ok: false, reason: "limit" };
    return { ok: true, save: s };
  }
  if (!existing) {
    if (counts.total >= SHEETS_MAX_RECORDS) return { ok: false, reason: "limit" };
    if (!s.deleted_at && counts.active >= SHEET_LIMITS.sheetsPerPerson) return { ok: false, reason: "limit" };
  } else if (!s.deleted_at && existing.deleted_at && counts.active >= SHEET_LIMITS.sheetsPerPerson) return { ok: false, reason: "limit" };
  return { ok: true, save: s };
}
// ===== END SHEETS =====

// ===== BEGIN REVIEWS (évaluations : le responsable écrit, le salarié lit les fiches partagées et accuse lecture ; ce bloc est contrôlé par scripts/check-reviews.ts) =====
// BEGIN REVIEWCLEAN
const RV_BADGES = ['quality', 'punctuality', 'regularity', 'rendement', 'versatility', 'rookie'];
const RV_MAX_SPAN = 400;
const rvDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '2000-01-01' && v <= '2100-12-31' ? v : null;
};
const rvText = (v: unknown, max: number): string => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const rvPct = (v: unknown): number | null | undefined => { // undefined = invalide, null = vide
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return undefined;
  return Math.round(v);
};
function rvSnapshot(raw: any): { ok: true; snap: any } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const score = rvPct(raw.score), rate = rvPct(raw.rate);
  const c = raw.components && typeof raw.components === 'object' && !Array.isArray(raw.components) ? raw.components : null;
  if (score === undefined || rate === undefined || !c) return { ok: false };
  const comps: any = {};
  for (const k of ['quality', 'volume', 'punctuality', 'regularity']) { const x = rvPct(c[k]); if (x === undefined) return { ok: false }; comps[k] = x; }
  if (!Array.isArray(raw.badges) || raw.badges.length > RV_BADGES.length) return { ok: false };
  const seen = new Set<string>();
  const badges: any[] = [];
  for (const b of raw.badges) {
    if (!b || typeof b !== 'object' || !RV_BADGES.includes(b.id) || seen.has(b.id) || !(b.level === 1 || b.level === 2 || b.level === 3)) return { ok: false };
    seen.add(b.id); badges.push({ id: b.id, level: b.level });
  }
  const cnt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : null);
  const done = cnt(raw.done), decided = cnt(raw.decided);
  if (done === null || decided === null || typeof raw.taken_at !== 'string' || isNaN(Date.parse(raw.taken_at))) return { ok: false };
  return { ok: true, snap: { score, components: comps, badges, done, decided, rate, taken_at: new Date(raw.taken_at).toISOString() } };
}
/**
 * Vérifie une fiche d'évaluation et applique le changement. Le serveur ne fait jamais confiance au navigateur.
 * actor : { id, admin }. Le responsable crée et modifie ; il ne repasse jamais une fiche partagée en brouillon.
 * Après partage : la période et la photo des scores sont figées ; tout changement de ce que le salarié voit (objectifs, forces, commentaires, note) efface son « lu ».
 * Le salarié ne peut qu'accuser lecture (« lu ») de SA fiche partagée ; une fois lu, cela ne s'annule pas.
 */
function cleanReview(rec: any, existing: any, actor: { id: string; admin: boolean }, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || typeof rec.id !== 'string' || !rec.id || rec.id.length > 80) return { ok: false, reason: 'id' };
  if (!actor.admin) {
    if (!existing || existing.employee_id !== actor.id || existing.status !== 'shared') return { ok: false, reason: 'forbidden' };
    if (existing.acknowledged_at || !rec.acknowledged_at) return { ok: true, save: existing }; // rien d'autre ne change : tout autre champ envoyé est ignoré
    return { ok: true, save: { ...existing, acknowledged_at: now, acknowledged_by: actor.id, updated_at: now } };
  }
  const status = rec.status === 'draft' || rec.status === 'shared' ? rec.status : null;
  if (!status) return { ok: false, reason: 'status' };
  if (existing && existing.status === 'shared' && status === 'draft') return { ok: false, reason: 'transition' };
  if (existing && rec.employee_id !== undefined && rec.employee_id !== existing.employee_id) return { ok: false, reason: 'employee' };
  const empId = existing ? existing.employee_id : (typeof rec.employee_id === 'string' ? rec.employee_id : '');
  if (!empId || empId.length > 80) return { ok: false, reason: 'employee' };
  const frozen = !!existing && existing.status === 'shared'; // période et photo figées après partage
  let start = frozen ? existing.period_start : rvDate(rec.period_start), end = frozen ? existing.period_end : rvDate(rec.period_end);
  if (!start || !end || end < start) return { ok: false, reason: 'period' };
  if (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z') > RV_MAX_SPAN * 86400000) return { ok: false, reason: 'period' };
  if (!Array.isArray(rec.objectives) || rec.objectives.length > 10) return { ok: false, reason: 'objectives' };
  const seen = new Set<string>();
  const objectives: any[] = [];
  for (const o of rec.objectives) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, reason: 'objectives' };
    const id = rvText(o.id, 80), text = rvText(o.text, 200);
    if (!id || !text || seen.has(id)) return { ok: false, reason: 'objectives' };
    seen.add(id);
    objectives.push(o.done === true ? { id, text, done: true } : { id, text });
  }
  let rating: number | undefined;
  if (rec.rating !== undefined && rec.rating !== null && rec.rating !== '') {
    if (typeof rec.rating !== 'number' || !Number.isInteger(rec.rating) || rec.rating < 1 || rec.rating > 5) return { ok: false, reason: 'rating' };
    rating = rec.rating;
  }
  let snapshot = existing ? existing.snapshot : undefined;
  if (!frozen && rec.snapshot !== undefined && rec.snapshot !== null) {
    const sv = rvSnapshot(rec.snapshot);
    if (!sv.ok) return { ok: false, reason: 'snapshot' };
    snapshot = sv.snap;
  }
  const strengths = rvText(rec.strengths, 1000), comments = rvText(rec.comments, 2000), improvements = rvText(rec.improvements, 1000);
  const save: any = {
    id: rec.id, employee_id: empId, employee_name: rvText(existing ? existing.employee_name : rec.employee_name, 80), period_start: start, period_end: end, status, objectives,
    created_by: existing ? existing.created_by : actor.id, created_at: existing ? existing.created_at : now, updated_at: now,
  };
  if (strengths) save.strengths = strengths;
  if (comments) save.comments = comments;
  if (improvements) save.improvements = improvements;
  if (rating !== undefined) save.rating = rating;
  if (snapshot) save.snapshot = snapshot;
  if (status === 'shared') save.shared_at = existing && existing.shared_at ? existing.shared_at : now;
  if (existing && existing.acknowledged_at) {
    const visible = (r: any) => JSON.stringify([r.objectives || [], r.strengths || '', r.comments || '', r.rating ?? null]);
    if (visible(existing) === visible(save)) { save.acknowledged_at = existing.acknowledged_at; save.acknowledged_by = existing.acknowledged_by; } // sinon : le salarié relit
  }
  return { ok: true, save };
}
// END REVIEWCLEAN
// ===== END REVIEWS =====

// ===== BEGIN ACCOUNTING (comptabilité : écritures à partie double ; ce bloc est contrôlé par scripts/check-accounting-server.ts) =====
const ACCT = (() => {
// BEGIN ACCOUNTINGCORE
type Journal = 'VT' | 'AC' | 'BQ' | 'CA' | 'MM' | 'PA' | 'OD';
interface Account { code: string; fr: string; en: string; kind: 'asset' | 'liability' | 'equity' | 'expense' | 'income' }
interface EntryLine { account: string; debit: number; credit: number; label?: string }
interface EntrySource { type: string; id: string } // d'où vient l'écriture : facture, avoir, paiement, dépense, paie…
interface Entry {
  id: string; // déterministe pour une écriture automatique : `je-<type>-<id>` (jamais de doublon)
  number?: string; // numéro d'écriture attribué par le serveur (jamais par le navigateur)
  date: string;
  journal: Journal;
  ref?: string; // numéro de la pièce (facture, reçu…)
  label: string;
  lines: EntryLine[];
  source?: EntrySource;
  reversal_of?: string; // contre-passation : identifiant de l'écriture annulée
  reversed_by?: string;
  created_by?: string; created_at?: string; updated_at?: string;
}

const JOURNALS: Record<Journal, [string, string]> = {
  VT: ['Ventes', 'Sales'], AC: ['Achats', 'Purchases'], BQ: ['Banque', 'Bank'], CA: ['Caisse', 'Cash'], MM: ['Mobile Money', 'Mobile Money'], PA: ['Paie', 'Payroll'], OD: ['Opérations diverses', 'Miscellaneous'],
};

/** Plan minimal de départ (à valider par un expert-comptable). Les comptes de classe 4 et 5 sont les seuls qui peuvent changer de côté (solde débiteur ou créditeur). */
const PLAN: Account[] = [
  { code: '101', fr: 'Capital', en: 'Capital', kind: 'equity' },
  { code: '110', fr: 'Report à nouveau', en: 'Retained earnings', kind: 'equity' },
  { code: '401', fr: 'Fournisseurs', en: 'Suppliers', kind: 'liability' },
  { code: '411', fr: 'Clients', en: 'Customers', kind: 'asset' },
  { code: '421', fr: 'Personnel : rémunérations dues', en: 'Staff: pay due', kind: 'liability' },
  { code: '425', fr: 'Personnel : avances et acomptes', en: 'Staff: advances', kind: 'asset' },
  { code: '4456', fr: 'TVA déductible', en: 'Deductible VAT', kind: 'asset' },
  { code: '4457', fr: 'TVA collectée', en: 'Collected VAT', kind: 'liability' },
  { code: '512', fr: 'Banque', en: 'Bank', kind: 'asset' },
  { code: '514', fr: 'Mobile Money', en: 'Mobile Money', kind: 'asset' },
  { code: '531', fr: 'Caisse', en: 'Cash on hand', kind: 'asset' },
  { code: '601', fr: 'Achats', en: 'Purchases', kind: 'expense' },
  { code: '606', fr: 'Fournitures et petit matériel', en: 'Supplies and small equipment', kind: 'expense' },
  { code: '613', fr: 'Loyers', en: 'Rent', kind: 'expense' },
  { code: '624', fr: 'Transports', en: 'Transport', kind: 'expense' },
  { code: '626', fr: 'Internet et télécommunications', en: 'Internet and telecoms', kind: 'expense' },
  { code: '641', fr: 'Rémunérations du personnel', en: 'Staff pay', kind: 'expense' },
  { code: '658', fr: 'Charges diverses', en: 'Other expenses', kind: 'expense' },
  { code: '706', fr: 'Prestations de services', en: 'Services revenue', kind: 'income' },
  { code: '758', fr: 'Produits divers', en: 'Other income', kind: 'income' },
];
const PLAN_BY_CODE = new Map(PLAN.map(a => [a.code, a]));
const accountOf = (code: string): Account | undefined => PLAN_BY_CODE.get(code);
const classOf = (code: string): number => Number(String(code)[0]);

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_LINES = 40;
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
};
const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);

const totals = (lines: EntryLine[]) => ({ debit: lines.reduce((t, l) => t + (l.debit || 0), 0), credit: lines.reduce((t, l) => t + (l.credit || 0), 0) });

/**
 * Vérifie une écriture. `closedThrough` = dernier jour d'une période CLOSE (« » = aucune) : on n'écrit plus à cette date ni avant.
 * Refus : id/date/journal/libellé faux, moins de 2 lignes ou plus de 40, compte hors plan, montant non entier ou négatif ou énorme, ligne qui est à la fois débit et crédit,
 * ligne à zéro, écriture déséquilibrée, période close. Renvoie l'écriture NETTOYÉE (texte sans chevrons, lignes sans champ inconnu).
 */
function cleanEntry(raw: any, closedThrough = ''): { ok: true; entry: Entry } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'entry' };
  const id = clean(raw.id, 120);
  if (!id) return { ok: false, reason: 'id' };
  if (!isDate(raw.date)) return { ok: false, reason: 'date' };
  if (closedThrough && raw.date <= closedThrough) return { ok: false, reason: 'closed' };
  if (typeof raw.journal !== 'string' || !(raw.journal in JOURNALS)) return { ok: false, reason: 'journal' };
  const label = clean(raw.label, 200);
  if (!label) return { ok: false, reason: 'label' };
  if (!Array.isArray(raw.lines) || raw.lines.length < 2 || raw.lines.length > MAX_LINES) return { ok: false, reason: 'lines' };
  const lines: EntryLine[] = [];
  for (const l of raw.lines) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return { ok: false, reason: 'lines' };
    const account = typeof l.account === 'string' ? l.account : '';
    if (!PLAN_BY_CODE.has(account)) return { ok: false, reason: 'account' };
    const debit = l.debit === undefined || l.debit === null ? 0 : l.debit, credit = l.credit === undefined || l.credit === null ? 0 : l.credit;
    if (!isAmount(debit) || !isAmount(credit)) return { ok: false, reason: 'amount' };
    if ((debit > 0) === (credit > 0)) return { ok: false, reason: 'line' }; // ni les deux, ni aucun
    const line: EntryLine = { account, debit, credit };
    const ll = clean(l.label, 120);
    if (ll) line.label = ll;
    lines.push(line);
  }
  const t = totals(lines);
  if (t.debit !== t.credit) return { ok: false, reason: 'unbalanced' };
  if (t.debit > MAX_AMOUNT) return { ok: false, reason: 'amount' };
  const entry: Entry = { id, date: raw.date, journal: raw.journal as Journal, label, lines };
  const ref = clean(raw.ref, 80);
  if (ref) entry.ref = ref;
  if (raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)) {
    const st = clean(raw.source.type, 40), si = clean(raw.source.id, 120);
    if (st && si) entry.source = { type: st, id: si };
  }
  if (typeof raw.reversal_of === 'string' && raw.reversal_of) entry.reversal_of = clean(raw.reversal_of, 120);
  return { ok: true, entry };
}

/** Identifiant d'une écriture automatique : toujours le même pour la même pièce, donc jamais de doublon si on la génère deux fois. */
const entryIdFor = (source: EntrySource): string => `je-${source.type}-${source.id}`;

/** Contre-passation : même écriture, débit et crédit échangés, à la date donnée. L'originale n'est jamais modifiée (le serveur ajoute `reversed_by`). */
function reverseEntry(e: Entry, date: string, id: string): Entry {
  return {
    id, date, journal: e.journal, ref: e.ref, label: `Annulation : ${e.label}`.slice(0, 200),
    lines: e.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit, ...(l.label ? { label: l.label } : {}) })),
    ...(e.source ? { source: e.source } : {}), reversal_of: e.id,
  };
}

// ---------- Clôture d'une période (M14.6) ----------
interface CloseLogEntry { at: string; by: string; by_name: string; action: 'close' | 'reopen'; through: string; reason?: string }
/** `through` = dernier jour de la période close (« » = rien de clos). Écrit par le SERVEUR seulement (jamais par la synchro). */
interface CloseState { through: string; log: CloseLogEntry[] }
const addDays = (d: string, n: number): string => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const isMonthEnd = (d: unknown): d is string => isDate(d) && addDays(d, 1).slice(8) === '01';
/** Clôturer : jusqu'à une fin de mois, pas dans le futur, toujours plus loin que la clôture actuelle. `yearEnd` = le 31 décembre (exercice civil) : on y passe l'écriture de report à nouveau. */
function planClose(current: string, through: unknown, today: string): { ok: true; yearEnd: boolean } | { ok: false; reason: 'date' | 'future' | 'already' } {
  if (!isMonthEnd(through)) return { ok: false, reason: 'date' };
  if (through > today) return { ok: false, reason: 'future' };
  if (current && through <= current) return { ok: false, reason: 'already' };
  return { ok: true, yearEnd: through.slice(5) === '12-31' };
}
/** Rouvrir : motif de 3 caractères au moins ; `through` = nouvelle fin de clôture, plus tôt que l'actuelle (« » = tout rouvrir). */
function planReopen(current: string, through: unknown, reason: unknown): { ok: true } | { ok: false; reason: 'nothing' | 'reason' | 'date' | 'later' } {
  if (!current) return { ok: false, reason: 'nothing' };
  if (typeof reason !== 'string' || reason.replace(/[<>]/g, '').trim().length < 3) return { ok: false, reason: 'reason' };
  if (through !== '' && !isMonthEnd(through)) return { ok: false, reason: 'date' };
  if (through !== '' && (through as string) >= current) return { ok: false, reason: 'later' };
  return { ok: true };
}
/**
 * Report à nouveau : à la clôture du 31 décembre, les comptes de charges (6) et de produits (7) de l'exercice sont soldés et le résultat passe au compte 110.
 * Daté du dernier jour de l'exercice. Renvoie null s'il n'y a rien à solder (déjà fait, ou exercice vide). Le calcul tient compte des écritures de clôture déjà passées (et de leurs annulations).
 */
function closingEntry(entries: Entry[], yearStart: string, end: string, id: string): Entry | null {
  if (!isDate(yearStart) || !isDate(end)) return null;
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.date < yearStart || e.date > end) continue;
    for (const l of e.lines) { const c = classOf(l.account); if (c === 6 || c === 7) net.set(l.account, (net.get(l.account) || 0) + l.debit - l.credit); }
  }
  const lines: EntryLine[] = [];
  let result = 0;
  for (const [account, n] of [...net.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (n === 0) continue;
    lines.push(n > 0 ? { account, debit: 0, credit: n } : { account, debit: -n, credit: 0 });
    result += n;
  }
  if (lines.length === 0) return null;
  if (result > 0) lines.push({ account: '110', debit: result, credit: 0 });
  else if (result < 0) lines.push({ account: '110', debit: 0, credit: -result });
  return { id, date: end, journal: 'OD', label: `Report à nouveau : résultat de l'exercice clos le ${end}`, lines, source: { type: 'closing', id: end } };
}
// END ACCOUNTINGCORE
// BEGIN ACCOUNTINGBUILD
/** Ce dont on a besoin d'une facture, d'une ligne d'argent, d'une avance : les vrais types du site les contiennent (typage structurel). */
interface InvoiceLike { id: string; type?: string; number?: string; status: string; client?: { name?: string } | null; issue_date: string; subtotal_ar: number; tax_ar: number; total_ar: number }
interface CashLike { id: string; kind: string; category?: string; amount_ar: number; date: string; note?: string; invoice_id?: string; payment_method?: string; receipt_no?: string; client_name?: string }
interface AdvanceLike { id: string; status: string; amount_ar: number; request_date: string }

/** Fiche de paie telle que le serveur la garde (table de paie) : seuls les champs utiles ici. Le NOM du salarié n'est jamais utilisé : le Comptable ne doit pas voir la paie de chacun. */
interface SlipLike {
  id: string; period_end: string;
  net: number; advance_deducted?: number;
  paid?: { at: string; method?: string } | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Compte et journal de trésorerie selon le mode de paiement écrit à la main (« espèces », « virement », « MVola »…). Vide ou inconnu = caisse (valeur par défaut, à valider). */
function cashAccountFor(method: unknown): { account: string; journal: Journal } {
  const m = norm(method);
  if (/mobile|mvola|orange|airtel|money|momo/.test(m)) return { account: '514', journal: 'MM' };
  if (/virement|banque|bank|cheque|carte|transfer|rib|swift/.test(m)) return { account: '512', journal: 'BQ' };
  return { account: '531', journal: 'CA' };
}

/** Compte de charge selon la catégorie de dépense des Finances. Catégorie inconnue = charges diverses. */
const EXPENSE_ACCOUNT: Record<string, string> = { Achats: '601', Loyer: '613', Internet: '626', Matériel: '606', Transport: '624', Autres: '658' };
const expenseAccountFor = (category: unknown): string => EXPENSE_ACCOUNT[String(category ?? '')] || '658';

type BuildResult = { ok: true; entry: Entry } | { ok: false; reason: string };
const isAmt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
const L = (account: string, debit: number, credit: number): EntryLine => ({ account, debit, credit });
const finish = (raw: Entry): BuildResult => { const r = cleanEntry(raw); return r.ok ? { ok: true, entry: r.entry } : { ok: false, reason: r.reason }; };
const SKIP = (reason: string): BuildResult => ({ ok: false, reason });

/** Facture émise : le client nous doit le total (411), on constate la vente (706) et la TVA collectée (4457). Brouillon : rien. Facture ensuite annulée : garde son écriture, l'avoir la contre-passe. */
function entryForInvoice(inv: InvoiceLike): BuildResult {
  if (inv.type === 'credit_note') return SKIP('credit_note');
  if (inv.status !== 'issued' && inv.status !== 'cancelled') return SKIP('draft');
  const { subtotal_ar: sub, tax_ar: tax, total_ar: total } = inv;
  if (!Number.isInteger(total) || total < 0) return SKIP('totals');
  if (total === 0) return SKIP('zero');
  if (!Number.isInteger(sub) || !Number.isInteger(tax) || sub < 0 || tax < 0 || sub + tax !== total) return SKIP('totals');
  const lines = [L('411', total, 0)];
  if (sub > 0) lines.push(L('706', 0, sub));
  if (tax > 0) lines.push(L('4457', 0, tax));
  return finish({ id: entryIdFor({ type: 'invoice', id: inv.id }), date: inv.issue_date, journal: 'VT', ref: inv.number, label: `Facture ${inv.number || ''} ${inv.client?.name || ''}`.trim(), lines, source: { type: 'invoice', id: inv.id } });
}

/** Avoir : exactement l'inverse de la facture qu'il annule (mêmes montants, débit et crédit échangés). */
function entryForCreditNote(inv: InvoiceLike): BuildResult {
  if (inv.type !== 'credit_note') return SKIP('not_credit_note');
  if (inv.status !== 'issued') return SKIP('draft');
  const { subtotal_ar: sub, tax_ar: tax, total_ar: total } = inv;
  if (!Number.isInteger(total) || total < 0) return SKIP('totals');
  if (total === 0) return SKIP('zero');
  if (!Number.isInteger(sub) || !Number.isInteger(tax) || sub < 0 || tax < 0 || sub + tax !== total) return SKIP('totals');
  const lines: EntryLine[] = [];
  if (sub > 0) lines.push(L('706', sub, 0));
  if (tax > 0) lines.push(L('4457', tax, 0));
  lines.push(L('411', 0, total));
  return finish({ id: entryIdFor({ type: 'credit_note', id: inv.id }), date: inv.issue_date, journal: 'VT', ref: inv.number, label: `Avoir ${inv.number || ''} ${inv.client?.name || ''}`.trim(), lines, source: { type: 'credit_note', id: inv.id } });
}

/** Ligne d'argent des Finances : entrée (paiement d'une facture → solde du client ; paiement client sans facture → client ; autre entrée → produits divers) ou dépense (charge selon la catégorie). */
function entryForCash(c: CashLike): BuildResult {
  if (!isAmt(c.amount_ar)) return SKIP('amount');
  const cash = cashAccountFor(c.payment_method);
  if (c.kind === 'in') {
    const credit = c.invoice_id || c.category === 'Paiement client' ? '411' : '758';
    return finish({ id: entryIdFor({ type: 'receipt', id: c.id }), date: c.date, journal: cash.journal, ref: c.receipt_no, label: `${c.invoice_id ? 'Paiement de facture' : c.category || 'Entrée'}${c.client_name ? ` ${c.client_name}` : ''}`.trim(), lines: [L(cash.account, c.amount_ar, 0), L(credit, 0, c.amount_ar)], source: { type: 'receipt', id: c.id } });
  }
  if (c.kind === 'out') {
    return finish({ id: entryIdFor({ type: 'expense', id: c.id }), date: c.date, journal: cash.journal, label: `${c.category || 'Dépense'}${c.note ? ` : ${c.note}` : ''}`, lines: [L(expenseAccountFor(c.category), c.amount_ar, 0), L(cash.account, 0, c.amount_ar)], source: { type: 'expense', id: c.id } });
  }
  return SKIP('kind');
}

/** Clôture d'une fiche de paie : charge de personnel (641) = net dû (421) + avances reprises (425). Daté du dernier jour de la période. Net et avances à zéro : rien. */
function entryForSlipClose(s: SlipLike, key: (id: string) => string = x => x): BuildResult {
  const net = Number.isInteger(s.net) && s.net > 0 ? s.net : 0, adv = Number.isInteger(s.advance_deducted) && (s.advance_deducted as number) > 0 ? (s.advance_deducted as number) : 0;
  if (net + adv === 0) return SKIP('zero');
  const lines = [L('641', net + adv, 0)];
  if (net > 0) lines.push(L('421', 0, net));
  if (adv > 0) lines.push(L('425', 0, adv));
  return finish({ id: entryIdFor({ type: 'slip_close', id: key(s.id) }), date: s.period_end, journal: 'PA', label: `Paie ${String(s.period_end).slice(0, 7)}`, lines, source: { type: 'slip_close', id: key(s.id) } });
}

/** Paiement d'une fiche de paie : on solde la dette envers le salarié (421) par la trésorerie du mode de paiement. Pas payée ou net à zéro : rien. */
function entryForSlipPaid(s: SlipLike, key: (id: string) => string = x => x): BuildResult {
  if (!s.paid || !s.paid.at) return SKIP('not_paid');
  if (!isAmt(s.net)) return SKIP('zero');
  const cash = cashAccountFor(s.paid.method);
  return finish({ id: entryIdFor({ type: 'slip_paid', id: key(s.id) }), date: s.paid.at, journal: cash.journal, label: `Paiement de la paie ${String(s.period_end).slice(0, 7)}`, lines: [L('421', s.net, 0), L(cash.account, 0, s.net)], source: { type: 'slip_paid', id: key(s.id) } });
}

/** Avance accordée (statut « approuvée ») : le salarié nous doit ce montant (425), sorti de la caisse (valeur par défaut). Elle est reprise ensuite sur la paie. En attente ou refusée : rien. */
function entryForAdvance(a: AdvanceLike, key: (id: string) => string = x => x): BuildResult {
  if (a.status !== 'approved') return SKIP('not_approved');
  if (!isAmt(a.amount_ar)) return SKIP('amount');
  return finish({ id: entryIdFor({ type: 'advance', id: key(a.id) }), date: a.request_date, journal: 'CA', label: 'Avance au personnel', lines: [L('425', a.amount_ar, 0), L('531', 0, a.amount_ar)], source: { type: 'advance', id: key(a.id) } });
}

interface Sources { invoices: InvoiceLike[]; cash: CashLike[]; slips: SlipLike[]; advances: AdvanceLike[] }
interface Built { entries: Entry[]; skipped: { type: string; id: string; reason: string }[] }
/** Les « rien à écrire » normaux (brouillon, avance en attente…) ne comptent pas comme des problèmes : ils ne sont pas dans `skipped`. */
const NORMAL_SKIPS = new Set(['draft', 'not_paid', 'not_approved', 'credit_note', 'not_credit_note']);

/** Toutes les écritures automatiques, triées par date puis identifiant (même résultat quel que soit l'ordre des pièces). `skipped` = pièces refusées (totaux incohérents, montant faux, date fausse…) à corriger. */
function buildEntries(src: Sources, key: (id: string) => string = x => x): Built {
  const out: Entry[] = [], skipped: Built['skipped'] = [];
  const add = (type: string, id: string, r: BuildResult) => { if (r.ok) out.push(r.entry); else if (!NORMAL_SKIPS.has(r.reason)) skipped.push({ type, id, reason: r.reason }); };
  for (const i of src.invoices || []) add(i.type === 'credit_note' ? 'credit_note' : 'invoice', i.id, i.type === 'credit_note' ? entryForCreditNote(i) : entryForInvoice(i));
  for (const c of src.cash || []) add('cash', c.id, entryForCash(c));
  for (const s of src.slips || []) { add('slip_close', s.id, entryForSlipClose(s, key)); add('slip_paid', s.id, entryForSlipPaid(s, key)); }
  for (const a of src.advances || []) add('advance', a.id, entryForAdvance(a, key));
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries: out, skipped };
}
// END ACCOUNTINGBUILD
return { cleanEntry, reverseEntry, buildEntries, planClose, planReopen, closingEntry, isMonthEnd, addDays };
})();

/** Clé opaque d'une pièce de paie ou d'avance : le Comptable lit les écritures mais ne doit pas pouvoir remonter à un salarié (l'identifiant d'une fiche contient celui du salarié). */
async function acctKey(id: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`df-acct:${id}`));
  return Array.from(new Uint8Array(d)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
const acctFail = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });

/** Clôture en cours (lue À CHAQUE FOIS dans la base, jamais dans le cache) : { through, log }. Écrite seulement par la route accounting-close. */
async function acctCloseState(): Promise<{ through: string; log: any[]; rec: any }> {
  const { data } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  const rec: any = (data as any)?.data || {};
  const c = rec.acct_close || {};
  return { through: typeof c.through === 'string' && ACCT.isMonthEnd(c.through) ? c.through : '', log: Array.isArray(c.log) ? c.log : [], rec };
}
const ACCT_CLOSE_REASON: Record<string, string> = {
  date: 'La clôture se fait à une fin de mois (exemple : 2026-10-31).', future: 'On ne peut pas clôturer une période qui n\'est pas encore finie.', already: 'Cette période est déjà close.',
  nothing: 'Aucune période n\'est close.', reason: 'Écris un motif (3 caractères au moins).', later: 'Pour rouvrir, choisis une date plus ancienne que la clôture actuelle.',
};

/** Génère les écritures de toutes les pièces (factures, avoirs, argent, paie, avances). Idempotent : une écriture qui existe déjà n'est ni refaite ni modifiée. Réservé à l'admin et au Comptable. */
async function accountingSync(_req: any, res: any, me: any) {
  const [invoices, cash, slipRows, advRows] = await Promise.all([
    fetchAll((a, b) => sb.from(T.invoices).select('id, data').order('id', { ascending: true }).range(a, b)),
    fetchAll((a, b) => sb.from(T.cash).select('id, data').order('id', { ascending: true }).range(a, b)),
    fetchAll((a, b) => sb.from(PAYROLL).select('id, data').eq('data->>kind', 'slip').order('id', { ascending: true }).range(a, b)),
    fetchAll((a, b) => sb.from(T.advances).select('id, data').eq('data->>status', 'approved').order('id', { ascending: true }).range(a, b)),
  ]);
  const keys = new Map<string, string>();
  for (const r of [...slipRows, ...advRows]) keys.set(String(r.data?.id ?? r.id), await acctKey(String(r.data?.id ?? r.id)));
  const built = ACCT.buildEntries({
    invoices: invoices.map((r: any) => r.data), cash: cash.map((r: any) => r.data),
    slips: slipRows.map((r: any) => r.data), advances: advRows.map((r: any) => r.data),
  }, (id: string) => keys.get(id) || id);
  let created = 0, existing = 0;
  const closed = (await acctCloseState()).through;
  if (closed) { // une pièce datée dans une période close n'est PAS écrite (elle est signalée)
    const keep = built.entries.filter((e: any) => e.date > closed);
    for (const e of built.entries) if (e.date <= closed) built.skipped.push({ type: String(e.source?.type || 'entry'), id: String(e.source?.id || e.id), reason: 'closed' });
    built.entries = keep;
  }
  for (let i = 0; i < built.entries.length; i += 200) {
    const { data, error } = await sb.rpc('df_post_entries', { p_entries: built.entries.slice(i, i + 200), p_by: me.id });
    if (error) return acctFail(res, "Impossible d'enregistrer les écritures : " + error.message, 500);
    created += Number(data?.created) || 0; existing += Number(data?.existing) || 0;
  }
  await auditLog(me, 'accounting_sync', { type: 'entries', id: 'sync', label: 'Écritures' }, `${created} créée(s), ${existing} déjà là, ${built.skipped.length} pièce(s) refusée(s)`);
  // les pièces refusées de paie ou d'avance sont citées par leur clé opaque, jamais par l'identifiant du salarié
  const skipped = built.skipped.map((x: any) => ({ type: x.type, id: /^(slip|advance)/.test(x.type) ? (keys.get(x.id) || 'x') : x.id, reason: x.reason }));
  return res.json({ ok: true, created, existing, total: built.entries.length, skipped });
}

/** Saisie manuelle d'une écriture (capital, report à nouveau, opérations diverses…). Vérifiée comme toutes les autres. Réservé à l'admin et au Comptable. */
async function accountingPost(req: any, res: any, me: any) {
  const b = req.body || {};
  const id = `je-manual-${newDocId('m')}`;
  const v = ACCT.cleanEntry({ id, date: b.date, journal: b.journal, ref: b.ref, label: b.label, lines: b.lines, source: { type: 'manual', id } }, (await acctCloseState()).through);
  if (!v.ok) return acctFail(res, `Écriture refusée (${v.reason}).`, 400);
  const { data, error } = await sb.rpc('df_post_entries', { p_entries: [v.entry], p_by: me.id });
  if (error) return acctFail(res, "Impossible d'enregistrer l'écriture : " + error.message, 500);
  await auditLog(me, 'accounting_post', { type: 'entries', id, label: v.entry.label }, `${v.entry.date} ${v.entry.journal}`);
  return res.json({ ok: true, id, created: Number(data?.created) || 0 });
}

/** Contre-passation (annulation) : réservée à l'admin. Motif de 3 caractères au moins, date jamais avant l'écriture. L'originale n'est jamais modifiée sauf la marque « annulée par ». */
async function accountingReverse(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const id = String(req.body?.id || ''), reason = String(req.body?.reason || '').replace(/[<>]/g, '').trim().slice(0, 150), date = String(req.body?.date || '');
  if (!id) return acctFail(res, 'Écriture manquante.');
  if (reason.length < 3) return acctFail(res, "Écris un motif (3 caractères au moins).");
  const { data: row } = await sb.from(T.entries).select('data').eq('id', id).maybeSingle();
  if (!row) return acctFail(res, "Cette écriture n'existe pas.", 404);
  const orig = row.data as any;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < orig.date) return acctFail(res, "Date incorrecte (pas avant l'écriture annulée).");
  const rev = ACCT.reverseEntry(orig, date, `${id}-rev`);
  rev.label = `${rev.label} (${reason})`.slice(0, 200);
  const v = ACCT.cleanEntry(rev, (await acctCloseState()).through);
  if (!v.ok) return acctFail(res, `Annulation refusée (${v.reason}).`);
  const { data, error } = await sb.rpc('df_reverse_entry', { p_id: id, p_rev: v.entry, p_by: me.id });
  if (error) {
    const m = String(error.message || '');
    if (m.includes('already_reversed')) return acctFail(res, 'Cette écriture est déjà annulée.', 409);
    if (m.includes('is_reversal')) return acctFail(res, "Une annulation ne s'annule pas : saisis une nouvelle écriture.", 409);
    if (m.includes('not_found')) return acctFail(res, "Cette écriture n'existe pas.", 404);
    return acctFail(res, "Impossible d'annuler l'écriture : " + m, 500);
  }
  await auditLog(me, 'accounting_reverse', { type: 'entries', id, label: orig.label }, reason);
  return res.json({ ok: true, ...data });
}
/** Clôture et réouverture d'une période (admin seulement). Clôturer = on n'écrit plus à cette date ni avant ; au 31 décembre, le résultat de l'exercice est reporté au compte 110. Rouvrir demande un motif et annule les reports à nouveau des exercices rouverts. Tout est noté dans le journal. */
async function accountingClose(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const b = req.body || {};
  const cur = await acctCloseState();
  const now = new Date().toISOString();
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // jour de Madagascar (UTC+3)
  const who = { by: String(me.id), by_name: String(me.name || me.username || '').slice(0, 80) };
  const save = async (through: string, entry: any) => {
    const log = [...cur.log, entry].slice(-100);
    const { error } = await sb.from(T.settings).update({ data: { ...cur.rec, acct_close: { through, log } }, updated_at: now }).eq('id', 'general');
    stCache = null;
    return error;
  };
  const { data: rows, error: rerr } = await sb.from(T.entries).select('id, data').order('id', { ascending: true });
  if (rerr) return acctFail(res, 'Lecture des écritures impossible.', 500);
  const all: any[] = (rows || []).map((r: any) => r.data);
  if (b.action === 'close') {
    const through = String(b.through || '');
    const p = ACCT.planClose(cur.through, through, today);
    if (!p.ok) return acctFail(res, ACCT_CLOSE_REASON[p.reason] || 'Clôture refusée.');
    let posted = 0;
    if (p.yearEnd) {
      const n = all.filter((e: any) => e.source?.type === 'closing' && e.source?.id === through && !e.reversal_of).length;
      const ce = ACCT.closingEntry(all, `${through.slice(0, 4)}-01-01`, through, `je-closing-${through}-${n + 1}`);
      if (ce) {
        const v = ACCT.cleanEntry(ce, cur.through);
        if (!v.ok) return acctFail(res, `Report à nouveau refusé (${v.reason}).`);
        const { error } = await sb.rpc('df_post_entries', { p_entries: [v.entry], p_by: me.id });
        if (error) return acctFail(res, "Impossible d'écrire le report à nouveau : " + error.message, 500);
        posted = 1;
      }
    }
    const err = await save(through, { at: now, ...who, action: 'close', through });
    if (err) return acctFail(res, "Impossible d'enregistrer la clôture : " + err.message, 500);
    await auditLog(me, 'accounting_close', { type: 'entries', id: through, label: 'Clôture' }, `jusqu'au ${through}${posted ? ' (report à nouveau passé)' : ''}`);
    return res.json({ ok: true, through, carried: posted });
  }
  if (b.action === 'reopen') {
    const through = b.through === undefined || b.through === null ? '' : String(b.through);
    const reason = String(b.reason ?? '').replace(/[<>]/g, '').trim().slice(0, 150);
    const p = ACCT.planReopen(cur.through, through, reason);
    if (!p.ok) return acctFail(res, ACCT_CLOSE_REASON[p.reason] || 'Réouverture refusée.');
    // Les reports à nouveau des exercices rouverts sont annulés d'abord (si la suite échoue, la période reste close : c'est le côté prudent).
    let undone = 0;
    for (const e of all.filter((x: any) => x.source?.type === 'closing' && !x.reversal_of && !x.reversed_by && x.date > through)) {
      const rev = ACCT.reverseEntry(e, e.date, `${e.id}-rev`);
      rev.label = `${rev.label} (réouverture : ${reason})`.slice(0, 200);
      const v = ACCT.cleanEntry(rev, through);
      if (!v.ok) return acctFail(res, `Annulation du report à nouveau refusée (${v.reason}).`);
      const { error } = await sb.rpc('df_reverse_entry', { p_id: e.id, p_rev: v.entry, p_by: me.id });
      if (error) return acctFail(res, "Impossible d'annuler le report à nouveau : " + error.message, 500);
      undone++;
    }
    const err = await save(through, { at: now, ...who, action: 'reopen', through, reason });
    if (err) return acctFail(res, "Impossible d'enregistrer la réouverture : " + err.message, 500);
    await auditLog(me, 'accounting_reopen', { type: 'entries', id: through || 'tout', label: 'Réouverture' }, `${through ? `jusqu'au ${through}` : 'tout rouvert'} · ${reason}${undone ? ` · ${undone} report(s) à nouveau annulé(s)` : ''}`);
    return res.json({ ok: true, through, undone });
  }
  return acctFail(res, 'Action inconnue.');
}
// ===== END ACCOUNTING =====

// ===== BEGIN MISSIONS (date limite et priorité d'une mission : le serveur revérifie ; ce bloc est contrôlé par scripts/check-deadlines.ts) =====
const MISSION_PRIORITIES = ['Normale', 'Haute', 'Urgente'];
const isRealMissionDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
function cleanMissionDeadline(c: any): { ok: true; save: any } | { ok: false; reason: string } {
  const save: any = { ...c };
  const date = save.due_date === undefined || save.due_date === null ? '' : save.due_date;
  const time = save.due_time === undefined || save.due_time === null ? '' : save.due_time;
  const prio = save.priority === undefined || save.priority === null || save.priority === '' ? 'Normale' : save.priority;
  if (typeof prio !== 'string' || !MISSION_PRIORITIES.includes(prio)) return { ok: false, reason: 'mission_priority' };
  if (date !== '' && !isRealMissionDate(date)) return { ok: false, reason: 'mission_date' };
  if (time !== '' && !(typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { ok: false, reason: 'mission_time' };
  if (date === '' && time !== '') return { ok: false, reason: 'mission_time' };
  save.priority = prio;
  if (date === '') delete save.due_date; else save.due_date = date;
  if (time === '') delete save.due_time; else save.due_time = time;
  return { ok: true, save };
}
// Modèles de mission (M6.2) : nom, titre, type, consigne, justificatif. Mêmes règles que src/utils/missionTemplates.ts (contrôlé par scripts/check-templates.ts).
const TPL_PROOFS = ['type', 'none', 'photo', 'note', 'both'];
const tplClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
function cleanMissionTemplates(list: unknown): any[] {
  if (!Array.isArray(list)) return [];
  const out: any[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (out.length >= 30) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (Object.keys(raw).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) continue;
    const d: any = raw;
    if (['name', 'title', 'post_type', 'description', 'id'].some((k) => d[k] !== undefined && d[k] !== null && typeof d[k] !== 'string')) continue;
    const name = tplClean(d.name ?? '', 60);
    if (!name) continue;
    const proof = d.proof_mode === undefined || d.proof_mode === null || d.proof_mode === '' ? 'type' : d.proof_mode;
    if (typeof proof !== 'string' || !TPL_PROOFS.includes(proof)) continue;
    const id = tplClean(d.id ?? '', 40);
    if (!id || ids.has(id)) continue;
    if (out.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) continue;
    const title = tplClean(d.title ?? '', 80), type = tplClean(d.post_type ?? '', 40), desc = tplClean(d.description ?? '', 500);
    ids.add(id);
    out.push({ id, name, title, ...(type ? { post_type: type } : {}), ...(desc ? { description: desc } : {}), proof_mode: proof });
  }
  return out;
}
// Liste de tâches d'une mission (M6.3). Mêmes règles que src/utils/taskList.ts (contrôlé par scripts/check-tasks.ts).
const tkClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const tkBad = (o: any) => Object.keys(o).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype');
function cleanMissionTasks(c: any): { ok: true; save: any } | { ok: false; reason: string } {
  const save: any = { ...c };
  const list = save.tasks === undefined || save.tasks === null ? [] : save.tasks;
  if (!Array.isArray(list)) return { ok: false, reason: 'mission_tasks' };
  if (list.length > 20) return { ok: false, reason: 'mission_tasks' };
  if (save.tasks_required !== undefined && save.tasks_required !== null && typeof save.tasks_required !== 'boolean') return { ok: false, reason: 'mission_tasks' };
  const out: any[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || tkBad(raw)) return { ok: false, reason: 'mission_tasks' };
    if (typeof (raw as any).id !== 'string' || typeof (raw as any).text !== 'string') return { ok: false, reason: 'mission_tasks' };
    const id = tkClean((raw as any).id, 24), text = tkClean((raw as any).text, 120);
    if (!id || !text || ids.has(id)) return { ok: false, reason: 'mission_tasks' };
    ids.add(id);
    out.push({ id, text });
  }
  if (save.tasks_required === true && out.length === 0) return { ok: false, reason: 'mission_tasks' };
  if (out.length) save.tasks = out; else delete save.tasks;
  if (save.tasks_required === true) save.tasks_required = true; else delete save.tasks_required;
  return { ok: true, save };
}
/** Cases cochées d'une session : seulement les identifiants de la mission, sans doublon. `tasks` = liste de la mission. */
function cleanTasksDone(done: unknown, tasks: any[]): string[] {
  if (!Array.isArray(done)) return [];
  const set = new Set(done.filter((x) => typeof x === 'string'));
  return tasks.filter((t) => set.has(t.id)).map((t) => t.id);
}
/** Envoi de fin de mission par un opérateur : refusé si la mission exige tout coché et que ce n'est pas le cas. */
function tasksBlockSubmit(contract: any, done: unknown): boolean {
  if (!contract || contract.tasks_required !== true || !Array.isArray(contract.tasks) || contract.tasks.length === 0) return false;
  return cleanTasksDone(done, contract.tasks).length !== contract.tasks.length;
}
// ===== END MISSIONS =====

// ===== BEGIN DEEP_LINK (adresse exacte d'une notification externe ; ce bloc est contrôlé par scripts/check-deep-link.ts) =====
interface DeepLink { go: string; tab?: string; filter?: string; nav?: string; space?: string; sfilter?: string; product?: string; thread?: string }
const DL_VIEW = /^[a-z][a-z-]{0,29}$/;
const DL_ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const DL_FIELDS: [keyof DeepLink, string][] = [["go", "go"], ["tab", "tab"], ["filter", "f"], ["nav", "nav"], ["space", "sp"], ["sfilter", "sf"], ["product", "pr"], ["thread", "th"]];
/** « /?go=<page>&nav=<élément>… » : l'appli ouvre la bonne page et fait clignoter l'élément. Pas de page valable = l'accueil. */
function deepLinkUrl(link: DeepLink): string {
  if (!link || typeof link.go !== "string" || !DL_VIEW.test(link.go)) return "/";
  const p = new URLSearchParams();
  for (const [k, q] of DL_FIELDS) { const v = (link as any)[k]; if (typeof v === "string" && (k === "go" ? DL_VIEW.test(v) : DL_ID.test(v))) p.set(q, v); }
  return `/?${p.toString()}`;
}
// ===== END DEEP_LINK =====
// ===== BEGIN PUSH (notifications : règles, chiffrement Web Push et signature VAPID ; ce bloc est contrôlé par scripts/check-push.ts) =====
// La partie « règles » est copiée de src/utils/pushRules.ts ; `npm run check:push` vérifie qu'elle donne les mêmes résultats que le site.
const isRealDate = isRealMissionDate;
const isRealTime = (s: unknown): boolean => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
type PushKind = 'start_ok' | 'end_ok' | 'refused' | 'due_24h' | 'due_1h' | 'late';
interface PushText { fr: { title: string; body: string }; en: { title: string; body: string } }
const pushCut = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/** Texte d'une notification (les deux langues : l'appareil choisit selon sa langue). `m.title` = titre de la mission. */
function pushText(kind: PushKind, m: { post_number?: number; title?: string; reason?: string; due?: string }): PushText {
  const n = Number.isFinite(m.post_number) ? `#${m.post_number} ` : '';
  const t = pushCut(m.title, 60) || '—';
  const label = `${n}${t}`.trim();
  const reason = pushCut(m.reason, 120);
  switch (kind) {
    case 'start_ok': return { fr: { title: 'Début validé', body: `${label} : tu peux commencer.` }, en: { title: 'Start approved', body: `${label}: you can start.` } };
    case 'end_ok': return { fr: { title: 'Mission validée', body: `${label} a été validée.` }, en: { title: 'Mission approved', body: `${label} was approved.` } };
    case 'refused': return { fr: { title: 'Mission refusée', body: reason ? `${label} : ${reason}` : `${label} a été refusée.` }, en: { title: 'Mission refused', body: reason ? `${label}: ${reason}` : `${label} was refused.` } };
    case 'due_24h': return { fr: { title: 'Échéance dans moins de 24 h', body: `${label} est à rendre ${pushCut(m.due, 20)}.` }, en: { title: 'Due within 24 h', body: `${label} is due ${pushCut(m.due, 20)}.` } };
    case 'due_1h': return { fr: { title: 'Échéance dans moins d\'1 h', body: `${label} est à rendre ${pushCut(m.due, 20)}.` }, en: { title: 'Due within 1 h', body: `${label} is due ${pushCut(m.due, 20)}.` } };
    case 'late': return { fr: { title: 'Mission en retard', body: `${label} devait être rendue ${pushCut(m.due, 20)}.` }, en: { title: 'Mission late', body: `${label} was due ${pushCut(m.due, 20)}.` } };
  }
}

/** Moment limite en millisecondes : la date + l'heure (23:59 s'il n'y a pas d'heure), à l'heure de Madagascar (UTC+3). NaN si la date est fausse. */
function dueAtMs(due_date: unknown, due_time?: unknown): number {
  if (!isRealDate(due_date)) return NaN;
  const t = isRealTime(due_time) ? due_time : '23:59';
  return Date.parse(`${due_date}T${t}:00+03:00`);
}

interface ReminderContract { id: string; post_number: number; client_name: string; no_account?: boolean; due_date?: string; due_time?: string; initial_score: number; target_score: number; current_score?: number }
interface ReminderPost { employee_id: string; status: string; post_number?: number; client_name: string }
interface Reminder { key: string; kind: 'due_24h' | 'due_1h' | 'late'; contract_id: string; post_number: number; title: string; due: string; user_ids: string[]; admins: boolean }

const LATE_WINDOW_MS = 3 * 24 * 3600 * 1000; // un retard plus vieux que 3 jours n'est plus signalé (évite une avalanche au premier passage)

/**
 * Rappels à envoyer maintenant. Règles :
 *  - « dans moins de 24 h » (et plus d'1 h) et « dans moins d'1 h » (seulement si la mission a une heure) : prévient l'opérateur qui a une session ouverte sur la mission ;
 *  - « en retard » (jusqu'à 3 jours de retard) : l'opérateur et les responsables ;
 *  - une mission terminée, sans titre ou « sans compte » ne déclenche rien ;
 *  - la clé identifie rappel + échéance : changer la date limite remet le rappel à zéro.
 */
function dueReminders(contracts: ReminderContract[], posts: ReminderPost[], nowMs: number): Reminder[] {
  if (!Number.isFinite(nowMs)) return [];
  const out: Reminder[] = [];
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (!c || c.no_account || !String(c.client_name || '').trim()) continue;
    const at = dueAtMs(c.due_date, c.due_time);
    if (!Number.isFinite(at)) continue;
    if (c.target_score > c.initial_score && (c.current_score ?? c.initial_score) >= c.target_score) continue;
    const left = at - nowMs;
    let kind: Reminder['kind'] | null = null;
    if (left < 0) kind = -left <= LATE_WINDOW_MS ? 'late' : null;
    else if (isRealTime(c.due_time) && left <= 3600 * 1000) kind = 'due_1h';
    else if (left <= 24 * 3600 * 1000 && left > 3600 * 1000) kind = 'due_24h';
    else if (left <= 24 * 3600 * 1000 && !isRealTime(c.due_time)) kind = 'due_24h';
    if (!kind) continue;
    const users = [...new Set((Array.isArray(posts) ? posts : []).filter(p => p && (p.status === 'active' || p.status === 'pending_start') && (p.post_number === c.post_number || (!!c.client_name && p.client_name === c.client_name))).map(p => String(p.employee_id)))];
    const admins = kind === 'late';
    if (!users.length && !admins) continue;
    out.push({ key: `${c.id}:${kind}:${c.due_date}:${c.due_time || ''}`, kind, contract_id: c.id, post_number: c.post_number, title: String(c.client_name).trim(), due: `${(c.due_date as string).split('-').reverse().join('/')}${c.due_time ? ' ' + c.due_time : ''}`, user_ids: users, admins });
  }
  return out;
}

const B64U = /^[A-Za-z0-9_-]+$/;
/** Abonnement envoyé par un téléphone : adresse https, deux clés base64url de la bonne taille. Rend null si quelque chose est faux. */
function cleanPushSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof r.endpoint === 'string' ? r.endpoint.trim() : '';
  if (endpoint.length < 20 || endpoint.length > 600 || !/^https:\/\/[^\s/]+\/\S*$/.test(endpoint)) return null;
  const k = r.keys && typeof r.keys === 'object' ? r.keys : null;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  if (!B64U.test(k.p256dh) || k.p256dh.length !== 87 || !B64U.test(k.auth) || k.auth.length < 20 || k.auth.length > 24) return null;
  return { endpoint, p256dh: k.p256dh, auth: k.auth };
}

// ---- Chiffrement Web Push (RFC 8291, aes128gcm) et signature VAPID (RFC 8292) : WebCrypto, aucune dépendance ----
const b64uEnc = (b: Uint8Array): string => Buffer.from(b).toString('base64url');
const b64uDec = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64url'));
const pushHmac = (key: Uint8Array, data: Uint8Array): Uint8Array => new Uint8Array(createHmac('sha256', key).update(data).digest());
const hkdfExpand = (prk: Uint8Array, info: Uint8Array, len: number): Uint8Array => pushHmac(prk, new Uint8Array([...info, 1])).slice(0, len);
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const concatBytes = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

/** Corps chiffré d'une notification. `fixed` : valeurs imposées (seulement pour le contrôle avec l'exemple du standard). */
async function encryptPush(uaPublic: Uint8Array, authSecret: Uint8Array, plaintext: Uint8Array, fixed?: { asPrivate: Uint8Array; asPublic: Uint8Array; salt: Uint8Array }): Promise<Uint8Array> {
  const S = crypto.subtle;
  let priv: CryptoKey, asPublic: Uint8Array;
  if (fixed) {
    asPublic = fixed.asPublic;
    priv = await S.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64uEnc(asPublic.slice(1, 33)), y: b64uEnc(asPublic.slice(33, 65)), d: b64uEnc(fixed.asPrivate) }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const kp = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    priv = kp.privateKey;
    asPublic = new Uint8Array(await S.exportKey('raw', kp.publicKey));
  }
  const uaKey = await S.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: uaKey }, priv, 256));
  const ikm = hkdfExpand(pushHmac(authSecret, secret), concatBytes(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));
  const prk = pushHmac(salt, ikm);
  const cek = hkdfExpand(prk, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, utf8('Content-Encoding: nonce\0'), 12);
  const aes = await S.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concatBytes(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** Paire de clés VAPID (publique 65 octets, privée 32 octets, en base64url). */
async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk: any = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64uEnc(concatBytes(new Uint8Array([4]), b64uDec(jwk.x), b64uDec(jwk.y))), privateKey: jwk.d };
}

/** En-tête « Authorization » VAPID pour une adresse de service push. */
async function vapidHeader(endpoint: string, subject: string, publicKey: string, privateKey: string, nowSec: number): Promise<string> {
  const pub = b64uDec(publicKey);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64uEnc(pub.slice(1, 33)), y: b64uEnc(pub.slice(33, 65)), d: privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uEnc(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEnc(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64uEnc(sig)}, k=${publicKey}`;
}
// ===== END PUSH =====
// ===== BEGIN NOTIFY (notifications externes, partie 2a : textes, catégories ; ce bloc est contrôlé par scripts/check-push-events.ts) =====
type NotifyKind = "val_start" | "val_end" | "advance_new" | "advance_ok" | "advance_no" | "signup" | "reset" | "profile" | "security" | "message" | "access";
const PUSH_CATS = ["missions", "validations", "advances", "security", "messages"] as const;
type PushCat = typeof PUSH_CATS[number];
const ncut = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function notifyCat(kind: NotifyKind): PushCat {
  if (kind === "advance_ok" || kind === "advance_no") return "advances";
  if (kind === "security") return "security";
  if (kind === "message") return "messages";
  return "validations";
}
/** Texte d'un push (les deux langues). Jamais de montant ni de contenu de message : un push s'affiche sur l'écran verrouillé. */
function notifyText(kind: NotifyKind, m: { name?: string; client?: string; reason?: string; group?: boolean }): PushText {
  const name = ncut(m.name, 60) || "—";
  const client = ncut(m.client, 60);
  const who = client ? `${name} · ${client}` : name;
  switch (kind) {
    case "val_start": return { fr: { title: "Début à valider", body: who }, en: { title: "Start to approve", body: who } };
    case "val_end": return { fr: { title: "Fin à valider", body: who }, en: { title: "End to approve", body: who } };
    case "advance_new": return { fr: { title: "Avance à valider", body: name }, en: { title: "Advance to approve", body: name } };
    case "advance_ok": return { fr: { title: "Avance acceptée", body: "Ta demande d'avance a été acceptée." }, en: { title: "Advance approved", body: "Your advance request was approved." } };
    case "advance_no": { const r = ncut(m.reason, 100); return { fr: { title: "Avance refusée", body: r ? `Motif : ${r}` : "Ta demande d'avance a été refusée." }, en: { title: "Advance refused", body: r ? `Reason: ${r}` : "Your advance request was refused." } }; }
    case "signup": return { fr: { title: "Inscription à valider", body: name }, en: { title: "Sign-up to approve", body: name } };
    case "reset": return { fr: { title: "Mot de passe oublié (urgent)", body: name }, en: { title: "Forgotten password (urgent)", body: name } };
    case "access": return { fr: { title: "Connexion hors horaires à valider", body: name }, en: { title: "Out-of-hours login to approve", body: name } };
    case "profile": return { fr: { title: "Changement de profil à valider", body: name }, en: { title: "Profile change to approve", body: name } };
    case "security": return { fr: { title: "Alerte de sécurité", body: name }, en: { title: "Security alert", body: name } };
    case "message": { const t = m.group ? `${name} · groupe` : name; const te = m.group ? `${name} · group` : name; return { fr: { title: t, body: "Nouveau message" }, en: { title: te, body: "New message" } }; }
  }
}
/** Les catégories coupées sur un appareil : seulement des catégories connues, sans doublon. */
function cleanPushOff(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = PUSH_CATS as readonly string[];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && known.includes(x)))];
}
// ===== END NOTIFY =====

// ===== BEGIN SUPPLIERS (fournisseurs, bons de commande et budgets : réservé à l'administrateur ; ce bloc est contrôlé par scripts/check-purchasing-server.ts) =====
const PUR_MAX_LEAD = 365;
const PUR_MAX_LINES = 50;
const PUR_MAX_BUDGETS = 30;
const PUR_BAD_KEYS = ["__proto__", "constructor", "prototype"];
const purNone = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
// Un nombre ou un texte non vide : jamais un tableau, un booléen ou un objet (Number([5]) vaudrait 5, Number(true) vaudrait 1).
const purNumIn = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "");
const purNum = (v: unknown): number => (typeof v === "number" ? v : Number(String(v).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")));

/** Vérifie et nettoie une fiche fournisseur envoyée par l'admin. */
function cleanSupplier(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== "object" || typeof rec.id !== "string" || !rec.id || rec.id.length > 80) return { ok: false, reason: "id" };
  const name = String(rec.name ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, reason: "name" };
  let lead: number | undefined;
  if (!purNone(rec.lead_days)) {
    if (!purNumIn(rec.lead_days)) return { ok: false, reason: "lead" };
    const n = purNum(rec.lead_days);
    if (!Number.isFinite(n) || n < 0 || n > PUR_MAX_LEAD) return { ok: false, reason: "lead" };
    lead = Math.round(n);
  }
  return {
    ok: true,
    save: {
      id: rec.id, name, contact: String(rec.contact ?? "").trim().slice(0, 120), ...(lead !== undefined ? { lead_days: lead } : {}), note: String(rec.note ?? "").trim().slice(0, 500),
      active: rec.active === false ? false : true,
      created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now,
    },
  };
}

/**
 * Vérifie et nettoie un bon de commande. États : Brouillon → Commandé → Reçu, ou Annulé (jamais de retour en arrière).
 * Une fois commandé, le fournisseur, la date, les produits et les quantités sont figés ; seule la quantité reçue avance (jamais en arrière),
 * et le prix d'une ligne peut encore changer tant que rien n'en a été reçu. « Reçu » = tout reçu, jamais autrement. Reçu et Annulé sont définitifs (la note seule reste modifiable).
 * L'existence du fournisseur et des produits est contrôlée dans sync.
 */
function cleanPurchase(rec: any, existing: any, meId: string, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== "object" || typeof rec.id !== "string" || !rec.id || rec.id.length > 80) return { ok: false, reason: "id" };
  const ref = typeof rec.ref === "string" && /^BC-\d{1,9}$/.test(rec.ref) ? rec.ref : null;
  if (!ref || (existing && existing.ref !== ref)) return { ok: false, reason: "ref" };
  const supplier = typeof rec.supplier_id === "string" ? rec.supplier_id : "";
  if (!supplier || supplier.length > 80) return { ok: false, reason: "supplier" };
  const date = stockDate(rec.date);
  if (!date) return { ok: false, reason: "date" };
  let expected: string | undefined;
  if (!purNone(rec.expected_date)) {
    const e = stockDate(rec.expected_date);
    if (!e || e < date) return { ok: false, reason: "expected" };
    expected = e;
  }
  const status = ["draft", "ordered", "received", "cancelled"].includes(rec.status) ? (rec.status as string) : null;
  if (!status) return { ok: false, reason: "status" };
  if (!Array.isArray(rec.lines) || rec.lines.length < 1 || rec.lines.length > PUR_MAX_LINES) return { ok: false, reason: "lines" };
  const seen = new Set<string>();
  const lines: { product_id: string; qty: number; unit_cost_ar: number; received_qty: number }[] = [];
  for (const l of rec.lines) {
    const pid = typeof l?.product_id === "string" ? l.product_id : "";
    if (!pid || pid.length > 80) return { ok: false, reason: "product" };
    if (seen.has(pid)) return { ok: false, reason: "duplicate" };
    seen.add(pid);
    if (!purNumIn(l.qty)) return { ok: false, reason: "qty" };
    const qty = round2s(purNum(l.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > STOCK_MAX_QTY) return { ok: false, reason: "qty" };
    const cost = purNone(l.unit_cost_ar) ? 0 : purNumIn(l.unit_cost_ar) ? purNum(l.unit_cost_ar) : NaN;
    if (!Number.isFinite(cost) || cost < 0 || cost > STOCK_MAX_MONEY) return { ok: false, reason: "cost" };
    const got = purNone(l.received_qty) ? 0 : purNumIn(l.received_qty) ? round2s(purNum(l.received_qty)) : NaN;
    if (!Number.isFinite(got) || got < 0 || got > qty) return { ok: false, reason: "received" };
    lines.push({ product_id: pid, qty, unit_cost_ar: Math.round(cost), received_qty: got });
  }
  const allReceived = lines.every((l) => l.received_qty === l.qty);
  const anyReceived = lines.some((l) => l.received_qty > 0);
  const note = String(rec.note ?? "").slice(0, 300);
  if (status === "received" && !allReceived) return { ok: false, reason: "status" };
  if (!existing) {
    if (status !== "draft" && status !== "ordered") return { ok: false, reason: "status" };
    if (anyReceived) return { ok: false, reason: "received" };
  } else if (existing.status === "received" || existing.status === "cancelled") {
    // Définitif : seule la note peut changer.
    const same = status === existing.status && supplier === existing.supplier_id && date === existing.date && (expected || "") === (existing.expected_date || "") &&
      JSON.stringify(lines) === JSON.stringify((existing.lines || []).map((l: any) => ({ product_id: l.product_id, qty: l.qty, unit_cost_ar: l.unit_cost_ar, received_qty: l.received_qty })));
    if (!same) return { ok: false, reason: "final" };
  } else if (existing.status === "draft") {
    if (status !== "draft" && status !== "ordered" && status !== "cancelled") return { ok: false, reason: "status" };
    if (anyReceived) return { ok: false, reason: "received" };
  } else {
    // Commandé : tout est figé sauf la quantité reçue (qui n'avance que), la livraison prévue et le prix des lignes pas encore reçues.
    if (supplier !== existing.supplier_id || date !== existing.date) return { ok: false, reason: "frozen" };
    const old: any[] = existing.lines || [];
    if (old.length !== lines.length) return { ok: false, reason: "frozen" };
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].product_id !== old[i].product_id || lines[i].qty !== old[i].qty) return { ok: false, reason: "frozen" };
      if (lines[i].received_qty < old[i].received_qty) return { ok: false, reason: "received" };
      if (old[i].received_qty > 0 && lines[i].unit_cost_ar !== old[i].unit_cost_ar) return { ok: false, reason: "frozen" };
    }
    if (status === "cancelled") { if (anyReceived) return { ok: false, reason: "received" }; }
    else if (status === "draft") return { ok: false, reason: "status" };
    else if (allReceived ? status !== "received" : status !== "ordered") return { ok: false, reason: "status" };
  }
  const base = { id: rec.id, ref, supplier_id: supplier, date, ...(expected ? { expected_date: expected } : {}), status, lines, note };
  return { ok: true, save: { ...base, created_by: existing?.created_by || meId, created_at: existing?.created_at || now, updated_at: now } };
}

/** Budgets mensuels par catégorie (Ar). Une valeur vide ou 0 retire le plafond. Si quelque chose est faux, on garde l'existant. */
function cleanBudgets(input: any, fallback: any): Record<string, number> {
  const keep = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return keep;
  const entries = Object.entries(input);
  if (entries.length > PUR_MAX_BUDGETS) return keep;
  const out: Record<string, number> = {};
  for (const [k, v] of entries) {
    const cat = String(k).trim().slice(0, 40);
    if (!cat || PUR_BAD_KEYS.includes(cat)) return keep;
    if (purNone(v)) continue;
    if (!purNumIn(v)) return keep;
    const n = purNum(v);
    if (!Number.isFinite(n) || n < 0 || n > STOCK_MAX_MONEY) return keep;
    if (Math.round(n) > 0) out[cat] = Math.round(n);
  }
  return out;
}
/** Réglages écrits par l'admin : les budgets sont revérifiés ; absents (ancien site) = l'existant est gardé. */
function applyBudgets(saved: any, rec: any, existing: any): any {
  const out = { ...saved };
  const b = rec && rec.budgets === undefined ? existing?.budgets : cleanBudgets(rec?.budgets, existing?.budgets);
  if (b && Object.keys(b).length) out.budgets = b; else delete out.budgets;
  return out;
}
// ===== END SUPPLIERS =====

// ===== BEGIN HEALTH_ACKS (marques « Ignorer / Vérifié » de la Santé du site, partagées entre appareils : le serveur revérifie tout ; ce bloc est contrôlé par scripts/check-health-acks-shared.ts et copie src/utils/health/acks.ts + registry.ts) =====
const HEALTH_ACK_MAX = 300;
function cleanHealthAck(a: any): any | null {
  if (!a || typeof a.id !== "string" || !/^[a-z]+:[a-z0-9_-]+(:[a-z0-9_-]+)?$/.test(a.id)) return null;
  if (a.status !== "ignored" && a.status !== "checked") return null;
  if (!["info", "watch", "urgent"].includes(a.severity_at)) return null;
  if (typeof a.at !== "string" || Number.isNaN(Date.parse(a.at))) return null;
  if (a.until !== undefined && a.until !== null && !(typeof a.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.until))) return null;
  if (a.value_at !== undefined && !(typeof a.value_at === "number" && Number.isFinite(a.value_at))) return null;
  return { id: a.id, status: a.status, reason: String(a.reason || "").trim().slice(0, 200), at: a.at, ...(a.until ? { until: a.until } : {}), severity_at: a.severity_at, ...(a.value_at !== undefined ? { value_at: a.value_at } : {}) };
}
function cleanHealthAckList(raw: any): any[] | null {
  if (!Array.isArray(raw)) return null;
  const byId = new Map<string, any>();
  for (const x of raw) { const c = cleanHealthAck(x); if (!c) continue; const o = byId.get(c.id); if (!o || o.at <= c.at) byId.set(c.id, c); }
  return [...byId.values()].sort((p, q) => p.at.localeCompare(q.at)).slice(-HEALTH_ACK_MAX);
}
/** Réglages écrits par l'admin : les marques sont revérifiées ; absentes ou pas une liste (ancien site) = l'existant est gardé. */
function applyHealthAcks(saved: any, rec: any, existing: any): any {
  const out = { ...saved };
  const sent = rec ? cleanHealthAckList(rec.health_acks) : null;
  const list = sent !== null ? sent : cleanHealthAckList(existing && existing.health_acks);
  if (list) out.health_acks = list; else delete out.health_acks; // une liste vide est gardée : elle dit « tout a été remis », les autres appareils la suivent
  return out;
}
// ===== END HEALTH_ACKS =====
// ===== BEGIN STOCK_CATEGORIES (liste des catégories du Stockage : admin seulement ; ce bloc est contrôlé par scripts/check-stock-categories.ts) =====
function cleanStockCategories(raw: any): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const name = x.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key); out.push(name);
    if (out.length >= 30) break;
  }
  return out;
}
/** Réglages écrits par l'admin : la liste est revérifiée ; absente ou pas une liste (ancien site) = l'existant est gardé. */
function applyStockCategories(saved: any, rec: any, existing: any): any {
  const out = { ...saved };
  const sent = rec ? cleanStockCategories(rec.stock_categories) : null;
  const list = sent !== null ? sent : cleanStockCategories(existing && existing.stock_categories);
  if (list) out.stock_categories = list; else delete out.stock_categories; // une liste vide est gardée : elle dit « aucune catégorie »
  return out;
}
// ===== END STOCK_CATEGORIES =====
// ===== BEGIN STOCK_SPACES (les stockages : admin seulement ; ce bloc est contrôlé par scripts/check-stock-spaces.ts) =====
function cleanStockSpaces(raw: any): { id: string; name: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const names = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || typeof x.name !== "string") continue;
    if (!/^[a-z0-9_-]{1,32}$/.test(x.id) || ids.has(x.id)) continue;
    const name = x.name.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!name || names.has(key)) continue;
    ids.add(x.id); names.add(key); out.push({ id: x.id, name });
    if (out.length >= 10) break;
  }
  return out.length ? out : null;
}
/** Réglages écrits par l'admin : la liste est revérifiée ; absente, vide ou pas une liste (ancien site) = l'existant est gardé. */
function applyStockSpaces(saved: any, rec: any, existing: any): any {
  const out = { ...saved };
  const sent = rec ? cleanStockSpaces(rec.stock_spaces) : null;
  const list = sent !== null ? sent : cleanStockSpaces(existing && existing.stock_spaces);
  if (list) out.stock_spaces = list; else delete out.stock_spaces;
  return out;
}
// ===== END STOCK_SPACES =====

// ===== BEGIN PERFORMANCE (réglages de la performance des salariés : le serveur revérifie tout ; ce bloc est contrôlé par scripts/check-performance-config.ts et copie src/utils/performanceScore.ts) =====
interface PerformanceConfig {
  window_days: number; // fenêtre du score
  score_min_missions: number; // missions jugées (validées + refusées) minimum pour afficher un score
  quality_min_missions: number; // idem pour le badge Qualité, le rendement et l'employé du mois
  weights: { quality: number; volume: number; punctuality: number; regularity: number };
  quality_levels: [number, number, number]; // % de missions validées : Bronze, Argent, Or
  punctuality_levels: [number, number, number]; // % de jours sans retard
  streak_levels: [number, number, number]; // jours de travail d'affilée
  rendement_levels: [number, number, number]; // % de missions par heure au-dessus de l'équipe
  versatility_levels: [number, number, number]; // types de mission différents
  rookie_missions: number; // « Recrue prometteuse » : nombre de premières missions
  rookie_days: number; // …et première mission il y a moins de N jours
  month_min_team: number; // « Employé du mois » : salariés actifs minimum
  min_duration_min: number; // durée plus courte = absurde, ignorée
  max_duration_min: number; // durée plus longue = absurde, ignorée
  default_work_days: number; // jours travaillés par semaine si les Conditions ne le disent pas
}

const PERFORMANCE_DEFAULTS: PerformanceConfig = {
  window_days: 30, score_min_missions: 10, quality_min_missions: 20,
  weights: { quality: 40, volume: 25, punctuality: 20, regularity: 15 },
  quality_levels: [90, 95, 98], punctuality_levels: [90, 95, 100], streak_levels: [5, 10, 20],
  rendement_levels: [10, 25, 40], versatility_levels: [2, 3, 5],
  rookie_missions: 10, rookie_days: 90, month_min_team: 5,
  min_duration_min: 2, max_duration_min: 960, default_work_days: 6,
};

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const intIn = (v: unknown, lo: number, hi: number, d: number) => (isNum(v) && v >= lo && v <= hi ? Math.round(v) : d);
function levelsIn(v: unknown, lo: number, hi: number, d: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(x => isNum(x) && x >= lo && x <= hi)) return d;
  const a = v.map(x => Math.round((x as number) * 10) / 10) as [number, number, number];
  return a[0] < a[1] && a[1] < a[2] ? a : d; // les niveaux doivent monter : sinon on garde ceux de départ
}

/** Réglages reçus (du serveur ou du navigateur) → réglages sûrs : toute valeur invalide retombe sur celle de départ. */
function cleanPerformanceConfig(raw: unknown): PerformanceConfig {
  const d = PERFORMANCE_DEFAULTS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const w = (r.weights && typeof r.weights === 'object' ? r.weights : {}) as Record<string, unknown>;
  const weights = {
    quality: intIn(w.quality, 0, 100, d.weights.quality), volume: intIn(w.volume, 0, 100, d.weights.volume),
    punctuality: intIn(w.punctuality, 0, 100, d.weights.punctuality), regularity: intIn(w.regularity, 0, 100, d.weights.regularity),
  };
  const sum = weights.quality + weights.volume + weights.punctuality + weights.regularity;
  return {
    window_days: intIn(r.window_days, 7, 90, d.window_days),
    score_min_missions: intIn(r.score_min_missions, 1, 200, d.score_min_missions),
    quality_min_missions: intIn(r.quality_min_missions, 1, 500, d.quality_min_missions),
    weights: sum > 0 ? weights : d.weights, // des poids tous à zéro n'ont aucun sens
    quality_levels: levelsIn(r.quality_levels, 1, 100, d.quality_levels),
    punctuality_levels: levelsIn(r.punctuality_levels, 1, 100, d.punctuality_levels),
    streak_levels: levelsIn(r.streak_levels, 1, 365, d.streak_levels),
    rendement_levels: levelsIn(r.rendement_levels, 1, 500, d.rendement_levels),
    versatility_levels: levelsIn(r.versatility_levels, 1, 50, d.versatility_levels),
    rookie_missions: intIn(r.rookie_missions, 3, 100, d.rookie_missions),
    rookie_days: intIn(r.rookie_days, 7, 365, d.rookie_days),
    month_min_team: intIn(r.month_min_team, 2, 100, d.month_min_team),
    min_duration_min: intIn(r.min_duration_min, 0, 60, d.min_duration_min),
    max_duration_min: intIn(r.max_duration_min, 60, 1440, d.max_duration_min),
    default_work_days: intIn(r.default_work_days, 1, 7, d.default_work_days),
  };
}

/** Réglages écrits par l'admin : `performance` est revérifié champ par champ (valeur invalide = valeur de départ). Aucun réglage envoyé ni existant = rien n'est écrit. */
function applyPerformance(saved: any, rec: any, existing: any): any {
  const sent = rec && rec.performance !== undefined ? rec.performance : existing && existing.performance;
  if (sent === undefined) return saved;
  return { ...saved, performance: cleanPerformanceConfig(sent) };
}
// ===== END PERFORMANCE =====

// ===== BEGIN RECURRING (missions récurrentes, M15.1 : copie exacte de src/utils/recurring.ts ; ce bloc est contrôlé par scripts/check-recurring.ts) =====
type ProofMode = 'type' | 'none' | 'photo' | 'note' | 'both';
type Frequency = 'daily' | 'weekly' | 'monthly';
type Priority = 'Normale' | 'Haute' | 'Urgente';

interface RecurringRule {
  id: string; name: string; title: string; post_type?: string; description?: string; proof_mode: ProofMode;
  objective: number; client_id?: string; priority: Priority; due_after_days?: number; due_time?: string;
  frequency: Frequency; weekdays: number[]; month_day: number; time: string; start_date: string; end_date?: string; active: boolean;
}

const RECURRING_LIMITS = { max: 20, id: 40, name: 60, title: 80, type: 40, description: 500, objective: 1000000, dueAfter: 30 };
const RECURRING_GRACE_MS = 2 * 60 * 60 * 1000; // une occurrence se crée dans les 2 h qui suivent l'heure prévue
const MADAGASCAR_OFFSET_H = 3;

const RC_PROOFS = ['type', 'none', 'photo', 'note', 'both'];
const RC_PRIORITIES = ['Normale', 'Haute', 'Urgente'];
const RC_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const RC_BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const rcClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

const rcIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const rcIsTime = (s: unknown): boolean => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

type RecurringError = 'name' | 'title' | 'duplicate' | 'limit' | 'proof' | 'priority' | 'objective' | 'due' | 'frequency' | 'weekdays' | 'month_day' | 'time' | 'start' | 'end' | 'format';
interface RecurringDraft { [k: string]: unknown }

/** Vérifie une règle saisie. `others` = les autres règles (deux noms identiques refusés, 20 au plus). */
function checkRecurring(d: RecurringDraft, others: RecurringRule[]): { ok: true; value: RecurringRule } | { ok: false; error: RecurringError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => RC_BAD_KEYS.includes(k))) return { ok: false, error: 'format' };
  for (const k of ['id', 'name', 'title', 'post_type', 'description', 'client_id', 'due_time', 'time', 'start_date', 'end_date']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const name = rcClean(d.name ?? '', RECURRING_LIMITS.name);
  if (!name) return { ok: false, error: 'name' };
  const title = rcClean(d.title ?? '', RECURRING_LIMITS.title);
  if (!title) return { ok: false, error: 'title' };
  const id = rcClean(d.id ?? '', RECURRING_LIMITS.id);
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'format' };
  if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' };
  if (!id && others.length >= RECURRING_LIMITS.max) return { ok: false, error: 'limit' };
  const proof = d.proof_mode === undefined || d.proof_mode === null || d.proof_mode === '' ? 'type' : d.proof_mode;
  if (typeof proof !== 'string' || !RC_PROOFS.includes(proof)) return { ok: false, error: 'proof' };
  const prio = d.priority === undefined || d.priority === null || d.priority === '' ? 'Normale' : d.priority;
  if (typeof prio !== 'string' || !RC_PRIORITIES.includes(prio)) return { ok: false, error: 'priority' };
  const obj = d.objective === undefined || d.objective === null || d.objective === '' ? 0 : d.objective;
  if (typeof obj !== 'number' || !Number.isFinite(obj) || obj < 0 || obj > RECURRING_LIMITS.objective) return { ok: false, error: 'objective' };
  const hasDue = d.due_after_days !== undefined && d.due_after_days !== null && d.due_after_days !== '';
  const dueDays = d.due_after_days as unknown;
  if (hasDue && (typeof dueDays !== 'number' || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > RECURRING_LIMITS.dueAfter)) return { ok: false, error: 'due' };
  const dueTime = d.due_time === undefined || d.due_time === null ? '' : d.due_time;
  if (dueTime !== '' && (!rcIsTime(dueTime) || !hasDue)) return { ok: false, error: 'due' };
  const freq = d.frequency;
  if (typeof freq !== 'string' || !RC_FREQUENCIES.includes(freq)) return { ok: false, error: 'frequency' };
  let weekdays: number[] = [];
  if (freq === 'weekly') {
    const w = d.weekdays;
    if (!Array.isArray(w) || w.length < 1 || w.length > 7 || w.some((x) => typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > 7)) return { ok: false, error: 'weekdays' };
    weekdays = Array.from(new Set(w as number[])).sort((a, b) => a - b);
  }
  let monthDay = 1;
  if (freq === 'monthly') {
    const m = d.month_day;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 31) return { ok: false, error: 'month_day' };
    monthDay = m;
  }
  if (!rcIsTime(d.time)) return { ok: false, error: 'time' };
  if (!rcIsDate(d.start_date)) return { ok: false, error: 'start' };
  const end = d.end_date === undefined || d.end_date === null ? '' : d.end_date;
  if (end !== '' && (!rcIsDate(end) || (end as string) < (d.start_date as string))) return { ok: false, error: 'end' };
  if (d.active !== undefined && typeof d.active !== 'boolean') return { ok: false, error: 'format' };
  const value: RecurringRule = {
    id, name, title, proof_mode: proof as ProofMode, objective: Math.round(obj), priority: prio as Priority,
    frequency: freq as Frequency, weekdays, month_day: monthDay, time: d.time as string, start_date: d.start_date as string, active: d.active !== false,
  };
  const type = rcClean(d.post_type ?? '', RECURRING_LIMITS.type); if (type) value.post_type = type;
  const desc = rcClean(d.description ?? '', RECURRING_LIMITS.description); if (desc) value.description = desc;
  const cid = rcClean(d.client_id ?? '', RECURRING_LIMITS.id); if (cid) value.client_id = cid;
  if (hasDue) { value.due_after_days = dueDays as number; if (dueTime !== '') value.due_time = dueTime as string; }
  if (end !== '') value.end_date = end as string;
  return { ok: true, value };
}

/** Nettoie une liste reçue (réglages) : les règles fausses sont ignorées, jamais d'erreur. */
function cleanRecurring(list: unknown): RecurringRule[] {
  if (!Array.isArray(list)) return [];
  const out: RecurringRule[] = [];
  for (const raw of list) {
    if (out.length >= RECURRING_LIMITS.max) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as RecurringDraft).id;
    if (typeof id !== 'string' || !id) continue;
    const v = checkRecurring(raw as RecurringDraft, out.filter((o) => o.id !== id));
    if (v.ok && !out.some((o) => o.id === v.value.id)) out.push(v.value);
  }
  return out;
}

const rcDaysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const rcWeekday = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };
const rcAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Vrai si la règle tombe ce jour-là (date AAAA-MM-JJ) : dans ses dates et selon sa fréquence. L'état « actif » n'est pas regardé ici. */
function runsOn(rule: RecurringRule, ymd: string): boolean {
  if (!rcIsDate(ymd) || ymd < rule.start_date || (rule.end_date && ymd > rule.end_date)) return false;
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekly') return rule.weekdays.includes(rcWeekday(ymd));
  const [y, m, d] = ymd.split('-').map(Number);
  return d === Math.min(rule.month_day, rcDaysIn(y, m)); // le 31 tombe le dernier jour des mois plus courts
}

/** Heure prévue (en millisecondes UTC) pour un jour et une heure de Madagascar. */
const scheduledMs = (ymd: string, time: string): number => {
  const [y, m, d] = ymd.split('-').map(Number); const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh - MADAGASCAR_OFFSET_H, mm);
};
/** Date du jour à Madagascar. */
const madagascarDate = (nowMs: number): string => new Date(nowMs + MADAGASCAR_OFFSET_H * 3600000).toISOString().slice(0, 10);

/** Identifiant de la mission créée : toujours le même pour une règle et un jour. C'est ce qui empêche les doublons. */
const occurrenceId = (ruleId: string, ymd: string): string => `rec-${ruleId}-${ymd.replace(/-/g, '')}`;

interface Occurrence { rule: RecurringRule; date: string; id: string; at: number }

/** Les missions à créer maintenant : règle active, jour concerné, heure prévue passée depuis moins de 2 h. */
function dueOccurrences(rules: RecurringRule[], nowMs: number, graceMs: number = RECURRING_GRACE_MS): Occurrence[] {
  const today = madagascarDate(nowMs);
  const days = [rcAddDays(today, -1), today];
  const out: Occurrence[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of days) {
      if (!runsOn(rule, date)) continue;
      const at = scheduledMs(date, rule.time);
      if (nowMs >= at && nowMs < at + graceMs) out.push({ rule, date, id: occurrenceId(rule.id, date), at });
    }
  }
  return out;
}

/** La mission à enregistrer (même forme qu'une mission créée à la main). `postNumber` = numéro libre, `rewardAr` = prix par défaut des réglages. */
function buildContract(rule: RecurringRule, ymd: string, postNumber: number, rewardAr: number): Record<string, unknown> {
  const c: Record<string, unknown> = {
    id: occurrenceId(rule.id, ymd), post_number: postNumber, client_name: rule.title, account_tag: `ACC-${postNumber}`, game_mode: '',
    description: rule.description || '', post_type: rule.post_type || '', proof_mode: rule.proof_mode,
    current_rank: '—', target_rank: '—', initial_score: 0, target_score: rule.objective, recommended_shift: 'any',
    estimated_reward_ar: Math.round(rewardAr || 0), priority: rule.priority, region_server: '—', no_account: false,
    recurring_rule_id: rule.id, recurring_date: ymd,
  };
  if (rule.client_id) c.client_id = rule.client_id;
  if (rule.due_after_days !== undefined) { c.due_date = rcAddDays(ymd, rule.due_after_days); if (rule.due_time) c.due_time = rule.due_time; }
  return c;
}

/** Prochaine exécution après `nowMs` (millisecondes UTC), ou null (règle arrêtée, finie ou sans jour). */
function nextRun(rule: RecurringRule, nowMs: number): number | null {
  if (!rule.active) return null;
  let day = madagascarDate(nowMs);
  for (let i = 0; i < 400; i++, day = rcAddDays(day, 1)) {
    if (!runsOn(rule, day)) continue;
    const at = scheduledMs(day, rule.time);
    if (at > nowMs) return at;
  }
  return null;
}

const RC_DAYS_FR = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const RC_DAYS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Phrase courte : « Chaque jour à 08:00 », « Chaque lundi, jeudi à 08:00 », « Le 15 de chaque mois à 08:00 ». */
function describeRule(rule: RecurringRule, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  if (rule.frequency === 'daily') return fr ? `Chaque jour à ${rule.time}` : `Every day at ${rule.time}`;
  if (rule.frequency === 'weekly') return fr ? `Chaque ${rule.weekdays.map((d) => RC_DAYS_FR[d]).join(', ')} à ${rule.time}` : `Every ${rule.weekdays.map((d) => RC_DAYS_EN[d]).join(', ')} at ${rule.time}`;
  return fr ? `Le ${rule.month_day}${rule.month_day === 1 ? 'er' : ''} de chaque mois à ${rule.time}` : `On day ${rule.month_day} of each month at ${rule.time}`;
}

const RECURRING_MESSAGE: Record<RecurringError, string> = {
  name: 'Donne un nom à la règle.', title: 'Donne un titre à la mission.', duplicate: 'Une règle porte déjà ce nom.', limit: 'Maximum 20 règles.',
  proof: 'Justificatif non valide.', priority: 'Priorité non valide.', objective: 'Quantité à faire : un nombre de 0 à 1 000 000.',
  due: 'Date limite : 0 à 30 jours après la création ; l\'heure limite demande ce délai.', frequency: 'Choisis : chaque jour, chaque semaine ou chaque mois.',
  weekdays: 'Choisis au moins un jour de la semaine.', month_day: 'Jour du mois : de 1 à 31.', time: 'Heure non valide (HH:MM).',
  start: 'Date de début non valide.', end: 'La date de fin doit être égale ou après le début.', format: 'Règle non valide.',
};

/** Nouvel identifiant de règle (lettres, chiffres, tiret). */
const newRecurringId = (existing: RecurringRule[]): string => { let id = `rr-${Date.now().toString(36)}`; for (let k = 2; existing.some((r) => r.id === id); k++) id = `rr-${Date.now().toString(36)}-${k}`; return id; };
// ===== END RECURRING =====
// ===== BEGIN AUTOREPORT (rapport automatique, M15.5 : copie exacte de src/utils/autoReport.ts ; ce bloc est contrôlé par scripts/check-auto-report.ts) =====
type ReportFrequency = 'off' | 'weekly' | 'monthly';
interface AutoReportSetting { frequency: ReportFrequency; weekday: number; month_day: number; time: string }
type ReportKind = 'week' | 'month';
interface ReportPeriod { id: string; kind: ReportKind; start: string; end: string }
interface ReportRecord { id: string; kind: ReportKind; start: string; end: string; status: 'pending' | 'ready'; created_at: string; frozen_at?: string; html?: string }

const AUTO_REPORT_DEFAULT: AutoReportSetting = { frequency: 'off', weekday: 1, month_day: 1, time: '08:00' };
const AUTO_REPORT_LIMITS = { keep: 24, html: 400000 };
const AUTO_REPORT_GRACE_MS = 2 * 60 * 60 * 1000; // la fiche se crée dans les 2 h qui suivent l'heure prévue
const ARP_OFFSET_H = 3;
const ARP_FREQUENCIES = ['off', 'weekly', 'monthly'];

const arpIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const arpIsTime = (s: unknown): boolean => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const arpDaysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const arpWeekday = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };
const arpAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const arpScheduledMs = (ymd: string, time: string): number => { const [y, m, d] = ymd.split('-').map(Number); const [hh, mm] = time.split(':').map(Number); return Date.UTC(y, m - 1, d, hh - ARP_OFFSET_H, mm); };
const arpMadagascarDate = (nowMs: number): string => new Date(nowMs + ARP_OFFSET_H * 3600000).toISOString().slice(0, 10);

/** Nettoie le réglage reçu : une valeur fausse devient la valeur de départ, jamais d'erreur. Rien reçu = arrêté. */
function cleanAutoReport(raw: unknown): AutoReportSetting {
  const out: AutoReportSetting = { ...AUTO_REPORT_DEFAULT };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.frequency === 'string' && ARP_FREQUENCIES.includes(r.frequency)) out.frequency = r.frequency as ReportFrequency;
  if (typeof r.weekday === 'number' && Number.isInteger(r.weekday) && r.weekday >= 1 && r.weekday <= 7) out.weekday = r.weekday;
  if (typeof r.month_day === 'number' && Number.isInteger(r.month_day) && r.month_day >= 1 && r.month_day <= 31) out.month_day = r.month_day;
  if (arpIsTime(r.time)) out.time = r.time as string;
  return out;
}

/** La période de l'identifiant (« w-2026-10-12 » = semaine du lundi 12 au dimanche 18 ; « m-2026-09 » = septembre 2026), ou null si l'identifiant est faux. */
function periodFromId(id: unknown): ReportPeriod | null {
  if (typeof id !== 'string') return null;
  let m = /^w-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (m) {
    if (!arpIsDate(m[1]) || arpWeekday(m[1]) !== 1) return null; // une semaine commence toujours un lundi
    return { id, kind: 'week', start: m[1], end: arpAddDays(m[1], 6) };
  }
  m = /^m-(\d{4})-(\d{2})$/.exec(id);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null;
    return { id, kind: 'month', start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(arpDaysIn(y, mo)).padStart(2, '0')}` };
  }
  return null;
}

/** Vrai si le réglage tombe ce jour-là (date AAAA-MM-JJ). « Arrêté » ne tombe jamais. Le 31 tombe le dernier jour des mois plus courts. */
function reportRunsOn(s: AutoReportSetting, ymd: string): boolean {
  if (!arpIsDate(ymd) || s.frequency === 'off') return false;
  if (s.frequency === 'weekly') return arpWeekday(ymd) === s.weekday;
  const [y, m, d] = ymd.split('-').map(Number);
  return d === Math.min(s.month_day, arpDaysIn(y, m));
}

/** La période FINIE que couvre un rapport lancé ce jour-là : la semaine d'avant (lundi à dimanche) ou le mois d'avant. */
function periodForRun(s: AutoReportSetting, ymd: string): ReportPeriod | null {
  if (!arpIsDate(ymd) || s.frequency === 'off') return null;
  if (s.frequency === 'weekly') {
    const thisMonday = arpAddDays(ymd, -(arpWeekday(ymd) - 1));
    return periodFromId(`w-${arpAddDays(thisMonday, -7)}`);
  }
  const [y, m] = ymd.split('-').map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return periodFromId(`m-${py}-${String(pm).padStart(2, '0')}`);
}

/** Le rapport à créer maintenant : réglage actif, jour concerné, heure prévue passée depuis moins de 2 h. Sinon null. */
function dueReport(s: AutoReportSetting, nowMs: number, graceMs: number = AUTO_REPORT_GRACE_MS): (ReportPeriod & { run_date: string; at: number }) | null {
  if (s.frequency === 'off') return null;
  const today = arpMadagascarDate(nowMs);
  for (const date of [arpAddDays(today, -1), today]) {
    if (!reportRunsOn(s, date)) continue;
    const at = arpScheduledMs(date, s.time);
    if (nowMs >= at && nowMs < at + graceMs) { const p = periodForRun(s, date); if (p) return { ...p, run_date: date, at }; }
  }
  return null;
}

/** Prochaine exécution après `nowMs` (millisecondes UTC), ou null (arrêté). */
function nextAutoReport(s: AutoReportSetting, nowMs: number): number | null {
  if (s.frequency === 'off') return null;
  let day = arpMadagascarDate(nowMs);
  for (let i = 0; i < 400; i++, day = arpAddDays(day, 1)) {
    if (!reportRunsOn(s, day)) continue;
    const at = arpScheduledMs(day, s.time);
    if (at > nowMs) return at;
  }
  return null;
}

type ReportRecordError = 'format' | 'id' | 'status' | 'date' | 'html';

/** Vérifie une fiche de rapport. L'identifiant décide de tout : type, début et fin sont recalculés, jamais crus. Une fiche prête demande un texte (400 000 signes au plus). */
function checkReportRecord(d: unknown): { ok: true; value: ReportRecord } | { ok: false; error: ReportRecordError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  const r = d as Record<string, unknown>;
  if (['__proto__', 'constructor', 'prototype'].some((k) => Object.prototype.hasOwnProperty.call(r, k))) return { ok: false, error: 'format' };
  const p = periodFromId(r.id);
  if (!p) return { ok: false, error: 'id' };
  if (r.status !== 'pending' && r.status !== 'ready') return { ok: false, error: 'status' };
  if (typeof r.created_at !== 'string' || Number.isNaN(Date.parse(r.created_at))) return { ok: false, error: 'date' };
  const value: ReportRecord = { id: p.id, kind: p.kind, start: p.start, end: p.end, status: r.status, created_at: new Date(r.created_at).toISOString() };
  if (r.status === 'ready') {
    if (typeof r.frozen_at !== 'string' || Number.isNaN(Date.parse(r.frozen_at))) return { ok: false, error: 'date' };
    if (typeof r.html !== 'string' || !r.html.trim() || r.html.length > AUTO_REPORT_LIMITS.html) return { ok: false, error: 'html' };
    value.frozen_at = new Date(r.frozen_at).toISOString();
    value.html = r.html;
  } else if (r.html !== undefined || r.frozen_at !== undefined) return { ok: false, error: 'status' };
  return { ok: true, value };
}

/** Fige la copie : une fiche « en attente » devient « prête » avec son texte. Une fiche déjà prête ne change JAMAIS (null). */
function freezeReport(existing: ReportRecord | null | undefined, html: unknown, nowIso: string): ReportRecord | null {
  if (!existing || existing.status === 'ready') return null;
  if (typeof html !== 'string' || !html.trim() || html.length > AUTO_REPORT_LIMITS.html) return null;
  return { ...existing, status: 'ready', frozen_at: nowIso, html };
}

/** Les fiches à garder : les 24 plus récentes (par fin de période, puis identifiant). Rend les identifiants à supprimer. */
function reportsToPrune(list: { id: string; end?: string }[], keep: number = AUTO_REPORT_LIMITS.keep): string[] {
  const rows = list.map((r) => ({ id: r.id, end: periodFromId(r.id)?.end || '' })).sort((a, b) => b.end.localeCompare(a.end) || b.id.localeCompare(a.id));
  return rows.slice(keep).map((r) => r.id);
}

/** Texte de la notification (FR et EN) pour une période. */
function reportNotice(p: ReportPeriod): { fr: { title: string; body: string }; en: { title: string; body: string } } {
  const week = p.kind === 'week';
  return {
    fr: { title: week ? 'Rapport de la semaine prêt' : 'Rapport du mois prêt', body: `Période du ${p.start} au ${p.end}. Ouvre Statistiques > Rapport.` },
    en: { title: week ? 'Weekly report ready' : 'Monthly report ready', body: `Period ${p.start} to ${p.end}. Open Statistics > Report.` },
  };
}

const ARP_DAYS_FR = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const ARP_DAYS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Phrase courte : « Arrêté », « Chaque lundi à 08:00 », « Le 1er de chaque mois à 08:00 ». */
function describeAutoReport(s: AutoReportSetting, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  if (s.frequency === 'off') return fr ? 'Arrêté' : 'Off';
  if (s.frequency === 'weekly') return fr ? `Chaque ${ARP_DAYS_FR[s.weekday]} à ${s.time}` : `Every ${ARP_DAYS_EN[s.weekday]} at ${s.time}`;
  return fr ? `Le ${s.month_day}${s.month_day === 1 ? 'er' : ''} de chaque mois à ${s.time}` : `On day ${s.month_day} of each month at ${s.time}`;
}
// ===== END AUTOREPORT =====

// ===== BEGIN SHIFTS (planning des équipes, M15.2 : copie exacte du bloc de src/utils/planning.ts ; contrôlé par scripts/check-planning.ts) =====
const SH_KINDS = ['day', 'night', 'off'];
const SH_NOTE_MAX = 120;
const SH_WINDOW_DAYS = 400; // on ne planifie pas plus de 400 jours avant ou après aujourd'hui
const shClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const shIsDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const shAddDays = (ymd: string, n: number): string => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Identifiant d'une entrée : toujours le même pour un salarié et un jour. */
const shiftId = (employeeId: string, ymd: string): string => `sh-${employeeId}-${ymd.replace(/-/g, '')}`;

type ShiftError = 'employee' | 'date' | 'kind' | 'note' | 'id' | 'format';
/** Vérifie une entrée saisie. */
function checkShift(d: { [k: string]: unknown }): { ok: true; value: { id: string; employee_id: string; date: string; kind: string; note?: string } } | { ok: false; error: ShiftError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  for (const k of ['id', 'employee_id', 'date', 'kind', 'note']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const emp = typeof d.employee_id === 'string' ? d.employee_id.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(emp)) return { ok: false, error: 'employee' };
  if (!shIsDate(d.date)) return { ok: false, error: 'date' };
  const date = d.date as string;
  if (typeof d.kind !== 'string' || !SH_KINDS.includes(d.kind)) return { ok: false, error: 'kind' };
  const id = shiftId(emp, date);
  if (d.id !== undefined && d.id !== null && d.id !== id) return { ok: false, error: 'id' };
  const note = shClean(d.note ?? '', SH_NOTE_MAX);
  const value: { id: string; employee_id: string; date: string; kind: string; note?: string } = { id, employee_id: emp, date, kind: d.kind };
  if (note) value.note = note;
  return { ok: true, value };
}

/** Revérification serveur d'une entrée reçue. `ctx.today` = date du jour à Madagascar. Garde la date de création de l'entrée existante. */
function cleanShift(rec: any, existing: any, actorId: string, now: string, ctx: { today: string }): { ok: true; save: any } | { ok: false; reason: string } {
  const v = checkShift(rec);
  if (!v.ok) return { ok: false, reason: v.error };
  if (!shIsDate(ctx && ctx.today)) return { ok: false, reason: 'format' };
  if (v.value.date < shAddDays(ctx.today, -SH_WINDOW_DAYS) || v.value.date > shAddDays(ctx.today, SH_WINDOW_DAYS)) return { ok: false, reason: 'window' };
  if (existing && (existing.employee_id !== v.value.employee_id || existing.date !== v.value.date)) return { ok: false, reason: 'id' };
  const save: any = { id: v.value.id, employee_id: v.value.employee_id, date: v.value.date, kind: v.value.kind, created_at: existing && typeof existing.created_at === 'string' ? existing.created_at : now, updated_at: now, updated_by: String(actorId).slice(0, 60) };
  if (v.value.note) save.note = v.value.note;
  return { ok: true, save };
}
// ===== END SHIFTS =====

// ===== BEGIN TEAMGOALS (objectifs par salarié et par équipe, M15.3 : copie exacte du bloc de src/utils/teamGoals.ts ; contrôlé par scripts/check-team-goals.ts) =====
const TG_MAX = 40;
const TG_NAME_MAX = 60;
const TG_METRICS = ['done', 'rate'];
const TG_SCOPES = ['team', 'employee'];
const tgClean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

type TeamGoalError = 'name' | 'duplicate' | 'limit' | 'scope' | 'employee' | 'metric' | 'target' | 'month' | 'format';
type TeamGoalValue = { id: string; name: string; scope: string; employee_id?: string; metric: string; target: number; month: string };
/** Vérifie un objectif saisi. `others` = les autres objectifs (deux noms identiques refusés, 40 au plus). `month` vide = chaque mois. */
function checkTeamGoal(d: { [k: string]: unknown }, others: Array<{ id: string; name: string }>): { ok: true; value: TeamGoalValue } | { ok: false; error: TeamGoalError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  for (const k of ['id', 'name', 'scope', 'employee_id', 'metric', 'month']) { const v = d[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const id = tgClean(d.id ?? '', 40);
  if (id && !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'format' };
  const name = tgClean(d.name ?? '', TG_NAME_MAX);
  if (!name) return { ok: false, error: 'name' };
  if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' };
  if (!id && others.length >= TG_MAX) return { ok: false, error: 'limit' };
  const scope = d.scope;
  if (typeof scope !== 'string' || !TG_SCOPES.includes(scope)) return { ok: false, error: 'scope' };
  let employee = '';
  if (scope === 'employee') {
    employee = typeof d.employee_id === 'string' ? d.employee_id.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(employee)) return { ok: false, error: 'employee' };
  }
  const metric = d.metric;
  if (typeof metric !== 'string' || !TG_METRICS.includes(metric)) return { ok: false, error: 'metric' };
  const target = d.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > (metric === 'rate' ? 100 : 100000)) return { ok: false, error: 'target' };
  const month = d.month === undefined || d.month === null ? '' : d.month;
  if (month !== '') {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month as string);
    if (!m || Number(m[1]) < 2000 || Number(m[1]) > 2100) return { ok: false, error: 'month' };
  }
  const value: TeamGoalValue = { id, name, scope, metric, target, month: month as string };
  if (scope === 'employee') value.employee_id = employee;
  return { ok: true, value };
}

/** Nettoie une liste reçue (réglages) : les objectifs faux sont ignorés, jamais d'erreur. */
function cleanTeamGoals(list: unknown): TeamGoalValue[] {
  if (!Array.isArray(list)) return [];
  const out: TeamGoalValue[] = [];
  for (const raw of list) {
    if (out.length >= TG_MAX) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as { [k: string]: unknown }).id;
    if (typeof id !== 'string' || !id) continue;
    const v = checkTeamGoal(raw as { [k: string]: unknown }, out);
    if (v.ok && !out.some((o) => o.id === v.value.id)) out.push(v.value);
  }
  return out;
}
// ===== END TEAMGOALS =====

// ===== BEGIN BUDGETPLAN (budget prévu contre réel, M15.4 : copie exacte du bloc de src/utils/budgetPlan.ts ; contrôlé par scripts/check-budget-plan.ts) =====
const BP_MAX_AR = 10000000000; // 10 milliards d'Ar par mois : au-delà, c'est une faute de frappe
const bpAmount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= BP_MAX_AR ? Math.round(v) : null);

type MonthlyPlanError = 'revenue' | 'payroll' | 'format';
/** Vérifie le plan saisi : deux montants entiers en Ar par mois, de 0 (pas de prévu) à 10 milliards. */
function checkMonthlyPlan(d: { [k: string]: unknown }): { ok: true; value: { revenue_ar: number; payroll_ar: number } } | { ok: false; error: MonthlyPlanError } {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (Object.keys(d).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return { ok: false, error: 'format' };
  const revenue = d.revenue_ar === undefined || d.revenue_ar === null ? 0 : bpAmount(d.revenue_ar);
  if (revenue === null) return { ok: false, error: 'revenue' };
  const payroll = d.payroll_ar === undefined || d.payroll_ar === null ? 0 : bpAmount(d.payroll_ar);
  if (payroll === null) return { ok: false, error: 'payroll' };
  return { ok: true, value: { revenue_ar: revenue, payroll_ar: payroll } };
}

/** Nettoie le plan reçu (réglages) : un montant faux devient 0, jamais d'erreur. */
function cleanMonthlyPlan(raw: unknown): { revenue_ar: number; payroll_ar: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { revenue_ar: 0, payroll_ar: 0 };
  const r = raw as { [k: string]: unknown };
  return { revenue_ar: bpAmount(r.revenue_ar) ?? 0, payroll_ar: bpAmount(r.payroll_ar) ?? 0 };
}
// ===== END BUDGETPLAN =====

// ===== BEGIN PRIVACY (prix client et objectifs d'argent : jamais envoyés à un employé ; ce bloc est contrôlé par scripts/check-phase4.ts) =====
// Réglages que seul l'admin reçoit : prix client, objectifs du mois, seuils d'alerte.
const SETTINGS_ADMIN_KEYS: string[] = ["client_price_default_ar", "team_lead_limit_ar", "client_prices_by_type", "goal_missions", "goal_profit_ar", "goal_max_expenses_ar", "alert_unpaid_days", "stock_categories", "stock_spaces", "alert_low_cash_ar", "acct_close", "auto_report", "monthly_plan", "team_goals", "recurring_missions", "mission_templates", "budgets", "health_acks"];
/** Réglages envoyés à un employé : sans prix client ni objectifs. L'admin reçoit tout. */
const stripSettings = (rec: any, me: any) => {
  if (!rec || (me.role === "admin" || me.role === "accountant")) return rec;
  const out = { ...rec };
  for (const k of SETTINGS_ADMIN_KEYS) delete out[k];
  return out;
};
/** Mission ou session envoyée à un employé : sans le prix client ni le lien vers la fiche client (même pour ses propres sessions). */
const withoutClientPrice = (rec: any, me: any) => {
  if (!rec || (me.role === "admin" || me.role === "accountant") || !("client_price_ar" in rec || "client_id" in rec)) return rec;
  const out = { ...rec };
  delete out.client_price_ar;
  delete out.client_id;
  return out;
};
// ===== END PRIVACY =====

// ===== BEGIN COMPANY (Conditions de l'entreprise : le serveur revérifie tout ; ce bloc est contrôlé par scripts/check-company.ts) =====
// Les lignes ci-dessous (jusqu'à « Partie propre au serveur ») viennent de src/utils/companyRules.ts. `npm run check:company` vérifie qu'elles donnent le même résultat que le site.
const COMPANY_SPEC = {
  identity: { name: { t: "text", max: 80 }, address: { t: "text", max: 200 }, phone: { t: "text", max: 40 }, email: { t: "email" }, logo_url: { t: "url" }, currency: { t: "text", max: 8 } },
  legal: { tax_id: { t: "text", max: 60 }, register_id: { t: "text", max: 60 }, notes: { t: "lines", n: 10, max: 200 } },
  tax: { vat_enabled: { t: "bool" }, vat_rate: { t: "num", min: 0, max: 100 }, vat_exempt_text: { t: "text", max: 200 } },
  billing: { invoice_prefix: { t: "prefix" }, receipt_prefix: { t: "prefix" }, payment_days: { t: "int", min: 0, max: 365 }, late_penalty_text: { t: "text", max: 300 }, payment_methods_text: { t: "text", max: 200 }, invoice_footer: { t: "text", max: 300 } },
  payroll: { pay_day: { t: "int", min: 0, max: 31 }, pay_rounding: { t: "enum", vals: ["none", "10", "100", "1000"] } },
  leave: { leave_days_per_year: { t: "int", min: 0, max: 60 }, work_days_per_week: { t: "int", min: 0, max: 7 }, late_limit_time: { t: "time" } },
  missions: { validation_hours: { t: "int", min: 0, max: 720 }, refusal_reason_required: { t: "bool" } },
  clients: { new_days: { t: "int", min: 1, max: 365 }, regular_missions: { t: "int", min: 1, max: 100 }, regular_months: { t: "int", min: 1, max: 24 }, strategic_top_pct: { t: "int", min: 1, max: 100 }, strategic_months: { t: "int", min: 1, max: 36 }, strategic_min_missions: { t: "int", min: 1, max: 1e3 }, inactive_days: { t: "int", min: 1, max: 730 } },
  options: { invoice_per: { t: "enum", vals: ["client_month", "mission"] }, quotes_enabled: { t: "bool" }, employee_sees_badges: { t: "bool" }, employee_sees_attention: { t: "bool" }, mission_requires_client: { t: "bool" }, badges_enabled: { t: "bool" } },
  texts: { internal_rules: { t: "text", max: 5e3, multi: true }, customer_terms: { t: "text", max: 5e3, multi: true } },
  modules: { hidden: { t: "text", max: 400 } },
  watch: { validate_hours: { t: "int", min: 0, max: 720 }, active_no_end_hours: { t: "int", min: 0, max: 720 }, late_count: { t: "int", min: 0, max: 100 }, late_window_days: { t: "int", min: 0, max: 365 }, absent_streak_days: { t: "int", min: 0, max: 60 }, refusal_rate_pct: { t: "int", min: 0, max: 100 }, refusal_min_missions: { t: "int", min: 0, max: 1000 }, min_periods: { t: "int", min: 0, max: 60 }, ignore_days: { t: "int", min: 0, max: 365 }, min_duration_minutes: { t: "int", min: 0, max: 600 }, advance_pending_days: { t: "int", min: 0, max: 90 }, inactive_days: { t: "int", min: 0, max: 365 }, strategic_silent_days: { t: "int", min: 0, max: 365 }, dormant_days: { t: "int", min: 0, max: 730 }, others_pct: { t: "int", min: 0, max: 100 }, backup_max_hours: { t: "int", min: 0, max: 720 }, error_hours: { t: "int", min: 0, max: 720 } }
};
const COMPANY_DEFAULTS = {
  identity: { name: "", address: "", phone: "", email: "", logo_url: "", currency: "Ar" },
  legal: { tax_id: "", register_id: "", notes: [] },
  tax: { vat_enabled: false, vat_rate: 0, vat_exempt_text: "" },
  billing: { invoice_prefix: "FA-", receipt_prefix: "RC-", payment_days: 30, late_penalty_text: "", payment_methods_text: "", invoice_footer: "" },
  payroll: { pay_day: 0, pay_rounding: "none" },
  leave: { leave_days_per_year: 0, work_days_per_week: 0, late_limit_time: "" },
  missions: { validation_hours: 0, refusal_reason_required: true },
  clients: { new_days: 60, regular_missions: 3, regular_months: 6, strategic_top_pct: 20, strategic_months: 12, strategic_min_missions: 5, inactive_days: 90 },
  options: { invoice_per: "client_month", quotes_enabled: false, employee_sees_badges: true, employee_sees_attention: false, mission_requires_client: true, badges_enabled: true },
  texts: { internal_rules: "", customer_terms: "" },
  modules: { hidden: "" },
  watch: { validate_hours: 0, active_no_end_hours: 0, late_count: 0, late_window_days: 0, absent_streak_days: 0, refusal_rate_pct: 0, refusal_min_missions: 0, min_periods: 0, ignore_days: 0, min_duration_minutes: 0, advance_pending_days: 0, inactive_days: 0, strategic_silent_days: 0, dormant_days: 0, others_pct: 0, backup_max_hours: 0, error_hours: 0 }
};
const COMPANY_EMPLOYEE_SECTIONS = ["leave"];
const noTags = (s) => s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
const noCtl = (s, multi) => multi ? s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "") : s.replace(/[\u0000-\u001F\u007F]+/g, " ");
function cleanField(sp, raw, fallback) {
  if (raw === void 0) return { v: fallback, bad: false };
  const no = { v: fallback, bad: true };
  switch (sp.t) {
    case "text": {
      if (typeof raw !== "string") return no;
      const s = noCtl(noTags(raw), !!sp.multi).trim();
      return s.length > sp.max ? no : { v: sp.multi ? s : s.replace(/\s{2,}/g, " "), bad: false };
    }
    case "bool":
      return typeof raw === "boolean" ? { v: raw, bad: false } : no;
    case "int":
    case "num": {
      if (typeof raw !== "number" && !(typeof raw === "string" && raw.trim() !== "")) return no;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < sp.min || n > sp.max) return no;
      return { v: sp.t === "int" ? Math.round(n) : Math.round(n * 100) / 100, bad: false };
    }
    case "enum":
      return typeof raw === "string" && sp.vals.includes(raw) ? { v: raw, bad: false } : no;
    case "time":
      return typeof raw === "string" && (raw === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) ? { v: raw, bad: false } : no;
    case "email":
      return typeof raw === "string" && (raw === "" || raw.length <= 120 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(raw)) ? { v: raw, bad: false } : no;
    case "url":
      return typeof raw === "string" && (raw === "" || raw.length <= 300 && /^https:\/\/[^\s<>"']+$/.test(raw)) ? { v: raw, bad: false } : no;
    case "prefix": {
      if (typeof raw !== "string") return no;
      const s = raw.replace(/[^A-Za-z0-9\-_/]/g, "");
      return s.length > 10 ? no : { v: s, bad: false };
    }
    case "lines": {
      if (!Array.isArray(raw)) return no;
      const out = [];
      for (const x of raw) {
        if (typeof x !== "string") return no;
        const s = noCtl(noTags(x), false).trim().replace(/\s{2,}/g, " ");
        if (s.length > sp.max) return no;
        if (s) out.push(s);
      }
      return out.length > sp.n ? no : { v: out, bad: false };
    }
  }
}
function cleanCompany(input, base = COMPANY_DEFAULTS) {
  const errors = [];
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (input !== void 0 && input !== null && src !== input) errors.push("(tout)");
  const out = {};
  for (const sec of Object.keys(COMPANY_SPEC)) {
    const rawSec = src[sec] && typeof src[sec] === "object" && !Array.isArray(src[sec]) ? src[sec] : {};
    if (src[sec] !== void 0 && rawSec !== src[sec]) errors.push(sec);
    out[sec] = {};
    for (const k of Object.keys(COMPANY_SPEC[sec])) {
      const fb = base?.[sec]?.[k] ?? COMPANY_DEFAULTS[sec][k];
      const r = cleanField(COMPANY_SPEC[sec][k], rawSec[k], fb);
      if (r.bad) errors.push(`${sec}.${k}`);
      out[sec][k] = Array.isArray(r.v) ? [...r.v] : r.v;
    }
  }
  return { value: out, errors };
}
const readCompany = (settingsCompany) => cleanCompany(settingsCompany).value;
function companyForEmployee(c) {
  const full = readCompany(c);
  // Les 3 réglages « Badges » (oui/non, rien d'argent) : sans eux le salarié ne peut pas savoir si sa page « Ma performance » est ouverte (module 3).
  const { badges_enabled, employee_sees_badges, employee_sees_attention } = full.options;
  return { leave: full.leave, texts: { internal_rules: full.texts.internal_rules }, options: { badges_enabled, employee_sees_badges, employee_sees_attention }, modules: full.modules };
}
function companyDiff(before, after) {
  const out = [];
  for (const sec of Object.keys(COMPANY_SPEC)) for (const k of Object.keys(COMPANY_SPEC[sec])) {
    const a = before[sec][k], b = after[sec][k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: `${sec}.${k}`, before: (Array.isArray(a) ? a.join(" | ") : String(a)).slice(0, 120) });
  }
  return out;
}

// ----- Partie propre au serveur -----
const COMPANY_LOG_MAX = 100;
/** Employé : jamais le journal des changements, et seulement le règlement et les congés dans `company` (rien d'argent ni de TVA). */
const stripCompany = (rec, me) => {
  if (!rec || (me.role === "admin" || me.role === "accountant")) return rec;
  const out = { ...rec };
  delete out.company_log;
  if (out.company) out.company = companyForEmployee(out.company);
  return out;
};
/** Réglages écrits par l'admin : `company` est revérifié champ par champ ; le journal est écrit ici (date, auteur, valeur d'avant), jamais pris du navigateur. */
const cleanSettingsRecord = (rec, existing, me, now) => {
  const base = cleanCompany(existing && existing.company).value;
  const sent = rec.company === undefined ? existing && existing.company : rec.company; // ancien site qui n'envoie pas `company` : on garde l'existant
  const value = cleanCompany(sent, base).value;
  const old = Array.isArray(existing && existing.company_log) ? existing.company_log : [];
  const fresh = companyDiff(base, value).map((d) => ({ at: now, by: String(me.id), by_name: String(me.name || me.username || "").slice(0, 80), path: d.path, before: d.before }));
  return { ...rec, company: value, company_log: [...old, ...fresh].slice(-COMPANY_LOG_MAX) };
};
// ===== END COMPANY =====

// ===== BEGIN AUDIT (journal d'audit : qui a fait quoi et quand ; lecture réservée à l'administrateur ; ce bloc est contrôlé par scripts/check-audit.ts) =====
const AUDIT_ACTIONS = ["invoice_issue", "invoice_cancel", "invoice_pay", "delete", "tariff_change", "settings_change", "company_change", "user_create", "user_password", "signup_decision", "profile_decision", "reset_decision", "payroll_close", "payroll_reopen", "payroll_pay", "backup_now", "backup_restore", "mission_decision", "login_locked", "totp_on", "totp_off", "totp_reset", "backup_import", "accounting_sync", "accounting_post", "accounting_reverse", "accounting_close", "accounting_reopen", "access_request", "access_approved", "access_refused", "access_changed", "force_logout"];
const AUDIT_KEEP_DAYS = 365;
const AUDIT_TARIFF_KEYS = ["price_per_million", "client_price_default_ar", "client_prices_by_type"];
const AUDIT_SETTINGS_SKIP = ["company", "company_log", "budgets", "mission_templates", "health_acks", "stock_categories", "stock_spaces"];
const auditCut = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
function buildAuditEntry(me: any, action: string, target: any, detail: unknown, at: string, rand: string): any | null {
  if (!AUDIT_ACTIONS.includes(action)) return null;
  const t = target || {};
  return {
    id: `${at.replace(/\D/g, "").slice(0, 17)}-${auditCut(rand, 8)}`,
    at, by: auditCut(me && me.id, 80), by_name: auditCut((me && (me.name || me.username)) || "", 80), action,
    target_type: auditCut(t.type, 30), target_id: auditCut(t.id, 80), target_label: auditCut(t.label, 80), detail: auditCut(detail, 300),
  };
}
function auditLabelOf(d: any): string {
  if (!d || typeof d !== "object") return "";
  return auditCut(d.number || d.name || d.client_name || d.title || d.username || d.id || "", 80);
}
const auditShow = (v: unknown) => auditCut(v !== null && typeof v === "object" ? JSON.stringify(v) : v, 60) || "—";
function auditChanges(before: any, after: any, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const a = before ? before[k] : undefined, b = after ? after[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${k} : ${auditShow(a)} → ${auditShow(b)}`);
  }
  return out;
}
function auditSettingsKeys(before: any, after: any): string[] {
  const keys = new Set<string>([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out: string[] = [];
  for (const k of [...keys].sort()) {
    if (AUDIT_SETTINGS_SKIP.includes(k) || AUDIT_TARIFF_KEYS.includes(k)) continue;
    if (JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])) out.push(k);
  }
  return out.slice(0, 12);
}
const auditCutoffMs = (nowMs: number) => nowMs - AUDIT_KEEP_DAYS * 86400_000;
// ===== END AUDIT =====

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const SECRET = createHash("sha256").update("df-session:" + SB_KEY).digest("hex");
const RESETS = "df_resets";
const ACCESS_REQ = "df_access_requests"; // demandes de connexion hors horaires (une ligne par personne)
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
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, x-df-action-id, x-df-device-time",
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
// ===== BEGIN WORKDAYS (jours de travail réglables ; copie de src/utils/workDays.ts, comparée par scripts/check-work-days.ts) =====
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];
const cleanWorkDays = (v) => {
  if (!Array.isArray(v)) return [...DEFAULT_WORK_DAYS];
  const out = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return out.length ? out : [...DEFAULT_WORK_DAYS];
};
const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
const isWorkDay = (dateStr, workDays) => cleanWorkDays(workDays).includes(weekdayOf(dateStr));
// Jour de travail d'un instant : le shift de nuit commence la veille au soir, donc avant midi (heure de Madagascar) = jour précédent.
const workDateOf = (shift, now) => {
  const mada = new Date(now.getTime() + 3 * 3600 * 1000);
  if (shift === 'night' && mada.getUTCHours() < 12) mada.setUTCDate(mada.getUTCDate() - 1);
  return mada.toISOString().slice(0, 10);
};
// ===== END WORKDAYS =====
// ===== BEGIN ACCESSUNTIL (copie serveur : mêmes lignes) =====
const hhmm = (s: unknown, dflt: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : dflt;
};
/** Prochaine fin de vacation (heure de Madagascar), strictement après `nowMs`. */
export const shiftEndMs = (shift: 'day' | 'night', st: any, nowMs: number): number => {
  const endMin = shift === 'night' ? hhmm(st?.night_shift_end, 6 * 60) : hhmm(st?.day_shift_end, 18 * 60);
  const local = nowMs + 3 * 3600 * 1000;
  let end = Math.floor(local / 86400000) * 86400000 + endMin * 60000;
  if (end <= local) end += 86400000;
  return end - 3 * 3600 * 1000;
};
/** Fin d'une autorisation : fin de vacation (si elle est à plus de 14 h, 4 h à la place), 1/2/4/8/12 h, ou une heure précise (dans les 48 h). null = demande invalide. */
export const resolveAccessUntil = (shift: 'day' | 'night', st: any, nowMs: number, mode: unknown, value: unknown): number | null => {
  if (mode === 'hours') { const h = Number(value); return [1, 2, 4, 8, 12].includes(h) ? nowMs + h * 3600000 : null; }
  if (mode === 'until') { const t = typeof value === 'number' ? value : Date.parse(String(value || '')); return Number.isFinite(t) && t > nowMs && t <= nowMs + 48 * 3600000 ? t : null; }
  const e = shiftEndMs(shift, st, nowMs);
  return e - nowMs > 14 * 3600000 ? nowMs + 4 * 3600000 : e;
};
// ===== END ACCESSUNTIL =====
// Opérateur, Comptable et Chef d'équipe (jamais le responsable) : « auto » = seulement pendant sa vacation ET un jour de travail ; « allow » = toute heure ; « block » = jamais.
// Une session en cours (début ou fin à valider) garde l'accès jusqu'à sa fin.
async function shiftAccess(user: any): Promise<{ ok: boolean; message?: string; block?: boolean }> {
  if (user.role === 'admin' || !['employee', 'accountant', 'team_lead'].includes(user.role)) return { ok: true };
  if (user.access_mode === 'block') return { ok: false, block: true, message: "Ton accès est bloqué par l'administrateur." };
  if (user.access_mode === 'allow') return { ok: true };
  if (user.access_until && Date.parse(user.access_until) > Date.now()) return { ok: true }; // autorisation du responsable (demande hors horaires) encore valable
  const st = await getSettings();
  const shift: 'day' | 'night' = user.shift === 'night' ? 'night' : 'day';
  const now = new Date();
  if (inShiftWindow(shift, st, now)) {
    if (isWorkDay(workDateOf(shift, now), st.work_days)) return { ok: true };
    const { data: openRest } = await sb.from(T.posts).select('id').eq('data->>employee_id', user.id).in('data->>status', OPEN_STATUS).limit(1);
    if (openRest && openRest.length) return { ok: true };
    return { ok: false, message: "Aujourd'hui n'est pas un jour de travail. Si tu dois travailler, contacte l'administrateur." };
  }
  const { data: open } = await sb.from(T.posts).select('id').eq('data->>employee_id', user.id).in('data->>status', OPEN_STATUS).limit(1);
  if (open && open.length) return { ok: true };
  const from = shift === 'night' ? st.night_shift_start || '20:00' : st.day_shift_start || '08:00';
  const to = shift === 'night' ? st.night_shift_end || '06:00' : st.day_shift_end || '18:00';
  const startMin = toMin(shift === 'night' ? st.night_shift_start : st.day_shift_start, shift === 'night' ? 20 * 60 : 8 * 60);
  const opens = fmtMin(startMin - accessMargins(st).before);
  return { ok: false, message: `Ta vacation ${shift === 'night' ? 'de nuit' : 'de jour'} est de ${from} à ${to}. Tu peux te connecter à partir de ${opens}.` };
}

// Mode maintenance (Réglages) : les boosters sont refusés avec le message de l'admin ; l'admin entre toujours.
async function maintenanceMessage(user: any): Promise<string | null> {
  if (!isOperator(user.role)) return null; // admin, Comptable et Chef d'équipe entrent toujours
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
// Connexions du jour (BTK, 2026-10-29) : une « session » = de la connexion au dernier signe de vie, ou à la déconnexion. Retour : la colonne `sessions` peut rester (vide ou pleine), l'ancien code l'ignore.
const SESSION_GAP_MS = 150_000; // plus de 150 s sans signe de vie : la session est finie (fin = dernier signe de vie), la suivante est une nouvelle connexion
const SESSIONS_MAX = 40;
const nextSessions = (prev: any, now: Date): any[] => {
  const list = Array.isArray(prev) ? prev.map((x: any) => ({ ...x })) : [];
  const t = now.toISOString();
  const last = list[list.length - 1];
  if (last && !last.out && now.getTime() - new Date(last.last).getTime() <= SESSION_GAP_MS) last.last = t;
  else list.push({ in: t, last: t });
  return list.slice(-SESSIONS_MAX);
};
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
  await sb.from(ATTENDANCE).upsert({ user_id: me.id, day, first_seen: row?.first_seen ?? now.toISOString(), last_seen: now.toISOString(), online_sec: sec, sessions: nextSessions(row?.sessions, now) });
  attMem.set(me.id, { day, at: now.getTime() });
}
// Déconnexion : la session ouverte reçoit son heure de fin. N'échoue jamais.
async function closeAttendanceSession(me: any) {
  try {
    const now = new Date();
    attMem.delete(me.id);
    const day = attendanceDay(me, now);
    const { data: row } = await sb.from(ATTENDANCE).select('sessions').eq('user_id', me.id).eq('day', day).maybeSingle();
    const list = Array.isArray(row?.sessions) ? row.sessions.map((x: any) => ({ ...x })) : [];
    const last = list[list.length - 1];
    if (!last || last.out) return;
    last.out = now.toISOString(); last.last = now.toISOString();
    await sb.from(ATTENDANCE).update({ sessions: list }).eq('user_id', me.id).eq('day', day);
  } catch (e) { console.error('attendance logout error:', e); }
}
// L'admin voit tous les boosters du jour demandé ; un booster ne voit que le sien.
async function attendanceRoute(req: any, res: any, me: any) {
  const day = String(req.query.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Jour invalide.' });
  let q = sb.from(ATTENDANCE).select('user_id,day,first_seen,last_seen,online_sec,sessions').eq('day', day);
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
  if (me.role !== 'employee') return res.status(403).json({ error: 'Réservé aux opérateurs.' });
  const join = req.body?.join === true;
  if (join) {
    const { data: open } = await sb.from(T.posts).select('id').eq('data->>employee_id', me.id).in('data->>status', OPEN_STATUS).limit(1);
    if (open && open.length) return res.status(409).json({ error: 'Tu as déjà une mission en cours.' });
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

// ===== BEGIN LOGINGUARD (blocage après trop d'essais de connexion ; ce bloc est contrôlé par scripts/check-login-guard.ts) =====
const GUARD = {
  windowSec: 900, // 15 min sans nouvel essai raté : le compteur est oublié
  account: { free: 5, baseSec: 60, maxSec: 1800, adminMaxSec: 300 },
  ip: { free: 20, baseSec: 60, maxSec: 1800 },
};
type GuardKind = 'account' | 'ip';
interface Attempt { fails: number; locks: number; last_at: number; locked_until: number }

const nat = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 8_640_000_000_000_000) : 0);
const EMPTY: Attempt = { fails: 0, locks: 0, last_at: 0, locked_until: 0 };

/** Ce qui vient de la base est nettoyé : une ligne abîmée = aucun compteur (jamais de blocage par erreur). */
function cleanAttempt(raw: unknown): Attempt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  return { fails: Math.min(nat(r.fails), 1000), locks: Math.min(nat(r.locks), 100), last_at: nat(r.last_at), locked_until: nat(r.locked_until) };
}

/** Secondes d'attente restantes (0 = pas de délai). */
function lockLeftSec(a: Attempt | undefined, nowMs: number): number {
  const c = cleanAttempt(a);
  if (!c || c.locked_until <= nowMs) return 0;
  return Math.ceil((c.locked_until - nowMs) / 1000);
}

/** Un essai raté de plus : met le compteur à jour et dit si un délai commence maintenant. */
function afterFailure(prev: Attempt | undefined, nowMs: number, kind: GuardKind, adminAccount = false): { next: Attempt; lockedNow: boolean; lockSec: number } {
  let p: Attempt = cleanAttempt(prev) || EMPTY;
  if (nowMs - Math.max(p.last_at, p.locked_until) > GUARD.windowSec * 1000) p = EMPTY; // plus rien depuis longtemps : on oublie
  if (p.locked_until > nowMs) return { next: p, lockedNow: false, lockSec: 0 }; // déjà en délai : on ne le rallonge pas
  const spec = GUARD[kind];
  const fails = p.fails + 1;
  if (fails < spec.free) return { next: { fails, locks: p.locks, last_at: nowMs, locked_until: 0 }, lockedNow: false, lockSec: 0 };
  const locks = Math.min(p.locks + 1, 100);
  const cap = kind === 'account' && adminAccount ? GUARD.account.adminMaxSec : spec.maxSec;
  const lockSec = Math.min(cap, spec.baseSec * 2 ** Math.min(locks - 1, 20));
  return { next: { fails: 0, locks, last_at: nowMs, locked_until: nowMs + lockSec * 1000 }, lockedNow: true, lockSec };
}

/** Faut-il refuser l'essai avant même de regarder le mot de passe ? On attend le délai le plus long des deux (compte, adresse). */
function guardDecision(account: Attempt | undefined, ip: Attempt | undefined, nowMs: number): { blocked: boolean; waitSec: number } {
  const waitSec = Math.max(lockLeftSec(account, nowMs), lockLeftSec(ip, nowMs));
  return { blocked: waitSec > 0, waitSec };
}

/** Phrase montrée à la personne (la même, que le compte existe ou non : on ne dit rien de plus à un inconnu). */
function retryMessage(waitSec: number): string {
  const s = Math.max(1, Math.ceil(waitSec));
  if (s < 60) return `Trop d'essais. Réessayez dans ${s} seconde${s > 1 ? 's' : ''}.`;
  const m = Math.ceil(s / 60);
  return `Trop d'essais. Réessayez dans ${m} minute${m > 1 ? 's' : ''}.`;
}

/** Clés de la table : une pour le compte tapé, une pour l'adresse. Une adresse qui n'a pas la forme d'une adresse IP n'est pas comptée. */
function guardKeys(username: string, ip: string): { account: string; ip: string | null } {
  const u = String(username ?? '').trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60); // même écriture que la recherche du compte : « a dmin » n'est pas « admin »
  const addr = String(ip ?? '').trim();
  return { account: `a:${u || '_'}`, ip: /^[0-9a-fA-F:.]{3,45}$/.test(addr) ? `i:${addr}` : null };
}
// ===== END LOGINGUARD =====

const LOGIN_ATTEMPTS = "df_login_attempts";
/** Lit un compteur. En cas d'erreur (table absente, base lente) : AUCUN compteur : une panne du blocage ne doit jamais empêcher quelqu'un de se connecter. */
async function guardRead(key: string | null): Promise<Attempt | undefined> {
  if (!key) return undefined;
  const { data, error } = await sb.from(LOGIN_ATTEMPTS).select("data").eq("id", key).maybeSingle();
  if (error) { console.error("login guard:", error.message); return undefined; }
  return cleanAttempt(data?.data);
}
async function guardCheck(uname: string, ip: string): Promise<{ blocked: boolean; waitSec: number }> {
  try {
    const k = guardKeys(uname, ip);
    const [a, i] = await Promise.all([guardRead(k.account), guardRead(k.ip)]);
    return guardDecision(a, i, Date.now());
  } catch (err) { console.error("login guard:", err); return { blocked: false, waitSec: 0 }; }
}
/** Un essai raté : on met à jour le compteur du compte et celui de l'adresse ; quand un délai commence, une ligne est écrite dans le journal d'audit. Ne plante jamais. */
async function guardFail(uname: string, ip: string, adminAccount: boolean) {
  try {
    const k = guardKeys(uname, ip);
    const now = Date.now();
    const list: [string | null, GuardKind][] = [[k.account, "account"], [k.ip, "ip"]];
    for (const [key, kind] of list) {
      if (!key) continue;
      const r = afterFailure(await guardRead(key), now, kind, adminAccount);
      const { error } = await sb.from(LOGIN_ATTEMPTS).upsert({ id: key, data: r.next, updated_at: new Date().toISOString() });
      if (error) { console.error("login guard:", error.message); continue; }
      if (r.lockedNow) await auditLog({ id: "system", name: "Système" }, "login_locked", { type: "login", id: key, label: key.slice(2) }, `Délai de ${r.lockSec} s après des essais ratés`);
    }
    if (Math.random() < 0.05) await sb.from(LOGIN_ATTEMPTS).delete().lt("updated_at", new Date(Date.now() - 2 * 86400000).toISOString());
  } catch (err) { console.error("login guard:", err); }
}
/** Bon mot de passe : le compteur du compte repart à zéro (celui de l'adresse s'éteint tout seul). */
async function guardClear(uname: string) {
  try { await sb.from(LOGIN_ATTEMPTS).delete().eq("id", guardKeys(uname, "").account); } catch (err) { console.error("login guard:", err); }
}

// ===== BEGIN TOTP (sécurité en deux étapes ; ce bloc est contrôlé par scripts/check-totp.ts) =====
const TOTP = { stepSec: 30, digits: 6, window: 1, secretBytes: 20, backupCount: 8, backupLen: 10 };
const TOTP_ROLES = ['admin', 'accountant'] as const;
/** La sécurité en deux étapes est proposée seulement à ces rôles (les opérateurs et chefs d'équipe n'y ont pas accès). */
const canUseTotp = (role: unknown): boolean => role === 'admin' || role === 'accountant';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Texte → octets. Espaces, tirets et minuscules acceptés ; un caractère hors alphabet = null. */
function base32Decode(text: string): Uint8Array | null {
  const s = String(text ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!s || s.length > 128) return null;
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** Un secret tout neuf (20 octets au hasard fournis par l'appelant : crypto.getRandomValues). */
const secretFromBytes = (bytes: Uint8Array): string => base32Encode(bytes.slice(0, TOTP.secretBytes));
/** Secret écrit par groupes de 4 pour être recopié à la main. */
const prettySecret = (s: string): string => String(s).replace(/(.{4})/g, '$1 ').trim();

const stepOf = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP.stepSec);

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg as BufferSource));
}

/** Le code à 6 chiffres d'un pas de 30 secondes (HOTP, RFC 4226). */
async function codeAtStep(secret: string, step: number): Promise<string> {
  const key = base32Decode(secret);
  if (!key || !key.length) return '';
  const msg = new Uint8Array(8);
  let s = Math.max(0, Math.floor(step));
  for (let i = 7; i >= 0; i--) { msg[i] = s & 255; s = Math.floor(s / 256); }
  const h = await hmacSha1(key, msg);
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** TOTP.digits).padStart(TOTP.digits, '0');
}

/** « 123 456 », « 123456 » : seulement 6 chiffres sont acceptés ; sinon null. */
function cleanCode(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}

/** Le code est-il bon à cet instant (±30 s pour les horloges un peu décalées) ? Rend le pas trouvé, ou null.
 *  `lastStep` = dernier pas déjà utilisé : un même code ne sert qu'une fois (on ne peut pas le rejouer). */
async function verifyTotp(secret: string, raw: unknown, nowMs: number, lastStep = 0): Promise<number | null> {
  const code = cleanCode(raw);
  if (!code) return null;
  const now = stepOf(nowMs);
  let found: number | null = null;
  for (let d = -TOTP.window; d <= TOTP.window; d++) {
    const st = now + d;
    if (st <= lastStep) continue;
    if ((await codeAtStep(secret, st)) === code && found === null) found = st; // on teste tous les pas : même durée quel que soit le résultat
  }
  return found;
}

/** Lien que les applis d'authentification savent lire (pour le bouton « Ouvrir dans l'appli » et le QR code). */
function otpauthUri(secret: string, account: string, issuer = 'Gestion Pro'): string {
  const a = encodeURIComponent(String(account).slice(0, 60) || 'compte');
  const i = encodeURIComponent(issuer);
  return `otpauth://totp/${i}:${a}?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=${TOTP.digits}&period=${TOTP.stepSec}`;
}

// ---- Codes de secours : 8 codes à usage unique, pour le téléphone perdu. Seule leur empreinte est gardée. ----
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sans i, l, o, 0, 1 (faciles à confondre)
function backupCodeFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < TOTP.backupLen; i++) s += BACKUP_ALPHABET[bytes[i] % BACKUP_ALPHABET.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}
/** Ce que la personne tape (majuscules, espaces, tiret ou non) → forme normale ; sinon null. */
function cleanBackupCode(raw: unknown): string | null {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${BACKUP_ALPHABET}]{${TOTP.backupLen}}$`).test(s) ? s : null;
}
/** Empreinte d'un code de secours (SHA-256 avec l'identifiant du compte) : le code lui-même n'est jamais gardé. */
async function backupHash(userId: string, code: string): Promise<string> {
  const d = new TextEncoder().encode(`gp-backup:${userId}:${cleanBackupCode(code) ?? ''}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d)), b => b.toString(16).padStart(2, '0')).join('');
}
// ===== END TOTP =====

const TOTP_TABLE = "df_totp";
interface TotpRow { secret: string; enabled: boolean; last_step: number; backup: string[]; created_at: string }
/** Lit la ligne d'un compte. Panne de lecture = on lève une erreur : on ne laisse JAMAIS passer un compte protégé par erreur. */
async function totpGet(uid: string): Promise<TotpRow | null> {
  const { data, error } = await sb.from(TOTP_TABLE).select("data").eq("id", uid).maybeSingle();
  if (error) throw new Error("totp: " + error.message);
  const d: any = data?.data;
  if (!d || typeof d.secret !== "string") return null;
  return { secret: d.secret, enabled: d.enabled === true, last_step: nat(d.last_step), backup: Array.isArray(d.backup) ? d.backup.filter((x: any) => typeof x === "string").slice(0, 20) : [], created_at: String(d.created_at || "") };
}
async function totpPut(uid: string, row: TotpRow) {
  const { error } = await sb.from(TOTP_TABLE).upsert({ id: uid, data: row, updated_at: new Date().toISOString() });
  if (error) throw new Error("totp: " + error.message);
}
const totpRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));
/** Vérifie un code à 6 chiffres OU un code de secours. Rend {ok, row} (row à enregistrer si ok). */
async function totpCheck(uid: string, row: TotpRow, raw: unknown): Promise<{ ok: boolean; row: TotpRow }> {
  const step = await verifyTotp(row.secret, raw, Date.now(), row.last_step);
  if (step !== null) return { ok: true, row: { ...row, last_step: step } };
  const bc = cleanBackupCode(raw);
  if (bc) {
    const h = await backupHash(uid, bc);
    if (row.backup.includes(h)) return { ok: true, row: { ...row, backup: row.backup.filter(x => x !== h) } };
  }
  return { ok: false, row };
}
async function newBackupCodes(uid: string): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = [], hashes: string[] = [];
  for (let i = 0; i < TOTP.backupCount; i++) { const c = backupCodeFromBytes(totpRandom(TOTP.backupLen)); codes.push(c); hashes.push(await backupHash(uid, c)); }
  return { codes, hashes };
}
async function passwordOk(uid: string, password: unknown): Promise<boolean> {
  const { data: c } = await sb.from("df_credentials").select("password_hash").eq("user_id", uid).maybeSingle();
  return !!c && typeof password === "string" && checkPw(password, c.password_hash);
}

// Routes avec session. Un seul compte à la fois, rien n'est jamais renvoyé du secret après l'activation.
async function totpStatus(_req: any, res: any, me: any) {
  if (!canUseTotp(me.role)) return res.json({ eligible: false, enabled: false, backup_left: 0 });
  try { const r = await totpGet(me.id); return res.json({ eligible: true, enabled: !!r?.enabled, backup_left: r?.enabled ? r.backup.length : 0 }); }
  catch (e) { console.error(e); return res.status(500).json({ error: "Lecture impossible, réessaie." }); }
}
async function totpStart(req: any, res: any, me: any) {
  if (!canUseTotp(me.role)) return res.status(403).json({ error: "Non permis pour ce rôle." });
  if (!(await passwordOk(me.id, req.body?.password))) return res.status(401).json({ error: "Mot de passe incorrect." });
  const cur = await totpGet(me.id);
  if (cur?.enabled) return res.status(400).json({ error: "La double étape est déjà active." });
  const secret = secretFromBytes(totpRandom(TOTP.secretBytes));
  await totpPut(me.id, { secret, enabled: false, last_step: 0, backup: [], created_at: new Date().toISOString() });
  return res.json({ secret, uri: otpauthUri(secret, String(me.username || me.name || "compte")) });
}
async function totpEnable(req: any, res: any, me: any) {
  if (!canUseTotp(me.role)) return res.status(403).json({ error: "Non permis pour ce rôle." });
  const row = await totpGet(me.id);
  if (!row) return res.status(400).json({ error: "Commence par « Activer »." });
  if (row.enabled) return res.status(400).json({ error: "La double étape est déjà active." });
  const step = await verifyTotp(row.secret, req.body?.code, Date.now(), 0);
  if (step === null) return res.status(400).json({ error: "Code incorrect. Vérifie l'heure du téléphone et réessaie." });
  const bk = await newBackupCodes(me.id);
  await totpPut(me.id, { ...row, enabled: true, last_step: step, backup: bk.hashes });
  await auditLog(me, "totp_on", { type: "users", id: me.id, label: auditLabelOf(await getUserRow(me.id)) }, "Double étape activée");
  return res.json({ ok: true, backup_codes: bk.codes });
}
async function totpDisable(req: any, res: any, me: any) {
  const row = await totpGet(me.id);
  if (!row?.enabled) return res.status(400).json({ error: "La double étape n'est pas active." });
  if (!(await passwordOk(me.id, req.body?.password))) return res.status(401).json({ error: "Mot de passe incorrect." });
  const chk = await totpCheck(me.id, row, req.body?.code);
  if (!chk.ok) return res.status(401).json({ error: "Code incorrect." });
  await sb.from(TOTP_TABLE).delete().eq("id", me.id);
  await auditLog(me, "totp_off", { type: "users", id: me.id, label: auditLabelOf(await getUserRow(me.id)) }, "Double étape désactivée");
  return res.json({ ok: true });
}
async function totpNewBackup(req: any, res: any, me: any) {
  const row = await totpGet(me.id);
  if (!row?.enabled) return res.status(400).json({ error: "La double étape n'est pas active." });
  if (!(await passwordOk(me.id, req.body?.password))) return res.status(401).json({ error: "Mot de passe incorrect." });
  const chk = await totpCheck(me.id, row, req.body?.code);
  if (!chk.ok) return res.status(401).json({ error: "Code incorrect." });
  const bk = await newBackupCodes(me.id);
  await totpPut(me.id, { ...chk.row, backup: bk.hashes });
  return res.json({ ok: true, backup_codes: bk.codes });
}
/** Le responsable remet à zéro la double étape d'un AUTRE compte (téléphone perdu d'un Comptable). Jamais la sienne. */
async function totpReset(req: any, res: any, me: any) {
  if (me.role !== "admin") return res.status(403).json({ error: "Réservé au responsable." });
  const id = String(req.body?.userId || "");
  if (!id || id === me.id) return res.status(400).json({ error: "Choisis un autre compte." });
  const u = await getUserRow(id);
  if (!u) return res.status(404).json({ error: "Compte introuvable." });
  await sb.from(TOTP_TABLE).delete().eq("id", id);
  await auditLog(me, "totp_reset", { type: "users", id, label: auditLabelOf(u) }, "Double étape remise à zéro par le responsable");
  return res.json({ ok: true });
}

// ---------- demande de connexion hors horaires (le responsable décide ; une demande en attente par personne) ----------
const ACCESS_ROLES = ['employee', 'accountant', 'team_lead'];
const accessShiftOf = (u: any): 'day' | 'night' => (u?.shift === 'night' ? 'night' : 'day');
/** Ce que la personne a le droit de voir de sa dernière demande (jamais les données des autres). */
async function myAccessRequest(userId: string): Promise<any> {
  const { data } = await sb.from(ACCESS_REQ).select('data').eq('id', `acc-${userId}`).maybeSingle();
  const d = data?.data;
  if (!d) return null;
  return { status: d.status, reason: d.reason_refused || undefined, created_at: d.created_at, until: d.until || undefined };
}
async function accessRequest(req: any, res: any) {
  const { username, password } = req.body || {};
  const why = String(req.body?.reason || '').trim().slice(0, 300);
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
  if (why.length < 5) return res.status(400).json({ error: 'Écris la raison de ta demande (5 caractères minimum).' });
  const uname = username.trim().toLowerCase();
  const gd = await guardCheck(uname, String(req.headers?.ip || ''));
  if (gd.blocked) return res.status(429).json({ error: retryMessage(gd.waitSec), code: 'locked', retry_after: gd.waitSec });
  const { data: cred } = await sb.from('df_credentials').select('*').eq('username', uname).maybeSingle();
  if (!cred || !checkPw(password, cred.password_hash)) {
    await sleep(500);
    await guardFail(uname, String(req.headers?.ip || ''), false);
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
  }
  const user = await getUserRow(cred.user_id);
  if (!user || user.status === 'blocked') return res.status(403).json({ error: 'Compte bloqué par l\'administrateur.' });
  if (!ACCESS_ROLES.includes(user.role)) return res.status(400).json({ error: 'Cette demande ne concerne pas ce compte.' });
  const acc = await shiftAccess(user);
  if (acc.ok) return res.status(400).json({ error: 'Tu peux déjà te connecter.', code: 'allowed' });
  if (acc.block) return res.status(403).json({ error: acc.message });
  const id = `acc-${user.id}`;
  const { data: ex } = await sb.from(ACCESS_REQ).select('data').eq('id', id).maybeSingle();
  if (ex?.data?.status === 'pending') return res.status(409).json({ error: 'Ta demande est déjà en attente. Le responsable doit la valider.', code: 'pending', request: await myAccessRequest(user.id) });
  const now = new Date().toISOString();
  await sb.from(ACCESS_REQ).upsert({ id, data: { id, user_id: user.id, name: user.name, username: uname, role: user.role, shift: accessShiftOf(user), reason: why, status: 'pending', created_at: now }, updated_at: now });
  await auditLog(user, 'access_request', { type: 'users', id: user.id, label: auditLabelOf(user) }, `Demande hors horaires : ${why}`);
  await later(pushAdmins('validations', notifyText('access', { name: user.name }), `access:${id}`.slice(0, 60), { go: 'validations', filter: 'access', nav: `val-acc-${id}` }));
  return res.json({ ok: true, request: await myAccessRequest(user.id) });
}
/** Le responsable décide : approve (fin de vacation, 1/2/4/8/12 h ou heure précise), refuse (motif), change (nouvelle heure de fin d'une autorisation donnée). */
async function accessDecide(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { id, decision, mode, value } = req.body || {};
  if (typeof id !== 'string' || !['approve', 'refuse', 'change'].includes(decision)) return res.status(400).json({ error: 'Demande invalide.' });
  const { data: row } = await sb.from(ACCESS_REQ).select('data').eq('id', id).maybeSingle();
  const r = row?.data;
  if (!r) return res.status(404).json({ error: 'Demande introuvable.' });
  const user = await getUserRow(r.user_id);
  if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
  const now = new Date().toISOString();
  const save = (d: any) => sb.from(ACCESS_REQ).upsert({ id, data: d, updated_at: now });
  const label = { type: 'users', id: String(user.id), label: auditLabelOf(user) };
  if (decision === 'refuse') {
    if (r.status !== 'pending') return res.status(409).json({ error: 'Cette demande est déjà traitée.' });
    if (reasonOf(req.body).length < 3) return res.status(400).json({ error: REASON_ERR });
    await save({ ...r, status: 'refused', reason_refused: reasonOf(req.body), decided_at: now, decided_by: me.id });
    await auditLog(me, 'access_refused', label, `Refusée : ${reasonOf(req.body)}`);
    return res.json({ ok: true });
  }
  if (decision === 'approve' && r.status !== 'pending') return res.status(409).json({ error: 'Cette demande est déjà traitée.' });
  if (decision === 'change' && r.status !== 'approved') return res.status(409).json({ error: 'Aucune autorisation à modifier.' });
  const st = await getSettings();
  const until = resolveAccessUntil(accessShiftOf(user), st, Date.now(), mode, value);
  if (until === null) return res.status(400).json({ error: 'Heure de fin invalide (dans les 48 prochaines heures).' });
  const iso = new Date(until).toISOString();
  await sb.from(T.users).upsert({ id: user.id, data: { ...user, access_until: iso, force_logout_at: undefined }, updated_at: now });
  await save({ ...r, status: 'approved', until: iso, decided_at: now, decided_by: me.id });
  await auditLog(me, decision === 'approve' ? 'access_approved' : 'access_changed', label, `Autorisée jusqu'à ${new Date(until + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} (Madagascar)`);
  return res.json({ ok: true, until: iso });
}

async function login(req: any, res: any) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
  }
  if (!SECRET) return res.status(500).json({ error: 'Serveur mal configuré (SESSION_SECRET manquant).' });
  const uname = username.trim().toLowerCase();

  // M16.3 : trop d'essais ratés (par compte ou par adresse) = un délai, sans même regarder le mot de passe. Même réponse que le compte existe ou non.
  const ip = String(req.headers?.ip || '');
  const gd = await guardCheck(uname, ip);
  if (gd.blocked) return res.status(429).json({ error: retryMessage(gd.waitSec), code: 'locked', retry_after: gd.waitSec });

  const { data: cred } = await sb.from('df_credentials').select('*').eq('username', uname).maybeSingle();
  if (!cred || !checkPw(password, cred.password_hash)) {
    await sleep(500);
    let adminAccount = false;
    if (cred) { try { adminAccount = (await getUserRow(cred.user_id))?.role === 'admin'; } catch { /* on compte comme un compte ordinaire */ } }
    await guardFail(uname, ip, adminAccount);
    const notice = await authNotice(uname, password);
    return res.status(401).json({ error: notice || 'Pseudo ou mot de passe incorrect.' });
  }
  // M16.4 : double étape (facultative). Mot de passe bon + code absent = on le demande (pas compté comme un essai raté) ; code faux = compté comme un raté.
  let totpRow: TotpRow | null = null;
  try { totpRow = await totpGet(cred.user_id); }
  catch (e) { console.error(e); return res.status(503).json({ error: 'Vérification impossible pour le moment, réessaie dans un instant.' }); } // jamais « on laisse passer » : le compte est protégé
  if (totpRow?.enabled) {
    if (!String(req.body?.code ?? '').trim()) return res.status(401).json({ error: 'Entre le code à 6 chiffres de ton application (ou un code de secours).', code: 'totp_required' });
    const chk = await totpCheck(cred.user_id, totpRow, req.body?.code);
    if (!chk.ok) {
      await sleep(500);
      await guardFail(uname, ip, (await getUserRow(cred.user_id))?.role === 'admin');
      return res.status(401).json({ error: 'Code incorrect.', code: 'totp_required' });
    }
    try { await totpPut(cred.user_id, chk.row); } catch (e) { console.error(e); return res.status(503).json({ error: 'Vérification impossible pour le moment, réessaie dans un instant.' }); }
  }
  await guardClear(uname);
  const user = await getUserRow(cred.user_id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Compte bloqué par l\'administrateur.' });
  const mm = await maintenanceMessage(user);
  if (mm) return res.status(503).json({ error: mm, code: 'maintenance' });
  const acc = await shiftAccess(user);
  if (!acc.ok) return res.status(403).json({ error: acc.message, code: 'shift', can_request: !acc.block, request: acc.block ? null : await myAccessRequest(user.id) });

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

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

async function checkMessage(rec: any, existing: any, me: any, admin: boolean, now: string): Promise<{ ok: boolean; save?: any; reason?: string }> {
  if (existing) {
    // Supprimer pour tous : l'auteur, ou l'admin (modération). Une trace reste dans la conversation.
    if (rec.deleted_at) {
      if (existing.sender_id !== me.id && !admin) return { ok: false };
      if (existing.deleted_at) return { ok: true, save: existing };
      const save = { ...existing, message: '', deleted_at: now, deleted_by: existing.sender_id === me.id ? 'sender' : 'admin' };
      for (const k of ['attachment_url', 'attachment_name', 'attachment_kind', 'pinned', 'pinned_at', 'reply_to', 'edited_at', 'reactions']) delete save[k];
      return { ok: true, save };
    }
    // Réaction emoji : tout participant à la conversation, mais seulement sa propre réaction
    if (rec.reactions && typeof rec.reactions === 'object' && !existing.deleted_at && rec.message === existing.message && !!rec.pinned === !!existing.pinned) {
      const to = existing.recipient_id || 'all';
      let visible = admin || to === 'all' || existing.sender_id === me.id || to === me.id;
      if (!visible && to.startsWith(GROUP_PREFIX)) { const g = await getGroup(to); visible = !!g && (g.members || []).includes(me.id); }
      if (!visible) return { ok: false };
      const next: any = {};
      for (const e of REACTION_EMOJIS) {
        const others: string[] = ((existing.reactions || {})[e] || []).filter((x: string) => x !== me.id);
        const mine = Array.isArray(rec.reactions[e]) && rec.reactions[e].includes(me.id);
        const list = mine ? [...others, me.id] : others;
        if (list.length) next[e] = list.slice(0, 60);
      }
      // une seule réaction par personne
      const mineIn = Object.keys(next).filter(e => next[e].includes(me.id));
      for (const e of mineIn.slice(0, -1)) { next[e] = next[e].filter((x: string) => x !== me.id); if (!next[e].length) delete next[e]; }
      const save2: any = { ...existing };
      if (Object.keys(next).length) save2.reactions = next; else delete save2.reactions;
      return { ok: true, save: save2 };
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
  for (const k of ['deleted_at', 'deleted_by', 'edited_at', 'pinned', 'pinned_at', 'reactions']) delete save[k];
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
  const gAdmins: string[] = Array.isArray(existing.admins) ? existing.admins : [];
  const isOwner = existing.owner_id === me.id || admin;
  if (isOwner || gAdmins.includes(me.id)) {
    if (name.length < 1 || name.length > 40 || !(await allExist())) return { ok: false };
    // Un administrateur du groupe ne peut retirer ni le responsable ni un autre administrateur
    if (!isOwner) {
      const keep = [existing.owner_id, ...gAdmins].filter((x: string) => x !== me.id);
      if (!keep.every((x: string) => members.includes(x))) return { ok: false };
    }
    const save: any = { ...existing, name, members };
    if (!members.includes(existing.owner_id)) save.owner_id = members[0]; // le créateur est parti : le premier membre devient responsable
    // Photo du groupe : seulement un lien de notre stockage (chaîne vide = retirer la photo)
    if (typeof rec.avatar_url === 'string') {
      if (rec.avatar_url === '') delete save.avatar_url;
      else if (isBucketUrl(rec.avatar_url)) save.avatar_url = rec.avatar_url;
      else return { ok: false };
    }
    // Description (200 caractères max)
    if (typeof rec.description === 'string') {
      const d = rec.description.trim().slice(0, 200);
      if (d) save.description = d; else delete save.description;
    }
    // Administrateurs du groupe : seul le responsable (ou l'administrateur du site) les choisit
    if (isOwner && Array.isArray(rec.admins)) {
      save.admins = [...new Set<string>(rec.admins.filter((x: any) => typeof x === 'string' && members.includes(x) && x !== save.owner_id))].slice(0, 20);
    } else if (gAdmins.length) {
      save.admins = gAdmins.filter((x: string) => members.includes(x));
    }
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
const stripUser = (u: any, me: any) => (me.role === 'admin' || u.id === me.id ? u : { ...u, phone: undefined, cv_url: undefined, cv_data: undefined, hr: undefined }); // `hr` (dossier du salarié, M5.1) : admin et salarié concerné seulement
const stripPost = (p: any, me: any, mates?: Set<string>) =>
  me.role === 'admin' || p.employee_id === me.id || (!!mates && mates.has(String(p.employee_id)))
    ? withoutClientPrice(p, me)
    : { ...withoutClientPrice(p, me), start_proof_url: '', start_proof_urls: [], end_proof_url: '', end_proof_urls: [] };

async function state(req: any, res: any, me: any) {
  const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : '1970-01-01T00:00:00.000Z';
  const serverTime = new Date(Date.now() - 3000).toISOString();
  const out: Record<string, { changed: any[]; ids: string[] }> = {};
  const admin = me.role === 'admin';
  if (isOperator(me.role)) await touchPresence(me); // seuls les opérateurs comptent comme « en ligne » (vacations, file d'attente)

  // Groupes : chacun ne reçoit que les groupes dont il est membre (l'admin voit tout)
  const { data: groupRows } = await sb.from(T.groups).select('id, data, updated_at');
  const myGroups = (groupRows || []).filter((r: any) => admin || (r.data.members || []).includes(me.id));
  const myGroupIds = myGroups.map((r: any) => r.id).filter((id: string) => /^[A-Za-z0-9_]+$/.test(id));

  // Chef d'équipe : il voit les preuves (photos) des opérateurs de SON équipe, pas celles des autres
  let teamMates: Set<string> | undefined;
  if (me.role === 'team_lead') {
    const { data: tu } = await sb.from(T.users).select('id, data');
    teamMates = new Set((tu || []).filter((r: any) => canDecidePost(me, r.data)).map((r: any) => String(r.id)));
  }

  for (const col of COLS) {
    if (!canReadCol(me.role, col) || (col === 'sheets' && !admin && !isOperator(me.role))) { out[col] = { changed: [], ids: [] }; continue; } // Comptable et Chef d'équipe : aucun tableau // journal de sécurité et finances : jamais envoyés à un employé
    if (col === 'groups') {
      const sinceMs = new Date(since).getTime();
      out[col] = { changed: myGroups.filter((r: any) => new Date(r.updated_at).getTime() >= sinceMs).map((r: any) => r.data), ids: myGroups.map((r: any) => r.id) };
      continue;
    }
    const scope = (q: any) => {
      if (admin) return q;
      if (col === 'advances') return q.eq('data->>employee_id', me.id);
      if (col === 'leaves') return q.eq('data->>employee_id', me.id); // un salarié ne voit que ses demandes de congé
      if (col === 'shifts') return q.eq('data->>employee_id', me.id); // un salarié ne voit que SON planning
      if (col === 'sheets') return q.eq('data->>owner_id', me.id); // un opérateur ne voit que SES tableaux
      if (col === 'reviews') return q.eq('data->>employee_id', me.id).eq('data->>status', 'shared'); // un salarié ne voit que SES fiches PARTAGÉES
      if (col === 'news') {
        // Publications validées (ou anciennes, sans statut) + les siennes (en attente ou refusées)
        return /^[A-Za-z0-9_-]+$/.test(String(me.id))
          ? q.or(`data->>status.is.null,data->>status.eq.published,data->>author_id.eq.${me.id}`)
          : q.or('data->>status.is.null,data->>status.eq.published');
      }
      if (col === 'messages') {
        const grp = myGroupIds.length ? `,data->>recipient_id.in.(${myGroupIds.join(',')})` : '';
        return q.or(`data->>recipient_id.eq.all,data->>recipient_id.eq.${me.id},data->>sender_id.eq.${me.id}${grp}`);
      }
      return q;
    };
    let changed: any[] | null, ids: any[] | null;
    if (col === 'news' && !admin) {
      // Actualités : chacun ne reçoit que les publications de son public (le tri se fait ici, pas à l'écran). Le serveur envoie aussi la liste des numéros visibles : le reste disparaît chez lui.
      const { data: nrows } = await scope(sb.from(T.news).select('id, data, updated_at'));
      const seen = (nrows || []).filter((r: any) => canSeeNews(r.data, me));
      changed = seen.filter((r: any) => String(r.updated_at) >= since).map((r: any) => ({ data: r.data }));
      ids = seen.map((r: any) => ({ id: r.id }));
    } else {
      [{ data: changed }, { data: ids }] = await Promise.all([
        scope(sb.from(T[col]).select('data').gte('updated_at', since)),
        scope(sb.from(T[col]).select('id')),
      ]);
    }
    let recs = (changed || []).map((r: any) => r.data);
    if (col === 'users') recs = recs.map((u: any) => stripUser(u, me));
    if (col === 'reviews' && me.role !== 'admin') recs = recs.map((r: any) => { const { improvements: _hidden, ...mine } = r; return mine; }); // jamais les « points à améliorer » côté salarié (D9)
    if (col === 'posts') recs = recs.map((p: any) => stripPost(p, me, teamMates));
    if (col === 'contracts') recs = recs.map((c: any) => withoutClientPrice(c, me));
    if (col === 'settings') recs = recs.map((r: any) => stripCompany(stripSettings(r, me), me));
    out[col] = { changed: recs, ids: (ids || []).map((r: any) => r.id) };
  }
  let resets: any[] = [];
  if (admin) {
    const { data: rs } = await sb.from(RESETS).select('data').order('updated_at', { ascending: true });
    resets = (rs || []).map((r: any) => ({ ...r.data, password_hash: undefined })).filter((r: any) => r.status === 'pending');
  }
  let accessRequests: any[] = [];
  if (admin) {
    const { data: ar } = await sb.from(ACCESS_REQ).select('data').order('updated_at', { ascending: true });
    accessRequests = (ar || []).map((x: any) => x.data).filter((x: any) => x.status === 'pending' || (x.status === 'approved' && Date.parse(x.until || '') > Date.now()));
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
  const pres = (presRows || []).map(({ typing_to: _tt, typing_at: _ta, ...r }: any) => r); // l'indicateur « écrit… » passe par sa propre route
  // Coches « lu » : jusqu'où les autres ont lu mes conversations (l'admin voit tout)
  let readsQ = sb.from(CHAT_READS).select('user_id, thread, ms');
  if (!admin) readsQ = readsQ.in('thread', [me.id, ...myGroupIds]);
  const { data: readRows } = await readsQ;
  const reads = (readRows || []).map((r: any) => ({ user_id: r.user_id, thread: r.thread, ms: Number(r.ms) }));
  return res.json({ serverTime, me, collections: out, reads, resets, accessRequests, signups, profileRequests, presence: admin ? pres : undefined, queue: admin ? undefined : queueOf(pres, me.id) });
}

// ---------- « est en train d'écrire… » : signe très court (6 s), lu toutes les 2-3 s par la messagerie ouverte ----------
async function typingPing(req: any, res: any, me: any) {
  const to = String((req.body || {}).to || '').slice(0, 80);
  if (!to || !/^[A-Za-z0-9_\-]+$/.test(to)) return res.status(400).json({ error: 'Conversation inconnue.' });
  await sb.from(PRESENCE).upsert({ user_id: me.id, typing_to: to, typing_at: new Date().toISOString() });
  return res.json({ ok: true });
}
async function typingList(req: any, res: any, me: any) {
  const since = new Date(Date.now() - 6000).toISOString();
  const { data: rows } = await sb.from(PRESENCE).select('user_id, typing_to, typing_at').gte('typing_at', since);
  const admin = me.role === 'admin';
  const { data: groupRows } = await sb.from(T.groups).select('id, data');
  const myGroupIds = (groupRows || []).filter((r: any) => admin || (r.data.members || []).includes(me.id)).map((r: any) => r.id);
  const out = (rows || [])
    .filter((r: any) => r.user_id !== me.id && r.typing_to && (r.typing_to === 'all' || r.typing_to === me.id || myGroupIds.includes(r.typing_to)))
    .map((r: any) => ({ user_id: r.user_id, to: r.typing_to }));
  return res.json({ typing: out });
}

// ---------- sync (écriture) ----------
async function sync(req: any, res: any, me: any) {
  const changes = (req.body && req.body.changes) || {};
  const admin = me.role === 'admin';
  const rejected: { col: string; id: string; reason: string }[] = [];
  const now = new Date().toISOString();
  let tookPost = false;
  const pushJobs: Promise<unknown>[] = [];

  for (const col of COLS) {
    const ch = changes[col];
    if (!ch) continue;
    const upserts: any[] = Array.isArray(ch.upserts) ? ch.upserts : [];
    const deletes: string[] = Array.isArray(ch.deletes) ? ch.deletes : [];

    if (col === 'entries') {
      // Écritures comptables (M14.3) : la synchro n'écrit ni ne supprime JAMAIS une écriture, quel que soit le rôle. Seules les routes accounting-* le font (vérification, numéro attribué par SQL).
      for (const r of upserts) rejected.push({ col, id: String((r && r.id) || ''), reason: 'forbidden' });
      for (const id of deletes) rejected.push({ col, id: String(id), reason: 'forbidden' });
      continue;
    }

    if (!admin && ADMIN_ONLY_WRITE.includes(col) && !canWriteMoneyCol(me.role, col)) {
      // Finances : un employé ne peut rien écrire ni supprimer, quoi qu'il envoie
      for (const r of upserts) rejected.push({ col, id: String((r && r.id) || ''), reason: 'forbidden' });
      for (const id of deletes) rejected.push({ col, id: String(id), reason: 'forbidden' });
      continue;
    }

    for (const rec of upserts) {
      if (!rec || typeof rec.id !== 'string') continue;
      const { data: row } = await sb.from(T[col]).select('data').eq('id', rec.id).maybeSingle();
      const existing = row?.data as any | undefined;
      let toSave: any = rec;

      if (col === 'sheets') {
        // Tableaux (M12.4) : l'opérateur écrit ses tableaux ; l'admin (lecture seule) et les autres rôles sont refusés
        const { data: mine } = await sb.from(T.sheets).select('id, data').eq('data->>owner_id', me.id);
        const others = (mine || []).filter((x: any) => x.id !== rec.id);
        const personal = others.filter((x: any) => !x.data.post_id);
        const counts = { active: personal.filter((x: any) => !x.data.deleted_at).length, total: personal.length, mission: others.length - personal.length };
        let sessionRow: any = null; // tableau de mission (M18.6) : la session doit exister et être celle de l'opérateur
        if (!existing && typeof rec.post_id === 'string' && rec.post_id) { const { data: pr } = await sb.from(T.posts).select('data').eq('id', rec.post_id).maybeSingle(); sessionRow = pr?.data || null; }
        const sv = cleanSheetWrite(rec, existing, { id: me.id, name: String(me.name || ''), role: me.role }, now, counts, sessionRow);
        if (!sv.ok) { rejected.push({ col, id: rec.id, reason: sv.reason }); continue; }
        toSave = sv.save;
      } else if (col === 'reviews') {
        // Évaluations (M5.4) : le responsable écrit ; le salarié ne fait qu'accuser lecture de sa fiche partagée
        if (admin && !existing) {
          const eu = await getUserRow(String(rec.employee_id || ''));
          if (!eu || eu.role === 'admin') { rejected.push({ col, id: rec.id, reason: 'employee' }); continue; }
          rec.employee_name = eu.name;
        }
        const rv = cleanReview(rec, existing, { id: me.id, admin }, now);
        if (!rv.ok) { rejected.push({ col, id: rec.id, reason: rv.reason }); continue; }
        toSave = rv.save;
      } else if (col === 'leaves') {
        // Congés (M5.2) : tous les rôles passent par la même règle ; le salarié ne touche qu'à SA demande, l'admin décide
        const empId = existing ? String(existing.employee_id || '') : (admin ? String(rec.employee_id || '') : me.id);
        if (admin && !existing) {
          const eu = await getUserRow(empId);
          if (!eu || eu.role === 'admin') { rejected.push({ col, id: rec.id, reason: 'employee' }); continue; }
          if (!rec.employee_name) rec.employee_name = eu.name;
        }
        const lv = cleanLeave(rec, existing, { id: me.id, name: String(me.name || ''), admin }, now, await leaveCtx(empId));
        if (!lv.ok) { rejected.push({ col, id: rec.id, reason: lv.reason }); continue; }
        toSave = lv.save;
      } else if (col === 'shifts') {
        // Planning (M15.2) : seul le responsable écrit ; l'entrée est revérifiée (identifiant calculé, date proche) ; le salarié doit exister
        if (!admin) { rejected.push({ col, id: rec.id, reason: 'forbidden' }); continue; }
        const sh = cleanShift(rec, existing, String(me.id), now, { today: madagascarDate(Date.now()) });
        if (!sh.ok) { rejected.push({ col, id: rec.id, reason: sh.reason }); continue; }
        if (!existing) {
          const eu = await getUserRow(String(sh.save.employee_id));
          if (!eu || eu.role === 'admin') { rejected.push({ col, id: rec.id, reason: 'employee' }); continue; }
        }
        toSave = sh.save;
      } else if (col === 'messages' || col === 'groups') {
        const v = col === 'messages' ? await checkMessage(rec, existing, me, admin, now) : await checkGroup(rec, existing, me, admin, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: (v as any).reason || 'forbidden' }); continue; }
        toSave = v.save;
      } else if (!admin && !(isMoneyRole(me.role) && MONEY_COLS.includes(col))) {
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
          if (ok) {
            toSave = { ...rec, calculated_ar: existing?.calculated_ar, admin_notes: existing?.admin_notes, client_price_ar: existing?.client_price_ar, client_id: existing?.client_id }; // le prix client et le lien client ne viennent jamais d'un employé
            // Liste de tâches (M6.3) : seules les cases de la mission comptent ; envoi refusé si la mission exige tout coché
            const { data: crow } = await sb.from(T.contracts).select('data').eq('data->>post_number', String(rec.post_number)).maybeSingle();
            const tasks = Array.isArray((crow as any)?.data?.tasks) ? (crow as any).data.tasks : [];
            const done = cleanTasksDone(rec.tasks_done, tasks);
            if (tasks.length) toSave.tasks_done = done; else delete toSave.tasks_done;
            if (rec.status === 'pending_end' && tasksBlockSubmit((crow as any)?.data, done)) { rejected.push({ col, id: rec.id, reason: 'tasks' }); continue; }
          }
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
      if (col === 'settings') { toSave = cleanSettingsRecord(rec, existing, me, now); toSave = { ...toSave, news_publish: cleanNewsPolicy(rec.news_publish === undefined ? existing?.news_publish : rec.news_publish) }; toSave = applyBudgets(toSave, rec, existing); toSave = applyPerformance(toSave, rec, existing); toSave = applyHealthAcks(toSave, rec, existing); toSave = applyStockCategories(toSave, rec, existing); toSave = applyStockSpaces(toSave, rec, existing); } // seul l'admin arrive ici ; `company` et `budgets` sont revérifiés
      if (col === 'settings') {
        // Modèles de mission (M6.2) : revérifiés ; un vieux site qui ne les envoie pas ne les efface pas
        const sentTpl = (rec as any).mission_templates === undefined ? (existing as any)?.mission_templates : (rec as any).mission_templates;
        if (sentTpl !== undefined) toSave = { ...toSave, mission_templates: cleanMissionTemplates(sentTpl) };
        // Missions récurrentes (M15.1) : revérifiées ; un vieux site qui ne les envoie pas ne les efface pas
        const sentRec = (rec as any).recurring_missions === undefined ? (existing as any)?.recurring_missions : (rec as any).recurring_missions;
        if (sentRec !== undefined) toSave = { ...toSave, recurring_missions: cleanRecurring(sentRec) };
        // Rapport automatique (M15.5) : réglage revérifié ; un vieux site qui ne l'envoie pas ne l'efface pas
        const sentAr = (rec as any).auto_report === undefined ? (existing as any)?.auto_report : (rec as any).auto_report;
        if (sentAr !== undefined) toSave = { ...toSave, auto_report: cleanAutoReport(sentAr) };
        // Objectifs par salarié et par équipe (M15.3) : revérifiés ; un vieux site qui ne les envoie pas ne les efface pas
        const sentGoals = (rec as any).team_goals === undefined ? (existing as any)?.team_goals : (rec as any).team_goals;
        if (sentGoals !== undefined) toSave = { ...toSave, team_goals: cleanTeamGoals(sentGoals) };
        // Budget prévu contre réel (M15.4) : plan mensuel revérifié ; un vieux site qui ne l'envoie pas ne l'efface pas
        const sentPlan = (rec as any).monthly_plan === undefined ? (existing as any)?.monthly_plan : (rec as any).monthly_plan;
        if (sentPlan !== undefined) toSave = { ...toSave, monthly_plan: cleanMonthlyPlan(sentPlan) };
        // Clôture de la comptabilité (M14.6) : écrite par la route accounting-close SEULEMENT ; ce qu'envoie le navigateur est ignoré
        if ((existing as any)?.acct_close !== undefined) toSave = { ...toSave, acct_close: (existing as any).acct_close }; else delete (toSave as any).acct_close;
      }
      if (admin && col === 'users') {
        // Dossier du salarié (M5.1) : revérifié ; un vieux site qui ne l'envoie pas ne l'efface pas
        const sentHr = (rec as any).hr === undefined ? existing?.hr : (rec as any).hr;
        const hv = cleanHrFile(sentHr);
        if (!hv.ok) { rejected.push({ col, id: rec.id, reason: 'hr_' + hv.reason }); continue; }
        toSave = { ...toSave };
        if (hv.hr) (toSave as any).hr = hv.hr; else delete (toSave as any).hr;
      }
      if (col === 'clients') {
        const v = cleanClient(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        toSave = v.save;
      }
      if (admin && col === 'contracts') {
        const v = cleanMissionDeadline(toSave);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        toSave = v.save;
        const tk = cleanMissionTasks(toSave);
        if (!tk.ok) { rejected.push({ col, id: rec.id, reason: tk.reason }); continue; }
        toSave = tk.save;
      }
      if (col === 'suppliers') {
        const v = cleanSupplier(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        toSave = v.save;
      }
      if (admin && (col === 'contracts' || col === 'posts')) {
        // Lien mission ou session → fiche client : texte court, et la fiche doit exister ; sans lien, on n'écrit pas le champ.
        const ref = cleanClientRef((toSave as any)?.client_id);
        if (!ref.ok) { rejected.push({ col, id: rec.id, reason: 'client' }); continue; }
        if (ref.id) {
          const { data: crow } = await sb.from(T.clients).select('id').eq('id', ref.id).maybeSingle();
          if (!crow) { rejected.push({ col, id: rec.id, reason: 'client' }); continue; }
          toSave = { ...toSave, client_id: ref.id };
        } else if (toSave && typeof toSave === 'object' && 'client_id' in toSave) {
          toSave = { ...toSave }; delete (toSave as any).client_id;
        }
      }
      if (col === 'cash') {
        // Un paiement lié à une facture (ou portant un reçu) ne se modifie JAMAIS par la synchro : il est créé par invoice-pay et reste tel quel
        if (existing && (existing.invoice_id || existing.receipt_no)) { rejected.push({ col, id: rec.id, reason: 'invoice_locked' }); continue; }
        const v = cleanCash(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        toSave = v.save;
        if (v.save.supplier_id) { const { data: sr } = await sb.from(T.suppliers).select('id').eq('id', v.save.supplier_id).maybeSingle(); if (!sr) { rejected.push({ col, id: rec.id, reason: 'supplier' }); continue; } }
        if (v.save.po_id) { const { data: pr } = await sb.from(T.purchases).select('id').eq('id', v.save.po_id).maybeSingle(); if (!pr) { rejected.push({ col, id: rec.id, reason: 'po' }); continue; } }
      }
      if (col === 'invoices') {
        // La synchro n'écrit que des BROUILLONS. Émission, avoir et paiement passent par invoice-issue, invoice-cancel et invoice-pay ; une facture émise ne change plus.
        if (existing && (existing.status !== 'draft' || (existing.type || 'invoice') !== 'invoice')) { rejected.push({ col, id: rec.id, reason: 'locked' }); continue; }
        const v = cleanInvoice(rec, existing, me.id, now, await companyNow());
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        const { data: crow } = await sb.from(T.clients).select('id').eq('id', v.save.client_id).maybeSingle();
        if (!crow) { rejected.push({ col, id: rec.id, reason: 'client' }); continue; }
        const refs: string[] = [...new Set<string>(v.save.lines.flatMap((l: any) => l.refs || []))];
        if (refs.length) {
          const { data: chk } = await sb.rpc('df_invoice_ref_check', { p_id: rec.id, p_refs: refs });
          if (chk?.taken?.length) { rejected.push({ col, id: rec.id, reason: 'refs_taken' }); continue; }
          if (chk?.missing?.length) { rejected.push({ col, id: rec.id, reason: 'refs_missing' }); continue; }
        }
        toSave = v.save;
      }
      if (col === 'products') {
        const v = cleanProduct(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        toSave = v.save;
      }
      if (col === 'stock') {
        const v = cleanStockMove(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        const { data: prow } = await sb.from(T.products).select('id').eq('id', v.save.product_id).maybeSingle();
        if (!prow) { rejected.push({ col, id: rec.id, reason: 'product' }); continue; } // mouvement d'un produit qui n'existe pas
        if (v.save.supplier_id) { const { data: sr } = await sb.from(T.suppliers).select('id').eq('id', v.save.supplier_id).maybeSingle(); if (!sr) { rejected.push({ col, id: rec.id, reason: 'supplier' }); continue; } }
        if (v.save.po_id) { const { data: pr } = await sb.from(T.purchases).select('id').eq('id', v.save.po_id).maybeSingle(); if (!pr) { rejected.push({ col, id: rec.id, reason: 'po' }); continue; } }
        toSave = v.save;
      }
      if (col === 'quotes') {
        const v = cleanQuote(rec, existing, me.id, now, await companyNow());
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        const { data: qcl } = await sb.from(T.clients).select('id').eq('id', v.save.client_id).maybeSingle();
        if (!qcl) { rejected.push({ col, id: rec.id, reason: 'client' }); continue; }
        if (v.save.invoice_id) { const { data: qin } = await sb.from(T.invoices).select('id').eq('id', v.save.invoice_id).maybeSingle(); if (!qin) { rejected.push({ col, id: rec.id, reason: 'invoice' }); continue; } }
        toSave = v.save;
      }
      if (col === 'purchases') {
        const v = cleanPurchase(rec, existing, me.id, now);
        if (!v.ok) { rejected.push({ col, id: rec.id, reason: v.reason }); continue; }
        const { data: srow } = await sb.from(T.suppliers).select('id').eq('id', v.save.supplier_id).maybeSingle();
        if (!srow) { rejected.push({ col, id: rec.id, reason: 'supplier' }); continue; } // fournisseur qui n'existe pas
        const ids: string[] = v.save.lines.map((l: any) => l.product_id);
        const { data: prows } = await sb.from(T.products).select('id').in('id', ids);
        if ((prows || []).length !== ids.length) { rejected.push({ col, id: rec.id, reason: 'product' }); continue; } // produit qui n'existe pas
        toSave = v.save;
      }
      if (col === 'news') {
        // Réservé au responsable (les autres sont déjà refusés plus haut). On ne perd jamais les réactions reçues.
        // Le statut, le motif de refus et les fichiers d'une publication existante ne changent jamais par ici.
        toSave = {
          id: rec.id, author_id: existing?.author_id || me.id, author_name: String(rec.author_name || existing?.author_name || me.name || '').slice(0, 80),
          author_role: existing?.author_role || 'admin',
          title: String(rec.title || '').slice(0, 120), text: String(rec.text || '').slice(0, NEWS_MAX_TEXT),
          created_at: existing?.created_at || rec.created_at || now, pinned: !!rec.pinned,
          ...(cleanAudience(rec.audience === undefined ? existing?.audience : rec.audience) ? { audience: cleanAudience(rec.audience === undefined ? existing?.audience : rec.audience) } : {}), // ancien site qui n'envoie pas le public : on garde l'existant
          ...(existing && (String(rec.text || '').slice(0, NEWS_MAX_TEXT) !== String(existing.text || '') || String(rec.title || '').slice(0, 120) !== String(existing.title || '')) && (existing.status || 'published') === 'published' ? { edited_at: now } : (existing?.edited_at ? { edited_at: existing.edited_at } : {})),
          status: existing?.status || 'published',
          files: existing ? (Array.isArray(existing.files) ? existing.files : []) : cleanFiles(rec.files, me.id),
          loves: Array.isArray(existing?.loves) ? existing.loves : [], comments: Array.isArray(existing?.comments) ? existing.comments : [],
          shares: Number(existing?.shares) || 0,
          ...(existing?.reject_reason ? { reject_reason: existing.reject_reason } : {}),
          ...(existing?.submitted_at ? { submitted_at: existing.submitted_at } : {}),
          ...(existing?.files_removed ? { files_removed: existing.files_removed } : {}),
        };
        if (!toSave.text.trim() && !toSave.files.length) { rejected.push({ col, id: rec.id, reason: 'empty' }); continue; }
      }
      await sb.from(T[col]).upsert({ id: rec.id, data: toSave, updated_at: now });
      if ((admin || isMoneyRole(me.role)) && existing) {
        // Journal d'audit : changement de tarif et de réglage (jamais bloquant ; seuls les noms de champs des Conditions sont notés, pas leurs valeurs)
        if (col === 'settings') {
          const tch = auditChanges(existing, toSave, AUDIT_TARIFF_KEYS);
          if (tch.length) await auditLog(me, 'tariff_change', { type: 'settings', id: rec.id, label: 'Réglages' }, tch.join(' ; '));
          const sk = auditSettingsKeys(existing, toSave);
          if (sk.length) await auditLog(me, 'settings_change', { type: 'settings', id: rec.id, label: 'Réglages' }, sk.join(', '));
          const cp = (Array.isArray((toSave as any).company_log) ? (toSave as any).company_log : []).filter((x: any) => x && x.at === now).map((x: any) => x.path);
          if (cp.length) await auditLog(me, 'company_change', { type: 'settings', id: rec.id, label: 'Conditions' }, cp.join(', '));
        } else if (col === 'contracts' || col === 'products') {
          const tch = auditChanges(existing, toSave, col === 'products' ? ['buy_price_ar', 'sell_price_ar'] : ['client_price_ar']);
          if (tch.length) await auditLog(me, 'tariff_change', { type: col, id: rec.id, label: auditLabelOf(toSave) }, tch.join(' ; '));
        }
      }
      if (admin && col === 'posts' && existing && toSave && existing.status !== toSave.status) {
        // Notification de l'opérateur (M6.4) : début validé, mission validée ou refusée
        const k = pushKindFor(existing.status, toSave.status);
        if (k && toSave.employee_id) pushJobs.push(pushTo([String(toSave.employee_id)], pushText(k, { post_number: toSave.post_number, title: toSave.client_name, reason: toSave.rejection_reason }), `${k}:${rec.id}`.slice(0, 60), { go: 'active-post' }, 'missions'));
      }
      // Notifications externes (partie 2a) : ce que la cloche montre arrive aussi hors de l'appli, avec le lien exact ; jamais de montant ni de texte de message
      if (col === 'posts' && !admin && toSave && (toSave.status === 'pending_start' || toSave.status === 'pending_end') && (!existing || existing.status !== toSave.status)) {
        const kind: NotifyKind = toSave.status === 'pending_start' ? 'val_start' : 'val_end';
        pushJobs.push(pushAdmins(notifyCat(kind), notifyText(kind, { name: toSave.employee_name, client: toSave.client_name }), `${kind}:${rec.id}`.slice(0, 60), { go: 'validations', filter: toSave.status === 'pending_start' ? 'starts' : 'ends', nav: `val-post-${rec.id}` }));
      }
      if (col === 'advances' && toSave) {
        if (!existing && !admin && toSave.status === 'pending') pushJobs.push(pushAdmins('validations', notifyText('advance_new', { name: toSave.employee_name }), `adv_new:${rec.id}`.slice(0, 60), { go: 'validations', filter: 'advances', nav: `val-adv-${rec.id}` }));
        else if (existing && existing.status === 'pending' && (toSave.status === 'approved' || toSave.status === 'rejected') && toSave.employee_id) pushJobs.push(pushTo([String(toSave.employee_id)], notifyText(toSave.status === 'approved' ? 'advance_ok' : 'advance_no', { reason: toSave.admin_notes }), `adv_${toSave.status}:${rec.id}`.slice(0, 60), { go: 'advances', nav: `adv-${rec.id}` }, 'advances'));
      }
      if (col === 'securityLogs' && !existing && toSave) pushJobs.push(pushAdmins('security', notifyText('security', { name: toSave.employee_name }), `sec:${rec.id}`.slice(0, 60), { go: 'security', nav: `sec-${rec.id}` }));
      if (col === 'messages' && !existing && toSave && toSave.sender_id) pushJobs.push(pushMessage(toSave));
      if (!admin && col === 'posts' && OPEN_STATUS.includes(rec.status)) tookPost = true;
    }

    for (const id of deletes) {
      if (col === 'sheets') {
        // Tableaux : seul le propriétaire (opérateur) supprime ; l'admin lit seulement
        const { data: srow } = await sb.from(T.sheets).select('data').eq('id', id).maybeSingle();
        if (srow && !(me.role === 'employee' && (srow.data as any).owner_id === me.id)) { rejected.push({ col, id, reason: 'forbidden' }); continue; }
        await sb.from(T.sheets).delete().eq('id', id);
        continue;
      }
      // Journal d'audit : le nom de ce qu'on supprime est lu AVANT (la ligne disparaît ensuite). Les messages ne sont pas notés.
      const auditDel = (admin || isMoneyRole(me.role)) && col !== 'messages' ? (await sb.from(T[col]).select('data').eq('id', id).maybeSingle()).data : null;
      if (!admin && !(isMoneyRole(me.role) && MONEY_COLS.includes(col))) {
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
      if (col === 'clients') {
        // Un client qui a des missions, des sessions ou des factures ne se supprime jamais : on le désactive (active = false).
        const { data: usedC } = await sb.from(T.contracts).select('id').eq('data->>client_id', id).limit(1);
        const { data: usedP } = await sb.from(T.posts).select('id').eq('data->>client_id', id).limit(1);
        const { data: usedI } = await sb.from(T.invoices).select('id').eq('data->>client_id', id).limit(1);
        const { data: usedQ } = await sb.from(T.quotes).select('id').eq('data->>client_id', id).limit(1);
        if ((usedC && usedC.length) || (usedP && usedP.length) || (usedI && usedI.length) || (usedQ && usedQ.length)) { rejected.push({ col, id, reason: 'in_use' }); continue; }
      }
      if (col === 'invoices' || col === 'cash') {
        // Une facture émise (ou annulée, ou un avoir) ne se supprime jamais : on l'annule par un avoir. Un paiement lié à une facture non plus. Seul un brouillon se supprime.
        const { data: xrow } = await sb.from(T[col]).select('data').eq('id', id).maybeSingle();
        const xd: any = xrow?.data;
        if (xd && ((col === 'invoices' && xd.status !== 'draft') || (col === 'cash' && (xd.invoice_id || xd.receipt_no)))) { rejected.push({ col, id, reason: col === 'cash' ? 'invoice_locked' : 'locked' }); continue; }
      }
      if (col === 'suppliers') {
        // Un fournisseur qui a servi (bon de commande, entrée de stock, dépense) ne se supprime jamais : on l'archive (active = false).
        let inUse = false;
        for (const t of [T.purchases, T.stock, T.cash]) {
          const { data: used } = await sb.from(t).select('id').eq('data->>supplier_id', id).limit(1);
          if (used && used.length) { inUse = true; break; }
        }
        if (inUse) { rejected.push({ col, id, reason: 'in_use' }); continue; }
      }
      if (col === 'quotes') {
        // Seuls un brouillon et un devis refusé (jamais facturé) se suppriment : un devis envoyé ou accepté reste (histoire du client).
        const { data: qrow } = await sb.from(T.quotes).select('data').eq('id', id).maybeSingle();
        if (qrow && (qrow.data.invoice_id || (qrow.data.status !== 'draft' && qrow.data.status !== 'refused'))) { rejected.push({ col, id, reason: 'status' }); continue; }
      }
      if (col === 'purchases') {
        // Seuls un brouillon et un bon annulé se suppriment : un bon commandé ou reçu reste (historique des achats).
        const { data: prow } = await sb.from(T.purchases).select('data').eq('id', id).maybeSingle();
        if (prow && prow.data.status !== 'draft' && prow.data.status !== 'cancelled') { rejected.push({ col, id, reason: 'status' }); continue; }
      }
      if (col === 'products') {
        // Un produit cité par un bon en cours (brouillon ou commandé) ne se supprime pas.
        const { data: inPo } = await sb.from(T.purchases).select('id').in('data->>status', ['draft', 'ordered']).filter('data->lines', 'cs', JSON.stringify([{ product_id: id }])).limit(1);
        if (inPo && inPo.length) { rejected.push({ col, id, reason: 'in_use' }); continue; }
      }
      if (col === 'users') {
        const u = await getUserRow(id);
        if (u?.role === 'admin') { rejected.push({ col, id, reason: 'admin' }); continue; }
        await purgeEmployee(id); // efface aussi toutes ses données (missions, messages, publications, fichiers…)
        await sb.from('df_credentials').delete().eq('user_id', id);
        await sb.from('df_totp').delete().eq('id', id);
        await sb.from(PRESENCE).delete().eq('user_id', id);
        await sb.from(PUSH_SUBS).delete().eq('data->>user_id', id); // plus de notifications pour un compte supprimé
      }
      if (col === 'news') {
        const { data: nrow } = await sb.from(T.news).select('data').eq('id', id).maybeSingle();
        if (nrow) await dropFiles(newsFilesOf(nrow.data));
      }
      await sb.from(T[col]).delete().eq('id', id);
      if (auditDel) await auditLog(me, 'delete', { type: col, id, label: auditLabelOf(auditDel.data) });
      if (col === 'products') await sb.from(T.stock).delete().eq('data->>product_id', id); // un produit supprimé emporte ses mouvements
      if (col === 'groups') {
        await sb.from(T.messages).delete().eq('data->>recipient_id', id);
        await sb.from(CHAT_READS).delete().eq('thread', id);
      }
    }
  }
  if (tookPost) await sb.from(PRESENCE).update({ waiting_since: null }).eq('user_id', me.id);
  if (pushJobs.length) await later(Promise.allSettled(pushJobs));
  return res.json({ ok: true, rejected });
}

// ---------- Facturation : émission, avoir, paiement (numéros attribués par des fonctions SQL atomiques) ----------
async function companyNow() {
  const { data: st } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  return readCompany((st?.data as any)?.company);
}
/** Ce qu'il faut savoir pour juger une demande de congé : date du jour (Madagascar), solde annuel et jours travaillés des Conditions, autres demandes du même salarié. */
async function leaveCtx(employeeId: string) {
  const company = await companyNow();
  const { data: rows } = await sb.from(T.leaves).select('data').eq('data->>employee_id', employeeId);
  return {
    today: new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10),
    allowance: Number((company as any)?.leave?.leave_days_per_year) || 0,
    perWeek: Number((company as any)?.leave?.work_days_per_week) || 0,
    others: (rows || []).map((r: any) => r.data),
  };
}
const invoiceFail = (res: any, message: string) => { const f = invoiceErrorOf(message); return res.status(f.status).json({ error: f.error, ...(f.max !== undefined ? { max: f.max } : {}) }); };
const newDocId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function invoiceIssue(req: any, res: any, me: any) {
  const no = moneyOnly(res, me); if (no) return no;
  const id = String(req.body?.id || '');
  if (!id) return res.status(400).json({ error: 'Demande invalide.' });
  const { data: row } = await sb.from(T.invoices).select('data, updated_at').eq('id', id).maybeSingle();
  if (!row) return res.status(404).json({ error: INVOICE_ERRORS.invoice_missing[1] });
  const draft: any = row.data;
  if ((draft.type || 'invoice') !== 'invoice' || draft.status !== 'draft') return res.status(409).json({ error: INVOICE_ERRORS.not_draft[1] });
  const company = await companyNow();
  if (!String(company.identity.name || '').trim()) return res.status(422).json({ error: "Écris le nom de ton entreprise dans Réglages > Conditions avant d'émettre une facture.", code: 'company_incomplete' });
  const { data: crow } = await sb.from(T.clients).select('data').eq('id', draft.client_id).maybeSingle();
  if (!crow) return res.status(409).json({ error: "Le client de cette facture n'existe plus." });
  const now = new Date().toISOString();
  const v = cleanInvoice(draft, draft, me.id, now, company); // revérifie tout, recalcule les totaux avec la TVA actuelle
  if (!v.ok) return res.status(422).json({ error: 'Brouillon invalide.', code: v.reason });
  const today = invTodayMada();
  const patch = { ...invoiceIssuePatch(v.save, crow.data, company, today), lines: v.save.lines, note: v.save.note };
  const { data, error } = await sb.rpc('df_issue_invoice', { p_id: id, p_expected: row.updated_at, p_prefix: company.billing.invoice_prefix, p_year: Number(today.slice(0, 4)), p_patch: patch });
  if (error) return invoiceFail(res, error.message);
  await auditLog(me, 'invoice_issue', { type: 'invoices', id, label: auditLabelOf(data) || id }, `Client : ${auditLabelOf(crow.data)}`);
  return res.json({ ok: true, invoice: data });
}

async function invoiceCancel(req: any, res: any, me: any) {
  const no = moneyOnly(res, me); if (no) return no;
  const id = String(req.body?.id || '');
  if (!id) return res.status(400).json({ error: 'Demande invalide.' });
  const today = invTodayMada();
  const { data, error } = await sb.rpc('df_cancel_invoice', { p_id: id, p_credit_id: newDocId('cn'), p_prefix: 'AV-', p_year: Number(today.slice(0, 4)), p_today: today, p_by: me.id });
  if (error) return invoiceFail(res, error.message);
  await auditLog(me, 'invoice_cancel', { type: 'invoices', id, label: id }, 'Annulée par un avoir');
  return res.json({ ok: true, ...data });
}

async function invoicePay(req: any, res: any, me: any) {
  const no = moneyOnly(res, me); if (no) return no;
  const id = String(req.body?.id || '');
  const amount = invNum(req.body?.amount);
  const date = invDate(req.body?.date);
  if (!id || !date) return res.status(400).json({ error: 'Demande invalide.' });
  if (!Number.isFinite(amount) || amount < 1 || amount > INV_MAX || amount !== Math.trunc(amount)) return res.status(400).json({ error: INVOICE_ERRORS.bad_amount[1] });
  const company = await companyNow();
  const today = invTodayMada();
  const { data, error } = await sb.rpc('df_pay_invoice', {
    p_id: id, p_cash_id: newDocId('cash'), p_amount: amount, p_date: date, p_method: String(req.body?.method || '').slice(0, 40), p_note: String(req.body?.note || '').slice(0, 300),
    p_prefix: company.billing.receipt_prefix, p_year: Number(today.slice(0, 4)), p_by: me.id,
  });
  if (error) return invoiceFail(res, error.message);
  await auditLog(me, 'invoice_pay', { type: 'invoices', id, label: id }, `${amount} Ar le ${date}${req.body?.method ? ` (${String(req.body.method).slice(0, 40)})` : ''}`);
  return res.json({ ok: true, ...data });
}


// ---------- Journal d'audit : écriture (jamais bloquante) et lecture (admin) ----------
const AUDIT = "df_audit";
async function auditLog(me: any, action: string, target: { type?: string; id?: string; label?: string } | undefined, detail?: unknown) {
  try {
    const e = buildAuditEntry(me, action, target, detail, new Date().toISOString(), Math.random().toString(36).slice(2, 8));
    if (!e) return;
    const { error } = await sb.from(AUDIT).insert({ id: e.id, data: e, updated_at: e.at });
    if (error) console.error("audit error:", error.message);
  } catch (err) { console.error("audit error:", err); }
}
async function auditList(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const limit = Math.min(1000, Math.max(1, Math.trunc(Number(req.query?.limit)) || 300));
  const { data, error } = await sb.from(AUDIT).select("data").order("id", { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: "Le journal n'est pas disponible (table df_audit absente ?)." });
  return res.json({ rows: (data || []).map((r: any) => r.data) });
}

// ---------- Décision sur une session par le Chef d'équipe (M7.1 d) : le calcul de la paie et du prix client se fait ICI, jamais dans son navigateur ----------
async function postDecide(req: any, res: any, me: any) {
  if (me.role !== 'admin' && me.role !== 'team_lead') return res.status(403).json({ error: "Réservé au responsable et au chef d'équipe." });
  const b = req.body || {};
  const id = String(b.id || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return res.status(400).json({ error: 'Mission introuvable.' });
  const { data: prow } = await sb.from(T.posts).select('data').eq('id', id).maybeSingle();
  if (!prow) return res.status(404).json({ error: 'Mission introuvable.' });
  const post = prow.data;
  const owner = await getUserRow(String(post.employee_id || ''));
  if (!canDecidePost(me, owner)) return res.status(403).json({ error: "Cette mission n'est pas dans ton équipe." });
  const approve = b.approve === true;
  const { data: st } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  const teamLimit = cleanTeamLeadLimit(st?.data?.team_lead_limit_ar); // plafond du Chef d'équipe (M15.6) : 0 = aucun
  let cRow: any = null;
  if ((approve && post.status === 'pending_end') || (me.role === 'team_lead' && teamLimit > 0)) {
    const { data: c1 } = await sb.from(T.contracts).select('id, data').eq('data->>post_number', String(post.post_number)).limit(1);
    cRow = (c1 || [])[0] || null;
    if (!cRow && post.client_name) {
      const { data: c2 } = await sb.from(T.contracts).select('id, data').eq('data->>client_name', String(post.client_name)).limit(1);
      cRow = (c2 || [])[0] || null;
    }
  }
  // Au-dessus du plafond, la décision revient au responsable (début, fin et refus). Le montant n'est jamais dit au Chef d'équipe.
  if (decisionNeedsAdmin(me.role, decisionClientPrice(cRow ? cRow.data : undefined, st?.data || {}), teamLimit)) return res.status(403).json({ error: 'Cette mission est au-dessus du plafond : la décision revient au responsable.' });
  const now = new Date().toISOString();
  const plan = planPostDecision(post, cRow ? cRow.data : undefined, st?.data || {}, owner, approve, b.reason, now);
  if (!plan.ok) {
    const msg: Record<string, string> = { missing: 'Mission introuvable.', not_pending: "Cette mission n'est plus en attente.", reason: 'Un motif de refus est obligatoire.' };
    return res.status(plan.error === 'reason' ? 400 : 409).json({ error: msg[plan.error] || 'Décision impossible.' });
  }
  if (approve) { const note = String(b.note ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300); if (note) plan.post = { ...plan.post, admin_notes: note }; } // mot facultatif du responsable pour l'opérateur
  await sb.from(T.posts).upsert({ id, data: plan.post, updated_at: now });
  if (plan.contract && cRow) await sb.from(T.contracts).upsert({ id: cRow.id, data: plan.contract, updated_at: now });
  if (plan.employee) await sb.from(T.users).upsert({ id: plan.employee.id, data: plan.employee, updated_at: now });
  const k = pushKindFor(post.status, plan.post.status);
  if (k && post.employee_id) await pushTo([String(post.employee_id)], pushText(k, { post_number: post.post_number, title: post.client_name, reason: plan.post.rejection_reason }), `${k}:${id}`.slice(0, 60), { go: 'active-post' }, 'missions');
  await auditLog(me, 'mission_decision', { type: 'posts', id, label: `${auditLabelOf(owner)} · ${post.client_name || post.post_number || id}` }, plan.kind === 'refused' ? `Refusée : ${plan.post.rejection_reason}` : plan.kind === 'start_ok' ? 'Début validé' : 'Mission validée');
  return res.json({ ok: true, kind: plan.kind });
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

  const newRole = user?.role === undefined ? 'employee' : (isCreatableRole(user.role) ? String(user.role) : '');
  if (!newRole) return res.status(400).json({ error: 'Rôle inconnu.' });
  const id = `user-emp-${Date.now()}`;
  const rec = {
    ...user, id, username: uname, role: newRole, status: 'active', is_online: false,
    team: cleanTeam(user?.team),
    total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
  };
  await sb.from(T.users).upsert({ id, data: rec, updated_at: new Date().toISOString() });
  await sb.from('df_credentials').insert({ user_id: id, username: uname, password_hash: hashPw(password) });
  await auditLog(me, 'user_create', { type: 'users', id, label: rec.name || uname }, `Pseudo : ${uname}`);
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
  await auditLog(me, 'user_password', { type: 'users', id: target, label: auditLabelOf(await getUserRow(target)) }, target === me.id ? 'Son propre mot de passe' : 'Changé par l\'admin');
  return res.json({ ok: true });
}

async function logout(_req: any, res: any, me: any) {
  me.is_online = false;
  await sb.from(T.users).upsert({ id: me.id, data: me, updated_at: new Date().toISOString() });
  await sb.from(PRESENCE).update({ last_seen: new Date(0).toISOString(), waiting_since: null }).eq('user_id', me.id);
  await closeAttendanceSession(me);
  return res.json({ ok: true });
}


const isBucketUrl = (u: unknown) =>
  typeof u === 'string' && (u.startsWith(`${SB_URL}/storage/v1/object/public/${BUCKET}/`) || u.startsWith(CLD_PREFIX));

// ---------- modification de profil (validée par l'admin) ----------
// Description facultative jointe à une demande (300 caractères max)
const noteOf = (body: any): string => String(body?.note || '').trim().slice(0, 300);

async function profileRequest(req: any, res: any, me: any) {
  if (me.role === 'admin') return res.status(403).json({ error: 'Réservé aux opérateurs.' });
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
  await later(pushAdmins('validations', notifyText('profile', { name: me.name }), `profile:${id}`.slice(0, 60), { go: 'validations', filter: 'profiles', nav: `val-prf-${id}` }));
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
  await auditLog(me, 'profile_decision', { type: 'users', id: String(r.user_id || ''), label: auditLabelOf(r) }, approve === true ? 'Acceptée' : `Refusée : ${reasonOf(req.body)}`);
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
      await later(pushAdmins('validations', notifyText('reset', { name: user.name }), `reset:${id}`.slice(0, 60), { go: 'validations', filter: 'resets', nav: `val-rst-${id}` }));
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
  await auditLog(me, 'reset_decision', { type: 'users', id: String(row.data.user_id || ''), label: auditLabelOf(row.data) }, approve === true ? 'Acceptée' : `Refusée : ${reasonOf(req.body)}`);
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
  // Réglage de l'admin (Réglages > Inscriptions) : « fermées » = plus aucune nouvelle demande. Absent ou autre valeur = ouvertes.
  const { data: stSignup } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  if (stSignup?.data?.signup_open === false) return res.status(403).json({ error: "Les inscriptions sont fermées pour le moment. Contacte l'administrateur.", closed: true });
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
  await later(pushAdmins('validations', notifyText('signup', { name }), `signup:${id}`.slice(0, 60), { go: 'validations', filter: 'signups', nav: `val-sig-${id}` }));
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
  await auditLog(me, 'signup_decision', { type: 'users', id, label: auditLabelOf(r) }, approve === true ? 'Acceptée' : `Refusée : ${reasonOf(req.body)}`);
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
      if (diff >= cfg.auto.late2Min) addM(u.id, `auto-late-${date}`, cfg.auto.late2M, `Retard de ${diff} min le ${date} (−${cfg.auto.late2M}M de volume)`, date);
      else if (diff >= cfg.auto.late1Min) addM(u.id, `auto-late-${date}`, cfg.auto.late1M, `Retard de ${diff} min le ${date} (−${cfg.auto.late1M}M de volume)`, date);
    }
    const f = first.get(u.id);
    if (!f) continue;
    for (let d = info.start; d <= lastAbs; d = new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)) {
      if (d < f || days.has(d)) continue;
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) continue; // dimanche = repos
      addM(u.id, `auto-abs-${d}`, cfg.auto.absentM, `Absence non annoncée le ${d} (−${cfg.auto.absentM}M de volume)`, d);
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

const moneyOnly = (res: any, me: any) => (!isMoneyRole(me.role) ? res.status(403).json({ error: "Réservé à l'administrateur et au comptable." }) : null);
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
  await auditLog(me, 'payroll_close', { type: 'payroll', id: info.pid, label: info.pid }, `${slips.length} fiche(s), net total ${slips.reduce((t, x) => t + x.net, 0)} Ar`);
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
  await auditLog(me, 'payroll_reopen', { type: 'payroll', id: info.pid, label: info.pid }, `Motif : ${reason}`);
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
    await auditLog(me, 'payroll_pay', { type: 'payroll', id: info.pid, label: String(slip.name || info.pid) }, `Paiement annulé. Motif : ${reason}`);
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
  await auditLog(me, 'payroll_pay', { type: 'payroll', id: info.pid, label: String(slip.name || info.pid) }, `${slip.net} Ar par ${method}${ref ? ` (réf. ${ref})` : ''}`);
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
  if (!u || u.role === 'admin') return res.status(404).json({ error: 'Opérateur introuvable.' });
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
    await sb.from(AUDIT).delete().lt('updated_at', new Date(auditCutoffMs(Date.now())).toISOString()); // journal d'audit : 12 mois
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
// ---------- Sauvegardes de nuit (table df_backups, remplie chaque nuit par la fonction SQL df_take_backup()) ----------
async function backupsList(_req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const { data, error } = await sb.from('df_backups').select('id, taken_at, tables, bytes').order('taken_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: 'Impossible de lire les sauvegardes.' });
  return res.json({ rows: data || [] });
}
async function backupGet(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Sauvegarde invalide.' });
  const { data, error } = await sb.from('df_backups').select('id, taken_at, tables, bytes, data').eq('id', id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Impossible de lire cette sauvegarde.' });
  if (!data) return res.status(404).json({ error: 'Sauvegarde introuvable.' });
  return res.json({ backup: data });
}
// ===== BEGIN BACKUPFILE (contrôle d'un fichier de sauvegarde importé ; ce bloc est contrôlé par scripts/check-export.ts) =====
const EXPORT_LIMITS = { fileBytes: 25 * 1024 * 1024, tables: 80, rowsPerTable: 200_000, rowsTotal: 500_000 };
/** Tables qui ne reviennent jamais d'un fichier (état du moment, pas des données). */
const EXPORT_NEVER = ['df_backups', 'df_restore', 'df_presence', 'df_errors'];
interface BackupFileCheck { ok: boolean; error?: string; tables: { name: string; rows: number }[]; totalRows: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Le contenu lu dans le fichier ressemble-t-il à une sauvegarde de Gestion Pro ? Ne regarde pas dans les lignes (la base les contrôle à la restauration, tout ou rien). */
function checkBackupFile(raw: unknown): BackupFileCheck {
  const bad = (error: string): BackupFileCheck => ({ ok: false, error, tables: [], totalRows: 0 });
  if (!isObj(raw)) return bad('not_object');
  const names = Object.keys(raw);
  if (!names.length || names.length > EXPORT_LIMITS.tables) return bad('tables_count');
  const tables: { name: string; rows: number }[] = [];
  let total = 0;
  for (const name of names) {
    if (!/^df_[a-z][a-z0-9_]{0,40}$/.test(name)) return bad('table_name');
    if (EXPORT_NEVER.includes(name)) return bad('table_forbidden');
    const rows = raw[name];
    if (!Array.isArray(rows)) return bad('table_not_list');
    if (rows.length > EXPORT_LIMITS.rowsPerTable) return bad('too_many_rows');
    for (const r of rows) if (!isObj(r)) return bad('row_not_object');
    total += rows.length;
    if (total > EXPORT_LIMITS.rowsTotal) return bad('too_many_rows');
    tables.push({ name, rows: rows.length });
  }
  const users = raw['df_users'];
  if (!Array.isArray(users) || users.length < 1) return bad('no_users');
  return { ok: true, tables, totalRows: total };
}
// ===== END BACKUPFILE =====

/** M16.5 : un fichier d'export est AJOUTÉ à la liste des sauvegardes. Aucune table n'est touchée : pour l'utiliser, l'admin passe par « Restaurer » (garde-fous de M7.3). */
async function backupImport(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  const data = req.body?.data;
  const chk = checkBackupFile(data);
  if (!chk.ok) return res.status(400).json({ error: 'Fichier refusé.', code: chk.error });
  const { data: last } = await sb.from('df_backups').select('taken_at').order('taken_at', { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.taken_at).getTime() < 60_000) return res.status(429).json({ error: 'Une sauvegarde vient d\'être faite. Réessayez dans une minute.' });
  const bytes = JSON.stringify(data).length;
  const { data: row, error } = await sb.from('df_backups').insert({ taken_at: new Date().toISOString(), tables: chk.tables.length, bytes, data }).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Le fichier n\'a pas pu être ajouté.' });
  await auditLog(me, 'backup_import', { type: 'backups', id: String(row?.id ?? ''), label: 'Fichier importé' }, `${chk.tables.length} tables, ${chk.totalRows} lignes`);
  return res.json({ ok: true, id: row?.id, tables: chk.tables.length, rows: chk.totalRows });
}
async function backupNow(_req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  // Une seule sauvegarde manuelle par minute (évite de remplir la base par erreur)
  const { data: last } = await sb.from('df_backups').select('taken_at').order('taken_at', { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.taken_at).getTime() < 60_000) return res.status(429).json({ error: 'Une sauvegarde vient d\'être faite. Réessayez dans une minute.' });
  const { data, error } = await sb.rpc('df_take_backup');
  if (error) return res.status(500).json({ error: 'La sauvegarde a échoué.' });
  await auditLog(me, 'backup_now', { type: 'backups', id: String(data ?? ''), label: 'Sauvegarde' }, '');
  return res.json({ ok: true, id: data });
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

// ---------- fil d'actualité : « J'adore », commentaires, partages (actions atomiques) ----------
const NEWS_MAX_TEXT = 2000;
const NEWS_MAX_COMMENT = 500;
const NEWS_MAX_COMMENTS = 200;
const NEWS_MAX_FILES = 200; // plafond technique de sécurité (pas de limite pratique pour les utilisateurs)
const NEWS_MAX_PENDING = 10; // publications en attente par employé

// Pièces jointes : seulement des fichiers envoyés par la personne elle-même (stockage Supabase ou Cloudinary)
const ownsFile = (u: string, uid: string) => pathOf(u).startsWith(`${uid}/`) || cldIdOf(u).startsWith(`df-proofs/${uid}-`);
const cleanFiles = (v: unknown, uid: string): { url: string; name: string; kind: 'image' | 'file'; size?: number }[] => {
  if (!Array.isArray(v)) return [];
  const out: { url: string; name: string; kind: 'image' | 'file'; size?: number }[] = [];
  for (const f of v as any[]) {
    if (!f || !isBucketUrl(f.url) || !ownsFile(String(f.url), uid)) continue;
    const size = Number(f.size);
    out.push({
      url: String(f.url).slice(0, 600), name: String(f.name || 'fichier').slice(0, 120), kind: f.kind === 'image' ? 'image' : 'file',
      ...(Number.isFinite(size) && size > 0 ? { size: Math.round(size) } : {}),
    });
    if (out.length >= NEWS_MAX_FILES) break;
  }
  return out;
};
const newsFilesOf = (d: any): { url?: string }[] => [...(Array.isArray(d?.files) ? d.files : []), ...(Array.isArray(d?.comments) ? d.comments : []).flatMap((c: any) => (Array.isArray(c?.files) ? c.files : []))];
async function dropFiles(files: { url?: string }[]) {
  const urls = files.map(f => f?.url).filter((u): u is string => typeof u === 'string' && !!u);
  try {
    const paths = urls.map(pathOf).filter(Boolean);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    await Promise.all(urls.map(cldIdOf).filter(Boolean).map(cldDestroy));
  } catch (e) { console.error('news files cleanup:', e); }
}

// ---------- suppression complète d'un employé : toutes ses données, puis ses fichiers ----------
// Chaque étape est indépendante : une erreur est notée dans les logs mais n'arrête pas les suivantes.
async function purgeEmployee(uid: string) {
  const urls: string[] = [];
  const addUrl = (u: unknown) => { if (typeof u === 'string' && u) urls.push(u); };
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { console.error('purgeEmployee ' + label + ':', e); }
  };
  const now = new Date().toISOString();
  const dropReaction = (rx: any) => {
    if (!rx || typeof rx !== 'object') return rx;
    const next: Record<string, string[]> = {};
    for (const e of Object.keys(rx)) { const l = (Array.isArray(rx[e]) ? rx[e] : []).filter((x: string) => x !== uid); if (l.length) next[e] = l; }
    return Object.keys(next).length ? next : undefined;
  };

  // photo de profil
  await step('avatar', async () => { addUrl((await getUserRow(uid))?.avatar_url); });

  // missions : justificatifs puis lignes
  await step('posts', async () => {
    const rows = await fetchAll((a, b) => sb.from(T.posts).select('data').eq('data->>employee_id', uid).order('id').range(a, b));
    for (const r of rows) {
      const p = r.data || {};
      [p.start_proof_url, p.end_proof_url, ...(p.start_proof_urls || []), ...(p.end_proof_urls || [])].forEach(addUrl);
    }
    await sb.from(T.posts).delete().eq('data->>employee_id', uid);
  });
  await step('advances', async () => { await sb.from(T.advances).delete().eq('data->>employee_id', uid); });
  await step('leaves', async () => { await sb.from(T.leaves).delete().eq('data->>employee_id', uid); });
  await step('shifts', async () => { await sb.from(T.shifts).delete().eq('data->>employee_id', uid); });
  await step('sheets', async () => { await sb.from(T.sheets).delete().eq('data->>owner_id', uid); });
  await step('reviews', async () => { await sb.from(T.reviews).delete().eq('data->>employee_id', uid); });
  await step('securityLogs', async () => { await sb.from(T.securityLogs).delete().eq('data->>employee_id', uid); });

  // groupes créés par lui : on les supprime avec leurs messages ; les autres : on le retire des membres
  await step('groups', async () => {
    const groups = await fetchAll((a, b) => sb.from(T.groups).select('id, data').order('id').range(a, b));
    for (const g of groups) {
      const d = g.data || {};
      if (d.owner_id === uid) {
        addUrl(d.avatar_url);
        const msgs = await fetchAll((a, b) => sb.from(T.messages).select('data').eq('data->>recipient_id', g.id).order('id').range(a, b));
        msgs.forEach(m => addUrl(m.data?.attachment_url));
        await sb.from(T.messages).delete().eq('data->>recipient_id', g.id);
        await sb.from(CHAT_READS).delete().eq('thread', g.id);
        await sb.from(T.groups).delete().eq('id', g.id);
      } else if ((d.members || []).includes(uid) || (d.admins || []).includes(uid)) {
        await sb.from(T.groups).upsert({ id: g.id, data: { ...d, members: (d.members || []).filter((x: string) => x !== uid), admins: (d.admins || []).filter((x: string) => x !== uid) }, updated_at: now });
      }
    }
  });

  // messages envoyés ou reçus (conversations privées) + ses réactions sur les autres messages
  await step('messages', async () => {
    for (const field of ['sender_id', 'recipient_id']) {
      const rows = await fetchAll((a, b) => sb.from(T.messages).select('data').eq('data->>' + field, uid).order('id').range(a, b));
      rows.forEach(m => addUrl(m.data?.attachment_url));
      await sb.from(T.messages).delete().eq('data->>' + field, uid);
    }
    const reacted = await fetchAll((a, b) => sb.from(T.messages).select('id, data').like('data->>reactions', '%' + uid + '%').order('id').range(a, b));
    for (const r of reacted) {
      const next = { ...r.data }; const rx = dropReaction(r.data.reactions);
      if (rx) next.reactions = rx; else delete next.reactions;
      await sb.from(T.messages).upsert({ id: r.id, data: next, updated_at: now });
    }
  });

  // publications : les siennes disparaissent ; sur les autres on retire ses commentaires, « J'adore » et réactions
  await step('news', async () => {
    const rows = await fetchAll((a, b) => sb.from(T.news).select('id, data').order('id').range(a, b));
    for (const r of rows) {
      const d = r.data || {};
      if (d.author_id === uid) {
        newsFilesOf(d).forEach(f => addUrl(f?.url));
        await sb.from(T.news).delete().eq('id', r.id);
        continue;
      }
      const comments: any[] = Array.isArray(d.comments) ? d.comments : [];
      const mine = comments.filter(c => c?.user_id === uid);
      const loved = Array.isArray(d.loves) && d.loves.includes(uid);
      const reacted = comments.some(c => JSON.stringify(c?.reactions || {}).includes(uid));
      if (!mine.length && !loved && !reacted) continue;
      mine.forEach(c => (Array.isArray(c.files) ? c.files : []).forEach((f: any) => addUrl(f?.url)));
      const kept = comments.filter(c => c?.user_id !== uid).map(c => {
        if (!c?.reactions) return c;
        const next = { ...c }; const rx = dropReaction(c.reactions);
        if (rx) next.reactions = rx; else delete next.reactions;
        return next;
      });
      await sb.from(T.news).upsert({ id: r.id, data: { ...d, comments: kept, loves: (Array.isArray(d.loves) ? d.loves : []).filter((x: string) => x !== uid) }, updated_at: now });
    }
  });

  // paie, demandes en attente, présence, lectures de messagerie
  await step('payroll', async () => { await sb.from(PAYROLL).delete().eq('data->>user_id', uid); });
  await step('profile requests', async () => {
    const { data: prs } = await sb.from(PROFILE_REQ).select('data').eq('data->>user_id', uid);
    (prs || []).forEach((r: any) => { addUrl(r.data?.avatar_url); });
    await sb.from(PROFILE_REQ).delete().eq('data->>user_id', uid);
  });
  await step('resets', async () => { await sb.from(RESETS).delete().eq('data->>user_id', uid); });
  await step('attendance', async () => { await sb.from(ATTENDANCE).delete().eq('user_id', uid); });
  await step('chat reads', async () => {
    await sb.from(CHAT_READS).delete().eq('user_id', uid);
    await sb.from(CHAT_READS).delete().eq('thread', uid);
  });
  // journal des erreurs : on garde le rapport, on retire seulement son identifiant
  await step('errors', async () => {
    const { data: errs } = await sb.from(ERRORS).select('id, users').filter('users', 'cs', JSON.stringify([uid]));
    for (const e of errs || []) await sb.from(ERRORS).update({ users: (Array.isArray(e.users) ? e.users : []).filter((x: string) => x !== uid) }).eq('id', e.id);
  });

  // fichiers (Cloudinary et stockage Supabase) en dernier
  await dropFiles(urls.map(url => ({ url })));
}

async function newsAction(kind: 'react' | 'comment' | 'comment-delete' | 'comment-react' | 'share', req: any, res: any, me: any) {
  const { id, text, commentId, files, emoji, parentId, replyToName } = req.body || {};
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Publication inconnue.' });
  const { data: row } = await sb.from(T.news).select('data').eq('id', id).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Publication introuvable.' });
  const d: any = {
    ...row.data,
    loves: Array.isArray(row.data.loves) ? [...row.data.loves] : [],
    comments: Array.isArray(row.data.comments) ? [...row.data.comments] : [],
    shares: Number(row.data.shares) || 0,
  };
  if (d.status && d.status !== 'published') return res.status(400).json({ error: 'Cette publication n’est pas encore validée.' });
  if (!canSeeNews(d, me)) return res.status(404).json({ error: 'Publication introuvable.' }); // hors public : comme si elle n'existait pas
  if (kind === 'react') {
    d.loves = d.loves.includes(me.id) ? d.loves.filter((x: string) => x !== me.id) : [...d.loves, me.id];
  } else if (kind === 'comment') {
    const clean = String(text || '').trim().slice(0, NEWS_MAX_COMMENT);
    const cf = cleanFiles(files, me.id);
    if (!clean && !cf.length) return res.status(400).json({ error: 'Écris un commentaire ou joins un fichier.' });
    if (d.comments.length >= NEWS_MAX_COMMENTS) return res.status(400).json({ error: 'Trop de commentaires sur cette publication.' });
    // Réponse (comme Facebook) : 2 niveaux au plus. Répondre à une réponse se range sous le même commentaire de premier niveau.
    let parent: any = null;
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      const target = d.comments.find((x: any) => x.id === String(parentId));
      if (!target) return res.status(404).json({ error: 'Le commentaire auquel tu réponds n\'existe plus.' });
      parent = target.parent_id ? d.comments.find((x: any) => x.id === target.parent_id) || target : target;
    }
    const replyName = String(replyToName ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
    d.comments.push({ id: `c-${Date.now()}-${randomBytes(3).toString('hex')}`, user_id: me.id, user_name: String(me.name || '').slice(0, 80), role: me.role, text: clean, ...(cf.length ? { files: cf } : {}), ...(parent ? { parent_id: parent.id, ...(replyName ? { reply_to_name: replyName } : {}) } : {}), created_at: new Date().toISOString() });
  } else if (kind === 'comment-react') {
    if (!REACTION_EMOJIS.includes(String(emoji))) return res.status(400).json({ error: 'Réaction inconnue.' });
    const idx = d.comments.findIndex((x: any) => x.id === commentId);
    if (idx < 0) return res.status(404).json({ error: 'Commentaire introuvable.' });
    const c = { ...d.comments[idx] };
    const rx: Record<string, string[]> = {};
    for (const e of REACTION_EMOJIS) {
      const others = ((c.reactions || {})[e] || []).filter((x: string) => x !== me.id);
      const had = ((c.reactions || {})[e] || []).includes(me.id);
      const list = e === emoji ? (had ? others : [...others, me.id]) : others; // même emoji = retirer ; autre emoji = remplacer
      if (list.length) rx[e] = list.slice(0, 60);
    }
    if (Object.keys(rx).length) c.reactions = rx; else delete c.reactions;
    d.comments = d.comments.map((x: any, i: number) => (i === idx ? c : x));
  } else if (kind === 'comment-delete') {
    const c = d.comments.find((x: any) => x.id === commentId);
    if (!c) return res.status(404).json({ error: 'Commentaire introuvable.' });
    if (me.role !== 'admin' && c.user_id !== me.id) return res.status(403).json({ error: 'Tu ne peux pas supprimer ce commentaire.' });
    const gone = d.comments.filter((x: any) => x.id === commentId || x.parent_id === commentId); // un commentaire part avec ses réponses
    for (const g of gone) await dropFiles(Array.isArray(g.files) ? g.files : []);
    d.comments = d.comments.filter((x: any) => x.id !== commentId && x.parent_id !== commentId);
  } else {
    d.shares += 1;
  }
  await sb.from(T.news).upsert({ id, data: d, updated_at: new Date().toISOString() });
  return res.json({ ok: true, news: d });
}

// L'employé propose une publication : elle reste « en attente » jusqu'à la décision du responsable
async function newsPolicy(): Promise<any> {
  const { data: st } = await sb.from(T.settings).select('data').eq('id', 'general').maybeSingle();
  return cleanNewsPolicy((st?.data as any)?.news_publish);
}
async function newsSubmit(req: any, res: any, me: any) {
  if (me.role === 'admin') return res.status(403).json({ error: 'Le responsable publie directement.' });
  const mode = publishModeFor(me.role, await newsPolicy());
  if (mode === 'off') return res.status(403).json({ error: 'Le responsable n’a pas autorisé ton rôle à publier.' });
  const b = req.body || {};
  const text = String(b.text || '').trim().slice(0, NEWS_MAX_TEXT);
  const files = cleanFiles(b.files, me.id);
  if (!text && !files.length) return res.status(400).json({ error: 'Écris un texte ou joins un fichier.' });
  if (mode === 'review') {
    const { count } = await sb.from(T.news).select('id', { count: 'exact', head: true }).eq('data->>author_id', me.id).eq('data->>status', 'pending');
    if ((count || 0) >= NEWS_MAX_PENDING) return res.status(400).json({ error: `Tu as déjà ${NEWS_MAX_PENDING} publications en attente. Attends la décision du responsable.` });
  }
  const now = new Date().toISOString();
  const id = `news-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const aud = cleanAudience(b.audience);
  const d = {
    id, author_id: me.id, author_name: String(me.name || '').slice(0, 80), author_role: me.role === 'employee' ? 'employee' : me.role,
    title: String(b.title || '').trim().slice(0, 120), text, created_at: now, submitted_at: now, pinned: false, status: mode === 'direct' ? 'published' : 'pending',
    ...(aud ? { audience: aud } : {}),
    files, loves: [], comments: [], shares: 0,
  };
  await sb.from(T.news).upsert({ id, data: d, updated_at: now });
  return res.json({ ok: true, news: d });
}

// L'auteur modifie sa publication déjà publiée (texte, titre, public) si le responsable l'a autorisé. Les fichiers, réactions et commentaires ne changent jamais ici.
async function newsEdit(req: any, res: any, me: any) {
  const { id } = req.body || {};
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Publication inconnue.' });
  const { data: row } = await sb.from(T.news).select('data').eq('id', id).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Publication introuvable.' });
  if (!canEditNews(row.data, me, await newsPolicy())) return res.status(403).json({ error: 'Tu ne peux pas modifier cette publication.' });
  const b = req.body || {};
  const text = String(b.text ?? row.data.text ?? '').trim().slice(0, NEWS_MAX_TEXT);
  const files = Array.isArray(row.data.files) ? row.data.files : [];
  if (!text && !files.length) return res.status(400).json({ error: 'Écris un texte ou garde un fichier.' });
  const now = new Date().toISOString();
  const aud = b.audience === undefined ? cleanAudience(row.data.audience) : cleanAudience(b.audience);
  const { audience: _old, ...rest } = row.data;
  const d: any = { ...rest, title: String(b.title ?? row.data.title ?? '').trim().slice(0, 120), text, edited_at: now, ...(aud ? { audience: aud } : {}) };
  await sb.from(T.news).upsert({ id, data: d, updated_at: now });
  return res.json({ ok: true, news: d });
}

// Le responsable valide ou refuse (motif obligatoire au refus ; les fichiers d'une publication refusée sont supprimés)
async function newsDecision(req: any, res: any, me: any) {
  if (me.role !== 'admin') return res.status(403).json({ error: 'Réservé au responsable.' });
  const { id, decision, reason } = req.body || {};
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Publication inconnue.' });
  const { data: row } = await sb.from(T.news).select('data').eq('id', id).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Publication introuvable.' });
  const d: any = { ...row.data };
  if (d.status !== 'pending') return res.status(400).json({ error: 'Cette publication n’est plus en attente.' });
  const now = new Date().toISOString();
  if (decision === 'approve') {
    d.status = 'published';
    d.created_at = now; // elle remonte en haut du fil à la validation
    delete d.reject_reason;
  } else if (decision === 'reject') {
    const r = String(reason || '').trim().slice(0, 300);
    if (r.length < 3) return res.status(400).json({ error: REASON_ERR });
    d.status = 'rejected';
    d.reject_reason = r;
    d.pinned = false;
    d.files_removed = Array.isArray(d.files) ? d.files.length : 0;
    await dropFiles(Array.isArray(d.files) ? d.files : []);
    d.files = [];
  } else {
    return res.status(400).json({ error: 'Décision invalide.' });
  }
  await sb.from(T.news).upsert({ id, data: d, updated_at: now });
  return res.json({ ok: true, news: d });
}

// L'auteur retire sa publication tant qu'elle n'est pas validée (en attente ou refusée)
async function newsWithdraw(req: any, res: any, me: any) {
  const { id } = req.body || {};
  if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'Publication inconnue.' });
  const { data: row } = await sb.from(T.news).select('data').eq('id', id).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Publication introuvable.' });
  if (row.data.author_id !== me.id) return res.status(403).json({ error: 'Ce n’est pas ta publication.' });
  if (row.data.status !== 'pending' && row.data.status !== 'rejected') return res.status(400).json({ error: 'Cette publication est déjà publiée.' });
  await dropFiles(newsFilesOf(row.data));
  await sb.from(T.news).delete().eq('id', id);
  return res.json({ ok: true, deleted: id });
}

// ---------- routeur ----------
// ---------- notifications push (M6.4) ----------
const PUSH_SUBS = "df_push_subs";
const PUSH_LOG = "df_push_log";
const PUSH_SUBJECT = "https://github.com/BTKzeyrox/Nprojet"; // adresse de contact exigée par le standard VAPID (pas d'email personnel)
const PUSH_MAX_SUBS = 5;
let pushKeysCache: { pub: string; priv: string } | null = null;
const okKey = (pub: unknown, priv: unknown) => typeof pub === 'string' && typeof priv === 'string' && b64uDec(pub).length === 65 && b64uDec(priv).length === 32;
// Clés VAPID : créées la première fois, rangées dans le coffre-fort, jamais écrites dans GitHub.
async function pushKeys(): Promise<{ pub: string; priv: string } | null> {
  if (pushKeysCache) return pushKeysCache;
  const read = async () => {
    const [p, k] = await Promise.all([sb.rpc('df_push_get_secret', { secret_name: 'push_vapid_public' }), sb.rpc('df_push_get_secret', { secret_name: 'push_vapid_private' })]);
    return okKey(p.data, k.data) ? { pub: String(p.data), priv: String(k.data) } : null;
  };
  let keys = await read();
  if (!keys) {
    const g = await generateVapidKeys();
    const a = await sb.rpc('df_push_set_secret', { secret_name: 'push_vapid_private', secret_value: g.privateKey });
    const b = await sb.rpc('df_push_set_secret', { secret_name: 'push_vapid_public', secret_value: g.publicKey });
    if (a.error || b.error) { console.error('push keys vault error:', a.error || b.error); return null; }
    for (let i = 0; i < 4 && !keys; i++) { keys = await read(); if (!keys) await new Promise(r => setTimeout(r, 300)); }
  }
  if (keys) pushKeysCache = keys;
  return keys;
}
const subId = (endpoint: string) => 's_' + createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

// Envoie une notification à un appareil. 'ok' | 'gone' (abonnement mort : à supprimer) | 'fail'
async function pushOne(sub: any, payload: unknown, keys: { pub: string; priv: string }): Promise<'ok' | 'gone' | 'fail'> {
  try {
    const body = await encryptPush(b64uDec(sub.p256dh), b64uDec(sub.auth), utf8(JSON.stringify(payload)));
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: await vapidHeader(sub.endpoint, PUSH_SUBJECT, keys.pub, keys.priv, Math.floor(Date.now() / 1000)), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404 || r.status === 410) return 'gone';
    if (!r.ok) { console.error('push refused:', r.status); return 'fail'; }
    return 'ok';
  } catch (e) { console.error('push error:', String((e as any)?.message || e).slice(0, 120)); return 'fail'; }
}
// Prévient des personnes (tous leurs appareils). Rend le nombre d'envois réussis ; ne plante jamais.
async function pushTo(userIds: string[], text: PushText, tag: string, link?: DeepLink, cat?: PushCat): Promise<number> {
  try {
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return 0;
    const keys = await pushKeys();
    if (!keys) return 0;
    const { data: rows } = await sb.from(PUSH_SUBS).select('id,data').in('data->>user_id', ids);
    const subs = ((rows || []) as any[]).filter(r => !(cat && Array.isArray(r.data?.off) && r.data.off.includes(cat))); // la catégorie coupée sur cet appareil n'y arrive pas
    const results = await Promise.all(subs.map(async (r) => ({ id: r.id, res: await pushOne(r.data, { fr: text.fr, en: text.en, url: link ? deepLinkUrl(link) : '/', tag }, keys) })));
    const dead = results.filter(x => x.res === 'gone').map(x => x.id);
    if (dead.length) await sb.from(PUSH_SUBS).delete().in('id', dead);
    return results.filter(x => x.res === 'ok').length;
  } catch (e) { console.error('pushTo error:', String((e as any)?.message || e).slice(0, 120)); return 0; }
}
// Prévient tous les responsables (leurs appareils où la catégorie n'est pas coupée)
async function pushAdmins(cat: PushCat, text: PushText, tag: string, link: DeepLink): Promise<number> {
  const { data: us } = await sb.from(T.users).select('id').eq('data->>role', 'admin');
  return await pushTo((us || []).map((r: any) => String(r.id)), text, tag, link, cat);
}
// Message reçu : le destinataire, ou tout le monde sauf l'auteur pour le groupe général (comme la cloche) ; le texte du message n'est jamais envoyé
async function pushMessage(m: any): Promise<number> {
  const group = !m.recipient_id || m.recipient_id === 'all';
  let ids: string[] = [];
  if (group) { const { data: us } = await sb.from(T.users).select('id,data'); ids = (us || []).filter((r: any) => String(r.id) !== String(m.sender_id) && r.data?.status !== 'blocked').map((r: any) => String(r.id)); }
  else if (String(m.recipient_id) !== String(m.sender_id)) ids = [String(m.recipient_id)];
  return await pushTo(ids, notifyText('message', { name: m.sender_name, group }), `msg:${m.id}`.slice(0, 60), { go: 'chat', thread: group ? 'all' : String(m.sender_id) }, 'messages');
}
// Un résultat envoyé « en arrière-plan » quand c'est possible, pour ne pas ralentir la réponse
function later(p: Promise<unknown>): Promise<unknown> { const rt = (globalThis as any).EdgeRuntime; if (rt && typeof rt.waitUntil === 'function') { rt.waitUntil(p); return Promise.resolve(); } return p; }
// Changement de statut d'une session par le responsable → notification de l'opérateur
function pushKindFor(before: unknown, after: unknown): PushKind | null {
  if (before === 'pending_start' && after === 'active') return 'start_ok';
  if (before === 'pending_end' && after === 'completed') return 'end_ok';
  if ((before === 'pending_start' || before === 'pending_end') && after === 'rejected') return 'refused';
  return null;
}

async function pushKeyRoute(_req: any, res: any, _me: any) {
  const k = await pushKeys();
  if (!k) return res.status(503).json({ error: 'Notifications indisponibles pour le moment.' });
  return res.json({ key: k.pub });
}
async function pushSubscribeRoute(req: any, res: any, me: any) {
  const sub = cleanPushSubscription(req.body?.subscription);
  if (!sub) return res.status(400).json({ error: 'Abonnement invalide.' });
  const id = subId(sub.endpoint);
  const { data: mine } = await sb.from(PUSH_SUBS).select('id').eq('data->>user_id', me.id);
  if ((mine || []).filter((r: any) => r.id !== id).length >= PUSH_MAX_SUBS) return res.status(400).json({ error: `${PUSH_MAX_SUBS} appareils au maximum. Désactive les notifications sur un autre appareil.` });
  const { data: prev } = await sb.from(PUSH_SUBS).select('data').eq('id', id).maybeSingle();
  const off = cleanPushOff((prev as any)?.data?.off); // se réabonner ne remet pas les interrupteurs à zéro
  await sb.from(PUSH_SUBS).upsert({ id, data: { user_id: me.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, created: new Date().toISOString(), ...(off.length ? { off } : {}) }, updated_at: new Date().toISOString() });
  return res.json({ ok: true });
}
// Interrupteurs par catégorie, appareil par appareil : { endpoint, off? } ; sans « off » on lit seulement ; l'appareil doit appartenir à la personne
async function pushPrefsRoute(req: any, res: any, me: any) {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (!endpoint || endpoint.length > 2000) return res.status(400).json({ error: 'Appareil invalide.' });
  const id = subId(endpoint);
  const { data: row } = await sb.from(PUSH_SUBS).select('data').eq('id', id).maybeSingle();
  if (!row || (row as any).data?.user_id !== me.id) return res.status(404).json({ error: 'Appareil inconnu.' });
  if (req.body?.off === undefined) return res.json({ ok: true, off: cleanPushOff((row as any).data?.off) });
  const off = cleanPushOff(req.body.off);
  const next = { ...(row as any).data }; delete next.off; if (off.length) next.off = off;
  await sb.from(PUSH_SUBS).upsert({ id, data: next, updated_at: new Date().toISOString() });
  return res.json({ ok: true, off });
}
async function pushUnsubscribeRoute(req: any, res: any, me: any) {
  const ep = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim().slice(0, 600) : '';
  if (!ep) return res.status(400).json({ error: 'Abonnement invalide.' });
  await sb.from(PUSH_SUBS).delete().eq('id', subId(ep)).eq('data->>user_id', me.id);
  return res.json({ ok: true });
}
async function pushTestRoute(_req: any, res: any, me: any) {
  const n = await pushTo([me.id], { fr: { title: 'Notifications actives', body: 'Tu recevras ici les validations et les échéances de tes missions.' }, en: { title: 'Notifications on', body: 'You will get mission approvals and deadlines here.' } }, 'test');
  return res.json({ ok: true, sent: n });
}
// Appelée toutes les 15 minutes par la base (pg_cron), avec un secret : rappels d'échéance, jamais deux fois.
// Missions récurrentes (M15.1) : appelée toutes les 15 min par la tâche planifiée « df-recurring-due » (même secret que push-due).
// Crée les missions dont l'heure vient de passer. L'identifiant est calculé (règle + date) : une mission déjà créée n'est jamais recréée ni écrasée. Ne supprime rien.
async function recurringDue(request: Request, res: any) {
  const given = request.headers.get('x-cron-secret') || '';
  const { data: want } = await sb.rpc('df_push_get_secret', { secret_name: 'push_cron_secret' });
  const a = Buffer.from(given), b = Buffer.from(String(want || ''));
  if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'refusé' });
  const st: any = await getSettings();
  const rules = cleanRecurring(st?.recurring_missions);
  const due = dueOccurrences(rules, Date.now());
  if (!due.length) return res.json({ due: 0, created: 0 });
  const { data: cs, error: ce } = await sb.from(T.contracts).select('id,data');
  if (ce) return res.status(500).json({ error: 'lecture impossible' });
  const existingIds = new Set((cs || []).map((r: any) => String(r.id)));
  const used = new Set((cs || []).map((r: any) => Number(r.data?.post_number)));
  const reward = Math.round(Number(st?.price_per_mission) || 0);
  let created = 0, failed = 0;
  for (const o of due) {
    if (existingIds.has(o.id)) continue;
    let n = 1; while (used.has(n)) n++;
    const rec = buildContract(o.rule, o.date, n, reward);
    const { error } = await sb.from(T.contracts).upsert({ id: o.id, data: rec, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { failed++; continue; }
    existingIds.add(o.id); used.add(n); created++;
  }
  return res.json({ due: due.length, created, failed });
}

// Rapport automatique (M15.5). Table df_reports : absente de T (jamais écrite par la synchro), comme df_audit ; seulement ces routes.
const REPORTS = "df_reports";
// Appelée toutes les 15 min par la tâche planifiée « df-report-due » (même secret que push-due). Crée UNE fiche « en attente » pour la période finie
// (identifiant = période : une fiche déjà là n'est jamais recréée ni écrasée), prévient le responsable, puis garde les 24 plus récentes.
async function reportDue(request: Request, res: any) {
  const given = request.headers.get('x-cron-secret') || '';
  const { data: want } = await sb.rpc('df_push_get_secret', { secret_name: 'push_cron_secret' });
  const a = Buffer.from(given), b = Buffer.from(String(want || ''));
  if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'refusé' });
  const st: any = await getSettings();
  const due = dueReport(cleanAutoReport(st?.auto_report), Date.now());
  if (!due) return res.json({ due: 0, created: 0 });
  const nowIso = new Date().toISOString();
  const checked = checkReportRecord({ id: due.id, status: 'pending', created_at: nowIso });
  if (!checked.ok) return res.status(500).json({ error: 'fiche non valide' });
  const { error } = await sb.from(REPORTS).insert({ id: due.id, data: checked.value, updated_at: nowIso });
  if (error) {
    if ((error as any).code === '23505') return res.json({ due: 1, created: 0 }); // déjà créée : rien à refaire, personne n'est prévenu deux fois
    return res.status(500).json({ error: 'écriture impossible' });
  }
  const { data: us } = await sb.from(T.users).select('id').eq('data->>role', 'admin');
  const sent = await pushTo((us || []).map((r: any) => String(r.id)), reportNotice(due), ('rep-' + due.id).slice(0, 60), { go: 'stats', tab: 'report' });
  const { data: all } = await sb.from(REPORTS).select('id');
  const old = reportsToPrune((all || []).map((r: any) => ({ id: String(r.id) })));
  if (old.length) await sb.from(REPORTS).delete().in('id', old);
  return res.json({ due: 1, created: 1, notified: sent, pruned: old.length });
}
// Liste des fiches (sans le texte, qui est gros), les plus récentes d'abord. Responsable seulement.
async function reportList(_req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const { data, error } = await sb.from(REPORTS).select('data').order('id', { ascending: false }).limit(60);
  if (error) return res.status(500).json({ error: "Les rapports ne sont pas disponibles (table df_reports absente ?)." });
  const rows = (data || []).map((r: any) => r.data).filter((d: any) => d && typeof d === 'object').map((d: any) => ({ id: d.id, kind: d.kind, start: d.start, end: d.end, status: d.status, created_at: d.created_at, frozen_at: d.frozen_at }));
  rows.sort((x: any, y: any) => String(y.end).localeCompare(String(x.end)) || String(y.id).localeCompare(String(x.id)));
  return res.json({ rows });
}
// Une fiche entière (avec son texte si elle est prête). Responsable seulement.
async function reportOpen(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const p = periodFromId(String((req.body || {}).id || ''));
  if (!p) return res.status(400).json({ error: 'Rapport inconnu.' });
  const { data, error } = await sb.from(REPORTS).select('data').eq('id', p.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lecture impossible.' });
  if (!data) return res.status(404).json({ error: 'Rapport introuvable.' });
  return res.json({ record: data.data });
}
// Fige la copie : une fiche « en attente » devient « prête » avec le texte envoyé par le responsable. Une copie déjà figée ne change JAMAIS.
async function reportFreeze(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
  const b = req.body || {};
  const p = periodFromId(String(b.id || ''));
  if (!p) return res.status(400).json({ error: 'Rapport inconnu.' });
  const { data: row, error } = await sb.from(REPORTS).select('data').eq('id', p.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lecture impossible.' });
  if (!row) return res.status(404).json({ error: 'Rapport introuvable.' });
  const cur = checkReportRecord(row.data);
  if (!cur.ok) return res.status(500).json({ error: 'Fiche illisible.' });
  if (cur.value.status === 'ready') return res.json({ record: cur.value, already: true }); // déjà figée : on rend celle qui existe
  const next = freezeReport(cur.value, b.html, new Date().toISOString());
  if (!next) return res.status(400).json({ error: 'Texte du rapport non valide.' });
  const ck = checkReportRecord(next);
  if (!ck.ok) return res.status(400).json({ error: 'Texte du rapport non valide.' });
  // Seulement si la fiche est encore « en attente » au moment de l'écriture : deux envois en même temps ne s'écrasent pas.
  const { data: saved, error: werr } = await sb.from(REPORTS).update({ data: ck.value, updated_at: ck.value.frozen_at }).eq('id', p.id).eq('data->>status', 'pending').select('data');
  if (werr) return res.status(500).json({ error: 'Écriture impossible.' });
  if (!saved || !saved.length) {
    const { data: again } = await sb.from(REPORTS).select('data').eq('id', p.id).maybeSingle();
    return res.json({ record: again?.data ?? ck.value, already: true });
  }
  return res.json({ record: ck.value, already: false });
}

async function pushDue(request: Request, res: any) {
  const given = request.headers.get('x-cron-secret') || '';
  const { data: want } = await sb.rpc('df_push_get_secret', { secret_name: 'push_cron_secret' });
  const a = Buffer.from(given), b = Buffer.from(String(want || ''));
  if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'refusé' });
  const nowMs = Date.now();
  const [{ data: cs }, { data: ps }, { data: us }] = await Promise.all([
    sb.from(T.contracts).select('data').not('data->>due_date', 'is', null),
    sb.from(T.posts).select('data').in('data->>status', ['active', 'pending_start']),
    sb.from(T.users).select('id,data').eq('data->>role', 'admin'),
  ]);
  const reminders = dueReminders((cs || []).map((r: any) => r.data), (ps || []).map((r: any) => r.data), nowMs);
  const adminIds = (us || []).map((r: any) => String(r.id));
  let sent = 0, done = 0;
  if (reminders.length) {
    const { data: seen } = await sb.from(PUSH_LOG).select('id').in('id', reminders.map(r => r.key));
    const seenSet = new Set((seen || []).map((r: any) => r.id));
    for (const r of reminders) {
      if (seenSet.has(r.key)) continue;
      const n = await pushTo([...r.user_ids, ...(r.admins ? adminIds : [])], pushText(r.kind, { post_number: r.post_number, title: r.title, due: r.due }), r.key.slice(0, 60), { go: 'grid', nav: `mission-${r.post_number}` }, 'missions');
      if (n > 0) { await sb.from(PUSH_LOG).upsert({ id: r.key, data: { at: new Date().toISOString(), kind: r.kind, sent: n }, updated_at: new Date().toISOString() }); sent += n; done++; }
    }
  }
  await sb.from(PUSH_LOG).delete().lt('updated_at', new Date(nowMs - 30 * 24 * 3600 * 1000).toISOString()); // le journal ne grossit pas
  return res.json({ ok: true, reminders: reminders.length, notified: done, sent });
}

// ----- M13.7 : actions numérotées (une seule exécution par numéro) -----
// ===== BEGIN OFFLINE_ACTIONS (M13.7 : copie exacte de src/utils/offlineServer.ts ; ce bloc est contrôlé par scripts/check-offline-server.ts) =====
const ONCE_ROUTES: readonly string[] = ['news-react', 'news-comment', 'news-comment-delete', 'news-comment-react', 'news-share', 'news-submit', 'post-decide', 'report-error'];
const ACTION_RUNNING_MS = 120_000; // un appel « en cours » depuis plus longtemps est considéré comme tombé en panne : il peut être refait
const ACTION_KEEP_DAYS = 30; // les fiches plus anciennes sont effacées
const ACTION_BODY_MAX = 16_000; // réponse gardée : 16 000 caractères au plus (au-delà : seulement le code)

interface ActionRecord {
  state: 'running' | 'done';
  route: string;
  started_at: string; // heure du serveur au début
  received_at: string; // heure de réception par le serveur
  device_time: string | null; // heure du téléphone quand l'action a été faite (nettoyée, sinon null)
  skew_s: number | null; // écart serveur - téléphone en secondes (négatif : le téléphone est en avance)
  status?: number;
  body?: string;
  body_cut?: boolean;
}
interface ActionStore {
  claim(key: string, rec: ActionRecord): Promise<boolean>; // crée la fiche ; faux si elle existe déjà (jamais deux fois)
  read(key: string): Promise<ActionRecord | null>;
  update(key: string, rec: ActionRecord): Promise<void>;
  takeover(key: string, old: ActionRecord, rec: ActionRecord): Promise<boolean>; // remplace une fiche « en cours » tombée en panne, seulement si personne ne l'a changée entre-temps
  drop(key: string): Promise<void>;
}
type OnceOutcome = { kind: 'fresh' | 'replay'; status: number; body: string; record: ActionRecord } | { kind: 'busy'; status: 409; body: string };

/** Numéro d'action accepté : 8 à 64 caractères (lettres, chiffres, - _ . :). Sinon null (l'appel est refusé avec une raison claire). */
function cleanActionId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:-]{8,64}$/.test(s) ? s : null;
}
/** Heure du téléphone : acceptée si c'est une vraie date entre 2020 et demain ; sinon null (on l'ignore, on ne refuse pas l'action pour ça). */
function cleanDeviceTime(v: unknown, nowMs: number): { iso: string | null; skew_s: number | null } {
  if (typeof v !== 'string' || v.length > 40) return { iso: null, skew_s: null };
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < Date.UTC(2020, 0, 1) || t > nowMs + 24 * 3600 * 1000) return { iso: null, skew_s: null };
  return { iso: new Date(t).toISOString(), skew_s: Math.round((nowMs - t) / 1000) };
}
/** Clé de la fiche : propre à la personne (une autre personne ne peut ni rejouer ni deviner la réponse). `anon` : appel sans connexion (rapport d'erreur). */
function actionKey(userId: string | null, actionId: string): string { return `${userId || 'anon'}:${actionId}`; }

const iso = (ms: number) => new Date(ms).toISOString();
const BUSY_BODY = JSON.stringify({ error: 'Cette action est déjà en cours d\'envoi : patiente quelques secondes, puis réessaie.', code: 'in_progress' });

/**
 * Exécute `exec` UNE seule fois pour ce numéro d'action.
 * - première fois : la fiche est créée (« en cours »), l'action est faite, la réponse est gardée (sauf erreur serveur 5xx : la fiche est effacée pour permettre un nouvel essai) ;
 * - déjà faite : on rend la même réponse, sans refaire ;
 * - en cours (appel simultané) : 409 « déjà en cours » ; si l'appel est tombé en panne depuis plus de 2 minutes, il est refait ;
 * - si `exec` lève une erreur, la fiche « en cours » est effacée puis l'erreur remonte (le téléphone pourra réessayer).
 */
async function runOnce(store: ActionStore, key: string, route: string, deviceTimeRaw: unknown, nowMs: number, exec: () => Promise<{ status: number; body: string }>): Promise<OnceOutcome> {
  const dt = cleanDeviceTime(deviceTimeRaw, nowMs);
  const mine: ActionRecord = { state: 'running', route, started_at: iso(nowMs), received_at: iso(nowMs), device_time: dt.iso, skew_s: dt.skew_s };
  let owner = await store.claim(key, mine);
  if (!owner) {
    const old = await store.read(key);
    if (old && old.state === 'done') return { kind: 'replay', status: old.status ?? 200, body: old.body ?? JSON.stringify({ ok: (old.status ?? 200) < 400, replayed: true, note: 'Action déjà faite : la réponse d\'origine était trop longue pour être gardée.' }), record: old };
    if (old && old.state === 'running' && nowMs - Date.parse(old.started_at) < ACTION_RUNNING_MS) return { kind: 'busy', status: 409, body: BUSY_BODY };
    owner = old ? await store.takeover(key, old, mine) : await store.claim(key, mine); // fiche tombée en panne (ou disparue entre-temps)
    if (!owner) return { kind: 'busy', status: 409, body: BUSY_BODY };
  }
  let out: { status: number; body: string };
  try { out = await exec(); } catch (e) { await store.drop(key); throw e; }
  if (out.status >= 500) { await store.drop(key); return { kind: 'fresh', status: out.status, body: out.body, record: { ...mine, status: out.status } }; }
  const cut = out.body.length > ACTION_BODY_MAX;
  const done: ActionRecord = { ...mine, state: 'done', status: out.status, ...(cut ? { body_cut: true } : { body: out.body }) };
  await store.update(key, done);
  return { kind: 'fresh', status: out.status, body: out.body, record: done };
}
// ===== END OFFLINE_ACTIONS =====

// ---- Appels envoyés après une coupure (M13.7) : une même action (même numéro) n'est faite qu'UNE fois. Règles pures dans le bloc ci-dessus ; ici : la table df_actions.
const ACTIONS = "df_actions";
const actionStore: ActionStore = {
  async claim(key, rec) {
    const { data, error } = await sb.from(ACTIONS).upsert({ id: key, data: rec, updated_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  },
  async read(key) {
    const { data } = await sb.from(ACTIONS).select("data").eq("id", key).maybeSingle();
    return data ? (data.data as ActionRecord) : null;
  },
  async update(key, rec) { await sb.from(ACTIONS).update({ data: rec, updated_at: new Date().toISOString() }).eq("id", key); },
  async takeover(key, old, rec) {
    const { data } = await sb.from(ACTIONS).update({ data: rec, updated_at: new Date().toISOString() }).eq("id", key).eq("data->>state", "running").eq("data->>started_at", old.started_at).select("id");
    return Array.isArray(data) && data.length > 0;
  },
  async drop(key) { await sb.from(ACTIONS).delete().eq("id", key); },
};
async function callOnce(action: string, req: any, res: any, me: any): Promise<Response> {
  if (action === "report-error") return await reportError(req, res);
  if (action === "post-decide") return await postDecide(req, res, me);
  if (action === "news-react") return await newsAction('react', req, res, me);
  if (action === "news-comment") return await newsAction('comment', req, res, me);
  if (action === "news-comment-delete") return await newsAction('comment-delete', req, res, me);
  if (action === "news-comment-react") return await newsAction('comment-react', req, res, me);
  if (action === "news-share") return await newsAction('share', req, res, me);
  return await newsSubmit(req, res, me); // news-submit
}
async function onceRoute(action: string, req: any, res: any, me: any): Promise<Response> {
  const id = cleanActionId(req.headers.actionId);
  if (!id) return res.status(400).json({ error: "Numéro d'action invalide (8 à 64 caractères : lettres, chiffres, - _ . :).", code: "bad_action_id" });
  const nowMs = Date.now();
  const out = await runOnce(actionStore, actionKey(me ? me.id : null, id), action, req.headers.deviceTime, nowMs, async () => {
    const r: Response = await callOnce(action, req, res, me);
    return { status: r.status, body: await r.text() };
  });
  if (Math.random() < 0.02) void sb.from(ACTIONS).delete().lt("updated_at", new Date(nowMs - ACTION_KEEP_DAYS * 86400000).toISOString()); // la table ne grossit pas
  return new Response(out.body, { status: out.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...(out.kind === "replay" ? { "x-df-replayed": "1" } : {}) } });
}

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
      actionId: request.headers.get("x-df-action-id") || "", // numéro d'action (appels envoyés après une coupure)
      deviceTime: request.headers.get("x-df-device-time") || "", // heure du téléphone quand l'action a été faite
    },
  };
  try {
    if (action === "login" && req.method === "POST") return await login(req, res);
    if (action === "forgot" && req.method === "POST") return await forgot(req, res);
    if (action === "access-request" && req.method === "POST") return await accessRequest(req, res);
    if (action === "signup" && req.method === "POST") return await signup(req, res);
    if (action === "report-error" && req.method === "POST" && req.headers.actionId) return await onceRoute(action, req, res, null);
    if (action === "report-error" && req.method === "POST") return await reportError(req, res);
    if (action === "push-due" && req.method === "POST") return await pushDue(request, res);
    if (action === "recurring-due" && req.method === "POST") return await recurringDue(request, res);
    if (action === "report-due" && req.method === "POST") return await reportDue(request, res);
    const me = await authenticate(req);
    if (!me) return res.status(401).json({ error: "Session expirée. Reconnectez-vous." });
    if (action !== "logout") {
      const mm = await maintenanceMessage(me);
      if (mm) return res.status(503).json({ error: mm, code: 'maintenance' });
      const acc = await shiftAccess(me);
      if (!acc.ok) return res.status(401).json({ error: acc.message, code: 'shift' });
    }
    if (req.method === "POST" && req.headers.actionId && ONCE_ROUTES.includes(action)) return await onceRoute(action, req, res, me); // même numéro = même réponse, jamais deux fois
    if (action === "state" && req.method === "GET") return await state(req, res, me);
    if (action === "attendance" && req.method === "GET") return await attendanceRoute(req, res, me);
    if (action === "errors" && req.method === "GET") return await errorsList(req, res, me);
    if (action === "error-update" && req.method === "POST") return await errorUpdate(req, res, me);
    if (action === "backups" && req.method === "GET") return await backupsList(req, res, me);
    if (action === "backup-get" && req.method === "GET") return await backupGet(req, res, me);
    if (action === "backup-import" && req.method === "POST") return await backupImport(req, res, me);
    if (action === "backup-now" && req.method === "POST") return await backupNow(req, res, me);
    if (action === "audit-list" && req.method === "GET") return await auditList(req, res, me);
    if (action === "report-list" && req.method === "POST") return await reportList(req, res, me);
    if (action === "report-open" && req.method === "POST") return await reportOpen(req, res, me);
    if (action === "report-freeze" && req.method === "POST") return await reportFreeze(req, res, me);
    if (action === "post-decide" && req.method === "POST") return await postDecide(req, res, me);
    if (action === "sync" && req.method === "POST") return await sync(req, res, me);
    if (action === "push-key" && req.method === "GET") return await pushKeyRoute(req, res, me);
    if (action === "push-subscribe" && req.method === "POST") return await pushSubscribeRoute(req, res, me);
    if (action === "push-prefs" && req.method === "POST") return await pushPrefsRoute(req, res, me);
    if (action === "push-unsubscribe" && req.method === "POST") return await pushUnsubscribeRoute(req, res, me);
    if (action === "push-test" && req.method === "POST") return await pushTestRoute(req, res, me);
    if (action === "news-react" && req.method === "POST") return await newsAction('react', req, res, me);
    if (action === "news-comment" && req.method === "POST") return await newsAction('comment', req, res, me);
    if (action === "news-comment-delete" && req.method === "POST") return await newsAction('comment-delete', req, res, me);
    if (action === "news-comment-react" && req.method === "POST") return await newsAction('comment-react', req, res, me);
    if (action === "typing" && req.method === "POST") return await typingPing(req, res, me);
    if (action === "typing" && req.method === "GET") return await typingList(req, res, me);
    if (action === "news-share" && req.method === "POST") return await newsAction('share', req, res, me);
    if (action === "news-submit" && req.method === "POST") return await newsSubmit(req, res, me);
    if (action === "news-decision" && req.method === "POST") return await newsDecision(req, res, me);
    if (action === "news-withdraw" && req.method === "POST") return await newsWithdraw(req, res, me);
    if (action === "news-edit" && req.method === "POST") return await newsEdit(req, res, me);
    if (action === "create-user" && req.method === "POST") return await createUser(req, res, me);
    if (action === "set-password" && req.method === "POST") return await setPassword(req, res, me);
    if (action === "totp-status" && req.method === "GET") return await totpStatus(req, res, me);
    if (action === "totp-start" && req.method === "POST") return await totpStart(req, res, me);
    if (action === "totp-enable" && req.method === "POST") return await totpEnable(req, res, me);
    if (action === "totp-disable" && req.method === "POST") return await totpDisable(req, res, me);
    if (action === "totp-new-backup" && req.method === "POST") return await totpNewBackup(req, res, me);
    if (action === "totp-reset" && req.method === "POST") return await totpReset(req, res, me);
    if (action === "logout" && req.method === "POST") return await logout(req, res, me);
    if (action === "reset-decision" && req.method === "POST") return await resetDecision(req, res, me);
    if (action === "access-decide" && req.method === "POST") return await accessDecide(req, res, me);
    if (action === "signup-decision" && req.method === "POST") return await signupDecision(req, res, me);
    if (action === "invoice-issue" && req.method === "POST") return await invoiceIssue(req, res, me);
    if (action === "invoice-cancel" && req.method === "POST") return await invoiceCancel(req, res, me);
    if (action === "invoice-pay" && req.method === "POST") return await invoicePay(req, res, me);
    if (action === "accounting-sync" && req.method === "POST") return await accountingSync(req, res, me);
    if (action === "accounting-post" && req.method === "POST") return await accountingPost(req, res, me);
    if (action === "accounting-reverse" && req.method === "POST") return await accountingReverse(req, res, me);
    if (action === "accounting-close" && req.method === "POST") return await accountingClose(req, res, me);
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
