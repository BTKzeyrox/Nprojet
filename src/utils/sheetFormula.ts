// « Mes tableaux » (module 12) : lecteur de formules SÛR, type Excel. Aucun `eval`, aucun accès au réseau ni au navigateur : texte → arbre → valeur.
// Règles pures, copiées à l'identique dans le bloc SHEETS du serveur à l'étape M12.4 (comparées par un contrôle).
// Limites écrites : formule ≤ 500 caractères, profondeur ≤ 40, 1 000 000 d'opérations par tableau, dépendances en avant ≤ 400 niveaux, zone ≤ 100 000 cellules.
// Références : A1 = 1re colonne, 1re ligne ACTIVE (les lignes et colonnes à la corbeille ne comptent pas). Nombres avec un POINT dans les formules (1.5) ; séparateur d'arguments « ; » ou « , ».

export type FormulaError = '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#CYCLE!' | '#N/A' | '#LIMITE!' | '#SYNTAXE!';
export interface Err { err: FormulaError }
export type Val = number | string | boolean | null | Err;
export const isErr = (v: unknown): v is Err => !!v && typeof v === 'object' && 'err' in (v as object);
const E = (err: FormulaError): Err => ({ err });

export const FORMULA_MAX_LEN = 500;
export const FORMULA_MAX_DEPTH = 40;
export const EVAL_MAX_STEPS = 1_000_000;
export const DEP_MAX_DEPTH = 400;
export const RANGE_MAX_CELLS = 100_000;

// ---------- 1) texte → jetons ----------
type Tok = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'ref'; c: number; r: number } | { k: 'id'; v: string } | { k: 'op'; v: string };
class Syntax extends Error {}
class Limit extends Error {}

export const colLetters = (n: number): string => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
export const colIndex = (letters: string): number => { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new Syntax('texte non fermé');
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      out.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const ref = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})(?![A-Za-z0-9_.(])/.exec(src.slice(i));
    if (ref) { out.push({ k: 'ref', c: colIndex(ref[1]), r: Number(ref[2]) }); i += ref[0].length; continue; }
    const id = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>(),;:'.includes(ch)) { out.push({ k: 'op', v: ch === ';' ? ',' : ch }); i++; continue; }
    throw new Syntax(`caractère « ${ch} »`);
  }
  return out;
}

// ---------- 2) jetons → arbre ----------
export type Node =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'bool'; v: boolean }
  | { t: 'ref'; c: number; r: number } | { t: 'range'; c1: number; r1: number; c2: number; r2: number }
  | { t: 'un'; op: string; a: Node } | { t: 'bin'; op: string; a: Node; b: Node } | { t: 'call'; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.k === 'op' && t.v === v; };
  const eat = (v: string) => { if (!isOp(v)) throw new Syntax(`« ${v} » attendu`); p++; };
  const guard = (d: number) => { if (d > FORMULA_MAX_DEPTH) throw new Syntax('formule trop imbriquée'); };
  const cmp = (d: number): Node => {
    guard(d); let a = cat(d + 1);
    while (peek() && peek().k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((peek() as { v: string }).v)) { const op = (toks[p++] as { v: string }).v; a = { t: 'bin', op, a, b: cat(d + 1) }; }
    return a;
  };
  const cat = (d: number): Node => { guard(d); let a = add(d + 1); while (isOp('&')) { p++; a = { t: 'bin', op: '&', a, b: add(d + 1) }; } return a; };
  const add = (d: number): Node => { guard(d); let a = mul(d + 1); while (isOp('+') || isOp('-')) { const op = (toks[p++] as { v: string }).v; a = { t: 'bin', op, a, b: mul(d + 1) }; } return a; };
  const mul = (d: number): Node => { guard(d); let a = pow(d + 1); while (isOp('*') || isOp('/')) { const op = (toks[p++] as { v: string }).v; a = { t: 'bin', op, a, b: pow(d + 1) }; } return a; };
  const pow = (d: number): Node => { guard(d); let a = unary(d + 1); while (isOp('^')) { p++; a = { t: 'bin', op: '^', a, b: unary(d + 1) }; } return a; };
  const unary = (d: number): Node => { guard(d); if (isOp('-') || isOp('+')) { const op = (toks[p++] as { v: string }).v; return { t: 'un', op, a: unary(d + 1) }; } return primary(d + 1); };
  const primary = (d: number): Node => {
    guard(d);
    const t = toks[p++];
    if (!t) throw new Syntax('formule incomplète');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'ref') {
      if (isOp(':')) { p++; const u = toks[p++]; if (!u || u.k !== 'ref') throw new Syntax('zone incomplète'); return { t: 'range', c1: Math.min(t.c, u.c), r1: Math.min(t.r, u.r), c2: Math.max(t.c, u.c), r2: Math.max(t.r, u.r) }; }
      return { t: 'ref', c: t.c, r: t.r };
    }
    if (t.k === 'id') {
      if (isOp('(')) {
        p++; const args: Node[] = [];
        if (!isOp(')')) { for (;;) { args.push(cmp(d + 1)); if (isOp(',')) { p++; continue; } break; } }
        eat(')'); return { t: 'call', name: t.v, args };
      }
      if (t.v === 'VRAI' || t.v === 'TRUE') return { t: 'bool', v: true };
      if (t.v === 'FAUX' || t.v === 'FALSE') return { t: 'bool', v: false };
      throw new Syntax(`nom inconnu « ${t.v} »`);
    }
    if (t.v === '(') { const e = cmp(d + 1); eat(')'); return e; }
    throw new Syntax(`« ${t.v} » inattendu`);
  };
  const root = cmp(0);
  if (p < toks.length) throw new Syntax('texte en trop');
  return root;
}

/** Texte « =… » → arbre, ou `null` si la formule est mal écrite. */
export function parseFormula(text: string): Node | null {
  if (typeof text !== 'string' || text.length > FORMULA_MAX_LEN || text[0] !== '=') return null;
  try { return parse(tokenize(text.slice(1))); } catch { return null; }
}
export const isFormula = (v: unknown): boolean => typeof v === 'string' && v.length > 1 && v[0] === '=';

// ---------- 3) conversions ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoDays = (s: string): number | null => { if (!ISO.test(s)) return null; const t = Date.parse(`${s}T00:00:00Z`); return Number.isNaN(t) ? null : Math.round(t / 86400000); };
const numOf = (v: Val): number | Err => {
  if (isErr(v)) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const d = isoDays(v); if (d !== null) return d;
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return E('#VALUE!');
};
const textOf = (v: Val): string | Err => {
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'number') return String(Number(v.toPrecision(12)));
  if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
  return v;
};
const boolOf = (v: Val): boolean | Err => {
  if (isErr(v)) return v;
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const u = v.trim().toUpperCase();
  if (u === 'VRAI' || u === 'TRUE') return true;
  if (u === 'FAUX' || u === 'FALSE') return false;
  return E('#VALUE!');
};
const sameKind = (a: Val, b: Val): [Val, Val] => (typeof a === 'string' && typeof b === 'number' ? [numOf(a) as Val, b] : typeof a === 'number' && typeof b === 'string' ? [a, numOf(b) as Val] : [a, b]);
const compare = (a: Val, b: Val): number | Err => {
  if (isErr(a)) return a; if (isErr(b)) return b;
  let [x, y] = sameKind(a, b);
  if (isErr(x)) { x = a; y = b; }
  if (isErr(y)) { x = a; y = b; }
  if (x === null) x = typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0;
  if (y === null) y = typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0;
  if (typeof x === 'string' && typeof y === 'string') { const p = x.toLocaleLowerCase('fr'), q = y.toLocaleLowerCase('fr'); return p < q ? -1 : p > q ? 1 : 0; }
  if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : x > y ? 1 : 0;
  if (typeof x === typeof y) return (x as boolean) === (y as boolean) ? 0 : (x as boolean) ? 1 : -1;
  return typeof x === 'number' ? -1 : typeof x === 'string' ? (typeof y === 'number' ? 1 : -1) : 1; // nombre < texte < vrai/faux
};

// ---------- 4) évaluation ----------
export interface Env {
  get(c: number, r: number): Val; // 1-based, déjà calculé (peut être une erreur)
  cols: number; rows: number; // taille des données actives
  today: string; // AAAA-MM-JJ (jour de Madagascar), donné de l'extérieur : la fonction reste pure
  steps: { n: number };
}
type Item = { v: Val; fromRange: boolean };

function flatten(env: Env, nodes: Node[], ev: (n: Node) => Val): Item[] | Err {
  const out: Item[] = [];
  for (const n of nodes) {
    if (n.t === 'range') {
      const area = (n.c2 - n.c1 + 1) * (n.r2 - n.r1 + 1);
      if (area > RANGE_MAX_CELLS) return E('#LIMITE!');
      for (let r = n.r1; r <= Math.min(n.r2, env.rows); r++) for (let c = n.c1; c <= Math.min(n.c2, env.cols); c++) { const v = env.get(c, r); if (isErr(v)) return v; out.push({ v, fromRange: true }); }
    } else { const v = ev(n); if (isErr(v)) return v; out.push({ v, fromRange: false }); }
  }
  return out;
}
function numbersOf(items: Item[]): number[] | Err {
  const out: number[] = [];
  for (const it of items) {
    if (it.fromRange) { if (typeof it.v === 'number') out.push(it.v); continue; } // dans une zone : texte, vide et vrai/faux sont ignorés
    if (it.v === null) continue;
    const n = numOf(it.v); if (isErr(n)) return n; out.push(n);
  }
  return out;
}
/** Critère de SOMME.SI / NB.SI : « >5 », « <>Payé », « texte » ou un nombre. */
function matcher(crit: Val): ((v: Val) => boolean) | Err {
  if (isErr(crit)) return crit;
  let op = '=', rhs: Val = crit;
  if (typeof crit === 'string') {
    const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(crit);
    if (m) { op = m[1]; const rest = m[2]; const n = numOf(rest); rhs = rest !== '' && !isErr(n) && !ISO.test(rest) ? n : rest; }
  }
  return (v: Val) => {
    if (isErr(v)) return false;
    if (op === '=' && (rhs === '' || rhs === null)) return v === null || v === '';
    if (v === null) return op === '<>' && rhs !== '';
    const c = compare(v, rhs); if (isErr(c)) return false;
    const textVsNum = (typeof v === 'string') !== (typeof rhs === 'string');
    if (textVsNum && op !== '<>') return false;
    return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  };
}
const roundHalfAway = (x: number, n: number): number => { const k = 10 ** n; const r = Math.round(Math.abs(x) * k + 1e-9) / k; return x < 0 ? -r : r; };

export function evalNode(node: Node, env: Env, depth = 0): Val {
  const ev = (n: Node): Val => evalNode(n, env, depth + 1);
  if (++env.steps.n > EVAL_MAX_STEPS) throw new Limit('trop d\'opérations');
  if (depth > FORMULA_MAX_DEPTH + 5) return E('#LIMITE!');
  switch (node.t) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'ref': return node.c < 1 || node.r < 1 || node.c > 702 || node.r > 100000 ? E('#REF!') : node.c > env.cols || node.r > env.rows ? null : env.get(node.c, node.r);
    case 'range': return E('#VALUE!'); // une zone seule n'est pas une valeur
    case 'un': {
      const a = numOf(ev(node.a)); if (isErr(a)) return a;
      return node.op === '-' ? -a : a;
    }
    case 'bin': {
      const av = ev(node.a), bv = ev(node.b);
      if (isErr(av)) return av; if (isErr(bv)) return bv;
      if (node.op === '&') { const p = textOf(av), q = textOf(bv); return isErr(p) ? p : isErr(q) ? q : p + q; }
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        const c = compare(av, bv); if (isErr(c)) return c;
        return node.op === '=' ? c === 0 : node.op === '<>' ? c !== 0 : node.op === '<' ? c < 0 : node.op === '>' ? c > 0 : node.op === '<=' ? c <= 0 : c >= 0;
      }
      const x = numOf(av), y = numOf(bv); if (isErr(x)) return x; if (isErr(y)) return y;
      let r: number;
      if (node.op === '+') r = x + y; else if (node.op === '-') r = x - y; else if (node.op === '*') r = x * y;
      else if (node.op === '/') { if (y === 0) return E('#DIV/0!'); r = x / y; }
      else { r = x ** y; }
      return Number.isFinite(r) ? r : E('#VALUE!');
    }
    case 'call': return callFn(node, env, ev);
  }
}

const NAMES: Record<string, string> = {
  SOMME: 'SUM', SUM: 'SUM', MOYENNE: 'AVG', AVERAGE: 'AVG', MIN: 'MIN', MAX: 'MAX', NB: 'COUNT', COUNT: 'COUNT', NBVAL: 'COUNTA', COUNTA: 'COUNTA',
  SI: 'IF', IF: 'IF', ET: 'AND', AND: 'AND', OU: 'OR', OR: 'OR', NON: 'NOT', NOT: 'NOT', SIERREUR: 'IFERROR', IFERROR: 'IFERROR',
  ARRONDI: 'ROUND', ROUND: 'ROUND', ABS: 'ABS', ENT: 'INT', INT: 'INT',
  RECHERCHEV: 'VLOOKUP', VLOOKUP: 'VLOOKUP', 'SOMME.SI': 'SUMIF', SUMIF: 'SUMIF', 'NB.SI': 'COUNTIF', COUNTIF: 'COUNTIF',
  AUJOURDHUI: 'TODAY', TODAY: 'TODAY', JOURS: 'DAYS', DAYS: 'DAYS',
  CONCAT: 'CONCAT', CONCATENER: 'CONCAT', CONCATENATE: 'CONCAT', GAUCHE: 'LEFT', LEFT: 'LEFT', DROITE: 'RIGHT', RIGHT: 'RIGHT',
  MAJUSCULE: 'UPPER', UPPER: 'UPPER', MINUSCULE: 'LOWER', LOWER: 'LOWER', NBCAR: 'LEN', LEN: 'LEN',
};
export const FUNCTION_NAMES: { fr: string; en: string; hint: { fr: string; en: string } }[] = [
  { fr: 'SOMME', en: 'SUM', hint: { fr: 'Additionne : SOMME(B1:B10)', en: 'Adds up: SUM(B1:B10)' } },
  { fr: 'MOYENNE', en: 'AVERAGE', hint: { fr: 'Moyenne : MOYENNE(B1:B10)', en: 'Average: AVERAGE(B1:B10)' } },
  { fr: 'MIN', en: 'MIN', hint: { fr: 'Plus petite valeur', en: 'Smallest value' } },
  { fr: 'MAX', en: 'MAX', hint: { fr: 'Plus grande valeur', en: 'Largest value' } },
  { fr: 'NB', en: 'COUNT', hint: { fr: 'Compte les nombres', en: 'Counts numbers' } },
  { fr: 'NBVAL', en: 'COUNTA', hint: { fr: 'Compte les cases remplies', en: 'Counts filled cells' } },
  { fr: 'SI', en: 'IF', hint: { fr: 'SI(B2>100;"Grand";"Petit")', en: 'IF(B2>100,"Big","Small")' } },
  { fr: 'ET', en: 'AND', hint: { fr: 'Vrai si tout est vrai', en: 'True if all true' } },
  { fr: 'OU', en: 'OR', hint: { fr: 'Vrai si un seul est vrai', en: 'True if any is true' } },
  { fr: 'NON', en: 'NOT', hint: { fr: 'Inverse vrai / faux', en: 'Flips true / false' } },
  { fr: 'SIERREUR', en: 'IFERROR', hint: { fr: 'Valeur de secours si erreur', en: 'Fallback value on error' } },
  { fr: 'ARRONDI', en: 'ROUND', hint: { fr: 'ARRONDI(B2;0)', en: 'ROUND(B2,0)' } },
  { fr: 'ABS', en: 'ABS', hint: { fr: 'Valeur sans signe', en: 'Value without sign' } },
  { fr: 'ENT', en: 'INT', hint: { fr: 'Partie entière', en: 'Whole part' } },
  { fr: 'RECHERCHEV', en: 'VLOOKUP', hint: { fr: 'RECHERCHEV(A2;D1:F20;2) cherche dans la 1re colonne', en: 'VLOOKUP(A2,D1:F20,2) looks in the first column' } },
  { fr: 'SOMME.SI', en: 'SUMIF', hint: { fr: 'SOMME.SI(C1:C20;"Payé";B1:B20)', en: 'SUMIF(C1:C20,"Paid",B1:B20)' } },
  { fr: 'NB.SI', en: 'COUNTIF', hint: { fr: 'NB.SI(C1:C20;">5")', en: 'COUNTIF(C1:C20,">5")' } },
  { fr: 'AUJOURDHUI', en: 'TODAY', hint: { fr: 'La date du jour', en: 'Today\'s date' } },
  { fr: 'JOURS', en: 'DAYS', hint: { fr: 'JOURS(fin;début) = nombre de jours', en: 'DAYS(end,start) = number of days' } },
  { fr: 'CONCAT', en: 'CONCAT', hint: { fr: 'Colle des textes', en: 'Joins texts' } },
  { fr: 'GAUCHE', en: 'LEFT', hint: { fr: 'Les premiers caractères', en: 'First characters' } },
  { fr: 'DROITE', en: 'RIGHT', hint: { fr: 'Les derniers caractères', en: 'Last characters' } },
  { fr: 'MAJUSCULE', en: 'UPPER', hint: { fr: 'En majuscules', en: 'Uppercase' } },
  { fr: 'MINUSCULE', en: 'LOWER', hint: { fr: 'En minuscules', en: 'Lowercase' } },
  { fr: 'NBCAR', en: 'LEN', hint: { fr: 'Nombre de caractères', en: 'Number of characters' } },
];

function callFn(node: Extract<Node, { t: 'call' }>, env: Env, ev: (n: Node) => Val): Val {
  const fn = NAMES[node.name];
  if (!fn) return E('#NAME?');
  const a = node.args;
  const need = (min: number, max: number) => a.length >= min && a.length <= max;
  const one = (i: number): Val => ev(a[i]);
  switch (fn) {
    case 'SUM': case 'AVG': case 'MIN': case 'MAX': case 'COUNT': case 'COUNTA': {
      if (!need(1, 60)) return E('#VALUE!');
      const items = flatten(env, a, ev); if (isErr(items)) return items;
      if (fn === 'COUNTA') return items.filter(i => i.v !== null && i.v !== '').length;
      const nums = numbersOf(items); if (isErr(nums)) return nums;
      if (fn === 'COUNT') return items.filter(i => (i.fromRange ? typeof i.v === 'number' : i.v !== null && !isErr(numOf(i.v)))).length;
      if (fn === 'SUM') return nums.reduce((s, x) => s + x, 0);
      if (fn === 'AVG') return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : E('#DIV/0!');
      if (!nums.length) return 0;
      return fn === 'MIN' ? Math.min(...nums) : Math.max(...nums);
    }
    case 'IF': {
      if (!need(2, 3)) return E('#VALUE!');
      const c = boolOf(one(0)); if (isErr(c)) return c;
      return c ? one(1) : a.length === 3 ? one(2) : false;
    }
    case 'IFERROR': { if (!need(2, 2)) return E('#VALUE!'); const v = one(0); return isErr(v) ? one(1) : v; }
    case 'AND': case 'OR': {
      if (!need(1, 30)) return E('#VALUE!');
      let res = fn === 'AND';
      for (const n of a) { const b = boolOf(ev(n)); if (isErr(b)) return b; res = fn === 'AND' ? res && b : res || b; }
      return res;
    }
    case 'NOT': { if (!need(1, 1)) return E('#VALUE!'); const b = boolOf(one(0)); return isErr(b) ? b : !b; }
    case 'ROUND': {
      if (!need(1, 2)) return E('#VALUE!');
      const x = numOf(one(0)); if (isErr(x)) return x;
      const n = a.length === 2 ? numOf(one(1)) : 0; if (isErr(n)) return n;
      if (!Number.isInteger(n) || n < -10 || n > 10) return E('#VALUE!');
      return roundHalfAway(x, n);
    }
    case 'ABS': { if (!need(1, 1)) return E('#VALUE!'); const x = numOf(one(0)); return isErr(x) ? x : Math.abs(x); }
    case 'INT': { if (!need(1, 1)) return E('#VALUE!'); const x = numOf(one(0)); return isErr(x) ? x : Math.floor(x); }
    case 'TODAY': return need(0, 0) ? env.today : E('#VALUE!');
    case 'DAYS': {
      if (!need(2, 2)) return E('#VALUE!');
      const x = numOf(one(0)), y = numOf(one(1)); if (isErr(x)) return x; if (isErr(y)) return y;
      return Math.round(x - y);
    }
    case 'CONCAT': {
      if (!need(1, 60)) return E('#VALUE!');
      let s = '';
      for (const n of a) {
        if (n.t === 'range') { const items = flatten(env, [n], ev); if (isErr(items)) return items; for (const it of items) { const t = textOf(it.v); if (isErr(t)) return t; s += t; } }
        else { const t = textOf(ev(n)); if (isErr(t)) return t; s += t; }
        if (s.length > 5000) return E('#LIMITE!');
      }
      return s;
    }
    case 'LEFT': case 'RIGHT': {
      if (!need(1, 2)) return E('#VALUE!');
      const t = textOf(one(0)); if (isErr(t)) return t;
      const n = a.length === 2 ? numOf(one(1)) : 1; if (isErr(n)) return n;
      if (n < 0) return E('#VALUE!');
      const k = Math.floor(n);
      return fn === 'LEFT' ? t.slice(0, k) : k === 0 ? '' : t.slice(-k);
    }
    case 'UPPER': case 'LOWER': { if (!need(1, 1)) return E('#VALUE!'); const t = textOf(one(0)); return isErr(t) ? t : fn === 'UPPER' ? t.toLocaleUpperCase('fr') : t.toLocaleLowerCase('fr'); }
    case 'LEN': { if (!need(1, 1)) return E('#VALUE!'); const t = textOf(one(0)); return isErr(t) ? t : t.length; }
    case 'SUMIF': case 'COUNTIF': {
      const isSum = fn === 'SUMIF';
      if (!need(isSum ? 2 : 2, isSum ? 3 : 2) || a[0].t !== 'range') return E('#VALUE!');
      const m = matcher(one(1)); if (isErr(m)) return m;
      const r = a[0], s = isSum && a.length === 3 ? a[2] : r;
      if (s.t !== 'range') return E('#VALUE!');
      if ((r.c2 - r.c1 + 1) * (r.r2 - r.r1 + 1) > RANGE_MAX_CELLS || (s.c2 - s.c1 + 1) * (s.r2 - s.r1 + 1) > RANGE_MAX_CELLS) return E('#LIMITE!');
      let total = 0;
      for (let rr = r.r1; rr <= Math.min(r.r2, env.rows); rr++) for (let cc = r.c1; cc <= Math.min(r.c2, env.cols); cc++) {
        const v = env.get(cc, rr); if (isErr(v)) return v;
        if (!m(v)) continue;
        if (!isSum) { total++; continue; }
        const sv = env.get(s.c1 + (cc - r.c1), s.r1 + (rr - r.r1)); if (isErr(sv)) return sv;
        if (typeof sv === 'number') total += sv;
      }
      return total;
    }
    case 'VLOOKUP': {
      if (!need(3, 4) || a[1].t !== 'range') return E('#VALUE!');
      const key = one(0); if (isErr(key)) return key;
      const idx = numOf(one(2)); if (isErr(idx)) return idx;
      const rg = a[1]; const width = rg.c2 - rg.c1 + 1;
      if (!Number.isInteger(idx) || idx < 1 || idx > width) return E('#REF!');
      if (width * (rg.r2 - rg.r1 + 1) > RANGE_MAX_CELLS) return E('#LIMITE!');
      const approx = a.length === 4 ? boolOf(one(3)) : false; if (isErr(approx)) return approx;
      let best: number | null = null;
      for (let rr = rg.r1; rr <= Math.min(rg.r2, env.rows); rr++) {
        const k = env.get(rg.c1, rr); if (isErr(k)) return k;
        const c = compare(k, key); if (isErr(c)) continue;
        if (!approx) { if (c === 0) { best = rr; break; } }
        else { if (c === 0) { best = rr; break; } if (c < 0) best = rr; else break; }
      }
      if (best === null) return E('#N/A');
      return env.get(rg.c1 + idx - 1, best);
    }
  }
  return E('#NAME?');
}

/** Calcule UNE formule dans un environnement. Toute erreur de texte, de limite ou de boucle devient une valeur d'erreur : jamais d'exception. */
export function evalFormula(text: string, env: Env): Val {
  const node = parseFormula(text);
  if (!node) return E('#SYNTAXE!');
  try { return evalNode(node, env); } catch (e) { return e instanceof Limit ? E('#LIMITE!') : E('#VALUE!'); }
}

/** Affichage d'une valeur calculée (nombre arrondi proprement, vrai/faux en toutes lettres). */
export function showVal(v: Val, lang: 'fr' | 'en' = 'fr'): string {
  if (isErr(v)) return v.err;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? (lang === 'en' ? 'TRUE' : 'VRAI') : (lang === 'en' ? 'FALSE' : 'FAUX');
  if (typeof v === 'number') { const r = Number(v.toPrecision(12)); return r.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 10 }).replace(/[  ]/g, ' '); }
  return v;
}
