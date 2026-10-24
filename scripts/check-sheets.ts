import { evalFormula, parseFormula, showVal, isErr, type Val } from '../src/utils/sheetFormula';
import * as S from '../src/utils/sheets';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ÉCHEC:', m); } };
const NOW = '2026-10-24T10:00:00.000Z', TODAY = '2026-10-24';

// tableau : A=Nom, B=Montant, C=État, D=Date
let s = S.emptySheet('Test', NOW);
for (const [n_, t, o] of [['Nom', 'text'], ['Montant', 'number'], ['État', 'list', ['Payé', 'Dû']], ['Date', 'date']] as const) s = S.addColumn(s, n_, t as S.ColType, NOW, o as string[] | undefined)!;
const [cn, cm, ce, cd] = s.columns.map(c => c.id);
const data: [string, string, string, string][] = [['Ana', '100', 'Payé', '2026-10-20'], ['Bob', '250,5', 'Dû', '2026-10-24'], ['Cléo', '50', 'Payé', ''], ['Dan', '', 'Dû', '2026-11-01']];
for (const d of data) { s = S.addRow(s, NOW, { [cn]: d[0], [cm]: d[1], [ce]: d[2], [cd]: d[3] })!; }
const rid = (i: number) => s.rows[i].id;
const calc = (f: string, row = 4): Val => { // formule dans une 5e ligne, colonne Nom
  let t = S.addRow(s, NOW)!; t = S.updateCell(t, t.rows[t.rows.length - 1].id, cn, f, NOW)!;
  const c = S.computeSheet(t, TODAY); return c.grid[c.rows.length - 1][0];
};
const eq = (f: string, v: Val, m = f) => { const r = calc(f); ok(JSON.stringify(r) === JSON.stringify(v), `${m} → ${JSON.stringify(r)} attendu ${JSON.stringify(v)}`); };

eq('=SOMME(B1:B4)', 400.5); eq('=SUM(B1:B4)', 400.5); eq('=SOMME(B1:B3;10)', 410.5); eq('=SOMME(B1,B2)', 350.5);
eq('=MOYENNE(B1:B4)', 400.5 / 3); eq('=MIN(B1:B4)', 50); eq('=MAX(B1:B4)', 250.5);
eq('=NB(B1:B4)', 3); eq('=NBVAL(A1:A4)', 4); eq('=NBVAL(D1:D4)', 3);
eq('=SI(B1>=100;"Grand";"Petit")', 'Grand'); eq('=SI(B3>=100;"Grand";"Petit")', 'Petit'); eq('=SI(FAUX;1)', false);
eq('=ET(B1>0;B2>0)', true); eq('=OU(B1>1000;B2>1000)', false); eq('=NON(VRAI)', false);
eq('=ARRONDI(2.675;2)', 2.68); eq('=ARRONDI(-2.5;0)', -3); eq('=ABS(-4)', 4); eq('=ENT(-2.5)', -3);
eq('=SOMME.SI(C1:C4;"Payé";B1:B4)', 150); eq('=SUMIF(C1:C4,"Dû",B1:B4)', 250.5); eq('=NB.SI(B1:B4;">60")', 2); eq('=NB.SI(C1:C4;"<>Payé")', 2); eq('=NB.SI(C1:C4;"payé")', 2);
eq('=RECHERCHEV("Bob";A1:B4;2)', 250.5); eq('=RECHERCHEV("Zoé";A1:B4;2)', { err: '#N/A' }); eq('=RECHERCHEV("Bob";A1:B4;3)', { err: '#REF!' });
eq('=AUJOURDHUI()', TODAY); eq('=JOURS(AUJOURDHUI();D1)', 4); eq('=JOURS(D4;D1)', 12);
eq('=CONCAT(A1;" ";A2)', 'Ana Bob'); eq('=A1&"-"&B1', 'Ana-100'); eq('=GAUCHE(A3;2)', 'Cl'); eq('=DROITE(A3;2)', 'éo'); eq('=MAJUSCULE(A1)', 'ANA'); eq('=minuscule(A1)', 'ana'); eq('=NBCAR(A3)', 4);
eq('=SIERREUR(1/0;"x")', 'x'); eq('=1/0', { err: '#DIV/0!' }); eq('=FOO(1)', { err: '#NAME?' }); eq('=1+', { err: '#SYNTAXE!' }); eq('=A1+1', { err: '#VALUE!' });
eq('=2+3*4^2', 50); eq('=-2^2', 4); eq('=(1+2)*3', 9); eq('=1+2&"a"', '3a'); eq('=B1=100', true); eq('=A1="ana"', true);
eq('=B9', null); eq('=SOMME(B1:B2)+B3', 400.5);
// références circulaires et limites
{
  let t = S.addRow(s, NOW)!; const r = t.rows[t.rows.length - 1].id;
  t = S.updateCell(t, r, cn, '=B5', NOW)!; t = S.updateCell(t, r, cm, '=A5', NOW)!;
  const c = S.computeSheet(t, TODAY); const last = c.grid[c.rows.length - 1];
  ok(isErr(last[0]) && isErr(last[1]), 'cycle → erreur');
  ok(S.updateCell(s, rid(0), cn, '=' + 'A'.repeat(10) + '1', NOW) !== null, 'formule longue ok');
}
ok(parseFormula('=' + '('.repeat(60) + '1' + ')'.repeat(60)) === null, 'imbrication limitée');
ok(parseFormula('=' + '1+'.repeat(200) + '1') !== null, 'longue somme ok');
ok(parseFormula('=' + '1'.repeat(600)) === null, '500 caractères max');
ok(parseFormula('=alert(1)') !== null && isErr(calc('=alert(1)')), 'pas de fonction étrangère');
ok(parseFormula('=constructor') === null, 'nom inconnu refusé');
{ // chaîne de 450 dépendances : pas de plantage
  let t = S.emptySheet('chaîne', NOW); t = S.addColumn(t, 'V', 'number', NOW)!;
  for (let i = 0; i < 450; i++) t = S.addRow(t, NOW)!;
  t.rows.forEach((r, i) => { t = S.updateCell(t, r.id, t.columns[0].id, i === 0 ? '1' : `=A${i}+1`, NOW)!; });
  const c = S.computeSheet(t, TODAY); ok(c.grid.length === 450 && isErr(c.grid[449][0]) || typeof c.grid[449][0] === 'number', 'chaîne profonde sans plantage');
}
ok(showVal(1234.5) === '1 234,5' && showVal(true) === 'VRAI' && showVal(true, 'en') === 'TRUE' && showVal(0.1 + 0.2) === '0,3', 'affichage');

// lignes / colonnes / corbeille
{
  const t = S.deleteRow(s, rid(0), NOW)!;
  ok(S.activeRows(t).length === 3 && S.trashOf(t).rows.length === 1, 'suppression → corbeille');
  const c = S.computeSheet(t, TODAY); ok(c.grid[0][0] === 'Bob', 'A1 suit les lignes actives');
  const b = S.restoreRow(t, rid(0), NOW)!; ok(S.activeRows(b).length === 4 && b.rows[0].id === rid(0), 'restauration remet à sa place');
  ok(S.deleteRow(t, rid(0), NOW) === null, 'double suppression refusée');
  ok(S.updateCell(t, rid(0), cn, 'x', NOW) === null, 'ligne supprimée non modifiable');
  const u = S.deleteColumn(s, cm, NOW)!; ok(S.activeColumns(u).length === 3 && S.restoreColumn(u, cm, NOW)!.columns.length === 4, 'colonne corbeille/restauration');
  const old = S.purgeSheet(S.deleteRow(s, rid(1), '2026-08-01T00:00:00Z')!, NOW); ok(old.rows.length === 3, 'purge après 30 jours');
  const recent = S.purgeSheet(S.deleteRow(s, rid(1), '2026-10-10T00:00:00Z')!, NOW); ok(recent.rows.length === 4, 'pas de purge avant 30 jours');
  ok(S.purgeSheets([S.deleteSheet(s, '2026-08-01T00:00:00Z'), s], NOW).length === 1, 'tableau supprimé purgé');
  const m = S.moveColumn(s, cm, -1, NOW)!; ok(m.columns[0].id === cm, 'déplacer une colonne');
  ok(S.moveColumn(s, cn, -1, NOW) === null, 'déplacement hors limite refusé');
  const d = S.duplicateRow(s, rid(0), NOW)!; ok(S.activeRows(d).length === 5, 'dupliquer');
}
// limites
{
  let t = S.emptySheet('L', NOW); t.rows = Array.from({ length: S.LIMITS.rows }, (_, i) => ({ id: 'r' + i, cells: {} }));
  ok(S.addRow(t, NOW) === null, '5000 lignes max');
  t = S.emptySheet('L', NOW); for (let i = 0; i < S.LIMITS.columns; i++) t = S.addColumn(t, 'c' + i, 'text', NOW)!;
  ok(S.addColumn(t, 'x', 'text', NOW) === null, '200 colonnes max');
  const big = S.updateCell(s, rid(0), cn, 'x'.repeat(900), NOW)!; ok(big.rows[0].cells[cn].length === 500, 'case ≤ 500');
}
// contrôle de saisie
ok(S.checkCell(s, rid(0), cm, 'abc') === 'number' && S.checkCell(s, rid(0), cm, '12,5') === null && S.checkCell(s, rid(0), cm, '=A1') === null, 'nombre');
ok(S.checkCell(s, rid(0), cd, '2026-13-45') === 'date' && S.checkCell(s, rid(0), cd, '24/10/2026') === 'date' && S.checkCell(s, rid(0), cd, '2026-10-24') === null, 'date');
ok(S.checkCell(s, rid(0), ce, 'Autre') === 'list' && S.checkCell(s, rid(0), ce, 'Dû') === null, 'liste');
{
  const t = S.updateColumn(S.updateColumn(s, cn, { unique: true }, NOW)!, cm, { required: true }, NOW)!;
  ok(S.checkCell(t, rid(1), cn, 'ana') === 'duplicate' && S.checkCell(t, rid(0), cn, 'Ana') === null, 'doublon');
  ok(S.checkCell(t, rid(0), cm, '') === 'required', 'obligatoire');
  ok(S.sheetProblems(t).some(p => p.problem === 'required'), 'résumé des problèmes');
}
// vue
{
  const c = S.computeSheet(s, TODAY);
  const asc = S.viewRows(s, c, { sortCol: cm, sortDir: 'asc' }); ok(asc.join() === '2,0,1,3', 'tri croissant, vides en bas ' + asc);
  const desc = S.viewRows(s, c, { sortCol: cm, sortDir: 'desc' }); ok(desc.join() === '1,0,2,3', 'tri décroissant ' + desc);
  ok(S.viewRows(s, c, { search: 'CLÉO' }).join() === '2', 'recherche');
  ok(S.viewRows(s, c, { filters: [{ col: ce, value: 'Payé' }] }).join() === '0,2', 'filtre');
  ok(s.rows[0].id === rid(0), 'le tri ne change pas les données');
  const tot = S.columnTotals(c)[0]; ok(tot.sum === 400.5 && tot.count === 3 && tot.min === 50 && tot.max === 250.5, 'totaux');
  ok(S.columnTotals(c, [0, 2])[0].sum === 150, 'totaux de la vue filtrée');
  const ch = S.chartData(c, ce, cm); ok(ch.length === 2 && ch[0].label === 'Dû' && ch[0].value === 250.5, 'graphique somme');
  ok(S.chartData(c, ce)[0].value === 2, 'graphique comptage');
}
// mise en forme conditionnelle
{
  const t = S.addRule(s, { col: cm, op: '>', value: '100', color: 'red' }, NOW)!;
  const c = S.computeSheet(t, TODAY);
  ok(S.ruleColor(t, c, 1, 1) === 'red' && S.ruleColor(t, c, 0, 1) === null && S.ruleColor(t, c, 3, 1) === null, 'règle >');
  ok(S.addRule(s, { col: 'nope', op: '>', value: '1', color: 'red' }, NOW) === null, 'règle sur colonne inconnue refusée');
  const t2 = S.addRule(s, { col: ce, op: 'contains', value: 'pay', color: 'green' }, NOW)!; ok(S.ruleColor(t2, S.computeSheet(t2, TODAY), 0, 2) === 'green', 'règle contient');
}
// modèles
for (const tp of S.TEMPLATES) { const t = S.fromTemplate(tp, '', NOW); ok(t.columns.length === tp.cols.length && t.title.length > 0, 'modèle ' + tp.id); }
// annuler / rétablir
{
  let h = S.newHistory(s); h = S.pushHistory(h, S.deleteRow(h.present, rid(0), NOW)!);
  ok(S.activeRows(h.present).length === 3, 'avant undo'); h = S.undo(h); ok(S.activeRows(h.present).length === 4, 'annuler');
  h = S.redo(h); ok(S.activeRows(h.present).length === 3, 'rétablir');
  h = S.undo(h); h = S.pushHistory(h, S.addRow(h.present, NOW)!); ok(h.future.length === 0, 'nouvelle action vide le rétablir');
  let g = S.newHistory(s); for (let i = 0; i < 80; i++) g = S.pushHistory(g, S.addRow(g.present, NOW)!); ok(g.past.length === 50, 'historique 50');
  ok(S.undo(S.newHistory(s)).present === s, 'undo à vide sans effet');
}
// nettoyage
{
  const dirty = JSON.parse(JSON.stringify(s)); dirty.rows[0].cells[cn] = 5; dirty.rows[0].cells.zzz = 'x'; dirty.columns[0].type = 'hack'; dirty.rules = [{ col: 'nope', op: '>', color: 'red' }, { id: 'r1', col: cm, op: '>', value: '1', color: 'pink' }];
  const c = S.cleanSheet(dirty, NOW)!;
  ok(!!c && c.columns[0].type === 'text' && c.rows[0].cells.zzz === undefined && c.rows[0].cells[cn] === '5' && c.rules.length === 0, 'cleanSheet nettoie');
  ok(S.cleanSheet(null) === null && S.cleanSheet({ id: '' }) === null && S.cleanSheet({ id: 'a'.repeat(100) }) === null, 'cleanSheet refuse');
  const dup = S.cleanSheet({ id: 's1', columns: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], rows: [{ id: 'r', cells: {} }, { id: 'r', cells: {} }] }, NOW)!; ok(dup.columns.length === 1 && dup.rows.length === 1, 'doublons d\'id retirés');
  const rt = S.cleanSheet(JSON.parse(JSON.stringify(s)), NOW)!; ok(JSON.stringify(rt.rows) === JSON.stringify(s.rows), 'aller-retour sans perte');
}
// export
{ const m = S.exportMatrix(S.fromTemplate(S.TEMPLATES[2], '', NOW), TODAY); ok(m.header.length === 4 && m.rows.length === 0, 'export vide'); }

// vitesse : 5000 lignes avec formules
{
  let t = S.emptySheet('gros', NOW); t = S.addColumn(t, 'V', 'number', NOW)!; t = S.addColumn(t, 'W', 'number', NOW)!;
  const rows: S.Row[] = Array.from({ length: 5000 }, (_, i) => ({ id: 'r' + i, cells: { [t.columns[0].id]: String(i), [t.columns[1].id]: `=A${i + 1}*2` } }));
  t = { ...t, rows };
  const t0 = Date.now(); const c = S.computeSheet(t, TODAY); const ms = Date.now() - t0;
  ok(c.grid[4999][1] === 9998 && ms < 2000, `5000 lignes calculées en ${ms} ms`);
  let u = S.addRow(t, NOW) ? t : t; u = S.updateCell(u, 'r0', t.columns[1].id, '=SOMME(A1:A5000)', NOW)!;
  const t1 = Date.now(); const c2 = S.computeSheet(u, TODAY); ok(c2.grid[0][1] === 12497500 && Date.now() - t1 < 2000, 'somme de 5000 cases');
}
console.log(fails ? `${fails} échec(s) sur ${n}` : `check-sheets OK (${n} contrôles)`);
process.exit(fails ? 1 : 0);
