// Contrôle des règles de saisie automatique des tableaux (module 19, M19.2). Lancer : npm run check:sheet-auto
import * as S from '../src/utils/sheets';
import * as A from '../src/utils/sheetAuto';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const good = JSON.stringify(got) === JSON.stringify(want); if (!good) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);
const NOW = '2026-10-28T09:00:00.000Z', TODAY = '2026-10-28';

// ---- date : chiffres seuls, séparateurs automatiques
const d = (t: string, fin = false) => A.typeDate(t, 'fr', fin);
eq(d('2').display, '2', 'date : 2');
eq(d('28').display, '28', 'date : 28 (pas de « / » tant qu\'on n\'a rien tapé après)');
eq(d('281').display, '28/1', 'date : 281 → 28/1');
eq(d('2810').display, '28/10', 'date : 2810 → 28/10');
eq(d('28102').display, '28/10/2', 'date : 28102 → 28/10/2');
eq(d('28102026'), { display: '28/10/2026', iso: '2026-10-28', problem: null }, 'date : 28102026 → 28/10/2026 gardé 2026-10-28');
eq(d('281026', true), { display: '28/10/2026', iso: '2026-10-28', problem: null }, 'date : 281026 à la fin → année 2026');
eq(d('28102026999').display, '28/10/2026', 'date : trop de chiffres coupés');
eq(d('1/2/2026', true), { display: '01/02/2026', iso: '2026-02-01', problem: null }, 'date : 1/2/2026 → 01/02/2026');
eq(d('1/').display, '1/', 'date : un « / » tapé à la main est gardé (1/ puis 2 → 1/2, pas 12)');
eq(d('1/2').display, '1/2', 'date : 1/2');
eq(d('28-10-2026').iso, '2026-10-28', 'date : tirets acceptés');
eq(d('28.10.26', true).iso, '2026-10-28', 'date : points et année sur 2 chiffres');
eq(d('2026-10-28').iso, '2026-10-28', 'date : ISO collé accepté');
eq(d('2026-1-5', true).iso, '2026-01-05', 'date : ISO à un chiffre complété');
eq(d('3210').problem, 'day', 'date : jour 32 refusé');
eq(d('00').problem, 'day', 'date : jour 00 refusé');
eq(d('2813').problem, 'month', 'date : mois 13 refusé');
eq(d('30022026').problem, 'day', 'date : 30 février refusé');
eq(d('29022028').iso, '2028-02-29', 'date : 29 février d\'une année bissextile accepté');
eq(d('29022027').iso, null, 'date : 29 février d\'une année non bissextile refusé');
eq(d('01011800').problem, 'year', 'date : année 1800 refusée');
eq(d('2810').iso, null, 'date : incomplète = rien à garder');
eq(d('2810').problem, 'incomplete', 'date : incomplète = signalée');
eq(d('').problem, null, 'date : vide = pas de problème');
eq(A.isoToDisplay('2026-10-28'), '28/10/2026', 'date : affichage jj/mm/aaaa');
eq(A.isoToDisplay('texte'), 'texte', 'date : ce qui n\'est pas une date est rendu tel quel');
ok(A.dateProblemText('day', 'fr') !== A.dateProblemText('day', 'en') && A.dateProblemText('incomplete', 'en').includes('28/10/2026'), 'date : raisons écrites en français et en anglais');

// ---- nombre et montant
const nb = (t: string, lang: A.Lang = 'fr', dec = 6) => A.typeNumber(t, lang, dec);
eq(nb('1500000'), { display: '1 500 000', stored: '1500000' }, 'nombre : milliers automatiques');
eq(nb('1 500 000'), { display: '1 500 000', stored: '1500000' }, 'nombre : espaces retapés');
eq(nb('1500,5'), { display: '1 500,5', stored: '1500.5' }, 'nombre : virgule française');
eq(nb('1500.5'), { display: '1 500,5', stored: '1500.5' }, 'nombre : point accepté');
eq(nb('1500.5', 'en'), { display: '1,500.5', stored: '1500.5' }, 'nombre : anglais 1,500.5');
eq(nb('1,500.5', 'en'), { display: '1,500.5', stored: '1500.5' }, 'nombre : anglais, la virgule des milliers est ignorée');
eq(nb('-250'), { display: '-250', stored: '-250' }, 'nombre : négatif');
eq(nb('-').stored, null, 'nombre : un « - » seul n\'est pas encore un nombre');
eq(nb('007'), { display: '7', stored: '7' }, 'nombre : zéros du début retirés');
eq(nb(',5'), { display: '0,5', stored: '0.5' }, 'nombre : ,5 → 0,5');
eq(nb('12,'), { display: '12,', stored: '12' }, 'nombre : virgule en cours de frappe gardée à l\'affichage');
eq(nb('abc12x3'), { display: '123', stored: '123' }, 'nombre : lettres ignorées');
eq(nb('12,3456789', 'fr', 2), { display: '12,34', stored: '12.34' }, 'montant : 2 décimales au plus');
eq(nb('12,5', 'fr', 0), { display: '125', stored: '125' }, 'nombre entier : pas de virgule');
eq(nb(''), { display: '', stored: '' }, 'nombre : vide');
eq(A.numberToDisplay('1234567.5', 'fr'), '1 234 567,5', 'nombre : affichage d\'une valeur gardée');
eq(A.numberToDisplay('1234567.5', 'en'), '1,234,567.5', 'nombre : affichage anglais');
eq(A.numberToDisplay('beaucoup', 'fr'), 'beaucoup', 'nombre : un ancien texte libre est rendu tel quel');
eq(A.numberToDisplay('1 500', 'fr'), '1 500', 'nombre : ancienne valeur avec espace');
eq(A.numberToDisplay('', 'fr'), '', 'nombre : vide');

// ---- téléphone
eq(A.typePhone('0341234567'), '034 12 345 67', 'téléphone : 0341234567 → 034 12 345 67');
eq(A.typePhone('03412'), '034 12', 'téléphone : en cours de frappe');
eq(A.typePhone('034 12 345 67'), '034 12 345 67', 'téléphone : déjà formaté');
eq(A.typePhone('+261341234567'), '+261 34 12 345 67', 'téléphone : +261 34 12 345 67');
eq(A.typePhone('+'), '+', 'téléphone : « + » seul');
eq(A.typePhone('abc'), '', 'téléphone : lettres ignorées');
eq(A.typePhone('0341234567890123'), '034 12 345 67 89012', 'téléphone : 15 chiffres au plus');
eq(A.typePhone('03-41-23'), '034 12 3', 'téléphone : tirets ignorés');

// ---- heure
eq(A.typeTime('1430'), { display: '14:30', stored: '14:30', problem: false }, 'heure : 1430 → 14:30');
eq(A.typeTime('14').display, '14', 'heure : 14');
eq(A.typeTime('143').display, '14:3', 'heure : 143 → 14:3');
eq(A.typeTime('9:5', true), { display: '09:05', stored: '09:05', problem: false }, 'heure : 9:5 → 09:05 à la fin');
eq(A.typeTime('2500').problem, true, 'heure : 25h refusée');
eq(A.typeTime('1260').problem, true, 'heure : 60 minutes refusées');
eq(A.typeTime('14:').display, '14:', 'heure : « : » tapé gardé');
eq(A.typeTime('').stored, null, 'heure : vide');

// ---- code suivant
eq(A.nextCode('REF001'), 'REF002', 'code : REF001 → REF002');
eq(A.nextCode('REF099'), 'REF100', 'code : REF099 → REF100');
eq(A.nextCode('REF999'), 'REF1000', 'code : REF999 → REF1000');
eq(A.nextCode('A-9'), 'A-10', 'code : A-9 → A-10');
eq(A.nextCode('A9'), 'A10', 'code : A9 → A10');
eq(A.nextCode('2026-005'), '2026-006', 'code : le DERNIER nombre monte (2026-005 → 2026-006)');
eq(A.nextCode('FACT-12/B'), 'FACT-13/B', 'code : texte après le nombre gardé');
eq(A.nextCode('REF'), null, 'code : sans nombre = null');
eq(A.nextCode(''), null, 'code : vide = null');
eq(A.nextCode('  REF007 '), 'REF008', 'code : espaces autour');
eq(A.nextCode('X1234567890123456'), null, 'code : nombre trop long refusé (pas de perte de chiffres)');
const col = (o: Partial<S.Column>): S.Column => ({ id: 'c', name: 'Réf', type: 'code', ...o });
eq(A.codeFor(col({}), []), 'REF001', 'code : colonne vide → REF001');
eq(A.codeFor(col({}), ['REF001', 'REF002']), 'REF003', 'code : suivant du dernier');
eq(A.codeFor(col({}), ['', 'AB-7', '']), 'AB-8', 'code : cases vides ignorées');
eq(A.codeFor(col({ prefix: 'DOS', digits: 4 }), []), 'DOS0001', 'code : préfixe et chiffres choisis');
eq(A.codeFor(col({ prefix: 'DOS', digits: 4 }), ['DOS0007', 'DOS0003', 'XYZ0099']), 'DOS0008', 'code : avec préfixe = le plus grand numéro + 1 (jamais deux fois le même)');
eq(A.codeFor(col({ prefix: 'A.B' }), ['A.B005', 'AxB900']), 'A.B006', 'code : préfixe avec un point = lu tel quel (pas une expression)');
eq(A.codeFor(col({ prefix: 'R', digits: 2 }), ['R99']), 'R100', 'code : dépasse les chiffres choisis sans rien perdre');

// ---- clavier
eq(A.keyboardFor('number').inputMode, 'decimal', 'clavier : nombre = chiffres avec virgule');
eq(['money', 'date', 'time'].map(t => A.keyboardFor(t as S.ColType).inputMode), ['numeric', 'numeric', 'numeric'], 'clavier : montant, date, heure = chiffres');
eq(A.keyboardFor('phone').inputMode, 'tel', 'clavier : téléphone');
eq(['text', 'code', 'list', 'check'].map(t => A.keyboardFor(t as S.ColType).inputMode), ['text', 'text', 'text', 'text'], 'clavier : texte et code = clavier normal');
eq(A.placeholderFor('date', 'fr'), 'jj/mm/aaaa', 'aide : date FR');
eq(A.placeholderFor('date', 'en'), 'dd/mm/yyyy', 'aide : date EN');
ok(A.placeholderFor('code', 'fr') === 'REF001' && A.placeholderFor('text', 'fr') === '', 'aide : code et texte');

// ---- typeCell : le point d'entrée unique
const tc = (type: S.ColType, t: string, fin = false, lang: A.Lang = 'fr') => A.typeCell({ type }, t, lang, fin);
eq(tc('date', '28102026'), { display: '28/10/2026', stored: '2026-10-28', problem: '' }, 'typeCell date');
eq(tc('date', '2810', true).stored, null, 'typeCell : date incomplète à la fin = rien d\'enregistré');
ok(tc('date', '2810', true).problem.length > 5, 'typeCell : ...et la raison est dite');
ok(tc('date', '2810', false).problem === '', 'typeCell : pendant la frappe, pas de reproche sur une date incomplète');
ok(tc('date', '3210', false).problem.length > 5, 'typeCell : mais un jour impossible est signalé tout de suite');
eq(tc('money', '1500000').stored, '1500000', 'typeCell money');
eq(tc('money', '15,555').stored, '15.55', 'typeCell money : 2 décimales');
eq(tc('number', '2,5').stored, '2.5', 'typeCell number');
eq(tc('phone', '0341234567'), { display: '034 12 345 67', stored: '034 12 345 67', problem: '' }, 'typeCell phone');
eq(tc('phone', '034', true).stored, null, 'typeCell phone trop court à la fin');
eq(tc('time', '930', true).stored, null, 'typeCell time : 930 est incomplet');
eq(tc('time', '0930').stored, '09:30', 'typeCell time');
eq(tc('text', 'Rakoto  Jean'), { display: 'Rakoto  Jean', stored: 'Rakoto  Jean', problem: '' }, 'typeCell text : le texte libre n\'est jamais changé');
eq(tc('list', 'x').stored, 'x', 'typeCell list : rien d\'automatique');
eq(tc('date', '').stored, '', 'typeCell : vide = on peut effacer');
ok(A.displayValue('date', '2026-10-28', 'fr') === '28/10/2026' && A.displayValue('money', '1500000', 'fr') === '1 500 000' && A.displayValue('text', 'abc', 'fr') === 'abc' && A.displayValue('number', '=A1*2', 'fr') === '=A1*2', 'affichage d\'une valeur gardée (formule jamais touchée)');

// ---- nouveau modèle de colonne : nettoyage
const base = S.emptySheet('T', NOW);
let sh = S.addColumn(base, 'Réf', 'code', NOW)!;
sh = S.updateColumn(sh, sh.columns[0].id, { prefix: 'DOS', digits: 4, repeat: true }, NOW)!;
const cs = S.cleanSheet(JSON.parse(JSON.stringify(sh)), NOW)!;
eq([cs.columns[0].type, cs.columns[0].prefix, cs.columns[0].digits, cs.columns[0].repeat], ['code', 'DOS', 4, true], 'modèle : préfixe, chiffres, « reprendre » gardés par le nettoyage');
const dirty = S.cleanSheet({ id: 'x', title: 'T', columns: [{ id: 'a', name: 'A', type: 'text', prefix: 'ZZ', digits: 4 }, { id: 'b', name: 'B', type: 'code', prefix: 'P'.repeat(40), digits: 99 }, { id: 'c', name: 'C', type: 'inconnu' }, { id: 'd', name: 'D', type: 'money' }], rows: [], rules: [] })!;
eq([dirty.columns[0].prefix, dirty.columns[0].digits], [undefined, undefined], 'modèle : préfixe sans effet sur un autre type que code');
eq([dirty.columns[1].prefix?.length, dirty.columns[1].digits], [12, undefined], 'modèle : préfixe coupé à 12, chiffres hors limites ignorés');
eq(dirty.columns[2].type, 'text', 'modèle : type inconnu → texte');
eq(dirty.columns[3].type, 'money', 'modèle : montant gardé');
eq(['text', 'number', 'date', 'list', 'check', 'code', 'phone', 'money', 'time'].every(t => S.cleanSheet({ id: 'y', title: 'T', columns: [{ id: 'a', name: 'A', type: t }], rows: [], rules: [] })!.columns[0].type === t), true, 'modèle : les 9 types sont gardés');
const old = S.cleanSheet({ id: 'o', title: 'Vieux', columns: [{ id: 'a', name: 'Nom', type: 'text' }, { id: 'b', name: 'Qté', type: 'number' }], rows: [{ id: 'r', cells: { a: 'x', b: '4' } }], rules: [] })!;
eq([old.columns.length, old.rows[0].cells.b, old.columns[0].repeat], [2, '4', undefined], 'compatibilité : un ancien tableau reste valable');
sh = S.updateColumn(sh, sh.columns[0].id, { prefix: '', digits: 0 as any }, NOW)!;
eq([sh.columns[0].prefix, sh.columns[0].digits], [undefined, undefined], 'modèle : effacer le préfixe et un nombre de chiffres invalide');

// ---- contrôle de saisie des nouveaux types
const mk = (type: S.ColType): S.Sheet => { const s = S.addColumn(S.emptySheet('T', NOW), 'X', type, NOW)!; return S.addRow(s, NOW, {})!; };
const chk = (type: S.ColType, v: string) => { const s = mk(type); return S.checkCell(s, s.rows[0].id, s.columns[0].id, v); };
eq([chk('money', '1500'), chk('money', '15,5'), chk('money', 'abc')], [null, null, 'number'], 'contrôle : montant');
eq([chk('time', '09:30'), chk('time', '24:00'), chk('time', '9h')], [null, 'time', 'time'], 'contrôle : heure');
eq([chk('phone', '034 12 345 67'), chk('phone', '12'), chk('phone', 'abc')], [null, 'phone', 'phone'], 'contrôle : téléphone');
eq([chk('code', 'REF001'), chk('code', 'n\'importe quoi')], [null, null], 'contrôle : un code est libre');
ok(S.isNumType('money') && S.isNumType('number') && !S.isNumType('phone'), 'montant et nombre sont des nombres');

// ---- totaux et calcul avec un montant
let t = S.addColumn(S.emptySheet('T', NOW), 'Montant', 'money', NOW)!;
for (const v of ['1000', '2500.5', '']) t = S.addRow(t, NOW, { [t.columns[0].id]: v })!;
const comp = S.computeSheet(t, TODAY);
eq(S.columnTotals(comp)[0]?.sum, 3500.5, 'montant : somme en bas de colonne');
eq(comp.grid.map(r => r[0]), [1000, 2500.5, null], 'montant : lu comme un nombre dans les formules');

// ---- colonne « mots qui reviennent »
let w = S.addColumn(S.emptySheet('T', NOW), 'Client', 'text', NOW)!;
const cid = w.columns[0].id;
for (const v of ['Société Rakoto', 'Rasoa', 'société rakoto', 'Rakoto Jean', 'Rasoa', 'Société Rakoto', '', '=A1', 'x'.repeat(61)]) w = S.addRow(w, NOW, { [cid]: v })!;
eq(A.columnSuggestions(w, cid), ['Société Rakoto', 'Rasoa', 'Rakoto Jean'], 'suggestions : les plus fréquentes d\'abord, sans doublon de casse ni d\'accent, ni vide, ni formule, ni texte trop long');
eq(A.suggest(w, cid, 'rak'), ['Rakoto Jean', 'Société Rakoto'], 'suggestions : « rak » = commence par, puis contient');
eq(A.suggest(w, cid, 'soc'), ['Société Rakoto'], 'suggestions : sans accents ni majuscules');
eq(A.suggest(w, cid, 'Rasoa'), [], 'suggestions : jamais la valeur exacte déjà tapée');
eq(A.suggest(w, cid, '').length, 3, 'suggestions : rien tapé = les plus fréquentes');
eq(A.suggest(w, cid, 'zzz'), [], 'suggestions : rien ne correspond');
eq(A.columnSuggestions(mk('date'), 'inconnue'), [], 'suggestions : colonne inconnue');
const wl = S.addColumn(S.emptySheet('T', NOW), 'Liste', 'list', NOW, ['a', 'b'])!;
eq(A.columnSuggestions(wl, wl.columns[0].id), [], 'suggestions : pas pour une liste (elle a déjà ses choix)');
ok(A.columnSuggestions(w, cid, 2).length === 2, 'suggestions : limite respectée');

// ---- nouvelle ligne déjà remplie
let g = S.emptySheet('Suivi', NOW);
g = S.addColumn(g, 'Réf', 'code', NOW)!; g = S.addColumn(g, 'Date', 'date', NOW)!; g = S.addColumn(g, 'Client', 'text', NOW)!; g = S.addColumn(g, 'Note', 'text', NOW)!;
g = S.updateColumn(g, g.columns[2].id, { repeat: true }, NOW)!;
const [cR, cD, cC, cN] = g.columns.map(c => c.id);
eq(A.defaultRowCells(g, TODAY), { [cR]: 'REF001', [cD]: TODAY }, 'ligne : tableau vide → REF001, date du jour');
g = A.addRowAuto(g, NOW, TODAY)!;
eq([g.rows[0].cells[cR], g.rows[0].cells[cD]], ['REF001', TODAY], 'ligne : la 1re ligne est déjà remplie');
g = S.updateCell(g, g.rows[0].id, cC, 'Rakoto', NOW)!; g = S.updateCell(g, g.rows[0].id, cN, 'à revoir', NOW)!; g = S.updateCell(g, g.rows[0].id, cD, '2026-10-20', NOW)!;
eq(A.defaultRowCells(g, TODAY), { [cR]: 'REF002', [cD]: TODAY, [cC]: 'Rakoto' }, 'ligne : code suivant, date du jour, client repris, note NON reprise');
g = A.addRowAuto(g, NOW, TODAY)!; g = A.addRowAuto(g, NOW, TODAY)!;
eq(S.activeRows(g).map(r => r.cells[cR]), ['REF001', 'REF002', 'REF003'], 'ligne : 3 lignes = REF001, REF002, REF003');
g = S.updateColumn(g, cD, { repeat: true }, NOW)!;
eq(A.defaultRowCells(g, TODAY)[cD], TODAY, 'ligne : date « reprendre » = celle du dessus (ici celle du jour)');
g = S.updateCell(g, S.activeRows(g)[2].id, cD, '2026-10-15', NOW)!;
eq(A.defaultRowCells(g, TODAY)[cD], '2026-10-15', 'ligne : date « reprendre la ligne du dessus »');
g = S.deleteRow(g, S.activeRows(g)[2].id, NOW)!;
eq(A.defaultRowCells(g, TODAY)[cR], 'REF004', 'ligne : une ligne à la corbeille ne fait pas reprendre son numéro');
{
  // un code déjà tapé à la main est respecté
  let h = S.addColumn(S.emptySheet('T', NOW), 'Réf', 'code', NOW)!;
  h = S.addRow(h, NOW, { [h.columns[0].id]: 'AB-41' })!;
  eq(A.defaultRowCells(h, TODAY)[h.columns[0].id], 'AB-42', 'ligne : un code tapé à la main (AB-41) continue en AB-42');
}
{ // formule jamais recopiée
  let h = S.addColumn(S.emptySheet('T', NOW), 'Total', 'number', NOW)!;
  h = S.updateColumn(h, h.columns[0].id, { repeat: true }, NOW)!;
  h = S.addRow(h, NOW, { [h.columns[0].id]: '=B1*2' })!;
  eq(A.defaultRowCells(h, TODAY), {}, 'ligne : une formule n\'est jamais recopiée');
}
{ // limite de lignes
  const full: S.Sheet = { ...S.emptySheet('T', NOW), columns: [], rows: Array.from({ length: S.LIMITS.rows }, (_, i) => ({ id: 'r' + i, cells: {} })) };
  eq(A.addRowAuto(full, NOW, TODAY), null, 'ligne : la limite de 5 000 lignes est respectée');
}

// ---- nouvelle colonne « code » : lignes existantes remplies
let f = S.emptySheet('F', NOW);
f = S.addColumn(f, 'Nom', 'text', NOW)!;
for (const v of ['a', 'b', 'c']) f = S.addRow(f, NOW, { [f.columns[0].id]: v })!;
f = S.addColumn(f, 'Réf', 'code', NOW)!;
const fc = f.columns[1].id;
const f1 = A.fillCodes(f, fc, NOW)!;
eq(S.activeRows(f1).map(r => r.cells[fc]), ['REF001', 'REF002', 'REF003'], 'colonne code ajoutée : les lignes existantes sont remplies');
eq(A.fillCodes(f1, fc, NOW), null, 'colonne code : rien à remplir la 2e fois');
let f2 = S.updateCell(f, S.activeRows(f)[1].id, fc, 'REF010', NOW)!;
eq(S.activeRows(A.fillCodes(f2, fc, NOW)!).map(r => r.cells[fc]), ['REF001', 'REF010', 'REF011'], 'colonne code : les codes déjà écrits ne bougent pas (REF010 gardé, la suite continue)');
f2 = S.updateColumn(f, fc, { prefix: 'DOS', digits: 2 }, NOW)!;
eq(S.activeRows(A.fillCodes(f2, fc, NOW)!).map(r => r.cells[fc]), ['DOS01', 'DOS02', 'DOS03'], 'colonne code avec préfixe');
eq(A.fillCodes(f, f.columns[0].id, NOW), null, 'remplir un code sur une colonne texte : refusé');
{
  const trashed = S.deleteRow(f, S.activeRows(f)[0].id, NOW)!;
  eq(S.activeRows(A.fillCodes(trashed, fc, NOW)!).map(r => r.cells[fc]), ['REF001', 'REF002'], 'colonne code : une ligne à la corbeille est laissée de côté');
}
eq(S.activeRows(f).map(r => r.cells[fc]), [undefined, undefined, undefined], 'colonne code : le tableau d\'origine n\'est pas modifié');

// ---- annuler / rétablir couvre la mise en forme automatique
{
  let h = S.newHistory(f);
  h = S.pushHistory(h, A.fillCodes(f, fc, NOW)!);
  eq(S.activeRows(h.present).map(r => r.cells[fc]).length, 3, 'annuler : avant');
  h = S.undo(h);
  eq(S.activeRows(h.present).map(r => r.cells[fc]), [undefined, undefined, undefined], 'annuler : le remplissage automatique s\'annule d\'un geste');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
