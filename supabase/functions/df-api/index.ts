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
} as const;
type Col = keyof typeof T;
const COLS = Object.keys(T) as Col[];

// ===== BEGIN CASH (finances : réservé à l'administrateur ; ce bloc est contrôlé par scripts/check-cash.ts) =====
// Collections qu'un employé ne reçoit JAMAIS (lecture) : journal de sécurité des autres et finances.
const ADMIN_ONLY_READ: string[] = ["securityLogs", "cash", "products", "stock", "clients", "suppliers", "purchases", "invoices"];
// Collections qu'un employé ne peut JAMAIS écrire ni supprimer (le journal de sécurité reste écrivable pour ses propres lignes).
const ADMIN_ONLY_WRITE: string[] = ["cash", "products", "stock", "clients", "suppliers", "purchases", "invoices"];

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
  return {
    ok: true,
    save: {
      id: rec.id, name, category: String(rec.category || "").trim().slice(0, 40), unit: String(rec.unit || "").trim().slice(0, 16) || "unité",
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

// ===== BEGIN PRIVACY (prix client et objectifs d'argent : jamais envoyés à un employé ; ce bloc est contrôlé par scripts/check-phase4.ts) =====
// Réglages que seul l'admin reçoit : prix client, objectifs du mois, seuils d'alerte.
const SETTINGS_ADMIN_KEYS: string[] = ["client_price_default_ar", "client_prices_by_type", "goal_missions", "goal_profit_ar", "goal_max_expenses_ar", "alert_unpaid_days", "alert_low_cash_ar", "mission_templates", "budgets"];
/** Réglages envoyés à un employé : sans prix client ni objectifs. L'admin reçoit tout. */
const stripSettings = (rec: any, me: any) => {
  if (!rec || me.role === "admin") return rec;
  const out = { ...rec };
  for (const k of SETTINGS_ADMIN_KEYS) delete out[k];
  return out;
};
/** Mission ou session envoyée à un employé : sans le prix client ni le lien vers la fiche client (même pour ses propres sessions). */
const withoutClientPrice = (rec: any, me: any) => {
  if (!rec || me.role === "admin" || !("client_price_ar" in rec || "client_id" in rec)) return rec;
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
  texts: { internal_rules: { t: "text", max: 5e3, multi: true }, customer_terms: { t: "text", max: 5e3, multi: true } }
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
  texts: { internal_rules: "", customer_terms: "" }
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
  return { leave: full.leave, texts: { internal_rules: full.texts.internal_rules } };
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
  if (!rec || me.role === "admin") return rec;
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
const AUDIT_ACTIONS = ["invoice_issue", "invoice_cancel", "invoice_pay", "delete", "tariff_change", "settings_change", "company_change", "user_create", "user_password", "signup_decision", "profile_decision", "reset_decision", "payroll_close", "payroll_reopen", "payroll_pay", "backup_now"];
const AUDIT_KEEP_DAYS = 365;
const AUDIT_TARIFF_KEYS = ["price_per_million", "client_price_default_ar", "client_prices_by_type"];
const AUDIT_SETTINGS_SKIP = ["company", "company_log", "budgets", "mission_templates"];
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
  return { ok: false, message: `Ta vacation ${shift === 'night' ? 'de nuit' : 'de jour'} est de ${from} à ${to}. Tu peux te connecter à partir de ${opens}.` };
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
const stripUser = (u: any, me: any) => (me.role === 'admin' || u.id === me.id ? u : { ...u, phone: undefined, cv_url: undefined, cv_data: undefined });
const stripPost = (p: any, me: any) =>
  me.role === 'admin' || p.employee_id === me.id
    ? withoutClientPrice(p, me)
    : { ...withoutClientPrice(p, me), start_proof_url: '', start_proof_urls: [], end_proof_url: '', end_proof_urls: [] };

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
    if (!admin && ADMIN_ONLY_READ.includes(col)) { out[col] = { changed: [], ids: [] }; continue; } // journal de sécurité et finances : jamais envoyés à un employé
    if (col === 'groups') {
      const sinceMs = new Date(since).getTime();
      out[col] = { changed: myGroups.filter((r: any) => new Date(r.updated_at).getTime() >= sinceMs).map((r: any) => r.data), ids: myGroups.map((r: any) => r.id) };
      continue;
    }
    const scope = (q: any) => {
      if (admin) return q;
      if (col === 'advances') return q.eq('data->>employee_id', me.id);
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
    const [{ data: changed }, { data: ids }] = await Promise.all([
      scope(sb.from(T[col]).select('data').gte('updated_at', since)),
      scope(sb.from(T[col]).select('id')),
    ]);
    let recs = (changed || []).map((r: any) => r.data);
    if (col === 'users') recs = recs.map((u: any) => stripUser(u, me));
    if (col === 'posts') recs = recs.map((p: any) => stripPost(p, me));
    if (col === 'contracts') recs = recs.map((c: any) => withoutClientPrice(c, me));
    if (col === 'settings') recs = recs.map((r: any) => stripCompany(stripSettings(r, me), me));
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
  const pres = (presRows || []).map(({ typing_to: _tt, typing_at: _ta, ...r }: any) => r); // l'indicateur « écrit… » passe par sa propre route
  // Coches « lu » : jusqu'où les autres ont lu mes conversations (l'admin voit tout)
  let readsQ = sb.from(CHAT_READS).select('user_id, thread, ms');
  if (!admin) readsQ = readsQ.in('thread', [me.id, ...myGroupIds]);
  const { data: readRows } = await readsQ;
  const reads = (readRows || []).map((r: any) => ({ user_id: r.user_id, thread: r.thread, ms: Number(r.ms) }));
  return res.json({ serverTime, me, collections: out, reads, resets, signups, profileRequests, presence: admin ? pres : undefined, queue: admin ? undefined : queueOf(pres, me.id) });
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

    if (!admin && ADMIN_ONLY_WRITE.includes(col)) {
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
      if (col === 'settings') { toSave = cleanSettingsRecord(rec, existing, me, now); toSave = applyBudgets(toSave, rec, existing); } // seul l'admin arrive ici ; `company` et `budgets` sont revérifiés
      if (col === 'settings') {
        // Modèles de mission (M6.2) : revérifiés ; un vieux site qui ne les envoie pas ne les efface pas
        const sentTpl = (rec as any).mission_templates === undefined ? (existing as any)?.mission_templates : (rec as any).mission_templates;
        if (sentTpl !== undefined) toSave = { ...toSave, mission_templates: cleanMissionTemplates(sentTpl) };
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
      if (admin && existing) {
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
        if (k && toSave.employee_id) pushJobs.push(pushTo([String(toSave.employee_id)], pushText(k, { post_number: toSave.post_number, title: toSave.client_name, reason: toSave.rejection_reason }), `${k}:${rec.id}`.slice(0, 60)));
      }
      if (!admin && col === 'posts' && OPEN_STATUS.includes(rec.status)) tookPost = true;
    }

    for (const id of deletes) {
      // Journal d'audit : le nom de ce qu'on supprime est lu AVANT (la ligne disparaît ensuite). Les messages ne sont pas notés.
      const auditDel = admin && col !== 'messages' ? (await sb.from(T[col]).select('data').eq('id', id).maybeSingle()).data : null;
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
      if (col === 'clients') {
        // Un client qui a des missions, des sessions ou des factures ne se supprime jamais : on le désactive (active = false).
        const { data: usedC } = await sb.from(T.contracts).select('id').eq('data->>client_id', id).limit(1);
        const { data: usedP } = await sb.from(T.posts).select('id').eq('data->>client_id', id).limit(1);
        const { data: usedI } = await sb.from(T.invoices).select('id').eq('data->>client_id', id).limit(1);
        if ((usedC && usedC.length) || (usedP && usedP.length) || (usedI && usedI.length)) { rejected.push({ col, id, reason: 'in_use' }); continue; }
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
const invoiceFail = (res: any, message: string) => { const f = invoiceErrorOf(message); return res.status(f.status).json({ error: f.error, ...(f.max !== undefined ? { max: f.max } : {}) }); };
const newDocId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function invoiceIssue(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
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
  const no = adminOnly(res, me); if (no) return no;
  const id = String(req.body?.id || '');
  if (!id) return res.status(400).json({ error: 'Demande invalide.' });
  const today = invTodayMada();
  const { data, error } = await sb.rpc('df_cancel_invoice', { p_id: id, p_credit_id: newDocId('cn'), p_prefix: 'AV-', p_year: Number(today.slice(0, 4)), p_today: today, p_by: me.id });
  if (error) return invoiceFail(res, error.message);
  await auditLog(me, 'invoice_cancel', { type: 'invoices', id, label: id }, 'Annulée par un avoir');
  return res.json({ ok: true, ...data });
}

async function invoicePay(req: any, res: any, me: any) {
  const no = adminOnly(res, me); if (no) return no;
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
  const { id, text, commentId, files, emoji } = req.body || {};
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
  if (kind === 'react') {
    d.loves = d.loves.includes(me.id) ? d.loves.filter((x: string) => x !== me.id) : [...d.loves, me.id];
  } else if (kind === 'comment') {
    const clean = String(text || '').trim().slice(0, NEWS_MAX_COMMENT);
    const cf = cleanFiles(files, me.id);
    if (!clean && !cf.length) return res.status(400).json({ error: 'Écris un commentaire ou joins un fichier.' });
    if (d.comments.length >= NEWS_MAX_COMMENTS) return res.status(400).json({ error: 'Trop de commentaires sur cette publication.' });
    d.comments.push({ id: `c-${Date.now()}-${randomBytes(3).toString('hex')}`, user_id: me.id, user_name: String(me.name || '').slice(0, 80), role: me.role, text: clean, ...(cf.length ? { files: cf } : {}), created_at: new Date().toISOString() });
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
    await dropFiles(Array.isArray(c.files) ? c.files : []);
    d.comments = d.comments.filter((x: any) => x.id !== commentId);
  } else {
    d.shares += 1;
  }
  await sb.from(T.news).upsert({ id, data: d, updated_at: new Date().toISOString() });
  return res.json({ ok: true, news: d });
}

// L'employé propose une publication : elle reste « en attente » jusqu'à la décision du responsable
async function newsSubmit(req: any, res: any, me: any) {
  if (me.role === 'admin') return res.status(403).json({ error: 'Le responsable publie directement.' });
  const b = req.body || {};
  const text = String(b.text || '').trim().slice(0, NEWS_MAX_TEXT);
  const files = cleanFiles(b.files, me.id);
  if (!text && !files.length) return res.status(400).json({ error: 'Écris un texte ou joins un fichier.' });
  const { count } = await sb.from(T.news).select('id', { count: 'exact', head: true }).eq('data->>author_id', me.id).eq('data->>status', 'pending');
  if ((count || 0) >= NEWS_MAX_PENDING) return res.status(400).json({ error: `Tu as déjà ${NEWS_MAX_PENDING} publications en attente. Attends la décision du responsable.` });
  const now = new Date().toISOString();
  const id = `news-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const d = {
    id, author_id: me.id, author_name: String(me.name || '').slice(0, 80), author_role: 'employee',
    title: String(b.title || '').trim().slice(0, 120), text, created_at: now, submitted_at: now, pinned: false, status: 'pending',
    files, loves: [], comments: [], shares: 0,
  };
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
async function pushTo(userIds: string[], text: PushText, tag: string): Promise<number> {
  try {
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return 0;
    const keys = await pushKeys();
    if (!keys) return 0;
    const { data: rows } = await sb.from(PUSH_SUBS).select('id,data').in('data->>user_id', ids);
    const subs = (rows || []) as any[];
    const results = await Promise.all(subs.map(async (r) => ({ id: r.id, res: await pushOne(r.data, { fr: text.fr, en: text.en, url: '/', tag }, keys) })));
    const dead = results.filter(x => x.res === 'gone').map(x => x.id);
    if (dead.length) await sb.from(PUSH_SUBS).delete().in('id', dead);
    return results.filter(x => x.res === 'ok').length;
  } catch (e) { console.error('pushTo error:', String((e as any)?.message || e).slice(0, 120)); return 0; }
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
  await sb.from(PUSH_SUBS).upsert({ id, data: { user_id: me.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, created: new Date().toISOString() }, updated_at: new Date().toISOString() });
  return res.json({ ok: true });
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
      const n = await pushTo([...r.user_ids, ...(r.admins ? adminIds : [])], pushText(r.kind, { post_number: r.post_number, title: r.title, due: r.due }), r.key.slice(0, 60));
      if (n > 0) { await sb.from(PUSH_LOG).upsert({ id: r.key, data: { at: new Date().toISOString(), kind: r.kind, sent: n }, updated_at: new Date().toISOString() }); sent += n; done++; }
    }
  }
  await sb.from(PUSH_LOG).delete().lt('updated_at', new Date(nowMs - 30 * 24 * 3600 * 1000).toISOString()); // le journal ne grossit pas
  return res.json({ ok: true, reminders: reminders.length, notified: done, sent });
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
    },
  };
  try {
    if (action === "login" && req.method === "POST") return await login(req, res);
    if (action === "forgot" && req.method === "POST") return await forgot(req, res);
    if (action === "signup" && req.method === "POST") return await signup(req, res);
    if (action === "report-error" && req.method === "POST") return await reportError(req, res);
    if (action === "push-due" && req.method === "POST") return await pushDue(request, res);
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
    if (action === "backups" && req.method === "GET") return await backupsList(req, res, me);
    if (action === "backup-get" && req.method === "GET") return await backupGet(req, res, me);
    if (action === "backup-now" && req.method === "POST") return await backupNow(req, res, me);
    if (action === "audit-list" && req.method === "GET") return await auditList(req, res, me);
    if (action === "sync" && req.method === "POST") return await sync(req, res, me);
    if (action === "push-key" && req.method === "GET") return await pushKeyRoute(req, res, me);
    if (action === "push-subscribe" && req.method === "POST") return await pushSubscribeRoute(req, res, me);
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
    if (action === "create-user" && req.method === "POST") return await createUser(req, res, me);
    if (action === "set-password" && req.method === "POST") return await setPassword(req, res, me);
    if (action === "logout" && req.method === "POST") return await logout(req, res, me);
    if (action === "reset-decision" && req.method === "POST") return await resetDecision(req, res, me);
    if (action === "signup-decision" && req.method === "POST") return await signupDecision(req, res, me);
    if (action === "invoice-issue" && req.method === "POST") return await invoiceIssue(req, res, me);
    if (action === "invoice-cancel" && req.method === "POST") return await invoiceCancel(req, res, me);
    if (action === "invoice-pay" && req.method === "POST") return await invoicePay(req, res, me);
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
