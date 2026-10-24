// Import Excel et CSV (module 16, M16.1) : règles pures, sans écran, sans serveur, sans réseau, sans lecture de fichier.
// Contrôlé par `npm run check:import`. Idée : on lit le fichier, on montre un APERÇU ligne par ligne (bon / erreur / déjà là),
// et RIEN n'est écrit tant que le responsable n'a pas validé. Chaque ligne bonne passe ensuite par les mêmes règles que la saisie à la main
// (`checkClientDraft`, `checkProductDraft`) et le serveur revérifie quand même.
import { checkClientDraft, normalizeName, type ClientDraft } from './clients';
import { checkProductDraft, type ProductDraft } from './stock';
import { cleanSheet, LIMITS as SHEET_LIMITS, newId, sheetChars, SHEET_MAX_CHARS, type ColType, type Column, type Row, type Sheet } from './sheets';
import { cleanTeam } from './roles';
import { formatPhone, phoneIsComplete, phoneIsEmpty } from './phoneUtils';

export type ImportKind = 'clients' | 'products' | 'employees' | 'sheet';
export type Lang = 'fr' | 'en';
export type Matrix = string[][];

/** Limites : un fichier trop gros est refusé avant tout calcul. */
export const IMPORT_LIMITS = {
  fileBytes: 5_000_000,
  rows: { clients: 1000, products: 1000, employees: 100, sheet: SHEET_LIMITS.rows } as Record<ImportKind, number>,
  columns: SHEET_LIMITS.columns,
};

// ---------------------------------------------------------------- CSV

/** Lit un texte CSV : séparateur « ; » « , » ou tabulation (deviné), guillemets, guillemets doublés, retours à la ligne dans un champ, BOM. */
export function parseCsv(input: string): Matrix {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // séparateur : celui qui apparaît le plus dans la première ligne (hors guillemets)
  let first = '', inQ = false;
  for (const ch of text) { if (ch === '"') inQ = !inQ; if (!inQ && (ch === '\n' || ch === '\r')) break; first += ch; }
  const count = (c: string) => { let n = 0, q = false; for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch === c) n++; } return n; };
  const delim = [';', '\t', ','].map(c => ({ c, n: count(c) })).sort((a, b) => b.n - a.n)[0];
  const sep = delim.n > 0 ? delim.c : ';';
  const rows: Matrix = [];
  let row: string[] = [], cell = '', q = false, i = 0;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { q = true; i++; continue; }
    if (ch === sep) { endCell(); i++; continue; }
    if (ch === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) endRow();
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** Écrit un CSV (séparateur « ; » pour Excel en français). Un champ avec séparateur, guillemet ou retour est mis entre guillemets. */
export function matrixToCsv(m: Matrix, sep = ';'): string {
  const esc = (v: string) => (/[";\n\r,\t]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + m.map(r => r.map(c => esc(String(c ?? ''))).join(sep)).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- colonnes

const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface FieldSpec { key: string; required?: boolean; aliases: string[]; fr: string; en: string }
type FieldKind = Exclude<ImportKind, 'sheet'>;

export const IMPORT_FIELDS: Record<FieldKind, FieldSpec[]> = {
  clients: [
    { key: 'name', required: true, aliases: ['nom', 'name', 'client', 'societe', 'entreprise', 'raison sociale', 'company', 'nom du client'], fr: 'Nom', en: 'Name' },
    { key: 'contact_name', aliases: ['contact', 'personne', 'responsable', 'contact name', 'nom du contact'], fr: 'Contact', en: 'Contact' },
    { key: 'phone', aliases: ['telephone', 'tel', 'phone', 'mobile', 'numero'], fr: 'Téléphone', en: 'Phone' },
    { key: 'email', aliases: ['email', 'e mail', 'mail', 'courriel', 'adresse mail'], fr: 'E-mail', en: 'E-mail' },
    { key: 'address', aliases: ['adresse', 'address', 'lieu'], fr: 'Adresse', en: 'Address' },
    { key: 'note', aliases: ['note', 'notes', 'remarque', 'remarques', 'commentaire'], fr: 'Note', en: 'Note' },
    { key: 'payment_terms_days', aliases: ['delai de paiement', 'delai paiement', 'delai', 'payment terms', 'terms', 'jours', 'delai de paiement jours'], fr: 'Délai de paiement (jours)', en: 'Payment terms (days)' },
    { key: 'price_default', aliases: ['prix par defaut', 'prix', 'tarif', 'price', 'default price', 'prix defaut'], fr: 'Prix par défaut (Ar)', en: 'Default price (Ar)' },
  ],
  products: [
    { key: 'name', required: true, aliases: ['nom', 'name', 'produit', 'article', 'product', 'designation'], fr: 'Nom', en: 'Name' },
    { key: 'category', aliases: ['categorie', 'category', 'famille'], fr: 'Catégorie', en: 'Category' },
    { key: 'unit', aliases: ['unite', 'unit'], fr: 'Unité', en: 'Unit' },
    { key: 'buy_price', aliases: ['prix achat', 'prix d achat', 'achat', 'buy price', 'cost', 'cout'], fr: "Prix d'achat (Ar)", en: 'Buy price (Ar)' },
    { key: 'sell_price', aliases: ['prix vente', 'prix de vente', 'vente', 'sell price', 'price', 'prix'], fr: 'Prix de vente (Ar)', en: 'Sell price (Ar)' },
    { key: 'alert_threshold', aliases: ['seuil', 'seuil alerte', 'seuil d alerte', 'alert', 'threshold', 'alert threshold'], fr: "Seuil d'alerte", en: 'Alert threshold' },
  ],
  employees: [
    { key: 'username', required: true, aliases: ['identifiant', 'login', 'pseudo', 'username', 'user'], fr: 'Identifiant', en: 'Username' },
    { key: 'name', required: true, aliases: ['nom complet', 'nom', 'name', 'full name', 'prenom nom'], fr: 'Nom complet', en: 'Full name' },
    { key: 'phone', aliases: ['telephone', 'tel', 'phone', 'mobile'], fr: 'Téléphone', en: 'Phone' },
    { key: 'shift', aliases: ['vacation', 'shift', 'jour nuit', 'horaire'], fr: 'Vacation (Jour ou Nuit)', en: 'Shift (Day or Night)' },
    { key: 'team', aliases: ['equipe', 'team', 'groupe'], fr: 'Équipe', en: 'Team' },
  ],
};

export interface ColumnMap {
  map: Record<string, number>;
  /** En-têtes non reconnus : ignorés (on les montre pour que rien ne disparaisse sans le dire). */
  unknown: string[];
  /** Champs obligatoires introuvables. */
  missing: string[];
  /** En-têtes qui désignent un champ déjà trouvé : seule la première colonne compte. */
  repeated: string[];
}

export function mapColumns(header: string[], kind: FieldKind): ColumnMap {
  const specs = IMPORT_FIELDS[kind];
  const map: Record<string, number> = {};
  const unknown: string[] = [], repeated: string[] = [];
  header.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const spec = specs.find(s => s.key === n.replace(/ /g, '_') || s.aliases.includes(n) || norm(s.fr) === n || norm(s.en) === n);
    if (!spec) { unknown.push(String(h).trim().slice(0, 60)); return; }
    if (map[spec.key] !== undefined) { repeated.push(String(h).trim().slice(0, 60)); return; }
    map[spec.key] = i;
  });
  return { map, unknown, missing: specs.filter(s => s.required && map[s.key] === undefined).map(s => s.key), repeated };
}

// ---------------------------------------------------------------- aperçu

export type RowStatus = 'ok' | 'error' | 'duplicate';
export type ImportErrorCode =
  | 'name' | 'email' | 'terms' | 'price' | 'buy' | 'sell' | 'threshold' | 'username' | 'phone' | 'shift'
  | 'exists' | 'in_file';

export interface PreviewRow<D> { line: number; status: RowStatus; code?: ImportErrorCode; draft?: D; label: string }
export type PreviewProblem = 'empty' | 'no_header' | 'missing_columns' | 'no_rows' | 'too_many_rows';
export interface Preview<D> {
  problem?: PreviewProblem;
  columns: ColumnMap | null;
  rows: PreviewRow<D>[];
  counts: { ok: number; error: number; duplicate: number };
}

export interface EmployeeDraft { username: string; name: string; phone: string; shift: 'day' | 'night'; team: string }
export interface ExistingNames { clients: string[]; products: string[]; usernames: string[] }

const cell = (r: string[], map: Record<string, number>, key: string): string => (map[key] === undefined ? '' : String(r[map[key]] ?? '').trim());
const blank = (r: string[]) => r.every(c => String(c ?? '').trim() === '');
const emptyPreview = <D,>(problem: PreviewProblem, columns: ColumnMap | null = null): Preview<D> => ({ problem, columns, rows: [], counts: { ok: 0, error: 0, duplicate: 0 } });

const SHIFT_DAY = ['jour', 'day', 'j', 'matin', 'd'];
const SHIFT_NIGHT = ['nuit', 'night', 'n', 'soir'];
export const parseShift = (v: string): 'day' | 'night' | null => { const n = norm(v); if (!n) return 'day'; if (SHIFT_DAY.includes(n)) return 'day'; if (SHIFT_NIGHT.includes(n)) return 'night'; return null; };
export const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;

/** Prépare l'aperçu d'un fichier de clients, de produits ou de salariés. La ligne 1 est l'en-tête ; `line` est le numéro de ligne dans le fichier. */
export function buildPreview(kind: 'clients', m: Matrix, ex: ExistingNames): Preview<ClientDraft>;
export function buildPreview(kind: 'products', m: Matrix, ex: ExistingNames): Preview<ProductDraft>;
export function buildPreview(kind: 'employees', m: Matrix, ex: ExistingNames): Preview<EmployeeDraft>;
export function buildPreview(kind: FieldKind, m: Matrix, ex: ExistingNames): Preview<any> {
  if (!Array.isArray(m) || m.length === 0) return emptyPreview('empty');
  const cols = mapColumns(m[0] || [], kind);
  if (cols.missing.length) return emptyPreview(Object.keys(cols.map).length === 0 && cols.unknown.length === (m[0] || []).filter(c => String(c).trim()).length ? 'no_header' : 'missing_columns', cols);
  const body = m.slice(1).map((r, i) => ({ r, line: i + 2 })).filter(x => !blank(x.r));
  if (!body.length) return emptyPreview('no_rows', cols);
  if (body.length > IMPORT_LIMITS.rows[kind]) return emptyPreview('too_many_rows', cols);

  const seen = new Set<string>();
  const taken = new Set((kind === 'clients' ? ex.clients : kind === 'products' ? ex.products : ex.usernames).map(s => kind === 'employees' ? String(s).toLowerCase() : normalizeName(s)));
  const rows: PreviewRow<any>[] = [];
  for (const { r, line } of body) {
    const g = (k: string) => cell(r, cols.map, k);
    let row: PreviewRow<any>;
    if (kind === 'clients') {
      const draft: ClientDraft = { name: g('name'), contact_name: g('contact_name'), phone: g('phone'), email: g('email'), address: g('address'), note: g('note'), payment_terms_days: g('payment_terms_days'), price_default: g('price_default') };
      const v = checkClientDraft(draft);
      row = v.ok ? { line, status: 'ok', draft, label: v.clean.name } : { line, status: 'error', code: v.error === 'price_by_type' ? 'price' : v.error, draft, label: draft.name };
      if (row.status === 'ok') { const key = normalizeName(row.label); row = dupCheck(row, key, taken, seen); }
    } else if (kind === 'products') {
      const draft: ProductDraft = { name: g('name'), category: g('category'), unit: g('unit'), buy_price: g('buy_price'), sell_price: g('sell_price'), alert_threshold: g('alert_threshold') };
      const v = checkProductDraft(draft);
      row = v.ok ? { line, status: 'ok', draft, label: v.clean.name } : { line, status: 'error', code: v.error === 'buy' ? 'buy' : v.error === 'sell' ? 'sell' : v.error === 'threshold' ? 'threshold' : 'name', draft, label: draft.name };
      if (row.status === 'ok') { const key = normalizeName(row.label); row = dupCheck(row, key, taken, seen); }
    } else {
      const username = g('username').toLowerCase();
      const name = g('name');
      const rawPhone = g('phone');
      const shift = parseShift(g('shift'));
      const phone = phoneIsEmpty(rawPhone) ? '' : formatPhone(rawPhone);
      const code: ImportErrorCode | null = !USERNAME_RE.test(username) ? 'username' : !name ? 'name' : (phone && !phoneIsComplete(phone)) ? 'phone' : shift === null ? 'shift' : null;
      const draft: EmployeeDraft | undefined = code ? undefined : { username, name: name.slice(0, 80), phone, shift: shift as 'day' | 'night', team: cleanTeam(g('team')) };
      row = code ? { line, status: 'error', code, label: username || name } : { line, status: 'ok', draft, label: `${username} (${name})` };
      if (row.status === 'ok') row = dupCheck(row, username, taken, seen);
    }
    rows.push(row);
  }
  const counts = { ok: 0, error: 0, duplicate: 0 };
  rows.forEach(x => { counts[x.status]++; });
  return { columns: cols, rows, counts };
}

function dupCheck<D>(row: PreviewRow<D>, key: string, taken: Set<string>, seen: Set<string>): PreviewRow<D> {
  if (taken.has(key)) return { ...row, status: 'duplicate', code: 'exists' };
  if (seen.has(key)) return { ...row, status: 'duplicate', code: 'in_file' };
  seen.add(key);
  return row;
}

/** Les lignes à écrire : seulement les « bon ». */
export const okDrafts = <D,>(p: Preview<D>): D[] => p.rows.filter(r => r.status === 'ok' && r.draft).map(r => r.draft as D);

// ---------------------------------------------------------------- tableau libre (Mes tableaux)

export type SheetImportProblem = 'empty' | 'no_rows' | 'too_many_rows' | 'too_many_columns' | 'invalid';
export interface SheetImport {
  problem?: SheetImportProblem;
  sheet?: Sheet;
  columns: { name: string; type: ColType }[];
  rowCount: number;
  /** Cases dont le texte a été raccourci (500 signes au plus). */
  shortened: number;
}

const isRealDate = (d: string): boolean => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const p = new Date(`${d}T00:00:00Z`); return !isNaN(p.getTime()) && p.toISOString().slice(0, 10) === d; };
/** « 2026-10-25 » ou « 25/10/2026 » (jour d'abord : c'est l'usage à Madagascar) → AAAA-MM-JJ, sinon null. */
export function asIsoDate(v: string): string | null {
  const s = v.trim();
  if (isRealDate(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isRealDate(iso) ? iso : null;
}
/** Nombre écrit avec espaces et virgule décimale → texte avec un point ; sinon null. */
export function asNumberText(v: string): string | null {
  const s = v.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s) || s.length > 30) return null;
  return String(Number(s)) === 'NaN' ? null : s;
}

export function sheetFromMatrix(m: Matrix, title: string, now: string): SheetImport {
  const none = (problem: SheetImportProblem): SheetImport => ({ problem, columns: [], rowCount: 0, shortened: 0 });
  if (!Array.isArray(m) || m.length === 0) return none('empty');
  const width = Math.max(...m.map(r => r.length));
  if (width > IMPORT_LIMITS.columns) return none('too_many_columns');
  const body = m.slice(1).filter(r => !blank(r));
  if (!body.length) return none('no_rows');
  if (body.length > IMPORT_LIMITS.rows.sheet) return none('too_many_rows');

  const names: string[] = [];
  for (let c = 0; c < width; c++) {
    let n = String(m[0][c] ?? '').trim().slice(0, SHEET_LIMITS.colName) || (`Colonne ${c + 1}`);
    let k = 2; const base = n;
    while (names.some(x => x.toLowerCase() === n.toLowerCase())) { n = `${base.slice(0, SHEET_LIMITS.colName - 5)} (${k++})`; }
    names.push(n);
  }
  let shortened = 0;
  const raw = body.map(r => names.map((_, c) => { const v = String(r[c] ?? '').trim(); if (v.length > SHEET_LIMITS.cellLen) shortened++; return v.slice(0, SHEET_LIMITS.cellLen); }));
  const types: ColType[] = names.map((_, c) => {
    const vals = raw.map(r => r[c]).filter(v => v !== '');
    if (!vals.length) return 'text';
    if (vals.every(v => asNumberText(v) !== null)) return 'number';
    if (vals.every(v => asIsoDate(v) !== null)) return 'date';
    return 'text';
  });
  const columns: Column[] = names.map((name, c) => ({ id: newId('c'), name, type: types[c] }));
  const rows: Row[] = raw.map(r => ({ id: newId('r'), cells: Object.fromEntries(columns.map((col, c) => {
    const v = r[c];
    return [col.id, v === '' ? '' : col.type === 'number' ? (asNumberText(v) as string) : col.type === 'date' ? (asIsoDate(v) as string) : v];
  })) }));
  const draft: Sheet = { id: newId('s'), title: (title.trim().slice(0, SHEET_LIMITS.title)) || 'Tableau importé', columns, rows, rules: [], created_at: now, updated_at: now };
  const sheet = cleanSheet(draft, now);
  if (!sheet || sheetChars(sheet) > SHEET_MAX_CHARS) return none('invalid'); // le serveur refuse un tableau trop gros : on le dit avant
  return { sheet, columns: names.map((name, c) => ({ name, type: types[c] })), rowCount: rows.length, shortened };
}

// ---------------------------------------------------------------- modèles de fichier

export function templateMatrix(kind: FieldKind, lang: Lang): Matrix {
  const head = IMPORT_FIELDS[kind].map(f => (lang === 'en' ? f.en : f.fr));
  const ex: Record<FieldKind, string[][]> = {
    clients: lang === 'en'
      ? [['Aina Company', 'Aina Rakoto', '261 34 12 345 67', 'contact@aina.example', 'Toliara', 'Pays on time', '30', '5000'], ['Vola Shop', '', '', '', '', '', '', '']]
      : [['Société Aina', 'Aina Rakoto', '261 34 12 345 67', 'contact@aina.example', 'Toliara', 'Paie à l\'heure', '30', '5000'], ['Boutique Vola', '', '', '', '', '', '', '']],
    products: lang === 'en'
      ? [['Paper ream', 'Office', 'ream', '9000', '12000', '5'], ['Pen', 'Office', 'unit', '500', '800', '20']]
      : [['Ramette de papier', 'Bureau', 'ramette', '9000', '12000', '5'], ['Stylo', 'Bureau', 'unité', '500', '800', '20']],
    employees: lang === 'en'
      ? [['rakoto.jean', 'Jean Rakoto', '261 34 12 345 67', 'Day', 'Team A'], ['rasoa.marie', 'Marie Rasoa', '', 'Night', 'Team B']]
      : [['rakoto.jean', 'Jean Rakoto', '261 34 12 345 67', 'Jour', 'Équipe A'], ['rasoa.marie', 'Marie Rasoa', '', 'Nuit', 'Équipe B']],
  };
  return [head, ...ex[kind]];
}

// ---------------------------------------------------------------- mots de passe provisoires (salariés)

const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0 O 1 l I : faciles à recopier
export const PW_LENGTH = 10;
/** `rand(n)` doit rendre un entier au hasard de 0 à n-1 (l'écran fournit un hasard sûr du navigateur). */
export function generatePassword(rand: (n: number) => number): string {
  let out = '';
  for (let i = 0; i < PW_LENGTH; i++) out += PW_ALPHABET[Math.min(PW_ALPHABET.length - 1, Math.max(0, Math.floor(rand(PW_ALPHABET.length))))];
  return out;
}

/** Liste « identifiant ; mot de passe provisoire » à remettre aux salariés (téléchargée une seule fois, jamais gardée par le site). */
export const credentialsMatrix = (rows: { username: string; name: string; password: string }[], lang: Lang): Matrix =>
  [lang === 'en' ? ['Username', 'Full name', 'Temporary password'] : ['Identifiant', 'Nom complet', 'Mot de passe provisoire'], ...rows.map(r => [r.username, r.name, r.password])];

// ---------------------------------------------------------------- textes

export const IMPORT_ERROR_TEXT: Record<ImportErrorCode, { fr: string; en: string }> = {
  name: { fr: 'Nom manquant', en: 'Name missing' },
  email: { fr: 'E-mail invalide', en: 'Invalid e-mail' },
  terms: { fr: 'Délai de paiement invalide (0 à 365 jours)', en: 'Invalid payment terms (0 to 365 days)' },
  price: { fr: 'Prix invalide', en: 'Invalid price' },
  buy: { fr: "Prix d'achat invalide", en: 'Invalid buy price' },
  sell: { fr: 'Prix de vente invalide', en: 'Invalid sell price' },
  threshold: { fr: "Seuil d'alerte invalide", en: 'Invalid alert threshold' },
  username: { fr: 'Identifiant invalide (3 à 30 lettres minuscules, chiffres, . _ -)', en: 'Invalid username (3 to 30 lowercase letters, digits, . _ -)' },
  phone: { fr: 'Téléphone incomplet (format 261 34 12 345 67)', en: 'Incomplete phone (format 261 34 12 345 67)' },
  shift: { fr: 'Vacation inconnue (Jour ou Nuit)', en: 'Unknown shift (Day or Night)' },
  exists: { fr: 'Existe déjà : ignoré', en: 'Already exists: skipped' },
  in_file: { fr: 'En double dans le fichier : ignoré', en: 'Duplicate in the file: skipped' },
};

export const IMPORT_PROBLEM_TEXT: Record<PreviewProblem | SheetImportProblem, { fr: string; en: string }> = {
  empty: { fr: 'Le fichier est vide.', en: 'The file is empty.' },
  no_header: { fr: "Aucune colonne reconnue. La première ligne doit contenir les noms des colonnes : téléchargez le modèle.", en: 'No column recognised. The first row must hold the column names: download the template.' },
  missing_columns: { fr: 'Une colonne obligatoire manque. Téléchargez le modèle pour voir les noms attendus.', en: 'A required column is missing. Download the template to see the expected names.' },
  no_rows: { fr: "Le fichier n'a pas de ligne de données sous les noms de colonnes.", en: 'The file has no data row under the column names.' },
  too_many_rows: { fr: 'Trop de lignes pour un seul import : coupez le fichier en plusieurs.', en: 'Too many rows for one import: split the file.' },
  too_many_columns: { fr: 'Trop de colonnes (200 au plus).', en: 'Too many columns (200 at most).' },
  invalid: { fr: 'Le tableau obtenu est refusé par les règles du site (trop gros ?).', en: "The resulting table is refused by the site's rules (too big?)." },
};
