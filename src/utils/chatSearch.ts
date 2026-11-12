// Recherche dans une conversation (2026-11-12) : par texte, par jour, ou les deux. Règle pure, utilisée par components/ChatSearch.tsx.
// Le jour peut être choisi (date cliquable dans le fil) ou tapé : « 12/11 », « 12/11/2026 », « 2026-11-12 ».
import type { ChatMessage } from '../types';

export const SEARCH_MAX = 100;
const norm = (v: unknown): string => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'");
const pad = (n: number) => String(n).padStart(2, '0');
const validDay = (y: number, m: number, d: number): string | null => {
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
/** Une date tapée → jour « AAAA-MM-JJ » (sans année : l'année en cours). Autre texte : null. */
export function parseDayQuery(q: string, yearNow: number): string | null {
  const s = String(q ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validDay(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?$/.exec(s);
  if (m) return validDay(m[3] ? +m[3] : yearNow, +m[2], +m[1]);
  return null;
}
export interface SearchHit { id: string; day: string; time: string; sender: string; text: string }
/** Messages (non supprimés) qui contiennent le texte et/ou sont du jour donné ; les plus récents d'abord ; au plus SEARCH_MAX. `day` prime sur une date tapée dans `query`. */
export function searchMessages(msgs: ChatMessage[], query: string, day: string | null, yearNow: number): { hits: SearchHit[]; total: number; day: string | null } {
  const typed = parseDayQuery(query, yearNow);
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : typed;
  const words = typed && !day ? '' : norm(query).trim();
  const out: SearchHit[] = [];
  for (const m of Array.isArray(msgs) ? msgs : []) {
    if (!m || m.deleted_at) continue;
    const ts = String(m.timestamp || '');
    if (d && ts.slice(0, 10) !== d) continue;
    const text = [m.message, m.attachment_name, m.poll?.question].filter(Boolean).join(' ');
    if (words && !norm(text + ' ' + (m.sender_name || '')).includes(words)) continue;
    if (!d && !words) continue; // rien demandé : rien à montrer
    out.push({ id: m.id, day: ts.slice(0, 10), time: ts.slice(11, 16), sender: String(m.sender_name || ''), text: String(m.message || m.attachment_name || m.poll?.question || '').slice(0, 140) });
  }
  out.sort((a, b) => (a.day + a.time < b.day + b.time ? 1 : a.day + a.time > b.day + b.time ? -1 : 0));
  return { hits: out.slice(0, SEARCH_MAX), total: out.length, day: d };
}

/** Le premier message (non supprimé) d'un jour : là où « Aller au jour » amène. null s'il n'y en a pas. */
export function firstOfDay(msgs: ChatMessage[], day: string | null): string | null {
  if (!day) return null;
  let best: ChatMessage | null = null;
  for (const m of Array.isArray(msgs) ? msgs : []) {
    if (!m || m.deleted_at || String(m.timestamp || '').slice(0, 10) !== day) continue;
    if (!best || String(m.timestamp) < String(best.timestamp)) best = m;
  }
  return best ? best.id : null;
}

/** Précédent (-1, plus ancien) / suivant (+1, plus récent) parmi `len` résultats rangés du plus ancien au plus récent : nouvel indice, ou null au bout de la liste (pas de retour au début). */
export function stepNav(i: number, len: number, dir: -1 | 1): number | null {
  if (!Number.isInteger(i) || !Number.isInteger(len) || len < 1 || i < 0 || i >= len) return null;
  const n = i + dir;
  return n >= 0 && n < len ? n : null;
}
