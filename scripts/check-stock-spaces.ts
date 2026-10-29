// Contrôle des stockages (Stockage 1, 2…) : site = serveur. Sans réseau. Lancer : npm run check:stock-spaces
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { cleanSpaceList, inSpace, newSpaceId, productStorage } from '../src/utils/stock';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN STOCK_SPACES[^\n]*\n([\s\S]*?)\/\/ ===== END STOCK_SPACES =====/.exec(src);
ok(!!m, 'bloc « STOCK_SPACES » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { cleanStockSpaces, applyStockSpaces };`)() as any;

const S = (id: string, name: string) => ({ id, name });
const cases: [string, unknown][] = [
  ['liste simple', [S('main', 'Stockage 1'), S('s2', 'Dépôt')]], ['pas une liste', { a: 1 }], ['rien', undefined], ['null', null], ['texte', 'x'],
  ['liste vide', []], ['identifiant faux', [S('Pas Valable', 'A'), S('', 'B'), S('a/b', 'C'), S('ok', 'D')]],
  ['identifiant en double', [S('s2', 'A'), S('s2', 'B')]], ['nom en double (accent, majuscule)', [S('s2', 'Dépôt'), S('s3', 'depot'), S('s4', 'DÉPÔT')]],
  ['noms vides', [S('s2', '   '), S('s3', '')]], ['éléments piégés', [null, 5, 'x', [], { id: 's2' }, { name: 'x' }, S('s5', 'Bon')]],
  ['nom trop long', [S('s2', 'z'.repeat(100))]], ['15 stockages', Array.from({ length: 15 }, (_, i) => S(`s${i + 2}`, `Stock ${i}`))],
  ['espaces', [S('s2', '  Boutique   centre  ')]], ['id trop long', [S('a'.repeat(40), 'X')]],
];
for (const [name, v] of cases) ok(J(cleanSpaceList(v)) === J(srv.cleanStockSpaces(v)), `site = serveur : ${name}`);
ok(cleanSpaceList(cases[0][1])!.length === 2, 'liste valide gardée');
ok(cleanSpaceList(cases[5][1]) === null && cleanSpaceList(cases[9][1]) === null, 'vide ou sans nom = pas de liste (la liste par défaut s\'applique)');
ok(J(cleanSpaceList(cases[6][1])) === J([S('ok', 'D')]), 'identifiants faux jetés');
ok(cleanSpaceList(cases[8][1])!.length === 1, 'noms en double : un seul gardé');
ok(cleanSpaceList(cases[12][1])!.length === 10, '15 stockages : 10 gardés');
ok(cleanSpaceList(cases[13][1])![0].name === 'Boutique centre', 'espaces nettoyés');
ok(newSpaceId([S('main', 'A')]) === 's2' && newSpaceId([S('main', 'A'), S('s2', 'B'), S('s4', 'C')]) === 's3', 'nouvel identifiant : le plus petit libre (s2, s3…)');

const ex = { stock_spaces: [S('main', 'Ancien')], budgets: { x: 1 } };
ok(J(srv.applyStockSpaces({ a: 1 }, { stock_spaces: [S('main', 'Neuf'), S('s2', 'Dépôt')] }, ex).stock_spaces.map((x: any) => x.name)) === J(['Neuf', 'Dépôt']), 'serveur : la liste envoyée remplace l\'ancienne');
ok(J(srv.applyStockSpaces({ a: 1 }, { a: 2 }, ex).stock_spaces) === J([S('main', 'Ancien')]), 'serveur : ancien site qui n\'envoie rien = l\'existant est gardé');
ok(J(srv.applyStockSpaces({ a: 1 }, { stock_spaces: 'n\'importe quoi' }, ex).stock_spaces) === J([S('main', 'Ancien')]), 'serveur : valeur qui n\'est pas une liste = l\'existant est gardé');
ok(J(srv.applyStockSpaces({ a: 1 }, { stock_spaces: [] }, ex).stock_spaces) === J([S('main', 'Ancien')]), 'serveur : liste vide = l\'existant est gardé (jamais zéro stockage)');
ok(!('stock_spaces' in srv.applyStockSpaces({ a: 1 }, {}, {})), 'serveur : jamais de liste = pas de champ');
ok(J(srv.applyStockSpaces({ a: 1, b: 2 }, { stock_spaces: [S('s2', 'X')] }, ex)).includes('"a":1,"b":2'), 'serveur : les autres réglages ne bougent pas');
ok(/SETTINGS_ADMIN_KEYS[^\n]*"stock_spaces"/.test(src), 'serveur : jamais envoyé à un opérateur (liste des réglages réservés à l\'admin)');
ok(/applyStockSpaces\(toSave, rec, existing\)/.test(src), 'serveur : revérifié à chaque enregistrement des réglages');
ok(/storage_id: sid/.test(src) && /rec\.storage_id/.test(src), 'serveur : le stockage du produit est gardé et vérifié');

ok(productStorage({}) === 'main' && productStorage({ storage_id: '' }) === 'main' && productStorage({ storage_id: 's2' }) === 's2', 'un produit sans stockage est dans le premier');
{
  const ps = [{ id: 'a' }, { id: 'b', storage_id: 's2' }, { id: 'c', storage_id: 'main' }];
  const ms = [{ product_id: 'a' }, { product_id: 'b' }, { product_id: 'b' }, { product_id: 'zz' }];
  const one = inSpace(ps, ms, 'main'), two = inSpace(ps, ms, 's2');
  ok(J(one.products.map(p => p.id)) === J(['a', 'c']) && one.moves.length === 1, 'inSpace : un stockage ne voit que ses produits et leurs mouvements');
  ok(J(two.products.map(p => p.id)) === J(['b']) && two.moves.length === 2, 'inSpace : l\'autre stockage voit les siens, jamais ceux du premier');
  ok(inSpace(ps, ms, 'inconnu').products.length === 0, 'inSpace : un stockage inconnu est vide');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
