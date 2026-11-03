// Contrôle de la barre de filtres commune (M22.7) : règles pures + pages qui l'utilisent. Lancer : npm run check:filter-bar
import { readFileSync } from 'node:fs';
import { filterText, safeCount, activeOrFirst, countBy } from '../src/utils/filterBar';
let f = 0, t = 0;
const eq = (g: unknown, w: unknown, n: string) => { t++; if (JSON.stringify(g) !== JSON.stringify(w)) { f++; console.log(`ECHEC ${n}\n  obtenu ${JSON.stringify(g)}\n  attendu ${JSON.stringify(w)}`); } };
const ok = (c: boolean, n: string) => eq(!!c, true, n);
eq(filterText('En retard', 3), 'En retard (3)', 'texte : « Nom (3) »');
eq(filterText('Fins', 0), 'Fins (0)', 'à 0 : le chiffre est montré quand même');
eq([safeCount(undefined), safeCount(null), safeCount(NaN), safeCount(-4), safeCount('7'), safeCount(2.9), safeCount('abc'), safeCount(Infinity)], [0, 0, 0, 0, 7, 2, 0, 0], 'chiffre sûr : jamais NaN, négatif ou infini');
const fl = [{ id: 'all', label: 'Tout', count: 5 }, { id: 'a', label: 'A', count: 0 }];
eq([activeOrFirst(fl, 'a'), activeOrFirst(fl, 'zzz' as any), activeOrFirst([], 'x')], ['a', 'all', 'x'], 'filtre disparu : retour au premier');
eq(countBy(['x', 'y', 'x', 'z'] as any, ['all', 'x', 'y', 'w'] as any, 'all'), { all: 4, x: 2, y: 1, w: 0 }, 'comptage par filtre (« Tout » = toutes les lignes)');
eq(countBy([] as any, ['all', 'x'] as any, 'all'), { all: 0, x: 0 }, 'liste vide : tout à 0');
eq(countBy(['inconnu'] as any, ['all', 'x'] as any, 'all'), { all: 1, x: 0 }, 'type inconnu : compté seulement dans « Tout »');
const bar = readFileSync('src/components/FilterBar.tsx', 'utf8');
ok(/min-h-\[44px\]/.test(bar) && /aria-pressed/.test(bar) && /opacity-50/.test(bar) && /filterText\(f\.label, f\.count\)/.test(bar) && /flex-wrap/.test(bar), 'barre : 44 px, accessible, grisée à 0, chiffre toujours montré, passe à la ligne');
ok(!/disabled/.test(bar), 'un filtre à 0 reste cliquable (on voit que la liste est vide)');
for (const [file, n] of [['src/views/admin/AdminDashboard.tsx', 'Validations'], ['src/views/admin/HistoryPage.tsx', 'Historique'], ['src/views/admin/PurchaseOrdersSection.tsx', 'Achats']] as const) {
  const s = readFileSync(file, 'utf8');
  ok(/<FilterBar /.test(s) && /import \{ FilterBar \}/.test(s), `${n} : utilise la barre commune`);
}
const pur = readFileSync('src/views/admin/PurchaseOrdersSection.tsx', 'utf8');
ok(/id: 'late' as const, label: t\('En retard', 'Late'\), count: lateCount/.test(pur) && !/lateCount > 0 &&/.test(pur), 'Achats : « En retard » toujours visible (grisé à 0), plus caché');
const his = readFileSync('src/views/admin/HistoryPage.tsx', 'utf8');
ok(/countBy\(all\.map/.test(his), 'Historique : un chiffre par type');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
