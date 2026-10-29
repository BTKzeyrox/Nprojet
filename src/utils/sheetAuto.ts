// « Mes tableaux » plus intelligents (module 19, M19.2) : saisie automatique, règles PURES (aucun écran, aucun réseau, aucune date lue sur l'horloge : `today` est donné).
// Contrôlé par `npm run check:sheet-auto`.
// Principe : on SUGGÈRE et on met en forme ce que la personne tape ; on ne change JAMAIS en silence une valeur déjà écrite.
//   - date : on tape des chiffres (28102026), les « / » arrivent seuls ; la valeur gardée reste AAAA-MM-JJ ;
//   - nombre et montant : milliers automatiques ; la valeur gardée est un nombre simple (1234.5) ;
//   - téléphone : espaces automatiques ; heure : HH:MM ;
//   - code : REF001 → REF002 (le numéro monte, les zéros du début sont gardés) ;
//   - mots qui reviennent : suggestions tirées de la colonne ; « reprendre la ligne du dessus » ;
//   - nouvelle ligne déjà remplie ; nouvelle colonne « code » remplie sur les lignes existantes.
import { activeColumns, activeRows, addRow, isNumType, LIMITS, type ColType, type Column, type Sheet } from './sheets';
import { isFormula } from './sheetFormula';

export type Lang = 'fr' | 'en';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const plain = (v: string): string => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ============================== DATE ==============================
export type DateProblem = null | 'day' | 'month' | 'year' | 'incomplete';
export interface DateTyping { display: string; iso: string | null; problem: DateProblem }

const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYmd = (y: number, m: number, d: number): boolean => Number.isInteger(y) && y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

/** « 2026-10-28 » → « 28/10/2026 » (le même ordre jour/mois/année en français et en anglais). Autre texte : rendu tel quel. */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * La personne tape une date. Rend ce qu'il faut AFFICHER (séparateurs automatiques) et la valeur à GARDER (AAAA-MM-JJ) si la date est complète et réelle.
 * - chiffres seuls : 28 → 28 ; 281 → 28/1 ; 28102026 → 28/10/2026 (6 chiffres : 281026 → année 2026) ;
 * - avec séparateurs tapés (/ - . espace) : 1/2/2026 → 01/02/2026 à la fin de la saisie ; 2026-10-28 (ISO collé) accepté.
 */
export function typeDate(text: string, _lang: Lang = 'fr', final = false): DateTyping {
  const raw = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const sepMode = !iso && /[^\d]/.test(raw);
  let d = '', m = '', y = '', nParts = 0;
  if (iso) { y = iso[1]; m = iso[2]; d = iso[3]; nParts = 3; } else if (sepMode) {
    const parts = raw.split(/[^\d]+/).filter(Boolean);
    nParts = parts.length;
    [d = '', m = '', y = ''] = [parts[0]?.slice(0, 2), parts[1]?.slice(0, 2), parts[2]?.slice(0, 4)];
  } else {
    const dg = raw.slice(0, 8);
    d = dg.slice(0, 2); m = dg.slice(2, 4); y = dg.slice(4, 8);
  }
  // à la fin de la saisie : 1/2/2026 → 01/02/2026 ; année sur 2 chiffres → 20yy
  if (final) { if (d.length === 1) d = '0' + d; if (m.length === 1) m = '0' + m; if (y.length === 2) y = '20' + y; }
  let display = [d, m, y].filter((x, i) => i === 0 || x !== '').join('/');
  // un « / » tapé à la main juste après un nombre est gardé (1/ puis 2 → 1/2, pas 12)
  if (sepMode && !final && /[^\d]$/.test(raw) && nParts < 3 && d !== '') display += '/';
  const dn = Number(d), mn = Number(m), yn = Number(y);
  if (d.length >= 2 && (dn < 1 || dn > 31)) return { display, iso: null, problem: 'day' };
  if (m.length >= 2 && (mn < 1 || mn > 12)) return { display, iso: null, problem: 'month' };
  if (d.length === 2 && m.length === 2 && y.length === 4) {
    if (!validYmd(yn, mn, dn)) return { display, iso: null, problem: yn < 1900 || yn > 2100 ? 'year' : 'day' };
    return { display, iso: `${y}-${m}-${d}`, problem: null };
  }
  return { display, iso: null, problem: d === '' && m === '' && y === '' ? null : 'incomplete' };
}
export const dateProblemText = (p: DateProblem, lang: Lang): string => ({
  day: lang === 'en' ? 'This day does not exist.' : 'Ce jour n\'existe pas.',
  month: lang === 'en' ? 'The month must be 01 to 12.' : 'Le mois doit être de 01 à 12.',
  year: lang === 'en' ? 'The year must be between 1900 and 2100.' : 'L\'année doit être entre 1900 et 2100.',
  incomplete: lang === 'en' ? 'Incomplete date: type day, month and year (28/10/2026).' : 'Date incomplète : tape jour, mois et année (28/10/2026).',
} as Record<string, string>)[p || ''] || '';

// ============================== NOMBRE ET MONTANT ==============================
export interface NumberTyping { display: string; stored: string | null }
/**
 * La personne tape un nombre. Milliers automatiques à l'affichage (français : 1 234,5 ; anglais : 1,234.5), valeur gardée simple : 1234.5.
 * Français : « , » et « . » font la virgule. Anglais : « . » fait la virgule, « , » est ignoré. `maxDecimals` : 0 = entier (montant en Ariary par défaut côté appelant).
 */
export function typeNumber(text: string, lang: Lang, maxDecimals = 6): NumberTyping {
  let neg = false, intPart = '', dec = '', hasDec = false;
  for (const ch of text.trim()) {
    if (ch === '-' && intPart === '' && !hasDec && !neg) { neg = true; continue; }
    if (/\d/.test(ch)) { if (hasDec) { if (dec.length < maxDecimals) dec += ch; } else intPart += ch; continue; }
    if (!hasDec && maxDecimals > 0 && ((ch === ',' && lang === 'fr') || ch === '.')) hasDec = true;
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '' && !hasDec && !neg) return { display: '', stored: '' };
  const group = lang === 'en' ? ',' : ' ', dsep = lang === 'en' ? '.' : ',';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const display = (neg ? '-' : '') + (intPart === '' && (hasDec || neg) ? (hasDec ? '0' : '') : grouped) + (hasDec ? dsep + dec : '');
  if (intPart === '' && !hasDec) return { display: '-', stored: null }; // juste un signe moins : pas encore un nombre
  const stored = (neg ? '-' : '') + (intPart === '' ? '0' : intPart) + (hasDec && dec !== '' ? '.' + dec : '');
  return { display, stored };
}
/** Valeur gardée (1234.5, ou ancien texte tapé librement) → texte affiché avec milliers ; ce qui n'est pas un nombre est rendu tel quel. */
export function numberToDisplay(stored: string, lang: Lang): string {
  const t = stored.trim();
  if (!/^-?\d+([.,]\d+)?$/.test(t.replace(/\s/g, ''))) return stored;
  return typeNumber(t.replace(/\s/g, ''), lang, 10).display;
}

// ============================== TÉLÉPHONE ==============================
/** Chiffres et « + » du début ; espaces automatiques : 0341234567 → 034 12 345 67 ; +261341234567 → +261 34 12 345 67. 15 chiffres au plus. */
export function typePhone(text: string): string {
  const t = text.trim();
  const plus = t.startsWith('+');
  const dg = t.replace(/\D/g, '').slice(0, 15);
  if (dg === '') return plus ? '+' : '';
  const group = (s: string, sizes: number[]): string => { const out: string[] = []; let i = 0; for (const n of sizes) { if (i >= s.length) break; out.push(s.slice(i, i + n)); i += n; } if (i < s.length) out.push(s.slice(i)); return out.join(' '); };
  if (plus) return '+' + dg.slice(0, 3) + (dg.length > 3 ? ' ' + group(dg.slice(3), [2, 2, 3, 2]) : '');
  return group(dg, [3, 2, 3, 2]);
}

// ============================== HEURE ==============================
export interface TimeTyping { display: string; stored: string | null; problem: boolean }
/** 1430 → 14:30 ; 9:5 → 09:05 à la fin de la saisie ; 25h refusé. */
export function typeTime(text: string, final = false): TimeTyping {
  const raw = text.trim();
  let h = '', mi = '';
  if (/[^\d]/.test(raw)) { const parts = raw.split(/[^\d]+/).filter(Boolean); h = (parts[0] || '').slice(0, 2); mi = (parts[1] || '').slice(0, 2); } else { const dg = raw.slice(0, 4); h = dg.slice(0, 2); mi = dg.slice(2, 4); }
  if (final) { if (h.length === 1) h = '0' + h; if (mi.length === 1) mi = '0' + mi; }
  const display = mi !== '' || (/[:hH]$/.test(raw) && h !== '') ? `${h}:${mi}` : h;
  const problem = (h.length === 2 && Number(h) > 23) || (mi.length === 2 && Number(mi) > 59);
  if (!problem && h.length === 2 && mi.length === 2) return { display, stored: `${h}:${mi}`, problem: false };
  return { display, stored: null, problem };
}

// ============================== CODE (REF001 → REF002) ==============================
/** Le code suivant : le DERNIER nombre du texte monte de 1, les zéros du début sont gardés (REF001 → REF002, REF099 → REF100, A-9 → A-10, 2026-005 → 2026-006). Pas de nombre : null. */
export function nextCode(prev: string): string | null {
  const m = /^(.*?)(\d+)(\D*)$/.exec(prev.trim());
  if (!m || m[2].length > 15) return null;
  const n = Number(m[2]) + 1;
  return m[1] + pad(n, m[2].length) + m[3];
}
const DEFAULT_PREFIX = 'REF';
const DEFAULT_DIGITS = 3;
/**
 * Le code que propose une nouvelle ligne. Si la colonne a un préfixe : le plus grand numéro déjà utilisé avec ce préfixe + 1 (jamais deux fois le même).
 * Sinon : le suivant du dernier code écrit ; colonne encore vide : REF001.
 */
export function codeFor(col: Pick<Column, 'prefix' | 'digits'>, values: string[]): string {
  const vals = values.map(v => v.trim()).filter(Boolean);
  const digits = col.digits && col.digits >= 1 ? col.digits : DEFAULT_DIGITS;
  if (col.prefix) {
    const re = new RegExp(`^${col.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
    let max = 0;
    for (const v of vals) { const m = re.exec(v); if (m && m[1].length <= 15) max = Math.max(max, Number(m[1])); }
    return col.prefix + pad(max + 1, digits);
  }
  for (let i = vals.length - 1; i >= 0; i--) { const n = nextCode(vals[i]); if (n) return n; }
  return DEFAULT_PREFIX + pad(1, digits);
}

// ============================== MOTS QUI REVIENNENT ==============================
/** Valeurs déjà tapées dans une colonne texte, les plus fréquentes d'abord (à égalité : les plus récentes). Sert de liste de suggestions. */
export function columnSuggestions(s: Sheet, colId: string, max = 30): string[] {
  const col = s.columns.find(c => c.id === colId);
  if (!col || (col.type !== 'text' && col.type !== 'code')) return [];
  const seen = new Map<string, { v: string; n: number; last: number }>();
  activeRows(s).forEach((r, i) => {
    const v = (r.cells[colId] ?? '').trim();
    if (!v || v.length > 60 || isFormula(v)) return;
    const k = plain(v), cur = seen.get(k);
    if (cur) { cur.n++; cur.last = i; cur.v = v; } else seen.set(k, { v, n: 1, last: i });
  });
  return [...seen.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, max).map(x => x.v);
}
/** Suggestions pour ce que la personne est en train de taper : d'abord les valeurs qui COMMENCENT pareil, puis celles qui le CONTIENNENT ; jamais la valeur exacte déjà tapée. */
export function suggest(s: Sheet, colId: string, typed: string, max = 6): string[] {
  const q = plain(typed.trim());
  const all = columnSuggestions(s, colId, 200);
  if (!q) return all.slice(0, max);
  const starts = all.filter(v => plain(v).startsWith(q) && plain(v) !== q), has = all.filter(v => !plain(v).startsWith(q) && plain(v).includes(q));
  return [...starts, ...has].slice(0, max);
}

// ============================== NOUVELLE LIGNE, NOUVELLE COLONNE ==============================
/** Ce qu'une nouvelle ligne contient déjà : code suivant ; date du jour (ou celle de la ligne du dessus si la colonne le demande) ; colonnes « reprendre la ligne du dessus » recopiées.
 *  Les lignes à la corbeille comptent pour les numéros (si on les restaure, aucun numéro n'est en double). */
export function defaultRowCells(s: Sheet, today: string): Record<string, string> {
  const rows = activeRows(s), last = rows[rows.length - 1];
  const out: Record<string, string> = {};
  for (const col of activeColumns(s)) {
    const above = last ? (last.cells[col.id] ?? '') : '';
    if (col.type === 'code') out[col.id] = codeFor(col, s.rows.map(r => r.cells[col.id] ?? ''));
    else if (col.type === 'date') out[col.id] = col.repeat && above ? above : today;
    else if (col.repeat && above && !isFormula(above)) out[col.id] = above;
  }
  return out;
}
/** Ajoute une ligne déjà remplie (null : limite atteinte). */
export const addRowAuto = (s: Sheet, now: string, today: string): Sheet | null => addRow(s, now, defaultRowCells(s, today));

/** Remplit la colonne « code » des lignes qui n'ont encore rien, dans l'ordre des lignes (REF001, REF002, …), en continuant après le code de la ligne du dessus.
 *  Les codes déjà écrits ne bougent pas, et un code déjà pris (même plus bas dans le tableau, même à la corbeille) n'est jamais redonné. Null : rien à remplir. */
export function fillCodes(s: Sheet, colId: string, now: string): Sheet | null {
  const col = s.columns.find(c => c.id === colId && !c.deleted_at);
  if (!col || col.type !== 'code') return null;
  const taken = new Set(s.rows.map(r => (r.cells[colId] ?? '').trim()).filter(Boolean));
  const above: string[] = [];
  const filled = new Map<string, string>();
  for (const r of s.rows) {
    const v = (r.cells[colId] ?? '').trim();
    if (v === '' && !r.deleted_at) {
      let code = codeFor(col, above);
      for (let guard = 0; taken.has(code) && guard < 100000; guard++) code = nextCode(code) ?? code + '1';
      taken.add(code); filled.set(r.id, code); above.push(code);
    } else above.push(v);
  }
  if (filled.size === 0) return null;
  return { ...s, updated_at: now, rows: s.rows.map(r => (filled.has(r.id) ? { ...r, cells: { ...r.cells, [colId]: filled.get(r.id) as string } } : r)) };
}

// ============================== CLAVIER, AIDE À LA SAISIE ==============================
export type InputMode = 'text' | 'numeric' | 'decimal' | 'tel';
/** Clavier du téléphone conseillé pour un type de colonne (nombre : avec la virgule ; montant, date, heure : chiffres ; téléphone : clavier téléphone). */
export function keyboardFor(type: ColType): { inputMode: InputMode; enterKeyHint: 'next' | 'done' } {
  if (type === 'number') return { inputMode: 'decimal', enterKeyHint: 'next' };
  if (type === 'money' || type === 'date' || type === 'time') return { inputMode: 'numeric', enterKeyHint: 'next' };
  if (type === 'phone') return { inputMode: 'tel', enterKeyHint: 'next' };
  return { inputMode: 'text', enterKeyHint: 'next' };
}
export function placeholderFor(type: ColType, lang: Lang): string {
  if (type === 'date') return lang === 'en' ? 'dd/mm/yyyy' : 'jj/mm/aaaa';
  if (type === 'time') return 'hh:mm';
  if (type === 'phone') return '034 12 345 67';
  if (type === 'code') return 'REF001';
  if (type === 'money' || type === 'number') return '0';
  return '';
}
export const isTypedKind = (type: ColType): boolean => type === 'date' || type === 'time' || type === 'phone' || type === 'money' || type === 'number';

/** Ce qui est AFFICHÉ pour une valeur gardée (date jj/mm/aaaa, milliers) : la valeur gardée ne change pas. */
export function displayValue(type: ColType, stored: string, lang: Lang): string {
  if (stored === '' || isFormula(stored)) return stored;
  if (type === 'date') return isoToDisplay(stored);
  if (isNumType(type)) return numberToDisplay(stored, lang);
  return stored;
}

export interface Typed { display: string; stored: string | null; problem: string }
/**
 * Un seul point d'entrée pour la saisie d'une case ou d'un champ de formulaire.
 * `final` = la personne a fini (elle quitte le champ) : on complète (01/02/2026, 09:05) et on dit pourquoi si ce n'est pas valide.
 * `stored` null = rien à enregistrer pour l'instant (saisie incomplète ou refusée) ; `problem` = la raison, en clair.
 */
export function typeCell(col: Pick<Column, 'type'>, text: string, lang: Lang, final = false): Typed {
  const en = lang === 'en';
  if (text.trim() === '') return { display: '', stored: '', problem: '' };
  if (col.type === 'date') { const r = typeDate(text, lang, final); return { display: r.display, stored: r.iso, problem: final || r.problem === 'day' || r.problem === 'month' || r.problem === 'year' ? dateProblemText(r.problem, lang) : '' }; }
  if (col.type === 'time') { const r = typeTime(text, final); return { display: r.display, stored: r.stored, problem: r.problem ? (en ? 'Time must be 00:00 to 23:59.' : 'L\'heure doit être de 00:00 à 23:59.') : final && !r.stored ? (en ? 'Incomplete time (hh:mm).' : 'Heure incomplète (hh:mm).') : '' }; }
  if (col.type === 'phone') { const d = typePhone(text); const n = d.replace(/\D/g, '').length; return { display: d, stored: n >= 6 ? d : null, problem: final && n < 6 ? (en ? 'Phone number too short.' : 'Numéro trop court.') : '' }; }
  if (isNumType(col.type)) { const r = typeNumber(text, lang, col.type === 'money' ? 2 : 6); return { display: r.display, stored: r.stored, problem: final && r.stored === null ? (en ? 'Not a number.' : 'Ce n\'est pas un nombre.') : '' }; }
  return { display: text, stored: text, problem: '' };
}
export const LIMITS_AUTO = { suggestions: 30, codeDigits: LIMITS.digits };
