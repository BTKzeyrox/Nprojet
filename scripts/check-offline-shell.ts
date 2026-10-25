// Contrôle de « l'appli s'ouvre sans réseau » (module 13, M13.4), sans réseau. Lancer : npm run check:offline-shell (construit le site d'abord).
// On fait tourner le VRAI public/sw.js dans un faux navigateur (faux cache, faux réseau que l'on coupe, rend lent ou en panne).
import fs from 'node:fs';
import vm from 'node:vm';
import { classify, pruneList, buildPrecache, NETWORK_ONLY } from '../src/utils/swRules';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const SW = fs.readFileSync('public/sw.js', 'utf8');
const ORIGIN = 'https://app.test';

// ---------- 1. les règles du site et celles du service worker sont les mêmes ----------
const block = /\/\/ ===== BEGIN SHELL RULES[^\n]*\n([\s\S]*?)\/\/ ===== END SHELL RULES =====/.exec(SW);
ok(!!block, 'bloc de règles trouvé dans sw.js');
const swr = new Function(`${block![1]}\nreturn { classify, pruneList, NETWORK_ONLY };`)() as { classify: typeof classify; pruneList: typeof pruneList; NETWORK_ONLY: string[] };
{
  ok(JSON.stringify(swr.NETWORK_ONLY) === JSON.stringify([...NETWORK_ONLY]), 'liste « jamais en cache » identique');
  const paths = ['/', '/index.html', '/secours.html', '/assets/a-1.js', '/assets/', '/assetsx/a.js', '/fonts/p.woff2', '/version.json', '/sw.js', '/sw-precache.json', '/version.json/x', '/manifest.webmanifest', '/x/y.html', '', '/ASSETS/a.js'];
  let same = 0, total = 0;
  for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'get'])
    for (const so of [true, false]) for (const p of paths) for (const mode of ['navigate', 'cors', 'no-cors', 'same-origin', '']) { total++; if (swr.classify(m, so, p, mode) === classify(m, so, p, mode)) same++; }
  ok(same === total && total > 800, `classement identique sur ${total} cas (site = service worker)`);
  const lists: [string[], string[], string[]][] = [[[], [], []], [['/a', '/b', '/c', '/__shell'], ['/a'], ['/b']], [['/x'], [], []], [['/a', '/a'], ['/a'], []], [['/__shell'], [], []]];
  ok(lists.every(([c, cu, p]) => JSON.stringify(swr.pruneList(c, cu, p)) === JSON.stringify(pruneList(c, cu, p))), 'nettoyage du cache identique');
}
// ---------- 2. règles de classement ----------
{
  const c = classify;
  ok(c('POST', true, '/', 'navigate') === 'network' && c('PUT', true, '/assets/a.js', 'cors') === 'network' && c('DELETE', true, '/x', 'cors') === 'network', 'POST, PUT, DELETE : jamais touchés');
  ok(c('GET', false, '/assets/a.js', 'cors') === 'network' && c('GET', false, '/', 'navigate') === 'network', 'autre site (données, photos) : jamais touché');
  ok(c('GET', true, '/version.json', 'cors') === 'network' && c('GET', true, '/sw.js', 'cors') === 'network' && c('GET', true, '/sw-precache.json', 'cors') === 'network', 'numéro de version, service worker, liste de fichiers : toujours le réseau');
  ok(c('GET', true, '/', 'navigate') === 'shell' && c('GET', true, '/?demo=admin', 'navigate') === 'shell' && c('GET', true, '/clients', 'navigate') === 'shell', 'page de l\'appli : « shell »');
  ok(c('GET', true, '/secours.html', 'navigate') === 'static' && c('GET', true, '/x/y.html', 'navigate') === 'static', 'la page de secours n\'est jamais remplacée par la page de l\'appli');
  ok(c('GET', true, '/assets/index-abc.js', 'cors') === 'asset' && c('GET', true, '/assets/x.css', 'no-cors') === 'asset', 'fichiers de /assets/ : cache d\'abord');
  ok(c('GET', true, '/fonts/p.woff2', 'cors') === 'static' && c('GET', true, '/icon-192.png', 'no-cors') === 'static' && c('GET', true, '/assetsx/a.js', 'cors') === 'static', 'polices, icônes : copie gardée puis renouvelée');
  ok(JSON.stringify(pruneList(['/a', '/b', '/c', '/__shell', '/d'], ['/a'], ['/b'])) === JSON.stringify(['/c', '/d']) && pruneList([], ['/a'], []).length === 0, 'nettoyage : on garde la version actuelle, la précédente et la page ; on retire le reste');
}
// ---------- 3. liste des fichiers à garder (construction du site) ----------
{
  const items = [
    { fileName: 'assets/index-1.js', type: 'chunk' as const, isEntry: true, imports: ['assets/vendor-1.js'], dynamicImports: ['assets/Page-1.js'], importedCss: ['assets/index-1.css'] },
    { fileName: 'assets/vendor-1.js', type: 'chunk' as const, imports: ['assets/rt-1.js'] },
    { fileName: 'assets/rt-1.js', type: 'chunk' as const, imports: ['assets/vendor-1.js'] }, // boucle d'imports
    { fileName: 'assets/Page-1.js', type: 'chunk' as const, imports: ['assets/vendor-1.js', 'assets/xlsx-1.js'], importedCss: ['assets/Page-1.css'] },
    { fileName: 'assets/xlsx-1.js', type: 'chunk' as const },
    { fileName: 'assets/index-1.css', type: 'asset' as const }, { fileName: 'assets/Page-1.css', type: 'asset' as const },
    { fileName: 'assets/font-1.woff2', type: 'asset' as const }, { fileName: 'assets/pic-1.png', type: 'asset' as const },
    { fileName: 'assets/index-1.js.map', type: 'asset' as const }, { fileName: 'index.html', type: 'asset' as const }, { fileName: 'version.json', type: 'asset' as const }, { fileName: 'sw-precache.json', type: 'asset' as const },
  ];
  const p = buildPrecache(items, ['/favicon.svg', 'icon-192.png', '/secours.html', '/sw.js', '/version.json'], 'abc1234');
  ok(p.v === 'abc1234' && p.core[0] === '/', 'liste : version notée, la page « / » en premier');
  ok(['/assets/index-1.js', '/assets/vendor-1.js', '/assets/rt-1.js', '/assets/index-1.css', '/assets/font-1.woff2', '/favicon.svg', '/icon-192.png', '/secours.html'].every(f => p.core.includes(f)), 'liste « d\'emblée » : code de départ, ce qu\'il charge, son style, polices, fichiers publics');
  ok(['/assets/Page-1.js', '/assets/xlsx-1.js', '/assets/Page-1.css', '/assets/pic-1.png'].every(f => p.lazy.includes(f)) && !p.core.includes('/assets/Page-1.js'), 'liste « en arrière-plan » : pages à la demande, exports, leur style, images');
  const all = [...p.core, ...p.lazy];
  ok(!all.some(f => /\.map$/.test(f)) && !all.includes('/index.html') && !all.includes('/version.json') && !all.includes('/sw.js') && !all.includes('/sw-precache.json'), 'jamais dans la liste : cartes de code, index.html, version.json, sw.js, la liste elle-même');
  ok(new Set(all).size === all.length && all.every(f => f.startsWith('/')), 'liste : aucun doublon, chemins commençant par « / »');
  ok(JSON.stringify(buildPrecache([...items].reverse(), ['/secours.html', '/favicon.svg', 'icon-192.png'], 'abc1234')) === JSON.stringify(buildPrecache(items, ['icon-192.png', '/favicon.svg', '/secours.html'], 'abc1234')), 'liste : même résultat quel que soit l\'ordre reçu');
  const empty = buildPrecache([], [], 'v');
  ok(JSON.stringify(empty) === JSON.stringify({ v: 'v', core: ['/'], lazy: [] }), 'rien à garder : seulement la page');
  ok(buildPrecache([{ fileName: 'assets/a.js', type: 'chunk', imports: ['assets/inconnu.js'] }], [], 'v').lazy.includes('/assets/a.js'), 'import vers un fichier inconnu : pas de plantage');
}

// ---------- 4. le vrai sw.js dans un faux navigateur ----------
type Handler = (e: any) => void;
function makeEnv(opts: { timeoutFires?: boolean } = {}) {
  const handlers: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const norm = (k: any) => { const u = typeof k === 'string' ? k : k.url; return u.startsWith('http') ? new URL(u).pathname : u; };
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        async match(k: any) { const r = m.get(norm(k)); return r ? r.clone() : undefined; },
        async put(k: any, r: Response) { m.set(norm(k), r); },
        async delete(k: any) { return m.delete(norm(k)); },
        async keys() { return [...m.keys()].map(p => ({ url: ORIGIN + p })); },
      };
    },
  };
  const net: { fn: (req: any) => Promise<Response>; calls: string[] } = { fn: async () => { throw new TypeError('offline'); }, calls: [] };
  const fetchFake = (req: any, init?: any) => { const url = typeof req === 'string' ? req : req.url; net.calls.push(new URL(url, ORIGIN).pathname + (init?.cache ? `#${init.cache}` : '')); return net.fn(typeof req === 'string' ? { url: new URL(req, ORIGIN).href, method: 'GET', mode: 'cors' } : req); };
  const shown: any[] = []; const opened: string[] = []; let skipped = 0, claimed = 0;
  const self = {
    location: { origin: ORIGIN }, navigator: { language: 'fr-FR' },
    addEventListener(t: string, h: Handler) { (handlers[t] ||= []).push(h); },
    skipWaiting() { skipped++; return Promise.resolve(); },
    clients: { claim() { claimed++; return Promise.resolve(); }, matchAll: async () => [], openWindow: async (u: string) => { opened.push(u); } },
    registration: { showNotification: async (t: string, o: any) => { shown.push({ t, o }); } },
  };
  const fakeSetTimeout = (fn: () => void, ms: number) => (opts.timeoutFires && ms === 4000 ? setTimeout(fn, 0) : setTimeout(fn, ms));
  const ctx: any = { self, caches, fetch: fetchFake, Response, Headers, URL, Promise, JSON, Array, Object, Error, TypeError, setTimeout: fakeSetTimeout, clearTimeout, console };
  vm.runInNewContext(SW, ctx);
  const fire = async (type: string, evt: any) => {
    const waits: Promise<any>[] = []; let resp: Promise<Response> | null = null;
    const e = { ...evt, waitUntil: (p: Promise<any>) => { waits.push(Promise.resolve(p)); }, respondWith: (p: Promise<Response>) => { resp = Promise.resolve(p); } };
    for (const h of handlers[type] || []) h(e);
    await Promise.all(waits);
    return { handled: resp !== null, response: resp ? await resp : null as Response | null };
  };
  const cacheOf = (name: string) => stores.get(name) || new Map<string, Response>();
  return { fire, net, cacheOf, shown, opened, counts: () => ({ skipped, claimed }), handlers };
}
const html = (body = '<!doctype html><div id="root"></div>', status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const asset = (body: string, status = 200) => { const r = new Response(body, { status, headers: { 'content-type': 'application/javascript' } }); Object.defineProperty(r, 'type', { value: 'basic' }); return r; };
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const nav = (path = '/') => ({ url: ORIGIN + path, method: 'GET', mode: 'navigate' });
const get = (path: string, mode = 'cors') => ({ url: ORIGIN + path, method: 'GET', mode });
const MANIFEST = { v: 'v1', core: ['/', '/assets/index-1.js', '/assets/index-1.css', '/fonts/p.woff2'], lazy: ['/assets/Page-1.js', '/assets/xlsx-1.js'] };
const online = (e: ReturnType<typeof makeEnv>, manifest: any = MANIFEST) => {
  e.net.fn = async (req: any) => {
    const p = new URL(req.url).pathname;
    if (p === '/sw-precache.json') return manifest ? json(manifest) : new Response('x', { status: 404 });
    if (p === '/' || p === '/index.html') return html();
    if (p.startsWith('/assets/') || p.startsWith('/fonts/')) return asset('body of ' + p);
    return new Response('nope', { status: 404 });
  };
};
const text = async (r: Response | null) => (r ? r.clone().text() : '');

{
  // --- installation ---
  const e = makeEnv(); online(e);
  const inst = await e.fire('install', {});
  const runtime = e.cacheOf('df-runtime');
  ok([...runtime.keys()].sort().join() === ['/__shell', '/assets/index-1.css', '/assets/index-1.js', '/fonts/p.woff2'].sort().join(), 'installation : la page et les fichiers « d\'emblée » sont gardés, pas ceux « en arrière-plan »');
  ok(e.counts().skipped === 1 && !inst.handled, 'installation : le nouveau service worker s\'active');
  ok(e.net.calls.includes('/sw-precache.json#no-store') && e.net.calls.includes('/#reload') && e.net.calls.includes('/assets/index-1.js#reload'), 'installation : liste lue sans cache, fichiers demandés « frais » au serveur');
  const meta = JSON.parse(await (await e.cacheOf('df-meta').get('/meta')!.clone().text()));
  ok(meta.v === 'v1' && meta.current.length === 6 && meta.previous.length === 0, 'installation : version et liste complète notées');
  const before = e.net.calls.length;
  await e.fire('install', {});
  ok(!e.net.calls.slice(before).some(c => c.startsWith('/assets/') || c.startsWith('/fonts/')), 'réinstallation : un fichier déjà gardé n\'est pas retéléchargé');
}
{
  // --- installation qui rate : ne casse jamais le service worker ---
  const e1 = makeEnv(); online(e1, null);
  await e1.fire('install', {});
  ok(e1.counts().skipped === 1 && e1.cacheOf('df-runtime').size === 0, 'liste introuvable (404) : le service worker s\'installe quand même, rien n\'est gardé');
  const e2 = makeEnv(); e2.net.fn = async () => { throw new TypeError('offline'); };
  await e2.fire('install', {});
  ok(e2.counts().skipped === 1, 'réseau coupé pendant l\'installation : le service worker s\'installe quand même');
  const e3 = makeEnv(); e3.net.fn = async (req: any) => { const p = new URL(req.url).pathname; if (p === '/sw-precache.json') return json(MANIFEST); if (p === '/assets/index-1.css') throw new TypeError('coupé'); return p === '/' ? html() : asset('b'); };
  await e3.fire('install', {});
  ok(e3.counts().skipped === 1 && e3.cacheOf('df-runtime').has('/assets/index-1.js') && !e3.cacheOf('df-runtime').has('/assets/index-1.css'), 'un fichier qui échoue n\'empêche pas les autres d\'être gardés');
  const e4 = makeEnv(); e4.net.fn = async (req: any) => (new URL(req.url).pathname === '/sw-precache.json' ? new Response('{pas du json', { status: 200 }) : html());
  await e4.fire('install', {});
  ok(e4.counts().skipped === 1, 'liste illisible : le service worker s\'installe quand même');
  const e5 = makeEnv(); e5.net.fn = async (req: any) => (new URL(req.url).pathname === '/sw-precache.json' ? json({ v: 'x', core: 'pas un tableau' }) : html());
  await e5.fire('install', {});
  ok(e5.counts().skipped === 1 && e5.cacheOf('df-runtime').size === 0, 'liste absurde : ignorée');
}
{
  // --- ouverture de la page ---
  const e = makeEnv(); online(e);
  await e.fire('install', {});
  let r = await e.fire('fetch', { request: nav('/') });
  ok(r.handled && r.response!.status === 200 && (await text(r.response)).includes('id="root"'), 'en ligne : la page vient du réseau');
  e.net.calls.length = 0;
  e.net.fn = async () => { throw new TypeError('offline'); };
  r = await e.fire('fetch', { request: nav('/?demo=admin') });
  ok(r.handled && (await text(r.response)).includes('id="root"'), 'HORS LIGNE : la dernière page gardée s\'ouvre (même avec ?demo=admin)');
  r = await e.fire('fetch', { request: nav('/clients') });
  ok((await text(r.response)).includes('id="root"'), 'hors ligne : n\'importe quelle adresse de l\'appli ouvre la page gardée');
  // la page est renouvelée à chaque visite en ligne
  online(e); e.net.fn = (f => async (req: any) => (new URL(req.url).pathname === '/' ? html('<!doctype html><div id="root">NOUVELLE VERSION</div>') : f(req)))(e.net.fn);
  await e.fire('fetch', { request: nav('/') });
  e.net.fn = async () => { throw new TypeError('offline'); };
  r = await e.fire('fetch', { request: nav('/') });
  ok((await text(r.response)).includes('NOUVELLE VERSION'), 'la page gardée est renouvelée à chaque visite en ligne');
  // serveur en panne
  e.net.fn = async () => html('<h1>boom</h1>', 503);
  r = await e.fire('fetch', { request: nav('/') });
  ok((await text(r.response)).includes('NOUVELLE VERSION'), 'serveur en panne (503) : la dernière page gardée plutôt qu\'une erreur');
  e.net.fn = async () => html('<h1>introuvable</h1>', 404);
  r = await e.fire('fetch', { request: nav('/zzz') });
  ok(r.response!.status === 404, 'erreur 404 : transmise telle quelle (ce n\'est pas une panne)');
  // une réponse qui n'est pas du HTML n'écrase jamais la page gardée
  e.net.fn = async () => new Response('{"x":1}', { status: 200, headers: { 'content-type': 'application/json' } });
  await e.fire('fetch', { request: nav('/') });
  ok((await text(e.cacheOf('df-runtime').get('/__shell') as Response)).includes('NOUVELLE VERSION'), 'une réponse qui n\'est pas une page n\'écrase jamais la page gardée');
}
{
  // --- lenteur (connexion qui rame) ---
  const e = makeEnv({ timeoutFires: true }); online(e);
  await e.fire('install', {});
  e.net.fn = () => new Promise<Response>(res => setTimeout(() => res(html('<div id="root">TROP TARD</div>')), 80));
  const r = await e.fire('fetch', { request: nav('/') });
  ok((await text(r.response)).includes('id="root"') && !(await text(r.response)).includes('TROP TARD'), 'connexion trop lente (4 s) : la page gardée s\'ouvre tout de suite');
}
{
  // --- jamais rien gardé : message clair ---
  const e = makeEnv(); e.net.fn = async () => { throw new TypeError('offline'); };
  const r = await e.fire('fetch', { request: nav('/') });
  const t = await text(r.response);
  ok(r.response!.status === 200 && t.includes('Pas de connexion') && t.includes('No connection') && t.includes('href="/"'), 'première ouverture sans réseau : message clair FR et EN avec « Réessayer »');
  ok(!/undefined|NaN|\[object/.test(t), 'le message hors ligne n\'a rien de cassé');
}
{
  // --- page de secours ---
  const e = makeEnv(); online(e, { v: 'v1', core: ['/', '/secours.html'], lazy: [] });
  e.net.fn = (f => async (req: any) => (new URL(req.url).pathname === '/secours.html' ? html('<h1>SECOURS</h1>') : f(req)))(e.net.fn);
  await e.fire('install', {});
  e.net.fn = async () => { throw new TypeError('offline'); };
  const r = await e.fire('fetch', { request: nav('/secours.html') });
  ok((await text(r.response)).includes('SECOURS') && !(await text(r.response)).includes('id="root"'), 'secours.html hors ligne : la page de secours, pas la page de l\'appli');
}
{
  // --- fichiers de l'appli ---
  const e = makeEnv(); online(e);
  await e.fire('install', {});
  e.net.calls.length = 0;
  let r = await e.fire('fetch', { request: get('/assets/index-1.js', 'no-cors') });
  ok((await text(r.response)) === 'body of /assets/index-1.js' && e.net.calls.length === 0, 'fichier de /assets/ déjà gardé : servi sans toucher au réseau (jamais revérifié)');
  r = await e.fire('fetch', { request: get('/assets/Page-1.js') });
  ok((await text(r.response)) === 'body of /assets/Page-1.js' && e.net.calls.length === 1 && e.cacheOf('df-runtime').has('/assets/Page-1.js'), 'fichier pas encore gardé : pris au réseau puis gardé');
  e.net.fn = async () => { throw new TypeError('offline'); };
  r = await e.fire('fetch', { request: get('/assets/Page-1.js') });
  ok((await text(r.response)) === 'body of /assets/Page-1.js', 'hors ligne : le fichier gardé est servi');
  r = await e.fire('fetch', { request: get('/assets/jamais-vu.js') });
  ok(r.handled && r.response!.type === 'error', 'hors ligne, fichier jamais gardé : erreur nette (l\'appli affichera son message de rechargement)');
  e.net.fn = async () => asset('erreur serveur', 500);
  r = await e.fire('fetch', { request: get('/assets/boom.js') });
  ok(!e.cacheOf('df-runtime').has('/assets/boom.js'), 'une réponse en erreur n\'est jamais gardée');
  const cross = new Response('x', { status: 200 }); Object.defineProperty(cross, 'type', { value: 'opaque' });
  e.net.fn = async () => cross;
  await e.fire('fetch', { request: get('/assets/opaque.js') });
  ok(!e.cacheOf('df-runtime').has('/assets/opaque.js'), 'une réponse venue d\'un autre site n\'est jamais gardée');
}
{
  // --- polices et icônes : copie gardée puis renouvelée derrière ---
  const e = makeEnv(); online(e);
  await e.fire('install', {});
  e.net.fn = async (req: any) => (new URL(req.url).pathname === '/fonts/p.woff2' ? asset('NOUVELLE POLICE') : html());
  e.net.calls.length = 0;
  let r = await e.fire('fetch', { request: get('/fonts/p.woff2') });
  ok((await text(r.response)) === 'body of /fonts/p.woff2', 'police : la copie gardée est servie tout de suite');
  await new Promise(res => setTimeout(res, 20));
  ok(e.net.calls.includes('/fonts/p.woff2') && (await text(e.cacheOf('df-runtime').get('/fonts/p.woff2') as Response)) === 'NOUVELLE POLICE', 'police : renouvelée derrière, pour la prochaine fois');
  e.net.fn = async () => { throw new TypeError('offline'); };
  r = await e.fire('fetch', { request: get('/fonts/p.woff2') });
  ok((await text(r.response)) === 'NOUVELLE POLICE', 'hors ligne : la police gardée est servie, sans erreur dans la console');
  r = await e.fire('fetch', { request: get('/inconnu.png') });
  ok(r.response!.type === 'error', 'fichier inconnu hors ligne : erreur nette');
}
{
  // --- ce qu'on ne touche jamais ---
  const e = makeEnv(); online(e);
  await e.fire('install', {});
  const skip = async (req: any) => !(await e.fire('fetch', { request: req })).handled;
  ok(await skip({ url: 'https://autre.site/data', method: 'GET', mode: 'cors' }) && await skip({ url: 'https://res.cloudinary.com/x.jpg', method: 'GET', mode: 'no-cors' }), 'données et photos d\'un autre site : le navigateur fait comme avant');
  ok(await skip({ url: ORIGIN + '/', method: 'POST', mode: 'cors' }) && await skip({ url: ORIGIN + '/assets/a.js', method: 'DELETE', mode: 'cors' }), 'POST, DELETE : pas touchés');
  for (const f of ['/version.json', '/sw.js', '/sw-precache.json']) ok(await skip(get(f)), `${f} : toujours le réseau`);
  e.net.fn = async (req: any) => (new URL(req.url).pathname === '/version.json' ? json({ v: 'nouvelle' }) : html());
  await e.fire('fetch', { request: get('/version.json') });
  ok(!e.cacheOf('df-runtime').has('/version.json') && ![...e.cacheOf('df-runtime').keys()].some(k => k.includes('version')), 'version.json n\'est jamais gardé (sinon plus de mise à jour du site)');
}
{
  // --- mise à jour : on garde la version précédente, on retire les plus anciennes ---
  const e = makeEnv();
  const v = (n: number, files: string[]) => ({ v: 'v' + n, core: ['/', ...files], lazy: [] });
  online(e, v(1, ['/assets/a1.js', '/assets/shared.js']));
  await e.fire('install', {}); await e.fire('activate', {});
  online(e, v(2, ['/assets/a2.js', '/assets/shared.js']));
  await e.fire('install', {}); await e.fire('activate', {});
  let keys = [...e.cacheOf('df-runtime').keys()].sort();
  ok(keys.join() === ['/__shell', '/assets/a1.js', '/assets/a2.js', '/assets/shared.js'].sort().join(), 'après une mise à jour : la version précédente reste (un onglet ouvert peut en avoir besoin)');
  online(e, v(3, ['/assets/a3.js', '/assets/shared.js']));
  await e.fire('install', {}); await e.fire('activate', {});
  keys = [...e.cacheOf('df-runtime').keys()].sort();
  ok(keys.join() === ['/__shell', '/assets/a2.js', '/assets/a3.js', '/assets/shared.js'].sort().join(), 'après la suivante : la plus ancienne (v1) est retirée, la page gardée aussi');
  const meta = JSON.parse(await e.cacheOf('df-meta').get('/meta')!.clone().text());
  ok(meta.v === 'v3' && meta.previous.includes('/assets/a2.js') && !meta.previous.includes('/assets/a1.js'), 'liste des versions : actuelle et précédente seulement');
  ok(e.counts().claimed === 3, 'chaque activation prend la main sur les pages ouvertes');
  const before = JSON.stringify([...e.cacheOf('df-runtime').keys()]);
  await e.fire('activate', {});
  ok(JSON.stringify([...e.cacheOf('df-runtime').keys()]) === before, 'activer deux fois ne supprime rien de plus');
  const e2 = makeEnv(); online(e2, v(1, ['/assets/a1.js']));
  await e2.fire('install', {});
  await e2.fire('activate', {});
  ok(e2.cacheOf('df-runtime').has('/assets/a1.js'), 'première activation : rien n\'est retiré à tort');
  const e3 = makeEnv(); await (await e3.cacheOf('df-runtime') as any); (await caches_put(e3, '/vieux.js'));
  async function caches_put(env: ReturnType<typeof makeEnv>, p: string) { env.cacheOf('df-runtime').set(p, new Response('x')); }
  await e3.fire('activate', {});
  ok(e3.counts().claimed === 1, 'activation sans aucune liste notée : pas de plantage');
}
{
  // --- garde le reste en arrière-plan quand la page le demande ---
  const e = makeEnv(); online(e);
  await e.fire('install', {});
  ok(!e.cacheOf('df-runtime').has('/assets/Page-1.js'), 'avant la demande : les pages « à la demande » ne sont pas gardées');
  await e.fire('message', { data: { type: 'PRECACHE' } });
  ok(e.cacheOf('df-runtime').has('/assets/Page-1.js') && e.cacheOf('df-runtime').has('/assets/xlsx-1.js'), 'sur demande de la page : le reste est gardé');
  const calls = e.net.calls.length;
  await e.fire('message', { data: { type: 'PRECACHE' } });
  ok(!e.net.calls.slice(calls).some(c => c.startsWith('/assets/') || c === '/#reload'), 'deuxième demande : rien n\'est retéléchargé');
  await e.fire('message', { data: { type: 'AUTRE' } }); await e.fire('message', {}); await e.fire('message', { data: null });
  ok(true, 'message inconnu ou vide : ignoré sans plantage');
  const e2 = makeEnv(); e2.net.fn = async () => { throw new TypeError('offline'); };
  await e2.fire('message', { data: { type: 'PRECACHE' } });
  ok(e2.cacheOf('df-runtime').size === 0, 'demande hors ligne : rien ne plante, rien n\'est gardé');
}
{
  // --- les notifications marchent toujours ---
  const e = makeEnv();
  await e.fire('push', { data: { json: () => ({ fr: { title: 'Titre', body: 'Corps' }, en: { title: 'Title', body: 'Body' }, tag: 't1', url: '/clients' }) } });
  ok(e.shown.length === 1 && e.shown[0].t === 'Titre' && e.shown[0].o.body === 'Corps' && e.shown[0].o.tag === 't1' && e.shown[0].o.data.url === '/clients' && e.shown[0].o.icon === '/icon-192.png', 'notification reçue et affichée comme avant');
  await e.fire('push', { data: { json: () => ({ fr: { title: 'X', body: 'Y' }, url: 'http://pirate.example' }) } });
  ok(e.shown[1].o.data.url === '/', 'adresse de notification venant d\'ailleurs : refusée (« / »)');
  await e.fire('push', { data: null });
  ok(e.shown.length === 3 && e.shown[2].t === 'Gestion Pro', 'notification vide : titre par défaut, sans plantage');
  let closed = 0;
  await e.fire('notificationclick', { notification: { close: () => { closed++; }, data: { url: '/clients' } } });
  ok(closed === 1 && e.opened.includes('/clients'), 'clic sur une notification : ouvre la bonne page');
}
// ---------- 5. le vrai site construit ----------
{
  if (!fs.existsSync('dist/sw-precache.json')) { ok(false, 'dist/sw-precache.json absent : lancer d\'abord la construction (npm run build)'); }
  else {
    const m = JSON.parse(fs.readFileSync('dist/sw-precache.json', 'utf8')) as { v: string; core: string[]; lazy: string[] };
    const ver = JSON.parse(fs.readFileSync('dist/version.json', 'utf8')) as { v: string };
    const all = [...m.core, ...m.lazy];
    const size = (l: string[]) => l.reduce((t, p) => t + (p === '/' || !fs.existsSync('dist' + p) ? 0 : fs.statSync('dist' + p).size), 0);
    ok(m.v === ver.v, `même numéro de version que version.json (${m.v})`);
    ok(all.every(p => p === '/' || fs.existsSync('dist' + p)), `les ${all.length} fichiers de la liste existent tous dans le site construit`);
    const assets = fs.readdirSync('dist/assets').map(f => '/assets/' + f);
    ok(assets.filter(f => !/\.map$/.test(f)).every(f => all.includes(f)), `aucun fichier de /assets/ oublié (${assets.length})`);
    const index = fs.readFileSync('dist/index.html', 'utf8');
    const used = [...index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(x => x[1]);
    ok(used.length >= 2 && used.every(f => m.core.includes(f)), 'tout ce que index.html charge est dans la liste « d\'emblée »');
    ok(['/', '/secours.html', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg'].every(f => m.core.includes(f)) && m.core.some(f => f.endsWith('.woff2')), 'polices, icônes, manifeste et page de secours sont dans la liste « d\'emblée »');
    ok(!all.includes('/sw.js') && !all.includes('/version.json') && !all.includes('/sw-precache.json') && !all.includes('/index.html'), 'sw.js, version.json, la liste et index.html ne sont pas gardés');
    const coreKb = Math.round(size(m.core) / 1024), lazyKb = Math.round(size(m.lazy) / 1024);
    ok(coreKb < 1500, `à télécharger d'emblée : ${m.core.length} fichiers, ${coreKb} Ko (limite 1 500 Ko)`);
    console.log(`      en arrière-plan : ${m.lazy.length} fichiers, ${lazyKb} Ko`);
    ok(new Set(all).size === all.length, 'aucun doublon dans la liste');
  }
  const registered = fs.readFileSync('src/utils/offlineShell.ts', 'utf8'), main = fs.readFileSync('src/main.tsx', 'utf8');
  ok(/installOfflineShell\(\)/.test(main) && /import\.meta\.env\.PROD/.test(registered) && /localhost/.test(registered), 'enregistrement : appelé au démarrage, seulement en production et jamais sur localhost');
  ok(/register\('\/sw\.js'\)/.test(registered) && /type: 'PRECACHE'/.test(registered), 'enregistrement : même /sw.js que les notifications, demande de garder le reste');
  ok(/saveData/.test(registered), 'enregistrement : économiseur de données respecté (rien de téléchargé en arrière-plan)');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
