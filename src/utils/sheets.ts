// « Mes tableaux » (module 12) : règles pures d'un tableau (colonnes, lignes, corbeille, calcul, contrôle de saisie, tri/filtre, totaux, graphique, modèles, annuler/rétablir).
// Aucun accès au réseau ni au navigateur. Le même nettoyage `cleanSheet` sera recopié côté serveur (M12.4).
import { evalFormula, isErr, isFormula, type Env, type Val, FORMULA_MAX_LEN } from './sheetFormula';

export type ColType = 'text' | 'number' | 'date' | 'list' | 'check';
export interface Column { id: string; name: string; type: ColType; options?: string[]; required?: boolean; unique?: boolean; deleted_at?: string | null }
export interface Row { id: string; cells: Record<string, string>; deleted_at?: string | null }
export interface CondRule { id: string; col: string; op: '>' | '<' | '=' | '<>' | 'contains' | 'empty'; value: string; color: 'red' | 'green' | 'amber' | 'blue' }
export interface Sheet {
  id: string; title: string; columns: Column[]; rows: Row[]; rules: CondRule[];
  created_at: string; updated_at: string; deleted_at?: string | null;
  owner_id?: string; owner_name?: string; // posés par le serveur (le propriétaire ne change jamais)
  post_id?: string; // M18.6 : tableau préparé pour UNE session de mission (identifiant imposé : `sp-` + id de la session) ; le lien ne change jamais
}

/** Taille maximale d'un tableau une fois écrit en texte (caractères) : au-delà, le serveur refuse. */
export const SHEET_MAX_CHARS = 1_500_000;
/** Nombre maximal d'enregistrements par personne, corbeille comprise. */
export const SHEETS_MAX_RECORDS = 60;
export const sheetChars = (s: unknown): number => { try { return JSON.stringify(s).length; } catch { return Infinity; } };
export const LIMITS = { missionSheets: 400, sheetsPerPerson: 20, columns: 200, rows: 5000, cellLen: 500, title: 80, colName: 60, rules: 20, options: 50, trashDays: 30, history: 50 };
const COLORS = ['red', 'green', 'amber', 'blue'];
const OPS = ['>', '<', '=', '<>', 'contains', 'empty'];
const TYPES: ColType[] = ['text', 'number', 'date', 'list', 'check'];

let counter = 0;
export const newId = (p = 'x'): string => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const live = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter(x => !x.deleted_at);
export const activeColumns = (s: Sheet) => live(s.columns);
export const activeRows = (s: Sheet) => live(s.rows);
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, n);

export function emptySheet(title: string, now: string): Sheet {
  return { id: newId('s'), title: clip(title, LIMITS.title) || 'Sans titre', columns: [], rows: [], rules: [], created_at: now, updated_at: now };
}

// ---------- nettoyage (données venant du disque ou du serveur) ----------
export function cleanSheet(raw: unknown, now = new Date().toISOString()): Sheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 60) return null;
  const columns: Column[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.columns) ? r.columns.slice(0, LIMITS.columns) : []) {
    if (!c || typeof c !== 'object') continue;
    const x = c as Record<string, unknown>;
    const id = clip(x.id, 60);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const type = TYPES.includes(x.type as ColType) ? (x.type as ColType) : 'text';
    const col: Column = { id, name: clip(x.name, LIMITS.colName) || 'Colonne', type };
    if (type === 'list') col.options = (Array.isArray(x.options) ? x.options : []).map(o => clip(o, 60)).filter(Boolean).slice(0, LIMITS.options);
    if (x.required === true) col.required = true;
    if (x.unique === true) col.unique = true;
    if (typeof x.deleted_at === 'string') col.deleted_at = x.deleted_at.slice(0, 40);
    columns.push(col);
  }
  const rows: Row[] = [];
  const rowIds = new Set<string>();
  for (const w of Array.isArray(r.rows) ? r.rows.slice(0, LIMITS.rows) : []) {
    if (!w || typeof w !== 'object') continue;
    const x = w as Record<string, unknown>;
    const id = clip(x.id, 60);
    if (!id || rowIds.has(id)) continue;
    rowIds.add(id);
    const cells: Record<string, string> = {};
    if (x.cells && typeof x.cells === 'object') for (const c of columns) { const v = (x.cells as Record<string, unknown>)[c.id]; const t = clip(v, LIMITS.cellLen); if (t !== '') cells[c.id] = t; }
    const row: Row = { id, cells };
    if (typeof x.deleted_at === 'string') row.deleted_at = x.deleted_at.slice(0, 40);
    rows.push(row);
  }
  const rules: CondRule[] = [];
  for (const q of Array.isArray(r.rules) ? r.rules.slice(0, LIMITS.rules) : []) {
    if (!q || typeof q !== 'object') continue;
    const x = q as Record<string, unknown>;
    if (!seen.has(clip(x.col, 60)) || !OPS.includes(x.op as string) || !COLORS.includes(x.color as string)) continue;
    rules.push({ id: clip(x.id, 60) || `r${rules.length + 1}`, col: clip(x.col, 60), op: x.op as CondRule['op'], value: clip(x.value, 100), color: x.color as CondRule['color'] });
  }
  const s: Sheet = {
    id: r.id, title: clip(r.title, LIMITS.title) || 'Sans titre', columns, rows, rules,
    created_at: clip(r.created_at, 40) || now, updated_at: clip(r.updated_at, 40) || now,
  };
  if (typeof r.deleted_at === 'string') s.deleted_at = r.deleted_at.slice(0, 40);
  if (typeof r.owner_id === 'string' && r.owner_id) s.owner_id = r.owner_id.slice(0, 60);
  if (typeof r.owner_name === 'string' && r.owner_name) s.owner_name = r.owner_name.slice(0, 80);
  if (typeof r.post_id === 'string' && r.post_id) s.post_id = r.post_id.slice(0, 60);
  return s;
}

// ---------- opérations (retournent une NOUVELLE copie ; null = refusé) ----------
const touch = (s: Sheet, now: string, patch: Partial<Sheet>): Sheet => ({ ...s, ...patch, updated_at: now });

export function addColumn(s: Sheet, name: string, type: ColType, now: string, options?: string[]): Sheet | null {
  if (activeColumns(s).length >= LIMITS.columns || s.columns.length >= LIMITS.columns) return null;
  const col: Column = { id: newId('c'), name: clip(name, LIMITS.colName).trim() || 'Colonne', type: TYPES.includes(type) ? type : 'text' };
  if (col.type === 'list') col.options = (options || []).map(o => clip(o, 60).trim()).filter(Boolean).slice(0, LIMITS.options);
  return touch(s, now, { columns: [...s.columns, col] });
}
export function updateColumn(s: Sheet, id: string, patch: Partial<Pick<Column, 'name' | 'type' | 'options' | 'required' | 'unique'>>, now: string): Sheet | null {
  if (!s.columns.some(c => c.id === id)) return null;
  return touch(s, now, { columns: s.columns.map(c => (c.id !== id ? c : {
    ...c,
    name: patch.name !== undefined ? clip(patch.name, LIMITS.colName).trim() || c.name : c.name,
    type: patch.type && TYPES.includes(patch.type) ? patch.type : c.type,
    options: patch.options ? patch.options.map(o => clip(o, 60).trim()).filter(Boolean).slice(0, LIMITS.options) : c.options,
    required: patch.required ?? c.required, unique: patch.unique ?? c.unique,
  })) });
}
export const deleteColumn = (s: Sheet, id: string, now: string): Sheet | null => (s.columns.some(c => c.id === id && !c.deleted_at) ? touch(s, now, { columns: s.columns.map(c => (c.id === id ? { ...c, deleted_at: now } : c)) }) : null);
export const restoreColumn = (s: Sheet, id: string, now: string): Sheet | null => (s.columns.some(c => c.id === id && c.deleted_at) ? touch(s, now, { columns: s.columns.map(c => (c.id === id ? { ...c, deleted_at: null } : c)) }) : null);
export function moveColumn(s: Sheet, id: string, dir: -1 | 1, now: string): Sheet | null {
  const act = activeColumns(s); const i = act.findIndex(c => c.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= act.length) return null;
  const a = act[i], b = act[j];
  const cols = s.columns.slice(); const ia = cols.indexOf(a), ib = cols.indexOf(b);
  cols[ia] = b; cols[ib] = a;
  return touch(s, now, { columns: cols });
}

export function addRow(s: Sheet, now: string, cells: Record<string, string> = {}): Sheet | null {
  if (s.rows.length >= LIMITS.rows) return null;
  const c: Record<string, string> = {};
  for (const col of s.columns) { const t = clip(cells[col.id], LIMITS.cellLen); if (t !== '') c[col.id] = t; }
  return touch(s, now, { rows: [...s.rows, { id: newId('w'), cells: c }] });
}
export function updateCell(s: Sheet, rowId: string, colId: string, value: string, now: string): Sheet | null {
  if (!s.columns.some(c => c.id === colId && !c.deleted_at)) return null;
  if (!s.rows.some(r => r.id === rowId && !r.deleted_at)) return null;
  const v = clip(value, LIMITS.cellLen);
  if (isFormula(v) && v.length > FORMULA_MAX_LEN) return null;
  return touch(s, now, { rows: s.rows.map(r => {
    if (r.id !== rowId) return r;
    const cells = { ...r.cells };
    if (v === '') delete cells[colId]; else cells[colId] = v;
    return { ...r, cells };
  }) });
}
export const deleteRow = (s: Sheet, id: string, now: string): Sheet | null => (s.rows.some(r => r.id === id && !r.deleted_at) ? touch(s, now, { rows: s.rows.map(r => (r.id === id ? { ...r, deleted_at: now } : r)) }) : null);
export const restoreRow = (s: Sheet, id: string, now: string): Sheet | null => (s.rows.some(r => r.id === id && r.deleted_at) ? touch(s, now, { rows: s.rows.map(r => (r.id === id ? { ...r, deleted_at: null } : r)) }) : null);
export function duplicateRow(s: Sheet, id: string, now: string): Sheet | null {
  const r = s.rows.find(x => x.id === id && !x.deleted_at);
  return r ? addRow(s, now, r.cells) : null;
}
export const renameSheet = (s: Sheet, title: string, now: string): Sheet => touch(s, now, { title: clip(title, LIMITS.title).trim() || s.title });
export const deleteSheet = (s: Sheet, now: string): Sheet => touch(s, now, { deleted_at: now });
export const restoreSheet = (s: Sheet, now: string): Sheet => touch(s, now, { deleted_at: null });

export function addRule(s: Sheet, rule: Omit<CondRule, 'id'>, now: string): Sheet | null {
  if (s.rules.length >= LIMITS.rules || !s.columns.some(c => c.id === rule.col)) return null;
  return touch(s, now, { rules: [...s.rules, { ...rule, id: newId('r'), value: clip(rule.value, 100) }] });
}
export const removeRule = (s: Sheet, id: string, now: string): Sheet => touch(s, now, { rules: s.rules.filter(r => r.id !== id) });

// ---------- corbeille ----------
const OLD = (at: string | null | undefined, now: string) => !!at && Date.parse(now) - Date.parse(at) > LIMITS.trashDays * 86400000;
/** Efface pour de bon ce qui est à la corbeille depuis plus de 30 jours. */
export function purgeSheet(s: Sheet, now: string): Sheet {
  if (!s.rows.some(r => OLD(r.deleted_at, now)) && !s.columns.some(c => OLD(c.deleted_at, now))) return s;
  return { ...s, rows: s.rows.filter(r => !OLD(r.deleted_at, now)), columns: s.columns.filter(c => !OLD(c.deleted_at, now)) };
}
export const purgeSheets = (l: Sheet[], now: string): Sheet[] => l.filter(s => !OLD(s.deleted_at, now)).map(s => purgeSheet(s, now));
export function trashOf(s: Sheet) {
  return { rows: s.rows.filter(r => r.deleted_at), columns: s.columns.filter(c => c.deleted_at) };
}

// ---------- calcul ----------
export interface Computed { grid: Val[][]; cols: Column[]; rows: Row[] }
/** Calcule toutes les cases (formules incluses). Lignes/colonnes ACTIVES seulement : A1 = 1re colonne, 1re ligne active. */
export function computeSheet(s: Sheet, today: string): Computed {
  const cols = activeColumns(s), rows = activeRows(s);
  const grid: Val[][] = rows.map(() => cols.map(() => null as Val));
  const state: number[][] = rows.map(() => cols.map(() => 0)); // 0 à faire, 1 en cours, 2 fini
  const steps = { n: 0 };
  const raw = (ri: number, ci: number) => rows[ri].cells[cols[ci].id] ?? '';
  const parseCell = (ci: number, text: string): Val => {
    if (text === '') return null;
    const t = cols[ci].type;
    if (t === 'number') { const n = Number(text.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && /^-?\d/.test(text.trim()) ? n : text; }
    if (t === 'check') return text === '1' || text.toLowerCase() === 'true' || text === 'vrai';
    return text;
  };
  let depth = 0;
  const env: Env = {
    cols: cols.length, rows: rows.length, today, steps,
    get(c, r) {
      const ri = r - 1, ci = c - 1;
      if (ri < 0 || ci < 0 || ri >= rows.length || ci >= cols.length) return null;
      return resolve(ri, ci);
    },
  };
  const resolve = (ri: number, ci: number): Val => {
    if (state[ri][ci] === 2) return grid[ri][ci];
    if (state[ri][ci] === 1) return { err: '#CYCLE!' };
    const text = raw(ri, ci);
    if (!isFormula(text)) { state[ri][ci] = 2; return (grid[ri][ci] = parseCell(ci, text)); }
    if (depth > 400) return { err: '#LIMITE!' };
    state[ri][ci] = 1; depth++;
    let v: Val;
    try { v = evalFormula(text, env); } finally { depth--; }
    state[ri][ci] = 2;
    return (grid[ri][ci] = v);
  };
  for (let ri = 0; ri < rows.length; ri++) for (let ci = 0; ci < cols.length; ci++) {
    try { resolve(ri, ci); } catch { grid[ri][ci] = { err: '#LIMITE!' }; state[ri][ci] = 2; }
  }
  return { grid, cols, rows };
}

// ---------- contrôle de saisie ----------
export type CellProblem = 'required' | 'duplicate' | 'number' | 'date' | 'list' | null;
export function checkCell(s: Sheet, rowId: string, colId: string, value: string): CellProblem {
  const col = s.columns.find(c => c.id === colId); if (!col) return null;
  const v = value.trim();
  if (v === '') return col.required ? 'required' : null;
  if (isFormula(v)) return null;
  if (col.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, ''))) return 'number';
  if (col.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return 'date';
  if (col.type === 'list' && !(col.options || []).includes(v)) return 'list';
  if (col.unique && activeRows(s).some(r => r.id !== rowId && (r.cells[colId] ?? '').trim().toLowerCase() === v.toLowerCase())) return 'duplicate';
  return null;
}
/** Problèmes de tout le tableau (pour le résumé). */
export function sheetProblems(s: Sheet): { rowId: string; colId: string; problem: Exclude<CellProblem, null> }[] {
  const out: { rowId: string; colId: string; problem: Exclude<CellProblem, null> }[] = [];
  for (const r of activeRows(s)) for (const c of activeColumns(s)) { const p = checkCell(s, r.id, c.id, r.cells[c.id] ?? ''); if (p) out.push({ rowId: r.id, colId: c.id, problem: p }); }
  return out;
}

// ---------- vue : tri, filtre, recherche (ne change JAMAIS les données) ----------
export interface View { sortCol?: string; sortDir?: 'asc' | 'desc'; search?: string; filters?: { col: string; value: string }[] }
export function viewRows(s: Sheet, c: Computed, v: View): number[] {
  const idx = c.rows.map((_, i) => i);
  const q = (v.search || '').trim().toLowerCase();
  const text = (ri: number, ci: number) => { const x = c.grid[ri][ci]; return isErr(x) ? x.err : x === null ? '' : String(x); };
  let out = idx.filter(ri => {
    if (q && !c.cols.some((_, ci) => text(ri, ci).toLowerCase().includes(q))) return false;
    for (const f of v.filters || []) { const ci = c.cols.findIndex(k => k.id === f.col); if (ci >= 0 && f.value !== '' && text(ri, ci).toLowerCase() !== f.value.toLowerCase()) return false; }
    return true;
  });
  const sc = v.sortCol ? c.cols.findIndex(k => k.id === v.sortCol) : -1;
  if (sc >= 0) {
    const dir = v.sortDir === 'desc' ? -1 : 1;
    out = out.slice().sort((a, b) => {
      const x = c.grid[a][sc], y = c.grid[b][sc];
      if (x === null && y === null) return a - b;
      if (x === null) return 1; if (y === null) return -1; // les vides restent en bas
      let r: number;
      if (typeof x === 'number' && typeof y === 'number') r = x - y; else r = String(isErr(x) ? x.err : x).localeCompare(String(isErr(y) ? y.err : y), 'fr', { numeric: true, sensitivity: 'base' });
      return r * dir || a - b;
    });
  }
  return out;
}

// ---------- totaux et graphique ----------
export interface ColTotal { col: string; sum: number; avg: number | null; min: number | null; max: number | null; count: number }
export function columnTotals(c: Computed, rowsShown?: number[]): ColTotal[] {
  const list = rowsShown ?? c.rows.map((_, i) => i);
  return c.cols.map((col, ci) => {
    if (col.type !== 'number') return null;
    const nums = list.map(ri => c.grid[ri][ci]).filter((x): x is number => typeof x === 'number');
    const sum = nums.reduce((a, b) => a + b, 0);
    return { col: col.id, sum, avg: nums.length ? sum / nums.length : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, count: nums.length };
  }).filter((x): x is ColTotal => !!x);
}
/** Données d'un graphique simple : libellé (colonne texte/liste/date) → somme (colonne nombre) ou nombre de lignes. 12 barres au plus. */
export function chartData(c: Computed, labelCol: string, valueCol?: string): { label: string; value: number }[] {
  const li = c.cols.findIndex(k => k.id === labelCol); if (li < 0) return [];
  const vi = valueCol ? c.cols.findIndex(k => k.id === valueCol) : -1;
  const map = new Map<string, number>();
  c.rows.forEach((_, ri) => {
    const l = c.grid[ri][li]; const label = l === null || isErr(l) ? '—' : String(l);
    const x = vi >= 0 ? c.grid[ri][vi] : 1;
    if (vi >= 0 && typeof x !== 'number') return;
    map.set(label, (map.get(label) || 0) + (x as number));
  });
  const all = [...map.entries()].map(([label, value]) => ({ label, value }));
  all.sort((a, b) => b.value - a.value);
  if (all.length <= 12) return all;
  const rest = all.slice(11).reduce((a, b) => a + b.value, 0);
  return [...all.slice(0, 11), { label: '…', value: rest }];
}

// ---------- mise en forme conditionnelle ----------
export function ruleColor(s: Sheet, c: Computed, ri: number, ci: number): CondRule['color'] | null {
  const col = c.cols[ci]; const x = c.grid[ri][ci];
  for (const q of s.rules) {
    if (q.col !== col.id) continue;
    const t = x === null ? '' : isErr(x) ? x.err : String(x);
    let ok = false;
    if (q.op === 'empty') ok = t === '';
    else if (q.op === 'contains') ok = t.toLowerCase().includes(q.value.toLowerCase());
    else {
      const a = Number(t), b = Number(q.value.replace(',', '.'));
      const numeric = t !== '' && q.value !== '' && Number.isFinite(a) && Number.isFinite(b);
      const cmp = numeric ? a - b : t.localeCompare(q.value, 'fr', { sensitivity: 'base' });
      if (t === '' ) ok = false;
      else ok = q.op === '>' ? cmp > 0 : q.op === '<' ? cmp < 0 : q.op === '=' ? cmp === 0 : cmp !== 0;
    }
    if (ok) return q.color;
  }
  return null;
}

// ---------- modèles ----------
export interface Template { id: string; fr: string; en: string; cols: { name: string; type: ColType; options?: string[] }[] }
export const TEMPLATES: Template[] = [
  { id: 'blank', fr: 'Tableau vide', en: 'Blank table', cols: [{ name: 'A', type: 'text' }, { name: 'B', type: 'text' }, { name: 'C', type: 'text' }] },
  { id: 'fiches', fr: 'Saisie de fiches', en: 'Record entry', cols: [{ name: 'Date', type: 'date' }, { name: 'Nom', type: 'text' }, { name: 'Quantité', type: 'number' }, { name: 'Montant', type: 'number' }, { name: 'Remarque', type: 'text' }] },
  { id: 'suivi', fr: 'Suivi de tâches', en: 'Task tracking', cols: [{ name: 'Tâche', type: 'text' }, { name: 'Date', type: 'date' }, { name: 'État', type: 'list', options: ['À faire', 'En cours', 'Fait'] }, { name: 'Terminé', type: 'check' }] },
];
export function fromTemplate(t: Template, title: string, now: string, lang: 'fr' | 'en' = 'fr'): Sheet {
  let s = emptySheet(title || (lang === 'en' ? t.en : t.fr), now);
  for (const c of t.cols) s = addColumn(s, c.name, c.type, now, c.options) || s;
  return s;
}

// ---------- annuler / rétablir (une pile d'états du tableau) ----------
export interface History { past: Sheet[]; present: Sheet; future: Sheet[] }
export const newHistory = (s: Sheet): History => ({ past: [], present: s, future: [] });
export function pushHistory(h: History, next: Sheet): History { return { past: [...h.past, h.present].slice(-LIMITS.history), present: next, future: [] }; }
export function undo(h: History): History { if (!h.past.length) return h; return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future].slice(0, LIMITS.history) }; }
export function redo(h: History): History { if (!h.future.length) return h; return { past: [...h.past, h.present].slice(-LIMITS.history), present: h.future[0], future: h.future.slice(1) }; }

// ---------- texte d'une case pour l'export ----------
export function exportMatrix(s: Sheet, today: string, lang: 'fr' | 'en' = 'fr'): { header: string[]; rows: Val[][] } {
  const c = computeSheet(s, today);
  const yes = lang === 'en' ? 'Yes' : 'Oui', no = lang === 'en' ? 'No' : 'Non';
  return {
    header: c.cols.map(k => k.name),
    rows: c.grid.map(line => line.map((v, ci) => (c.cols[ci].type === 'check' && typeof v === 'boolean' ? (v ? yes : no) : v))),
  };
}

/** Tableaux d'exemple pour la démo : données fictives, avec totaux et une formule. */
export function demoSheets(now: string, lang: 'fr' | 'en' = 'fr'): Sheet[] {
  const fr = lang !== 'en';
  let a = fromTemplate(TEMPLATES[1], fr ? 'Ventes de la semaine' : 'Sales of the week', now, lang);
  const [d, n, q, m, r] = a.columns.map(c => c.id);
  const data: [string, string, string, string][] = [['2026-10-19', 'Rakoto', '4', '=C1*2500'], ['2026-10-20', 'Rasoa', '2', '=C2*2500'], ['2026-10-21', 'Hery', '7', '=C3*2500'], ['2026-10-22', 'Lala', '3', '=C4*2500']];
  for (const x of data) a = addRow(a, now, { [d]: x[0], [n]: x[1], [q]: x[2], [m]: x[3], [r]: '' })!;
  a = addRule(a, { col: m, op: '>', value: '10000', color: 'green' }, now)!;
  let b = fromTemplate(TEMPLATES[2], fr ? 'Mes tâches du jour' : 'My tasks of the day', now, lang);
  const [t0, t1, t2, t3] = b.columns.map(c => c.id);
  const st = fr ? ['À faire', 'En cours', 'Fait'] : ['À faire', 'En cours', 'Fait'];
  for (const x of [['Préparer le rapport', '2026-10-23', st[2], '1'], ['Vérifier les comptes', '2026-10-24', st[1], ''], ['Appeler le client', '2026-10-25', st[0], '']]) b = addRow(b, now, { [t0]: x[0], [t1]: x[1], [t2]: x[2], [t3]: x[3] })!;
  return [a, b];
}
