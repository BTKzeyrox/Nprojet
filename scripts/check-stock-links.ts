// Contrôle des liens exacts du Stockage (alertes, Santé du site, cloche) et du clignotement de 1,5 s. Sans réseau, sans écran.
// Lancer : npm run check:stock-links
import fs from 'node:fs';

const g: any = globalThis;
const bus = new EventTarget();
g.window = { dispatchEvent: (e: Event) => bus.dispatchEvent(e), addEventListener: (n: string, f: any) => bus.addEventListener(n, f), removeEventListener: (n: string, f: any) => bus.removeEventListener(n, f) };

const { computeAlerts } = await import('../src/utils/alerts');
const { STOCK_RULES } = await import('../src/utils/health/rules/stock');
const { planHealthNotifs } = await import('../src/utils/healthNotif');
const N = await import('../src/utils/storageNav');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const P = (id: string, name: string, storage: string | undefined, thr = 3): any => ({ id, name, category: '', unit: 'u', buy_price_ar: 100, sell_price_ar: 0, alert_threshold: thr, ...(storage ? { storage_id: storage } : {}) });
const M = (id: string, product_id: string, type: 'in' | 'out', qty: number): any => ({ id, product_id, type, qty, date: '2026-10-01' });
const products = [P('a', 'Papier', undefined), P('b', 'Encre', 's2'), P('c', 'Colle', 's2'), P('d', 'Agrafes', 's2', 0)];
const moves = [M('1', 'a', 'in', 10), M('2', 'a', 'out', 8), M('3', 'b', 'in', 5), M('4', 'b', 'out', 5), M('5', 'c', 'in', 6), M('6', 'c', 'out', 4), M('7', 'd', 'in', 3)];
const spaces = [{ id: 'main', name: 'Stockage 1' }, { id: 's2', name: 'Dépôt' }];

// ---- 1) Alertes de l'accueil : une par stockage, avec le lien exact ----
const base: any = { today: '2026-10-29', settings: {}, cash: [], posts: [], contracts: [], advances: [], products, moves };
const one = computeAlerts({ ...base, products: products.filter(p => !p.storage_id), moves: moves.filter(m => m.product_id === 'a') }).filter(a => a.id.startsWith('stock-low'));
ok(one.length === 1 && one[0].id === 'stock-low' && one[0].fr === 'Stock bas : 1 produit (Papier).', 'un seul stockage : l\'alerte garde son identifiant et son texte');
ok(one[0].storage?.space === 'main' && one[0].storage?.filter === 'low' && one[0].storage?.product === 'a', 'un seul stockage : le lien mène au produit exact');
const two = computeAlerts({ ...base, spaces }).filter(a => a.id.startsWith('stock-low'));
ok(two.length === 2 && two.map(a => a.id).sort().join() === 'stock-low-main,stock-low-s2', 'deux stockages : une alerte par stockage');
const s2 = two.find(a => a.id === 'stock-low-s2')!;
ok(s2.fr.startsWith('Dépôt : stock bas : 2 produits (') && s2.en.startsWith('Depot') === false && s2.en.startsWith('Dépôt: low stock: 2 products ('), 'le texte nomme le stockage (FR et EN)');
ok(s2.storage?.space === 's2' && s2.storage?.filter === 'empty' && s2.storage?.product === 'b' && s2.level === 'danger', 'le lien ouvre le bon stockage, le filtre « épuisés » et le produit épuisé');
ok(!s2.fr.includes('Papier') && !two.find(a => a.id === 'stock-low-main')!.fr.includes('Encre'), 'les stockages ne se mélangent pas dans les alertes');
ok(s2.go === 'storage', 'l\'alerte ouvre la page Stockage');

// ---- 2) Santé du site : une alerte par stockage, lien exact ----
const ctx: any = { today: '2026-10-29', now: Date.parse('2026-10-29T08:00:00Z'), products, moves, cash: [], thresholds: { dormant_days: 60 }, spaces };
const runAll = (c: any) => STOCK_RULES.flatMap(r => r.run(c));
const hs = runAll(ctx);
const e2 = hs.find(a => a.id === 'stock:empty:s2');
ok(!!e2 && e2.title_fr.startsWith('Dépôt : ') && e2.go.view === 'storage' && e2.go.storage?.space === 's2' && e2.go.storage?.filter === 'empty' && e2.go.storage?.product === 'b', 'Santé : rupture du Dépôt = bon stockage, filtre épuisés, produit exact');
const l2 = hs.find(a => a.id === 'stock:low:s2');
ok(!!l2 && l2.go.storage?.filter === 'low' && l2.go.storage?.product === 'c', 'Santé : stock bas du Dépôt = filtre « bas », produit le plus bas');
ok(!hs.some(a => a.id === 'stock:empty') && !hs.some(a => a.id === 'stock:empty:main'), 'Santé : rien en rupture dans Stockage 1 (pas de mélange)');
const l1 = hs.find(a => a.id === 'stock:low:main');
ok(!!l1 && l1.go.storage?.space === 'main' && l1.go.storage?.product === 'a', 'Santé : stock bas de Stockage 1 = son propre produit');
const solo = runAll({ ...ctx, products: products.filter(p => !p.storage_id), moves: moves.filter(m => m.product_id === 'a'), spaces: undefined });
ok(solo.some(a => a.id === 'stock:low') && solo.every(a => !/:main$/.test(a.id)), 'Santé : un seul stockage = identifiants d\'avant (les « Ignorer » déjà faits restent valables)');

// ---- 3) Cloche : une alerte urgente du Stockage ouvre le stockage, les autres la Santé ----
const urgent = hs.filter(a => a.severity === 'urgent');
const notifs = planHealthNotifs([...urgent, { id: 'x', severity: 'urgent', title_fr: 'Autre', go: { view: 'clients' } } as any], '2026-10-29', Date.parse('2026-10-29T05:00:00Z'), []);
const ne = notifs.find(x => x.id === 'health-stock:empty:s2');
ok(!!ne && ne.view === 'storage' && ne.storage?.space === 's2' && ne.storage?.product === 'b', 'cloche : la rupture du Dépôt ouvre le Stockage au bon produit');
ok(notifs.find(x => x.id === 'health-x')!.view === 'health', 'cloche : les autres alertes ouvrent toujours la Santé du site');

// ---- 4) La demande de lien : lue une seule fois, signalée à la page déjà ouverte ----
let heard = 0; bus.addEventListener(N.STORAGE_INTENT_EVENT, () => { heard++; });
N.setStorageIntent({ space: 's2', filter: 'empty', product: 'b' });
ok(heard === 1, 'demande de lien : la page déjà ouverte est prévenue');
ok(JSON.stringify(N.takeStorageIntent()) === JSON.stringify({ space: 's2', filter: 'empty', product: 'b' }) && N.takeStorageIntent() === null, 'demande de lien : lue une seule fois');
ok(N.productNavId('p1') === 'stock-p-p1' && N.STORAGE_FLASH_MS === 1500, 'adresse du produit et durée du clignotement : 1,5 s');

// ---- 5) Branchements (lecture du code) ----
const stockTab = read('src/views/admin/StockTab.tsx'), nav = read('src/utils/navTarget.ts'), css = read('src/index.css'), page = read('src/views/admin/StoragePage.tsx');
ok(/data-nav=\{productNavId\(p\.id\)\} data-nav-flash=\{STORAGE_FLASH_MS\}/.test(stockTab), 'chaque produit de la liste a son adresse et demande le clignotement court');
ok(/data-nav-flash/.test(nav) && /nav-flash-short/.test(nav), 'le clignotement lit la durée demandée par l\'élément');
ok(/\.nav-flash-short \{\s*animation: navflashshort 1\.5s/.test(css) && /prefers-reduced-motion: reduce\) \{\s*[^}]*\.nav-flash-short \{ animation: none; box-shadow/.test(css), 'animation de 1,5 s ; « réduire les animations » = contour fixe, sans mouvement');
ok(/takeStorageIntent\(\)/.test(page) && /STORAGE_INTENT_EVENT/.test(page) && /setNavTarget\(productNavId\(i\.product\)\)/.test(page), 'la page Stockage lit la demande (à l\'ouverture et si déjà ouverte) puis fait clignoter le produit');
for (const f of ['src/components/TopBar.tsx', 'src/views/admin/AdminDashboard.tsx', 'src/views/admin/StatsPage.tsx', 'src/views/admin/HealthPage.tsx', 'src/components/AssistantChat.tsx']) ok(/setStorageIntent\(/.test(read(f)), `${f.split('/').pop()} : transmet le lien exact`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
