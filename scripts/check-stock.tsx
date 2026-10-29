// Contrôle du stock (S3), sans réseau : règles du serveur (extraites du vrai fichier df-api), calculs, store en démo, démo cohérente, rendu FR/EN.
// Lancer : npm run check:stock
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const S = await import('../src/utils/stock');
const { StockTab } = await import('../src/views/admin/StockTab');
const { StockAnalytics } = await import('../src/views/admin/StockAnalytics');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(join(process.cwd(), p), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const NOW = '2026-10-20T08:00:00.000Z';

// ---------- 1) Serveur : vraies fonctions extraites du fichier ----------
const mc = /\/\/ ===== BEGIN CASH[^\n]*\n([\s\S]*?)\/\/ ===== END CASH =====/.exec(src);
const ms = /\/\/ ===== BEGIN STOCK[^\n]*\n([\s\S]*?)\/\/ ===== END STOCK =====/.exec(src);
ok(!!mc && !!ms, 'blocs « CASH » et « STOCK » trouvés dans le serveur');
const lists = new Function(`${transformSync(mc![1], { loader: 'ts' }).code}\nreturn { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE };`)() as { ADMIN_ONLY_READ: string[]; ADMIN_ONLY_WRITE: string[] };
const srv = new Function(`${transformSync(ms![1], { loader: 'ts' }).code}\nreturn { cleanProduct, cleanStockMove };`)() as { cleanProduct: (r: any, e: any, me: string, now: string) => any; cleanStockMove: (r: any, e: any, me: string, now: string) => any };
ok(['products', 'stock', 'cash'].every(c => lists.ADMIN_ONLY_READ.includes(c) && lists.ADMIN_ONLY_WRITE.includes(c)), 'lecture ET écriture de products, stock et cash réservées à l\'admin');

const gp = { id: 'p1', name: 'Papier A4', category: 'Bureau', unit: 'ramette', buy_price_ar: 12000, sell_price_ar: 15000, alert_threshold: 10 };
const p1 = srv.cleanProduct(gp, undefined, 'admin-1', NOW);
ok(p1.ok && p1.save.created_by === 'admin-1' && p1.save.created_at === NOW && p1.save.buy_price_ar === 12000, 'produit valide accepté, créateur et date posés par le serveur');
const p2 = srv.cleanProduct({ ...gp, buy_price_ar: 99.6, name: 'Autre' }, { created_by: 'admin-0', created_at: '2026-01-01T00:00:00.000Z' }, 'admin-1', NOW);
ok(p2.ok && p2.save.created_by === 'admin-0' && p2.save.created_at === '2026-01-01T00:00:00.000Z' && p2.save.buy_price_ar === 100, 'modification : créateur conservé, prix arrondi');
ok(srv.cleanProduct({ id: 'p', name: 'X' }, undefined, 'a', NOW).save.unit === 'unité' && srv.cleanProduct({ id: 'p', name: 'X' }, undefined, 'a', NOW).save.buy_price_ar === 0, 'prix vides = 0, unité par défaut');
const badP = (patch: any, reason: string, name: string) => { const r = srv.cleanProduct({ ...gp, ...patch }, undefined, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
badP({ name: '   ' }, 'name', 'produit sans nom refusé');
badP({ buy_price_ar: -1 }, 'buy', 'prix d\'achat négatif refusé');
badP({ buy_price_ar: 'abc' }, 'buy', 'prix d\'achat texte refusé');
badP({ sell_price_ar: 1e13 }, 'sell', 'prix de vente démesuré refusé');
badP({ alert_threshold: -2 }, 'threshold', 'seuil négatif refusé');
ok(!srv.cleanProduct(null, undefined, 'a', NOW).ok, 'produit vide (null) refusé sans erreur');
const lp = srv.cleanProduct({ ...gp, name: 'n'.repeat(200), category: 'c'.repeat(90), unit: 'u'.repeat(50) }, undefined, 'a', NOW).save;
ok(lp.name.length === 80 && lp.category.length === 40 && lp.unit.length === 16, 'textes trop longs coupés (nom 80, catégorie 40, unité 16)');
ok(!('password_hash' in srv.cleanProduct({ ...gp, password_hash: 'x' }, undefined, 'a', NOW).save), 'produit : champs inconnus non copiés');

const gm = { id: 'm1', product_id: 'p1', type: 'in', qty: 10, date: '2026-10-19', note: 'Achat', unit_cost_ar: 11000 };
const m1 = srv.cleanStockMove(gm, undefined, 'admin-1', NOW);
ok(m1.ok && m1.save.qty === 10 && m1.save.unit_cost_ar === 11000 && m1.save.created_by === 'admin-1', 'entrée valide acceptée');
ok(srv.cleanStockMove({ ...gm, type: 'out', unit_cost_ar: 5, cash_id: 'cash-9' }, undefined, 'a', NOW).save.unit_cost_ar === undefined, 'le prix payé n\'est gardé que pour une entrée');
ok(srv.cleanStockMove({ ...gm, cash_id: 'cash-9' }, undefined, 'a', NOW).save.cash_id === 'cash-9', 'lien avec la dépense gardé');
ok(srv.cleanStockMove({ ...gm, type: 'adjust', qty: -3 }, undefined, 'a', NOW).ok, 'ajustement négatif accepté');
const badM = (patch: any, reason: string, name: string) => { const r = srv.cleanStockMove({ ...gm, ...patch }, undefined, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
badM({ type: 'transfer' }, 'type', 'type inconnu refusé');
badM({ product_id: '' }, 'product', 'mouvement sans produit refusé');
badM({ qty: 0 }, 'qty', 'quantité 0 refusée');
badM({ type: 'adjust', qty: 0 }, 'qty', 'ajustement de 0 refusé');
badM({ qty: -4 }, 'qty', 'entrée négative refusée');
badM({ type: 'out', qty: -4 }, 'qty', 'sortie négative refusée');
badM({ qty: 'abc' }, 'qty', 'quantité texte refusée');
badM({ qty: 1e10 }, 'qty', 'quantité démesurée refusée');
badM({ date: '2026-02-31' }, 'date', 'date inexistante refusée');
badM({ unit_cost_ar: -5 }, 'cost', 'prix payé négatif refusé');
ok(srv.cleanStockMove({ ...gm, qty: 1.256 }, undefined, 'a', NOW).save.qty === 1.26, 'quantité arrondie à 2 décimales');
ok(!srv.cleanStockMove(null, undefined, 'a', NOW).ok, 'mouvement vide (null) refusé sans erreur');

// ---------- 2) Serveur : les protections sont branchées (lecture du code) ----------
const syncFn = /async function sync\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(/products: "df_products"/.test(src) && /stock: "df_stock_moves"/.test(src), 'collections products et stock déclarées');
ok(syncFn.indexOf("col === 'products'") > 0 && syncFn.includes('cleanProduct(') && syncFn.includes("col === 'stock'") && syncFn.includes('cleanStockMove('), 'sync : chaque produit et mouvement de l\'admin passe par son nettoyage');
ok(/from\(T\.products\)\.select\('id'\)\.eq\('id', v\.save\.product_id\)/.test(syncFn), 'sync : un mouvement d\'un produit qui n\'existe pas est refusé');
ok(/if \(col === 'products'\) await sb\.from\(T\.stock\)\.delete\(\)\.eq\('data->>product_id', id\)/.test(syncFn), 'sync : supprimer un produit supprime ses mouvements');
const gate = syncFn.indexOf('!admin && ADMIN_ONLY_WRITE.includes(col)');
ok(gate > 0 && gate < syncFn.indexOf('for (const rec of upserts)'), 'sync : refus d\'un employé AVANT toute autre règle');
ok((src.match(/df_products/g) || []).length === 1 && (src.match(/df_stock_moves/g) || []).length === 1, 'aucune autre route du serveur ne lit les tables de stock');
const mig = read('supabase/migrations/20261020_create_df_stock.sql');
ok(/df_products/.test(mig) && /df_stock_moves/.test(mig) && (mig.match(/enable row level security/g) || []).length === 2 && (mig.match(/revoke all on public\.df_\w+ from anon, authenticated/g) || []).length === 2, 'migration : 2 tables, RLS, aucun accès public');
ok(!/df_products|df_stock_moves/.test(read('supabase/functions/df-restore/index.ts')), 'df-restore : ne touche pas au stock (la remise à zéro le garde)');

// ---------- 3) Règles de calcul ----------
ok(S.checkProductDraft({ name: ' ' }).ok === false && (S.checkProductDraft({ name: ' ' }) as any).error === 'name', 'écran : nom vide refusé');
const cp = S.checkProductDraft({ name: 'Souris', buy_price: '12 000', sell_price: '18 000', alert_threshold: '3,5' });
ok(cp.ok && cp.clean.buy_price_ar === 12000 && cp.clean.alert_threshold === 3.5 && cp.clean.unit === 'unité', 'écran : prix avec espaces et seuil avec virgule compris');
ok((S.checkMoveDraft({ product_id: 'p', type: 'out', qty: -1, date: '2026-10-20' }) as any).error === 'qty' && (S.checkMoveDraft({ product_id: 'p', type: 'adjust', qty: '-2,5', date: '2026-10-20' }) as any).ok === true, 'écran : sortie négative refusée, ajustement négatif accepté');
ok((S.checkMoveDraft({ product_id: '', type: 'in', qty: 1, date: '2026-10-20' }) as any).error === 'product', 'écran : produit obligatoire');
const prods = [{ ...gp, id: 'a', name: 'A', alert_threshold: 5, buy_price_ar: 1000 }, { ...gp, id: 'b', name: 'B', alert_threshold: 0, buy_price_ar: 500 }] as any[];
const mv = (id: string, product_id: string, type: any, qty: number, date: string) => ({ id, product_id, type, qty, date, note: '' }) as any;
const moves = [mv('1', 'a', 'in', 20, '2026-08-05'), mv('2', 'a', 'out', 8, '2026-09-10'), mv('3', 'a', 'adjust', -2, '2026-09-15'), mv('4', 'a', 'out', 4, '2026-10-18'), mv('5', 'b', 'in', 3, '2026-10-01'), mv('x', 'zzz', 'in', 99, '2026-10-01')];
const q = S.quantities(prods, moves);
ok(q.get('a') === 6 && q.get('b') === 3 && !q.has('zzz'), 'quantité = entrées − sorties ± ajustements (mouvement d\'un produit inconnu ignoré)');
ok(S.quantities(prods, moves, '2026-09-30').get('a') === 10, 'quantité à une date passée (fin septembre = 10)');
const rows = S.stockRows(prods, moves);
ok(rows[0].product.id === 'a' && rows[0].value === 6000 && !rows[0].low && rows[1].value === 1500 && !rows[1].low, 'valeur = quantité × prix d\'achat ; seuil 0 = pas d\'alerte');
ok(S.stockRows(prods, [...moves, mv('6', 'a', 'out', 1, '2026-10-19')])[0].low, 'voyant rouge quand la quantité atteint le seuil (5 ≤ 5)');
ok(S.stockValue(rows) === 7500, 'valeur totale du stock = 7 500');
const vm = S.valueByMonth(prods, moves, '2026-10-20', 4);
ok(vm.keys.join() === '2026-07,2026-08,2026-09,2026-10' && vm.values.join() === '0,20000,10000,7500', 'courbe : fin juillet 0, fin août 20 000, fin septembre 10 000, aujourd\'hui 7 500')
const top = S.topUsed(prods, moves, '2026-09-01', '2026-10-31');
ok(top.length === 1 && top[0].product.id === 'a' && top[0].used === 12, 'produit le plus utilisé : A, 12 sorties (les ajustements ne comptent pas comme usage)');
const soon = S.runOutSoon(S.stockRows(prods, moves), moves, '2026-10-20');
ok(soon.length === 0 || soon.every(x => (x.daysLeft as number) <= 14), 'bientôt en rupture : jamais plus de 14 jours');
const soon2 = S.runOutSoon(S.stockRows(prods, [...moves, mv('7', 'a', 'out', 5, '2026-10-19')]), [...moves, mv('7', 'a', 'out', 5, '2026-10-19')], '2026-10-20');
ok(soon2.length === 1 && soon2[0].product.id === 'a' && soon2[0].daysLeft! <= 14, 'bientôt en rupture : un produit qui part vite est signalé');
ok(S.purchaseAmount(10, 11000) === 110000 && S.purchaseAmount(2.5, 1001) === 2503 && S.purchaseAmount(5, undefined) === 0, 'montant d\'achat = quantité × prix payé (arrondi)');

// ---------- 4) Store en démo ----------
db.enterDemo('admin');
const today = todayMada();
const tomorrow = new Date(Date.now() + 86400000 + 3 * 3600000).toISOString().slice(0, 10);
const dp = db.getProducts(), dm = db.getStockMoves();
ok(dp.length >= 5 && dm.length >= 300, `démo : ${dp.length} produits et ${dm.length} mouvements inventés`);
ok(dm.every(m => m.date <= tomorrow && S.checkMoveDraft({ product_id: m.product_id, type: m.type, qty: m.qty, date: m.date, note: m.note, unit_cost: m.unit_cost_ar }).ok), 'démo : aucun mouvement dans le futur, tous valides');
ok(dp.every(p => S.checkProductDraft({ name: p.name, category: p.category, unit: p.unit, buy_price: p.buy_price_ar, sell_price: p.sell_price_ar, alert_threshold: p.alert_threshold }).ok), 'démo : tous les produits valides');
let neverNegative = true;
for (const p of dp) { let run = 0; for (const m of dm.filter(x => x.product_id === p.id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) { run += S.moveDelta(m); if (run < -1e-9) neverNegative = false; } }
ok(neverNegative, 'démo : aucun produit ne passe jamais sous zéro');
const drows = S.stockRows(dp, dm);
ok(drows.some(r => r.low) && drows.some(r => !r.low), 'démo : certains produits sous le seuil (rouge), d\'autres non');
ok(S.stockValue(drows) > 0 && S.valueByMonth(dp, dm, today, 12).values.filter(v => v > 0).length >= 6, 'démo : valeur du stock sur plusieurs mois (courbe pleine)');
ok(S.runOutSoon(drows, dm, today).length >= 1, 'démo : au moins un produit bientôt en rupture');

(db as any).purchases = []; // un produit cité par un bon en cours ne se supprime pas (module 4) : on retire les bons de la démo avant
for (const x of db.getProducts()) db.deleteProduct(x.id);
ok(db.getProducts().length === 0 && db.getStockMoves().length === 0, 'supprimer les produits supprime aussi leurs mouvements');
const cashBefore = db.getCash().length;
const np = db.addProduct({ name: 'Essai', unit: 'kg', buy_price: '1 000', sell_price: 1500, alert_threshold: 2 });
ok(np.success && db.getProducts().length === 1, 'ajout d\'un produit');
const pid = np.id as string;
ok(db.addProduct({ name: '' }).error === 'name', 'produit sans nom : code « name »');
ok(db.updateProduct(pid, { name: 'Essai 2', unit: 'kg', buy_price: 1200 }).success && db.getProducts()[0].name === 'Essai 2' && db.getProducts()[0].buy_price_ar === 1200, 'modification d\'un produit');
ok(db.addStockMove({ product_id: pid, type: 'out', qty: 1, date: today }).error === 'stock', 'sortie sur un stock vide refusée (code « stock »)');
ok(db.addStockMove({ product_id: pid, type: 'in', qty: '10', date: today, unit_cost: 1000 }).success, 'entrée de 10');
ok(db.addStockMove({ product_id: pid, type: 'out', qty: 4, date: today }).success && S.stockRows(db.getProducts(), db.getStockMoves())[0].qty === 6, 'sortie de 4 : il reste 6');
ok(db.addStockMove({ product_id: pid, type: 'out', qty: 7, date: today }).error === 'stock' && S.stockRows(db.getProducts(), db.getStockMoves())[0].qty === 6, 'sortie de 7 refusée, rien n\'est changé');
ok(db.addStockMove({ product_id: pid, type: 'adjust', qty: -7, date: today }).error === 'stock', 'ajustement qui rendrait le stock négatif refusé');
const adj = db.addStockMove({ product_id: pid, type: 'adjust', qty: -1, date: today, note: 'Comptage' });
ok(adj.success && S.stockRows(db.getProducts(), db.getStockMoves())[0].qty === 5 && S.stockRows(db.getProducts(), db.getStockMoves())[0].low === false, 'ajustement de −1 : il reste 5 (seuil 2)');
ok(db.addStockMove({ product_id: 'inconnu', type: 'in', qty: 1, date: today }).error === 'product', 'produit inconnu : code « product »');
ok(db.addStockMove({ product_id: pid, type: 'in', qty: 0, date: today }).error === 'qty' && db.addStockMove({ product_id: pid, type: 'in', qty: 1, date: '2026-99-99' }).error === 'date', 'quantité 0 et date fausse refusées');
const big = db.getStockMoves().find(m => m.type === 'in')!;
ok(db.deleteStockMove(big.id).error === 'stock' && db.getStockMoves().some(m => m.id === big.id), 'supprimer l\'entrée qui a servi aux sorties : refusé (stock négatif)');
ok(db.deleteStockMove(adj.id as string).success && S.stockRows(db.getProducts(), db.getStockMoves())[0].qty === 6, 'supprimer l\'ajustement : la quantité se recalcule (6)');
ok(db.deleteStockMove('nope').error === 'missing', 'supprimer un mouvement inconnu : code « missing »');

// Lien avec les finances (S3.3)
const withCash = db.addStockMove({ product_id: pid, type: 'in', qty: 5, date: today, unit_cost: 1200, note: 'Réappro' }, { withExpense: true });
const lineCash = db.getCash().find(c => c.id === withCash.cashId);
ok(withCash.success && db.getCash().length === cashBefore + 1 && !!lineCash && lineCash.kind === 'out' && lineCash.category === 'Achats' && lineCash.amount_ar === 6000 && lineCash.date === today, 'entrée avec dépense : une sortie « Achats » de 6 000 Ar est créée aux Finances');
ok(db.getStockMoves().find(m => m.id === withCash.id)?.cash_id === withCash.cashId, 'l\'entrée garde le lien avec sa dépense');
const movesBefore = db.getStockMoves().length;
const noCost = db.addStockMove({ product_id: pid, type: 'in', qty: 5, date: today }, { withExpense: true });
ok(!noCost.success && noCost.error === 'cost' && db.getCash().length === cashBefore + 1 && db.getStockMoves().length === movesBefore, 'dépense demandée sans prix payé : refusée, ni dépense ni mouvement ajoutés');
ok(db.addStockMove({ product_id: pid, type: 'in', qty: 1, date: today, unit_cost: 1200 }).success && db.getCash().length === cashBefore + 1, 'sans la case cochée : aucune dépense créée');
ok(db.deleteProduct(pid).success && db.getStockMoves().length === 0 && db.getCash().length === cashBefore + 1, 'supprimer le produit : mouvements partis, la dépense reste dans les Finances');

// Opérateur : rien
db.enterDemo('employee');
ok(db.getProducts().length === 0 && db.getStockMoves().length === 0, 'démo opérateur : aucun produit ni mouvement visible');
ok(db.addProduct({ name: 'Pirate' }).error === 'admin' && db.addStockMove({ product_id: 'x', type: 'in', qty: 1, date: today }).error === 'admin' && db.deleteProduct('x').error === 'admin', 'opérateur : ajout, mouvement et suppression refusés');

// ---------- 4b) Catégories : liste par défaut, ajout, renommage, suppression ----------
{
  db.enterDemo('admin');
  const names = () => db.getStockCategories();
  ok(names().length === 8 && names().includes('Papeterie'), 'catégories : liste par défaut au départ');
  const p1 = db.addProduct({ name: 'Cat test A', category: 'Papeterie' }); const p2 = db.addProduct({ name: 'Cat test B', category: 'papeterie' }); const p3 = db.addProduct({ name: 'Cat test C' });
  ok(p1.success && p2.success && p3.success, 'catégories : seul le nom est obligatoire');
  ok(db.setStockCategories([...names(), 'Électricité']).success && names().includes('Électricité'), 'catégories : ajout enregistré dans les réglages');
  ok(db.renameStockCategory('Électricité', 'Papeterie').error === 'category_exists', 'catégories : renommer vers un nom déjà pris est refusé');
  ok(db.renameStockCategory('Papeterie', '  ').error === 'category', 'catégories : nom vide refusé');
  ok(db.renameStockCategory('Papeterie', 'Fournitures Zéta').success && names().includes('Fournitures Zéta') && !names().includes('Papeterie'), 'catégories : renommée dans la liste');
  ok(db.getProducts().filter(p => p.category === 'Fournitures Zéta').length >= 2 && !db.getProducts().some(p => p.category.toLowerCase() === 'papeterie'), 'catégories : tous ses produits suivent le renommage (même avec une autre casse)');
  ok(db.deleteStockCategory('Fournitures Zéta').success && !names().includes('Fournitures Zéta') && !db.getProducts().some(p => p.category === 'Fournitures Zéta'), 'catégories : supprimée de la liste, ses produits restent sans catégorie');
  ok(db.getProducts().some(p => p.name === 'Cat test A' && p.category === ''), 'catégories : le produit existe toujours');
  ok(db.setStockCategories([]).success && names().length === 0, 'catégories : liste vide gardée (pas remplacée par la liste par défaut)');
}
// ---------- 5) Rendu FR et EN ----------
db.enterDemo('admin');
const range = { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-31` };
const bad = (html: string) => /NaN|Infinity|undefined|\[object/.test(html);
for (const lang of ['fr', 'en'] as const) {
  const html = renderToString(<StockTab lang={lang} />);
  ok(!bad(html), `${lang} : aucun NaN ni « undefined »`);
  ok(html.includes(lang === 'en' ? 'Stock value' : 'Valeur du stock') && html.includes(lang === 'en' ? 'New product' : 'Nouveau produit') && html.includes(lang === 'en' ? 'Running out soon' : 'Bientôt en rupture'), `${lang} : cartes et boutons dans la bonne langue`);
  ok(html.includes('Papier A4') && (html.includes(lang === 'en' ? 'low stock' : 'stock bas') || html.includes(lang === 'en' ? 'out of stock' : 'en rupture')), `${lang} : produits de la démo et alerte affichés`);
  const anHtml = renderToString(<StockAnalytics lang={lang} />);
  ok(!bad(anHtml) && anHtml.includes(lang === 'en' ? 'Stock value over time' : 'Valeur du stock dans le temps') && anHtml.includes(lang === 'en' ? 'Most used products' : 'Produits les plus utilisés'), `${lang} : onglet Analyses : graphiques présents`);
  if (lang === 'fr') ok(!/Stock value|New product|Running out/.test(html), 'fr : pas de texte anglais');
  else ok(!/Nouveau produit|Valeur du stock|Bientôt en rupture|Entrée</.test(html), 'en : pas de texte français dans les cartes');
}
(db as any).purchases = [];
for (const x of db.getProducts()) db.deleteProduct(x.id);
const emptyHtml = renderToString(<StockTab lang="fr" />);
ok(!bad(emptyHtml) && emptyHtml.includes('Aucun produit pour l&#x27;instant') , 'liste vide : message clair, sans erreur');
ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
