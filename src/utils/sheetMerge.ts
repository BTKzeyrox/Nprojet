// Remettre un fichier Excel rempli hors du site dans le tableau d'une mission (module 19, M19.5) : fonction PURE.
// Les colonnes du fichier sont reconnues par leur NOM (sans accents ni majuscules) ; les lignes sont AJOUTÉES au tableau (rien n'est effacé ni remplacé) ;
// chaque valeur est remise dans la forme du site (date AAAA-MM-JJ, nombre simple, téléphone avec espaces…). Ce qui ne passe pas est GARDÉ tel quel,
// signalé avant la validation (jamais perdu en silence) ; une ligne qui doublonne une colonne « valeur unique » est laissée de côté et comptée.
import { asIsoDate, asNumberText, type Matrix } from './importRules';
import { activeColumns, activeRows, cleanSheet, isNumType, LIMITS, newId, sheetChars, SHEET_MAX_CHARS, type Column, type ColType, type Row, type Sheet } from './sheets';
import { codeFor, nextCode, typeDate, typePhone, typeTime, type Lang } from './sheetAuto';

export type MergeReason = 'number' | 'date' | 'time' | 'phone' | 'list' | 'required';
export interface MergeProblem { row: number; column: string; value: string; reason: MergeReason }
export type MergeFail = 'empty' | 'no_rows' | 'no_match' | 'too_big';
export interface MergeResult {
  fail?: MergeFail;
  sheet?: Sheet;
  added: number;
  matched: string[]; // colonnes du tableau retrouvées dans le fichier
  ignored: string[]; // colonnes du fichier qui n'existent pas dans le tableau
  missing: string[]; // colonnes du tableau absentes du fichier
  problems: MergeProblem[]; // valeurs gardées telles quelles mais à corriger (1 = première ligne de données du fichier)
  duplicates: number; // lignes laissées de côté (valeur déjà présente dans une colonne « unique »)
  truncated: number; // lignes en trop (limite de 5 000 lignes)
  shortened: number; // cases raccourcies (500 signes)
}

const plain = (v: string): string => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const YES = new Set(['1', 'oui', 'yes', 'y', 'o', 'x', 'vrai', 'true', 'v', '✓', '✔', 'ok']);
const NO = new Set(['', '0', 'non', 'no', 'n', 'faux', 'false']);

/** Une valeur du fichier → la valeur du site pour cette colonne. `bad` = raison si elle n'est pas valide (la valeur d'origine est alors gardée). */
export function convertCell(col: Pick<Column, 'type' | 'options'>, raw: string, lang: Lang): { value: string; bad?: MergeReason } {
  const v = raw.trim();
  if (v === '') return { value: '' };
  const t: ColType = col.type;
  if (t === 'date') { const iso = asIsoDate(v) || typeDate(v, lang, true).iso; return iso ? { value: iso } : { value: v, bad: 'date' }; }
  if (isNumType(t)) { const nb = asNumberText(v); return nb !== null ? { value: nb } : { value: v, bad: 'number' }; }
  if (t === 'time') { const r = typeTime(v, true); return r.stored ? { value: r.stored } : { value: v, bad: 'time' }; }
  if (t === 'phone') {
    let d = v.replace(/[^\d+]/g, '');
    if (/^3\d{8}$/.test(d)) d = '0' + d; // Excel a mangé le 0 du début : 341234567 → 0341234567
    const f = typePhone(d);
    return f.replace(/\D/g, '').length >= 6 ? { value: f } : { value: v, bad: 'phone' };
  }
  if (t === 'list') { const hit = (col.options || []).find(o => plain(o) === plain(v)); return hit ? { value: hit } : { value: v, bad: 'list' }; }
  if (t === 'check') return YES.has(plain(v)) ? { value: '1' } : NO.has(plain(v)) ? { value: '' } : { value: '1' };
  return { value: v };
}

export function mergeMatrixIntoSheet(target: Sheet, m: Matrix, now: string, lang: Lang = 'fr'): MergeResult {
  const out = (fail: MergeFail): MergeResult => ({ fail, added: 0, matched: [], ignored: [], missing: [], problems: [], duplicates: 0, truncated: 0, shortened: 0 });
  if (!Array.isArray(m) || m.length === 0) return out('empty');
  const body = m.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (!body.length) return out('no_rows');
  const cols = activeColumns(target);
  const byName = new Map<string, Column>(); for (const c of cols) byName.set(plain(c.name), c);
  const map: (Column | null)[] = m[0].map(h => byName.get(plain(String(h ?? ''))) || null);
  // deux colonnes du fichier de même nom : la première gagne
  const seen = new Set<string>(); map.forEach((c, i) => { if (c) { if (seen.has(c.id)) map[i] = null; else seen.add(c.id); } });
  if (!map.some(Boolean)) return out('no_match');
  const matched = cols.filter(c => seen.has(c.id)).map(c => c.name);
  const ignored = m[0].map((h, i) => ({ h: String(h ?? '').trim(), i })).filter(x => x.h && !map[x.i]).map(x => x.h);
  const missing = cols.filter(c => !seen.has(c.id)).map(c => c.name);

  const room = Math.max(0, LIMITS.rows - target.rows.length);
  const rows: Row[] = [], problems: MergeProblem[] = [];
  let duplicates = 0, shortened = 0, truncated = 0;
  const uniq = new Map<string, Set<string>>(); // colonne → valeurs déjà présentes
  for (const c of cols) if (c.unique) uniq.set(c.id, new Set(activeRows(target).map(r => plain(r.cells[c.id] ?? '')).filter(Boolean)));

  body.forEach((line, bi) => {
    const cells: Record<string, string> = {};
    const bad: MergeProblem[] = [];
    map.forEach((c, i) => {
      if (!c) return;
      let raw = String(line[i] ?? '').trim();
      if (raw.length > LIMITS.cellLen) { raw = raw.slice(0, LIMITS.cellLen); shortened++; }
      const r = convertCell(c, raw, lang);
      cells[c.id] = r.value;
      if (r.bad) bad.push({ row: bi + 1, column: c.name, value: raw, reason: r.bad });
      if (c.required && r.value === '') bad.push({ row: bi + 1, column: c.name, value: '', reason: 'required' });
    });
    // doublon sur une colonne « valeur unique » : la ligne est laissée de côté
    for (const c of cols) { const set = uniq.get(c.id); const v = plain(cells[c.id] ?? ''); if (set && v) { if (set.has(v)) { duplicates++; return; } } }
    if (rows.length >= room) { truncated++; return; }
    for (const c of cols) { const set = uniq.get(c.id); const v = plain(cells[c.id] ?? ''); if (set && v) set.add(v); }
    rows.push({ id: newId('r'), cells });
    problems.push(...bad);
  });

  if (rows.length === 0) return { ...out('no_rows'), matched, ignored, missing, duplicates, truncated, shortened };
  const cleaned = cleanSheet({ ...target, updated_at: now, rows: [...target.rows, ...rows] }, now);
  if (!cleaned || sheetChars(cleaned) > SHEET_MAX_CHARS) return { ...out('too_big'), matched, ignored, missing };
  let merged: Sheet = cleaned;
  // un code absent du fichier (colonne manquante ou case vide) : les NOUVELLES lignes reçoivent la suite (REF004, REF005…) ; les lignes d'avant ne sont jamais touchées
  const fresh = new Set(rows.map(r => r.id));
  for (const c of cols.filter(k => k.type === 'code')) {
    const taken = new Set<string>(merged.rows.map(r => (r.cells[c.id] ?? '').trim()).filter(Boolean));
    const above: string[] = [];
    merged = { ...merged, rows: merged.rows.map((r): Row => {
      const v = (r.cells[c.id] ?? '').trim();
      if (!fresh.has(r.id) || v !== '') { above.push(v); return r; }
      let code = codeFor(c, above);
      for (let g = 0; taken.has(code) && g < 100000; g++) code = nextCode(code) ?? code + '1';
      taken.add(code); above.push(code);
      return { ...r, cells: { ...r.cells, [c.id]: code } };
    }) };
  }
  return { sheet: merged, added: rows.length, matched, ignored, missing, problems, duplicates, truncated, shortened };
}

export const MERGE_FAIL_TEXT: Record<MergeFail, { fr: string; en: string }> = {
  empty: { fr: 'Le fichier est vide.', en: 'The file is empty.' },
  no_rows: { fr: 'Aucune ligne à ajouter dans ce fichier.', en: 'No row to add in this file.' },
  no_match: { fr: 'Aucune colonne du fichier ne porte le nom d\'une colonne du tableau. Utilise le modèle Excel téléchargé depuis ce tableau.', en: 'No column in the file has the name of a column of the table. Use the Excel model downloaded from this table.' },
  too_big: { fr: 'Le tableau deviendrait trop gros : il faut retirer des lignes ou le diviser en deux.', en: 'The table would become too big: remove rows or split it in two.' },
};
export const MERGE_REASON_TEXT: Record<MergeReason, { fr: string; en: string }> = {
  number: { fr: 'pas un nombre', en: 'not a number' },
  date: { fr: 'date non reconnue', en: 'date not recognised' },
  time: { fr: 'heure non reconnue', en: 'time not recognised' },
  phone: { fr: 'numéro invalide', en: 'invalid number' },
  list: { fr: 'pas dans la liste', en: 'not in the list' },
  required: { fr: 'valeur obligatoire manquante', en: 'required value missing' },
};
