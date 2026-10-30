// Contrôle du changement de type d'une colonne et de la proposition automatique (module 19, suite). Lancer : npm run check:sheet-retype
import * as S from '../src/utils/sheets';
import * as R from '../src/utils/sheetRetype';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const good = JSON.stringify(got) === JSON.stringify(want); if (!good) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);
const NOW = '2026-10-28T09:00:00.000Z';
const store = () => { const m: Record<string, string> = {}; return { m, st: { getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } } }; };

/** Un tableau d'une colonne « texte » remplie avec ces valeurs. */
const col1 = (values: string[], type: S.ColType = 'text'): { s: S.Sheet; id: string } => {
  let s = S.addColumn(S.emptySheet('T', NOW), 'Col', type, NOW)!;
  const id = s.columns[0].id;
  for (const v of values) s = S.addRow(s, NOW, { [id]: v })!;
  return { s, id };
};
const hint = (values: string[], type: S.ColType = 'text') => { const { s, id } = col1(values, type); return R.suggestColumnType(s, id, 'fr'); };

// ---- code
eq(hint(['REF001', 'REF002', 'REF003', 'REF004']), { kind: 'code', type: 'code', prefix: 'REF', digits: 3, sample: ['REF001', 'REF002', 'REF003'] }, 'code : REF001, REF002, REF003, REF004 → colonne Code (début REF, 3 chiffres)');
eq(hint(['DOS-09', 'DOS-10', 'DOS-11'])?.kind, 'code', 'code : DOS-09, DOS-10, DOS-11');
eq((hint(['DOS-09', 'DOS-10', 'DOS-11']) as any).prefix, 'DOS-', 'code : le début inclut le tiret');
eq(hint(['A1', 'A2', 'A3'])?.kind, 'code', 'code : A1, A2, A3');
eq(hint(['REF001', 'REF002', 'REF003', 'oups', 'REF004'])?.kind, 'code', 'code : une valeur en trop (80 % suffisent)');
eq(hint(['REF001', 'DOS002', 'ABC003']), null, 'code : débuts tous différents = pas un code');
eq(hint(['REF005', 'REF001', 'REF009', 'REF002']), null, 'code : numéros qui ne montent pas = pas un code');
eq(hint(['REF001', 'REF002']), null, 'code : 2 valeurs seulement = pas assez');
eq(hint(['001', '002', '003']), null, 'code : que des chiffres (début vide) = pas un code');
eq(hint(['Rakoto', 'Rasoa', 'Randria']), null, 'code : des noms = rien');
eq(hint(['Lot A1 bis', 'Lot A2 bis', 'Lot A3 bis']), null, 'code : du texte après le numéro = pas un code simple');

// ---- date, heure, téléphone, nombre
eq(hint(['28/10/2026', '29/10/2026', '30/10/2026'])?.kind, 'date', 'date : 28/10/2026…');
eq(hint(['2026-10-28', '2026-10-29', '2026-10-30'])?.kind, 'date', 'date : ISO');
eq(hint(['1/2/26', '3/4/26', '5/6/26'])?.kind, 'date', 'date : jours à un chiffre');
eq(hint(['12', '3', '15'])?.kind, 'number', 'date : « 12, 3, 15 » sont des nombres, pas des dates');
eq(hint(['30/02/2026', '31/04/2026', '99/99/2026']), null, 'date : dates impossibles = rien');
eq(hint(['9h30', '14:05', '08:00'])?.kind, 'time', 'heure : 9h30, 14:05, 08:00');
eq(hint(['25:00', '99:99', '30:61']), null, 'heure : heures impossibles = rien');
eq(hint(['0341234567', '034 12 345 67', '+261 34 12 345 67'])?.kind, 'phone', 'téléphone : 3 formes');
eq(hint(['341234567', '0321234567', '0331234567'])?.kind, 'phone', 'téléphone : 9 ou 10 chiffres');
eq(hint(['1 500', '2500,5', '10', '-3'])?.kind, 'number', 'nombre : milliers, virgule, négatif');
eq(hint(['007', '008', '009']), null, 'nombre : zéros au début (007) = on ne propose pas de les perdre');
eq(hint(['12', 'abc', 'def']), null, 'nombre : un seul nombre sur trois = rien');

// ---- liste de choix
eq(hint(['Oui', 'Non', 'oui', 'Non', 'OUI', 'non'])?.kind, 'list', 'liste : Oui/Non (casse mélangée)');
eq((hint(['Oui', 'Non', 'oui', 'Non', 'OUI', 'non']) as any).options, ['Oui', 'Non'], 'liste : 2 choix, écriture de la première apparition');
eq((hint(['À faire', 'Fait', 'a faire', 'Fait', 'En cours', 'Fait', 'À faire', 'Fait']) as any).options, ['Fait', 'À faire', 'En cours'], 'liste : choix classés du plus fréquent au moins fréquent, accents unifiés');
eq(hint(['Oui', 'Non', 'oui', 'Non', 'OUI']), null, 'liste : 5 valeurs = pas assez (6 au moins)');
eq(hint(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'a', 'b']), null, 'liste : 10 choix différents = trop');
eq(hint(['Rakoto', 'Rasoa', 'Randria', 'Rabe', 'Zo', 'Ny']), null, 'liste : tout est différent = pas une liste');
eq(hint(['Oui, bien', 'Non', 'Oui, bien', 'Non', 'Oui, bien', 'Non']), null, 'liste : une virgule dans un choix = on ne propose pas');
eq(hint(['x'.repeat(40), 'y'.repeat(40), 'x'.repeat(40), 'y'.repeat(40), 'x'.repeat(40), 'y'.repeat(40)]), null, 'liste : textes longs = pas une liste');

// ---- cas à ne pas toucher
eq(hint(['REF001', 'REF002', 'REF003'], 'code'), null, 'déjà une colonne Code : rien à proposer');
eq(hint(['28/10/2026', '29/10/2026', '30/10/2026'], 'date'), null, 'déjà une date : rien à proposer');
eq(hint(['=A1', '=A2', '=A3']), null, 'formules : ignorées');
eq(hint(['', '', '', 'REF001', 'REF002', 'REF003'])?.kind, 'code', 'cases vides ignorées');
{ const { s, id } = col1(['REF001', 'REF002', 'REF003']); ok(R.suggestColumnType(S.deleteColumn(s, id, NOW)!, id, 'fr') === null, 'colonne supprimée : rien'); }
ok(R.suggestColumnType(S.emptySheet('T', NOW), 'inconnue', 'fr') === null, 'colonne inconnue : rien');
{ const { s, id } = col1(['REF001', 'REF002', 'REF003']); const t = S.deleteRow(s, S.activeRows(s)[2].id, NOW)!; ok(R.suggestColumnType(t, id, 'fr') === null, 'lignes à la corbeille ignorées (2 valeurs restent = pas assez)'); }

// ---- refus mémorisé
{
  const { m, st } = store();
  const { s, id } = col1(['REF001', 'REF002', 'REF003']);
  eq(R.firstHint(s, 'fr', st)?.hint.kind, 'code', 'première proposition du tableau');
  R.dismissHint(s.id, id, 'code', st);
  eq(R.firstHint(s, 'fr', st), null, 'refusée : on ne la repropose pas');
  ok(Object.keys(m).length === 1, 'le refus est un seul petit enregistrement sur l\'appareil');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };
  R.dismissHint(s.id, id, 'code', broken); ok(R.isHintDismissed(s.id, id, 'code', broken) === false && R.firstHint(s, 'fr', broken)?.hint.kind === 'code', 'stockage refusé : jamais d\'erreur, la proposition revient');
  eq(R.isHintDismissed(s.id, id, 'list', st), false, 'refuser « code » ne refuse pas une autre sorte de proposition');
}
// première proposition parmi plusieurs colonnes
{
  let s = S.addColumn(S.emptySheet('T', NOW), 'Nom', 'text', NOW)!; s = S.addColumn(s, 'Réf', 'text', NOW)!; s = S.addColumn(s, 'Date', 'text', NOW)!;
  const [a, b, c] = s.columns.map(x => x.id);
  [['Rakoto', 'REF001', '28/10/2026'], ['Rasoa', 'REF002', '29/10/2026'], ['Zo', 'REF003', '30/10/2026']].forEach(r => { s = S.addRow(s, NOW, { [a]: r[0], [b]: r[1], [c]: r[2] })!; });
  const fh = R.firstHint(s, 'fr', store().st)!;
  eq([fh.name, fh.hint.kind], ['Réf', 'code'], 'plusieurs colonnes : la première qui a une proposition (Réf)');
  R.dismissHint(s.id, b, 'code', undefined as any);
}

// ---- changer le type SANS casser les valeurs
const rt = (values: string[], type: S.ColType, from: S.ColType = 'text') => { const { s, id } = col1(values, from); const r = R.retypeColumn(s, id, type, NOW, 'fr')!; return { r, vals: S.activeRows(r.sheet).map(x => x.cells[id]), id }; };
{
  const d = rt(['28/10/2026', '2026-10-29', 'demain', '', '=A1'], 'date');
  eq(d.vals, ['2026-10-28', '2026-10-29', 'demain', undefined, '=A1'], 'date : valeurs remises en AAAA-MM-JJ ; « demain » et la formule gardées telles quelles');
  eq([d.r.converted, d.r.kept], [1, 1], 'date : 1 valeur convertie, 1 gardée (comptées)');
  eq(S.checkCell(d.r.sheet, S.activeRows(d.r.sheet)[0].id, d.id, '2026-10-28'), null, 'date : plus de « date invalide » sur les valeurs converties');
  eq(rt(['1 500', '2500,5', 'beaucoup'], 'money').vals, ['1500', '2500.5', 'beaucoup'], 'montant : milliers et virgule convertis, texte gardé');
  eq(rt(['0341234567', '+261341234567', '12'], 'phone').vals, ['034 12 345 67', '+261 34 12 345 67', '12'], 'téléphone : espaces ajoutés, « 12 » gardé');
  eq(rt(['9h30', '14:5', '25:00'], 'time').vals, ['09:30', '14:05', '25:00'], 'heure : 9h30 → 09:30');
  eq(rt(['Rakoto', 'Rasoa'], 'list').vals, ['Rakoto', 'Rasoa'], 'liste : les valeurs ne sont jamais changées');
  eq(rt(['oui', 'peut-être'], 'check').vals, ['oui', 'peut-être'], 'case à cocher : les valeurs ne sont jamais changées (ni effacées)');
  eq(rt(['28/10/2026'], 'text', 'date').vals, ['28/10/2026'], 'retour au texte : valeurs inchangées');
  eq(rt(['A', 'B'], 'code').vals, ['REF001', 'REF002'].map((v, i) => (['A', 'B'][i] ? ['A', 'B'][i] : v)), 'code : les valeurs déjà écrites sont gardées');
  const c = rt(['REF001', '', 'REF002', ''], 'code'); eq(c.vals, ['REF001', 'REF003', 'REF002', 'REF004'], 'code : les cases vides reçoivent la suite sans doublon');
  ok(R.retypeColumn(S.emptySheet('T', NOW), 'inconnue', 'date', NOW) === null, 'colonne inconnue : null');
  // une ligne à la corbeille est convertie aussi (si on la restaure, elle est déjà bonne)
  const { s, id } = col1(['28/10/2026', '29/10/2026']); const t = S.deleteRow(s, S.activeRows(s)[0].id, NOW)!;
  eq(R.retypeColumn(t, id, 'date', NOW)!.sheet.rows.map(r => r.cells[id]), ['2026-10-28', '2026-10-29'], 'ligne à la corbeille : convertie aussi');
  eq(s.rows.map(r => r.cells[id]), ['28/10/2026', '29/10/2026'], 'le tableau d\'origine n\'est pas modifié');
}
// ---- appliquer une proposition
{
  const { s, id } = col1(['REF001', 'REF002', 'REF003', '']);
  const h = R.suggestColumnType(s, id, 'fr')!;
  const r = R.applyTypeHint(s, id, h, NOW, 'fr')!;
  const c = r.sheet.columns[0];
  eq([c.type, c.prefix, c.digits], ['code', 'REF', 3], 'appliquer « code » : type, début et chiffres réglés');
  eq(S.activeRows(r.sheet).map(x => x.cells[id]), ['REF001', 'REF002', 'REF003', 'REF004'], 'appliquer « code » : la case vide reçoit REF004');
  const l = col1(['Oui', 'Non', 'oui', 'Non', 'OUI', 'non']);
  const lh = R.suggestColumnType(l.s, l.id, 'fr')!; const lr = R.applyTypeHint(l.s, l.id, lh, NOW, 'fr')!;
  eq([lr.sheet.columns[0].type, lr.sheet.columns[0].options], ['list', ['Oui', 'Non']], 'appliquer « liste » : type et choix réglés');
  eq(S.activeRows(lr.sheet).map(x => x.cells[l.id]), ['Oui', 'Non', 'oui', 'Non', 'OUI', 'non'], 'appliquer « liste » : valeurs existantes inchangées');
  const dd = col1(['28/10/2026', '29/10/2026', '30/10/2026']);
  const dr = R.applyTypeHint(dd.s, dd.id, R.suggestColumnType(dd.s, dd.id, 'fr')!, NOW, 'fr')!;
  ok(S.activeRows(dr.sheet).every(x => S.checkCell(dr.sheet, x.id, dd.id, x.cells[dd.id]) === null), 'appliquer « date » : plus aucune case rouge');
  const after = R.suggestColumnType(r.sheet, id, 'fr'); eq(after, null, 'après application : plus de proposition');
}
// ---- gros tableau
{
  const big = col1(Array.from({ length: S.LIMITS.rows - 1 }, (_, i) => `REF${String(i + 1).padStart(4, '0')}`));
  let t0 = Date.now(); const h = R.suggestColumnType(big.s, big.id, 'fr'); const d1 = Date.now() - t0;
  ok(h?.kind === 'code' && h.digits === 4 && d1 < 150, `gros tableau : proposition en moins de 150 ms (${d1} ms)`);
  t0 = Date.now(); const rr = R.retypeColumn(big.s, big.id, 'code', NOW)!; const d2 = Date.now() - t0;
  ok(rr.converted === 0 && d2 < 1500, `gros tableau : changement de type en moins de 1,5 s (${d2} ms)`);
  let wide = S.emptySheet('Large', NOW); for (let i = 0; i < 100; i++) wide = S.addColumn(wide, 'C' + i, 'text', NOW)!;
  wide = { ...wide, rows: Array.from({ length: 1000 }, (_, i) => ({ id: 'r' + i, cells: Object.fromEntries(wide.columns.map((c, k) => [c.id, `Mot${(i * 7 + k) % 997}x`])) })) };
  t0 = Date.now(); R.firstHint(wide, 'fr', store().st); const d3 = Date.now() - t0;
  ok(d3 < 400, `tableau large (100 colonnes, 1 000 lignes) : recherche d'une proposition en moins de 400 ms (${d3} ms)`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
