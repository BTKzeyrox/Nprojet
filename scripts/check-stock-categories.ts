// Contrôle de la liste des catégories du Stockage (site = serveur). Sans réseau. Lancer : npm run check:stock-categories
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { categoryKey, categoryOptions, cleanCategoryList, DEFAULT_STOCK_CATEGORIES } from '../src/utils/stock';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN STOCK_CATEGORIES[^\n]*\n([\s\S]*?)\/\/ ===== END STOCK_CATEGORIES =====/.exec(src);
ok(!!m, 'bloc « STOCK_CATEGORIES » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { cleanStockCategories, applyStockCategories };`)() as any;

const cases: [string, unknown][] = [
  ['liste simple', ['Papeterie', 'Boissons']], ['pas une liste', { a: 1 }], ['rien', undefined], ['null', null], ['texte', 'x'],
  ['liste vide', []], ['doublons sans accent ni majuscule', ['Électricité', 'electricite', 'ÉLECTRICITÉ', 'Autre']],
  ['espaces', ['  Café   noir  ', '   ', '']], ['éléments piégés', [null, 5, {}, [], 'Bon', ['x']]],
  ['nom trop long', ['z'.repeat(100)]], ['40 noms', Array.from({ length: 40 }, (_, i) => `C${i}`)],
  ['défaut', DEFAULT_STOCK_CATEGORIES],
];
for (const [name, v] of cases) ok(J(cleanCategoryList(v)) === J(srv.cleanStockCategories(v)), `site = serveur : ${name}`);
ok(cleanCategoryList(cases[6][1])!.length === 2, 'doublons : un seul gardé (clé sans accent)');
ok(cleanCategoryList(cases[7][1])![0] === 'Café noir', 'espaces nettoyés');
ok(cleanCategoryList(cases[9][1])![0].length === 40, 'nom coupé à 40 caractères');
ok(cleanCategoryList(cases[10][1])!.length === 30, '40 noms : 30 gardés');
ok(cleanCategoryList(cases[5][1])!.length === 0 && cleanCategoryList(cases[1][1]) === null, 'liste vide gardée ; pas une liste = null');
ok(categoryKey('Électricité') === categoryKey(' electricite '), 'clé : sans accent ni majuscule');
ok(J(categoryOptions(['A', 'B'], [{ category: 'b' }, { category: 'C' }, { category: '' }])) === J(['A', 'B', 'C']), 'liste proposée : + catégories déjà utilisées, sans doublon');

const ex = { stock_categories: ['Vieux'], budgets: { x: 1 } };
ok(J(srv.applyStockCategories({ a: 1 }, { stock_categories: ['Neuf'] }, ex).stock_categories) === J(['Neuf']), 'serveur : la liste envoyée remplace l\'ancienne');
ok(J(srv.applyStockCategories({ a: 1 }, { a: 2 }, ex).stock_categories) === J(['Vieux']), 'serveur : ancien site qui n\'envoie rien = l\'existant est gardé');
ok(J(srv.applyStockCategories({ a: 1 }, { stock_categories: 'n\'importe quoi' }, ex).stock_categories) === J(['Vieux']), 'serveur : valeur qui n\'est pas une liste = l\'existant est gardé');
ok(Array.isArray(srv.applyStockCategories({ a: 1 }, { stock_categories: [] }, ex).stock_categories) && srv.applyStockCategories({ a: 1 }, { stock_categories: [] }, ex).stock_categories.length === 0, 'serveur : liste vide gardée');
ok(!('stock_categories' in srv.applyStockCategories({ a: 1 }, {}, {})), 'serveur : jamais de liste = pas de champ (liste par défaut côté site)');
ok(J(srv.applyStockCategories({ a: 1, b: 2 }, { stock_categories: [] }, ex)).includes('"a":1,"b":2'), 'serveur : les autres réglages ne bougent pas');
ok(/SETTINGS_ADMIN_KEYS[^\n]*"stock_categories"/.test(src), 'serveur : jamais envoyé à un opérateur (liste des réglages réservés à l\'admin)');
ok(/applyStockCategories\(toSave, rec, existing\)/.test(src), 'serveur : revérifié à chaque enregistrement des réglages');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
