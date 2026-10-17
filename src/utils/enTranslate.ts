import dict from './enDict.json';

// Traduction automatique de l'interface en anglais (français → English).
// Le texte français reste la source ; ce module remplace les textes affichés quand la langue est « English ».

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthNum = (m: string) => MONTHS.indexOf(m.toLowerCase()) + 1;

const entries = Object.entries(dict as Record<string, string>);
const lookup = new Map<string, string>();
for (const [k, v] of entries) lookup.set(k.toLowerCase().replace(/\u2019/g, "'"), v);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keys = Array.from(lookup.keys()).sort((a, b) => b.length - a.length);
// Sans lookbehind (non supporté par les anciens iPhone / Android) : le séparateur avant est capturé puis remis
const PHRASES = new RegExp(`(^|[^\\p{L}\\p{N}])(${keys.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const MONTH_RE = MONTHS.join('|');

export function translateText(input: string): string {
  if (!/[A-Za-zÀ-ÿ]/.test(input)) return input;
  const lead = input.match(/^\s*/)?.[0] ?? '';
  const trail = input.match(/\s*$/)?.[0] ?? '';
  let s = input.trim().replace(/\u2019/g, "'");

  const exact = lookup.get(s.toLowerCase());
  if (exact !== undefined) return lead + exact + trail;

  // dates : « 4 octobre 2026 » → 4 October 2026
  s = s.replace(new RegExp(`(\\d{1,2})\\s+(${MONTH_RE})\\s+(\\d{4})`, 'gi'), (_m, d, mo, y) => `${d} ${EN_MONTHS[monthNum(mo) - 1]} ${y}`);
  s = s.replace(new RegExp(`(${MONTH_RE})\\s+(\\d{4})`, 'gi'), (_m, mo, y) => `${EN_MONTHS[monthNum(mo) - 1]} ${y}`);
  // compteurs
  s = s.replace(/(\d+)\s+postes?\b/gi, (_m, n) => `${n} mission${Number(n) > 1 ? 's' : ''}`);
  s = s.replace(/(\d+)\s+membres\b/gi, '$1 members');
  s = s.replace(PHRASES, (_m, pre: string, w: string) => pre + (lookup.get(w.toLowerCase().replace(/\u2019/g, "'")) ?? w));
  return lead + s + trail;
}

// ---------- Application dans la page ----------
const orig = new WeakMap<Node, string>();
const done = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const doneAttr = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

let observer: MutationObserver | null = null;

function doText(n: Text) {
  const v = n.nodeValue || '';
  if (done.get(n) === v) return;
  const t = translateText(v);
  orig.set(n, v);
  if (t !== v) {
    done.set(n, t);
    n.nodeValue = t;
  } else {
    done.delete(n);
  }
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v === null) continue;
    if (doneAttr.get(el)?.[a] === v) continue;
    const t = translateText(v);
    const o = origAttr.get(el) || {};
    o[a] = v;
    origAttr.set(el, o);
    if (t !== v) {
      const d = doneAttr.get(el) || {};
      d[a] = t;
      doneAttr.set(el, d);
      el.setAttribute(a, t);
    }
  }
}

function walk(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return doText(node as Text);
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (SKIP.has(el.tagName) || el.closest('[data-notranslate]')) return;
  doAttrs(el);
  el.childNodes.forEach(walk);
}

function restore(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const n = node as Text;
    const d = done.get(n);
    if (d !== undefined && n.nodeValue === d && orig.has(n)) n.nodeValue = orig.get(n) as string;
    done.delete(n);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const d = doneAttr.get(el);
  const o = origAttr.get(el);
  if (d && o) for (const a of Object.keys(d)) if (el.getAttribute(a) === d[a]) el.setAttribute(a, o[a]);
  doneAttr.delete(el);
  el.childNodes.forEach(restore);
}

export function setEnglishMode(on: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = on ? 'en' : 'fr';
  if (on) {
    if (observer) return;
    walk(document.body);
    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  } else {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    restore(document.body);
  }
}
