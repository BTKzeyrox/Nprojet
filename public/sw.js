// Service worker de Gestion Pro : (1) reçoit les notifications (M6.4) ; (2) fait que l'appli S'OUVRE SANS RÉSEAU (module 13, M13.4).
// Règles de cache : voir src/utils/swRules.ts (copiées entre les repères ci-dessous, contrôlées par `npm run check:offline-shell`).
// Jamais mis en cache : /version.json (mise à jour du site), /sw.js, /sw-precache.json, tout autre site (données, photos), toute requête autre que GET.
// Mise à jour sûre : le nouveau service worker garde la version PRÉCÉDENTE en cache (un onglet resté ouvert peut en avoir besoin) et ne supprime que les plus anciennes.
var RUNTIME = 'df-runtime';
var META = 'df-meta';
var SHELL_KEY = '/__shell';
var SHELL_TIMEOUT_MS = 4000;

// ===== BEGIN SHELL RULES (copie de src/utils/swRules.ts) =====
var NETWORK_ONLY = ['/version.json', '/sw.js', '/sw-precache.json'];
function classify(method, sameOrigin, pathname, mode) {
  if (method !== 'GET' || !sameOrigin) return 'network';
  if (NETWORK_ONLY.indexOf(pathname) !== -1) return 'network';
  if (/\.html$/.test(pathname)) return 'static'; // la page de secours (secours.html) ne doit jamais être remplacée par la page de l'appli
  if (mode === 'navigate') return 'shell';
  if (pathname.indexOf('/assets/') === 0) return 'asset';
  return 'static';
}
function pruneList(cached, current, previous) {
  var keep = { '/__shell': true };
  for (var i = 0; i < current.length; i++) keep[current[i]] = true;
  for (var j = 0; j < previous.length; j++) keep[previous[j]] = true;
  var out = [];
  for (var k = 0; k < cached.length; k++) if (!keep[cached[k]]) out.push(cached[k]);
  return out;
}
// ===== END SHELL RULES =====

var OFFLINE_HTML = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne</title>' +
  '<style>body{margin:0;font-family:system-ui,sans-serif;background:#070b11;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}.c{max-width:420px;background:#0f1722;border:1px solid #334155;padding:22px}h1{font-size:19px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;line-height:1.5}a{display:block;margin-top:12px;padding:12px;text-align:center;background:#059669;color:#fff;font-weight:700;text-decoration:none}</style></head>' +
  '<body><div class="c"><h1>Pas de connexion</h1><p>Cette page n\u2019a pas encore \u00e9t\u00e9 gard\u00e9e sur cet appareil. Reconnecte-toi une premi\u00e8re fois pour pouvoir ensuite ouvrir l\u2019appli sans r\u00e9seau.</p>' +
  '<p>No connection. This page has not been saved on this device yet: connect once to open the app offline afterwards.</p><a href="/">R\u00e9essayer / Retry</a></div></body></html>';

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}
function htmlOk(res) { return res && res.ok && /text\/html/i.test(res.headers.get('content-type') || ''); }

function loadManifest() {
  return fetch('/sw-precache.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}
function readMeta() {
  return caches.open(META).then(function (c) { return c.match('/meta'); }).then(function (r) { return r ? r.json() : { v: '', current: [], previous: [] }; }).catch(function () { return { v: '', current: [], previous: [] }; });
}
function writeMeta(m) { return caches.open(META).then(function (c) { return c.put('/meta', new Response(JSON.stringify(m))); }); }

// Garde les fichiers de la liste qui ne sont pas déjà gardés (4 à la fois). Un fichier qui échoue n'empêche pas les autres.
function fetchInto(paths, cache) {
  var queue = paths.slice(), failed = 0;
  function worker() {
    if (!queue.length) return Promise.resolve();
    var p = queue.shift();
    var key = p === '/' ? SHELL_KEY : p;
    return cache.match(key).then(function (hit) {
      if (hit) return null;
      return fetch(p, { cache: 'reload' }).then(function (res) {
        if (res && res.ok && (p !== '/' || htmlOk(res))) return cache.put(key, res.clone());
        failed++; return null;
      }).catch(function () { failed++; });
    }).then(worker);
  }
  return Promise.all([worker(), worker(), worker(), worker()]).then(function () { return failed; });
}

// which : 'core' (à l'installation) ou 'all' (en arrière-plan, quand la page le demande)
function precache(which) {
  return loadManifest().then(function (m) {
    if (!m || !Array.isArray(m.core)) return -1;
    var lazy = Array.isArray(m.lazy) ? m.lazy : [];
    return readMeta().then(function (meta) {
      var all = m.core.concat(lazy);
      var next = meta.v === m.v ? meta : { v: m.v, current: all, previous: meta.current || [] };
      return writeMeta(next).then(function () { return caches.open(RUNTIME); }).then(function (cache) {
        return fetchInto(which === 'all' ? all : m.core, cache);
      });
    });
  }).catch(function () { return -1; });
}

self.addEventListener('install', function (e) {
  // Un échec de mise en cache n'empêche JAMAIS l'installation (les notifications marchent quand même) ; la page redemandera quand la connexion sera bonne.
  e.waitUntil(precache('core').then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(readMeta().then(function (meta) {
    return caches.open(RUNTIME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var cached = reqs.map(function (r) { return new URL(r.url).pathname; });
        var del = pruneList(cached, meta.current || [], meta.previous || []);
        return Promise.all(del.map(function (p) { return cache.delete(p); }));
      });
    });
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'PRECACHE') e.waitUntil(precache('all'));
});

function shell(req) {
  return caches.open(RUNTIME).then(function (cache) {
    function fallback() {
      return cache.match(SHELL_KEY).then(function (hit) {
        return hit || new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      });
    }
    return withTimeout(fetch(req), SHELL_TIMEOUT_MS).then(function (res) {
      if (htmlOk(res)) { cache.put(SHELL_KEY, res.clone()); return res; }
      if (res && res.status >= 500) return fallback(); // serveur en panne : la dernière page gardée vaut mieux qu'une erreur
      return res;
    }, fallback);
  });
}
function cacheFirst(req, url) {
  return caches.open(RUNTIME).then(function (cache) {
    return cache.match(url.pathname).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(url.pathname, res.clone());
        return res;
      });
    });
  });
}
function staleWhileRevalidate(req, url) {
  return caches.open(RUNTIME).then(function (cache) {
    return cache.match(url.pathname).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(url.pathname, res.clone());
        return res;
      });
      if (hit) { net.catch(function () {}); return hit; }
      return net;
    });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  var kind = classify(req.method, url.origin === self.location.origin, url.pathname, req.mode);
  if (kind === 'network') return; // le navigateur fait comme avant
  if (kind === 'shell') { e.respondWith(shell(req)); return; }
  e.respondWith((kind === 'asset' ? cacheFirst(req, url) : staleWhileRevalidate(req, url)).catch(function () { return Response.error(); }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const en = /^en/i.test((self.navigator && self.navigator.language) || '');
  const m = (en ? d.en : d.fr) || d.fr || d.en || { title: 'Gestion Pro', body: '' };
  e.waitUntil(self.registration.showNotification(String(m.title || 'Gestion Pro'), {
    body: String(m.body || ''),
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: typeof d.tag === 'string' ? d.tag : undefined,
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/' }, // lien exact : /?go=…
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    // Appli déjà ouverte : on lui dit où aller (sans recharger) puis on la montre ; sinon on l'ouvre directement au bon endroit
    for (const c of list) { if ('focus' in c) { try { c.postMessage({ type: 'open-link', url: url }); } catch (_) { /* ignore */ } return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
