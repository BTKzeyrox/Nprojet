// Changer le type d'une colonne SANS casser ce qu'elle contient, et DEVINER le bon type (module 19, suite).
//  - `retypeColumn` : change le type ; les valeurs qui peuvent être mises dans la forme du nouveau type le sont (28/10/2026 → 2026-10-28, 1 500 → 1500, 0341234567 → 034 12 345 67) ;
//    celles qui ne conviennent pas sont GARDÉES telles quelles (jamais effacées) et comptées.
//  - `suggestColumnType` : regarde ce que la personne a tapé dans une colonne « texte » et propose, en un clic : colonne Code (REF001, REF002…), Date, Heure, Téléphone, Nombre,
//    ou Liste de choix (quelques mots qui reviennent : Oui/Non, À faire/Fait…). Il PROPOSE seulement : rien ne change sans clic. Refus mémorisé sur l'appareil.
// Règle pure (sauf la mémoire du refus, dont le stockage est donné). Contrôlée par `npm run check:sheet-retype`.
import { activeColumns, activeRows, updateColumn, type ColType, type Sheet } from './sheets';
import { isFormula } from './sheetFormula';
import { convertCell } from './sheetMerge';
import { fillCodes, type Lang } from './sheetAuto';
import type { KeyValueStore } from './workMode';

/** Types dont on met les valeurs existantes dans la bonne forme. Pour les autres (texte, code, liste, case) on ne touche jamais aux valeurs. */
const CONVERTIBLE: ColType[] = ['date', 'time', 'phone', 'number', 'money'];

export interface Retyped { sheet: Sheet; converted: number; kept: number }
export function retypeColumn(s: Sheet, colId: string, type: ColType, now: string, lang: Lang = 'fr'): Retyped | null {
  let next = updateColumn(s, colId, { type }, now);
  if (!next) return null;
  let converted = 0, kept = 0;
  if (CONVERTIBLE.includes(type)) {
    next = { ...next, rows: next.rows.map(r => {
      const v = (r.cells[colId] ?? '').trim();
      if (!v || isFormula(v)) return r;
      const c = convertCell({ type }, v, lang);
      if (c.bad) { kept++; return r; }
      if (c.value === r.cells[colId]) return r;
      converted++;
      return { ...r, cells: { ...r.cells, [colId]: c.value } };
    }) };
  }
  if (type === 'code') next = fillCodes(next, colId, now) || next;
  return { sheet: next, converted, kept };
}

export type HintKind = 'code' | 'date' | 'time' | 'phone' | 'number' | 'list';
export interface TypeHint { kind: HintKind; type: ColType; prefix?: string; digits?: number; options?: string[]; sample: string[] }

const SCAN_MAX = 300; // on regarde les 300 dernières valeurs : assez pour reconnaître, rapide sur un gros tableau
const RATIO = 0.8;
const plain = (v: string): string => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const share = (vals: string[], ok: (v: string) => boolean): number => vals.filter(ok).length / vals.length;

/** Ce que la colonne « texte » semble être. Null : rien de sûr (ou pas assez de valeurs : 3 au moins, 6 pour une liste). */
export function suggestColumnType(s: Sheet, colId: string, lang: Lang = 'fr'): TypeHint | null {
  const col = s.columns.find(c => c.id === colId && !c.deleted_at);
  if (!col || col.type !== 'text') return null;
  const all = activeRows(s).map(r => (r.cells[colId] ?? '').trim()).filter(v => v !== '' && !isFormula(v));
  const vals = all.slice(-SCAN_MAX);
  if (vals.length < 3) return null;
  const sample = vals.slice(0, 3);
  const good = (type: ColType) => (v: string) => !convertCell({ type }, v, lang).bad;

  // téléphone : 9 à 13 chiffres, éventuellement avec + et espaces
  if (share(vals, v => /^\+?[\d ]+$/.test(v) && v.replace(/\D/g, '').length >= 9 && v.replace(/\D/g, '').length <= 13) >= RATIO) return { kind: 'phone', type: 'phone', sample };
  // heure
  if (share(vals, v => /^\d{1,2}\s*[:hH]\s*\d{1,2}$/.test(v) && good('time')(v)) >= RATIO) return { kind: 'time', type: 'time', sample };
  // date (avec des séparateurs : « 12 » ou « 3 » ne sont pas des dates)
  if (share(vals, v => /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(v) && good('date')(v)) >= RATIO) return { kind: 'date', type: 'date', sample };
  // code : même début (non vide) + numéro de même largeur, qui monte
  const parts = vals.map(v => { const m = /^(.*?)(\d+)$/.exec(v); return m && m[1] !== '' && m[2].length <= 8 ? { prefix: m[1], digits: m[2].length, n: Number(m[2]) } : null; });
  const valid = parts.filter((p): p is { prefix: string; digits: number; n: number } => p !== null);
  if (valid.length / vals.length >= RATIO) {
    const count = new Map<string, number>(); valid.forEach(p => count.set(p.prefix, (count.get(p.prefix) || 0) + 1));
    const [top, topN] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    const same = valid.filter(p => p.prefix === top);
    if (topN / vals.length >= RATIO && top.trim().length >= 1 && top.length <= 12) {
      const widths = new Map<number, number>(); same.forEach(p => widths.set(p.digits, (widths.get(p.digits) || 0) + 1));
      const digits = [...widths.entries()].sort((a, b) => b[1] - a[1])[0][0];
      let up = 0; for (let i = 1; i < same.length; i++) if (same[i].n > same[i - 1].n) up++;
      if (same.length >= 3 && up / (same.length - 1) >= 0.6) return { kind: 'code', type: 'code', prefix: top, digits, sample };
    }
  }
  // nombre : tout est un nombre ; pas de zéro au début (007 serait perdu : c'est plutôt un code)
  if (share(vals, v => /^-?\d[\d ]*([.,]\d+)?$/.test(v) && !/^0\d/.test(v) && good('number')(v)) >= RATIO) return { kind: 'number', type: 'number', sample };
  // liste de choix : quelques mots courts qui reviennent
  if (vals.length >= 6) {
    const freq = new Map<string, { v: string; n: number }>();
    for (const v of vals) { const k = plain(v); const c = freq.get(k); if (c) c.n++; else freq.set(k, { v, n: 1 }); }
    const items = [...freq.values()].sort((a, b) => b.n - a.n);
    if (items.length >= 2 && items.length <= 8 && items.length * 2 <= vals.length && items.every(i => i.v.length <= 30 && !i.v.includes(','))) return { kind: 'list', type: 'list', options: items.map(i => i.v), sample: items.slice(0, 3).map(i => i.v) };
  }
  return null;
}

/** Applique la proposition : type + réglages (début et chiffres du code, choix de la liste) ; les valeurs sont mises dans la bonne forme, sans rien effacer. */
export function applyTypeHint(s: Sheet, colId: string, hint: TypeHint, now: string, lang: Lang = 'fr'): Retyped | null {
  let base: Sheet | null = s;
  if (hint.kind === 'list') base = updateColumn(s, colId, { options: hint.options || [] }, now);
  else if (hint.kind === 'code') base = updateColumn(s, colId, { prefix: hint.prefix, digits: hint.digits }, now);
  if (!base) return null;
  return retypeColumn(base, colId, hint.type, now, lang);
}

// ---- refus mémorisé (sur l'appareil, par tableau et par colonne) : on ne repropose pas ce qui a été refusé
const std = (): KeyValueStore | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const hintKey = (sheetId: string, colId: string, kind: HintKind): string => `df_sheet_hint_${sheetId}_${colId}_${kind}`;
export function isHintDismissed(sheetId: string, colId: string, kind: HintKind, st: KeyValueStore | null = std()): boolean { try { return st?.getItem(hintKey(sheetId, colId, kind)) === '1'; } catch { return false; } }
export function dismissHint(sheetId: string, colId: string, kind: HintKind, st: KeyValueStore | null = std()): void { try { st?.setItem(hintKey(sheetId, colId, kind), '1'); } catch { /* stockage refusé : la proposition pourra revenir */ } }

/** La première proposition non refusée du tableau (colonnes « texte » seulement, 40 colonnes au plus regardées). */
export function firstHint(s: Sheet, lang: Lang, st: KeyValueStore | null = std()): { colId: string; name: string; hint: TypeHint } | null {
  for (const c of activeColumns(s).filter(k => k.type === 'text').slice(0, 40)) {
    const h = suggestColumnType(s, c.id, lang);
    if (h && !isHintDismissed(s.id, c.id, h.kind, st)) return { colId: c.id, name: c.name, hint: h };
  }
  return null;
}
