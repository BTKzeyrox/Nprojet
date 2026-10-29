// Lien exact d'une notification externe (push) : le clic ouvre la bonne page, au bon élément, avec le même clignotement de 1,5 s que la cloche.
// Format : /?go=<page>&tab=…&f=<filtre Validations>&nav=<élément>&sp=<stockage>&sf=<filtre Stock>&pr=<produit>
// Le serveur (bloc DEEP_LINK de df-api) construit les mêmes adresses ; `check:deep-link` compare les deux.
import { setNavTarget } from './navTarget';
import { setValFilterIntent, type ValFilter } from './navIntent';
import { setStorageIntent, type StorageFilter } from './storageNav';
import { setStatsTab, type StatsTab } from './statsNav';
import { isKnownView } from './health/menu';

export interface DeepLink { go: string; tab?: string; filter?: string; nav?: string; space?: string; sfilter?: string; product?: string }
const RE_VIEW = /^[a-z][a-z-]{0,29}$/;
const RE_ID = /^[A-Za-z0-9_:.-]{1,80}$/;
const FIELDS: [keyof DeepLink, string][] = [['go', 'go'], ['tab', 'tab'], ['filter', 'f'], ['nav', 'nav'], ['space', 'sp'], ['sfilter', 'sf'], ['product', 'pr']];

/** Ne garde que des valeurs sûres (pages et identifiants simples). Pas de page = pas de lien. */
export function cleanDeepLink(x: Partial<DeepLink> | null | undefined): DeepLink | null {
  if (!x || typeof x.go !== 'string' || !RE_VIEW.test(x.go)) return null;
  const out: DeepLink = { go: x.go };
  for (const k of ['tab', 'filter', 'nav', 'space', 'sfilter', 'product'] as const) { const v = x[k]; if (typeof v === 'string' && RE_ID.test(v)) out[k] = v; }
  return out;
}
export function deepLinkUrl(link: DeepLink): string {
  const c = cleanDeepLink(link);
  if (!c) return '/';
  const p = new URLSearchParams();
  for (const [k, q] of FIELDS) { const v = c[k]; if (v) p.set(q, v); }
  return `/?${p.toString()}`;
}
export function parseDeepLink(search: string): DeepLink | null {
  const p = new URLSearchParams(search);
  const o: Partial<DeepLink> = {};
  for (const [k, q] of FIELDS) { const v = p.get(q); if (v) o[k] = v; }
  return cleanDeepLink(o);
}

// Pages que tout le monde peut ouvrir ; le responsable peut ouvrir toutes les pages du menu. Le serveur contrôle de toute façon chaque accès.
const BASIC_VIEWS = ['feed', 'grid', 'active-post', 'advances', 'chat', 'calendar'];
export const deepLinkAllowed = (role: string, go: string): boolean => BASIC_VIEWS.includes(go) || (role === 'admin' && isKnownView(go));

let pending: DeepLink | null = null;
/** À l'ouverture de l'appli : lit le lien exact de l'adresse, le garde pour après la connexion, puis le retire de l'adresse (un rechargement ne le rejoue pas). */
export function captureDeepLink(): void {
  if (typeof location === 'undefined') return;
  const link = parseDeepLink(location.search);
  if (!link) return;
  pending = link;
  try {
    const p = new URLSearchParams(location.search);
    for (const [, q] of FIELDS) p.delete(q);
    const rest = p.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  } catch { /* adresse non modifiable : sans importance */ }
}
export const takeDeepLink = (): DeepLink | null => { const l = pending; pending = null; return l; };

/** Ouvre le lien : prépare le filtre, le stockage, l'élément à faire clignoter, puis change de page. */
export function applyDeepLink(link: DeepLink, navigate: (view: string) => void): void {
  if (link.go === 'stats' && link.tab) setStatsTab(link.tab as StatsTab);
  if (link.filter) setValFilterIntent(link.filter as ValFilter);
  if (link.go === 'storage' && (link.space || link.sfilter || link.product)) setStorageIntent({ space: link.space, filter: link.sfilter as StorageFilter | undefined, product: link.product });
  if (link.nav) setNavTarget(link.nav);
  navigate(link.go);
}
/** Lien reçu du service worker (appli déjà ouverte) : une adresse « /?go=… ». */
export const parseDeepLinkUrl = (url: string): DeepLink | null => { const i = url.indexOf('?'); return i < 0 ? null : parseDeepLink(url.slice(i)); };
