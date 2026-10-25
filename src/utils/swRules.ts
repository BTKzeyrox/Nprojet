// Règles du service worker « l'appli s'ouvre sans réseau » (module 13, M13.4). Pures, sans navigateur.
// `classify` et `pruneList` sont COPIÉS dans public/sw.js (entre les repères BEGIN/END) : `npm run check:offline-shell` prouve qu'ils donnent
// les mêmes résultats. `buildPrecache` est utilisé à la construction du site (vite.config.ts) pour écrire /sw-precache.json.

/** Fichiers qu'on ne garde JAMAIS en cache : le numéro de version (sinon plus de mise à jour), le service worker lui-même, la liste de fichiers. */
export const NETWORK_ONLY = ['/version.json', '/sw.js', '/sw-precache.json'] as const;

export type Strategy = 'network' | 'shell' | 'asset' | 'static';

/**
 *  • 'network' : on ne s'en mêle pas (toute requête autre que GET, tout autre site : serveur de données, photos, etc., et les 3 fichiers ci-dessus) ;
 *  • 'shell'   : la page de l'appli (navigation, sauf un fichier .html comme secours.html) : le réseau d'abord (4 s), sinon la dernière page gardée ;
 *  • 'asset'   : un fichier de /assets/ (nom unique par version) : le cache d'abord, jamais revérifié ;
 *  • 'static'  : les autres fichiers du site (polices, icônes…) : on sert la copie gardée et on la renouvelle derrière.
 */
export function classify(method: string, sameOrigin: boolean, pathname: string, mode: string): Strategy {
  if (method !== 'GET' || !sameOrigin) return 'network';
  if ((NETWORK_ONLY as readonly string[]).indexOf(pathname) !== -1) return 'network';
  if (/\.html$/.test(pathname)) return 'static'; // la page de secours (secours.html) ne doit jamais être remplacée par la page de l'appli
  if (mode === 'navigate') return 'shell';
  if (pathname.indexOf('/assets/') === 0) return 'asset';
  return 'static';
}

/** Chemins à retirer du cache : tout ce qui n'est ni dans la version actuelle, ni dans la précédente (un onglet resté ouvert peut encore en avoir besoin), ni la page. */
export function pruneList(cached: string[], current: string[], previous: string[]): string[] {
  const keep: Record<string, boolean> = { '/__shell': true };
  for (let i = 0; i < current.length; i++) keep[current[i]] = true;
  for (let i = 0; i < previous.length; i++) keep[previous[i]] = true;
  const out: string[] = [];
  for (let i = 0; i < cached.length; i++) if (!keep[cached[i]]) out.push(cached[i]);
  return out;
}

export interface BundleItem { fileName: string; type: 'chunk' | 'asset'; isEntry?: boolean; imports?: string[]; dynamicImports?: string[]; importedCss?: string[] }
export interface Precache { v: string; core: string[]; lazy: string[] }
const FONT = /\.(woff2?|ttf|otf)$/i;

/**
 * Liste des fichiers à garder pour ouvrir l'appli sans réseau.
 *  • core : la page (« / »), le code de départ et tout ce qu'il charge d'emblée, son style, les polices, les fichiers publics (icônes, manifeste, page de secours) ;
 *  • lazy : tout le reste (pages chargées à la demande, exports Excel/PDF…), gardé en arrière-plan quand la connexion est bonne.
 */
export function buildPrecache(items: BundleItem[], publicFiles: string[], version: string): Precache {
  const by = new Map<string, BundleItem>();
  for (const it of items) by.set(it.fileName, it);
  const core = new Set<string>(['/']);
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return; // aussi protège des boucles d'imports
    seen.add(name);
    const it = by.get(name);
    if (!it) return;
    core.add('/' + name);
    for (const c of it.importedCss || []) core.add('/' + c);
    for (const i of it.imports || []) visit(i);
  };
  for (const it of items) if (it.type === 'chunk' && it.isEntry) visit(it.fileName);
  for (const p of publicFiles) core.add(p.startsWith('/') ? p : '/' + p);
  const skip = (n: string) => n === 'index.html' || n === 'version.json' || n === 'sw-precache.json' || n === 'sw.js' || /\.map$/i.test(n);
  const lazy = new Set<string>();
  for (const it of items) {
    if (skip(it.fileName)) continue;
    const p = '/' + it.fileName;
    if (core.has(p)) continue;
    if (it.type === 'asset' && FONT.test(it.fileName)) core.add(p);
    else lazy.add(p);
  }
  for (const n of NETWORK_ONLY) { core.delete(n); lazy.delete(n); }
  core.delete('/index.html');
  const sorted = (s: Set<string>) => [...s].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
  return { v: version, core: sorted(core), lazy: sorted(lazy) };
}
