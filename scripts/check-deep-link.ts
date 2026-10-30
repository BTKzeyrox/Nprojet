// Contrôle du lien exact des notifications externes (push) : adresse construite par le serveur = lue par l'appli. Sans réseau, sans écran.
// Lancer : npm run check:deep-link
import fs from 'node:fs';
import { transformSync } from 'esbuild';

const g: any = globalThis;
g.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
g.location = { search: '?diag=1&go=advances&nav=adv-x2&f=ends&sp=s2&sf=empty&pr=p9', pathname: '/', hash: '#a' };
g.history = { replaceState(_a: unknown, _b: string, url: string) { g.__url = url; } };

const D = await import('../src/utils/deepLink');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const m = /\/\/ ===== BEGIN DEEP_LINK[^\n]*\n([\s\S]*?)\/\/ ===== END DEEP_LINK =====/.exec(src);
ok(!!m, 'bloc « DEEP_LINK » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { deepLinkUrl };`)() as { deepLinkUrl: (l: any) => string };

const cases: [string, any][] = [
  ['page seule', { go: 'advances' }], ['page + élément', { go: 'advances', nav: 'adv-x2' }], ['mission', { go: 'grid', nav: 'mission-12' }],
  ['validations', { go: 'validations', filter: 'ends', nav: 'val-post-7' }], ['rapport', { go: 'stats', tab: 'report' }],
  ['stock', { go: 'storage', space: 's2', sfilter: 'empty', product: 'p9' }], ['messagerie (groupe)', { go: 'chat', thread: 'all' }], ['messagerie (discussion)', { go: 'chat', thread: 'u-12' }], ['discussion piégée', { go: 'chat', thread: 'a b' }], ['identifiant avec : et .', { go: 'health', nav: 'a:b.c-d_e' }],
  ['page fausse', { go: 'Pas Valable' }], ['page vide', { go: '' }], ['page absente', {}], ['null', null], ['page en majuscules', { go: 'ADMIN' }],
  ['valeur piégée', { go: 'advances', nav: 'x" onload="evil()' }], ['adresse externe', { go: 'advances', nav: '//evil.com/x' }], ['trop long', { go: 'advances', nav: 'a'.repeat(200) }],
  ['espaces', { go: 'advances', nav: 'a b' }], ['champ en trop', { go: 'advances', extra: 'x' }], ['nombre', { go: 'advances', nav: 5 }],
];
for (const [name, l] of cases) ok(D.deepLinkUrl(l) === srv.deepLinkUrl(l), `site = serveur : ${name}`);
ok(D.deepLinkUrl({ go: 'advances', nav: 'adv-x2' }) === '/?go=advances&nav=adv-x2', 'adresse : /?go=advances&nav=adv-x2');
ok(D.deepLinkUrl({ go: 'Pas Valable' }) === '/' && D.deepLinkUrl(null as any) === '/', 'page fausse : on retombe sur l\'accueil');
ok(!D.deepLinkUrl({ go: 'advances', nav: 'x" onload="evil()' }).includes('evil') && !D.deepLinkUrl({ go: 'advances', nav: '//evil.com/x' }).includes('evil'), 'valeurs piégées jetées');
for (const [name, l] of cases.filter(([, x]) => x && x.go && /^[a-z][a-z-]*$/.test(x.go))) {
  const back = D.parseDeepLink(D.deepLinkUrl(l).slice(1));
  ok(!!back && back.go === l.go && (back.nav ?? '') === (typeof l.nav === 'string' && /^[A-Za-z0-9_:.-]{1,80}$/.test(l.nav) ? l.nav : ''), `aller-retour : ${name}`);
}
ok(D.parseDeepLink('?foo=1') === null && D.parseDeepLink('') === null && D.parseDeepLink('?go=A B') === null, 'lecture : pas de lien = rien');
ok(D.parseDeepLinkUrl('/?go=chat&nav=x1')?.nav === 'x1' && D.parseDeepLinkUrl('/') === null, 'lecture d\'une adresse reçue du service worker');

// ---- Ouverture : lecture de l'adresse, retrait des paramètres, rôles ----
D.captureDeepLink();
ok(g.__url === '/?diag=1#a', 'ouverture : le lien est retiré de l\'adresse (les autres paramètres restent, un rechargement ne le rejoue pas)');
const taken = D.takeDeepLink();
ok(D.parseDeepLink('?go=chat&th=u-12')?.thread === 'u-12' && D.deepLinkUrl({ go: 'chat', thread: 'u-12' }) === '/?go=chat&th=u-12', 'messagerie : la discussion à ouvrir est lue et écrite (th)');
ok(!!taken && taken.go === 'advances' && taken.nav === 'adv-x2' && taken.filter === 'ends' && taken.space === 's2' && taken.sfilter === 'empty' && taken.product === 'p9', 'ouverture : tous les champs sont lus');
ok(D.takeDeepLink() === null, 'ouverture : le lien n\'est appliqué qu\'une fois');
ok(D.deepLinkAllowed('admin', 'storage') && D.deepLinkAllowed('admin', 'validations') && D.deepLinkAllowed('admin', 'advances'), 'rôles : le responsable ouvre les pages du menu');
ok(!D.deepLinkAllowed('employee', 'storage') && !D.deepLinkAllowed('employee', 'validations') && D.deepLinkAllowed('employee', 'active-post') && D.deepLinkAllowed('employee', 'grid'), 'rôles : l\'employé n\'ouvre que ses pages');
ok(!D.deepLinkAllowed('admin', 'inconnue'), 'rôles : une page inconnue n\'est jamais ouverte');
const calls: string[] = [];
D.applyDeepLink({ go: 'advances', nav: 'adv-x2', filter: 'ends' }, v => calls.push(v));
ok(calls.join() === 'advances', 'ouverture : la page est ouverte');

// ---- Branchements (lecture du code) ----
const sw = read('public/sw.js'), app = read('src/App.tsx');
ok(/postMessage\(\{ type: 'open-link', url: url \}\)/.test(sw) && /openWindow\(url\)/.test(sw), 'service worker : appli ouverte = message « open-link » ; sinon ouverture au bon endroit');
ok(/startsWith\('\/'\) && !d\.url\.startsWith\('\/\/'\)/.test(sw), 'service worker : une adresse externe (//…) est refusée');
ok(/captureDeepLink\(\);/.test(app) && /takeDeepLink\(\)/.test(app) && /type === 'open-link'/.test(app) && /deepLinkAllowed\(role, l\.go\)/.test(app), 'appli : lien lu à l\'ouverture, appliqué après connexion, et reçu du service worker');
ok(/url: link \? deepLinkUrl\(link\) : '\/'/.test(src), 'serveur : le push porte le lien exact');
ok((src.match(/\{ go: 'active-post' \}/g) || []).length === 2, 'serveur : mission validée / refusée → page de la mission');
ok(/\{ go: 'stats', tab: 'report' \}/.test(src), 'serveur : rapport → onglet Rapport');
ok(/\{ go: 'grid', nav: `mission-\$\{r\.post_number\}` \}/.test(src), 'serveur : rappel d\'échéance → la mission exacte (clignote 1,5 s)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
